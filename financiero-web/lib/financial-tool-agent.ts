import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { stepCountIs, tool, ToolLoopAgent } from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { MensajeMemoria } from '@/lib/conversation-agent';
import { getAiModels, getAiOutputLimit } from '@/lib/ai-policy';
import { recordAiUsage } from '@/lib/ai-usage';

type AgentRunInput = {
  text: string;
  memory: MensajeMemoria[];
  supabase: SupabaseClient;
  profileId: string;
};

const categorySchema = z.enum(['Vida', 'Placeres', 'Futuro']);
const periodSchema = z.object({
  start: z.string().describe('Inclusive ISO date/time, e.g. 2026-01-01T00:00:00.000Z'),
  end: z.string().describe('Exclusive ISO date/time, e.g. 2026-08-01T00:00:00.000Z'),
  label: z.string().describe('Human-readable Spanish period label'),
});

function numberValue(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getAgentModel() {
  return getAiModels('financial-agent', 'openrouter')[0];
}

function compactQueryResult<T>(result: { data: T | null; error: { message: string } | null }) {
  return result.error ? { available: false, error: result.error.message } : { available: true, data: result.data };
}

export async function runFinancialToolAgent({ text, memory, supabase, profileId }: AgentRunInput) {
  const apiKey = process.env.OPENROUTER_API_KEY || '';
  if (!apiKey) throw new Error('OPENROUTER_API_KEY no está configurada.');

  const openrouter = createOpenRouter({
    apiKey,
    headers: {
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://dashboard-financiero-chi.vercel.app',
      'X-OpenRouter-Title': 'Virafi Agent',
    },
  });

  const tools = {
    getFinancialOverview: tool({
      description: 'Get exact income, expenses, net flow and bucket totals for a requested period. Use this before answering totals, trends, annual/monthly comparisons or how the user is doing.',
      inputSchema: periodSchema,
      execute: async ({ start, end, label }) => {
        const [incomeResult, expenseResult] = await Promise.all([
          supabase.from('ingresos').select('monto, concepto, fecha').eq('profile_id', profileId).gte('fecha', start).lt('fecha', end),
          supabase.from('gastos').select('monto, concepto, categoria, subcategoria, fecha, origen').eq('profile_id', profileId).gte('fecha', start).lt('fecha', end),
        ]);
        if (incomeResult.error) throw new Error(incomeResult.error.message);
        if (expenseResult.error) throw new Error(expenseResult.error.message);
        const incomes = incomeResult.data || [];
        const expenses = expenseResult.data || [];
        const income = incomes.reduce((sum, row) => sum + numberValue(row.monto), 0);
        const expense = expenses.reduce((sum, row) => sum + numberValue(row.monto), 0);
        const buckets = expenses.reduce<Record<string, number>>((acc, row) => {
          const bucket = row.categoria === 'Seguros' ? 'Futuro' : String(row.categoria || 'Sin categoría');
          acc[bucket] = (acc[bucket] || 0) + numberValue(row.monto);
          return acc;
        }, {});
        return { label, income, expense, netFlow: income - expense, buckets, incomeCount: incomes.length, expenseCount: expenses.length };
      },
    }),
    getMovements: tool({
      description: 'Get exact movements and totals for a period, optionally filtered by Vida, Placeres or Futuro. Use it to explain where a number comes from and never infer movements from prior prose.',
      inputSchema: periodSchema.extend({ category: categorySchema.optional(), limit: z.number().int().min(1).max(50).default(15) }),
      execute: async ({ start, end, label, category, limit }) => {
        let query = supabase.from('gastos').select('id, monto, concepto, categoria, subcategoria, fecha, origen').eq('profile_id', profileId).gte('fecha', start).lt('fecha', end).order('fecha', { ascending: false }).limit(limit);
        if (category) query = category === 'Futuro' ? query.in('categoria', ['Futuro', 'Seguros']) : query.eq('categoria', category);
        const { data, error } = await query;
        if (error) throw new Error(error.message);
        const rows = data || [];
        return { label, category: category || 'Todas', total: rows.reduce((sum, row) => sum + numberValue(row.monto), 0), count: rows.length, movements: rows };
      },
    }),
    getGoalsAndProfile: tool({
      description: 'Get the monthly income target, saved financial goals, accumulated amounts and investment risk profile. Use for goal progress, investment planning and personalized next actions.',
      inputSchema: z.object({}),
      execute: async () => {
        const [profileResult, goalsResult, riskResult] = await Promise.all([
          supabase.from('profiles').select('full_name, professional_headline, location, bio, financial_why, monthly_income_target').eq('id', profileId).maybeSingle(),
          supabase.from('fondos_acumulados').select('*').eq('profile_id', profileId),
          supabase.from('advisor_disclosures').select('metadata, accepted_at').eq('profile_id', profileId).eq('disclosure_type', 'risk_profile').order('accepted_at', { ascending: false }).limit(1).maybeSingle(),
        ]);
        if (profileResult.error) throw new Error(profileResult.error.message);
        if (goalsResult.error) throw new Error(goalsResult.error.message);
        return { profile: profileResult.data, goals: goalsResult.data || [], riskProfile: riskResult.data?.metadata || null };
      },
    }),
    getConnectedAccounts: tool({
      description: 'Get bank and investment connection status plus visible balances without exposing credentials. Use for connected-account status, visible net worth and balance-source questions.',
      inputSchema: z.object({}),
      execute: async () => {
        const [bankResult, accountResult, investmentResult] = await Promise.all([
          supabase.from('bank_connections').select('provider, institution_name, status, last_sync_at').eq('profile_id', profileId),
          supabase.from('bank_accounts').select('name, official_name, type, subtype, currency, current_balance, available_balance, updated_at').eq('profile_id', profileId),
          supabase.from('investment_accounts').select('provider, account_name, account_type, mode, status, base_currency').eq('profile_id', profileId),
        ]);
        if (bankResult.error) throw new Error(bankResult.error.message);
        if (accountResult.error) throw new Error(accountResult.error.message);
        return {
          bankConnections: bankResult.data || [],
          bankAccounts: accountResult.data || [],
          visibleBankBalance: (accountResult.data || []).reduce((sum, account) => sum + numberValue(account.current_balance), 0),
          investmentAccounts: investmentResult.data || [],
          balanceScope: 'The visible bank balance only includes connected bank accounts. It excludes cash, unconnected accounts and investment value unless a separate tool provides it.',
        };
      },
    }),
    getPlanningWorkspace: tool({
      description: 'Get the complete planning and personalization workspace: monthly target, interview answers, accumulated funds and explicit financial goals. Use for goals, plans, recommendations and configuration questions.',
      inputSchema: z.object({}),
      execute: async () => {
        const [profileResult, personalizationResult, fundsResult, goalsResult] = await Promise.all([
          supabase.from('profiles').select('full_name, professional_headline, location, bio, financial_why, monthly_income_target').eq('id', profileId).maybeSingle(),
          supabase.from('financial_personalization_profiles').select('birth_year, occupation, industry, work_model, income_sources, income_growth_goal, short_term_goals, medium_term_goals, long_term_goals, goal_priorities, monthly_goal_capacity, financial_concerns, valued_pleasures, pleasures_to_reduce, recurring_life_costs, recurring_investments, emergency_fund_status, investment_experience, risk_tolerance, recommendation_style, interview_completed_at').eq('profile_id', profileId).maybeSingle(),
          supabase.from('fondos_acumulados').select('*').eq('profile_id', profileId),
          supabase.from('financial_goals').select('name, current_amount, target_amount, target_date, horizon_months, source, status, sort_order').eq('profile_id', profileId).order('sort_order'),
        ]);
        if (profileResult.error) throw new Error(profileResult.error.message);
        return {
          profile: profileResult.data,
          personalization: compactQueryResult(personalizationResult),
          accumulatedFunds: compactQueryResult(fundsResult),
          financialGoals: compactQueryResult(goalsResult),
        };
      },
    }),
    getBudgetsAndCardPayments: tool({
      description: 'Get monthly 33/33/33 budget ceilings and credit-card payments for a requested period. Use for budget availability, category limits, payment history and card cash-flow questions.',
      inputSchema: periodSchema,
      execute: async ({ start, end, label }) => {
        const startMonth = start.slice(0, 7);
        const endMonth = end.slice(0, 7);
        const [budgets, cardPayments] = await Promise.all([
          supabase.from('presupuestos_mensuales').select('mes_anio, techo_vida, techo_placeres, techo_futuro, fase_ahorro').eq('profile_id', profileId).gte('mes_anio', `${startMonth}-01`).lt('mes_anio', `${endMonth}-01`).order('mes_anio'),
          supabase.from('abonos_tarjeta_credito').select('concepto, monto, tarjeta, origen, fecha').eq('profile_id', profileId).gte('fecha', start).lt('fecha', end).order('fecha', { ascending: false }).limit(50),
        ]);
        return { label, budgets: compactQueryResult(budgets), creditCardPayments: compactQueryResult(cardPayments) };
      },
    }),
    getAgentWorkspace: tool({
      description: 'Get open automated tasks and active findings already generated for this profile. Use when the user asks about pending actions, alerts or recommendations in Virafi.',
      inputSchema: z.object({}),
      execute: async () => {
        const [tasks, findings] = await Promise.all([
          supabase.from('agent_tasks').select('agent_key, title, description, status, priority, due_at, source, created_at').eq('profile_id', profileId).in('status', ['open', 'in_progress', 'waiting_user']).order('created_at', { ascending: false }).limit(20),
          supabase.from('agent_findings').select('agent_key, finding_type, severity, title, summary, recommendation, confidence, status, created_at').eq('profile_id', profileId).eq('status', 'active').order('created_at', { ascending: false }).limit(20),
        ]);
        return { tasks: compactQueryResult(tasks), findings: compactQueryResult(findings) };
      },
    }),
  };

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const agent = new ToolLoopAgent({
    model: openrouter.chat(getAgentModel()),
    maxOutputTokens: getAiOutputLimit('financial-agent'),
    stopWhen: stepCountIs(8),
    tools,
    instructions: `You are the real financial operating agent for Virafi.
Current date: ${now.toISOString()}. Current year: ${currentYear}. Current month index: ${currentMonth}.
Respond in natural Mexican Spanish, directly and intelligently.
For every factual financial answer, call at least one tool. Never reuse a number from chat memory as evidence.
You may call multiple tools, inspect results, and call another tool if the first result is incomplete or inconsistent.
You can inspect the full read-only Virafi workspace for this authenticated profile: movements, income, connected bank balances, planning, personalization, goals, investment context, tasks and findings. Never imply access to data outside these profile-scoped tools.
For "anual", "anualmente" or "este año", use January 1 through the first day of next month (year-to-date), unless the user names another year.
Futuro includes persisted categories Futuro and Seguros.
The profile field monthly_income_target is the user's monthly income goal. The risk-profile field monthlyContribution is only the planned monthly investment contribution. Never confuse those two numbers.
The identity profile fields bio, professional_headline, location and financial_why are context for prioritization and explanation. Never turn them into invented amounts or goals; explicit saved financial data remains the source of truth.
The personalization field goal_priorities contains life values, not fundable goals. Use those values to explain why an explicit financial goal matters and to propose concrete supporting actions, but never assign money or a deadline directly to a value such as faith, family, health or work.
Money allocated to Futuro is capital allocation or spending, not earned income and not automatic progress toward the monthly income goal. Explain that distinction whenever the user connects Futuro with the income goal.
Explain the conclusion first, then the evidence, then one useful next action when relevant.
Do not invent returns, balances, movements, connections or goals.
Do not perform writes, deletes, reclassifications, transfers or trades. Those actions remain behind deterministic confirmation controls.
Plain text only. Be concise unless the user asks for detail.`,
  });

  const recentMemory = memory.slice(-10).map((message) => `${message.role === 'assistant' ? 'Asistente' : 'Usuario'}: ${message.content}`).join('\n');
  const prompt = `${recentMemory ? `Conversación reciente:\n${recentMemory}\n\n` : ''}Mensaje actual del usuario:\n${text}`;
  const startedAt = Date.now();
  const result = await agent.generate({ prompt });
  recordAiUsage({
    feature: 'financial-agent',
    provider: 'openrouter',
    model: getAgentModel(),
    inputTokens: result.totalUsage.inputTokens,
    outputTokens: result.totalUsage.outputTokens,
    totalTokens: result.totalUsage.totalTokens,
    latencyMs: Date.now() - startedAt,
    success: true,
  });
  return { text: result.text.trim(), model: getAgentModel(), steps: result.steps.length };
}
