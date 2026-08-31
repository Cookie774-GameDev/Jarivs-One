import { afterEach, describe, expect, it, vi } from 'vitest';
import { runWithInstantCommandDeadline } from './deadline';

describe('runWithInstantCommandDeadline', () => {
  afterEach(() => vi.useRealTimers());

  it('rejects an invalid fractional deadline before invoking the operation', async () => {
    const operation = vi.fn(async () => 'unreachable');

    await expect(runWithInstantCommandDeadline(operation, 1.5)).rejects.toThrow(
      'Instant Command deadline must be between 1 and 500 ms',
    );
    expect(operation).not.toHaveBeenCalled();
  });

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
    expect(observedSignal?.reason).toBe('instant_command_deadline');
    expect(vi.getTimerCount()).toBe(0);
    resolve('late-success');
    await vi.runAllTimersAsync();
  });

  it('clears the deadline timer when the operation throws synchronously', async () => {
    vi.useFakeTimers();

    const result = runWithInstantCommandDeadline(() => {
      throw new Error('authority failed');
    }, 500);

    await expect(result).rejects.toThrow('authority failed');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the deadline timer when the operation rejects asynchronously', async () => {
    vi.useFakeTimers();

    const result = runWithInstantCommandDeadline(
      async () => Promise.reject(new Error('authority rejected')),
      500,
    );

    await expect(result).rejects.toThrow('authority rejected');
    expect(vi.getTimerCount()).toBe(0);
  });
});
