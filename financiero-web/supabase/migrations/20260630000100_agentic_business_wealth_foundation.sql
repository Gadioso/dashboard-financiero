-- Historial legado normalizado. Fundacion agentica para modo negocio, tareas de agentes y wealth cockpit.
-- Esta migracion no habilita ejecucion real de trading; solo modela read-only,
-- research, paper trading y order staging con confirmacion humana.

CREATE TABLE IF NOT EXISTS public.business_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  entity_type text NOT NULL DEFAULT 'freelancer' CHECK (entity_type IN ('personal_activity', 'freelancer', 'business', 'firm_client', 'other')),
  country text NOT NULL DEFAULT 'MX',
  currency text NOT NULL DEFAULT 'MXN',
  tax_id text,
  tax_regime text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS business_entities_profile_status_idx
  ON public.business_entities(profile_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.business_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_entity_id uuid NOT NULL REFERENCES public.business_entities(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'admin', 'accountant', 'operator', 'viewer')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'revoked')),
  invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (business_entity_id, profile_id)
);

CREATE INDEX IF NOT EXISTS business_members_profile_status_idx
  ON public.business_members(profile_id, status);

CREATE INDEX IF NOT EXISTS business_members_entity_role_idx
  ON public.business_members(business_entity_id, role, status);

CREATE TABLE IF NOT EXISTS public.transaction_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_entity_id uuid REFERENCES public.business_entities(id) ON DELETE SET NULL,
  gasto_id bigint REFERENCES public.gastos(id) ON DELETE CASCADE,
  ingreso_id bigint REFERENCES public.ingresos(id) ON DELETE CASCADE,
  bank_transaction_raw_id uuid REFERENCES public.bank_transactions_raw(id) ON DELETE SET NULL,
  mode text NOT NULL CHECK (mode IN ('personal', 'business', 'mixed')),
  category text,
  subcategory text,
  amount numeric(14, 2),
  percentage numeric(7, 4),
  deductible_status text NOT NULL DEFAULT 'unknown' CHECK (deductible_status IN ('unknown', 'deductible', 'non_deductible', 'partial', 'not_applicable')),
  confidence numeric(5, 4),
  source text NOT NULL DEFAULT 'agent' CHECK (source IN ('user', 'agent', 'bank', 'cfdi', 'import', 'system')),
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CHECK (
    gasto_id IS NOT NULL
    OR ingreso_id IS NOT NULL
    OR bank_transaction_raw_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS transaction_splits_profile_created_idx
  ON public.transaction_splits(profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS transaction_splits_business_created_idx
  ON public.transaction_splits(business_entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS transaction_splits_gasto_idx
  ON public.transaction_splits(gasto_id)
  WHERE gasto_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS transaction_splits_ingreso_idx
  ON public.transaction_splits(ingreso_id)
  WHERE ingreso_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.agent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_entity_id uuid REFERENCES public.business_entities(id) ON DELETE SET NULL,
  agent_key text NOT NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting_user', 'completed', 'dismissed', 'failed')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  due_at timestamptz,
  completed_at timestamptz,
  source text NOT NULL DEFAULT 'agent' CHECK (source IN ('agent', 'workflow', 'user', 'system')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS agent_tasks_profile_status_priority_idx
  ON public.agent_tasks(profile_id, status, priority, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_tasks_business_status_idx
  ON public.agent_tasks(business_entity_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.agent_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_entity_id uuid REFERENCES public.business_entities(id) ON DELETE SET NULL,
  agent_key text NOT NULL,
  finding_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  title text NOT NULL,
  summary text NOT NULL,
  recommendation text,
  confidence numeric(5, 4),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'accepted', 'dismissed', 'resolved', 'superseded')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS agent_findings_profile_severity_idx
  ON public.agent_findings(profile_id, status, severity, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_findings_business_status_idx
  ON public.agent_findings(business_entity_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.market_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_type text NOT NULL CHECK (asset_type IN ('cash', 'stock', 'etf', 'fund', 'bond', 'crypto', 'prediction_market', 'private_asset', 'other')),
  symbol text,
  name text NOT NULL,
  exchange text,
  currency text,
  provider text,
  provider_asset_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (provider, provider_asset_id)
);

CREATE INDEX IF NOT EXISTS market_assets_symbol_idx
  ON public.market_assets(symbol)
  WHERE symbol IS NOT NULL;

CREATE INDEX IF NOT EXISTS market_assets_type_provider_idx
  ON public.market_assets(asset_type, provider);

CREATE TABLE IF NOT EXISTS public.investment_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_entity_id uuid REFERENCES public.business_entities(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider IN ('manual', 'binance', 'polymarket', 'gbm', 'cetesdirecto', 'fintual', 'kuspit', 'wallet', 'other')),
  account_name text NOT NULL,
  account_type text NOT NULL DEFAULT 'brokerage' CHECK (account_type IN ('brokerage', 'crypto_exchange', 'wallet', 'cetes', 'prediction_market', 'manual', 'other')),
  mode text NOT NULL DEFAULT 'read_only' CHECK (mode IN ('manual', 'read_only', 'paper', 'staged', 'live_disabled')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'paused', 'revoked', 'error')),
  base_currency text NOT NULL DEFAULT 'MXN',
  external_account_id text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  api_key_encrypted text,
  api_secret_encrypted text,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at timestamptz,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS investment_accounts_profile_status_idx
  ON public.investment_accounts(profile_id, status, provider);

CREATE INDEX IF NOT EXISTS investment_accounts_business_idx
  ON public.investment_accounts(business_entity_id, provider)
  WHERE business_entity_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS investment_accounts_profile_provider_external_uidx
  ON public.investment_accounts(profile_id, provider, external_account_id)
  WHERE external_account_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.investment_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_entity_id uuid REFERENCES public.business_entities(id) ON DELETE SET NULL,
  account_id uuid REFERENCES public.investment_accounts(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES public.market_assets(id) ON DELETE SET NULL,
  external_position_id text,
  quantity numeric(28, 12) NOT NULL DEFAULT 0,
  average_cost numeric(18, 8),
  market_price numeric(18, 8),
  market_value numeric(18, 2),
  cost_basis numeric(18, 2),
  unrealized_pnl numeric(18, 2),
  currency text NOT NULL DEFAULT 'MXN',
  as_of timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'provider', 'paper', 'import', 'system')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS investment_positions_profile_value_idx
  ON public.investment_positions(profile_id, as_of DESC);

CREATE INDEX IF NOT EXISTS investment_positions_account_asset_idx
  ON public.investment_positions(account_id, asset_id);

CREATE TABLE IF NOT EXISTS public.investment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_entity_id uuid REFERENCES public.business_entities(id) ON DELETE SET NULL,
  account_id uuid REFERENCES public.investment_accounts(id) ON DELETE SET NULL,
  asset_id uuid REFERENCES public.market_assets(id) ON DELETE SET NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN ('buy', 'sell', 'deposit', 'withdrawal', 'dividend', 'interest', 'fee', 'reward', 'transfer', 'adjustment')),
  executed_at timestamptz NOT NULL,
  quantity numeric(28, 12),
  price numeric(18, 8),
  gross_amount numeric(18, 2),
  fee_amount numeric(18, 2),
  net_amount numeric(18, 2),
  currency text NOT NULL DEFAULT 'MXN',
  provider_transaction_id text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'provider', 'paper', 'import', 'system')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS investment_transactions_profile_executed_idx
  ON public.investment_transactions(profile_id, executed_at DESC);

CREATE INDEX IF NOT EXISTS investment_transactions_account_asset_idx
  ON public.investment_transactions(account_id, asset_id, executed_at DESC);

CREATE TABLE IF NOT EXISTS public.market_data_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid REFERENCES public.market_assets(id) ON DELETE CASCADE,
  provider text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  price numeric(18, 8),
  bid numeric(18, 8),
  ask numeric(18, 8),
  spread_bps numeric(12, 4),
  volume_24h numeric(28, 8),
  volatility_30d numeric(12, 6),
  raw jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS market_data_snapshots_asset_time_idx
  ON public.market_data_snapshots(asset_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS public.investment_theses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_entity_id uuid REFERENCES public.business_entities(id) ON DELETE SET NULL,
  asset_id uuid REFERENCES public.market_assets(id) ON DELETE SET NULL,
  thesis_type text NOT NULL DEFAULT 'research' CHECK (thesis_type IN ('research', 'watchlist', 'rebalance', 'risk_reduction', 'prediction_market', 'other')),
  title text NOT NULL,
  summary text NOT NULL,
  stance text NOT NULL DEFAULT 'neutral' CHECK (stance IN ('bullish', 'neutral', 'bearish', 'avoid')),
  horizon text NOT NULL DEFAULT 'medium' CHECK (horizon IN ('short', 'medium', 'long')),
  confidence numeric(5, 4),
  expected_return numeric(12, 6),
  max_loss_scenario numeric(12, 6),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'invalidated', 'closed', 'archived')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  invalidation_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by_agent text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS investment_theses_profile_status_idx
  ON public.investment_theses(profile_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.paper_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_entity_id uuid REFERENCES public.business_entities(id) ON DELETE SET NULL,
  thesis_id uuid REFERENCES public.investment_theses(id) ON DELETE SET NULL,
  account_id uuid REFERENCES public.investment_accounts(id) ON DELETE SET NULL,
  asset_id uuid REFERENCES public.market_assets(id) ON DELETE SET NULL,
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled', 'expired')),
  opened_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  closed_at timestamptz,
  entry_price numeric(18, 8),
  exit_price numeric(18, 8),
  quantity numeric(28, 12),
  notional numeric(18, 2),
  realized_pnl numeric(18, 2),
  max_drawdown numeric(12, 6),
  fees_estimated numeric(18, 2),
  rationale text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS paper_trades_profile_status_idx
  ON public.paper_trades(profile_id, status, opened_at DESC);

CREATE TABLE IF NOT EXISTS public.trade_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_entity_id uuid REFERENCES public.business_entities(id) ON DELETE SET NULL,
  thesis_id uuid REFERENCES public.investment_theses(id) ON DELETE SET NULL,
  account_id uuid REFERENCES public.investment_accounts(id) ON DELETE SET NULL,
  asset_id uuid REFERENCES public.market_assets(id) ON DELETE SET NULL,
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  order_type text NOT NULL DEFAULT 'market' CHECK (order_type IN ('market', 'limit', 'stop_limit')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'needs_confirmation', 'confirmed', 'cancelled', 'expired', 'blocked')),
  quantity numeric(28, 12),
  notional numeric(18, 2),
  limit_price numeric(18, 8),
  expires_at timestamptz,
  risk_check jsonb NOT NULL DEFAULT '{}'::jsonb,
  confirmation_text text,
  confirmed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS trade_intents_profile_status_idx
  ON public.trade_intents(profile_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.risk_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_entity_id uuid REFERENCES public.business_entities(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('portfolio', 'asset', 'asset_type', 'provider', 'thesis', 'business')),
  scope_value text,
  limit_type text NOT NULL CHECK (limit_type IN ('max_allocation_pct', 'max_notional', 'max_drawdown_pct', 'max_daily_loss', 'no_leverage', 'read_only_only')),
  limit_value numeric(18, 6),
  currency text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS risk_limits_profile_scope_idx
  ON public.risk_limits(profile_id, status, scope, scope_value);

CREATE TABLE IF NOT EXISTS public.advisor_disclosures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  disclosure_type text NOT NULL CHECK (disclosure_type IN ('education_only', 'research_only', 'personalized_advice', 'paper_trading', 'order_staging', 'execution_disabled', 'risk_profile')),
  version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  ip_address inet,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (profile_id, disclosure_type, version)
);

CREATE INDEX IF NOT EXISTS advisor_disclosures_profile_type_idx
  ON public.advisor_disclosures(profile_id, disclosure_type, accepted_at DESC);

ALTER TABLE public.business_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_data_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_theses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisor_disclosures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Business entities are visible to owner" ON public.business_entities;
DROP POLICY IF EXISTS "Business entities are visible to owner or members" ON public.business_entities;
CREATE POLICY "Business entities are visible to owner"
  ON public.business_entities
  FOR SELECT
  USING (profile_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Business entities are owned by profile" ON public.business_entities;
CREATE POLICY "Business entities are owned by profile"
  ON public.business_entities
  FOR INSERT
  WITH CHECK (profile_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Business entities are writable by owner" ON public.business_entities;
CREATE POLICY "Business entities are writable by owner"
  ON public.business_entities
  FOR UPDATE
  USING (profile_id = (SELECT auth.uid()))
  WITH CHECK (profile_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Business members visible to same profile" ON public.business_members;
CREATE POLICY "Business members visible to same profile"
  ON public.business_members
  FOR SELECT
  USING (
    profile_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.business_entities
      WHERE business_entities.id = business_members.business_entity_id
        AND business_entities.profile_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Business members manageable by owner" ON public.business_members;
CREATE POLICY "Business members manageable by owner"
  ON public.business_members
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.business_entities
      WHERE business_entities.id = business_members.business_entity_id
        AND business_entities.profile_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.business_entities
      WHERE business_entities.id = business_members.business_entity_id
        AND business_entities.profile_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Market assets are readable by authenticated users" ON public.market_assets;
CREATE POLICY "Market assets are readable by authenticated users"
  ON public.market_assets
  FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Market data is readable by authenticated users" ON public.market_data_snapshots;
CREATE POLICY "Market data is readable by authenticated users"
  ON public.market_data_snapshots
  FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

DO $$
DECLARE
  tenant_table_name text;
BEGIN
  FOREACH tenant_table_name IN ARRAY ARRAY[
    'transaction_splits',
    'agent_tasks',
    'agent_findings',
    'investment_accounts',
    'investment_positions',
    'investment_transactions',
    'investment_theses',
    'paper_trades',
    'trade_intents',
    'risk_limits',
    'advisor_disclosures'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Rows belong to authenticated profile" ON public.%I', tenant_table_name);
    EXECUTE format(
      'CREATE POLICY "Rows belong to authenticated profile" ON public.%I FOR ALL USING (profile_id = (SELECT auth.uid())) WITH CHECK (profile_id = (SELECT auth.uid()))',
      tenant_table_name
    );
  END LOOP;
END $$;
