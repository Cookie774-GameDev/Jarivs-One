-- =============================================================================
-- 0035_app_access_checkout_attempts.sql
-- Durable, service-role-only lifecycle for VibeSpace Access Stripe Checkout.
--
-- One open attempt per account serializes concurrent/logical retries around a
-- server-generated, attempt-scoped Stripe idempotency key. Open Sessions remain
-- reusable until their server-owned expiry. Expired or abandoned attempts are
-- terminal. Completed attempts fail closed until a newer authoritative
-- entitlement snapshot proves the old subscription lifecycle ended; only then
-- can a genuinely later payment attempt receive a new Session and key.
--
-- This migration accepts no price, amount, customer, redirect, entitlement, or
-- client idempotency input. It never grants app access or mutates profiles.tier.
-- The verified Stripe webhook remains the sole activation authority.
-- =============================================================================

set lock_timeout = '5s';
set statement_timeout = '60s';

create table if not exists public.app_access_checkout_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  state text not null default 'reserved'
    check (state in (
      'reserved', 'session_created', 'completed', 'expired', 'abandoned'
    )),
  lease_expires_at timestamptz not null,
  expires_at timestamptz not null,
  stripe_session_id text check (
    stripe_session_id is null
    or char_length(stripe_session_id) between 1 and 128
  ),
  stripe_session_url text check (
    stripe_session_url is null
    or (
      char_length(stripe_session_url) between 1 and 2048
      and stripe_session_url = btrim(stripe_session_url)
      and stripe_session_url ~*
        '^https://checkout[.]stripe[.]com(:443)?/'
    )
  ),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (lease_expires_at > created_at),
  check (expires_at > created_at),
  check (
    (stripe_session_id is null and stripe_session_url is null)
    or (stripe_session_id is not null and stripe_session_url is not null)
  ),
  check (
    state not in ('session_created', 'completed', 'expired')
    or (stripe_session_id is not null and stripe_session_url is not null)
  ),
  check (
    (state in ('reserved', 'session_created') and closed_at is null)
    or (state in ('completed', 'expired', 'abandoned') and closed_at is not null)
  )
);

comment on table public.app_access_checkout_attempts is
  'Service-role-only Stripe Checkout attempt lifecycle. Never authoritative for app access.';
comment on column public.app_access_checkout_attempts.lease_expires_at is
  'Bounded recovery lease for a reservation that has not reached durable Session completion.';
comment on column public.app_access_checkout_attempts.expires_at is
  'Server-owned Stripe Checkout Session expiry; a later reservation receives a new attempt key.';

create unique index if not exists app_access_checkout_attempts_open_user_uidx
  on public.app_access_checkout_attempts (user_id)
  where state in ('reserved', 'session_created');
create unique index if not exists app_access_checkout_attempts_session_uidx
  on public.app_access_checkout_attempts (stripe_session_id)
  where stripe_session_id is not null;
create index if not exists app_access_checkout_attempts_user_created_idx
  on public.app_access_checkout_attempts (user_id, created_at desc);
create index if not exists app_access_checkout_attempts_expiry_idx
  on public.app_access_checkout_attempts (state, expires_at);

alter table public.app_access_checkout_attempts enable row level security;

drop policy if exists app_access_checkout_attempts_service
  on public.app_access_checkout_attempts;
create policy app_access_checkout_attempts_service
  on public.app_access_checkout_attempts
  for all
  to service_role
  using (true)
  with check (true);

-- Private Data API object: clients cannot read or mutate attempts. The Edge
-- Function's server-side service-role client receives the only table grant.
revoke all on table public.app_access_checkout_attempts from public;
revoke all on table public.app_access_checkout_attempts from anon;
revoke all on table public.app_access_checkout_attempts from authenticated;
grant select, insert, update, delete
  on table public.app_access_checkout_attempts
  to service_role;

create or replace function public.app_access_checkout_attempt_touch()
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

revoke all on function public.app_access_checkout_attempt_touch()
  from public, anon, authenticated;
grant execute on function public.app_access_checkout_attempt_touch()
  to service_role;

drop trigger if exists app_access_checkout_attempt_touch
  on public.app_access_checkout_attempts;
create trigger app_access_checkout_attempt_touch
  before update on public.app_access_checkout_attempts
  for each row
  execute function public.app_access_checkout_attempt_touch();

-- Reserve or reuse one account-local attempt. A transaction advisory lock
-- serializes this decision even when no row exists yet; the partial unique
-- index remains defense in depth.
create or replace function public.app_access_reserve_checkout_attempt(
  p_user_id uuid
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := now();
  v_attempt public.app_access_checkout_attempts%rowtype;
  v_attempt_id uuid;
begin
  if p_user_id is null then
    raise exception using
      errcode = '22023',
      message = 'invalid_checkout_attempt_user';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  -- Recover abandoned in-flight work after a bounded lease. A Stripe-created
  -- Session whose DB completion failed can first be recovered by replaying the
  -- same attempt key; only after this lease may a later logical attempt start.
  update public.app_access_checkout_attempts
     set state = 'abandoned',
         closed_at = v_now
   where user_id = p_user_id
     and state = 'reserved'
     and lease_expires_at <= v_now;

  update public.app_access_checkout_attempts
     set state = 'expired',
         closed_at = v_now
   where user_id = p_user_id
     and state = 'session_created'
     and expires_at <= v_now;

  -- Atomic duplicate-subscription guard at the reservation boundary. A local
  -- app trial without a Stripe subscription remains eligible to checkout.
  if exists (
    select 1
      from public.app_access_entitlements
     where user_id = p_user_id
       and stripe_subscription_id is not null
       and (
         provider_status is null
         or provider_status not in ('canceled', 'unpaid', 'incomplete_expired')
       )
  ) then
    return jsonb_build_object('outcome', 'duplicate_access');
  end if;

  -- A server-confirmed completed Checkout Session must wait for webhook
  -- reconciliation before another subscription can be started. A newer
  -- authoritative terminal provider snapshot proves the completed attempt
  -- belongs to an older subscription lifecycle and safely releases the hold.
  if exists (
    select 1
      from public.app_access_checkout_attempts attempt
     where attempt.user_id = p_user_id
       and attempt.state = 'completed'
       and not exists (
         select 1
           from public.app_access_entitlements entitlement
          where entitlement.user_id = p_user_id
            and entitlement.stripe_subscription_id is not null
            and entitlement.provider_status in (
              'canceled', 'unpaid', 'incomplete_expired'
            )
            and entitlement.provider_status_updated_at >= attempt.created_at
       )
  ) then
    return jsonb_build_object('outcome', 'checkout_pending');
  end if;

  select *
    into v_attempt
    from public.app_access_checkout_attempts
   where user_id = p_user_id
     and state in ('reserved', 'session_created')
   order by created_at desc
   limit 1
   for update;

  if found then
    return jsonb_build_object(
      'outcome', v_attempt.state,
      'state', v_attempt.state,
      'attemptId', v_attempt.id,
      'idempotencyKey', 'access_checkout_attempt:' || v_attempt.id::text,
      'leaseExpiresAt', v_attempt.lease_expires_at,
      'expiresAt', v_attempt.expires_at,
      'createdAt', v_attempt.created_at,
      'sessionId', v_attempt.stripe_session_id,
      'url', v_attempt.stripe_session_url
    );
  end if;

  v_attempt_id := gen_random_uuid();
  insert into public.app_access_checkout_attempts (
    id,
    user_id,
    state,
    lease_expires_at,
    expires_at
  ) values (
    v_attempt_id,
    p_user_id,
    'reserved',
    v_now + interval '5 minutes',
    v_now + interval '1 hour'
  )
  returning * into v_attempt;

  return jsonb_build_object(
    'outcome', 'reserved',
    'state', 'reserved',
    'attemptId', v_attempt.id,
    'idempotencyKey', 'access_checkout_attempt:' || v_attempt.id::text,
    'leaseExpiresAt', v_attempt.lease_expires_at,
    'expiresAt', v_attempt.expires_at,
    'createdAt', v_attempt.created_at,
    'sessionId', null,
    'url', null
  );
end;
$$;

comment on function public.app_access_reserve_checkout_attempt(uuid) is
  'Service-role-only reservation/reuse of one account-local Stripe Checkout attempt.';

revoke all on function public.app_access_reserve_checkout_attempt(uuid)
  from public, anon, authenticated;
grant execute on function public.app_access_reserve_checkout_attempt(uuid)
  to service_role;

-- Complete the durable Session boundary and its minimal checkout_created audit
-- in one transaction. Any validation/audit failure rolls the state update back
-- to reserved, allowing a same-key retry during the lease.
create or replace function public.app_access_complete_checkout_attempt(
  p_user_id uuid,
  p_attempt_id uuid,
  p_stripe_session_id text,
  p_stripe_session_url text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_attempt public.app_access_checkout_attempts%rowtype;
  v_status text;
  v_provider_event_id text;
begin
  if p_user_id is null
     or p_attempt_id is null
     or p_stripe_session_id is null
     or char_length(p_stripe_session_id) not between 1 and 128
     or p_stripe_session_id <> btrim(p_stripe_session_id)
     or p_stripe_session_url is null
     or char_length(p_stripe_session_url) not between 1 and 2048
     or p_stripe_session_url <> btrim(p_stripe_session_url)
     or p_stripe_session_url !~*
       '^https://checkout[.]stripe[.]com(:443)?/' then
    raise exception using
      errcode = '22023',
      message = 'invalid_checkout_attempt_completion';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select *
    into v_attempt
    from public.app_access_checkout_attempts
   where id = p_attempt_id
     and user_id = p_user_id
   for update;
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'checkout_attempt_not_found';
  end if;

  if v_attempt.state = 'session_created' then
    if v_attempt.stripe_session_id is distinct from p_stripe_session_id
       or v_attempt.stripe_session_url is distinct from p_stripe_session_url then
      raise exception using
        errcode = '40001',
        message = 'checkout_attempt_completion_conflict';
    end if;
    return jsonb_build_object(
      'outcome', 'session_created',
      'state', 'session_created',
      'attemptId', v_attempt.id,
      'idempotencyKey', 'access_checkout_attempt:' || v_attempt.id::text,
      'leaseExpiresAt', v_attempt.lease_expires_at,
      'expiresAt', v_attempt.expires_at,
      'createdAt', v_attempt.created_at,
      'sessionId', v_attempt.stripe_session_id,
      'url', v_attempt.stripe_session_url
    );
  end if;
  if v_attempt.state <> 'reserved' then
    raise exception using
      errcode = '40001',
      message = 'checkout_attempt_not_open';
  end if;

  update public.app_access_checkout_attempts
     set state = 'session_created',
         stripe_session_id = p_stripe_session_id,
         stripe_session_url = p_stripe_session_url
   where id = p_attempt_id
     and user_id = p_user_id
     and state = 'reserved'
  returning * into v_attempt;
  if not found then
    raise exception using
      errcode = '40001',
      message = 'checkout_attempt_completion_conflict';
  end if;

  select status
    into v_status
    from public.app_access_entitlements
   where user_id = p_user_id;
  v_provider_event_id :=
    'access_checkout_attempt:' || p_attempt_id::text || ':' || p_stripe_session_id;

  insert into public.app_access_events (
    user_id,
    event_type,
    provider_event_id,
    stripe_subscription_id,
    status,
    reason,
    occurred_at
  ) values (
    p_user_id,
    'checkout_created',
    v_provider_event_id,
    null,
    v_status,
    'checkout_created',
    now()
  )
  on conflict (provider_event_id) do nothing;
  if not exists (
    select 1
      from public.app_access_events
     where provider_event_id = v_provider_event_id
       and user_id = p_user_id
       and event_type = 'checkout_created'
       and stripe_subscription_id is null
       and reason = 'checkout_created'
  ) then
    raise exception using
      errcode = '40001',
      message = 'checkout_attempt_audit_conflict';
  end if;

  return jsonb_build_object(
    'outcome', 'session_created',
    'state', 'session_created',
    'attemptId', v_attempt.id,
    'idempotencyKey', 'access_checkout_attempt:' || v_attempt.id::text,
    'leaseExpiresAt', v_attempt.lease_expires_at,
    'expiresAt', v_attempt.expires_at,
    'createdAt', v_attempt.created_at,
    'sessionId', v_attempt.stripe_session_id,
    'url', v_attempt.stripe_session_url
  );
end;
$$;

comment on function public.app_access_complete_checkout_attempt(
  uuid, uuid, text, text
) is
  'Atomically stores a verified Stripe Session and one non-authoritative checkout-created audit event.';

revoke all on function public.app_access_complete_checkout_attempt(
  uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.app_access_complete_checkout_attempt(
  uuid, uuid, text, text
) to service_role;

-- Trusted terminal transition for webhook/admin recovery. It is deliberately
-- unavailable to clients and never changes entitlement state.
create or replace function public.app_access_close_checkout_attempt(
  p_user_id uuid,
  p_attempt_id uuid,
  p_state text
)
returns void
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_current_state text;
begin
  if p_user_id is null
     or p_attempt_id is null
     or p_state is null
     or p_state not in ('completed', 'expired', 'abandoned') then
    raise exception using
      errcode = '22023',
      message = 'invalid_checkout_attempt_terminal_state';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select state
    into v_current_state
    from public.app_access_checkout_attempts
   where id = p_attempt_id
     and user_id = p_user_id
   for update;
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'checkout_attempt_not_found';
  end if;
  if v_current_state = p_state then
    return;
  end if;
  if (v_current_state = 'reserved' and p_state <> 'abandoned')
     or v_current_state in ('completed', 'expired', 'abandoned') then
    raise exception using
      errcode = '40001',
      message = 'invalid_checkout_attempt_transition';
  end if;

  update public.app_access_checkout_attempts
     set state = p_state,
         closed_at = now()
   where id = p_attempt_id
     and user_id = p_user_id;
end;
$$;

comment on function public.app_access_close_checkout_attempt(uuid, uuid, text) is
  'Service-role-only terminal transition for a checkout attempt; never grants app access.';

revoke all on function public.app_access_close_checkout_attempt(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.app_access_close_checkout_attempt(uuid, uuid, text)
  to service_role;

-- DATA-PRESERVING OPERATIONAL ROLLBACK: disable the app-access launch gate and
-- redeploy the last approved compatible checkout handler. Retain attempt rows
-- for reconciliation/audit. Remove RPCs/table only after export and retention
-- review approves a separate reverse-order schema rollback.
