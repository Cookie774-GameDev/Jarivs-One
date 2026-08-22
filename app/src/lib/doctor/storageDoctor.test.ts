import { describe, expect, it, vi } from 'vitest';
import { StorageDoctorUnavailableError, createStorageDoctor } from './storageDoctor';

function backingStoreError(): DOMException {
  return new DOMException(
    'Internal error opening backing store for indexedDB.open',
    'UnknownError',
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, deny) => {
    resolve = accept;
    reject = deny;
  });
  return { promise, resolve, reject };
}

describe('VibeSpace Doctor local chat storage', () => {
  it('recovers a transient backing-store failure and verifies the reopened store', async () => {
    const open = vi.fn().mockRejectedValueOnce(backingStoreError()).mockResolvedValue(undefined);
    const reset = vi.fn();
    const verify = vi.fn().mockResolvedValue(undefined);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const doctor = createStorageDoctor({ open, reset, verify, sleep });

    await expect(doctor.run()).resolves.toMatchObject({
      code: 'recovered_after_retry',
      attempts: 2,
    });
    expect(reset).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(0);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(doctor.getSnapshot().kind).toBe('healthy');
  });

  it('joins concurrent startup and chat triggers onto one Doctor run', async () => {
    const opening = deferred<void>();
    const open = vi.fn(() => opening.promise);
    const doctor = createStorageDoctor({
      open,
      reset: vi.fn(),
      verify: vi.fn().mockResolvedValue(undefined),
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    const startup = doctor.run();
    const newChat = doctor.run();
    expect(newChat).toBe(startup);
    expect(open).toHaveBeenCalledTimes(1);

    opening.resolve();
    await expect(Promise.all([startup, newChat])).resolves.toEqual([
      { code: 'healthy', attempts: 1 },
      { code: 'healthy', attempts: 1 },
    ]);
  });

  it('contains a persistent recognized failure after the bounded retry schedule', async () => {
    const open = vi.fn().mockRejectedValue(backingStoreError());
    const reset = vi.fn();
    const sleep = vi.fn().mockResolvedValue(undefined);
    const doctor = createStorageDoctor({
      open,
      reset,
      verify: vi.fn(),
      sleep,
    });

    await expect(doctor.run()).resolves.toEqual({
      code: 'needs_user_repair',
      attempts: 4,
      diagnosticCode: 'indexeddb_backing_store_open_failed',
    });
    expect(open).toHaveBeenCalledTimes(4);
    expect(reset).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([delay]) => delay)).toEqual([0, 250, 750]);
    expect(doctor.getSnapshot()).toEqual({
      kind: 'needs_user_repair',
      diagnosticCode: 'indexeddb_backing_store_open_failed',
    });
  });

  it('does not claim health when the harmless read verification fails', async () => {
    const verify = vi.fn().mockRejectedValue(backingStoreError());
    const doctor = createStorageDoctor({
      open: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn(),
      verify,
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    await expect(doctor.run()).resolves.toMatchObject({
      code: 'needs_user_repair',
      attempts: 4,
    });
    expect(verify).toHaveBeenCalledTimes(4);
    expect(doctor.getSnapshot().kind).toBe('needs_user_repair');
  });

  it('fails safely without guessed cleanup for an unrecognized error', async () => {
    const reset = vi.fn();
    const doctor = createStorageDoctor({
      open: vi.fn().mockRejectedValue(new Error('unrelated failure')),
      reset,
      verify: vi.fn(),
      sleep: vi.fn(),
    });

    await expect(doctor.run()).resolves.toEqual({
      code: 'unexpected_failure',
      attempts: 1,
      diagnosticCode: 'storage_unrecognized_failure',
    });
    expect(reset).not.toHaveBeenCalled();
  });

  it('allows an explicit non-destructive Try Again after persistent failure', async () => {
    const open = vi
      .fn()
      .mockRejectedValueOnce(backingStoreError())
      .mockRejectedValueOnce(backingStoreError())
      .mockRejectedValueOnce(backingStoreError())
      .mockRejectedValueOnce(backingStoreError())
      .mockResolvedValue(undefined);
    const doctor = createStorageDoctor({
      open,
      reset: vi.fn(),
      verify: vi.fn().mockResolvedValue(undefined),
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    await doctor.run();
    await expect(doctor.run({ force: true })).resolves.toEqual({ code: 'healthy', attempts: 1 });
    expect(doctor.getSnapshot().kind).toBe('healthy');
  });

  it('gates persistence-dependent work while repair is required', async () => {
    const doctor = createStorageDoctor({
      open: vi.fn().mockRejectedValue(backingStoreError()),
      reset: vi.fn(),
      verify: vi.fn(),
      sleep: vi.fn().mockResolvedValue(undefined),
    });
    await doctor.run();

    await expect(doctor.requireHealthy()).rejects.toBeInstanceOf(StorageDoctorUnavailableError);
  });

  it('repairs a late backing-store failure and retries the requested operation once', async () => {
    const doctor = createStorageDoctor({
      open: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn(),
      verify: vi.fn().mockResolvedValue(undefined),
      sleep: vi.fn().mockResolvedValue(undefined),
    });
    await doctor.run();
    const operation = vi.fn().mockRejectedValueOnce(backingStoreError()).mockResolvedValue('chat');

    await expect(doctor.runStorageOperation(operation)).resolves.toBe('chat');
    expect(operation).toHaveBeenCalledTimes(2);
    expect(doctor.getSnapshot().kind).toBe('healthy');
  });

  it('applies a native backup receipt before opening and completes it only after verification', async () => {
    const events: string[] = [];
    const doctor = createStorageDoctor({
      prepareRepair: vi.fn().mockResolvedValue({
        async apply() {
          events.push('apply');
        },
        async complete() {
          events.push('complete');
        },
      }),
      open: vi.fn(async () => {
        events.push('open');
      }),
      reset: vi.fn(() => events.push('reset')),
      verify: vi.fn(async () => {
        events.push('verify');
      }),
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    await expect(doctor.run()).resolves.toEqual({
      code: 'recovered_after_repair',
      attempts: 1,
    });
    expect(events).toEqual(['reset', 'apply', 'open', 'verify', 'complete']);
  });
});
