import type { CanvasPointerSample } from './strokes';

export const CANVAS_TOUCH_DRAG_THRESHOLD = 8;
export const CANVAS_TOUCH_LONG_PRESS_MS = 500;
export const CANVAS_TOUCH_TAP_MAX_MS = 500;
export const CANVAS_TOUCH_MIN_TARGET_SIZE = 44;
export const CANVAS_PALM_CONTACT_SIZE = 32;

export const CANVAS_TOUCH_INPUT_METADATA = deepFreeze({
  touchAction: 'none',
  minimumTargetSize: CANVAS_TOUCH_MIN_TARGET_SIZE,
  keyboardAlternatives: {
    pan: 'Arrow keys',
    zoomIn: 'Plus key',
    zoomOut: 'Minus key',
    activate: 'Enter or Space',
    contextMenu: 'Shift+F10',
  },
} as const);

export type CanvasTouchPointerType = 'touch' | 'pen' | 'mouse';

export interface CanvasTouchPointerEvent {
  readonly type:
    | 'pointer-down'
    | 'pointer-move'
    | 'pointer-up'
    | 'pointer-cancel'
    | 'lost-pointer-capture';
  readonly pointerId: number;
  readonly pointerType: CanvasTouchPointerType;
  readonly x: number;
  readonly y: number;
  readonly time: number;
  readonly pressure?: number;
  readonly tiltX?: number;
  readonly tiltY?: number;
  readonly width?: number;
  readonly height?: number;
}

export interface CanvasTouchTimeEvent {
  readonly type: 'time';
  readonly time: number;
}

export type CanvasTouchInputEvent = CanvasTouchPointerEvent | CanvasTouchTimeEvent;

type CanvasTrackedPointerMode = 'candidate' | 'pan' | 'pinch' | 'pen' | 'ignored';

export interface CanvasTrackedPointer {
  readonly pointerId: number;
  readonly pointerType: 'touch' | 'pen';
  readonly mode: CanvasTrackedPointerMode;
  readonly start: CanvasTouchPoint;
  readonly last: CanvasTouchPoint;
  readonly startedAt: number;
  readonly longPressFired: boolean;
}

export interface CanvasTouchInputState {
  readonly pointers: readonly CanvasTrackedPointer[];
  readonly lastTime: number | null;
}

export interface CanvasTouchPoint {
  readonly x: number;
  readonly y: number;
}

export type CanvasTouchInputIntent =
  | { readonly type: 'capture-pointer'; readonly pointerId: number }
  | { readonly type: 'release-pointer'; readonly pointerId: number }
  | {
      readonly type: 'ignore-pointer';
      readonly pointerId: number;
      readonly reason: 'palm' | 'pen-active' | 'extra-touch';
    }
  | { readonly type: 'pan'; readonly delta: CanvasTouchPoint }
  | {
      readonly type: 'pinch';
      readonly centroid: CanvasTouchPoint;
      readonly centroidDelta: CanvasTouchPoint;
      readonly scale: number;
    }
  | { readonly type: 'tap'; readonly point: CanvasTouchPoint }
  | {
      readonly type: 'long-press';
      readonly pointerId: number;
      readonly point: CanvasTouchPoint;
    }
  | {
      readonly type: 'stroke-start' | 'stroke-point' | 'stroke-end';
      readonly pointerId: number;
      readonly sample: CanvasPointerSample;
    }
  | { readonly type: 'stroke-cancel'; readonly pointerId: number };

export interface CanvasTouchInputResult {
  readonly state: CanvasTouchInputState;
  readonly intents: readonly CanvasTouchInputIntent[];
  readonly preventDefault: boolean;
}

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
  } else if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
  }
  return Object.freeze(value);
}

function finite(value: number, path: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${path} must be a finite number`);
  return value;
}

function suppliedTime(value: number, previous: number | null): number {
  finite(value, 'event.time');
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('event.time must be a non-negative safe integer');
  }
  if (previous !== null && value < previous) {
    throw new RangeError('event.time must not move backwards');
  }
  return value;
}

function pointerId(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('event.pointerId must be a non-negative safe integer');
  }
  return value;
}

function point(event: CanvasTouchPointerEvent): CanvasTouchPoint {
  return { x: finite(event.x, 'event.x'), y: finite(event.y, 'event.y') };
}

function contactDimension(value: number | undefined, path: string): number {
  if (value === undefined) return 0;
  const size = finite(value, path);
  if (size < 0) throw new RangeError(`${path} must not be negative`);
  return size;
}

function stylusSample(event: CanvasTouchPointerEvent): CanvasPointerSample {
  const pressure = event.pressure ?? 0.5;
  const tiltX = event.tiltX ?? 0;
  const tiltY = event.tiltY ?? 0;
  if (pressure < 0 || pressure > 1 || !Number.isFinite(pressure)) {
    throw new RangeError('event.pressure must be between 0 and 1');
  }
  if (tiltX < -90 || tiltX > 90 || !Number.isFinite(tiltX)) {
    throw new RangeError('event.tiltX must be between -90 and 90');
  }
  if (tiltY < -90 || tiltY > 90 || !Number.isFinite(tiltY)) {
    throw new RangeError('event.tiltY must be between -90 and 90');
  }
  return deepFreeze({
    x: event.x,
    y: event.y,
    pressure,
    tiltX,
    tiltY,
    timestamp: event.time,
    kind: 'stylus',
  });
}

function distance(left: CanvasTouchPoint, right: CanvasTouchPoint): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function midpoint(left: CanvasTouchPoint, right: CanvasTouchPoint): CanvasTouchPoint {
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
}

function withState(
  pointers: readonly CanvasTrackedPointer[],
  lastTime: number,
  intents: readonly CanvasTouchInputIntent[],
  preventDefault: boolean,
): CanvasTouchInputResult {
  return deepFreeze({
    state: { pointers, lastTime },
    intents,
    preventDefault,
  });
}

function replacePointer(
  pointers: readonly CanvasTrackedPointer[],
  replacement: CanvasTrackedPointer,
): readonly CanvasTrackedPointer[] {
  return pointers.map((pointer) =>
    pointer.pointerId === replacement.pointerId ? replacement : pointer,
  );
}

function touchPointers(pointers: readonly CanvasTrackedPointer[]): readonly CanvasTrackedPointer[] {
  return pointers.filter(
    (pointer) => pointer.pointerType === 'touch' && pointer.mode !== 'ignored',
  );
}

export function createTouchInputState(): CanvasTouchInputState {
  return deepFreeze({ pointers: [], lastTime: null });
}

export function resolveCanvasTouchTargetSize(
  widthValue: number,
  heightValue: number,
): Readonly<{ width: number; height: number }> {
  const width = finite(widthValue, 'width');
  const height = finite(heightValue, 'height');
  if (width < 0 || height < 0) throw new RangeError('touch target dimensions must not be negative');
  return Object.freeze({
    width: Math.max(CANVAS_TOUCH_MIN_TARGET_SIZE, width),
    height: Math.max(CANVAS_TOUCH_MIN_TARGET_SIZE, height),
  });
}

function reduceTime(
  state: CanvasTouchInputState,
  event: CanvasTouchTimeEvent,
  time: number,
): CanvasTouchInputResult {
  const due = state.pointers.filter(
    (pointer) =>
      pointer.pointerType === 'touch' &&
      pointer.mode === 'candidate' &&
      !pointer.longPressFired &&
      time - pointer.startedAt >= CANVAS_TOUCH_LONG_PRESS_MS,
  );
  if (due.length === 0) return withState(state.pointers, time, [], false);

  const dueIds = new Set(due.map((pointer) => pointer.pointerId));
  const pointers = state.pointers.map((pointer) =>
    dueIds.has(pointer.pointerId) ? { ...pointer, longPressFired: true } : pointer,
  );
  return withState(
    pointers,
    time,
    due.map((pointer) => ({
      type: 'long-press' as const,
      pointerId: pointer.pointerId,
      point: pointer.last,
    })),
    false,
  );
}

function reduceDown(
  state: CanvasTouchInputState,
  event: CanvasTouchPointerEvent,
  time: number,
): CanvasTouchInputResult {
  pointerId(event.pointerId);
  const nextPoint = point(event);
  if (state.pointers.some((pointer) => pointer.pointerId === event.pointerId)) {
    throw new RangeError(`pointer ${event.pointerId} is already active`);
  }

  if (event.pointerType === 'mouse') return withState(state.pointers, time, [], false);

  if (event.pointerType === 'pen') {
    const activeTouches = state.pointers.filter(
      (pointer) => pointer.pointerType === 'touch' && pointer.mode !== 'ignored',
    );
    const activeTouchIds = new Set(activeTouches.map((pointer) => pointer.pointerId));
    const pointers = state.pointers.map((pointer) =>
      activeTouchIds.has(pointer.pointerId)
        ? { ...pointer, mode: 'ignored' as const, longPressFired: true }
        : pointer,
    );
    const tracked: CanvasTrackedPointer = {
      pointerId: event.pointerId,
      pointerType: 'pen',
      mode: 'pen',
      start: nextPoint,
      last: nextPoint,
      startedAt: time,
      longPressFired: false,
    };
    const cancellationIntents = activeTouches.flatMap(
      (pointer): readonly CanvasTouchInputIntent[] => [
        { type: 'ignore-pointer', pointerId: pointer.pointerId, reason: 'pen-active' },
        { type: 'release-pointer', pointerId: pointer.pointerId },
      ],
    );
    return withState(
      [...pointers, tracked],
      time,
      [
        ...cancellationIntents,
        { type: 'stroke-start', pointerId: event.pointerId, sample: stylusSample(event) },
        { type: 'capture-pointer', pointerId: event.pointerId },
      ],
      true,
    );
  }

  const width = contactDimension(event.width, 'event.width');
  const height = contactDimension(event.height, 'event.height');
  const penActive = state.pointers.some(
    (pointer) => pointer.pointerType === 'pen' && pointer.mode === 'pen',
  );
  const palm = width >= CANVAS_PALM_CONTACT_SIZE || height >= CANVAS_PALM_CONTACT_SIZE;
  const activeTouches = touchPointers(state.pointers);
  const ignoredReason = penActive
    ? 'pen-active'
    : palm
      ? 'palm'
      : activeTouches.length >= 2
        ? 'extra-touch'
        : null;
  if (ignoredReason) {
    const ignored: CanvasTrackedPointer = {
      pointerId: event.pointerId,
      pointerType: 'touch',
      mode: 'ignored',
      start: nextPoint,
      last: nextPoint,
      startedAt: time,
      longPressFired: false,
    };
    return withState(
      [...state.pointers, ignored],
      time,
      [{ type: 'ignore-pointer', pointerId: event.pointerId, reason: ignoredReason }],
      true,
    );
  }

  const tracked: CanvasTrackedPointer = {
    pointerId: event.pointerId,
    pointerType: 'touch',
    mode: activeTouches.length === 1 ? 'pinch' : 'candidate',
    start: nextPoint,
    last: nextPoint,
    startedAt: time,
    longPressFired: false,
  };
  let pointers = [...state.pointers, tracked];
  if (activeTouches.length === 1) {
    pointers = pointers.map((pointer) =>
      pointer.pointerId === activeTouches[0].pointerId ? { ...pointer, mode: 'pinch' } : pointer,
    );
  }
  return withState(pointers, time, [{ type: 'capture-pointer', pointerId: event.pointerId }], true);
}

function reduceMove(
  state: CanvasTouchInputState,
  event: CanvasTouchPointerEvent,
  time: number,
): CanvasTouchInputResult {
  const index = state.pointers.findIndex((pointer) => pointer.pointerId === event.pointerId);
  if (index < 0 || event.pointerType === 'mouse') {
    return withState(state.pointers, time, [], false);
  }
  const current = state.pointers[index];
  const nextPoint = point(event);
  if (current.mode === 'ignored') {
    return withState(
      replacePointer(state.pointers, { ...current, last: nextPoint }),
      time,
      [],
      true,
    );
  }
  if (current.mode === 'pen') {
    return withState(
      replacePointer(state.pointers, { ...current, last: nextPoint }),
      time,
      [{ type: 'stroke-point', pointerId: event.pointerId, sample: stylusSample(event) }],
      true,
    );
  }

  const previousTouches = touchPointers(state.pointers);
  const updated = { ...current, last: nextPoint };
  let pointers = replacePointer(state.pointers, updated);
  if (current.mode === 'pinch' && previousTouches.length === 2) {
    const nextTouches = touchPointers(pointers);
    const previousCentroid = midpoint(previousTouches[0].last, previousTouches[1].last);
    const nextCentroid = midpoint(nextTouches[0].last, nextTouches[1].last);
    const previousDistance = distance(previousTouches[0].last, previousTouches[1].last);
    const nextDistance = distance(nextTouches[0].last, nextTouches[1].last);
    return withState(
      pointers,
      time,
      [
        {
          type: 'pinch',
          centroid: nextCentroid,
          centroidDelta: {
            x: nextCentroid.x - previousCentroid.x,
            y: nextCentroid.y - previousCentroid.y,
          },
          scale: previousDistance === 0 ? 1 : nextDistance / previousDistance,
        },
      ],
      true,
    );
  }

  if (current.mode === 'candidate') {
    if (distance(current.start, nextPoint) < CANVAS_TOUCH_DRAG_THRESHOLD) {
      return withState(pointers, time, [], true);
    }
    pointers = replacePointer(pointers, { ...updated, mode: 'pan' });
    return withState(
      pointers,
      time,
      [
        {
          type: 'pan',
          delta: { x: nextPoint.x - current.start.x, y: nextPoint.y - current.start.y },
        },
      ],
      true,
    );
  }

  return withState(
    pointers,
    time,
    [
      {
        type: 'pan',
        delta: { x: nextPoint.x - current.last.x, y: nextPoint.y - current.last.y },
      },
    ],
    true,
  );
}

function reduceEnd(
  state: CanvasTouchInputState,
  event: CanvasTouchPointerEvent,
  time: number,
): CanvasTouchInputResult {
  const current = state.pointers.find((pointer) => pointer.pointerId === event.pointerId);
  if (!current || event.pointerType === 'mouse') return withState(state.pointers, time, [], false);

  const interrupted = event.type !== 'pointer-up';
  const remaining = state.pointers.filter((pointer) => pointer.pointerId !== event.pointerId);
  let pointers: readonly CanvasTrackedPointer[] = remaining;
  const remainingTouches = touchPointers(remaining);
  if (current.mode === 'pinch' && remainingTouches.length === 1) {
    pointers = replacePointer(remaining, {
      ...remainingTouches[0],
      mode: 'pan',
      start: remainingTouches[0].last,
      longPressFired: true,
    });
  }

  if (current.mode === 'ignored') return withState(pointers, time, [], true);

  const intents: CanvasTouchInputIntent[] = [];
  if (current.mode === 'pen') {
    if (interrupted) {
      intents.push({ type: 'stroke-cancel', pointerId: event.pointerId });
    } else {
      point(event);
      intents.push({
        type: 'stroke-end',
        pointerId: event.pointerId,
        sample: stylusSample(event),
      });
    }
  } else if (
    !interrupted &&
    current.mode === 'candidate' &&
    !current.longPressFired &&
    time - current.startedAt <= CANVAS_TOUCH_TAP_MAX_MS &&
    distance(current.start, point(event)) < CANVAS_TOUCH_DRAG_THRESHOLD
  ) {
    intents.push({ type: 'tap', point: point(event) });
  }
  intents.push({ type: 'release-pointer', pointerId: event.pointerId });
  return withState(pointers, time, intents, true);
}

export function reduceTouchInput(
  state: CanvasTouchInputState,
  event: CanvasTouchInputEvent,
): CanvasTouchInputResult {
  const time = suppliedTime(event.time, state.lastTime);
  if (event.type === 'time') return reduceTime(state, event, time);
  if (event.type === 'pointer-down') return reduceDown(state, event, time);
  if (event.type === 'pointer-move') return reduceMove(state, event, time);
  return reduceEnd(state, event, time);
}
