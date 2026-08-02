import type { SupabaseClient } from '@supabase/supabase-js';
import { generateLlmChat, getConfiguredLlmKey } from '@/lib/gemini';
import { isConcreteFinancialGoal } from '@/lib/personalized-goals';
import { getAuthorizedTelegramChatId } from '@/lib/telegram-access';
import {
  goalFromUserPerspective,
  removeQuotedGoalLabels,
  VIRAFIA_CONVERSATION_PRINCIPLES,
} from '@/lib/virafia-conversation-principles';
import {
  appendProactiveMessageToTelegramMemory,
  appendVirafiaConversationMessage,
  readVirafiaConversation,
} from '@/lib/virafia-conversation';
import { isMondayInTimezone, isWeekdayInTimezone } from '@/lib/schedule';
export { isMondayInTimezone, isWeekdayInTimezone } from '@/lib/schedule';

const DEFAULT_TIMEZONE = 'America/Mexico_City';
const DEFAULT_WINDOW_START = 8;
const DEFAULT_WINDOW_END = 14;

type ProfileRow = {
  id: string;
  full_name?: string | null;
  monthly_income_target?: number | string | null;
};

type DailyCfoPreference = {
  profile_id: string;
  enabled?: boolean | null;
  timezone?: string | null;
  delivery_window_start?: number | null;
  delivery_window_end?: number | null;
  in_app_enabled?: boolean | null;
  telegram_enabled?: boolean | null;
  tone?: string | null;
};

export type GoalPace = {
  id: string;
  name: string;
  priority: number;
  targetAmount: number;
  currentAmount: number;
  createdDate: string;
  remainingAmount: number;
  targetDate: string | null;
  daysRemaining: number | null;
  dailyRequired: number;
  weeklyRequired: number;
  monthlyRequired: number;
  expectedAmountToday: number;
  paceGap: number;
  progressPct: number;
  status: 'needs_amount' | 'needs_date' | 'completed' | 'behind' | 'on_track';
};

export type DailyCfoAction = {
  title: string;
  description: string;
  goalId: string | null;
  goalName: string | null;
  amount: number | null;
  dueAt: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  impact: string;
};

export type DailyCfoSnapshot = {
  localDate: string;
  timezone: string;
  firstName: string;
  todayIncome: number;
  todayExpenses: number;
  todayNet: number;
  monthIncome: number;
  monthExpenses: number;
  monthNet: number;
  averageMonthlyIncome: number;
  averageMonthlyExpenses: number;
  estimatedMonthlyCapacity: number;
  configuredMonthlyCapacity: number;
  requiredMonthlyForGoals: number;
  capacityGap: number;
  investmentValue: number;
  monthlyIncomeTarget: number;
  recentContributions: Array<{ goalName: string; amount: number; date: string }>;
  suggestedContributions: Array<{ id?: string; goalName: string; amount: number; date: string; note: string }>;
  pendingTasks: Array<{ title: string; dueAt: string | null }>;
  lifePriorities: string[];
  recommendationStyle: string;
  goalPaces: GoalPace[];
};

type GeneratedBriefing = {
  message: string;
  summary: string;
  actions: DailyCfoAction[];
};

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(Math.max(value, 0));
}

function safeTimezone(timezone?: string | null) {
  const candidate = timezone || DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function zonedParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    month: `${parts.year}-${parts.month}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function dateKey(value: string | Date, timezone: string) {
  return zonedParts(value instanceof Date ? value : new Date(value), timezone).date;
}

function simpleHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function isCompleteProactiveMessage(value: string) {
  const message = value.trim();
  if (message.length < 40) return false;

  // A MAX_TOKENS response commonly ends in a connector ("que", "para", …)
  // rather than punctuation. Never deliver that partial sentence to Telegram.
  if (!/[.!?…»”)]$/.test(message)) return false;
  return !/\b(?:que|y|o|pero|porque|para|de|con|en|a|el|la|lo|un|una|por|hoy)$/i.test(
    message.replace(/[.!?…»”)]*$/, '').trim(),
  );
}

export function proactiveOpening({
  firstName,
  localDate,
  continuingToday,
}: {
  firstName: string;
  localDate: string;
  continuingToday: boolean;
}) {
  const openings = continuingToday
    ? [
        `Por cierto, ${firstName}, volví a revisar cómo va tu parte financiera.`,
        `Retomando lo de hoy, ${firstName}: revisé de nuevo tus números y tus metas.`,
        `${firstName}, antes de cerrar el día le di otra vuelta a tu panorama financiero.`,
        `Hay una actualización, ${firstName}: volví a pasar por tus números de hoy.`,
        `Siguiendo con lo de hoy, ${firstName}, revisé cómo quedó tu frente financiero.`,
      ]
    : [
        `Qué onda, ${firstName}. Estuve revisando cómo va tu día financiero.`,
        `Hola, ${firstName}. Me di una vuelta por tus números y tus metas de hoy.`,
        `${firstName}, ya revisé cómo se está moviendo tu día financiero.`,
        `Te cuento, ${firstName}: acabo de revisar tus números y lo que traes pendiente.`,
        `${firstName}, hice el corte financiero de hoy y encontré algo que vale la pena revisar.`,
      ];
  const dayNumber = Math.floor(Date.parse(`${localDate}T00:00:00.000Z`) / 86_400_000);
  const index = (Math.max(dayNumber, 0) + simpleHash(firstName)) % openings.length;
  return openings[index];
}

export function scheduledMinuteForDay({
  profileId,
  localDate,
  windowStart = DEFAULT_WINDOW_START,
  windowEnd = DEFAULT_WINDOW_END,
}: {
  profileId: string;
  localDate: string;
  windowStart?: number;
  windowEnd?: number;
}) {
  const start = Math.min(Math.max(Math.trunc(windowStart), 0), 23);
  const end = Math.min(Math.max(Math.trunc(windowEnd), start + 1), 24);
  const slots = Math.max((end - start) * 4, 1);
  return start * 60 + (simpleHash(`${profileId}:${localDate}`) % slots) * 15;
}

export function isDailyCfoDue({
  profileId,
  now,
  timezone,
  windowStart,
  windowEnd,
}: {
  profileId: string;
  now: Date;
  timezone: string;
  windowStart: number;
  windowEnd: number;
}) {
  const local = zonedParts(now, timezone);
  const currentMinute = local.hour * 60 + local.minute;
  const scheduledMinute = scheduledMinuteForDay({
    profileId,
    localDate: local.date,
    windowStart,
    windowEnd,
  });
  return {
    due: currentMinute >= scheduledMinute && currentMinute <= windowEnd * 60,
    localDate: local.date,
    scheduledMinute,
  };
}

function differenceInDays(fromDate: string, toDate: string) {
  const from = Date.parse(`${fromDate}T00:00:00.000Z`);
  const to = Date.parse(`${toDate}T00:00:00.000Z`);
  return Math.floor((to - from) / 86_400_000);
}

function groupMonthlyAverage(rows: Array<{ monto?: unknown; fecha?: string | null }>, timezone: string, localMonth: string) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!row.fecha) continue;
    const month = zonedParts(new Date(row.fecha), timezone).month;
    if (month === localMonth) continue;
    totals.set(month, (totals.get(month) || 0) + numberValue(row.monto));
  }
  const latest = [...totals.entries()].sort(([a], [b]) => b.localeCompare(a)).slice(0, 3);
  if (!latest.length) return 0;
  return latest.reduce((total, [, amount]) => total + amount, 0) / latest.length;
}

function buildGoalPaces(goals: Array<Record<string, unknown>>, localDate: string): GoalPace[] {
  return goals.map((goal) => {
    const targetAmount = numberValue(goal.target_amount);
    const currentAmount = numberValue(goal.current_amount);
    const targetDate = typeof goal.target_date === 'string' ? goal.target_date : null;
    const createdDate = typeof goal.created_at === 'string' ? goal.created_at.slice(0, 10) : localDate;
    const remainingAmount = Math.max(targetAmount - currentAmount, 0);
    const daysRemaining = targetDate ? Math.max(differenceInDays(localDate, targetDate), 0) : null;
    const totalDays = targetDate ? Math.max(differenceInDays(createdDate, targetDate), 1) : null;
    const elapsedDays = totalDays ? Math.min(Math.max(differenceInDays(createdDate, localDate), 0), totalDays) : 0;
    const expectedAmountToday = targetAmount > 0 && totalDays
      ? Math.min(targetAmount, targetAmount * (elapsedDays / totalDays))
      : currentAmount;
    const dailyRequired = remainingAmount > 0 && daysRemaining !== null
      ? remainingAmount / Math.max(daysRemaining, 1)
      : 0;
    let status: GoalPace['status'] = 'on_track';
    if (targetAmount <= 0) status = 'needs_amount';
    else if (!targetDate) status = 'needs_date';
    else if (remainingAmount <= 0) status = 'completed';
    else if (currentAmount + 1 < expectedAmountToday) status = 'behind';

    return {
      id: String(goal.id),
      name: String(goal.name || 'Meta'),
      priority: numberValue(goal.sort_order),
      targetAmount,
      currentAmount,
      createdDate,
      remainingAmount,
      targetDate,
      daysRemaining,
      dailyRequired,
      weeklyRequired: dailyRequired * 7,
      monthlyRequired: dailyRequired * 30.4375,
      expectedAmountToday,
      paceGap: currentAmount - expectedAmountToday,
      progressPct: targetAmount > 0 ? Math.min((currentAmount / targetAmount) * 100, 100) : 0,
      status,
    };
  }).sort((a, b) => {
    const statusRank = { behind: 0, needs_amount: 1, needs_date: 2, on_track: 3, completed: 4 };
    return statusRank[a.status] - statusRank[b.status] || a.priority - b.priority;
  });
}

function dueAtIso(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function buildActions(snapshot: DailyCfoSnapshot): DailyCfoAction[] {
  const actionableGoals = snapshot.goalPaces.filter((goal) => !['completed'].includes(goal.status));
  const first = actionableGoals[0];
  if (!first) {
    return [{
      title: 'Define tu siguiente meta financiera o de negocio',
      description: 'El siguiente paso es convertir una prioridad personal en un resultado financiable y medible: por ejemplo, una reserva, equipo, capital de trabajo o una meta de ingresos con fecha.',
      goalId: null,
      goalName: null,
      amount: null,
      dueAt: dueAtIso(7),
      priority: 'medium',
      impact: 'Mantiene el acompañamiento enfocado en un resultado medible.',
    }];
  }

  if (first.status === 'needs_amount' || first.status === 'needs_date') {
    return [{
      title: `Completa el plan para ${goalFromUserPerspective(first.name)}`,
      description: first.status === 'needs_amount'
        ? 'Falta definir cuánto cuesta esta meta para calcular un ritmo realista.'
        : 'Falta una fecha objetivo para convertir esta meta en un plan diario.',
      goalId: first.id,
      goalName: first.name,
      amount: null,
      dueAt: dueAtIso(3),
      priority: 'high',
      impact: 'Permite que VirafIA mida el avance y recomiende aportaciones concretas.',
    }];
  }

  const weeklyCapacity = snapshot.estimatedMonthlyCapacity / 4.345;
  const amount = Math.min(
    first.remainingAmount,
    Math.max(Math.min(first.weeklyRequired, Math.max(weeklyCapacity, first.dailyRequired)), first.dailyRequired),
  );
  const mainAction: DailyCfoAction = {
    title: `Aparta ${money(amount)} para ${goalFromUserPerspective(first.name)}`,
    description: first.status === 'behind'
      ? `Esta aportación recupera parte del atraso de ${money(Math.abs(first.paceGap))} frente al ritmo planeado.`
      : 'Esta aportación mantiene la meta dentro del ritmo necesario para su fecha.',
    goalId: first.id,
    goalName: first.name,
    amount: Math.round(amount * 100) / 100,
    dueAt: dueAtIso(7),
    priority: first.status === 'behind' ? 'high' : 'medium',
    impact: `Reduce la brecha pendiente de ${money(first.remainingAmount)}.`,
  };
  const actions = [mainAction];

  const suggested = snapshot.suggestedContributions[0];
  if (suggested) {
    actions.push({
      title: `Confirma si ${money(suggested.amount)} fueron para ${goalFromUserPerspective(suggested.goalName)}`,
      description: `VirafIA encontró un movimiento que podría ser una aportación: ${suggested.note}. No contará como avance hasta que lo confirmes.`,
      goalId: null,
      goalName: suggested.goalName,
      amount: suggested.amount,
      dueAt: dueAtIso(2),
      priority: 'medium',
      impact: 'Mantiene el progreso de la meta respaldado por movimientos confirmados.',
    });
  }

  if (snapshot.capacityGap < 0 && actions.length < 3) {
    actions.push({
      title: 'Ajusta una fecha o libera capacidad mensual',
      description: `Tus metas requieren cerca de ${money(snapshot.requiredMonthlyForGoals)} al mes y hoy estimamos ${money(snapshot.estimatedMonthlyCapacity)} disponibles.`,
      goalId: first.id,
      goalName: first.name,
      amount: Math.abs(snapshot.capacityGap),
      dueAt: dueAtIso(7),
      priority: 'high',
      impact: 'Evita prometer fechas que el flujo actual no puede sostener.',
    });
  }

  const overdue = snapshot.pendingTasks[0];
  if (overdue && actions.length < 3) {
    actions.push({
      title: `Resuelve lo pendiente: ${overdue.title}`,
      description: 'VirafIA conservará esta tarea en el seguimiento hasta que la completes, la pospongas o la descartes.',
      goalId: null,
      goalName: null,
      amount: null,
      dueAt: overdue.dueAt || dueAtIso(2),
      priority: 'medium',
      impact: 'Cierra una recomendación anterior antes de acumular nuevas tareas.',
    });
  }

  return actions.slice(0, 3);
}

export function fallbackMessage(snapshot: DailyCfoSnapshot, actions: DailyCfoAction[], continuingToday: boolean) {
  const greeting = proactiveOpening({
    firstName: snapshot.firstName,
    localDate: snapshot.localDate,
    continuingToday,
  });
  const movementLine = snapshot.todayIncome || snapshot.todayExpenses
    ? `Hoy entraron ${money(snapshot.todayIncome)} y salieron ${money(snapshot.todayExpenses)}; el movimiento neto va en ${snapshot.todayNet >= 0 ? money(snapshot.todayNet) : `-${money(Math.abs(snapshot.todayNet))}`}.`
    : 'Hoy no vi movimientos nuevos, pero igual revisé tus metas y lo que traes pendiente.';
  const mainGoal = snapshot.goalPaces.find((goal) => goal.status !== 'completed');
  const aspiration = mainGoal ? goalFromUserPerspective(mainGoal.name) : '';
  const goalLine = mainGoal
    ? mainGoal.status === 'behind'
      ? `Tu plan para ${aspiration} necesita atención: hoy lleva una brecha de ${money(Math.abs(mainGoal.paceGap))} frente al ritmo planeado.`
      : mainGoal.status === 'needs_amount' || mainGoal.status === 'needs_date'
        ? `Para convertir ${aspiration} en un plan útil todavía falta definir ${mainGoal.status === 'needs_amount' ? 'cuánto necesitas' : 'para cuándo lo quieres lograr'}.`
        : `Tu plan para ${aspiration} sigue en ruta; sostenerlo requiere cerca de ${money(mainGoal.weeklyRequired)} por semana.`
    : 'No veo una meta financiera o de negocio concreta con brecha pendiente, así que toca aterrizar una prioridad en un objetivo medible.';
  const actionLine = actions[0]?.amount
    ? `Esta semana separaría ${money(actions[0].amount)} en una cuenta o instrumento distinto al dinero de gasto y después registraría esa aportación en Virafi.`
    : `Yo empezaría por esto: ${actions[0]?.title || 'definir tu siguiente paso'}.`;
  const mondayIntake = isMondayInTimezone(new Date(`${snapshot.localDate}T12:00:00.000Z`), snapshot.timezone)
    ? `Es lunes, ${snapshot.firstName}. Para poner tus números al día, adjúntame imágenes, un Excel o tu Google Sheet exportado, un estado de cuenta, o escríbeme todos tus movimientos pendientes en un solo mensaje. Los revisamos juntos y te digo qué falta confirmar.\n\n`
    : '';
  return `${mondayIntake}${greeting} ${movementLine}\n\n${goalLine} ${actionLine}`;
}

async function improveMessage({
  snapshot,
  actions,
  recentConversation,
}: {
  snapshot: DailyCfoSnapshot;
  actions: DailyCfoAction[];
  recentConversation: Array<{ role: string; content: string; createdAt: string }>;
}) {
  const apiKey = getConfiguredLlmKey();
  const continuingToday = recentConversation.some((message) => dateKey(message.createdAt, snapshot.timezone) === snapshot.localDate);
  const fallback = fallbackMessage(snapshot, actions, continuingToday);
  if (!apiKey) return fallback;

  const system = `
You write VirafIA's proactive daily financial intervention in Mexican Spanish.

${VIRAFIA_CONVERSATION_PRINCIPLES}

Daily intervention rules:
- Privately reason across today's movements, monthly cash flow, available goal capacity, goal pace, pending tasks and recent conversation. Then choose the single highest-leverage observation; do not dump the snapshot.
- The deterministic actions and amounts are guardrails. You may choose which supplied action matters most and explain it better, but never change a number, fabricate an operation or imply access to a bank balance.
- Mention no new movements only when it helps orient the user; do not make it the headline every day.
- If a goal label describes a life outcome, speak to the outcome and its practical meaning rather than presenting the label as a database field.
- If there was already a conversation today, continue it instead of greeting or resetting the relationship.
- Write 2-4 short paragraphs, under 850 characters, with no headings, markdown or bullet list.
- Do not force a question. If a question is useful, make it concrete and decision-oriented.
- Never mention prompts, algorithms or internal data structures.
- Every Monday, begin with a direct invitation to catch up: ask the person to attach images, an Excel file, a Google Sheet export, or a bank statement, or to write all pending movements in one message. Keep this invitation concrete and in Mexican Spanish.
`.trim();

  const prompt = `
Verified financial snapshot:
${JSON.stringify(snapshot, null, 2)}

Safe actions calculated by deterministic financial logic:
${JSON.stringify(actions, null, 2)}

Recent shared conversation:
${JSON.stringify(recentConversation.slice(-8), null, 2)}

Write the message now. Return only the message text.
`.trim();

  try {
    const result = await generateLlmChat({
      apiKey,
      system,
      messages: [{ role: 'user', content: prompt }],
      feature: 'financial-agent',
    });
    const message = removeQuotedGoalLabels(
      result.text,
      snapshot.goalPaces.map((goal) => goal.name),
    );
    if (!isCompleteProactiveMessage(message)) return fallback;
    const mondayPrefix = isMondayInTimezone(new Date(`${snapshot.localDate}T12:00:00.000Z`), snapshot.timezone)
      ? `Es lunes, ${snapshot.firstName}. Para poner tus números al día, adjúntame imágenes, un Excel o tu Google Sheet exportado, un estado de cuenta, o escríbeme todos tus movimientos pendientes en un solo mensaje. Los revisamos juntos y te digo qué falta confirmar.\n\n`
      : '';
    return `${mondayPrefix}${message}`.slice(0, 1200);
  } catch (error) {
    console.error('[daily-cfo] intelligent message generation failed; using local fallback', error);
    return fallback;
  }
}

async function optionalRows<T>(promise: PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const result = await promise;
  if (result.error && !/does not exist|schema cache/i.test(result.error.message)) throw new Error(result.error.message);
  return result.data || [];
}

async function optionalRow<T>(promise: PromiseLike<{ data: T | null; error: { message: string } | null }>) {
  const result = await promise;
  if (result.error && !/does not exist|schema cache|multiple \(or no\) rows/i.test(result.error.message)) throw new Error(result.error.message);
  return result.data || null;
}

async function buildSnapshot({
  supabase,
  profile,
  now,
  timezone,
}: {
  supabase: SupabaseClient;
  profile: ProfileRow;
  now: Date;
  timezone: string;
}): Promise<DailyCfoSnapshot> {
  const local = zonedParts(now, timezone);
  const historyStart = new Date(now.getTime() - 130 * 86_400_000).toISOString();
  const recentContributionStart = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const [goals, incomes, expenses, positions, personalization, contributions, pendingTasks, goalDisclosure] = await Promise.all([
    optionalRows<Record<string, unknown>>(supabase.from('financial_goals').select('id, name, current_amount, target_amount, target_date, horizon_months, source, sort_order, created_at').eq('profile_id', profile.id).eq('status', 'active').order('sort_order')),
    optionalRows<{ monto?: unknown; fecha?: string | null }>(supabase.from('ingresos').select('monto, fecha').eq('profile_id', profile.id).gte('fecha', historyStart).order('fecha', { ascending: false })),
    optionalRows<{ monto?: unknown; fecha?: string | null; categoria?: string | null; concepto?: string | null }>(supabase.from('gastos').select('monto, fecha, categoria, concepto').eq('profile_id', profile.id).gte('fecha', historyStart).order('fecha', { ascending: false })),
    optionalRows<{ market_value?: unknown; as_of?: string | null }>(supabase.from('investment_positions').select('market_value, as_of').eq('profile_id', profile.id)),
    optionalRow<Record<string, unknown>>(supabase.from('financial_personalization_profiles').select('goal_priorities, monthly_goal_capacity, recommendation_style').eq('profile_id', profile.id).maybeSingle()),
    optionalRows<Record<string, unknown>>(supabase.from('financial_goal_contributions').select('id, goal_id, amount, contributed_at, status, note, financial_goals(name)').eq('profile_id', profile.id).gte('contributed_at', recentContributionStart).order('contributed_at', { ascending: false }).limit(40)),
    optionalRows<{ title?: string | null; due_at?: string | null }>(supabase.from('agent_tasks').select('title, due_at').eq('profile_id', profile.id).in('status', ['open', 'in_progress', 'waiting_user']).neq('agent_key', 'daily_cfo_mentor').order('due_at', { ascending: true, nullsFirst: false }).limit(5)),
    optionalRow<{ metadata?: unknown }>(supabase.from('advisor_disclosures').select('metadata').eq('profile_id', profile.id).eq('disclosure_type', 'personalized_advice').eq('version', 'financial-goals-v1').maybeSingle()),
  ]);

  // Life values remain useful personalization context, but stale rows created from
  // those values must never participate in monetary pacing or contributions.
  const goalMetadata = goalDisclosure?.metadata as { generatedGoalIds?: Array<string | number> } | null;
  const legacyIds = new Set((goalMetadata?.generatedGoalIds || []).map(String));
  const concreteGoals = goals.filter((goal) => isConcreteFinancialGoal(goal.name));
  const legacyGenerationDetected = legacyIds.size > concreteGoals.length;
  const financialGoals = concreteGoals.map((goal) => legacyGenerationDetected && goal.source === 'personalization' && legacyIds.has(String(goal.id))
    ? { ...goal, target_amount: 0 }
    : goal);
  const financialGoalIds = new Set(financialGoals.map((goal) => String(goal.id)));
  const eligibleContributions = contributions.filter((contribution) => financialGoalIds.has(String(contribution.goal_id || '')));
  const goalsById = new Map(financialGoals.map((goal) => [String(goal.id), String(goal.name || 'Meta')]));
  const contributionGoalName = (contribution: Record<string, unknown>) => {
    const relation = Array.isArray(contribution.financial_goals) ? contribution.financial_goals[0] : null;
    return String((relation && typeof relation === 'object' ? (relation as { name?: unknown }).name : null) || goalsById.get(String(contribution.goal_id || '')) || 'Meta');
  };

  const todayIncome = incomes.filter((row) => row.fecha && dateKey(row.fecha, timezone) === local.date).reduce((total, row) => total + numberValue(row.monto), 0);
  const todayExpenses = expenses.filter((row) => row.fecha && dateKey(row.fecha, timezone) === local.date).reduce((total, row) => total + numberValue(row.monto), 0);
  const monthIncome = incomes.filter((row) => row.fecha && zonedParts(new Date(row.fecha), timezone).month === local.month).reduce((total, row) => total + numberValue(row.monto), 0);
  const monthExpenses = expenses.filter((row) => row.fecha && zonedParts(new Date(row.fecha), timezone).month === local.month).reduce((total, row) => total + numberValue(row.monto), 0);
  const averageMonthlyIncome = groupMonthlyAverage(incomes, timezone, local.month) || monthIncome;
  const averageMonthlyExpenses = groupMonthlyAverage(expenses, timezone, local.month) || monthExpenses;
  const configuredMonthlyCapacity = numberValue(personalization?.monthly_goal_capacity);
  const estimatedMonthlyCapacity = configuredMonthlyCapacity > 0
    ? configuredMonthlyCapacity
    : Math.max((averageMonthlyIncome - averageMonthlyExpenses) * 0.7, 0);
  const goalPaces = buildGoalPaces(financialGoals, local.date);
  const requiredMonthlyForGoals = goalPaces
    .filter((goal) => !['completed', 'needs_amount', 'needs_date'].includes(goal.status))
    .reduce((total, goal) => total + goal.monthlyRequired, 0);
  return {
    localDate: local.date,
    timezone,
    firstName: String(profile.full_name || 'amigo').trim().split(/\s+/)[0] || 'amigo',
    todayIncome,
    todayExpenses,
    todayNet: todayIncome - todayExpenses,
    monthIncome,
    monthExpenses,
    monthNet: monthIncome - monthExpenses,
    averageMonthlyIncome,
    averageMonthlyExpenses,
    estimatedMonthlyCapacity,
    configuredMonthlyCapacity,
    requiredMonthlyForGoals,
    capacityGap: estimatedMonthlyCapacity - requiredMonthlyForGoals,
    investmentValue: positions.reduce((total, position) => total + numberValue(position.market_value), 0),
    monthlyIncomeTarget: numberValue(profile.monthly_income_target),
    recentContributions: eligibleContributions.filter((contribution) => contribution.status === 'confirmed').map((contribution) => ({
      goalName: contributionGoalName(contribution),
      amount: numberValue(contribution.amount),
      date: String(contribution.contributed_at || ''),
    })),
    suggestedContributions: eligibleContributions.filter((contribution) => contribution.status === 'suggested').map((contribution) => ({
      id: contribution.id ? String(contribution.id) : undefined,
      goalName: contributionGoalName(contribution),
      amount: numberValue(contribution.amount),
      date: String(contribution.contributed_at || ''),
      note: String(contribution.note || 'Aportación por confirmar'),
    })),
    pendingTasks: pendingTasks.map((task) => ({ title: String(task.title || 'Tarea pendiente'), dueAt: task.due_at || null })),
    lifePriorities: Array.isArray(personalization?.goal_priorities) ? personalization.goal_priorities.map(String) : [],
    recommendationStyle: String(personalization?.recommendation_style || 'natural'),
    goalPaces,
  };
}

async function sendTelegramMessage(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN no está configurado.');
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const payload = await response.json().catch(() => ({})) as { ok?: boolean; result?: { message_id?: number }; description?: string };
  if (!response.ok || !payload.ok) throw new Error(payload.description || `Telegram respondió ${response.status}.`);
  return payload.result?.message_id ? String(payload.result.message_id) : null;
}

async function saveTasksAndFinding({
  supabase,
  profileId,
  briefingId,
  briefing,
  snapshot,
}: {
  supabase: SupabaseClient;
  profileId: string;
  briefingId: string;
  briefing: GeneratedBriefing;
  snapshot: DailyCfoSnapshot;
}) {
  await supabase
    .from('agent_findings')
    .update({ status: 'superseded', updated_at: new Date().toISOString() })
    .eq('profile_id', profileId)
    .eq('agent_key', 'daily_cfo_mentor')
    .eq('status', 'active');

  await supabase
    .from('agent_tasks')
    .update({
      status: 'dismissed',
      updated_at: new Date().toISOString(),
      metadata: { superseded_by_daily_briefing_id: briefingId },
    })
    .eq('profile_id', profileId)
    .eq('agent_key', 'daily_cfo_mentor')
    .in('status', ['open', 'in_progress', 'waiting_user']);

  const tasks = briefing.actions.map((action) => ({
    profile_id: profileId,
    agent_key: 'daily_cfo_mentor',
    title: action.title,
    description: `${action.description}\n${action.impact}`,
    status: 'open',
    priority: action.priority,
    due_at: action.dueAt,
    source: 'workflow',
    evidence: { amount: action.amount, goal_id: action.goalId, goal_name: action.goalName },
    metadata: { daily_briefing_id: briefingId, local_date: snapshot.localDate },
  }));
  const [taskResult, findingResult] = await Promise.all([
    tasks.length ? supabase.from('agent_tasks').insert(tasks) : Promise.resolve({ error: null }),
    supabase.from('agent_findings').insert({
      profile_id: profileId,
      agent_key: 'daily_cfo_mentor',
      finding_type: 'daily_financial_mentoring',
      severity: snapshot.capacityGap < 0 || snapshot.goalPaces.some((goal) => goal.status === 'behind') ? 'high' : 'info',
      title: 'Tu mensaje diario de VirafIA',
      summary: briefing.summary,
      recommendation: briefing.actions.map((action) => action.title).join('\n'),
      confidence: 0.92,
      status: 'active',
      evidence: snapshot,
      metadata: { daily_briefing_id: briefingId, local_date: snapshot.localDate },
    }),
  ]);
  if (taskResult.error) throw new Error(`No pude guardar las tareas diarias: ${taskResult.error.message}`);
  if (findingResult.error) throw new Error(`No pude guardar el análisis diario: ${findingResult.error.message}`);
}

async function deliverBriefing({
  supabase,
  profileId,
  briefingId,
  message,
  inAppEnabled,
  telegramEnabled,
}: {
  supabase: SupabaseClient;
  profileId: string;
  briefingId: string;
  message: string;
  inAppEnabled: boolean;
  telegramEnabled: boolean;
}) {
  const now = new Date().toISOString();
  const deliveries = [
    { briefing_id: briefingId, profile_id: profileId, channel: 'in_app', status: inAppEnabled ? 'pending' : 'skipped', attempts: 0 },
    { briefing_id: briefingId, profile_id: profileId, channel: 'telegram', status: telegramEnabled ? 'pending' : 'skipped', attempts: 0 },
  ];
  const { error: deliveryError } = await supabase.from('daily_cfo_deliveries').upsert(deliveries, { onConflict: 'briefing_id,channel', ignoreDuplicates: true });
  if (deliveryError) throw new Error(`No pude preparar las entregas diarias: ${deliveryError.message}`);

  let inAppSent = !inAppEnabled;
  if (inAppEnabled) {
    await appendVirafiaConversationMessage({
      supabase,
      profileId,
      role: 'assistant',
      content: message,
      channel: 'proactive',
      dailyBriefingId: briefingId,
      metadata: { source: 'daily_cfo_mentor' },
    });
    const { error } = await supabase.from('daily_cfo_deliveries').update({ status: 'sent', attempts: 1, sent_at: now, updated_at: now }).eq('briefing_id', briefingId).eq('channel', 'in_app');
    if (error) throw new Error(`No pude confirmar la entrega en Virafi: ${error.message}`);
    inAppSent = true;
  }

  let telegramSent = !telegramEnabled;
  if (telegramEnabled) {
    const chatId = await getAuthorizedTelegramChatId({ supabase, profileId });
    if (!chatId) {
      await supabase.from('daily_cfo_deliveries').update({ status: 'skipped', error_message: 'Telegram no está vinculado o autorizado.', updated_at: now }).eq('briefing_id', briefingId).eq('channel', 'telegram');
      telegramSent = true;
    } else {
      try {
        const providerMessageId = await sendTelegramMessage(chatId, message);
        await appendProactiveMessageToTelegramMemory({ supabase, profileId, chatId, content: message, dailyBriefingId: briefingId });
        await supabase.from('daily_cfo_deliveries').update({ status: 'sent', attempts: 1, provider_message_id: providerMessageId, sent_at: now, error_message: null, updated_at: now }).eq('briefing_id', briefingId).eq('channel', 'telegram');
        telegramSent = true;
      } catch (error) {
        await supabase.from('daily_cfo_deliveries').update({
          status: 'failed',
          attempts: 1,
          next_attempt_at: new Date(Date.now() + 15 * 60_000).toISOString(),
          error_message: error instanceof Error ? error.message.slice(0, 1000) : 'Error de Telegram.',
          updated_at: now,
        }).eq('briefing_id', briefingId).eq('channel', 'telegram');
      }
    }
  }

  return { inAppSent, telegramSent };
}

type DailyCfoClaim = {
  id: string;
  outcome: 'claimed' | 'already-completed' | 'in-progress';
  leaseToken: string | null;
};

async function claimDailyCfoBriefing({
  supabase,
  profileId,
  localDate,
  timezone,
  scheduledFor,
}: {
  supabase: SupabaseClient;
  profileId: string;
  localDate: string;
  timezone: string;
  scheduledFor: string;
}): Promise<DailyCfoClaim> {
  const { data, error } = await supabase.rpc('claim_daily_cfo_briefing', {
    p_profile_id: profileId,
    p_local_date: localDate,
    p_timezone: timezone,
    p_scheduled_for: scheduledFor,
    p_workflow_version: 1,
  });

  if (!error) {
    const row = (Array.isArray(data) ? data[0] : data) as {
      briefing_id?: unknown;
      outcome?: unknown;
      lease_token?: unknown;
    } | null;
    const outcome = String(row?.outcome || '');
    if (!row?.briefing_id || !['claimed', 'already-completed', 'in-progress'].includes(outcome)) {
      throw new Error('Supabase no devolvió un claim válido para el CFO diario.');
    }
    return {
      id: String(row.briefing_id),
      outcome: outcome as DailyCfoClaim['outcome'],
      leaseToken: row.lease_token ? String(row.lease_token) : null,
    };
  }

  if (!/claim_daily_cfo_briefing|schema cache|does not exist/i.test(error.message)) {
    throw new Error(`No pude reclamar el mensaje diario: ${error.message}`);
  }

  // Compatibility while the lease migration is being deployed.
  const fallback = await supabase
    .from('daily_cfo_briefings')
    .insert({
      profile_id: profileId,
      local_date: localDate,
      timezone,
      scheduled_for: scheduledFor,
      status: 'processing',
    })
    .select('id')
    .single();
  if (fallback.error?.code === '23505') {
    const { data: existing } = await supabase
      .from('daily_cfo_briefings')
      .select('id')
      .eq('profile_id', profileId)
      .eq('local_date', localDate)
      .maybeSingle();
    if (!existing?.id) {
      throw new Error('El briefing diario ya existe, pero no pude recuperar su identificador.');
    }
    return { id: String(existing.id), outcome: 'already-completed', leaseToken: null };
  }
  if (fallback.error || !fallback.data) {
    throw new Error(`No pude iniciar el mensaje diario: ${fallback.error?.message || 'sin identificador'}`);
  }
  return { id: String(fallback.data.id), outcome: 'claimed', leaseToken: null };
}

export async function runDailyCfoForProfile({
  supabase,
  profile,
  preference,
  now = new Date(),
  force = false,
}: {
  supabase: SupabaseClient;
  profile: ProfileRow;
  preference?: DailyCfoPreference | null;
  now?: Date;
  force?: boolean;
}) {
  const timezone = safeTimezone(preference?.timezone);
  const windowStart = preference?.delivery_window_start ?? DEFAULT_WINDOW_START;
  const windowEnd = preference?.delivery_window_end ?? DEFAULT_WINDOW_END;
  const due = isDailyCfoDue({ profileId: profile.id, now, timezone, windowStart, windowEnd });
  if (preference?.enabled === false) return { profileId: profile.id, skipped: 'disabled' };
  if (!isWeekdayInTimezone(now, timezone)) return { profileId: profile.id, skipped: 'weekend', timezone };
  if (!force && !due.due) return { profileId: profile.id, skipped: 'not-due', scheduledMinute: due.scheduledMinute };

  const claimed = await claimDailyCfoBriefing({
    supabase,
    profileId: profile.id,
    localDate: due.localDate,
    timezone,
    scheduledFor: now.toISOString(),
  });
  if (claimed.outcome !== 'claimed') {
    return { profileId: profile.id, skipped: claimed.outcome, briefingId: claimed.id };
  }

  try {
    const [snapshot, recentConversation] = await Promise.all([
      buildSnapshot({ supabase, profile, now, timezone }),
      readVirafiaConversation({ supabase, profileId: profile.id, limit: 12 }),
    ]);
    const actions = buildActions(snapshot);
    const message = await improveMessage({ snapshot, actions, recentConversation });
    const summary = actions[0]?.description || 'VirafIA revisó el contexto financiero y dejó el siguiente paso del día.';
    const briefing: GeneratedBriefing = { message, summary, actions };
    const generatedAt = new Date().toISOString();
    let readyQuery = supabase.from('daily_cfo_briefings').update({
      status: 'ready',
      message,
      summary,
      actions,
      goal_paces: snapshot.goalPaces,
      financial_snapshot: snapshot,
      generated_at: generatedAt,
      updated_at: generatedAt,
    }).eq('id', claimed.id);
    if (claimed.leaseToken) readyQuery = readyQuery.eq('claim_token', claimed.leaseToken);
    const { data: readyClaim, error: readyError } = await readyQuery.select('id').maybeSingle();
    if (readyError || !readyClaim) {
      throw new Error(`No pude guardar el análisis diario o el lease dejó de pertenecer a esta corrida: ${readyError?.message || 'claim perdido'}`);
    }

    await saveTasksAndFinding({ supabase, profileId: profile.id, briefingId: claimed.id, briefing, snapshot });
    const delivery = await deliverBriefing({
      supabase,
      profileId: profile.id,
      briefingId: claimed.id,
      message,
      inAppEnabled: preference?.in_app_enabled !== false,
      telegramEnabled: preference?.telegram_enabled !== false,
    });
    const completedAt = new Date().toISOString();
    const status = delivery.inAppSent && delivery.telegramSent ? 'sent' : 'partial';
    let completeQuery = supabase.from('daily_cfo_briefings').update({
      status,
      sent_at: completedAt,
      claim_token: null,
      lease_expires_at: null,
      updated_at: completedAt,
    }).eq('id', claimed.id);
    if (claimed.leaseToken) completeQuery = completeQuery.eq('claim_token', claimed.leaseToken);
    await completeQuery;
    return { profileId: profile.id, briefingId: claimed.id, status, message, actions };
  } catch (error) {
    const failedAt = new Date().toISOString();
    let failedQuery = supabase.from('daily_cfo_briefings').update({
      status: 'failed',
      error_message: error instanceof Error ? error.message.slice(0, 1500) : 'Error desconocido.',
      claim_token: null,
      lease_expires_at: null,
      updated_at: failedAt,
    }).eq('id', claimed.id);
    if (claimed.leaseToken) failedQuery = failedQuery.eq('claim_token', claimed.leaseToken);
    await failedQuery;
    throw error;
  }
}

export async function retryDailyCfoTelegramDeliveries(supabase: SupabaseClient, now = new Date()) {
  const staleSendingBefore = new Date(now.getTime() - 10 * 60_000).toISOString();
  await supabase
    .from('daily_cfo_deliveries')
    .update({ status: 'failed', next_attempt_at: now.toISOString(), error_message: 'Entrega interrumpida; se reintentará.', updated_at: now.toISOString() })
    .eq('channel', 'telegram')
    .eq('status', 'sending')
    .lt('updated_at', staleSendingBefore);
  const { data: deliveries, error } = await supabase
    .from('daily_cfo_deliveries')
    .select('id, briefing_id, profile_id, attempts')
    .eq('channel', 'telegram')
    .eq('status', 'failed')
    .lte('next_attempt_at', now.toISOString())
    .lt('attempts', 3)
    .order('next_attempt_at', { ascending: true })
    .limit(10);
  if (error && /does not exist|schema cache/i.test(error.message)) return [];
  if (error) throw new Error(`No pude revisar reintentos de Telegram: ${error.message}`);

  const profileIds = [...new Set((deliveries || []).map((delivery) => String(delivery.profile_id)))];
  const { data: preferenceRows } = profileIds.length
    ? await supabase.from('daily_cfo_preferences').select('profile_id, timezone').in('profile_id', profileIds)
    : { data: [] };
  const timezones = new Map((preferenceRows || []).map((row) => [String(row.profile_id), safeTimezone(row.timezone)]));

  const results = [];
  for (const delivery of deliveries || []) {
    const timezone = timezones.get(String(delivery.profile_id)) || DEFAULT_TIMEZONE;
    if (!isWeekdayInTimezone(now, timezone)) {
      results.push({ id: delivery.id, sent: false, skipped: 'weekend' });
      continue;
    }
    const { data: claimed } = await supabase
      .from('daily_cfo_deliveries')
      .update({ status: 'sending', updated_at: now.toISOString() })
      .eq('id', delivery.id)
      .eq('status', 'failed')
      .eq('attempts', delivery.attempts)
      .select('id')
      .maybeSingle();
    if (!claimed) continue;
    const { data: briefing } = await supabase.from('daily_cfo_briefings').select('message').eq('id', delivery.briefing_id).maybeSingle();
    const chatId = await getAuthorizedTelegramChatId({ supabase, profileId: delivery.profile_id });
    if (!briefing?.message || !chatId) {
      await supabase.from('daily_cfo_deliveries').update({ status: 'skipped', error_message: 'No hay mensaje o Telegram autorizado.', updated_at: now.toISOString() }).eq('id', delivery.id);
      continue;
    }
    try {
      const providerMessageId = await sendTelegramMessage(chatId, briefing.message);
      await appendProactiveMessageToTelegramMemory({ supabase, profileId: delivery.profile_id, chatId, content: briefing.message, dailyBriefingId: delivery.briefing_id });
      await supabase.from('daily_cfo_deliveries').update({ status: 'sent', attempts: delivery.attempts + 1, provider_message_id: providerMessageId, sent_at: now.toISOString(), error_message: null, next_attempt_at: null, updated_at: now.toISOString() }).eq('id', delivery.id);
      await supabase.from('daily_cfo_briefings').update({ status: 'sent', sent_at: now.toISOString(), updated_at: now.toISOString() }).eq('id', delivery.briefing_id);
      results.push({ id: delivery.id, sent: true });
    } catch (retryError) {
      const attempts = delivery.attempts + 1;
      await supabase.from('daily_cfo_deliveries').update({
        status: attempts >= 3 ? 'failed' : 'failed',
        attempts,
        next_attempt_at: attempts >= 3 ? null : new Date(now.getTime() + attempts * 30 * 60_000).toISOString(),
        error_message: retryError instanceof Error ? retryError.message.slice(0, 1000) : 'Error de Telegram.',
        updated_at: now.toISOString(),
      }).eq('id', delivery.id);
      results.push({ id: delivery.id, sent: false });
    }
  }
  return results;
}

export async function runDailyCfoScheduler({
  supabase,
  profiles,
  now = new Date(),
  force = false,
}: {
  supabase: SupabaseClient;
  profiles: ProfileRow[];
  now?: Date;
  force?: boolean;
}) {
  const profileIds = profiles.map((profile) => profile.id);
  const { data: preferenceRows, error: preferenceError } = profileIds.length
    ? await supabase.from('daily_cfo_preferences').select('*').in('profile_id', profileIds)
    : { data: [], error: null };
  if (preferenceError && !/does not exist|schema cache/i.test(preferenceError.message)) {
    throw new Error(`No pude leer preferencias del CFO diario: ${preferenceError.message}`);
  }
  const byProfile = new Map((preferenceRows || []).map((row) => [String(row.profile_id), row as DailyCfoPreference]));
  const results: unknown[] = [];

  for (let index = 0; index < profiles.length; index += 3) {
    const group = profiles.slice(index, index + 3);
    const settled = await Promise.allSettled(group.map((profile) => runDailyCfoForProfile({
      supabase,
      profile,
      preference: byProfile.get(profile.id),
      now,
      force,
    })));
    results.push(...settled.map((result, offset) => result.status === 'fulfilled'
      ? result.value
      : { profileId: group[offset]?.id, error: result.reason instanceof Error ? result.reason.message : 'Error desconocido.' }));
  }
  const retries = await retryDailyCfoTelegramDeliveries(supabase, now);
  return { results, retries };
}
