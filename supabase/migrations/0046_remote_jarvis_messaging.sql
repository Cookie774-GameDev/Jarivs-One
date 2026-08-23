-- Durable, owner-scoped foundation for remote Jarvis conversations.
-- Provider secrets and plaintext pairing codes are never stored here.

create extension if not exists pgcrypto;

create table if not exists public.remote_messaging_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('sms', 'whatsapp', 'telegram', 'discord')),
  workspace_id text not null check (char_length(workspace_id) between 1 and 256),
  platform_user_id text not null check (char_length(platform_user_id) between 1 and 256),
  reply_address text not null check (char_length(reply_address) between 1 and 512),
  scopes text[] not null default array['chat']::text[] check (scopes <@ array['chat']::text[]),
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, workspace_id, platform_user_id)
);

create index if not exists remote_messaging_identities_owner_idx
  on public.remote_messaging_identities (user_id, status, platform);

create table if not exists public.remote_messaging_pairings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('sms', 'whatsapp', 'telegram', 'discord')),
  code_digest bytea not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists remote_messaging_pairings_lookup_idx
  on public.remote_messaging_pairings (platform, expires_at)
  where consumed_at is null;

create table if not exists public.remote_messaging_pairing_attempts (
  platform text not null check (platform in ('sms', 'whatsapp', 'telegram', 'discord')),
  workspace_id text not null,
  platform_user_id text not null,
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 1 check (attempt_count between 1 and 1000),
  primary key (platform, workspace_id, platform_user_id)
);

create table if not exists public.remote_messaging_events (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references public.remote_messaging_identities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('sms', 'whatsapp', 'telegram', 'discord')),
  workspace_id text not null,
  provider_event_id text not null check (char_length(provider_event_id) between 1 and 512),
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed', 'forbidden')),
  request_text_hash text not null check (request_text_hash ~ '^[a-f0-9]{64}$'),
  response_text_hash text check (response_text_hash is null or response_text_hash ~ '^[a-f0-9]{64}$'),
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (platform, workspace_id, provider_event_id)
);

create index if not exists remote_messaging_events_owner_idx
  on public.remote_messaging_events (user_id, created_at desc);

create table if not exists public.remote_messaging_turns (
  id bigint generated always as identity primary key,
  identity_id uuid not null references public.remote_messaging_identities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists remote_messaging_turns_history_idx
  on public.remote_messaging_turns (identity_id, created_at desc, id desc);

alter table public.remote_messaging_identities enable row level security;
alter table public.remote_messaging_pairings enable row level security;
alter table public.remote_messaging_pairing_attempts enable row level security;
alter table public.remote_messaging_events enable row level security;
alter table public.remote_messaging_turns enable row level security;

revoke all on table public.remote_messaging_identities from anon;
revoke all on table public.remote_messaging_pairings from anon;
revoke all on table public.remote_messaging_pairing_attempts from anon;
revoke all on table public.remote_messaging_events from anon;
revoke all on table public.remote_messaging_turns from anon;
revoke all on table public.remote_messaging_identities from authenticated;
revoke all on table public.remote_messaging_pairings from authenticated;
revoke all on table public.remote_messaging_pairing_attempts from authenticated;
revoke all on table public.remote_messaging_events from authenticated;
revoke all on table public.remote_messaging_turns from authenticated;

grant select, delete on table public.remote_messaging_identities to authenticated;
grant select on table public.remote_messaging_events to authenticated;
grant select, delete on table public.remote_messaging_turns to authenticated;

drop policy if exists remote_messaging_identities_owner_select on public.remote_messaging_identities;
create policy remote_messaging_identities_owner_select
  on public.remote_messaging_identities for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists remote_messaging_identities_owner_delete on public.remote_messaging_identities;
create policy remote_messaging_identities_owner_delete
  on public.remote_messaging_identities for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists remote_messaging_events_owner_select on public.remote_messaging_events;
create policy remote_messaging_events_owner_select
  on public.remote_messaging_events for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists remote_messaging_turns_owner_select on public.remote_messaging_turns;
create policy remote_messaging_turns_owner_select
  on public.remote_messaging_turns for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists remote_messaging_turns_owner_delete on public.remote_messaging_turns;
create policy remote_messaging_turns_owner_delete
  on public.remote_messaging_turns for delete to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.create_remote_messaging_pairing(p_platform text)
returns table(pairing_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text;
  v_expires_at timestamptz := now() + interval '10 minutes';
begin
  if v_user_id is null or coalesce(auth.role(), '') <> 'authenticated' then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if p_platform not in ('sms', 'whatsapp', 'telegram', 'discord') then
    raise exception 'unsupported_platform' using errcode = '22023';
  end if;

  v_code := upper(encode(gen_random_bytes(8), 'hex'));
  update public.remote_messaging_pairings
     set consumed_at = now()
   where user_id = v_user_id and platform = p_platform and consumed_at is null;
  insert into public.remote_messaging_pairings (user_id, platform, code_digest, expires_at)
  values (v_user_id, p_platform, digest(convert_to(v_code, 'UTF8'), 'sha256'), v_expires_at);
  return query select v_code, v_expires_at;
end;
$$;

revoke all on function public.create_remote_messaging_pairing(text) from public, anon;
grant execute on function public.create_remote_messaging_pairing(text) to authenticated;

create or replace function public.redeem_remote_messaging_pairing(
  p_platform text,
  p_workspace_id text,
  p_platform_user_id text,
  p_reply_address text,
  p_pairing_code text
)
returns table(identity_id uuid, user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pairing public.remote_messaging_pairings%rowtype;
  v_attempts integer;
  v_identity_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if p_platform not in ('sms', 'whatsapp', 'telegram', 'discord')
     or char_length(p_workspace_id) not between 1 and 256
     or char_length(p_platform_user_id) not between 1 and 256
     or char_length(p_reply_address) not between 1 and 512 then
    raise exception 'invalid_pairing_request' using errcode = '22023';
  end if;

  insert into public.remote_messaging_pairing_attempts
    (platform, workspace_id, platform_user_id, window_started_at, attempt_count)
  values (p_platform, p_workspace_id, p_platform_user_id, now(), 1)
  on conflict (platform, workspace_id, platform_user_id) do update
    set window_started_at = case
          when public.remote_messaging_pairing_attempts.window_started_at < now() - interval '10 minutes'
            then now()
          else public.remote_messaging_pairing_attempts.window_started_at
        end,
        attempt_count = case
          when public.remote_messaging_pairing_attempts.window_started_at < now() - interval '10 minutes'
            then 1
          else public.remote_messaging_pairing_attempts.attempt_count + 1
        end
  returning attempt_count into v_attempts;
  if v_attempts > 5 then
    return;
  end if;

  select * into v_pairing
    from public.remote_messaging_pairings
   where platform = p_platform
     and code_digest = digest(convert_to(upper(trim(p_pairing_code)), 'UTF8'), 'sha256')
     and consumed_at is null
     and expires_at > now()
   order by created_at desc
   limit 1
   for update;
  if not found then
    return;
  end if;

  insert into public.remote_messaging_identities
    (user_id, platform, workspace_id, platform_user_id, reply_address, scopes, status, updated_at)
  values
    (v_pairing.user_id, p_platform, p_workspace_id, p_platform_user_id, p_reply_address,
     array['chat']::text[], 'active', now())
  on conflict (platform, workspace_id, platform_user_id) do update
    set user_id = excluded.user_id,
        reply_address = excluded.reply_address,
        scopes = array['chat']::text[],
        status = 'active',
        updated_at = now()
  returning id into v_identity_id;

  update public.remote_messaging_pairings set consumed_at = now() where id = v_pairing.id;
  return query select v_identity_id, v_pairing.user_id;
end;
$$;

revoke all on function public.redeem_remote_messaging_pairing(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.redeem_remote_messaging_pairing(text, text, text, text, text)
  to service_role;
