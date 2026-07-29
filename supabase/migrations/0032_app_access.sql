-- =============================================================================
-- 0032_app_access: VibeSpace Access entitlements, launch config, audit events,
--                  server-authoritative trial/grace derivation, and current
--                  status RPC.
-- =============================================================================
-- Scope (additive only): this migration NEVER touches profiles.tier or any
-- existing feature-tier object. VibeSpace Access is a SEPARATE $20/month app
-- entitlement (ACCESS-203..206); the app-access Stripe price is classified and
-- stored here, not mapped into profiles.tier, and feature tiers keep working.
--
-- Authoritative contracts implemented (from the Access master goal):
--   AppAccessLaunchConfig { enabled, launchAt, minimumVersion, trialDays(30),
--                           graceDays(3), monthlyPriceUsd(20),
--                           require_payment_method_for_trial }
--   AppAccessStatus = prelaunch | trialing | active | cancel_at_period_end |
--                     past_due | grace | locked | admin | internal | unknown
--   AppAccessResponse { status, enabled, serverTime, trialEndsAt?,
--                       currentPeriodEndsAt?, graceEndsAt?, daysRemaining?,
--                       canUseApp, canEdit, canExport, requiresCheckout,
--                       checkoutReason? }
--
-- SECURITY INVARIANTS (enforced here, not by clients):
--   * RLS is enabled on EVERY public table created below.
--   * Clients (authenticated) get an explicit SELECT table grant + an owner-only
--     self-read policy. Supabase's 2026 explicit Data API grants change means
--     table access is granted separately from RLS; we grant SELECT only.
--   * authenticated/anon receive NO INSERT/UPDATE/DELETE table grant and NO
--     client write policy: there is no user self-write of entitlement state.
--   * The service role retains the webhook/admin write path (it bypasses RLS
--     and is also granted EXECUTE on the server-only RPCs). An explicit
--     service_role policy documents that boundary.
--   * Authorization never uses raw_user_meta_data / user_metadata (user-editable)
--     and never uses auth.role() (deprecated; breaks with anonymous sign-in).
--     Admin comes from the server-controlled app_admins table; internal comes
--     from auth.users.raw_app_meta_data (app_metadata) read server-side.
--   * Every function pins a fixed search_path (no mutable search_path). The
--     status RPC is SECURITY DEFINER but takes NO user parameter (it always
--     uses (select auth.uid())), revokes PUBLIC/anon EXECUTE, and is granted
--     only to authenticated, so it is not an IDOR / unsafe public definer.
--   * Audit events store only minimal typed fields; NO raw Stripe payloads.
--     Provider (Stripe) event ids dedupe webhook re-delivery via a unique
--     constraint (multiple NULLs allowed for server-generated events).
--   * Launch config is disabled by default and is the authoritative gate; the
--     client build flag is not authoritative and cannot reset the trial.
-- All DDL is idempotent.
-- =============================================================================

set lock_timeout = '5s';
set statement_timeout = '60s';

create extension if not exists pgcrypto;

-- =============================================================================
-- 1. Launch configuration (authoritative, disabled by default)
-- =============================================================================
create table if not exists public.app_access_launch_config (
  id integer primary key default 1 check (id = 1), -- singleton row
  enabled boolean not null default false,          -- gate off until admin launch
  launch_at timestamptz,                           -- optional scheduled go-live
  minimum_version text check (
    minimum_version is null or char_length(minimum_version) between 1 and 128
  ),                                               -- semver floor (server config)
  trial_days integer not null default 30 check (trial_days >= 0),
  grace_days integer not null default 3 check (grace_days >= 0),
  monthly_price_usd numeric(10, 2) not null default 20.00 check (monthly_price_usd >= 0),
  require_payment_method_for_trial boolean not null default false, -- payment-method policy
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.app_access_launch_config is
  'Authoritative VibeSpace Access launch gate. Disabled by default; clients cannot write.';

-- Seed the singleton (disabled) without clobbering an existing row.
insert into public.app_access_launch_config (id)
values (1)
on conflict (id) do nothing;

-- =============================================================================
-- 2. Entitlements (one row per user; server-owned state)
-- =============================================================================
create table if not exists public.app_access_entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null default 'unknown'
    check (status in ('prelaunch','trialing','active','cancel_at_period_end',
                      'past_due','grace','locked','admin','internal','unknown')),
  provider_status text check (
    provider_status is null or provider_status in (
      'trialing','active','past_due','canceled','unpaid',
      'incomplete','incomplete_expired','paused'
    )
  ),
  provider_status_updated_at timestamptz,
  access_ended_at timestamptz,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  trial_used_at timestamptz,        -- set once; the client can never reset it
  grace_started_at timestamptz,
  grace_ends_at timestamptz,
  stripe_customer_id text check (
    stripe_customer_id is null or char_length(stripe_customer_id) between 1 and 255
  ),
  stripe_subscription_id text check (
    stripe_subscription_id is null or char_length(stripe_subscription_id) between 1 and 255
  ),                                -- app-access subscription (separate from feature tiers)
  stripe_price_id text check (
    stripe_price_id is null or char_length(stripe_price_id) between 1 and 255
  ),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  last_payment_status text check (
    last_payment_status is null or char_length(last_payment_status) between 1 and 64
  ),                                -- e.g. succeeded / failed (minimal, no raw payload)
  locked_at timestamptz,
  server_checked_at timestamptz,    -- last trusted-server evaluation time
  revision bigint not null default 0, -- monotonic state revision for lease freshness
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (provider_status is null and provider_status_updated_at is null)
    or (provider_status is not null and provider_status_updated_at is not null)
  ),
  check (
    access_ended_at is null
    or provider_status in ('canceled','unpaid','incomplete_expired')
  ),
  check (
    trial_started_at is null or trial_ends_at is null
    or trial_started_at <= trial_ends_at
  ),
  check (
    grace_started_at is null or grace_ends_at is null
    or grace_started_at <= grace_ends_at
  ),
  check (
    current_period_start is null or current_period_end is null
    or current_period_start <= current_period_end
  )
);

comment on table public.app_access_entitlements is
  'Server-authoritative VibeSpace Access state. Owner self-read only; service role writes.';
comment on column public.app_access_entitlements.trial_used_at is
  'Set exactly once on first authenticated launch (or explicit server trial start); never client-reset.';
comment on column public.app_access_entitlements.revision is
  'Bumped only when authoritative entitlement state changes; timestamp-only checks do not invalidate leases.';

-- One Stripe app-access subscription maps to at most one entitlement.
create unique index if not exists app_access_entitlements_stripe_sub_uidx
  on public.app_access_entitlements (stripe_subscription_id)
  where stripe_subscription_id is not null;
create unique index if not exists app_access_entitlements_stripe_customer_uidx
  on public.app_access_entitlements (stripe_customer_id)
  where stripe_customer_id is not null;

create index if not exists app_access_entitlements_status_idx
  on public.app_access_entitlements (status);
create index if not exists app_access_entitlements_provider_status_idx
  on public.app_access_entitlements (provider_status, provider_status_updated_at);
create index if not exists app_access_entitlements_trial_ends_idx
  on public.app_access_entitlements (trial_ends_at);
create index if not exists app_access_entitlements_period_end_idx
  on public.app_access_entitlements (current_period_end);

-- =============================================================================
-- 3. Audit events (idempotent; minimal; no raw Stripe payloads)
-- =============================================================================
create table if not exists public.app_access_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null
    check (event_type in ('trial_started','checkout_created','payment_succeeded',
                          'payment_failed','subscription_cancelled','grace_started',
                          'grace_ended','lock_applied','access_restored','admin_override')),
  provider_event_id text check (
    provider_event_id is null or char_length(provider_event_id) between 1 and 255
  ),                                -- Stripe evt_... for webhook events; NULL for server events
  stripe_subscription_id text check (
    stripe_subscription_id is null or char_length(stripe_subscription_id) between 1 and 255
  ),
  status text check (status is null or char_length(status) between 1 and 64),
  reason text check (reason is null or char_length(reason) between 1 and 256),
                                      -- short non-sensitive reason/code
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- Provider event dedupe: unique non-null ids; multiple NULLs allowed.
  constraint app_access_events_provider_event_id_key unique (provider_event_id)
);

comment on table public.app_access_events is
  'Idempotent VibeSpace Access audit trail. Provider event ids dedupe webhook replays; no raw Stripe payloads are stored.';

create index if not exists app_access_events_user_idx
  on public.app_access_events (user_id, occurred_at desc);
create index if not exists app_access_events_type_idx
  on public.app_access_events (event_type, occurred_at desc);

-- =============================================================================
-- 4. Row Level Security + explicit Data API grants
-- =============================================================================
alter table public.app_access_launch_config enable row level security;
alter table public.app_access_entitlements enable row level security;
alter table public.app_access_events enable row level security;

-- Launch config: any signed-in user may read the gate; only service role writes.
drop policy if exists app_access_launch_config_select on public.app_access_launch_config;
create policy app_access_launch_config_select on public.app_access_launch_config
  for select to authenticated
  using (true);
drop policy if exists app_access_launch_config_service on public.app_access_launch_config;
create policy app_access_launch_config_service on public.app_access_launch_config
  for all to service_role
  using (true) with check (true);

-- Entitlements: owner-only self-read; service role manages rows.
drop policy if exists app_access_entitlements_owner_select on public.app_access_entitlements;
create policy app_access_entitlements_owner_select on public.app_access_entitlements
  for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists app_access_entitlements_service on public.app_access_entitlements;
create policy app_access_entitlements_service on public.app_access_entitlements
  for all to service_role
  using (true) with check (true);

-- Events: owner-only self-read; service role writes. No client writes anywhere.
drop policy if exists app_access_events_owner_select on public.app_access_events;
create policy app_access_events_owner_select on public.app_access_events
  for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists app_access_events_service on public.app_access_events;
drop policy if exists app_access_events_service_select on public.app_access_events;
drop policy if exists app_access_events_service_insert on public.app_access_events;
create policy app_access_events_service_select on public.app_access_events
  for select to service_role
  using (true);
create policy app_access_events_service_insert on public.app_access_events
  for insert to service_role
  with check (true);

-- Explicit table grants (Supabase 2026 Data API change): SELECT only for
-- authenticated; nothing for anon; no INSERT/UPDATE/DELETE for clients.
revoke all on table public.app_access_launch_config from public;
revoke all on table public.app_access_launch_config from anon;
revoke all on table public.app_access_launch_config from authenticated;
grant select on table public.app_access_launch_config to authenticated;
grant select, insert, update, delete on table public.app_access_launch_config to service_role;

revoke all on table public.app_access_entitlements from public;
revoke all on table public.app_access_entitlements from anon;
revoke all on table public.app_access_entitlements from authenticated;
grant select on table public.app_access_entitlements to authenticated;
grant select, insert, update, delete on table public.app_access_entitlements to service_role;

revoke all on table public.app_access_events from public;
revoke all on table public.app_access_events from anon;
revoke all on table public.app_access_events from authenticated;
grant select on table public.app_access_events to authenticated;
revoke all on table public.app_access_events from service_role;
grant select, insert on table public.app_access_events to service_role;

-- =============================================================================
-- 5. updated_at / revision triggers
-- =============================================================================
create or replace function public.app_access_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.app_access_entitlements_touch()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  -- A status read refreshes server_checked_at, but that alone must not create a
  -- new entitlement revision and invalidate an otherwise-current offline lease.
  if (to_jsonb(new) - 'updated_at' - 'server_checked_at' - 'revision')
       is distinct from
     (to_jsonb(old) - 'updated_at' - 'server_checked_at' - 'revision') then
    new.revision := coalesce(old.revision, 0) + 1;
  else
    new.revision := old.revision;
  end if;
  return new;
end;
$$;

drop trigger if exists app_access_launch_config_touch on public.app_access_launch_config;
create trigger app_access_launch_config_touch
  before update on public.app_access_launch_config
  for each row
  execute function public.app_access_touch_updated_at();

drop trigger if exists app_access_entitlements_touch on public.app_access_entitlements;
create trigger app_access_entitlements_touch
  before update on public.app_access_entitlements
  for each row
  execute function public.app_access_entitlements_touch();

-- =============================================================================
-- 6. Semantic-version comparator (server config, not string comparison)
-- =============================================================================
-- Returns TRUE when p_a >= p_b using bounded SemVer 2.0 precedence. A
-- NULL/empty p_b means "no minimum" (TRUE). Invalid versions fail closed.
-- Build metadata is ignored; prerelease identifiers follow SemVer numeric and
-- ASCII ordering, including the rule that a release outranks its prerelease.
create or replace function public.app_access_semver_gte(p_a text, p_b text)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_a text;
  v_b text;
  v_am text[];
  v_bm text[];
  v_apre text[];
  v_bpre text[];
  v_ai text;
  v_bi text;
  v_a_numeric boolean;
  v_b_numeric boolean;
  v_i integer;
  v_limit integer;
begin
  if p_b is null or btrim(p_b) = '' then
    return true;
  end if;
  if p_a is null or btrim(p_a) = '' then
    return false;
  end if;
  v_a := btrim(p_a);
  v_b := btrim(p_b);
  if v_a <> p_a or v_b <> p_b
     or char_length(v_a) > 128 or char_length(v_b) > 128 then
    return false;
  end if;

  -- Captures: 1 major, 2 minor, 3 patch, 5 prerelease. Build metadata is
  -- intentionally not captured because it has no precedence.
  v_am := regexp_match(
    v_a,
    '^([0-9]+)\.([0-9]+)\.([0-9]+)(-([0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*))?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$'
  );
  v_bm := regexp_match(
    v_b,
    '^([0-9]+)\.([0-9]+)\.([0-9]+)(-([0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*))?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$'
  );
  if v_am is null or v_bm is null then
    return false;
  end if;

  -- Core numeric identifiers may not contain leading zeroes.
  for v_i in 1..3 loop
    v_ai := v_am[v_i];
    v_bi := v_bm[v_i];
    if (char_length(v_ai) > 1 and left(v_ai, 1) = '0')
       or (char_length(v_bi) > 1 and left(v_bi, 1) = '0') then
      return false;
    end if;
  end loop;

  -- Compare digit length then bytes, avoiding fixed-width integer overflow.
  for v_i in 1..3 loop
    v_ai := v_am[v_i];
    v_bi := v_bm[v_i];
    if char_length(v_ai) > char_length(v_bi) then return true; end if;
    if char_length(v_ai) < char_length(v_bi) then return false; end if;
    if convert_to(v_ai, 'UTF8') > convert_to(v_bi, 'UTF8') then return true; end if;
    if convert_to(v_ai, 'UTF8') < convert_to(v_bi, 'UTF8') then return false; end if;
  end loop;

  if v_am[5] is null and v_bm[5] is null then return true; end if;
  if v_am[5] is null then return true; end if;
  if v_bm[5] is null then return false; end if;

  v_apre := string_to_array(v_am[5], '.');
  v_bpre := string_to_array(v_bm[5], '.');
  foreach v_ai in array v_apre loop
    if v_ai ~ '^[0-9]+$' and char_length(v_ai) > 1 and left(v_ai, 1) = '0' then
      return false;
    end if;
  end loop;
  foreach v_bi in array v_bpre loop
    if v_bi ~ '^[0-9]+$' and char_length(v_bi) > 1 and left(v_bi, 1) = '0' then
      return false;
    end if;
  end loop;
  v_limit := least(array_length(v_apre, 1), array_length(v_bpre, 1));
  for v_i in 1..v_limit loop
    v_ai := v_apre[v_i];
    v_bi := v_bpre[v_i];
    v_a_numeric := v_ai ~ '^[0-9]+$';
    v_b_numeric := v_bi ~ '^[0-9]+$';
    if v_a_numeric and not v_b_numeric then return false; end if;
    if not v_a_numeric and v_b_numeric then return true; end if;
    if v_a_numeric then
      if char_length(v_ai) > char_length(v_bi) then return true; end if;
      if char_length(v_ai) < char_length(v_bi) then return false; end if;
    end if;
    if convert_to(v_ai, 'UTF8') > convert_to(v_bi, 'UTF8') then return true; end if;
    if convert_to(v_ai, 'UTF8') < convert_to(v_bi, 'UTF8') then return false; end if;
  end loop;
  if array_length(v_apre, 1) > array_length(v_bpre, 1) then return true; end if;
  if array_length(v_apre, 1) < array_length(v_bpre, 1) then return false; end if;
  return true;
end;
$$;

revoke all on function public.app_access_semver_gte(text, text) from public, anon, authenticated;
grant execute on function public.app_access_semver_gte(text, text) to service_role;

-- =============================================================================
-- 7. Internal: build an AppAccessResponse jsonb (single source of truth)
-- =============================================================================
create or replace function public.app_access_response_jsonb(
  p_status text,
  p_enabled boolean,
  p_server_time timestamptz,
  p_trial_ends_at timestamptz,
  p_current_period_ends_at timestamptz,
  p_grace_ends_at timestamptz,
  p_days_remaining integer,
  p_can_use_app boolean,
  p_can_edit boolean,
  p_can_export boolean,
  p_requires_checkout boolean,
  p_checkout_reason text
)
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'status', p_status,
    'enabled', p_enabled,
    'serverTime', to_char(p_server_time at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'trialEndsAt', case when p_trial_ends_at is null then null
      else to_char(p_trial_ends_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
    'currentPeriodEndsAt', case when p_current_period_ends_at is null then null
      else to_char(p_current_period_ends_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
    'graceEndsAt', case when p_grace_ends_at is null then null
      else to_char(p_grace_ends_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
    'daysRemaining', p_days_remaining,
    'canUseApp', p_can_use_app,
    'canEdit', p_can_edit,
    'canExport', p_can_export,
    'requiresCheckout', p_requires_checkout,
    'checkoutReason', p_checkout_reason
  ));
$$;

revoke all on function public.app_access_response_jsonb(
  text, boolean, timestamptz, timestamptz, timestamptz, timestamptz,
  integer, boolean, boolean, boolean, boolean, text
) from public, anon, authenticated;
grant execute on function public.app_access_response_jsonb(
  text, boolean, timestamptz, timestamptz, timestamptz, timestamptz,
  integer, boolean, boolean, boolean, boolean, text
) to service_role;

-- =============================================================================
-- 8. Internal: idempotent audit-event writer (service role only)
-- =============================================================================
-- Re-delivered webhook events (same provider_event_id) are a no-op via the
-- unique constraint. Server-generated events pass NULL provider_event_id and
-- are recorded by the caller only on a genuine state transition.
create or replace function public.app_access_record_event(
  p_user_id uuid,
  p_event_type text,
  p_provider_event_id text default null,
  p_stripe_subscription_id text default null,
  p_status text default null,
  p_reason text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.app_access_events (
    user_id, event_type, provider_event_id, stripe_subscription_id, status, reason
  ) values (
    p_user_id, p_event_type, p_provider_event_id, p_stripe_subscription_id, p_status, p_reason
  )
  on conflict (provider_event_id) do nothing;
end;
$$;

revoke all on function public.app_access_record_event(uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.app_access_record_event(uuid, text, text, text, text, text)
  to service_role;

-- =============================================================================
-- 9. Core: server-authoritative status derivation + first-launch trial start
-- =============================================================================
-- Single source of truth used by both the client-facing get_app_access(text) (which
-- passes the caller's own (select auth.uid())) and the service-role-only
-- start_app_access_trial(p_user_id). p_start_trial_if_eligible starts the trial
-- on first authenticated launch (the recommended server event) exactly once.
create or replace function public.app_access_compute(
  p_user_id uuid,
  p_start_trial_if_eligible boolean default false,
  p_app_version text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := now();
  v_cfg record;
  v_ent record;
  v_status text := 'unknown';
  v_enabled boolean := false;
  v_trial_ends timestamptz;
  v_period_end timestamptz;
  v_grace_end timestamptz;
  v_ent_end timestamptz;
  v_days_remaining integer;
  v_can_use boolean := false;
  v_can_edit boolean := false;
  v_can_export boolean := false;
  v_requires_checkout boolean := false;
  v_checkout_reason text;
  v_app_role text;
  v_is_verified boolean := false;
begin
  if p_user_id is null then
    return public.app_access_response_jsonb(
      'unknown', false, v_now, null, null, null, null,
      false, false, false, false, null);
  end if;

  -- Authoritative launch config (singleton). Missing row fails closed to prelaunch.
  select enabled, launch_at, minimum_version, trial_days, grace_days
    into v_cfg
    from public.app_access_launch_config
   where id = 1;

  v_enabled := coalesce(v_cfg.enabled, false);

  -- Admin / internal bypass from server-controlled sources only.
  if public.is_app_admin(p_user_id) then
    return public.app_access_response_jsonb(
      'admin', v_enabled, v_now, null, null, null, null,
      true, true, true, false, null);
  end if;

  select raw_app_meta_data->>'app_access_role'
    into v_app_role
    from auth.users
   where id = p_user_id;
  if v_app_role = 'internal' then
    return public.app_access_response_jsonb(
      'internal', v_enabled, v_now, null, null, null, null,
      true, true, true, false, null);
  end if;

  -- Prelaunch gate: disabled config or launch_at still in the future.
  -- Existing behavior remains; dev/beta builds are not locked; no trial starts.
  if (not v_enabled)
     or (v_cfg.launch_at is not null and v_now < v_cfg.launch_at) then
    return public.app_access_response_jsonb(
      'prelaunch', false, v_now, null, null, null, null,
      true, true, true, false, null);
  end if;

  -- Builds below the server-configured activation floor stay outside the gate.
  -- Missing or malformed versions also stay usable/prelaunch rather than
  -- accidentally locking an older development build.
  if not public.app_access_semver_gte(p_app_version, v_cfg.minimum_version) then
    return public.app_access_response_jsonb(
      'prelaunch', false, v_now, null, null, null, null,
      true, true, true, false, null);
  end if;

  -- Trial eligibility requires a verified Supabase account. Admin/internal
  -- bypasses above remain server-controlled and intentionally do not depend on
  -- email verification.
  select exists (
    select 1
      from auth.users
     where id = p_user_id
       and (email_confirmed_at is not null or phone_confirmed_at is not null)
  ) into v_is_verified;
  if not v_is_verified then
    return public.app_access_response_jsonb(
      'locked', v_enabled, v_now, null, null, null, null,
      false, false, true, false, 'account_verification_required');
  end if;

  -- Gate is live: ensure a server-owned entitlement row exists.
  insert into public.app_access_entitlements (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  -- First-authenticated-launch trial start (once; client cannot reset).
  if p_start_trial_if_eligible then
    update public.app_access_entitlements
       set trial_started_at = v_now,
           trial_ends_at = v_now + make_interval(days => v_cfg.trial_days),
           trial_used_at = v_now,
           status = 'trialing',
           server_checked_at = v_now
     where user_id = p_user_id
       and trial_used_at is null
       and stripe_subscription_id is null;
    if found then
      perform public.app_access_record_event(
        p_user_id, 'trial_started', null, null, 'trialing', 'first_authenticated_launch');
    end if;
  end if;

  select * into v_ent from public.app_access_entitlements where user_id = p_user_id;
  if v_ent is null then
    return public.app_access_response_jsonb(
      'unknown', v_enabled, v_now, null, null, null, null,
      false, false, false, false, null);
  end if;

  v_trial_ends := v_ent.trial_ends_at;
  v_period_end := v_ent.current_period_end;
  v_grace_end := v_ent.grace_ends_at;

  -- Derive authoritative status from server timestamps.
  if v_ent.stripe_subscription_id is not null then
    if v_ent.provider_status in ('canceled','unpaid','incomplete_expired') then
      v_status := 'ended';
      -- Webhooks should persist access_ended_at. If an older or incomplete
      -- writer omitted it, anchor grace to the immutable provider transition
      -- time instead of v_now; otherwise each read could extend grace.
      v_ent_end := coalesce(
        v_ent.access_ended_at,
        v_ent.provider_status_updated_at,
        v_ent.current_period_end,
        v_now
      );
    elsif v_ent.provider_status is null or v_period_end is null then
      -- A subscription id alone is never proof of paid access. Incomplete
      -- provider state fails closed until a verified webhook supplies both
      -- provider status and the authoritative period boundary.
      v_status := 'unknown';
    elsif v_period_end is not null and v_now >= v_period_end then
      v_status := 'ended';
      v_ent_end := v_period_end;
    elsif v_ent.last_payment_status = 'failed'
       or v_ent.provider_status in ('past_due','incomplete','paused')
       or v_ent.status = 'past_due' then
      v_status := 'past_due';
      v_ent_end := v_period_end;
    elsif v_ent.cancel_at_period_end then
      v_status := 'cancel_at_period_end';
    else
      v_status := 'active';
    end if;
  else
    if v_trial_ends is not null and v_now < v_trial_ends then
      v_status := 'trialing';
    elsif v_trial_ends is not null then
      v_status := 'ended';
      v_ent_end := v_trial_ends;
    else
      v_status := 'unknown';
    end if;
  end if;

  -- A provider-confirmed recovery clears stale lapse markers exactly once.
  if v_status in ('trialing','active','cancel_at_period_end','past_due')
     and (
       v_ent.grace_started_at is not null
       or v_ent.grace_ends_at is not null
       or v_ent.locked_at is not null
     ) then
    update public.app_access_entitlements
       set grace_started_at = null,
           grace_ends_at = null,
           locked_at = null,
           server_checked_at = v_now
     where user_id = p_user_id
       and (
         grace_started_at is not null
         or grace_ends_at is not null
         or locked_at is not null
       );
    if found then
      perform public.app_access_record_event(
        p_user_id, 'access_restored', null, v_ent.stripe_subscription_id,
        v_status, 'provider_access_recovered');
      v_grace_end := null;
    end if;
  end if;

  -- Grace then lock for ENDED entitlements (three-day grace by config). A live
  -- past_due (payment failed, period still active) stays 'past_due' and keeps
  -- access until the period ends, at which point the derivation above marks it
  -- 'ended' and it enters grace here.
  if v_status = 'ended' then
    if v_ent_end is null then
      v_ent_end := coalesce(v_period_end, v_trial_ends, v_now);
    end if;
    if v_grace_end is null or v_ent.grace_started_at is distinct from v_ent_end then
      update public.app_access_entitlements
         set grace_started_at = v_ent_end,
             grace_ends_at = v_ent_end + make_interval(days => v_cfg.grace_days),
             server_checked_at = v_now
       where user_id = p_user_id
         and grace_started_at is distinct from v_ent_end;
      if found then
        perform public.app_access_record_event(
          p_user_id, 'grace_started', null, v_ent.stripe_subscription_id,
          v_status, 'entitlement_ended');
        v_grace_end := v_ent_end + make_interval(days => v_cfg.grace_days);
      else
        select grace_ends_at into v_grace_end
          from public.app_access_entitlements where user_id = p_user_id;
      end if;
    end if;
    if v_now < v_grace_end then
      v_status := 'grace';
    else
      v_status := 'locked';
      update public.app_access_entitlements
         set locked_at = v_now, server_checked_at = v_now
       where user_id = p_user_id and locked_at is null;
      if found then
        perform public.app_access_record_event(
          p_user_id, 'grace_ended', null, v_ent.stripe_subscription_id,
          'locked', 'grace_expired');
        perform public.app_access_record_event(
          p_user_id, 'lock_applied', null, v_ent.stripe_subscription_id,
          'locked', 'grace_ended');
      end if;
    end if;
  end if;

  -- Response capabilities.
  v_can_use := v_status in ('trialing','active','cancel_at_period_end','past_due','grace','admin','internal');
  v_can_edit := v_can_use;
  -- Local data preservation is never conditional on entitlement freshness.
  -- Unknown and locked block production work but keep export/backup available.
  v_can_export := true;

  if v_status = 'trialing' then
    v_requires_checkout := true;
    v_checkout_reason := 'trial_will_convert';
    if v_trial_ends is not null then
      v_days_remaining := greatest(0,
        ceil(extract(epoch from (v_trial_ends - v_now)) / 86400.0)::integer);
    end if;
  elsif v_status in ('active','cancel_at_period_end') then
    v_requires_checkout := false;
    if v_period_end is not null then
      v_days_remaining := greatest(0,
        ceil(extract(epoch from (v_period_end - v_now)) / 86400.0)::integer);
    end if;
  elsif v_status = 'grace' then
    v_requires_checkout := true;
    v_checkout_reason := 'grace_period';
    if v_grace_end is not null then
      v_days_remaining := greatest(0,
        ceil(extract(epoch from (v_grace_end - v_now)) / 86400.0)::integer);
    end if;
  elsif v_status = 'past_due' then
    v_requires_checkout := true;
    v_checkout_reason := 'payment_failed';
  elsif v_status = 'locked' then
    v_requires_checkout := true;
    v_checkout_reason := 'access_locked';
  end if;

  -- Persist the derived app-access state. Meaningful status transitions bump
  -- revision; a timestamp-only refresh does not.
  update public.app_access_entitlements
     set status = v_status,
         server_checked_at = v_now
   where user_id = p_user_id;

  return public.app_access_response_jsonb(
    v_status, v_enabled, v_now, v_trial_ends, v_period_end, v_grace_end,
    v_days_remaining, v_can_use, v_can_edit, v_can_export,
    v_requires_checkout, v_checkout_reason);
end;
$$;

revoke all on function public.app_access_compute(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.app_access_compute(uuid, boolean, text) to service_role;

-- =============================================================================
-- 10. Client-facing current-status RPC (self only)
-- =============================================================================
-- SECURITY DEFINER so it can lazily start the trial, but its only parameter is
-- the bounded client build version; user identity always comes from the
-- caller's own (select auth.uid()). PUBLIC/anon
-- EXECUTE is revoked and only authenticated is granted. Unauthenticated callers
-- fail closed to an unknown/locked response.
create or replace function public.get_app_access(p_app_version text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid;
begin
  v_uid := (select auth.uid());
  if v_uid is null then
    return public.app_access_response_jsonb(
      'unknown', false, now(), null, null, null, null,
      false, false, false, false, null);
  end if;
  return public.app_access_compute(v_uid, true, p_app_version);
end;
$$;

revoke all on function public.get_app_access(text) from public, anon, authenticated;
grant execute on function public.get_app_access(text) to authenticated;

-- =============================================================================
-- 11. Service-role-only explicit trial start (webhook/admin path)
-- =============================================================================
create or replace function public.start_app_access_trial(p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_user_id is null then
    raise exception 'start_app_access_trial: p_user_id is required';
  end if;
  -- An explicit trusted server action is not tied to a client build. Passing
  -- the configured minimum satisfies the activation-floor check when present.
  return public.app_access_compute(
    p_user_id,
    true,
    (select minimum_version from public.app_access_launch_config where id = 1)
  );
end;
$$;

revoke all on function public.start_app_access_trial(uuid) from public, anon, authenticated;
grant execute on function public.start_app_access_trial(uuid) to service_role;

-- =============================================================================
-- DATA-PRESERVING OPERATIONAL ROLLBACK: set the singleton launch gate to
-- enabled=false and redeploy the last approved compatible Edge handlers.
-- Retain entitlement and audit rows. Schema removal is a separate, explicitly
-- approved reverse-order operation only after export and retention review.
-- =============================================================================
