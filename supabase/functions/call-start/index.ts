// @ts-nocheck
// call-start: authorize an AI call for the authenticated user.
//
// The desktop app NEVER holds the Twilio auth token. It calls this function,
// which verifies auth + active subscription + remaining call budget, reserves
// a minimum estimate, and (when Twilio is configured) initiates the call. The
// real per-second cost is settled by call-status when the call ends.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.2';
import { buildUsageIdempotencyKey } from '../_shared/billingSecurity.ts';
import { reserveBoundedCallUsage, settleMeteredUsage } from '../_shared/metering.ts';
import { json } from '../_shared/voice.ts';
import { estimateCallCostUsd, MAX_CALL_SECONDS } from '../_shared/budget.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER') ?? '';
const APP_BASE_URL = Deno.env.get('APP_BASE_URL') ?? '';

const MIN_RESERVE_SECONDS = 60; // reserve at least 1 minute up front
const CALLS_PER_MINUTE = 3;

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: json({}, 200, origin).headers });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin);

  const jwt = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!jwt) return json({ error: 'unauthorized' }, 401, origin);
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
  // Basic E.164 validation; reject anything that isn't a plausible phone number.
  if (!/^\+[1-9]\d{6,14}$/.test(toNumber)) return json({ error: 'invalid_number' }, 400, origin);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Reserve the largest affordable duration, then make that exact reservation
  // the provider hard limit so a call cannot incur unreserved spend.
  const reserved = await reserveBoundedCallUsage(admin, {
    userId,
    idempotencyKey: buildUsageIdempotencyKey('call', req.headers.get('x-idempotency-key')),
    maxSeconds: MAX_CALL_SECONDS,
    minSeconds: MIN_RESERVE_SECONDS,
    costPerSecondUsd: estimateCallCostUsd(1),
    rateLimitWindowStart: new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString(),
    rateLimitMaxRequests: CALLS_PER_MINUTE,
    context: { provider: 'twilio', operation: 'outbound_call' },
  });
  if (!reserved?.ok) {
    if (reserved?.reason === 'rate_limited') return json({ error: 'rate_limited' }, 429, origin);
    if (reserved?.reason === 'usage_unavailable') return json({ error: 'usage_unavailable' }, 503, origin);
    return json({ error: 'budget_exceeded' }, 402, origin);
  }
  const reservedSeconds = reserved.reservedCount;
  if (reserved.duplicate) {
    if (typeof reserved.provider_reference === 'string') {
      return json({
        call_sid: reserved.provider_reference,
        status: 'initiated',
        max_seconds: reservedSeconds,
      }, 200, origin);
    }
    return json({ error: 'request_in_progress' }, 409, origin);
  }
  const reservationId = reserved.reservationId;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    // Release the reservation; calling isn't configured yet.
    if (!await settleMeteredUsage(admin, {
      userId, reservationId, actualUsd: 0, actualCount: 0, status: 'released',
    })) return json({ error: 'usage_unavailable' }, 503, origin);
    return json({ error: 'calling_unconfigured' }, 503, origin);
  }

  // Initiate the call via Twilio. TwiML/voice handling lives in twilio-voice-webhook.
  const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  const form = new URLSearchParams({
    To: toNumber,
    From: TWILIO_PHONE_NUMBER,
    Url: `${APP_BASE_URL}/functions/v1/twilio-voice-webhook`,
    StatusCallback: `${APP_BASE_URL}/functions/v1/call-status?reservation_id=${encodeURIComponent(reservationId)}`,
    StatusCallbackEvent: 'completed',
    Timeout: '30',
    TimeLimit: String(reservedSeconds),
  });
  let twilioRes: Response;
  try {
    twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`,
      {
        method: 'POST',
        headers: { authorization: `Basic ${auth}`, 'content-type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      },
    );
  } catch {
    if (!await settleMeteredUsage(admin, {
      userId, reservationId, actualUsd: 0, actualCount: 0, status: 'released',
    })) return json({ error: 'usage_unavailable' }, 503, origin);
    return json({ error: 'call_provider_unavailable' }, 502, origin);
  }
  if (!twilioRes.ok) {
    if (!await settleMeteredUsage(admin, {
      userId, reservationId, actualUsd: 0, actualCount: 0, status: 'released',
    })) return json({ error: 'usage_unavailable' }, 503, origin);
    return json({ error: 'call_failed' }, 502, origin);
  }
  const call = await twilioRes.json();
  const callSid = typeof call?.sid === 'string' ? call.sid : '';
  if (!callSid) {
    console.error('twilio_call_missing_sid');
    return json({ error: 'call_failed' }, 502, origin);
  }
  const { data: attached, error: attachErr } = await admin.rpc('attach_usage_provider_reference', {
    p_user_id: userId,
    p_reservation_id: reservationId,
    p_provider_reference: callSid,
  });
  const { error: eventErr } = await admin.rpc('record_usage_event', {
    p_kind: 'call', p_user_id: userId,
    p_payload: {
      call_sid: callSid,
      direction: 'outbound',
      status: 'initiated',
      estimated_cost_usd: estimateCallCostUsd(reservedSeconds),
    },
  });
  if (attachErr || attached !== true) console.error('call_reservation_link_failed');
  if (eventErr) console.error('call_usage_event_write_failed');
  return json({ call_sid: callSid, status: 'initiated', max_seconds: reservedSeconds }, 200, origin);
});
