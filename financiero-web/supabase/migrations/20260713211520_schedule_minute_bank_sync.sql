-- Vercel Hobby only permits daily crons. Supabase Cron invokes a small,
-- authenticated Edge Function every minute; the Edge Function signs the
-- request to the existing Vercel auto-sync route with HMAC-SHA256.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
DECLARE
  project_url_id uuid;
  scheduler_secret_id uuid;
BEGIN
  SELECT id INTO project_url_id FROM vault.secrets WHERE name = 'bank_sync_project_url' LIMIT 1;
  IF project_url_id IS NULL THEN
    PERFORM vault.create_secret('https://goralfhisudzilfortuk.supabase.co', 'bank_sync_project_url', 'Project URL for minute bank synchronization');
  ELSE
    PERFORM vault.update_secret(project_url_id, 'https://goralfhisudzilfortuk.supabase.co', 'bank_sync_project_url', 'Project URL for minute bank synchronization');
  END IF;

  SELECT id INTO scheduler_secret_id FROM vault.secrets WHERE name = 'bank_sync_scheduler_secret' LIMIT 1;
  IF scheduler_secret_id IS NULL THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'bank_sync_scheduler_secret',
      'Private shared secret for the minute bank scheduler'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_bank_sync_scheduler_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'bank_sync_scheduler_secret'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_bank_sync_scheduler_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_bank_sync_scheduler_secret() TO service_role;

DO $$
DECLARE
  existing_job bigint;
BEGIN
  SELECT jobid INTO existing_job FROM cron.job WHERE jobname = 'bank-sync-every-minute' LIMIT 1;
  IF existing_job IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job);
  END IF;
END $$;

SELECT cron.schedule(
  'bank-sync-every-minute',
  '* * * * *',
  $schedule$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'bank_sync_project_url') || '/functions/v1/bank-sync-scheduler',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-bank-scheduler-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'bank_sync_scheduler_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 55000
    );
  $schedule$
);
