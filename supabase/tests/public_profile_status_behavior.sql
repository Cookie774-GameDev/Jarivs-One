-- Run against a disposable/local database after migrations.
begin;

do $$
declare
  uid_a uuid := gen_random_uuid();
  uid_b uuid := gen_random_uuid();
  seen integer;
  leaked_user_id boolean;
begin
  insert into auth.users (id, email) values
    (uid_a, 'status-a-' || uid_a || '@test.local'),
    (uid_b, 'status-b-' || uid_b || '@test.local');

  perform set_config('request.jwt.claim.sub', uid_a::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid_a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  insert into public.public_profile_status
    (user_id, slug, visible, display_name, selected_metrics)
  values
    (uid_a, 'status-user-a', true, 'Status A', '{"totalTokens":123}'::jsonb);

  begin
    insert into public.public_profile_status
      (user_id, slug, visible, display_name, selected_metrics)
    values
      (uid_b, 'cross-account', true, 'Cross account', '{}'::jsonb);
    raise exception 'cross-account insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.public_profile_status
      set selected_metrics = '{"rawPrompt":"secret"}'::jsonb
      where user_id = uid_a;
    raise exception 'unapproved metric unexpectedly succeeded';
  exception when check_violation then null;
  end;

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);

  select count(*) into seen from public.public_profile_status_cards where slug = 'status-user-a';
  if seen <> 1 then raise exception 'visible card not readable anonymously'; end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'public_profile_status_cards' and column_name = 'user_id'
  ) into leaked_user_id;
  if leaked_user_id then raise exception 'public card view leaks user_id'; end if;

  begin
    update public.public_profile_status set display_name = 'Anonymous write' where user_id = uid_a;
    raise exception 'anonymous write unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
