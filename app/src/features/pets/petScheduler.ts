/**
 * Idle-fun and sleep timers with anti-burst rules.
 * Does not accumulate missed idleFun firings after suspension.
 */

export interface PetSchedulerOptions {
  idleFunIntervalMs: number;
  sleepTimeoutMs: number;
  now?: () => number;
}

export interface PetScheduler {
  /** Call when machine is in a state that allows idleFun / sleep countdown. */
  onActivity: () => void;
  /** Call when a high-priority anim starts (pauses/resets idleFun). */
  onHighPriority: () => void;
  /** Call each animation frame / second with whether idleFun may fire. */
  tick: (canIdleFun: boolean, canSleep: boolean) => 'idle_fun' | 'sleep' | null;
  dispose: () => void;
  /** Test helpers */
  _nextIdleFunAt: () => number | null;
}

export function createPetScheduler(opts: PetSchedulerOptions): PetScheduler {
  const now = opts.now ?? (() => Date.now());
  let nextIdleFunAt: number | null = null;
  let sleepDeadline: number | null = null;
  let disposed = false;

  function armIdleFun() {
    nextIdleFunAt = now() + opts.idleFunIntervalMs;
  }

  function armSleep() {
    sleepDeadline = now() + opts.sleepTimeoutMs;
  }

  // Start unarmed until welcome completes (activity).
  return {
    onActivity() {
      if (disposed) return;
      armIdleFun();
      armSleep();
    },
    onHighPriority() {
      if (disposed) return;
      // Pause idleFun — do not queue backlog.
      nextIdleFunAt = null;
      armSleep();
    },
    tick(canIdleFun, canSleep) {
      if (disposed) return null;
      const t = now();
      // At most one event per tick (no burst). Prefer idleFun over sleep
      // when both would fire after a long suspension.
      if (canIdleFun) {
        if (nextIdleFunAt == null) armIdleFun();
        else if (t >= nextIdleFunAt) {
          armIdleFun();
          // Push sleep deadline so we don't also fire sleep same tick.
          if (canSleep) armSleep();
          return 'idle_fun';
        }
      } else {
        nextIdleFunAt = null;
      }
      if (canSleep) {
        if (sleepDeadline == null) armSleep();
        else if (t >= sleepDeadline) {
          sleepDeadline = null;
          return 'sleep';
        }
      } else {
        sleepDeadline = null;
      }
      return null;
    },
    dispose() {
      disposed = true;
      nextIdleFunAt = null;
      sleepDeadline = null;
    },
    _nextIdleFunAt: () => nextIdleFunAt,
  };
}
