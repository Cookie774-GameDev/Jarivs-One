// @ts-nocheck
// call-start: authorize an AI call for the authenticated user.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.2';
import { json } from '../_shared/voice.ts';
import { estimateCallCostUsd, isE164, MAX_CALL_SECONDS } from '../_shared/budget.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER') ?? '';
const APP_BASE_URL = (Deno.env.get('APP_BASE_URL') ?? '').replace(/\/$/, '');

const MIN_RESERVE_SECONDS = 60;
const TWILIO_TIMEOUT_MS = 15_000;

function isSafeAppBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: json({}, 200, origin).headers });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin);

  const jwt = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!jwt) return json({ error: 'unauthorized' }, 401, origin);
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'calling_unconfigured' }, 503, origin);
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401, origin);
  const userId = userData.user.id;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400, origin);
  }
  const toNumber = String(body.to ?? '').trim();
  if (!isE164(toNumber)) return json({ error: 'invalid_number' }, 400, origin);

  // Validate provider and callback configuration before reserving budget.
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !isE164(TWILIO_PHONE_NUMBER) || !isSafeAppBaseUrl(APP_BASE_URL)) {
    return json({ error: 'calling_unconfigured' }, 503, origin);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const estCost = estimateCallCostUsd(MIN_RESERVE_SECONDS);
  const { data: reservation, error: reserveErr } = await admin
    .rpc('reserve_call_budget', { p_user_id: userId, p_estimate_usd: estCost });
  if (reserveErr) return json({ error: 'usage_unavailable' }, 503, origin);
  const reserved = reservation as { ok: boolean; reason?: string; retry_after?: string } | null;
  if (!reserved?.ok) {
    const reason = reserved?.reason ?? 'budget';
    const isWindow = reason === 'window_5h_exceeded' || reason === 'window_weekly_exceeded';
    return json({
      error: isWindow ? 'rate_window_exceeded' : 'budget_exceeded',
      reason,
      retry_after: reserved?.retry_after ?? null,
    }, isWindow ? 429 : 402, origin);
  }

  const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  const form = new URLSearchParams({
    To: toNumber,
    From: TWILIO_PHONE_NUMBER,
    Url: `${APP_BASE_URL}/functions/v1/twilio-voice-webhook`,
    StatusCallback: `${APP_BASE_URL}/functions/v1/call-status`,
    StatusCallbackEvent: 'completed',
    Timeout: '30',
    TimeLimit: String(MAX_CALL_SECONDS),
  });

  try {
    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`,
      {
        method: 'POST',
        headers: { authorization: `Basic ${auth}`, 'content-type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
        signal: timeoutSignal(TWILIO_TIMEOUT_MS),
      },
    );
    if (!twilioRes.ok) {
      await admin.rpc('settle_call_budget', { p_user_id: userId, p_reserved: estCost, p_actual: 0, p_seconds: 0 });
      return json({ error: 'call_failed' }, 502, origin);
    }

    const call = await twilioRes.json();
    const callSid = typeof call?.sid === 'string' ? call.sid : '';
    if (!callSid) {
      await admin.rpc('settle_call_budget', { p_user_id: userId, p_reserved: estCost, p_actual: 0, p_seconds: 0 });
      return json({ error: 'call_failed' }, 502, origin);
    }

    const { error: eventErr } = await admin.rpc('record_usage_event', {
      p_kind: 'call',
      p_user_id: userId,
      p_payload: { call_sid: callSid, direction: 'outbound', status: 'initiated', estimated_cost_usd: estCost },
    });
    if (eventErr) {
      console.error('[call-start] usage event persistence failed', { user_id: userId, call_sid: callSid });
    }

    return json({ call_sid: callSid, status: 'initiated', max_seconds: MAX_CALL_SECONDS }, 200, origin);
  } catch {
    await admin.rpc('settle_call_budget', { p_user_id: userId, p_reserved: estCost, p_actual: 0, p_seconds: 0 });
    return json({ error: 'call_provider_unavailable' }, 502, origin);
  }
});
