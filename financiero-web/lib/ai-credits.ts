import type { SupabaseClient } from '@supabase/supabase-js';
import { billingPlanLimits, type BillingPlan } from '@/lib/billing';

export class AiCreditsError extends Error {
  code = 'ai_credits_exhausted';
}

/**
 * Credit accounting is intentionally separate from token accounting. One credit
 * represents a user-facing AI action; provider token cost remains observable in
 * the existing [ai-usage] logs.
 */
export async function consumeAiCredit({
  supabase,
  profileId,
  plan = 'free',
  credits = 1,
}: {
  supabase: SupabaseClient;
  profileId: string;
  plan?: BillingPlan;
  credits?: number;
}) {
  const periodStart = new Date();
  periodStart.setUTCDate(1);
  const periodKey = periodStart.toISOString().slice(0, 10);
  const { data: periodCredit } = await supabase
    .from('billing_credit_ledger')
    .select('id')
    .eq('profile_id', profileId)
    .eq('source', 'monthly_plan')
    .eq('period_start', periodKey)
    .maybeSingle();
  const allowance = billingPlanLimits[plan]?.monthlyCredits || billingPlanLimits.free.monthlyCredits;
  if (!periodCredit) {
    const { error: seedError } = await supabase.from('billing_credit_ledger').insert({
      profile_id: profileId,
      credits: allowance,
      source: 'monthly_plan',
      period_start: periodKey,
    });
    if (seedError) throw new Error(`No pude activar créditos: ${seedError.message}`);
  }

  const { data, error } = await supabase
    .from('billing_credit_ledger')
    .select('credits')
    .eq('profile_id', profileId);
  if (error) throw new Error(`No pude consultar créditos: ${error.message}`);
  const balance = (data || []).reduce((sum, row) => sum + Number(row.credits || 0), 0);
  if (balance < credits) throw new AiCreditsError('Se agotaron tus créditos de VirafIA. Compra un paquete o mejora tu plan.');
  const { error: debitError } = await supabase.from('billing_credit_ledger').insert({
    profile_id: profileId,
    credits: -credits,
    source: 'ai_usage',
  });
  if (debitError) throw new Error(`No pude descontar créditos: ${debitError.message}`);
  return { balance: balance - credits };
}
