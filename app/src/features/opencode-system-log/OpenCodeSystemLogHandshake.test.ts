import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  waitForOpenCodeSystemLogLabelRelease,
  waitForOpenCodeSystemLogRendererReady,
} from './OpenCodeSystemLogHost';

type ReadyListener = (payload: unknown) => void;

function readyHarness() {
  let listener: ReadyListener | undefined;
  const unlisten = vi.fn();
  const subscribe = vi.fn(async (next: ReadyListener) => {
    listener = next;
    return unlisten;
  });

  return {
    subscribe,
    unlisten,
    emit(payload: unknown) {
      listener?.(payload);
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('waitForOpenCodeSystemLogRendererReady', () => {
  it('resolves for a valid v1 renderer-ready payload and removes the listener', async () => {
    const harness = readyHarness();
    const ping = vi.fn(async () => {
      harness.emit({ version: 1, updatedAt: 123, stepCount: 7 });
    });

    await expect(
      waitForOpenCodeSystemLogRendererReady(harness.subscribe, ping),
    ).resolves.toBeUndefined();

    expect(harness.subscribe).toHaveBeenCalledOnce();
    expect(ping).toHaveBeenCalledOnce();
    expect(harness.unlisten).toHaveBeenCalledOnce();
  });

  it('ignores malformed and spoofed payloads until a valid renderer-ready payload arrives', async () => {
    const harness = readyHarness();
    let settled = false;
    const wait = waitForOpenCodeSystemLogRendererReady(
      harness.subscribe,
      async () => undefined,
      1_000,
    ).then(() => {
      settled = true;
    });

    await vi.waitFor(() => expect(harness.subscribe).toHaveBeenCalledOnce());
    harness.emit(null);
    harness.emit({ version: 2, updatedAt: 123, stepCount: 7 });
    harness.emit({ version: 1, updatedAt: 123, stepCount: '7' });
    harness.emit({ version: 1, updatedAt: 123 });
    await Promise.resolve();

    expect(settled).toBe(false);
    expect(harness.unlisten).not.toHaveBeenCalled();

    harness.emit({ version: 1, updatedAt: 123, stepCount: 7 });
    await wait;
    expect(settled).toBe(true);
    expect(harness.unlisten).toHaveBeenCalledOnce();
  });

  it('rejects a ping failure and removes the listener', async () => {
    const harness = readyHarness();
    const pingFailure = new Error('native ping failed');

    await expect(
      waitForOpenCodeSystemLogRendererReady(
        harness.subscribe,
        vi.fn().mockRejectedValue(pingFailure),
      ),
    ).rejects.toBe(pingFailure);

    expect(harness.unlisten).toHaveBeenCalledOnce();
  });

  it('rejects on timeout and removes the listener', async () => {
    vi.useFakeTimers();
    const harness = readyHarness();
    const wait = waitForOpenCodeSystemLogRendererReady(
      harness.subscribe,
      async () => undefined,
      250,
    );
    const rejection = expect(wait).rejects.toThrow(
      'OpenCode System Log renderer did not become ready.',
    );

    await vi.advanceTimersByTimeAsync(250);

    await rejection;
    expect(harness.unlisten).toHaveBeenCalledOnce();
  });
});

describe('waitForOpenCodeSystemLogLabelRelease', () => {
  it('returns immediately when the native label is already released', async () => {
    vi.useFakeTimers();
    const getByLabel = vi.fn().mockResolvedValue(null);

    await expect(waitForOpenCodeSystemLogLabelRelease(getByLabel)).resolves.toBeUndefined();

    expect(getByLabel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('polls until a delayed native label release is observed', async () => {
    vi.useFakeTimers();
    const getByLabel = vi
      .fn()
      .mockResolvedValueOnce({ label: 'opencode-system-log' })
      .mockResolvedValueOnce({ label: 'opencode-system-log' })
      .mockResolvedValueOnce(null);
    const wait = waitForOpenCodeSystemLogLabelRelease(getByLabel, 1_000, 25);

    await vi.runAllTimersAsync();

    await expect(wait).resolves.toBeUndefined();
    expect(getByLabel).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects after the bounded timeout when the native label remains occupied', async () => {
    vi.useFakeTimers();
    const getByLabel = vi.fn().mockResolvedValue({ label: 'opencode-system-log' });
    const wait = waitForOpenCodeSystemLogLabelRelease(getByLabel, 100, 25);
    const rejection = expect(wait).rejects.toThrow(
      'OpenCode System Log window label was not released.',
    );

    await vi.advanceTimersByTimeAsync(100);

    await rejection;
    expect(getByLabel).toHaveBeenCalledTimes(5);
    expect(vi.getTimerCount()).toBe(0);
  });
});
