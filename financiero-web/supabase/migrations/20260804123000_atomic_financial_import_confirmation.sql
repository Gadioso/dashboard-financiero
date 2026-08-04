-- A confirmed import is indivisible: movements, row state, batch state and
-- affected monthly budgets commit together or roll back together.
create or replace function public.confirm_financial_import(
  p_profile_id uuid,
  p_batch_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_expected integer;
  v_imported_expenses integer := 0;
  v_imported_income integer := 0;
  v_duplicates integer := 0;
  v_skipped integer := 0;
  v_month date;
  v_income numeric;
begin
  select status into v_status from public.financial_import_batches
   where id = p_batch_id and profile_id = p_profile_id for update;
  if not found then raise exception 'IMPORT_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_status = 'confirmed' then
    return jsonb_build_object('already_confirmed', true);
  end if;
  if v_status not in ('preview', 'processing') then raise exception 'IMPORT_NOT_CONFIRMABLE' using errcode = 'P0001'; end if;

  select count(*) into v_expected from jsonb_to_recordset(p_rows) as x(id bigint);
  if v_expected = 0 then raise exception 'IMPORT_EMPTY_SELECTION' using errcode = '22023'; end if;
  if (select count(*) from public.financial_import_rows r join jsonb_to_recordset(p_rows) as x(id bigint) on x.id = r.id where r.batch_id = p_batch_id and r.profile_id = p_profile_id) <> v_expected then
    raise exception 'IMPORT_ROWS_CHANGED' using errcode = 'P0001';
  end if;

  with selected as (
    select * from jsonb_to_recordset(p_rows) as x(id bigint, include boolean, movement_type text, occurred_at timestamptz, description text, amount numeric, category text, subcategory text, currency text, fingerprint text)
    where include and movement_type = 'gasto'
  ), inserted as (
    insert into public.gastos(profile_id, concepto, monto, categoria, subcategoria, origen, fecha, import_batch_id, import_fingerprint)
    select p_profile_id, description, amount, category, subcategory, 'Archivo', occurred_at, p_batch_id, fingerprint from selected where movement_type = 'gasto'
    on conflict (profile_id, import_fingerprint) where import_fingerprint is not null do nothing
    returning import_fingerprint
  ), updated as (
    update public.financial_import_rows r set status = case when i.import_fingerprint is null then 'duplicate' else 'imported' end,
      target_table = case when i.import_fingerprint is null then null else 'gastos' end, updated_at = now()
    from selected s left join inserted i on i.import_fingerprint = s.fingerprint
    where r.id = s.id and r.profile_id = p_profile_id and r.batch_id = p_batch_id
    returning r.status
  ) select count(*) filter (where status = 'imported'), count(*) filter (where status = 'duplicate') into v_imported_expenses, v_duplicates from updated;

  with selected as (
    select * from jsonb_to_recordset(p_rows) as x(id bigint, include boolean, movement_type text, occurred_at timestamptz, description text, amount numeric, category text, subcategory text, currency text, fingerprint text)
    where include and movement_type = 'ingreso'
  ), inserted as (
    insert into public.ingresos(profile_id, concepto, monto, tipo, origen, fecha, import_batch_id, import_fingerprint)
    select p_profile_id, description, amount, coalesce(nullif(subcategory, ''), 'Importado'), 'Archivo', occurred_at, p_batch_id, fingerprint from selected where movement_type = 'ingreso'
    on conflict (profile_id, import_fingerprint) where import_fingerprint is not null do nothing
    returning import_fingerprint
  ), updated as (
    update public.financial_import_rows r set status = case when i.import_fingerprint is null then 'duplicate' else 'imported' end,
      target_table = case when i.import_fingerprint is null then null else 'ingresos' end, updated_at = now()
    from selected s left join inserted i on i.import_fingerprint = s.fingerprint
    where r.id = s.id and r.profile_id = p_profile_id and r.batch_id = p_batch_id
    returning r.status
  ) select count(*) filter (where status = 'imported'), count(*) filter (where status = 'duplicate') into v_imported_income, v_skipped from updated;
  v_duplicates := v_duplicates + v_skipped;

  update public.financial_import_rows r set status = 'skipped', updated_at = now()
  from jsonb_to_recordset(p_rows) as x(id bigint, include boolean)
  where r.id = x.id and not x.include and r.profile_id = p_profile_id and r.batch_id = p_batch_id;
  get diagnostics v_skipped = row_count;

  for v_month in select distinct date_trunc('month', fecha)::date from public.ingresos where profile_id = p_profile_id and import_batch_id = p_batch_id loop
    select coalesce(sum(monto), 0) into v_income from public.ingresos
      where profile_id = p_profile_id and fecha >= v_month and fecha < (v_month + interval '1 month');
    insert into public.presupuestos_mensuales(profile_id, mes_anio, techo_vida, techo_placeres, techo_futuro, fase_ahorro)
    values (p_profile_id, v_month, v_income * .50, v_income * .25, v_income * .25, 'Regla 50/25/25 activa')
    on conflict (profile_id, mes_anio) where profile_id is not null do update set
      techo_vida = excluded.techo_vida, techo_placeres = excluded.techo_placeres, techo_futuro = excluded.techo_futuro, fase_ahorro = excluded.fase_ahorro;
  end loop;

  update public.financial_import_batches set status = 'confirmed', confirmed_at = now(), updated_at = now(),
    summary = jsonb_build_object('imported', v_imported_expenses + v_imported_income, 'expenses', v_imported_expenses, 'income', v_imported_income, 'duplicates', v_duplicates, 'skipped', v_skipped)
  where id = p_batch_id and profile_id = p_profile_id;
  return jsonb_build_object('already_confirmed', false, 'imported', v_imported_expenses + v_imported_income, 'expenses', v_imported_expenses, 'income', v_imported_income, 'duplicates', v_duplicates, 'skipped', v_skipped);
end;
$$;

revoke all on function public.confirm_financial_import(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.confirm_financial_import(uuid, uuid, jsonb) to service_role;
