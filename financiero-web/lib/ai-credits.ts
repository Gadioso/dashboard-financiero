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
  const allowance = billingPlanLimits[plan]?.monthlyCredits || billingPlanLimits.free.monthlyCredits;
  const { data, error } = await supabase.rpc('consume_ai_credits', {
    p_profile_id: profileId,
    p_period_start: periodKey,
    p_allowance: allowance,
    p_credits: credits,
  });
  if (error) {
    if (error.message.includes('AI_CREDITS_EXHAUSTED')) {
      throw new AiCreditsError('Se agotaron tus créditos de VirafIA. Compra un paquete o mejora tu plan.');
    }
    throw new Error(`No pude descontar créditos: ${error.message}`);
  }
  return { balance: Number(data) };
}
