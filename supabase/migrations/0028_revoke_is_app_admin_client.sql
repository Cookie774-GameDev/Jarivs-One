-- =============================================================================
-- 0028_revoke_is_app_admin_client: stop admin-list probing by end users
-- =============================================================================
-- is_app_admin is SECURITY DEFINER and only needs service_role (edge functions
-- call it with the service key). Granting EXECUTE to authenticated let any
-- signed-in user probe whether an arbitrary UUID is an admin via PostgREST.
-- Edge functions are unaffected.

revoke all on function public.is_app_admin(uuid) from public, anon, authenticated;
grant execute on function public.is_app_admin(uuid) to service_role;

comment on function public.is_app_admin(uuid) is
  'Service-role only. Edge functions check app_admins; clients must not call this RPC.';

-- past_due keeps paid access during Stripe dunning (align with webhook rules).
create or replace function public.hive_plan_for_user(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.plan
       from public.subscriptions s
      where s.user_id = p_user_id
        and s.status in ('active', 'trialing', 'past_due')
      order by s.current_period_end desc nulls last
      limit 1),
    (select p.tier from public.profiles p where p.id = p_user_id),
    'free'
  );
$$;
