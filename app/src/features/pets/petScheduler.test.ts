import { describe, expect, it } from 'vitest';
import { createPetScheduler } from './petScheduler';

describe('petScheduler', () => {
  it('fires idleFun once per interval without stacking after long pause', () => {
    let t = 1_000_000;
    const s = createPetScheduler({
      idleFunIntervalMs: 60_000,
      sleepTimeoutMs: 300_000,
      now: () => t,
    });
    s.onActivity();
    expect(s.tick(true, true)).toBeNull();
    t += 59_000;
    expect(s.tick(true, true)).toBeNull();
    t += 2_000;
    expect(s.tick(true, true)).toBe('idle_fun');
    // Long suspension: jump far past several intervals — still only one fire per tick.
    t += 600_000;
    expect(s.tick(true, true)).toBe('idle_fun');
    expect(s.tick(true, true)).toBeNull();
    s.dispose();
  });

  it('does not fire idleFun when canIdleFun is false; re-arms later', () => {
    let t = 0;
    const s = createPetScheduler({
      idleFunIntervalMs: 1000,
      sleepTimeoutMs: 10_000,
      now: () => t,
    });
    s.onActivity();
    t = 2000;
    expect(s.tick(false, true)).toBeNull();
    t = 5000;
    // after re-enabled, needs full interval from re-arm onActivity/tick
    s.onActivity();
    t = 5500;
    expect(s.tick(true, true)).toBeNull();
    t = 6100;
    expect(s.tick(true, true)).toBe('idle_fun');
    s.dispose();
  });

  it('fires sleep after timeout when allowed', () => {
    let t = 0;
    const s = createPetScheduler({
      idleFunIntervalMs: 999_999,
      sleepTimeoutMs: 5_000,
      now: () => t,
    });
    s.onActivity();
    t = 4_999;
    expect(s.tick(true, true)).toBeNull();
    t = 5_001;
    expect(s.tick(true, true)).toBe('sleep');
    s.dispose();
  });
});
