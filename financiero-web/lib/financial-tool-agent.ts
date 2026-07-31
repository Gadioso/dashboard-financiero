import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { stepCountIs, tool, ToolLoopAgent } from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { MensajeMemoria } from '@/lib/conversation-agent';
import { getAiOutputLimit } from '@/lib/ai-policy';
import { recordAiUsage } from '@/lib/ai-usage';
import { getGeminiModelName } from '@/lib/gemini';
import { VIRAFIA_CONVERSATION_PRINCIPLES } from '@/lib/virafia-conversation-principles';
import { buildGoalCfoPlan } from '@/lib/goal-cfo-plan';
import { isConcreteFinancialGoal } from '@/lib/personalized-goals';

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
  return getGeminiModelName('financial-agent');
}

function compactQueryResult<T>(result: { data: T | null; error: { message: string } | null }) {
  return result.error ? { available: false, error: result.error.message } : { available: true, data: result.data };
}

export async function runFinancialToolAgent({ text, memory, supabase, profileId }: AgentRunInput) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  if (!apiKey) throw new Error('GEMINI_API_KEY no está configurada.');

  const google = createGoogleGenerativeAI({ apiKey });

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
      description: 'Get investment connection status. Virafi does not connect bank accounts or expose real-time bank balances.',
      inputSchema: z.object({}),
      execute: async () => {
        const investmentResult = await supabase
          .from('investment_accounts')
          .select('provider, account_name, account_type, mode, status, base_currency')
          .eq('profile_id', profileId);
        if (investmentResult.error) throw new Error(investmentResult.error.message);
        return {
          investmentAccounts: investmentResult.data || [],
          balanceScope: 'Virafi uses user-entered movements and does not have access to real-time bank balances.',
        };
      },
    }),
    getInvestmentResearch: tool({
      description: 'Get the profile-scoped investment research, allowed risk settings and latest available market snapshots. Use before naming any cryptocurrency, fund, ETF, stock or other instrument. Results are a research watchlist, never an automatic buy instruction.',
      inputSchema: z.object({}),
      execute: async () => {
        const [riskResult, thesesResult, snapshotsResult] = await Promise.all([
          supabase.from('advisor_disclosures').select('metadata, accepted_at').eq('profile_id', profileId).eq('disclosure_type', 'risk_profile').order('accepted_at', { ascending: false }).limit(1).maybeSingle(),
          supabase.from('investment_theses').select('asset_id, title, summary, stance, horizon, confidence, evidence, invalidation_rules, updated_at').eq('profile_id', profileId).eq('status', 'active').order('updated_at', { ascending: false }).limit(12),
          supabase.from('market_data_snapshots').select('asset_id, provider, captured_at, price, spread_bps, volume_24h').order('captured_at', { ascending: false }).limit(30),
        ]);
        const assetIds = [...new Set([
          ...(thesesResult.data || []).map((row) => row.asset_id),
          ...(snapshotsResult.data || []).map((row) => row.asset_id),
        ].filter(Boolean))] as string[];
        const assetsResult = assetIds.length
          ? await supabase.from('market_assets').select('id, asset_type, symbol, name, exchange, currency, provider').in('id', assetIds)
          : { data: [], error: null };
        return {
          riskProfile: compactQueryResult(riskResult),
          theses: compactQueryResult(thesesResult),
          snapshots: compactQueryResult(snapshotsResult),
          assets: compactQueryResult(assetsResult),
          boundary: 'Only discuss instruments supported by current research and allowed by the saved risk profile. Require explicit confirmation and an execution provider for any real order.',
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
    getCfoGoalPlan: tool({
      description: 'Build the explainable CFO allocation for the user: emergency reserve, each real goal, long-term investing, goal milestones, unsupported legacy amounts and the next discovery question. Use whenever the user asks how to achieve, fund, prioritize or break down goals.',
      inputSchema: z.object({}),
      execute: async () => {
        const [personalizationResult, goalsResult, disclosureResult] = await Promise.all([
          supabase.from('financial_personalization_profiles').select('monthly_goal_capacity, emergency_fund_status, investment_experience, risk_tolerance, work_model, goal_priorities').eq('profile_id', profileId).maybeSingle(),
          supabase.from('financial_goals').select('id, name, current_amount, target_amount, target_date, horizon_months, source').eq('profile_id', profileId).eq('status', 'active').order('sort_order'),
          supabase.from('advisor_disclosures').select('metadata').eq('profile_id', profileId).eq('disclosure_type', 'personalized_advice').eq('version', 'financial-goals-v1').maybeSingle(),
        ]);
        if (personalizationResult.error) throw new Error(personalizationResult.error.message);
        if (goalsResult.error) throw new Error(goalsResult.error.message);
        const metadata = disclosureResult.data?.metadata as { generatedGoalIds?: Array<string | number> } | null;
        return buildGoalCfoPlan({
          personalization: personalizationResult.data || {},
          goals: (goalsResult.data || []).filter((goal) => isConcreteFinancialGoal(goal.name)),
          legacyGeneratedGoalIds: metadata?.generatedGoalIds,
        });
      },
    }),
    getBudgetsAndCardPayments: tool({
      description: 'Get monthly 50/25/25 budget ceilings (50% Vida, 25% Placeres, 25% Futuro) and credit-card payments for a requested period. Within Futuro, 10% is reserved for emergencies and 15% for goal-directed investments. Use for budget availability, category limits, payment history and card cash-flow questions.',
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
    getDailyCfoContext: tool({
      description: 'Get the latest proactive CFO message with its exact deterministic actions, goal pacing and financial snapshot. Use this for follow-ups such as "¿qué hago para eso?", "¿cómo lo aparto?", "¿de dónde salió esa cantidad?" or references to what VirafIA said today.',
      inputSchema: z.object({}),
      execute: async () => {
        const [briefingResult, contributionsResult] = await Promise.all([
          supabase
            .from('daily_cfo_briefings')
            .select('local_date, message, summary, actions, goal_paces, financial_snapshot, status, generated_at, sent_at')
            .eq('profile_id', profileId)
            .in('status', ['ready', 'sent', 'partial'])
            .order('local_date', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('financial_goal_contributions')
            .select('amount, contributed_at, source, status, note, financial_goals(name)')
            .eq('profile_id', profileId)
            .order('created_at', { ascending: false })
            .limit(20),
        ]);

        return {
          latestBriefing: compactQueryResult(briefingResult),
          recentGoalContributions: compactQueryResult(contributionsResult),
          executionBoundary: {
            canMoveMoney: false,
            canTrackConfirmedContribution: true,
            explanation: 'The user moves money in their real bank or investment account; Virafi records confirmed goal progress.',
          },
        };
      },
    }),
  };

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const agent = new ToolLoopAgent({
    model: google(getAgentModel()),
    maxOutputTokens: getAiOutputLimit('financial-agent'),
    stopWhen: stepCountIs(8),
    tools,
    instructions: `You are the real financial operating agent for Virafi.
Current date: ${now.toISOString()}. Current year: ${currentYear}. Current month index: ${currentMonth}.

${VIRAFIA_CONVERSATION_PRINCIPLES}

For every factual financial answer, call at least one tool. Never reuse a number from chat memory as evidence.
You may call multiple tools, inspect results, and call another tool if the first result is incomplete or inconsistent.
You can inspect the full read-only Virafi workspace for this authenticated profile: movements, income, planning, personalization, goals, investment context, tasks and findings. Never imply access to bank accounts or data outside these profile-scoped tools.
When the user follows up on a proactive message, amount or recommendation, call getDailyCfoContext. Use its structured action and snapshot to answer the new intent; do not merely paraphrase the proactive message.
For questions about achieving, funding, prioritizing or decomposing goals, call getCfoGoalPlan. Treat its allocation as a proposal, explain the tradeoff, and ask only its single highest-leverage nextQuestion when a goal still needs discovery.
Before naming a cryptocurrency, fund, ETF, stock or other instrument, call getInvestmentResearch as well as getCfoGoalPlan. Recommend only a research shortlist supported by fresh data and the saved risk profile; state why it fits, what could invalidate it, and never use money needed within three years for volatile assets.
Never present an unsupported legacy target as the price of a goal. A monthly saving capacity constrains the plan; it does not determine what moving, travel, property or financial independence costs.
If a goal combines different outcomes, separate them into milestones with different costs, dates and liquidity needs. Do not quote the raw goal name as though it were a variable label; speak naturally about what the person is trying to accomplish.
When asked how to set money aside, distinguish three steps when applicable: where the money should physically go, how to keep it unavailable for ordinary spending, and how its confirmed contribution is tracked in Virafi. Ask a specific question only if the destination depends on liquidity or timing that the tools do not establish.
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
    provider: 'gemini',
    model: getAgentModel(),
    inputTokens: result.totalUsage.inputTokens,
    outputTokens: result.totalUsage.outputTokens,
    totalTokens: result.totalUsage.totalTokens,
    latencyMs: Date.now() - startedAt,
    success: true,
  });
  return { text: result.text.trim(), model: getAgentModel(), steps: result.steps.length };
}
