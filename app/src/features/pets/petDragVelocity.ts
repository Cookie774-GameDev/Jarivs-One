/**
 * Horizontal drag direction from pointer velocity (px/s), with smoothing,
 * dead-zone, hysteresis, and stop delay. Pure — unit-tested without DOM.
 */

export type WalkDirection = 'walkLeft' | 'walkRight' | 'draggingNeutral';

export interface DragVelocityConfig {
  /** |vx| below this (px/s) → neutral (after stop delay). */
  deadZonePxPerSec: number;
  /** Min time a new direction must hold before flip. */
  hysteresisMs: number;
  /** How long |vx| must stay in dead zone before neutral. */
  stopDelayMs: number;
  /** EMA blend for velocity samples (0–1). Higher = snappier. */
  smoothing: number;
}

export const DEFAULT_DRAG_VELOCITY_CONFIG: DragVelocityConfig = {
  deadZonePxPerSec: 12,
  hysteresisMs: 80,
  stopDelayMs: 80,
  smoothing: 0.45,
};

export interface DragVelocityState {
  lastX: number;
  lastT: number;
  vx: number;
  direction: WalkDirection;
  /** When current direction was locked in. */
  directionSinceMs: number;
  /** When |vx| first entered dead zone while walking. */
  stopCandidateSinceMs: number | null;
}

export function createDragVelocityState(
  x: number,
  t: number,
): DragVelocityState {
  return {
    lastX: x,
    lastT: t,
    vx: 0,
    direction: 'draggingNeutral',
    directionSinceMs: t,
    stopCandidateSinceMs: null,
  };
}

function desiredFromVx(vx: number, dead: number): WalkDirection {
  // Strict inequality: |vx| == deadZone counts as neutral (dead zone inclusive).
  if (vx < -dead) return 'walkLeft';
  if (vx > dead) return 'walkRight';
  return 'draggingNeutral';
}

/**
 * Sample a pointer position at time t (ms). Returns next state + walk anim id
 * (maps draggingNeutral → idlePrimary for the machine while still dragging).
 */
export function sampleDragVelocity(
  state: DragVelocityState,
  x: number,
  t: number,
  cfg: DragVelocityConfig = DEFAULT_DRAG_VELOCITY_CONFIG,
): { state: DragVelocityState; walkAnim: 'walkLeft' | 'walkRight' | 'idlePrimary' } {
  const dt = Math.max(1, t - state.lastT);
  const instVx = ((x - state.lastX) / dt) * 1000;
  const vx = state.vx * (1 - cfg.smoothing) + instVx * cfg.smoothing;
  let direction = state.direction;
  let directionSinceMs = state.directionSinceMs;
  let stopCandidateSinceMs = state.stopCandidateSinceMs;

  const desired = desiredFromVx(vx, cfg.deadZonePxPerSec);

  if (desired === 'draggingNeutral') {
    if (direction === 'walkLeft' || direction === 'walkRight') {
      if (stopCandidateSinceMs == null) stopCandidateSinceMs = t;
      if (t - stopCandidateSinceMs >= cfg.stopDelayMs) {
        direction = 'draggingNeutral';
        directionSinceMs = t;
        stopCandidateSinceMs = null;
      }
    } else {
      stopCandidateSinceMs = null;
    }
  } else {
    stopCandidateSinceMs = null;
    if (desired !== direction) {
      // Allow immediate first lock from neutral; otherwise require hysteresis.
      if (
        direction === 'draggingNeutral' ||
        t - directionSinceMs >= cfg.hysteresisMs
      ) {
        direction = desired;
        directionSinceMs = t;
      }
    } else {
      directionSinceMs = state.directionSinceMs;
    }
  }

  const next: DragVelocityState = {
    lastX: x,
    lastT: t,
    vx,
    direction,
    directionSinceMs,
    stopCandidateSinceMs,
  };

  const walkAnim =
    direction === 'walkLeft'
      ? 'walkLeft'
      : direction === 'walkRight'
        ? 'walkRight'
        : 'idlePrimary';

  return { state: next, walkAnim };
}

/** Map machine walk anim for reduced-motion (restrained 2-frame still handled by player fps). */
export function reducedMotionWalkAnim(
  walk: 'walkLeft' | 'walkRight' | 'idlePrimary',
): 'walkLeft' | 'walkRight' | 'idlePrimary' {
  return walk;
}
