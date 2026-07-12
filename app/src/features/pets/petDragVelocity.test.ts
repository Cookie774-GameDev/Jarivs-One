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
  walkEntryPxPerSec: 12,
  walkExitPxPerSec: 4,
  hysteresisMs: 80,
  stopDelayMs: 100,
  minWalkHoldMs: 150,
  smoothing: 1, // instant for deterministic tests
};

describe('petDragVelocity', () => {
  it('selects walkRight for sustained rightward velocity above entry', () => {
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

  it('stays neutral below entry threshold (tiny jitter)', () => {
    let s = createDragVelocityState(0, 0);
    // 0.5px in 100ms = 5 px/s < entry 12
    const r = sampleDragVelocity(s, 0.5, 100, cfg);
    expect(r.walkAnim).toBe('idlePrimary');
  });

  it('requires min walk hold before stop grace can idle', () => {
    let s = createDragVelocityState(0, 0);
    let r = sampleDragVelocity(s, 40, 100, cfg); // enter walk at t=100
    expect(r.walkAnim).toBe('walkRight');
    s = r.state;
    // Immediately stop moving at t=120 (< minWalkHold 150 from 100)
    r = sampleDragVelocity(s, 40, 120, cfg);
    expect(r.walkAnim).toBe('walkRight'); // still walking due to min hold
    s = r.state;
    // After min hold: start stop candidate (still walking)
    r = sampleDragVelocity(s, 40, 260, cfg);
    expect(r.walkAnim).toBe('walkRight');
    s = r.state;
    // After stop delay from stop candidate
    r = sampleDragVelocity(s, 40, 400, cfg);
    expect(r.walkAnim).toBe('idlePrimary');
  });

  it('requires hysteresis before flipping left↔right', () => {
    let s = createDragVelocityState(0, 0);
    let r = sampleDragVelocity(s, 30, 100, cfg);
    expect(r.walkAnim).toBe('walkRight');
    s = r.state;
    r = sampleDragVelocity(s, -30, 120, cfg); // only 20ms later
    expect(r.walkAnim).toBe('walkRight');
    s = r.state;
    r = sampleDragVelocity(s, -60, 280, cfg); // after min hold + hysteresis
    expect(r.walkAnim).toBe('walkLeft');
  });

  it('returns to idle when the pointer is held still', () => {
    let s = createDragVelocityState(0, 0);
    let r = sampleDragVelocity(s, 40, 100, cfg);
    expect(r.walkAnim).toBe('walkRight');
    s = r.state;
    r = sampleStationaryDragVelocity(s, 300, cfg);
    expect(r.walkAnim).toBe('walkRight'); // still within stop grace / hold
    s = r.state;
    r = sampleStationaryDragVelocity(s, 500, cfg);
    expect(r.walkAnim).toBe('idlePrimary');
    expect(r.state.vx).toBe(0);
  });

  it('maps cursor speed to bounded walking playback fps', () => {
    expect(dragWalkFpsFromVelocity(0, 12, cfg)).toBe(12);
    expect(dragWalkFpsFromVelocity(80, 12, cfg)).toBeLessThanOrEqual(12);
    expect(dragWalkFpsFromVelocity(600, 12, cfg)).toBeGreaterThan(12);
    expect(dragWalkFpsFromVelocity(5000, 12, cfg)).toBeLessThanOrEqual(24);
  });
});
