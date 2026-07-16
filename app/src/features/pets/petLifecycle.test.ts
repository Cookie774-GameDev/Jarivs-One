import { describe, expect, it, vi } from 'vitest';
import {
  PET_ANIMATION_SPEED_MULTIPLIER,
  disposeAll,
  mapReducedMotionAnim,
  petPlaybackFps,
  reducedMotionFps,
} from './petLifecycle';
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

  it('speeds every normal Pet animation up by exactly 15 percent', () => {
    expect(PET_ANIMATION_SPEED_MULTIPLIER).toBe(1.15);
    expect(petPlaybackFps('welcome', 7.5, false)).toBeCloseTo(8.625, 8);
    expect(petPlaybackFps('idlePrimary', 5.9, false)).toBeCloseTo(6.785, 8);
    expect(petPlaybackFps('wakeFromSleep', 12, false)).toBeCloseTo(13.8, 8);
  });

  it('keeps reduced-motion accessibility caps after applying the speed multiplier', () => {
    expect(petPlaybackFps('idlePrimary', 13, true)).toBeLessThanOrEqual(4);
    expect(petPlaybackFps('walkRight', 13, true)).toBeLessThanOrEqual(6);
    expect(petPlaybackFps('welcome', 7.5, true)).toBeCloseTo(8, 8);
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
