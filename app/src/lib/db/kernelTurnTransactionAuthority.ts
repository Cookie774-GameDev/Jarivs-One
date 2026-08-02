import type { EntityTable, Table } from 'dexie';
import { nanoid } from 'nanoid';

import type { Chat, Message } from '@/types/chat';
import {
  cloudSyncQueueClaimKey,
  cloudSyncQueueOwnerKey,
  legacyCloudSyncQueueAuthorityKey,
  materializeSyncQueueOwner,
  ownersMayCoalesce,
  parseSyncQueueOwner,
  type SyncQueueOwnerSnapshot,
} from '@/lib/cloudSyncQueueOwner';
import type { JarvisDexie } from './index';
import type {
  JarvisApprovalRow,
  JarvisArtifactRow,
  JarvisEventRow,
  JarvisRunRow,
  SettingsRow,
  SyncQueueRow,
} from './schema';
import { runSignalBoundWrite, type SignalBoundTransactionResult } from './signalBoundTransaction';

const KERNEL_TURN_TABLES = Object.freeze([
  'messages',
  'chats',
  'sync_queue',
  'settings',
  'jarvis_runs',
  'jarvis_events',
  'jarvis_artifacts',
] as const);

const KERNEL_LIFECYCLE_TABLES = Object.freeze(['jarvis_runs', 'jarvis_events'] as const);
const KERNEL_APPROVAL_TABLES = Object.freeze([
  'jarvis_runs',
  'jarvis_events',
  'jarvis_approvals',
] as const);

export type KernelTurnTransactionContext = Readonly<{
  messages: EntityTable<Message, 'id'>;
  chats: EntityTable<Chat, 'id'>;
  sync_queue: EntityTable<SyncQueueRow, 'id'>;
  settings: EntityTable<SettingsRow, 'key'>;
  jarvis_runs: EntityTable<JarvisRunRow, 'id'>;
  jarvis_events: Table<JarvisEventRow, [string, number]>;
  jarvis_artifacts: EntityTable<JarvisArtifactRow, 'id'>;
}>;

export type KernelLifecycleTransactionContext = Readonly<{
  jarvis_runs: EntityTable<JarvisRunRow, 'id'>;
  jarvis_events: Table<JarvisEventRow, [string, number]>;
}>;

export type KernelApprovalTransactionContext = Readonly<{
  jarvis_runs: EntityTable<JarvisRunRow, 'id'>;
  jarvis_events: Table<JarvisEventRow, [string, number]>;
  jarvis_approvals: EntityTable<JarvisApprovalRow, 'id'>;
}>;

type KernelSyncTransactionContext = Readonly<{
  sync_queue: EntityTable<SyncQueueRow, 'id'>;
  settings: EntityTable<SettingsRow, 'key'>;
}>;

type KernelLocalSyncInput =
  | Readonly<{
      op: 'insert';
      table: 'messages';
      row: Message;
      createdAt: number;
      ownerSnapshot: SyncQueueOwnerSnapshot;
    }>
  | Readonly<{
      op: 'update';
      table: 'messages';
      row: Message;
      createdAt: number;
      ownerSnapshot: SyncQueueOwnerSnapshot;
    }>
  | Readonly<{
      op: 'update';
      table: 'chats';
      row: Chat;
      createdAt: number;
      ownerSnapshot: SyncQueueOwnerSnapshot;
    }>;

export interface KernelTurnTransactionAuthority {
  transaction<T>(
    tables: typeof KERNEL_TURN_TABLES,
    authoritySignal: AbortSignal,
    body: (context: KernelTurnTransactionContext) => T | Promise<T>,
  ): Promise<SignalBoundTransactionResult<T>>;
  lifecycleTransaction<T>(
    tables: typeof KERNEL_LIFECYCLE_TABLES,
    authoritySignal: AbortSignal,
    body: (context: KernelLifecycleTransactionContext) => T | Promise<T>,
  ): Promise<SignalBoundTransactionResult<T>>;
  approvalTransaction<T>(
    tables: typeof KERNEL_APPROVAL_TABLES,
    authoritySignal: AbortSignal,
    body: (context: KernelApprovalTransactionContext) => T | Promise<T>,
  ): Promise<SignalBoundTransactionResult<T>>;
}

export class KernelTurnTransactionConfigurationError extends Error {
  readonly code:
    | 'kernel_table_set_mismatch'
    | 'kernel_lifecycle_table_set_mismatch'
    | 'kernel_approval_table_set_mismatch';

  constructor(code: KernelTurnTransactionConfigurationError['code']) {
    super(code);
    this.name = 'KernelTurnTransactionConfigurationError';
    this.code = code;
  }
}

function assertExactTables(
  actual: readonly string[],
  expected: readonly string[],
  code: KernelTurnTransactionConfigurationError['code'],
): void {
  if (
    actual.length !== expected.length ||
    actual.some((table, index) => table !== expected[index])
  ) {
    throw new KernelTurnTransactionConfigurationError(code);
  }
}

function exactOwnerSnapshot(owner: SyncQueueOwnerSnapshot): void {
  const keys = Object.keys(owner).sort();
  const expected =
    owner.state === 'cloud' ? ['capturedAt', 'state', 'userId'] : ['capturedAt', 'state'];
  if (
    !Object.isFrozen(owner) ||
    keys.length !== expected.length ||
    keys.some((key, i) => key !== expected[i])
  ) {
    throw new TypeError('Kernel sync owner snapshot must be exact and frozen.');
  }
  materializeSyncQueueOwner('__kernel_owner_probe__', owner);
}

function rowFreshness(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  const value = record.updated_at ?? record.last_active_at;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function selectFresherPayload(
  rows: readonly SyncQueueRow[],
  incoming: Readonly<{ payload: unknown; createdAt: number }>,
): unknown {
  return [
    ...rows.map((row) => ({ payload: row.payload, createdAt: row.created_at, id: row.id })),
    { payload: incoming.payload, createdAt: incoming.createdAt, id: '\uffff' },
  ].reduce((left, right) => {
    const leftFreshness = rowFreshness(left.payload);
    const rightFreshness = rowFreshness(right.payload);
    if (leftFreshness !== null && rightFreshness !== null && leftFreshness !== rightFreshness) {
      return leftFreshness > rightFreshness ? left : right;
    }
    if (left.createdAt !== right.createdAt) return left.createdAt > right.createdAt ? left : right;
    return left.id >= right.id ? left : right;
  }).payload;
}

function laterPendingRow(left: SyncQueueRow, right: SyncQueueRow): SyncQueueRow {
  if (left.created_at !== right.created_at) {
    return left.created_at > right.created_at ? left : right;
  }
  return left.id >= right.id ? left : right;
}

function syncPayload(input: KernelLocalSyncInput): unknown {
  if (input.table === 'messages') return input.row;
  const { connection: _localConnection, ...payload } = input.row;
  return payload;
}

async function allocateFreshQueueId(context: KernelSyncTransactionContext): Promise<string> {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const id = `syq_${nanoid(16)}`;
    const [owner, claim, legacy] = await Promise.all([
      context.settings.get(cloudSyncQueueOwnerKey(id)),
      context.settings.get(cloudSyncQueueClaimKey(id)),
      context.settings.get(legacyCloudSyncQueueAuthorityKey(id)),
    ]);
    if (!owner && !claim && !legacy) return id;
  }
  throw new TypeError('Kernel sync queue ID allocation exhausted.');
}

/** @internal Used only by repositories.ts, kernelTurnCommit.ts, and focused tests. */
export async function enqueueLocalSyncInTransaction(
  context: KernelSyncTransactionContext,
  input: KernelLocalSyncInput,
): Promise<void> {
  exactOwnerSnapshot(input.ownerSnapshot);
  if (!Number.isSafeInteger(input.createdAt) || input.createdAt < 0) {
    throw new TypeError('Kernel sync queue timestamp must be a nonnegative safe integer.');
  }
  if (!input.row.id || input.row.id.trim() !== input.row.id) {
    throw new TypeError('Kernel sync queue row requires an exact identifier.');
  }

  const payload = syncPayload(input);
  const candidates = await context.sync_queue
    .where('status')
    .equals('pending')
    .filter((row) => row.table === input.table && row.row_id === input.row.id)
    .toArray();
  const coalescible: SyncQueueRow[] = [];
  for (const candidate of candidates) {
    if (await context.settings.get(cloudSyncQueueClaimKey(candidate.id))) continue;
    if (await context.settings.get(legacyCloudSyncQueueAuthorityKey(candidate.id))) continue;
    const stored = await context.settings.get(cloudSyncQueueOwnerKey(candidate.id));
    const owner = parseSyncQueueOwner(candidate.id, stored?.value);
    if (owner && ownersMayCoalesce(owner, input.ownerSnapshot)) coalescible.push(candidate);
  }

  if (coalescible.length > 0) {
    const survivor = coalescible.reduce(laterPendingRow);
    const deleteIsTerminal = coalescible.some((candidate) => candidate.op === 'delete');
    await context.sync_queue.update(survivor.id, {
      op: deleteIsTerminal
        ? 'delete'
        : input.op === 'insert' || coalescible.some((candidate) => candidate.op === 'insert')
          ? 'insert'
          : 'update',
      payload: deleteIsTerminal
        ? null
        : selectFresherPayload(coalescible, { payload, createdAt: input.createdAt }),
      created_at: input.createdAt,
      error: undefined,
    });
    for (const duplicate of coalescible) {
      if (duplicate.id === survivor.id) continue;
      await context.sync_queue.delete(duplicate.id);
      await context.settings.delete(cloudSyncQueueOwnerKey(duplicate.id));
    }
    return;
  }

  const id = await allocateFreshQueueId(context);
  await context.sync_queue.add({
    id,
    op: input.op,
    table: input.table,
    row_id: input.row.id,
    payload,
    status: 'pending',
    created_at: input.createdAt,
  });
  await context.settings.put({
    key: cloudSyncQueueOwnerKey(id),
    value: materializeSyncQueueOwner(id, input.ownerSnapshot),
    updated_at: input.createdAt,
  });
}

export function createKernelTurnTransactionAuthority(
  db: JarvisDexie,
): KernelTurnTransactionAuthority {
  return Object.freeze({
    async transaction<T>(
      tables: typeof KERNEL_TURN_TABLES,
      authoritySignal: AbortSignal,
      body: (context: KernelTurnTransactionContext) => T | Promise<T>,
    ) {
      assertExactTables(tables, KERNEL_TURN_TABLES, 'kernel_table_set_mismatch');
      return runSignalBoundWrite(
        db,
        authoritySignal,
        [
          db.messages,
          db.chats,
          db.sync_queue,
          db.settings,
          db.jarvis_runs,
          db.jarvis_events,
          db.jarvis_artifacts,
        ] as const,
        () =>
          body(
            Object.freeze({
              messages: db.messages,
              chats: db.chats,
              sync_queue: db.sync_queue,
              settings: db.settings,
              jarvis_runs: db.jarvis_runs,
              jarvis_events: db.jarvis_events,
              jarvis_artifacts: db.jarvis_artifacts,
            }),
          ),
      );
    },

    async lifecycleTransaction<T>(
      tables: typeof KERNEL_LIFECYCLE_TABLES,
      authoritySignal: AbortSignal,
      body: (context: KernelLifecycleTransactionContext) => T | Promise<T>,
    ) {
      assertExactTables(tables, KERNEL_LIFECYCLE_TABLES, 'kernel_lifecycle_table_set_mismatch');
      return runSignalBoundWrite(
        db,
        authoritySignal,
        [db.jarvis_runs, db.jarvis_events] as const,
        () =>
          body(
            Object.freeze({
              jarvis_runs: db.jarvis_runs,
              jarvis_events: db.jarvis_events,
            }),
          ),
      );
    },

    async approvalTransaction<T>(
      tables: typeof KERNEL_APPROVAL_TABLES,
      authoritySignal: AbortSignal,
      body: (context: KernelApprovalTransactionContext) => T | Promise<T>,
    ) {
      assertExactTables(tables, KERNEL_APPROVAL_TABLES, 'kernel_approval_table_set_mismatch');
      return runSignalBoundWrite(
        db,
        authoritySignal,
        [db.jarvis_runs, db.jarvis_events, db.jarvis_approvals] as const,
        () =>
          body(
            Object.freeze({
              jarvis_runs: db.jarvis_runs,
              jarvis_events: db.jarvis_events,
              jarvis_approvals: db.jarvis_approvals,
            }),
          ),
      );
    },
  });
}
