// @ts-nocheck — Supabase Deno runtime
// wallpaper-download-url: short-lived signed URL only after server entitlement check.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.2';
import { json } from '../_shared/voice.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = Deno.env.get('WALLPAPER_STORAGE_BUCKET') ?? 'vibespace-wallpapers';
const SIGNED_TTL_SECONDS = 120;

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: { ...json({}, 200, origin).headers } });
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
  const userId = userData.user.id;

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authz, error: authzErr } = await service.rpc('authorize_wallpaper_download', {
    p_user_id: userId,
    p_wallpaper_id: wallpaperId,
  });

  if (authzErr) return json({ ok: false, reason: 'rpc_error' }, 200, origin);
  const grant = authz as Record<string, unknown>;
  if (!grant?.ok) {
    return json(
      { ok: false, reason: grant?.reason ?? 'not_entitled', access_mode: grant?.access_mode },
      200,
      origin,
    );
  }

  const storagePath = String(grant.storage_path ?? '');
  if (!storagePath) return json({ ok: false, reason: 'missing_storage_path' }, 200, origin);

  const { data: signed, error: signErr } = await service.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_TTL_SECONDS);

  if (signErr || !signed?.signedUrl) {
    return json({ ok: false, reason: 'sign_failed' }, 200, origin);
  }

  return json(
    {
      ok: true,
      wallpaper_id: grant.wallpaper_id,
      slug: grant.slug,
      sha256: grant.sha256,
      size_bytes: grant.size_bytes,
      entitlement_source: grant.entitlement_source,
      expires_in_seconds: SIGNED_TTL_SECONDS,
      // Short-lived only — never a permanent public URL.
      download_url: signed.signedUrl,
    },
    200,
    origin,
  );
});
