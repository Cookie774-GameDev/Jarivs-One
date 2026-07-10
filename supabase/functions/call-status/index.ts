// @ts-nocheck
// call-status: Twilio status callback fired when a call completes. Verifies the
// signature, then atomically settles the real call duration exactly once.
// Deploy with verify_jwt = false; Twilio signature validation is the auth layer.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.2';
import { verifyTwilioSignature, estimateCallCostUsd } from '../_shared/budget.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const APP_BASE_URL = (Deno.env.get('APP_BASE_URL') ?? '').replace(/\/$/, '');

const MIN_RESERVE_SECONDS = 60;

function isSafeAppBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TWILIO_AUTH_TOKEN || !isSafeAppBaseUrl(APP_BASE_URL)) {
    return new Response('callback unavailable', { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return new Response('bad request', { status: 400 });
  }

  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = String(v);

  const signature = req.headers.get('x-twilio-signature');
  const url = `${APP_BASE_URL}/functions/v1/call-status`;
  if (!(await verifyTwilioSignature(TWILIO_AUTH_TOKEN, signature, url, params))) {
    return new Response('invalid signature', { status: 403 });
  }

  const callSid = String(params.CallSid ?? '').trim();
  const parsedDuration = Number.parseInt(params.CallDuration ?? '0', 10);
  const duration = Number.isFinite(parsedDuration) ? Math.max(0, parsedDuration) : 0;
  if (!callSid) return new Response('ok', { status: 200 });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const reserved = estimateCallCostUsd(MIN_RESERVE_SECONDS);
  const actual = estimateCallCostUsd(duration);
  const { data, error } = await admin.rpc('complete_call_once', {
    p_call_sid: callSid,
    p_duration_seconds: duration,
    p_reserved_usd: reserved,
    p_actual_usd: actual,
  });

  if (error) {
    console.error('[call-status] settlement failed', { call_sid: callSid, code: error.code ?? 'rpc_error' });
    return new Response('settlement failed', { status: 500 });
  }

  const result = data as { ok?: boolean; reason?: string } | null;
  if (!result?.ok && result?.reason !== 'call_not_found') {
    console.error('[call-status] settlement rejected', { call_sid: callSid, reason: result?.reason ?? 'unknown' });
    return new Response('settlement failed', { status: 500 });
  }

  // Unknown callbacks are acknowledged so Twilio does not retry forever; they
  // remain visible in provider logs and do not alter usage or customer data.
  return new Response('ok', { status: 200 });
});
