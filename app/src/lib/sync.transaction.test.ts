import Dexie, { type EntityTable } from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLOUD_SYNC_QUEUE_CLAIM_STALE_AFTER_MS,
  cloudSyncQueueClaimKey,
  cloudSyncQueueOwnerKey,
  materializeSyncQueueOwner,
} from './cloudSyncQueueOwner';
import type { SettingsRow, SyncQueueRow } from './db/schema';

class SharedSyncTestDb extends Dexie {
  sync_queue!: EntityTable<SyncQueueRow, 'id'>;
  settings!: EntityTable<SettingsRow, 'key'>;

  constructor(name: string) {
    super(name, { indexedDB, IDBKeyRange });
    this.version(1).stores({
      sync_queue: 'id,status,table,row_id,created_at',
      settings: 'key,updated_at',
    });
  }
}

type SyncRuntime = typeof import('./sync');

describe('cloud sync queue with real IndexedDB transactions', () => {
  let database: SharedSyncTestDb | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.doUnmock('./db');
    vi.doUnmock('./supabase');
    vi.resetModules();
    await database?.delete();
    database = undefined;
  });

  it('does not let a second runtime startup retry reclaim a live upload claim', async () => {
    database = new SharedSyncTestDb(`sync-two-runtime-${crypto.randomUUID()}`);
    await database.open();
    const row: SyncQueueRow = {
      id: 'syq_shared',
      op: 'update',
      table: 'workspaces',
      row_id: 'wsp_shared',
      payload: { id: 'wsp_shared', name: 'Shared workspace' },
      status: 'pending',
      created_at: 1,
    };
    await database.sync_queue.add(row);
    await database.settings.put({
      key: cloudSyncQueueOwnerKey(row.id),
      value: materializeSyncQueueOwner(row.id, {
        state: 'cloud',
        userId: 'user-a',
        capturedAt: 1,
      }),
      updated_at: 1,
    });

    let releaseUpload!: () => void;
    const uploadGate = new Promise<void>((resolve) => {
      releaseUpload = resolve;
    });
    const uploadedRecords: unknown[] = [];
    const upsert = vi.fn((record: unknown) => {
      uploadedRecords.push(record);
      return {
        abortSignal: async () => {
          await uploadGate;
          return { error: null };
        },
      };
    });
    const client = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { user: { id: 'user-a' } } },
        })),
      },
      from: vi.fn(() => ({ upsert })),
    };

    const importRuntime = async (): Promise<SyncRuntime> => {
      vi.resetModules();
      vi.doMock('./db', () => ({
        db: database,
        openDb: async () => database,
      }));
      vi.doMock('./supabase', () => ({
        getSupabaseClient: () => client,
        isCloudSyncConfigured: () => true,
      }));
      return import('./sync');
    };

    const runtimeA = await importRuntime();
    const runtimeB = await importRuntime();
    const controllerA = new AbortController();
    const controllerB = new AbortController();

    const firstDrain = runtimeA.processSyncQueue({
      userId: 'user-a',
      signal: controllerA.signal,
    });
    await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    expect(await database.sync_queue.get(row.id)).toMatchObject({
      status: 'in_progress',
    });
    expect(await database.settings.get(cloudSyncQueueClaimKey('syq_shared'))).toMatchObject({
      value: expect.objectContaining({
        schemaVersion: 1,
        rowId: 'syq_shared',
        userId: 'user-a',
        ownerCapturedAt: 1,
        claimId: expect.any(String),
      }),
    });

    let uploadReleased = false;
    let secondDrain: ReturnType<SyncRuntime['processSyncQueue']> | undefined;
    try {
      const retried = await runtimeB.retrySyncErrors({
        userId: 'user-a',
        signal: controllerB.signal,
      });
      let secondSettled = false;
      secondDrain = runtimeB
        .processSyncQueue({
          userId: 'user-a',
          signal: controllerB.signal,
        })
        .finally(() => {
          secondSettled = true;
        });
      await vi.waitFor(() => {
        expect(secondSettled || upsert.mock.calls.length > 1).toBe(true);
      });

      releaseUpload();
      uploadReleased = true;
      const [firstResult, secondResult] = await Promise.all([firstDrain, secondDrain]);

      expect(retried).toBe(0);
      expect(firstResult).toMatchObject({ processed: 1 });
      expect(secondResult).toMatchObject({ processed: 0 });
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(uploadedRecords).toEqual([
        expect.objectContaining({
          user_id: 'user-a',
          row_id: 'wsp_shared',
        }),
      ]);
    } finally {
      if (!uploadReleased) releaseUpload();
      await Promise.allSettled([firstDrain, ...(secondDrain ? [secondDrain] : [])]);
    }

    expect(await database.sync_queue.get(row.id)).toMatchObject({
      status: 'done',
    });
    expect(await database.settings.get(cloudSyncQueueClaimKey('syq_shared'))).toBeUndefined();
  });

  it('keeps claimant B intact when stale claimant A settles late', async () => {
    database = new SharedSyncTestDb(`sync-stale-claim-cas-${crypto.randomUUID()}`);
    await database.open();
    const row: SyncQueueRow = {
      id: 'syq_stale_cas',
      op: 'update',
      table: 'workspaces',
      row_id: 'wsp_stale_cas',
      payload: { id: 'wsp_stale_cas', name: 'Shared workspace' },
      status: 'pending',
      created_at: 1,
    };
    const owner = materializeSyncQueueOwner(row.id, {
      state: 'cloud',
      userId: 'user-a',
      capturedAt: 1,
    });
    await database.sync_queue.add(row);
    await database.settings.put({
      key: cloudSyncQueueOwnerKey(row.id),
      value: owner,
      updated_at: 1,
    });

    let releaseUploadA!: () => void;
    let releaseUploadB!: () => void;
    const uploadGateA = new Promise<void>((resolve) => {
      releaseUploadA = resolve;
    });
    const uploadGateB = new Promise<void>((resolve) => {
      releaseUploadB = resolve;
    });
    const uploadGates = [uploadGateA, uploadGateB];
    const upsert = vi.fn(() => {
      const gate = uploadGates[upsert.mock.calls.length - 1];
      return {
        abortSignal: async () => {
          await gate;
          return { error: null };
        },
      };
    });
    const client = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { user: { id: 'user-a' } } },
        })),
      },
      from: vi.fn(() => ({ upsert })),
    };
    const importRuntime = async (): Promise<SyncRuntime> => {
      vi.resetModules();
      vi.doMock('./db', () => ({
        db: database,
        openDb: async () => database,
      }));
      vi.doMock('./supabase', () => ({
        getSupabaseClient: () => client,
        isCloudSyncConfigured: () => true,
      }));
      return import('./sync');
    };

    let currentTime = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => currentTime);
    const runtimeA = await importRuntime();
    const runtimeB = await importRuntime();
    const authorityA = { userId: 'user-a', signal: new AbortController().signal };
    const authorityB = { userId: 'user-a', signal: new AbortController().signal };
    const claimKey = cloudSyncQueueClaimKey(row.id);
    const firstDrain = runtimeA.processSyncQueue(authorityA);
    let secondDrain: ReturnType<SyncRuntime['processSyncQueue']> | undefined;
    let uploadAReleased = false;
    let uploadBReleased = false;

    try {
      await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
      const claimA = (await database.settings.get(claimKey))?.value as
        | Record<string, unknown>
        | undefined;
      expect(claimA).toMatchObject({ claimId: expect.any(String), claimedAt: currentTime });

      currentTime += CLOUD_SYNC_QUEUE_CLAIM_STALE_AFTER_MS;
      await expect(runtimeB.retrySyncErrors(authorityB)).resolves.toBe(1);
      expect(await database.sync_queue.get(row.id)).toMatchObject({ status: 'pending' });
      expect(await database.settings.get(claimKey)).toBeUndefined();

      secondDrain = runtimeB.processSyncQueue(authorityB);
      await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(2));
      const claimBRow = await database.settings.get(claimKey);
      expect(claimBRow?.value).toMatchObject({
        claimId: expect.not.stringMatching(String(claimA?.claimId)),
      });

      releaseUploadA();
      uploadAReleased = true;
      await expect(firstDrain).resolves.toMatchObject({ processed: 0 });
      expect(await database.sync_queue.get(row.id)).toMatchObject({ status: 'in_progress' });
      expect(await database.settings.get(cloudSyncQueueOwnerKey(row.id))).toMatchObject({
        value: owner,
      });
      expect(await database.settings.get(claimKey)).toEqual(claimBRow);

      releaseUploadB();
      uploadBReleased = true;
      await expect(secondDrain).resolves.toMatchObject({ processed: 1 });
    } finally {
      if (!uploadAReleased) releaseUploadA();
      if (!uploadBReleased) releaseUploadB();
      await Promise.allSettled([firstDrain, ...(secondDrain ? [secondDrain] : [])]);
    }

    expect(await database.sync_queue.get(row.id)).toMatchObject({ status: 'done' });
    expect(await database.settings.get(claimKey)).toBeUndefined();
  });

  it('carries a real activated account lease through enqueue and exact-owner drain', async () => {
    database = new SharedSyncTestDb(`sync-authority-enqueue-${crypto.randomUUID()}`);
    await database.open();
    let currentSessionUserId = 'user-a';
    const uploadedRecords: unknown[] = [];
    const upsert = vi.fn((record: unknown) => ({
      abortSignal: async () => {
        uploadedRecords.push(record);
        return { error: null };
      },
    }));
    const client = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { user: { id: currentSessionUserId } } },
        })),
      },
      from: vi.fn(() => ({ upsert })),
    };

    vi.resetModules();
    vi.doMock('./db', () => ({
      db: database,
      openDb: async () => database,
    }));
    vi.doMock('./supabase', () => ({
      getSupabaseClient: () => client,
      isCloudSyncConfigured: () => true,
    }));
    const ownerRuntime = await import('./cloudSyncQueueOwner');
    const runtime = await import('./sync');
    const leaseA = ownerRuntime.activateSyncQueueCloudAuthority('user-a');
    let leaseB: ReturnType<typeof ownerRuntime.activateSyncQueueCloudAuthority> | undefined;
    let secondLeaseA: ReturnType<typeof ownerRuntime.activateSyncQueueCloudAuthority> | undefined;

    try {
      const rowId = await runtime.enqueueMutation('update', 'workspaces', 'wsp_authority', {
        id: 'wsp_authority',
        name: 'Owned by A',
      });
      expect(
        ownerRuntime.parseSyncQueueOwner(
          rowId,
          (await database.settings.get(ownerRuntime.cloudSyncQueueOwnerKey(rowId)))?.value,
        ),
      ).toMatchObject({ state: 'cloud', userId: 'user-a' });

      leaseB = ownerRuntime.activateSyncQueueCloudAuthority('user-b');
      currentSessionUserId = 'user-b';
      await expect(
        runtime.processSyncQueue({ userId: 'user-b', signal: new AbortController().signal }),
      ).resolves.toMatchObject({ processed: 0 });
      expect(upsert).not.toHaveBeenCalled();
      expect(await database.sync_queue.get(rowId)).toMatchObject({ status: 'pending' });

      secondLeaseA = ownerRuntime.activateSyncQueueCloudAuthority('user-a');
      currentSessionUserId = 'user-a';
      await expect(
        runtime.processSyncQueue({ userId: 'user-a', signal: new AbortController().signal }),
      ).resolves.toMatchObject({ processed: 1 });
      expect(uploadedRecords).toEqual([
        expect.objectContaining({ user_id: 'user-a', row_id: 'wsp_authority' }),
      ]);
    } finally {
      if (secondLeaseA) ownerRuntime.releaseSyncQueueCloudAuthority(secondLeaseA);
      if (leaseB) ownerRuntime.releaseSyncQueueCloudAuthority(leaseB);
      ownerRuntime.releaseSyncQueueCloudAuthority(leaseA);
    }
  });
});
