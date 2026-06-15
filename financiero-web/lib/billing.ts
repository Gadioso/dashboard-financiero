import type { SupabaseClient } from '@supabase/supabase-js';

export type BillingPlan = 'free' | 'beta' | 'premium';

export type BillingLimitResource = 'bankConnections' | 'gmailIntegrations' | 'telegramAccounts';

export type BillingLimits = {
  bankConnections: number;
  gmailIntegrations: number;
  telegramAccounts: number;
  bankSyncLookbackDays: number;
};

export type BillingStatus = {
  configured: boolean;
  plan: BillingPlan;
  status: string;
  active: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  limits: BillingLimits;
  error?: string;
};

const activeSubscriptionStatuses = new Set(['active', 'trialing']);

export const billingPlanLimits: Record<BillingPlan, BillingLimits> = {
  free: {
    bankConnections: 1,
    gmailIntegrations: 1,
    telegramAccounts: 1,
    bankSyncLookbackDays: 30,
  },
  beta: {
    bankConnections: 3,
    gmailIntegrations: 3,
    telegramAccounts: 1,
    bankSyncLookbackDays: 180,
  },
  premium: {
    bankConnections: 10,
    gmailIntegrations: 5,
    telegramAccounts: 3,
    bankSyncLookbackDays: 730,
  },
};

export const defaultBillingStatus: BillingStatus = {
  configured: false,
  plan: 'beta',
  status: 'beta',
  active: true,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  stripeCustomerId: null,
  limits: billingPlanLimits.beta,
};

export function isBillingConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_PREMIUM_MONTHLY);
}

export function getBillingLimits(plan: BillingPlan) {
  return billingPlanLimits[plan] || billingPlanLimits.beta;
}

export async function getBillingStatus({
  supabase,
  profileId,
}: {
  supabase: SupabaseClient;
  profileId?: string | null;
}): Promise<BillingStatus> {
  if (!profileId) return defaultBillingStatus;

  const configured = isBillingConfigured();
  const { data: customer } = await supabase
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('profile_id', profileId)
    .maybeSingle();

  const { data: subscription } = await supabase
    .from('billing_subscriptions')
    .select('plan, status, current_period_end, cancel_at_period_end')
    .eq('profile_id', profileId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!subscription) {
    return {
      ...defaultBillingStatus,
      configured,
      stripeCustomerId: customer?.stripe_customer_id || null,
    };
  }

  const status = String(subscription.status || 'free');
  const active = activeSubscriptionStatuses.has(status);
  const plan = active ? (subscription.plan as BillingPlan) || 'premium' : 'free';

  return {
    configured,
    plan,
    status,
    active,
    currentPeriodEnd: subscription.current_period_end || null,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    stripeCustomerId: customer?.stripe_customer_id || null,
    limits: getBillingLimits(plan),
  };
}

export class BillingLimitError extends Error {
  status = 402;
  code = 'billing_limit_reached';

  constructor(message: string) {
    super(message);
    this.name = 'BillingLimitError';
  }
}

function resourceLabel(resource: BillingLimitResource) {
  if (resource === 'bankConnections') return 'bancos conectados';
  if (resource === 'gmailIntegrations') return 'correos Gmail conectados';
  return 'cuentas de Telegram conectadas';
}

export async function getSafeBillingStatus({
  supabase,
  profileId,
}: {
  supabase: SupabaseClient;
  profileId?: string | null;
}) {
  try {
    return await getBillingStatus({ supabase, profileId });
  } catch (error) {
    return {
      ...defaultBillingStatus,
      configured: isBillingConfigured(),
      error: error instanceof Error ? error.message : 'No pude consultar billing.',
    };
  }
}

export async function assertBillingLimit({
  supabase,
  profileId,
  resource,
  currentCount,
}: {
  supabase: SupabaseClient;
  profileId: string;
  resource: BillingLimitResource;
  currentCount: number;
}) {
  const billing = await getSafeBillingStatus({ supabase, profileId });
  const limit = billing.limits[resource];

  if (currentCount >= limit) {
    throw new BillingLimitError(
      `Tu plan ${billing.plan} permite hasta ${limit} ${resourceLabel(resource)}. Mejora tu plan para agregar más.`
    );
  }

  return billing;
}
