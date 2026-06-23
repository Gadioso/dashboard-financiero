ALTER TABLE public.bank_transactions_raw
  ADD COLUMN IF NOT EXISTS classification_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS classification_error text,
  ADD COLUMN IF NOT EXISTS classified_at timestamptz;

ALTER TABLE public.gastos
  ADD COLUMN IF NOT EXISTS bank_transaction_raw_id uuid REFERENCES public.bank_transactions_raw(id) ON DELETE SET NULL;

ALTER TABLE public.ingresos
  ADD COLUMN IF NOT EXISTS bank_transaction_raw_id uuid REFERENCES public.bank_transactions_raw(id) ON DELETE SET NULL;

ALTER TABLE public.gastos
  DROP CONSTRAINT IF EXISTS gastos_origen_check;

ALTER TABLE public.gastos
  ADD CONSTRAINT gastos_origen_check
  CHECK (origen IN ('Web', 'Telegram', 'Santander_Email', 'Banco'));

CREATE INDEX IF NOT EXISTS bank_transactions_raw_profile_status_queue_idx
  ON public.bank_transactions_raw(profile_id, normalized_status, posted_at DESC, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS gastos_bank_transaction_raw_uidx
  ON public.gastos(bank_transaction_raw_id)
  WHERE bank_transaction_raw_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ingresos_bank_transaction_raw_uidx
  ON public.ingresos(bank_transaction_raw_id)
  WHERE bank_transaction_raw_id IS NOT NULL;
