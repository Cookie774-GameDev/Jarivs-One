// @ts-nocheck
// index.test.ts - focused, network-free tests for the create-access-portal
// Supabase Edge Function (authenticated Stripe Billing Portal for VibeSpace
// Access).
//
// These tests exercise the exported `handleAccessPortal(req, deps)` handler and
// the pure `isSafePortalUrl(value)` guard with fully injected/mocked
// dependencies, so they NEVER touch the network and never call live
// Stripe/Supabase. Production wiring (SDK imports + Deno.serve) lives behind an
// `import.meta.main` guard in index.ts and is not loaded here.
//
// The portal is strictly read-only with respect to VibeSpace state: it resolves
// the authenticated user's existing server-owned Stripe customer mapping and
// returns a bounded real HTTPS Stripe portal URL. It never creates a customer
// and never mutates profiles.tier, entitlement, subscription or payment state.
//
// Intended run (when Deno is installed):
//   deno test --allow-env supabase/functions/create-access-portal/index.test.ts
// The suite also runs under a Node >=23 type-stripping harness (no Deno needed)
// because it imports only local modules and uses the global URL/Request/Response.

import { test as __nodeTest } from 'node:test';
import { handleAccessPortal, isSafePortalUrl } from './index.ts';

if (typeof globalThis.Deno === 'undefined') {
  globalThis.Deno = {
    test(name, fn) {
      return __nodeTest(name, fn);
    },
  };
}

// ---------------------------------------------------------------------------
// Minimal assertion helpers (self-contained; no external test deps).
// ---------------------------------------------------------------------------
class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AssertionError';
  }
}

function assert(cond, msg) {
  if (!cond) throw new AssertionError(msg || 'expected condition to be true');
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

function assertEquals(actual, expected, msg) {
  if (!deepEqual(actual, expected)) {
    throw new AssertionError(
      (msg ? msg + ': ' : '') +
        'expected ' +
        JSON.stringify(expected) +
        ' but got ' +
        JSON.stringify(actual),
    );
  }
}

function assertStringIncludes(haystack, needle, msg) {
  if (typeof haystack !== 'string' || haystack.indexOf(needle) === -1) {
    throw new AssertionError(
      (msg ? msg + ': ' : '') +
        'expected string to include ' +
        JSON.stringify(needle) +
        ' but got ' +
        JSON.stringify(haystack),
    );
  }
}

function assertNotIncludes(haystack, needle, msg) {
  if (typeof haystack === 'string' && haystack.indexOf(needle) !== -1) {
    throw new AssertionError(
      (msg ? msg + ': ' : '') + 'expected string NOT to include ' + JSON.stringify(needle),
    );
  }
}

// ---------------------------------------------------------------------------
// Mock dependency factory. Records every call so tests can assert behavior and
// ordering. No network, no real SDKs. The portal handler must ONLY read the
// profile and create a billing portal session; every mutation capability is a
// spy that must remain at zero.
// ---------------------------------------------------------------------------
function makeDeps(opts) {
  opts = opts || {};
  const calls = {
    getUser: [],
    getProfile: [],
    billingPortalCreate: [],
    order: [],
    // Mutation capabilities the portal handler must NEVER use.
    entitlementWrites: 0,
    tierWrites: 0,
    customerCreates: 0,
    profileCustomerWrites: 0,
    subscriptionWrites: 0,
    paymentMethodWrites: 0,
    eventWrites: 0,
  };

  const config = Object.assign(
    {
      stripeSecretKey: 'sk_test_unit',
      appBaseUrl: 'https://app.example.com',
    },
    opts.config || {},
  );

  const deps = {
    config,
    async getUser(jwt) {
      calls.getUser.push(jwt);
      if (opts.throwGetUser) throw new Error('auth backend secret=sk_live_LEAK');
      if (opts.getUser) return opts.getUser(jwt);
      return { user: { id: 'user_1', email: 'u1@example.com' }, error: null };
    },
    async getProfile(userId) {
      calls.getProfile.push(userId);
      calls.order.push('profile.read');
      if (opts.failProfile) throw new Error('profile lookup failed secret=sk_live_LEAK');
      if (opts.profile !== undefined) return opts.profile;
      return {
        stripe_customer_id:
          opts.existingCustomerId !== undefined ? opts.existingCustomerId : 'cus_user_1',
      };
    },
    // Capabilities the portal must never invoke.
    async setEntitlement() {
      calls.entitlementWrites += 1;
    },
    async updateTier() {
      calls.tierWrites += 1;
    },
    async setProfileCustomer() {
      calls.profileCustomerWrites += 1;
    },
    async updateSubscription() {
      calls.subscriptionWrites += 1;
    },
    async updatePaymentMethod() {
      calls.paymentMethodWrites += 1;
    },
    async recordEvent() {
      calls.eventWrites += 1;
    },
    stripe: {
      customers: {
        async create() {
          calls.customerCreates += 1;
          return { id: 'cus_new' };
        },
      },
      billingPortal: {
        sessions: {
          async create(params) {
            calls.billingPortalCreate.push(params);
            calls.order.push('portal.create');
            if (opts.failPortalCreate) throw new Error('stripe portal failed secret=sk_live_LEAK');
            return {
              url:
                opts.portalUrl !== undefined
                  ? opts.portalUrl
                  : 'https://billing.stripe.com/p/session/bps_1',
            };
          },
        },
      },
    },
  };

  return { deps, calls };
}

// ---------------------------------------------------------------------------
// Request builder.
// ---------------------------------------------------------------------------
function makeReq(method, o) {
  o = o || {};
  const headers = {};
  if (o.origin !== undefined) headers['origin'] = o.origin;
  if (o.auth !== undefined) headers['authorization'] = o.auth;
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  const init = { method, headers };
  if (o.body !== undefined)
    init.body = typeof o.body === 'string' ? o.body : JSON.stringify(o.body);
  return new Request('https://fn.vibespace.local/create-access-portal', init);
}

const ORIGIN = 'tauri://localhost';
const AUTH = 'Bearer jwt_user_1';

async function jsonOf(res) {
  return await res.json();
}

function assertNoSecrets(body) {
  const text = JSON.stringify(body);
  assertNotIncludes(text, 'sk_live_LEAK', 'no upstream secret leaked');
  assertNotIncludes(text, 'sk_test_unit', 'no configured secret leaked');
  assertNotIncludes(text, 'sk_', 'no secret-shaped output');
}

// ---------------------------------------------------------------------------
// isSafePortalUrl unit tests (pure guard).
// ---------------------------------------------------------------------------
Deno.test('isSafePortalUrl accepts a real HTTPS Stripe portal URL', () => {
  assert(isSafePortalUrl('https://billing.stripe.com/p/session/bps_1'));
  assert(isSafePortalUrl('https://billing.stripe.com/session/abc'));
});

Deno.test('isSafePortalUrl rejects non-HTTPS, non-Stripe, and malformed URLs', () => {
  assert(!isSafePortalUrl('http://billing.stripe.com/p/session/bps_1'), 'http rejected');
  assert(!isSafePortalUrl('https://evil.example.com/p/session/bps_1'), 'non-stripe rejected');
  assert(!isSafePortalUrl('https://stripe.com.evil.example.com/x'), 'suffix-spoof rejected');
  assert(!isSafePortalUrl('https://stripe.com/portal'), 'generic Stripe site is not a portal');
  assert(!isSafePortalUrl('https://api.stripe.com/v1/customers'), 'Stripe API is not a portal');
  assert(!isSafePortalUrl('javascript:alert(1)'), 'scheme rejected');
  assert(!isSafePortalUrl('not a url'), 'malformed rejected');
  assert(!isSafePortalUrl(''), 'empty rejected');
  assert(!isSafePortalUrl(null), 'null rejected');
  assert(!isSafePortalUrl(undefined), 'undefined rejected');
  assert(!isSafePortalUrl('https://user:password@billing.stripe.com/p/session/bps_1'));
  assert(!isSafePortalUrl('https://billing.stripe.com/' + 'x'.repeat(2048)));
});

// ---------------------------------------------------------------------------
// Handler tests.
// ---------------------------------------------------------------------------
Deno.test('rejects non-POST methods with 405', async () => {
  const { deps } = makeDeps();
  const res = await handleAccessPortal(makeReq('GET', { origin: ORIGIN, auth: AUTH }), deps);
  assertEquals(res.status, 405, 'status');
  assertEquals(await jsonOf(res), { error: 'method_not_allowed' });
});

Deno.test('handles OPTIONS preflight with 200 and CORS headers', async () => {
  const { deps } = makeDeps();
  const res = await handleAccessPortal(makeReq('OPTIONS', { origin: ORIGIN }), deps);
  assertEquals(res.status, 200, 'status');
  assertEquals(res.headers.get('access-control-allow-origin'), ORIGIN);
  assertStringIncludes(res.headers.get('access-control-allow-methods') || '', 'POST');
});

Deno.test('rejects a missing Authorization header with 401', async () => {
  const { deps, calls } = makeDeps();
  const res = await handleAccessPortal(makeReq('POST', { origin: ORIGIN, body: {} }), deps);
  assertEquals(res.status, 401, 'status');
  assertEquals(await jsonOf(res), { error: 'unauthorized' });
  assertEquals(calls.getProfile.length, 0, 'no profile read when unauthenticated');
  assertEquals(calls.billingPortalCreate.length, 0, 'no portal session when unauthenticated');
});

Deno.test('rejects a non-Bearer Authorization scheme with 401', async () => {
  const { deps } = makeDeps();
  const res = await handleAccessPortal(
    makeReq('POST', { origin: ORIGIN, auth: 'Token abc', body: {} }),
    deps,
  );
  assertEquals(res.status, 401, 'status');
  assertEquals(await jsonOf(res), { error: 'unauthorized' });
});

Deno.test('validates the user server-side and rejects an invalid JWT with 401', async () => {
  const { deps, calls } = makeDeps({
    getUser: () => ({ user: null, error: { message: 'invalid JWT' } }),
  });
  const res = await handleAccessPortal(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(res.status, 401, 'status');
  assertEquals(await jsonOf(res), { error: 'unauthorized' });
  assertEquals(calls.getUser.length, 1, 'getUser called once for server-side validation');
  assertEquals(calls.getProfile.length, 0, 'no profile read for invalid JWT');
});

Deno.test('rejects when getUser resolves to no user with 401', async () => {
  const { deps } = makeDeps({ getUser: () => ({ user: null, error: null }) });
  const res = await handleAccessPortal(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(res.status, 401, 'status');
  assertEquals(await jsonOf(res), { error: 'unauthorized' });
});

Deno.test('rejects an API key presented as a Bearer token (not a user JWT) with 401', async () => {
  // Real Supabase auth.getUser rejects non-user tokens (anon key, Stripe key).
  // The mock mirrors that: only the genuine user JWT resolves to a user.
  const { deps, calls } = makeDeps({
    getUser: (jwt) =>
      jwt === 'jwt_user_1'
        ? { user: { id: 'user_1', email: 'u1@example.com' }, error: null }
        : { user: null, error: { message: 'invalid JWT' } },
  });
  // A Stripe secret-key shape...
  const resStripeKey = await handleAccessPortal(
    makeReq('POST', { origin: ORIGIN, auth: 'Bearer sk_test_51ABC', body: {} }),
    deps,
  );
  assertEquals(resStripeKey.status, 401, 'stripe key as bearer rejected');
  // ...and a Supabase anon-key shape are both rejected identically.
  const resAnonKey = await handleAccessPortal(
    makeReq('POST', { origin: ORIGIN, auth: 'Bearer eyJhbGciOiJIUzI1NiJ9.anon.service', body: {} }),
    deps,
  );
  assertEquals(resAnonKey.status, 401, 'anon key as bearer rejected');
  assertEquals(await jsonOf(resAnonKey), { error: 'unauthorized' });
  // The API key never escalates to identity: no profile read, no Stripe call.
  assertEquals(calls.getProfile.length, 0, 'no profile read for API-key bearer');
  assertEquals(calls.billingPortalCreate.length, 0, 'no portal session for API-key bearer');
});

Deno.test('authenticates before revealing billing configuration state', async () => {
  const { deps } = makeDeps({ config: { stripeSecretKey: '', appBaseUrl: '' } });
  const res = await handleAccessPortal(makeReq('POST', { origin: ORIGIN, body: {} }), deps);
  assertEquals(res.status, 401, 'status');
  assertEquals(await jsonOf(res), { error: 'unauthorized' });
});

Deno.test('returns a generic 503 when the auth backend throws', async () => {
  const { deps, calls } = makeDeps({ throwGetUser: true });
  const res = await handleAccessPortal(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(res.status, 503, 'status');
  assertEquals(await jsonOf(res), { error: 'auth_unavailable' });
  assertEquals(calls.getProfile.length, 0);
  assertEquals(calls.billingPortalCreate.length, 0);
});

Deno.test('rejects a missing Stripe secret key with 500 billing_unconfigured', async () => {
  const { deps, calls } = makeDeps({ config: { stripeSecretKey: '' } });
  const res = await handleAccessPortal(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(res.status, 500, 'status');
  assertEquals(await jsonOf(res), { error: 'billing_unconfigured' });
  assertEquals(calls.billingPortalCreate.length, 0, 'no Stripe call when unconfigured');
});

Deno.test('rejects unsafe or path-bearing server return URL configuration', async () => {
  for (const appBaseUrl of [
    'http://app.example.com',
    'https://user:password@app.example.com',
    'https://app.example.com/path',
    'https://app.example.com/?next=https://evil.example',
    'javascript:alert(1)',
    'https://app.example.com/#fragment',
  ]) {
    const { deps, calls } = makeDeps({ config: { appBaseUrl } });
    const res = await handleAccessPortal(
      makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
      deps,
    );
    assertEquals(res.status, 500, 'status for ' + appBaseUrl);
    assertEquals(await jsonOf(res), { error: 'billing_unconfigured' });
    assertEquals(calls.getProfile.length, 0, 'invalid config stops before profile read');
    assertEquals(calls.billingPortalCreate.length, 0, 'invalid config never reaches Stripe');
  }
});

Deno.test(
  'ignores client-supplied customer/price/plan/product/user/return URL (injection)',
  async () => {
    const { deps, calls } = makeDeps({ existingCustomerId: 'cus_user_1' });
    const evilBody = {
      plan: 'pro',
      price: 'price_evil',
      price_id: 'price_evil',
      product: 'prod_evil',
      amount: 100,
      customer: 'cus_evil',
      customer_id: 'cus_evil',
      user_id: 'user_evil',
      return_url: 'https://evil.example/x',
      redirect_url: 'https://evil.example/x',
    };
    const res = await handleAccessPortal(
      makeReq('POST', { origin: ORIGIN, auth: AUTH, body: evilBody }),
      deps,
    );
    assertEquals(res.status, 200, 'status');
    const body = await jsonOf(res);
    assert(typeof body.url === 'string' && body.url.length > 0, 'returns a url');
    assertEquals(calls.billingPortalCreate.length, 1, 'one portal session');
    const params = calls.billingPortalCreate[0];
    assertEquals(params.customer, 'cus_user_1', 'customer from profile, not body');
    assertEquals(params.return_url, 'https://app.example.com/account', 'server return url only');
    assertEquals(Object.keys(params).sort(), ['customer', 'return_url'], 'no extra params');
    assertNotIncludes(JSON.stringify(params), 'evil', 'no client value reaches Stripe');
  },
);

Deno.test(
  'resolves the authenticated user own customer (cross-account substitution blocked)',
  async () => {
    const { deps, calls } = makeDeps({ existingCustomerId: 'cus_user_1' });
    const res = await handleAccessPortal(
      makeReq('POST', {
        origin: ORIGIN,
        auth: AUTH,
        body: { customer: 'cus_user_2', user_id: 'user_2' },
      }),
      deps,
    );
    assertEquals(res.status, 200, 'status');
    // The profile lookup is keyed by the JWT user, never the body user.
    assertEquals(calls.getProfile, ['user_1'], 'profile read for the authenticated user only');
    assertEquals(
      calls.billingPortalCreate[0].customer,
      'cus_user_1',
      'portal uses the authenticated user customer',
    );
    assertNotIncludes(
      JSON.stringify(calls.billingPortalCreate[0]),
      'user_2',
      'no substituted user reaches Stripe',
    );
    assertNotIncludes(JSON.stringify(calls.billingPortalCreate[0]), 'cus_user_2');
  },
);

Deno.test('returns 404 no_customer when the profile has no Stripe customer', async () => {
  const { deps, calls } = makeDeps({ existingCustomerId: null });
  const res = await handleAccessPortal(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(res.status, 404, 'status');
  assertEquals(await jsonOf(res), { error: 'no_customer' });
  assertEquals(calls.billingPortalCreate.length, 0, 'no portal session without a customer');
  assertEquals(calls.customerCreates, 0, 'portal never creates a customer');
});

Deno.test('returns 404 no_customer when the profile is missing entirely', async () => {
  const { deps, calls } = makeDeps({ profile: null });
  const res = await handleAccessPortal(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(res.status, 404, 'status');
  assertEquals(await jsonOf(res), { error: 'no_customer' });
  assertEquals(calls.billingPortalCreate.length, 0);
  assertEquals(calls.customerCreates, 0, 'portal never creates a customer');
});

Deno.test('fails closed on a malformed server-owned Stripe customer mapping', async () => {
  for (const existingCustomerId of ['customer_wrong_prefix', 'cus_bad value', 'x'.repeat(256)]) {
    const { deps, calls } = makeDeps({ existingCustomerId });
    const res = await handleAccessPortal(
      makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
      deps,
    );
    assertEquals(res.status, 502, 'status for malformed mapping');
    assertEquals(await jsonOf(res), { error: 'portal_failed' });
    assertEquals(calls.billingPortalCreate.length, 0, 'malformed customer never reaches Stripe');
  }
});

Deno.test('returns 502 portal_failed on Stripe error without leaking secrets', async () => {
  const { deps, calls } = makeDeps({ failPortalCreate: true });
  const res = await handleAccessPortal(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(res.status, 502, 'status');
  const body = await jsonOf(res);
  assertEquals(body, { error: 'portal_failed' });
  assertNoSecrets(body);
  assertEquals(calls.billingPortalCreate.length, 1, 'Stripe was attempted');
});

Deno.test(
  'returns 502 portal_failed when the profile lookup fails without leaking secrets',
  async () => {
    const { deps } = makeDeps({ failProfile: true });
    const res = await handleAccessPortal(
      makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
      deps,
    );
    assertEquals(res.status, 502, 'status');
    const body = await jsonOf(res);
    assertEquals(body, { error: 'portal_failed' });
    assertNoSecrets(body);
  },
);

Deno.test('returns the real Stripe Billing Portal URL as JSON with CORS', async () => {
  const { deps, calls } = makeDeps({});
  const res = await handleAccessPortal(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(res.status, 200, 'status');
  assertEquals(res.headers.get('content-type'), 'application/json');
  assertEquals(res.headers.get('access-control-allow-origin'), ORIGIN);
  const body = await jsonOf(res);
  assertEquals(body, { url: 'https://billing.stripe.com/p/session/bps_1' });
  assertEquals(Object.keys(body), ['url'], 'response only exposes the portal url');
  assertEquals(calls.billingPortalCreate.length, 1);
  assertEquals(calls.billingPortalCreate[0].return_url, 'https://app.example.com/account');
});

Deno.test('applies restrictive CORS for a disallowed origin', async () => {
  const { deps } = makeDeps({});
  const res = await handleAccessPortal(
    makeReq('POST', { origin: 'https://evil.example.com', auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(res.status, 200, 'status');
  assertEquals(
    res.headers.get('access-control-allow-origin'),
    'tauri://localhost',
    'falls back to safe origin',
  );
  assertNotIncludes(res.headers.get('access-control-allow-origin') || '', 'evil.example.com');
});

Deno.test('rejects a non-HTTPS portal URL returned by upstream (bounded URL)', async () => {
  const { deps } = makeDeps({ portalUrl: 'http://billing.stripe.com/p/session/bps_1' });
  const res = await handleAccessPortal(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(res.status, 502, 'status');
  const body = await jsonOf(res);
  assertEquals(body, { error: 'portal_failed' });
  assertNoSecrets(body);
});

Deno.test('rejects a non-Stripe portal URL returned by upstream (bounded URL)', async () => {
  const { deps } = makeDeps({ portalUrl: 'https://evil.example.com/p/session/bps_1' });
  const res = await handleAccessPortal(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(res.status, 502, 'status');
  assertEquals(await jsonOf(res), { error: 'portal_failed' });
});

Deno.test('never mutates profiles.tier, entitlement, subscription or payment state', async () => {
  const { deps, calls } = makeDeps({ existingCustomerId: 'cus_user_1' });
  const res = await handleAccessPortal(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(res.status, 200, 'status');
  assertEquals(calls.entitlementWrites, 0, 'no entitlement write');
  assertEquals(calls.tierWrites, 0, 'no feature-tier write');
  assertEquals(calls.customerCreates, 0, 'no customer creation');
  assertEquals(calls.profileCustomerWrites, 0, 'no profile customer write');
  assertEquals(calls.subscriptionWrites, 0, 'no subscription write');
  assertEquals(calls.paymentMethodWrites, 0, 'no payment-method write');
  assertEquals(calls.eventWrites, 0, 'no audit/event write');
  // The only dependency interactions are a profile read and a portal create.
  assertEquals(calls.getProfile.length, 1, 'profile read once');
  assertEquals(calls.billingPortalCreate.length, 1, 'portal session created once');
  const body = await jsonOf(res);
  assertEquals(Object.keys(body), ['url'], 'response only exposes the portal url');
});
