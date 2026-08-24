import { describe, expect, it, vi } from 'vitest';
import { createSingleFlightRunner } from './singleFlight';

describe('single-flight background runner', () => {
  it('shares one active task and permits the next run only after settlement', async () => {
    let release: (() => void) | undefined;
    const task = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    const runner = createSingleFlightRunner(task);

    const first = runner.run();
    const overlapping = runner.run();
    await Promise.resolve();
    expect(overlapping).toBe(first);
    expect(task).toHaveBeenCalledTimes(1);

    release?.();
    await first;
    await runner.run();
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('does not start new work after the owning lifecycle stops', async () => {
    const task = vi.fn(async () => undefined);
    const runner = createSingleFlightRunner(task);

    runner.stop();
    await runner.run();

    expect(task).not.toHaveBeenCalled();
  });
});
