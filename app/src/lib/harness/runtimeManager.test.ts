import { describe, expect, it, vi } from 'vitest';
import {
  createHarnessRuntimeManager,
  type HarnessRuntimeNativeAdapter,
  type NativeRuntimeDetection,
  type NativeRuntimeEvent,
} from './runtimeManager';

const readyDetection: NativeRuntimeDetection = {
  status: 'managedCompatible',
  source: 'managed',
  version: '1.18.16',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, deny) => {
    resolve = accept;
    reject = deny;
  });
  return { promise, resolve, reject };
}

function adapter(
  overrides: Partial<HarnessRuntimeNativeAdapter> = {},
): HarnessRuntimeNativeAdapter & { emit(event: NativeRuntimeEvent): void } {
  let listener: ((event: NativeRuntimeEvent) => void) | undefined;
  return {
    available: () => true,
    detect: vi.fn().mockResolvedValue(readyDetection),
    install: vi.fn().mockResolvedValue(readyDetection),
    cancel: vi.fn().mockResolvedValue(true),
    listen: vi.fn(async (next) => {
      listener = next;
      return () => {
        listener = undefined;
      };
    }),
    emit(event) {
      listener?.(event);
    },
    ...overrides,
  };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('harness runtime manager', () => {
  it('detects lazily for the first subscriber and maps compatible native results', async () => {
    const native = adapter();
    const manager = createHarnessRuntimeManager(native);

    expect(native.detect).not.toHaveBeenCalled();
    expect(manager.getSnapshot()).toEqual({ kind: 'checking' });
    const unsubscribe = manager.subscribe(() => {});
    await settle();

    expect(native.listen).toHaveBeenCalledTimes(1);
    expect(native.detect).toHaveBeenCalledTimes(1);
    expect(manager.getSnapshot()).toEqual({
      kind: 'ready',
      source: 'managed',
      version: '1.18.16',
    });
    unsubscribe();
  });

  it('maps missing, incompatible, and failed detection without exposing diagnostics', async () => {
    const missing = adapter({
      detect: vi.fn().mockResolvedValue({ status: 'missing' }),
    });
    const missingManager = createHarnessRuntimeManager(missing);
    await missingManager.refresh();
    expect(missingManager.getSnapshot()).toEqual({ kind: 'download_required' });

    const incompatible = adapter({
      detect: vi.fn().mockResolvedValue({
        status: 'incompatible',
        reason: ` Unsupported runtime ${'x'.repeat(1_000)} `,
        executablePath: 'C:\\private\\opencode.exe',
        fingerprintSha256: 'private-fingerprint',
      }),
    });
    const incompatibleManager = createHarnessRuntimeManager(incompatible);
    await incompatibleManager.refresh();
    const incompatibleState = incompatibleManager.getSnapshot();
    expect(incompatibleState.kind).toBe('incompatible');
    if (incompatibleState.kind === 'incompatible') {
      expect(incompatibleState.reason).toHaveLength(512);
      expect(incompatibleState.reason).toMatch(/^Unsupported runtime x+…$/);
      expect(incompatibleState.reason).not.toContain('C:\\private');
    }

    const failed = adapter({
      detect: vi.fn().mockRejectedValue(new Error(`native ${'y'.repeat(1_000)}`)),
    });
    const failedManager = createHarnessRuntimeManager(failed);
    await failedManager.refresh();
    const failedState = failedManager.getSnapshot();
    expect(failedState.kind).toBe('failed');
    if (failedState.kind === 'failed') {
      expect(failedState.recoverable).toBe(true);
      expect(failedState.message).toHaveLength(512);
      expect(failedState.message).toMatch(/^native y+…$/);
    }
  });

  it('clamps progress events and maps verification, installation, and ready states', async () => {
    const native = adapter({
      detect: vi.fn().mockResolvedValue({ status: 'missing' }),
    });
    const manager = createHarnessRuntimeManager(native);
    const unsubscribe = manager.subscribe(() => {});
    await settle();

    native.emit({ kind: 'downloading', progress: 5 });
    expect(manager.getSnapshot()).toEqual({ kind: 'downloading', progress: 1 });
    native.emit({ kind: 'downloading', progress: Number.NaN });
    expect(manager.getSnapshot()).toEqual({ kind: 'downloading', progress: 0 });
    native.emit({ kind: 'verifying' });
    expect(manager.getSnapshot()).toEqual({ kind: 'verifying' });
    native.emit({ kind: 'installing' });
    expect(manager.getSnapshot()).toEqual({ kind: 'installing' });
    native.emit({ kind: 'ready', source: 'managed', version: '1.18.16' });
    expect(manager.getSnapshot()).toEqual({
      kind: 'ready',
      source: 'managed',
      version: '1.18.16',
    });
    unsubscribe();
  });

  it('invokes explicit install and cancellation and refreshes from the install result', async () => {
    const native = adapter();
    const manager = createHarnessRuntimeManager(native);

    await manager.download();
    expect(native.install).toHaveBeenCalledTimes(1);
    expect(manager.getSnapshot()).toEqual({
      kind: 'ready',
      source: 'managed',
      version: '1.18.16',
    });
    await manager.cancel();
    expect(native.cancel).toHaveBeenCalledTimes(1);
  });

  it('maps cancellation failures without an unhandled rejection', async () => {
    const native = adapter({
      cancel: vi.fn().mockRejectedValue(new Error('Cancellation unavailable.')),
    });
    const manager = createHarnessRuntimeManager(native);

    await expect(manager.cancel()).resolves.toBeUndefined();
    expect(manager.getSnapshot()).toEqual({
      kind: 'failed',
      recoverable: true,
      message: 'Cancellation unavailable.',
    });
  });

  it('preserves the native failed event and supports retry after install rejection', async () => {
    const first = deferred<NativeRuntimeDetection>();
    const native = adapter({ install: vi.fn(() => first.promise) });
    const manager = createHarnessRuntimeManager(native);

    const installing = manager.download();
    native.emit({
      kind: 'failed',
      recoverable: true,
      message: 'Integrity verification failed.',
    });
    first.reject(new Error('Integrity verification failed.'));
    await installing;
    expect(manager.getSnapshot()).toEqual({
      kind: 'failed',
      recoverable: true,
      message: 'Integrity verification failed.',
    });

    vi.mocked(native.install).mockResolvedValueOnce(readyDetection);
    await manager.download();
    expect(manager.getSnapshot().kind).toBe('ready');
  });

  it('unlistens after the last subscriber and reactivates for a later subscriber', async () => {
    const unlisten = vi.fn();
    const native = adapter({ listen: vi.fn(async () => unlisten) });
    const manager = createHarnessRuntimeManager(native);
    const first = manager.subscribe(() => {});
    const second = manager.subscribe(() => {});
    await settle();
    first();
    expect(unlisten).not.toHaveBeenCalled();
    second();
    expect(unlisten).toHaveBeenCalledTimes(1);

    const third = manager.subscribe(() => {});
    await settle();
    expect(native.listen).toHaveBeenCalledTimes(2);
    expect(native.detect).toHaveBeenCalledTimes(2);
    third();
  });

  it('falls back to a ready compatibility state outside Tauri', async () => {
    const native = adapter({ available: () => false });
    const manager = createHarnessRuntimeManager(native);
    const unsubscribe = manager.subscribe(() => {});
    await settle();

    expect(native.listen).not.toHaveBeenCalled();
    expect(native.detect).not.toHaveBeenCalled();
    expect(manager.getSnapshot()).toEqual({
      kind: 'ready',
      source: 'system',
      version: 'web-preview',
    });
    unsubscribe();
  });
});
