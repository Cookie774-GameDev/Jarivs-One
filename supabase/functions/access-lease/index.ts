// @ts-nocheck
// access-lease: issues a cryptographically signed, time-limited offline Access
// lease for the authenticated user. VibeSpace is local-first: the desktop app
// must keep working offline, so instead of trusting client-side billing state,
// this function derives access SOLELY from the authoritative server snapshot
// and signs a compact lease that the client verifies locally with the matching
// public key (see app/src/features/access/offlineLease.ts).
//
// Security contract:
//   - POST only; OPTIONS preflight answered with the shared restrictive CORS.
//   - Identity comes ONLY from the server-validated Supabase user JWT. The
//     request body is NEVER read: client user/status/expiry/price/customer
//     values are never accepted. Status and expiry come from the injected
//     authoritative access dependency.
//   - Signing uses WebCrypto ECDSA P-256 + SHA-256 with a configured private
//     key (key id + private JWK). The private material is never logged, echoed
//     in a response, or exposed in errors.
//   - Lease expiry is bounded by the authoritative entitlement/trial/grace/
//     current-period end and by status-specific offline windows; it never
//     extends entitlement. A locked state emits a short-lived signed denial so
//     its newer revision can invalidate older granting leases; unknown and
//     prelaunch states are refused. Non-finite/invalid timestamps fail closed.
//   - The emitted payload is byte-compatible with the offlineLease.ts verifier:
//     header { v:1, alg:'ES256', kid }, claims { sub, status, iat, exp, lst, revision,
//     trialEnd?, currentPeriodEnd?, graceEnd? }, base64url (unpadded) segments
//     joined by '.', signature over utf8(`${headerB64}.${payloadB64}`).
//   - No invasive device fingerprint fields are ever added.
//
// Environment contract (production wiring, required Supabase Edge Function
// secrets): SUPABASE_URL, SUPABASE_ANON_KEY, ACCESS_LEASE_KEY_ID, and
// ACCESS_LEASE_SIGNING_JWK (a P-256 private JWK, server-side only). Optional
// APP_VERSION is passed to the authoritative get_app_access RPC.
//
// Dependency injection: the pure handler `handleAccessLease(req, deps)` takes
// `authenticate(token) -> userId|null`, `getAuthoritativeAccess(userId) ->
// AuthoritativeAccessSnapshot`, `signingKey` (ECDSA P-256 private CryptoKey),
// `keyId`, and optional `crypto` (SubtleCrypto). Tests inject mocks and
// generated ephemeral keys; no network or production calls are made in tests.
//
// Documented integration assumption (flagged for the coordinator): the
// production `getAuthoritativeAccess` calls the SECURITY DEFINER
// `get_app_access` RPC (migration 0032_app_access) in the authenticated user's
// context and maps its AppAccessResponse { status, serverTime, trialEndsAt,
// currentPeriodEndsAt, graceEndsAt } to the narrow snapshot below. No schema
// change is assumed by this function.
//
// The URL/Deno SDK imports and Deno.serve live behind `import.meta.main` (as
// dynamic imports) so importing this module for tests performs no fetch.

import { json } from '../_shared/voice.ts';

// The only supported envelope version (must match offlineLease.ts).
export const OFFLINE_LEASE_VERSION = 1;
// The only supported signature algorithm (ECDSA P-256 + SHA-256).
export const OFFLINE_LEASE_ALGORITHM = 'ES256';
// Active paid leases may be honored offline for at most seven days.
export const ACTIVE_PAID_MAX_OFFLINE_MS = 7 * 24 * 60 * 60 * 1000;
// Grace leases are honored offline for a shorter window.
export const GRACE_MAX_OFFLINE_MS = 24 * 60 * 60 * 1000;
// Past-due leases are honored offline for a shorter window.
export const PAST_DUE_MAX_OFFLINE_MS = 24 * 60 * 60 * 1000;
// Signed denials need only remain parseable long enough to advance freshness.
export const DENIAL_MAX_OFFLINE_MS = 5 * 60 * 1000;
// Maximum length of bounded string identifiers (user id, key id).
const MAX_IDENTIFIER_LENGTH = 256;
// Maximum serialized lease size in bytes; larger output is rejected.
const MAX_OFFLINE_LEASE_BYTES = 8192;
const RPC_TIMESTAMP_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u;
const AUTHORITATIVE_STATES = new Set([
  'prelaunch',
  'trialing',
  'active',
  'cancel_at_period_end',
  'past_due',
  'grace',
  'locked',
  'admin',
  'internal',
  'unknown',
]);

const TEXT_ENCODER = new TextEncoder();

function isBoundedIdentifier(value) {
  return typeof value === 'string' && value.length >= 1 && value.length <= MAX_IDENTIFIER_LENGTH;
}

function isSafeNonNegativeInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

// base64url (RFC 4648 §5), unpadded. This is the exact inverse of the
// verifier's base64UrlToBytes decoder in offlineLease.ts.
function bytesToBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function textToBase64Url(text) {
  return bytesToBase64Url(TEXT_ENCODER.encode(text));
}
// Map an authoritative server access state onto the narrow offline lease status
// union used by offlineLease.ts. Locked maps to a signed denial; unknown,
// prelaunch, and anything unrecognized map to null and are refused.
export function mapAuthoritativeStatus(state) {
  switch (state) {
    case 'active':
    case 'cancel_at_period_end':
    case 'admin':
    case 'internal':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
      return 'past_due';
    case 'grace':
      return 'grace';
    case 'locked':
      return 'none';
    default:
      return null;
  }
}

function parseRpcTimestamp(value, required) {
  if (value === null || value === undefined) {
    if (!required) return null;
    throw new Error('access_lookup_failed');
  }
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) {
    throw new Error('access_lookup_failed');
  }
  const match = RPC_TIMESTAMP_RE.exec(value);
  if (!match || value.trim() !== value) throw new Error('access_lookup_failed');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  const parsed = Date.parse(value);
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    !Number.isSafeInteger(parsed) ||
    parsed < 0
  ) {
    throw new Error('access_lookup_failed');
  }
  return parsed;
}

/** Strictly map the full authenticated RPC decision into issuer inputs. */
export function mapAccessRpcSnapshot(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('access_lookup_failed');
  }
  const state = data.status;
  if (
    typeof state !== 'string' ||
    !AUTHORITATIVE_STATES.has(state) ||
    typeof data.enabled !== 'boolean' ||
    typeof data.canUseApp !== 'boolean'
  ) {
    throw new Error('access_lookup_failed');
  }
  const offlineStatus = mapAuthoritativeStatus(state);
  if (offlineStatus !== null && offlineStatus !== 'none' && data.canUseApp !== true) {
    throw new Error('access_lookup_failed');
  }
  if (offlineStatus === 'none' && data.canUseApp !== false) {
    throw new Error('access_lookup_failed');
  }
  if (!isSafeNonNegativeInteger(data.revision)) throw new Error('access_lookup_failed');

  const mapped = {
    state,
    revision: data.revision,
    serverTimeMs: parseRpcTimestamp(data.serverTime, true),
    trialEndMs: parseRpcTimestamp(data.trialEndsAt, false),
    currentPeriodEndMs: parseRpcTimestamp(data.currentPeriodEndsAt, false),
    graceEndMs: parseRpcTimestamp(data.graceEndsAt, false),
  };
  if (state === 'trialing' && mapped.trialEndMs === null) {
    throw new Error('access_lookup_failed');
  }
  if (
    (state === 'active' || state === 'cancel_at_period_end') &&
    mapped.currentPeriodEndMs === null
  ) {
    throw new Error('access_lookup_failed');
  }
  if (state === 'grace' && mapped.graceEndMs === null) {
    throw new Error('access_lookup_failed');
  }
  return mapped;
}

// Compute the server expiry for an issued lease. This mirrors the verifier's
// computeEffectiveExp exactly so the issued `exp` equals the verifier's
// effectiveExp and the lease is never honored beyond its authoritative bound
// (entitlement/trial/grace/current-period end), never extending entitlement.
export function computeIssuedExpiry(status, iat, bounds) {
  const b = bounds || {};
  switch (status) {
    case 'active': {
      let exp = iat + ACTIVE_PAID_MAX_OFFLINE_MS;
      if (isSafeNonNegativeInteger(b.currentPeriodEndMs)) exp = Math.min(exp, b.currentPeriodEndMs);
      return exp;
    }
    case 'trialing': {
      let exp = iat + ACTIVE_PAID_MAX_OFFLINE_MS;
      if (isSafeNonNegativeInteger(b.trialEndMs)) exp = Math.min(exp, b.trialEndMs);
      return exp;
    }
    case 'grace': {
      let exp = iat + GRACE_MAX_OFFLINE_MS;
      if (isSafeNonNegativeInteger(b.graceEndMs)) exp = Math.min(exp, b.graceEndMs);
      return exp;
    }
    case 'past_due': {
      let exp = iat + PAST_DUE_MAX_OFFLINE_MS;
      if (isSafeNonNegativeInteger(b.graceEndMs)) exp = Math.min(exp, b.graceEndMs);
      return exp;
    }
    case 'none':
      return iat + DENIAL_MAX_OFFLINE_MS;
    default:
      return null;
  }
}

// Assemble the signed claims with EXACTLY the verifier-allowed keys. Optional
// bounds are included only when present and only for the status that uses them,
// keeping the payload compact and free of invasive/fingerprint fields.
function buildLeaseClaims(userId, status, iat, exp, revision, bounds) {
  const b = bounds || {};
  const claims = { sub: userId, status, iat, exp, lst: iat, revision };
  if (status === 'active' && isSafeNonNegativeInteger(b.currentPeriodEndMs)) {
    claims.currentPeriodEnd = b.currentPeriodEndMs;
  }
  if (status === 'trialing' && isSafeNonNegativeInteger(b.trialEndMs)) {
    claims.trialEnd = b.trialEndMs;
  }
  if ((status === 'grace' || status === 'past_due') && isSafeNonNegativeInteger(b.graceEndMs)) {
    claims.graceEnd = b.graceEndMs;
  }
  return claims;
}

// Sign the lease with WebCrypto ECDSA P-256 + SHA-256 over the ASCII signing
// input `${headerB64}.${payloadB64}`, producing the raw (P1363) signature that
// the verifier's subtle.verify expects.
async function signLease(claims, signingKey, keyId, cryptoImpl) {
  const header = { v: OFFLINE_LEASE_VERSION, alg: OFFLINE_LEASE_ALGORITHM, kid: keyId };
  const headerB64 = textToBase64Url(JSON.stringify(header));
  const payloadB64 = textToBase64Url(JSON.stringify(claims));
  const signingInput = TEXT_ENCODER.encode(`${headerB64}.${payloadB64}`);
  const signature = new Uint8Array(
    await cryptoImpl.sign({ name: 'ECDSA', hash: { name: 'SHA-256' } }, signingKey, signingInput),
  );
  return `${headerB64}.${payloadB64}.${bytesToBase64Url(signature)}`;
}

// Issue a signed offline lease for `userId` from the authoritative `access`
// snapshot. Pure and dependency-injected; never reads a request body and never
// touches the network. Returns a discriminated result; never throws for
// expected failure modes.
export async function issueAccessLease({ userId, access, signingKey, keyId, crypto }) {
  const cryptoImpl = crypto ?? globalThis.crypto.subtle;
  if (!isBoundedIdentifier(userId)) return { ok: false, code: 'invalid_user' };
  if (!signingKey || !isBoundedIdentifier(keyId)) return { ok: false, code: 'lease_unconfigured' };
  if (!access || typeof access !== 'object') return { ok: false, code: 'invalid_access' };

  // Issued-at and last-trusted-server-time both come from authoritative time.
  const iat = access.serverTimeMs;
  if (!isSafeNonNegativeInteger(iat)) return { ok: false, code: 'invalid_time' };
  if (!isSafeNonNegativeInteger(access.revision)) {
    return { ok: false, code: 'invalid_access' };
  }

  // Any supplied bound must be a safe non-negative integer; fail closed otherwise.
  const suppliedBounds = [access.trialEndMs, access.currentPeriodEndMs, access.graceEndMs];
  for (const bound of suppliedBounds) {
    if (bound !== undefined && bound !== null && !isSafeNonNegativeInteger(bound)) {
      return { ok: false, code: 'invalid_time' };
    }
  }

  const status = mapAuthoritativeStatus(access.state);
  if (status === null) return { ok: false, code: 'no_access', state: access.state };

  const exp = computeIssuedExpiry(status, iat, access);
  // A bounded window that has already elapsed (exp <= iat) means no usable
  // offline access; refuse rather than emit an invalid or already-expired lease.
  if (!isSafeNonNegativeInteger(exp) || exp <= iat) {
    return { ok: false, code: 'no_access', state: access.state };
  }

  const claims = buildLeaseClaims(userId, status, iat, exp, access.revision, access);
  let lease;
  try {
    if (!cryptoImpl || typeof cryptoImpl.sign !== 'function') throw new Error('sign_unavailable');
    lease = await signLease(claims, signingKey, keyId, cryptoImpl);
  } catch (_err) {
    return { ok: false, code: 'lease_failed' };
  }
  if (TEXT_ENCODER.encode(lease).length > MAX_OFFLINE_LEASE_BYTES) {
    return { ok: false, code: 'oversized' };
  }
  return { ok: true, lease, status, iat, exp, revision: access.revision, kid: keyId };
}
// Pure, dependency-injected HTTP handler. Identity comes only from the
// server-validated JWT; the request body is never read. All failure modes
// return bounded generic error codes via the shared CORS/content-type helper.
export async function handleAccessLease(req, deps) {
  const origin = req.headers.get('origin');
  const method = (req.method || '').toUpperCase();

  if (method === 'OPTIONS') return json({}, 200, origin);
  if (method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin);

  // Server-side JWT validation: identity comes only from the validated token.
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401, origin);
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer' || !parts[1]) {
    return json({ error: 'unauthorized' }, 401, origin);
  }
  const token = parts[1];

  let userId = null;
  try {
    userId = await deps.authenticate(token);
  } catch (_err) {
    return json({ error: 'unauthorized' }, 401, origin);
  }
  if (!isBoundedIdentifier(userId)) return json({ error: 'unauthorized' }, 401, origin);

  // Signing material must be configured server-side.
  if (!deps.signingKey || !isBoundedIdentifier(deps.keyId)) {
    return json({ error: 'lease_unconfigured' }, 500, origin);
  }

  // Authoritative access lookup (injected); never trust client-supplied state.
  let access;
  try {
    access = await deps.getAuthoritativeAccess(userId, token);
  } catch (_err) {
    return json({ error: 'access_lookup_failed' }, 502, origin);
  }
  if (!access || typeof access !== 'object') {
    return json({ error: 'access_lookup_failed' }, 502, origin);
  }

  const result = await issueAccessLease({
    userId,
    access,
    signingKey: deps.signingKey,
    keyId: deps.keyId,
    crypto: deps.crypto,
  });

  if (!result.ok) {
    if (result.code === 'invalid_time')
      return json({ error: 'invalid_authoritative_time' }, 502, origin);
    if (result.code === 'lease_unconfigured')
      return json({ error: 'lease_unconfigured' }, 500, origin);
    if (result.code === 'invalid_user') return json({ error: 'unauthorized' }, 401, origin);
    if (result.code === 'invalid_access')
      return json({ error: 'access_lookup_failed' }, 502, origin);
    if (result.code === 'oversized') return json({ error: 'lease_failed' }, 500, origin);
    if (result.code === 'lease_failed') return json({ error: 'lease_failed' }, 500, origin);
    // no_access / invalid_access: refuse issuance and report the server-derived
    // state so the client can fail closed and show the paywall. No lease issued.
    return json({ lease: null, status: result.state ?? 'none', reason: 'no_lease' }, 200, origin);
  }

  return json(
    {
      lease: result.lease,
      status: result.status,
      iat: result.iat,
      exp: result.exp,
      revision: result.revision,
      kid: result.kid,
    },
    200,
    origin,
  );
}

// Production wiring (Supabase Edge Function entrypoint). Dynamic imports keep
// the SDK fetch out of test runs: import.meta.main is false when this module is
// imported (e.g. by index.test.ts), true only when executed as the entrypoint.
if (import.meta.main) {
  const [supabaseMod] = await Promise.all([import('https://esm.sh/@supabase/supabase-js@2.46.2')]);
  const createClient = supabaseMod.createClient;

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const ACCESS_LEASE_KEY_ID = Deno.env.get('ACCESS_LEASE_KEY_ID') ?? '';
  const ACCESS_LEASE_SIGNING_JWK = Deno.env.get('ACCESS_LEASE_SIGNING_JWK') ?? '';
  const APP_VERSION = Deno.env.get('APP_VERSION') ?? '';

  // Import the configured P-256 private signing key from a server-side JWK.
  // The private material lives only in this closure and is never logged or
  // returned. On any failure the key stays null and the handler fails closed
  // with 500 lease_unconfigured.
  let signingKey = null;
  if (ACCESS_LEASE_KEY_ID && ACCESS_LEASE_SIGNING_JWK) {
    try {
      const jwk = JSON.parse(ACCESS_LEASE_SIGNING_JWK);
      signingKey = await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign'],
      );
    } catch (_err) {
      signingKey = null;
    }
  }

  const deps = {
    signingKey,
    keyId: ACCESS_LEASE_KEY_ID,
    crypto: globalThis.crypto.subtle,
    async authenticate(token) {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data, error } = await client.auth.getUser(token);
      if (error || !data || !data.user) return null;
      return data.user.id;
    },
    // Authoritative access via the SECURITY DEFINER lease snapshot RPC
    // (migration 0034_app_access_lease_freshness), mapped to the narrow snapshot the issuer
    // needs. The RPC takes no user parameter and resolves auth.uid(), so this
    // lookup MUST run in the authenticated user's context. Timestamps are
    // ISO-8601 UTC strings from the RPC.
    async getAuthoritativeAccess(_userId, token) {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data, error } = await client.rpc('get_app_access_lease_snapshot', {
        p_app_version: APP_VERSION,
      });
      if (error || !data) throw new Error('access_lookup_failed');
      return mapAccessRpcSnapshot(data);
    },
  };

  Deno.serve((req) => handleAccessLease(req, deps));
}
