-- Atomically return an authenticated user's computed access decision together
-- with the entitlement revision that the offline lease issuer must sign.
--
-- The row lock serializes this snapshot with webhook/service-role entitlement
-- mutations. The caller cannot select another account: identity is auth.uid().

create or replace function public.get_app_access_lease_snapshot(
  p_app_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_response jsonb;
  v_revision bigint;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- Ensure there is a row to lock even while the launch gate is disabled.
  insert into public.app_access_entitlements (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  perform 1
    from public.app_access_entitlements
   where user_id = v_user_id
   for update;

  v_response := public.app_access_compute(v_user_id, true, p_app_version);
  if jsonb_typeof(v_response) <> 'object'
     or not (v_response ? 'status')
     or not (v_response ? 'canUseApp') then
    raise exception 'invalid app access response';
  end if;

  select revision
    into v_revision
    from public.app_access_entitlements
   where user_id = v_user_id;

  if v_revision is null or v_revision < 0 then
    raise exception 'invalid app access revision';
  end if;

  return v_response || jsonb_build_object('revision', v_revision);
end;
$$;

comment on function public.get_app_access_lease_snapshot(text) is
  'Authenticated, row-locked app-access decision plus monotonic entitlement revision for signed offline leases.';

revoke all on function public.get_app_access_lease_snapshot(text) from public;
revoke all on function public.get_app_access_lease_snapshot(text) from anon;
revoke all on function public.get_app_access_lease_snapshot(text) from authenticated;
grant execute on function public.get_app_access_lease_snapshot(text) to authenticated;

