import { afterEach, describe, expect, it, vi } from 'vitest';
import { runWithInstantCommandDeadline } from './deadline';

describe('runWithInstantCommandDeadline', () => {
  afterEach(() => vi.useRealTimers());

  it('returns a completed value before the deadline', async () => {
    await expect(runWithInstantCommandDeadline(async () => 42, 500)).resolves.toEqual({
      status: 'completed',
      value: 42,
    });
  });

  it('aborts at the deadline and ignores a late success', async () => {
    vi.useFakeTimers();
    let resolve!: (value: string) => void;
    let observedSignal: AbortSignal | undefined;
    const late = new Promise<string>((done) => {
      resolve = done;
    });
    const result = runWithInstantCommandDeadline(async (signal) => {
      observedSignal = signal;
      return late;
    }, 500);

    await vi.advanceTimersByTimeAsync(500);
    await expect(result).resolves.toEqual({ status: 'timed_out' });
    expect(observedSignal?.aborted).toBe(true);
    resolve('late-success');
    await vi.runAllTimersAsync();
  });
});
