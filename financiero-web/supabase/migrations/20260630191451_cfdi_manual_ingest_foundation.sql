-- Base para carga manual de CFDI/XML antes de automatizar SAT (historial remoto reconciliado).
-- No guarda el XML completo: solo hash y metadatos normalizados para
-- conciliacion, deducibilidad y seguimiento contable.

CREATE TABLE IF NOT EXISTS public.cfdi_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_entity_id uuid REFERENCES public.business_entities(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'manual' CHECK (provider IN ('manual', 'sat_descarga_masiva', 'pac', 'contpaqi', 'other')),
  status text NOT NULL DEFAULT 'manual' CHECK (status IN ('manual', 'pending', 'active', 'paused', 'revoked', 'error')),
  rfc text,
  last_sync_at timestamptz,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS cfdi_integrations_profile_status_idx
  ON public.cfdi_integrations(profile_id, status, provider);

CREATE TABLE IF NOT EXISTS public.cfdi_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_entity_id uuid REFERENCES public.business_entities(id) ON DELETE SET NULL,
  cfdi_uuid text,
  xml_sha256 text NOT NULL,
  document_direction text NOT NULL DEFAULT 'unknown' CHECK (document_direction IN ('issued', 'received', 'payroll', 'unknown')),
  version text,
  serie text,
  folio text,
  issue_date timestamptz,
  certified_at timestamptz,
  document_type text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'unknown')),
  issuer_rfc text,
  issuer_name text,
  receiver_rfc text,
  receiver_name text,
  usage_cfdi text,
  payment_method text,
  payment_form text,
  currency text,
  subtotal numeric(18, 2),
  total numeric(18, 2),
  discount numeric(18, 2),
  tax_transferred numeric(18, 2),
  tax_withheld numeric(18, 2),
  source text NOT NULL DEFAULT 'manual_upload' CHECK (source IN ('manual_upload', 'sat_download', 'email', 'pac', 'import')),
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS cfdi_documents_profile_issue_idx
  ON public.cfdi_documents(profile_id, issue_date DESC NULLS LAST, created_at DESC);

CREATE INDEX IF NOT EXISTS cfdi_documents_profile_direction_idx
  ON public.cfdi_documents(profile_id, document_direction, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS cfdi_documents_profile_uuid_uidx
  ON public.cfdi_documents(profile_id, cfdi_uuid)
  WHERE cfdi_uuid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cfdi_documents_profile_hash_uidx
  ON public.cfdi_documents(profile_id, xml_sha256);

CREATE TABLE IF NOT EXISTS public.cfdi_reconciliation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_entity_id uuid REFERENCES public.business_entities(id) ON DELETE SET NULL,
  cfdi_document_id uuid REFERENCES public.cfdi_documents(id) ON DELETE CASCADE,
  gasto_id bigint REFERENCES public.gastos(id) ON DELETE SET NULL,
  ingreso_id bigint REFERENCES public.ingresos(id) ON DELETE SET NULL,
  bank_transaction_raw_id uuid REFERENCES public.bank_transactions_raw(id) ON DELETE SET NULL,
  match_status text NOT NULL DEFAULT 'candidate' CHECK (match_status IN ('candidate', 'matched', 'needs_review', 'rejected', 'missing_bank_movement', 'missing_cfdi')),
  confidence numeric(5, 4),
  amount_delta numeric(18, 2),
  date_delta_days integer,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS cfdi_reconciliation_profile_status_idx
  ON public.cfdi_reconciliation_events(profile_id, match_status, created_at DESC);

CREATE INDEX IF NOT EXISTS cfdi_reconciliation_document_idx
  ON public.cfdi_reconciliation_events(cfdi_document_id, match_status);

ALTER TABLE public.cfdi_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cfdi_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cfdi_reconciliation_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tenant_table_name text;
BEGIN
  FOREACH tenant_table_name IN ARRAY ARRAY[
    'cfdi_integrations',
    'cfdi_documents',
    'cfdi_reconciliation_events'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Rows belong to authenticated profile" ON public.%I', tenant_table_name);
    EXECUTE format(
      'CREATE POLICY "Rows belong to authenticated profile" ON public.%I FOR ALL USING (profile_id = (SELECT auth.uid())) WITH CHECK (profile_id = (SELECT auth.uid()))',
      tenant_table_name
    );
  END LOOP;
END $$;
