import Stripe from 'stripe';
import type { BillingPlan } from '@/lib/billing';

const stripeApiVersion = '2026-05-27.dahlia';

export function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY || '';

  if (!secretKey) return null;

  return new Stripe(secretKey, {
    apiVersion: stripeApiVersion,
    appInfo: {
      name: 'Virafi',
    },
  });
}

export function getAppBaseUrl(request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;

  if (configured) return configured.replace(/\/$/, '');

  const url = new URL(request.url);

  return url.origin;
}

export function getStripePriceIdForPlan(plan: BillingPlan) {
  if (plan === 'beta') return process.env.STRIPE_PRICE_BETA_MONTHLY || '';
  if (plan === 'premium') return process.env.STRIPE_PRICE_PREMIUM_MONTHLY || '';
  return '';
}

const planCatalog: Record<Exclude<BillingPlan, 'free'>, { name: string; unitAmount: number; lookupKey: string }> = {
  beta: { name: 'Virafi Beta', unitAmount: 1500, lookupKey: 'dashboard_financiero_beta_monthly' },
  premium: { name: 'Virafi Premium', unitAmount: 2900, lookupKey: 'dashboard_financiero_premium_monthly' },
};

export async function getOrCreateStripePriceForPlan(plan: Exclude<BillingPlan, 'free'>) {
  const stripe = getStripeClient();
  if (!stripe) return null;

  const configuredPriceId = getStripePriceIdForPlan(plan);
  if (configuredPriceId) {
    const configuredPrice = await stripe.prices.retrieve(configuredPriceId);
    if (configuredPrice.active) return configuredPrice.id;
  }

  const catalog = planCatalog[plan];
  const existing = await stripe.prices.list({ active: true, lookup_keys: [catalog.lookupKey], limit: 1 });
  if (existing.data[0]) return existing.data[0].id;

  const product = await stripe.products.create({
    name: catalog.name,
    metadata: { app: 'dashboard_financiero', plan },
  });
  const price = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: catalog.unitAmount,
    recurring: { interval: 'month' },
    lookup_key: catalog.lookupKey,
    metadata: { app: 'dashboard_financiero', plan },
  });

  return price.id;
}

export async function getOrCreateBillingPortalConfiguration() {
  const stripe = getStripeClient();
  if (!stripe) return null;

  const existing = await stripe.billingPortal.configurations.list({ active: true, limit: 1 });
  if (existing.data[0]) return existing.data[0].id;

  const configuration = await stripe.billingPortal.configurations.create({
    business_profile: {
      headline: 'Administra tu plan de Virafi',
      privacy_policy_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://dashboard-financiero-chi.vercel.app'}/privacy`,
      terms_of_service_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://dashboard-financiero-chi.vercel.app'}/terms`,
    },
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: 'at_period_end' },
    },
  });

  return configuration.id;
}
