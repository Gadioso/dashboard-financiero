CREATE INDEX IF NOT EXISTS fiscal_profiles_business_entity_idx
  ON public.fiscal_profiles(business_entity_id);

CREATE INDEX IF NOT EXISTS fiscal_integrations_fiscal_profile_idx
  ON public.fiscal_integrations(fiscal_profile_id);

CREATE INDEX IF NOT EXISTS fiscal_opinions_fiscal_profile_idx
  ON public.fiscal_compliance_opinions(fiscal_profile_id);

CREATE INDEX IF NOT EXISTS fiscal_alerts_fiscal_profile_idx
  ON public.fiscal_alerts(fiscal_profile_id);

CREATE INDEX IF NOT EXISTS fiscal_alerts_cfdi_document_idx
  ON public.fiscal_alerts(cfdi_document_id);

CREATE INDEX IF NOT EXISTS fiscal_operations_fiscal_profile_idx
  ON public.fiscal_operations(fiscal_profile_id);

CREATE INDEX IF NOT EXISTS fiscal_declarations_fiscal_profile_idx
  ON public.fiscal_declaration_drafts(fiscal_profile_id);
