/**
 * Sync queue + skeleton sync loop for VibeSpace.
 *
 * Cloud sync is optional. When a Supabase client is configured and signed
 * in, the loop drains the local `sync_queue` table and pushes mutations to
 * Postgres.
 * When no verified cloud authority exists, mutations are retained with
 * explicit local/unbound ownership. They remain local-only unless a future
 * user-authorized migration can prove which account should receive them.
 *
 * The cloud target is `app_sync_records`, a generic per-user document table.
 * That keeps desktop local-first data safe even while the hosted Supabase
 * schema evolves independently from Dexie's full table set.
 */

import { nanoid } from 'nanoid';
import { db, openDb } from './db';
import type { SettingsRow, StoreName, SyncOp, SyncQueueRow, SyncStatus } from './db';
import { runSignalBoundWrite } from './db/signalBoundTransaction';
import { getSupabaseClient, isCloudSyncConfigured } from './supabase';
import {
  CLOUD_SYNC_QUEUE_CLAIM_STALE_AFTER_MS,
  CLOUD_SYNC_QUEUE_QUARANTINE_ERROR,
  captureSyncQueueOwner,
  cloudSyncQueueClaimKey,
  cloudSyncQueueOwnerKey,
  isExactCloudOwner,
  legacyCloudSyncQueueAuthorityKey,
  materializeLegacyUnknownSyncQueueOwner,
  materializeSyncQueueClaim,
  materializeSyncQueueOwner,
  parseSyncQueueClaim,
  parseSyncQueueOwner,
  type CloudSyncQueueOwnerRecordV2,
  type LegacySyncQueueOwnerReason,
  type SyncQueueClaimRecordV1,
  type SyncQueueOwnerSnapshot,
} from './cloudSyncQueueOwner';

const SYNC_ID_PREFIX = 'syq';
const newSyncId = (): string => `${SYNC_ID_PREFIX}_${nanoid(16)}`;
const SYNC_CLAIM_ID_PREFIX = 'syc';
const newSyncClaimId = (): string => `${SYNC_CLAIM_ID_PREFIX}_${nanoid(16)}`;
const CLOUD_SYNC_RECORDS_TABLE = 'app_sync_records';
const CLOUD_SYNC_CONFLICT_TARGET = 'user_id,table_name,row_id';
const CUSTOM_TOOLS_SYNC_TABLE = 'custom_tools';
const PLUGIN_CONNECTIONS_SYNC_TABLE = 'plugin_connections';
const PULL_CURSOR_KEY_PREFIX = 'cloud_sync:last_pull_at';
let syncFlushInFlight = false;
let syncPullInFlight = false;
const QUEUE_AND_OWNER_TABLES = [db.sync_queue, db.settings] as const;

export type CloudSyncAuthority = Readonly<{
  userId: string;
  signal: AbortSignal;
}>;

export type StopCloudSyncLoop = () => Promise<void>;

function normalizedAuthorityUserId(userId: unknown): string {
  return typeof userId === 'string' ? userId.trim() : '';
}

function requireCloudSyncAuthority(authority: CloudSyncAuthority): string {
  const userId = normalizedAuthorityUserId(authority.userId);
  if (!userId || userId !== authority.userId) {
    throw new Error('Cloud sync authority requires an exact normalized user ID.');
  }
  return userId;
}

type AbortAwareResult<T> = Readonly<{ kind: 'value'; value: T }> | Readonly<{ kind: 'cancelled' }>;

function awaitUnlessAborted<T>(
  operation: PromiseLike<T>,
  signal: AbortSignal,
): Promise<AbortAwareResult<T>> {
  if (signal.aborted) return Promise.resolve({ kind: 'cancelled' });
  return new Promise<AbortAwareResult<T>>((resolve, reject) => {
    let settled = false;
    const finish = (result: AbortAwareResult<T>) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', cancel);
      resolve(result);
    };
    const cancel = () => finish({ kind: 'cancelled' });
    signal.addEventListener('abort', cancel, { once: true });
    Promise.resolve(operation).then(
      (value) => finish({ kind: 'value', value }),
      (error) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', cancel);
        reject(error);
      },
    );
  });
}

async function sessionMatchesAuthority(
  authority: CloudSyncAuthority,
  client: NonNullable<ReturnType<typeof getSupabaseClient>>,
): Promise<boolean> {
  if (authority.signal.aborted) return false;
  const session = await awaitUnlessAborted(client.auth.getSession(), authority.signal);
  if (session.kind === 'cancelled') return false;
  return normalizedAuthorityUserId(session.value.data.session?.user?.id) === authority.userId;
}

type ClaimedSyncQueueRow = Readonly<{
  row: SyncQueueRow;
  owner: CloudSyncQueueOwnerRecordV2;
  claim: SyncQueueClaimRecordV1;
}>;

function legacyOwnerReason(hasV2Record: boolean, hasV1Record: boolean): LegacySyncQueueOwnerReason {
  if (hasV2Record) return 'malformed_v2_owner';
  if (hasV1Record) return 'v1_drain_claim_only';
  return 'missing_v2_owner';
}

async function quarantineLegacyActiveSyncRows(authority: CloudSyncAuthority): Promise<boolean> {
  const result = await runSignalBoundWrite(
    db,
    authority.signal,
    QUEUE_AND_OWNER_TABLES,
    async (transaction) => {
      const queue = transaction.table<SyncQueueRow, string>('sync_queue');
      const settings = transaction.table<SettingsRow, string>('settings');
      const activeRows = await queue
        .where('status')
        .anyOf(['pending', 'error', 'in_progress'] satisfies SyncStatus[])
        .toArray();

      for (const row of activeRows) {
        const ownerKey = cloudSyncQueueOwnerKey(row.id);
        const stored = await settings.get(ownerKey);
        const storedClaim = await settings.get(cloudSyncQueueClaimKey(row.id));
        if (row.status !== 'in_progress' && storedClaim) {
          const quarantinedAt = Date.now();
          await settings.put({
            key: ownerKey,
            value: materializeLegacyUnknownSyncQueueOwner(
              row.id,
              'malformed_v2_owner',
              quarantinedAt,
            ),
            updated_at: quarantinedAt,
          });
          await queue.update(row.id, {
            status: 'error' as SyncStatus,
            error: CLOUD_SYNC_QUEUE_QUARANTINE_ERROR,
          });
          continue;
        }
        if (parseSyncQueueOwner(row.id, stored?.value)) continue;
        const legacyStored = await settings.get(legacyCloudSyncQueueAuthorityKey(row.id));
        const quarantinedAt = Date.now();
        await settings.put({
          key: ownerKey,
          value: materializeLegacyUnknownSyncQueueOwner(
            row.id,
            legacyOwnerReason(Boolean(stored), Boolean(legacyStored)),
            quarantinedAt,
          ),
          updated_at: quarantinedAt,
        });
        await queue.update(row.id, {
          status: 'error' as SyncStatus,
          error: CLOUD_SYNC_QUEUE_QUARANTINE_ERROR,
        });
      }
    },
  );
  return result.kind === 'committed';
}

async function claimExactPendingQueueRow(
  rowId: string,
  authority: CloudSyncAuthority,
): Promise<ClaimedSyncQueueRow | null> {
  const result = await runSignalBoundWrite(
    db,
    authority.signal,
    QUEUE_AND_OWNER_TABLES,
    async (transaction) => {
      const queue = transaction.table<SyncQueueRow, string>('sync_queue');
      const settings = transaction.table<SettingsRow, string>('settings');
      const row = await queue.get(rowId);
      if (row?.status !== 'pending') return null;

      const ownerKey = cloudSyncQueueOwnerKey(rowId);
      const stored = await settings.get(ownerKey);
      const owner = parseSyncQueueOwner(rowId, stored?.value);
      if (!owner) {
        const legacyStored = await settings.get(legacyCloudSyncQueueAuthorityKey(rowId));
        const quarantinedAt = Date.now();
        await settings.put({
          key: ownerKey,
          value: materializeLegacyUnknownSyncQueueOwner(
            rowId,
            legacyOwnerReason(Boolean(stored), Boolean(legacyStored)),
            quarantinedAt,
          ),
          updated_at: quarantinedAt,
        });
        await queue.update(rowId, {
          status: 'error' as SyncStatus,
          error: CLOUD_SYNC_QUEUE_QUARANTINE_ERROR,
        });
        return null;
      }
      if (!isExactCloudOwner(owner, authority.userId)) return null;

      const claimKey = cloudSyncQueueClaimKey(rowId);
      if (await settings.get(claimKey)) {
        const quarantinedAt = Date.now();
        await settings.put({
          key: ownerKey,
          value: materializeLegacyUnknownSyncQueueOwner(rowId, 'malformed_v2_owner', quarantinedAt),
          updated_at: quarantinedAt,
        });
        await queue.update(rowId, {
          status: 'error' as SyncStatus,
          error: CLOUD_SYNC_QUEUE_QUARANTINE_ERROR,
        });
        return null;
      }

      const claimedAt = Date.now();
      const claim = materializeSyncQueueClaim(rowId, owner, claimedAt, newSyncClaimId());
      await queue.update(rowId, {
        status: 'in_progress' as SyncStatus,
        attempted_at: claimedAt,
        error: undefined,
      });
      await settings.put({
        key: claimKey,
        value: claim,
        updated_at: claimedAt,
      });
      return {
        row: {
          ...row,
          status: 'in_progress' as SyncStatus,
          attempted_at: claimedAt,
          error: undefined,
        },
        owner,
        claim,
      };
    },
  );
  return result.kind === 'committed' ? result.value : null;
}

function claimMatchesOwner(
  claim: SyncQueueClaimRecordV1,
  owner: CloudSyncQueueOwnerRecordV2,
): boolean {
  return (
    claim.rowId === owner.rowId &&
    claim.userId === owner.userId &&
    claim.ownerCapturedAt === owner.capturedAt
  );
}

function sameClaim(current: SyncQueueClaimRecordV1, claimed: SyncQueueClaimRecordV1): boolean {
  return (
    current.rowId === claimed.rowId &&
    current.userId === claimed.userId &&
    current.ownerCapturedAt === claimed.ownerCapturedAt &&
    current.claimedAt === claimed.claimedAt &&
    current.claimId === claimed.claimId
  );
}

function sameClaimedCloudOwner(
  current: CloudSyncQueueOwnerRecordV2,
  claimed: CloudSyncQueueOwnerRecordV2,
): boolean {
  return (
    current.rowId === claimed.rowId &&
    current.userId === claimed.userId &&
    current.capturedAt === claimed.capturedAt
  );
}

async function settleClaimedQueueRow(
  claimed: ClaimedSyncQueueRow,
  authority: CloudSyncAuthority,
  patch: Partial<SyncQueueRow>,
): Promise<boolean> {
  const result = await runSignalBoundWrite(
    db,
    authority.signal,
    QUEUE_AND_OWNER_TABLES,
    async (transaction) => {
      const queue = transaction.table<SyncQueueRow, string>('sync_queue');
      const settings = transaction.table<SettingsRow, string>('settings');
      const currentRow = await queue.get(claimed.row.id);
      if (currentRow?.status !== 'in_progress') return false;
      const ownerKey = cloudSyncQueueOwnerKey(claimed.row.id);
      const storedOwner = await settings.get(ownerKey);
      const currentOwner = parseSyncQueueOwner(claimed.row.id, storedOwner?.value);
      const claimKey = cloudSyncQueueClaimKey(claimed.row.id);
      const storedClaim = await settings.get(claimKey);
      const currentClaim = parseSyncQueueClaim(claimed.row.id, storedClaim?.value);
      if (!currentClaim || !sameClaim(currentClaim, claimed.claim)) return false;
      if (
        !currentOwner ||
        currentOwner.state !== 'cloud' ||
        !sameClaimedCloudOwner(currentOwner, claimed.owner) ||
        !claimMatchesOwner(currentClaim, currentOwner)
      ) {
        const quarantinedAt = Date.now();
        await settings.put({
          key: ownerKey,
          value: materializeLegacyUnknownSyncQueueOwner(
            claimed.row.id,
            'malformed_v2_owner',
            quarantinedAt,
          ),
          updated_at: quarantinedAt,
        });
        await queue.update(claimed.row.id, {
          status: 'error' as SyncStatus,
          error: CLOUD_SYNC_QUEUE_QUARANTINE_ERROR,
        });
        return false;
      }
      await queue.update(claimed.row.id, patch);
      await settings.delete(claimKey);
      return true;
    },
  );
  return result.kind === 'committed' && result.value;
}

async function ownedPendingQueueRows(
  userId: string,
  batchSize: number,
): Promise<{ pendingCount: number; rows: SyncQueueRow[] }> {
  const pending = await db.sync_queue
    .where('status')
    .equals('pending' as SyncStatus)
    .toArray();
  pending.sort((left, right) => left.created_at - right.created_at);
  const owned: SyncQueueRow[] = [];
  for (const row of pending) {
    const stored = await db.settings.get(cloudSyncQueueOwnerKey(row.id));
    const owner = parseSyncQueueOwner(row.id, stored?.value);
    if (owner && isExactCloudOwner(owner, userId)) {
      owned.push(row);
    }
  }
  return {
    pendingCount: pending.length,
    rows: owned.slice(0, Math.max(0, batchSize)),
  };
}

const PRIMARY_KEY_BY_TABLE: Partial<Record<StoreName, string>> = {
  settings: 'key',
  terminal_layouts: 'project_id',
};

export function primaryKeyForSyncTable(table: string): string {
  return PRIMARY_KEY_BY_TABLE[table as StoreName] ?? 'id';
}

export type CloudSyncRecord = {
  user_id: string;
  table_name: string;
  row_id: string;
  op: SyncOp;
  payload: Record<string, unknown> | null;
  deleted_at: string | null;
  updated_at: string;
};

type SyncedCustomTool = {
  slug: string;
  name: string;
  description: string;
  baseAction: string;
  params: Record<string, unknown>;
  steps?: SyncedCustomToolStep[];
  emoji?: string;
  createdAt: number;
  updatedAt: number;
  published: { id: string; at: number } | null;
};

type SyncedCustomToolStep = {
  action: string;
  params: Record<string, unknown>;
  label?: string;
};

function payloadForCloudRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  return payload as Record<string, unknown>;
}

function isoFromMs(ms: number, fallbackIso: string): string {
  if (!Number.isFinite(ms)) return fallbackIso;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? fallbackIso : date.toISOString();
}

export function buildCloudSyncRecord(
  row: SyncQueueRow,
  owner: CloudSyncQueueOwnerRecordV2,
  nowIso = new Date().toISOString(),
): CloudSyncRecord {
  if (owner.rowId !== row.id) {
    throw new Error('Cloud sync record owner does not match its queue row.');
  }
  return {
    user_id: owner.userId,
    table_name: row.table,
    row_id: row.row_id,
    op: row.op,
    payload: row.op === 'delete' ? null : payloadForCloudRecord(row.payload),
    deleted_at: row.op === 'delete' ? nowIso : null,
    updated_at: isoFromMs(row.created_at, nowIso),
  };
}

function pullCursorKey(userId: string): string {
  return `${PULL_CURSOR_KEY_PREFIX}:${userId}`;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

type CloudPullCursorV2 = Readonly<{
  schemaVersion: 2;
  updatedAt: string;
  tableName: string;
  rowId: string;
}>;

function parseCloudPullCursor(value: unknown): CloudPullCursorV2 | null {
  if (typeof value === 'string' && value.trim()) {
    return {
      schemaVersion: 2,
      updatedAt: value,
      tableName: '',
      rowId: '',
    };
  }
  const candidate = recordValue(value);
  if (
    candidate?.schemaVersion !== 2 ||
    typeof candidate.updatedAt !== 'string' ||
    !candidate.updatedAt.trim() ||
    typeof candidate.tableName !== 'string' ||
    !candidate.tableName ||
    typeof candidate.rowId !== 'string' ||
    !candidate.rowId
  ) {
    return null;
  }
  return {
    schemaVersion: 2,
    updatedAt: candidate.updatedAt,
    tableName: candidate.tableName,
    rowId: candidate.rowId,
  };
}

function cloudPullCursorForRecord(row: CloudSyncRecord): CloudPullCursorV2 {
  return {
    schemaVersion: 2,
    updatedAt: row.updated_at,
    tableName: row.table_name,
    rowId: row.row_id,
  };
}

function sameCloudPullCursor(
  left: CloudPullCursorV2 | null,
  right: CloudPullCursorV2 | null,
): boolean {
  return (
    left?.updatedAt === right?.updatedAt &&
    left?.tableName === right?.tableName &&
    left?.rowId === right?.rowId
  );
}

function quotePostgrestFilterValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function cloudPullAfterCursorFilter(cursor: CloudPullCursorV2): string {
  const updatedAt = quotePostgrestFilterValue(cursor.updatedAt);
  const tableName = quotePostgrestFilterValue(cursor.tableName);
  const rowId = quotePostgrestFilterValue(cursor.rowId);
  return [
    `updated_at.gt.${updatedAt}`,
    `and(updated_at.eq.${updatedAt},table_name.gt.${tableName})`,
    `and(updated_at.eq.${updatedAt},table_name.eq.${tableName},row_id.gt.${rowId})`,
  ].join(',');
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeCustomToolSteps(value: unknown): SyncedCustomToolStep[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const steps: SyncedCustomToolStep[] = [];
  for (const rawStep of value) {
    const step = recordValue(rawStep);
    const action = stringValue(step?.action);
    if (!step || !action || action.startsWith('custom.')) continue;
    const normalized: SyncedCustomToolStep = {
      action,
      params: recordValue(step.params) ?? {},
    };
    const label = stringValue(step.label);
    if (label) normalized.label = label;
    steps.push(normalized);
    if (steps.length >= 12) break;
  }
  return steps.length > 0 ? steps : undefined;
}

export function customToolFromCloudRecord(row: CloudSyncRecord): SyncedCustomTool | null {
  if (row.table_name !== CUSTOM_TOOLS_SYNC_TABLE || row.op === 'delete') return null;
  const payload = recordValue(row.payload);
  if (!payload) return null;
  const slug = stringValue(row.row_id) ?? stringValue(payload.slug);
  const name = stringValue(payload.name);
  const baseAction = stringValue(payload.baseAction);
  const steps = normalizeCustomToolSteps(payload.steps);
  if (!slug || !name || (!baseAction && !steps)) return null;
  const updatedFallback = Date.parse(row.updated_at);
  const now = Number.isFinite(updatedFallback) ? updatedFallback : Date.now();
  const published = recordValue(payload.published);
  const publishedId = stringValue(published?.id);
  const publishedAt = numberValue(published?.at, 0);
  return {
    slug,
    name,
    description: stringValue(payload.description) ?? '',
    baseAction: steps ? (baseAction ?? 'workflow.run') : (baseAction ?? 'workflow.run'),
    params: recordValue(payload.params) ?? {},
    steps,
    emoji: stringValue(payload.emoji) ?? undefined,
    createdAt: numberValue(payload.createdAt, now),
    updatedAt: numberValue(payload.updatedAt, now),
    published: publishedId && publishedAt > 0 ? { id: publishedId, at: publishedAt } : null,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enqueue a mutation for eventual upload to Supabase.
 *
 * Always writes locally with the caller's immutable owner snapshot. Explicit
 * unbound rows remain local-only unless a future authorized migration can
 * prove their account. Returns the row id for sync-log correlation.
 */
export async function enqueueMutation(
  op: SyncOp,
  table: string,
  row_id: string,
  payload: unknown,
  ownerSnapshot: SyncQueueOwnerSnapshot = captureSyncQueueOwner(),
): Promise<string> {
  const id = newSyncId();
  const createdAt = Date.now();
  const owner = materializeSyncQueueOwner(id, ownerSnapshot);
  const row: SyncQueueRow = {
    id,
    op,
    table,
    row_id,
    payload,
    status: 'pending',
    created_at: createdAt,
  };
  await openDb();
  await db.transaction('rw', QUEUE_AND_OWNER_TABLES, async (transaction) => {
    const queue = transaction.table<SyncQueueRow, string>('sync_queue');
    const settings = transaction.table<SettingsRow, string>('settings');
    await queue.add(row);
    await settings.put({
      key: cloudSyncQueueOwnerKey(id),
      value: owner,
      updated_at: createdAt,
    });
  });
  return id;
}

/**
 * Result of one drain pass over the sync queue.
 */
export type SyncFlushResult = {
  /** Number of rows successfully pushed to Supabase. */
  processed: number;
  /** Number of rows that failed and were marked `error`. */
  errored: number;
  /** Number of rows skipped because cloud sync is not configured. */
  skipped: number;
};

export type SyncPullResult = {
  /** Number of remote rows applied locally. */
  applied: number;
  /** Number of remote rows intentionally ignored. */
  skipped: number;
  /** Number of remote rows that failed to apply. */
  errored: number;
};

/**
 * Drain up to `batchSize` pending rows from the sync queue.
 *
 * - If no Supabase client is configured or no user is signed in: returns
 *   immediately with `skipped` set to the pending count, leaving rows in
 *   `pending`.
 * - Otherwise: marks each row `in_progress`, calls Supabase, and marks
 *   `done` or `error` based on the result. Errors don't block the rest of
 *   the batch.
 *
 * Wrapped in try/catch so unexpected failures don't break the loop. Errors
 * are recorded on the offending row for later inspection.
 */
export async function processSyncQueue(
  authority: CloudSyncAuthority,
  batchSize = 100,
): Promise<SyncFlushResult> {
  requireCloudSyncAuthority(authority);
  if (authority.signal.aborted) return { processed: 0, errored: 0, skipped: 0 };
  if (syncFlushInFlight) return { processed: 0, errored: 0, skipped: 0 };
  syncFlushInFlight = true;
  try {
    const opened = await awaitUnlessAborted(openDb(), authority.signal);
    if (opened.kind === 'cancelled') return { processed: 0, errored: 0, skipped: 0 };

    if (!(await quarantineLegacyActiveSyncRows(authority))) {
      return { processed: 0, errored: 0, skipped: 0 };
    }
    if (authority.signal.aborted) return { processed: 0, errored: 0, skipped: 0 };

    const client = getSupabaseClient();
    const pending = await ownedPendingQueueRows(authority.userId, batchSize);
    if (authority.signal.aborted) {
      return { processed: 0, errored: 0, skipped: pending.pendingCount };
    }

    if (!client) {
      return { processed: 0, errored: 0, skipped: pending.pendingCount };
    }

    if (!(await sessionMatchesAuthority(authority, client))) {
      return { processed: 0, errored: 0, skipped: pending.pendingCount };
    }

    let processed = 0;
    let errored = 0;
    let skipped = pending.pendingCount - pending.rows.length;

    for (const candidate of pending.rows) {
      if (authority.signal.aborted) break;
      const claimed = await claimExactPendingQueueRow(candidate.id, authority);
      if (authority.signal.aborted) break;
      if (!claimed) {
        skipped++;
        continue;
      }
      if (authority.signal.aborted) break;

      let remoteFailed = false;
      let remoteFailure: unknown;
      try {
        const cloudRecord = buildCloudSyncRecord(claimed.row, claimed.owner);
        const remote = await awaitUnlessAborted(
          client
            .from(CLOUD_SYNC_RECORDS_TABLE)
            .upsert(cloudRecord, { onConflict: CLOUD_SYNC_CONFLICT_TARGET })
            .abortSignal(authority.signal),
          authority.signal,
        );
        if (remote.kind === 'cancelled') break;
        if (remote.value.error) throw remote.value.error;
      } catch (e) {
        if (authority.signal.aborted) break;
        remoteFailed = true;
        remoteFailure = e;
      }

      if (remoteFailed) {
        const message =
          remoteFailure instanceof Error ? remoteFailure.message : String(remoteFailure);
        const settled = await settleClaimedQueueRow(claimed, authority, {
          status: 'error' as SyncStatus,
          error: message,
        });
        if (authority.signal.aborted) break;
        if (!settled) {
          skipped++;
          continue;
        }
        errored++;
        continue;
      }

      const settled = await settleClaimedQueueRow(claimed, authority, {
        status: 'done' as SyncStatus,
      });
      if (authority.signal.aborted) break;
      if (!settled) {
        skipped++;
        continue;
      }
      processed++;
    }

    return { processed, errored, skipped };
  } finally {
    syncFlushInFlight = false;
  }
}

/**
 * Reset rows that are stuck in `error` (or `in_progress` from a previous
 * crashed run) back to `pending` so they're picked up on the next drain.
 */
export async function retrySyncErrors(authority: CloudSyncAuthority): Promise<number> {
  requireCloudSyncAuthority(authority);
  if (authority.signal.aborted) return 0;
  const opened = await awaitUnlessAborted(openDb(), authority.signal);
  if (opened.kind === 'cancelled') return 0;
  const result = await runSignalBoundWrite(
    db,
    authority.signal,
    QUEUE_AND_OWNER_TABLES,
    async (transaction) => {
      const queue = transaction.table<SyncQueueRow, string>('sync_queue');
      const settings = transaction.table<SettingsRow, string>('settings');
      const stuck = await queue
        .where('status')
        .anyOf(['error', 'in_progress'] satisfies SyncStatus[])
        .toArray();
      let retried = 0;
      for (const row of stuck) {
        const ownerKey = cloudSyncQueueOwnerKey(row.id);
        const stored = await settings.get(ownerKey);
        const owner = parseSyncQueueOwner(row.id, stored?.value);
        if (!owner) {
          const legacyStored = await settings.get(legacyCloudSyncQueueAuthorityKey(row.id));
          const quarantinedAt = Date.now();
          await settings.put({
            key: ownerKey,
            value: materializeLegacyUnknownSyncQueueOwner(
              row.id,
              legacyOwnerReason(Boolean(stored), Boolean(legacyStored)),
              quarantinedAt,
            ),
            updated_at: quarantinedAt,
          });
          await queue.update(row.id, {
            status: 'error' as SyncStatus,
            error: CLOUD_SYNC_QUEUE_QUARANTINE_ERROR,
          });
          continue;
        }
        const claimKey = cloudSyncQueueClaimKey(row.id);
        const storedClaim = await settings.get(claimKey);
        const claim = parseSyncQueueClaim(row.id, storedClaim?.value);
        if (row.status !== 'in_progress' && storedClaim) {
          const quarantinedAt = Date.now();
          await settings.put({
            key: ownerKey,
            value: materializeLegacyUnknownSyncQueueOwner(
              row.id,
              'malformed_v2_owner',
              quarantinedAt,
            ),
            updated_at: quarantinedAt,
          });
          await queue.update(row.id, {
            status: 'error' as SyncStatus,
            error: CLOUD_SYNC_QUEUE_QUARANTINE_ERROR,
          });
          continue;
        }
        if (row.status === 'in_progress' && !claim) {
          const quarantinedAt = Date.now();
          await settings.put({
            key: ownerKey,
            value: materializeLegacyUnknownSyncQueueOwner(
              row.id,
              'malformed_v2_owner',
              quarantinedAt,
            ),
            updated_at: quarantinedAt,
          });
          await queue.update(row.id, {
            status: 'error' as SyncStatus,
            error: CLOUD_SYNC_QUEUE_QUARANTINE_ERROR,
          });
          continue;
        }
        if (
          storedClaim &&
          (!claim || owner.state !== 'cloud' || !claimMatchesOwner(claim, owner))
        ) {
          const quarantinedAt = Date.now();
          await settings.put({
            key: ownerKey,
            value: materializeLegacyUnknownSyncQueueOwner(
              row.id,
              'malformed_v2_owner',
              quarantinedAt,
            ),
            updated_at: quarantinedAt,
          });
          await queue.update(row.id, {
            status: 'error' as SyncStatus,
            error: CLOUD_SYNC_QUEUE_QUARANTINE_ERROR,
          });
          continue;
        }
        if (!isExactCloudOwner(owner, authority.userId)) continue;
        if (claim) {
          const claimAge = Date.now() - claim.claimedAt;
          if (claimAge < CLOUD_SYNC_QUEUE_CLAIM_STALE_AFTER_MS) continue;
          await settings.delete(claimKey);
        }
        await queue.update(row.id, {
          status: 'pending' as SyncStatus,
          attempted_at: undefined,
          error: undefined,
        });
        retried++;
      }
      return retried;
    },
  );
  return result.kind === 'committed' ? result.value : 0;
}

/**
 * Delete sync queue rows that have completed and are older than `olderThanMs`.
 * Default: keep 7 days of history.
 */
export async function pruneSyncQueue(
  authority: CloudSyncAuthority,
  olderThanMs: number = 7 * 24 * 60 * 60 * 1000,
): Promise<number> {
  requireCloudSyncAuthority(authority);
  if (authority.signal.aborted) return 0;
  const opened = await awaitUnlessAborted(openDb(), authority.signal);
  if (opened.kind === 'cancelled') return 0;
  const cutoff = Date.now() - olderThanMs;
  const result = await runSignalBoundWrite(
    db,
    authority.signal,
    QUEUE_AND_OWNER_TABLES,
    async (transaction) => {
      const queue = transaction.table<SyncQueueRow, string>('sync_queue');
      const settings = transaction.table<SettingsRow, string>('settings');
      const doneRows = await queue
        .where('status')
        .equals('done' as SyncStatus)
        .filter((row) => row.created_at < cutoff)
        .toArray();
      const ids: string[] = [];
      for (const row of doneRows) {
        const owner = parseSyncQueueOwner(
          row.id,
          (await settings.get(cloudSyncQueueOwnerKey(row.id)))?.value,
        );
        if (owner && isExactCloudOwner(owner, authority.userId)) {
          ids.push(row.id);
        }
      }
      if (ids.length === 0) return 0;
      await queue.bulkDelete(ids);
      if (authority.signal.aborted) return 0;
      await settings.bulkDelete([
        ...ids.map(cloudSyncQueueOwnerKey),
        ...ids.map(legacyCloudSyncQueueAuthorityKey),
        ...ids.map(cloudSyncQueueClaimKey),
      ]);
      return ids.length;
    },
  );
  return result.kind === 'committed' ? result.value : 0;
}

async function applyCustomToolCloudRecord(
  row: CloudSyncRecord,
  signal: AbortSignal,
): Promise<boolean> {
  if (signal.aborted) return false;
  const { applyCloudCustomToolForAccount } = await import('@/features/tools/toolStore');
  if (signal.aborted) return false;
  if (row.op === 'delete') {
    applyCloudCustomToolForAccount(row.user_id, row.row_id, null);
  } else {
    const tool = customToolFromCloudRecord(row);
    if (!tool) return false;
    applyCloudCustomToolForAccount(row.user_id, row.row_id, tool);
  }
  return true;
}

function pluginConnectionFromCloudRecord(row: CloudSyncRecord) {
  if (row.table_name !== PLUGIN_CONNECTIONS_SYNC_TABLE || row.op === 'delete') return null;
  const payload = recordValue(row.payload);
  const pluginId = stringValue(row.row_id) ?? stringValue(payload?.pluginId);
  const state = stringValue(payload?.state);
  if (
    !payload ||
    !pluginId ||
    !['connected', 'not_connected', 'needs_setup', 'error'].includes(state ?? '')
  ) {
    return null;
  }
  return {
    pluginId,
    state: state as 'connected' | 'not_connected' | 'needs_setup' | 'error',
    enabled: payload.enabled === true,
    enabledProjectIds: Array.isArray(payload.enabledProjectIds)
      ? payload.enabledProjectIds
          .filter((value): value is string => typeof value === 'string')
          .slice(0, 50)
      : ['*'],
    accountLabel: stringValue(payload.accountLabel) ?? undefined,
    lastTestedAt: numberValue(payload.lastTestedAt, 0) || undefined,
    error: stringValue(payload.error) ?? undefined,
    configuredFields: Array.isArray(payload.configuredFields)
      ? payload.configuredFields
          .filter((value): value is string => typeof value === 'string')
          .slice(0, 20)
      : [],
    updatedAt: numberValue(payload.updatedAt, Date.parse(row.updated_at) || Date.now()),
  };
}

async function applyPluginConnectionCloudRecord(
  row: CloudSyncRecord,
  signal: AbortSignal,
): Promise<boolean> {
  if (signal.aborted) return false;
  const { applyCloudPluginConnectionForAccount } = await import('@/features/plugins/store');
  if (signal.aborted) return false;
  if (row.op === 'delete') {
    applyCloudPluginConnectionForAccount(row.user_id, row.row_id, null);
    return true;
  }
  const connection = pluginConnectionFromCloudRecord(row);
  if (!connection) return false;
  applyCloudPluginConnectionForAccount(row.user_id, row.row_id, connection);
  return true;
}

async function applyCloudSyncRecord(row: CloudSyncRecord, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return false;
  if (row.table_name === CUSTOM_TOOLS_SYNC_TABLE) {
    return applyCustomToolCloudRecord(row, signal);
  }
  if (row.table_name === PLUGIN_CONNECTIONS_SYNC_TABLE) {
    return applyPluginConnectionCloudRecord(row, signal);
  }
  return false;
}

/**
 * Pull remote app sync records and apply the small subset this client can
 * safely restore today. Unsupported table names still advance the cursor so
 * they do not replay forever while broader Dexie restore work is unfinished.
 */
export async function processCloudPull(
  authority: CloudSyncAuthority,
  batchSize = 200,
): Promise<SyncPullResult> {
  requireCloudSyncAuthority(authority);
  if (authority.signal.aborted) return { applied: 0, skipped: 0, errored: 0 };
  if (syncPullInFlight) return { applied: 0, skipped: 0, errored: 0 };
  syncPullInFlight = true;
  try {
    const opened = await awaitUnlessAborted(openDb(), authority.signal);
    if (opened.kind === 'cancelled') return { applied: 0, skipped: 0, errored: 0 };
    const client = getSupabaseClient();
    if (!client) return { applied: 0, skipped: 0, errored: 0 };

    if (!(await sessionMatchesAuthority(authority, client))) {
      return { applied: 0, skipped: 0, errored: 0 };
    }

    const cursorKey = pullCursorKey(authority.userId);
    const cursor = await db.settings.get(cursorKey);
    if (authority.signal.aborted) return { applied: 0, skipped: 0, errored: 0 };
    const lastCursor = parseCloudPullCursor(cursor?.value);
    let query = client
      .from(CLOUD_SYNC_RECORDS_TABLE)
      .select('user_id,table_name,row_id,op,payload,deleted_at,updated_at')
      .eq('user_id', authority.userId)
      .order('updated_at', { ascending: true })
      .order('table_name', { ascending: true })
      .order('row_id', { ascending: true })
      .limit(batchSize);
    if (lastCursor) query = query.or(cloudPullAfterCursorFilter(lastCursor));
    query = query.abortSignal(authority.signal);

    const remote = await awaitUnlessAborted(query, authority.signal);
    if (remote.kind === 'cancelled') return { applied: 0, skipped: 0, errored: 0 };
    const { data: rows, error } = remote.value;
    if (error) throw error;

    let applied = 0;
    let skipped = 0;
    let errored = 0;
    let cursorValue = lastCursor;

    for (const row of (rows ?? []) as CloudSyncRecord[]) {
      if (authority.signal.aborted) break;
      if (row.user_id !== authority.userId) {
        skipped++;
        continue;
      }
      try {
        const didApply = await applyCloudSyncRecord(row, authority.signal);
        if (authority.signal.aborted) break;
        if (didApply) applied++;
        else skipped++;
        cursorValue = cloudPullCursorForRecord(row);
      } catch (e) {
        console.warn('[sync] cloud pull record failed:', e);
        errored++;
        break;
      }
    }

    if (!authority.signal.aborted && cursorValue && !sameCloudPullCursor(cursorValue, lastCursor)) {
      const cursorWrite = await runSignalBoundWrite(
        db,
        authority.signal,
        [db.settings],
        async (transaction) => {
          await transaction.table<SettingsRow, string>('settings').put({
            key: cursorKey,
            value: cursorValue,
            updated_at: Date.now(),
          });
        },
      );
      if (cursorWrite.kind === 'cancelled') {
        return { applied: 0, skipped: 0, errored: 0 };
      }
    }

    if (authority.signal.aborted) return { applied: 0, skipped: 0, errored: 0 };
    return { applied, skipped, errored };
  } finally {
    syncPullInFlight = false;
  }
}

/**
 * Start a background loop that drains the sync queue every `intervalMs`.
 * Returns a `stop()` function. Safe to call when cloud sync is not
 * configured - the loop runs and the inner `processSyncQueue` no-ops.
 *
 * The loop uses a single timer (not setInterval) so a long-running drain
 * never overlaps with the next tick.
 */
export function startSyncLoop(
  parentAuthority: CloudSyncAuthority,
  intervalMs: number = 30_000,
): StopCloudSyncLoop {
  const userId = requireCloudSyncAuthority(parentAuthority);
  const controller = new AbortController();
  const authority: CloudSyncAuthority = { userId, signal: controller.signal };
  let stopped = parentAuthority.signal.aborted;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let currentTick: Promise<void> = Promise.resolve();
  let stopPromise: Promise<void> | undefined;

  const tick = async (): Promise<void> => {
    if (stopped || authority.signal.aborted) return;
    try {
      await processSyncQueue(authority);
      if (stopped || authority.signal.aborted) return;
      await processCloudPull(authority);
    } catch (e) {
      if (!stopped && !authority.signal.aborted) {
        // Swallow - we'll retry on the next tick. Log so it's visible in dev.
        // eslint-disable-next-line no-console
        console.warn('[sync] tick failed:', e);
      }
    }
    if (!stopped && !authority.signal.aborted) {
      timer = setTimeout(() => {
        currentTick = tick();
        void currentTick;
      }, intervalMs);
    }
  };

  function stop(): Promise<void> {
    if (stopPromise) return stopPromise;
    stopped = true;
    controller.abort();
    parentAuthority.signal.removeEventListener('abort', abortFromParent);
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    stopPromise = currentTick.catch(() => undefined).then(() => undefined);
    return stopPromise;
  }

  const abortFromParent = () => {
    void stop();
  };
  if (!parentAuthority.signal.aborted) {
    parentAuthority.signal.addEventListener('abort', abortFromParent, { once: true });
  } else {
    controller.abort();
  }

  // Kick off after a short delay so the app finishes booting first.
  if (!stopped) {
    timer = setTimeout(
      () => {
        currentTick = tick();
        void currentTick;
      },
      Math.min(intervalMs, 2_000),
    );
  }

  return stop;
}

// Re-export for convenience so consumers don't need to import from supabase
// to ask the cheapest "is sync on?" question.
export { isCloudSyncConfigured };
