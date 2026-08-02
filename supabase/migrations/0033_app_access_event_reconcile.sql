-- =============================================================================
-- 0033_app_access_event_reconcile.sql
-- Atomic, service-role-only Stripe app-access reconciliation.
--
-- The verified Edge Function still owns signature verification, Stripe price
-- authority, projection validation, and state derivation. This RPC accepts only
-- that bounded derived command and applies, in one PostgreSQL transaction:
--   1. the revision/provider-time-preconditioned entitlement transition;
--   2. every required minimal audit event; and
--   3. subscription_events.processed completion.
--
-- Any exception rolls all three back. Known duplicate and concurrency outcomes
-- are returned as bounded text codes. The durable claim is intentionally created
-- before this RPC; missing claims fail closed.
-- =============================================================================

set lock_timeout = '5s';
set statement_timeout = '60s';

create or replace function public.app_access_reconcile_event(
  p_event_id text,
  p_user_id uuid,
  p_expected_revision bigint,
  p_expected_provider_status_updated_at timestamptz,
  p_entitlement jsonb,
  p_events jsonb
)
returns text
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_claim_processed boolean;
  v_existing_event_user uuid;
  v_entitlement_keys constant text[] := array[
    'status',
    'provider_status',
    'provider_status_updated_at',
    'stripe_customer_id',
    'stripe_subscription_id',
    'stripe_price_id',
    'current_period_start',
    'current_period_end',
    'cancel_at_period_end',
    'last_payment_status',
    'access_ended_at',
    'trial_started_at',
    'trial_ends_at',
    'grace_started_at',
    'grace_ends_at',
    'locked_at'
  ];
  v_event_keys constant text[] := array[
    'user_id',
    'event_type',
    'provider_event_id',
    'stripe_subscription_id',
    'status',
    'reason',
    'occurred_at'
  ];
  v_event jsonb;
  v_provider_timestamp timestamptz;
  v_primary_events integer := 0;
  v_rows integer;
begin
  if p_event_id is null
     or char_length(p_event_id) < 1
     or char_length(p_event_id) > 255
     or p_user_id is null then
    raise exception using
      errcode = '22023',
      message = 'invalid_app_access_event_identity';
  end if;
  if p_expected_revision is not null and p_expected_revision < 0 then
    raise exception using
      errcode = '22023',
      message = 'invalid_app_access_revision';
  end if;
  if p_expected_revision is null
     and p_expected_provider_status_updated_at is not null then
    raise exception using
      errcode = '22023',
      message = 'invalid_app_access_precondition';
  end if;

  -- Serialize all deliveries for the durable claim. A missing claim must never
  -- mutate app-access state.
  select se.processed
    into v_claim_processed
    from public.subscription_events as se
   where se.event_id = p_event_id
   for update;
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'app_access_claim_missing';
  end if;
  if v_claim_processed then
    return 'duplicate';
  end if;

  -- Recover safely from a pre-0033 partial delivery: the unique provider audit
  -- proves the authoritative transition reached its durable audit boundary.
  select ae.user_id
    into v_existing_event_user
    from public.app_access_events as ae
   where ae.provider_event_id = p_event_id;
  if found then
    if v_existing_event_user is distinct from p_user_id then
      raise exception using
        errcode = '22023',
        message = 'app_access_duplicate_owner_mismatch';
    end if;
    update public.subscription_events
       set processed = true
     where event_id = p_event_id
       and not processed;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      raise exception using
        errcode = 'P0001',
        message = 'app_access_completion_conflict';
    end if;
    return 'duplicate';
  end if;

  -- Strict command shape: callers cannot smuggle user_id, revision, timestamps,
  -- or unrelated columns into the entitlement write.
  if p_entitlement is null
     or jsonb_typeof(p_entitlement) <> 'object'
     or not (p_entitlement ?& v_entitlement_keys)
     or exists (
       select 1
         from jsonb_object_keys(p_entitlement) as supplied(key)
        where not (supplied.key = any (v_entitlement_keys))
     ) then
    raise exception using
      errcode = '22023',
      message = 'invalid_app_access_entitlement_shape';
  end if;
  if jsonb_typeof(p_entitlement->'status') <> 'string'
     or jsonb_typeof(p_entitlement->'provider_status') <> 'string'
     or p_entitlement->>'status' not in (
       'prelaunch','trialing','active','cancel_at_period_end','past_due',
       'grace','locked','admin','internal','unknown'
     )
     or p_entitlement->>'provider_status' not in (
       'trialing','active','past_due','canceled','unpaid',
       'incomplete','incomplete_expired','paused'
     )
     or jsonb_typeof(p_entitlement->'provider_status_updated_at') <> 'string'
     or jsonb_typeof(p_entitlement->'cancel_at_period_end') <> 'boolean' then
    raise exception using
      errcode = '22023',
      message = 'invalid_app_access_entitlement_values';
  end if;
  if exists (
    select 1
      from unnest(array[
        'stripe_customer_id',
        'stripe_subscription_id',
        'stripe_price_id',
        'current_period_start',
        'current_period_end',
        'last_payment_status',
        'access_ended_at',
        'trial_started_at',
        'trial_ends_at',
        'grace_started_at',
        'grace_ends_at',
        'locked_at'
      ]) as nullable_key(key)
     where jsonb_typeof(p_entitlement->nullable_key.key) not in ('string', 'null')
  ) then
    raise exception using
      errcode = '22023',
      message = 'invalid_app_access_entitlement_types';
  end if;
  if exists (
    select 1
      from (values
        (p_entitlement->>'stripe_customer_id'),
        (p_entitlement->>'stripe_subscription_id'),
        (p_entitlement->>'stripe_price_id')
      ) as ids(value)
     where ids.value is not null
       and (char_length(ids.value) < 1 or char_length(ids.value) > 255)
  ) or (
    p_entitlement->>'last_payment_status' is not null
    and (
      char_length(p_entitlement->>'last_payment_status') < 1
      or char_length(p_entitlement->>'last_payment_status') > 64
    )
  ) then
    raise exception using
      errcode = '22023',
      message = 'invalid_app_access_entitlement_identifiers';
  end if;
  v_provider_timestamp :=
    (p_entitlement->>'provider_status_updated_at')::timestamptz;

  if p_events is null
     or jsonb_typeof(p_events) <> 'array'
     or jsonb_array_length(p_events) < 1
     or jsonb_array_length(p_events) > 8 then
    raise exception using
      errcode = '22023',
      message = 'invalid_app_access_events_shape';
  end if;
  for v_event in select value from jsonb_array_elements(p_events)
  loop
    if jsonb_typeof(v_event) <> 'object'
       or not (v_event ?& v_event_keys)
       or exists (
         select 1
           from jsonb_object_keys(v_event) as supplied(key)
          where not (supplied.key = any (v_event_keys))
       ) then
      raise exception using
        errcode = '22023',
        message = 'invalid_app_access_audit_shape';
    end if;
    if jsonb_typeof(v_event->'user_id') <> 'string'
       or jsonb_typeof(v_event->'event_type') <> 'string'
       or jsonb_typeof(v_event->'provider_event_id') not in ('string', 'null')
       or jsonb_typeof(v_event->'stripe_subscription_id') not in ('string', 'null')
       or jsonb_typeof(v_event->'status') not in ('string', 'null')
       or jsonb_typeof(v_event->'reason') not in ('string', 'null')
       or (v_event->>'user_id')::uuid is distinct from p_user_id
       or v_event->>'event_type' not in (
         'trial_started','checkout_created','payment_succeeded',
         'payment_failed','subscription_cancelled','grace_started',
         'grace_ended','lock_applied','access_restored','admin_override'
       )
       or jsonb_typeof(v_event->'occurred_at') <> 'string'
       or (
         v_event->>'stripe_subscription_id' is not null
         and (
           char_length(v_event->>'stripe_subscription_id') < 1
           or char_length(v_event->>'stripe_subscription_id') > 255
         )
       )
       or (
         v_event->>'status' is not null
         and (
           char_length(v_event->>'status') < 1
           or char_length(v_event->>'status') > 64
         )
       )
       or (
         v_event->>'reason' is not null
         and (
           char_length(v_event->>'reason') < 1
           or char_length(v_event->>'reason') > 256
         )
       ) then
      raise exception using
        errcode = '22023',
        message = 'invalid_app_access_audit_values';
    end if;
    perform (v_event->>'occurred_at')::timestamptz;
    if v_event->>'provider_event_id' = p_event_id then
      v_primary_events := v_primary_events + 1;
    elsif v_event->>'provider_event_id' is not null then
      raise exception using
        errcode = '22023',
        message = 'invalid_app_access_audit_provider_event';
    end if;
  end loop;
  if v_primary_events <> 1 then
    raise exception using
      errcode = '22023',
      message = 'invalid_app_access_primary_audit_count';
  end if;

  if p_expected_revision is null then
    insert into public.app_access_entitlements (
      user_id,
      status,
      provider_status,
      provider_status_updated_at,
      stripe_customer_id,
      stripe_subscription_id,
      stripe_price_id,
      current_period_start,
      current_period_end,
      cancel_at_period_end,
      last_payment_status,
      access_ended_at,
      trial_started_at,
      trial_ends_at,
      grace_started_at,
      grace_ends_at,
      locked_at
    ) values (
      p_user_id,
      p_entitlement->>'status',
      p_entitlement->>'provider_status',
      v_provider_timestamp,
      p_entitlement->>'stripe_customer_id',
      p_entitlement->>'stripe_subscription_id',
      p_entitlement->>'stripe_price_id',
      (p_entitlement->>'current_period_start')::timestamptz,
      (p_entitlement->>'current_period_end')::timestamptz,
      (p_entitlement->>'cancel_at_period_end')::boolean,
      p_entitlement->>'last_payment_status',
      (p_entitlement->>'access_ended_at')::timestamptz,
      (p_entitlement->>'trial_started_at')::timestamptz,
      (p_entitlement->>'trial_ends_at')::timestamptz,
      (p_entitlement->>'grace_started_at')::timestamptz,
      (p_entitlement->>'grace_ends_at')::timestamptz,
      (p_entitlement->>'locked_at')::timestamptz
    )
    on conflict (user_id) do nothing;
    get diagnostics v_rows = row_count;
  else
    update public.app_access_entitlements
       set status = p_entitlement->>'status',
           provider_status = p_entitlement->>'provider_status',
           provider_status_updated_at = v_provider_timestamp,
           stripe_customer_id = p_entitlement->>'stripe_customer_id',
           stripe_subscription_id = p_entitlement->>'stripe_subscription_id',
           stripe_price_id = p_entitlement->>'stripe_price_id',
           current_period_start =
             (p_entitlement->>'current_period_start')::timestamptz,
           current_period_end =
             (p_entitlement->>'current_period_end')::timestamptz,
           cancel_at_period_end =
             (p_entitlement->>'cancel_at_period_end')::boolean,
           last_payment_status = p_entitlement->>'last_payment_status',
           access_ended_at = (p_entitlement->>'access_ended_at')::timestamptz,
           trial_started_at = (p_entitlement->>'trial_started_at')::timestamptz,
           trial_ends_at = (p_entitlement->>'trial_ends_at')::timestamptz,
           grace_started_at = (p_entitlement->>'grace_started_at')::timestamptz,
           grace_ends_at = (p_entitlement->>'grace_ends_at')::timestamptz,
           locked_at = (p_entitlement->>'locked_at')::timestamptz
     where user_id = p_user_id
       and revision = p_expected_revision
       and provider_status_updated_at
             is not distinct from p_expected_provider_status_updated_at
       and (
         provider_status_updated_at is null
         or provider_status_updated_at < v_provider_timestamp
         or (
           provider_status_updated_at = v_provider_timestamp
           and case status
                 when p_entitlement->>'status' then true
                 when 'active' then p_entitlement->>'status' in (
                   'cancel_at_period_end', 'past_due', 'grace', 'locked'
                 )
                 when 'trialing' then p_entitlement->>'status' in (
                   'past_due', 'grace', 'locked'
                 )
                 when 'cancel_at_period_end' then p_entitlement->>'status' in (
                   'past_due', 'grace', 'locked'
                 )
                 when 'past_due' then p_entitlement->>'status' in ('grace', 'locked')
                 when 'grace' then p_entitlement->>'status' = 'locked'
                 else p_entitlement->>'status' = 'locked'
               end
           and case p_entitlement->>'provider_status'
                 when 'active' then 5 when 'trialing' then 4
                 when 'past_due' then 2 when 'paused' then 2
                 when 'incomplete' then 1 else 0
               end
               <= case provider_status
                    when 'active' then 5 when 'trialing' then 4
                    when 'past_due' then 2 when 'paused' then 2
                    when 'incomplete' then 1 else 0
                  end
           and not (
             cancel_at_period_end
             and not (p_entitlement->>'cancel_at_period_end')::boolean
           )
           and not (
             coalesce(last_payment_status = 'failed', false)
             and p_entitlement->>'last_payment_status' = 'succeeded'
           )
           and (
             current_period_end is null
             or (
               p_entitlement->>'current_period_end' is not null
               and (p_entitlement->>'current_period_end')::timestamptz
                     <= current_period_end
             )
           )
           and (
             trial_ends_at is null
             or (
               p_entitlement->>'trial_ends_at' is not null
               and (p_entitlement->>'trial_ends_at')::timestamptz <= trial_ends_at
             )
           )
           and (
             grace_ends_at is null
             or (
               p_entitlement->>'grace_ends_at' is not null
               and (p_entitlement->>'grace_ends_at')::timestamptz <= grace_ends_at
             )
           )
           and (
             access_ended_at is null
             or (
               p_entitlement->>'access_ended_at' is not null
               and (p_entitlement->>'access_ended_at')::timestamptz <= access_ended_at
             )
           )
           and (
             locked_at is null
             or (
               p_entitlement->>'locked_at' is not null
               and (p_entitlement->>'locked_at')::timestamptz <= locked_at
             )
           )
         )
       );
    get diagnostics v_rows = row_count;
  end if;
  if v_rows <> 1 then
    return 'conflict';
  end if;

  for v_event in select value from jsonb_array_elements(p_events)
  loop
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
      v_event->>'event_type',
      v_event->>'provider_event_id',
      v_event->>'stripe_subscription_id',
      v_event->>'status',
      v_event->>'reason',
      (v_event->>'occurred_at')::timestamptz
    );
  end loop;

  update public.subscription_events
     set processed = true
   where event_id = p_event_id
     and not processed;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'app_access_completion_conflict';
  end if;

  return 'applied';
end;
$$;

comment on function public.app_access_reconcile_event(
  text, uuid, bigint, timestamptz, jsonb, jsonb
) is
  'Atomically applies one verified Stripe app-access entitlement transition, its bounded audit events, and durable event completion.';

revoke all on function public.app_access_reconcile_event(
  text, uuid, bigint, timestamptz, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.app_access_reconcile_event(
  text, uuid, bigint, timestamptz, jsonb, jsonb
) to service_role;

-- DATA-PRESERVING OPERATIONAL ROLLBACK: disable the app-access launch gate and
-- redeploy the last approved compatible webhook before changing this RPC.
-- Retain entitlement and audit rows; remove this function only after export and
-- retention review approves a separate reverse-order schema rollback.
