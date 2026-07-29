-- Supabase is the single scheduler. Jobs call the stable public application
-- domain, so changing the underlying host from Vercel to Railway only requires
-- moving virafi.com; no scheduler rewrite is needed.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare
  app_url_id uuid;
  job_record record;
begin
  select id into app_url_id from vault.secrets where name = 'daily_cfo_app_url' limit 1;
  if app_url_id is null then
    perform vault.create_secret('https://virafi.com', 'daily_cfo_app_url', 'Stable public Virafi URL');
  else
    perform vault.update_secret(app_url_id, 'https://virafi.com', 'daily_cfo_app_url', 'Stable public Virafi URL');
  end if;

  for job_record in
    select jobid from cron.job
    where jobname in ('virafi-error-alerts-daily', 'virafi-market-sync-daily', 'virafi-syncfy-reconcile-daily')
  loop
    perform cron.unschedule(job_record.jobid);
  end loop;
end $$;

select cron.schedule(
  'virafi-error-alerts-daily',
  '15 13 * * *',
  $schedule$
    select net.http_get(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'daily_cfo_app_url') || '/api/ops/error-alerts',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'daily_cfo_cron_secret')
      ),
      timeout_milliseconds := 120000
    );
  $schedule$
);

select cron.schedule(
  'virafi-market-sync-daily',
  '30 13 * * *',
  $schedule$
    select net.http_get(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'daily_cfo_app_url') || '/api/investments/market-sync',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'daily_cfo_cron_secret')
      ),
      timeout_milliseconds := 120000
    );
  $schedule$
);
