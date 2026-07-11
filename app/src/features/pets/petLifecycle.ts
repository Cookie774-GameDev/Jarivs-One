/**
 * Reduced-motion mapping + dispose helpers for the Pet runtime.
 * Pure where possible so unit tests cover shipped behavior.
 */

import type { PetAnimId } from './petStateMachine';

/** Map a desired anim to the reduced-motion fallback. */
export function mapReducedMotionAnim(anim: PetAnimId): PetAnimId {
  switch (anim) {
    case 'welcome':
      return 'welcome'; // short playback via fps clamp
    case 'idleFun':
      return 'idlePrimary'; // skip fun idle
    case 'walkLeft':
    case 'walkRight':
      return anim; // restrained via low fps in player
    case 'sleepTransition':
      return 'sleepingLoop'; // snap toward sleep
    case 'wakeFromSleep':
      return 'idlePrimary';
    default:
      return anim === 'sleepingLoop' ? 'sleepingLoop' : 'idlePrimary';
  }
}

/** FPS clamp when reduced motion is on. */
export function reducedMotionFps(anim: PetAnimId, nominal: number): number {
  if (anim === 'idlePrimary' || anim === 'sleepingLoop') return Math.min(nominal, 4);
  if (anim === 'walkLeft' || anim === 'walkRight') return Math.min(nominal, 6);
  if (anim === 'welcome') return Math.min(nominal, 8);
  return Math.min(nominal, 6);
}

export interface Disposable {
  dispose: () => void;
}

/** Dispose many resources; safe if already disposed. */
export function disposeAll(items: Array<Disposable | null | undefined>): void {
  for (const item of items) {
    try {
      item?.dispose();
    } catch {
      /* ignore double-dispose */
    }
  }
}
