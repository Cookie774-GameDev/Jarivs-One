// @ts-nocheck — Supabase Deno runtime (URL imports + Deno globals).
// claim-launch-promo: idempotently claims launch rewards for an authenticated user.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.2';
import { json } from '../_shared/voice.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: { ...json({}, 200, origin).headers } });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin);
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ ok: false, reason: 'promo_unavailable' }, 503, origin);
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

  try {
    const { data: founder, error: founderErr } = await service.rpc('claim_launch_founder_reward', {
      p_user_id: userId,
    });
    if (founderErr) {
      console.error('[claim-launch-promo] founder RPC failed', { user_id: userId, code: founderErr.code ?? 'rpc_error' });
      return json({ ok: false, reason: 'promo_unavailable' }, 503, origin);
    }

    let result = (founder as Record<string, unknown>) ?? { ok: false };
    const reason = String((result as { reason?: string }).reason ?? '');

    if (!result.ok && (reason === 'founder_slots_exhausted' || reason === 'spark_promo_not_active')) {
      const { data: spark, error: sparkErr } = await service.rpc('claim_launch_spark_promo', {
        p_user_id: userId,
      });
      if (sparkErr) {
        console.error('[claim-launch-promo] spark RPC failed', { user_id: userId, code: sparkErr.code ?? 'rpc_error' });
        return json({ ok: false, reason: 'promo_unavailable' }, 503, origin);
      }
      if (spark) result = spark as Record<string, unknown>;
    }

    return json(result, 200, origin);
  } catch {
    return json({ ok: false, reason: 'promo_unavailable' }, 503, origin);
  }
});
