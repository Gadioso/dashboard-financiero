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
          supabase.from('profiles').select('full_name, monthly_income_target').eq('id', profileId).maybeSingle(),
          supabase.from('fondos_acumulados').select('*').eq('profile_id', profileId),
          supabase.from('advisor_disclosures').select('metadata, accepted_at').eq('profile_id', profileId).eq('disclosure_type', 'risk_profile').order('accepted_at', { ascending: false }).limit(1).maybeSingle(),
        ]);
        if (profileResult.error) throw new Error(profileResult.error.message);
        if (goalsResult.error) throw new Error(goalsResult.error.message);
        return { profile: profileResult.data, goals: goalsResult.data || [], riskProfile: riskResult.data?.metadata || null };
      },
    }),
    getConnectedAccounts: tool({
      description: 'Get bank and investment connection status without exposing credentials. Use when asked whether accounts or providers are connected or current.',
      inputSchema: z.object({}),
      execute: async () => {
        const [bankResult, investmentResult] = await Promise.all([
          supabase.from('bank_connections').select('provider, institution_name, status, last_sync_at').eq('profile_id', profileId),
          supabase.from('investment_accounts').select('provider, account_name, account_type, mode, status, base_currency').eq('profile_id', profileId),
        ]);
        if (bankResult.error) throw new Error(bankResult.error.message);
        return { bankConnections: bankResult.data || [], investmentAccounts: investmentResult.data || [] };
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
For "anual", "anualmente" or "este año", use January 1 through the first day of next month (year-to-date), unless the user names another year.
Futuro includes persisted categories Futuro and Seguros.
The profile field monthly_income_target is the user's monthly income goal. The risk-profile field monthlyContribution is only the planned monthly investment contribution. Never confuse those two numbers.
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
