-- AI output is a proposal, never an accounting write. A preview can only be
-- applied once and its transition plus inserts occur in one transaction.
create table if not exists public.financial_movement_previews (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null check (channel in ('web', 'telegram')),
  confirmation_token text not null unique,
  status text not null default 'preview' check (status in ('preview', 'confirmed', 'cancelled', 'expired')),
  movements jsonb not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);

create index if not exists financial_movement_previews_profile_status_idx
  on public.financial_movement_previews(profile_id, status, created_at desc);

alter table public.financial_movement_previews enable row level security;
revoke all on public.financial_movement_previews from anon, authenticated;
grant all on public.financial_movement_previews to service_role;

create or replace function public.confirm_financial_movement_preview(
  p_profile_id uuid,
  p_preview_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_preview public.financial_movement_previews%rowtype;
  v_movement jsonb;
  v_imported integer := 0;
begin
  select * into v_preview
  from public.financial_movement_previews
  where id = p_preview_id and profile_id = p_profile_id
  for update;

  if not found then raise exception 'PREVIEW_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_preview.status = 'confirmed' then
    return jsonb_build_object('already_confirmed', true, 'imported', 0);
  end if;
  if v_preview.status <> 'preview' or v_preview.expires_at < now() then
    raise exception 'PREVIEW_NOT_CONFIRMABLE' using errcode = 'P0001';
  end if;

  for v_movement in select value from jsonb_array_elements(v_preview.movements) loop
    if v_movement->>'movementType' = 'gasto' then
      insert into public.gastos(profile_id, concepto, monto, categoria, subcategoria, origen, fecha, import_fingerprint)
      values (p_profile_id, v_movement->>'description', (v_movement->>'amount')::numeric,
        v_movement->>'category', v_movement->>'subcategory',
        case when v_preview.channel = 'telegram' then 'Telegram' else 'Web' end,
        (v_movement->>'occurredAt')::timestamptz, v_movement->>'fingerprint')
      on conflict (profile_id, import_fingerprint) where import_fingerprint is not null do nothing;
    elsif v_movement->>'movementType' = 'ingreso' then
      insert into public.ingresos(profile_id, concepto, monto, tipo, origen, fecha, import_fingerprint)
      values (p_profile_id, v_movement->>'description', (v_movement->>'amount')::numeric,
        coalesce(nullif(v_movement->>'subcategory', ''), 'Extra'),
        case when v_preview.channel = 'telegram' then 'Telegram' else 'Web' end,
        (v_movement->>'occurredAt')::timestamptz, v_movement->>'fingerprint')
      on conflict (profile_id, import_fingerprint) where import_fingerprint is not null do nothing;
    elsif v_movement->>'movementType' = 'abono_tarjeta' then
      insert into public.abonos_tarjeta_credito(profile_id, concepto, monto, tarjeta, origen, fecha)
      values (p_profile_id, v_movement->>'description', (v_movement->>'amount')::numeric,
        'Tarjeta de crédito', case when v_preview.channel = 'telegram' then 'Telegram' else 'Web' end,
        (v_movement->>'occurredAt')::timestamptz);
    end if;
    v_imported := v_imported + 1;
  end loop;

  update public.financial_movement_previews
     set status = 'confirmed', confirmed_at = now()
   where id = v_preview.id;
  return jsonb_build_object('already_confirmed', false, 'imported', v_imported);
end;
$$;

revoke all on function public.confirm_financial_movement_preview(uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_financial_movement_preview(uuid, uuid) to service_role;
