const CLOUD_SYNC_QUEUE_OWNER_KEY_PREFIX = 'cloud_sync:queue_owner:v2';
const LEGACY_CLOUD_SYNC_QUEUE_AUTHORITY_KEY_PREFIX = 'cloud_sync:queue_authority:v1';
const CLOUD_SYNC_QUEUE_CLAIM_KEY_PREFIX = 'cloud_sync:queue_claim:v1';

export const CLOUD_SYNC_QUEUE_QUARANTINE_ERROR = 'SYNC_QUEUE_QUARANTINED_LEGACY_OWNER_UNKNOWN';
export const CLOUD_SYNC_QUEUE_CLAIM_STALE_AFTER_MS = 5 * 60_000;

export type SyncQueueOwnerSnapshot =
  | Readonly<{ state: 'cloud'; userId: string; capturedAt: number }>
  | Readonly<{ state: 'unbound'; capturedAt: number }>;

export type SyncQueueCloudAuthorityLease = Readonly<{
  userId: string;
  generation: number;
}>;

export const LOCAL_UNBOUND_SYNC_SCOPE_NAME = 'local:unbound' as const;

export type SyncQueueAuthorityScopeName = typeof LOCAL_UNBOUND_SYNC_SCOPE_NAME | `cloud:${string}`;

export type SyncQueueAuthorityScope =
  | Readonly<{
      state: 'cloud';
      name: `cloud:${string}`;
      userId: string;
    }>
  | Readonly<{
      state: 'unbound';
      name: typeof LOCAL_UNBOUND_SYNC_SCOPE_NAME;
    }>;

export type LegacySyncQueueOwnerReason =
  | 'missing_v2_owner'
  | 'malformed_v2_owner'
  | 'v1_drain_claim_only';

export type SyncQueueOwnerRecordV2 =
  | Readonly<{
      schemaVersion: 2;
      rowId: string;
      state: 'cloud';
      userId: string;
      capturedAt: number;
    }>
  | Readonly<{
      schemaVersion: 2;
      rowId: string;
      state: 'unbound';
      capturedAt: number;
    }>
  | Readonly<{
      schemaVersion: 2;
      rowId: string;
      state: 'legacy_unknown';
      reason: LegacySyncQueueOwnerReason;
      quarantinedAt: number;
    }>;

export type CloudSyncQueueOwnerRecordV2 = Extract<SyncQueueOwnerRecordV2, { state: 'cloud' }>;

export type SyncQueueClaimRecordV1 = Readonly<{
  schemaVersion: 1;
  rowId: string;
  userId: string;
  ownerCapturedAt: number;
  claimedAt: number;
  claimId: string;
}>;

let nextAuthorityGeneration = 0;
let activeAuthorityLease: SyncQueueCloudAuthorityLease | undefined;
const unboundAuthorityScope: SyncQueueAuthorityScope = Object.freeze({
  state: 'unbound',
  name: LOCAL_UNBOUND_SYNC_SCOPE_NAME,
});
let activeAuthorityScope: SyncQueueAuthorityScope = unboundAuthorityScope;
const authorityScopeListeners = new Set<(scope: SyncQueueAuthorityScope) => void>();

function exactNonBlank(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  return value.trim() === value ? value : null;
}

function requireExactNonBlank(value: string, label: string): string {
  const exact = exactNonBlank(value);
  if (!exact) {
    throw new Error(`${label} requires an exact normalized user ID.`);
  }
  return exact;
}

function persistedTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function requirePersistedTimestamp(value: number, label: string): number {
  if (!persistedTimestamp(value)) {
    throw new Error(`${label} requires a nonnegative safe-integer timestamp.`);
  }
  return value;
}

function isLegacyReason(value: unknown): value is LegacySyncQueueOwnerReason {
  return (
    value === 'missing_v2_owner' ||
    value === 'malformed_v2_owner' ||
    value === 'v1_drain_claim_only'
  );
}

export function cloudSyncQueueAuthorityScopeName(exactUserId: string): `cloud:${string}` {
  return `cloud:${requireExactNonBlank(exactUserId, 'Cloud sync queue authority scope')}`;
}

export function getCurrentSyncQueueAuthorityScope(): SyncQueueAuthorityScope {
  return activeAuthorityScope;
}

export function subscribeSyncQueueAuthorityScope(
  listener: (scope: SyncQueueAuthorityScope) => void,
): () => void {
  authorityScopeListeners.add(listener);
  return () => authorityScopeListeners.delete(listener);
}

function publishAuthorityScope(scope: SyncQueueAuthorityScope): void {
  if (activeAuthorityScope.name === scope.name) return;
  activeAuthorityScope = scope;
  let subscriberFailed = false;
  for (const listener of [...authorityScopeListeners]) {
    try {
      listener(scope);
    } catch {
      subscriberFailed = true;
    }
  }
  if (subscriberFailed) {
    console.error('[sync] isolated a cloud authority scope subscriber failure.');
  }
}

export function activateSyncQueueCloudAuthority(exactUserId: string): SyncQueueCloudAuthorityLease {
  const userId = requireExactNonBlank(exactUserId, 'Cloud sync queue authority');
  const lease = Object.freeze({
    userId,
    generation: ++nextAuthorityGeneration,
  });
  activeAuthorityLease = lease;
  publishAuthorityScope(
    Object.freeze({
      state: 'cloud',
      name: cloudSyncQueueAuthorityScopeName(userId),
      userId,
    }),
  );
  return lease;
}

export function releaseSyncQueueCloudAuthority(lease: SyncQueueCloudAuthorityLease): void {
  if (activeAuthorityLease === lease) {
    activeAuthorityLease = undefined;
    publishAuthorityScope(unboundAuthorityScope);
  }
}

export function captureSyncQueueOwner(capturedAt = Date.now()): SyncQueueOwnerSnapshot {
  const exactCapturedAt = requirePersistedTimestamp(capturedAt, 'Cloud sync queue owner capture');
  const authority = activeAuthorityLease;
  return authority
    ? Object.freeze({
        state: 'cloud' as const,
        userId: authority.userId,
        capturedAt: exactCapturedAt,
      })
    : Object.freeze({
        state: 'unbound' as const,
        capturedAt: exactCapturedAt,
      });
}

export function cloudSyncQueueOwnerKey(rowId: string): string {
  return `${CLOUD_SYNC_QUEUE_OWNER_KEY_PREFIX}:${rowId}`;
}

export function legacyCloudSyncQueueAuthorityKey(rowId: string): string {
  return `${LEGACY_CLOUD_SYNC_QUEUE_AUTHORITY_KEY_PREFIX}:${rowId}`;
}

export function cloudSyncQueueClaimKey(rowId: string): string {
  return `${CLOUD_SYNC_QUEUE_CLAIM_KEY_PREFIX}:${rowId}`;
}

export function materializeSyncQueueOwner(
  rowId: string,
  snapshot: Extract<SyncQueueOwnerSnapshot, { state: 'cloud' }>,
): CloudSyncQueueOwnerRecordV2;
export function materializeSyncQueueOwner(
  rowId: string,
  snapshot: Extract<SyncQueueOwnerSnapshot, { state: 'unbound' }>,
): Extract<SyncQueueOwnerRecordV2, { state: 'unbound' }>;
export function materializeSyncQueueOwner(
  rowId: string,
  snapshot: SyncQueueOwnerSnapshot,
): SyncQueueOwnerRecordV2;
export function materializeSyncQueueOwner(
  rowId: string,
  snapshot: SyncQueueOwnerSnapshot,
): SyncQueueOwnerRecordV2 {
  const exactRowId = exactNonBlank(rowId);
  if (!exactRowId) {
    throw new Error('Cloud sync queue owner materialization requires an exact row ID.');
  }
  const capturedAt = requirePersistedTimestamp(
    snapshot.capturedAt,
    'Cloud sync queue owner materialization',
  );
  if (snapshot.state === 'cloud') {
    return Object.freeze({
      schemaVersion: 2 as const,
      rowId: exactRowId,
      state: 'cloud' as const,
      userId: requireExactNonBlank(snapshot.userId, 'Cloud sync queue owner materialization'),
      capturedAt,
    });
  }
  return Object.freeze({
    schemaVersion: 2 as const,
    rowId: exactRowId,
    state: 'unbound' as const,
    capturedAt,
  });
}

export function materializeLegacyUnknownSyncQueueOwner(
  rowId: string,
  reason: LegacySyncQueueOwnerReason,
  quarantinedAt = Date.now(),
): Extract<SyncQueueOwnerRecordV2, { state: 'legacy_unknown' }> {
  const exactRowId = exactNonBlank(rowId);
  if (!exactRowId) {
    throw new Error('Legacy cloud sync queue owner quarantine requires an exact row ID.');
  }
  if (!isLegacyReason(reason)) {
    throw new Error('Legacy cloud sync queue owner quarantine requires a known reason.');
  }
  return Object.freeze({
    schemaVersion: 2 as const,
    rowId: exactRowId,
    state: 'legacy_unknown' as const,
    reason,
    quarantinedAt: requirePersistedTimestamp(
      quarantinedAt,
      'Legacy cloud sync queue owner quarantine',
    ),
  });
}

export function materializeSyncQueueClaim(
  rowId: string,
  owner: CloudSyncQueueOwnerRecordV2,
  claimedAt: number,
  claimId: string,
): SyncQueueClaimRecordV1 {
  const exactRowId = exactNonBlank(rowId);
  if (!exactRowId || owner.rowId !== exactRowId) {
    throw new Error('Cloud sync queue claim requires an exact owner-bound row ID.');
  }
  const exactClaimId = exactNonBlank(claimId);
  if (!exactClaimId) {
    throw new Error('Cloud sync queue claim requires an opaque claim ID.');
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    rowId: exactRowId,
    userId: requireExactNonBlank(owner.userId, 'Cloud sync queue claim'),
    ownerCapturedAt: requirePersistedTimestamp(
      owner.capturedAt,
      'Cloud sync queue claim owner capture',
    ),
    claimedAt: requirePersistedTimestamp(claimedAt, 'Cloud sync queue claim timestamp'),
    claimId: exactClaimId,
  });
}

export function parseSyncQueueClaim(rowId: string, value: unknown): SyncQueueClaimRecordV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const userId = exactNonBlank(candidate.userId);
  const claimId = exactNonBlank(candidate.claimId);
  if (
    candidate.schemaVersion !== 1 ||
    exactNonBlank(candidate.rowId) !== rowId ||
    !userId ||
    !persistedTimestamp(candidate.ownerCapturedAt) ||
    !persistedTimestamp(candidate.claimedAt) ||
    !claimId
  ) {
    return null;
  }
  return {
    schemaVersion: 1,
    rowId,
    userId,
    ownerCapturedAt: candidate.ownerCapturedAt,
    claimedAt: candidate.claimedAt,
    claimId,
  };
}

export function parseSyncQueueOwner(rowId: string, value: unknown): SyncQueueOwnerRecordV2 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== 2 || exactNonBlank(candidate.rowId) !== rowId) {
    return null;
  }

  if (candidate.state === 'cloud') {
    const userId = exactNonBlank(candidate.userId);
    if (!userId || !persistedTimestamp(candidate.capturedAt)) return null;
    return {
      schemaVersion: 2,
      rowId,
      state: 'cloud',
      userId,
      capturedAt: candidate.capturedAt,
    };
  }

  if (candidate.state === 'unbound') {
    if (!persistedTimestamp(candidate.capturedAt)) return null;
    return {
      schemaVersion: 2,
      rowId,
      state: 'unbound',
      capturedAt: candidate.capturedAt,
    };
  }

  if (candidate.state === 'legacy_unknown') {
    if (!isLegacyReason(candidate.reason) || !persistedTimestamp(candidate.quarantinedAt)) {
      return null;
    }
    return {
      schemaVersion: 2,
      rowId,
      state: 'legacy_unknown',
      reason: candidate.reason,
      quarantinedAt: candidate.quarantinedAt,
    };
  }

  return null;
}

export function ownersMayCoalesce(
  existing: SyncQueueOwnerRecordV2,
  incoming: SyncQueueOwnerSnapshot,
): boolean {
  if (existing.state === 'cloud' && incoming.state === 'cloud') {
    return existing.userId === incoming.userId;
  }
  return existing.state === 'unbound' && incoming.state === 'unbound';
}

export function isExactCloudOwner(
  owner: SyncQueueOwnerRecordV2,
  exactUserId: string,
): owner is CloudSyncQueueOwnerRecordV2 {
  return owner.state === 'cloud' && owner.userId === exactUserId;
}
