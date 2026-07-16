import { describe, expect, it } from 'vitest';
import { resolvePetMotionPolicy } from './petMotionPolicy';

describe('Pet motion policy', () => {
  it('honors operating-system reduced motion above playful preferences', () => {
    expect(
      resolvePetMotionPolicy({
        level: 'playful',
        userReducedMotion: false,
        systemReducedMotion: true,
        idleFunIntervalMs: 60_000,
      }),
    ).toEqual({
      animationsEnabled: true,
      reducedMotion: true,
      idleFunEnabled: false,
      idleFunIntervalMs: 60_000,
    });
  });

  it('keeps calm bounded, preserves normal, accelerates playful, and supports off', () => {
    expect(
      resolvePetMotionPolicy({
        level: 'calm',
        userReducedMotion: false,
        systemReducedMotion: false,
        idleFunIntervalMs: 30_000,
      }).idleFunIntervalMs,
    ).toBe(120_000);
    expect(
      resolvePetMotionPolicy({
        level: 'normal',
        userReducedMotion: false,
        systemReducedMotion: false,
        idleFunIntervalMs: 75_000,
      }).idleFunIntervalMs,
    ).toBe(75_000);
    expect(
      resolvePetMotionPolicy({
        level: 'playful',
        userReducedMotion: false,
        systemReducedMotion: false,
        idleFunIntervalMs: 75_000,
      }).idleFunIntervalMs,
    ).toBe(30_000);
    expect(
      resolvePetMotionPolicy({
        level: 'off',
        userReducedMotion: false,
        systemReducedMotion: false,
        idleFunIntervalMs: 60_000,
      }),
    ).toMatchObject({ animationsEnabled: false, reducedMotion: true, idleFunEnabled: false });
  });
});
