-- Virafi no longer offers real-time bank aggregation. Preserve canonical
-- gastos, ingresos, goals and transaction splits while removing only their
-- links to imported bank rows and all provider-owned banking data.

do $$
declare
  scheduled_job record;
begin
  for scheduled_job in
    select jobid
    from cron.job
    where jobname ilike '%syncfy%'
       or command ilike '%syncfy%'
       or command ilike '%bank-sync%'
  loop
    perform cron.unschedule(scheduled_job.jobid);
  end loop;
end
$$;

drop function if exists public.get_bank_sync_scheduler_secret();

delete from public.financial_goal_contributions
where source = 'bank_transaction';

alter table if exists public.financial_goal_contributions
  drop column if exists bank_transaction_id;

alter table if exists public.financial_goal_contributions
  drop constraint if exists financial_goal_contributions_source_check;

alter table if exists public.financial_goal_contributions
  add constraint financial_goal_contributions_source_check
  check (source in ('manual', 'investment_transaction', 'adjustment'));

alter table if exists public.gastos
  drop column if exists bank_transaction_raw_id;

alter table if exists public.ingresos
  drop column if exists bank_transaction_raw_id;

alter table if exists public.transaction_splits
  drop column if exists bank_transaction_raw_id;

drop table if exists public.movement_notification_deliveries;
drop table if exists public.bank_sync_runs;
drop table if exists public.bank_transactions_raw;
drop table if exists public.bank_accounts;
drop table if exists public.bank_connections;
drop table if exists public.syncfy_users;

delete from vault.secrets
where name in ('bank_sync_project_url', 'bank_sync_scheduler_secret');
