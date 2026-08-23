-- Follow-up for Supabase advisor findings on the wallpaper catalog.

create index if not exists orbit_wallpaper_slots_wallpaper_idx
  on public.orbit_wallpaper_slots (wallpaper_id);

create index if not exists wallpaper_download_events_wallpaper_idx
  on public.wallpaper_download_events (wallpaper_id);

drop policy if exists orbit_slots_read_own on public.orbit_wallpaper_slots;
create policy orbit_slots_read_own on public.orbit_wallpaper_slots
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists wallpaper_dl_events_read_own on public.wallpaper_download_events;
create policy wallpaper_dl_events_read_own on public.wallpaper_download_events
  for select to authenticated
  using (user_id = (select auth.uid()));
