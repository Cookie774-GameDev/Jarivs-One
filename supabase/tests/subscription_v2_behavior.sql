-- =============================================================================
-- Subscription plan + unified credit pool behavior verification
-- (migrations 0021 + 0029 DeepSeek-heavy + 0030 fungible pool reserves)
-- =============================================================================
-- Run against linked project after db push:
--   psql "$SUPABASE_DB_URL" -f supabase/tests/subscription_v2_behavior.sql
-- Creates throwaway users inside a transaction and ROLLS BACK at the end —
-- no permanent changes.
--
-- Economics (COGS ≤ 33% sticker): DeepSeek 45% · call/voice 42.5% · SMS 12.5%.
-- Starter pool = 1.485 + 1.4025 + 0.4125 = 3.30 USD (~3,300 company credits).
-- Reserve windows use TOTAL pool (8% / 25% / 100%), not per-silo budgets.
-- =============================================================================

begin;

do $$
declare
  uid_starter uuid := gen_random_uuid();
  uid_free    uuid := gen_random_uuid();
  res jsonb;
  v_used numeric;
  v_count integer;
  v_reset timestamptz;
  v_period_end timestamptz := now() + interval '17 days';
  v_pool numeric;
  v_msg_budget numeric;
  v_sms_budget numeric;
begin
  -- ─── Plan limits carry DeepSeek-heavy economics (0029) ───────────────────
  select message_budget_usd, sms_budget_usd,
         (message_budget_usd + call_budget_usd + sms_budget_usd)
    into v_msg_budget, v_sms_budget, v_pool
    from public.subscription_plan_limits where plan = 'starter';

  if v_msg_budget is distinct from 1.485 then
    raise exception 'starter message budget should be 1.485, got %', v_msg_budget;
  end if;
  if (select call_budget_usd from public.subscription_plan_limits where plan='pro') is distinct from 7.0125 then
    raise exception 'pro call budget should be 7.0125';
  end if;
  if (select sms_budget_usd from public.subscription_plan_limits where plan='ultra') is distinct from 4.125 then
    raise exception 'ultra sms budget should be 4.125';
  end if;
  if (select sms_count from public.subscription_plan_limits where plan='starter') <> 41 then
    raise exception 'starter sms_count should be 41';
  end if;
  if (select message_credits from public.subscription_plan_limits where plan='starter') <> 1485 then
    raise exception 'starter message_credits should be 1485';
  end if;
  if v_pool is distinct from 3.30 then
    raise exception 'starter unified pool should be 3.30, got %', v_pool;
  end if;
  if public.unified_plan_budget_usd('starter') is distinct from 3.30 then
    raise exception 'unified_plan_budget_usd(starter) should be 3.30';
  end if;
  if public.unified_plan_budget_usd('free') is distinct from 0 then
    raise exception 'unified_plan_budget_usd(free) should be 0';
  end if;

  -- ─── Seeding: tier change provisions all three buckets ───────────────────
  insert into auth.users (id, email)
  values
    (uid_starter, 'subv2-starter-' || uid_starter::text || '@test.local'),
    (uid_free,    'subv2-free-'    || uid_free::text    || '@test.local');

  insert into public.profiles (id, tier)
  values (uid_starter, 'starter'), (uid_free, 'free')
  on conflict (id) do update set tier = excluded.tier;

  perform public.sync_message_call_usage_for_user(uid_starter, 'starter');
  perform public.sync_message_call_usage_for_user(uid_free, 'free');

  if not exists (
    select 1 from public.sms_usage
     where user_id = uid_starter and monthly_budget_usd = 0.4125
  ) then
    raise exception 'sms_usage not seeded with 0.4125 for starter';
  end if;

  -- ─── Free plan: every bucket rejects ─────────────────────────────────────
  res := public.reserve_message_budget(uid_free, 0.001);
  if (res->>'reason') is distinct from 'no_message_budget' then
    raise exception 'free message reserve expected no_message_budget, got %', res;
  end if;
  res := public.reserve_sms_budget(uid_free, 0.01, 1);
  if (res->>'reason') is distinct from 'no_sms_budget' then
    raise exception 'free sms reserve expected no_sms_budget, got %', res;
  end if;

  -- ─── In-cap reserve succeeds (0030 returns remaining_usd on pool) ────────
  res := public.reserve_message_budget(uid_starter, 0.01);
  if coalesce((res->>'ok')::boolean, false) is not true then
    raise exception 'in-cap message reserve failed: %', res;
  end if;
  if (res->>'remaining_usd') is null then
    raise exception 'reserve should report remaining_usd: %', res;
  end if;
  -- Pool 3.30 − 0.01 = 3.29
  if abs((res->>'remaining_usd')::numeric - 3.29) > 0.001 then
    raise exception 'expected remaining_usd ≈ 3.29 after 0.01 spend, got %', res->>'remaining_usd';
  end if;

  -- ─── 5h window (8%% of pool 3.30 = 0.264) ────────────────────────────────
  -- Already used 0.01 in this window; 0.26 would push past the 5h cap while
  -- staying within weekly (0.825) and monthly (3.30).
  res := public.reserve_message_budget(uid_starter, 0.26);
  if (res->>'reason') is distinct from 'window_5h_exceeded' then
    raise exception 'expected window_5h_exceeded, got %', res;
  end if;
  if (res->>'remaining_usd')::numeric > 0.26 then
    raise exception '5h remaining should be ≤ 0.254, got %', res->>'remaining_usd';
  end if;

  -- ─── Weekly window (25%% of pool 3.30 = 0.825) ───────────────────────────
  update public.message_usage
     set window_5h_start = now(), window_5h_used_usd = 0,
         window_week_start = now(), window_week_used_usd = 0.75
   where user_id = uid_starter;
  res := public.reserve_message_budget(uid_starter, 0.10);
  if (res->>'reason') is distinct from 'window_weekly_exceeded' then
    raise exception 'expected window_weekly_exceeded, got %', res;
  end if;

  -- ─── Monthly pool cap (shared) still binds when windows are clear ────────
  -- used_usd on message alone near pool total exhausts fungible remaining.
  update public.message_usage
     set used_usd = 3.25,
         window_5h_start = now(), window_5h_used_usd = 0,
         window_week_start = now(), window_week_used_usd = 0
   where user_id = uid_starter;
  update public.call_usage set used_usd = 0 where user_id = uid_starter;
  update public.sms_usage set used_usd = 0 where user_id = uid_starter;
  res := public.reserve_message_budget(uid_starter, 0.10);
  if (res->>'reason') is distinct from 'budget_exceeded' then
    raise exception 'expected budget_exceeded on pool, got %', res;
  end if;

  -- ─── Fungibility: over the silo message_budget but under total pool ──────
  -- message_budget_usd = 1.485; spending 1.50 via message still OK if pool left.
  update public.message_usage
     set used_usd = 1.50,
         window_5h_start = now(), window_5h_used_usd = 0,
         window_week_start = now(), window_week_used_usd = 0
   where user_id = uid_starter;
  res := public.reserve_message_budget(uid_starter, 0.05);
  if coalesce((res->>'ok')::boolean, false) is not true then
    raise exception 'fungible pool should allow message spend past silo budget: %', res;
  end if;

  -- Call spend also draws from the same pool remaining.
  res := public.reserve_call_budget(uid_starter, 0.10);
  if coalesce((res->>'ok')::boolean, false) is not true then
    raise exception 'call reserve from shared pool failed: %', res;
  end if;

  -- ─── Expired windows roll over automatically ─────────────────────────────
  update public.message_usage
     set used_usd = 0,
         window_5h_start = now() - interval '6 hours', window_5h_used_usd = 0.264,
         window_week_start = now() - interval '8 days', window_week_used_usd = 0.825
   where user_id = uid_starter;
  update public.call_usage set used_usd = 0 where user_id = uid_starter;
  update public.sms_usage set used_usd = 0, used_count = 0 where user_id = uid_starter;
  res := public.reserve_message_budget(uid_starter, 0.10);
  if coalesce((res->>'ok')::boolean, false) is not true then
    raise exception 'reserve after window expiry should succeed: %', res;
  end if;

  -- ─── SMS reserve/settle with segment count ───────────────────────────────
  res := public.reserve_sms_budget(uid_starter, 0.01, 1);
  if coalesce((res->>'ok')::boolean, false) is not true then
    raise exception 'sms reserve failed: %', res;
  end if;
  select used_usd, used_count into v_used, v_count from public.sms_usage where user_id = uid_starter;
  if v_used <> 0.01 or v_count <> 1 then
    raise exception 'sms usage after reserve should be (0.01, 1), got (%, %)', v_used, v_count;
  end if;
  -- Settle up to the actual 2-segment cost.
  perform public.settle_sms_budget(uid_starter, 0.01, 0.02, 0);
  select used_usd into v_used from public.sms_usage where user_id = uid_starter;
  if v_used <> 0.02 then
    raise exception 'sms used_usd after settle should be 0.02, got %', v_used;
  end if;

  -- ─── Settle refund clamp: cannot refund more than reserved ───────────────
  perform public.settle_sms_budget(uid_starter, 0.005, 0, 0);  -- refunds 0.005
  perform public.settle_sms_budget(uid_starter, 0.005, -99, 0); -- still only 0.005
  select used_usd into v_used from public.sms_usage where user_id = uid_starter;
  if v_used <> 0.01 then
    raise exception 'refund clamp failed: expected 0.01, got %', v_used;
  end if;

  -- ─── Reset follows Stripe current_period_end when available ──────────────
  insert into public.subscriptions (id, user_id, status, plan, current_period_start, current_period_end)
  values ('sub_test_' || uid_starter::text, uid_starter, 'active', 'starter',
          now() - interval '13 days', v_period_end);
  update public.sms_usage set reset_date = now() - interval '1 second' where user_id = uid_starter;
  perform public.reset_monthly_usage_if_needed(uid_starter);
  select reset_date, used_usd, used_count into v_reset, v_used, v_count
    from public.sms_usage where user_id = uid_starter;
  if v_reset is distinct from v_period_end then
    raise exception 'reset_date should equal stripe period end % , got %', v_period_end, v_reset;
  end if;
  if v_used <> 0 or v_count <> 0 then
    raise exception 'reset must zero usage (no rollover), got (%, %)', v_used, v_count;
  end if;

  -- ─── Calendar-month fallback for non-Stripe rows ─────────────────────────
  update public.message_usage set reset_date = now() - interval '1 second' where user_id = uid_free;
  perform public.reset_monthly_usage_if_needed(uid_free);
  select reset_date into v_reset from public.message_usage where user_id = uid_free;
  if v_reset is distinct from (date_trunc('month', now()) + interval '1 month') then
    raise exception 'fallback reset should be next calendar month, got %', v_reset;
  end if;

  -- ─── Privileges: client roles cannot execute billing RPCs ────────────────
  if has_function_privilege('authenticated', 'public.reserve_message_budget(uuid, numeric)', 'execute') then
    raise exception 'authenticated must not execute reserve_message_budget';
  end if;
  if has_function_privilege('anon', 'public.reserve_call_budget(uuid, numeric)', 'execute') then
    raise exception 'anon must not execute reserve_call_budget';
  end if;
  if has_function_privilege('authenticated', 'public.reserve_sms_budget(uuid, numeric, integer)', 'execute') then
    raise exception 'authenticated must not execute reserve_sms_budget';
  end if;
  if has_function_privilege('authenticated', 'public.settle_sms_budget(uuid, numeric, numeric, integer)', 'execute') then
    raise exception 'authenticated must not execute settle_sms_budget';
  end if;
  if has_function_privilege('anon', 'public.sms_rate_limit_hit(uuid, timestamptz, integer, integer)', 'execute') then
    raise exception 'anon must not execute sms_rate_limit_hit';
  end if;
  if not has_function_privilege('service_role', 'public.reserve_sms_budget(uuid, numeric, integer)', 'execute') then
    raise exception 'service_role must execute reserve_sms_budget';
  end if;
  if has_function_privilege('authenticated', 'public.unified_plan_budget_usd(text)', 'execute') then
    raise exception 'authenticated must not execute unified_plan_budget_usd';
  end if;

  -- ─── RLS shape: sms tables locked down ───────────────────────────────────
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'sms_usage' and policyname = 'sms_usage_select_own'
  ) then
    raise exception 'sms_usage select-own policy missing';
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'sms_usage'
       and cmd in ('INSERT', 'UPDATE', 'DELETE') and coalesce(qual, with_check) ilike '%true%'
  ) then
    raise exception 'sms_usage must not have permissive client write policies';
  end if;

  raise notice 'subscription v2 + unified pool behavior: ALL CHECKS PASSED';
end $$;

rollback;
