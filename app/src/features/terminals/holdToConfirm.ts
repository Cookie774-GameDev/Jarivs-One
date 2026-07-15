/**
 * Shared hold → confirm timing for destructive pane chrome actions
 * (Clear screen, Close pane). Keeps timers + phase state out of JSX.
 */

export type HoldConfirmPhase = 'idle' | 'holding' | 'confirm';

export const HOLD_TO_CONFIRM_MS = 1500;
export const HOLD_CONFIRM_WINDOW_MS = 3500;

export interface HoldToConfirmController {
  getPhase: () => HoldConfirmPhase;
  /** Begin hold if idle. Returns true if hold started. */
  beginHold: () => boolean;
  /** Cancel an in-progress hold (pointer up/leave). No-op in confirm. */
  cancelHold: () => void;
  /** Consume confirm phase after user clicks Confirm. Returns true if confirmed. */
  confirm: () => boolean;
  /** Force back to idle (cleanup / external reset). */
  reset: () => void;
  dispose: () => void;
}

export interface HoldToConfirmOptions {
  holdMs?: number;
  confirmWindowMs?: number;
  onPhaseChange?: (phase: HoldConfirmPhase) => void;
  /** Optional gate: return false to refuse starting a hold. */
  canBegin?: () => boolean;
}

/**
 * Create a ref-safe hold-to-confirm controller.
 * Phase is always read from an internal ref so pointer handlers stay correct.
 */
export function createHoldToConfirmController(
  options: HoldToConfirmOptions = {},
): HoldToConfirmController {
  const holdMs = options.holdMs ?? HOLD_TO_CONFIRM_MS;
  const confirmWindowMs = options.confirmWindowMs ?? HOLD_CONFIRM_WINDOW_MS;
  let phase: HoldConfirmPhase = 'idle';
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let confirmTimer: ReturnType<typeof setTimeout> | null = null;

  const setPhase = (next: HoldConfirmPhase) => {
    if (phase === next) return;
    phase = next;
    options.onPhaseChange?.(next);
  };

  const clearTimers = () => {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (confirmTimer) {
      clearTimeout(confirmTimer);
      confirmTimer = null;
    }
  };

  return {
    getPhase: () => phase,
    beginHold: () => {
      if (phase !== 'idle') return false;
      if (options.canBegin && !options.canBegin()) return false;
      clearTimers();
      setPhase('holding');
      holdTimer = setTimeout(() => {
        holdTimer = null;
        setPhase('confirm');
        confirmTimer = setTimeout(() => {
          confirmTimer = null;
          setPhase('idle');
        }, confirmWindowMs);
      }, holdMs);
      return true;
    },
    cancelHold: () => {
      if (phase !== 'holding') return;
      clearTimers();
      setPhase('idle');
    },
    confirm: () => {
      if (phase !== 'confirm') return false;
      clearTimers();
      setPhase('idle');
      return true;
    },
    reset: () => {
      clearTimers();
      setPhase('idle');
    },
    dispose: () => {
      clearTimers();
      phase = 'idle';
    },
  };
}
