-- Syncfy updates its own data on the provider schedule and notifies this app
-- with a refresh webhook. App-initiated minute polling creates paid pulls even
-- when the bank has no new movements, so remove the minute scheduler.
DO $$
DECLARE
  existing_job bigint;
BEGIN
  SELECT jobid
  INTO existing_job
  FROM cron.job
  WHERE jobname = 'bank-sync-every-minute'
  LIMIT 1;

  IF existing_job IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job);
  END IF;
END $$;
