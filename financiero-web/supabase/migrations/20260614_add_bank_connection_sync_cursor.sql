ALTER TABLE public.bank_connections
  ADD COLUMN IF NOT EXISTS transactions_cursor text;

ALTER TABLE public.bank_connections
  ADD COLUMN IF NOT EXISTS transactions_update_status text;
