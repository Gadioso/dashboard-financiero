-- Concurrency and atomicity hardening for money-adjacent operations.
-- These functions are deliberately service-role only: API routes validate the
-- authenticated profile before invoking them.

create unique index if not exists billing_credit_ledger_monthly_allowance_uidx
  on public.billing_credit_ledger(profile_id, source, period_start)
  where source = 'monthly_plan' and period_start is not null;

create or replace function public.consume_ai_credits(
  p_profile_id uuid,
  p_period_start date,
  p_allowance integer,
  p_credits integer default 1
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance integer;
begin
  if p_credits <= 0 or p_allowance < 0 then
    raise exception 'Invalid credit request' using errcode = '22023';
  end if;

  -- A transaction-scoped lock serializes allowance seeding and debit checks
  -- for this profile, including when no ledger row exists yet.
  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 0));

  insert into public.billing_credit_ledger(profile_id, credits, source, period_start)
  values (p_profile_id, p_allowance, 'monthly_plan', p_period_start)
  on conflict (profile_id, source, period_start)
    where source = 'monthly_plan' and period_start is not null
    do nothing;

  select coalesce(sum(credits), 0)::integer
    into v_balance
    from public.billing_credit_ledger
   where profile_id = p_profile_id;

  if v_balance < p_credits then
    raise exception 'AI_CREDITS_EXHAUSTED' using errcode = 'P0001';
  end if;

  insert into public.billing_credit_ledger(profile_id, credits, source)
  values (p_profile_id, -p_credits, 'ai_usage');

  return v_balance - p_credits;
end;
$$;

revoke all on function public.consume_ai_credits(uuid, date, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_credits(uuid, date, integer, integer) to service_role;

-- Existing installations may predate the scoped unique index. Deduplicate
-- safely before enforcing it; the retained row is the newest representation.
delete from public.presupuestos_mensuales older
using public.presupuestos_mensuales newer
where older.profile_id = newer.profile_id
  and older.mes_anio = newer.mes_anio
  and older.id < newer.id;

create unique index if not exists presupuestos_profile_mes_nonnull_uidx
  on public.presupuestos_mensuales(profile_id, mes_anio)
  where profile_id is not null;
