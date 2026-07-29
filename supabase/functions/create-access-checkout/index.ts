// @ts-nocheck
// create-access-checkout: starts a Stripe Checkout for the dedicated $20/month
// VibeSpace Access entitlement. App access is SEPARATE from feature tier: this
// function never updates profiles.tier and never grants access itself. The
// Stripe webhook remains authoritative for entitlement state.
//
// Environment contract (required Supabase Edge Function secrets):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//   STRIPE_SECRET_KEY, STRIPE_APP_ACCESS_PRICE_ID (the dedicated $20 price;
//   server-side only), and APP_BASE_URL (optional; default https://vibespaceos.com,
//   the sole basis for the success/cancel URLs). Deploy with verify_jwt = true,
//   but the handler ALSO validates the user server-side via auth.getUser(jwt).
//
// Security contract:
//   - POST only; OPTIONS preflight answered with the shared restrictive CORS.
//   - Identity comes ONLY from the validated Supabase JWT. The request body is
//     never read: client price/amount/customer/user/redirect/idempotency are
//     never accepted. All billing inputs are server config.
//   - Missing STRIPE_SECRET_KEY or STRIPE_APP_ACCESS_PRICE_ID -> 500.
//   - Reuses profiles.stripe_customer_id; otherwise creates a customer with
//     bounded metadata { supabase_user_id } and an account-stable provider
//     idempotency key, then maps it back to the profile.
//   - Rejects a duplicate checkout (409) when the authoritative entitlement
//     already has a non-terminal Stripe subscription. A local app trial has no
//     subscription and remains eligible to convert.
//   - Reserves a durable, server-generated checkout attempt through service-role
//     RPCs. Concurrent/logical retries reuse one attempt-scoped Stripe
//     idempotency key; expired/abandoned attempts receive a new key and Session.
//     Reused Sessions are retrieved server-side; completed Sessions fail closed
//     pending a newer webhook-reconciled entitlement snapshot.
//   - Completes the attempt and its minimal checkout_created audit atomically
//     before returning the URL. Checkout never updates entitlement or feature
//     tier state; webhook reconciliation remains the only activation authority.
//   - Errors are generic codes; upstream Stripe/Supabase messages and secrets are
//     never returned. CORS/content-type/status come from the shared json() helper.
//
// Confirmed app_access schema contract (migration 0032_app_access; SQL owned by
// the concurrent schema lane — read-only here, not edited):
//   app_access_entitlements(user_id PK, status text CHECK(... 'active',
//     'trialing','cancel_at_period_end','grace','locked','past_due', ...),
//     cancel_at_period_end boolean, stripe_customer_id, stripe_subscription_id,
//     current_period_end, ...)
//   app_access_events(id uuid PK, user_id, event_type text CHECK(...
//     'checkout_created', ...), provider_event_id text UNIQUE [NULLs allowed],
//     stripe_subscription_id, status, reason, occurred_at, created_at)
//
// Documented integration assumptions:
//   * The duplicate-access rule follows provider identity, not the derived app
//     status: trialing-without-subscription is the local trial conversion path;
//     a non-terminal provider subscription blocks duplicate billing.
//   * Migration 0035 atomically records checkout_created with the namespaced
//     token 'access_checkout_attempt:<attempt_id>:<session_id>'. Its random,
//     server-generated attempt id cannot collide across accounts or with Stripe
//     webhook 'evt_...' ids.
//   * Launch gating (prelaunch) is enforced by the authoritative get_app_access()
//     RPC/client; this handler enforces the duplicate-subscription guard.
//
// Tests import `handleAccessCheckout` with injected deps and never touch the
// network. The URL SDK imports and Deno.serve live behind `import.meta.main`
// (as dynamic imports) so importing this module for tests performs no fetch.

import { json } from '../_shared/voice.ts';

const TERMINAL_PROVIDER_STATUSES = new Set(['canceled', 'unpaid', 'incomplete_expired']);
export const ACCESS_ENTITLEMENT_SELECT =
  'status,cancel_at_period_end,stripe_subscription_id,provider_status,provider_status_updated_at';

function boundedConfigString(value, max) {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value
  );
}

function credentialFreeHttpsUrl(value) {
  if (!boundedConfigString(value, 2048)) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// Stripe Checkout currently returns hosted session URLs only from its dedicated
// checkout host. Keep this stricter than the generic redirect-config parser so
// an unexpected upstream value can never become a desktop navigation target.
export function isSafeCheckoutUrl(value) {
  const parsed = credentialFreeHttpsUrl(value);
  return (
    parsed !== null &&
    (parsed.port === '' || parsed.port === '443') &&
    parsed.hostname.toLowerCase() === 'checkout.stripe.com'
  );
}

function resolveAppBaseUrl(value) {
  const parsed = credentialFreeHttpsUrl(value || 'https://vibespaceos.com');
  if (!parsed || parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
  return parsed.origin;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function parseAttempt(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.outcome === 'duplicate_access') return { outcome: 'duplicate_access' };
  if (value.outcome === 'checkout_pending') return { outcome: 'checkout_pending' };
  if (value.outcome !== 'reserved' && value.outcome !== 'session_created') return null;
  if (!UUID_RE.test(value.attemptId)) return null;
  const expectedKey = 'access_checkout_attempt:' + value.attemptId;
  if (value.idempotencyKey !== expectedKey) return null;
  if (!boundedConfigString(value.createdAt, 64) || !Number.isFinite(Date.parse(value.createdAt))) {
    return null;
  }
  if (!boundedConfigString(value.expiresAt, 64) || !Number.isFinite(Date.parse(value.expiresAt))) {
    return null;
  }
  if (value.outcome === 'session_created') {
    if (!boundedConfigString(value.sessionId, 128) || !isSafeCheckoutUrl(value.url)) {
      return null;
    }
  } else if (value.sessionId !== null || value.url !== null) {
    return null;
  }
  return value;
}

// A local app trial has no Stripe subscription and must be allowed to convert.
// Only a real, non-terminal Stripe subscription blocks a duplicate checkout.
// Missing provider status fails safe when a subscription id is already present.
export function hasBlockingAccess(entitlement) {
  if (!entitlement || !entitlement.stripe_subscription_id) return false;
  return !TERMINAL_PROVIDER_STATUSES.has(entitlement.provider_status);
}

function terminalSubscriptionSupersedesAttempt(entitlement, attempt) {
  return Boolean(
    entitlement &&
    entitlement.stripe_subscription_id &&
    TERMINAL_PROVIDER_STATUSES.has(entitlement.provider_status) &&
    boundedConfigString(entitlement.provider_status_updated_at, 64) &&
    Number.isFinite(Date.parse(entitlement.provider_status_updated_at)) &&
    Date.parse(entitlement.provider_status_updated_at) >= Date.parse(attempt.createdAt),
  );
}

// Dependency contract (all injected so tests are network-free):
//   deps.config: { stripeSecretKey, appAccessPriceId, appBaseUrl }
//   deps.getUser(jwt) -> { user: { id, email } | null, error }
//   deps.getProfile(userId) -> { stripe_customer_id } | null
//   deps.setProfileCustomer(userId, customerId) -> void   (maps customer only;
//                                                          never touches tier)
//   deps.getAccessEntitlement(userId) ->
//     { status, stripe_subscription_id, provider_status,
//       provider_status_updated_at } | null
//   deps.reserveCheckoutAttempt(userId) -> a service-role RPC reservation or
//     reusable Session projection with a server-generated attempt/key/expiry.
//   deps.completeCheckoutAttempt(userId, attemptId, session) -> atomically
//     persists the verified Session and its idempotent checkout_created audit.
//   deps.closeCheckoutAttempt(userId, attemptId, state) -> service-role-only
//     terminal transition; never mutates entitlement.
//   deps.stripe.customers.create(params) -> { id }
//   deps.stripe.checkout.sessions.create(params, { idempotencyKey }) -> { id, url }
//   deps.stripe.checkout.sessions.retrieve(sessionId) -> server-authoritative
//     { id, status } where status is open, complete, or expired.
export async function handleAccessCheckout(req, deps) {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: json({}, 200, origin).headers });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405, origin);
  }

  // Server-side authentication: validate the bearer JWT against Supabase auth.
  const jwt = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!jwt) return json({ error: 'unauthorized' }, 401, origin);
  let authResult;
  try {
    authResult = await deps.getUser(jwt);
  } catch {
    return json({ error: 'auth_unavailable' }, 503, origin);
  }
  const user = authResult && authResult.user;
  if (!user || authResult.error) return json({ error: 'unauthorized' }, 401, origin);

  const config = deps.config || {};
  const appBaseUrl = resolveAppBaseUrl(config.appBaseUrl);
  if (
    !boundedConfigString(config.stripeSecretKey, 512) ||
    !boundedConfigString(config.appAccessPriceId, 255) ||
    !config.appAccessPriceId.startsWith('price_') ||
    !appBaseUrl
  ) {
    return json({ error: 'billing_unconfigured' }, 500, origin);
  }

  // NOTE: the request body is deliberately never read. No billing input
  // (price/amount/customer/user/redirect/idempotency) is client-controlled.

  // Authoritative duplicate-access check against the separate app-access state.
  let entitlement;
  try {
    entitlement = await deps.getAccessEntitlement(user.id);
  } catch {
    return json({ error: 'checkout_failed' }, 502, origin);
  }
  if (hasBlockingAccess(entitlement)) {
    return json({ error: 'duplicate_access' }, 409, origin);
  }

  let attempt = null;
  for (let pass = 0; pass < 2; pass += 1) {
    try {
      attempt = parseAttempt(await deps.reserveCheckoutAttempt(user.id));
    } catch {
      return json({ error: 'checkout_failed' }, 502, origin);
    }
    if (!attempt) return json({ error: 'checkout_failed' }, 502, origin);
    if (attempt.outcome === 'duplicate_access') {
      return json({ error: 'duplicate_access' }, 409, origin);
    }
    if (attempt.outcome === 'checkout_pending') {
      return json({ error: 'checkout_pending' }, 409, origin);
    }
    if (attempt.outcome === 'reserved') break;

    let existingSession;
    try {
      existingSession = await deps.stripe.checkout.sessions.retrieve(attempt.sessionId);
      if (
        !existingSession ||
        existingSession.id !== attempt.sessionId ||
        !['open', 'complete', 'expired'].includes(existingSession.status)
      ) {
        throw new Error('invalid Stripe Checkout session state');
      }
    } catch {
      return json({ error: 'checkout_failed' }, 502, origin);
    }
    if (existingSession.status === 'open') {
      return json({ url: attempt.url }, 200, origin);
    }

    const terminalState = existingSession.status === 'complete' ? 'completed' : 'expired';
    try {
      await deps.closeCheckoutAttempt(user.id, attempt.attemptId, terminalState);
    } catch {
      return json({ error: 'checkout_failed' }, 502, origin);
    }
    if (
      existingSession.status === 'complete' &&
      !terminalSubscriptionSupersedesAttempt(entitlement, attempt)
    ) {
      return json({ error: 'checkout_pending' }, 409, origin);
    }
  }
  if (!attempt || attempt.outcome !== 'reserved') {
    return json({ error: 'checkout_failed' }, 502, origin);
  }
  const customerIdempotencyKey = 'access_customer:' + user.id;

  // Resolve the Stripe customer (reuse mapped, else create + map) and create the
  // subscription Checkout Session. Any upstream Stripe failure -> generic 502;
  // the upstream message is intentionally not surfaced (no secret leakage).
  let customerId = null;
  let session;
  try {
    const profile = await deps.getProfile(user.id);
    customerId = profile && profile.stripe_customer_id ? profile.stripe_customer_id : null;
    if (!customerId) {
      const customer = await deps.stripe.customers.create(
        {
          email: user.email ?? undefined,
          metadata: { supabase_user_id: user.id },
        },
        { idempotencyKey: customerIdempotencyKey },
      );
      customerId = customer.id;
      await deps.setProfileCustomer(user.id, customerId);
    }
    session = await deps.stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: config.appAccessPriceId, quantity: 1 }],
        success_url: appBaseUrl + '/billing/access/success',
        cancel_url: appBaseUrl + '/billing/access/cancel',
        expires_at: Math.floor(Date.parse(attempt.expiresAt) / 1000),
        client_reference_id: user.id,
        metadata: {
          supabase_user_id: user.id,
          access_product: 'vibespace_access',
          checkout_attempt_id: attempt.attemptId,
        },
      },
      { idempotencyKey: attempt.idempotencyKey },
    );
    if (
      !boundedConfigString(session && session.id, 128) ||
      !isSafeCheckoutUrl(session && session.url)
    ) {
      throw new Error('invalid Stripe Checkout session');
    }
  } catch (_err) {
    return json({ error: 'checkout_failed' }, 502, origin);
  }

  // The service-role RPC atomically stores the Session and its idempotent audit
  // event. If this durable boundary is unavailable, fail closed: the reserved
  // attempt remains reusable with the same Stripe key until its bounded lease
  // expires, so a retry can recover without a duplicate Session and no account
  // remains permanently wedged.
  let completed;
  try {
    completed = parseAttempt(
      await deps.completeCheckoutAttempt(user.id, attempt.attemptId, {
        id: session.id,
        url: session.url,
      }),
    );
  } catch {
    return json({ error: 'checkout_failed' }, 502, origin);
  }
  if (
    !completed ||
    completed.outcome !== 'session_created' ||
    completed.attemptId !== attempt.attemptId ||
    completed.sessionId !== session.id ||
    completed.url !== session.url
  ) {
    return json({ error: 'checkout_failed' }, 502, origin);
  }

  return json({ url: completed.url }, 200, origin);
}

// Production wiring (Supabase Edge Function entrypoint). Dynamic imports keep
// the SDK fetch out of test runs: import.meta.main is false when this module is
// imported (e.g. by index.test.ts), true only when executed as the entrypoint.
if (import.meta.main) {
  const [supabaseMod, stripeMod] = await Promise.all([
    import('https://esm.sh/@supabase/supabase-js@2.46.2'),
    import('https://esm.sh/stripe@14.21.0?target=deno'),
  ]);
  const createClient = supabaseMod.createClient;
  const Stripe = stripeMod.default;

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
  const STRIPE_APP_ACCESS_PRICE_ID = Deno.env.get('STRIPE_APP_ACCESS_PRICE_ID') ?? '';
  const APP_BASE_URL = Deno.env.get('APP_BASE_URL') ?? 'https://vibespaceos.com';

  function admin() {
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  const deps = {
    config: {
      stripeSecretKey: STRIPE_SECRET_KEY,
      appAccessPriceId: STRIPE_APP_ACCESS_PRICE_ID,
      appBaseUrl: APP_BASE_URL,
    },
    async getUser(jwt) {
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data, error } = await userClient.auth.getUser(jwt);
      return { user: (data && data.user) || null, error };
    },
    async getProfile(userId) {
      const { data, error } = await admin()
        .from('profiles')
        .select('stripe_customer_id')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },
    async setProfileCustomer(userId, customerId) {
      const { error } = await admin()
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId);
      if (error) throw error;
    },
    async getAccessEntitlement(userId) {
      const { data, error } = await admin()
        .from('app_access_entitlements')
        .select(ACCESS_ENTITLEMENT_SELECT)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },
    async reserveCheckoutAttempt(userId) {
      const { data, error } = await admin().rpc('app_access_reserve_checkout_attempt', {
        p_user_id: userId,
      });
      if (error) throw error;
      return data;
    },
    async completeCheckoutAttempt(userId, attemptId, session) {
      const { data, error } = await admin().rpc('app_access_complete_checkout_attempt', {
        p_user_id: userId,
        p_attempt_id: attemptId,
        p_stripe_session_id: session.id,
        p_stripe_session_url: session.url,
      });
      if (error) throw error;
      return data;
    },
    async closeCheckoutAttempt(userId, attemptId, state) {
      const { error } = await admin().rpc('app_access_close_checkout_attempt', {
        p_user_id: userId,
        p_attempt_id: attemptId,
        p_state: state,
      });
      if (error) throw error;
    },
    stripe: new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2024-12-18.acacia',
      httpClient: Stripe.createFetchHttpClient(),
    }),
    now() {
      return new Date();
    },
  };

  Deno.serve((req) => handleAccessCheckout(req, deps));
}
