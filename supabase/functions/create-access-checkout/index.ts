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
//     bounded metadata { supabase_user_id } and maps it back to the profile.
//   - Rejects a duplicate checkout (409) when the authoritative entitlement
//     already has a non-terminal Stripe subscription. A local app trial has no
//     subscription and remains eligible to convert.
//   - Creates a real Stripe subscription Checkout Session using a server-derived
//     Stripe idempotency key (access_checkout:<user_id>) so concurrent/repeated
//     attempts yield a single session. Customer creation is independently
//     idempotent via access_customer:<user_id>.
//   - Records a minimal, idempotent app_access_events 'checkout_created' audit
//     row ONLY after the session is created. The row uses the schema's columns
//     and a namespaced per-session token in provider_event_id so the table's
//     unique(provider_event_id) constraint dedupes concurrent inserts. A
//     conflict/error on the audit row never blocks the created session and never
//     grants access.
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
//   * provider_event_id carries a namespaced per-session token
//     ('access_checkout:<user_id>:<session_id>') for the server-generated
//     checkout_created row, reusing the unique constraint for record-level
//     idempotency. The 'access_checkout:' prefix cannot collide with Stripe
//     webhook 'evt_...' ids. This is a narrow, documented extension of the
//     column's "NULL for server events" convention.
//   * Launch gating (prelaunch) is enforced by the authoritative get_app_access()
//     RPC/client; this handler enforces the duplicate-subscription guard.
//
// Tests import `handleAccessCheckout` with injected deps and never touch the
// network. The URL SDK imports and Deno.serve live behind `import.meta.main`
// (as dynamic imports) so importing this module for tests performs no fetch.

import { json } from '../_shared/voice.ts';

const TERMINAL_PROVIDER_STATUSES = new Set(['canceled', 'unpaid', 'incomplete_expired']);

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

// A local app trial has no Stripe subscription and must be allowed to convert.
// Only a real, non-terminal Stripe subscription blocks a duplicate checkout.
// Missing provider status fails safe when a subscription id is already present.
export function hasBlockingAccess(entitlement) {
  if (!entitlement || !entitlement.stripe_subscription_id) return false;
  return !TERMINAL_PROVIDER_STATUSES.has(entitlement.provider_status);
}

// Dependency contract (all injected so tests are network-free):
//   deps.config: { stripeSecretKey, appAccessPriceId, appBaseUrl }
//   deps.getUser(jwt) -> { user: { id, email } | null, error }
//   deps.getProfile(userId) -> { stripe_customer_id } | null
//   deps.setProfileCustomer(userId, customerId) -> void   (maps customer only;
//                                                          never touches tier)
//   deps.getAccessEntitlement(userId) ->
//     { status, stripe_subscription_id, provider_status } | null
//   deps.recordCheckoutEvent(event) -> { ok } | { ok:false, reason }  (resolves;
//     does not reject). `event` matches the app_access_events columns:
//     { user_id, event_type, provider_event_id, stripe_subscription_id, status,
//       reason, occurred_at }.
//   deps.stripe.customers.create(params) -> { id }
//   deps.stripe.checkout.sessions.create(params, { idempotencyKey }) -> { id, url }
//   deps.now() -> Date
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

  const stripeIdempotencyKey = 'access_checkout:' + user.id;
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
        client_reference_id: user.id,
        metadata: { supabase_user_id: user.id, access_product: 'vibespace_access' },
      },
      { idempotencyKey: stripeIdempotencyKey },
    );
    if (
      !boundedConfigString(session && session.id, 255) ||
      !isSafeCheckoutUrl(session && session.url)
    ) {
      throw new Error('invalid Stripe Checkout session');
    }
  } catch (_err) {
    return json({ error: 'checkout_failed' }, 502, origin);
  }

  // Minimal idempotent audit event, recorded ONLY after the session exists, using
  // the app_access_events schema columns. The provider_event_id token is stable
  // per session (concurrent attempts share the session via the Stripe idempotency
  // key) so the unique constraint dedupes concurrent inserts; a new session later
  // gets a fresh token. The audit is non-authoritative, so its result never
  // blocks the created session and never grants access.
  try {
    await deps.recordCheckoutEvent({
      user_id: user.id,
      event_type: 'checkout_created',
      provider_event_id: stripeIdempotencyKey + ':' + session.id,
      stripe_subscription_id: null,
      status: (entitlement && entitlement.status) || null,
      reason: 'checkout_created',
      occurred_at: deps.now().toISOString(),
    });
  } catch {
    // The session already exists and the audit trail is non-authoritative.
    // A transient audit write failure must not hide the usable checkout URL.
  }

  return json({ url: session.url }, 200, origin);
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
        .select('status, cancel_at_period_end, stripe_subscription_id, provider_status')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },
    async recordCheckoutEvent(event) {
      const { error } = await admin().from('app_access_events').insert(event);
      if (error) {
        // 23505 = unique_violation on provider_event_id (expected concurrent dup).
        return error.code === '23505'
          ? { ok: false, reason: 'conflict' }
          : { ok: false, reason: 'error' };
      }
      return { ok: true };
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
