import type { SupabaseClient } from '@supabase/supabase-js';

export type BillingPlan = 'free' | 'beta' | 'premium';

export type BillingLimitResource = 'bankConnections' | 'telegramAccounts';

export type BillingLimits = {
  bankConnections: number;
  telegramAccounts: number;
  bankSyncLookbackDays: number;
};

export type BillingStatus = {
  configured: boolean;
  priceConfigured: Record<Exclude<BillingPlan, 'free'>, boolean>;
  plan: BillingPlan;
  status: string;
  active: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  limits: BillingLimits;
  error?: string;
};

const activeSubscriptionStatusList = ['active', 'trialing'];
const activeSubscriptionStatuses = new Set(activeSubscriptionStatusList);

export const billingPlanLimits: Record<BillingPlan, BillingLimits> = {
  free: {
    bankConnections: 1,
    telegramAccounts: 0,
    bankSyncLookbackDays: 30,
  },
  beta: {
    bankConnections: 2,
    telegramAccounts: 1,
    bankSyncLookbackDays: 365,
  },
  premium: {
    bankConnections: 5,
    telegramAccounts: 1,
    bankSyncLookbackDays: 365,
  },
};

export const defaultBillingStatus: BillingStatus = {
  configured: false,
  priceConfigured: {
    beta: false,
    premium: false,
  },
  plan: 'free',
  status: 'free',
  active: false,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  stripeCustomerId: null,
  limits: billingPlanLimits.free,
};

export function isBillingConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getBillingPriceConfig() {
  const stripeReady = Boolean(process.env.STRIPE_SECRET_KEY);

  return {
    beta: stripeReady,
    premium: stripeReady,
  };
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
  const priceConfigured = getBillingPriceConfig();
  const { data: customer } = await supabase
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('profile_id', profileId)
    .maybeSingle();

  const subscriptionFields = 'plan, status, current_period_end, cancel_at_period_end';
  const { data: activeSubscription } = await supabase
    .from('billing_subscriptions')
    .select(subscriptionFields)
    .eq('profile_id', profileId)
    .in('status', activeSubscriptionStatusList)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: latestSubscription } = activeSubscription
    ? { data: null }
    : await supabase
        .from('billing_subscriptions')
        .select(subscriptionFields)
        .eq('profile_id', profileId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

  const subscription = activeSubscription || latestSubscription;

  if (!subscription) {
    return {
      ...defaultBillingStatus,
      configured,
      priceConfigured,
      stripeCustomerId: customer?.stripe_customer_id || null,
    };
  }

  const status = String(subscription.status || 'free');
  const active = activeSubscriptionStatuses.has(status);
  const plan = active ? (subscription.plan as BillingPlan) || 'premium' : 'free';

  return {
    configured,
    priceConfigured,
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
      priceConfigured: getBillingPriceConfig(),
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
