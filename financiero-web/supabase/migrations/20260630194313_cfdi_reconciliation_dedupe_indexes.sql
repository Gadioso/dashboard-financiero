-- Evita eventos duplicados cuando se corre la conciliacion CFDI-banco varias veces (historial reconciliado).

CREATE UNIQUE INDEX IF NOT EXISTS cfdi_reconciliation_unique_gasto_match_uidx
  ON public.cfdi_reconciliation_events(profile_id, cfdi_document_id, gasto_id)
  WHERE cfdi_document_id IS NOT NULL AND gasto_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cfdi_reconciliation_unique_ingreso_match_uidx
  ON public.cfdi_reconciliation_events(profile_id, cfdi_document_id, ingreso_id)
  WHERE cfdi_document_id IS NOT NULL AND ingreso_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cfdi_reconciliation_unique_bank_match_uidx
  ON public.cfdi_reconciliation_events(profile_id, cfdi_document_id, bank_transaction_raw_id)
  WHERE cfdi_document_id IS NOT NULL AND bank_transaction_raw_id IS NOT NULL;
