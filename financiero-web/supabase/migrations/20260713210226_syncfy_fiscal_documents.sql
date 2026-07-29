-- Non-CFDI documents downloaded by Syncfy SAT All in One (historial reconciliado).
-- Only normalized metadata and provider references are persisted; SAT
-- credentials and private key material remain inside Syncfy.

CREATE TABLE IF NOT EXISTS public.fiscal_provider_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  fiscal_profile_id uuid REFERENCES public.fiscal_profiles(id) ON DELETE SET NULL,
  fiscal_integration_id uuid REFERENCES public.fiscal_integrations(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'syncfy',
  provider_document_id text NOT NULL,
  document_type text NOT NULL DEFAULT 'other' CHECK (document_type IN (
    'cfdi_xml',
    'withholding',
    'monthly_declaration',
    'annual_declaration',
    'compliance_opinion',
    'tax_status_certificate',
    'other'
  )),
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'invalid', 'superseded')),
  file_name text,
  mime_type text,
  provider_path text,
  period text,
  issued_at timestamptz,
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (profile_id, provider, provider_document_id)
);

CREATE INDEX IF NOT EXISTS fiscal_provider_documents_profile_type_idx
  ON public.fiscal_provider_documents(profile_id, document_type, issued_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS fiscal_provider_documents_fiscal_profile_idx
  ON public.fiscal_provider_documents(fiscal_profile_id);

CREATE INDEX IF NOT EXISTS fiscal_provider_documents_integration_idx
  ON public.fiscal_provider_documents(fiscal_integration_id);

ALTER TABLE public.fiscal_provider_documents ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_provider_documents TO authenticated, service_role;

DROP POLICY IF EXISTS "Rows belong to authenticated profile" ON public.fiscal_provider_documents;
CREATE POLICY "Rows belong to authenticated profile"
  ON public.fiscal_provider_documents
  FOR ALL
  TO authenticated
  USING (profile_id = (SELECT auth.uid()))
  WITH CHECK (profile_id = (SELECT auth.uid()));
