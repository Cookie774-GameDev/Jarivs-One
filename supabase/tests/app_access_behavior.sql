-- =============================================================================
-- VibeSpace Access schema behavior verification (migration 0032_app_access)
-- =============================================================================
-- Run against a LOCAL or linked project after db push (NEVER production):
--   psql "$SUPABASE_DB_URL" -f supabase/tests/app_access_behavior.sql
-- or paste into the Supabase SQL editor. Creates throwaway auth.users rows and
-- mutates the singleton launch-config row INSIDE a transaction that ROLLS BACK
-- at the end, leaving no permanent changes.
--
-- Coverage:
--   * RLS enabled on all three app_access tables.
--   * Launch config seeded DISABLED by default (authoritative gate).
--   * Prelaunch gate (disabled / launch_at in future) leaves existing behavior
--     intact and does NOT start a trial.
--   * First-authenticated-launch trial start, once; the client cannot reset it.
--   * Unverified accounts cannot start a trial; minimum-version activation is
--     enforced server-side without locking older/prelaunch builds.
--   * Trial -> three-day grace -> locked boundaries using server timestamps.
--   * Active / cancel_at_period_end / past_due derivation.
--   * Unique Stripe app-access subscription constraint.
--   * Idempotent audit events via provider event id dedupe (no raw payloads).
--   * Admin (app_admins) and internal (raw_app_meta_data) bypass from
--     server-controlled sources; raw_user_meta_data is IGNORED.
--   * No coupling to profiles.tier (feature tiers stay separate).
--   * Numeric semver comparison (not string comparison).
--   * Explicit table SELECT grants for authenticated, no client DML, no anon.
--   * RPC EXECUTE grants/revokes (PUBLIC/anon revoked; intended roles only).
--   * Functional self-read / no-self-write / cross-account isolation.
-- =============================================================================

begin;

-- -- 1. RLS enabled on every app_access table ---------------------------------
do $$
declare
  t text;
  tables text[] := array['app_access_launch_config','app_access_entitlements','app_access_events'];
begin
  foreach t in array tables loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t and c.relrowsecurity
    ) then
      raise exception 'RLS NOT enabled on public.%', t;
    end if;
  end loop;
  raise notice 'OK: RLS enabled on all app_access tables';
end $$;

-- -- 2. Launch config seeded disabled by default ------------------------------
do $$
declare
  v public.app_access_launch_config%rowtype;
begin
  select * into v from public.app_access_launch_config where id = 1;
  if v.id is null then
    raise exception 'launch config singleton row (id=1) missing';
  end if;
  if v.enabled is not false then
    raise exception 'launch config must default to disabled, got enabled=%', v.enabled;
  end if;
  if v.trial_days <> 30 then
    raise exception 'trial_days default should be 30, got %', v.trial_days;
  end if;
  if v.grace_days <> 3 then
    raise exception 'grace_days default should be 3, got %', v.grace_days;
  end if;
  if v.monthly_price_usd <> 20.00 then
    raise exception 'monthly_price_usd default should be 20.00, got %', v.monthly_price_usd;
  end if;
  if v.require_payment_method_for_trial is not false then
    raise exception 'require_payment_method_for_trial must default to false';
  end if;
  raise notice 'OK: launch config seeded disabled with documented defaults';
end $$;

-- -- 3. Prelaunch gate (disabled): no trial, existing behavior remains --------
do $$
declare
  uid uuid := gen_random_uuid();
  res jsonb;
begin
  update public.app_access_launch_config
     set enabled = false, launch_at = null where id = 1;
  insert into auth.users (id, email, email_confirmed_at)
  values (uid, 'aa-prelaunch@example.com', now());

  res := public.app_access_compute(uid, true);
  if res->>'status' <> 'prelaunch' then
    raise exception 'disabled gate should be prelaunch, got %', res;
  end if;
  if (res->>'enabled')::boolean is not false then
    raise exception 'prelaunch response enabled should be false, got %', res;
  end if;
  if (res->>'canUseApp')::boolean is not true then
    raise exception 'prelaunch must keep canUseApp=true (do not lock dev/beta), got %', res;
  end if;
  if (res->>'requiresCheckout')::boolean is not false then
    raise exception 'prelaunch must not require checkout, got %', res;
  end if;
  if res->>'serverTime' is null then
    raise exception 'response must include serverTime, got %', res;
  end if;
  if exists (select 1 from public.app_access_entitlements where user_id = uid) then
    raise exception 'prelaunch must NOT create an entitlement row or start a trial';
  end if;
  if exists (select 1 from public.app_access_events
             where user_id = uid and event_type = 'trial_started') then
    raise exception 'prelaunch must NOT record a trial_started event';
  end if;
  raise notice 'OK: disabled gate => prelaunch, no trial started';
end $$;

-- -- 4. Gate live: first-authenticated-launch trial starts once ---------------
do $$
declare
  uid uuid := gen_random_uuid();
  res jsonb;
  v_ent public.app_access_entitlements%rowtype;
  v_trial_events integer;
begin
  update public.app_access_launch_config
     set enabled = true, launch_at = null where id = 1;
  insert into auth.users (id, email, email_confirmed_at)
  values (uid, 'aa-trial@example.com', now());

  res := public.app_access_compute(uid, true);
  if res->>'status' <> 'trialing' then
    raise exception 'first launch after gate live should be trialing, got %', res;
  end if;
  if (res->>'enabled')::boolean is not true then
    raise exception 'enabled should be true once gate live, got %', res;
  end if;
  if res->>'trialEndsAt' is null then
    raise exception 'trialing response must include trialEndsAt, got %', res;
  end if;
  if (res->>'canUseApp')::boolean is not true or (res->>'canEdit')::boolean is not true
     or (res->>'canExport')::boolean is not true then
    raise exception 'trialing must allow use/edit/export, got %', res;
  end if;
  if (res->>'requiresCheckout')::boolean is not true
     or res->>'checkoutReason' <> 'trial_will_convert' then
    raise exception 'trialing should require checkout (trial_will_convert), got %', res;
  end if;
  if (res->>'daysRemaining')::integer not between 29 and 30 then
    raise exception 'trial daysRemaining should be ~30, got %', res->>'daysRemaining';
  end if;

  select * into v_ent from public.app_access_entitlements where user_id = uid;
  if v_ent.user_id is null then
    raise exception 'entitlement row not created on first launch';
  end if;
  if v_ent.trial_used_at is null or v_ent.trial_started_at is null then
    raise exception 'trial_used_at/trial_started_at must be set on first launch';
  end if;
  if v_ent.status <> 'trialing' then
    raise exception 'entitlement status should be trialing, got %', v_ent.status;
  end if;
  if v_ent.revision < 1 then
    raise exception 'revision should bump on update, got %', v_ent.revision;
  end if;

  select count(*) into v_trial_events from public.app_access_events
   where user_id = uid and event_type = 'trial_started';
  if v_trial_events <> 1 then
    raise exception 'exactly one trial_started event expected, got %', v_trial_events;
  end if;
  raise notice 'OK: first authenticated launch starts a 30-day trial once';
end $$;

-- -- 5. Trial start is idempotent; client cannot reset it ---------------------
do $$
declare
  uid uuid := gen_random_uuid();
  v_started_before timestamptz;
  v_used_before timestamptz;
  v_started_after timestamptz;
  v_used_after timestamptz;
  v_trial_events integer;
  v_revision_before bigint;
  v_revision_after bigint;
begin
  update public.app_access_launch_config
     set enabled = true, launch_at = null where id = 1;
  insert into auth.users (id, email, email_confirmed_at)
  values (uid, 'aa-idem@example.com', now());

  perform public.app_access_compute(uid, true);
  select trial_started_at, trial_used_at, revision
    into v_started_before, v_used_before, v_revision_before
    from public.app_access_entitlements where user_id = uid;

  perform public.app_access_compute(uid, true);
  perform public.app_access_compute(uid, true);

  select trial_started_at, trial_used_at, revision
    into v_started_after, v_used_after, v_revision_after
    from public.app_access_entitlements where user_id = uid;
  if v_started_after is distinct from v_started_before
     or v_used_after is distinct from v_used_before then
    raise exception 'trial timestamps must not change on repeated launches (client cannot reset)';
  end if;
  if v_revision_after <> v_revision_before then
    raise exception 'timestamp-only status refresh must not bump entitlement revision: % -> %',
      v_revision_before, v_revision_after;
  end if;
  select count(*) into v_trial_events from public.app_access_events
   where user_id = uid and event_type = 'trial_started';
  if v_trial_events <> 1 then
    raise exception 'trial_started event must not duplicate, got %', v_trial_events;
  end if;
  raise notice 'OK: trial start is idempotent and not client-resettable';
end $$;

-- -- 5b. Unverified accounts cannot start a trial -----------------------------
do $$
declare
  uid uuid := gen_random_uuid();
  res jsonb;
begin
  update public.app_access_launch_config
     set enabled = true, launch_at = null, minimum_version = null where id = 1;
  insert into auth.users (id, email)
  values (uid, 'aa-unverified@example.com');

  res := public.app_access_compute(uid, true);
  if res->>'status' <> 'locked'
     or res->>'checkoutReason' <> 'account_verification_required' then
    raise exception 'unverified account must fail closed with verification reason, got %', res;
  end if;
  if (res->>'canUseApp')::boolean is not false
     or (res->>'canExport')::boolean is not true then
    raise exception 'unverified account must block use but retain export, got %', res;
  end if;
  if exists (select 1 from public.app_access_entitlements where user_id = uid)
     or exists (select 1 from public.app_access_events
                where user_id = uid and event_type = 'trial_started') then
    raise exception 'unverified account must not create entitlement/trial state';
  end if;
  raise notice 'OK: trial requires a verified Supabase account';
end $$;

-- -- 6. launch_at in the future keeps prelaunch -------------------------------
do $$
declare
  uid uuid := gen_random_uuid();
  res jsonb;
begin
  update public.app_access_launch_config
     set enabled = true, launch_at = now() + interval '30 days' where id = 1;
  insert into auth.users (id, email, email_confirmed_at)
  values (uid, 'aa-future@example.com', now());

  res := public.app_access_compute(uid, true);
  if res->>'status' <> 'prelaunch' then
    raise exception 'future launch_at should be prelaunch, got %', res;
  end if;
  if exists (select 1 from public.app_access_entitlements where user_id = uid) then
    raise exception 'future launch_at must not start a trial';
  end if;
  update public.app_access_launch_config
     set launch_at = null where id = 1;
  raise notice 'OK: future launch_at keeps prelaunch and does not start trial';
end $$;

-- -- 6b. Minimum-version floor is enforced without locking older builds -------
do $$
declare
  uid uuid := gen_random_uuid();
  res jsonb;
begin
  update public.app_access_launch_config
     set enabled = true, launch_at = null, minimum_version = '0.1.50' where id = 1;
  insert into auth.users (id, email, email_confirmed_at)
  values (uid, 'aa-version-floor@example.com', now());

  res := public.app_access_compute(uid, true, '0.1.49');
  if res->>'status' <> 'prelaunch'
     or (res->>'canUseApp')::boolean is not true then
    raise exception 'build below activation floor must remain usable/prelaunch, got %', res;
  end if;
  if exists (select 1 from public.app_access_entitlements where user_id = uid) then
    raise exception 'build below activation floor must not start a trial';
  end if;

  res := public.app_access_compute(uid, true, '0.1.50');
  if res->>'status' <> 'trialing' then
    raise exception 'build meeting activation floor should start trial, got %', res;
  end if;
  update public.app_access_launch_config set minimum_version = null where id = 1;
  raise notice 'OK: server minimum-version activation floor is authoritative';
end $$;

-- -- 7. Trial expiry enters three-day grace -----------------------------------
do $$
declare
  uid uuid := gen_random_uuid();
  res jsonb;
  v_grace_events integer;
  v_grace_started timestamptz;
  v_trial_ended timestamptz;
begin
  update public.app_access_launch_config
     set enabled = true, launch_at = null where id = 1;
  insert into auth.users (id, email, email_confirmed_at)
  values (uid, 'aa-grace@example.com', now());
  perform public.app_access_compute(uid, true);

  -- Service/admin path simulates the trial ending.
  update public.app_access_entitlements
     set trial_started_at = now() - interval '30 days 1 second',
         trial_ends_at = now() - interval '1 second'
   where user_id = uid;

  res := public.app_access_compute(uid, false);
  if res->>'status' <> 'grace' then
    raise exception 'expired trial should enter grace, got %', res;
  end if;
  if res->>'graceEndsAt' is null then
    raise exception 'grace response must include graceEndsAt, got %', res;
  end if;
  if (res->>'canUseApp')::boolean is not true then
    raise exception 'grace must keep canUseApp=true, got %', res;
  end if;
  if (res->>'requiresCheckout')::boolean is not true
     or res->>'checkoutReason' <> 'grace_period' then
    raise exception 'grace should require checkout (grace_period), got %', res;
  end if;
  if (res->>'daysRemaining')::integer not between 2 and 3 then
    raise exception 'grace daysRemaining should be ~3, got %', res->>'daysRemaining';
  end if;
  select grace_started_at, trial_ends_at
    into v_grace_started, v_trial_ended
    from public.app_access_entitlements where user_id = uid;
  if v_grace_started is distinct from v_trial_ended then
    raise exception 'grace must start at entitlement end, got start=% end=%',
      v_grace_started, v_trial_ended;
  end if;

  select count(*) into v_grace_events from public.app_access_events
   where user_id = uid and event_type = 'grace_started';
  if v_grace_events <> 1 then
    raise exception 'one grace_started event expected, got %', v_grace_events;
  end if;

  perform public.app_access_compute(uid, false);
  select count(*) into v_grace_events from public.app_access_events
   where user_id = uid and event_type = 'grace_started';
  if v_grace_events <> 1 then
    raise exception 'grace_started event must not duplicate on re-evaluation, got %', v_grace_events;
  end if;
  raise notice 'OK: expired trial enters three-day grace without duplicate events';
end $$;

-- -- 8. Grace expiry enters locked (export still allowed) ---------------------
do $$
declare
  uid uuid := gen_random_uuid();
  res jsonb;
  v_ent public.app_access_entitlements%rowtype;
begin
  update public.app_access_launch_config
     set enabled = true, launch_at = null where id = 1;
  insert into auth.users (id, email, email_confirmed_at)
  values (uid, 'aa-lock@example.com', now());
  perform public.app_access_compute(uid, true);
  update public.app_access_entitlements
     set trial_started_at = now() - interval '40 days',
         trial_ends_at = now() - interval '10 days'
   where user_id = uid;
  perform public.app_access_compute(uid, false);
  update public.app_access_entitlements
     set grace_ends_at = now() - interval '1 second' where user_id = uid;

  res := public.app_access_compute(uid, false);
  if res->>'status' <> 'locked' then
    raise exception 'expired grace should enter locked, got %', res;
  end if;
  if (res->>'canUseApp')::boolean is not false or (res->>'canEdit')::boolean is not false then
    raise exception 'locked must block use/edit, got %', res;
  end if;
  if (res->>'canExport')::boolean is not true then
    raise exception 'locked must still allow export/backup, got %', res;
  end if;
  if (res->>'requiresCheckout')::boolean is not true
     or res->>'checkoutReason' <> 'access_locked' then
    raise exception 'locked should require checkout (access_locked), got %', res;
  end if;
  select * into v_ent from public.app_access_entitlements where user_id = uid;
  if v_ent.locked_at is null then
    raise exception 'locked_at must be set when locked';
  end if;
  if not exists (select 1 from public.app_access_events
                 where user_id = uid and event_type = 'lock_applied') then
    raise exception 'lock_applied event expected';
  end if;
  if not exists (select 1 from public.app_access_events
                 where user_id = uid and event_type = 'grace_ended') then
    raise exception 'grace_ended event expected';
  end if;
  perform public.app_access_compute(uid, false);
  if (select count(*) from public.app_access_events
       where user_id = uid and event_type in ('grace_ended','lock_applied')) <> 2 then
    raise exception 'grace_ended/lock_applied events must not duplicate';
  end if;
  raise notice 'OK: expired grace enters locked; export remains allowed';
end $$;

-- -- 9. Active paid app-access subscription -----------------------------------
do $$
declare
  uid uuid := gen_random_uuid();
  res jsonb;
  v_sub text;
begin
  update public.app_access_launch_config
     set enabled = true, launch_at = null where id = 1;
  insert into auth.users (id, email, email_confirmed_at)
  values (uid, 'aa-active@example.com', now());
  v_sub := 'sub_test_access_' || uid::text;
  insert into public.app_access_entitlements
    (user_id, status, provider_status, provider_status_updated_at,
     stripe_subscription_id, stripe_price_id,
     current_period_start, current_period_end, last_payment_status, cancel_at_period_end)
  values
    (uid, 'active', 'active', now(), v_sub, 'price_test_access',
     now() - interval '13 days', now() + interval '17 days', 'succeeded', false);

  res := public.app_access_compute(uid, false);
  if res->>'status' <> 'active' then
    raise exception 'paid active subscription should be active, got %', res;
  end if;
  if (res->>'canUseApp')::boolean is not true then
    raise exception 'active must allow use, got %', res;
  end if;
  if (res->>'requiresCheckout')::boolean is not false then
    raise exception 'active must not require checkout, got %', res;
  end if;
  if res->>'currentPeriodEndsAt' is null then
    raise exception 'active response must include currentPeriodEndsAt, got %', res;
  end if;
  if (res->>'daysRemaining')::integer not between 16 and 17 then
    raise exception 'active daysRemaining should be ~17, got %', res->>'daysRemaining';
  end if;

  update public.app_access_entitlements set cancel_at_period_end = true where user_id = uid;
  res := public.app_access_compute(uid, false);
  if res->>'status' <> 'cancel_at_period_end' then
    raise exception 'cancel_at_period_end expected, got %', res;
  end if;
  if (res->>'canUseApp')::boolean is not true or (res->>'requiresCheckout')::boolean is not false then
    raise exception 'cancel_at_period_end keeps access, no checkout, got %', res;
  end if;
  raise notice 'OK: active and cancel_at_period_end derived correctly';
end $$;

-- -- 10. Payment failure: past_due then grace when period ends ----------------
do $$
declare
  uid uuid := gen_random_uuid();
  res jsonb;
  v_sub text;
begin
  update public.app_access_launch_config
     set enabled = true, launch_at = null where id = 1;
  insert into auth.users (id, email, email_confirmed_at)
  values (uid, 'aa-pastdue@example.com', now());
  v_sub := 'sub_test_pd_' || uid::text;
  insert into public.app_access_entitlements
    (user_id, status, provider_status, provider_status_updated_at,
     stripe_subscription_id, current_period_start,
     current_period_end, last_payment_status)
  values
    (uid, 'active', 'past_due', now(), v_sub, now() - interval '5 days',
     now() + interval '5 days', 'failed');

  res := public.app_access_compute(uid, false);
  if res->>'status' <> 'past_due' then
    raise exception 'failed payment with live period should be past_due, got %', res;
  end if;
  if (res->>'requiresCheckout')::boolean is not true
     or res->>'checkoutReason' <> 'payment_failed' then
    raise exception 'past_due should require checkout (payment_failed), got %', res;
  end if;

  update public.app_access_entitlements
     set current_period_end = now() - interval '1 second' where user_id = uid;
  res := public.app_access_compute(uid, false);
  if res->>'status' <> 'grace' then
    raise exception 'ended past_due period should enter grace, got %', res;
  end if;
  raise notice 'OK: past_due then grace on period end';
end $$;

-- -- 10b. Terminal provider state anchors grace to actual access end ----------
do $$
declare
  uid uuid := gen_random_uuid();
  res jsonb;
  v_ended_at timestamptz := now() - interval '1 hour';
  v_grace_started timestamptz;
  v_restored_events integer;
begin
  update public.app_access_launch_config
     set enabled = true, launch_at = null, minimum_version = null where id = 1;
  insert into auth.users (id, email, email_confirmed_at)
  values (uid, 'aa-canceled@example.com', now());
  insert into public.app_access_entitlements (
    user_id, status, provider_status, provider_status_updated_at,
    access_ended_at, stripe_subscription_id, current_period_end
  ) values (
    uid, 'active', 'canceled', v_ended_at,
    v_ended_at, 'sub_test_canceled_' || uid::text, now() + interval '20 days'
  );

  res := public.app_access_compute(uid, false);
  if res->>'status' <> 'grace' then
    raise exception 'terminal provider status should enter grace, got %', res;
  end if;
  select grace_started_at into v_grace_started
    from public.app_access_entitlements where user_id = uid;
  if v_grace_started is distinct from v_ended_at then
    raise exception 'terminal grace must anchor to access_ended_at, got % expected %',
      v_grace_started, v_ended_at;
  end if;

  update public.app_access_entitlements
     set provider_status = 'active',
         provider_status_updated_at = now(),
         access_ended_at = null,
         last_payment_status = 'succeeded'
   where user_id = uid;
  res := public.app_access_compute(uid, false);
  if res->>'status' <> 'active' then
    raise exception 'provider recovery should restore active access, got %', res;
  end if;
  if exists (
    select 1 from public.app_access_entitlements
     where user_id = uid
       and (grace_started_at is not null or grace_ends_at is not null or locked_at is not null)
  ) then
    raise exception 'provider recovery must clear stale grace/lock markers';
  end if;
  select count(*) into v_restored_events
    from public.app_access_events
   where user_id = uid and event_type = 'access_restored';
  if v_restored_events <> 1 then
    raise exception 'provider recovery must emit one access_restored event, got %',
      v_restored_events;
  end if;
  raise notice 'OK: terminal grace anchoring and provider recovery are correct';
end $$;

-- -- 10c. Incomplete provider state fails closed; terminal fallback is stable -
do $$
declare
  uid_unknown uuid := gen_random_uuid();
  uid_terminal uuid := gen_random_uuid();
  res jsonb;
  v_transition_at timestamptz := now() - interval '1 hour';
  v_grace_started timestamptz;
  v_grace_events integer;
begin
  update public.app_access_launch_config
     set enabled = true, launch_at = null, minimum_version = null where id = 1;
  insert into auth.users (id, email, email_confirmed_at)
  values
    (uid_unknown, 'aa-provider-unknown@example.com', now()),
    (uid_terminal, 'aa-provider-terminal-fallback@example.com', now());

  insert into public.app_access_entitlements (
    user_id, status, stripe_subscription_id, current_period_end
  ) values (
    uid_unknown, 'active', 'sub_test_unknown_' || uid_unknown::text,
    now() + interval '20 days'
  );
  res := public.app_access_compute(uid_unknown, false);
  if res->>'status' <> 'unknown'
     or (res->>'canUseApp')::boolean is not false
     or (res->>'canEdit')::boolean is not false
     or (res->>'canExport')::boolean is not true then
    raise exception 'incomplete provider state must fail closed without blocking export, got %',
      res;
  end if;

  insert into public.app_access_entitlements (
    user_id, status, provider_status, provider_status_updated_at,
    stripe_subscription_id, current_period_end
  ) values (
    uid_terminal, 'active', 'canceled', v_transition_at,
    'sub_test_terminal_fallback_' || uid_terminal::text, now() + interval '20 days'
  );
  perform public.app_access_compute(uid_terminal, false);
  perform public.app_access_compute(uid_terminal, false);
  select grace_started_at into v_grace_started
    from public.app_access_entitlements where user_id = uid_terminal;
  if v_grace_started is distinct from v_transition_at then
    raise exception 'missing access_ended_at must fall back to stable provider transition, got %',
      v_grace_started;
  end if;
  select count(*) into v_grace_events
    from public.app_access_events
   where user_id = uid_terminal and event_type = 'grace_started';
  if v_grace_events <> 1 then
    raise exception 'stable terminal fallback must not extend grace or duplicate events, got %',
      v_grace_events;
  end if;
  raise notice 'OK: incomplete provider state fails closed and terminal fallback is stable';
end $$;

-- -- 11. Unique Stripe app-access subscription constraint ---------------------
do $$
declare
  uid_a uuid := gen_random_uuid();
  uid_b uuid := gen_random_uuid();
  v_sub text;
  v_failed boolean := false;
  v_customer_failed boolean := false;
begin
  insert into auth.users (id, email, email_confirmed_at)
  values
    (uid_a, 'aa-uniq-a@example.com', now()),
    (uid_b, 'aa-uniq-b@example.com', now());
  v_sub := 'sub_test_unique_' || uid_a::text;
  insert into public.app_access_entitlements (user_id, status, stripe_subscription_id)
  values (uid_a, 'active', v_sub);

  begin
    insert into public.app_access_entitlements (user_id, status, stripe_subscription_id)
    values (uid_b, 'active', v_sub);
  exception when unique_violation then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'a Stripe subscription id must map to at most one entitlement';
  end if;

  update public.app_access_entitlements
     set stripe_customer_id = 'cus_test_unique'
   where user_id = uid_a;
  begin
    insert into public.app_access_entitlements
      (user_id, status, stripe_subscription_id, stripe_customer_id)
    values (uid_b, 'active', v_sub || '_other', 'cus_test_unique');
  exception when unique_violation then
    v_customer_failed := true;
  end;
  if not v_customer_failed then
    raise exception 'a Stripe customer id must map to at most one app-access entitlement';
  end if;
  raise notice 'OK: unique Stripe subscription/customer constraints enforced';
end $$;

-- -- 12. Audit events are idempotent on provider event id ---------------------
do $$
declare
  uid uuid := gen_random_uuid();
  v_count integer;
  v_null_count integer;
  v_oversized_blocked boolean := false;
begin
  insert into auth.users (id, email, email_confirmed_at)
  values (uid, 'aa-events@example.com', now());

  perform public.app_access_record_event(uid, 'payment_succeeded', 'evt_test_dedupe_1', null, 'active', 'test');
  perform public.app_access_record_event(uid, 'payment_succeeded', 'evt_test_dedupe_1', null, 'active', 'test');
  perform public.app_access_record_event(uid, 'payment_succeeded', 'evt_test_dedupe_1', null, 'active', 'test');
  select count(*) into v_count from public.app_access_events
   where user_id = uid and provider_event_id = 'evt_test_dedupe_1';
  if v_count <> 1 then
    raise exception 'duplicate provider_event_id must dedupe to one row, got %', v_count;
  end if;

  perform public.app_access_record_event(uid, 'trial_started', null, null, 'trialing', 'a');
  perform public.app_access_record_event(uid, 'trial_started', null, null, 'trialing', 'b');
  select count(*) into v_null_count from public.app_access_events
   where user_id = uid and provider_event_id is null;
  if v_null_count <> 2 then
    raise exception 'NULL provider_event_id rows must both insert, got %', v_null_count;
  end if;
  begin
    perform public.app_access_record_event(
      uid, 'payment_failed', repeat('x', 256), null, 'past_due', repeat('r', 257)
    );
  exception when check_violation then
    v_oversized_blocked := true;
  end;
  if not v_oversized_blocked then
    raise exception 'oversized provider/audit text must be rejected';
  end if;
  raise notice 'OK: audit events dedupe on provider event id; no raw payloads stored';
end $$;

-- -- 13. Admin bypass is server-controlled (app_admins) -----------------------
do $$
declare
  uid uuid := gen_random_uuid();
  res jsonb;
begin
  update public.app_access_launch_config
     set enabled = false, launch_at = null where id = 1;
  insert into auth.users (id, email, email_confirmed_at)
  values (uid, 'aa-admin@example.com', now());
  insert into public.app_admins (user_id, note) values (uid, 'app_access test admin');

  res := public.app_access_compute(uid, true);
  if res->>'status' <> 'admin' then
    raise exception 'app_admins member should be admin even with gate disabled, got %', res;
  end if;
  if (res->>'canUseApp')::boolean is not true or (res->>'requiresCheckout')::boolean is not false then
    raise exception 'admin must have full access, no checkout, got %', res;
  end if;
  raise notice 'OK: admin bypass sourced from app_admins (server-controlled)';
end $$;

-- -- 14. Internal via app_metadata; user_metadata is ignored ------------------
do $$
declare
  uid_int uuid := gen_random_uuid();
  uid_fake uuid := gen_random_uuid();
  res jsonb;
begin
  update public.app_access_launch_config
     set enabled = false, launch_at = null where id = 1;

  insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data)
  values (uid_int, 'aa-internal@example.com',
          now(), '{"app_access_role":"internal"}'::jsonb);
  res := public.app_access_compute(uid_int, true);
  if res->>'status' <> 'internal' then
    raise exception 'raw_app_meta_data app_access_role=internal should be internal, got %', res;
  end if;

  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  values (uid_fake, 'aa-fake@example.com',
          now(), '{"app_access_role":"admin"}'::jsonb);
  res := public.app_access_compute(uid_fake, true);
  if res->>'status' in ('admin','internal') then
    raise exception 'raw_user_meta_data must NOT authorize admin/internal, got %', res;
  end if;
  if res->>'status' <> 'prelaunch' then
    raise exception 'fake admin with gate disabled should be prelaunch, got %', res;
  end if;
  raise notice 'OK: internal from app_metadata; user_metadata authorization ignored';
end $$;

-- -- 15. No coupling to profiles.tier -----------------------------------------
do $$
declare
  uid uuid := gen_random_uuid();
  res jsonb;
  v_tier text;
begin
  update public.app_access_launch_config
     set enabled = true, launch_at = null where id = 1;
  insert into auth.users (id, email, email_confirmed_at)
  values (uid, 'aa-tier@example.com', now());
  insert into public.profiles (id, tier) values (uid, 'free')
  on conflict (id) do update set tier = 'free';

  res := public.app_access_compute(uid, true);
  if res->>'status' <> 'trialing' then
    raise exception 'expected trialing access independent of tier, got %', res;
  end if;
  select tier into v_tier from public.profiles where id = uid;
  if v_tier <> 'free' then
    raise exception 'app_access must not modify profiles.tier; expected free, got %', v_tier;
  end if;
  if not exists (select 1 from public.app_access_entitlements where user_id = uid) then
    raise exception 'access state must live in app_access_entitlements, separate from profiles';
  end if;
  raise notice 'OK: app_access state is separate from profiles.tier';
end $$;

-- -- 16. Semantic-version comparison (numeric, not string) --------------------
do $$
begin
  if public.app_access_semver_gte('0.1.51', '0.1.48') is not true then
    raise exception '0.1.51 >= 0.1.48 should be true';
  end if;
  if public.app_access_semver_gte('0.1.48', '0.1.51') is not false then
    raise exception '0.1.48 >= 0.1.51 should be false';
  end if;
  if public.app_access_semver_gte('0.1.48', '0.1.48') is not true then
    raise exception 'equal versions should be true';
  end if;
  if public.app_access_semver_gte('0.2.0', '0.10.0') is not false then
    raise exception '0.2.0 >= 0.10.0 should be false (numeric compare)';
  end if;
  if public.app_access_semver_gte('0.10.0', '0.2.0') is not true then
    raise exception '0.10.0 >= 0.2.0 should be true (numeric compare)';
  end if;
  if public.app_access_semver_gte('1.0.0', null) is not true then
    raise exception 'NULL minimum means no floor (true)';
  end if;
  if public.app_access_semver_gte(null, '0.1.48') is not false then
    raise exception 'missing client version with a floor should be false';
  end if;
  if public.app_access_semver_gte('1.0.0-beta', '1.0.0') is not false then
    raise exception 'a prerelease must sort below its release';
  end if;
  if public.app_access_semver_gte('1.0.0', '1.0.0-rc.1') is not true then
    raise exception 'a release must sort above its prerelease';
  end if;
  if public.app_access_semver_gte('1.0.0-beta.2', '1.0.0-beta.11') is not false then
    raise exception 'numeric prerelease identifiers must compare numerically';
  end if;
  if public.app_access_semver_gte('1.0.0+build.2', '1.0.0+build.99') is not true then
    raise exception 'build metadata must not affect precedence';
  end if;
  if public.app_access_semver_gte('01.0.0', '1.0.0') is not false
     or public.app_access_semver_gte('1.0', '1.0.0') is not false
     or public.app_access_semver_gte('1.0.0-beta.01', '1.0.0-beta.1') is not false then
    raise exception 'malformed or leading-zero SemVer must fail closed';
  end if;
  if public.app_access_semver_gte(
       '999999999999999999999999999999.0.0',
       '999999999999999999999999999998.0.0'
     ) is not true then
    raise exception 'large numeric identifiers must compare without integer overflow';
  end if;
  raise notice 'OK: strict bounded SemVer precedence is enforced';
end $$;

-- -- 17. RPC EXECUTE grants/revokes -------------------------------------------
do $$
declare
  v_resp_sig text := 'public.app_access_response_jsonb(text, boolean, timestamptz, timestamptz, timestamptz, timestamptz, integer, boolean, boolean, boolean, boolean, text)';
  v_event_sig text := 'public.app_access_record_event(uuid, text, text, text, text, text)';
  v_bad_definers integer;
begin
  if not has_function_privilege('authenticated', 'public.get_app_access(text)', 'EXECUTE') then
    raise exception 'authenticated must execute get_app_access';
  end if;
  if has_function_privilege('anon', 'public.get_app_access(text)', 'EXECUTE') then
    raise exception 'anon must NOT execute get_app_access';
  end if;

  if not has_function_privilege('service_role', 'public.start_app_access_trial(uuid)', 'EXECUTE') then
    raise exception 'service_role must execute start_app_access_trial';
  end if;
  if has_function_privilege('authenticated', 'public.start_app_access_trial(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.start_app_access_trial(uuid)', 'EXECUTE') then
    raise exception 'start_app_access_trial must not be client-executable';
  end if;

  if not has_function_privilege('service_role', 'public.app_access_compute(uuid, boolean, text)', 'EXECUTE') then
    raise exception 'service_role must execute app_access_compute';
  end if;
  if has_function_privilege('authenticated', 'public.app_access_compute(uuid, boolean, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.app_access_compute(uuid, boolean, text)', 'EXECUTE') then
    raise exception 'app_access_compute must not be client-executable';
  end if;

  if not has_function_privilege('service_role', v_event_sig, 'EXECUTE') then
    raise exception 'service_role must execute app_access_record_event';
  end if;
  if has_function_privilege('authenticated', v_event_sig, 'EXECUTE')
     or has_function_privilege('anon', v_event_sig, 'EXECUTE') then
    raise exception 'app_access_record_event must not be client-executable';
  end if;

  if has_function_privilege('authenticated', v_resp_sig, 'EXECUTE')
     or has_function_privilege('anon', v_resp_sig, 'EXECUTE') then
    raise exception 'app_access_response_jsonb is internal and must not be client-executable';
  end if;

  if not has_function_privilege('service_role', 'public.app_access_semver_gte(text, text)', 'EXECUTE') then
    raise exception 'service_role must execute app_access_semver_gte';
  end if;
  if has_function_privilege('authenticated', 'public.app_access_semver_gte(text, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.app_access_semver_gte(text, text)', 'EXECUTE') then
    raise exception 'internal semver comparator must not be client-executable';
  end if;

  select count(*) into v_bad_definers
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'app_access_record_event',
       'app_access_compute',
       'get_app_access',
       'start_app_access_trial'
     )
     and (
       not p.prosecdef
       or coalesce(array_to_string(p.proconfig, ','), '')
            not like '%search_path=pg_catalog, public%'
     );
  if v_bad_definers <> 0 then
    raise exception 'all app-access SECURITY DEFINER functions must pin pg_catalog first';
  end if;
  raise notice 'OK: RPC EXECUTE grants/revokes match the intended roles';
end $$;

-- -- 18. Explicit table grants: SELECT for authenticated, no DML, no anon -----
do $$
declare
  t text;
  tables text[] := array['app_access_launch_config','app_access_entitlements','app_access_events'];
begin
  foreach t in array tables loop
    if not has_table_privilege('authenticated', 'public.' || t, 'SELECT') then
      raise exception 'authenticated must have explicit SELECT on public.%', t;
    end if;
    if has_table_privilege('authenticated', 'public.' || t, 'INSERT')
       or has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
       or has_table_privilege('authenticated', 'public.' || t, 'DELETE') then
      raise exception 'authenticated must NOT have INSERT/UPDATE/DELETE on public.%', t;
    end if;
    if has_table_privilege('anon', 'public.' || t, 'SELECT') then
      raise exception 'anon must NOT have SELECT on public.%', t;
    end if;
    if not has_table_privilege('service_role', 'public.' || t, 'SELECT')
       or not has_table_privilege('service_role', 'public.' || t, 'INSERT')
       or not has_table_privilege('service_role', 'public.' || t, 'UPDATE')
       or not has_table_privilege('service_role', 'public.' || t, 'DELETE') then
      raise exception 'service_role must retain the explicit server write path on public.%', t;
    end if;
  end loop;
  raise notice 'OK: explicit table grants (SELECT only) for authenticated; none for anon';
end $$;

-- -- 19. RLS policy shape: owner self-read, no client write policy ------------
do $$
declare
  t text;
  tables text[] := array['app_access_entitlements','app_access_events'];
  v_client_write integer;
begin
  foreach t in array tables loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t
        and cmd = 'SELECT' and 'authenticated' = any (roles)
        and qual ilike '%auth.uid()%' and qual ilike '%user_id%'
    ) then
      raise exception 'public.% missing owner-only authenticated SELECT policy', t;
    end if;
  end loop;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'app_access_launch_config'
      and cmd = 'SELECT' and 'authenticated' = any (roles)
  ) then
    raise exception 'app_access_launch_config missing authenticated SELECT policy';
  end if;

  select count(*) into v_client_write
  from pg_policies
  where schemaname = 'public'
    and tablename in ('app_access_launch_config','app_access_entitlements','app_access_events')
    and cmd <> 'SELECT'
    and ('authenticated' = any (roles) or 'anon' = any (roles) or 'public' = any (roles));
  if v_client_write > 0 then
    raise exception 'app_access tables must not expose a client write policy (found %)', v_client_write;
  end if;
  raise notice 'OK: owner self-read policies present; no client write policies';
end $$;

-- -- 20. Functional RLS: self-read, no self-write, cross-account isolation ----
do $$
declare
  uid_a uuid := gen_random_uuid();
  uid_b uuid := gen_random_uuid();
  v_seen integer;
  v_other_events integer;
  v_insert_blocked boolean := false;
  v_update_blocked boolean := false;
  v_delete_blocked boolean := false;
  v_rpc jsonb;
begin
  update public.app_access_launch_config
     set enabled = true, launch_at = null where id = 1;
  insert into auth.users (id, email, email_confirmed_at)
  values
    (uid_a, 'aa-iso-a@example.com', now()),
    (uid_b, 'aa-iso-b@example.com', now());
  insert into public.app_access_entitlements (user_id, status)
  values (uid_a, 'trialing'), (uid_b, 'trialing');
  insert into public.app_access_events (user_id, event_type, status)
  values (uid_b, 'trial_started', 'trialing');

  perform set_config('request.jwt.claim.sub', uid_a::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', uid_a::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into v_seen from public.app_access_entitlements;
  if v_seen <> 1 then
    raise exception 'cross-account isolation failed: authenticated saw % rows, expected 1', v_seen;
  end if;
  if not exists (select 1 from public.app_access_entitlements where user_id = uid_a) then
    raise exception 'self-read failed: user A cannot read own entitlement';
  end if;
  select count(*) into v_other_events from public.app_access_events where user_id = uid_b;
  if v_other_events <> 0 then
    raise exception 'cross-account isolation failed: A saw % of B events', v_other_events;
  end if;

  v_rpc := public.get_app_access('0.1.48');
  if v_rpc->>'status' is null or v_rpc->>'serverTime' is null then
    raise exception 'get_app_access() must return status and serverTime, got %', v_rpc;
  end if;

  begin
    insert into public.app_access_entitlements (user_id, status) values (uid_a, 'active');
  exception when others then
    v_insert_blocked := true;
  end;
  if not v_insert_blocked then
    raise exception 'authenticated INSERT into app_access_entitlements must be denied';
  end if;

  begin
    update public.app_access_entitlements set status = 'active' where user_id = uid_a;
  exception when others then
    v_update_blocked := true;
  end;
  if not v_update_blocked then
    raise exception 'authenticated UPDATE of app_access_entitlements must be denied';
  end if;

  begin
    delete from public.app_access_entitlements where user_id = uid_a;
  exception when others then
    v_delete_blocked := true;
  end;
  if not v_delete_blocked then
    raise exception 'authenticated DELETE of app_access_entitlements must be denied';
  end if;

  perform set_config('role', 'postgres', true);
  raise notice 'OK: functional RLS proves self-read, no self-write, cross-account isolation';
end $$;

rollback; -- discard throwaway users, entitlements, events, and config changes

\echo 'All VibeSpace Access behavior checks passed.'
