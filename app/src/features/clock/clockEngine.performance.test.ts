import { afterEach, describe, expect, it, vi } from 'vitest';
import { startClockEngine } from './clockEngine';

describe('clock engine background cadence', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps slow due-alert passes single-flight across interval ticks', async () => {
    vi.useFakeTimers();
    let releaseFirstPass: ((count: number) => void) | undefined;
    const runDue = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<number>((resolve) => {
            releaseFirstPass = resolve;
          }),
      )
      .mockResolvedValue(0);

    const stop = startClockEngine({ intervalMs: 250, now: () => 123, runDue });
    await vi.runAllTicks();
    expect(runDue).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(runDue).toHaveBeenCalledTimes(1);

    releaseFirstPass?.(0);
    await vi.runAllTicks();
    await vi.advanceTimersByTimeAsync(250);
    expect(runDue).toHaveBeenCalledTimes(2);
    expect(runDue).toHaveBeenLastCalledWith(123);

    stop();
  });
});
