import { describe, expect, it, vi } from 'vitest';
import { disposeAll, mapReducedMotionAnim, reducedMotionFps } from './petLifecycle';
import { createPetScheduler } from './petScheduler';

describe('petLifecycle reduced motion + dispose', () => {
  it('maps fun idle and wake to quieter fallbacks', () => {
    expect(mapReducedMotionAnim('idleFun')).toBe('idlePrimary');
    expect(mapReducedMotionAnim('wakeFromSleep')).toBe('idlePrimary');
    expect(mapReducedMotionAnim('sleepTransition')).toBe('sleepingLoop');
    expect(mapReducedMotionAnim('walkLeft')).toBe('walkLeft');
  });

  it('clamps fps under reduced motion', () => {
    expect(reducedMotionFps('idlePrimary', 13)).toBeLessThanOrEqual(4);
    expect(reducedMotionFps('walkRight', 13)).toBeLessThanOrEqual(6);
  });

  it('disposeAll cleans scheduler and ignores double dispose', () => {
    const s = createPetScheduler({
      idleFunIntervalMs: 1000,
      sleepTimeoutMs: 5000,
      now: () => 0,
    });
    const spy = vi.fn();
    disposeAll([s, { dispose: spy }, null, undefined]);
    expect(spy).toHaveBeenCalledTimes(1);
    // second dispose on scheduler must not throw
    disposeAll([s]);
  });
});
