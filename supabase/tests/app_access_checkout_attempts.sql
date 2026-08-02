-- Durable VibeSpace Access checkout-attempt lifecycle verification (0035).
-- Run only against a disposable/local database after migrations. All fixtures
-- live inside this transaction and are rolled back.
begin;

do $$
declare
  v_table regclass := to_regclass('public.app_access_checkout_attempts');
  v_reserve regprocedure :=
    to_regprocedure('public.app_access_reserve_checkout_attempt(uuid)');
  v_complete regprocedure :=
    to_regprocedure('public.app_access_complete_checkout_attempt(uuid,uuid,text,text)');
  v_close regprocedure :=
    to_regprocedure('public.app_access_close_checkout_attempt(uuid,uuid,text)');
  v_oid regprocedure;
  v_config text[];
  v_security_definer boolean;
  v_definition text;
begin
  if v_table is null then
    raise exception 'missing app_access_checkout_attempts';
  end if;
  if not exists (
    select 1
      from pg_class c
     where c.oid = v_table
       and c.relrowsecurity
  ) then
    raise exception 'checkout attempts must have RLS enabled';
  end if;
  if exists (
    select 1
      from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
        as privileges(privilege)
     where has_table_privilege('anon', v_table, privilege)
        or has_table_privilege('authenticated', v_table, privilege)
  ) then
    raise exception 'clients must have no checkout-attempt table privileges';
  end if;
  if exists (
    select 1
      from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
        as privileges(privilege)
     where not has_table_privilege('service_role', v_table, privilege)
  ) then
    raise exception 'service role requires explicit checkout-attempt privileges';
  end if;
  if not exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'app_access_checkout_attempts'
       and policyname = 'app_access_checkout_attempts_service'
       and roles @> array['service_role']::name[]
       and cmd = 'ALL'
  ) or exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'app_access_checkout_attempts'
       and (
         roles @> array['anon']::name[]
         or roles @> array['authenticated']::name[]
         or roles @> array['public']::name[]
       )
  ) then
    raise exception 'checkout-attempt RLS must remain service-role only';
  end if;
  if not exists (
    select 1
      from pg_index i
      join pg_class c on c.oid = i.indexrelid
     where i.indrelid = v_table
       and i.indisunique
       and c.relname = 'app_access_checkout_attempts_open_user_uidx'
       and pg_get_expr(i.indpred, i.indrelid)
         ilike '%state%reserved%session_created%'
  ) then
    raise exception 'one-open-attempt-per-user unique index is missing';
  end if;

  select pg_get_functiondef(v_reserve) into v_definition;
  if v_definition not ilike '%pg_advisory_xact_lock%'
     or v_definition not ilike '%for update%' then
    raise exception 'reservation must serialize each account transactionally';
  end if;
  select pg_get_functiondef(v_complete) into v_definition;
  if v_definition not ilike '%for update%'
     or v_definition not ilike '%insert into public.app_access_events%' then
    raise exception 'completion must lock and atomically record its audit event';
  end if;

  foreach v_oid in array array[v_reserve, v_complete, v_close] loop
    if v_oid is null then
      raise exception 'missing checkout-attempt RPC';
    end if;
    select p.proconfig, p.prosecdef
      into v_config, v_security_definer
      from pg_proc p
     where p.oid = v_oid;
    if v_security_definer then
      raise exception 'checkout-attempt RPC must remain SECURITY INVOKER';
    end if;
    if not ('search_path=pg_catalog, public' = any(v_config)) then
      raise exception 'checkout-attempt RPC must pin search_path';
    end if;
    if has_function_privilege('anon', v_oid, 'EXECUTE')
       or has_function_privilege('authenticated', v_oid, 'EXECUTE')
       or exists (
         select 1
           from pg_proc p
           cross join lateral aclexplode(
             coalesce(p.proacl, acldefault('f', p.proowner))
           ) acl
          where p.oid = v_oid
            and acl.grantee = 0
            and acl.privilege_type = 'EXECUTE'
       ) then
      raise exception 'checkout-attempt RPC must be service-role only';
    end if;
    if not has_function_privilege('service_role', v_oid, 'EXECUTE') then
      raise exception 'service role must execute checkout-attempt RPC';
    end if;
  end loop;
end;
$$;

do $$
declare
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_first jsonb;
  v_retry jsonb;
  v_other jsonb;
  v_completed jsonb;
  v_attempt uuid;
  v_new_attempt uuid;
  v_after_expiry uuid;
  v_events integer;
  v_cross_account_rejected boolean := false;
begin
  insert into auth.users (id, email, email_confirmed_at)
  values
    (v_user_a, 'checkout-attempt-a@example.test', now()),
    (v_user_b, 'checkout-attempt-b@example.test', now());

  v_first := public.app_access_reserve_checkout_attempt(v_user_a);
  v_retry := public.app_access_reserve_checkout_attempt(v_user_a);
  v_other := public.app_access_reserve_checkout_attempt(v_user_b);
  if v_first->>'outcome' <> 'reserved'
     or v_first->>'attemptId' is null
     or v_first->>'createdAt' is null
     or v_first->>'idempotencyKey'
          <> 'access_checkout_attempt:' || (v_first->>'attemptId') then
    raise exception 'first reservation is malformed: %', v_first;
  end if;
  if v_retry->>'attemptId' <> v_first->>'attemptId' then
    raise exception 'one logical retry wave must reuse the durable attempt';
  end if;
  if v_other->>'attemptId' = v_first->>'attemptId' then
    raise exception 'accounts must receive isolated checkout attempts';
  end if;
  v_attempt := (v_first->>'attemptId')::uuid;

  begin
    perform public.app_access_complete_checkout_attempt(
      v_user_b,
      v_attempt,
      'cs_cross_account',
      'https://checkout.stripe.com/c/pay/cs_cross_account'
    );
  exception when others then
    v_cross_account_rejected := true;
  end;
  if not v_cross_account_rejected then
    raise exception 'cross-account attempt completion must be rejected';
  end if;

  v_completed := public.app_access_complete_checkout_attempt(
    v_user_a,
    v_attempt,
    'cs_attempt_1',
    'https://checkout.stripe.com/c/pay/cs_attempt_1'
  );
  if v_completed->>'outcome' <> 'session_created'
     or v_completed->>'url'
          <> 'https://checkout.stripe.com/c/pay/cs_attempt_1' then
    raise exception 'completion did not return the durable session: %', v_completed;
  end if;
  if public.app_access_complete_checkout_attempt(
       v_user_a,
       v_attempt,
       'cs_attempt_1',
       'https://checkout.stripe.com/c/pay/cs_attempt_1'
     ) <> v_completed then
    raise exception 'identical completion must be idempotent';
  end if;
  select count(*) into v_events
    from public.app_access_events
   where user_id = v_user_a
     and event_type = 'checkout_created'
     and provider_event_id =
       'access_checkout_attempt:' || v_attempt::text || ':cs_attempt_1';
  if v_events <> 1 then
    raise exception 'completion and audit must be exactly-once, got %', v_events;
  end if;
  if exists (
    select 1 from public.app_access_entitlements where user_id = v_user_a
  ) then
    raise exception 'checkout attempt must never grant or create entitlement state';
  end if;

  perform public.app_access_close_checkout_attempt(
    v_user_a, v_attempt, 'abandoned'
  );
  v_new_attempt :=
    (public.app_access_reserve_checkout_attempt(v_user_a)->>'attemptId')::uuid;
  if v_new_attempt = v_attempt then
    raise exception 'abandoned attempt must permit a new Stripe attempt';
  end if;
  perform public.app_access_complete_checkout_attempt(
    v_user_a,
    v_new_attempt,
    'cs_attempt_2',
    'https://checkout.stripe.com/c/pay/cs_attempt_2'
  );
  update public.app_access_checkout_attempts
     set created_at = now() - interval '2 hours',
         expires_at = now() - interval '1 second'
   where id = v_new_attempt;
  v_after_expiry :=
    (public.app_access_reserve_checkout_attempt(v_user_a)->>'attemptId')::uuid;
  if v_after_expiry = v_new_attempt then
    raise exception 'expired Session must permit a new Stripe attempt';
  end if;
  if not exists (
    select 1
      from public.app_access_checkout_attempts
     where id = v_new_attempt
       and state = 'expired'
  ) then
    raise exception 'expired Session must transition to terminal expired state';
  end if;
end;
$$;

do $$
declare
  v_user uuid := gen_random_uuid();
  v_attempt uuid;
  v_recovered uuid;
  v_rejected boolean := false;
begin
  insert into auth.users (id, email, email_confirmed_at)
  values (v_user, 'checkout-attempt-recovery@example.test', now());
  v_attempt :=
    (public.app_access_reserve_checkout_attempt(v_user)->>'attemptId')::uuid;

  begin
    perform public.app_access_complete_checkout_attempt(
      v_user, v_attempt, 'cs_bad', 'https://checkout.stripe.com.evil.test/cs_bad'
    );
  exception when others then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'unsafe Stripe URL must reject atomically';
  end if;
  if not exists (
    select 1
      from public.app_access_checkout_attempts
     where id = v_attempt
       and user_id = v_user
       and state = 'reserved'
       and stripe_session_id is null
       and stripe_session_url is null
  ) then
    raise exception 'failed completion must roll back to reusable reservation';
  end if;
  if exists (
    select 1
      from public.app_access_events
     where provider_event_id like
       'access_checkout_attempt:' || v_attempt::text || ':%'
  ) then
    raise exception 'failed completion must not leave an audit row';
  end if;

  update public.app_access_checkout_attempts
     set created_at = now() - interval '10 minutes',
         lease_expires_at = now() - interval '1 second'
   where id = v_attempt;
  v_recovered :=
    (public.app_access_reserve_checkout_attempt(v_user)->>'attemptId')::uuid;
  if v_recovered = v_attempt then
    raise exception 'expired reservation must not wedge the account';
  end if;
  if not exists (
    select 1
      from public.app_access_checkout_attempts
     where id = v_attempt
       and state = 'abandoned'
  ) then
    raise exception 'expired reservation must become abandoned';
  end if;
end;
$$;

do $$
declare
  v_user uuid := gen_random_uuid();
  v_attempt uuid;
  v_result jsonb;
  v_fresh uuid;
begin
  insert into auth.users (id, email, email_confirmed_at)
  values (v_user, 'checkout-attempt-completed@example.test', now());
  v_attempt :=
    (public.app_access_reserve_checkout_attempt(v_user)->>'attemptId')::uuid;
  perform public.app_access_complete_checkout_attempt(
    v_user,
    v_attempt,
    'cs_completed_pending',
    'https://checkout.stripe.com/c/pay/cs_completed_pending'
  );
  perform public.app_access_close_checkout_attempt(
    v_user, v_attempt, 'completed'
  );

  v_result := public.app_access_reserve_checkout_attempt(v_user);
  if v_result <> jsonb_build_object('outcome', 'checkout_pending') then
    raise exception 'completed Session without reconciliation must fail closed: %',
      v_result;
  end if;

  insert into public.app_access_entitlements (
    user_id,
    status,
    provider_status,
    provider_status_updated_at,
    stripe_subscription_id
  ) values (
    v_user,
    'locked',
    'canceled',
    now() + interval '1 second',
    'sub_checkout_attempt_terminal'
  );
  v_fresh :=
    (public.app_access_reserve_checkout_attempt(v_user)->>'attemptId')::uuid;
  if v_fresh = v_attempt then
    raise exception 'newer terminal provider state must permit a fresh attempt';
  end if;
end;
$$;

do $$
declare
  v_user uuid := gen_random_uuid();
  v_result jsonb;
begin
  insert into auth.users (id, email, email_confirmed_at)
  values (v_user, 'checkout-attempt-duplicate@example.test', now());
  insert into public.app_access_entitlements (
    user_id,
    status,
    provider_status,
    provider_status_updated_at,
    stripe_subscription_id
  ) values (
    v_user,
    'active',
    'active',
    now(),
    'sub_checkout_attempt_duplicate'
  );
  v_result := public.app_access_reserve_checkout_attempt(v_user);
  if v_result <> jsonb_build_object('outcome', 'duplicate_access') then
    raise exception 'active provider subscription must block checkout: %', v_result;
  end if;
  if exists (
    select 1 from public.app_access_checkout_attempts where user_id = v_user
  ) then
    raise exception 'duplicate subscription guard must not reserve an attempt';
  end if;
end;
$$;

rollback;
