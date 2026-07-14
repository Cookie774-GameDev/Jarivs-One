// @ts-nocheck
// call-status: Twilio status callback fired when a call completes. Verifies the
// signature, then settles the real call duration against the user's call budget.
// Deploy with --no-verify-jwt.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.2';
import { settleMeteredUsage } from '../_shared/metering.ts';
import { verifyTwilioSignature, estimateCallCostUsd } from '../_shared/budget.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const APP_BASE_URL = Deno.env.get('APP_BASE_URL') ?? '';
const MIN_RESERVE_SECONDS = 60;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = String(v);

  const signature = req.headers.get('x-twilio-signature');
  const requestUrl = new URL(req.url);
  const url = `${APP_BASE_URL}/functions/v1/call-status${requestUrl.search}`;
  if (!(await verifyTwilioSignature(TWILIO_AUTH_TOKEN, signature, url, params))) {
    return new Response('invalid signature', { status: 403 });
  }

  const callSid = params.CallSid;
  const duration = parseInt(params.CallDuration ?? '0', 10) || 0;
  if (!callSid) return new Response('ok', { status: 200 });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const reservationParam = requestUrl.searchParams.get('reservation_id') ?? '';
  const validReservationId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(reservationParam) ? reservationParam : null;
  let reservation: { id: string; user_id: string } | null = null;
  let legacyUserId: string | null = null;
  if (validReservationId) {
    const { data, error } = await admin
      .from('usage_reservations')
      .select('id, user_id')
      .eq('id', validReservationId)
      .eq('kind', 'call')
      .maybeSingle();
    if (error) return new Response('temporary failure', { status: 500 });
    reservation = data as typeof reservation;
  }

  // Backward-compatible fallback for callbacks created before migration 0032.
  if (!reservation) {
    const { data: ev, error: eventLookupErr } = await admin
      .from('call_events')
      .select('user_id')
      .eq('call_sid', callSid)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (eventLookupErr) return new Response('temporary failure', { status: 500 });
    if (!ev?.user_id) return new Response('ok', { status: 200 });
    legacyUserId = ev.user_id;

    const { data: linked, error: linkLookupErr } = await admin
      .from('usage_reservations')
      .select('id, user_id')
      .eq('user_id', ev.user_id)
      .eq('kind', 'call')
      .eq('provider_reference', callSid)
      .maybeSingle();
    if (linkLookupErr) return new Response('temporary failure', { status: 500 });
    reservation = linked as typeof reservation;
  }

  const actual = estimateCallCostUsd(duration);
  const eventUserId = reservation?.user_id ?? legacyUserId;
  if (!eventUserId) return new Response('ok', { status: 200 });
  if (reservation) {
    if (!await settleMeteredUsage(admin, {
      userId: reservation.user_id,
      reservationId: reservation.id,
      actualUsd: actual,
      actualCount: duration,
      status: 'settled',
    })) return new Response('temporary failure', { status: 500 });
  } else {
    const { error: legacySettleErr } = await admin.rpc('settle_call_budget', {
      p_user_id: eventUserId,
      p_reserved: estimateCallCostUsd(MIN_RESERVE_SECONDS),
      p_actual: actual,
      p_seconds: duration,
    });
    if (legacySettleErr) return new Response('temporary failure', { status: 500 });
  }
  const { error: eventErr } = await admin.rpc('record_usage_event', {
    p_kind: 'call', p_user_id: eventUserId,
    p_payload: {
      call_sid: callSid, direction: 'outbound', duration_seconds: duration,
      actual_cost_usd: actual, status: 'completed',
    },
  });
  if (eventErr) console.error('call_usage_event_write_failed');
  return new Response('ok', { status: 200 });
});
