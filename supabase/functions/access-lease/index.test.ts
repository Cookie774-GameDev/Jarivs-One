// Access lease issuer Edge Function tests.
//
// Harness: node:test + node:assert/strict (zero network/external imports), the
// accepted Node-runnable convention for VibeSpace Supabase function modules
// (Deno is not installed in this environment; `deno test` is reported SKIPPED).
// Issued leases are verified through the ACTUAL offlineLease verifier using
// generated ephemeral ECDSA P-256 keys and an injected deterministic clock.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  handleAccessLease,
  issueAccessLease,
  mapAuthoritativeStatus,
  mapAccessRpcSnapshot,
  computeIssuedExpiry,
  ACTIVE_PAID_MAX_OFFLINE_MS,
  GRACE_MAX_OFFLINE_MS,
  PAST_DUE_MAX_OFFLINE_MS,
} from './index.ts';
import { createOfflineLeaseVerifier } from '../../../app/src/features/access/offlineLease.ts';

const KID = 'test-key-2026';
const USER = 'user-abc-123';
const OTHER_USER = 'user-xyz-999';
const T0 = 1_750_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

type AuthoritativeAccess = {
  state: string;
  serverTimeMs: unknown;
  revision?: unknown;
  trialEndMs?: number;
  currentPeriodEndMs?: number;
  graceEndMs?: number;
};

type AccessLeaseDepsOverrides = {
  signingKey?: CryptoKey | null;
  keyId?: string;
  crypto?: Pick<SubtleCrypto, 'sign'>;
  authenticate?: (token: string) => Promise<string | null>;
  getAuthoritativeAccess?: (userId: string, token: string) => Promise<AuthoritativeAccess | null>;
};

type CallHandlerOptions = {
  method?: string;
  origin?: string;
  auth?: string | null;
  body?: unknown;
};

let privateKey: CryptoKey;
let publicKey: CryptoKey;
let otherPublicKey: CryptoKey;

before(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  privateKey = pair.privateKey;
  publicKey = pair.publicKey;
  const other = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  otherPublicKey = other.publicKey;
});
function makeDeps(overrides: AccessLeaseDepsOverrides = {}) {
  const authoritativeOverride = overrides.getAuthoritativeAccess;
  return {
    signingKey: privateKey,
    keyId: KID,
    crypto: globalThis.crypto.subtle,
    authenticate: async (token: string) => (token === 'valid-token' ? USER : null),
    getAuthoritativeAccess: async () => ({
      state: 'active',
      serverTimeMs: T0,
      revision: 7,
      currentPeriodEndMs: T0 + 30 * DAY,
    }),
    ...overrides,
    ...(authoritativeOverride
      ? {
          getAuthoritativeAccess: async (...args: [string, string]) => ({
            revision: 7,
            ...(await authoritativeOverride(...args)),
          }),
        }
      : {}),
  };
}

async function callHandler(deps: ReturnType<typeof makeDeps>, opts: CallHandlerOptions = {}) {
  const method = opts.method ?? 'POST';
  const headers: Record<string, string> = {
    origin: opts.origin ?? 'tauri://localhost',
  };
  if (opts.auth !== null)
    headers.authorization = opts.auth === undefined ? 'Bearer valid-token' : opts.auth;
  const init: RequestInit = { method, headers };
  if (opts.body !== undefined) {
    const body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
    if (body !== undefined) init.body = body;
    headers['content-type'] = 'application/json';
  }
  const req = new Request('https://fn.vibespace.local/access-lease', init);
  const res = await handleAccessLease(req, deps);
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { res, json };
}

function verifierAt(
  wallNow: number,
  expectedUserId = USER,
  trustedKeys: Record<string, CryptoKey> = { [KID]: publicKey },
) {
  const vault = new Map();
  return createOfflineLeaseVerifier({
    expectedUserId,
    trustedKeys,
    clock: { now: () => wallNow, monotonicNow: () => 0 },
    rollbackToleranceMs: 5000,
    freshnessStore: {
      durability: 'restart_safe',
      read: async (accountId) => vault.get(accountId) ?? null,
      write: async (accountId, value) => {
        vault.set(accountId, value);
      },
    },
  });
}

function statefulClock(wall: number) {
  let w = wall;
  let m = 0;
  return {
    clock: { now: () => w, monotonicNow: () => m },
    setWall: (v: number) => {
      w = v;
    },
    advanceMono: (ms: number) => {
      m += ms;
    },
  };
}

async function issueActive(depsOverrides: AccessLeaseDepsOverrides = {}) {
  const { json } = await callHandler(makeDeps(depsOverrides), {});
  return json;
}

function b64urlDecodeJson(seg: string): Record<string, unknown> {
  const b64 = seg.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

function decodeLease(lease: string) {
  const segments = lease.split('.');
  return {
    segments,
    header: b64urlDecodeJson(segments[0]),
    payload: b64urlDecodeJson(segments[1]),
    sigB64: segments[2],
  };
}
// --- Method and CORS -------------------------------------------------------

test('rejects non-POST methods with 405', async () => {
  for (const method of ['GET', 'PUT', 'DELETE', 'PATCH']) {
    const { res, json } = await callHandler(makeDeps(), { method });
    assert.equal(res.status, 405, method);
    assert.equal(json.error, 'method_not_allowed', method);
  }
});

test('answers OPTIONS preflight with 200 and restrictive CORS headers', async () => {
  const { res } = await callHandler(makeDeps(), { method: 'OPTIONS' });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), 'tauri://localhost');
  assert.match(res.headers.get('content-type') ?? '', /application\/json/);
});

// --- Authentication (server-side JWT) --------------------------------------

test('rejects a missing Authorization header with 401', async () => {
  const { res, json } = await callHandler(makeDeps(), { auth: null });
  assert.equal(res.status, 401);
  assert.equal(json.error, 'unauthorized');
});

test('rejects a non-Bearer authorization scheme with 401', async () => {
  const { res } = await callHandler(makeDeps(), { auth: 'Basic abc' });
  assert.equal(res.status, 401);
});

test('rejects a Bearer header with no token with 401', async () => {
  const { res } = await callHandler(makeDeps(), { auth: 'Bearer' });
  assert.equal(res.status, 401);
});

test('rejects an invalid JWT (authenticate resolves null) with 401', async () => {
  const { res } = await callHandler(makeDeps({ authenticate: async () => null }), {});
  assert.equal(res.status, 401);
});

test('rejects when authenticate throws with 401', async () => {
  const deps = makeDeps({
    authenticate: async () => {
      throw new Error('boom');
    },
  });
  const { res } = await callHandler(deps, {});
  assert.equal(res.status, 401);
});

// --- Signing configuration -------------------------------------------------

test('rejects a missing signing key with 500 lease_unconfigured', async () => {
  const { res, json } = await callHandler(makeDeps({ signingKey: null }), {});
  assert.equal(res.status, 500);
  assert.equal(json.error, 'lease_unconfigured');
});

test('rejects a missing key id with 500 lease_unconfigured', async () => {
  const { res } = await callHandler(makeDeps({ keyId: '' }), {});
  assert.equal(res.status, 500);
});

// --- Authoritative lookup dependency ---------------------------------------

test('rejects when getAuthoritativeAccess throws with 502', async () => {
  const deps = makeDeps({
    getAuthoritativeAccess: async () => {
      throw new Error('x');
    },
  });
  const { res, json } = await callHandler(deps, {});
  assert.equal(res.status, 502);
  assert.equal(json.error, 'access_lookup_failed');
});

test('rejects when getAuthoritativeAccess returns null with 502', async () => {
  const { res } = await callHandler(makeDeps({ getAuthoritativeAccess: async () => null }), {});
  assert.equal(res.status, 502);
});

test('passes the validated token and user id to the authoritative lookup', async () => {
  let received: [string, string] | null = null;
  const deps = makeDeps({
    getAuthoritativeAccess: async (...args: [string, string]) => {
      received = args;
      return {
        state: 'active',
        serverTimeMs: T0,
        currentPeriodEndMs: T0 + 30 * DAY,
      };
    },
  });

  const { res } = await callHandler(deps, {});

  assert.equal(res.status, 200);
  assert.deepEqual(received, [USER, 'valid-token']);
});

test('maps valid RPC timestamps and rejects malformed authoritative dates', () => {
  assert.deepEqual(
    mapAccessRpcSnapshot({
      status: 'active',
      enabled: true,
      canUseApp: true,
      revision: 7,
      serverTime: '2025-06-15T15:06:40.000Z',
      trialEndsAt: null,
      currentPeriodEndsAt: '2025-06-17T15:06:40.000Z',
      graceEndsAt: null,
    }),
    {
      state: 'active',
      serverTimeMs: T0,
      revision: 7,
      trialEndMs: null,
      currentPeriodEndMs: T0 + 2 * DAY,
      graceEndMs: null,
    },
  );

  for (const revision of [undefined, null, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, '7']) {
    assert.throws(
      () =>
        mapAccessRpcSnapshot({
          status: 'active',
          enabled: true,
          canUseApp: true,
          revision,
          serverTime: '2025-06-15T15:06:40.000Z',
          currentPeriodEndsAt: '2025-06-17T15:06:40.000Z',
        }),
      /access_lookup_failed/,
    );
  }

  for (const value of ['not-a-time', '2026-02-30T12:00:00Z', 42]) {
    assert.throws(
      () =>
        mapAccessRpcSnapshot({
          status: 'active',
          enabled: true,
          canUseApp: true,
          revision: 7,
          serverTime: '2025-06-15T15:06:40.000Z',
          currentPeriodEndsAt: value,
        }),
      /access_lookup_failed/,
    );
  }
});

test('rejects contradictory authoritative gate tuples before signing a lease', () => {
  for (const decision of [
    { status: 'active', enabled: false, canUseApp: true },
    { status: 'active', enabled: true, canUseApp: false },
    { status: 'locked', enabled: false, canUseApp: false },
    { status: 'unknown', enabled: true, canUseApp: true },
  ]) {
    assert.throws(
      () =>
        mapAccessRpcSnapshot({
          ...decision,
          revision: 7,
          serverTime: '2025-06-15T15:06:40.000Z',
          currentPeriodEndsAt: '2025-06-17T15:06:40.000Z',
        }),
      /access_lookup_failed/,
    );
  }
});

// --- Active issuance verified through the real verifier --------------------

test('issues an active lease that verifies through the real offlineLease verifier', async () => {
  const json = await issueActive();
  assert.ok(json.lease, 'lease issued');
  assert.equal(json.status, 'active');
  assert.equal(json.kid, KID);
  const r = await verifierAt(T0).evaluate(json.lease);
  assert.equal(r.allowed, true);
  assert.equal(r.reason, 'ok');
  assert.equal(r.status, 'active');
  assert.ok(r.verified);
  assert.equal(r.verified.sub, USER);
  assert.equal(r.verified.kid, KID);
  assert.equal(r.verified.v, 1);
  assert.equal(r.verified.alg, 'ES256');
  assert.equal(r.verified.revision, 7);
});

test('caps active expiry at iat + 7 days when period end is far', async () => {
  const json = await issueActive();
  assert.equal(json.iat, T0);
  assert.equal(json.exp, T0 + ACTIVE_PAID_MAX_OFFLINE_MS);
  const r = await verifierAt(T0).evaluate(json.lease);
  assert.ok(r.verified);
  assert.equal(r.verified.effectiveExp, T0 + ACTIVE_PAID_MAX_OFFLINE_MS);
});

test('caps active expiry at currentPeriodEnd when sooner', async () => {
  const deps = makeDeps({
    getAuthoritativeAccess: async () => ({
      state: 'active',
      serverTimeMs: T0,
      currentPeriodEndMs: T0 + 2 * DAY,
    }),
  });
  const { json } = await callHandler(deps, {});
  assert.equal(json.exp, T0 + 2 * DAY);
  const r = await verifierAt(T0).evaluate(json.lease);
  assert.equal(r.allowed, true);
  assert.ok(r.verified);
  assert.equal(r.verified.effectiveExp, T0 + 2 * DAY);
});

// --- Compact payload / no invasive fingerprint -----------------------------

test('lease payload carries only allowed claim keys (no invasive fingerprint)', async () => {
  const json = await issueActive();
  const { header, payload, segments } = decodeLease(json.lease);
  assert.equal(segments.length, 3);
  assert.deepEqual(Object.keys(header).sort(), ['alg', 'kid', 'v']);
  const allowed = [
    'sub',
    'status',
    'iat',
    'exp',
    'lst',
    'revision',
    'trialEnd',
    'currentPeriodEnd',
    'graceEnd',
  ];
  for (const key of Object.keys(payload))
    assert.ok(allowed.includes(key), `unexpected claim ${key}`);
  const banned = [
    'deviceId',
    'device_id',
    'ip',
    'userAgent',
    'user_agent',
    'fingerprint',
    'jti',
    'nonce',
    'price',
    'customer',
    'email',
  ];
  for (const key of banned) assert.ok(!(key in payload), `banned claim ${key} present`);
  assert.equal(payload.sub, USER);
  assert.equal(payload.revision, 7);
});

test('issues a signed locked denial carrying the newer authoritative revision', async () => {
  const { json } = await callHandler(
    makeDeps({
      getAuthoritativeAccess: async () => ({
        state: 'locked',
        serverTimeMs: T0 + 1_000,
        revision: 8,
      }),
    }),
    {},
  );
  assert.ok(json.lease);
  assert.equal(json.status, 'none');
  const { payload } = decodeLease(json.lease);
  assert.equal(payload.status, 'none');
  assert.equal(payload.revision, 8);
});

test('lease stays within the 8192-byte bound', async () => {
  const json = await issueActive();
  assert.ok(new TextEncoder().encode(json.lease).length <= 8192);
});
// --- Trialing / grace / past_due bounds ------------------------------------

test('issues a trialing lease capped by trialEnd', async () => {
  const deps = makeDeps({
    getAuthoritativeAccess: async () => ({
      state: 'trialing',
      serverTimeMs: T0,
      trialEndMs: T0 + 3 * DAY,
    }),
  });
  const { json } = await callHandler(deps, {});
  assert.equal(json.status, 'trialing');
  assert.equal(json.exp, T0 + 3 * DAY);
  const r = await verifierAt(T0).evaluate(json.lease);
  assert.equal(r.allowed, true);
  assert.equal(r.status, 'trialing');
});

test('trialing capped at 7 days when trialEnd is far', async () => {
  const deps = makeDeps({
    getAuthoritativeAccess: async () => ({
      state: 'trialing',
      serverTimeMs: T0,
      trialEndMs: T0 + 30 * DAY,
    }),
  });
  const { json } = await callHandler(deps, {});
  assert.equal(json.exp, T0 + ACTIVE_PAID_MAX_OFFLINE_MS);
});

test('issues a grace lease capped at 24h (shorter than active)', async () => {
  const deps = makeDeps({
    getAuthoritativeAccess: async () => ({
      state: 'grace',
      serverTimeMs: T0,
      graceEndMs: T0 + 5 * DAY,
    }),
  });
  const { json } = await callHandler(deps, {});
  assert.equal(json.status, 'grace');
  assert.equal(json.exp, T0 + GRACE_MAX_OFFLINE_MS);
  assert.ok(GRACE_MAX_OFFLINE_MS < ACTIVE_PAID_MAX_OFFLINE_MS);
  const r = await verifierAt(T0).evaluate(json.lease);
  assert.equal(r.allowed, true);
  assert.equal(r.status, 'grace');
});

test('grace capped by graceEnd when sooner', async () => {
  const deps = makeDeps({
    getAuthoritativeAccess: async () => ({
      state: 'grace',
      serverTimeMs: T0,
      graceEndMs: T0 + 6 * HOUR,
    }),
  });
  const { json } = await callHandler(deps, {});
  assert.equal(json.exp, T0 + 6 * HOUR);
});

test('issues a past_due lease capped at 24h', async () => {
  const deps = makeDeps({
    getAuthoritativeAccess: async () => ({
      state: 'past_due',
      serverTimeMs: T0,
      graceEndMs: T0 + 5 * DAY,
    }),
  });
  const { json } = await callHandler(deps, {});
  assert.equal(json.status, 'past_due');
  assert.equal(json.exp, T0 + PAST_DUE_MAX_OFFLINE_MS);
  const r = await verifierAt(T0).evaluate(json.lease);
  assert.equal(r.allowed, true);
  assert.equal(r.status, 'past_due');
});

// --- Authoritative status mapping ------------------------------------------

test('cancel_at_period_end maps to active bounded by currentPeriodEnd', async () => {
  const deps = makeDeps({
    getAuthoritativeAccess: async () => ({
      state: 'cancel_at_period_end',
      serverTimeMs: T0,
      currentPeriodEndMs: T0 + 4 * DAY,
    }),
  });
  const { json } = await callHandler(deps, {});
  assert.equal(json.status, 'active');
  assert.equal(json.exp, T0 + 4 * DAY);
});

test('admin and internal map to usable active (7d)', async () => {
  for (const state of ['admin', 'internal']) {
    const deps = makeDeps({ getAuthoritativeAccess: async () => ({ state, serverTimeMs: T0 }) });
    const { json } = await callHandler(deps, {});
    assert.equal(json.status, 'active', state);
    assert.equal(json.exp, T0 + ACTIVE_PAID_MAX_OFFLINE_MS, state);
    const r = await verifierAt(T0).evaluate(json.lease);
    assert.equal(r.allowed, true, state);
  }
});

test('mapAuthoritativeStatus maps the authoritative union correctly', () => {
  assert.equal(mapAuthoritativeStatus('active'), 'active');
  assert.equal(mapAuthoritativeStatus('cancel_at_period_end'), 'active');
  assert.equal(mapAuthoritativeStatus('admin'), 'active');
  assert.equal(mapAuthoritativeStatus('internal'), 'active');
  assert.equal(mapAuthoritativeStatus('trialing'), 'trialing');
  assert.equal(mapAuthoritativeStatus('past_due'), 'past_due');
  assert.equal(mapAuthoritativeStatus('grace'), 'grace');
  assert.equal(mapAuthoritativeStatus('locked'), 'none');
  for (const s of ['unknown', 'prelaunch', 'canceled', 'none', undefined, 'x']) {
    assert.equal(mapAuthoritativeStatus(s), null, String(s));
  }
});

test('computeIssuedExpiry caps per status and never extends entitlement', () => {
  assert.equal(
    computeIssuedExpiry('active', T0, { currentPeriodEndMs: T0 + 30 * DAY }),
    T0 + ACTIVE_PAID_MAX_OFFLINE_MS,
  );
  assert.equal(
    computeIssuedExpiry('active', T0, { currentPeriodEndMs: T0 + 2 * DAY }),
    T0 + 2 * DAY,
  );
  assert.equal(computeIssuedExpiry('trialing', T0, { trialEndMs: T0 + 3 * DAY }), T0 + 3 * DAY);
  assert.equal(
    computeIssuedExpiry('grace', T0, { graceEndMs: T0 + 5 * DAY }),
    T0 + GRACE_MAX_OFFLINE_MS,
  );
  assert.equal(
    computeIssuedExpiry('past_due', T0, { graceEndMs: T0 + 5 * DAY }),
    T0 + PAST_DUE_MAX_OFFLINE_MS,
  );
  assert.equal(computeIssuedExpiry('locked', T0, {}), null);
});

// --- Refusal of non-usable / expired states --------------------------------

test('refuses non-usable states with no lease', async () => {
  for (const state of ['unknown', 'prelaunch', 'canceled', 'none', 'bogus']) {
    const deps = makeDeps({ getAuthoritativeAccess: async () => ({ state, serverTimeMs: T0 }) });
    const { res, json } = await callHandler(deps, {});
    assert.equal(res.status, 200, state);
    assert.equal(json.lease, null, state);
    assert.equal(json.reason, 'no_lease', state);
    assert.ok(!('verified' in json), state);
  }
});

test('locked emits a server-derived signed denial, ignoring client input', async () => {
  const deps = makeDeps({
    getAuthoritativeAccess: async () => ({ state: 'locked', serverTimeMs: T0 }),
  });
  const { json } = await callHandler(deps, { body: { status: 'active' } });
  assert.ok(json.lease);
  assert.equal(json.status, 'none');
  assert.equal(decodeLease(json.lease).payload.status, 'none');
});

test('refuses when the bounded window already elapsed (exp <= iat)', async () => {
  const cases = [
    { state: 'active', currentPeriodEndMs: T0 - DAY },
    { state: 'trialing', trialEndMs: T0 - DAY },
    { state: 'grace', graceEndMs: T0 - DAY },
    { state: 'past_due', graceEndMs: T0 - DAY },
  ];
  for (const access of cases) {
    const deps = makeDeps({
      getAuthoritativeAccess: async () => ({ serverTimeMs: T0, ...access }),
    });
    const { json } = await callHandler(deps, {});
    assert.equal(json.lease, null, JSON.stringify(access));
    assert.equal(json.reason, 'no_lease', JSON.stringify(access));
  }
});

// --- Invalid / nonfinite time fail closed ----------------------------------

test('rejects nonfinite or invalid authoritative time fail-closed', async () => {
  const badTimes = [NaN, Infinity, -1, 0.5, null, 'now', undefined];
  for (const serverTimeMs of badTimes) {
    const deps = makeDeps({
      getAuthoritativeAccess: async () => ({
        state: 'active',
        serverTimeMs,
        currentPeriodEndMs: T0 + DAY,
      }),
    });
    const { res, json } = await callHandler(deps, {});
    assert.equal(res.status, 502, String(serverTimeMs));
    assert.equal(json.error, 'invalid_authoritative_time', String(serverTimeMs));
  }
});

test('rejects an invalid (fractional) bound fail-closed', async () => {
  const deps = makeDeps({
    getAuthoritativeAccess: async () => ({
      state: 'trialing',
      serverTimeMs: T0,
      trialEndMs: T0 + 0.5,
    }),
  });
  const { res, json } = await callHandler(deps, {});
  assert.equal(res.status, 502);
  assert.equal(json.error, 'invalid_authoritative_time');
});

test('rejects a missing or invalid authoritative revision fail-closed', async () => {
  for (const revision of [undefined, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, '7']) {
    const deps = makeDeps({
      getAuthoritativeAccess: async () => ({
        state: 'active',
        serverTimeMs: T0,
        revision,
        currentPeriodEndMs: T0 + DAY,
      }),
    });
    const { res, json } = await callHandler(deps, {});
    assert.equal(res.status, 502, String(revision));
    assert.equal(json.error, 'access_lookup_failed', String(revision));
  }
});
// --- Cross-user / body injection -------------------------------------------

test('issues the lease for the authenticated user, ignoring a client body claiming another user', async () => {
  const { json } = await callHandler(makeDeps(), {
    body: { sub: OTHER_USER, status: 'active', exp: T0 + 999 * DAY, iat: T0 },
  });
  assert.ok(json.lease);
  const { payload } = decodeLease(json.lease);
  assert.equal(payload.sub, USER);
  const okSelf = await verifierAt(T0, USER).evaluate(json.lease);
  assert.equal(okSelf.allowed, true);
  const wrongOther = await verifierAt(T0, OTHER_USER).evaluate(json.lease);
  assert.equal(wrongOther.allowed, false);
  assert.equal(wrongOther.reason, 'wrong_user');
});

test('succeeds even when the request body is unparseable (body never read for authority)', async () => {
  const { res, json } = await callHandler(makeDeps(), { body: 'not-json{{{' });
  assert.equal(res.status, 200);
  assert.ok(json.lease);
});

// --- Signature / key failures through the verifier -------------------------

test('a lease verified against an untrusted kid is rejected (unknown_key)', async () => {
  const { json } = await callHandler(makeDeps({ keyId: 'unknown-kid' }), {});
  assert.ok(json.lease);
  const r = await verifierAt(T0, USER, { [KID]: publicKey }).evaluate(json.lease);
  assert.equal(r.allowed, false);
  assert.equal(r.reason, 'unknown_key');
});

test('a lease verified against the wrong public key is rejected (invalid_signature)', async () => {
  const { json } = await callHandler(makeDeps(), {});
  const r = await verifierAt(T0, USER, { [KID]: otherPublicKey }).evaluate(json.lease);
  assert.equal(r.allowed, false);
  assert.equal(r.reason, 'invalid_signature');
});

test('a tampered payload fails signature verification', async () => {
  const { json } = await callHandler(makeDeps(), {});
  const segs = json.lease.split('.');
  const p = segs[1];
  const flipped = (p[0] === 'A' ? 'B' : 'A') + p.slice(1);
  const tampered = [segs[0], flipped, segs[2]].join('.');
  const r = await verifierAt(T0).evaluate(tampered);
  assert.equal(r.allowed, false);
  assert.ok(
    ['invalid_signature', 'malformed_encoding', 'invalid_claims'].includes(r.reason),
    r.reason,
  );
});

// --- Clock / timestamp edge cases through the verifier ---------------------

test('rollback: a rolled-back wall clock with advanced monotonic time is rejected', async () => {
  const { json } = await callHandler(makeDeps(), {});
  const sc = statefulClock(T0);
  const verifier = createOfflineLeaseVerifier({
    expectedUserId: USER,
    trustedKeys: { [KID]: publicKey },
    clock: sc.clock,
    rollbackToleranceMs: 5000,
    freshnessStore: {
      durability: 'restart_safe',
      read: async () => null,
      write: async () => {},
    },
  });
  sc.advanceMono(10_000);
  sc.setWall(T0 - 60_000);
  const r = await verifier.evaluate(json.lease);
  assert.equal(r.allowed, false);
  assert.equal(r.reason, 'rollback_detected');
  assert.equal(r.requiresOnlineRefresh, true);
});

test('expired: evaluating after exp is rejected (expired)', async () => {
  const deps = makeDeps({
    getAuthoritativeAccess: async () => ({
      state: 'grace',
      serverTimeMs: T0,
      graceEndMs: T0 + 6 * HOUR,
    }),
  });
  const { json } = await callHandler(deps, {});
  const r = await verifierAt(json.exp + 1000).evaluate(json.lease);
  assert.equal(r.allowed, false);
  assert.equal(r.reason, 'expired');
  assert.equal(r.requiresOnlineRefresh, true);
});

test('not_yet_valid: a lease evaluated well before iat is rejected', async () => {
  const { json } = await callHandler(makeDeps(), {});
  const r = await verifierAt(T0 - 120_000).evaluate(json.lease);
  assert.equal(r.allowed, false);
  assert.ok(['not_yet_valid', 'rollback_detected'].includes(r.reason), r.reason);
});

// --- issueAccessLease direct unit checks -----------------------------------

test('issueAccessLease signs locked denial and rejects missing key, invalid user, and invalid time', async () => {
  const subtle = globalThis.crypto.subtle;
  const locked = await issueAccessLease({
    userId: USER,
    access: { state: 'locked', serverTimeMs: T0, revision: 7 },
    signingKey: privateKey,
    keyId: KID,
    crypto: subtle,
  });
  assert.equal(locked.ok, true);
  assert.equal(locked.status, 'none');
  const noKey = await issueAccessLease({
    userId: USER,
    access: { state: 'active', serverTimeMs: T0 },
    signingKey: null,
    keyId: KID,
    crypto: subtle,
  });
  assert.equal(noKey.ok, false);
  assert.equal(noKey.code, 'lease_unconfigured');
  const badUser = await issueAccessLease({
    userId: '',
    access: { state: 'active', serverTimeMs: T0 },
    signingKey: privateKey,
    keyId: KID,
    crypto: subtle,
  });
  assert.equal(badUser.ok, false);
  assert.equal(badUser.code, 'invalid_user');
  const badTime = await issueAccessLease({
    userId: USER,
    access: { state: 'active', serverTimeMs: NaN },
    signingKey: privateKey,
    keyId: KID,
    crypto: subtle,
  });
  assert.equal(badTime.ok, false);
  assert.equal(badTime.code, 'invalid_time');
});

test('bounds signing failures without leaking crypto details', async () => {
  const { res, json } = await callHandler(
    makeDeps({
      crypto: {
        sign: async () => {
          throw new Error('private signing detail');
        },
      },
    }),
    {},
  );
  assert.equal(res.status, 500);
  assert.deepEqual(json, { error: 'lease_failed' });
});

test('migration exposes an authenticated transactionally locked revision snapshot RPC', () => {
  const migration = new URL(
    '../../migrations/0034_app_access_lease_freshness.sql',
    import.meta.url,
  );
  assert.equal(existsSync(migration), true);
  const sql = readFileSync(migration, 'utf8');
  assert.match(sql, /create or replace function public\.get_app_access_lease_snapshot/iu);
  assert.match(sql, /for update/iu);
  assert.match(sql, /jsonb_build_object\('revision',\s*v_revision\)/iu);
  assert.match(sql, /revoke all on function public\.get_app_access_lease_snapshot\(text\)/iu);
  assert.match(
    sql,
    /grant execute on function public\.get_app_access_lease_snapshot\(text\) to authenticated/iu,
  );
  assert.doesNotMatch(sql, /grant execute[\s\S]*get_app_access_lease_snapshot[\s\S]*\bto anon\b/iu);
});

// --- Determinism of claims (signature may vary) ----------------------------

test('claims are deterministic for identical inputs and both verify', async () => {
  const a = await issueActive();
  const b = await issueActive();
  const da = decodeLease(a.lease);
  const db = decodeLease(b.lease);
  assert.equal(da.segments[0], db.segments[0]);
  assert.equal(da.segments[1], db.segments[1]);
  assert.deepEqual(da.payload, db.payload);
  const ra = await verifierAt(T0).evaluate(a.lease);
  const rb = await verifierAt(T0).evaluate(b.lease);
  assert.equal(ra.allowed, true);
  assert.equal(rb.allowed, true);
});
