import { NextResponse } from 'next/server';
import { extraerJson, generateGeminiText } from '@/lib/gemini';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

type GeneratedTask = {
  agent_key: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  evidence: Record<string, unknown>;
};

type GeneratedFinding = {
  agent_key: string;
  finding_type: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  title: string;
  summary: string;
  recommendation: string;
  confidence: number;
  evidence: Record<string, unknown>;
};

function currentMonthRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  return { start: start.toISOString(), end: end.toISOString(), label: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}` };
}

function sumRows(rows: Array<{ monto?: number | string | null }>) {
  return rows.reduce((total, row) => {
    const value = Number(row.monto || 0);
    return total + (Number.isFinite(value) ? value : 0);
  }, 0);
}

function getGoogleApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
}

function tableMissing(error?: { code?: string; message?: string } | null) {
  return error?.code === '42P01' || /schema cache|does not exist|Could not find/i.test(error?.message || '');
}

function localPlan({
  income,
  expenses,
  businessCount,
  investmentCount,
  riskProfile,
}: {
  income: number;
  expenses: number;
  businessCount: number;
  investmentCount: number;
  riskProfile: Record<string, unknown> | null;
}) {
  const netFlow = income - expenses;
  const expenseRatio = income > 0 ? expenses / income : null;
  const tasks: GeneratedTask[] = [];
  const findings: GeneratedFinding[] = [];

  if (businessCount === 0) {
    tasks.push({
      agent_key: 'business_cfo_agent',
      title: 'Crear entidad de negocio principal',
      description: 'Separar actividad personal y negocio para entender margen, flujo de caja, capacidad de ahorro y aportaciones a metas.',
      priority: 'high',
      evidence: { businessCount },
    });
  }

  if (investmentCount === 0) {
    tasks.push({
      agent_key: 'investment_portfolio_agent',
      title: 'Agregar primera cuenta de inversión read-only o paper',
      description: 'Conectar o registrar una cuenta no ejecutable para empezar a medir patrimonio y riesgo sin operar dinero real.',
      priority: 'medium',
      evidence: { investmentCount },
    });
  }

  if (!riskProfile) {
    tasks.push({
      agent_key: 'investment_risk_agent',
      title: 'Definir perfil de riesgo de inversión',
      description: 'Antes de sugerir tesis o rebalanceos, fijar horizonte, drawdown máximo, tamaño máximo por posición y activos permitidos.',
      priority: 'high',
      evidence: { riskProfileConfigured: false },
    });
  }

  if (expenseRatio !== null && expenseRatio > 0.85) {
    findings.push({
      agent_key: 'cashflow_cfo_agent',
      finding_type: 'cashflow_pressure',
      severity: expenseRatio > 1 ? 'high' : 'medium',
      title: 'Presión de flujo de caja mensual',
      summary: `El gasto del mes representa ${(expenseRatio * 100).toFixed(0)}% de los ingresos registrados.`,
      recommendation: 'Revisar gastos variables y posponer decisiones de inversión hasta recuperar margen mensual.',
      confidence: 0.86,
      evidence: { income, expenses, netFlow, expenseRatio },
    });
  }

  if (netFlow > 0 && riskProfile) {
    findings.push({
      agent_key: 'growth_finance_agent',
      finding_type: 'investment_capacity',
      severity: 'info',
      title: 'Capacidad de asignación positiva',
      summary: `El flujo neto del mes es positivo por ${netFlow.toFixed(2)} antes de nuevas aportaciones o decisiones de inversión.`,
      recommendation: 'Usar el perfil de riesgo para decidir si el excedente va a fondo de emergencia, inversión patrimonial o capital de negocio.',
      confidence: 0.78,
      evidence: { income, expenses, netFlow, riskProfile },
    });
  }

  if (tasks.length === 0) {
    tasks.push({
      agent_key: 'weekly_cfo_orchestrator',
      title: 'Revisar cierre semanal con VirafIA',
      description: 'Validar tareas, hallazgos y prioridades antes de convertirlas en acciones de la semana.',
      priority: 'medium',
      evidence: { income, expenses, netFlow },
    });
  }

  if (findings.length === 0) {
    findings.push({
      agent_key: 'weekly_cfo_orchestrator',
      finding_type: 'weekly_baseline',
      severity: 'info',
      title: 'Base semanal lista',
      summary: 'La base de negocio, inversiones y riesgo ya puede generar seguimiento semanal.',
      recommendation: 'Mantener el ciclo semanal y enriquecerlo con cuentas read-only, metas explícitas, mercados y movimientos clasificados.',
      confidence: 0.74,
      evidence: { income, expenses, netFlow, businessCount, investmentCount },
    });
  }

  return { tasks: tasks.slice(0, 5), findings: findings.slice(0, 5) };
}

async function maybeImproveWithGemini(plan: { tasks: GeneratedTask[]; findings: GeneratedFinding[] }, context: Record<string, unknown>) {
  const apiKey = getGoogleApiKey();

  if (!apiKey) return plan;

  const prompt = `
Eres VirafIA, la asistente financiera proactiva de Virafi. Mejora sin inventar las tareas y hallazgos generados por reglas locales.

Contexto:
${JSON.stringify(context, null, 2)}

Plan local:
${JSON.stringify(plan, null, 2)}

Reglas:
- No recomiendes comprar/vender activos especificos.
- No habilites trading real.
- Mantén maximo 5 tasks y 5 findings.
- Devuelve solo JSON valido:
{
  "tasks": [{"agent_key":"...","title":"...","description":"...","priority":"low|medium|high|critical","evidence":{}}],
  "findings": [{"agent_key":"...","finding_type":"...","severity":"info|low|medium|high|critical","title":"...","summary":"...","recommendation":"...","confidence":0.8,"evidence":{}}]
}
`;

  try {
    const raw = await generateGeminiText(apiKey, prompt);
    const parsed = JSON.parse(extraerJson(raw)) as Partial<typeof plan>;

    if (!Array.isArray(parsed.tasks) || !Array.isArray(parsed.findings)) return plan;

    return {
      tasks: parsed.tasks.slice(0, 5).map((task) => ({ ...task, evidence: task.evidence || {} })) as GeneratedTask[],
      findings: parsed.findings.slice(0, 5).map((finding) => ({ ...finding, evidence: finding.evidence || {} })) as GeneratedFinding[],
    };
  } catch {
    return plan;
  }
}

export async function POST(request: Request) {
  let profileId: string | null = null;
  let actorEmail: string | null | undefined;

  try {
    const supabase = getSupabaseServiceClient();

    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Falta configurar llave de Supabase.' }, { status: 500 });
    }

    const tenant = await getRequestTenantContext(request);
    profileId = tenant.profileId;
    actorEmail = tenant.email;

    if (!profileId) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    const { start, end, label } = currentMonthRange();
    const [
      ingresosResult,
      gastosResult,
      businessResult,
      investmentResult,
      riskProfileResult,
    ] = await Promise.all([
      supabase.from('ingresos').select('monto, concepto, fecha').eq('profile_id', profileId).gte('fecha', start).lt('fecha', end),
      supabase.from('gastos').select('monto, concepto, categoria, fecha').eq('profile_id', profileId).gte('fecha', start).lt('fecha', end),
      supabase.from('business_entities').select('id, name, entity_type, status').eq('profile_id', profileId),
      supabase.from('investment_accounts').select('id, provider, account_name, mode, status').eq('profile_id', profileId),
      supabase.from('advisor_disclosures').select('metadata, accepted_at').eq('profile_id', profileId).eq('disclosure_type', 'risk_profile').order('accepted_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    if (ingresosResult.error) throw new Error(`No pude leer ingresos: ${ingresosResult.error.message}`);
    if (gastosResult.error) throw new Error(`No pude leer gastos: ${gastosResult.error.message}`);
    if (tableMissing(businessResult.error) || tableMissing(investmentResult.error) || tableMissing(riskProfileResult.error)) {
      return NextResponse.json({
        success: false,
        error: 'Falta aplicar la migración agentic foundation.',
        migration: '20260630000100_agentic_business_wealth_foundation.sql',
      }, { status: 409 });
    }
    if (businessResult.error) throw new Error(`No pude leer entidades de negocio: ${businessResult.error.message}`);
    if (investmentResult.error) throw new Error(`No pude leer cuentas de inversión: ${investmentResult.error.message}`);
    if (riskProfileResult.error) throw new Error(`No pude leer perfil de riesgo: ${riskProfileResult.error.message}`);

    const income = sumRows(ingresosResult.data || []);
    const expenses = sumRows(gastosResult.data || []);
    const riskProfile = (riskProfileResult.data?.metadata || null) as Record<string, unknown> | null;
    const context = {
      month: label,
      income,
      expenses,
      netFlow: income - expenses,
      businessEntities: businessResult.data || [],
      investmentAccounts: investmentResult.data || [],
      riskProfile,
    };
    const improvedPlan = await maybeImproveWithGemini(
      localPlan({
        income,
        expenses,
        businessCount: businessResult.data?.length || 0,
        investmentCount: investmentResult.data?.length || 0,
        riskProfile,
      }),
      context
    );

    const taskPayload = improvedPlan.tasks.map((task) => ({
      profile_id: profileId,
      agent_key: task.agent_key,
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: 'open',
      source: 'workflow',
      evidence: task.evidence,
      metadata: { workflow: 'weekly_cfo', month: label },
    }));
    const findingPayload = improvedPlan.findings.map((finding) => ({
      profile_id: profileId,
      agent_key: finding.agent_key,
      finding_type: finding.finding_type,
      severity: finding.severity,
      title: finding.title,
      summary: finding.summary,
      recommendation: finding.recommendation,
      confidence: finding.confidence,
      status: 'active',
      evidence: finding.evidence,
      metadata: { workflow: 'weekly_cfo', month: label },
    }));

    const [existingTasksResult, existingFindingsResult] = await Promise.all([
      supabase
        .from('agent_tasks')
        .select('title')
        .eq('profile_id', profileId)
        .in('status', ['open', 'in_progress', 'waiting_user']),
      supabase
        .from('agent_findings')
        .select('title')
        .eq('profile_id', profileId)
        .eq('status', 'active'),
    ]);

    if (existingTasksResult.error) throw new Error(`No pude revisar tareas existentes: ${existingTasksResult.error.message}`);
    if (existingFindingsResult.error) throw new Error(`No pude revisar hallazgos existentes: ${existingFindingsResult.error.message}`);

    const existingTaskTitles = new Set((existingTasksResult.data || []).map((task) => task.title));
    const existingFindingTitles = new Set((existingFindingsResult.data || []).map((finding) => finding.title));
    const newTaskPayload = taskPayload.filter((task) => !existingTaskTitles.has(task.title));
    const newFindingPayload = findingPayload.filter((finding) => !existingFindingTitles.has(finding.title));

    const [tasksInsert, findingsInsert] = await Promise.all([
      newTaskPayload.length
        ? supabase.from('agent_tasks').insert(newTaskPayload).select('id, agent_key, title, status, priority, due_at, created_at')
        : Promise.resolve({ data: [], error: null }),
      newFindingPayload.length
        ? supabase.from('agent_findings').insert(newFindingPayload).select('id, agent_key, finding_type, severity, title, summary, status, created_at')
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (tasksInsert.error) throw new Error(`No pude guardar tareas de VirafIA: ${tasksInsert.error.message}`);
    if (findingsInsert.error) throw new Error(`No pude guardar hallazgos de VirafIA: ${findingsInsert.error.message}`);

    await logAuditEvent({
      supabase,
      request,
      profileId,
      actorEmail,
      action: 'agents.weekly_cfo.run',
      resourceType: 'workflow',
      resourceId: 'weekly_cfo',
      metadata: {
        month: label,
        tasks: tasksInsert.data?.length || 0,
        findings: findingsInsert.data?.length || 0,
      },
    });

    return NextResponse.json({
      success: true,
      month: label,
      context,
      tasks: tasksInsert.data || [],
      findings: findingsInsert.data || [],
    });
  } catch (error: unknown) {
    const supabase = getSupabaseServiceClient();
    await logErrorEvent({ supabase, request, profileId, actorEmail, action: 'agents.weekly_cfo.run', error });
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
