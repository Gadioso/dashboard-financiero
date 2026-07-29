-- SAT Core: expediente, conexiones, 32-D, alertas y trazabilidad PAC (historial reconciliado).
-- Nunca almacena CIEC, CSD, .key o contraseñas en texto plano. Los secretos
-- deben permanecer en la bóveda del proveedor y aquí solo se guarda referencia.

CREATE TABLE IF NOT EXISTS public.fiscal_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_entity_id uuid REFERENCES public.business_entities(id) ON DELETE SET NULL,
  rfc text NOT NULL,
  legal_name text NOT NULL,
  tax_regime text NOT NULL CHECK (tax_regime IN ('RESICO', 'ACTIVIDAD_EMPRESARIAL', 'PERSONA_MORAL')),
  fiscal_postal_code text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (profile_id, rfc)
);

CREATE TABLE IF NOT EXISTS public.fiscal_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  fiscal_profile_id uuid REFERENCES public.fiscal_profiles(id) ON DELETE CASCADE,
  integration_type text NOT NULL CHECK (integration_type IN ('open_fiscal', 'pac')),
  provider text NOT NULL CHECK (provider IN ('syncfy', 'criskco', 'fiscalapi', 'enlace_fiscal', 'other')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'revoked', 'error')),
  provider_connection_id text,
  secret_reference text,
  last_sync_at timestamptz,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.fiscal_compliance_opinions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  fiscal_profile_id uuid REFERENCES public.fiscal_profiles(id) ON DELETE CASCADE,
  opinion_status text NOT NULL CHECK (opinion_status IN ('positive', 'negative', 'unavailable')),
  checked_at timestamptz NOT NULL,
  valid_until timestamptz,
  omitted_obligations jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL DEFAULT 'open_fiscal',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.fiscal_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  fiscal_profile_id uuid REFERENCES public.fiscal_profiles(id) ON DELETE CASCADE,
  cfdi_document_id uuid REFERENCES public.cfdi_documents(id) ON DELETE SET NULL,
  alert_type text NOT NULL CHECK (alert_type IN ('compliance', 'efos', 'cancelled_cfdi', 'missing_obligation', 'deduction', 'sync')),
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  title text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved', 'dismissed')),
  detected_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.fiscal_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  fiscal_profile_id uuid REFERENCES public.fiscal_profiles(id) ON DELETE CASCADE,
  operation_type text NOT NULL CHECK (operation_type IN ('issue', 'cancel', 'credit_note', 'payment_complement')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'queued', 'processing', 'stamped', 'pending_acceptance', 'cancelled', 'failed')),
  provider text,
  provider_transaction_id text,
  cfdi_uuid text,
  cancellation_reason text CHECK (cancellation_reason IS NULL OR cancellation_reason IN ('01', '02', '03', '04')),
  replacement_uuid text,
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  attempt_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.fiscal_declaration_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  fiscal_profile_id uuid REFERENCES public.fiscal_profiles(id) ON DELETE CASCADE,
  period text NOT NULL,
  declaration_type text NOT NULL DEFAULT 'monthly_provisional' CHECK (declaration_type IN ('monthly_provisional', 'monthly_definitive', 'annual')),
  status text NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared', 'reviewed', 'ready_to_file', 'filed', 'superseded')),
  calculated_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_at timestamptz,
  filed_at timestamptz,
  acknowledgement_reference text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (profile_id, period, declaration_type)
);

CREATE INDEX IF NOT EXISTS fiscal_profiles_profile_idx ON public.fiscal_profiles(profile_id, status);
CREATE INDEX IF NOT EXISTS fiscal_integrations_profile_idx ON public.fiscal_integrations(profile_id, integration_type, status);
CREATE INDEX IF NOT EXISTS fiscal_opinions_profile_idx ON public.fiscal_compliance_opinions(profile_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS fiscal_alerts_profile_idx ON public.fiscal_alerts(profile_id, status, severity, detected_at DESC);
CREATE INDEX IF NOT EXISTS fiscal_operations_profile_idx ON public.fiscal_operations(profile_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS fiscal_declarations_profile_idx ON public.fiscal_declaration_drafts(profile_id, period DESC, status);

ALTER TABLE public.fiscal_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_compliance_opinions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_declaration_drafts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_profiles TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_integrations TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_compliance_opinions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_alerts TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_operations TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_declaration_drafts TO authenticated, service_role;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['fiscal_profiles', 'fiscal_integrations', 'fiscal_compliance_opinions', 'fiscal_alerts', 'fiscal_operations', 'fiscal_declaration_drafts'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Rows belong to authenticated profile" ON public.%I', table_name);
    EXECUTE format('CREATE POLICY "Rows belong to authenticated profile" ON public.%I FOR ALL USING (profile_id = (SELECT auth.uid())) WITH CHECK (profile_id = (SELECT auth.uid()))', table_name);
  END LOOP;
END $$;
