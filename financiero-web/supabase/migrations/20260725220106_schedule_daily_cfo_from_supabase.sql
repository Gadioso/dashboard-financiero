-- Vercel Hobby only accepts daily schedules. Supabase Cron evaluates the
-- per-profile, variable delivery window every 15 minutes instead.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
DECLARE
  app_url_id uuid;
BEGIN
  SELECT id INTO app_url_id FROM vault.secrets WHERE name = 'daily_cfo_app_url' LIMIT 1;
  IF app_url_id IS NULL THEN
    PERFORM vault.create_secret('https://virafi.com', 'daily_cfo_app_url', 'Stable Virafi URL for the daily CFO scheduler');
  ELSE
    PERFORM vault.update_secret(app_url_id, 'https://virafi.com', 'daily_cfo_app_url', 'Stable Virafi URL for the daily CFO scheduler');
  END IF;
END $$;

DO $$
DECLARE
  existing_job bigint;
BEGIN
  SELECT jobid INTO existing_job FROM cron.job WHERE jobname = 'virafia-daily-cfo-quarter-hour' LIMIT 1;
  IF existing_job IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job);
  END IF;
END $$;

SELECT cron.schedule(
  'virafia-daily-cfo-quarter-hour',
  '*/15 * * * *',
  $schedule$
    SELECT net.http_get(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'daily_cfo_app_url') || '/api/agents/daily-cfo',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'daily_cfo_cron_secret')
      ),
      timeout_milliseconds := 120000
    );
  $schedule$
);
