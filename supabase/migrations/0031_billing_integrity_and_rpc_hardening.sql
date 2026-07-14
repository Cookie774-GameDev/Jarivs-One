-- =============================================================================
-- 0031_billing_integrity_and_rpc_hardening
-- Server-authoritative Stripe application and least-privilege billing helpers.
-- This migration preserves existing rows and does not alter plan prices.
-- =============================================================================

-- Apex must propagate through every voice usage path.
alter table public.voice_usage
  drop constraint if exists voice_usage_plan_check;
alter table public.voice_usage
  add constraint voice_usage_plan_check
  check (plan in ('free', 'starter', 'pro', 'ultra', 'apex'));

create or replace function public.voice_budget_for_plan(p_plan text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select call_budget_usd
       from public.subscription_plan_limits
      where plan = coalesce(p_plan, 'free')),
    0::numeric
  );
$$;
revoke all on function public.voice_budget_for_plan(text) from public, anon, authenticated;
grant execute on function public.voice_budget_for_plan(text) to service_role;

-- Bound PBKDF2 inputs to prevent client-triggered CPU or memory exhaustion.
create or replace function public.pbkdf2_sha256(
  password bytea,
  salt bytea,
  iterations integer,
  dklen integer
)
returns bytea
language plpgsql
immutable
set search_path = public
as $$
declare
  block_count integer;
  result bytea := ''::bytea;
  block_idx integer;
  u bytea;
  t bytea;
  i integer;
  n integer;
  xored_hex text;
begin
  if password is null or octet_length(password) < 1 or octet_length(password) > 128 then
    raise exception using errcode = '22023', message = 'invalid password length';
  end if;
  if salt is null or octet_length(salt) < 8 or octet_length(salt) > 64 then
    raise exception using errcode = '22023', message = 'invalid salt length';
  end if;
  if iterations is null or iterations < 10000 or iterations > 600000 then
    raise exception using errcode = '22023', message = 'invalid iteration count';
  end if;
  if dklen is null or dklen < 16 or dklen > 64 then
    raise exception using errcode = '22023', message = 'invalid derived-key length';
  end if;

  block_count := ceil(dklen::numeric / 32);
  for block_idx in 1..block_count loop
    u := hmac(salt || decode(lpad(to_hex(block_idx), 8, '0'), 'hex'), password, 'sha256');
    t := u;
    for i in 2..iterations loop
      u := hmac(u, password, 'sha256');
      xored_hex := '';
      for n in 0..(length(t) - 1) loop
        xored_hex := xored_hex || lpad(to_hex(get_byte(t, n) # get_byte(u, n)), 2, '0');
      end loop;
      t := decode(xored_hex, 'hex');
    end loop;
    result := result || t;
  end loop;

  return substring(result from 1 for dklen);
end;
$$;
revoke all on function public.pbkdf2_sha256(bytea, bytea, integer, integer)
  from public, anon, authenticated;

-- Maintenance functions are cron/service operations, never client RPCs.
revoke all on function public.prune_outbound_pending() from public, anon, authenticated;
grant execute on function public.prune_outbound_pending() to service_role;
revoke all on function public.prune_call_audit(integer) from public, anon, authenticated;
grant execute on function public.prune_call_audit(integer) to service_role;

-- Rate limits are universal. Admins remain quota-unlimited, but provider
-- request volume must still be bounded and auditable.
create or replace function public.voice_rate_limit_hit(
  p_user_id uuid,
  p_window_start timestamptz,
  p_chars integer,
  p_max_requests integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_user_id is null or p_window_start is null or coalesce(p_max_requests, 0) < 1 then
    return jsonb_build_object('count', 0, 'limited', true, 'reason', 'invalid_rate_limit');
  end if;
  insert into public.voice_rate_limits (user_id, window_start, request_count, total_chars)
  values (p_user_id, p_window_start, 1, greatest(coalesce(p_chars, 0), 0))
  on conflict (user_id, window_start) do update
    set request_count = public.voice_rate_limits.request_count + 1,
        total_chars = public.voice_rate_limits.total_chars + greatest(coalesce(p_chars, 0), 0),
        updated_at = now()
  returning request_count into v_count;
  return jsonb_build_object('count', v_count, 'limited', v_count > p_max_requests);
end;
$$;
revoke all on function public.voice_rate_limit_hit(uuid, timestamptz, integer, integer)
  from public, anon, authenticated;
grant execute on function public.voice_rate_limit_hit(uuid, timestamptz, integer, integer)
  to service_role;
revoke all on function public.message_rate_limit_hit(uuid, timestamptz, integer, integer)
  from public, anon, authenticated;
grant execute on function public.message_rate_limit_hit(uuid, timestamptz, integer, integer)
  to service_role;

create index if not exists admin_credit_grants_admin_user_idx
  on public.admin_credit_grants (admin_user_id);

-- Keep existing webhook history, but store only bounded metadata going forward.
alter table public.subscription_events
  add column if not exists event_created_at timestamptz,
  add column if not exists processed_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists error_code text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.subscriptions
  add column if not exists stripe_event_created_at timestamptz,
  add column if not exists stripe_event_id text;

-- Treat the state present at migration time as authoritative. Without this
-- baseline, a delayed pre-migration webhook could overwrite an existing row.
update public.subscriptions
   set stripe_event_created_at = now(),
       stripe_event_id = 'migration:0031:' || id
 where stripe_event_created_at is null or stripe_event_id is null;

create table if not exists public.billing_checkout_guards (
  user_id uuid primary key references auth.users(id) on delete cascade,
  idempotency_key text not null check (length(idempotency_key) between 8 and 255),
  requested_plan text not null check (requested_plan in ('starter', 'pro', 'ultra', 'apex')),
  status text not null default 'pending' check (status in ('pending')),
  stripe_session_id text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.billing_checkout_guards enable row level security;
revoke all on table public.billing_checkout_guards from public, anon, authenticated;
grant select, insert, update, delete on table public.billing_checkout_guards to service_role;

create index if not exists billing_checkout_guards_expiry_idx
  on public.billing_checkout_guards (expires_at);

-- Claim one live Checkout slot per account. Same-key retries are idempotent;
-- different keys remain blocked until completion, explicit release, or expiry.
create or replace function public.claim_checkout_slot(
  p_user_id uuid,
  p_idempotency_key text,
  p_plan text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guard public.billing_checkout_guards%rowtype;
begin
  if p_user_id is null
     or p_idempotency_key is null
     or length(p_idempotency_key) not between 8 and 255
     or p_plan not in ('starter', 'pro', 'ultra', 'apex') then
    return jsonb_build_object('claimed', false, 'reason', 'invalid_checkout_claim');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  delete from public.billing_checkout_guards
   where user_id = p_user_id and expires_at <= now();

  select * into v_guard
    from public.billing_checkout_guards
   where user_id = p_user_id
   for update;
  if found then
    if v_guard.idempotency_key = p_idempotency_key
       and v_guard.requested_plan = p_plan then
      return jsonb_build_object(
        'claimed', true,
        'duplicate', true,
        'stripe_session_id', v_guard.stripe_session_id,
        'expires_at', v_guard.expires_at
      );
    end if;
    return jsonb_build_object('claimed', false, 'reason', 'checkout_in_progress');
  end if;

  insert into public.billing_checkout_guards
    (user_id, idempotency_key, requested_plan, expires_at)
  values
    (p_user_id, p_idempotency_key, p_plan, now() + interval '30 minutes')
  returning * into v_guard;
  return jsonb_build_object(
    'claimed', true,
    'duplicate', false,
    'expires_at', v_guard.expires_at
  );
end;
$$;
revoke all on function public.claim_checkout_slot(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_checkout_slot(uuid, text, text) to service_role;

create or replace function public.attach_checkout_session(
  p_user_id uuid,
  p_idempotency_key text,
  p_session_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_user_id is null or p_idempotency_key is null
     or p_session_id is null or length(p_session_id) not between 4 and 255 then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  update public.billing_checkout_guards
     set stripe_session_id = p_session_id,
         updated_at = now()
   where user_id = p_user_id
     and idempotency_key = p_idempotency_key
     and expires_at > now()
     and (stripe_session_id is null or stripe_session_id = p_session_id);
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;
revoke all on function public.attach_checkout_session(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.attach_checkout_session(uuid, text, text) to service_role;

create or replace function public.complete_checkout_slot(
  p_user_id uuid,
  p_session_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_user_id is null or p_session_id is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  delete from public.billing_checkout_guards
   where user_id = p_user_id and stripe_session_id = p_session_id;
  get diagnostics v_count = row_count;
  if v_count = 1 then return true; end if;
  return not exists (
    select 1 from public.billing_checkout_guards where user_id = p_user_id
  );
end;
$$;
revoke all on function public.complete_checkout_slot(uuid, text)
  from public, anon, authenticated;
grant execute on function public.complete_checkout_slot(uuid, text) to service_role;

create or replace function public.release_checkout_slot(
  p_user_id uuid,
  p_idempotency_key text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_user_id is null or p_idempotency_key is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  delete from public.billing_checkout_guards
   where user_id = p_user_id
     and idempotency_key = p_idempotency_key
     and stripe_session_id is null;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;
revoke all on function public.release_checkout_slot(uuid, text)
  from public, anon, authenticated;
grant execute on function public.release_checkout_slot(uuid, text) to service_role;

create index if not exists subscription_events_retention_idx
  on public.subscription_events (processed, processed_at)
  where processed;

revoke all on table public.subscription_events from public, anon, authenticated;
grant select, insert, update, delete on table public.subscription_events to service_role;
revoke all on table public.stripe_events from public, anon, authenticated;
grant select, insert, update, delete on table public.stripe_events to service_role;

-- The trigger remains the only profile-tier projection. It computes the highest
-- currently entitled subscription, so deleting one subscription cannot revoke
-- another active subscription owned by the same user.
create or replace function public.sync_profile_tier_from_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_tier text;
  v_user_id uuid;
begin
  v_user_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  select s.plan
    into v_target_tier
    from public.subscriptions s
   where s.user_id = v_user_id
     and s.status in ('active', 'trialing', 'past_due')
   order by case s.plan
              when 'apex' then 5
              when 'ultra' then 4
              when 'pro' then 3
              when 'starter' then 2
              else 1
            end desc,
            s.current_period_end desc nulls last
   limit 1;

  v_target_tier := coalesce(v_target_tier, 'free');
  update public.profiles
     set tier = v_target_tier,
         monthly_quota = case v_target_tier
                           when 'starter' then 1500
                           when 'pro' then 5000
                           when 'ultra' then 25000
                           when 'apex' then 62000
                           else 50
                         end,
         updated_at = now()
   where id = v_user_id;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
revoke all on function public.sync_profile_tier_from_subscription()
  from public, anon, authenticated;

drop trigger if exists subscriptions_sync_profile on public.subscriptions;
create trigger subscriptions_sync_profile
  after insert or update or delete on public.subscriptions
  for each row
  execute function public.sync_profile_tier_from_subscription();

-- Apply one Stripe subscription event as a single database transaction.
-- The caller supplies a plan derived from a server-side price allowlist.
create or replace function public.apply_stripe_subscription_event(
  p_event_id text,
  p_event_type text,
  p_event_created_at timestamptz,
  p_customer_id text,
  p_subscription_id text,
  p_status text,
  p_plan text,
  p_price_id text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.subscription_events%rowtype;
  v_profile_id uuid;
  v_existing public.subscriptions%rowtype;
  v_plan text;
  v_existing_revokes boolean;
  v_incoming_revokes boolean;
begin
  if p_event_id is null or length(p_event_id) not between 4 and 255
     or p_event_type is null or length(p_event_type) not between 3 and 255
     or p_event_created_at is null
     or p_customer_id is null or length(p_customer_id) not between 4 and 255
     or p_subscription_id is null or length(p_subscription_id) not between 4 and 255
     or p_status not in (
       'active', 'trialing', 'past_due', 'canceled', 'unpaid',
       'incomplete', 'incomplete_expired', 'paused'
     ) then
    raise exception using errcode = '22023', message = 'invalid billing event';
  end if;

  insert into public.subscription_events
    (event_id, event_type, event_created_at, stripe_customer_id,
     stripe_subscription_id, processed, payload, attempt_count, error_code, updated_at)
  values
    (p_event_id, p_event_type, p_event_created_at, p_customer_id,
     p_subscription_id, false, null, 1, null, now())
  on conflict (event_id) do update
    set attempt_count = public.subscription_events.attempt_count + 1,
        updated_at = now()
  returning * into v_event;

  select * into v_event
    from public.subscription_events
   where event_id = p_event_id
   for update;
  if v_event.processed then
    return jsonb_build_object('applied', false, 'reason', 'duplicate_event');
  end if;

  select id into v_profile_id
    from public.profiles
   where stripe_customer_id = p_customer_id
   for update;
  if v_profile_id is null then
    raise exception using errcode = 'P0001', message = 'billing_customer_unmapped';
  end if;

  select * into v_existing
    from public.subscriptions
   where id = p_subscription_id
   for update;

  if v_existing.id is not null and v_existing.user_id <> v_profile_id then
    raise exception using errcode = 'P0001', message = 'billing_subscription_owner_mismatch';
  end if;
  v_existing_revokes := v_existing.status in (
    'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'
  );
  v_incoming_revokes := p_status in (
    'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'
  );
  if v_existing.stripe_event_created_at is not null
     and (
       v_existing.stripe_event_created_at > p_event_created_at
       or (
         v_existing.stripe_event_created_at = p_event_created_at
         and (
           (v_existing_revokes and not v_incoming_revokes)
           or (
             v_existing_revokes = v_incoming_revokes
             and coalesce(v_existing.stripe_event_id, '') >= p_event_id
           )
         )
       )
     ) then
    update public.subscription_events
       set user_id = v_profile_id,
           processed = true,
           processed_at = now(),
           error_code = null,
           payload = null,
           updated_at = now()
     where event_id = p_event_id;
    return jsonb_build_object('applied', false, 'reason', 'stale_event');
  end if;

  v_plan := coalesce(
    p_plan,
    v_existing.plan,
    case when v_incoming_revokes then 'free' end
  );
  if v_plan is null or v_plan not in ('free', 'starter', 'pro', 'ultra', 'apex') then
    raise exception using errcode = 'P0001', message = 'billing_plan_unmapped';
  end if;
  if p_status in ('active', 'trialing', 'past_due') and p_plan is null then
    raise exception using errcode = 'P0001', message = 'billing_plan_unmapped';
  end if;

  insert into public.subscriptions
    (id, user_id, stripe_customer_id, status, plan, price_id,
     current_period_start, current_period_end, cancel_at_period_end,
     stripe_event_created_at, stripe_event_id, canceled_at)
  values
    (p_subscription_id, v_profile_id, p_customer_id, p_status, v_plan, p_price_id,
     p_period_start, p_period_end, coalesce(p_cancel_at_period_end, false),
     p_event_created_at, p_event_id,
     case when v_incoming_revokes then now() else null end)
  on conflict (id) do update
    set stripe_customer_id = excluded.stripe_customer_id,
        status = excluded.status,
        plan = excluded.plan,
        price_id = coalesce(excluded.price_id, public.subscriptions.price_id),
        current_period_start = coalesce(excluded.current_period_start, public.subscriptions.current_period_start),
        current_period_end = coalesce(excluded.current_period_end, public.subscriptions.current_period_end),
        cancel_at_period_end = excluded.cancel_at_period_end,
        stripe_event_created_at = excluded.stripe_event_created_at,
        stripe_event_id = excluded.stripe_event_id,
        canceled_at = excluded.canceled_at,
        updated_at = now();

  update public.subscription_events
     set user_id = v_profile_id,
         processed = true,
         processed_at = now(),
         error_code = null,
         payload = null,
         updated_at = now()
   where event_id = p_event_id;

  return jsonb_build_object('applied', true, 'reason', 'subscription_updated');
end;
$$;
revoke all on function public.apply_stripe_subscription_event(
  text, text, timestamptz, text, text, text, text, text,
  timestamptz, timestamptz, boolean
) from public, anon, authenticated;
grant execute on function public.apply_stripe_subscription_event(
  text, text, timestamptz, text, text, text, text, text,
  timestamptz, timestamptz, boolean
) to service_role;

-- Failure recording is intentionally separate because a raised transaction is
-- rolled back. Only stable error codes are persisted; provider payloads and raw
-- exception messages are never written.
create or replace function public.record_stripe_event_failure(
  p_event_id text,
  p_event_type text,
  p_event_created_at timestamptz,
  p_customer_id text,
  p_subscription_id text,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_error_code text;
begin
  if p_event_id is null or length(p_event_id) not between 4 and 255 then
    raise exception using errcode = '22023', message = 'invalid billing event';
  end if;
  v_error_code := case
    when coalesce(p_error_code, '') ~ '^[a-z0-9_]{3,64}$' then p_error_code
    else 'billing_event_failed'
  end;

  insert into public.subscription_events
    (event_id, event_type, event_created_at, stripe_customer_id,
     stripe_subscription_id, processed, payload, attempt_count, error_code, updated_at)
  values
    (p_event_id, left(coalesce(p_event_type, 'unknown'), 255), p_event_created_at,
     left(p_customer_id, 255), left(p_subscription_id, 255), false, null, 1,
     v_error_code, now())
  on conflict (event_id) do update
    set attempt_count = public.subscription_events.attempt_count + 1,
        error_code = case when public.subscription_events.processed then null else excluded.error_code end,
        payload = null,
        updated_at = now();
end;
$$;
revoke all on function public.record_stripe_event_failure(
  text, text, timestamptz, text, text, text
) from public, anon, authenticated;
grant execute on function public.record_stripe_event_failure(
  text, text, timestamptz, text, text, text
) to service_role;

-- Retention is opt-in and service-only. This migration never invokes it.
create or replace function public.prune_subscription_events(p_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_days is null or p_days < 30 or p_days > 3650 then
    raise exception using errcode = '22023', message = 'invalid retention period';
  end if;
  delete from public.subscription_events
   where processed
     and processed_at < now() - make_interval(days => p_days);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.prune_subscription_events(integer)
  from public, anon, authenticated;
grant execute on function public.prune_subscription_events(integer) to service_role;
