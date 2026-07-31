import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { extraerJson, generateGeminiText, getConfiguredLlmKey } from '@/lib/gemini';
import { logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getAuthorizedTelegramChatId } from '@/lib/telegram-access';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

type GoalAnalysis = {
  title: string;
  summary: string;
  actions: string[];
  risk: string;
  notification: string;
};

type ProfileRow = {
  id: string;
  full_name?: string | null;
  monthly_income_target?: number | string | null;
};

function monthRanges() {
  const now = new Date();
  const currentStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const currentEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const historyStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();

  return {
    now,
    currentStart: currentStart.toISOString(),
    currentEnd: currentEnd.toISOString(),
    historyStart: historyStart.toISOString(),
    day: now.getUTCDate(),
    daysInMonth,
    monthKey: currentStart.toISOString().slice(0, 7),
  };
}

function sum(rows: Array<{ monto?: number | string | null }>) {
  return rows.reduce((total, row) => total + (Number(row.monto) || 0), 0);
}

function money(value: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(value);
}

function fallbackAnalysis(context: Record<string, number>): GoalAnalysis {
  const weeklyGap = context.remainingWeeks > 0 ? context.goalGap / context.remainingWeeks : context.goalGap;
  const dailyGap = context.remainingDays > 0 ? context.goalGap / context.remainingDays : context.goalGap;
  const paceState = context.paceVariance >= 0 ? 'por encima' : 'por debajo';

  return {
    title: `Meta mensual: avance ${context.progressPct.toFixed(0)}%`,
    summary: `Has generado ${money(context.currentIncome)} de una meta de ${money(context.monthlyTarget)}. Vas ${money(Math.abs(context.paceVariance))} ${paceState} del ritmo esperado y faltan ${money(context.goalGap)}.`,
    actions: [
      `Cerrar una brecha de ${money(weeklyGap)} por semana (${money(dailyGap)} por día restante) con ingresos nuevos o cobros pendientes.`,
      `Proteger el flujo neto actual de ${money(context.netFlow)} y revisar Placeres antes de comprometer gasto adicional.`,
      `Separar ${money(context.targetPerBucket)} al mes para Futuro: 10% del ingreso a emergencia y 15% a inversiones alineadas con la meta prioritaria, sin confundir software con inversión patrimonial.`,
    ],
    risk: context.averageIncome3Months < context.monthlyTarget
      ? `El promedio mensual de 3 meses está ${money(context.monthlyTarget - context.averageIncome3Months)} por debajo de la meta; la brecha es estructural, no solo de este mes.`
      : 'El principal riesgo es perder el ritmo de captura y seguimiento semanal.',
    notification: `VirafIA: llevas ${money(context.currentIncome)} de ${money(context.monthlyTarget)} (${context.progressPct.toFixed(0)}%). Faltan ${money(context.goalGap)}. Objetivo inmediato: ${money(weeklyGap)} por semana.`,
  };
}

async function improveAnalysis(context: Record<string, number>, fallback: GoalAnalysis) {
  const apiKey = getConfiguredLlmKey();
  if (!apiKey) return fallback;

  const prompt = `
Eres VirafIA, la asistente financiera proactiva de Diego. Tu objetivo rector es ayudarlo a alcanzar su meta mensual de ingresos con acciones medibles, usando organización financiera e inversión responsable.

Contexto cuantitativo:
${JSON.stringify(context, null, 2)}

Borrador determinista:
${JSON.stringify(fallback, null, 2)}

Reglas:
- No inventes datos ni prometas rendimientos.
- Distingue generación de ingresos, ahorro por control de gasto e inversión patrimonial.
- No presentes recortar gastos como si fuera generar ingresos.
- Produce exactamente 3 acciones, ordenadas por impacto, con monto, frecuencia y criterio verificable.
- La notificación debe ser breve, directa y útil por sí sola en Telegram.
- Devuelve solo JSON válido sin markdown:
{"title":"...","summary":"...","actions":["...","...","..."],"risk":"...","notification":"..."}
`;

  try {
    const raw = await generateGeminiText(apiKey, prompt);
    const parsed = JSON.parse(extraerJson(raw)) as Partial<GoalAnalysis>;

    if (!parsed.title || !parsed.summary || !Array.isArray(parsed.actions) || !parsed.notification) return fallback;

    return {
      title: String(parsed.title),
      summary: String(parsed.summary),
      actions: parsed.actions.slice(0, 3).map(String),
      risk: String(parsed.risk || fallback.risk),
      notification: String(parsed.notification),
    };
  } catch {
    return fallback;
  }
}

async function sendTelegram(chatId: string, text: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  if (!botToken || !chatId) return false;

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  return response.ok;
}

async function runForProfile(supabase: SupabaseClient, profile: ProfileRow, force = false) {
  const ranges = monthRanges();
  const monthlyTarget = Number(profile.monthly_income_target) || 0;
  if (monthlyTarget <= 0) return { profileId: profile.id, skipped: 'no-monthly-target' };

  if (!force) {
    const todayStart = new Date(Date.UTC(ranges.now.getUTCFullYear(), ranges.now.getUTCMonth(), ranges.now.getUTCDate())).toISOString();
    const { data: existing } = await supabase
      .from('agent_findings')
      .select('id')
      .eq('profile_id', profile.id)
      .eq('agent_key', 'proactive_goal_cfo')
      .gte('created_at', todayStart)
      .limit(1);

    if (existing?.length) return { profileId: profile.id, skipped: 'already-ran-today' };
  }

  const [incomeResult, expenseResult, telegramChatId] = await Promise.all([
    supabase.from('ingresos').select('monto, fecha').eq('profile_id', profile.id).gte('fecha', ranges.historyStart).lt('fecha', ranges.currentEnd),
    supabase.from('gastos').select('monto, categoria, fecha').eq('profile_id', profile.id).gte('fecha', ranges.currentStart).lt('fecha', ranges.currentEnd),
    getAuthorizedTelegramChatId({ supabase, profileId: profile.id }),
  ]);

  if (incomeResult.error) throw new Error(`No pude leer ingresos del perfil ${profile.id}: ${incomeResult.error.message}`);
  if (expenseResult.error) throw new Error(`No pude leer gastos del perfil ${profile.id}: ${expenseResult.error.message}`);

  const incomes = incomeResult.data || [];
  const currentIncome = sum(incomes.filter((row) => new Date(row.fecha).getTime() >= new Date(ranges.currentStart).getTime()));
  const currentExpenses = sum(expenseResult.data || []);
  const futureAllocation = sum((expenseResult.data || []).filter((row) => /futuro|seguro/i.test(String(row.categoria || ''))));
  const historicalIncome = sum(incomes.filter((row) => new Date(row.fecha).getTime() < new Date(ranges.currentStart).getTime()));
  const averageIncome3Months = historicalIncome / 3;
  const expectedByToday = monthlyTarget * (ranges.day / ranges.daysInMonth);
  const goalGap = Math.max(monthlyTarget - currentIncome, 0);
  const remainingDays = Math.max(ranges.daysInMonth - ranges.day + 1, 1);
  const context = {
    monthlyTarget,
    currentIncome,
    currentExpenses,
    netFlow: currentIncome - currentExpenses,
    futureAllocation,
    averageIncome3Months,
    structuralGap: Math.max(monthlyTarget - averageIncome3Months, 0),
    expectedByToday,
    paceVariance: currentIncome - expectedByToday,
    progressPct: (currentIncome / monthlyTarget) * 100,
    goalGap,
    remainingDays,
    remainingWeeks: Math.max(remainingDays / 7, 1),
    targetPerBucket: monthlyTarget * 0.25,
  };
  const analysis = await improveAnalysis(context, fallbackAnalysis(context));
  const createdAt = new Date().toISOString();
  const [findingResult, taskResult] = await Promise.all([
    supabase.from('agent_findings').insert({
      profile_id: profile.id,
      agent_key: 'proactive_goal_cfo',
      finding_type: 'monthly_goal_progress',
      severity: context.paceVariance < 0 ? 'high' : 'info',
      title: analysis.title,
      summary: analysis.summary,
      recommendation: analysis.actions.join('\n'),
      confidence: 0.9,
      status: 'active',
      evidence: context,
      metadata: { workflow: 'proactive_goal_cfo', month: ranges.monthKey, generated_at: createdAt },
    }).select('id, agent_key, finding_type, severity, title, summary, recommendation, status, created_at').single(),
    supabase.from('agent_tasks').insert({
      profile_id: profile.id,
      agent_key: 'proactive_goal_cfo',
      title: analysis.actions[0],
      description: analysis.actions.slice(1).join('\n'),
      priority: context.paceVariance < 0 ? 'high' : 'medium',
      status: 'open',
      source: 'workflow',
      due_at: ranges.currentEnd,
      evidence: context,
      metadata: { workflow: 'proactive_goal_cfo', month: ranges.monthKey, generated_at: createdAt },
    }).select('id, agent_key, title, status, priority, due_at, created_at').single(),
  ]);

  if (findingResult.error) throw new Error(`No pude guardar análisis proactivo: ${findingResult.error.message}`);
  if (taskResult.error) throw new Error(`No pude guardar tarea proactiva: ${taskResult.error.message}`);

  const telegramSent = telegramChatId
    ? await sendTelegram(telegramChatId, `${analysis.notification}\n\nSiguiente acción: ${analysis.actions[0]}`)
    : false;

  return { profileId: profile.id, analysis, finding: findingResult.data, task: taskResult.data, telegramSent };
}

async function runProfiles(request: Request, profiles: ProfileRow[], force = false) {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ success: false, error: 'Falta configurar Supabase.' }, { status: 500 });

  const results = [];
  for (const profile of profiles) results.push(await runForProfile(supabase, profile, force));

  return NextResponse.json({ success: true, processed: results.length, results });
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET || '';
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseServiceClient();
    if (!supabase) return NextResponse.json({ success: false, error: 'Falta configurar Supabase.' }, { status: 500 });
    const { data, error } = await supabase.from('profiles').select('id, full_name, monthly_income_target').gt('monthly_income_target', 0);
    if (error) throw new Error(`No pude leer perfiles: ${error.message}`);

    return runProfiles(request, (data || []) as ProfileRow[]);
  } catch (error: unknown) {
    const supabase = getSupabaseServiceClient();
    await logErrorEvent({ supabase, request, action: 'agents.proactive_goal.cron', error });
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Error desconocido.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const tenant = await getRequestTenantContext(request);
    if (!tenant.profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    const supabase = getSupabaseServiceClient();
    if (!supabase) return NextResponse.json({ success: false, error: 'Falta configurar Supabase.' }, { status: 500 });
    const { data, error } = await supabase.from('profiles').select('id, full_name, monthly_income_target').eq('id', tenant.profileId).single();
    if (error) throw new Error(`No pude leer el perfil: ${error.message}`);

    return runProfiles(request, [data as ProfileRow], true);
  } catch (error: unknown) {
    const supabase = getSupabaseServiceClient();
    await logErrorEvent({ supabase, request, action: 'agents.proactive_goal.manual', error });
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Error desconocido.' }, { status: 500 });
  }
}
