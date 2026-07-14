-- Trazabilidad e idempotencia para la interpretación automática de 32-D.

ALTER TABLE public.fiscal_profiles
  DROP CONSTRAINT IF EXISTS fiscal_profiles_tax_regime_check;

ALTER TABLE public.fiscal_profiles
  ADD CONSTRAINT fiscal_profiles_tax_regime_check
  CHECK (tax_regime IN ('601', '603', '605', '606', '607', '608', '610', '611', '612', '614', '615', '616', '620', '621', '622', '623', '624', '625', '626'));

ALTER TABLE public.fiscal_compliance_opinions
  ADD COLUMN IF NOT EXISTS fiscal_provider_document_id uuid REFERENCES public.fiscal_provider_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_compliance_opinions_source_document_uidx
  ON public.fiscal_compliance_opinions(profile_id, source, fiscal_provider_document_id);

ALTER TABLE public.fiscal_alerts
  ADD COLUMN IF NOT EXISTS source_key text;

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_alerts_source_key_uidx
  ON public.fiscal_alerts(profile_id, source_key);
