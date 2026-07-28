// @ts-nocheck
// appAccess.test.ts - focused, network-free tests for the pure app-access
// webhook reconciliation boundary (./appAccess.ts).
//
// Mirrors the sibling create-access-checkout/index.test.ts conventions:
// Deno.test + self-contained assertion helpers + bounded injected inputs, never
// touching the network. A minimal Deno.test shim lets this suite run under both
// Deno (if installed) and a Node >=23 type-stripping harness (Deno is absent in
// this environment; `node --test <file>` executes it through the shim).
//
// Run (Node, no network): node --test supabase/functions/stripe-webhook/appAccess.test.ts
// Run (Deno, if present):  deno test --allow-env supabase/functions/stripe-webhook/appAccess.test.ts

import { test as __nodeTest } from 'node:test';
import { reconcileAppAccessEvent } from './appAccess.ts';

if (typeof globalThis.Deno === 'undefined') {
  globalThis.Deno = {
    test(name, fn) {
      return __nodeTest(name, fn);
    },
  };
}

// --- assertion helpers (self-contained; no external deps) -------------------
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
function assertIncludes(haystack, needle, msg) {
  if (typeof haystack !== 'string' || haystack.indexOf(needle) === -1) {
    throw new AssertionError(
      (msg ? msg + ': ' : '') + 'expected to include ' + JSON.stringify(needle),
    );
  }
}
// Recursively assert no command targets profiles and no object carries a tier key.
function assertNoFeatureTier(value, path) {
  path = path || '$';
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoFeatureTier(v, path + '[' + i + ']'));
    return;
  }
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) {
      assert(k !== 'tier', 'unexpected feature-tier key at ' + path + '.tier');
      if (k === 'table') assert(value[k] !== 'profiles', 'unexpected profiles table at ' + path);
      assertNoFeatureTier(value[k], path + '.' + k);
    }
  }
}
const ALLOWED_AUDIT_KEYS = [
  'event_type',
  'occurred_at',
  'provider_event_id',
  'reason',
  'status',
  'stripe_subscription_id',
  'user_id',
];
const ALLOWED_EVENT_TYPES = [
  'trial_started',
  'checkout_created',
  'payment_succeeded',
  'payment_failed',
  'subscription_cancelled',
  'grace_started',
  'grace_ended',
  'lock_applied',
  'access_restored',
  'admin_override',
];
function assertBoundedAudit(events) {
  assert(Array.isArray(events), 'events must be an array');
  for (const ev of events) {
    assertEquals(ev.table, 'app_access_events', 'audit table');
    assertEquals(ev.op, 'insert', 'audit op');
    assertEquals(
      Object.keys(ev.set).sort(),
      ALLOWED_AUDIT_KEYS,
      'audit set keys are exactly the bounded columns',
    );
    assert(
      ALLOWED_EVENT_TYPES.indexOf(ev.set.event_type) !== -1,
      'event_type in allowed set: ' + ev.set.event_type,
    );
    const blob = JSON.stringify(ev.set);
    assert(blob.indexOf('sk_') === -1, 'no secret material in audit row');
    assert(
      ev.set.provider_event_id === null || typeof ev.set.provider_event_id === 'string',
      'provider_event_id bounded',
    );
  }
}

// --- fixtures ---------------------------------------------------------------
const KNOWN = ['price_access_usd_20', 'price_access_promo'];
const FEATURE = 'price_feature_pro';
const UID = '11111111-1111-4111-8111-111111111111';
const UID2 = '22222222-2222-4222-8222-222222222222';
const CUS = 'cus_A';
const SUB = 'sub_A';
const T0 = 1750000000; // unix seconds baseline
const DAY = 86400;
function iso(unix) {
  return new Date(unix * 1000).toISOString();
}
function makeConfig(over) {
  return Object.assign({ knownPriceIds: KNOWN.slice(), graceDays: 3 }, over || {});
}
function makeProjection(over) {
  return Object.assign(
    {
      eventId: 'evt_1',
      eventType: 'checkout.session.completed',
      eventCreated: T0,
      priceIds: KNOWN.slice(0, 1),
      userId: UID,
      customerId: CUS,
      subscriptionId: SUB,
      metadata: { supabase_user_id: UID, access_product: 'vibespace_access' },
      subscription: {
        status: 'active',
        cancelAtPeriodEnd: false,
        currentPeriodStart: T0,
        currentPeriodEnd: T0 + 30 * DAY,
        trialStart: null,
        trialEnd: null,
        endedAt: null,
      },
      invoice: null,
    },
    over || {},
  );
}
function makeCurrent(over) {
  return Object.assign(
    {
      userId: UID,
      status: 'active',
      providerStatus: 'active',
      providerStatusUpdatedAt: iso(T0 - DAY),
      stripeCustomerId: CUS,
      stripeSubscriptionId: SUB,
      stripePriceId: KNOWN[0],
      currentPeriodStart: iso(T0 - DAY),
      currentPeriodEnd: iso(T0 + 29 * DAY),
      cancelAtPeriodEnd: false,
      lastPaymentStatus: 'succeeded',
      accessEndedAt: null,
      trialStartedAt: null,
      trialEndsAt: null,
      trialUsedAt: null,
      graceStartedAt: null,
      graceEndsAt: null,
      lockedAt: null,
      revision: 1,
    },
    over || {},
  );
}
function rec(input) {
  return reconcileAppAccessEvent(input);
}

// --- event family: checkout.session.completed -------------------------------
Deno.test(
  'checkout.session.completed (paid active) yields active entitlement + payment_succeeded audit',
  () => {
    const r = rec({ projection: makeProjection(), current: null, config: makeConfig() });
    assertEquals(r.kind, 'apply');
    assertEquals(r.status, 'active');
    assertEquals(r.entitlement.table, 'app_access_entitlements');
    assertEquals(r.entitlement.op, 'upsert');
    assertEquals(r.entitlement.key, { user_id: UID });
    const set = r.entitlement.set;
    assertEquals(set.status, 'active');
    assertEquals(set.provider_status, 'active');
    assertEquals(set.provider_status_updated_at, iso(T0));
    assertEquals(set.stripe_customer_id, CUS);
    assertEquals(set.stripe_subscription_id, SUB);
    assertEquals(set.stripe_price_id, KNOWN[0]);
    assertEquals(set.current_period_end, iso(T0 + 30 * DAY));
    assertEquals(set.cancel_at_period_end, false);
    assertEquals(set.last_payment_status, 'succeeded');
    assertEquals(set.access_ended_at, null);
    assertEquals(r.events.length, 1);
    assertEquals(r.events[0].set.event_type, 'payment_succeeded');
    assertEquals(r.events[0].set.provider_event_id, 'evt_1');
    assertEquals(r.events[0].set.user_id, UID);
    assertEquals(r.events[0].set.occurred_at, iso(T0));
    assertBoundedAudit(r.events);
    assertNoFeatureTier(r);
  },
);

Deno.test(
  'checkout.session.completed with a trial yields trialing entitlement + trial_started audit',
  () => {
    const p = makeProjection({
      subscription: {
        status: 'trialing',
        cancelAtPeriodEnd: false,
        currentPeriodStart: T0,
        currentPeriodEnd: T0 + 30 * DAY,
        trialStart: T0,
        trialEnd: T0 + 14 * DAY,
        endedAt: null,
      },
    });
    const r = rec({ projection: p, current: null, config: makeConfig() });
    assertEquals(r.kind, 'apply');
    assertEquals(r.status, 'trialing');
    assertEquals(r.entitlement.set.status, 'trialing');
    assertEquals(r.entitlement.set.provider_status, 'trialing');
    assertEquals(r.entitlement.set.trial_started_at, iso(T0));
    assertEquals(r.entitlement.set.trial_ends_at, iso(T0 + 14 * DAY));
    assertEquals(r.events[0].set.event_type, 'trial_started');
    assertNoFeatureTier(r);
  },
);

Deno.test(
  'checkout resolves the user from session metadata supabase_user_id when userId is absent',
  () => {
    const p = makeProjection({
      userId: null,
      metadata: { supabase_user_id: UID, access_product: 'vibespace_access' },
    });
    const r = rec({ projection: p, current: null, config: makeConfig() });
    assertEquals(r.kind, 'apply');
    assertEquals(r.entitlement.key, { user_id: UID });
    assertEquals(r.events[0].set.user_id, UID);
  },
);

// --- event family: subscription created/updated/deleted ---------------------
Deno.test(
  'customer.subscription.created (active) applies against the current entitlement owner',
  () => {
    const p = makeProjection({
      eventType: 'customer.subscription.created',
      userId: null,
      metadata: null,
    });
    const r = rec({ projection: p, current: makeCurrent(), config: makeConfig() });
    assertEquals(r.kind, 'apply');
    assertEquals(r.status, 'active');
    assertEquals(r.entitlement.key, { user_id: UID });
    assertEquals(r.entitlement.set.provider_status, 'active');
    assertEquals(r.events[0].set.event_type, 'payment_succeeded');
    assertNoFeatureTier(r);
  },
);

Deno.test(
  'customer.subscription.updated with cancel_at_period_end keeps access and marks cancel_at_period_end',
  () => {
    const p = makeProjection({
      eventType: 'customer.subscription.updated',
      userId: null,
      metadata: null,
      subscription: {
        status: 'active',
        cancelAtPeriodEnd: true,
        currentPeriodStart: T0,
        currentPeriodEnd: T0 + 30 * DAY,
        trialStart: null,
        trialEnd: null,
        endedAt: null,
      },
    });
    const r = rec({ projection: p, current: makeCurrent(), config: makeConfig() });
    assertEquals(r.kind, 'apply');
    assertEquals(r.status, 'cancel_at_period_end');
    assertEquals(r.entitlement.set.status, 'cancel_at_period_end');
    assertEquals(r.entitlement.set.cancel_at_period_end, true);
    assertEquals(r.entitlement.set.access_ended_at, null, 'still entitled through the period');
    assertEquals(r.events[0].set.event_type, 'subscription_cancelled');
    assertEquals(r.events[0].set.reason, 'cancel_at_period_end');
  },
);

Deno.test(
  'customer.subscription.updated to past_due marks past_due + payment_failed and keeps access',
  () => {
    const p = makeProjection({
      eventType: 'customer.subscription.updated',
      userId: null,
      metadata: null,
      subscription: {
        status: 'past_due',
        cancelAtPeriodEnd: false,
        currentPeriodStart: T0,
        currentPeriodEnd: T0 + 30 * DAY,
        trialStart: null,
        trialEnd: null,
        endedAt: null,
      },
    });
    const r = rec({ projection: p, current: makeCurrent(), config: makeConfig() });
    assertEquals(r.kind, 'apply');
    assertEquals(r.status, 'past_due');
    assertEquals(r.entitlement.set.provider_status, 'past_due');
    assertEquals(r.entitlement.set.last_payment_status, 'failed');
    assertEquals(r.entitlement.set.access_ended_at, null);
    assertEquals(r.events[0].set.event_type, 'payment_failed');
  },
);

Deno.test(
  'customer.subscription.updated recovering from past_due to active restores access (access_restored)',
  () => {
    const p = makeProjection({
      eventType: 'customer.subscription.updated',
      userId: null,
      metadata: null,
      eventCreated: T0 + 2 * DAY,
      subscription: {
        status: 'active',
        cancelAtPeriodEnd: false,
        currentPeriodStart: T0,
        currentPeriodEnd: T0 + 30 * DAY,
        trialStart: null,
        trialEnd: null,
        endedAt: null,
      },
    });
    const cur = makeCurrent({
      status: 'past_due',
      providerStatus: 'past_due',
      providerStatusUpdatedAt: iso(T0 + DAY),
      lastPaymentStatus: 'failed',
    });
    const r = rec({ projection: p, current: cur, config: makeConfig() });
    assertEquals(r.kind, 'apply');
    assertEquals(r.status, 'active');
    assertEquals(r.entitlement.set.status, 'active');
    assertEquals(r.entitlement.set.access_ended_at, null);
    assertEquals(r.events[0].set.event_type, 'access_restored');
  },
);

Deno.test(
  'customer.subscription.deleted within the grace window ends access to grace with bounded grace fields',
  () => {
    const ended = T0 + 5 * DAY;
    const p = makeProjection({
      eventType: 'customer.subscription.deleted',
      userId: null,
      metadata: null,
      eventCreated: ended,
      subscription: {
        status: 'canceled',
        cancelAtPeriodEnd: false,
        currentPeriodStart: T0,
        currentPeriodEnd: ended,
        trialStart: null,
        trialEnd: null,
        endedAt: ended,
      },
    });
    const cur = makeCurrent({ providerStatusUpdatedAt: iso(T0) });
    const r = rec({ projection: p, current: cur, config: makeConfig({ graceDays: 3 }) });
    assertEquals(r.kind, 'apply');
    assertEquals(r.status, 'grace');
    const set = r.entitlement.set;
    assertEquals(set.status, 'grace');
    assertEquals(set.provider_status, 'canceled');
    assertEquals(set.access_ended_at, iso(ended));
    assertEquals(set.grace_started_at, iso(ended));
    assertEquals(set.grace_ends_at, iso(ended + 3 * DAY));
    assertEquals(set.locked_at, null);
    assertEquals(r.events[0].set.event_type, 'subscription_cancelled');
    assertEquals(r.events[0].set.reason, 'subscription_deleted');
  },
);

Deno.test('customer.subscription.deleted with zero grace days locks immediately', () => {
  const ended = T0 + 5 * DAY;
  const p = makeProjection({
    eventType: 'customer.subscription.deleted',
    userId: null,
    metadata: null,
    eventCreated: ended,
    subscription: {
      status: 'canceled',
      cancelAtPeriodEnd: false,
      currentPeriodStart: T0,
      currentPeriodEnd: ended,
      trialStart: null,
      trialEnd: null,
      endedAt: ended,
    },
  });
  const cur = makeCurrent({ providerStatusUpdatedAt: iso(T0) });
  const r = rec({ projection: p, current: cur, config: makeConfig({ graceDays: 0 }) });
  assertEquals(r.kind, 'apply');
  assertEquals(r.status, 'locked');
  assertEquals(r.entitlement.set.status, 'locked');
  assertEquals(r.entitlement.set.locked_at, iso(ended));
  assertEquals(r.entitlement.set.access_ended_at, iso(ended));
});

// --- SECTION: invoice, trial_will_end, classification, isolation, ordering, guards, immutability, validation ---

// --- event family: invoice + trial_will_end ---------------------------------
Deno.test(
  'invoice.payment_succeeded on an active entitlement records payment_succeeded and keeps active',
  () => {
    const p = makeProjection({
      eventType: 'invoice.payment_succeeded',
      userId: null,
      metadata: null,
      subscription: null,
      invoice: { paid: true, status: 'paid' },
    });
    const r = rec({ projection: p, current: makeCurrent(), config: makeConfig() });
    assertEquals(r.kind, 'apply');
    assertEquals(r.status, 'active');
    assertEquals(r.entitlement.set.last_payment_status, 'succeeded');
    assertEquals(r.entitlement.set.status, 'active');
    assertEquals(r.events[0].set.event_type, 'payment_succeeded');
    assertEquals(r.events[0].set.stripe_subscription_id, SUB);
  },
);

Deno.test(
  'invoice.payment_succeeded recovering from past_due restores access (access_restored)',
  () => {
    const p = makeProjection({
      eventType: 'invoice.payment_succeeded',
      userId: null,
      metadata: null,
      eventCreated: T0 + DAY,
      subscription: null,
      invoice: { paid: true, status: 'paid' },
    });
    const cur = makeCurrent({
      status: 'past_due',
      providerStatus: 'past_due',
      providerStatusUpdatedAt: iso(T0),
      lastPaymentStatus: 'failed',
    });
    const r = rec({ projection: p, current: cur, config: makeConfig() });
    assertEquals(r.kind, 'apply');
    assertEquals(r.status, 'active');
    assertEquals(r.entitlement.set.status, 'active');
    assertEquals(r.entitlement.set.access_ended_at, null);
    assertEquals(r.entitlement.set.grace_started_at, null);
    assertEquals(r.entitlement.set.grace_ends_at, null);
    assertEquals(r.entitlement.set.locked_at, null);
    assertEquals(r.entitlement.set.last_payment_status, 'succeeded');
    assertEquals(r.events[0].set.event_type, 'access_restored');
  },
);

Deno.test(
  'invoice.payment_failed marks past_due + payment_failed and keeps access during dunning',
  () => {
    const p = makeProjection({
      eventType: 'invoice.payment_failed',
      userId: null,
      metadata: null,
      eventCreated: T0 + DAY,
      subscription: null,
      invoice: { paid: false, status: 'open' },
    });
    const r = rec({ projection: p, current: makeCurrent(), config: makeConfig() });
    assertEquals(r.kind, 'apply');
    assertEquals(r.status, 'past_due');
    assertEquals(r.entitlement.set.status, 'past_due');
    assertEquals(r.entitlement.set.provider_status, 'past_due');
    assertEquals(r.entitlement.set.last_payment_status, 'failed');
    assertEquals(r.entitlement.set.access_ended_at, null);
    assertEquals(r.events[0].set.event_type, 'payment_failed');
  },
);

Deno.test(
  'customer.subscription.trial_will_end for a known price is normalized to a no-mutation noop',
  () => {
    const p = makeProjection({
      eventType: 'customer.subscription.trial_will_end',
      userId: null,
      metadata: null,
      subscription: {
        status: 'trialing',
        cancelAtPeriodEnd: false,
        currentPeriodStart: T0,
        currentPeriodEnd: T0 + 30 * DAY,
        trialStart: T0,
        trialEnd: T0 + 14 * DAY,
        endedAt: null,
      },
    });
    const r = rec({
      projection: p,
      current: makeCurrent({ status: 'trialing', providerStatus: 'trialing' }),
      config: makeConfig(),
    });
    assertEquals(r.kind, 'noop');
    assertEquals(r.reason, 'informational_no_mutation');
    assert(r.entitlement === undefined, 'noop carries no entitlement command');
    assert(r.events === undefined, 'noop carries no audit commands');
  },
);

// --- classification ---------------------------------------------------------
Deno.test('an unknown price is ignored with no mutation commands and no feature-tier touch', () => {
  const p = makeProjection({ priceIds: ['price_mystery'] });
  const r = rec({ projection: p, current: null, config: makeConfig() });
  assertEquals(r.kind, 'ignored');
  assertEquals(r.reason, 'unknown_price');
  assert(r.entitlement === undefined, 'ignored carries no entitlement command');
  assert(r.events === undefined, 'ignored carries no audit commands');
  assertNoFeatureTier(r);
});

Deno.test(
  'mixed subscription items classify the known app-access price (feature price ignored)',
  () => {
    const p = makeProjection({ priceIds: [FEATURE, KNOWN[1]] });
    const r = rec({ projection: p, current: null, config: makeConfig() });
    assertEquals(r.kind, 'apply');
    assertEquals(r.entitlement.set.stripe_price_id, KNOWN[1]);
  },
);

Deno.test(
  'a subscription with only feature-tier prices is ignored (never maps into profiles.tier)',
  () => {
    const p = makeProjection({ priceIds: [FEATURE, 'price_feature_team'] });
    const r = rec({ projection: p, current: null, config: makeConfig() });
    assertEquals(r.kind, 'ignored');
    assertEquals(r.reason, 'unknown_price');
    assertNoFeatureTier(r);
  },
);

Deno.test(
  'metadata access_product mismatch is ignored as not_app_access even with a known price',
  () => {
    const p = makeProjection({
      metadata: { supabase_user_id: UID, access_product: 'something_else' },
    });
    const r = rec({ projection: p, current: null, config: makeConfig() });
    assertEquals(r.kind, 'ignored');
    assertEquals(r.reason, 'not_app_access');
  },
);

// --- isolation + fail-closed validation -------------------------------------
Deno.test('checkout with no resolvable user fails closed as invalid no_user', () => {
  const p = makeProjection({ userId: null, metadata: null });
  const r = rec({ projection: p, current: null, config: makeConfig() });
  assertEquals(r.kind, 'invalid');
  assertEquals(r.reason, 'no_user');
  assert(r.entitlement === undefined, 'invalid carries no entitlement command');
});

Deno.test('a non-UUID user id fails closed as invalid bad_user', () => {
  const p = makeProjection({
    userId: 'not-a-uuid',
    metadata: { supabase_user_id: 'not-a-uuid', access_product: 'vibespace_access' },
  });
  const r = rec({ projection: p, current: null, config: makeConfig() });
  assertEquals(r.kind, 'invalid');
  assertEquals(r.reason, 'bad_user');
});

Deno.test(
  'cross-user metadata versus the current entitlement owner fails closed (account isolation)',
  () => {
    const p = makeProjection({
      eventType: 'customer.subscription.updated',
      userId: null,
      metadata: { supabase_user_id: UID2, access_product: 'vibespace_access' },
      subscription: {
        status: 'active',
        cancelAtPeriodEnd: false,
        currentPeriodStart: T0,
        currentPeriodEnd: T0 + 30 * DAY,
        trialStart: null,
        trialEnd: null,
        endedAt: null,
      },
    });
    const r = rec({ projection: p, current: makeCurrent(), config: makeConfig() });
    assertEquals(r.kind, 'invalid');
    assertEquals(r.reason, 'cross_user_metadata');
  },
);

Deno.test(
  'a subscription id that does not match the current entitlement fails closed (subscription_mismatch)',
  () => {
    const p = makeProjection({
      eventType: 'customer.subscription.updated',
      userId: null,
      metadata: null,
      subscriptionId: 'sub_OTHER',
      subscription: {
        status: 'active',
        cancelAtPeriodEnd: false,
        currentPeriodStart: T0,
        currentPeriodEnd: T0 + 30 * DAY,
        trialStart: null,
        trialEnd: null,
        endedAt: null,
      },
    });
    const r = rec({ projection: p, current: makeCurrent(), config: makeConfig() });
    assertEquals(r.kind, 'invalid');
    assertEquals(r.reason, 'subscription_mismatch');
  },
);

Deno.test('a subscription event with no current entitlement fails closed as no_entitlement', () => {
  const p = makeProjection({
    eventType: 'customer.subscription.updated',
    userId: null,
    metadata: null,
    subscription: {
      status: 'active',
      cancelAtPeriodEnd: false,
      currentPeriodStart: T0,
      currentPeriodEnd: T0 + 30 * DAY,
      trialStart: null,
      trialEnd: null,
      endedAt: null,
    },
  });
  const r = rec({ projection: p, current: null, config: makeConfig() });
  assertEquals(r.kind, 'invalid');
  assertEquals(r.reason, 'no_entitlement');
});

// --- idempotency + out-of-order safety --------------------------------------
Deno.test(
  'an already-processed provider event id short-circuits as duplicate with no commands',
  () => {
    const r = rec({
      projection: makeProjection(),
      current: null,
      config: makeConfig(),
      eventAlreadyProcessed: true,
    });
    assertEquals(r.kind, 'duplicate');
    assert(r.entitlement === undefined, 'duplicate carries no entitlement command');
    assert(r.events === undefined, 'duplicate carries no audit commands');
  },
);

Deno.test(
  'an out-of-order update older than the current provider timestamp is stale and does not roll back',
  () => {
    const p = makeProjection({
      eventType: 'customer.subscription.updated',
      userId: null,
      metadata: null,
      eventCreated: T0 - 2 * DAY,
      subscription: {
        status: 'past_due',
        cancelAtPeriodEnd: false,
        currentPeriodStart: T0,
        currentPeriodEnd: T0 + 30 * DAY,
        trialStart: null,
        trialEnd: null,
        endedAt: null,
      },
    });
    const cur = makeCurrent({
      status: 'active',
      providerStatus: 'active',
      providerStatusUpdatedAt: iso(T0),
    });
    const r = rec({ projection: p, current: cur, config: makeConfig() });
    assertEquals(r.kind, 'stale');
    assertEquals(r.reason, 'out_of_order');
    assert(r.entitlement === undefined, 'stale carries no entitlement command');
  },
);

Deno.test(
  'an out-of-order deletion older than the current provider timestamp is stale (no premature lock)',
  () => {
    const ended = T0 - DAY;
    const p = makeProjection({
      eventType: 'customer.subscription.deleted',
      userId: null,
      metadata: null,
      eventCreated: ended,
      subscription: {
        status: 'canceled',
        cancelAtPeriodEnd: false,
        currentPeriodStart: T0 - 30 * DAY,
        currentPeriodEnd: ended,
        trialStart: null,
        trialEnd: null,
        endedAt: ended,
      },
    });
    const cur = makeCurrent({
      status: 'active',
      providerStatus: 'active',
      providerStatusUpdatedAt: iso(T0),
    });
    const r = rec({ projection: p, current: cur, config: makeConfig() });
    assertEquals(r.kind, 'stale');
  },
);

// --- guards: no profiles.tier, immutability, bounded audit ------------------
Deno.test('cancellation commands never reference profiles or tier', () => {
  const ended = T0 + 5 * DAY;
  const p = makeProjection({
    eventType: 'customer.subscription.deleted',
    userId: null,
    metadata: null,
    eventCreated: ended,
    subscription: {
      status: 'canceled',
      cancelAtPeriodEnd: false,
      currentPeriodStart: T0,
      currentPeriodEnd: ended,
      trialStart: null,
      trialEnd: null,
      endedAt: ended,
    },
  });
  const r = rec({
    projection: p,
    current: makeCurrent({ providerStatusUpdatedAt: iso(T0) }),
    config: makeConfig(),
  });
  assertEquals(r.kind, 'apply');
  assertNoFeatureTier(r);
  const blob = JSON.stringify(r);
  assert(blob.indexOf('profiles') === -1, 'no profiles reference anywhere');
  assert(blob.indexOf('tier') === -1, 'no tier field anywhere');
});

Deno.test('inputs are never mutated and outputs are immutable (frozen)', () => {
  const projection = makeProjection();
  const current = makeCurrent();
  const config = makeConfig();
  const snapshot = JSON.stringify({ projection, current, config });
  const r = rec({ projection, current, config });
  assertEquals(JSON.stringify({ projection, current, config }), snapshot, 'inputs unchanged');
  assert(Object.isFrozen(r), 'result is frozen');
  assert(Object.isFrozen(r.entitlement), 'entitlement command frozen');
  assert(Object.isFrozen(r.entitlement.set), 'entitlement set frozen');
  assert(Object.isFrozen(r.events), 'events frozen');
  assert(Object.isFrozen(r.events[0].set), 'audit set frozen');
  let threw = false;
  try {
    r.entitlement.set.status = 'hacked';
  } catch (_e) {
    threw = true;
  }
  assert(threw || r.entitlement.set.status === 'active', 'output cannot be mutated');
});

// --- fail-closed field validation -------------------------------------------
Deno.test('an unsupported event type fails closed as invalid', () => {
  const p = makeProjection({ eventType: 'customer.discount.created' });
  const r = rec({ projection: p, current: null, config: makeConfig() });
  assertEquals(r.kind, 'invalid');
  assertEquals(r.reason, 'unsupported_event');
});

Deno.test('a missing provider event id fails closed as invalid', () => {
  const p = makeProjection({ eventId: '' });
  const r = rec({ projection: p, current: null, config: makeConfig() });
  assertEquals(r.kind, 'invalid');
  assertEquals(r.reason, 'bad_event_id');
});

Deno.test('a non-finite event timestamp fails closed as invalid', () => {
  const p = makeProjection({ eventCreated: Number.NaN });
  const r = rec({ projection: p, current: null, config: makeConfig() });
  assertEquals(r.kind, 'invalid');
  assertEquals(r.reason, 'bad_event_created');
});

Deno.test('inverted subscription period bounds fail closed as invalid', () => {
  const p = makeProjection({
    subscription: {
      status: 'active',
      cancelAtPeriodEnd: false,
      currentPeriodStart: T0 + 30 * DAY,
      currentPeriodEnd: T0,
      trialStart: null,
      trialEnd: null,
      endedAt: null,
    },
  });
  const r = rec({ projection: p, current: null, config: makeConfig() });
  assertEquals(r.kind, 'invalid');
  assertEquals(r.reason, 'bad_period_bounds');
});

Deno.test('an unknown subscription status fails closed as invalid', () => {
  const p = makeProjection({
    eventType: 'customer.subscription.updated',
    userId: null,
    metadata: null,
    subscription: {
      status: 'wat',
      cancelAtPeriodEnd: false,
      currentPeriodStart: T0,
      currentPeriodEnd: T0 + 30 * DAY,
      trialStart: null,
      trialEnd: null,
      endedAt: null,
    },
  });
  const r = rec({ projection: p, current: makeCurrent(), config: makeConfig() });
  assertEquals(r.kind, 'invalid');
  assertEquals(r.reason, 'bad_subscription_status');
});

Deno.test(
  'entitlement commands keep provider_status paired with its timestamp and access_ended_at only for ended states',
  () => {
    const active = rec({ projection: makeProjection(), current: null, config: makeConfig() });
    const aSet = active.entitlement.set;
    assert(
      (aSet.provider_status === null) === (aSet.provider_status_updated_at === null),
      'provider status and timestamp paired (active)',
    );
    assertEquals(aSet.access_ended_at, null, 'active has no access_ended_at');
    const ended = T0 + 5 * DAY;
    const p = makeProjection({
      eventType: 'customer.subscription.deleted',
      userId: null,
      metadata: null,
      eventCreated: ended,
      subscription: {
        status: 'canceled',
        cancelAtPeriodEnd: false,
        currentPeriodStart: T0,
        currentPeriodEnd: ended,
        trialStart: null,
        trialEnd: null,
        endedAt: ended,
      },
    });
    const del = rec({
      projection: p,
      current: makeCurrent({ providerStatusUpdatedAt: iso(T0) }),
      config: makeConfig(),
    });
    const dSet = del.entitlement.set;
    assert(
      (dSet.provider_status === null) === (dSet.provider_status_updated_at === null),
      'provider status and timestamp paired (deleted)',
    );
    assert(
      ['canceled', 'unpaid', 'incomplete_expired'].indexOf(dSet.provider_status) !== -1,
      'access_ended_at only for ended provider status',
    );
    assert(dSet.access_ended_at !== null, 'deleted sets access_ended_at');
  },
);

Deno.test('an out-of-range event timestamp fails closed instead of throwing', () => {
  const p = makeProjection({ eventCreated: Number.MAX_SAFE_INTEGER });
  const r = rec({ projection: p, current: null, config: makeConfig() });
  assertEquals(r.kind, 'invalid');
  assertEquals(r.reason, 'bad_event_created');
});

Deno.test('fractional event timestamps fail closed as invalid', () => {
  const p = makeProjection({ eventCreated: T0 + 0.5 });
  const r = rec({ projection: p, current: null, config: makeConfig() });
  assertEquals(r.kind, 'invalid');
  assertEquals(r.reason, 'bad_event_created');
});

Deno.test('invalid reconciliation config fails closed before classifying a price', () => {
  const negativeGrace = rec({
    projection: makeProjection(),
    current: null,
    config: makeConfig({ graceDays: -1 }),
  });
  assertEquals(negativeGrace.kind, 'invalid');
  assertEquals(negativeGrace.reason, 'bad_config');

  const unboundedPrice = rec({
    projection: makeProjection(),
    current: null,
    config: makeConfig({ knownPriceIds: ['x'.repeat(256)] }),
  });
  assertEquals(unboundedPrice.kind, 'invalid');
  assertEquals(unboundedPrice.reason, 'bad_config');
});

Deno.test('malformed projected price ids fail closed rather than becoming an ignored event', () => {
  const p = makeProjection({ priceIds: ['x'.repeat(256)] });
  const r = rec({ projection: p, current: null, config: makeConfig() });
  assertEquals(r.kind, 'invalid');
  assertEquals(r.reason, 'bad_price_ids');
});

Deno.test(
  'trial_will_end validates its event envelope and subscription before returning noop',
  () => {
    const malformedEvent = makeProjection({
      eventId: '',
      eventType: 'customer.subscription.trial_will_end',
    });
    const invalidEvent = rec({
      projection: malformedEvent,
      current: makeCurrent({ status: 'trialing', providerStatus: 'trialing' }),
      config: makeConfig(),
    });
    assertEquals(invalidEvent.kind, 'invalid');
    assertEquals(invalidEvent.reason, 'bad_event_id');

    const malformedSubscription = makeProjection({
      eventType: 'customer.subscription.trial_will_end',
      subscription: { status: 'wat' },
    });
    const invalidSubscription = rec({
      projection: malformedSubscription,
      current: makeCurrent({ status: 'trialing', providerStatus: 'trialing' }),
      config: makeConfig(),
    });
    assertEquals(invalidSubscription.kind, 'invalid');
    assertEquals(invalidSubscription.reason, 'bad_subscription_status');
  },
);

Deno.test('invoice event semantics must agree with the verified invoice projection', () => {
  const falseSuccess = makeProjection({
    eventType: 'invoice.payment_succeeded',
    userId: null,
    metadata: null,
    subscription: null,
    invoice: { paid: false, status: 'open' },
  });
  const successResult = rec({
    projection: falseSuccess,
    current: makeCurrent(),
    config: makeConfig(),
  });
  assertEquals(successResult.kind, 'invalid');
  assertEquals(successResult.reason, 'invoice_event_mismatch');

  const falseFailure = makeProjection({
    eventType: 'invoice.payment_failed',
    userId: null,
    metadata: null,
    subscription: null,
    invoice: { paid: true, status: 'paid' },
  });
  const failureResult = rec({
    projection: falseFailure,
    current: makeCurrent(),
    config: makeConfig(),
  });
  assertEquals(failureResult.kind, 'invalid');
  assertEquals(failureResult.reason, 'invoice_event_mismatch');
});

Deno.test('a deletion event with a non-terminal subscription status fails closed', () => {
  const p = makeProjection({
    eventType: 'customer.subscription.deleted',
    userId: null,
    metadata: null,
    subscription: {
      status: 'active',
      cancelAtPeriodEnd: false,
      currentPeriodStart: T0,
      currentPeriodEnd: T0 + 30 * DAY,
      trialStart: null,
      trialEnd: null,
      endedAt: null,
    },
  });
  const r = rec({ projection: p, current: makeCurrent(), config: makeConfig() });
  assertEquals(r.kind, 'invalid');
  assertEquals(r.reason, 'deleted_subscription_not_terminal');
});

Deno.test('invoice events cannot resurrect or downgrade a terminal provider state', () => {
  const terminal = makeCurrent({
    status: 'locked',
    providerStatus: 'canceled',
    providerStatusUpdatedAt: iso(T0),
    accessEndedAt: iso(T0),
    graceStartedAt: iso(T0),
    graceEndsAt: iso(T0 + 3 * DAY),
    lockedAt: iso(T0 + 3 * DAY),
  });
  for (const eventType of ['invoice.payment_succeeded', 'invoice.payment_failed']) {
    const p = makeProjection({
      eventId:
        eventType === 'invoice.payment_succeeded' ? 'evt_terminal_paid' : 'evt_terminal_fail',
      eventType,
      eventCreated: T0 + DAY,
      userId: null,
      metadata: null,
      subscription: null,
      invoice:
        eventType === 'invoice.payment_succeeded'
          ? { paid: true, status: 'paid' }
          : { paid: false, status: 'open' },
    });
    const r = rec({ projection: p, current: terminal, config: makeConfig() });
    assertEquals(r.kind, 'stale');
    assertEquals(r.reason, 'terminal_subscription');
    assert(r.entitlement === undefined, 'terminal invoice event carries no mutation');
  }
});

Deno.test('multiple distinct configured app-access prices fail closed as ambiguous', () => {
  const p = makeProjection({ priceIds: [KNOWN[0], KNOWN[1]] });
  const r = rec({ projection: p, current: null, config: makeConfig() });
  assertEquals(r.kind, 'invalid');
  assertEquals(r.reason, 'ambiguous_app_access_prices');
});

Deno.test('paused provider status maps to past_due rather than active access', () => {
  const p = makeProjection({
    eventType: 'customer.subscription.updated',
    userId: null,
    metadata: null,
    subscription: {
      status: 'paused',
      cancelAtPeriodEnd: false,
      currentPeriodStart: T0,
      currentPeriodEnd: T0 + 30 * DAY,
      trialStart: null,
      trialEnd: null,
      endedAt: null,
    },
  });
  const r = rec({ projection: p, current: makeCurrent(), config: makeConfig() });
  assertEquals(r.kind, 'apply');
  assertEquals(r.status, 'past_due');
  assertEquals(r.entitlement.set.provider_status, 'paused');
  assertEquals(r.entitlement.set.last_payment_status, 'failed');
});

Deno.test(
  'updates carry the current revision and provider timestamp concurrency precondition',
  () => {
    const current = makeCurrent({ revision: 17 });
    const p = makeProjection({
      eventType: 'customer.subscription.updated',
      userId: null,
      metadata: null,
    });
    const r = rec({ projection: p, current, config: makeConfig() });
    assertEquals(r.kind, 'apply');
    assertEquals(r.entitlement.expected_revision, 17);
    assertEquals(
      r.entitlement.expected_provider_status_updated_at,
      current.providerStatusUpdatedAt,
    );
  },
);

Deno.test(
  'terminal transitions emit bounded grace and lock audits with one provider dedupe id',
  () => {
    const ended = T0 + 5 * DAY;
    const p = makeProjection({
      eventId: 'evt_terminal_transition',
      eventType: 'customer.subscription.deleted',
      eventCreated: ended,
      userId: null,
      metadata: null,
      subscription: {
        status: 'canceled',
        cancelAtPeriodEnd: false,
        currentPeriodStart: T0,
        currentPeriodEnd: ended,
        trialStart: null,
        trialEnd: null,
        endedAt: ended,
      },
    });
    const r = rec({
      projection: p,
      current: makeCurrent(),
      config: makeConfig({ graceDays: 0 }),
    });
    assertEquals(r.kind, 'apply');
    assertEquals(
      r.events.map((event) => event.set.event_type),
      ['subscription_cancelled', 'grace_started', 'grace_ended', 'lock_applied'],
    );
    assertEquals(
      r.events.map((event) => event.set.provider_event_id),
      ['evt_terminal_transition', null, null, null],
    );
    assertEquals(r.entitlement.set.grace_ends_at, iso(ended));
    assertEquals(r.entitlement.set.locked_at, iso(ended));
    assertBoundedAudit(r.events);
  },
);
