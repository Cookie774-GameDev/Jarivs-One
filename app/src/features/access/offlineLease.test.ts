/**
 * Tests for the cryptographically verified, time-limited offline access lease.
 *
 * These tests exercise the REAL Web Crypto path: an ECDSA P-256 key pair is
 * generated with `crypto.subtle`, the test-only helper signs lease tokens with
 * the private key, and the module under test verifies them with the public key.
 * The module itself never signs and never holds a private key.
 *
 * Time and crypto are injected so expiry, clock-rollback, and monotonic
 * progression behavior is fully deterministic.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ACTIVE_PAID_MAX_OFFLINE_MS,
  CLOCK_SKEW_TOLERANCE_MS,
  createOfflineLeaseVerifier,
  GRACE_MAX_OFFLINE_MS,
  MAX_OFFLINE_LEASE_BYTES,
  OFFLINE_ACCESS_STATUSES,
  OFFLINE_LEASE_ALGORITHM,
  OFFLINE_LEASE_VERSION,
  PAST_DUE_MAX_OFFLINE_MS,
} from './offlineLease';
import type { OfflineLeaseClock, OfflineLeaseResult, OfflineLeaseVerifier } from './offlineLease';
import type { OfflineLeaseFreshnessStore } from './offlineLeaseFreshness';

const T0 = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const USER = 'user-local-1';
const KID = 'key-2026-07';
const ROTATED_KID = 'key-2026-08';

// --- Test-only base64url helpers (encoding only; never signing) -------------

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function textToBase64Url(value: string): string {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

// --- Test-only signing helper (the module under test cannot sign) -----------

interface SignOptions {
  privateKey: CryptoKey;
  kid?: string;
  alg?: string;
  version?: number;
  headerExtra?: Record<string, unknown>;
  claims: Record<string, unknown>;
}

async function signLeaseToken(options: SignOptions): Promise<string> {
  const header: Record<string, unknown> = {
    v: options.version ?? OFFLINE_LEASE_VERSION,
    alg: options.alg ?? OFFLINE_LEASE_ALGORITHM,
    kid: options.kid ?? KID,
    ...options.headerExtra,
  };
  const headerB64 = textToBase64Url(JSON.stringify(header));
  const payloadB64 = textToBase64Url(JSON.stringify(options.claims));
  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      options.privateKey,
      signingInput,
    ),
  );
  return `${headerB64}.${payloadB64}.${bytesToBase64Url(signature)}`;
}

function validClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sub: USER,
    status: 'active',
    iat: T0,
    exp: T0 + DAY,
    lst: T0,
    revision: 7,
    ...overrides,
  };
}

// --- Deterministic injectable clock -----------------------------------------

function makeClock(initialWall: number) {
  let wall = initialWall;
  let mono = 0;
  const clock: OfflineLeaseClock = {
    now: () => wall,
    monotonicNow: () => mono,
  };
  return {
    clock,
    setWall: (value: number) => {
      wall = value;
    },
    advance: (ms: number) => {
      wall += ms;
      mono += ms;
    },
    advanceMonotonicOnly: (ms: number) => {
      mono += ms;
    },
    rollbackWall: (ms: number) => {
      wall -= ms;
    },
  };
}

let privateKey: CryptoKey;
let publicKey: CryptoKey;
let rotatedPrivateKey: CryptoKey;
let rotatedPublicKey: CryptoKey;

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  privateKey = pair.privateKey;
  publicKey = pair.publicKey;
  const rotated = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  rotatedPrivateKey = rotated.privateKey;
  rotatedPublicKey = rotated.publicKey;
});

interface VerifierOverrides {
  trustedKeys?: Record<string, CryptoKey>;
  clock?: OfflineLeaseClock;
  rollbackToleranceMs?: number;
  expectedUserId?: string;
  freshnessStore?: OfflineLeaseFreshnessStore;
  requireRestartSafeFreshness?: boolean;
}

function makeFreshnessStore(initial: string | null = null): OfflineLeaseFreshnessStore {
  let raw = initial;
  return {
    durability: 'restart_safe',
    async read() {
      return raw;
    },
    async write(_accountId, value) {
      raw = value;
    },
  };
}

function makeVerifier(overrides: VerifierOverrides = {}): OfflineLeaseVerifier {
  return createOfflineLeaseVerifier({
    expectedUserId: overrides.expectedUserId ?? USER,
    trustedKeys: overrides.trustedKeys ?? { [KID]: publicKey },
    clock: overrides.clock ?? makeClock(T0).clock,
    rollbackToleranceMs: overrides.rollbackToleranceMs ?? 5_000,
    freshnessStore: overrides.freshnessStore ?? makeFreshnessStore(),
    requireRestartSafeFreshness: overrides.requireRestartSafeFreshness,
  });
}

async function evaluateValid(
  claimOverrides: Record<string, unknown> = {},
  verifier: OfflineLeaseVerifier = makeVerifier(),
): Promise<OfflineLeaseResult> {
  const token = await signLeaseToken({ privateKey, claims: validClaims(claimOverrides) });
  return verifier.evaluate(token);
}

// --- Envelope and schema validation -----------------------------------------

describe('offline lease envelope and schema validation', () => {
  it('rejects non-string input as malformed', async () => {
    const result = await makeVerifier().evaluate(42 as unknown as string);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('malformed_encoding');
    expect(result.verified).toBeNull();
  });

  it('rejects oversized payloads before parsing', async () => {
    const oversized = `a.${'x'.repeat(MAX_OFFLINE_LEASE_BYTES + 64)}.b`;
    const result = await makeVerifier().evaluate(oversized);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('oversized');
  });

  it('rejects tokens that do not have exactly three segments', async () => {
    const twoSegments = await makeVerifier().evaluate('aaaa.bbbb');
    expect(twoSegments.reason).toBe('malformed_encoding');
    const fourSegments = await makeVerifier().evaluate('aaaa.bbbb.cccc.dddd');
    expect(fourSegments.reason).toBe('malformed_encoding');
  });

  it('rejects segments with invalid base64url characters', async () => {
    const result = await makeVerifier().evaluate('@@@.###.!!!');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('malformed_encoding');
  });

  it('rejects an unknown envelope version', async () => {
    const token = await signLeaseToken({ privateKey, version: 2, claims: validClaims() });
    const result = await makeVerifier().evaluate(token);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('unknown_version');
  });

  it('rejects an unknown signature algorithm', async () => {
    const token = await signLeaseToken({ privateKey, alg: 'HS256', claims: validClaims() });
    const result = await makeVerifier().evaluate(token);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('unknown_algorithm');
  });

  it('rejects alg "none" (algorithm confusion)', async () => {
    const token = await signLeaseToken({ privateKey, alg: 'none', claims: validClaims() });
    const result = await makeVerifier().evaluate(token);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('unknown_algorithm');
  });

  it('rejects unknown header fields', async () => {
    const token = await signLeaseToken({
      privateKey,
      headerExtra: { admin: true },
      claims: validClaims(),
    });
    const result = await makeVerifier().evaluate(token);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('invalid_claims');
  });

  it('rejects unknown claim fields', async () => {
    const token = await signLeaseToken({
      privateKey,
      claims: validClaims({ isLocalAdmin: true }),
    });
    const result = await makeVerifier().evaluate(token);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('invalid_claims');
  });

  it('rejects an unknown access status', async () => {
    const token = await signLeaseToken({ privateKey, claims: validClaims({ status: 'premium' }) });
    const result = await makeVerifier().evaluate(token);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('unknown_status');
  });

  it('rejects non-integer or negative time fields', async () => {
    const negative = await signLeaseToken({ privateKey, claims: validClaims({ iat: -1 }) });
    expect((await makeVerifier().evaluate(negative)).reason).toBe('invalid_claims');
    const fractional = await signLeaseToken({ privateKey, claims: validClaims({ exp: T0 + 0.5 }) });
    expect((await makeVerifier().evaluate(fractional)).reason).toBe('invalid_claims');
    const wrongType = await signLeaseToken({ privateKey, claims: validClaims({ lst: 'now' }) });
    expect((await makeVerifier().evaluate(wrongType)).reason).toBe('invalid_claims');
  });

  it('requires a bounded nonnegative signed entitlement revision', async () => {
    const { revision: _revision, ...missingRevision } = validClaims();
    expect(
      (await makeVerifier().evaluate(await signLeaseToken({ privateKey, claims: missingRevision })))
        .reason,
    ).toBe('invalid_claims');
    for (const revision of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '7', null]) {
      const token = await signLeaseToken({
        privateKey,
        claims: validClaims({ revision }),
      });
      expect((await makeVerifier().evaluate(token)).reason).toBe('invalid_claims');
    }
  });

  it('rejects invalid time ordering when expiry is not after issuance', async () => {
    const token = await signLeaseToken({ privateKey, claims: validClaims({ exp: T0 }) });
    const result = await makeVerifier().evaluate(token);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('invalid_time_ordering');
  });

  it('rejects a last-trusted time outside the signed lease window', async () => {
    const beforeIssue = await signLeaseToken({
      privateKey,
      claims: validClaims({ lst: T0 - 1 }),
    });
    expect((await makeVerifier().evaluate(beforeIssue)).reason).toBe('invalid_time_ordering');

    const afterExpiry = await signLeaseToken({
      privateKey,
      claims: validClaims({ lst: T0 + DAY + 1 }),
    });
    expect((await makeVerifier().evaluate(afterExpiry)).reason).toBe('invalid_time_ordering');
  });

  it('rejects a payload that is not valid JSON', async () => {
    const headerB64 = textToBase64Url(
      JSON.stringify({ v: OFFLINE_LEASE_VERSION, alg: OFFLINE_LEASE_ALGORITHM, kid: KID }),
    );
    const payloadB64 = textToBase64Url('{ this is not json');
    const token = `${headerB64}.${payloadB64}.${textToBase64Url('sig')}`;
    const result = await makeVerifier().evaluate(token);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('malformed_encoding');
  });

  it('exposes a closed, documented access-status union', () => {
    expect(OFFLINE_ACCESS_STATUSES).toContain('active');
    expect(OFFLINE_ACCESS_STATUSES).toContain('trialing');
    expect(OFFLINE_ACCESS_STATUSES).toContain('grace');
    expect(OFFLINE_ACCESS_STATUSES).toContain('past_due');
  });
});

// --- Signature verification --------------------------------------------------

describe('offline lease signature verification', () => {
  it('accepts a valid signed lease for offline use (online-to-offline)', async () => {
    const result = await evaluateValid();
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('ok');
    expect(result.requiresOnlineRefresh).toBe(false);
    expect(result.status).toBe('active');
    expect(result.verified).not.toBeNull();
    expect(result.verified?.sub).toBe(USER);
    expect(result.verified?.kid).toBe(KID);
    expect(result.verified?.v).toBe(OFFLINE_LEASE_VERSION);
    expect(result.verified?.alg).toBe(OFFLINE_LEASE_ALGORITHM);
    expect(result.verified?.iat).toBe(T0);
    expect(result.verified?.lst).toBe(T0);
  });

  it('rejects a payload tampered after signing', async () => {
    const good = await signLeaseToken({ privateKey, claims: validClaims() });
    const [headerB64, , sigB64] = good.split('.');
    const forgedPayload = textToBase64Url(JSON.stringify(validClaims({ status: 'trialing' })));
    const result = await makeVerifier().evaluate(`${headerB64}.${forgedPayload}.${sigB64}`);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('invalid_signature');
  });

  it('rejects a tampered signature', async () => {
    const good = await signLeaseToken({ privateKey, claims: validClaims() });
    const [headerB64, payloadB64] = good.split('.');
    const badSig = bytesToBase64Url(new Uint8Array(64));
    const result = await makeVerifier().evaluate(`${headerB64}.${payloadB64}.${badSig}`);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('invalid_signature');
  });

  it('rejects a lease verified against the wrong public key', async () => {
    const verifier = makeVerifier({ trustedKeys: { [KID]: rotatedPublicKey } });
    const token = await signLeaseToken({ privateKey, claims: validClaims() });
    const result = await verifier.evaluate(token);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('invalid_signature');
  });

  it('rejects an unknown key identifier', async () => {
    const token = await signLeaseToken({
      privateKey: rotatedPrivateKey,
      kid: ROTATED_KID,
      claims: validClaims(),
    });
    const result = await makeVerifier().evaluate(token);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('unknown_key');
  });

  it('supports key rotation and rejects leases whose key was removed', async () => {
    const bothKeys = makeVerifier({
      trustedKeys: { [KID]: publicKey, [ROTATED_KID]: rotatedPublicKey },
    });
    const rotatedToken = await signLeaseToken({
      privateKey: rotatedPrivateKey,
      kid: ROTATED_KID,
      claims: validClaims(),
    });
    expect((await bothKeys.evaluate(rotatedToken)).allowed).toBe(true);

    const onlyRotated = makeVerifier({ trustedKeys: { [ROTATED_KID]: rotatedPublicKey } });
    const oldToken = await signLeaseToken({ privateKey, claims: validClaims() });
    const result = await onlyRotated.evaluate(oldToken);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('unknown_key');
  });

  it('snapshots trusted keys so later caller mutation cannot replace authority', async () => {
    const trustedKeys = { [KID]: publicKey };
    const verifier = makeVerifier({ trustedKeys });
    trustedKeys[KID] = rotatedPublicKey;
    const rotatedToken = await signLeaseToken({
      privateKey: rotatedPrivateKey,
      claims: validClaims(),
    });

    const result = await verifier.evaluate(rotatedToken);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('invalid_signature');
  });

  it('never accepts a signing secret supplied as a trusted key', async () => {
    const verifier = makeVerifier({ trustedKeys: { [KID]: privateKey } });
    const token = await signLeaseToken({ privateKey, claims: validClaims() });
    const result = await verifier.evaluate(token);
    expect(result.allowed).toBe(false);
    expect(result.verified).toBeNull();
  });
});

// --- Expiry bounds ----------------------------------------------------------

describe('offline lease expiry bounds', () => {
  it('caps active paid leases at seven days even when exp is later', async () => {
    const result = await evaluateValid({ exp: T0 + 30 * DAY });
    expect(ACTIVE_PAID_MAX_OFFLINE_MS).toBe(7 * DAY);
    expect(result.verified?.effectiveExp).toBe(T0 + ACTIVE_PAID_MAX_OFFLINE_MS);
  });

  it('bounds active leases by currentPeriodEnd when it is earlier', async () => {
    const result = await evaluateValid({ exp: T0 + 30 * DAY, currentPeriodEnd: T0 + 2 * DAY });
    expect(result.verified?.effectiveExp).toBe(T0 + 2 * DAY);
  });

  it('bounds trialing leases by trialEnd', async () => {
    const result = await evaluateValid({
      status: 'trialing',
      exp: T0 + 30 * DAY,
      trialEnd: T0 + 3 * DAY,
    });
    expect(result.allowed).toBe(true);
    expect(result.verified?.effectiveExp).toBe(T0 + 3 * DAY);
  });

  it('caps trial leases even when both exp and trialEnd are much later', async () => {
    const result = await evaluateValid({
      status: 'trialing',
      exp: T0 + 30 * DAY,
      trialEnd: T0 + 30 * DAY,
    });
    expect(result.verified?.effectiveExp).toBe(T0 + 7 * DAY);
  });

  it('shortens grace leases to the grace maximum', async () => {
    const result = await evaluateValid({
      status: 'grace',
      exp: T0 + 30 * DAY,
      graceEnd: T0 + 5 * DAY,
    });
    expect(result.allowed).toBe(true);
    expect(GRACE_MAX_OFFLINE_MS).toBeLessThan(ACTIVE_PAID_MAX_OFFLINE_MS);
    expect(result.verified?.effectiveExp).toBe(T0 + GRACE_MAX_OFFLINE_MS);
  });

  it('shortens past-due leases to the past-due maximum', async () => {
    const result = await evaluateValid({ status: 'past_due', exp: T0 + 30 * DAY });
    expect(result.allowed).toBe(true);
    expect(PAST_DUE_MAX_OFFLINE_MS).toBeLessThan(ACTIVE_PAID_MAX_OFFLINE_MS);
    expect(result.verified?.effectiveExp).toBe(T0 + PAST_DUE_MAX_OFFLINE_MS);
  });

  it('expires an active lease once the seven-day cap is reached', async () => {
    const ctrl = makeClock(T0);
    const verifier = makeVerifier({ clock: ctrl.clock });
    const token = await signLeaseToken({ privateKey, claims: validClaims({ exp: T0 + 30 * DAY }) });
    ctrl.advance(ACTIVE_PAID_MAX_OFFLINE_MS - 1);
    expect((await verifier.evaluate(token)).allowed).toBe(true);
    ctrl.advance(1);
    const expired = await verifier.evaluate(token);
    expect(expired.allowed).toBe(false);
    expect(expired.reason).toBe('expired');
    expect(expired.requiresOnlineRefresh).toBe(true);
  });

  it('projects no access for canceled and none statuses', async () => {
    const canceled = await evaluateValid({ status: 'canceled' });
    expect(canceled.allowed).toBe(false);
    expect(canceled.reason).toBe('no_access');
    const none = await evaluateValid({ status: 'none' });
    expect(none.allowed).toBe(false);
    expect(none.reason).toBe('no_access');
  });
});

// --- Time window -------------------------------------------------------------

describe('offline lease time window', () => {
  it('treats the expiry instant as expired (half-open window)', async () => {
    const ctrl = makeClock(T0);
    const verifier = makeVerifier({ clock: ctrl.clock });
    const token = await signLeaseToken({ privateKey, claims: validClaims({ exp: T0 + DAY }) });
    ctrl.advance(DAY - 1);
    expect((await verifier.evaluate(token)).allowed).toBe(true);
    ctrl.advance(1);
    const expired = await verifier.evaluate(token);
    expect(expired.allowed).toBe(false);
    expect(expired.reason).toBe('expired');
    expect(expired.requiresOnlineRefresh).toBe(true);
  });

  it('rejects a lease used far before its issued-at as not yet valid', async () => {
    const result = await evaluateValid({ iat: T0 + 2 * DAY, exp: T0 + 3 * DAY, lst: T0 + 2 * DAY });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('not_yet_valid');
  });

  it('tolerates small clock skew ahead of issued-at', async () => {
    expect(10_000).toBeLessThan(CLOCK_SKEW_TOLERANCE_MS);
    const result = await evaluateValid({ iat: T0 + 10_000, exp: T0 + DAY, lst: T0 + 10_000 });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('ok');
  });
});

// --- User binding -------------------------------------------------------------

describe('offline lease user binding', () => {
  it('rejects a lease issued to a different user', async () => {
    const result = await evaluateValid({ sub: 'someone-else' });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('wrong_user');
    expect(result.verified).not.toBeNull();
  });

  it('rejects when the verifier expects a different local user', async () => {
    const verifier = makeVerifier({ expectedUserId: 'other-device-user' });
    const token = await signLeaseToken({ privateKey, claims: validClaims() });
    const result = await verifier.evaluate(token);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('wrong_user');
  });
});

// --- Monotonic time and clock-rollback guard ----------------------------------

describe('offline lease monotonic time and clock-rollback guard', () => {
  it('persists a newer signed locked denial and rejects replay of an older active lease', async () => {
    const freshnessStore = makeFreshnessStore();
    const active = await signLeaseToken({
      privateKey,
      claims: validClaims({ revision: 7 }),
    });
    expect(
      (
        await makeVerifier({
          freshnessStore,
          clock: makeClock(T0).clock,
        }).evaluate(active)
      ).allowed,
    ).toBe(true);

    const locked = await signLeaseToken({
      privateKey,
      claims: validClaims({
        status: 'none',
        revision: 8,
        iat: T0 + 1_000,
        lst: T0 + 1_000,
      }),
    });
    const denial = await makeVerifier({
      freshnessStore,
      clock: makeClock(T0 + 1_000).clock,
    }).evaluate(locked);
    expect(denial.allowed).toBe(false);
    expect(denial.reason).toBe('no_access');

    const replay = await makeVerifier({
      freshnessStore,
      clock: makeClock(T0 + 2_000).clock,
    }).evaluate(active);
    expect(replay.allowed).toBe(false);
    expect(replay.reason).toBe('stale_revision');
  });

  it('rejects wall-clock rollback after verifier recreation', async () => {
    const freshnessStore = makeFreshnessStore();
    const token = await signLeaseToken({ privateKey, claims: validClaims() });
    expect(
      (
        await makeVerifier({
          freshnessStore,
          clock: makeClock(T0).clock,
        }).evaluate(token)
      ).allowed,
    ).toBe(true);
    const rolledBack = await makeVerifier({
      freshnessStore,
      clock: makeClock(T0 - 60_000).clock,
    }).evaluate(token);
    expect(rolledBack.allowed).toBe(false);
    expect(rolledBack.reason).toBe('rollback_detected');
  });

  it('fails closed for unavailable, corrupt, or cross-account durable state', async () => {
    const token = await signLeaseToken({ privateKey, claims: validClaims() });
    const unavailable: OfflineLeaseFreshnessStore = {
      durability: 'restart_safe',
      async read() {
        throw new Error('keychain unavailable');
      },
      async write() {},
    };
    expect((await makeVerifier({ freshnessStore: unavailable }).evaluate(token)).reason).toBe(
      'freshness_unavailable',
    );
    expect(
      (await makeVerifier({ freshnessStore: makeFreshnessStore('{bad') }).evaluate(token)).reason,
    ).toBe('freshness_corrupt');
    expect(
      (
        await makeVerifier({
          freshnessStore: makeFreshnessStore(
            JSON.stringify({
              schemaVersion: 1,
              accountId: 'another-account',
              revision: 7,
              lastTrustedServerTime: T0,
              wallClock: T0,
            }),
          ),
        }).evaluate(token)
      ).reason,
    ).toBe('freshness_corrupt');
  });

  it('detects a clock rolled behind signed trusted server time before startup', async () => {
    const verifier = makeVerifier({ clock: makeClock(T0 - 60 * 60 * 1000).clock });
    const token = await signLeaseToken({
      privateKey,
      claims: validClaims({ iat: T0 - DAY, lst: T0, exp: T0 + DAY }),
    });

    const result = await verifier.evaluate(token);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('rollback_detected');
    expect(result.requiresOnlineRefresh).toBe(true);
  });

  it('fails closed when the injected clock produces non-finite readings', async () => {
    let invalid = false;
    const clock: OfflineLeaseClock = {
      now: () => (invalid ? Number.NaN : T0),
      monotonicNow: () => (invalid ? Number.POSITIVE_INFINITY : 0),
    };
    const verifier = makeVerifier({ clock });
    const token = await signLeaseToken({ privateKey, claims: validClaims() });
    invalid = true;

    const result = await verifier.evaluate(token);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('invalid_clock');
    expect(result.requiresOnlineRefresh).toBe(true);
  });

  it('flags impossible backward wall-clock movement and requires online refresh', async () => {
    const ctrl = makeClock(T0);
    const verifier = makeVerifier({ clock: ctrl.clock });
    const token = await signLeaseToken({ privateKey, claims: validClaims({ exp: T0 + DAY }) });
    expect((await verifier.evaluate(token)).allowed).toBe(true);
    ctrl.advance(10_000);
    ctrl.rollbackWall(60 * 60 * 1000);
    const result = await verifier.evaluate(token);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('rollback_detected');
    expect(result.requiresOnlineRefresh).toBe(true);
  });

  it('does not false-positive on a small backward adjustment within tolerance', async () => {
    const ctrl = makeClock(T0);
    const verifier = makeVerifier({ clock: ctrl.clock });
    const token = await signLeaseToken({ privateKey, claims: validClaims({ exp: T0 + DAY }) });
    ctrl.advance(10_000);
    ctrl.rollbackWall(2_000);
    const result = await verifier.evaluate(token);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('ok');
  });

  it('uses monotonic progression so a rolled-back clock cannot extend a lease', async () => {
    const ctrl = makeClock(T0);
    const verifier = makeVerifier({
      clock: ctrl.clock,
      rollbackToleranceMs: Number.MAX_SAFE_INTEGER,
    });
    const token = await signLeaseToken({ privateKey, claims: validClaims({ exp: T0 + 10_000 }) });
    expect((await verifier.evaluate(token)).allowed).toBe(true);
    ctrl.advance(20_000);
    ctrl.rollbackWall(15_000);
    // Wall reads T0 + 5s (before exp T0 + 10s) but monotonic reads T0 + 20s (after exp).
    const result = await verifier.evaluate(token);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('advances expiry tracking even when the wall clock is frozen', async () => {
    const ctrl = makeClock(T0);
    const verifier = makeVerifier({
      clock: ctrl.clock,
      rollbackToleranceMs: Number.MAX_SAFE_INTEGER,
    });
    const token = await signLeaseToken({ privateKey, claims: validClaims({ exp: T0 + 10_000 }) });
    ctrl.advanceMonotonicOnly(20_000);
    const result = await verifier.evaluate(token);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('expired');
  });
});

// --- Output immutability ------------------------------------------------------

describe('offline lease output immutability', () => {
  it('returns deeply frozen result objects', async () => {
    const result = await evaluateValid();
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.verified)).toBe(true);
    expect(() => {
      (result as { allowed?: boolean }).allowed = false;
    }).toThrow(TypeError);
    expect(() => {
      (result.verified as { sub?: string }).sub = 'attacker';
    }).toThrow(TypeError);
    expect(result.allowed).toBe(true);
    expect(result.verified?.sub).toBe(USER);
  });
});

// --- Determinism and absence of side effects ----------------------------------

describe('offline lease determinism and absence of side effects', () => {
  it('consults the injected clock rather than ambient time sources', async () => {
    const ctrl = makeClock(T0 + 5 * DAY);
    const verifier = makeVerifier({ clock: ctrl.clock });
    const token = await signLeaseToken({ privateKey, claims: validClaims({ exp: T0 + DAY }) });
    const result = await verifier.evaluate(token);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('performs no network or browser-storage side effects during evaluation', async () => {
    const fetchSpy = typeof globalThis.fetch === 'function' ? vi.spyOn(globalThis, 'fetch') : null;
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    try {
      await evaluateValid();
      if (fetchSpy) expect(fetchSpy).not.toHaveBeenCalled();
      expect(setItemSpy).not.toHaveBeenCalled();
      expect(getItemSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy?.mockRestore();
      setItemSpy.mockRestore();
      getItemSpy.mockRestore();
    }
  });
});
