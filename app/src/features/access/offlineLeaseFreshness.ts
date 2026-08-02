const runtimeIsTauri =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export type OfflineLeaseFreshnessDurability = 'restart_safe' | 'session_only';

export interface OfflineLeaseFreshnessStore {
  readonly durability: OfflineLeaseFreshnessDurability;
  read(accountId: string): Promise<string | null>;
  write(accountId: string, value: string): Promise<void>;
}

export type OfflineLeaseFreshnessReason =
  | 'stale_revision'
  | 'trusted_time_rollback'
  | 'rollback_detected'
  | 'freshness_corrupt'
  | 'freshness_unavailable'
  | 'freshness_not_restart_safe';

export type OfflineLeaseFreshnessResult =
  | Readonly<{
      ok: true;
      effectiveNow: number;
      durability: OfflineLeaseFreshnessDurability;
    }>
  | Readonly<{ ok: false; reason: OfflineLeaseFreshnessReason }>;

export interface OfflineLeaseFreshnessObservation {
  readonly revision: number;
  readonly lastTrustedServerTime: number;
  readonly wallClock: number;
  readonly rollbackToleranceMs: number;
}

export interface OfflineLeaseFreshnessGuard {
  observe(observation: OfflineLeaseFreshnessObservation): Promise<OfflineLeaseFreshnessResult>;
}

interface PersistedFreshnessState {
  readonly schemaVersion: 1;
  readonly accountId: string;
  readonly revision: number;
  readonly lastTrustedServerTime: number;
  readonly wallClock: number;
}

type TauriInvoke = (command: string, args: Record<string, unknown>) => Promise<unknown>;

const MAX_ACCOUNT_ID_LENGTH = 256;
const MAX_PERSISTED_STATE_BYTES = 4096;
const STATE_KEYS = [
  'schemaVersion',
  'accountId',
  'revision',
  'lastTrustedServerTime',
  'wallClock',
] as const;
const browserSessionVault = new Map<string, string>();
const storeQueues = new WeakMap<OfflineLeaseFreshnessStore, Map<string, Promise<void>>>();
let defaultFreshnessStore: OfflineLeaseFreshnessStore | undefined;

function exactBoundedAccountId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= MAX_ACCOUNT_ID_LENGTH &&
    value.trim() === value
  );
}

function safeNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function parseState(raw: string, accountId: string): PersistedFreshnessState | null {
  if (new TextEncoder().encode(raw).length > MAX_PERSISTED_STATE_BYTES) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).sort().join('\u0000') !== [...STATE_KEYS].sort().join('\u0000') ||
    record.schemaVersion !== 1 ||
    record.accountId !== accountId ||
    !safeNonNegativeInteger(record.revision) ||
    !safeNonNegativeInteger(record.lastTrustedServerTime) ||
    !safeNonNegativeInteger(record.wallClock)
  ) {
    return null;
  }
  return {
    schemaVersion: 1,
    accountId,
    revision: record.revision,
    lastTrustedServerTime: record.lastTrustedServerTime,
    wallClock: record.wallClock,
  };
}

function serializeState(state: PersistedFreshnessState): string {
  return JSON.stringify(state);
}

async function defaultInvoke(command: string, args: Record<string, unknown>): Promise<unknown> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke(command, args);
}

async function accountProvider(accountId: string, subtle: SubtleCrypto): Promise<string> {
  const digest = new Uint8Array(
    await subtle.digest('SHA-256', new TextEncoder().encode(accountId)),
  );
  const hex = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `access-lease-freshness-${hex}`;
}

export function createOfflineLeaseFreshnessStore(
  options: {
    readonly isTauri?: boolean;
    readonly invoke?: TauriInvoke;
    readonly crypto?: SubtleCrypto;
  } = {},
): OfflineLeaseFreshnessStore {
  const useDefaultBackend =
    options.isTauri === undefined && options.invoke === undefined && options.crypto === undefined;
  if (useDefaultBackend && defaultFreshnessStore) return defaultFreshnessStore;
  const native = options.isTauri ?? runtimeIsTauri;
  const invoke = options.invoke ?? defaultInvoke;
  const subtle = options.crypto ?? globalThis.crypto.subtle;

  if (!native) {
    const store = Object.freeze({
      durability: 'session_only' as const,
      async read(accountId: string) {
        if (!exactBoundedAccountId(accountId)) throw new Error('invalid_account');
        return browserSessionVault.get(accountId) ?? null;
      },
      async write(accountId: string, value: string) {
        if (!exactBoundedAccountId(accountId)) throw new Error('invalid_account');
        browserSessionVault.set(accountId, value);
      },
    });
    if (useDefaultBackend) defaultFreshnessStore = store;
    return store;
  }

  const store = Object.freeze({
    durability: 'restart_safe' as const,
    async read(accountId: string) {
      if (!exactBoundedAccountId(accountId)) throw new Error('invalid_account');
      const provider = await accountProvider(accountId, subtle);
      const value = await invoke('credential_get', { provider });
      if (value === null) return null;
      if (typeof value !== 'string') throw new Error('credential_read_failed');
      return value;
    },
    async write(accountId: string, value: string) {
      if (!exactBoundedAccountId(accountId)) throw new Error('invalid_account');
      const provider = await accountProvider(accountId, subtle);
      await invoke('credential_set', { provider, key: value });
    },
  });
  if (useDefaultBackend) defaultFreshnessStore = store;
  return store;
}

async function withStoreLock<T>(
  store: OfflineLeaseFreshnessStore,
  accountId: string,
  body: () => Promise<T>,
): Promise<T> {
  let queues = storeQueues.get(store);
  if (!queues) {
    queues = new Map();
    storeQueues.set(store, queues);
  }
  const predecessor = queues.get(accountId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = predecessor.then(() => current);
  queues.set(accountId, tail);
  await predecessor;
  try {
    return await body();
  } finally {
    release();
    if (queues.get(accountId) === tail) queues.delete(accountId);
  }
}

export function createOfflineLeaseFreshnessGuard(options: {
  readonly accountId: string;
  readonly store: OfflineLeaseFreshnessStore;
  readonly requireRestartSafe?: boolean;
}): OfflineLeaseFreshnessGuard {
  if (!exactBoundedAccountId(options.accountId)) {
    throw new TypeError('accountId must be an exact nonblank bounded string');
  }
  const requireRestartSafe = options.requireRestartSafe ?? true;
  let firstObservation = true;

  return Object.freeze({
    async observe(
      observation: OfflineLeaseFreshnessObservation,
    ): Promise<OfflineLeaseFreshnessResult> {
      if (requireRestartSafe && options.store.durability !== 'restart_safe') {
        return { ok: false, reason: 'freshness_not_restart_safe' };
      }
      if (
        !safeNonNegativeInteger(observation.revision) ||
        !safeNonNegativeInteger(observation.lastTrustedServerTime) ||
        !safeNonNegativeInteger(observation.wallClock) ||
        !Number.isFinite(observation.rollbackToleranceMs) ||
        observation.rollbackToleranceMs < 0
      ) {
        return { ok: false, reason: 'freshness_corrupt' };
      }

      return withStoreLock(options.store, options.accountId, async () => {
        let raw: string | null;
        try {
          raw = await options.store.read(options.accountId);
        } catch {
          return { ok: false, reason: 'freshness_unavailable' };
        }
        const prior = raw === null ? null : parseState(raw, options.accountId);
        if (raw !== null && prior === null) return { ok: false, reason: 'freshness_corrupt' };
        if (prior) {
          if (observation.revision < prior.revision) {
            return { ok: false, reason: 'stale_revision' };
          }
          if (observation.lastTrustedServerTime < prior.lastTrustedServerTime) {
            return { ok: false, reason: 'trusted_time_rollback' };
          }
          if (
            firstObservation &&
            (observation.wallClock < prior.wallClock ||
              (observation.wallClock === prior.wallClock &&
                observation.revision <= prior.revision &&
                observation.lastTrustedServerTime <= prior.lastTrustedServerTime))
          ) {
            return { ok: false, reason: 'rollback_detected' };
          }
          if (
            !firstObservation &&
            observation.wallClock < prior.wallClock - observation.rollbackToleranceMs
          ) {
            return { ok: false, reason: 'rollback_detected' };
          }
        }

        const next: PersistedFreshnessState = {
          schemaVersion: 1,
          accountId: options.accountId,
          revision: Math.max(observation.revision, prior?.revision ?? 0),
          lastTrustedServerTime: Math.max(
            observation.lastTrustedServerTime,
            prior?.lastTrustedServerTime ?? 0,
          ),
          wallClock: Math.max(observation.wallClock, prior?.wallClock ?? 0),
        };
        const serialized = serializeState(next);
        try {
          await options.store.write(options.accountId, serialized);
          const readback = await options.store.read(options.accountId);
          if (readback !== serialized) return { ok: false, reason: 'freshness_unavailable' };
        } catch {
          return { ok: false, reason: 'freshness_unavailable' };
        }
        firstObservation = false;
        return {
          ok: true,
          effectiveNow: next.wallClock,
          durability: options.store.durability,
        };
      });
    },
  });
}
