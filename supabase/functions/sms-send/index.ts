// @ts-nocheck
// sms-send: secure outbound SMS to the user's OWN verified phone number.
//
// This is the canonical billed SMS path (replaces the phone-jarvis cloud
// /outbound/message route, which bypassed billing).
//
// Flow:
//   1. Require Supabase JWT; reject anonymous (server-side auth only).
//   2. Validate body: { message } non-empty, <= MAX_SMS_CHARS. The client can
//      supply ONLY `message` — never a destination, tier, status, or access
//      decision.
//   3. AUTHORITATIVE APP-ACCESS GATE: query get_app_access (migration 0032) in
//      the AUTHENTICATED USER'S context, before any configuration/detail
//      leakage, phone lookup, rate limit, budget reservation, provider call,
//      or audit mutation. Only an explicit canUseApp === true proceeds;
//      locked/unknown/disabled, denied prelaunch, malformed, and RPC-error
//      decisions fail closed with stable safe codes and zero downstream
//      effects. An explicit authoritative prelaunch grant remains valid.
//   4. Twilio configuration is revealed only AFTER authorization.
//   5. Destination = phone_settings.user_phone_number for the AUTHENTICATED
//      user only (server-side lookup). The client can NEVER supply a number.
//   6. App-admin semantics are evaluated only AFTER access authorization.
//   7. Rate-limit per user (fail closed).
//   8. STOP-compliance footer on the first text of a cycle.
//   9. Admins skip budget; everyone else reserves via reserve_sms_budget
//      (atomic; monthly + weekly 25% + 5-hour 8% windows).
//  10. Send via Twilio REST API with the hidden company credentials.
//  11. Settle actual cost from Twilio's segment count; record an sms_event
//      with bounded last-four / char-count fields only (no full PII/secrets).
//
// Twilio signature validation is NOT needed here: this is an outbound API
// call we originate, not a Twilio webhook.
//
// Company keys live ONLY in Supabase secrets and never enter the pure handler,
// logs, audit payloads, or responses. 503 sms_not_configured when the TWILIO_*
// secrets are absent (they are provisioned separately).
//
// Dependency injection: the pure handler `handleSmsSend(req, deps)` takes every
// external collaborator (auth, authoritative access RPC, phone lookup, rate /
// budget RPCs, provider send, audit, config, clock). Tests inject fakes and run
// under `node --test` with NO Deno/env/network/live Supabase/Twilio effects.
// The SDK import and Deno.serve live behind `import.meta.main` (as a dynamic
// import) so importing this module for tests performs no fetch.

import { json, preflight } from '../_shared/voice.ts';
import { estimateSmsCostUsd, isE164, MAX_SMS_CHARS, smsSegments } from '../_shared/budget.ts';
import { evaluateAppAccessGate } from '../_shared/appAccessGate.ts';

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 5; // SMS is expensive + annoying; keep the per-minute cap tight
const TWILIO_TIMEOUT_MS = 15_000;
// CTIA STOP-compliance footer, appended to the first text of each cycle.
export const STOP_FOOTER = ' Reply STOP to opt out.';

const BUDGET_DENY_REASONS = new Set([
  'budget_exceeded',
  'monthly_budget_exceeded',
  'window_5h_exceeded',
  'window_weekly_exceeded',
]);

function timeoutSignal(ms: number): AbortSignal {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

export async function handleSmsSend(req: Request, deps: Record<string, any>): Promise<Response> {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS')
    return preflight(origin);
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin);

  // 1. Auth: identity comes ONLY from the server-validated Supabase JWT.
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401, origin);
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer' || !parts[1]) {
    return json({ error: 'unauthorized' }, 401, origin);
  }
  const jwt = parts[1];
  let userId: string | null = null;
  try {
    userId = await deps.authenticate(jwt);
  } catch (_err) {
    return json({ error: 'unauthorized' }, 401, origin);
  }
  if (typeof userId !== 'string' || userId.length === 0) {
    return json({ error: 'unauthorized' }, 401, origin);
  }

  // 2. Bounded body validation. Only `message` is accepted; client-supplied
  //    destination / tier / status / access fields are never read.
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400, origin);
  }
  const message = String(body?.message ?? '').trim();
  if (!message) return json({ error: 'empty_message' }, 400, origin);
  if (message.length > MAX_SMS_CHARS) {
    return json({ error: 'message_too_long', max: MAX_SMS_CHARS }, 413, origin);
  }

  // 3. AUTHORITATIVE APP-ACCESS GATE (get_app_access, migration 0032), queried
  //    in the authenticated user's context BEFORE any configuration/detail
  //    leakage, phone lookup, rate limit, budget reservation, provider call, or
  //    audit mutation. Never derived from client state. Anything other than an
  //    explicit canUseApp === true fails closed with zero downstream effects.
  let access: { data?: unknown; error?: unknown } | undefined;
  try {
    access = await deps.getAppAccess(jwt);
  } catch (_err) {
    return json({ error: 'access_lookup_failed' }, 502, origin);
  }
  const accessData: any = access?.data;
  if (access?.error || !accessData || typeof accessData !== 'object') {
    return json({ error: 'access_lookup_failed' }, 502, origin);
  }
  const accessDecision = evaluateAppAccessGate(accessData);
  if (accessDecision.kind === 'invalid' && accessDecision.status === undefined) {
    return json({ error: 'access_lookup_failed' }, 502, origin);
  }

  if (accessDecision.kind !== 'allow') {
    const accessStatus = accessDecision.status;
    const reason =
      accessDecision.kind === 'invalid' && accessData.enabled === false
        ? 'disabled'
        : accessStatus === 'prelaunch' || accessStatus === 'locked' || accessStatus === 'unknown'
          ? accessStatus
          : 'denied';
    return json({ error: 'access_denied', reason }, 403, origin);
  }

  // 4. Twilio configuration (state revealed only AFTER authorization).
  if (!deps.config?.smsConfigured) {
    return json({ error: 'sms_not_configured' }, 503, origin);
  }

  // 5. Destination: the authenticated user's own number, server-side lookup.
  let phone: { userPhoneNumber?: string; twilioPhoneNumber?: string } | null = null;
  try {
    phone = await deps.getPhone(userId);
  } catch (_err) {
    phone = null;
  }
  const toNumber = String(phone?.userPhoneNumber ?? '').trim();
  if (!toNumber) return json({ error: 'no_phone_number' }, 400, origin);
  if (!isE164(toNumber)) return json({ error: 'invalid_phone_number' }, 400, origin);
  const fromNumber =
    String(phone?.twilioPhoneNumber ?? '').trim() ||
    String(deps.config?.defaultFromNumber ?? '').trim();
  if (!fromNumber || !isE164(fromNumber)) {
    return json({ error: 'sms_not_configured' }, 503, origin);
  }

  // 6. App-admin semantics, evaluated only AFTER access authorization.
  let appAdmin = false;
  try {
    appAdmin = Boolean(await deps.isAppAdmin(userId));
  } catch (_err) {
    appAdmin = false;
  }

  // 7. Rate limit (fail closed).
  let now: number;
  try {
    now = typeof deps.now === 'function' ? deps.now() : Date.now();
  } catch (_err) {
    return json({ error: 'usage_unavailable' }, 503, origin);
  }
  const windowStart = new Date(Math.floor(now / RATE_WINDOW_MS) * RATE_WINDOW_MS).toISOString();
  let rl: { error?: unknown; limited?: boolean } | undefined;
  try {
    rl = await deps.rateLimitHit(userId, windowStart, message.length, RATE_MAX);
  } catch (_err) {
    return json({ error: 'usage_unavailable' }, 503, origin);
  }
  if (rl?.error) return json({ error: 'usage_unavailable' }, 503, origin);
  if (rl?.limited) return json({ error: 'rate_limited' }, 429, origin);

  // 8. STOP compliance: append the opt-out footer to the first text of the cycle.
  let usedCount = 0;
  try {
    usedCount = Number(await deps.getSmsUsedCount(userId)) || 0;
  } catch (_err) {
    usedCount = 0;
  }
  const isFirstOfCycle = usedCount === 0;
  const finalMessage =
    isFirstOfCycle && !message.toUpperCase().includes('STOP')
      ? `${message}${STOP_FOOTER}`
      : message;

  // 9. Reserve budget (skipped for admins; the RPC enforces all three windows).
  const estSegments = smsSegments(finalMessage);
  const estCost = estimateSmsCostUsd(estSegments);
  if (!appAdmin) {
    let reservation: { error?: unknown; reservation?: any } | undefined;
    try {
      reservation = await deps.reserveBudget(userId, estCost, 1);
    } catch (_err) {
      return json({ error: 'usage_unavailable' }, 500, origin);
    }
    if (reservation?.error) return json({ error: 'usage_unavailable' }, 500, origin);
    const reserved = reservation?.reservation;
    if (!reserved?.ok) {
      const reason =
        typeof reserved?.reason === 'string' && BUDGET_DENY_REASONS.has(reserved.reason)
          ? reserved.reason
          : 'budget';
      const retryAfter =
        (reason === 'window_5h_exceeded' || reason === 'window_weekly_exceeded') &&
        typeof reserved?.retry_after === 'string' &&
        reserved.retry_after.length <= 64 &&
        Number.isFinite(Date.parse(reserved.retry_after))
          ? reserved.retry_after
          : null;
      try {
        await deps.recordEvent('sms', userId, {
          to_last4: toNumber.slice(-4),
          segments: estSegments,
          message_chars: finalMessage.length,
          status: 'blocked',
          error_code: reason,
        });
      } catch (_err) {
        // Audit failure must not turn a denied reservation into an uncaught
        // handler rejection or expose dependency details.
      }
      const isWindow = reason === 'window_5h_exceeded' || reason === 'window_weekly_exceeded';
      return json(
        {
          error: isWindow ? 'rate_window_exceeded' : 'budget_exceeded',
          reason,
          retry_after: retryAfter,
        },
        isWindow ? 429 : 402,
        origin,
      );
    }
  }

  // 10. Provider send (company credentials held only in the wired closure).
  let send: {
    ok: boolean;
    networkError?: boolean;
    status?: number;
    numSegments?: number;
    sid?: string | null;
  };
  try {
    send = await deps.sendSms({ to: toNumber, from: fromNumber, body: finalMessage });
  } catch (_err) {
    send = { ok: false, networkError: true };
  }
  if (!send?.ok) {
    if (!appAdmin) {
      try {
        await deps.settleBudget(userId, estCost, 0, -1);
      } catch (_err) {
        // The rollback was attempted. Preserve the provider failure response
        // without leaking settlement details or skipping the audit attempt.
      }
    }
    const providerStatus =
      typeof send?.status === 'number' &&
      Number.isInteger(send.status) &&
      send.status >= 100 &&
      send.status <= 599
        ? send.status
        : null;
    const errorCode = send?.networkError
      ? 'twilio_unreachable'
      : providerStatus === null
        ? 'twilio_error'
        : `twilio_${providerStatus}`;
    try {
      await deps.recordEvent('sms', userId, {
        to_last4: toNumber.slice(-4),
        segments: estSegments,
        message_chars: finalMessage.length,
        status: 'error',
        error_code: errorCode,
      });
    } catch (_err) {
      // The SMS failed and any reservation rollback was already attempted.
      // Keep the client-facing outcome stable if audit storage is unavailable.
    }
    return json({ error: send?.networkError ? 'sms_unavailable' : 'sms_failed' }, 502, origin);
  }

  // 11. Settle actual cost (Twilio reports the real segment count) + record.
  const reportedSegments = Number(send.numSegments);
  const actualSegments =
    Number.isSafeInteger(reportedSegments) && reportedSegments >= 1 && reportedSegments <= 100
      ? reportedSegments
      : estSegments;
  const actualCost = estimateSmsCostUsd(actualSegments);
  if (!appAdmin) {
    try {
      await deps.settleBudget(userId, estCost, actualCost, 0);
    } catch (_err) {
      // The provider has already delivered the SMS. Do not surface a retryable
      // failure that could duplicate delivery; still attempt the audit below.
    }
  }
  try {
    await deps.recordEvent('sms', userId, {
      to_last4: toNumber.slice(-4),
      segments: actualSegments,
      message_chars: finalMessage.length,
      twilio_sid:
        typeof send.sid === 'string' && /^SM[A-Za-z0-9]{1,64}$/.test(send.sid) ? send.sid : null,
      estimated_cost_usd: appAdmin ? 0 : estCost,
      actual_cost_usd: appAdmin ? 0 : actualCost,
      status: 'ok',
    });
  } catch (_err) {
    // Delivery already succeeded and settlement was attempted. Preserve that
    // terminal delivery result so a client retry cannot duplicate the SMS.
  }

  return json({ ok: true, segments: actualSegments }, 200, origin);
}

// Production wiring (Supabase Edge Function entrypoint). The dynamic import
// keeps the SDK fetch out of test runs: import.meta.main is false when this
// module is imported (e.g. by index.test.ts), true only when executed as the
// entrypoint under Deno.
if (import.meta.main) {
  const [supabaseMod] = await Promise.all([import('https://esm.sh/@supabase/supabase-js@2.46.2')]);
  const createClient = supabaseMod.createClient;

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
  const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
  const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER') ?? '';
  // Bounded server-configured build version passed to get_app_access; never
  // client input.
  const APP_VERSION = (Deno.env.get('APP_VERSION') ?? '').trim().slice(0, 128);

  let adminClient: any = null;
  const admin = () =>
    adminClient ??
    (adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    }));

  const deps = {
    config: {
      smsConfigured: Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN),
      defaultFromNumber: TWILIO_PHONE_NUMBER,
    },
    now: () => Date.now(),
    async authenticate(token: string) {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data, error } = await client.auth.getUser(token);
      if (error || !data || !data.user) return null;
      return data.user.id;
    },
    // Authoritative access via the SECURITY DEFINER get_app_access RPC
    // (migration 0032). It takes NO user parameter and resolves auth.uid(), so
    // it MUST run in the authenticated user's context: the validated JWT is
    // threaded into the client. A service-role call would yield auth.uid() IS
    // NULL -> unknown -> fail closed.
    async getAppAccess(token: string) {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const params = APP_VERSION ? { p_app_version: APP_VERSION } : {};
      const { data, error } = await client.rpc('get_app_access', params);
      return { data, error };
    },
    async getPhone(userId: string) {
      const { data } = await admin()
        .from('phone_settings')
        .select('user_phone_number, twilio_phone_number')
        .eq('user_id', userId)
        .maybeSingle();
      if (!data) return null;
      return {
        userPhoneNumber: String(data.user_phone_number ?? ''),
        twilioPhoneNumber: String(data.twilio_phone_number ?? ''),
      };
    },
    async isAppAdmin(userId: string) {
      const { data } = await admin().rpc('is_app_admin', { p_user_id: userId });
      return Boolean(data);
    },
    async rateLimitHit(userId: string, windowStart: string, chars: number, maxRequests: number) {
      const { data, error } = await admin().rpc('sms_rate_limit_hit', {
        p_user_id: userId,
        p_window_start: windowStart,
        p_chars: chars,
        p_max_requests: maxRequests,
      });
      return { error, limited: Boolean((data as { limited?: boolean } | null)?.limited) };
    },
    async getSmsUsedCount(userId: string) {
      const { data } = await admin()
        .from('sms_usage')
        .select('used_count')
        .eq('user_id', userId)
        .maybeSingle();
      return Number((data as { used_count?: number } | null)?.used_count ?? 0);
    },
    async reserveBudget(userId: string, estimateUsd: number, count: number) {
      const { data, error } = await admin().rpc('reserve_sms_budget', {
        p_user_id: userId,
        p_estimate_usd: estimateUsd,
        p_count: count,
      });
      return { error, reservation: data };
    },
    async settleBudget(userId: string, reservedUsd: number, actualUsd: number, countDelta: number) {
      const { error } = await admin().rpc('settle_sms_budget', {
        p_user_id: userId,
        p_reserved: reservedUsd,
        p_actual: actualUsd,
        p_count_delta: countDelta,
      });
      if (error) throw new Error('sms_budget_settlement_failed');
    },
    async recordEvent(kind: string, userId: string, payload: Record<string, unknown>) {
      const { error } = await admin().rpc('record_usage_event', {
        p_kind: kind,
        p_user_id: userId,
        p_payload: payload,
      });
      if (error) throw new Error('sms_usage_event_failed');
    },
    // Twilio credentials live ONLY in this closure; never logged or returned.
    async sendSms({ to, from, body }: { to: string; from: string; body: string }) {
      const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
      const form = new URLSearchParams({ To: to, From: from, Body: body });
      let res: Response;
      try {
        res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
          {
            method: 'POST',
            headers: {
              authorization: `Basic ${auth}`,
              'content-type': 'application/x-www-form-urlencoded',
            },
            body: form.toString(),
            signal: timeoutSignal(TWILIO_TIMEOUT_MS),
          },
        );
      } catch (_err) {
        return { ok: false, networkError: true };
      }
      const twilioBody: Record<string, unknown> = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, status: res.status };
      return {
        ok: true,
        numSegments: Number(twilioBody.num_segments ?? 0) || 1,
        sid: typeof twilioBody.sid === 'string' ? twilioBody.sid : null,
      };
    },
  };

  Deno.serve((req: Request) => handleSmsSend(req, deps));
}
