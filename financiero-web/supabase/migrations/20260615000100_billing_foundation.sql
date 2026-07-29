-- Historial legado normalizado. Billing foundation for SaaS plans through Stripe.

CREATE TABLE IF NOT EXISTS public.billing_customers (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL UNIQUE,
  email text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.billing_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL,
  stripe_subscription_id text NOT NULL UNIQUE,
  status text NOT NULL,
  plan text NOT NULL DEFAULT 'premium' CHECK (plan IN ('free', 'beta', 'premium')),
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  trial_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS billing_customers_stripe_customer_idx
  ON public.billing_customers(stripe_customer_id);

CREATE INDEX IF NOT EXISTS billing_subscriptions_profile_status_idx
  ON public.billing_subscriptions(profile_id, status);

CREATE INDEX IF NOT EXISTS billing_subscriptions_stripe_customer_idx
  ON public.billing_subscriptions(stripe_customer_id);

ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Billing customers belong to profile" ON public.billing_customers;
CREATE POLICY "Billing customers belong to profile"
  ON public.billing_customers
  FOR ALL
  USING (profile_id = (SELECT auth.uid()))
  WITH CHECK (profile_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Billing subscriptions belong to profile" ON public.billing_subscriptions;
CREATE POLICY "Billing subscriptions belong to profile"
  ON public.billing_subscriptions
  FOR ALL
  USING (profile_id = (SELECT auth.uid()))
  WITH CHECK (profile_id = (SELECT auth.uid()));
