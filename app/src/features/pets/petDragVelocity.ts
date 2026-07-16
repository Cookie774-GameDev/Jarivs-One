/**
 * Horizontal drag direction from pointer velocity (px/s), with EMA smoothing,
 * separate entry/exit thresholds, hysteresis, min walk hold, and stop grace.
 * Pure — unit-tested without DOM.
 */

export type WalkDirection = 'walkLeft' | 'walkRight' | 'draggingNeutral';

export interface DragVelocityConfig {
  /** |vx| must exceed this to *enter* walking from idle. */
  walkEntryPxPerSec: number;
  /** |vx| must fall below this (for stopDelayMs) to *exit* walking. */
  walkExitPxPerSec: number;
  /** Min time a new direction must hold before flip L↔R. */
  hysteresisMs: number;
  /** How long |vx| must stay under exit threshold before idle. */
  stopDelayMs: number;
  /** Minimum time to stay in walk once entered (reduces flicker). */
  minWalkHoldMs: number;
  /** EMA blend for velocity samples (0–1). Lower = smoother. */
  smoothing: number;
}

export const DEFAULT_DRAG_VELOCITY_CONFIG: DragVelocityConfig = {
  walkEntryPxPerSec: 14,
  walkExitPxPerSec: 5,
  hysteresisMs: 100,
  stopDelayMs: 160,
  minWalkHoldMs: 180,
  smoothing: 0.32,
};

/** @deprecated use walkEntry/walkExit — kept for older tests */
export type DragVelocityConfigLegacy = DragVelocityConfig & {
  deadZonePxPerSec?: number;
};

export interface DragVelocityState {
  lastX: number;
  lastT: number;
  vx: number;
  direction: WalkDirection;
  directionSinceMs: number;
  stopCandidateSinceMs: number | null;
}

export function createDragVelocityState(x: number, t: number): DragVelocityState {
  return {
    lastX: x,
    lastT: t,
    vx: 0,
    direction: 'draggingNeutral',
    directionSinceMs: t,
    stopCandidateSinceMs: null,
  };
}

function resolveCfg(cfg: DragVelocityConfigLegacy): DragVelocityConfig {
  const entry =
    cfg.walkEntryPxPerSec ??
    (typeof cfg.deadZonePxPerSec === 'number' ? cfg.deadZonePxPerSec : 14);
  const exit =
    cfg.walkExitPxPerSec ??
    (typeof cfg.deadZonePxPerSec === 'number' ? cfg.deadZonePxPerSec * 0.4 : 5);
  return {
    walkEntryPxPerSec: entry,
    walkExitPxPerSec: Math.min(exit, entry - 1),
    hysteresisMs: cfg.hysteresisMs,
    stopDelayMs: cfg.stopDelayMs,
    minWalkHoldMs: cfg.minWalkHoldMs ?? 180,
    smoothing: cfg.smoothing,
  };
}

/**
 * Sample a pointer position at time t (ms).
 */
export function sampleDragVelocity(
  state: DragVelocityState,
  x: number,
  t: number,
  cfgIn: DragVelocityConfigLegacy = DEFAULT_DRAG_VELOCITY_CONFIG,
): { state: DragVelocityState; walkAnim: 'walkLeft' | 'walkRight' | 'idlePrimary' } {
  const cfg = resolveCfg(cfgIn);
  const dt = Math.max(1, t - state.lastT);
  const instVx = ((x - state.lastX) / dt) * 1000;
  const vx = state.vx * (1 - cfg.smoothing) + instVx * cfg.smoothing;
  let direction = state.direction;
  let directionSinceMs = state.directionSinceMs;
  let stopCandidateSinceMs = state.stopCandidateSinceMs;

  const abs = Math.abs(vx);
  const holdOk = t - state.directionSinceMs >= cfg.minWalkHoldMs;

  // Desired direction from velocity with dual thresholds
  let desired: WalkDirection = 'draggingNeutral';
  if (direction === 'walkLeft' || direction === 'walkRight') {
    // While walking: use lower exit threshold; stay if still moving same way
    if (vx < -cfg.walkExitPxPerSec) desired = 'walkLeft';
    else if (vx > cfg.walkExitPxPerSec) desired = 'walkRight';
    else desired = 'draggingNeutral';
  } else {
    // From idle: require higher entry threshold
    if (vx < -cfg.walkEntryPxPerSec) desired = 'walkLeft';
    else if (vx > cfg.walkEntryPxPerSec) desired = 'walkRight';
  }

  if (desired === 'draggingNeutral') {
    if (direction === 'walkLeft' || direction === 'walkRight') {
      // Respect min walk hold before allowing stop countdown
      if (!holdOk) {
        // keep walking
        stopCandidateSinceMs = null;
      } else {
        if (stopCandidateSinceMs == null) stopCandidateSinceMs = t;
        if (t - stopCandidateSinceMs >= cfg.stopDelayMs) {
          direction = 'draggingNeutral';
          directionSinceMs = t;
          stopCandidateSinceMs = null;
        }
      }
    } else {
      stopCandidateSinceMs = null;
    }
  } else {
    stopCandidateSinceMs = null;
    if (desired !== direction) {
      if (direction === 'draggingNeutral') {
        // enter walk immediately when entry threshold met
        direction = desired;
        directionSinceMs = t;
      } else if (
        // L↔R flip: hysteresis + min hold
        holdOk &&
        t - directionSinceMs >= cfg.hysteresisMs
      ) {
        direction = desired;
        directionSinceMs = t;
      }
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

export function sampleStationaryDragVelocity(
  state: DragVelocityState,
  t: number,
  cfgIn: DragVelocityConfigLegacy = DEFAULT_DRAG_VELOCITY_CONFIG,
): { state: DragVelocityState; walkAnim: 'walkLeft' | 'walkRight' | 'idlePrimary' } {
  // Hold last X; zero instantaneous velocity so stop grace can complete
  const next = sampleDragVelocity(state, state.lastX, t, {
    ...cfgIn,
    smoothing: 1,
  });
  return {
    ...next,
    state: { ...next.state, vx: 0 },
  };
}

export function dragWalkFpsFromVelocity(
  vx: number,
  baseFps: number,
  cfgIn: DragVelocityConfigLegacy = DEFAULT_DRAG_VELOCITY_CONFIG,
): number {
  const cfg = resolveCfg(cfgIn);
  if (!Number.isFinite(baseFps) || baseFps <= 0) return 12;
  const speed = Math.max(0, Math.abs(vx) - cfg.walkExitPxPerSec);
  if (speed <= 0) return baseFps;
  const scale = Math.min(1.6, Math.max(0.55, speed / 220));
  return Math.max(4, Math.min(24, Math.round(baseFps * scale)));
}

export function reducedMotionWalkAnim(
  walk: 'walkLeft' | 'walkRight' | 'idlePrimary',
): 'walkLeft' | 'walkRight' | 'idlePrimary' {
  return walk;
}
