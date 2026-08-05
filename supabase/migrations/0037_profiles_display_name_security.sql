-- =============================================================================
-- 0037_profiles_display_name_security
-- Account Center profile hydration and display-name persistence.
-- =============================================================================
-- public.profiles.display_name is the user-editable source of truth.
-- auth.users.raw_user_meta_data.display_name is a non-authoritative mirror and
-- signup seed only. Billing fields remain writable only by trusted server roles.

set lock_timeout = '5s';
set statement_timeout = '30s';

alter table public.profiles enable row level security;

drop policy if exists "own profile" on public.profiles;
drop policy if exists profiles_owner_select on public.profiles;
drop policy if exists profiles_owner_update on public.profiles;

create policy profiles_owner_select
  on public.profiles
  for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and (select auth.uid()) = id
  );

create policy profiles_owner_update
  on public.profiles
  for update
  to authenticated
  using (
    (select auth.uid()) is not null
    and (select auth.uid()) = id
  )
  with check (
    (select auth.uid()) is not null
    and (select auth.uid()) = id
  );

-- PostgREST/Data API exposure is explicit so this remains correct as Supabase
-- phases out automatic grants. Authenticated clients can read their RLS-scoped
-- row and update only display_name. They cannot insert/delete profiles or write
-- tier, quota, Stripe identity, timestamps, or other server-owned columns.
revoke all on table public.profiles from public;
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

comment on column public.profiles.display_name is
  'User-editable Account Center display name and authoritative profile-name source.';

reset statement_timeout;
reset lock_timeout;
