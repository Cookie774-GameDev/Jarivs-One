// @ts-nocheck
// call-start: authorize an AI call for the authenticated user.
//
// The desktop app NEVER holds the Twilio auth token. It calls this function,
// which verifies auth + authoritative app-access + remaining call budget,
// reserves a minimum estimate, and (when Twilio is configured) initiates the
// call. The real per-second cost is settled by call-status when the call ends.
//
// Pipeline:
//   auth -> validate (body + E.164) -> app-access (authoritative, user context)
//   -> reserve budget atomically -> provider configured? -> call Twilio
//   -> settle actual cost (call-status) -> record event.
//
// SECURITY: get_app_access is the authoritative server-side gate. It runs in
// the authenticated user's context (user JWT, not service role) BEFORE any
// budget/provider side effect. Client-provided access/tier/status/app_version
// is never trusted; the app version comes from server configuration only.
// Unknown, locked, unrecognized, contradictory, malformed, and RPC-error
// access decisions fail closed with zero billable effects. The authoritative
// prelaunch decision remains usable for development builds per migration 0032.

import { json } from '../_shared/voice.ts';
import { estimateCallCostUsd, MAX_CALL_SECONDS } from '../_shared/budget.ts';
import { evaluateAppAccessGate } from '../_shared/appAccessGate.ts';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Shape returned by the authoritative get_app_access RPC (0032 migration). */
export interface AppAccessResponse {
  status: string;
  enabled: boolean;
  serverTime: string;
  trialEndsAt?: string | null;
  currentPeriodEndsAt?: string | null;
  graceEndsAt?: string | null;
  daysRemaining?: number | null;
  canUseApp: boolean;
  canEdit: boolean;
  canExport: boolean;
  requiresCheckout: boolean;
  checkoutReason?: string | null;
}

/** Provider (Twilio) call result, abstracted over fetch. */
export interface ProviderResult {
  ok: boolean;
  status: number;
  body: unknown;
}

/** Budget reservation result from the reserve_call_budget RPC. */
export interface ReservationResult {
  ok: boolean;
  reason?: string;
}

/** All side-effecting dependencies injected into the handler. */
export interface HandlerDeps {
  /** Verify JWT and return userId, or null if invalid. */
  getUser(jwt: string): Promise<string | null>;
  /** Call get_app_access in the authenticated user's context. */
  getAppAccess(jwt: string, appVersion?: string): Promise<AppAccessResponse | null>;
  /** Check if Twilio calling is configured. */
  isProviderConfigured(): boolean;
  /** Reserve budget atomically. Returns null on RPC error. */
  reserveBudget(userId: string, estimateUsd: number): Promise<ReservationResult | null>;
  /** Settle reserved vs actual cost (and seconds). */
  settleBudget(userId: string, reserved: number, actual: number, seconds: number): Promise<void>;
  /** Initiate the call via Twilio. Throws on network/timeout error. */
  callProvider(toNumber: string): Promise<ProviderResult>;
  /** Record a usage/audit event. */
  recordEvent(userId: string, payload: Record<string, unknown>): Promise<void>;
  /** Compute estimated cost (USD) from reserved seconds. */
  estimateCost(seconds: number): number;
  /** Minimum seconds reserved up front. */
  minReserveSeconds: number;
  /** Hard cap on call seconds. */
  maxCallSeconds: number;
  /** Bounded installed-app version from server configuration (never client). */
  appVersion?: string;
}

// ─── Pure handler ────────────────────────────────────────────────────────────

/**
 * Pure dependency-injected handler for hosted call start.
 * All side effects go through `deps`; no Deno/env/network access here.
 */
export async function handleCallStart(deps: HandlerDeps, req: Request): Promise<Response> {
  const origin = req.headers.get('origin');

  // CORS preflight.
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: json({}, 200, origin).headers });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405, origin);
  }

  // ── Auth ─────────────────────────────────────────────────────────────────
  const jwt = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!jwt) return json({ error: 'unauthorized' }, 401, origin);

  let userId: string | null;
  try {
    userId = await deps.getUser(jwt);
  } catch {
    return json({ error: 'auth_unavailable' }, 503, origin);
  }
  if (!userId) return json({ error: 'unauthorized' }, 401, origin);

  // ── Input validation ─────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400, origin);
  }
  const toNumber = String(body.to ?? '').trim();
  // Basic E.164 validation; reject anything that isn't a plausible phone number.
  if (!/^\+[1-9]\d{6,14}$/.test(toNumber)) return json({ error: 'invalid_number' }, 400, origin);

  // ── AUTHORITATIVE APP-ACCESS CHECK (user context, before ANY side effect) ─
  // Must run before budget reservation, provider config, and the Twilio call.
  // Uses the user's own JWT so the RPC sees auth.uid(). The app version comes
  // from server configuration (deps.appVersion), never from the client body.
  let access: AppAccessResponse | null;
  try {
    access = await deps.getAppAccess(jwt, deps.appVersion);
  } catch {
    access = null;
  }

  // Fail closed: RPC error, unknown status, or a status/boolean combination
  // that the authoritative 0032 RPC cannot emit.
  if (
    !access ||
    typeof access.canUseApp !== 'boolean' ||
    typeof access.status !== 'string' ||
    typeof access.requiresCheckout !== 'boolean'
  ) {
    return json({ error: 'access_unavailable' }, 503, origin);
  }

  const accessDecision = evaluateAppAccessGate(access);
  if (accessDecision.kind === 'invalid') {
    return json({ error: 'access_unavailable' }, 503, origin);
  }

  if (accessDecision.kind === 'deny') {
    const code = accessDecision.status === 'locked' ? 'access_locked' : 'access_denied';
    return json(
      {
        error: code,
        access_status: accessDecision.status,
        requires_checkout: access.requiresCheckout ?? false,
      },
      403,
      origin,
    );
  }

  // ── Budget reservation (atomic; denies free users / exhausted budgets) ───
  let estCost: number;
  let reservation: ReservationResult | null;
  try {
    estCost = deps.estimateCost(deps.minReserveSeconds);
    if (!Number.isFinite(estCost) || estCost < 0) {
      return json({ error: 'usage_unavailable' }, 500, origin);
    }
    reservation = await deps.reserveBudget(userId, estCost);
  } catch {
    return json({ error: 'usage_unavailable' }, 500, origin);
  }
  if (!reservation || typeof reservation.ok !== 'boolean') {
    return json({ error: 'usage_unavailable' }, 500, origin);
  }
  if (!reservation.ok) {
    return json({ error: 'budget_exceeded', reason: reservation.reason ?? 'budget' }, 402, origin);
  }

  const releaseReservation = async (): Promise<void> => {
    try {
      await deps.settleBudget(userId, estCost, 0, 0);
    } catch {
      // Preserve the original bounded response. The atomic reservation remains
      // charged rather than granting untracked provider usage.
    }
  };

  // ── Provider configured? (after access + budget; release reservation) ────
  let providerConfigured: boolean;
  try {
    providerConfigured = deps.isProviderConfigured();
  } catch {
    await releaseReservation();
    return json({ error: 'call_provider_unavailable' }, 503, origin);
  }
  if (!providerConfigured) {
    await releaseReservation();
    return json({ error: 'calling_unconfigured' }, 503, origin);
  }

  // ── Provider call (Twilio). TwiML/voice lives in twilio-voice-webhook. ───
  let upstream: ProviderResult;
  try {
    upstream = await deps.callProvider(toNumber);
  } catch {
    // Network/timeout: release the reservation.
    await releaseReservation();
    return json({ error: 'call_provider_unavailable' }, 502, origin);
  }
  if (!upstream || typeof upstream.ok !== 'boolean') {
    await releaseReservation();
    return json({ error: 'call_provider_unavailable' }, 502, origin);
  }
  if (!upstream.ok) {
    await releaseReservation();
    return json({ error: 'call_failed' }, 502, origin);
  }

  // Safe parse of the provider body; never expose the raw body.
  const call = upstream.body as { sid?: unknown } | null;
  if (!call || typeof call.sid !== 'string') {
    await releaseReservation();
    return json({ error: 'call_failed' }, 502, origin);
  }

  // ── Audit event ──────────────────────────────────────────────────────────
  try {
    await deps.recordEvent(userId, {
      call_sid: call.sid,
      direction: 'outbound',
      status: 'initiated',
      estimated_cost_usd: estCost,
    });
  } catch {
    // The provider has already initiated the call. Return that success so the
    // caller does not retry and create a duplicate billable call. The atomic
    // reservation remains charged when the audit dependency is unavailable.
  }

  return json(
    { call_sid: call.sid, status: 'initiated', max_seconds: deps.maxCallSeconds },
    200,
    origin,
  );
}

// ─── Deno runtime wiring ─────────────────────────────────────────────────────
// This section only executes in the Supabase Edge Functions (Deno) runtime.
// Tests import handleCallStart with mock deps; this block is inert under Node.

const _Deno = (globalThis as Record<string, unknown>).Deno as
  | {
      serve: (fn: (req: Request) => Promise<Response>) => void;
      env: { get(k: string): string | undefined };
    }
  | undefined;

if (_Deno?.serve) {
  const SUPABASE_URL = _Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_ANON_KEY = _Deno.env.get('SUPABASE_ANON_KEY')!;
  const SUPABASE_SERVICE_ROLE_KEY = _Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const TWILIO_ACCOUNT_SID = _Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
  const TWILIO_AUTH_TOKEN = _Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
  const TWILIO_PHONE_NUMBER = _Deno.env.get('TWILIO_PHONE_NUMBER') ?? '';
  const APP_BASE_URL = _Deno.env.get('APP_BASE_URL') ?? '';
  const MIN_RESERVE_SECONDS = 60; // reserve at least 1 minute up front

  // Bounded installed-app version from SERVER configuration only. The client
  // body is never trusted for version/entitlement. Empty -> null (RPC default).
  const INSTALLED_APP_VERSION =
    (_Deno.env.get('INSTALLED_APP_VERSION') ?? '').trim().slice(0, 128) || undefined;

  // Dynamic import so the Node test runner never resolves Deno URLs.
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.46.2');

  const deps: HandlerDeps = {
    async getUser(jwt: string) {
      const c = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data, error } = await c.auth.getUser(jwt);
      if (error || !data?.user) return null;
      return data.user.id;
    },

    async getAppAccess(jwt: string, appVersion?: string) {
      // User-context client: get_app_access uses (select auth.uid()) internally
      // and is granted only to authenticated, so send the caller's own JWT.
      const c = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { authorization: `Bearer ${jwt}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await c.rpc('get_app_access', {
        p_app_version: appVersion || null,
      });
      if (error || !data) return null;
      return data as AppAccessResponse;
    },

    isProviderConfigured() {
      return Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER);
    },

    async reserveBudget(userId: string, estimateUsd: number) {
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await admin.rpc('reserve_call_budget', {
        p_user_id: userId,
        p_estimate_usd: estimateUsd,
      });
      if (error) return null;
      return data as ReservationResult;
    },

    async settleBudget(userId: string, reserved: number, actual: number, seconds: number) {
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await admin.rpc('settle_call_budget', {
        p_user_id: userId,
        p_reserved: reserved,
        p_actual: actual,
        p_seconds: seconds,
      });
      if (error) throw new Error('settlement_failed');
    },

    async callProvider(toNumber: string) {
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
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`,
        {
          method: 'POST',
          headers: {
            authorization: `Basic ${auth}`,
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
        },
      );
      let body: unknown = null;
      if (res.ok) {
        try {
          body = await res.json();
        } catch {
          /* malformed */
        }
      }
      return { ok: res.ok, status: res.status, body };
    },

    async recordEvent(userId: string, payload: Record<string, unknown>) {
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await admin.rpc('record_usage_event', {
        p_kind: 'call',
        p_user_id: userId,
        p_payload: payload,
      });
      if (error) throw new Error('audit_failed');
    },

    estimateCost(seconds: number) {
      return estimateCallCostUsd(seconds);
    },
    minReserveSeconds: MIN_RESERVE_SECONDS,
    maxCallSeconds: MAX_CALL_SECONDS,
    appVersion: INSTALLED_APP_VERSION,
  };

  _Deno.serve(async (req: Request) => handleCallStart(deps, req));
}
