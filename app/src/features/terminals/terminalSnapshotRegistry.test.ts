import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  _resetTerminalSnapshotRegistryForTests,
  flushRegisteredTerminalSnapshots,
  registerTerminalSnapshotFlush,
} from './terminalSnapshotRegistry';

afterEach(() => {
  _resetTerminalSnapshotRegistryForTests();
  vi.useRealTimers();
});

describe('terminal snapshot flush registry', () => {
  it('flushes registered panes and supports unregister', async () => {
    const a = vi.fn(async () => {});
    const b = vi.fn(async () => {});
    const unregister = registerTerminalSnapshotFlush('a', a);
    registerTerminalSnapshotFlush('b', b);
    unregister();

    const result = await flushRegisteredTerminalSnapshots(100);
    expect(result).toEqual({ completed: 1, failed: 0, timedOut: false });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledOnce();
  });

  it('accounts for rejected flushes without rejecting globally', async () => {
    registerTerminalSnapshotFlush('ok', async () => {});
    registerTerminalSnapshotFlush('bad', async () => {
      throw new Error('synthetic failure');
    });

    await expect(flushRegisteredTerminalSnapshots(100)).resolves.toEqual({
      completed: 1,
      failed: 1,
      timedOut: false,
    });
  });

  it('returns at the deadline when a pane never settles', async () => {
    vi.useFakeTimers();
    registerTerminalSnapshotFlush('stuck', () => new Promise(() => {}));
    const pending = flushRegisteredTerminalSnapshots(1_200);
    await vi.advanceTimersByTimeAsync(1_200);
    await expect(pending).resolves.toEqual({
      completed: 0,
      failed: 0,
      timedOut: true,
    });
  });

  it('coalesces concurrent global flushes', async () => {
    let release: (() => void) | undefined;
    const flush = vi.fn(() => new Promise<void>((resolve) => {
      release = resolve;
    }));
    registerTerminalSnapshotFlush('pane', flush);
    const first = flushRegisteredTerminalSnapshots(1_000);
    const second = flushRegisteredTerminalSnapshots(1_000);
    release?.();
    expect(await first).toEqual(await second);
    expect(flush).toHaveBeenCalledOnce();
  });
});
