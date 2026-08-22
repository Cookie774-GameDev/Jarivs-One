import { describe, expect, it, vi } from 'vitest';
import {
  consumePendingStorageRepair,
  createNativeStorageRepair,
  readStorageRepairFailure,
  type NativeStorageRepairDependencies,
} from './nativeStorageRepair';

type MutableDependencies = {
  -readonly [Key in keyof NativeStorageRepairDependencies]: NativeStorageRepairDependencies[Key];
} & {
  writes: Array<{ path: string; content: string }>;
};

function dependencies(): MutableDependencies {
  const writes: Array<{ path: string; content: string }> = [];
  return {
    writes,
    now: () => 1_777_000_000_000,
    nonce: () => '00000000-0000-4000-8000-000000000000',
    origin: () => 'http://localhost:5173',
    async localDataDir() {
      return 'C:\\LocalAppData\\ai.jarvis.desktop';
    },
    async ensureDirectory() {},
    async write(path, content) {
      writes.push({ path, content });
    },
    async read() {
      return null;
    },
    async remove() {},
    async listDirectories() {
      return [];
    },
    async relaunch() {},
  };
}

describe('native VibeSpace storage repair bridge', () => {
  it('cannot schedule a durable repair without explicit confirmation', async () => {
    const deps = dependencies();
    const repair = createNativeStorageRepair(deps);

    await expect(repair.scheduleRepair({ confirmed: false })).rejects.toThrow(
      'storage_repair_confirmation_required',
    );
    expect(deps.writes).toEqual([]);
  });

  it('writes one strict repair marker before requesting relaunch', async () => {
    const deps = dependencies();
    const events: string[] = [];
    deps.write = async (path, content) => {
      events.push('write');
      deps.writes.push({ path, content });
    };
    deps.relaunch = async () => {
      events.push('relaunch');
    };
    const repair = createNativeStorageRepair(deps);

    await repair.scheduleRepair({ confirmed: true });

    expect(events).toEqual(['write', 'relaunch']);
    expect(JSON.parse(deps.writes[0]!.content)).toEqual({
      version: 1,
      operation: 'repair',
      databaseName: 'jarvis-v1',
      origin: 'http://localhost:5173',
      requestedAtMs: 1_777_000_000_000,
      confirmationToken: '00000000-0000-4000-8000-000000000000',
    });
  });

  it('applies a verified native receipt to only jarvis-v1 and completes afterward', async () => {
    const deps = dependencies();
    const events: string[] = [];
    deps.read = async (path) =>
      path.endsWith('storage-repair-ready-v1.json')
        ? JSON.stringify({
            version: 1,
            operation: 'repair',
            databaseName: 'jarvis-v1',
            origin: 'http://localhost:5173',
            backupId: '1777000000000-00000000-0000-4000-8000-000000000000',
            backupBytes: 12,
            backupSha256: `sha256:${'a'.repeat(64)}`,
            completedAtMs: 1_777_000_000_100,
          })
        : null;
    deps.write = async () => {
      events.push('complete');
    };
    deps.remove = async () => {
      events.push('remove-receipt');
    };

    const pending = await consumePendingStorageRepair(deps);
    expect(pending?.databaseName).toBe('jarvis-v1');
    await pending!.apply(async (databaseName) => {
      events.push(`delete:${databaseName}`);
    });
    await pending!.complete();

    expect(events).toEqual(['delete:jarvis-v1', 'complete', 'remove-receipt']);
  });

  it('leaves the native receipt intact when logical replacement fails', async () => {
    const deps = dependencies();
    deps.read = async () =>
      JSON.stringify({
        version: 1,
        operation: 'repair',
        databaseName: 'jarvis-v1',
        origin: 'http://localhost:5173',
        backupId: '1777000000000-00000000-0000-4000-8000-000000000000',
        backupBytes: 12,
        backupSha256: `sha256:${'a'.repeat(64)}`,
        completedAtMs: 1_777_000_000_100,
      });
    deps.remove = vi.fn();
    const pending = await consumePendingStorageRepair(deps);

    await expect(
      pending!.apply(async () => {
        throw new Error('delete blocked');
      }),
    ).rejects.toThrow('delete blocked');
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it('does not reapply a receipt whose verified completion record already exists', async () => {
    const deps = dependencies();
    const receipt = {
      version: 1,
      operation: 'repair',
      databaseName: 'jarvis-v1',
      origin: 'http://localhost:5173',
      backupId: '1777000000000-00000000-0000-4000-8000-000000000000',
      backupBytes: 12,
      backupSha256: `sha256:${'a'.repeat(64)}`,
      completedAtMs: 1_777_000_000_100,
    };
    deps.read = async (path) =>
      JSON.stringify(
        path.endsWith('storage-repair-completed-v1.json')
          ? { ...receipt, verifiedAtMs: 1_777_000_000_200 }
          : receipt,
      );
    deps.remove = vi.fn().mockResolvedValue(undefined);

    await expect(consumePendingStorageRepair(deps)).resolves.toBeNull();
    expect(deps.remove).toHaveBeenCalledTimes(1);
  });

  it('surfaces only the redacted native failure code', async () => {
    const deps = dependencies();
    deps.read = async (path) =>
      path.endsWith('storage-repair-failed-v1.json')
        ? JSON.stringify({
            version: 1,
            diagnosticCode: 'storage_repair_backup_exists',
            failedAtMs: 1_777_000_000_200,
          })
        : null;

    await expect(readStorageRepairFailure(deps)).resolves.toEqual({
      diagnosticCode: 'storage_repair_backup_exists',
      failedAtMs: 1_777_000_000_200,
    });
  });
});
