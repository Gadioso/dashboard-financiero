import { NextResponse } from 'next/server';
import { extraerJson, generateGeminiText } from '@/lib/gemini';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

type AnalysisBody = {
  scope?: 'month' | 'year';
  monthLabel?: string;
  summary?: unknown;
  monthly?: unknown;
  buckets?: unknown;
};

function getGoogleApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
}

function fallbackAnalysis(scope: 'month' | 'year', monthLabel: string, diagnosis?: string) {
  return {
    headline: scope === 'year' ? 'Lectura anual pendiente de IA' : `Lectura de ${monthLabel.toLowerCase()} pendiente de IA`,
    diagnosis: diagnosis || 'No hay una llave de Gemini configurada para generar el análisis automático.',
    actions: [
      'Revisar ingresos, egresos y flujo neto contra el mes anterior.',
      'Detectar la bolsa con mayor presión y ajustar los gastos nuevos ahí primero.',
      'Mantener Futuro separado de pagos ordinarios para que la regla 33/33/33 no se distorsione.',
    ],
    risks: ['El análisis mostrado es una guía local, no una lectura generada por IA.'],
  };
}

function normalizeAnalysis(value: unknown, scope: 'month' | 'year', monthLabel: string) {
  if (!value || typeof value !== 'object') return fallbackAnalysis(scope, monthLabel);

  const data = value as Record<string, unknown>;

  return {
    headline: typeof data.headline === 'string' ? data.headline : fallbackAnalysis(scope, monthLabel).headline,
    diagnosis: typeof data.diagnosis === 'string' ? data.diagnosis : fallbackAnalysis(scope, monthLabel).diagnosis,
    actions: Array.isArray(data.actions) ? data.actions.slice(0, 5).map(String) : fallbackAnalysis(scope, monthLabel).actions,
    risks: Array.isArray(data.risks) ? data.risks.slice(0, 4).map(String) : fallbackAnalysis(scope, monthLabel).risks,
  };
}

export async function POST(request: Request) {
  const tenant = await getRequestTenantContext(request);

  if (!tenant.profileId) {
    return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as AnalysisBody;
  const scope = body.scope === 'year' ? 'year' : 'month';
  const monthLabel = body.monthLabel || 'MES';
  const googleApiKey = getGoogleApiKey();

  if (!googleApiKey) {
    return NextResponse.json({
      success: true,
      generatedBy: 'fallback',
      analysis: fallbackAnalysis(scope, monthLabel),
    });
  }

  const prompt = `
Eres un analista financiero personal para Diego. Analiza su dashboard 33/33/33 y responde en español mexicano, concreto y accionable.

Alcance: ${scope === 'year' ? 'todo el año 2026' : `mes ${monthLabel} 2026`}.

Datos:
${JSON.stringify({
  summary: body.summary,
  monthly: body.monthly,
  buckets: body.buckets,
}, null, 2)}

Reglas:
- No inventes datos.
- Si algo falta, dilo como limitación.
- Da lectura de comportamiento, no consejos genéricos.
- Mantén máximo 5 acciones y 4 riesgos.
- Devuelve solo JSON válido sin markdown con esta forma:
{
  "headline": "título breve",
  "diagnosis": "diagnóstico de 2 a 4 frases",
  "actions": ["acción 1", "acción 2"],
  "risks": ["riesgo 1"]
}
`;

  try {
    const raw = await generateGeminiText(googleApiKey, prompt);
    const analysis = normalizeAnalysis(JSON.parse(extraerJson(raw)), scope, monthLabel);

    return NextResponse.json({ success: true, generatedBy: 'gemini', analysis });
  } catch (error: unknown) {
    const warning = error instanceof Error ? error.message : 'No pude generar análisis IA.';

    return NextResponse.json({
      success: true,
      generatedBy: 'fallback',
      warning,
      analysis: fallbackAnalysis(
        scope,
        monthLabel,
        `La llave de Gemini sí está configurada, pero el modelo no respondió correctamente: ${warning}`
      ),
    });
  }
}
