// @ts-nocheck — Supabase Deno runtime
// wallpaper-catalog: returns active wallpaper metadata (no permanent full-file URLs).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.2';
import { json, preflight } from '../_shared/voice.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return preflight(origin);
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405, origin);
  }

  const jwt = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!jwt) return json({ error: 'unauthorized' }, 401, origin);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401, origin);
  const userId = userData.user.id;

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: accessRows, error: accessErr } = await service.rpc('user_wallpaper_access', {
    p_user_id: userId,
  });
  if (accessErr) return json({ error: 'access_lookup_failed' }, 500, origin);
  const access = Array.isArray(accessRows) ? accessRows[0] : accessRows;

  const { data: wallpapers, error: wpErr } = await service
    .from('wallpapers')
    .select(
      'id,slug,name,description,category,tags,version,author,thumbnail_path,preview_path,fallback_path,size_bytes,width,height,format,engine_type,performance_tier,featured,sort_order,updated_at',
    )
    .eq('active', true)
    .order('sort_order', { ascending: true });

  if (wpErr) return json({ error: 'catalog_failed' }, 500, origin);

  // Never return permanent full storage_path for download; only light paths for thumbs.
  return json(
    {
      ok: true,
      access: {
        mode: access?.access_mode ?? 'none',
        plan: access?.plan ?? 'free',
        status: access?.status ?? 'inactive',
        period_end: access?.period_end ?? null,
        is_admin: !!access?.is_admin,
        orbit_wallpaper_ids: access?.orbit_wallpaper_ids ?? [],
      },
      wallpapers: wallpapers ?? [],
      fetched_at: new Date().toISOString(),
    },
    200,
    origin,
  );
});
