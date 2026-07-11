/**
 * Pure Pet animation state machine.
 * Priority / interrupt rules for video-driven animations.
 */

export type PetAnimId =
  | 'idlePrimary'
  | 'idleFun'
  | 'walkLeft'
  | 'walkRight'
  | 'welcome'
  | 'sleepTransition'
  | 'sleepingLoop'
  | 'wakeFromSleep';

export type PetDomainEvent =
  | { type: 'boot' }
  | { type: 'welcome_done' }
  | { type: 'drag_start'; dx: number; dy: number }
  | { type: 'drag_move'; dx: number; dy: number }
  | { type: 'drag_end' }
  | { type: 'idle_fun_tick' }
  | { type: 'idle_fun_done' }
  | { type: 'sleep_timeout' }
  | { type: 'sleep_transition_done' }
  | { type: 'click' }
  | { type: 'wake_done' }
  | { type: 'panel_open' }
  | { type: 'panel_close' }
  | { type: 'shutdown' };

export interface PetMachineConfig {
  /** Horizontal drag delta that selects walkLeft/walkRight. */
  directionThresholdPx: number;
  /** Below this |dx| while dragging → idlePrimary (still dragged). */
  stopThresholdPx: number;
}

export interface PetMachineState {
  anim: PetAnimId;
  /** True after welcome has played once this session. */
  welcomePlayed: boolean;
  /** True while pointer is down / window is being dragged. */
  dragging: boolean;
  /** True while mini panel is open. */
  panelOpen: boolean;
  /** True once sleepTransition finished until wake. */
  sleeping: boolean;
  /** Last drag dx for direction. */
  lastDx: number;
  /** Shutdown latch. */
  shutdown: boolean;
}

export const DEFAULT_PET_MACHINE_CONFIG: PetMachineConfig = {
  directionThresholdPx: 4,
  stopThresholdPx: 2,
};

export const PET_ANIM_PRIORITY: Record<PetAnimId, number> = {
  welcome: 90,
  walkLeft: 80,
  walkRight: 80,
  wakeFromSleep: 75,
  sleepTransition: 70,
  sleepingLoop: 65,
  idleFun: 40,
  idlePrimary: 10,
};

export function createInitialPetState(): PetMachineState {
  return {
    anim: 'welcome',
    welcomePlayed: false,
    dragging: false,
    panelOpen: false,
    sleeping: false,
    lastDx: 0,
    shutdown: false,
  };
}

function walkFromDx(dx: number, cfg: PetMachineConfig): PetAnimId {
  if (dx <= -cfg.directionThresholdPx) return 'walkLeft';
  if (dx >= cfg.directionThresholdPx) return 'walkRight';
  return 'idlePrimary';
}

/**
 * Reduce domain events into the next machine state.
 * Pure — safe for unit tests without React/DOM.
 */
export function reducePetEvent(
  state: PetMachineState,
  event: PetDomainEvent,
  cfg: PetMachineConfig = DEFAULT_PET_MACHINE_CONFIG,
): PetMachineState {
  if (state.shutdown && event.type !== 'boot') return state;

  switch (event.type) {
    case 'boot':
      return {
        ...createInitialPetState(),
        anim: state.welcomePlayed ? 'idlePrimary' : 'welcome',
        welcomePlayed: state.welcomePlayed,
      };

    case 'welcome_done':
      if (state.anim !== 'welcome') return state;
      return { ...state, anim: 'idlePrimary', welcomePlayed: true };

    case 'drag_start': {
      const dx = event.dx;
      return {
        ...state,
        dragging: true,
        sleeping: false,
        lastDx: dx,
        anim: walkFromDx(dx, cfg),
      };
    }

    case 'drag_move': {
      if (!state.dragging) return state;
      const dx = event.dx;
      const anim =
        Math.abs(dx) < cfg.stopThresholdPx ? 'idlePrimary' : walkFromDx(dx, cfg);
      return { ...state, lastDx: dx, anim, sleeping: false };
    }

    case 'drag_end':
      return {
        ...state,
        dragging: false,
        lastDx: 0,
        anim: state.panelOpen ? 'idlePrimary' : 'idlePrimary',
      };

    case 'idle_fun_tick': {
      if (state.dragging || state.panelOpen || state.sleeping || state.shutdown) return state;
      if (state.anim !== 'idlePrimary') return state;
      return { ...state, anim: 'idleFun' };
    }

    case 'idle_fun_done':
      if (state.anim !== 'idleFun') return state;
      return { ...state, anim: 'idlePrimary' };

    case 'sleep_timeout': {
      if (state.dragging || state.panelOpen || state.sleeping || state.shutdown) return state;
      if (state.anim === 'welcome' || state.anim === 'walkLeft' || state.anim === 'walkRight') {
        return state;
      }
      return { ...state, anim: 'sleepTransition' };
    }

    case 'sleep_transition_done':
      if (state.anim !== 'sleepTransition') return state;
      return { ...state, anim: 'sleepingLoop', sleeping: true };

    case 'click': {
      // Click always opens panel path; wakes if sleeping.
      if (state.sleeping || state.anim === 'sleepingLoop' || state.anim === 'sleepTransition') {
        return {
          ...state,
          sleeping: false,
          panelOpen: true,
          anim: 'wakeFromSleep',
        };
      }
      return { ...state, panelOpen: true, anim: 'idlePrimary' };
    }

    case 'wake_done':
      if (state.anim !== 'wakeFromSleep') return state;
      return { ...state, anim: 'idlePrimary', sleeping: false };

    case 'panel_open':
      return { ...state, panelOpen: true, sleeping: false };

    case 'panel_close':
      return {
        ...state,
        panelOpen: false,
        anim: state.dragging ? walkFromDx(state.lastDx, cfg) : 'idlePrimary',
      };

    case 'shutdown':
      return { ...state, shutdown: true, anim: 'idlePrimary', dragging: false };

    default:
      return state;
  }
}

/** Whether idleFun scheduler may arm / fire. */
export function canScheduleIdleFun(state: PetMachineState): boolean {
  return (
    !state.shutdown &&
    !state.dragging &&
    !state.panelOpen &&
    !state.sleeping &&
    state.anim === 'idlePrimary' &&
    state.welcomePlayed
  );
}

/** Whether sleep timeout may fire. */
export function canEnterSleep(state: PetMachineState): boolean {
  return (
    !state.shutdown &&
    !state.dragging &&
    !state.panelOpen &&
    !state.sleeping &&
    state.welcomePlayed &&
    (state.anim === 'idlePrimary' || state.anim === 'idleFun')
  );
}
