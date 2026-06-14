CREATE TABLE IF NOT EXISTS public.bank_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('plaid', 'prometeo', 'belvo', 'finerio')),
  provider_item_id text,
  institution_id text,
  institution_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'error', 'revoked')),
  access_token_encrypted text,
  external_user_id text,
  consent_expires_at timestamptz,
  last_sync_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS bank_connections_profile_id_idx
  ON public.bank_connections(profile_id);

CREATE INDEX IF NOT EXISTS bank_connections_profile_provider_status_idx
  ON public.bank_connections(profile_id, provider, status);

CREATE UNIQUE INDEX IF NOT EXISTS bank_connections_profile_provider_item_uidx
  ON public.bank_connections(profile_id, provider_item_id)
  WHERE provider_item_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.bank_connections(id) ON DELETE CASCADE,
  provider_account_id text NOT NULL,
  name text,
  official_name text,
  type text,
  subtype text,
  currency text DEFAULT 'MXN',
  current_balance numeric,
  available_balance numeric,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (connection_id, provider_account_id)
);

CREATE INDEX IF NOT EXISTS bank_accounts_profile_id_idx
  ON public.bank_accounts(profile_id);

CREATE INDEX IF NOT EXISTS bank_accounts_connection_id_idx
  ON public.bank_accounts(connection_id);

CREATE TABLE IF NOT EXISTS public.bank_transactions_raw (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.bank_connections(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  provider_transaction_id text NOT NULL,
  posted_at date,
  authorized_at timestamptz,
  description text NOT NULL,
  merchant_name text,
  amount numeric NOT NULL,
  currency text DEFAULT 'MXN',
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalized_status text NOT NULL DEFAULT 'pending' CHECK (normalized_status IN ('pending', 'ignored', 'classified', 'failed')),
  gasto_id bigint REFERENCES public.gastos(id) ON DELETE SET NULL,
  ingreso_id bigint REFERENCES public.ingresos(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (connection_id, provider_transaction_id)
);

CREATE INDEX IF NOT EXISTS bank_transactions_raw_profile_id_idx
  ON public.bank_transactions_raw(profile_id);

CREATE INDEX IF NOT EXISTS bank_transactions_raw_connection_id_idx
  ON public.bank_transactions_raw(connection_id);

CREATE INDEX IF NOT EXISTS bank_transactions_raw_profile_posted_at_idx
  ON public.bank_transactions_raw(profile_id, posted_at DESC);

CREATE TABLE IF NOT EXISTS public.bank_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.bank_connections(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider IN ('plaid', 'prometeo', 'belvo', 'finerio')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'error')),
  started_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  finished_at timestamptz,
  from_date date,
  to_date date,
  inserted_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  ignored_count integer NOT NULL DEFAULT 0,
  error_message text
);

CREATE INDEX IF NOT EXISTS bank_sync_runs_profile_id_idx
  ON public.bank_sync_runs(profile_id);

CREATE INDEX IF NOT EXISTS bank_sync_runs_connection_id_idx
  ON public.bank_sync_runs(connection_id);

ALTER TABLE public.bank_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Bank connections belong to authenticated profile" ON public.bank_connections;
CREATE POLICY "Bank connections belong to authenticated profile"
  ON public.bank_connections
  FOR ALL
  USING (profile_id = (SELECT auth.uid()))
  WITH CHECK (profile_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Bank accounts belong to authenticated profile" ON public.bank_accounts;
CREATE POLICY "Bank accounts belong to authenticated profile"
  ON public.bank_accounts
  FOR ALL
  USING (profile_id = (SELECT auth.uid()))
  WITH CHECK (profile_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Bank transactions belong to authenticated profile" ON public.bank_transactions_raw;
CREATE POLICY "Bank transactions belong to authenticated profile"
  ON public.bank_transactions_raw
  FOR ALL
  USING (profile_id = (SELECT auth.uid()))
  WITH CHECK (profile_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Bank sync runs belong to authenticated profile" ON public.bank_sync_runs;
CREATE POLICY "Bank sync runs belong to authenticated profile"
  ON public.bank_sync_runs
  FOR ALL
  USING (profile_id = (SELECT auth.uid()))
  WITH CHECK (profile_id = (SELECT auth.uid()));
