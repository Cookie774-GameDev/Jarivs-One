// @ts-nocheck
// create-access-portal: returns a Stripe Billing Portal URL for the authenticated
// user's VibeSpace Access billing. The portal lets the user manage app access,
// feature subscription, payment method, invoices, cancellation and renewal
// (ACCESS-186..192). App access is SEPARATE from feature tier; this function is
// strictly read-only with respect to VibeSpace state: it never creates a customer
// and never updates profiles.tier, entitlement, subscription or payment state, and
// opening the portal does not change access. The Stripe webhook remains
// authoritative for entitlement state.
//
// Environment contract (required Supabase Edge Function secrets):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//   STRIPE_SECRET_KEY (server-side only), and APP_BASE_URL (optional; default
//   https://vibespaceos.com, the sole basis for the portal return URL). Deploy
//   with verify_jwt = true, but the handler ALSO validates the user server-side
//   via auth.getUser(jwt).
//
// Security contract:
//   - POST only; OPTIONS preflight answered with the shared restrictive CORS.
//   - Identity comes ONLY from the validated Supabase JWT. The request body is
//     never read: client customer/price/plan/product/user/return URL are never
//     accepted. All billing inputs are server config.
//   - API keys are not user bearer JWTs: any bearer value that does not validate
//     as a user JWT (anon key, service key, Stripe key) is rejected as 401 and
//     never reaches the customer lookup or Stripe.
//   - Missing STRIPE_SECRET_KEY -> 500 billing_unconfigured.
//   - Resolves the EXISTING server-owned profiles.stripe_customer_id for the
//     authenticated user; never creates a customer. No customer -> 404 no_customer.
//   - Uses a server-configured allowlisted return URL (APP_BASE_URL + '/account');
//     the client never controls the return URL.
//   - Returns only a bounded real HTTPS Stripe portal URL: the value returned by
//     Stripe is validated (https: and a stripe.com host) before being returned.
//   - Errors are generic codes; upstream Stripe/Supabase messages and secrets are
//     never returned. CORS/content-type/status come from the shared json() helper.
//
// Tests import `handleAccessPortal` and `isSafePortalUrl` with injected deps and
// never touch the network. The SDK imports and Deno.serve live behind
// `import.meta.main` (as dynamic imports) so importing this module for tests
// performs no fetch.

import { json, preflight } from '../_shared/voice.ts';

const MAX_URL_LENGTH = 2048;

function boundedConfigString(value, max) {
  return (
    typeof value === 'string' && value.length >= 1 && value.length <= max && value.trim() === value
  );
}

function resolveAppBaseUrl(value) {
  if (!boundedConfigString(value, MAX_URL_LENGTH)) return null;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    (parsed.pathname !== '' && parsed.pathname !== '/') ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    return null;
  }
  return parsed.origin;
}

function isStripeCustomerId(value) {
  return boundedConfigString(value, 255) && /^cus_[A-Za-z0-9_]+$/.test(value);
}

// Bound the value returned by Stripe to a real HTTPS Stripe portal URL. Rejects
// non-strings, malformed URLs, non-HTTPS schemes, and any host that is not
// stripe.com or a subdomain (defense-in-depth: the value still arrives over an
// authenticated server-side Stripe call, but we never forward an unexpected URL).
export function isSafePortalUrl(value) {
  if (!boundedConfigString(value, MAX_URL_LENGTH)) return false;
  let parsed;
  try {
    parsed = new URL(value);
  } catch (_err) {
    return false;
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    (parsed.port !== '' && parsed.port !== '443')
  ) {
    return false;
  }
  return parsed.hostname.toLowerCase() === 'billing.stripe.com';
}

// Dependency contract (all injected so tests are network-free):
//   deps.config: { stripeSecretKey, appBaseUrl }
//   deps.getUser(jwt) -> { user: { id, email } | null, error }
//   deps.getProfile(userId) -> { stripe_customer_id } | null   (read-only)
//   deps.stripe.billingPortal.sessions.create({ customer, return_url }) -> { url }
// The handler uses ONLY these read/create-portal capabilities. It never creates a
// customer and never mutates profiles.tier, entitlement, subscription or payment
// state.
export async function handleAccessPortal(req, deps) {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return preflight(origin);
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405, origin);
  }

  // Server-side authentication: validate the bearer JWT against Supabase auth.
  // Any bearer value that is not a valid user JWT (e.g. an API key) yields no
  // user and is rejected; it never reaches the customer lookup or Stripe.
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
  const appBaseUrl = resolveAppBaseUrl(
    config.appBaseUrl === undefined ? 'https://vibespaceos.com' : config.appBaseUrl,
  );
  if (!boundedConfigString(config.stripeSecretKey, 512) || !appBaseUrl) {
    return json({ error: 'billing_unconfigured' }, 500, origin);
  }

  // NOTE: the request body is deliberately never read. No billing input
  // (customer/price/plan/product/user/return URL) is client-controlled.

  const returnUrl = appBaseUrl + '/account';

  // Resolve the EXISTING server-owned Stripe customer mapping for the
  // authenticated user. The portal manages an existing relationship; this handler
  // never creates a customer and never mutates any profile/entitlement/
  // subscription or payment state. An upstream profile failure -> generic 502.
  let customerId = null;
  try {
    const profile = await deps.getProfile(user.id);
    customerId = profile && profile.stripe_customer_id ? profile.stripe_customer_id : null;
  } catch (_err) {
    return json({ error: 'portal_failed' }, 502, origin);
  }
  if (!customerId) return json({ error: 'no_customer' }, 404, origin);
  if (!isStripeCustomerId(customerId)) return json({ error: 'portal_failed' }, 502, origin);

  // Create the billing portal session with the server-configured return URL. Any
  // upstream Stripe failure -> generic 502; the upstream message is intentionally
  // not surfaced (no secret leakage).
  let portal;
  try {
    portal = await deps.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  } catch (_err) {
    return json({ error: 'portal_failed' }, 502, origin);
  }

  // Return only a bounded real HTTPS Stripe portal URL.
  const url = portal && portal.url;
  if (!isSafePortalUrl(url)) return json({ error: 'portal_failed' }, 502, origin);

  return json({ url }, 200, origin);
}

// Production wiring (Supabase Edge Function entrypoint). Dynamic imports keep the
// SDK fetch out of test runs: import.meta.main is false when this module is
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
  const APP_BASE_URL = Deno.env.get('APP_BASE_URL') ?? 'https://vibespaceos.com';

  function admin() {
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  const deps = {
    config: {
      stripeSecretKey: STRIPE_SECRET_KEY,
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
    stripe: new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2024-12-18.acacia',
      httpClient: Stripe.createFetchHttpClient(),
    }),
  };

  Deno.serve((req) => handleAccessPortal(req, deps));
}
