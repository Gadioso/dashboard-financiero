-- Syncfy Fiscal / SAT All in One metadata (historial reconciliado).
-- Syncfy remains the credential vault and source of truth; this database only
-- stores normalized tax documents and provider identifiers for idempotency.

ALTER TABLE public.cfdi_documents
  DROP CONSTRAINT IF EXISTS cfdi_documents_source_check;

ALTER TABLE public.cfdi_documents
  ADD CONSTRAINT cfdi_documents_source_check
  CHECK (source IN ('manual_upload', 'sat_download', 'email', 'pac', 'import', 'syncfy'));

ALTER TABLE public.cfdi_documents
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_document_id text;

CREATE UNIQUE INDEX IF NOT EXISTS cfdi_documents_provider_document_uidx
  ON public.cfdi_documents(profile_id, provider, provider_document_id);

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_integrations_syncfy_open_fiscal_uidx
  ON public.fiscal_integrations(profile_id, integration_type, provider);

COMMENT ON COLUMN public.cfdi_documents.provider_document_id IS
  'Stable document/transaction id from the external fiscal provider.';
