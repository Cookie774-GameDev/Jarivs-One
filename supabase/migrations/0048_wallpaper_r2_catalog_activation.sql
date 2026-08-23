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

-- R2 master catalog activation: full-content hashes and private object keys.
insert into public.wallpapers (id, slug, name, description, category, tags, version, author, storage_path, thumbnail_path, preview_path, fallback_path, size_bytes, width, height, format, engine_type, sha256, performance_tier, featured, active, sort_order) values ('d2baebf7-25d9-4fe9-a482-65cfbf1decc2'::uuid, '1769778778', 'Misty Temple Peak', 'A glowing temple hidden in neon mountain mist.', 'fantasy', array['fantasy','animated','video'], '1.0.0', 'VibeSpace', 'wallpapers/1769778778/wallpaper.mp4', 'wallpapers/1769778778/thumbnail.webp', 'wallpapers/1769778778/preview.mp4', 'wallpapers/1769778778/fallback.webp', 72503245, 1920, 1080, 'mp4', 'video', '834496d2f1b0b0299e6305a6a5bcd224812ba5a8849b3b3f44144c27d3e8b149', 'high', true, true, 1) on conflict (slug) do update set name = excluded.name, description = excluded.description, category = excluded.category, tags = excluded.tags, storage_path = excluded.storage_path, thumbnail_path = excluded.thumbnail_path, preview_path = excluded.preview_path, fallback_path = excluded.fallback_path, size_bytes = excluded.size_bytes, sha256 = excluded.sha256, active = true, updated_at = now();
insert into public.wallpapers (id, slug, name, description, category, tags, version, author, storage_path, thumbnail_path, preview_path, fallback_path, size_bytes, width, height, format, engine_type, sha256, performance_tier, featured, active, sort_order) values ('e4dfbb21-4c22-481f-ab9f-67a9d104760b'::uuid, '1770124759', 'Ultra Instinct Clash', 'White-haired fighter mid-strike against a red banner.', 'anime', array['anime','animated','video'], '1.0.0', 'VibeSpace', 'wallpapers/1770124759/wallpaper.mp4', 'wallpapers/1770124759/thumbnail.webp', 'wallpapers/1770124759/preview.mp4', 'wallpapers/1770124759/fallback.webp', 38068715, 1920, 1080, 'mp4', 'video', '28aad6524249f481d2685f412131223137f2d7d33cfc70a5f6d4a804c6ea814e', 'balanced', true, true, 2) on conflict (slug) do update set name = excluded.name, description = excluded.description, category = excluded.category, tags = excluded.tags, storage_path = excluded.storage_path, thumbnail_path = excluded.thumbnail_path, preview_path = excluded.preview_path, fallback_path = excluded.fallback_path, size_bytes = excluded.size_bytes, sha256 = excluded.sha256, active = true, updated_at = now();
insert into public.wallpapers (id, slug, name, description, category, tags, version, author, storage_path, thumbnail_path, preview_path, fallback_path, size_bytes, width, height, format, engine_type, sha256, performance_tier, featured, active, sort_order) values ('3f2a5682-b99e-4468-af96-c27d4e24ed0b'::uuid, '1770809856', 'Golden Super Saiyan', 'Blazing golden aura portrait in full power form.', 'anime', array['anime','animated','video'], '1.0.0', 'VibeSpace', 'wallpapers/1770809856/wallpaper.mp4', 'wallpapers/1770809856/thumbnail.webp', 'wallpapers/1770809856/preview.mp4', 'wallpapers/1770809856/fallback.webp', 38063484, 1920, 1080, 'mp4', 'video', '8327d32adc3e4e99111980b7507b7f4a8db41a8b65e3bd9ef07a2249f19a4a8f', 'balanced', true, true, 3) on conflict (slug) do update set name = excluded.name, description = excluded.description, category = excluded.category, tags = excluded.tags, storage_path = excluded.storage_path, thumbnail_path = excluded.thumbnail_path, preview_path = excluded.preview_path, fallback_path = excluded.fallback_path, size_bytes = excluded.size_bytes, sha256 = excluded.sha256, active = true, updated_at = now();
insert into public.wallpapers (id, slug, name, description, category, tags, version, author, storage_path, thumbnail_path, preview_path, fallback_path, size_bytes, width, height, format, engine_type, sha256, performance_tier, featured, active, sort_order) values ('8d9aa651-7858-4174-ab44-dd6ad0ed5da5'::uuid, '1774885353', 'Neon Halo', 'Stylized figure with orange lenses and a golden ring.', 'minimal', array['minimal','animated','video'], '1.0.0', 'VibeSpace', 'wallpapers/1774885353/wallpaper.mp4', 'wallpapers/1774885353/thumbnail.webp', 'wallpapers/1774885353/preview.mp4', 'wallpapers/1774885353/fallback.webp', 18481199, 1920, 1080, 'mp4', 'video', '42efa90ea62e2a38116ca5e5b7803e14b877b09ea79d9bffbf8aa3c8688f1fbe', 'low', true, true, 4) on conflict (slug) do update set name = excluded.name, description = excluded.description, category = excluded.category, tags = excluded.tags, storage_path = excluded.storage_path, thumbnail_path = excluded.thumbnail_path, preview_path = excluded.preview_path, fallback_path = excluded.fallback_path, size_bytes = excluded.size_bytes, sha256 = excluded.sha256, active = true, updated_at = now();
insert into public.wallpapers (id, slug, name, description, category, tags, version, author, storage_path, thumbnail_path, preview_path, fallback_path, size_bytes, width, height, format, engine_type, sha256, performance_tier, featured, active, sort_order) values ('65922aa1-e7cc-49c1-a3ed-fb2e740c86ac'::uuid, '1776077648', 'Crimson Shadow Hands', 'Hooded figure with glowing red face and clawed hands.', 'dark', array['dark','animated','video'], '1.0.0', 'VibeSpace', 'wallpapers/1776077648/wallpaper.mp4', 'wallpapers/1776077648/thumbnail.webp', 'wallpapers/1776077648/preview.mp4', 'wallpapers/1776077648/fallback.webp', 47006868, 1920, 1080, 'mp4', 'video', '4f58647b3d6e1e8d3c8c12719db62b4ed9450acd449e0b266e43532a91b37339', 'balanced', true, true, 5) on conflict (slug) do update set name = excluded.name, description = excluded.description, category = excluded.category, tags = excluded.tags, storage_path = excluded.storage_path, thumbnail_path = excluded.thumbnail_path, preview_path = excluded.preview_path, fallback_path = excluded.fallback_path, size_bytes = excluded.size_bytes, sha256 = excluded.sha256, active = true, updated_at = now();
insert into public.wallpapers (id, slug, name, description, category, tags, version, author, storage_path, thumbnail_path, preview_path, fallback_path, size_bytes, width, height, format, engine_type, sha256, performance_tier, featured, active, sort_order) values ('dee2725f-8294-43bb-afe8-3543066e7dbe'::uuid, '2aafl1j2go0fx5f-kenshi-girl-5-212245', 'Cherry Blossom Blade', 'Samurai girl under lantern light with sakura petals.', 'anime', array['anime','animated','video'], '1.0.0', 'VibeSpace', 'wallpapers/2aafl1j2go0fx5f-kenshi-girl-5-212245/wallpaper.mp4', 'wallpapers/2aafl1j2go0fx5f-kenshi-girl-5-212245/thumbnail.webp', 'wallpapers/2aafl1j2go0fx5f-kenshi-girl-5-212245/preview.mp4', 'wallpapers/2aafl1j2go0fx5f-kenshi-girl-5-212245/fallback.webp', 39735688, 1920, 1080, 'mp4', 'video', '1a71a91aafe34890997fc07e72387bee1c8f1db3c932c347cc78e339823b04e0', 'balanced', true, true, 6) on conflict (slug) do update set name = excluded.name, description = excluded.description, category = excluded.category, tags = excluded.tags, storage_path = excluded.storage_path, thumbnail_path = excluded.thumbnail_path, preview_path = excluded.preview_path, fallback_path = excluded.fallback_path, size_bytes = excluded.size_bytes, sha256 = excluded.sha256, active = true, updated_at = now();
insert into public.wallpapers (id, slug, name, description, category, tags, version, author, storage_path, thumbnail_path, preview_path, fallback_path, size_bytes, width, height, format, engine_type, sha256, performance_tier, featured, active, sort_order) values ('9c923106-9a4a-4ab0-ac60-3e9c14d628b7'::uuid, '5ycneagzy0-sfgfg2prob4', 'World in Her Eye', 'Close-up eye reflecting a sunlit meadow world.', 'abstract', array['abstract','animated','video'], '1.0.0', 'VibeSpace', 'wallpapers/5ycneagzy0-sfgfg2prob4/wallpaper.mp4', 'wallpapers/5ycneagzy0-sfgfg2prob4/thumbnail.webp', 'wallpapers/5ycneagzy0-sfgfg2prob4/preview.mp4', 'wallpapers/5ycneagzy0-sfgfg2prob4/fallback.webp', 55639265, 1920, 1080, 'mp4', 'video', '3be444f4f263252611231f04b4df7698e616dd896e7cebd98f056ff737222b79', 'balanced', false, true, 7) on conflict (slug) do update set name = excluded.name, description = excluded.description, category = excluded.category, tags = excluded.tags, storage_path = excluded.storage_path, thumbnail_path = excluded.thumbnail_path, preview_path = excluded.preview_path, fallback_path = excluded.fallback_path, size_bytes = excluded.size_bytes, sha256 = excluded.sha256, active = true, updated_at = now();
insert into public.wallpapers (id, slug, name, description, category, tags, version, author, storage_path, thumbnail_path, preview_path, fallback_path, size_bytes, width, height, format, engine_type, sha256, performance_tier, featured, active, sort_order) values ('95d9f340-03ea-4d4c-acf1-6b47ffa2067f'::uuid, '768gsz1mab-sequence01ggg2prob4', 'Sunset Cruise', 'Boat cutting calm water under a fiery sunset sky.', 'landscape', array['landscape','animated','video'], '1.0.0', 'VibeSpace', 'wallpapers/768gsz1mab-sequence01ggg2prob4/wallpaper.mp4', 'wallpapers/768gsz1mab-sequence01ggg2prob4/thumbnail.webp', 'wallpapers/768gsz1mab-sequence01ggg2prob4/preview.mp4', 'wallpapers/768gsz1mab-sequence01ggg2prob4/fallback.webp', 74634741, 1920, 1080, 'mp4', 'video', '76fe6ef3b353c2b13de0a0bca25a824943fcdfbe00a0799ed815fc231d9a833a', 'high', false, true, 8) on conflict (slug) do update set name = excluded.name, description = excluded.description, category = excluded.category, tags = excluded.tags, storage_path = excluded.storage_path, thumbnail_path = excluded.thumbnail_path, preview_path = excluded.preview_path, fallback_path = excluded.fallback_path, size_bytes = excluded.size_bytes, sha256 = excluded.sha256, active = true, updated_at = now();
insert into public.wallpapers (id, slug, name, description, category, tags, version, author, storage_path, thumbnail_path, preview_path, fallback_path, size_bytes, width, height, format, engine_type, sha256, performance_tier, featured, active, sort_order) values ('2d550e1a-feb5-47cb-a6e6-e7202f8cbf5d'::uuid, '7xsetf8ltu-gffgfgg2prob4', 'Train Window Escape', 'Quiet passenger gazing out at a misty forest line.', 'moody', array['moody','animated','video'], '1.0.0', 'VibeSpace', 'wallpapers/7xsetf8ltu-gffgfgg2prob4/wallpaper.mp4', 'wallpapers/7xsetf8ltu-gffgfgg2prob4/thumbnail.webp', 'wallpapers/7xsetf8ltu-gffgfgg2prob4/preview.mp4', 'wallpapers/7xsetf8ltu-gffgfgg2prob4/fallback.webp', 7283268, 1920, 1080, 'mp4', 'video', '04de0fbf9fd906d890be61b0ee6281a54123854d431ec6eee1f1ee6eef3f0504', 'low', false, true, 9) on conflict (slug) do update set name = excluded.name, description = excluded.description, category = excluded.category, tags = excluded.tags, storage_path = excluded.storage_path, thumbnail_path = excluded.thumbnail_path, preview_path = excluded.preview_path, fallback_path = excluded.fallback_path, size_bytes = excluded.size_bytes, sha256 = excluded.sha256, active = true, updated_at = now();
insert into public.wallpapers (id, slug, name, description, category, tags, version, author, storage_path, thumbnail_path, preview_path, fallback_path, size_bytes, width, height, format, engine_type, sha256, performance_tier, featured, active, sort_order) values ('c6ecca80-abaf-431f-a776-83d1c51283be'::uuid, '81gjhpepqs-sequence02tgtg2prob4', 'Cosmic Alpine Lake', 'Snow peaks mirrored in a lake under a massive moon.', 'fantasy', array['fantasy','animated','video'], '1.0.0', 'VibeSpace', 'wallpapers/81gjhpepqs-sequence02tgtg2prob4/wallpaper.mp4', 'wallpapers/81gjhpepqs-sequence02tgtg2prob4/thumbnail.webp', 'wallpapers/81gjhpepqs-sequence02tgtg2prob4/preview.mp4', 'wallpapers/81gjhpepqs-sequence02tgtg2prob4/fallback.webp', 29852658, 1920, 1080, 'mp4', 'video', '9aeb1729b75c1e34ec2862c7680a35f7e9b64fc21c38ef2fd1792dc53e38b16d', 'balanced', false, true, 10) on conflict (slug) do update set name = excluded.name, description = excluded.description, category = excluded.category, tags = excluded.tags, storage_path = excluded.storage_path, thumbnail_path = excluded.thumbnail_path, preview_path = excluded.preview_path, fallback_path = excluded.fallback_path, size_bytes = excluded.size_bytes, sha256 = excluded.sha256, active = true, updated_at = now();
insert into public.wallpapers (id, slug, name, description, category, tags, version, author, storage_path, thumbnail_path, preview_path, fallback_path, size_bytes, width, height, format, engine_type, sha256, performance_tier, featured, active, sort_order) values ('d016e272-b780-4e97-a142-f1a32a3f0ed3'::uuid, '84niutqdge-sequence03rtgrt2prob4', 'Sleeping Forest Spirit', 'A soft forest creature napping under autumn light.', 'cozy', array['cozy','animated','video'], '1.0.0', 'VibeSpace', 'wallpapers/84niutqdge-sequence03rtgrt2prob4/wallpaper.mp4', 'wallpapers/84niutqdge-sequence03rtgrt2prob4/thumbnail.webp', 'wallpapers/84niutqdge-sequence03rtgrt2prob4/preview.mp4', 'wallpapers/84niutqdge-sequence03rtgrt2prob4/fallback.webp', 20758538, 1920, 1080, 'mp4', 'video', 'bc726b93bb0cf67635ce670d98dc45eea922556106733b3657a407dbf739265e', 'low', false, true, 11) on conflict (slug) do update set name = excluded.name, description = excluded.description, category = excluded.category, tags = excluded.tags, storage_path = excluded.storage_path, thumbnail_path = excluded.thumbnail_path, preview_path = excluded.preview_path, fallback_path = excluded.fallback_path, size_bytes = excluded.size_bytes, sha256 = excluded.sha256, active = true, updated_at = now();
insert into public.wallpapers (id, slug, name, description, category, tags, version, author, storage_path, thumbnail_path, preview_path, fallback_path, size_bytes, width, height, format, engine_type, sha256, performance_tier, featured, active, sort_order) values ('975dbade-b539-4f45-a172-4c4497674b8b'::uuid, 'a7aokg6ghpjvicp-river-sasuke', 'River Contemplation', 'Lone shinobi kneeling in a sunlit forest river.', 'anime', array['anime','animated','video'], '1.0.0', 'VibeSpace', 'wallpapers/a7aokg6ghpjvicp-river-sasuke/wallpaper.mp4', 'wallpapers/a7aokg6ghpjvicp-river-sasuke/thumbnail.webp', 'wallpapers/a7aokg6ghpjvicp-river-sasuke/preview.mp4', 'wallpapers/a7aokg6ghpjvicp-river-sasuke/fallback.webp', 127204596, 1920, 1080, 'mp4', 'video', '868c988cd3b681f3b7a3bd77e87e32e5f5ebb1b894ad07e6ee3106707a99f4c5', 'high', false, true, 12) on conflict (slug) do update set name = excluded.name, description = excluded.description, category = excluded.category, tags = excluded.tags, storage_path = excluded.storage_path, thumbnail_path = excluded.thumbnail_path, preview_path = excluded.preview_path, fallback_path = excluded.fallback_path, size_bytes = excluded.size_bytes, sha256 = excluded.sha256, active = true, updated_at = now();
insert into public.wallpapers (id, slug, name, description, category, tags, version, author, storage_path, thumbnail_path, preview_path, fallback_path, size_bytes, width, height, format, engine_type, sha256, performance_tier, featured, active, sort_order) values ('9ed16747-1522-497a-ac13-633443a2215b'::uuid, 'aalzvydy2yutgxo-canyon-land-live-wallpaper-2-prob4', 'Floating Canyon Bridges', 'Crimson cliffs, bridges, and waterfalls at dusk.', 'fantasy', array['fantasy','animated','video'], '1.0.0', 'VibeSpace', 'wallpapers/aalzvydy2yutgxo-canyon-land-live-wallpaper-2-prob4/wallpaper.mp4', 'wallpapers/aalzvydy2yutgxo-canyon-land-live-wallpaper-2-prob4/thumbnail.webp', 'wallpapers/aalzvydy2yutgxo-canyon-land-live-wallpaper-2-prob4/preview.mp4', 'wallpapers/aalzvydy2yutgxo-canyon-land-live-wallpaper-2-prob4/fallback.webp', 15354087, 1920, 1080, 'mp4', 'video', 'c0e167909914d8fa5e186aaaf6a291e51c4df87865bc46df0feb16d682a7c101', 'low', false, true, 13) on conflict (slug) do update set name = excluded.name, description = excluded.description, category = excluded.category, tags = excluded.tags, storage_path = excluded.storage_path, thumbnail_path = excluded.thumbnail_path, preview_path = excluded.preview_path, fallback_path = excluded.fallback_path, size_bytes = excluded.size_bytes, sha256 = excluded.sha256, active = true, updated_at = now();
insert into public.wallpapers (id, slug, name, description, category, tags, version, author, storage_path, thumbnail_path, preview_path, fallback_path, size_bytes, width, height, format, engine_type, sha256, performance_tier, featured, active, sort_order) values ('d3fe0ee2-749d-4018-a915-5f2128b18af9'::uuid, 'aqdyddwmzavupsh-autumn-is-here-4-111328', 'Autumn Bookshop Lane', 'Warm riverside bookshop glowing under maple leaves.', 'cozy', array['cozy','animated','video'], '1.0.0', 'VibeSpace', 'wallpapers/aqdyddwmzavupsh-autumn-is-here-4-111328/wallpaper.mp4', 'wallpapers/aqdyddwmzavupsh-autumn-is-here-4-111328/thumbnail.webp', 'wallpapers/aqdyddwmzavupsh-autumn-is-here-4-111328/preview.mp4', 'wallpapers/aqdyddwmzavupsh-autumn-is-here-4-111328/fallback.webp', 11360224, 1920, 1080, 'mp4', 'video', '2d55601a3e78592e6dce496201d09b645ac3ad8629a8820dfa7f444363286ae9', 'low', false, true, 14) on conflict (slug) do update set name = excluded.name, description = excluded.description, category = excluded.category, tags = excluded.tags, storage_path = excluded.storage_path, thumbnail_path = excluded.thumbnail_path, preview_path = excluded.preview_path, fallback_path = excluded.fallback_path, size_bytes = excluded.size_bytes, sha256 = excluded.sha256, active = true, updated_at = now();
insert into public.wallpapers (id, slug, name, description, category, tags, version, author, storage_path, thumbnail_path, preview_path, fallback_path, size_bytes, width, height, format, engine_type, sha256, performance_tier, featured, active, sort_order) values ('878ac205-f3cf-4e64-ab09-da1e83de41e2'::uuid, 'f8ajiqasfw-wallpaper', 'Sakura Street Supercar', 'Pink sports car on a wet street under cherry blossoms.', 'urban', array['urban','animated','video'], '1.0.0', 'VibeSpace', 'wallpapers/f8ajiqasfw-wallpaper/wallpaper.mp4', 'wallpapers/f8ajiqasfw-wallpaper/thumbnail.webp', 'wallpapers/f8ajiqasfw-wallpaper/preview.mp4', 'wallpapers/f8ajiqasfw-wallpaper/fallback.webp', 61401673, 1920, 1080, 'mp4', 'video', '0ac9f879e7b85bf177487d93474ef391ac1a966667795825827b3528c16a53ce', 'high', false, true, 15) on conflict (slug) do update set name = excluded.name, description = excluded.description, category = excluded.category, tags = excluded.tags, storage_path = excluded.storage_path, thumbnail_path = excluded.thumbnail_path, preview_path = excluded.preview_path, fallback_path = excluded.fallback_path, size_bytes = excluded.size_bytes, sha256 = excluded.sha256, active = true, updated_at = now();
insert into public.wallpapers (id, slug, name, description, category, tags, version, author, storage_path, thumbnail_path, preview_path, fallback_path, size_bytes, width, height, format, engine_type, sha256, performance_tier, featured, active, sort_order) values ('396b2b96-93b9-4626-ac50-c6bf01e4f3ca'::uuid, 'gqtwi87vrf-wallpaper2prob4', 'Autumn Path Wanderer', 'Silhouette walking a trail through scarlet woods.', 'nature', array['nature','animated','video'], '1.0.0', 'VibeSpace', 'wallpapers/gqtwi87vrf-wallpaper2prob4/wallpaper.mp4', 'wallpapers/gqtwi87vrf-wallpaper2prob4/thumbnail.webp', 'wallpapers/gqtwi87vrf-wallpaper2prob4/preview.mp4', 'wallpapers/gqtwi87vrf-wallpaper2prob4/fallback.webp', 24750366, 1920, 1080, 'mp4', 'video', '0973954569756c19145a0727f361da42a71d1c9ba389242cad317596fa311daf', 'low', false, true, 16) on conflict (slug) do update set name = excluded.name, description = excluded.description, category = excluded.category, tags = excluded.tags, storage_path = excluded.storage_path, thumbnail_path = excluded.thumbnail_path, preview_path = excluded.preview_path, fallback_path = excluded.fallback_path, size_bytes = excluded.size_bytes, sha256 = excluded.sha256, active = true, updated_at = now();
insert into public.wallpapers (id, slug, name, description, category, tags, version, author, storage_path, thumbnail_path, preview_path, fallback_path, size_bytes, width, height, format, engine_type, sha256, performance_tier, featured, active, sort_order) values ('99db32ad-a19f-40f9-a08e-555411475ee9'::uuid, 'jlmvk3meco-wallpaper', 'Castle Valley Dawn', 'Castle by a mountain lake under stormy sunrise light.', 'landscape', array['landscape','animated','video'], '1.0.0', 'VibeSpace', 'wallpapers/jlmvk3meco-wallpaper/wallpaper.mp4', 'wallpapers/jlmvk3meco-wallpaper/thumbnail.webp', 'wallpapers/jlmvk3meco-wallpaper/preview.mp4', 'wallpapers/jlmvk3meco-wallpaper/fallback.webp', 51438142, 1920, 1080, 'mp4', 'video', '0c9bf98a0476aa31c9525410903a991fe1b3a3517f323c6f327b4e91c479f72d', 'balanced', false, true, 17) on conflict (slug) do update set name = excluded.name, description = excluded.description, category = excluded.category, tags = excluded.tags, storage_path = excluded.storage_path, thumbnail_path = excluded.thumbnail_path, preview_path = excluded.preview_path, fallback_path = excluded.fallback_path, size_bytes = excluded.size_bytes, sha256 = excluded.sha256, active = true, updated_at = now();
insert into public.wallpapers (id, slug, name, description, category, tags, version, author, storage_path, thumbnail_path, preview_path, fallback_path, size_bytes, width, height, format, engine_type, sha256, performance_tier, featured, active, sort_order) values ('b07b3d1e-2f42-45ab-a4ed-2bd5b56963ec'::uuid, 'l43aclpfne-tyty2prob4', 'Rest Among Wildflowers', 'Armored warrior resting in a field of colorful blooms.', 'moody', array['moody','animated','video'], '1.0.0', 'VibeSpace', 'wallpapers/l43aclpfne-tyty2prob4/wallpaper.mp4', 'wallpapers/l43aclpfne-tyty2prob4/thumbnail.webp', 'wallpapers/l43aclpfne-tyty2prob4/preview.mp4', 'wallpapers/l43aclpfne-tyty2prob4/fallback.webp', 22892162, 1920, 1080, 'mp4', 'video', '26d67cd014608196b9880562db016e3d2af82c418ab002c6a5bc3dc71318c6e8', 'low', false, true, 18) on conflict (slug) do update set name = excluded.name, description = excluded.description, category = excluded.category, tags = excluded.tags, storage_path = excluded.storage_path, thumbnail_path = excluded.thumbnail_path, preview_path = excluded.preview_path, fallback_path = excluded.fallback_path, size_bytes = excluded.size_bytes, sha256 = excluded.sha256, active = true, updated_at = now();
insert into public.wallpapers (id, slug, name, description, category, tags, version, author, storage_path, thumbnail_path, preview_path, fallback_path, size_bytes, width, height, format, engine_type, sha256, performance_tier, featured, active, sort_order) values ('350c18ff-ebce-4e49-a122-115bdfa95602'::uuid, 'up3d2fxy9a-wallpaper62prob4', 'Blood Moon Waterfall', 'Lone white tree and waterfall under a huge orange moon.', 'landscape', array['landscape','animated','video'], '1.0.0', 'VibeSpace', 'wallpapers/up3d2fxy9a-wallpaper62prob4/wallpaper.mp4', 'wallpapers/up3d2fxy9a-wallpaper62prob4/thumbnail.webp', 'wallpapers/up3d2fxy9a-wallpaper62prob4/preview.mp4', 'wallpapers/up3d2fxy9a-wallpaper62prob4/fallback.webp', 11362919, 1920, 1080, 'mp4', 'video', '9aa450d335cfd3fb22e18bc48a459c3be573d42d44a9c48aede50afd4e87e120', 'low', false, true, 19) on conflict (slug) do update set name = excluded.name, description = excluded.description, category = excluded.category, tags = excluded.tags, storage_path = excluded.storage_path, thumbnail_path = excluded.thumbnail_path, preview_path = excluded.preview_path, fallback_path = excluded.fallback_path, size_bytes = excluded.size_bytes, sha256 = excluded.sha256, active = true, updated_at = now();
insert into public.wallpapers (id, slug, name, description, category, tags, version, author, storage_path, thumbnail_path, preview_path, fallback_path, size_bytes, width, height, format, engine_type, sha256, performance_tier, featured, active, sort_order) values ('ba2783f5-252d-4255-abd7-69e20f0983eb'::uuid, 'uxnjfmgfrg80h6u-samurai-ocean-waves-4k-2-124659', 'Samurai Ocean Waves', 'Swordsman standing in a surge of crashing blue waves.', 'anime', array['anime','animated','video'], '1.0.0', 'VibeSpace', 'wallpapers/uxnjfmgfrg80h6u-samurai-ocean-waves-4k-2-124659/wallpaper.mp4', 'wallpapers/uxnjfmgfrg80h6u-samurai-ocean-waves-4k-2-124659/thumbnail.webp', 'wallpapers/uxnjfmgfrg80h6u-samurai-ocean-waves-4k-2-124659/preview.mp4', 'wallpapers/uxnjfmgfrg80h6u-samurai-ocean-waves-4k-2-124659/fallback.webp', 27889663, 1920, 1080, 'mp4', 'video', 'c8858fcd259d126bd63de1400da993b78e299d859caa4260dcc89501407438e1', 'balanced', false, true, 20) on conflict (slug) do update set name = excluded.name, description = excluded.description, category = excluded.category, tags = excluded.tags, storage_path = excluded.storage_path, thumbnail_path = excluded.thumbnail_path, preview_path = excluded.preview_path, fallback_path = excluded.fallback_path, size_bytes = excluded.size_bytes, sha256 = excluded.sha256, active = true, updated_at = now();
insert into public.wallpapers (id, slug, name, description, category, tags, version, author, storage_path, thumbnail_path, preview_path, fallback_path, size_bytes, width, height, format, engine_type, sha256, performance_tier, featured, active, sort_order) values ('1344d4e2-13ee-4b61-aa35-d07fcdd1c88d'::uuid, 'wl8ad35rye-wallpaper', 'Hillside Campfire', 'Campfire on a grassy hill under a bright blue sky.', 'cozy', array['cozy','animated','video'], '1.0.0', 'VibeSpace', 'wallpapers/wl8ad35rye-wallpaper/wallpaper.mp4', 'wallpapers/wl8ad35rye-wallpaper/thumbnail.webp', 'wallpapers/wl8ad35rye-wallpaper/preview.mp4', 'wallpapers/wl8ad35rye-wallpaper/fallback.webp', 59511058, 1920, 1080, 'mp4', 'video', '5c26cdff6a155c84310831301b6e4a9230898a7559cbc374485c6d2ea6457b29', 'balanced', false, true, 21) on conflict (slug) do update set name = excluded.name, description = excluded.description, category = excluded.category, tags = excluded.tags, storage_path = excluded.storage_path, thumbnail_path = excluded.thumbnail_path, preview_path = excluded.preview_path, fallback_path = excluded.fallback_path, size_bytes = excluded.size_bytes, sha256 = excluded.sha256, active = true, updated_at = now();
insert into public.wallpapers (id, slug, name, description, category, tags, version, author, storage_path, thumbnail_path, preview_path, fallback_path, size_bytes, width, height, format, engine_type, sha256, performance_tier, featured, active, sort_order) values ('1504307e-759f-4320-a6ab-a930c15352f3'::uuid, 'xwy9fwpugoafcwo-aesthetic-orange-autumn-forest-1-135248', 'Golden Autumn Lake', 'Orange forest reflecting on still water at golden hour.', 'nature', array['nature','animated','video'], '1.0.0', 'VibeSpace', 'wallpapers/xwy9fwpugoafcwo-aesthetic-orange-autumn-forest-1-135248/wallpaper.mp4', 'wallpapers/xwy9fwpugoafcwo-aesthetic-orange-autumn-forest-1-135248/thumbnail.webp', 'wallpapers/xwy9fwpugoafcwo-aesthetic-orange-autumn-forest-1-135248/preview.mp4', 'wallpapers/xwy9fwpugoafcwo-aesthetic-orange-autumn-forest-1-135248/fallback.webp', 41051363, 1920, 1080, 'mp4', 'video', 'dcc6d0b3aa9437244e0b8cd24ef0974a26692f4accd388a00f7d1a56f500d975', 'balanced', false, true, 22) on conflict (slug) do update set name = excluded.name, description = excluded.description, category = excluded.category, tags = excluded.tags, storage_path = excluded.storage_path, thumbnail_path = excluded.thumbnail_path, preview_path = excluded.preview_path, fallback_path = excluded.fallback_path, size_bytes = excluded.size_bytes, sha256 = excluded.sha256, active = true, updated_at = now();
insert into public.wallpapers (id, slug, name, description, category, tags, version, author, storage_path, thumbnail_path, preview_path, fallback_path, size_bytes, width, height, format, engine_type, sha256, performance_tier, featured, active, sort_order) values ('11cdbd3b-ab4f-46af-a49c-1d523e757aad'::uuid, 'ylg37oxahn-magicalnightshorelivewallpaper', 'Magical Night Shore', 'Palm beach under a swirling blue night sky.', 'space', array['space','animated','video'], '1.0.0', 'VibeSpace', 'wallpapers/ylg37oxahn-magicalnightshorelivewallpaper/wallpaper.mp4', 'wallpapers/ylg37oxahn-magicalnightshorelivewallpaper/thumbnail.webp', 'wallpapers/ylg37oxahn-magicalnightshorelivewallpaper/preview.mp4', 'wallpapers/ylg37oxahn-magicalnightshorelivewallpaper/fallback.webp', 52812234, 1920, 1080, 'mp4', 'video', '8fa095d472b3263ef5d234c679a2d5e5f7aa3b35b10a18ecbfabf3a17e973388', 'balanced', false, true, 23) on conflict (slug) do update set name = excluded.name, description = excluded.description, category = excluded.category, tags = excluded.tags, storage_path = excluded.storage_path, thumbnail_path = excluded.thumbnail_path, preview_path = excluded.preview_path, fallback_path = excluded.fallback_path, size_bytes = excluded.size_bytes, sha256 = excluded.sha256, active = true, updated_at = now();
