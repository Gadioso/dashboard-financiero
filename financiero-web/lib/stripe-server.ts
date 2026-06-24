import Stripe from 'stripe';
import type { BillingPlan } from '@/lib/billing';

const stripeApiVersion = '2026-05-27.dahlia';

export function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY || '';

  if (!secretKey) return null;

  return new Stripe(secretKey, {
    apiVersion: stripeApiVersion,
    appInfo: {
      name: 'Dashboard Financiero',
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
