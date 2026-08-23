-- Service-only authoritative access lookup for signature-verified remote
-- messaging webhooks. This never grants a client the ability to choose a user.

create or replace function public.get_remote_jarvis_app_access(
  p_user_id uuid,
  p_app_version text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'p_user_id is required' using errcode = '22023';
  end if;
  return public.app_access_compute(p_user_id, true, p_app_version);
end;
$$;

revoke all on function public.get_remote_jarvis_app_access(uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_remote_jarvis_app_access(uuid, text) to service_role;
