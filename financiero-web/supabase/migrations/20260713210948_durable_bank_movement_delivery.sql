-- Durable, idempotent Telegram delivery for every movement imported from a bank.
-- Syncfy credentials remain at the provider; these fields only track refresh cadence.

ALTER TABLE public.bank_connections
  ADD COLUMN IF NOT EXISTS last_pull_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_pull_at timestamptz;

CREATE TABLE IF NOT EXISTS public.movement_notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bank_transaction_raw_id uuid REFERENCES public.bank_transactions_raw(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'telegram' CHECK (channel IN ('telegram')),
  dedup_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  last_attempt_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (profile_id, channel, dedup_key)
);

CREATE INDEX IF NOT EXISTS movement_notification_deliveries_due_idx
  ON public.movement_notification_deliveries(status, next_attempt_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS movement_notification_deliveries_profile_idx
  ON public.movement_notification_deliveries(profile_id, created_at DESC);

ALTER TABLE public.movement_notification_deliveries ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.movement_notification_deliveries TO authenticated, service_role;

DROP POLICY IF EXISTS "Movement deliveries belong to authenticated profile" ON public.movement_notification_deliveries;
CREATE POLICY "Movement deliveries belong to authenticated profile"
  ON public.movement_notification_deliveries
  FOR ALL
  TO authenticated
  USING (profile_id = (SELECT auth.uid()))
  WITH CHECK (profile_id = (SELECT auth.uid()));

-- Recover the recent observations that existed before durable delivery was added.
INSERT INTO public.movement_notification_deliveries (
  profile_id,
  bank_transaction_raw_id,
  channel,
  dedup_key,
  payload
)
SELECT
  transaction.profile_id,
  transaction.id,
  'telegram',
  'bank:' || transaction.id::text,
  jsonb_build_object(
    'description', transaction.description,
    'amount', transaction.amount,
    'currency', coalesce(transaction.currency, 'MXN'),
    'postedAt', transaction.posted_at,
    'institution', coalesce(connection.institution_name, 'Banco'),
    'normalizedStatus', transaction.normalized_status
  )
FROM public.bank_transactions_raw transaction
LEFT JOIN public.bank_connections connection ON connection.id = transaction.connection_id
WHERE transaction.created_at >= timezone('utc', now()) - interval '3 days'
ON CONFLICT (profile_id, channel, dedup_key) DO NOTHING;
