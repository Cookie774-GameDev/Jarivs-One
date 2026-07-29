-- Catalog/contract checks for migration 0034. This test intentionally avoids
-- fixture auth users and verifies the production authorization boundary.
begin;

do $$
declare
  v_oid regprocedure := to_regprocedure('public.get_app_access_lease_snapshot(text)');
  v_definition text;
  v_security_definer boolean;
  v_config text[];
begin
  if v_oid is null then
    raise exception 'missing get_app_access_lease_snapshot(text)';
  end if;

  select p.prosecdef, p.proconfig, pg_get_functiondef(p.oid)
    into v_security_definer, v_config, v_definition
    from pg_proc p
   where p.oid = v_oid;

  if not v_security_definer then
    raise exception 'lease snapshot must be SECURITY DEFINER';
  end if;
  if not ('search_path=pg_catalog, public' = any(v_config)) then
    raise exception 'lease snapshot must pin search_path';
  end if;
  if v_definition not ilike '%auth.uid()%' then
    raise exception 'lease snapshot must bind identity to auth.uid()';
  end if;
  if v_definition not ilike '%for update%' then
    raise exception 'lease snapshot must lock the entitlement row';
  end if;
  if v_definition not ilike '%app_access_compute%' or
     v_definition not ilike '%jsonb_build_object(''revision''%' then
    raise exception 'lease snapshot must return computed access plus revision';
  end if;

  if has_function_privilege('anon', v_oid, 'EXECUTE') then
    raise exception 'anon must not execute lease snapshot';
  end if;
  if exists (
    select 1
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
     where p.oid = v_oid
       and acl.grantee = 0
       and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC must not execute lease snapshot';
  end if;
  if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'authenticated must execute lease snapshot';
  end if;

  if not exists (
    select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'app_access_entitlements'
       and c.relrowsecurity
  ) then
    raise exception 'app_access_entitlements RLS must remain enabled';
  end if;

  if not exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'app_access_entitlements'
       and policyname = 'app_access_entitlements_owner_select'
       and cmd = 'SELECT'
       and roles @> array['authenticated']::name[]
       and qual like '%auth.uid()%user_id%'
  ) then
    raise exception 'owner-only entitlement read policy is missing';
  end if;
end;
$$;

rollback;
