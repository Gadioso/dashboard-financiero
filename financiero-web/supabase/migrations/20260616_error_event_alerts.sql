-- Error event alerting state.

ALTER TABLE public.error_events
  ADD COLUMN IF NOT EXISTS alerted_at timestamptz;

CREATE INDEX IF NOT EXISTS error_events_unalerted_idx
  ON public.error_events(severity, created_at DESC)
  WHERE alerted_at IS NULL AND resolved_at IS NULL;
