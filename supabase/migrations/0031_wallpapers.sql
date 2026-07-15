-- =============================================================================
-- 0031_wallpapers: premium downloadable Workbench wallpapers (Orbit/Nova)
-- =============================================================================
-- Plan mapping (existing billing truth):
--   starter = Orbit ($10)  → max 2 permanent wallpaper slots
--   pro     = Nova ($50)   → full catalog while active
--   ultra/apex             → full catalog while active
-- Admin (app_admins)       → full catalog; does not consume Orbit slots
--
-- Client cannot write slots/entitlements; service_role + SECURITY DEFINER RPCs only.
-- =============================================================================

create extension if not exists pgcrypto;

-- ─── Catalog ────────────────────────────────────────────────────────────────

create table if not exists public.wallpapers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  category text not null default 'abstract',
  tags text[] not null default '{}',
  version text not null default '1.0.0',
  author text not null default 'VibeSpace',
  storage_path text not null,
  thumbnail_path text not null,
  preview_path text,
  fallback_path text not null,
  size_bytes bigint not null default 0,
  width integer not null default 1920,
  height integer not null default 1080,
  format text not null default 'mp4',
  engine_type text not null default 'video',
  sha256 text not null default '',
  minimum_app_version text not null default '0.1.48',
  performance_tier text not null default 'balanced'
    check (performance_tier in ('low', 'balanced', 'high')),
  featured boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wallpapers_active_sort_idx
  on public.wallpapers (active, sort_order, name);

-- ─── Orbit slots (hard max 2) ───────────────────────────────────────────────

create table if not exists public.orbit_wallpaper_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slot_number smallint not null check (slot_number in (1, 2)),
  wallpaper_id uuid not null references public.wallpapers(id) on delete restrict,
  subscription_id uuid,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slot_number),
  unique (user_id, wallpaper_id)
);

create index if not exists orbit_wallpaper_slots_user_idx
  on public.orbit_wallpaper_slots (user_id);

-- ─── Download events (analytics / security) ─────────────────────────────────

create table if not exists public.wallpaper_download_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wallpaper_id uuid not null references public.wallpapers(id) on delete cascade,
  entitlement_source text not null default 'unknown',
  app_version text,
  device_identifier_hash text,
  download_started_at timestamptz not null default now(),
  download_completed_at timestamptz,
  bytes_downloaded bigint,
  status text not null default 'started',
  error_code text,
  created_at timestamptz not null default now()
);

create index if not exists wallpaper_download_events_user_idx
  on public.wallpaper_download_events (user_id, created_at desc);

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.wallpapers enable row level security;
alter table public.orbit_wallpaper_slots enable row level security;
alter table public.wallpaper_download_events enable row level security;

drop policy if exists wallpapers_read_active on public.wallpapers;
create policy wallpapers_read_active on public.wallpapers
  for select to authenticated
  using (active = true);

drop policy if exists orbit_slots_read_own on public.orbit_wallpaper_slots;
create policy orbit_slots_read_own on public.orbit_wallpaper_slots
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists wallpaper_dl_events_read_own on public.wallpaper_download_events;
create policy wallpaper_dl_events_read_own on public.wallpaper_download_events
  for select to authenticated
  using (user_id = auth.uid());

-- No insert/update/delete policies for clients on slots/events/catalog writes.
revoke insert, update, delete on public.wallpapers from authenticated, anon;
revoke insert, update, delete on public.orbit_wallpaper_slots from authenticated, anon;
revoke insert, update, delete on public.wallpaper_download_events from authenticated, anon;
grant select on public.wallpapers to authenticated;
grant select on public.orbit_wallpaper_slots to authenticated;
grant select on public.wallpaper_download_events to authenticated;

-- ─── Helpers ────────────────────────────────────────────────────────────────

create or replace function public.wallpaper_plan_access_mode(p_plan text, p_is_admin boolean)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_is_admin then 'full_catalog'
    when lower(coalesce(p_plan, 'free')) in ('starter', 'orbit') then 'orbit_slots'
    when lower(coalesce(p_plan, 'free')) in ('pro', 'nova', 'ultra', 'apex', 'singularity', 'supernova')
      then 'full_catalog'
    else 'none'
  end;
$$;

create or replace function public.user_wallpaper_access(p_user_id uuid)
returns table (
  access_mode text,
  plan text,
  status text,
  period_end timestamptz,
  is_admin boolean,
  orbit_wallpaper_ids uuid[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text := 'free';
  v_status text := 'inactive';
  v_end timestamptz := null;
  v_admin boolean := false;
  v_mode text;
  v_grace interval := interval '72 hours';
begin
  v_admin := exists (select 1 from public.app_admins a where a.user_id = p_user_id);

  select s.plan, s.status, s.current_period_end
    into v_plan, v_status, v_end
  from public.subscriptions s
  where s.user_id = p_user_id
  order by
    case s.status when 'active' then 0 when 'trialing' then 1 else 2 end,
    s.current_period_end desc nulls last
  limit 1;

  if v_admin then
    v_mode := 'full_catalog';
  elsif lower(coalesce(v_status, '')) in ('active', 'trialing') then
    v_mode := public.wallpaper_plan_access_mode(v_plan, false);
  elsif v_end is not null and now() <= v_end + v_grace then
    v_mode := public.wallpaper_plan_access_mode(v_plan, false);
  else
    v_mode := 'none';
  end if;

  return query
  select
    v_mode,
    coalesce(v_plan, 'free'),
    coalesce(v_status, 'inactive'),
    v_end,
    v_admin,
    coalesce(
      (select array_agg(o.wallpaper_id order by o.slot_number)
       from public.orbit_wallpaper_slots o
       where o.user_id = p_user_id),
      '{}'::uuid[]
    );
end;
$$;

revoke all on function public.user_wallpaper_access(uuid) from public, anon, authenticated;
grant execute on function public.user_wallpaper_access(uuid) to service_role;

-- ─── Redeem Orbit slot (transactional, race-safe) ───────────────────────────

create or replace function public.redeem_orbit_wallpaper(
  p_user_id uuid,
  p_wallpaper_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_access record;
  v_count int;
  v_next smallint;
  v_active boolean;
  v_slug text;
begin
  if p_user_id is null or p_wallpaper_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_request');
  end if;

  select * into v_access from public.user_wallpaper_access(p_user_id);

  if v_access.is_admin or v_access.access_mode = 'full_catalog' then
    return jsonb_build_object('ok', false, 'reason', 'admin_uses_full_catalog', 'access_mode', v_access.access_mode);
  end if;

  if v_access.access_mode is distinct from 'orbit_slots' then
    return jsonb_build_object(
      'ok', false,
      'reason', case when v_access.access_mode = 'none' then 'inactive' else 'not_orbit' end,
      'access_mode', v_access.access_mode
    );
  end if;

  select w.active, w.slug into v_active, v_slug
  from public.wallpapers w
  where w.id = p_wallpaper_id
  for share;

  if not found or v_active is not true then
    return jsonb_build_object('ok', false, 'reason', 'invalid_wallpaper');
  end if;

  -- Lock existing slot rows for this user to serialize concurrent redeems.
  perform 1 from public.orbit_wallpaper_slots o
  where o.user_id = p_user_id
  for update;

  if exists (
    select 1 from public.orbit_wallpaper_slots o
    where o.user_id = p_user_id and o.wallpaper_id = p_wallpaper_id
  ) then
    return jsonb_build_object('ok', false, 'reason', 'duplicate');
  end if;

  select count(*)::int into v_count
  from public.orbit_wallpaper_slots o
  where o.user_id = p_user_id;

  if v_count >= 2 then
    return jsonb_build_object('ok', false, 'reason', 'slots_full');
  end if;

  v_next := (v_count + 1)::smallint;

  insert into public.orbit_wallpaper_slots (user_id, slot_number, wallpaper_id)
  values (p_user_id, v_next, p_wallpaper_id);

  return jsonb_build_object(
    'ok', true,
    'slot_number', v_next,
    'wallpaper_id', p_wallpaper_id,
    'slug', v_slug,
    'access_mode', 'orbit_slots'
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'race_or_duplicate');
end;
$$;

revoke all on function public.redeem_orbit_wallpaper(uuid, uuid) from public, anon, authenticated;
grant execute on function public.redeem_orbit_wallpaper(uuid, uuid) to service_role;

-- ─── Admin reset Orbit slots ────────────────────────────────────────────────

create or replace function public.admin_reset_orbit_wallpaper_slots(
  p_admin_id uuid,
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.app_admins a where a.user_id = p_admin_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  delete from public.orbit_wallpaper_slots where user_id = p_target_user_id;

  return jsonb_build_object('ok', true, 'target_user_id', p_target_user_id);
end;
$$;

revoke all on function public.admin_reset_orbit_wallpaper_slots(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_reset_orbit_wallpaper_slots(uuid, uuid) to service_role;

-- ─── Authorize download (returns ok + source; signed URL issued by edge) ────

create or replace function public.authorize_wallpaper_download(
  p_user_id uuid,
  p_wallpaper_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_access record;
  v_wp record;
  v_source text;
begin
  select * into v_access from public.user_wallpaper_access(p_user_id);

  select w.id, w.slug, w.active, w.storage_path, w.sha256, w.size_bytes
    into v_wp
  from public.wallpapers w
  where w.id = p_wallpaper_id;

  if not found or v_wp.active is not true then
    return jsonb_build_object('ok', false, 'reason', 'invalid_wallpaper');
  end if;

  if v_access.access_mode = 'full_catalog' then
    v_source := case when v_access.is_admin then 'admin' else 'nova_subscription' end;
  elsif v_access.access_mode = 'orbit_slots'
        and v_wp.id = any (v_access.orbit_wallpaper_ids) then
    v_source := 'orbit_slot';
  else
    return jsonb_build_object('ok', false, 'reason', 'not_entitled', 'access_mode', v_access.access_mode);
  end if;

  insert into public.wallpaper_download_events (user_id, wallpaper_id, entitlement_source, status)
  values (p_user_id, p_wallpaper_id, v_source, 'authorized');

  return jsonb_build_object(
    'ok', true,
    'wallpaper_id', v_wp.id,
    'slug', v_wp.slug,
    'storage_path', v_wp.storage_path,
    'sha256', v_wp.sha256,
    'size_bytes', v_wp.size_bytes,
    'entitlement_source', v_source,
    'expires_in_seconds', 120
  );
end;
$$;

revoke all on function public.authorize_wallpaper_download(uuid, uuid) from public, anon, authenticated;
grant execute on function public.authorize_wallpaper_download(uuid, uuid) to service_role;

comment on table public.wallpapers is 'Premium Workbench wallpaper catalog (metadata only; full files in storage).';
comment on table public.orbit_wallpaper_slots is 'Orbit (starter) permanent wallpaper slots; max 2 per user.';
comment on function public.redeem_orbit_wallpaper(uuid, uuid) is 'Race-safe Orbit wallpaper slot redeem; service_role only.';
