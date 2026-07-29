// @ts-nocheck
// message-complete: metered company-paid AI message completion (DeepSeek V4 Flash).
//
// Free users + BYOK/local routes do NOT come here (the client uses its own
// key/local model). This endpoint is only for company-paid hosted inference:
//   auth -> validate -> app-access (authoritative, user context) -> provider
//   configured? -> rate-limit (fail closed) -> admin? skip budget : reserve
//   budget atomically (monthly + weekly + 5h windows enforced in the RPC)
//   -> call DeepSeek -> settle actual cost -> record event.
// On any failure returns a safe coded error so the client can fall back to a
// cheaper/local/BYOK route.
//
// SECURITY: get_app_access is the authoritative server-side gate. It runs in
// the authenticated user's context (user JWT, not service role) BEFORE any
// rate/budget/provider side effect. Client-provided access/tier/status/version
// is never trusted. Locked/unknown/disabled/malformed/RPC-error access
// responses fail closed with zero billable effects. Prelaunch remains usable
// when the authoritative RPC explicitly returns canUseApp=true.
//
// App admins (app_admins table) bypass quota reservation but ONLY after
// passing the access gate. Admin chat normally uses BYOK keys client-side and
// never reaches this endpoint.

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

/** Provider call result (abstracted over fetch). */
export interface ProviderResult {
  ok: boolean;
  status: number;
  body: unknown;
}

/** Budget reservation result from the RPC. */
export interface ReservationResult {
  ok: boolean;
  reason?: string;
  remaining_usd?: number;
  retry_after?: string;
}

/** All side-effecting dependencies injected into the handler. */
export interface HandlerDeps {
  /** Verify JWT and return userId, or null if invalid. */
  getUser(jwt: string): Promise<string | null>;
  /** Call get_app_access in the authenticated user's context. */
  getAppAccess(jwt: string): Promise<AppAccessResponse | null>;
  /** Check if the provider API key is configured. */
  isProviderConfigured(): boolean;
  /** Check if user is an app admin (service-role RPC). */
  isAppAdmin(userId: string): Promise<boolean>;
  /** Rate-limit check (fail closed). Returns null on RPC error. */
  rateLimitHit(
    userId: string,
    windowStart: string,
    chars: number,
    max: number,
  ): Promise<{ limited: boolean } | null>;
  /** Reserve budget atomically. Returns null on RPC error. */
  reserveBudget(userId: string, estimateUsd: number): Promise<ReservationResult | null>;
  /** Settle reserved vs actual cost. */
  settleBudget(userId: string, reserved: number, actual: number): Promise<void>;
  /** Record a usage/audit event. */
  recordEvent(userId: string, payload: Record<string, unknown>): Promise<void>;
  /** Call the upstream provider. Throws on network/timeout error. */
  callProvider(model: string, messages: unknown[]): Promise<ProviderResult>;
  /** Compute estimated cost from token counts. */
  estimateCost(promptTokens: number, completionTokens: number): number;
  /** Compute actual cost from usage block. */
  actualCost(usage: Record<string, number | undefined>): number;
  /** Maximum allowed prompt characters. */
  maxPromptChars: number;
  /** Provider timeout in ms. */
  providerTimeoutMs: number;
  /** Rate window in ms. */
  rateWindowMs: number;
  /** Max requests per rate window. */
  rateMax: number;
  /** Estimated completion tokens for reservation. */
  estCompletionTokens: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ALLOWED_MODELS = new Set(['deepseek-chat']);
const DEFAULT_MODEL = 'deepseek-chat';
// ─── Helpers ─────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = new Set<string>([
  'tauri://localhost',
  'http://localhost:1420',
  'http://localhost:5173',
  'https://tauri.localhost',
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'tauri://localhost';
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'Origin',
  };
}

function jsonResponse(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'content-type': 'application/json' },
  });
}

function timeoutSignal(ms: number): AbortSignal {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

// ─── Pure handler ────────────────────────────────────────────────────────────

/**
 * Pure dependency-injected handler for message completion.
 * All side effects go through `deps`; no Deno/env/network access here.
 */
export async function handleMessageComplete(deps: HandlerDeps, req: Request): Promise<Response> {
  const origin = req.headers.get('origin');

  // CORS preflight.
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: jsonResponse({}, 200, origin).headers });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405, origin);
  }

  // ── Auth ─────────────────────────────────────────────────────────────────
  const jwt = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!jwt) return jsonResponse({ error: 'unauthorized' }, 401, origin);

  const userId = await deps.getUser(jwt);
  if (!userId) return jsonResponse({ error: 'unauthorized' }, 401, origin);

  // ── Input validation ─────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'bad_request' }, 400, origin);
  }
  const messages = Array.isArray(body.messages) ? body.messages : null;
  const requestedModel = String(body.model ?? DEFAULT_MODEL);
  const model = ALLOWED_MODELS.has(requestedModel) ? requestedModel : DEFAULT_MODEL;
  if (!messages || messages.length === 0) {
    return jsonResponse({ error: 'empty_messages' }, 400, origin);
  }
  const promptChars = JSON.stringify(messages).length;
  if (promptChars > deps.maxPromptChars) {
    return jsonResponse({ error: 'prompt_too_long' }, 413, origin);
  }

  // ── AUTHORITATIVE APP-ACCESS CHECK (user context, before ANY side effect) ─
  // Must run before provider config check, rate limit, budget, provider call,
  // and usage events. Uses the user's own JWT so the RPC sees auth.uid().
  let access: AppAccessResponse | null;
  try {
    access = await deps.getAppAccess(jwt);
  } catch {
    access = null;
  }

  const accessDecision = evaluateAppAccessGate(access);
  if (accessDecision.kind === 'invalid' && accessDecision.status === undefined) {
    return jsonResponse({ error: 'access_unavailable', fallback: 'byok_or_local' }, 503, origin);
  }

  // Preserve this endpoint's stable recognized-denial response while the
  // shared validator prevents contradictory tuples from granting access.
  if (accessDecision.kind !== 'allow') {
    const status = accessDecision.status;
    // Map status to a stable client-facing error code.
    const code =
      status === 'locked'
        ? 'access_locked'
        : status === 'prelaunch'
          ? 'access_prelaunch'
          : 'access_denied';
    return jsonResponse(
      {
        error: code,
        access_status: status,
        requires_checkout: access?.requiresCheckout ?? false,
        checkout_reason: access?.checkoutReason ?? null,
        fallback: 'byok_or_local',
      },
      403,
      origin,
    );
  }

  // ── Provider configured? (after access gate; no leakage before) ──────────
  let providerConfigured: boolean;
  try {
    providerConfigured = deps.isProviderConfigured();
  } catch {
    return jsonResponse({ error: 'usage_unavailable', fallback: 'byok_or_local' }, 503, origin);
  }
  if (!providerConfigured) {
    return jsonResponse(
      { error: 'provider_not_configured', fallback: 'byok_or_local' },
      503,
      origin,
    );
  }

  // ── Admin check (only after access authorization) ────────────────────────
  let appAdmin: boolean;
  try {
    appAdmin = await deps.isAppAdmin(userId);
  } catch {
    return jsonResponse({ error: 'usage_unavailable', fallback: 'byok_or_local' }, 503, origin);
  }

  // ── Rate limit (fail closed) ─────────────────────────────────────────────
  const windowStart = new Date(
    Math.floor(Date.now() / deps.rateWindowMs) * deps.rateWindowMs,
  ).toISOString();
  let rl: { limited: boolean } | null;
  try {
    rl = await deps.rateLimitHit(userId, windowStart, promptChars, deps.rateMax);
  } catch {
    rl = null;
  }
  if (!rl) {
    return jsonResponse({ error: 'usage_unavailable', fallback: 'byok_or_local' }, 503, origin);
  }
  if (rl.limited) return jsonResponse({ error: 'rate_limited' }, 429, origin);

  // ── Budget reservation (admin bypasses; atomic 5h/weekly/monthly) ────────
  const estPromptTokens = Math.ceil(promptChars / 4);
  const estCost = deps.estimateCost(estPromptTokens, deps.estCompletionTokens);
  if (!appAdmin) {
    let reservation: ReservationResult | null;
    try {
      reservation = await deps.reserveBudget(userId, estCost);
    } catch {
      return jsonResponse({ error: 'usage_unavailable', fallback: 'byok_or_local' }, 503, origin);
    }
    if (!reservation) return jsonResponse({ error: 'usage_unavailable' }, 500, origin);
    if (!reservation.ok) {
      try {
        await deps.recordEvent(userId, {
          provider: 'deepseek',
          model,
          status: 'blocked',
          error_code: reservation.reason ?? 'budget',
        });
      } catch {
        // The authoritative denial remains final even if best-effort audit is unavailable.
      }
      const reason = reservation.reason ?? 'budget';
      const isWindow = reason === 'window_5h_exceeded' || reason === 'window_weekly_exceeded';
      return jsonResponse(
        {
          error: isWindow ? 'rate_window_exceeded' : 'budget_exceeded',
          reason,
          retry_after: reservation.retry_after ?? null,
          fallback: 'byok_or_local',
        },
        isWindow ? 429 : 402,
        origin,
      );
    }
  }

  // ── Provider call ────────────────────────────────────────────────────────
  let upstream: ProviderResult;
  try {
    upstream = await deps.callProvider(model, messages);
  } catch {
    // Network/timeout: settle with zero actual cost.
    if (!appAdmin) {
      try {
        await deps.settleBudget(userId, estCost, 0);
      } catch {
        return jsonResponse({ error: 'usage_unavailable', fallback: 'byok_or_local' }, 503, origin);
      }
    }
    return jsonResponse({ error: 'provider_unavailable', fallback: 'byok_or_local' }, 502, origin);
  }

  if (!upstream.ok) {
    if (!appAdmin) {
      try {
        await deps.settleBudget(userId, estCost, 0);
      } catch {
        return jsonResponse({ error: 'usage_unavailable', fallback: 'byok_or_local' }, 503, origin);
      }
    }
    try {
      await deps.recordEvent(userId, {
        provider: 'deepseek',
        model,
        status: 'error',
        error_code: `provider_${upstream.status}`,
      });
    } catch {
      // Settlement is authoritative; audit failure must not make the client retry provider work.
    }
    return jsonResponse({ error: 'provider_error', fallback: 'byok_or_local' }, 502, origin);
  }

  // ── Parse provider response (safe: never expose raw body) ────────────────
  const result = upstream.body as Record<string, unknown> | null;
  if (!result || typeof result !== 'object') {
    if (!appAdmin) {
      try {
        await deps.settleBudget(userId, estCost, 0);
      } catch {
        return jsonResponse({ error: 'usage_unavailable', fallback: 'byok_or_local' }, 503, origin);
      }
    }
    return jsonResponse({ error: 'provider_error', fallback: 'byok_or_local' }, 502, origin);
  }

  // ── Settlement ───────────────────────────────────────────────────────────
  const usage = (result.usage ?? {}) as Record<string, number | undefined>;
  const actualCostVal = deps.actualCost({
    prompt_tokens: usage.prompt_tokens ?? estPromptTokens,
    completion_tokens: usage.completion_tokens ?? deps.estCompletionTokens,
    prompt_cache_hit_tokens: usage.prompt_cache_hit_tokens,
    prompt_cache_miss_tokens: usage.prompt_cache_miss_tokens,
  });
  if (!appAdmin) {
    try {
      await deps.settleBudget(userId, estCost, actualCostVal);
    } catch {
      return jsonResponse({ error: 'usage_unavailable', fallback: 'byok_or_local' }, 503, origin);
    }
  }

  // ── Audit event ──────────────────────────────────────────────────────────
  try {
    await deps.recordEvent(userId, {
      provider: 'deepseek',
      model,
      prompt_tokens: usage.prompt_tokens ?? estPromptTokens,
      completion_tokens: usage.completion_tokens ?? 0,
      estimated_cost_usd: appAdmin ? 0 : estCost,
      actual_cost_usd: appAdmin ? 0 : actualCostVal,
      status: 'ok',
    });
  } catch {
    // Provider work is already settled; audit failure must not trigger duplicate inference.
  }

  // ── Success response (safe: only message + usage, no raw provider data) ──
  const choices = Array.isArray(result.choices) ? result.choices : [];
  const message = choices[0]?.message ?? null;
  return jsonResponse({ message, usage }, 200, origin);
}

// ─── Deno runtime wiring ─────────────────────────────────────────────────────
// This section only executes in the Supabase Edge Functions (Deno) runtime.
// Tests import handleMessageComplete with mock deps; this block is inert.

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
  const DEEPSEEK_API_KEY = _Deno.env.get('DEEPSEEK_API_KEY') ?? '';
  const APP_VERSION = _Deno.env.get('APP_VERSION') ?? '';
  const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
  const PROVIDER_TIMEOUT_MS = 60_000;
  const RATE_WINDOW_MS = 60_000;
  const RATE_MAX = 60;
  const EST_COMPLETION_TOKENS = 800;
  const MAX_PROMPT_CHARS = 100_000;

  // DeepSeek V4 Flash pricing.
  const IN_MISS = 0.14 / 1_000_000;
  const IN_HIT = 0.0028 / 1_000_000;
  const OUT = 0.28 / 1_000_000;

  function estimateCost(promptTokens: number, completionTokens: number): number {
    return Math.max(0, promptTokens) * IN_MISS + Math.max(0, completionTokens) * OUT;
  }

  function actualCost(u: Record<string, number | undefined>): number {
    const prompt = Math.max(0, u.prompt_tokens ?? 0);
    const completion = Math.max(0, u.completion_tokens ?? 0);
    const hit = Math.max(0, u.prompt_cache_hit_tokens ?? 0);
    const miss = Math.max(0, u.prompt_cache_miss_tokens ?? Math.max(0, prompt - hit));
    return miss * IN_MISS + hit * IN_HIT + completion * OUT;
  }

  // Dynamic import so Node test runner never resolves Deno URLs.
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.46.2');

  const deps: HandlerDeps = {
    async getUser(jwt: string) {
      const c = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data, error } = await c.auth.getUser(jwt);
      if (error || !data?.user) return null;
      return data.user.id;
    },

    async getAppAccess(jwt: string) {
      // User-context client: the RPC uses auth.uid() internally.
      const c = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { authorization: `Bearer ${jwt}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await c.rpc('get_app_access', {
        p_app_version: APP_VERSION || null,
      });
      if (error || !data) return null;
      return data as AppAccessResponse;
    },

    isProviderConfigured() {
      return Boolean(DEEPSEEK_API_KEY);
    },

    async isAppAdmin(userId: string) {
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await admin.rpc('is_app_admin', { p_user_id: userId });
      if (error || typeof data !== 'boolean') throw new Error('admin_lookup_failed');
      return data;
    },

    async rateLimitHit(userId: string, windowStart: string, chars: number, max: number) {
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await admin.rpc('message_rate_limit_hit', {
        p_user_id: userId,
        p_window_start: windowStart,
        p_chars: chars,
        p_max_requests: max,
      });
      if (
        error ||
        !data ||
        typeof data !== 'object' ||
        typeof (data as { limited?: unknown }).limited !== 'boolean'
      ) {
        return null;
      }
      return data as { limited: boolean };
    },

    async reserveBudget(userId: string, estimateUsd: number) {
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await admin.rpc('reserve_message_budget', {
        p_user_id: userId,
        p_estimate_usd: estimateUsd,
      });
      if (
        error ||
        !data ||
        typeof data !== 'object' ||
        typeof (data as { ok?: unknown }).ok !== 'boolean'
      ) {
        return null;
      }
      return data as ReservationResult;
    },

    async settleBudget(userId: string, reserved: number, actual: number) {
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await admin.rpc('settle_message_budget', {
        p_user_id: userId,
        p_reserved: reserved,
        p_actual: actual,
      });
      if (error) throw new Error('budget_settlement_failed');
    },

    async recordEvent(userId: string, payload: Record<string, unknown>) {
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await admin.rpc('record_usage_event', {
        p_kind: 'message',
        p_user_id: userId,
        p_payload: payload,
      });
      if (error) throw new Error('usage_audit_failed');
    },

    async callProvider(model: string, messages: unknown[]) {
      const res = await fetch(DEEPSEEK_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${DEEPSEEK_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model, messages, stream: false }),
        signal: timeoutSignal(PROVIDER_TIMEOUT_MS),
      });
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

    estimateCost,
    actualCost,
    maxPromptChars: MAX_PROMPT_CHARS,
    providerTimeoutMs: PROVIDER_TIMEOUT_MS,
    rateWindowMs: RATE_WINDOW_MS,
    rateMax: RATE_MAX,
    estCompletionTokens: EST_COMPLETION_TOKENS,
  };

  _Deno.serve(async (req: Request) => handleMessageComplete(deps, req));
}
