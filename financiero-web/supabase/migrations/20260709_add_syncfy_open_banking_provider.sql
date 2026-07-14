ALTER TABLE public.bank_connections
  DROP CONSTRAINT IF EXISTS bank_connections_provider_check;

ALTER TABLE public.bank_connections
  ADD CONSTRAINT bank_connections_provider_check
  CHECK (provider IN ('syncfy', 'plaid', 'prometeo', 'belvo', 'finerio'));

ALTER TABLE public.bank_sync_runs
  DROP CONSTRAINT IF EXISTS bank_sync_runs_provider_check;

ALTER TABLE public.bank_sync_runs
  ADD CONSTRAINT bank_sync_runs_provider_check
  CHECK (provider IN ('syncfy', 'plaid', 'prometeo', 'belvo', 'finerio'));
