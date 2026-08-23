import { describe, expect, it } from 'vitest';
import {
  OPENWHIP_PHYSICS,
  advanceOpenWhip,
  createOpenWhipState,
  openWhipSegmentLength,
  shouldTriggerWhipCrack,
} from './whipPhysics';

describe('OpenWhip-derived Faster Agents physics', () => {
  it('preserves upstream segment count, crack speed, grace, and cooldown', () => {
    expect(OPENWHIP_PHYSICS.segments).toBe(28);
    expect(OPENWHIP_PHYSICS.constraintIterations).toBe(20);
    expect(shouldTriggerWhipCrack(341, 1_000, 0, 0)).toBe(true);
    expect(shouldTriggerWhipCrack(340, 1_000, 0, 0)).toBe(false);
    expect(shouldTriggerWhipCrack(341, 300, 0, 0)).toBe(false);
    expect(shouldTriggerWhipCrack(341, 1_000, 0, 850)).toBe(false);
  });

  it('keeps the 28-link Verlet chain finite, bounded, and pinned to the handle', () => {
    const state = createOpenWhipState({ x: 120, y: 180 }, 0);
    expect(state.points).toHaveLength(28);
    expect(openWhipSegmentLength(0)).toBe(25);
    expect(openWhipSegmentLength(27)).toBe(15);

    advanceOpenWhip(state, { x: 180, y: 210 }, { width: 900, height: 600 }, 16);
    expect(state.points[0]).toMatchObject({ x: 180, y: 210 });
    for (const point of state.points) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(900);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(600);
    }
  });
});
