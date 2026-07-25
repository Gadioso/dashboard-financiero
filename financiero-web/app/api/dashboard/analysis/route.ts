import { NextResponse } from 'next/server';
import { generateText } from 'ai';
import { extraerJson, generateGeminiText } from '@/lib/gemini';
import { getRequestTenantContext } from '@/lib/tenant-context';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getAiModels, getAiOutputLimit } from '@/lib/ai-policy';
import { recordAiUsage } from '@/lib/ai-usage';

export const dynamic = 'force-dynamic';

type AnalysisBody = {
  scope?: 'month' | 'year';
  periodKey?: string;
  monthLabel?: string;
  summary?: unknown;
  monthly?: unknown;
  monthlySeries?: unknown;
  buckets?: unknown;
  goal?: unknown;
};

type DashboardAnalysis = {
  headline: string;
  diagnosis: string;
  actions: string[];
  risks: string[];
};

function mexicoDayStartIso() {
  const now = new Date();
  const mexicoDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  return new Date(`${mexicoDate}T00:00:00-06:00`).toISOString();
}

async function saveAnalysis(profileId: string, scope: 'month' | 'year', periodKey: string, analysis: DashboardAnalysis, generatedBy: string) {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return;
  await supabase.from('agent_findings').insert({
    profile_id: profileId,
    agent_key: `dashboard_analysis_${scope}`,
    finding_type: periodKey,
    severity: 'info',
    title: analysis.headline,
    summary: analysis.diagnosis,
    recommendation: analysis.actions.join('\n'),
    confidence: generatedBy === 'analysis-engine' ? 0.75 : 0.9,
    status: 'active',
    evidence: { risks: analysis.risks },
    metadata: { analysis, generatedBy, scope, periodKey },
  });
}

const providerCooldownMs = 5 * 60 * 1000;
const providerUnavailableUntil = new Map<string, number>();

function getGoogleApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
}

function getOpenRouterApiKey() {
  return process.env.OPENROUTER_API_KEY || '';
}

function getVercelAiGatewayModels() {
  return getAiModels('dashboard-analysis', 'gateway');
}

function getOpenRouterModels() {
  return getAiModels('dashboard-analysis', 'openrouter');
}

function providerInCooldown(provider: string) {
  const unavailableUntil = providerUnavailableUntil.get(provider) || 0;

  if (unavailableUntil <= Date.now()) {
    providerUnavailableUntil.delete(provider);
    return false;
  }

  return true;
}

function markProviderCooldown(provider: string) {
  providerUnavailableUntil.set(provider, Date.now() + providerCooldownMs);
}

async function generateVercelGatewayText(prompt: string) {
  if (providerInCooldown('vercel-ai-gateway')) {
    throw new Error('Vercel AI Gateway en cooldown temporal.');
  }

  let lastError: unknown;

  for (const model of getVercelAiGatewayModels()) {
    const startedAt = Date.now();
    try {
      const result = await generateText({
        model,
        prompt,
        temperature: 0.2,
        maxOutputTokens: getAiOutputLimit('dashboard-analysis'),
        providerOptions: {
          gateway: {
            tags: ['feature:dashboard-analysis'],
          },
        },
      });

      if (!result.text) {
        throw new Error('Vercel AI Gateway no devolvió texto.');
      }

      recordAiUsage({ feature: 'dashboard-analysis', provider: 'vercel-ai-gateway', model, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, totalTokens: result.usage.totalTokens, latencyMs: Date.now() - startedAt, success: true });
      return result.text;
    } catch (error) {
      recordAiUsage({ feature: 'dashboard-analysis', provider: 'vercel-ai-gateway', model, latencyMs: Date.now() - startedAt, success: false });
      lastError = error;
    }
  }

  markProviderCooldown('vercel-ai-gateway');
  throw lastError;
}

async function generateOpenRouterText(prompt: string) {
  const apiKey = getOpenRouterApiKey();

  if (!apiKey) {
    throw new Error('Falta OPENROUTER_API_KEY para OpenRouter.');
  }

  if (providerInCooldown('openrouter')) {
    throw new Error('OpenRouter en cooldown temporal.');
  }

  let lastError: unknown;

  for (const model of getOpenRouterModels()) {
    const startedAt = Date.now();
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://dashboard-financiero-chi.vercel.app',
          'X-OpenRouter-Title': 'Virafi',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          stream: false,
          max_tokens: getAiOutputLimit('dashboard-analysis'),
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number };
      };

      if (!response.ok) {
        throw new Error(payload.error?.message || `OpenRouter respondió ${response.status}.`);
      }

      const text = payload.choices?.[0]?.message?.content;

      if (!text) {
        throw new Error('OpenRouter no devolvió texto.');
      }

      const usage = payload.usage || {};
      recordAiUsage({ feature: 'dashboard-analysis', provider: 'openrouter', model, inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens, totalTokens: usage.total_tokens, costUsd: usage.cost, latencyMs: Date.now() - startedAt, success: true });
      return text;
    } catch (error) {
      recordAiUsage({ feature: 'dashboard-analysis', provider: 'openrouter', model, latencyMs: Date.now() - startedAt, success: false });
      lastError = error;
    }
  }

  markProviderCooldown('openrouter');
  throw lastError;
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('es-MX', {
    currency: 'MXN',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value);
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function getSummary(body: AnalysisBody) {
  const summary = asRecord(body.summary);

  return {
    ingresosMes: toNumber(summary.ingresosMes),
    totalGastadoMes: toNumber(summary.totalGastadoMes),
    flujoNetoMes: toNumber(summary.flujoNetoMes),
    tasaFuturo: toNumber(summary.tasaFuturo),
    burnRate: toNumber(summary.burnRate),
  };
}

function getBuckets(body: AnalysisBody) {
  if (!Array.isArray(body.buckets)) return [];

  return body.buckets
    .map((bucket) => {
      const data = asRecord(bucket);

      return {
        label: typeof data.label === 'string' && data.label.trim() ? data.label.trim() : 'Bolsa',
        limit: toNumber(data.limit),
        percent: toNumber(data.percent),
        remaining: toNumber(data.remaining),
        used: toNumber(data.used),
      };
    })
    .filter((bucket) => bucket.used || bucket.limit || bucket.percent);
}

function getGoal(body: AnalysisBody) {
  const goal = asRecord(body.goal);

  return {
    monthlyIncomeTarget: toNumber(goal.monthlyIncomeTarget),
    currentMonthlyIncome: toNumber(goal.currentMonthlyIncome),
    averageIncomeLast3Months: toNumber(goal.averageIncomeLast3Months),
    monthlyGap: toNumber(goal.monthlyGap),
    gapVsThreeMonthAverage: toNumber(goal.gapVsThreeMonthAverage),
    targetPerBucket: toNumber(goal.targetPerBucket),
    progressPct: toNumber(goal.progressPct),
  };
}

function getMonthlySeries(body: AnalysisBody) {
  if (!Array.isArray(body.monthlySeries)) return [];

  return body.monthlySeries.map((value) => {
    const month = asRecord(value);
    return {
      mes: String(month.mes || 'Mes'),
      ingresos: toNumber(month.ingresos),
      egresos: toNumber(month.egresos),
      resultado: toNumber(month.resultado),
    };
  });
}

function ruleBasedYearAnalysis(monthLabel: string, body: AnalysisBody): DashboardAnalysis {
  const summary = getSummary(body);
  const months = getMonthlySeries(body).filter((month) => month.ingresos || month.egresos || month.resultado);
  const buckets = getBuckets(body);
  const averageIncome = months.length ? summary.ingresosMes / months.length : 0;
  const averageExpense = months.length ? summary.totalGastadoMes / months.length : 0;
  const projectedIncome = averageIncome * 12;
  const projectedFlow = months.length ? (summary.flujoNetoMes / months.length) * 12 : 0;
  const bestMonth = [...months].sort((a, b) => b.resultado - a.resultado)[0];
  const worstMonth = [...months].sort((a, b) => a.resultado - b.resultado)[0];
  const positiveMonths = months.filter((month) => month.resultado >= 0).length;
  const futureBucket = buckets.find((bucket) => bucket.label === 'Futuro');

  return {
    headline: months.length
      ? summary.flujoNetoMes < 0
        ? 'La trayectoria anual necesita recuperar flujo'
        : `${positiveMonths} de ${months.length} meses sostienen flujo positivo`
      : `Lectura anual de ${monthLabel} pendiente de datos`,
    diagnosis: months.length
      ? `De enero a la fecha, los ingresos suman ${formatMoney(summary.ingresosMes)}, los egresos ${formatMoney(summary.totalGastadoMes)} y el flujo neto ${formatMoney(summary.flujoNetoMes)}. El promedio mensual es ${formatMoney(averageIncome)} de ingreso y ${formatMoney(averageExpense)} de gasto.${bestMonth ? ` ${bestMonth.mes} fue el mejor mes (${formatMoney(bestMonth.resultado)}).` : ''}${worstMonth ? ` ${worstMonth.mes} fue el más débil (${formatMoney(worstMonth.resultado)}).` : ''} Al ritmo actual, el cierre proyectado es ${formatMoney(projectedIncome)} de ingresos y ${formatMoney(projectedFlow)} de flujo. La proyección es una estimación basada en los meses transcurridos.`
      : 'No hay suficientes meses con movimientos para comparar trayectoria, consistencia o proyección de cierre.',
    actions: [
      `Revisar al cierre de cada mes si el ingreso supera el promedio anual de ${formatMoney(averageIncome)}.`,
      worstMonth ? `Identificar y corregir el patrón que produjo ${formatMoney(worstMonth.resultado)} de flujo en ${worstMonth.mes}.` : 'Completar la información mensual antes de proyectar el cierre.',
      `Proteger una trayectoria de flujo anual cercana a ${formatMoney(projectedFlow)} y actualizar la proyección cada mes.`,
    ],
    risks: [
      positiveMonths < Math.ceil(months.length / 2) ? 'La mayoría de los meses no mantiene flujo positivo.' : '',
      futureBucket && futureBucket.percent < 75 ? `Futuro acumula sólo ${formatPercent(futureBucket.percent)} de su ritmo anual esperado.` : '',
    ].filter(Boolean).length
      ? [
          positiveMonths < Math.ceil(months.length / 2) ? 'La mayoría de los meses no mantiene flujo positivo.' : '',
          futureBucket && futureBucket.percent < 75 ? `Futuro acumula sólo ${formatPercent(futureBucket.percent)} de su ritmo anual esperado.` : '',
        ].filter(Boolean)
      : ['La proyección puede variar si los próximos meses se apartan del promedio observado.'],
  };
}

function ruleBasedAnalysis(scope: 'month' | 'year', monthLabel: string, body: AnalysisBody) {
  if (scope === 'year') return ruleBasedYearAnalysis(monthLabel, body);
  const summary = getSummary(body);
  const buckets = getBuckets(body);
  const goal = getGoal(body);
  const pressuredBucket = [...buckets].sort((a, b) => b.percent - a.percent)[0];
  const hasMoneyData = summary.ingresosMes || summary.totalGastadoMes || summary.flujoNetoMes;
  const monthTitle = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
  const scopeLabel = monthTitle;
  const normalizedScopeLabel = monthLabel.toLowerCase();

  let headline = `${scopeLabel} mantiene una lectura ordenada`;
  if (!hasMoneyData) headline = `Lectura de ${normalizedScopeLabel} lista`;
  else if (summary.flujoNetoMes < 0) headline = `${scopeLabel} necesita recuperar flujo`;
  else if (summary.burnRate >= 90 || (pressuredBucket && pressuredBucket.percent >= 90)) headline = `${scopeLabel} está presionando el presupuesto`;
  else if (summary.flujoNetoMes > 0) headline = `${scopeLabel} mantiene margen positivo`;

  const diagnosisParts: string[] = [];
  if (hasMoneyData) {
    diagnosisParts.push(`Ingresos registrados: ${formatMoney(summary.ingresosMes)}; egresos: ${formatMoney(summary.totalGastadoMes)}; flujo neto: ${formatMoney(summary.flujoNetoMes)}.`);
  } else {
    diagnosisParts.push('Aún hay pocos movimientos registrados para este periodo; la prioridad es mantener la captura al día para que las decisiones salgan de datos completos.');
  }
  if (pressuredBucket) {
    diagnosisParts.push(`${pressuredBucket.label} es la bolsa con mayor presión: lleva ${formatPercent(pressuredBucket.percent)} usado y le quedan ${formatMoney(pressuredBucket.remaining)}.`);
  }
  if (summary.tasaFuturo > 0) {
    diagnosisParts.push(`La asignación a Futuro va en ${formatPercent(summary.tasaFuturo)}, contra una meta operativa de 33%.`);
  }
  if (goal.monthlyIncomeTarget > 0) {
    diagnosisParts.unshift(`La meta mensual es ${formatMoney(goal.monthlyIncomeTarget)} y el avance actual es ${formatPercent(goal.progressPct)}; faltan ${formatMoney(goal.monthlyGap)} este mes.`);
    diagnosisParts.push(`Contra el promedio real de 3 meses (${formatMoney(goal.averageIncomeLast3Months)}), la brecha estructural es ${formatMoney(goal.gapVsThreeMonthAverage)}.`);
  }

  const actions: string[] = [];
  if (goal.monthlyIncomeTarget > 0 && goal.gapVsThreeMonthAverage > 0) {
    actions.push(`Crear ingreso recurrente adicional por ${formatMoney(goal.gapVsThreeMonthAverage)} al mes; revisar semanalmente avance y pipeline hasta cubrir la brecha contra el promedio de 3 meses.`);
  }
  if (summary.flujoNetoMes < 0) {
    actions.push(`Recortar o diferir ${formatMoney(Math.abs(summary.flujoNetoMes))} en gastos variables para volver a flujo positivo.`);
  } else if (hasMoneyData) {
    actions.push(`Proteger el margen positivo de ${formatMoney(summary.flujoNetoMes)} antes de autorizar gastos nuevos.`);
  } else {
    actions.push('Registrar ingresos, gastos y pagos pendientes del periodo antes de mover presupuesto.');
  }
  if (pressuredBucket && pressuredBucket.percent >= 80) {
    actions.push(`Congelar cargos nuevos en ${pressuredBucket.label} hasta liberar al menos ${formatMoney(Math.max(0, pressuredBucket.limit * 0.15))} de margen.`);
  } else if (pressuredBucket) {
    actions.push(`Revisar ${pressuredBucket.label} dos veces por semana para evitar que pase de ${formatPercent(pressuredBucket.percent)} a zona crítica.`);
  }
  if (summary.tasaFuturo < 33) {
    actions.push(`Separar hasta ${formatMoney(goal.targetPerBucket || summary.ingresosMes / 3)} para Futuro conforme entre ingreso; hoy faltan ${formatPercent(Math.max(0, 33 - summary.tasaFuturo))} puntos para el ritmo objetivo.`);
  } else {
    actions.push('Mantener Futuro separado de pagos ordinarios para conservar limpia la regla 33/33/33.');
  }
  actions.push('Cerrar el periodo con una revisión de ingresos, egresos, flujo neto y bolsas fuera de rango.');

  const risks: string[] = [];
  if (summary.flujoNetoMes < 0) {
    risks.push(`Flujo neto negativo de ${formatMoney(summary.flujoNetoMes)} puede obligar a usar reservas o crédito.`);
  }
  if (pressuredBucket && pressuredBucket.percent >= 100) {
    risks.push(`${pressuredBucket.label} ya superó su límite y necesita ajuste inmediato.`);
  } else if (pressuredBucket && pressuredBucket.percent >= 90) {
    risks.push(`${pressuredBucket.label} está cerca de saturarse con ${formatPercent(pressuredBucket.percent)} usado.`);
  }
  if (summary.tasaFuturo < 25) {
    risks.push('Futuro está por debajo del ritmo necesario y puede debilitar objetivos de ahorro.');
  }
  if (!risks.length) {
    risks.push('El principal riesgo es relajar la captura diaria y perder visibilidad del flujo real.');
  }

  return {
    headline,
    diagnosis: diagnosisParts.join(' '),
    actions: actions.slice(0, 5),
    risks: risks.slice(0, 4),
  };
}

function normalizeAnalysis(value: unknown, scope: 'month' | 'year', monthLabel: string, body: AnalysisBody) {
  const backup = ruleBasedAnalysis(scope, monthLabel, body);
  if (!value || typeof value !== 'object') return backup;

  const data = value as Record<string, unknown>;

  if (scope === 'year') {
    const modelDiagnosis = typeof data.diagnosis === 'string' ? data.diagnosis.trim() : '';
    const modelActions = Array.isArray(data.actions) ? data.actions.map(String) : [];
    const modelRisks = Array.isArray(data.risks) ? data.risks.map(String) : [];

    return {
      headline: backup.headline,
      diagnosis: [backup.diagnosis, modelDiagnosis].filter(Boolean).join(' '),
      actions: [...backup.actions, ...modelActions].filter((action, index, actions) => actions.indexOf(action) === index).slice(0, 5),
      risks: [...backup.risks, ...modelRisks].filter((risk, index, risks) => risks.indexOf(risk) === index).slice(0, 4),
    };
  }

  return {
    headline: typeof data.headline === 'string' && data.headline.trim() ? data.headline : backup.headline,
    diagnosis: typeof data.diagnosis === 'string' && data.diagnosis.trim() ? data.diagnosis : backup.diagnosis,
    actions: Array.isArray(data.actions) && data.actions.length ? data.actions.slice(0, 5).map(String) : backup.actions,
    risks: Array.isArray(data.risks) && data.risks.length ? data.risks.slice(0, 4).map(String) : backup.risks,
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
  const periodKey = String(body.periodKey || monthLabel).slice(0, 40);
  const googleApiKey = getGoogleApiKey();
  const supabase = getSupabaseServiceClient();

  if (supabase) {
    const { data: cached } = await supabase
      .from('agent_findings')
      .select('metadata, created_at')
      .eq('profile_id', tenant.profileId)
      .eq('agent_key', `dashboard_analysis_${scope}`)
      .eq('finding_type', periodKey)
      .gte('created_at', mexicoDayStartIso())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const metadata = cached?.metadata as { analysis?: DashboardAnalysis; generatedBy?: string } | null;
    if (metadata?.analysis) {
      return NextResponse.json({ success: true, cached: true, generatedAt: cached?.created_at, generatedBy: metadata.generatedBy || 'cache', analysis: metadata.analysis });
    }
  }

  const prompt = `
Eres un analista financiero personal para Diego. Analiza su dashboard 33/33/33 y responde en español mexicano, concreto y accionable.

Alcance: ${scope === 'year' ? `acumulado 2026 de ${monthLabel}` : `mes ${monthLabel} 2026`}.

Datos:
${JSON.stringify({
  summary: body.summary,
  monthly: body.monthly,
  monthlySeries: body.monthlySeries,
  buckets: body.buckets,
  goal: body.goal,
}, null, 2)}

Reglas:
- No inventes datos.
- Si algo falta, dilo como limitación.
- Da lectura de comportamiento, no consejos genéricos.
- La meta mensual es el objetivo rector. Cuantifica la brecha contra el ingreso actual y contra el promedio de 3 meses.
- Explica cuánto debe provenir de mejorar ingresos, cuánto de controlar gasto y cuánto puede dirigirse a Futuro/inversión; recortar gasto no cuenta como crear ingresos.
- Prioriza máximo 3 acciones, ordenadas por impacto, cada una con monto, frecuencia y criterio verificable de cumplimiento.
- Distingue inversión patrimonial de herramientas o gasto productivo; no presentes software como rendimiento de inversión.
- Si el alcance es mensual, analiza exclusivamente el mes seleccionado: movimientos, presupuesto consumido, flujo y acciones ejecutables antes del cierre de ese mes. No hagas proyecciones anuales salvo que sean indispensables.
- Si el alcance es anual, analiza desde enero hasta el último mes transcurrido. Compara meses, identifica tendencia, consistencia, mejor y peor mes, promedios mensuales, acumulado y proyección de cierre. No redactes el anual como si fuera un solo mes grande.
- En el anual, aclara que la proyección es una estimación basada en los meses transcurridos y no un resultado garantizado.
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
    const raw = await generateVercelGatewayText(prompt);
    const analysis = normalizeAnalysis(JSON.parse(extraerJson(raw)), scope, monthLabel, body);

    await saveAnalysis(tenant.profileId, scope, periodKey, analysis, 'vercel-ai-gateway');

    return NextResponse.json({ success: true, generatedBy: 'vercel-ai-gateway', analysis });
  } catch {
  }

  try {
    const raw = await generateOpenRouterText(prompt);
    const analysis = normalizeAnalysis(JSON.parse(extraerJson(raw)), scope, monthLabel, body);

    await saveAnalysis(tenant.profileId, scope, periodKey, analysis, 'openrouter');

    return NextResponse.json({ success: true, generatedBy: 'openrouter', analysis });
  } catch {
  }

  if (!googleApiKey || providerInCooldown('gemini')) {
    const analysis = ruleBasedAnalysis(scope, monthLabel, body);
    await saveAnalysis(tenant.profileId, scope, periodKey, analysis, 'analysis-engine');
    return NextResponse.json({
      success: true,
      generatedBy: 'analysis-engine',
      analysis,
    });
  }

  try {
    const raw = await generateGeminiText(googleApiKey, prompt);
    const analysis = normalizeAnalysis(JSON.parse(extraerJson(raw)), scope, monthLabel, body);

    await saveAnalysis(tenant.profileId, scope, periodKey, analysis, 'gemini');

    return NextResponse.json({ success: true, generatedBy: 'gemini', analysis });
  } catch {
    markProviderCooldown('gemini');

    const analysis = ruleBasedAnalysis(scope, monthLabel, body);
    await saveAnalysis(tenant.profileId, scope, periodKey, analysis, 'analysis-engine');
    return NextResponse.json({
      success: true,
      generatedBy: 'analysis-engine',
      analysis,
    });
  }
}
