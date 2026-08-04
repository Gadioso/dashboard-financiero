-- Deletes all relational profile data in one transaction. Storage is handled
-- by the API first because Storage object deletion must use its API.
create or replace function public.purge_profile_data(p_profile_id uuid, p_tables text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table text;
  v_count bigint;
  v_result jsonb := '{}'::jsonb;
begin
  foreach v_table in array p_tables loop
    if to_regclass('public.' || v_table) is null then
      continue;
    end if;
    execute format('delete from public.%I where profile_id = $1', v_table)
      using p_profile_id;
    get diagnostics v_count = row_count;
    v_result := v_result || jsonb_build_object(v_table, v_count);
  end loop;

  delete from public.profiles where id = p_profile_id;
  get diagnostics v_count = row_count;
  return v_result || jsonb_build_object('profiles', v_count);
end;
$$;

revoke all on function public.purge_profile_data(uuid, text[]) from public, anon, authenticated;
grant execute on function public.purge_profile_data(uuid, text[]) to service_role;
