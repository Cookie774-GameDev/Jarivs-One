/**
 * Click-vs-drag classification for Pet pointer gestures.
 *
 * Wraps around the existing walk/drag velocity controller — does not replace it.
 * Small hand jitter must still count as a click so the mini panel can open.
 */

/** Max screen movement (CSS px) that still counts as a click, not a drag. */
export const PET_CLICK_MOVE_THRESHOLD_PX = 12;

export interface PetPointerGesture {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startScreenX: number;
  startScreenY: number;
  startLogicalLeft: number;
  startLogicalTop: number;
  startedAtMs: number;
  /** True once movement exceeds the click threshold. */
  dragged: boolean;
  maxDistancePx: number;
}

export function beginPetPointerGesture(input: {
  pointerId: number;
  clientX: number;
  clientY: number;
  screenX: number;
  screenY: number;
  logicalLeft: number;
  logicalTop: number;
  nowMs: number;
}): PetPointerGesture {
  return {
    pointerId: input.pointerId,
    startClientX: input.clientX,
    startClientY: input.clientY,
    startScreenX: input.screenX,
    startScreenY: input.screenY,
    startLogicalLeft: input.logicalLeft,
    startLogicalTop: input.logicalTop,
    startedAtMs: input.nowMs,
    dragged: false,
    maxDistancePx: 0,
  };
}

/** Update gesture with a new pointer sample. Mutates and returns the same object. */
export function samplePetPointerGesture(
  gesture: PetPointerGesture,
  clientX: number,
  clientY: number,
  thresholdPx: number = PET_CLICK_MOVE_THRESHOLD_PX,
): PetPointerGesture {
  const dist = Math.hypot(clientX - gesture.startClientX, clientY - gesture.startClientY);
  if (dist > gesture.maxDistancePx) gesture.maxDistancePx = dist;
  if (dist > thresholdPx) gesture.dragged = true;
  return gesture;
}

/**
 * On pointer up: true when the gesture should open the mini panel.
 * Drag (movement above threshold) must not open the panel.
 */
export function shouldOpenPanelFromGesture(
  gesture: PetPointerGesture | null | undefined,
  thresholdPx: number = PET_CLICK_MOVE_THRESHOLD_PX,
): boolean {
  if (!gesture) return false;
  if (gesture.dragged) return false;
  if (gesture.maxDistancePx > thresholdPx) return false;
  return true;
}
