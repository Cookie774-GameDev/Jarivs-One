// Node's native TypeScript loader requires the explicit extension in the
// issuer's zero-build integration tests; the app bundler resolves it too.
// @ts-expect-error TS5097: allowImportingTsExtensions is intentionally off.
import { createOfflineLeaseFreshnessGuard, createOfflineLeaseFreshnessStore, type OfflineLeaseFreshnessStore } from './offlineLeaseFreshness.ts';

/**
 * Cryptographically verified, time-limited offline access leases.
 *
 * VibeSpace is local-first: the app must keep working offline without a
 * round-trip before every action. Instead of trusting client-side billing
 * state, the server issues a short-lived access lease signed with an
 * asymmetric private key (held only server-side) and verified locally with the
 * matching public key via Web Crypto.
 *
 * Security properties enforced here:
 *  - Verification only. This module never signs and never holds a secret key;
 *    it rejects any trusted key that is not a public key.
 *  - Fail closed. Unknown version/algorithm/status/key, malformed or oversized
 *    input, a bad signature, a time-ordering violation, an expired window, a
 *    user mismatch, or a detected clock rollback all yield `allowed: false`.
 *  - No algorithm confusion. Only `ES256` (ECDSA P-256 + SHA-256) is accepted;
 *    the declared `alg` is checked against that fixed algorithm and never used
 *    to select a weaker one (for example `none` or HMAC).
 *  - Bounded offline windows. Active paid leases are capped at seven days;
 *    past-due and grace leases are shorter; trial/period/grace ends tighten the
 *    window when supplied.
 *  - Clock-rollback resistance. A monotonic time source is tracked alongside
 *    the wall clock so rolling the system clock backward cannot extend a lease;
 *    impossible backward movement fails closed and demands an online refresh.
 *  - No invasive fingerprinting and no external side effects: evaluation is a
 *    pure function of the supplied token, keys, clock, and crypto.
 *
 * The narrow `OfflineAccessStatus` union is intentionally duplicated here so
 * this module stays standalone (it must not import the concurrently written
 * `accessPolicy.ts`). The coordinator maps these authoritative statuses onto
 * the product paywall state during integration (see handoff).
 */

/** Authoritative access statuses a verified lease may project. */
export const OFFLINE_ACCESS_STATUSES = [
  'active',
  'trialing',
  'past_due',
  'grace',
  'canceled',
  'none',
] as const;

export type OfflineAccessStatus = (typeof OFFLINE_ACCESS_STATUSES)[number];

/** Statuses that grant offline access while their bounded window is open. */
const ACCESS_GRANTING_STATUSES: ReadonlySet<OfflineAccessStatus> = new Set<OfflineAccessStatus>([
  'active',
  'trialing',
  'past_due',
  'grace',
]);

/** The only supported envelope version. */
export const OFFLINE_LEASE_VERSION = 1;

/** The only supported signature algorithm (ECDSA P-256 + SHA-256). */
export const OFFLINE_LEASE_ALGORITHM = 'ES256';

/** Maximum serialized lease size in bytes; larger input is rejected outright. */
export const MAX_OFFLINE_LEASE_BYTES = 8192;

/** Maximum length of bounded string identifiers (user id, key id). */
const MAX_IDENTIFIER_LENGTH = 256;

/** Active paid leases may be honored offline for at most seven days. */
export const ACTIVE_PAID_MAX_OFFLINE_MS = 7 * 24 * 60 * 60 * 1000;

/** Grace leases are honored offline for a shorter window. */
export const GRACE_MAX_OFFLINE_MS = 24 * 60 * 60 * 1000;

/** Past-due leases are honored offline for a shorter window. */
export const PAST_DUE_MAX_OFFLINE_MS = 24 * 60 * 60 * 1000;

/** Tolerated forward clock skew when deciding whether a lease is "not yet valid". */
export const CLOCK_SKEW_TOLERANCE_MS = 30_000;

/** Default backward clock movement tolerated before declaring a rollback. */
export const DEFAULT_ROLLBACK_TOLERANCE_MS = 5_000;

/** Machine-readable outcome of evaluating a lease. Always fail-closed. */
export type OfflineLeaseReason =
  | 'ok'
  | 'expired'
  | 'not_yet_valid'
  | 'no_access'
  | 'wrong_user'
  | 'rollback_detected'
  | 'invalid_clock'
  | 'invalid_signature'
  | 'malformed_encoding'
  | 'oversized'
  | 'unknown_version'
  | 'unknown_algorithm'
  | 'unknown_status'
  | 'unknown_key'
  | 'invalid_time_ordering'
  | 'invalid_claims'
  | 'stale_revision'
  | 'trusted_time_rollback'
  | 'freshness_corrupt'
  | 'freshness_unavailable'
  | 'freshness_not_restart_safe';

/** Injectable time source so expiry and rollback logic is deterministic. */
export interface OfflineLeaseClock {
  /** Current wall-clock time in ms since the Unix epoch. */
  now(): number;
  /** Monotonic time in ms (never goes backward), for example `performance.now()`. */
  monotonicNow(): number;
}

/** The signed lease claims (the payload protected by the signature). */
export interface OfflineLeaseClaims {
  /** User id the lease was issued to. */
  readonly sub: string;
  /** Authoritative access status. */
  readonly status: OfflineAccessStatus;
  /** Issued-at, ms since the Unix epoch. */
  readonly iat: number;
  /** Server expiry, ms since the Unix epoch. */
  readonly exp: number;
  /** Last trusted server time, ms since the Unix epoch. */
  readonly lst: number;
  /** Monotonic server-side entitlement revision. */
  readonly revision: number;
  /** Optional trial end, ms since the Unix epoch. */
  readonly trialEnd?: number;
  /** Optional current billing period end, ms since the Unix epoch. */
  readonly currentPeriodEnd?: number;
  /** Optional grace end, ms since the Unix epoch. */
  readonly graceEnd?: number;
}

/** A lease whose signature and schema have been verified. Immutable. */
export interface VerifiedOfflineLease {
  readonly v: typeof OFFLINE_LEASE_VERSION;
  readonly alg: typeof OFFLINE_LEASE_ALGORITHM;
  readonly kid: string;
  readonly sub: string;
  readonly status: OfflineAccessStatus;
  readonly iat: number;
  readonly exp: number;
  readonly lst: number;
  readonly revision: number;
  readonly trialEnd: number | null;
  readonly currentPeriodEnd: number | null;
  readonly graceEnd: number | null;
  /** Effective expiry after applying status-specific offline bounds. */
  readonly effectiveExp: number;
}

/** The result of evaluating a lease. Immutable and fail-closed. */
export interface OfflineLeaseResult {
  /** True only for a valid, in-window, user-matching, access-granting lease. */
  readonly allowed: boolean;
  readonly reason: OfflineLeaseReason;
  /** Verified authoritative status, or null when rejected before trust. */
  readonly status: OfflineAccessStatus | null;
  /** Decoded and signature-verified claims, or null when verification failed. */
  readonly verified: VerifiedOfflineLease | null;
  /** True when the offline state is uncertain and an online refresh is needed. */
  readonly requiresOnlineRefresh: boolean;
}

export interface OfflineLeaseVerifierOptions {
  /** The local user's id; a lease must be issued to exactly this user. */
  readonly expectedUserId: string;
  /** Trusted public keys keyed by key id (`kid`). Non-public keys are rejected. */
  readonly trustedKeys: Readonly<Record<string, CryptoKey>>;
  /** Injectable time source; defaults to `Date.now` and `performance.now`. */
  readonly clock?: OfflineLeaseClock;
  /** Injectable Web Crypto implementation; defaults to `globalThis.crypto.subtle`. */
  readonly crypto?: SubtleCrypto;
  /** Backward clock movement tolerated before declaring a rollback. */
  readonly rollbackToleranceMs?: number;
  /** Durable high-water state used to reject stale leases across restarts. */
  readonly freshnessStore?: OfflineLeaseFreshnessStore;
  /** Require restart-safe storage; defaults to true. */
  readonly requireRestartSafeFreshness?: boolean;
}

export interface OfflineLeaseVerifier {
  /** Evaluate a serialized signed lease. Never throws for bad input. */
  evaluate(rawLease: string): Promise<OfflineLeaseResult>;
}

const TEXT_ENCODER = new TextEncoder();

const BASE64URL_CHARSET = /^[A-Za-z0-9_-]+$/;

const HEADER_KEYS = ['v', 'alg', 'kid'] as const;
const CLAIM_KEYS = [
  'sub',
  'status',
  'iat',
  'exp',
  'lst',
  'revision',
  'trialEnd',
  'currentPeriodEnd',
  'graceEnd',
] as const;
const REQUIRED_CLAIM_KEYS = ['sub', 'status', 'iat', 'exp', 'lst', 'revision'] as const;

const defaultClock: OfflineLeaseClock = {
  now: () => Date.now(),
  monotonicNow: () => performance.now(),
};

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  if (value.length === 0 || !BASE64URL_CHARSET.test(value)) return null;
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function parseJsonObject(bytes: Uint8Array | null): Record<string, unknown> | null {
  if (bytes === null) return null;
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

function hasExactKeys(
  obj: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
): boolean {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) return false;
  }
  for (const key of required) {
    if (!(key in obj)) return false;
  }
  return true;
}

function isBoundedIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= MAX_IDENTIFIER_LENGTH;
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isAccessStatus(value: unknown): value is OfflineAccessStatus {
  return (
    typeof value === 'string' && (OFFLINE_ACCESS_STATUSES as readonly string[]).includes(value)
  );
}

function requiresOnlineRefresh(reason: OfflineLeaseReason): boolean {
  return (
    reason === 'expired' ||
    reason === 'rollback_detected' ||
    reason === 'invalid_clock' ||
    reason === 'stale_revision' ||
    reason === 'trusted_time_rollback' ||
    reason === 'freshness_corrupt' ||
    reason === 'freshness_unavailable' ||
    reason === 'freshness_not_restart_safe'
  );
}

/** Build a fail-closed result for rejections that occur before trust. */
function reject(reason: OfflineLeaseReason): OfflineLeaseResult {
  return Object.freeze({
    allowed: false,
    reason,
    status: null,
    verified: null,
    requiresOnlineRefresh: requiresOnlineRefresh(reason),
  });
}

/** Build a result for a signature-verified lease, allowed or not. */
function decide(
  verified: VerifiedOfflineLease,
  reason: OfflineLeaseReason,
  allowed: boolean,
): OfflineLeaseResult {
  return Object.freeze({
    allowed,
    reason,
    status: verified.status,
    verified,
    requiresOnlineRefresh: requiresOnlineRefresh(reason),
  });
}

/** Apply status-specific offline bounds to the server expiry. */
function computeEffectiveExp(claims: OfflineLeaseClaims): number {
  let effectiveExp = claims.exp;
  switch (claims.status) {
    case 'active':
      effectiveExp = Math.min(effectiveExp, claims.iat + ACTIVE_PAID_MAX_OFFLINE_MS);
      if (claims.currentPeriodEnd !== undefined) {
        effectiveExp = Math.min(effectiveExp, claims.currentPeriodEnd);
      }
      break;
    case 'trialing':
      effectiveExp = Math.min(effectiveExp, claims.iat + ACTIVE_PAID_MAX_OFFLINE_MS);
      if (claims.trialEnd !== undefined) effectiveExp = Math.min(effectiveExp, claims.trialEnd);
      break;
    case 'grace':
      effectiveExp = Math.min(effectiveExp, claims.iat + GRACE_MAX_OFFLINE_MS);
      if (claims.graceEnd !== undefined) effectiveExp = Math.min(effectiveExp, claims.graceEnd);
      break;
    case 'past_due':
      effectiveExp = Math.min(effectiveExp, claims.iat + PAST_DUE_MAX_OFFLINE_MS);
      if (claims.graceEnd !== undefined) effectiveExp = Math.min(effectiveExp, claims.graceEnd);
      break;
    case 'canceled':
    case 'none':
      effectiveExp = Math.min(effectiveExp, claims.iat);
      break;
  }
  return effectiveExp;
}

interface ParsedLease {
  kid: string;
  headerB64: string;
  payloadB64: string;
  sigB64: string;
  claims: OfflineLeaseClaims;
}

/** Decode and validate the envelope and claims. Returns a reason on rejection. */
function parseLease(rawLease: string): ParsedLease | OfflineLeaseReason {
  // Leases are ASCII (base64url + dots), so code-unit length bounds byte length;
  // this fast guard keeps the later UTF-8 byte measurement bounded.
  if (rawLease.length > MAX_OFFLINE_LEASE_BYTES) return 'oversized';
  if (TEXT_ENCODER.encode(rawLease).length > MAX_OFFLINE_LEASE_BYTES) return 'oversized';

  const segments = rawLease.split('.');
  if (segments.length !== 3) return 'malformed_encoding';
  const [headerB64, payloadB64, sigB64] = segments;

  const header = parseJsonObject(base64UrlToBytes(headerB64));
  if (header === null) return 'malformed_encoding';
  if (!hasExactKeys(header, HEADER_KEYS, HEADER_KEYS)) return 'invalid_claims';
  if (header.v !== OFFLINE_LEASE_VERSION) return 'unknown_version';
  if (header.alg !== OFFLINE_LEASE_ALGORITHM) return 'unknown_algorithm';
  if (!isBoundedIdentifier(header.kid)) return 'invalid_claims';

  const claims = parseJsonObject(base64UrlToBytes(payloadB64));
  if (claims === null) return 'malformed_encoding';
  if (!hasExactKeys(claims, CLAIM_KEYS, REQUIRED_CLAIM_KEYS)) return 'invalid_claims';
  if (!isBoundedIdentifier(claims.sub)) return 'invalid_claims';
  if (!isAccessStatus(claims.status)) return 'unknown_status';
  if (
    !isSafeNonNegativeInteger(claims.iat) ||
    !isSafeNonNegativeInteger(claims.exp) ||
    !isSafeNonNegativeInteger(claims.lst) ||
    !isSafeNonNegativeInteger(claims.revision)
  ) {
    return 'invalid_claims';
  }
  if (
    (claims.trialEnd !== undefined && !isSafeNonNegativeInteger(claims.trialEnd)) ||
    (claims.currentPeriodEnd !== undefined && !isSafeNonNegativeInteger(claims.currentPeriodEnd)) ||
    (claims.graceEnd !== undefined && !isSafeNonNegativeInteger(claims.graceEnd))
  ) {
    return 'invalid_claims';
  }
  if (claims.exp <= claims.iat || claims.lst < claims.iat || claims.lst > claims.exp) {
    return 'invalid_time_ordering';
  }

  return {
    kid: header.kid,
    headerB64,
    payloadB64,
    sigB64,
    claims: {
      sub: claims.sub,
      status: claims.status,
      iat: claims.iat,
      exp: claims.exp,
      lst: claims.lst,
      revision: claims.revision,
      trialEnd: claims.trialEnd,
      currentPeriodEnd: claims.currentPeriodEnd,
      graceEnd: claims.graceEnd,
    },
  };
}

/**
 * Create a stateful offline-lease verifier. The monotonic/wall-clock anchor is
 * captured at creation so later evaluations can detect impossible backward
 * wall-clock movement across calls.
 */
export function createOfflineLeaseVerifier(
  options: OfflineLeaseVerifierOptions,
): OfflineLeaseVerifier {
  if (!isBoundedIdentifier(options.expectedUserId)) {
    throw new TypeError('expectedUserId must be a non-empty bounded string');
  }
  if (typeof options.trustedKeys !== 'object' || options.trustedKeys === null) {
    throw new TypeError('trustedKeys must be an object mapping kid to a public CryptoKey');
  }

  const clock = options.clock ?? defaultClock;
  const subtle = options.crypto ?? globalThis.crypto.subtle;
  const rollbackToleranceMs = options.rollbackToleranceMs ?? DEFAULT_ROLLBACK_TOLERANCE_MS;
  if (!Number.isFinite(rollbackToleranceMs) || rollbackToleranceMs < 0) {
    throw new TypeError('rollbackToleranceMs must be a finite non-negative number');
  }
  const trustedKeys = Object.freeze({ ...options.trustedKeys });
  const expectedUserId = options.expectedUserId;
  const freshness = createOfflineLeaseFreshnessGuard({
    accountId: expectedUserId,
    store: options.freshnessStore ?? createOfflineLeaseFreshnessStore(),
    requireRestartSafe: options.requireRestartSafeFreshness,
  });

  const baseWall = clock.now();
  const baseMonotonic = clock.monotonicNow();
  const validBaseClock =
    Number.isFinite(baseWall) &&
    baseWall >= 0 &&
    Number.isFinite(baseMonotonic) &&
    baseMonotonic >= 0;

  async function evaluate(rawLease: string): Promise<OfflineLeaseResult> {
    if (typeof rawLease !== 'string') return reject('malformed_encoding');

    const parsed = parseLease(rawLease);
    if (typeof parsed === 'string') return reject(parsed);

    const key: CryptoKey | undefined = Object.prototype.hasOwnProperty.call(trustedKeys, parsed.kid)
      ? trustedKeys[parsed.kid]
      : undefined;
    // Never accept a signing secret or algorithm-confused key.
    const keyAlgorithm = key?.algorithm as (KeyAlgorithm & { namedCurve?: string }) | undefined;
    if (
      !key ||
      key.type !== 'public' ||
      keyAlgorithm?.name !== 'ECDSA' ||
      keyAlgorithm.namedCurve !== 'P-256' ||
      !key.usages.includes('verify')
    ) {
      return reject('unknown_key');
    }

    const signatureBytes = base64UrlToBytes(parsed.sigB64);
    if (signatureBytes === null) return reject('malformed_encoding');
    const signingInput = TEXT_ENCODER.encode(`${parsed.headerB64}.${parsed.payloadB64}`);
    let signatureValid = false;
    try {
      signatureValid = await subtle.verify(
        { name: 'ECDSA', hash: { name: 'SHA-256' } },
        key,
        signatureBytes,
        signingInput,
      );
    } catch {
      signatureValid = false;
    }
    if (!signatureValid) return reject('invalid_signature');

    const verified: VerifiedOfflineLease = Object.freeze({
      v: OFFLINE_LEASE_VERSION,
      alg: OFFLINE_LEASE_ALGORITHM,
      kid: parsed.kid,
      sub: parsed.claims.sub,
      status: parsed.claims.status,
      iat: parsed.claims.iat,
      exp: parsed.claims.exp,
      lst: parsed.claims.lst,
      revision: parsed.claims.revision,
      trialEnd: parsed.claims.trialEnd ?? null,
      currentPeriodEnd: parsed.claims.currentPeriodEnd ?? null,
      graceEnd: parsed.claims.graceEnd ?? null,
      effectiveExp: computeEffectiveExp(parsed.claims),
    });

    if (verified.sub !== expectedUserId) return decide(verified, 'wrong_user', false);

    const currentMonotonic = clock.monotonicNow();
    const wallNow = clock.now();
    if (
      !validBaseClock ||
      !Number.isFinite(currentMonotonic) ||
      currentMonotonic < baseMonotonic ||
      !Number.isFinite(wallNow) ||
      wallNow < 0
    ) {
      return decide(verified, 'invalid_clock', false);
    }
    const monotonicElapsed = currentMonotonic - baseMonotonic;
    const monotonicWall = baseWall + monotonicElapsed;
    if (wallNow < monotonicWall - rollbackToleranceMs) {
      return decide(verified, 'rollback_detected', false);
    }

    const freshnessResult = await freshness.observe({
      revision: verified.revision,
      lastTrustedServerTime: verified.lst,
      wallClock: wallNow,
      rollbackToleranceMs,
    });
    if (!freshnessResult.ok) return decide(verified, freshnessResult.reason, false);

    // Effective time never goes backward, including across process restarts.
    const effectiveNow = Math.max(wallNow, monotonicWall, freshnessResult.effectiveNow);
    // Signed denials advance the durable high-water mark before access is denied,
    // preventing replay of an older still-unexpired granting lease.
    if (!ACCESS_GRANTING_STATUSES.has(verified.status)) return decide(verified, 'no_access', false);
    if (effectiveNow < verified.iat - CLOCK_SKEW_TOLERANCE_MS) {
      return decide(verified, 'not_yet_valid', false);
    }
    if (wallNow < verified.lst - CLOCK_SKEW_TOLERANCE_MS) {
      return decide(verified, 'rollback_detected', false);
    }
    if (effectiveNow >= verified.effectiveExp) return decide(verified, 'expired', false);

    return decide(verified, 'ok', true);
  }

  return { evaluate };
}
