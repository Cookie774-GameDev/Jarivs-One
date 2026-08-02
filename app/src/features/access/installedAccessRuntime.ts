import { adaptAccessDecision } from './accessDecisionAdapter';
import { AccessGatewayError, type AccessServerSnapshot } from './accessGateway';
import { deriveCapabilities, type AppAccessResponse, type AppAccessState } from './accessPolicy';
import { createAccessViewModel, type AccessViewModel } from './accessViewModel';
import {
  createOfflineLeaseVerifier,
  MAX_OFFLINE_LEASE_BYTES,
  type OfflineLeaseClock,
  type OfflineLeaseResult,
  type OfflineLeaseVerifier,
} from './offlineLease';
import type { OfflineLeaseFreshnessStore } from './offlineLeaseFreshness';

const MAX_ACCOUNT_ID_LENGTH = 256;
const MAX_KEY_CONFIGURATION_BYTES = 16 * 1024;
const MAX_TRUSTED_KEYS = 4;
const STORAGE_SCHEMA_VERSION = 1;
const STORAGE_PREFIX = 'vibespace.access-lease.v1.';
const DAY_MS = 24 * 60 * 60 * 1000;
const SAFE_ACCESS_ERROR = 'Access could not be verified.';

export class InstalledAccessTransportUnavailableError extends Error {
  constructor() {
    super('The access service transport is unavailable.');
    this.name = 'InstalledAccessTransportUnavailableError';
  }
}

export class InstalledAccessRuntimeError extends Error {
  constructor() {
    super(SAFE_ACCESS_ERROR);
    this.name = 'InstalledAccessRuntimeError';
  }
}

export interface InstalledLeaseStore {
  read(accountId: string): Promise<string | null>;
  write(accountId: string, lease: string): Promise<void>;
  remove(accountId: string): Promise<void>;
}

export interface InstalledAccessRuntime {
  loadViewModel(signal: AbortSignal): Promise<AccessViewModel>;
}

export interface InstalledAccessRuntimeOptions {
  readonly getAccountId: (signal: AbortSignal) => Promise<string | null>;
  readonly checkOnline: (signal: AbortSignal) => Promise<AccessServerSnapshot>;
  readonly requestLease: (signal: AbortSignal) => Promise<unknown>;
  readonly publicKeyConfiguration?: string;
  readonly leaseStore?: InstalledLeaseStore;
  readonly freshnessStore?: OfflineLeaseFreshnessStore;
  readonly clock?: OfflineLeaseClock;
  readonly crypto?: SubtleCrypto;
  readonly featurePlan?: Readonly<{ active?: boolean; tier?: string | null }>;
}

interface LeaseResponse {
  readonly lease: string;
  readonly status: string;
  readonly iat: number;
  readonly exp: number;
  readonly revision: number;
  readonly kid: string;
}

interface PersistedLease {
  readonly schemaVersion: typeof STORAGE_SCHEMA_VERSION;
  readonly accountHash: string;
  readonly lease: string;
}

function isExactAccountId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= MAX_ACCOUNT_ID_LENGTH &&
    value.trim() === value
  );
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
}

function isCancellation(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof AccessGatewayError && error.code === 'aborted')
  );
}

function safeFailure(): InstalledAccessRuntimeError {
  return new InstalledAccessRuntimeError();
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function accountHash(accountId: string, subtle: SubtleCrypto): Promise<string> {
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(accountId));
  return bytesToHex(new Uint8Array(digest));
}

function defaultStorage(): Storage {
  if (typeof window === 'undefined' || !window.localStorage) throw safeFailure();
  return window.localStorage;
}

export function createInstalledLeaseStore(
  options: { readonly storage?: Storage; readonly crypto?: SubtleCrypto } = {},
): InstalledLeaseStore {
  const subtle = options.crypto ?? globalThis.crypto.subtle;
  const storage = () => options.storage ?? defaultStorage();
  const keyFor = async (accountId: string) =>
    `${STORAGE_PREFIX}${await accountHash(accountId, subtle)}`;

  return Object.freeze({
    async read(accountId: string) {
      if (!isExactAccountId(accountId)) throw safeFailure();
      const hash = await accountHash(accountId, subtle);
      const raw = storage().getItem(`${STORAGE_PREFIX}${hash}`);
      if (raw === null) return null;
      if (new TextEncoder().encode(raw).length > MAX_OFFLINE_LEASE_BYTES + 512) {
        throw safeFailure();
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw safeFailure();
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw safeFailure();
      const record = parsed as Record<string, unknown>;
      if (
        Object.keys(record).sort().join('\0') !==
          ['accountHash', 'lease', 'schemaVersion'].sort().join('\0') ||
        record.schemaVersion !== STORAGE_SCHEMA_VERSION ||
        record.accountHash !== hash ||
        typeof record.lease !== 'string' ||
        new TextEncoder().encode(record.lease).length > MAX_OFFLINE_LEASE_BYTES
      ) {
        throw safeFailure();
      }
      return record.lease;
    },
    async write(accountId: string, lease: string) {
      if (
        !isExactAccountId(accountId) ||
        typeof lease !== 'string' ||
        new TextEncoder().encode(lease).length > MAX_OFFLINE_LEASE_BYTES
      ) {
        throw safeFailure();
      }
      const hash = await accountHash(accountId, subtle);
      const persisted: PersistedLease = {
        schemaVersion: STORAGE_SCHEMA_VERSION,
        accountHash: hash,
        lease,
      };
      storage().setItem(`${STORAGE_PREFIX}${hash}`, JSON.stringify(persisted));
    },
    async remove(accountId: string) {
      if (!isExactAccountId(accountId)) throw safeFailure();
      storage().removeItem(await keyFor(accountId));
    },
  });
}

function parseLeaseResponse(value: unknown): LeaseResponse | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).sort().join('\0') !==
    ['exp', 'iat', 'kid', 'lease', 'revision', 'status'].sort().join('\0')
  ) {
    return null;
  }
  if (
    typeof record.lease !== 'string' ||
    new TextEncoder().encode(record.lease).length > MAX_OFFLINE_LEASE_BYTES ||
    typeof record.status !== 'string' ||
    !isSafeNonNegativeInteger(record.iat) ||
    !isSafeNonNegativeInteger(record.exp) ||
    !isSafeNonNegativeInteger(record.revision) ||
    typeof record.kid !== 'string'
  ) {
    return null;
  }
  return {
    lease: record.lease,
    status: record.status,
    iat: record.iat,
    exp: record.exp,
    revision: record.revision,
    kid: record.kid,
  };
}

function exactPublicJwk(value: unknown): JsonWebKey | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const jwk = value as Record<string, unknown>;
  if (
    Object.keys(jwk).sort().join('\0') !==
      ['crv', 'ext', 'key_ops', 'kty', 'x', 'y'].sort().join('\0') ||
    jwk.kty !== 'EC' ||
    jwk.crv !== 'P-256' ||
    jwk.ext !== true ||
    !Array.isArray(jwk.key_ops) ||
    jwk.key_ops.length !== 1 ||
    jwk.key_ops[0] !== 'verify' ||
    typeof jwk.x !== 'string' ||
    typeof jwk.y !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/u.test(jwk.x) ||
    !/^[A-Za-z0-9_-]{43}$/u.test(jwk.y)
  ) {
    return null;
  }
  return {
    kty: 'EC',
    crv: 'P-256',
    ext: true,
    key_ops: ['verify'],
    x: jwk.x,
    y: jwk.y,
  };
}

async function importTrustedKeys(
  configuration: string | undefined,
  subtle: SubtleCrypto,
): Promise<Readonly<Record<string, CryptoKey>>> {
  if (
    typeof configuration !== 'string' ||
    configuration.trim() !== configuration ||
    configuration.length === 0 ||
    new TextEncoder().encode(configuration).length > MAX_KEY_CONFIGURATION_BYTES
  ) {
    throw safeFailure();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(configuration);
  } catch {
    throw safeFailure();
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > MAX_TRUSTED_KEYS) {
    throw safeFailure();
  }
  const keys: Record<string, CryptoKey> = Object.create(null);
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw safeFailure();
    const record = entry as Record<string, unknown>;
    if (Object.keys(record).sort().join('\0') !== ['jwk', 'kid'].join('\0')) throw safeFailure();
    if (!isExactAccountId(record.kid) || Object.prototype.hasOwnProperty.call(keys, record.kid)) {
      throw safeFailure();
    }
    const jwk = exactPublicJwk(record.jwk);
    if (!jwk) throw safeFailure();
    let key: CryptoKey;
    try {
      key = await subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, [
        'verify',
      ]);
    } catch {
      throw safeFailure();
    }
    keys[record.kid] = key;
  }
  return Object.freeze(keys);
}

function responseMatchesVerification(response: LeaseResponse, result: OfflineLeaseResult): boolean {
  const verified = result.verified;
  return (
    verified !== null &&
    response.status === verified.status &&
    response.iat === verified.iat &&
    response.exp === verified.exp &&
    response.revision === verified.revision &&
    response.kid === verified.kid
  );
}

function toIso(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function projectVerifiedLease(
  result: OfflineLeaseResult,
  now: number,
  featurePlan: InstalledAccessRuntimeOptions['featurePlan'],
): AccessViewModel {
  const verified = result.verified;
  if (!result.allowed || result.reason !== 'ok' || !verified) throw safeFailure();
  const state = verified.status as AppAccessState;
  if (state !== 'active' && state !== 'trialing' && state !== 'past_due' && state !== 'grace') {
    throw safeFailure();
  }
  const daysRemaining = Math.max(
    0,
    Math.min(3650, Math.ceil((verified.effectiveExp - Math.max(now, verified.lst)) / DAY_MS)),
  );
  const response: AppAccessResponse = {
    state,
    appAccessGranted: true,
    locked: false,
    failClosed: false,
    checkoutNeeded: state === 'trialing' || state === 'past_due' || state === 'grace',
    capabilities: deriveCapabilities(state),
    warning: null,
    trialDaysRemaining: state === 'trialing' ? daysRemaining : null,
    graceDaysRemaining: state === 'grace' ? daysRemaining : null,
    featurePlan: {
      active: featurePlan?.active === true,
      manageable: true,
    },
  };
  return createAccessViewModel(response, {
    capturedAt: verified.lst,
    featureTier: featurePlan?.tier ?? undefined,
    dates: {
      trialEndsAt: state === 'trialing' ? toIso(verified.trialEnd) : null,
      paidThroughDate:
        state === 'active' || state === 'past_due' ? toIso(verified.currentPeriodEnd) : null,
      graceEndsAt: state === 'grace' ? toIso(verified.graceEnd) : null,
    },
  });
}

export function createInstalledAccessRuntime(
  options: InstalledAccessRuntimeOptions,
): InstalledAccessRuntime {
  const subtle = options.crypto ?? globalThis.crypto.subtle;
  const runtimeClock: OfflineLeaseClock =
    options.clock ??
    Object.freeze({
      now: () => Date.now(),
      monotonicNow: () => performance.now(),
    });
  const store = options.leaseStore ?? createInstalledLeaseStore({ crypto: subtle });
  const verifiers = new Map<string, Promise<OfflineLeaseVerifier>>();
  const deniedAccounts = new Set<string>();
  const verifierFor = (accountId: string) => {
    let verifier = verifiers.get(accountId);
    if (!verifier) {
      verifier = importTrustedKeys(options.publicKeyConfiguration, subtle).then((trustedKeys) =>
        createOfflineLeaseVerifier({
          expectedUserId: accountId,
          trustedKeys,
          crypto: subtle,
          clock: runtimeClock,
          freshnessStore: options.freshnessStore,
          requireRestartSafeFreshness: true,
        }),
      );
      verifiers.set(accountId, verifier);
    }
    return verifier;
  };

  async function fallback(accountId: string, signal: AbortSignal): Promise<AccessViewModel> {
    throwIfAborted(signal);
    if (deniedAccounts.has(accountId)) throw safeFailure();
    let rawLease: string | null;
    try {
      rawLease = await store.read(accountId);
    } catch {
      throw safeFailure();
    }
    throwIfAborted(signal);
    if (!rawLease) throw safeFailure();
    let result: OfflineLeaseResult;
    try {
      result = await (await verifierFor(accountId)).evaluate(rawLease);
    } catch {
      throw safeFailure();
    }
    throwIfAborted(signal);
    return projectVerifiedLease(result, runtimeClock.now(), options.featurePlan);
  }

  async function refreshLease(
    accountId: string,
    onlineModel: AccessViewModel,
    signal: AbortSignal,
  ): Promise<void> {
    if (!onlineModel.usable) {
      try {
        await store.remove(accountId);
      } catch {
        // The authoritative online denial still remains primary for this launch.
      }
    }
    throwIfAborted(signal);
    const rawResponse = await options.requestLease(signal);
    throwIfAborted(signal);
    const response = parseLeaseResponse(rawResponse);
    if (!response) return;
    const result = await (await verifierFor(accountId)).evaluate(response.lease);
    throwIfAborted(signal);
    if (!responseMatchesVerification(response, result)) return;
    if (!onlineModel.usable && result.allowed) return;
    if (result.allowed || result.reason === 'no_access') {
      await store.write(accountId, response.lease);
      if (result.allowed) deniedAccounts.delete(accountId);
    }
  }

  return Object.freeze({
    async loadViewModel(signal: AbortSignal) {
      throwIfAborted(signal);
      let accountId: string | null;
      try {
        accountId = await options.getAccountId(signal);
      } catch (error) {
        if (isCancellation(error)) throw error;
        throwIfAborted(signal);
        throw safeFailure();
      }
      throwIfAborted(signal);
      if (!isExactAccountId(accountId)) throw safeFailure();

      let snapshot: AccessServerSnapshot;
      try {
        snapshot = await options.checkOnline(signal);
      } catch (error) {
        if (isCancellation(error)) throw error;
        throwIfAborted(signal);
        if (error instanceof InstalledAccessTransportUnavailableError) {
          return fallback(accountId, signal);
        }
        throw safeFailure();
      }
      throwIfAborted(signal);
      const onlineModel = adaptAccessDecision(snapshot, options.featurePlan).viewModel;
      if (!onlineModel.usable) deniedAccounts.add(accountId);
      try {
        await refreshLease(accountId, onlineModel, signal);
      } catch (error) {
        if (isCancellation(error)) throw error;
        throwIfAborted(signal);
        // Lease refresh can never revoke or broaden a valid online decision.
      }
      return onlineModel;
    },
  });
}
