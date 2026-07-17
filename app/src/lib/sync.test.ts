import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncQueueRow } from './db';

const syncHarness = vi.hoisted(() => {
  type QueueRow = SyncQueueRow & Record<string, unknown>;
  type Deferred<T> = {
    promise: Promise<T>;
    resolve(value: T): void;
  };

  const deferred = <T>(): Deferred<T> => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  };

  const queueRows = new Map<string, QueueRow>();
  const settingsRows = new Map<string, { key: string; value: unknown; updated_at: number }>();
  type TestTransaction = {
    active: boolean;
    aborted: boolean;
    db: unknown;
    abort(): void;
    table(name: string): unknown;
  };
  const dexieRuntime = {
    currentTransaction: undefined as TestTransaction | undefined,
  };
  let deferredQueueUpdate: { id: string; gate: Deferred<void> } | undefined;
  let deferredSettingsPut: { key: string; gate: Deferred<void> } | undefined;
  let deferredQueueBulkDelete: Deferred<void> | undefined;
  let deferredOpenDb: Deferred<void> | undefined;
  let nextSettingsPutError: Error | undefined;
  let afterPendingSnapshot: (() => void) | undefined;
  let beforeTransactionScope: (() => void) | undefined;

  const makeQueueQuery = () => {
    let statuses: string[] | undefined;
    let predicate: ((row: QueueRow) => boolean) | undefined;
    let limit = Number.POSITIVE_INFINITY;
    const query = {
      equals(value: string) {
        statuses = [value];
        return query;
      },
      anyOf(values: string[]) {
        statuses = values;
        return query;
      },
      filter(next: (row: QueueRow) => boolean) {
        predicate = next;
        return query;
      },
      limit(next: number) {
        limit = next;
        return query;
      },
      async toArray() {
        const rows = [...queueRows.values()]
          .filter((row) => !statuses || statuses.includes(String(row.status)))
          .filter((row) => !predicate || predicate(row))
          .slice(0, limit)
          .map((row) => ({ ...row }));
        if (statuses?.includes('pending') && afterPendingSnapshot) {
          const callback = afterPendingSnapshot;
          afterPendingSnapshot = undefined;
          callback();
        }
        return rows;
      },
      async delete() {
        const rows = await query.toArray();
        for (const row of rows) queueRows.delete(String(row.id));
        return rows.length;
      },
    };
    return query;
  };

  const db = {
    sync_queue: {
      where: vi.fn(() => makeQueueQuery()),
      get: vi.fn(async (id: string) => {
        const row = queueRows.get(id);
        return row ? { ...row } : undefined;
      }),
      add: vi.fn(async (row: QueueRow) => {
        queueRows.set(String(row.id), { ...row });
        return row.id;
      }),
      update: vi.fn(async (id: string, changes: Record<string, unknown>) => {
        if (deferredQueueUpdate?.id === id) {
          const pending = deferredQueueUpdate.gate;
          deferredQueueUpdate = undefined;
          await pending.promise;
        }
        const row = queueRows.get(id);
        if (!row) return 0;
        queueRows.set(id, { ...row, ...changes });
        return 1;
      }),
      bulkDelete: vi.fn(async (ids: string[]) => {
        if (deferredQueueBulkDelete) {
          const pending = deferredQueueBulkDelete;
          deferredQueueBulkDelete = undefined;
          await pending.promise;
        }
        for (const id of ids) queueRows.delete(id);
      }),
    },
    settings: {
      get: vi.fn(async (key: string) => settingsRows.get(key)),
      put: vi.fn(async (row: { key: string; value: unknown; updated_at: number }) => {
        if (nextSettingsPutError) {
          const error = nextSettingsPutError;
          nextSettingsPutError = undefined;
          throw error;
        }
        if (deferredSettingsPut?.key === row.key) {
          const pending = deferredSettingsPut.gate;
          deferredSettingsPut = undefined;
          await pending.promise;
        }
        settingsRows.set(row.key, { ...row });
        return row.key;
      }),
      delete: vi.fn(async (key: string) => {
        settingsRows.delete(key);
      }),
      bulkDelete: vi.fn(async (keys: string[]) => {
        for (const key of keys) settingsRows.delete(key);
      }),
    },
    transaction: vi.fn(async (...args: unknown[]) => {
      const body = args.at(-1);
      if (typeof body !== 'function') throw new Error('missing transaction body');
      const queueSnapshot = new Map(
        [...queueRows].map(([key, value]) => [key, { ...value }] as const),
      );
      const settingsSnapshot = new Map(
        [...settingsRows].map(([key, value]) => [key, { ...value }] as const),
      );
      const transaction: TestTransaction = {
        active: true,
        aborted: false,
        db,
        abort() {
          transaction.aborted = true;
          transaction.active = false;
        },
        table(name: string) {
          return db[name as 'sync_queue' | 'settings'];
        },
      };
      dexieRuntime.currentTransaction = transaction;
      try {
        if (beforeTransactionScope) {
          const callback = beforeTransactionScope;
          beforeTransactionScope = undefined;
          callback();
        }
        const result = await (body as (current: TestTransaction) => unknown)(transaction);
        if (transaction.aborted) {
          throw new DOMException('Transaction aborted', 'AbortError');
        }
        transaction.active = false;
        return result;
      } catch (error) {
        queueRows.clear();
        for (const [key, value] of queueSnapshot) queueRows.set(key, value);
        settingsRows.clear();
        for (const [key, value] of settingsSnapshot) settingsRows.set(key, value);
        transaction.active = false;
        throw error;
      } finally {
        if (dexieRuntime.currentTransaction === transaction) {
          dexieRuntime.currentTransaction = undefined;
        }
      }
    }),
  };

  const openDb = vi.fn(async () => {
    if (deferredOpenDb) {
      const pending = deferredOpenDb;
      deferredOpenDb = undefined;
      await pending.promise;
    }
  });
  const getSession = vi.fn(async () => ({
    data: { session: { user: { id: 'user-a' } } },
  }));

  let upsertDeferred = deferred<{ error: unknown }>();
  let pullDeferred = deferred<{ data: unknown[] | null; error: unknown }>();
  const queuedPullResults: Array<{ data: unknown[] | null; error: unknown }> = [];
  const toolImportGate = deferred<void>();
  const toolImportStarted = deferred<void>();
  let upsertSignal: AbortSignal | undefined;
  let pullSignal: AbortSignal | undefined;

  const upsertBuilder = {
    abortSignal: vi.fn((signal: AbortSignal) => {
      upsertSignal = signal;
      return upsertBuilder;
    }),
    then<TResult1 = { error: unknown }, TResult2 = never>(
      onfulfilled?: ((value: { error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return upsertDeferred.promise.then(onfulfilled, onrejected);
    },
  };

  const pullBuilder = {
    eq: vi.fn(() => pullBuilder),
    order: vi.fn(() => pullBuilder),
    limit: vi.fn(() => pullBuilder),
    gt: vi.fn(() => pullBuilder),
    or: vi.fn(() => pullBuilder),
    abortSignal: vi.fn((signal: AbortSignal) => {
      pullSignal = signal;
      return pullBuilder;
    }),
    then<TResult1 = { data: unknown[] | null; error: unknown }, TResult2 = never>(
      onfulfilled?:
        | ((value: { data: unknown[] | null; error: unknown }) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      const queued = queuedPullResults.shift();
      return (queued ? Promise.resolve(queued) : pullDeferred.promise).then(
        onfulfilled,
        onrejected,
      );
    },
  };

  const upsert = vi.fn(() => upsertBuilder);
  const select = vi.fn(() => pullBuilder);
  const from = vi.fn(() => ({ upsert, select }));
  const getSupabaseClient = vi.fn(() => ({ auth: { getSession }, from }));
  const toolSetState = vi.fn();
  const pluginSetState = vi.fn();
  const toolApplyForAccount = vi.fn();
  const pluginApplyForAccount = vi.fn();
  let activeIdentity: { accountId: string; source: 'supabase' | 'local' } | null = {
    accountId: 'user-a',
    source: 'supabase',
  };

  const reset = () => {
    queueRows.clear();
    settingsRows.clear();
    vi.clearAllMocks();
    getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-a' } } },
    });
    upsertDeferred = deferred<{ error: unknown }>();
    pullDeferred = deferred<{ data: unknown[] | null; error: unknown }>();
    upsertSignal = undefined;
    pullSignal = undefined;
    queuedPullResults.length = 0;
    activeIdentity = { accountId: 'user-a', source: 'supabase' };
    deferredQueueUpdate = undefined;
    deferredSettingsPut = undefined;
    deferredQueueBulkDelete = undefined;
    deferredOpenDb = undefined;
    nextSettingsPutError = undefined;
    afterPendingSnapshot = undefined;
    beforeTransactionScope = undefined;
  };

  return {
    db,
    dexieRuntime,
    deferred,
    deferQueueBulkDelete() {
      const gate = deferred<void>();
      deferredQueueBulkDelete = gate;
      return gate;
    },
    deferOpenDb() {
      const gate = deferred<void>();
      deferredOpenDb = gate;
      return gate;
    },
    deferQueueUpdate(id: string) {
      const gate = deferred<void>();
      deferredQueueUpdate = { id, gate };
      return gate;
    },
    deferSettingsPut(key: string) {
      const gate = deferred<void>();
      deferredSettingsPut = { key, gate };
      return gate;
    },
    from,
    getSession,
    getSupabaseClient,
    openDb,
    pluginSetState,
    pluginApplyForAccount,
    pullBuilder,
    queueRows,
    reset,
    resolvePull(value: { data: unknown[] | null; error: unknown }) {
      pullDeferred.resolve(value);
    },
    queuePullResult(value: { data: unknown[] | null; error: unknown }) {
      queuedPullResults.push(value);
    },
    resolveUpsert(value: { error: unknown }) {
      upsertDeferred.resolve(value);
    },
    settingsRows,
    failNextSettingsPut(error: Error) {
      nextSettingsPutError = error;
    },
    runAfterPendingSnapshot(callback: () => void) {
      afterPendingSnapshot = callback;
    },
    runBeforeTransactionScope(callback: () => void) {
      beforeTransactionScope = callback;
    },
    getActiveIdentity() {
      return activeIdentity;
    },
    setActiveIdentity(identity: typeof activeIdentity) {
      activeIdentity = identity;
    },
    toolImportGate,
    toolImportStarted,
    toolSetState,
    toolApplyForAccount,
    upsert,
    upsertBuilder,
    get pullSignal() {
      return pullSignal;
    },
    get upsertSignal() {
      return upsertSignal;
    },
  };
});

vi.mock('./db', () => ({
  db: syncHarness.db,
  openDb: syncHarness.openDb,
}));

vi.mock('dexie', () => ({
  default: syncHarness.dexieRuntime,
}));

vi.mock('./supabase', () => ({
  getSupabaseClient: syncHarness.getSupabaseClient,
  isCloudSyncConfigured: () => true,
}));

vi.mock('./cloudSyncQueueOwner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./cloudSyncQueueOwner')>();
  return {
    ...actual,
    CLOUD_SYNC_QUEUE_QUARANTINE_ERROR_PREFIX: 'cloud_sync_quarantined:',
    captureSyncQueueOwner: (capturedAt = Date.now()) => {
      const identity = syncHarness.getActiveIdentity();
      return identity?.source === 'supabase'
        ? {
            state: 'cloud' as const,
            userId: identity.accountId,
            capturedAt,
          }
        : { state: 'unbound' as const, capturedAt };
    },
    currentCloudSyncQueueOwnerClaim: (boundAt = Date.now()) => {
      const identity = syncHarness.getActiveIdentity();
      return identity
        ? {
            schemaVersion: 2 as const,
            accountId: identity.accountId,
            source: identity.source,
            boundAt,
          }
        : null;
    },
    parseCloudSyncQueueOwnerClaim: (value: unknown) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      const candidate = value as Record<string, unknown>;
      if (typeof candidate.rowId === 'string') {
        const parsed = actual.parseSyncQueueOwner(candidate.rowId, value);
        return parsed?.state === 'cloud'
          ? {
              schemaVersion: 2 as const,
              accountId: parsed.userId,
              source: 'supabase' as const,
              boundAt: parsed.capturedAt,
            }
          : parsed?.state === 'unbound'
            ? {
                schemaVersion: 2 as const,
                accountId: 'unbound',
                source: 'local' as const,
                boundAt: parsed.capturedAt,
              }
            : null;
      }
      return candidate.schemaVersion === 2 &&
        typeof candidate.accountId === 'string' &&
        (candidate.source === 'supabase' || candidate.source === 'local') &&
        typeof candidate.boundAt === 'number'
        ? candidate
        : null;
    },
  };
});

vi.mock('@/features/tools/toolStore', async () => {
  syncHarness.toolImportStarted.resolve(undefined);
  await syncHarness.toolImportGate.promise;
  return {
    applyCloudCustomToolForAccount: syncHarness.toolApplyForAccount,
    useToolStore: { setState: syncHarness.toolSetState },
  };
});

vi.mock('@/features/plugins/store', () => ({
  applyCloudPluginConnectionForAccount: syncHarness.pluginApplyForAccount,
  usePluginStore: { setState: syncHarness.pluginSetState },
}));

import {
  buildCloudSyncRecord,
  customToolFromCloudRecord,
  enqueueMutation,
  primaryKeyForSyncTable,
  processCloudPull,
  processSyncQueue,
  pruneSyncQueue,
  retrySyncErrors,
  startSyncLoop,
} from './sync';
import {
  CLOUD_SYNC_QUEUE_CLAIM_STALE_AFTER_MS,
  CLOUD_SYNC_QUEUE_QUARANTINE_ERROR,
  cloudSyncQueueClaimKey,
  cloudSyncQueueOwnerKey,
  legacyCloudSyncQueueAuthorityKey,
  materializeSyncQueueOwner,
} from './cloudSyncQueueOwner';

beforeEach(() => {
  syncHarness.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('sync table metadata', () => {
  it('uses id for normal app-sync tables', () => {
    expect(primaryKeyForSyncTable('projects')).toBe('id');
    expect(primaryKeyForSyncTable('messages')).toBe('id');
  });

  it('uses table-specific primary keys for non-id tables', () => {
    expect(primaryKeyForSyncTable('settings')).toBe('key');
    expect(primaryKeyForSyncTable('terminal_layouts')).toBe('project_id');
  });
});

describe('cloud sync records', () => {
  const baseRow: SyncQueueRow = {
    id: 'syq_123',
    op: 'update',
    table: 'workspaces',
    row_id: 'wsp_1',
    payload: {
      id: 'wsp_1',
      owner_id: 'usr_local',
      name: 'Personal',
      created_at: 1,
      updated_at: 2,
    },
    status: 'pending',
    created_at: Date.parse('2026-06-04T12:00:00.000Z'),
  };
  const cloudOwner = materializeSyncQueueOwner('syq_123', {
    state: 'cloud',
    userId: 'auth_user_1',
    capturedAt: 1,
  });

  it('wraps local mutations as per-user Supabase documents', () => {
    expect(buildCloudSyncRecord(baseRow, cloudOwner)).toEqual({
      user_id: 'auth_user_1',
      table_name: 'workspaces',
      row_id: 'wsp_1',
      op: 'update',
      payload: baseRow.payload,
      deleted_at: null,
      updated_at: '2026-06-04T12:00:00.000Z',
    });
  });

  it('stores deletes as tombstones instead of dropping the cloud record', () => {
    expect(
      buildCloudSyncRecord(
        { ...baseRow, op: 'delete', payload: null },
        cloudOwner,
        '2026-06-04T12:05:00.000Z',
      ),
    ).toEqual({
      user_id: 'auth_user_1',
      table_name: 'workspaces',
      row_id: 'wsp_1',
      op: 'delete',
      payload: null,
      deleted_at: '2026-06-04T12:05:00.000Z',
      updated_at: '2026-06-04T12:00:00.000Z',
    });
  });

  it('normalizes custom tool payloads from cloud records', () => {
    expect(
      customToolFromCloudRecord({
        user_id: 'auth_user_1',
        table_name: 'custom_tools',
        row_id: 'ship-check',
        op: 'update',
        payload: {
          slug: 'different-local-slug',
          name: 'Ship check',
          description: 'Run release checks',
          baseAction: 'workflow.run',
          params: {},
          steps: [{ action: 'clock.timer', params: { durationMinutes: 1 }, label: 'Timer' }],
          createdAt: 10,
          updatedAt: 20,
          published: null,
        },
        deleted_at: null,
        updated_at: '2026-06-04T12:00:00.000Z',
      }),
    ).toEqual({
      slug: 'ship-check',
      name: 'Ship check',
      description: 'Run release checks',
      baseAction: 'workflow.run',
      params: {},
      steps: [{ action: 'clock.timer', params: { durationMinutes: 1 }, label: 'Timer' }],
      emoji: undefined,
      createdAt: 10,
      updatedAt: 20,
      published: null,
    });
  });

  it('rejects malformed custom tool cloud records', () => {
    expect(
      customToolFromCloudRecord({
        user_id: 'auth_user_1',
        table_name: 'custom_tools',
        row_id: 'bad',
        op: 'update',
        payload: { description: 'missing name and action' },
        deleted_at: null,
        updated_at: '2026-06-04T12:00:00.000Z',
      }),
    ).toBeNull();
  });
});

describe('cloud sync authority lifecycle', () => {
  const pendingRow = (): SyncQueueRow => ({
    id: 'syq_pending',
    op: 'update',
    table: 'workspaces',
    row_id: 'wsp_1',
    payload: { id: 'wsp_1', name: 'Personal' },
    status: 'pending',
    created_at: 1,
  });

  const bindPendingRow = (userId = 'user-a'): void => {
    syncHarness.queueRows.set('syq_pending', pendingRow());
    syncHarness.settingsRows.set(cloudSyncQueueOwnerKey('syq_pending'), {
      key: cloudSyncQueueOwnerKey('syq_pending'),
      value: materializeSyncQueueOwner('syq_pending', {
        state: 'cloud',
        userId,
        capturedAt: 1,
      }),
      updated_at: 1,
    });
  };

  const bindOwner = (
    rowId: string,
    owner:
      | { state: 'cloud'; userId: string; capturedAt: number }
      | { state: 'unbound'; capturedAt: number },
  ): void => {
    syncHarness.settingsRows.set(cloudSyncQueueOwnerKey(rowId), {
      key: cloudSyncQueueOwnerKey(rowId),
      value: materializeSyncQueueOwner(rowId, owner),
      updated_at: owner.capturedAt,
    });
  };

  const claimKey = cloudSyncQueueClaimKey;

  it('atomically stamps the canonical owner before a direct mutation becomes pending', async () => {
    const rowId = await enqueueMutation('update', 'workspaces', 'wsp_1', {
      id: 'wsp_1',
      name: 'User A workspace',
    });

    expect(syncHarness.queueRows.get(rowId)?.status).toBe('pending');
    expect(syncHarness.settingsRows.get(cloudSyncQueueOwnerKey(rowId))?.value).toEqual(
      expect.objectContaining({
        schemaVersion: 2,
        rowId,
        state: 'cloud',
        userId: 'user-a',
      }),
    );
  });

  it('captures enqueue ownership before openDb settles', async () => {
    syncHarness.setActiveIdentity({
      accountId: 'user-a',
      source: 'supabase',
    });
    const openGate = syncHarness.deferOpenDb();
    const enqueue = enqueueMutation('update', 'workspaces', 'wsp_1', {
      id: 'wsp_1',
      name: 'User A workspace',
    });
    await vi.waitFor(() => expect(syncHarness.openDb).toHaveBeenCalled());

    syncHarness.setActiveIdentity({
      accountId: 'user-b',
      source: 'supabase',
    });
    openGate.resolve(undefined);

    const rowId = await enqueue;
    expect(syncHarness.settingsRows.get(cloudSyncQueueOwnerKey(rowId))?.value).toMatchObject({
      state: 'cloud',
      userId: 'user-a',
    });
  });

  it('persists explicit unbound evidence instead of dropping offline mutations', async () => {
    syncHarness.setActiveIdentity(null);

    const rowId = await enqueueMutation('insert', 'workspaces', 'wsp_offline', {
      id: 'wsp_offline',
      name: 'Offline workspace',
    });

    expect(syncHarness.queueRows.get(rowId)?.status).toBe('pending');
    expect(syncHarness.settingsRows.get(cloudSyncQueueOwnerKey(rowId))?.value).toMatchObject({
      schemaVersion: 2,
      rowId,
      state: 'unbound',
    });
  });

  it('rolls back the queue row when its ownership sidecar cannot persist', async () => {
    const persistenceError = new Error('settings unavailable');
    syncHarness.failNextSettingsPut(persistenceError);

    await expect(
      enqueueMutation('update', 'workspaces', 'wsp_1', {
        id: 'wsp_1',
        name: 'Atomic mutation',
      }),
    ).rejects.toBe(persistenceError);

    expect(syncHarness.queueRows.size).toBe(0);
    expect(syncHarness.settingsRows.size).toBe(0);
  });

  it('does not let user B drain a pending mutation enqueued by user A', async () => {
    await enqueueMutation('update', 'workspaces', 'wsp_1', {
      id: 'wsp_1',
      name: 'User A workspace',
    });
    syncHarness.setActiveIdentity({ accountId: 'user-b', source: 'supabase' });
    syncHarness.getSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'user-b' } } },
    });
    syncHarness.resolveUpsert({ error: null });
    const controller = new AbortController();

    const result = await processSyncQueue({
      userId: 'user-b',
      signal: controller.signal,
    });

    expect(result.processed).toBe(0);
    expect(syncHarness.upsert).not.toHaveBeenCalled();
    expect([...syncHarness.queueRows.values()]).toEqual([
      expect.objectContaining({
        status: 'pending',
        payload: expect.objectContaining({ name: 'User A workspace' }),
      }),
    ]);
  });

  it('does not upload or implicitly adopt an explicit unbound row', async () => {
    syncHarness.queueRows.set('syq_unbound', {
      ...pendingRow(),
      id: 'syq_unbound',
    });
    bindOwner('syq_unbound', { state: 'unbound', capturedAt: 1 });
    const controller = new AbortController();

    const result = await processSyncQueue({
      userId: 'user-a',
      signal: controller.signal,
    });

    expect(result.processed).toBe(0);
    expect(syncHarness.upsert).not.toHaveBeenCalled();
    expect(syncHarness.queueRows.get('syq_unbound')?.status).toBe('pending');
    expect(syncHarness.queueRows.get('syq_unbound')?.error).toBeUndefined();
  });

  it('quarantines owner evidence that is bound to a different queue row id', async () => {
    syncHarness.queueRows.set('syq_pending', pendingRow());
    syncHarness.settingsRows.set(cloudSyncQueueOwnerKey('syq_pending'), {
      key: cloudSyncQueueOwnerKey('syq_pending'),
      value: materializeSyncQueueOwner('syq_other', {
        state: 'cloud',
        userId: 'user-a',
        capturedAt: 1,
      }),
      updated_at: 1,
    });
    syncHarness.resolveUpsert({ error: null });
    const controller = new AbortController();

    await processSyncQueue({
      userId: 'user-a',
      signal: controller.signal,
    });

    expect(syncHarness.upsert).not.toHaveBeenCalled();
    expect(syncHarness.queueRows.get('syq_pending')).toMatchObject({
      status: 'error',
      error: CLOUD_SYNC_QUEUE_QUARANTINE_ERROR,
    });
    expect(
      syncHarness.settingsRows.get(cloudSyncQueueOwnerKey('syq_pending'))?.value,
    ).toMatchObject({
      state: 'legacy_unknown',
      reason: 'malformed_v2_owner',
    });

    const controllerB = new AbortController();
    await expect(retrySyncErrors({ userId: 'user-b', signal: controllerB.signal })).resolves.toBe(
      0,
    );
    syncHarness.getSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'user-b' } } },
    });
    await processSyncQueue({
      userId: 'user-b',
      signal: controllerB.signal,
    });
    expect(syncHarness.upsert).not.toHaveBeenCalled();
  });

  it('quarantines every active legacy status without assigning the live user', async () => {
    for (const status of ['pending', 'error', 'in_progress'] as const) {
      const id = `syq_legacy_${status}`;
      syncHarness.queueRows.set(id, {
        ...pendingRow(),
        id,
        status,
        error: status === 'pending' ? undefined : 'old failure',
      });
    }
    const controller = new AbortController();

    await retrySyncErrors({ userId: 'user-a', signal: controller.signal });
    await processSyncQueue({ userId: 'user-a', signal: controller.signal });

    expect(syncHarness.upsert).not.toHaveBeenCalled();
    for (const status of ['pending', 'error', 'in_progress'] as const) {
      const id = `syq_legacy_${status}`;
      expect(syncHarness.queueRows.get(id)).toMatchObject({
        status: 'error',
        error: CLOUD_SYNC_QUEUE_QUARANTINE_ERROR,
      });
      expect(syncHarness.settingsRows.get(cloudSyncQueueOwnerKey(id))?.value).toMatchObject({
        schemaVersion: 2,
        rowId: id,
        state: 'legacy_unknown',
      });
    }
  });

  it('records v1-only ownership as untrusted drain-time evidence', async () => {
    syncHarness.queueRows.set('syq_v1', {
      ...pendingRow(),
      id: 'syq_v1',
    });
    syncHarness.settingsRows.set(legacyCloudSyncQueueAuthorityKey('syq_v1'), {
      key: legacyCloudSyncQueueAuthorityKey('syq_v1'),
      value: { schemaVersion: 1, accountId: 'user-a' },
      updated_at: 1,
    });
    const controller = new AbortController();

    await processSyncQueue({ userId: 'user-a', signal: controller.signal });

    expect(syncHarness.upsert).not.toHaveBeenCalled();
    expect(syncHarness.settingsRows.get(cloudSyncQueueOwnerKey('syq_v1'))?.value).toMatchObject({
      state: 'legacy_unknown',
      reason: 'v1_drain_claim_only',
    });
  });

  it('explicitly quarantines a legacy retry row whose owner cannot be proven', async () => {
    syncHarness.queueRows.set('syq_legacy', {
      ...pendingRow(),
      id: 'syq_legacy',
      status: 'error',
      error: 'previous network failure',
    });
    const controller = new AbortController();

    await expect(retrySyncErrors({ userId: 'user-a', signal: controller.signal })).resolves.toBe(0);

    expect(syncHarness.queueRows.get('syq_legacy')).toMatchObject({
      status: 'error',
      error: CLOUD_SYNC_QUEUE_QUARANTINE_ERROR,
    });
  });

  it('finds user B work behind more than one batch of older user A rows', async () => {
    for (let index = 0; index < 101; index += 1) {
      const id = `syq_a_${String(index).padStart(3, '0')}`;
      syncHarness.queueRows.set(id, {
        ...pendingRow(),
        id,
        row_id: `wsp_a_${index}`,
        created_at: index,
      });
      bindOwner(id, {
        state: 'cloud',
        userId: 'user-a',
        capturedAt: index,
      });
    }
    syncHarness.queueRows.set('syq_b', {
      ...pendingRow(),
      id: 'syq_b',
      row_id: 'wsp_b',
      payload: { id: 'wsp_b', name: 'User B workspace' },
      created_at: 200,
    });
    bindOwner('syq_b', {
      state: 'cloud',
      userId: 'user-b',
      capturedAt: 200,
    });
    syncHarness.getSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'user-b' } } },
    });
    syncHarness.resolveUpsert({ error: null });
    const controller = new AbortController();

    const result = await processSyncQueue({ userId: 'user-b', signal: controller.signal }, 100);

    expect(result.processed).toBe(1);
    expect(syncHarness.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-b',
        row_id: 'wsp_b',
      }),
      expect.anything(),
    );
  });

  it('uploads the payload reread by the atomic claim', async () => {
    bindPendingRow();
    syncHarness.runAfterPendingSnapshot(() => {
      const current = syncHarness.queueRows.get('syq_pending');
      if (current) {
        syncHarness.queueRows.set('syq_pending', {
          ...current,
          payload: { id: 'wsp_1', name: 'Latest coalesced payload' },
        });
      }
    });
    syncHarness.resolveUpsert({ error: null });
    const controller = new AbortController();

    await processSyncQueue({ userId: 'user-a', signal: controller.signal });

    expect(syncHarness.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          name: 'Latest coalesced payload',
        }),
      }),
      expect.anything(),
    );
  });

  it('does not settle success after immutable owner evidence changes', async () => {
    bindPendingRow();
    const controller = new AbortController();
    const flush = processSyncQueue({
      userId: 'user-a',
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(syncHarness.upsert).toHaveBeenCalled());

    bindOwner('syq_pending', {
      state: 'cloud',
      userId: 'user-b',
      capturedAt: 2,
    });
    syncHarness.resolveUpsert({ error: null });

    await expect(flush).resolves.toMatchObject({ processed: 0 });
    expect(syncHarness.queueRows.get('syq_pending')).toMatchObject({
      status: 'error',
      error: CLOUD_SYNC_QUEUE_QUARANTINE_ERROR,
    });
    expect(
      syncHarness.settingsRows.get(cloudSyncQueueOwnerKey('syq_pending'))?.value,
    ).toMatchObject({
      state: 'legacy_unknown',
      reason: 'malformed_v2_owner',
    });
  });

  it('does not settle a remote error after immutable owner evidence changes', async () => {
    bindPendingRow();
    const controller = new AbortController();
    const flush = processSyncQueue({
      userId: 'user-a',
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(syncHarness.upsert).toHaveBeenCalled());

    bindOwner('syq_pending', {
      state: 'cloud',
      userId: 'user-b',
      capturedAt: 2,
    });
    syncHarness.resolveUpsert({ error: new Error('remote unavailable') });

    await expect(flush).resolves.toMatchObject({ errored: 0 });
    expect(syncHarness.queueRows.get('syq_pending')).toMatchObject({
      status: 'error',
      error: CLOUD_SYNC_QUEUE_QUARANTINE_ERROR,
    });
    expect(
      syncHarness.settingsRows.get(cloudSyncQueueOwnerKey('syq_pending'))?.value,
    ).toMatchObject({
      state: 'legacy_unknown',
      reason: 'malformed_v2_owner',
    });
  });

  it.each([
    [
      'removed',
      (key: string) => {
        syncHarness.settingsRows.delete(key);
      },
    ],
    [
      'malformed',
      (key: string, storedClaim: { key: string; value: unknown; updated_at: number }) => {
        syncHarness.settingsRows.set(key, {
          ...storedClaim,
          value: { forensic: 'malformed replacement claim' },
        });
      },
    ],
    [
      'replaced by another valid claimant',
      (key: string, storedClaim: { key: string; value: unknown; updated_at: number }) => {
        syncHarness.settingsRows.set(key, {
          ...storedClaim,
          value: {
            ...(storedClaim.value as Record<string, unknown>),
            claimId: 'replacement-claim',
          },
        });
      },
    ],
  ] as const)(
    'does not mutate queue metadata when the exact upload claim is %s',
    async (_case, replaceClaim) => {
      bindPendingRow();
      const controller = new AbortController();
      const flush = processSyncQueue({
        userId: 'user-a',
        signal: controller.signal,
      });
      await vi.waitFor(() => expect(syncHarness.upsert).toHaveBeenCalled());

      const key = claimKey('syq_pending');
      const storedClaim = syncHarness.settingsRows.get(key);
      expect(storedClaim?.value).toMatchObject({ claimId: expect.any(String) });
      replaceClaim(key, storedClaim!);
      const queueBeforeSettlement = structuredClone(syncHarness.queueRows.get('syq_pending'));
      const ownerBeforeSettlement = structuredClone(
        syncHarness.settingsRows.get(cloudSyncQueueOwnerKey('syq_pending')),
      );
      const claimBeforeSettlement = structuredClone(syncHarness.settingsRows.get(key));

      syncHarness.resolveUpsert({ error: null });

      await expect(flush).resolves.toMatchObject({ processed: 0 });
      expect(syncHarness.queueRows.get('syq_pending')).toEqual(queueBeforeSettlement);
      expect(syncHarness.settingsRows.get(cloudSyncQueueOwnerKey('syq_pending'))).toEqual(
        ownerBeforeSettlement,
      );
      expect(syncHarness.settingsRows.get(key)).toEqual(claimBeforeSettlement);
    },
  );

  it('deletes exact claim proof after a normal remote error settlement', async () => {
    bindPendingRow();
    const controller = new AbortController();
    const flush = processSyncQueue({ userId: 'user-a', signal: controller.signal });
    await vi.waitFor(() => expect(syncHarness.upsert).toHaveBeenCalled());
    expect(syncHarness.settingsRows.has(claimKey('syq_pending'))).toBe(true);

    syncHarness.resolveUpsert({ error: new Error('remote unavailable') });

    await expect(flush).resolves.toMatchObject({ errored: 1 });
    expect(syncHarness.queueRows.get('syq_pending')).toMatchObject({
      status: 'error',
      error: 'remote unavailable',
    });
    expect(syncHarness.settingsRows.has(claimKey('syq_pending'))).toBe(false);
  });

  it('retries only rows owned by the exact cloud authority', async () => {
    for (const [id, owner] of [
      ['syq_error_a', { state: 'cloud', userId: 'user-a', capturedAt: 1 }],
      ['syq_error_b', { state: 'cloud', userId: 'user-b', capturedAt: 1 }],
      ['syq_error_unbound', { state: 'unbound', capturedAt: 1 }],
    ] as const) {
      syncHarness.queueRows.set(id, {
        ...pendingRow(),
        id,
        status: 'error',
        error: 'remote unavailable',
      });
      bindOwner(id, owner);
    }
    const controller = new AbortController();

    await expect(retrySyncErrors({ userId: 'user-a', signal: controller.signal })).resolves.toBe(1);

    expect(syncHarness.queueRows.get('syq_error_a')?.status).toBe('pending');
    expect(syncHarness.queueRows.get('syq_error_b')?.status).toBe('error');
    expect(syncHarness.queueRows.get('syq_error_unbound')).toMatchObject({
      status: 'error',
      error: 'remote unavailable',
    });
  });

  it('keeps an exact upload claim live immediately before the stale boundary and retries at it', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    syncHarness.queueRows.set('syq_claimed', {
      ...pendingRow(),
      id: 'syq_claimed',
      status: 'in_progress',
      attempted_at: 1_000_000,
    });
    bindOwner('syq_claimed', {
      state: 'cloud',
      userId: 'user-a',
      capturedAt: 10,
    });
    syncHarness.settingsRows.set(claimKey('syq_claimed'), {
      key: claimKey('syq_claimed'),
      value: {
        schemaVersion: 1,
        rowId: 'syq_claimed',
        userId: 'user-a',
        ownerCapturedAt: 10,
        claimedAt: 1_000_000,
        claimId: 'claim-live-a',
      },
      updated_at: 1_000_000,
    });
    const controller = new AbortController();

    clock.mockReturnValue(1_000_000 + CLOUD_SYNC_QUEUE_CLAIM_STALE_AFTER_MS - 1);
    await expect(retrySyncErrors({ userId: 'user-a', signal: controller.signal })).resolves.toBe(0);
    expect(syncHarness.queueRows.get('syq_claimed')?.status).toBe('in_progress');
    expect(syncHarness.settingsRows.has(claimKey('syq_claimed'))).toBe(true);

    clock.mockReturnValue(1_000_000 + CLOUD_SYNC_QUEUE_CLAIM_STALE_AFTER_MS);
    await expect(retrySyncErrors({ userId: 'user-a', signal: controller.signal })).resolves.toBe(1);
    expect(syncHarness.queueRows.get('syq_claimed')).toMatchObject({
      status: 'pending',
      error: undefined,
    });
    expect(syncHarness.settingsRows.has(claimKey('syq_claimed'))).toBe(false);
  });

  it.each([
    ['missing', undefined],
    [
      'malformed',
      {
        schemaVersion: 1,
        rowId: 'syq_claimed',
        userId: 'user-a',
        ownerCapturedAt: 10,
        claimedAt: 1,
        claimId: '',
      },
    ],
    [
      'owner-mismatched',
      {
        schemaVersion: 1,
        rowId: 'syq_claimed',
        userId: 'user-b',
        ownerCapturedAt: 10,
        claimedAt: 1,
        claimId: 'claim-b',
      },
    ],
  ] as const)(
    'quarantines %s in-progress claim proof instead of adopting it',
    async (_case, claim) => {
      syncHarness.queueRows.set('syq_claimed', {
        ...pendingRow(),
        id: 'syq_claimed',
        status: 'in_progress',
        attempted_at: 1,
      });
      bindOwner('syq_claimed', {
        state: 'cloud',
        userId: 'user-a',
        capturedAt: 10,
      });
      if (claim) {
        syncHarness.settingsRows.set(claimKey('syq_claimed'), {
          key: claimKey('syq_claimed'),
          value: claim,
          updated_at: 1,
        });
      }

      await expect(
        retrySyncErrors({ userId: 'user-a', signal: new AbortController().signal }),
      ).resolves.toBe(0);

      expect(syncHarness.queueRows.get('syq_claimed')).toMatchObject({
        status: 'error',
        error: CLOUD_SYNC_QUEUE_QUARANTINE_ERROR,
      });
      expect(
        syncHarness.settingsRows.get(cloudSyncQueueOwnerKey('syq_claimed'))?.value,
      ).toMatchObject({ state: 'legacy_unknown' });
    },
  );

  it('permanently quarantines a pending row that already carries claim metadata', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    bindPendingRow();
    syncHarness.settingsRows.set(claimKey('syq_pending'), {
      key: claimKey('syq_pending'),
      value: {
        schemaVersion: 1,
        rowId: 'syq_pending',
        userId: 'user-a',
        ownerCapturedAt: 1,
        claimedAt: 1_000_000,
        claimId: 'claim-invalid-pending',
      },
      updated_at: 1_000_000,
    });
    const controller = new AbortController();

    await processSyncQueue({ userId: 'user-a', signal: controller.signal });
    clock.mockReturnValue(1_000_000 + CLOUD_SYNC_QUEUE_CLAIM_STALE_AFTER_MS + 1);
    const retried = await retrySyncErrors({ userId: 'user-a', signal: controller.signal });
    syncHarness.resolveUpsert({ error: null });
    await processSyncQueue({ userId: 'user-a', signal: controller.signal });

    expect(retried).toBe(0);
    expect(syncHarness.queueRows.get('syq_pending')).toMatchObject({
      status: 'error',
      error: CLOUD_SYNC_QUEUE_QUARANTINE_ERROR,
    });
    expect(
      syncHarness.settingsRows.get(cloudSyncQueueOwnerKey('syq_pending'))?.value,
    ).toMatchObject({ state: 'legacy_unknown' });
    expect(syncHarness.settingsRows.get(claimKey('syq_pending'))?.value).toMatchObject({
      claimId: 'claim-invalid-pending',
    });
    expect(syncHarness.upsert).not.toHaveBeenCalled();
  });

  it('prunes only old done rows owned by the exact authority', async () => {
    for (const [id, owner] of [
      ['syq_done_a', { state: 'cloud', userId: 'user-a', capturedAt: 1 }],
      ['syq_done_b', { state: 'cloud', userId: 'user-b', capturedAt: 1 }],
      ['syq_done_unbound', { state: 'unbound', capturedAt: 1 }],
    ] as const) {
      syncHarness.queueRows.set(id, {
        ...pendingRow(),
        id,
        status: 'done',
        created_at: 1,
      });
      bindOwner(id, owner);
    }
    syncHarness.settingsRows.set(claimKey('syq_done_a'), {
      key: claimKey('syq_done_a'),
      value: { forensic: 'stale terminal claim' },
      updated_at: 1,
    });
    const controller = new AbortController();

    await expect(pruneSyncQueue({ userId: 'user-a', signal: controller.signal }, 0)).resolves.toBe(
      1,
    );

    expect(syncHarness.queueRows.has('syq_done_a')).toBe(false);
    expect(syncHarness.settingsRows.has(cloudSyncQueueOwnerKey('syq_done_a'))).toBe(false);
    expect(syncHarness.settingsRows.has(claimKey('syq_done_a'))).toBe(false);
    expect(syncHarness.queueRows.has('syq_done_b')).toBe(true);
    expect(syncHarness.queueRows.has('syq_done_unbound')).toBe(true);
  });

  it('revalidates prune candidates inside the deletion transaction', async () => {
    syncHarness.queueRows.set('syq_done', {
      ...pendingRow(),
      id: 'syq_done',
      status: 'done',
      created_at: 1,
    });
    bindOwner('syq_done', {
      state: 'cloud',
      userId: 'user-a',
      capturedAt: 1,
    });
    syncHarness.runBeforeTransactionScope(() => {
      const row = syncHarness.queueRows.get('syq_done');
      if (row) {
        syncHarness.queueRows.set('syq_done', {
          ...row,
          status: 'pending',
        });
      }
    });
    const controller = new AbortController();

    await expect(pruneSyncQueue({ userId: 'user-a', signal: controller.signal }, 0)).resolves.toBe(
      0,
    );
    expect(syncHarness.queueRows.has('syq_done')).toBe(true);
    expect(syncHarness.settingsRows.has(cloudSyncQueueOwnerKey('syq_done'))).toBe(true);
  });

  it('rolls back a pending-to-in-progress claim when authority aborts during its write', async () => {
    bindPendingRow();
    const updateGate = syncHarness.deferQueueUpdate('syq_pending');
    const controller = new AbortController();
    const flush = processSyncQueue({ userId: 'user-a', signal: controller.signal });
    await vi.waitFor(() => expect(syncHarness.db.sync_queue.update).toHaveBeenCalled());

    controller.abort();
    updateGate.resolve(undefined);

    await expect(flush).resolves.toEqual({ processed: 0, errored: 0, skipped: 0 });
    expect(syncHarness.queueRows.get('syq_pending')).toMatchObject({
      status: 'pending',
    });
    expect(syncHarness.upsert).not.toHaveBeenCalled();
  });

  it('rolls back a cursor write when authority aborts before the transaction settles', async () => {
    const cursorKey = 'cloud_sync:last_pull_at:user-a';
    const cursorGate = syncHarness.deferSettingsPut(cursorKey);
    const controller = new AbortController();
    const pull = processCloudPull({ userId: 'user-a', signal: controller.signal });
    await vi.waitFor(() => expect(syncHarness.pullBuilder.abortSignal).toHaveBeenCalled());
    syncHarness.resolvePull({
      data: [
        {
          user_id: 'user-a',
          table_name: 'workspaces',
          row_id: 'wsp_1',
          op: 'update',
          payload: { id: 'wsp_1', name: 'Remote workspace' },
          deleted_at: null,
          updated_at: '2026-07-16T12:00:00.000Z',
        },
      ],
      error: null,
    });
    await vi.waitFor(() =>
      expect(syncHarness.db.settings.put).toHaveBeenCalledWith(
        expect.objectContaining({ key: cursorKey }),
      ),
    );

    controller.abort();
    cursorGate.resolve(undefined);

    await expect(pull).resolves.toEqual({ applied: 0, skipped: 0, errored: 0 });
    expect(syncHarness.settingsRows.has(cursorKey)).toBe(false);
  });

  it('uses a stable composite cursor so rows sharing the batch boundary timestamp remain reachable', async () => {
    const updatedAt = '2026-07-16T12:00:00.000Z';
    const remoteRow = (rowId: string) => ({
      user_id: 'user-a',
      table_name: 'unsupported_records',
      row_id: rowId,
      op: 'update',
      payload: { id: rowId },
      deleted_at: null,
      updated_at: updatedAt,
    });
    syncHarness.queuePullResult({
      data: [remoteRow('row-001'), remoteRow('row-002')],
      error: null,
    });
    const controller = new AbortController();

    await expect(
      processCloudPull({ userId: 'user-a', signal: controller.signal }, 2),
    ).resolves.toEqual({ applied: 0, skipped: 2, errored: 0 });

    const cursorKey = 'cloud_sync:last_pull_at:user-a';
    expect(syncHarness.settingsRows.get(cursorKey)?.value).toEqual({
      schemaVersion: 2,
      updatedAt,
      tableName: 'unsupported_records',
      rowId: 'row-002',
    });

    syncHarness.queuePullResult({ data: [remoteRow('row-003')], error: null });
    await expect(
      processCloudPull({ userId: 'user-a', signal: controller.signal }, 2),
    ).resolves.toEqual({ applied: 0, skipped: 1, errored: 0 });

    expect(syncHarness.pullBuilder.order.mock.calls).toEqual([
      ['updated_at', { ascending: true }],
      ['table_name', { ascending: true }],
      ['row_id', { ascending: true }],
      ['updated_at', { ascending: true }],
      ['table_name', { ascending: true }],
      ['row_id', { ascending: true }],
    ]);
    expect(syncHarness.pullBuilder.or).toHaveBeenCalledWith(
      `updated_at.gt."${updatedAt}",and(updated_at.eq."${updatedAt}",table_name.gt."unsupported_records"),and(updated_at.eq."${updatedAt}",table_name.eq."unsupported_records",row_id.gt."row-002")`,
    );
    expect(syncHarness.pullBuilder.gt).not.toHaveBeenCalled();
    expect(syncHarness.settingsRows.get(cursorKey)?.value).toEqual({
      schemaVersion: 2,
      updatedAt,
      tableName: 'unsupported_records',
      rowId: 'row-003',
    });
  });

  it('migrates a timestamp-only cursor from the inclusive floor of that timestamp', async () => {
    const cursorKey = 'cloud_sync:last_pull_at:user-a';
    const updatedAt = '2026-07-16T12:00:00.000Z';
    syncHarness.settingsRows.set(cursorKey, {
      key: cursorKey,
      value: updatedAt,
      updated_at: 1,
    });
    syncHarness.queuePullResult({
      data: [
        {
          user_id: 'user-a',
          table_name: 'unsupported_records',
          row_id: 'row-recovered',
          op: 'update',
          payload: { id: 'row-recovered' },
          deleted_at: null,
          updated_at: updatedAt,
        },
      ],
      error: null,
    });
    const controller = new AbortController();

    await expect(
      processCloudPull({ userId: 'user-a', signal: controller.signal }, 2),
    ).resolves.toEqual({ applied: 0, skipped: 1, errored: 0 });

    expect(syncHarness.pullBuilder.or).toHaveBeenCalledWith(
      `updated_at.gt."${updatedAt}",and(updated_at.eq."${updatedAt}",table_name.gt.""),and(updated_at.eq."${updatedAt}",table_name.eq."",row_id.gt."")`,
    );
    expect(syncHarness.pullBuilder.gt).not.toHaveBeenCalled();
    expect(syncHarness.settingsRows.get(cursorKey)?.value).toEqual({
      schemaVersion: 2,
      updatedAt,
      tableName: 'unsupported_records',
      rowId: 'row-recovered',
    });
  });

  it('rolls back prune and starts no second delete after authority aborts', async () => {
    const doneRow = { ...pendingRow(), status: 'done' as const, created_at: 1 };
    syncHarness.queueRows.set(doneRow.id, doneRow);
    syncHarness.settingsRows.set(cloudSyncQueueOwnerKey('syq_pending'), {
      key: cloudSyncQueueOwnerKey('syq_pending'),
      value: materializeSyncQueueOwner('syq_pending', {
        state: 'cloud',
        userId: 'user-a',
        capturedAt: 1,
      }),
      updated_at: 1,
    });
    const deleteGate = syncHarness.deferQueueBulkDelete();
    const controller = new AbortController();
    const prune = pruneSyncQueue({ userId: 'user-a', signal: controller.signal }, 0);
    await vi.waitFor(() => expect(syncHarness.db.sync_queue.bulkDelete).toHaveBeenCalled());

    controller.abort();
    deleteGate.resolve(undefined);

    await expect(prune).resolves.toBe(0);
    expect(syncHarness.queueRows.has('syq_pending')).toBe(true);
    expect(syncHarness.settingsRows.has(cloudSyncQueueOwnerKey('syq_pending'))).toBe(true);
    expect(syncHarness.db.settings.bulkDelete).not.toHaveBeenCalled();
  });

  it('rejects a session whose normalized user differs from the bound authority', async () => {
    syncHarness.getSession.mockResolvedValueOnce({
      data: { session: { user: { id: ' user-b ' } } },
    });
    const controller = new AbortController();

    await expect(
      processCloudPull({ userId: 'user-a', signal: controller.signal }),
    ).resolves.toEqual({ applied: 0, skipped: 0, errored: 0 });

    expect(syncHarness.from).not.toHaveBeenCalled();
    expect(syncHarness.toolApplyForAccount).not.toHaveBeenCalled();
    expect(syncHarness.pluginApplyForAccount).not.toHaveBeenCalled();
    expect(syncHarness.toolSetState).not.toHaveBeenCalled();
    expect(syncHarness.pluginSetState).not.toHaveBeenCalled();
  });

  it('settles a deferred pull on authority abort without applying rows or cursor', async () => {
    const controller = new AbortController();
    const pull = processCloudPull({ userId: 'user-a', signal: controller.signal });
    await vi.waitFor(() => expect(syncHarness.pullBuilder.abortSignal).toHaveBeenCalled());

    controller.abort();
    let settled = false;
    void pull.then(() => {
      settled = true;
    });

    try {
      await vi.waitFor(() => expect(settled).toBe(true));
      await expect(pull).resolves.toEqual({ applied: 0, skipped: 0, errored: 0 });
      expect(syncHarness.pullSignal).toBe(controller.signal);
      expect(syncHarness.toolApplyForAccount).not.toHaveBeenCalled();
      expect(syncHarness.pluginApplyForAccount).not.toHaveBeenCalled();
      expect(syncHarness.toolSetState).not.toHaveBeenCalled();
      expect(syncHarness.pluginSetState).not.toHaveBeenCalled();
      expect(syncHarness.db.settings.put).not.toHaveBeenCalled();
    } finally {
      syncHarness.resolvePull({ data: [], error: null });
      await pull;
    }
  });

  it('does not mutate stores when authority aborts during a deferred store import', async () => {
    const controller = new AbortController();
    const pull = processCloudPull({ userId: 'user-a', signal: controller.signal });
    await vi.waitFor(() => expect(syncHarness.pullBuilder.abortSignal).toHaveBeenCalled());

    syncHarness.resolvePull({
      data: [
        {
          user_id: 'user-a',
          table_name: 'custom_tools',
          row_id: 'ship-check',
          op: 'update',
          payload: { name: 'Ship check', baseAction: 'workflow.run' },
          deleted_at: null,
          updated_at: '2026-07-16T12:00:00.000Z',
        },
      ],
      error: null,
    });
    await syncHarness.toolImportStarted.promise;

    controller.abort();
    syncHarness.toolImportGate.resolve(undefined);

    await expect(pull).resolves.toEqual({ applied: 0, skipped: 0, errored: 0 });
    expect(syncHarness.toolApplyForAccount).not.toHaveBeenCalled();
    expect(syncHarness.pluginApplyForAccount).not.toHaveBeenCalled();
    expect(syncHarness.toolSetState).not.toHaveBeenCalled();
    expect(syncHarness.pluginSetState).not.toHaveBeenCalled();
    expect(syncHarness.db.settings.put).not.toHaveBeenCalled();
  });

  it('routes completed tool and plugin pulls only through exact-account store APIs', async () => {
    syncHarness.toolImportGate.resolve(undefined);
    syncHarness.queuePullResult({
      data: [
        {
          user_id: 'user-a',
          table_name: 'custom_tools',
          row_id: 'ship-check',
          op: 'update',
          payload: { name: 'Ship check', baseAction: 'workflow.run' },
          deleted_at: null,
          updated_at: '2026-07-16T12:00:00.000Z',
        },
        {
          user_id: 'user-a',
          table_name: 'plugin_connections',
          row_id: 'github',
          op: 'update',
          payload: {
            pluginId: 'github',
            state: 'connected',
            enabled: true,
            enabledProjectIds: ['*'],
            configuredFields: [],
            updatedAt: 1,
          },
          deleted_at: null,
          updated_at: '2026-07-16T12:00:01.000Z',
        },
      ],
      error: null,
    });
    const controller = new AbortController();

    await expect(
      processCloudPull({ userId: 'user-a', signal: controller.signal }),
    ).resolves.toEqual({ applied: 2, skipped: 0, errored: 0 });

    expect(syncHarness.toolApplyForAccount).toHaveBeenCalledWith(
      'user-a',
      'ship-check',
      expect.objectContaining({ slug: 'ship-check', name: 'Ship check' }),
    );
    expect(syncHarness.pluginApplyForAccount).toHaveBeenCalledWith(
      'user-a',
      'github',
      expect.objectContaining({ pluginId: 'github', state: 'connected' }),
    );
    expect(syncHarness.toolSetState).not.toHaveBeenCalled();
    expect(syncHarness.pluginSetState).not.toHaveBeenCalled();
  });

  it('never adopts an aborted user A upload after its owner sidecar is mutated to user B', async () => {
    bindPendingRow();
    const controllerA = new AbortController();
    const flush = processSyncQueue({ userId: 'user-a', signal: controllerA.signal });
    await vi.waitFor(() => expect(syncHarness.upsertBuilder.abortSignal).toHaveBeenCalled());

    expect(syncHarness.settingsRows.get(claimKey('syq_pending'))?.value).toMatchObject({
      schemaVersion: 1,
      rowId: 'syq_pending',
      userId: 'user-a',
      ownerCapturedAt: 1,
      claimedAt: expect.any(Number),
      claimId: expect.any(String),
    });
    bindOwner('syq_pending', {
      state: 'cloud',
      userId: 'user-b',
      capturedAt: 2,
    });

    controllerA.abort();
    syncHarness.resolveUpsert({ error: new DOMException('Aborted', 'AbortError') });
    await flush;

    const stoppedRow = syncHarness.queueRows.get('syq_pending');
    expect(stoppedRow?.status).toBe('in_progress');
    expect(syncHarness.upsertSignal).toBe(controllerA.signal);

    const controllerB = new AbortController();
    syncHarness.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-b' } } },
    });
    await expect(retrySyncErrors({ userId: 'user-b', signal: controllerB.signal })).resolves.toBe(
      0,
    );
    await expect(
      processSyncQueue({ userId: 'user-b', signal: controllerB.signal }),
    ).resolves.toMatchObject({ processed: 0 });

    expect(syncHarness.queueRows.get('syq_pending')).toMatchObject({
      status: 'error',
      error: CLOUD_SYNC_QUEUE_QUARANTINE_ERROR,
    });
    expect(syncHarness.settingsRows.get(claimKey('syq_pending'))?.value).toMatchObject({
      userId: 'user-a',
      claimId: expect.any(String),
    });
    expect(syncHarness.upsert).toHaveBeenCalledTimes(1);
    expect(syncHarness.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-a', row_id: 'wsp_1' }),
      expect.anything(),
    );
  });

  it('returns one quiescent stop promise without waiting for an abort-ignoring upsert', async () => {
    vi.useFakeTimers();
    bindPendingRow();
    const controller = new AbortController();
    const stop = startSyncLoop({ userId: 'user-a', signal: controller.signal }, 10);

    await vi.advanceTimersByTimeAsync(10);
    await vi.waitFor(() => expect(syncHarness.upsert).toHaveBeenCalledTimes(1));

    const firstStop = stop();
    const secondStop = stop();
    expect(firstStop).toBe(secondStop);
    expect(firstStop).toBeInstanceOf(Promise);
    let settled = false;
    void firstStop.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);

    try {
      expect(settled).toBe(true);
      expect(syncHarness.queueRows.get('syq_pending')).toMatchObject({
        status: 'in_progress',
      });
      expect(syncHarness.settingsRows.get(claimKey('syq_pending'))?.value).toMatchObject({
        claimId: expect.any(String),
      });
      expect(syncHarness.upsertSignal?.aborted).toBe(true);
      expect(syncHarness.pullBuilder.abortSignal).not.toHaveBeenCalled();
    } finally {
      syncHarness.resolveUpsert({ error: new DOMException('Aborted', 'AbortError') });
      await firstStop;
    }
  });

  it('settles a direct drain on abort without waiting for an abort-ignoring upsert', async () => {
    bindPendingRow();
    const controller = new AbortController();
    const flush = processSyncQueue({ userId: 'user-a', signal: controller.signal });
    await vi.waitFor(() => expect(syncHarness.upsert).toHaveBeenCalledTimes(1));

    controller.abort();
    let settled = false;
    void flush.then(() => {
      settled = true;
    });

    try {
      await vi.waitFor(() => expect(settled).toBe(true));
      expect(syncHarness.queueRows.get('syq_pending')).toMatchObject({
        status: 'in_progress',
      });
      expect(syncHarness.settingsRows.get(claimKey('syq_pending'))?.value).toMatchObject({
        claimId: expect.any(String),
      });
    } finally {
      syncHarness.resolveUpsert({ error: new DOMException('Aborted', 'AbortError') });
      await flush;
    }
  });

  it('lets loop stop settle while database opening remains unresolved', async () => {
    vi.useFakeTimers();
    const openGate = syncHarness.deferOpenDb();
    const controller = new AbortController();
    const stop = startSyncLoop({ userId: 'user-a', signal: controller.signal }, 10);
    await vi.advanceTimersByTimeAsync(10);
    await vi.waitFor(() => expect(syncHarness.openDb).toHaveBeenCalled());

    let settled = false;
    const stopping = stop().then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);

    try {
      expect(settled).toBe(true);
    } finally {
      openGate.resolve(undefined);
      await stopping;
    }
  });

  it('lets loop stop settle while session verification remains unresolved', async () => {
    vi.useFakeTimers();
    const sessionGate = syncHarness.deferred<{
      data: { session: { user: { id: string } } };
    }>();
    syncHarness.getSession.mockImplementationOnce(() => sessionGate.promise);
    const controller = new AbortController();
    const stop = startSyncLoop({ userId: 'user-a', signal: controller.signal }, 10);
    await vi.advanceTimersByTimeAsync(10);
    await vi.waitFor(() => expect(syncHarness.getSession).toHaveBeenCalled());

    let settled = false;
    const stopping = stop().then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);

    try {
      expect(settled).toBe(true);
    } finally {
      sessionGate.resolve({ data: { session: { user: { id: 'user-a' } } } });
      await stopping;
    }
  });

  it('lets loop stop settle while the pull provider remains unresolved', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const stop = startSyncLoop({ userId: 'user-a', signal: controller.signal }, 10);
    await vi.advanceTimersByTimeAsync(10);
    await vi.waitFor(() => expect(syncHarness.pullBuilder.abortSignal).toHaveBeenCalled());

    let settled = false;
    const stopping = stop().then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);

    try {
      expect(settled).toBe(true);
      expect(syncHarness.pullSignal?.aborted).toBe(true);
      expect(syncHarness.db.settings.put).not.toHaveBeenCalled();
    } finally {
      syncHarness.resolvePull({ data: [], error: null });
      await stopping;
    }
  });
});
