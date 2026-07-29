// @ts-nocheck
// index.test.ts — focused, network-free tests for the create-access-checkout
// Supabase Edge Function (dedicated $20/mo VibeSpace Access checkout).
//
// These tests exercise the exported `handleAccessCheckout(req, deps)` handler
// with fully injected/mocked dependencies, so they NEVER touch the network and
// never call live Stripe/Supabase. Production wiring (URL SDK imports +
// Deno.serve) lives behind an `import.meta.main` guard in index.ts and is not
// loaded here.
//
// The mock app_access_events store mimics migration 0032_app_access: a unique
// non-null provider_event_id (multiple NULLs allowed) is the dedupe key.
//
// Intended run (when Deno is installed):
//   deno test --allow-env supabase/functions/create-access-checkout/index.test.ts
// The suite also runs under a Node >=23 type-stripping harness (no Deno needed)
// because it imports only local modules and uses no URL imports.

import { test as nodeTest } from 'node:test';
import { ACCESS_ENTITLEMENT_SELECT, handleAccessCheckout } from './index.ts';

if (typeof globalThis.Deno === 'undefined') {
  globalThis.Deno = { test: nodeTest };
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
// ordering. No network, no real SDKs. The app_access_events mock mirrors the
// 0032_app_access unique(provider_event_id) constraint (NULLs allowed).
// ---------------------------------------------------------------------------
function makeDeps(opts) {
  opts = opts || {};
  const calls = {
    getUser: [],
    getProfile: [],
    setProfileCustomer: [],
    getAccessEntitlement: [],
    reserveCheckoutAttempt: [],
    completeCheckoutAttempt: [],
    closeCheckoutAttempt: [],
    retrieveCheckoutSession: [],
    recordCheckoutEvent: [],
    customersCreate: [],
    customersCreateOptions: [],
    sessionsCreate: [],
    sessionsCreateOptions: [],
    recordedEvents: [],
    order: [],
    entitlementWrites: 0,
    tierWrites: 0,
  };

  const config = Object.assign(
    {
      stripeSecretKey: 'sk_test_unit',
      appAccessPriceId: 'price_access_unit',
      appBaseUrl: 'https://app.example.com',
    },
    opts.config || {},
  );

  const sessionsByIdemKey = new Map();
  const sessionsById = new Map();
  const customersByIdemKey = new Map();
  let checkoutAttempt = null;
  let attemptCounter = 0;
  let sessionCounter = 0;

  function attemptId(counter) {
    return '10000000-0000-4000-8000-' + String(counter).padStart(12, '0');
  }

  function reserveAttempt(userId) {
    const now = deps.now();
    if (
      checkoutAttempt &&
      checkoutAttempt.state === 'reserved' &&
      Date.parse(checkoutAttempt.leaseExpiresAt) <= now.getTime()
    ) {
      checkoutAttempt.state = 'abandoned';
    }
    if (
      checkoutAttempt &&
      checkoutAttempt.state === 'session_created' &&
      Date.parse(checkoutAttempt.expiresAt) <= now.getTime()
    ) {
      checkoutAttempt.state = 'expired';
    }
    if (
      checkoutAttempt &&
      (checkoutAttempt.state === 'reserved' || checkoutAttempt.state === 'session_created')
    ) {
      return { ...checkoutAttempt };
    }
    if (checkoutAttempt && checkoutAttempt.state === 'completed') {
      const entitlement = opts.entitlement;
      const isAuthoritativeTerminal =
        entitlement &&
        entitlement.stripe_subscription_id &&
        ['canceled', 'unpaid', 'incomplete_expired'].includes(entitlement.provider_status) &&
        Number.isFinite(Date.parse(entitlement.provider_status_updated_at)) &&
        Date.parse(entitlement.provider_status_updated_at) >= Date.parse(checkoutAttempt.createdAt);
      if (!isAuthoritativeTerminal) return { outcome: 'checkout_pending' };
    }
    attemptCounter += 1;
    const id = attemptId(attemptCounter);
    checkoutAttempt = {
      outcome: 'reserved',
      state: 'reserved',
      attemptId: id,
      idempotencyKey: 'access_checkout_attempt:' + id,
      leaseExpiresAt: new Date(now.getTime() + 5 * 60_000).toISOString(),
      expiresAt: new Date(now.getTime() + 60 * 60_000).toISOString(),
      createdAt: now.toISOString(),
      sessionId: null,
      url: null,
      userId,
    };
    return { ...checkoutAttempt };
  }

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
      if (opts.throwGetProfile) throw new Error('profile backend unavailable');
      if (opts.profile !== undefined) return opts.profile;
      return {
        stripe_customer_id: opts.existingCustomerId !== undefined ? opts.existingCustomerId : null,
      };
    },
    async setProfileCustomer(userId, customerId) {
      calls.setProfileCustomer.push({ userId, customerId });
      if (opts.throwSetProfileCustomer) throw new Error('profile update unavailable');
    },
    async getAccessEntitlement(userId) {
      calls.getAccessEntitlement.push(userId);
      if (opts.throwGetAccessEntitlement) throw new Error('entitlement backend unavailable');
      if (opts.entitlement !== undefined) return opts.entitlement;
      return null;
    },
    async reserveCheckoutAttempt(userId) {
      calls.reserveCheckoutAttempt.push(userId);
      if (opts.throwReserveCheckoutAttempt) throw new Error('attempt reservation unavailable');
      if (opts.reserveCheckoutAttempt) return opts.reserveCheckoutAttempt(userId);
      return reserveAttempt(userId);
    },
    async completeCheckoutAttempt(userId, attemptIdValue, session) {
      calls.completeCheckoutAttempt.push({ userId, attemptId: attemptIdValue, session });
      if (opts.throwCompleteCheckoutAttempt) throw new Error('attempt completion unavailable');
      if (
        !checkoutAttempt ||
        checkoutAttempt.userId !== userId ||
        checkoutAttempt.attemptId !== attemptIdValue
      ) {
        throw new Error('attempt owner mismatch');
      }
      if (checkoutAttempt.state === 'session_created') {
        if (checkoutAttempt.sessionId !== session.id || checkoutAttempt.url !== session.url) {
          throw new Error('attempt completion conflict');
        }
        return { ...checkoutAttempt };
      }
      if (checkoutAttempt.state !== 'reserved') throw new Error('attempt is not open');
      checkoutAttempt = {
        ...checkoutAttempt,
        outcome: 'session_created',
        state: 'session_created',
        sessionId: session.id,
        url: session.url,
      };
      calls.order.push('attempt.complete');
      const providerEventId = 'access_checkout_attempt:' + attemptIdValue + ':' + session.id;
      if (!calls.recordedEvents.some((event) => event.provider_event_id === providerEventId)) {
        calls.order.push('event.record');
        calls.recordedEvents.push({
          user_id: userId,
          event_type: 'checkout_created',
          provider_event_id: providerEventId,
          stripe_subscription_id: null,
          status: opts.entitlement ? opts.entitlement.status || null : null,
          reason: 'checkout_created',
          occurred_at: deps.now().toISOString(),
        });
      }
      return { ...checkoutAttempt };
    },
    async closeCheckoutAttempt(userId, attemptIdValue, state) {
      calls.closeCheckoutAttempt.push({ userId, attemptId: attemptIdValue, state });
      if (
        !checkoutAttempt ||
        checkoutAttempt.userId !== userId ||
        checkoutAttempt.attemptId !== attemptIdValue
      ) {
        throw new Error('attempt owner mismatch');
      }
      if (!['completed', 'expired', 'abandoned'].includes(state)) {
        throw new Error('invalid terminal state');
      }
      if (checkoutAttempt.state === state) return;
      if (
        (checkoutAttempt.state === 'reserved' && state !== 'abandoned') ||
        ['completed', 'expired', 'abandoned'].includes(checkoutAttempt.state)
      ) {
        throw new Error('invalid attempt transition');
      }
      checkoutAttempt = { ...checkoutAttempt, state, outcome: state };
    },
    async recordCheckoutEvent(event) {
      calls.recordCheckoutEvent.push(event);
      calls.order.push('event.record');
      if (opts.throwRecordCheckoutEvent) throw new Error('audit backend unavailable');
      if (opts.eventConflict) return { ok: false, reason: 'conflict' };
      // Mirror app_access_events_provider_event_id_key: unique non-null ids;
      // multiple NULLs are allowed (server-generated events).
      const pid = event.provider_event_id;
      if (pid != null && calls.recordedEvents.some((e) => e.provider_event_id === pid)) {
        return { ok: false, reason: 'conflict' };
      }
      calls.recordedEvents.push(event);
      return { ok: true };
    },
    // Extra capability spies the handler must NEVER use (checkout never grants
    // access and never mutates feature tier). Left at zero to prove separation.
    async setEntitlement() {
      calls.entitlementWrites += 1;
    },
    async updateTier() {
      calls.tierWrites += 1;
    },
    stripe: {
      customers: {
        async create(params, options) {
          calls.customersCreateOptions.push(options || {});
          const key = options && options.idempotencyKey;
          if (key && customersByIdemKey.has(key)) {
            const replay = customersByIdemKey.get(key);
            if (replay instanceof Error) throw replay;
            return replay;
          }
          if (opts.failCustomerCreate) {
            const error = new Error('customer create failed secret=sk_live_LEAK');
            if (key) customersByIdemKey.set(key, error);
            throw error;
          }
          const customer = { id: opts.newCustomerId || 'cus_new_1' };
          calls.customersCreate.push(params);
          if (key) customersByIdemKey.set(key, customer);
          return customer;
        },
      },
      checkout: {
        sessions: {
          async create(params, options) {
            calls.sessionsCreateOptions.push(options || {});
            calls.order.push('session.create');
            if (opts.failSessionCreate)
              throw new Error('stripe session failed secret=sk_live_LEAK');
            const key = options && options.idempotencyKey;
            if (key && sessionsByIdemKey.has(key)) {
              // Stripe idempotency replay: same key returns the same session and
              // does not create a new one.
              return sessionsByIdemKey.get(key);
            }
            sessionCounter += 1;
            const session = {
              id: 'cs_' + sessionCounter,
              url:
                opts.sessionUrl === undefined
                  ? 'https://checkout.stripe.com/c/pay/cs_' + sessionCounter
                  : opts.sessionUrl,
              status: 'open',
            };
            calls.sessionsCreate.push(params);
            if (key) sessionsByIdemKey.set(key, session);
            sessionsById.set(session.id, session);
            return session;
          },
          async retrieve(sessionId) {
            calls.retrieveCheckoutSession.push(sessionId);
            if (opts.failSessionRetrieve) throw new Error('Stripe retrieve unavailable');
            const session = sessionsById.get(sessionId);
            if (!session) throw new Error('unknown Checkout Session');
            return {
              ...session,
              status: opts.checkoutSessionStatus || session.status,
            };
          },
        },
      },
    },
    now() {
      return opts.now ? opts.now() : new Date('2026-07-28T00:00:00.000Z');
    },
  };

  return {
    deps,
    calls,
    attemptStore: {
      abandonCurrent() {
        if (checkoutAttempt) checkoutAttempt.state = 'abandoned';
      },
      current() {
        return checkoutAttempt ? { ...checkoutAttempt } : null;
      },
    },
  };
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
  return new Request('https://fn.vibespace.local/create-access-checkout', init);
}

const ORIGIN = 'tauri://localhost';
const AUTH = 'Bearer jwt_user_1';

async function jsonOf(res) {
  return await res.json();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
Deno.test('production entitlement projection includes terminal-state ordering authority', () => {
  assertEquals(
    ACCESS_ENTITLEMENT_SELECT.split(','),
    [
      'status',
      'cancel_at_period_end',
      'stripe_subscription_id',
      'provider_status',
      'provider_status_updated_at',
    ],
    'production wiring must fetch the timestamp used to order terminal state against an attempt',
  );
});

Deno.test('rejects non-POST methods with 405', async () => {
  const { deps } = makeDeps();
  const res = await handleAccessCheckout(makeReq('GET', { origin: ORIGIN, auth: AUTH }), deps);
  assertEquals(res.status, 405, 'status');
  assertEquals(await jsonOf(res), { error: 'method_not_allowed' });
});

Deno.test('handles OPTIONS preflight with 200 and CORS headers', async () => {
  const { deps } = makeDeps();
  const res = await handleAccessCheckout(makeReq('OPTIONS', { origin: ORIGIN }), deps);
  assertEquals(res.status, 200, 'status');
  assertEquals(res.headers.get('access-control-allow-origin'), ORIGIN);
  assertStringIncludes(res.headers.get('access-control-allow-methods') || '', 'POST');
});

Deno.test('rejects a missing Authorization header with 401', async () => {
  const { deps } = makeDeps();
  const res = await handleAccessCheckout(makeReq('POST', { origin: ORIGIN, body: {} }), deps);
  assertEquals(res.status, 401, 'status');
  assertEquals(await jsonOf(res), { error: 'unauthorized' });
});

Deno.test('rejects a non-Bearer Authorization scheme with 401', async () => {
  const { deps } = makeDeps();
  const res = await handleAccessCheckout(
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
  const res = await handleAccessCheckout(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(res.status, 401, 'status');
  assertEquals(await jsonOf(res), { error: 'unauthorized' });
  assertEquals(calls.getUser.length, 1, 'getUser called once for server-side validation');
});

Deno.test('rejects when getUser resolves to no user with 401', async () => {
  const { deps } = makeDeps({ getUser: () => ({ user: null, error: null }) });
  const res = await handleAccessCheckout(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(res.status, 401, 'status');
  assertEquals(await jsonOf(res), { error: 'unauthorized' });
});

Deno.test('authenticates before revealing billing configuration state', async () => {
  const { deps } = makeDeps({
    config: { stripeSecretKey: '', appAccessPriceId: '' },
  });
  const res = await handleAccessCheckout(makeReq('POST', { origin: ORIGIN, body: {} }), deps);
  assertEquals(res.status, 401, 'status');
  assertEquals(await jsonOf(res), { error: 'unauthorized' });
});

Deno.test('returns a generic 503 when the auth backend throws', async () => {
  const { deps } = makeDeps({ throwGetUser: true });
  const res = await handleAccessCheckout(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(res.status, 503, 'status');
  assertEquals(await jsonOf(res), { error: 'auth_unavailable' });
});

Deno.test('rejects a missing Stripe secret key with 500 billing_unconfigured', async () => {
  const { deps } = makeDeps({ config: { stripeSecretKey: '' } });
  const res = await handleAccessCheckout(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(res.status, 500, 'status');
  assertEquals(await jsonOf(res), { error: 'billing_unconfigured' });
});

Deno.test('rejects a missing app access price id with 500 billing_unconfigured', async () => {
  const { deps } = makeDeps({ config: { appAccessPriceId: '' } });
  const res = await handleAccessCheckout(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(res.status, 500, 'status');
  assertEquals(await jsonOf(res), { error: 'billing_unconfigured' });
});

Deno.test('rejects an unsafe or path-bearing server redirect base', async () => {
  for (const appBaseUrl of [
    'http://app.example.com',
    'https://user:password@app.example.com',
    'https://app.example.com/untrusted/path',
    'javascript:alert(1)',
  ]) {
    const { deps, calls } = makeDeps({ config: { appBaseUrl } });
    const res = await handleAccessCheckout(
      makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
      deps,
    );
    assertEquals(res.status, 500, 'status');
    assertEquals(await jsonOf(res), { error: 'billing_unconfigured' });
    assertEquals(calls.sessionsCreate.length, 0, 'unsafe redirect config never reaches Stripe');
  }
});

Deno.test('ignores client-supplied price/amount/customer/user/redirect (injection)', async () => {
  const { deps, calls } = makeDeps({ existingCustomerId: 'cus_exist' });
  const evilBody = {
    plan: 'pro',
    price: 'price_evil',
    price_id: 'price_evil',
    amount: 100,
    customer: 'cus_evil',
    customer_id: 'cus_evil',
    user_id: 'user_evil',
    redirect_url: 'https://evil.example/x',
    success_url: 'https://evil.example/success',
    cancel_url: 'https://evil.example/cancel',
    expires_at: 999,
    idempotency_key: 'evil_key',
  };
  const res = await handleAccessCheckout(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: evilBody }),
    deps,
  );
  assertEquals(res.status, 200, 'status');
  const body = await jsonOf(res);
  assert(typeof body.url === 'string' && body.url.length > 0, 'returns a url');

  assertEquals(calls.sessionsCreate.length, 1, 'one session created');
  const params = calls.sessionsCreate[0];
  assertEquals(params.mode, 'subscription');
  assertEquals(
    params.line_items,
    [{ price: 'price_access_unit', quantity: 1 }],
    'server price only',
  );
  assertEquals(params.success_url, 'https://app.example.com/billing/success', 'server success url');
  assertEquals(params.cancel_url, 'https://app.example.com/billing/cancel', 'server cancel url');
  assertEquals(params.customer, 'cus_exist', 'customer from profile, not body');
  assertEquals(params.client_reference_id, 'user_1', 'user from JWT, not body');
  assertEquals(params.expires_at, 1785200400, 'server attempt expiry only');
  assertEquals(params.metadata.supabase_user_id, 'user_1', 'metadata user from JWT');
  assertStringIncludes(
    params.metadata.checkout_attempt_id,
    '10000000-0000-4000-8000-',
    'server attempt metadata',
  );
  assertNotIncludes(JSON.stringify(params), 'evil', 'no client-controlled value reaches Stripe');
});

Deno.test('reuses an existing Stripe customer mapped on the profile', async () => {
  const { deps, calls } = makeDeps({ existingCustomerId: 'cus_exist' });
  const res = await handleAccessCheckout(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(res.status, 200, 'status');
  assertEquals(calls.customersCreate.length, 0, 'no customer created');
  assertEquals(calls.setProfileCustomer.length, 0, 'profile customer unchanged');
  assertEquals(calls.sessionsCreate[0].customer, 'cus_exist');
});

Deno.test('creates a new Stripe customer when absent and maps it to the profile', async () => {
  const { deps, calls } = makeDeps({ existingCustomerId: null, newCustomerId: 'cus_new_1' });
  const res = await handleAccessCheckout(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(res.status, 200, 'status');
  assertEquals(calls.customersCreate.length, 1, 'one customer created');
  assertEquals(calls.customersCreate[0].email, 'u1@example.com');
  assertEquals(
    calls.customersCreateOptions[0].idempotencyKey,
    'access_customer:user_1',
    'customer creation uses a server-derived account-stable idempotency key',
  );
  assertEquals(
    calls.customersCreate[0].metadata,
    { supabase_user_id: 'user_1' },
    'bounded customer metadata',
  );
  assertEquals(
    calls.setProfileCustomer,
    [{ userId: 'user_1', customerId: 'cus_new_1' }],
    'maps customer',
  );
  assertEquals(calls.sessionsCreate[0].customer, 'cus_new_1');
});

Deno.test('rejects duplicate checkout when entitlement is active (409)', async () => {
  const { deps, calls } = makeDeps({
    entitlement: {
      status: 'active',
      cancel_at_period_end: false,
      stripe_subscription_id: 'sub_active',
      provider_status: 'active',
    },
  });
  const res = await handleAccessCheckout(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(res.status, 409, 'status');
  assertEquals(await jsonOf(res), { error: 'duplicate_access' });
  assertEquals(calls.sessionsCreate.length, 0, 'no Stripe session created');
  assertEquals(calls.customersCreate.length, 0, 'no Stripe customer created');
  assertEquals(calls.recordCheckoutEvent.length, 0, 'no audit event recorded');
});

Deno.test('honors the atomic duplicate guard at durable reservation time', async () => {
  const { deps, calls } = makeDeps({
    entitlement: null,
    reserveCheckoutAttempt: () => ({ outcome: 'duplicate_access' }),
  });
  const res = await handleAccessCheckout(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(res.status, 409, 'status');
  assertEquals(await jsonOf(res), { error: 'duplicate_access' });
  assertEquals(calls.customersCreate.length, 0, 'no customer after atomic duplicate guard');
  assertEquals(calls.sessionsCreate.length, 0, 'no session after atomic duplicate guard');
});

Deno.test('allows checkout during the app trial when no Stripe subscription exists', async () => {
  const { deps } = makeDeps({
    entitlement: {
      status: 'trialing',
      cancel_at_period_end: false,
      stripe_subscription_id: null,
      provider_status: null,
    },
  });
  const res = await handleAccessCheckout(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(res.status, 200, 'trial users must be able to convert to paid access');
});

Deno.test('rejects duplicate checkout for an existing Stripe trial subscription', async () => {
  const { deps } = makeDeps({
    entitlement: {
      status: 'trialing',
      cancel_at_period_end: false,
      stripe_subscription_id: 'sub_trial',
      provider_status: 'trialing',
    },
  });
  const res = await handleAccessCheckout(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(res.status, 409, 'status');
  assertEquals(await jsonOf(res), { error: 'duplicate_access' });
});

Deno.test('rejects duplicate checkout when cancel_at_period_end flag is set (409)', async () => {
  const { deps } = makeDeps({
    entitlement: {
      status: 'active',
      cancel_at_period_end: true,
      stripe_subscription_id: 'sub_cancel',
      provider_status: 'active',
    },
  });
  const res = await handleAccessCheckout(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(res.status, 409, 'status');
  assertEquals(await jsonOf(res), { error: 'duplicate_access' });
});

Deno.test('rejects duplicate checkout when status is cancel_at_period_end (409)', async () => {
  const { deps } = makeDeps({
    entitlement: {
      status: 'cancel_at_period_end',
      cancel_at_period_end: false,
      stripe_subscription_id: 'sub_cancel_status',
      provider_status: 'active',
    },
  });
  const res = await handleAccessCheckout(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(res.status, 409, 'status');
  assertEquals(await jsonOf(res), { error: 'duplicate_access' });
});

Deno.test('allows checkout when no entitlement exists', async () => {
  const { deps } = makeDeps({ entitlement: null });
  const res = await handleAccessCheckout(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(res.status, 200, 'status');
  const body = await jsonOf(res);
  assert(typeof body.url === 'string' && body.url.length > 0, 'returns a url');
});

Deno.test('allows resubscribe after a terminal provider subscription state', async () => {
  for (const provider_status of ['canceled', 'unpaid', 'incomplete_expired']) {
    const { deps } = makeDeps({
      entitlement: {
        status: 'locked',
        cancel_at_period_end: false,
        stripe_subscription_id: 'sub_terminal_' + provider_status,
        provider_status,
      },
    });
    const res = await handleAccessCheckout(
      makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
      deps,
    );
    assertEquals(res.status, 200, 'terminal provider state should allow resubscribe');
  }
});

Deno.test(
  'allows checkout for non-blocking states (canceled/expired/grace/locked/past_due/prelaunch)',
  async () => {
    const states = ['canceled', 'expired', 'grace', 'locked', 'past_due', 'prelaunch'];
    for (const s of states) {
      const { deps } = makeDeps({ entitlement: { status: s, cancel_at_period_end: false } });
      const res = await handleAccessCheckout(
        makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
        deps,
      );
      assertEquals(res.status, 200, 'state ' + s + ' should allow checkout');
    }
  },
);

Deno.test(
  'reuses one durable session across sequential retries with one session and one event',
  async () => {
    const { deps, calls } = makeDeps({ entitlement: null });
    const res1 = await handleAccessCheckout(
      makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
      deps,
    );
    const res2 = await handleAccessCheckout(
      makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
      deps,
    );
    assertEquals(res1.status, 200, 'first status');
    assertEquals(res2.status, 200, 'second status');
    const b1 = await jsonOf(res1);
    const b2 = await jsonOf(res2);
    assertEquals(b1.url, b2.url, 'same session url returned for the same idempotency key');
    assertEquals(calls.sessionsCreate.length, 1, 'only one underlying session creation');
    assertEquals(calls.sessionsCreateOptions.length, 1, 'durable URL avoids a second Stripe call');
    assertStringIncludes(
      calls.sessionsCreateOptions[0].idempotencyKey,
      'access_checkout_attempt:',
      'attempt-scoped key',
    );
    assertEquals(
      calls.recordedEvents.length,
      1,
      'one audit row (unique per-session token dedupes)',
    );
  },
);

Deno.test(
  'dedupes one concurrent checkout wave with one durable attempt and one Stripe session',
  async () => {
    const { deps, calls } = makeDeps({ entitlement: null });
    const [res1, res2] = await Promise.all([
      handleAccessCheckout(makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }), deps),
      handleAccessCheckout(makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }), deps),
    ]);
    assertEquals(res1.status, 200, 'first status');
    assertEquals(res2.status, 200, 'second status');
    assertEquals((await jsonOf(res1)).url, (await jsonOf(res2)).url, 'one logical checkout');
    assertEquals(calls.reserveCheckoutAttempt.length, 2, 'both calls reserve server-side');
    assertEquals(calls.sessionsCreate.length, 1, 'Stripe creates one underlying session');
    assertEquals(calls.completeCheckoutAttempt.length, 2, 'completion is idempotent');
    assertEquals(calls.recordedEvents.length, 1, 'atomic completion records one audit event');
    const keys = calls.sessionsCreateOptions.map((options) => options.idempotencyKey);
    assertEquals(keys.length, 2, 'each concurrent Stripe request carries the durable key');
    assertEquals(keys[0], keys[1], 'the concurrent wave reuses one attempt key');
    assertStringIncludes(keys[0], 'access_checkout_attempt:', 'attempt-scoped key');
  },
);

Deno.test('reuses a durable open Checkout Session without another Stripe call', async () => {
  const { deps, calls } = makeDeps({ entitlement: null });
  const first = await handleAccessCheckout(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  const second = await handleAccessCheckout(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(first.status, 200, 'first status');
  assertEquals(second.status, 200, 'second status');
  assertEquals((await jsonOf(first)).url, (await jsonOf(second)).url, 'same open session');
  assertEquals(calls.sessionsCreateOptions.length, 1, 'second call reuses the durable URL');
  assertEquals(
    calls.retrieveCheckoutSession,
    ['cs_1'],
    'Stripe confirms the Session is still open',
  );
});

Deno.test(
  'closes a remotely expired Session and creates a fresh attempt in one request',
  async () => {
    const options = { entitlement: null, checkoutSessionStatus: 'open' };
    const { deps, calls } = makeDeps(options);
    const first = await handleAccessCheckout(
      makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
      deps,
    );
    options.checkoutSessionStatus = 'expired';
    const second = await handleAccessCheckout(
      makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
      deps,
    );
    assertEquals(first.status, 200, 'first status');
    assertEquals(second.status, 200, 'expired Session is replaced without another click');
    assert(
      (await jsonOf(first)).url !== (await jsonOf(second)).url,
      'replacement uses a fresh hosted Session',
    );
    assertEquals(calls.closeCheckoutAttempt.length, 1, 'expired attempt is durably closed');
    assertEquals(calls.closeCheckoutAttempt[0].state, 'expired');
    assertEquals(calls.sessionsCreate.length, 2, 'fresh attempt creates one replacement Session');
    assert(
      calls.sessionsCreateOptions[0].idempotencyKey !==
        calls.sessionsCreateOptions[1].idempotencyKey,
      'replacement has a new server-generated attempt key',
    );
  },
);

Deno.test('fails closed while a completed Session awaits webhook reconciliation', async () => {
  const options = { entitlement: null, checkoutSessionStatus: 'open' };
  const { deps, calls } = makeDeps(options);
  const first = await handleAccessCheckout(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(first.status, 200, 'first status');
  options.checkoutSessionStatus = 'complete';
  const pending = await handleAccessCheckout(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(pending.status, 409, 'completed payment cannot create a duplicate subscription');
  assertEquals(await jsonOf(pending), { error: 'checkout_pending' });
  const stillPending = await handleAccessCheckout(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(stillPending.status, 409, 'durable completed state remains fail closed');
  assertEquals(await jsonOf(stillPending), { error: 'checkout_pending' });
  assertEquals(calls.closeCheckoutAttempt.length, 1, 'completed attempt closes once');
  assertEquals(calls.closeCheckoutAttempt[0].state, 'completed');
  assertEquals(calls.sessionsCreate.length, 1, 'no duplicate Checkout Session');
  assertEquals(calls.entitlementWrites, 0, 'checkout never grants access');
});

Deno.test(
  'completed Session with an authoritative terminal old subscription starts fresh in one request',
  async () => {
    let now = new Date('2026-07-28T00:00:00.000Z');
    const options = {
      entitlement: null,
      checkoutSessionStatus: 'open',
      now: () => now,
    };
    const { deps, calls } = makeDeps(options);
    const first = await handleAccessCheckout(
      makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
      deps,
    );
    now = new Date('2026-07-28T00:10:00.000Z');
    options.entitlement = {
      status: 'locked',
      stripe_subscription_id: 'sub_old_terminal',
      provider_status: 'canceled',
      provider_status_updated_at: '2026-07-28T00:05:00.000Z',
    };
    options.checkoutSessionStatus = 'complete';
    const second = await handleAccessCheckout(
      makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
      deps,
    );
    assertEquals(first.status, 200, 'first status');
    assertEquals(second.status, 200, 'terminal old subscription permits immediate replacement');
    assert(
      (await jsonOf(first)).url !== (await jsonOf(second)).url,
      'one request closes the old attempt and creates a fresh Session',
    );
    assertEquals(calls.closeCheckoutAttempt[0].state, 'completed');
    assertEquals(calls.sessionsCreate.length, 2, 'replacement Session is created once');
    assertEquals(calls.entitlementWrites, 0, 'handler does not modify authoritative entitlement');
  },
);

Deno.test(
  'completed new Session stays pending when the terminal subscription snapshot predates it',
  async () => {
    const options = {
      entitlement: {
        status: 'locked',
        stripe_subscription_id: 'sub_old_terminal',
        provider_status: 'canceled',
        provider_status_updated_at: '2026-07-27T23:00:00.000Z',
      },
      checkoutSessionStatus: 'open',
    };
    const { deps, calls } = makeDeps(options);
    const first = await handleAccessCheckout(
      makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
      deps,
    );
    options.checkoutSessionStatus = 'complete';
    const pending = await handleAccessCheckout(
      makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
      deps,
    );
    assertEquals(first.status, 200, 'terminal old subscription initially permits checkout');
    assertEquals(pending.status, 409, 'newly completed Session awaits a newer webhook state');
    assertEquals(await jsonOf(pending), { error: 'checkout_pending' });
    assertEquals(calls.sessionsCreate.length, 1, 'no duplicate Session is created');
  },
);

Deno.test('creates a fresh Stripe Session after the prior attempt expires', async () => {
  let now = new Date('2026-07-28T00:00:00.000Z');
  const options = { entitlement: null, now: () => now };
  const { deps, calls } = makeDeps(options);
  const first = await handleAccessCheckout(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  now = new Date('2026-07-28T01:01:00.000Z');
  const second = await handleAccessCheckout(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(first.status, 200, 'first status');
  assertEquals(second.status, 200, 'second status');
  assert(
    (await jsonOf(first)).url !== (await jsonOf(second)).url,
    'expired payment attempt gets a new hosted session',
  );
  assertEquals(calls.sessionsCreate.length, 2, 'two distinct Stripe sessions');
  assert(
    calls.sessionsCreateOptions[0].idempotencyKey !== calls.sessionsCreateOptions[1].idempotencyKey,
    'later attempt has a fresh server-generated idempotency key',
  );
});

Deno.test(
  'creates a fresh Stripe Session after a trusted service abandons an attempt',
  async () => {
    const { deps, calls, attemptStore } = makeDeps({ entitlement: null });
    const first = await handleAccessCheckout(
      makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
      deps,
    );
    attemptStore.abandonCurrent();
    const second = await handleAccessCheckout(
      makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
      deps,
    );
    assertEquals(first.status, 200, 'first status');
    assertEquals(second.status, 200, 'second status');
    assert(
      (await jsonOf(first)).url !== (await jsonOf(second)).url,
      'abandoned payment attempt gets a new hosted session',
    );
    assertEquals(calls.sessionsCreate.length, 2, 'new attempt creates a new Stripe session');
  },
);

Deno.test(
  'recovers a Stripe-created session after durable completion fails without creating another',
  async () => {
    const options = { entitlement: null, throwCompleteCheckoutAttempt: true };
    const { deps, calls } = makeDeps(options);
    const first = await handleAccessCheckout(
      makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
      deps,
    );
    assertEquals(first.status, 502, 'incomplete durable write fails closed');
    options.throwCompleteCheckoutAttempt = false;
    const second = await handleAccessCheckout(
      makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
      deps,
    );
    assertEquals(second.status, 200, 'retry recovers');
    assertEquals(calls.sessionsCreate.length, 1, 'Stripe session is replayed, not duplicated');
    assertEquals(calls.sessionsCreateOptions.length, 2, 'retry uses Stripe idempotency');
    assertEquals(
      calls.sessionsCreateOptions[0].idempotencyKey,
      calls.sessionsCreateOptions[1].idempotencyKey,
      'retry keeps the reserved attempt key',
    );
  },
);

Deno.test('a failed Stripe call cannot wedge later checkout attempts forever', async () => {
  let now = new Date('2026-07-28T00:00:00.000Z');
  const options = { entitlement: null, failSessionCreate: true, now: () => now };
  const { deps, calls } = makeDeps(options);
  const first = await handleAccessCheckout(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(first.status, 502, 'Stripe failure is generic');
  options.failSessionCreate = false;
  now = new Date('2026-07-28T00:06:00.000Z');
  const second = await handleAccessCheckout(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(second.status, 200, 'expired reservation permits recovery');
  assertEquals(calls.sessionsCreate.length, 1, 'only the successful call created a session');
  assert(
    calls.sessionsCreateOptions[0].idempotencyKey !== calls.sessionsCreateOptions[1].idempotencyKey,
    'recovery uses a fresh attempt key after the bounded lease',
  );
});

Deno.test(
  'a customer mapping failure recovers without duplicating the Stripe customer',
  async () => {
    let now = new Date('2026-07-28T00:00:00.000Z');
    const options = {
      entitlement: null,
      existingCustomerId: null,
      throwSetProfileCustomer: true,
      now: () => now,
    };
    const { deps, calls } = makeDeps(options);
    const first = await handleAccessCheckout(
      makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
      deps,
    );
    assertEquals(first.status, 502, 'mapping failure is generic');
    options.throwSetProfileCustomer = false;
    now = new Date('2026-07-28T00:06:00.000Z');
    const recovered = await handleAccessCheckout(
      makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
      deps,
    );
    assertEquals(recovered.status, 200, 'later attempt remaps the replayed customer');
    assertEquals(calls.customersCreate.length, 1, 'only one underlying customer is created');
    assertEquals(calls.customersCreateOptions.length, 2, 'both calls use Stripe idempotency');
    assertEquals(
      calls.customersCreateOptions[0].idempotencyKey,
      calls.customersCreateOptions[1].idempotencyKey,
      'account-stable customer identity survives a fresh checkout attempt',
    );
    assertEquals(calls.setProfileCustomer.length, 2, 'the replayed customer is mapped on retry');
  },
);

Deno.test('customer creation is idempotent across concurrent attempts', async () => {
  const { deps, calls } = makeDeps({ entitlement: null, existingCustomerId: null });
  const [res1, res2] = await Promise.all([
    handleAccessCheckout(makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }), deps),
    handleAccessCheckout(makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }), deps),
  ]);
  assertEquals(res1.status, 200, 'first status');
  assertEquals(res2.status, 200, 'second status');
  assertEquals(calls.customersCreate.length, 1, 'one underlying Stripe customer creation');
  assertEquals(calls.customersCreateOptions.length, 2, 'both attempts carry request options');
  assertEquals(calls.customersCreateOptions[0].idempotencyKey, 'access_customer:user_1');
  assertEquals(calls.customersCreateOptions[1].idempotencyKey, 'access_customer:user_1');
});

Deno.test('derives the Stripe idempotency key server-side (ignores client key)', async () => {
  const { deps, calls } = makeDeps({});
  const res = await handleAccessCheckout(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: { idempotency_key: 'evil_key' } }),
    deps,
  );
  assertEquals(res.status, 200, 'status');
  assertStringIncludes(
    calls.sessionsCreateOptions[0].idempotencyKey,
    'access_checkout_attempt:',
    'server attempt namespace',
  );
  assertNotIncludes(calls.sessionsCreateOptions[0].idempotencyKey, 'evil_key');
});

Deno.test('fails closed when authoritative entitlement lookup fails', async () => {
  const { deps, calls } = makeDeps({ throwGetAccessEntitlement: true });
  const res = await handleAccessCheckout(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(res.status, 502, 'status');
  assertEquals(await jsonOf(res), { error: 'checkout_failed' });
  assertEquals(calls.sessionsCreate.length, 0, 'no Stripe session after access lookup failure');
});

Deno.test('returns generic checkout_failed for profile lookup or mapping failure', async () => {
  for (const opts of [{ throwGetProfile: true }, { throwSetProfileCustomer: true }]) {
    const { deps } = makeDeps(opts);
    const res = await handleAccessCheckout(
      makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
      deps,
    );
    assertEquals(res.status, 502, 'status');
    assertEquals(await jsonOf(res), { error: 'checkout_failed' });
  }
});

Deno.test('returns 502 checkout_failed on Stripe error without leaking secrets', async () => {
  const { deps, calls } = makeDeps({ failSessionCreate: true });
  const res = await handleAccessCheckout(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(res.status, 502, 'status');
  const body = await jsonOf(res);
  assertEquals(body, { error: 'checkout_failed' });
  const text = JSON.stringify(body);
  assertNotIncludes(text, 'sk_live_LEAK', 'no upstream secret leaked');
  assertNotIncludes(text, 'sk_', 'no secret-shaped output');
  assertEquals(calls.recordCheckoutEvent.length, 0, 'no audit event when creation fails');
});

Deno.test('rejects a missing or unsafe Stripe Checkout URL', async () => {
  for (const sessionUrl of [
    null,
    'http://checkout.stripe.com/session',
    'https://user:password@checkout.stripe.com/session',
    'https://example.com/checkout/session',
    'https://checkout.stripe.com.evil.example/session',
  ]) {
    const { deps } = makeDeps({ sessionUrl });
    const res = await handleAccessCheckout(
      makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
      deps,
    );
    assertEquals(res.status, 502, 'status');
    assertEquals(await jsonOf(res), { error: 'checkout_failed' });
  }
});

Deno.test('returns the real Stripe Checkout Session URL as JSON with CORS', async () => {
  const { deps, calls } = makeDeps({});
  const res = await handleAccessCheckout(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(res.status, 200, 'status');
  assertEquals(res.headers.get('content-type'), 'application/json');
  assertEquals(res.headers.get('access-control-allow-origin'), ORIGIN);
  const body = await jsonOf(res);
  assertEquals(
    body.url,
    'https://checkout.stripe.com/c/pay/cs_1',
    'returns the Stripe session url',
  );
  assertEquals(calls.sessionsCreate.length, 1);
});

Deno.test('applies restrictive CORS for a disallowed origin', async () => {
  const { deps } = makeDeps({});
  const res = await handleAccessCheckout(
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

Deno.test('never grants app access or mutates profiles.tier on checkout creation', async () => {
  const { deps, calls } = makeDeps({ existingCustomerId: null });
  const res = await handleAccessCheckout(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(res.status, 200, 'status');
  assertEquals(calls.entitlementWrites, 0, 'no entitlement write');
  assertEquals(calls.tierWrites, 0, 'no feature-tier write');
  assert(
    calls.getAccessEntitlement.length >= 1,
    'entitlement state was read (authoritative check)',
  );
  for (const patch of calls.setProfileCustomer) {
    assert(!('tier' in patch), 'profile patch never carries tier');
    assertEquals(
      Object.keys(patch).sort(),
      ['customerId', 'userId'],
      'profile patch only maps the customer',
    );
  }
  const body = await jsonOf(res);
  assertEquals(Object.keys(body), ['url'], 'response only exposes the checkout url');
});

Deno.test('records the checkout-created audit event only after session creation', async () => {
  const { deps, calls } = makeDeps({ existingCustomerId: 'cus_exist' });
  const res = await handleAccessCheckout(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(res.status, 200, 'status');
  assertEquals(calls.recordCheckoutEvent.length, 0, 'handler never writes audit separately');
  assertEquals(calls.recordedEvents.length, 1, 'atomic completion records one audit event');
  const ev = calls.recordedEvents[0];
  assertEquals(ev.event_type, 'checkout_created');
  assertEquals(ev.user_id, 'user_1');
  assertEquals(
    ev.provider_event_id,
    'access_checkout_attempt:10000000-0000-4000-8000-000000000001:cs_1',
    'stable per-attempt/session idempotency token',
  );
  assertEquals(ev.stripe_subscription_id, null, 'no subscription until checkout completes');
  assertEquals(ev.status, null, 'no entitlement status snapshot for a new user');
  assertEquals(ev.reason, 'checkout_created');
  assertEquals(ev.occurred_at, '2026-07-28T00:00:00.000Z');
  const sessionIdx = calls.order.indexOf('session.create');
  const completionIdx = calls.order.indexOf('attempt.complete');
  const eventIdx = calls.order.indexOf('event.record');
  assert(
    sessionIdx !== -1 &&
      completionIdx !== -1 &&
      eventIdx !== -1 &&
      sessionIdx < completionIdx &&
      completionIdx < eventIdx,
    'session is created before atomic completion records the audit event',
  );
});

Deno.test(
  'records the entitlement status snapshot on the audit event (grace allowed)',
  async () => {
    const { deps, calls } = makeDeps({
      entitlement: { status: 'grace', cancel_at_period_end: false },
    });
    const res = await handleAccessCheckout(
      makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
      deps,
    );
    assertEquals(res.status, 200, 'grace allows checkout');
    assertEquals(calls.recordedEvents.length, 1);
    assertEquals(calls.recordedEvents[0].status, 'grace', 'status snapshot recorded');
  },
);

Deno.test('an audit-event conflict (concurrent insert) does not break the response', async () => {
  const { deps } = makeDeps({ eventConflict: true });
  const res = await handleAccessCheckout(
    makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
    deps,
  );
  assertEquals(res.status, 200, 'status');
  const body = await jsonOf(res);
  assert(typeof body.url === 'string' && body.url.length > 0, 'still returns the checkout url');
});

Deno.test(
  'a durable completion exception fails closed after Stripe creates a session',
  async () => {
    const { deps } = makeDeps({ throwCompleteCheckoutAttempt: true });
    const res = await handleAccessCheckout(
      makeReq('POST', { origin: ORIGIN, auth: AUTH, body: {} }),
      deps,
    );
    assertEquals(res.status, 502, 'status');
    assertEquals(await jsonOf(res), { error: 'checkout_failed' });
  },
);
