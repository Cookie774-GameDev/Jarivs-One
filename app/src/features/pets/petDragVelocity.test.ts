import { describe, expect, it } from 'vitest';
import {
  createDragVelocityState,
  dragWalkFpsFromVelocity,
  sampleDragVelocity,
  sampleStationaryDragVelocity,
  DEFAULT_DRAG_VELOCITY_CONFIG,
} from './petDragVelocity';

const cfg = {
  ...DEFAULT_DRAG_VELOCITY_CONFIG,
  deadZonePxPerSec: 10,
  hysteresisMs: 80,
  stopDelayMs: 80,
  smoothing: 1, // use instant vx for deterministic tests
};

describe('petDragVelocity', () => {
  it('selects walkRight for sustained rightward velocity', () => {
    let s = createDragVelocityState(0, 0);
    // 20px in 100ms = 200 px/s
    let r = sampleDragVelocity(s, 20, 100, cfg);
    expect(r.walkAnim).toBe('walkRight');
    s = r.state;
    r = sampleDragVelocity(s, 40, 200, cfg);
    expect(r.walkAnim).toBe('walkRight');
  });

  it('selects walkLeft for sustained leftward velocity', () => {
    let s = createDragVelocityState(100, 0);
    const r = sampleDragVelocity(s, 80, 100, cfg); // -200 px/s
    expect(r.walkAnim).toBe('walkLeft');
  });

  it('stays neutral inside dead zone', () => {
    let s = createDragVelocityState(0, 0);
    // 0.5px in 100ms = 5 px/s < 10 dead zone
    const r = sampleDragVelocity(s, 0.5, 100, cfg);
    expect(r.walkAnim).toBe('idlePrimary');
  });

  it('requires hysteresis before flipping left↔right', () => {
    let s = createDragVelocityState(0, 0);
    let r = sampleDragVelocity(s, 30, 100, cfg); // right
    expect(r.walkAnim).toBe('walkRight');
    s = r.state;
    // flip immediately at t=120 (< 80ms hysteresis from 100)
    r = sampleDragVelocity(s, 0, 120, { ...cfg, smoothing: 1 });
    // may still be walkRight due to hysteresis if desired is left
    // force left sample
    r = sampleDragVelocity(s, -30, 120, cfg);
    // directionSince was 100, now 120 → only 20ms — keep walkRight
    expect(r.walkAnim).toBe('walkRight');
    s = r.state;
    r = sampleDragVelocity(s, -60, 200, cfg); // 100ms since lock
    expect(r.walkAnim).toBe('walkLeft');
  });

  it('applies stop delay before returning to neutral', () => {
    let s = createDragVelocityState(0, 0);
    let r = sampleDragVelocity(s, 40, 100, cfg);
    expect(r.walkAnim).toBe('walkRight');
    s = r.state;
    // Hold position (0 velocity) — still walking until stopDelayMs
    r = sampleDragVelocity(s, 40, 150, cfg);
    expect(r.walkAnim).toBe('walkRight');
    s = r.state;
    r = sampleDragVelocity(s, 40, 250, cfg); // 100ms of zero velocity after first stop candidate
    expect(r.walkAnim).toBe('idlePrimary');
  });

  it('returns to idle when the pointer is held still and no move event fires', () => {
    let s = createDragVelocityState(0, 0);
    let r = sampleDragVelocity(s, 40, 100, cfg);
    expect(r.walkAnim).toBe('walkRight');
    s = r.state;

    r = sampleStationaryDragVelocity(s, 150, cfg);
    expect(r.walkAnim).toBe('walkRight');
    s = r.state;

    r = sampleStationaryDragVelocity(s, 250, cfg);
    expect(r.walkAnim).toBe('idlePrimary');
    expect(r.state.vx).toBe(0);
  });

  it('maps cursor speed to bounded walking playback fps', () => {
    expect(dragWalkFpsFromVelocity(0, 12, cfg)).toBe(12);
    expect(dragWalkFpsFromVelocity(80, 12, cfg)).toBeLessThan(12);
    expect(dragWalkFpsFromVelocity(600, 12, cfg)).toBeGreaterThan(12);
    expect(dragWalkFpsFromVelocity(5000, 12, cfg)).toBeLessThanOrEqual(24);
  });
});
