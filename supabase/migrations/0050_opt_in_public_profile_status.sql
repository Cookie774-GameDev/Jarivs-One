-- Explicit opt-in public profile snapshots. Behavioral status history remains
-- local-only; this table accepts only a small, user-selected aggregate card.

create table if not exists public.public_profile_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  slug text not null unique,
  visible boolean not null default false,
  display_name text not null,
  headline text,
  avatar_seed text,
  selected_metrics jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint public_profile_status_slug_bounded
    check (slug ~ '^[a-z0-9][a-z0-9-]{2,47}$'),
  constraint public_profile_status_display_name_bounded
    check (char_length(btrim(display_name)) between 1 and 80),
  constraint public_profile_status_headline_bounded
    check (headline is null or char_length(headline) <= 160),
  constraint public_profile_status_avatar_seed_bounded
    check (avatar_seed is null or char_length(avatar_seed) <= 80),
  constraint public_profile_status_metrics_bounded
    check (
      jsonb_typeof(selected_metrics) = 'object'
      and octet_length(selected_metrics::text) <= 4096
      and selected_metrics - array[
        'activeTimeMs', 'totalTokens', 'messagesWritten', 'charactersTyped',
        'completed', 'tokensSaved', 'streakDays', 'topModel', 'topProvider',
        'topSurface'
      ]::text[] = '{}'::jsonb
    )
);

create index if not exists public_profile_status_visible_updated_idx
  on public.public_profile_status (visible, updated_at desc)
  where visible;

drop trigger if exists public_profile_status_touch_updated on public.public_profile_status;
create trigger public_profile_status_touch_updated
  before update on public.public_profile_status
  for each row execute function public.touch_updated_at_ts();

alter table public.public_profile_status enable row level security;
revoke all on table public.public_profile_status from anon, authenticated;
grant select, insert, update, delete on table public.public_profile_status to authenticated;
grant all on table public.public_profile_status to service_role;

drop policy if exists public_profile_status_owner_select on public.public_profile_status;
create policy public_profile_status_owner_select
  on public.public_profile_status for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists public_profile_status_public_select on public.public_profile_status;
create policy public_profile_status_public_select
  on public.public_profile_status for select to anon, authenticated
  using (visible);

drop policy if exists public_profile_status_owner_insert on public.public_profile_status;
create policy public_profile_status_owner_insert
  on public.public_profile_status for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists public_profile_status_owner_update on public.public_profile_status;
create policy public_profile_status_owner_update
  on public.public_profile_status for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists public_profile_status_owner_delete on public.public_profile_status;
create policy public_profile_status_owner_delete
  on public.public_profile_status for delete to authenticated
  using ((select auth.uid()) = user_id);

create or replace view public.public_profile_status_cards
with (security_invoker = true)
as
select slug, display_name, headline, avatar_seed, selected_metrics, updated_at
from public.public_profile_status
where visible;

revoke all on table public.public_profile_status_cards from public, anon, authenticated;
grant select on table public.public_profile_status_cards to anon, authenticated;

comment on table public.public_profile_status is
  'Explicit opt-in public aggregate cards only. Raw/local Status analytics must never be stored here.';
