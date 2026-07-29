begin;

-- Preserve legitimate historical bank movements while removing the retired
-- email-ingestion source from the product and schema.
update public.gastos
set origen = 'Banco'
where origen = 'Santander_Email';

alter table public.gastos
  drop constraint if exists gastos_origen_check;

alter table public.gastos
  add constraint gastos_origen_check
  check (origen in ('Web', 'Telegram', 'Banco'));

update public.abonos_tarjeta_credito
set origen = 'Banco'
where origen = 'Santander_Email';

alter table public.abonos_tarjeta_credito
  alter column origen set default 'Banco';

update public.transaction_splits
set source = 'import'
where source = 'cfdi';

alter table public.transaction_splits
  drop constraint if exists transaction_splits_source_check;

alter table public.transaction_splits
  add constraint transaction_splits_source_check
  check (source in ('user', 'agent', 'bank', 'import', 'system'));

drop table if exists public.fiscal_alerts;
drop table if exists public.fiscal_compliance_opinions;
drop table if exists public.fiscal_declaration_drafts;
drop table if exists public.fiscal_operations;
drop table if exists public.fiscal_provider_documents;
drop table if exists public.fiscal_integrations;
drop table if exists public.fiscal_profiles;

drop table if exists public.cfdi_reconciliation_events;
drop table if exists public.cfdi_documents;
drop table if exists public.cfdi_integrations;

drop table if exists public.gmail_integrations;
drop table if exists public.santander_ingest_logs;

alter table public.business_entities
  drop column if exists tax_id,
  drop column if exists tax_regime;

commit;
