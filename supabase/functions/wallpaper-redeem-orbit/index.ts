// @ts-nocheck — Supabase Deno runtime
// wallpaper-redeem-orbit: assign one permanent Orbit (starter) wallpaper slot.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.2';
import { json, preflight } from '../_shared/voice.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return preflight(origin);
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin);

  const jwt = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!jwt) return json({ error: 'unauthorized' }, 401, origin);

  let body: { wallpaper_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400, origin);
  }

  const wallpaperId = typeof body.wallpaper_id === 'string' ? body.wallpaper_id : '';
  if (!wallpaperId) return json({ error: 'wallpaper_id_required' }, 400, origin);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401, origin);
  // Never trust body user_id — only session.
  const userId = userData.user.id;

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await service.rpc('redeem_orbit_wallpaper', {
    p_user_id: userId,
    p_wallpaper_id: wallpaperId,
  });

  if (error) return json({ ok: false, reason: 'rpc_error', detail: error.message }, 200, origin);
  return json(data ?? { ok: false, reason: 'unknown' }, 200, origin);
});
