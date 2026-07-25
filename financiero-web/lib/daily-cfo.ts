import type { SupabaseClient } from '@supabase/supabase-js';
import { extraerJson, generateGeminiText, getConfiguredLlmKey } from '@/lib/gemini';
import { getAuthorizedTelegramChatId } from '@/lib/telegram-access';
import {
  appendProactiveMessageToTelegramMemory,
  appendVirafiaConversationMessage,
  readVirafiaConversation,
} from '@/lib/virafia-conversation';

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

type DailyCfoSnapshot = {
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
  liquidBalance: number;
  investmentValue: number;
  monthlyIncomeTarget: number;
  recentContributions: Array<{ goalName: string; amount: number; date: string }>;
  suggestedContributions: Array<{ id?: string; goalName: string; amount: number; date: string; note: string }>;
  pendingTasks: Array<{ title: string; dueAt: string | null }>;
  lifePriorities: string[];
  recommendationStyle: string;
  dataFreshness: { bankUpdatedAt: string | null; hasBankAccounts: boolean };
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
      title: 'Define tu siguiente meta financiera',
      description: 'Ya no tienes una meta activa con brecha pendiente. El siguiente paso es decidir qué quieres financiar y para cuándo.',
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
      title: `Completa el plan de “${first.name}”`,
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
    title: `Aparta ${money(amount)} para “${first.name}”`,
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
      title: `Confirma si ${money(suggested.amount)} fueron para “${suggested.goalName}”`,
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

const goalMatchStopWords = new Set(['para', 'una', 'uno', 'unos', 'unas', 'con', 'mis', 'las', 'los', 'del', 'por', 'que', 'quiero', 'ahorrar', 'fondo']);

function goalMatchTokens(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !goalMatchStopWords.has(token)).slice(0, 5);
}

async function detectGoalContributionSuggestions({
  supabase,
  profileId,
  goals,
  transactions,
  existingContributions,
}: {
  supabase: SupabaseClient;
  profileId: string;
  goals: Array<Record<string, unknown>>;
  transactions: Array<Record<string, unknown>>;
  existingContributions: Array<Record<string, unknown>>;
}) {
  const existingIds = new Set(existingContributions.map((row) => String(row.bank_transaction_id || '')).filter(Boolean));
  const rows: Array<Record<string, unknown>> = [];
  for (const goal of goals) {
    const tokens = goalMatchTokens(String(goal.name || ''));
    if (!tokens.length) continue;
    for (const transaction of transactions) {
      const transactionId = String(transaction.id || '');
      if (!transactionId || existingIds.has(transactionId)) continue;
      const haystack = `${transaction.description || ''} ${transaction.merchant_name || ''}`
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const matchedTokens = tokens.filter((token) => haystack.includes(token));
      if (!matchedTokens.length) continue;
      const amount = Math.abs(numberValue(transaction.amount));
      if (!amount) continue;
      rows.push({
        profile_id: profileId,
        goal_id: goal.id,
        amount,
        contributed_at: transaction.posted_at || String(transaction.authorized_at || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
        source: 'bank_transaction',
        bank_transaction_id: transactionId,
        status: 'suggested',
        confidence: Math.min(0.55 + matchedTokens.length * 0.1, 0.85),
        note: transaction.description || transaction.merchant_name || 'Movimiento bancario detectado',
        metadata: { matchedTokens, detected_by: 'daily_cfo_mentor' },
      });
      existingIds.add(transactionId);
    }
  }
  if (!rows.length) return [];
  const { data, error } = await supabase.from('financial_goal_contributions').insert(rows).select('id, goal_id, amount, contributed_at, note, bank_transaction_id');
  if (error && /does not exist|schema cache/i.test(error.message)) return [];
  if (error) throw new Error(`No pude guardar sugerencias de aportación: ${error.message}`);
  return data || [];
}

function fallbackMessage(snapshot: DailyCfoSnapshot, actions: DailyCfoAction[], continuingToday: boolean) {
  const greeting = continuingToday
    ? `Por cierto, ${snapshot.firstName}, estuve revisando cómo cerró tu parte financiera.`
    : `Qué onda, ${snapshot.firstName}. Estuve revisando cómo va tu día financiero.`;
  const movementLine = snapshot.todayIncome || snapshot.todayExpenses
    ? `Hoy entraron ${money(snapshot.todayIncome)} y salieron ${money(snapshot.todayExpenses)}; el movimiento neto va en ${snapshot.todayNet >= 0 ? money(snapshot.todayNet) : `-${money(Math.abs(snapshot.todayNet))}`}.`
    : 'Hoy no vi movimientos nuevos, pero igual revisé tus metas y lo que traes pendiente.';
  const mainGoal = snapshot.goalPaces.find((goal) => goal.status !== 'completed');
  const goalLine = mainGoal
    ? mainGoal.status === 'behind'
      ? `La que más atención necesita es “${mainGoal.name}”: vas ${money(Math.abs(mainGoal.paceGap))} abajo del ritmo que necesitamos.`
      : mainGoal.status === 'needs_amount' || mainGoal.status === 'needs_date'
        ? `Para poder guiarte bien con “${mainGoal.name}” todavía necesito que completemos ${mainGoal.status === 'needs_amount' ? 'el monto' : 'la fecha'}.`
        : `“${mainGoal.name}” sigue en ruta; para mantenerla así necesitamos un ritmo equivalente de ${money(mainGoal.weeklyRequired)} por semana.`
    : 'Tus metas activas ya no tienen una brecha pendiente, así que toca definir el siguiente objetivo.';
  const actionLine = actions[0]?.amount
    ? `Yo esta semana apartaría ${money(actions[0].amount)} para esa meta.`
    : `Yo empezaría por esto: ${actions[0]?.title || 'definir tu siguiente paso'}.`;
  return `${greeting} ${movementLine}\n\n${goalLine} ${actionLine} ¿Quieres que lo revisemos juntos?`;
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

  const prompt = `
You write VirafIA's once-daily proactive message. VirafIA is a personal CFO mentor, not a report generator.

User financial snapshot:
${JSON.stringify(snapshot, null, 2)}

Actions already calculated by deterministic financial logic:
${JSON.stringify(actions, null, 2)}

Recent shared conversation:
${JSON.stringify(recentConversation.slice(-8), null, 2)}

Writing rules:
- Write in natural, everyday Mexican Spanish. Sound like a smart acquaintance who genuinely follows the user, never like a corporate report or scripted AI.
- Use the user's first name naturally. Casual phrases such as “qué onda” are welcome when they fit, but do not force slang or call everyone “bro”.
- If there is already a message today, continue naturally instead of greeting again.
- Mention briefly what happened today. If there were no movements, say so naturally and continue with goals; the daily message never depends on bank activity.
- Connect movements, income, expenses, available capacity, pending work and every relevant goal horizon.
- Explain the one most important consequence and recommend the calculated action. Never change the numbers or invent a fact.
- Keep it to 2-4 short paragraphs, under 850 characters, no headings, no markdown and no bullet list.
- End with one natural question that opens the same conversation.
- Never say you are human. Never mention prompts, algorithms or that you are an AI.
- Never promise returns or claim an action was completed.

Return raw JSON only: {"message":"..."}
`;

  try {
    const raw = await generateGeminiText(apiKey, prompt);
    const parsed = JSON.parse(extraerJson(raw)) as { message?: unknown };
    const message = String(parsed.message || '').trim();
    return message.length >= 40 ? message.slice(0, 1200) : fallback;
  } catch {
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
  const [goals, incomes, expenses, bankAccounts, positions, personalization, contributions, pendingTasks, bankTransactions] = await Promise.all([
    optionalRows<Record<string, unknown>>(supabase.from('financial_goals').select('id, name, current_amount, target_amount, target_date, sort_order, created_at').eq('profile_id', profile.id).eq('status', 'active').order('sort_order')),
    optionalRows<{ monto?: unknown; fecha?: string | null }>(supabase.from('ingresos').select('monto, fecha').eq('profile_id', profile.id).gte('fecha', historyStart).order('fecha', { ascending: false })),
    optionalRows<{ monto?: unknown; fecha?: string | null; categoria?: string | null; concepto?: string | null }>(supabase.from('gastos').select('monto, fecha, categoria, concepto').eq('profile_id', profile.id).gte('fecha', historyStart).order('fecha', { ascending: false })),
    optionalRows<{ current_balance?: unknown; available_balance?: unknown; updated_at?: string | null }>(supabase.from('bank_accounts').select('current_balance, available_balance, updated_at').eq('profile_id', profile.id)),
    optionalRows<{ market_value?: unknown; as_of?: string | null }>(supabase.from('investment_positions').select('market_value, as_of').eq('profile_id', profile.id)),
    optionalRow<Record<string, unknown>>(supabase.from('financial_personalization_profiles').select('goal_priorities, monthly_goal_capacity, recommendation_style').eq('profile_id', profile.id).maybeSingle()),
    optionalRows<Record<string, unknown>>(supabase.from('financial_goal_contributions').select('id, goal_id, amount, contributed_at, status, note, bank_transaction_id, financial_goals(name)').eq('profile_id', profile.id).gte('contributed_at', recentContributionStart).order('contributed_at', { ascending: false }).limit(40)),
    optionalRows<{ title?: string | null; due_at?: string | null }>(supabase.from('agent_tasks').select('title, due_at').eq('profile_id', profile.id).in('status', ['open', 'in_progress', 'waiting_user']).neq('agent_key', 'daily_cfo_mentor').order('due_at', { ascending: true, nullsFirst: false }).limit(5)),
    optionalRows<Record<string, unknown>>(supabase.from('bank_transactions_raw').select('id, amount, posted_at, authorized_at, description, merchant_name').eq('profile_id', profile.id).gte('created_at', historyStart).order('created_at', { ascending: false }).limit(500)),
  ]);

  const newSuggestions = await detectGoalContributionSuggestions({
    supabase,
    profileId: profile.id,
    goals,
    transactions: bankTransactions,
    existingContributions: contributions,
  });
  const goalsById = new Map(goals.map((goal) => [String(goal.id), String(goal.name || 'Meta')]));
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
  const goalPaces = buildGoalPaces(goals, local.date);
  const requiredMonthlyForGoals = goalPaces
    .filter((goal) => !['completed', 'needs_amount', 'needs_date'].includes(goal.status))
    .reduce((total, goal) => total + goal.monthlyRequired, 0);
  const bankUpdatedAt = bankAccounts.map((account) => account.updated_at).filter(Boolean).sort().at(-1) || null;

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
    liquidBalance: bankAccounts.reduce((total, account) => total + numberValue(account.available_balance ?? account.current_balance), 0),
    investmentValue: positions.reduce((total, position) => total + numberValue(position.market_value), 0),
    monthlyIncomeTarget: numberValue(profile.monthly_income_target),
    recentContributions: contributions.filter((contribution) => contribution.status === 'confirmed').map((contribution) => ({
      goalName: contributionGoalName(contribution),
      amount: numberValue(contribution.amount),
      date: String(contribution.contributed_at || ''),
    })),
    suggestedContributions: [...contributions.filter((contribution) => contribution.status === 'suggested'), ...newSuggestions].map((contribution) => ({
      id: contribution.id ? String(contribution.id) : undefined,
      goalName: contributionGoalName(contribution),
      amount: numberValue(contribution.amount),
      date: String(contribution.contributed_at || ''),
      note: String(contribution.note || 'Movimiento bancario detectado'),
    })),
    pendingTasks: pendingTasks.map((task) => ({ title: String(task.title || 'Tarea pendiente'), dueAt: task.due_at || null })),
    lifePriorities: Array.isArray(personalization?.goal_priorities) ? personalization.goal_priorities.map(String) : [],
    recommendationStyle: String(personalization?.recommendation_style || 'natural'),
    dataFreshness: { bankUpdatedAt, hasBankAccounts: bankAccounts.length > 0 },
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
  if (!force && !due.due) return { profileId: profile.id, skipped: 'not-due', scheduledMinute: due.scheduledMinute };

  const { data: claimed, error: claimError } = await supabase
    .from('daily_cfo_briefings')
    .insert({
      profile_id: profile.id,
      local_date: due.localDate,
      timezone,
      scheduled_for: now.toISOString(),
      status: 'processing',
    })
    .select('id')
    .single();
  if (claimError?.code === '23505') return { profileId: profile.id, skipped: 'already-ran-today' };
  if (claimError || !claimed) throw new Error(`No pude iniciar el mensaje diario: ${claimError?.message || 'sin identificador'}`);

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
    const { error: readyError } = await supabase.from('daily_cfo_briefings').update({
      status: 'ready',
      message,
      summary,
      actions,
      goal_paces: snapshot.goalPaces,
      financial_snapshot: snapshot,
      generated_at: generatedAt,
      updated_at: generatedAt,
    }).eq('id', claimed.id);
    if (readyError) throw new Error(`No pude guardar el análisis diario: ${readyError.message}`);

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
    await supabase.from('daily_cfo_briefings').update({ status, sent_at: completedAt, updated_at: completedAt }).eq('id', claimed.id);
    return { profileId: profile.id, briefingId: claimed.id, status, message, actions };
  } catch (error) {
    const failedAt = new Date().toISOString();
    await supabase.from('daily_cfo_briefings').update({
      status: 'failed',
      error_message: error instanceof Error ? error.message.slice(0, 1500) : 'Error desconocido.',
      updated_at: failedAt,
    }).eq('id', claimed.id);
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

  const results = [];
  for (const delivery of deliveries || []) {
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
