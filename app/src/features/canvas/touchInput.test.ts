import { describe, expect, it } from 'vitest';
import {
  CANVAS_TOUCH_INPUT_METADATA,
  createTouchInputState,
  reduceTouchInput,
  resolveCanvasTouchTargetSize,
  type CanvasTouchInputEvent,
  type CanvasTouchInputState,
} from './touchInput';

function apply(
  state: CanvasTouchInputState,
  event: CanvasTouchInputEvent,
): ReturnType<typeof reduceTouchInput> {
  return reduceTouchInput(state, event);
}

describe('canvas touch input', () => {
  it('pans after the drag threshold without turning a drag into a tap', () => {
    let state = createTouchInputState();
    let result = apply(state, {
      type: 'pointer-down',
      pointerId: 1,
      pointerType: 'touch',
      x: 10,
      y: 20,
      time: 100,
    });
    expect(result.preventDefault).toBe(true);
    expect(result.intents).toEqual([{ type: 'capture-pointer', pointerId: 1 }]);

    state = result.state;
    result = apply(state, {
      type: 'pointer-move',
      pointerId: 1,
      pointerType: 'touch',
      x: 17,
      y: 20,
      time: 110,
    });
    expect(result.intents).toEqual([]);

    state = result.state;
    result = apply(state, {
      type: 'pointer-move',
      pointerId: 1,
      pointerType: 'touch',
      x: 19,
      y: 24,
      time: 120,
    });
    expect(result.intents).toEqual([{ type: 'pan', delta: { x: 9, y: 4 } }]);

    result = apply(result.state, {
      type: 'pointer-up',
      pointerId: 1,
      pointerType: 'touch',
      x: 19,
      y: 24,
      time: 130,
    });
    expect(result.intents).toEqual([{ type: 'release-pointer', pointerId: 1 }]);
  });

  it('recognizes a short stationary touch as a tap', () => {
    const down = apply(createTouchInputState(), {
      type: 'pointer-down',
      pointerId: 7,
      pointerType: 'touch',
      x: 45,
      y: 60,
      time: 1_000,
    });
    const up = apply(down.state, {
      type: 'pointer-up',
      pointerId: 7,
      pointerType: 'touch',
      x: 47,
      y: 61,
      time: 1_200,
    });

    expect(up.intents).toEqual([
      { type: 'tap', point: { x: 47, y: 61 } },
      { type: 'release-pointer', pointerId: 7 },
    ]);
  });

  it('uses supplied time to emit one deterministic long press', () => {
    const down = apply(createTouchInputState(), {
      type: 'pointer-down',
      pointerId: 3,
      pointerType: 'touch',
      x: 80,
      y: 90,
      time: 10,
    });
    const early = apply(down.state, { type: 'time', time: 509 });
    expect(early.intents).toEqual([]);

    const due = apply(early.state, { type: 'time', time: 510 });
    expect(due.intents).toEqual([{ type: 'long-press', pointerId: 3, point: { x: 80, y: 90 } }]);
    const later = apply(due.state, { type: 'time', time: 900 });
    expect(later.intents).toEqual([]);

    const up = apply(later.state, {
      type: 'pointer-up',
      pointerId: 3,
      pointerType: 'touch',
      x: 80,
      y: 90,
      time: 901,
    });
    expect(up.intents).toEqual([{ type: 'release-pointer', pointerId: 3 }]);
  });

  it('pinches around the moving centroid and reports simultaneous pan and scale', () => {
    let state = createTouchInputState();
    state = apply(state, {
      type: 'pointer-down',
      pointerId: 1,
      pointerType: 'touch',
      x: 0,
      y: 0,
      time: 0,
    }).state;
    const second = apply(state, {
      type: 'pointer-down',
      pointerId: 2,
      pointerType: 'touch',
      x: 10,
      y: 0,
      time: 1,
    });
    expect(second.intents).toEqual([{ type: 'capture-pointer', pointerId: 2 }]);

    const moved = apply(second.state, {
      type: 'pointer-move',
      pointerId: 2,
      pointerType: 'touch',
      x: 22,
      y: 4,
      time: 2,
    });
    expect(moved.intents).toEqual([
      {
        type: 'pinch',
        centroid: { x: 11, y: 2 },
        centroidDelta: { x: 6, y: 2 },
        scale: Math.hypot(22, 4) / 10,
      },
    ]);
  });

  it('keeps tracking the remaining touch after a pinch without emitting a tap', () => {
    let state = createTouchInputState();
    state = apply(state, {
      type: 'pointer-down',
      pointerId: 1,
      pointerType: 'touch',
      x: 0,
      y: 0,
      time: 0,
    }).state;
    state = apply(state, {
      type: 'pointer-down',
      pointerId: 2,
      pointerType: 'touch',
      x: 20,
      y: 0,
      time: 1,
    }).state;
    const lifted = apply(state, {
      type: 'pointer-up',
      pointerId: 2,
      pointerType: 'touch',
      x: 20,
      y: 0,
      time: 2,
    });
    expect(lifted.intents).toEqual([{ type: 'release-pointer', pointerId: 2 }]);

    const moved = apply(lifted.state, {
      type: 'pointer-move',
      pointerId: 1,
      pointerType: 'touch',
      x: 12,
      y: 3,
      time: 3,
    });
    expect(moved.intents).toEqual([{ type: 'pan', delta: { x: 12, y: 3 } }]);
  });

  it('passes stylus pressure and tilt through stroke intents', () => {
    const down = apply(createTouchInputState(), {
      type: 'pointer-down',
      pointerId: 11,
      pointerType: 'pen',
      x: 5,
      y: 6,
      pressure: 0.25,
      tiltX: -20,
      tiltY: 35,
      time: 10,
    });
    expect(down.intents).toEqual([
      {
        type: 'stroke-start',
        pointerId: 11,
        sample: {
          x: 5,
          y: 6,
          pressure: 0.25,
          tiltX: -20,
          tiltY: 35,
          timestamp: 10,
          kind: 'stylus',
        },
      },
      { type: 'capture-pointer', pointerId: 11 },
    ]);

    const moved = apply(down.state, {
      type: 'pointer-move',
      pointerId: 11,
      pointerType: 'pen',
      x: 7,
      y: 9,
      pressure: 0.8,
      tiltX: 10,
      tiltY: 15,
      time: 12,
    });
    expect(moved.intents).toEqual([
      {
        type: 'stroke-point',
        pointerId: 11,
        sample: {
          x: 7,
          y: 9,
          pressure: 0.8,
          tiltX: 10,
          tiltY: 15,
          timestamp: 12,
          kind: 'stylus',
        },
      },
    ]);
  });

  it('suppresses palm-sized touch contacts and all touch contacts while a pen is active', () => {
    const palm = apply(createTouchInputState(), {
      type: 'pointer-down',
      pointerId: 1,
      pointerType: 'touch',
      x: 0,
      y: 0,
      width: 40,
      height: 25,
      time: 0,
    });
    expect(palm.intents).toEqual([{ type: 'ignore-pointer', pointerId: 1, reason: 'palm' }]);
    expect(palm.preventDefault).toBe(true);

    const pen = apply(createTouchInputState(), {
      type: 'pointer-down',
      pointerId: 2,
      pointerType: 'pen',
      x: 10,
      y: 10,
      time: 1,
    });
    const touch = apply(pen.state, {
      type: 'pointer-down',
      pointerId: 3,
      pointerType: 'touch',
      x: 12,
      y: 12,
      width: 5,
      height: 5,
      time: 2,
    });
    expect(touch.intents).toEqual([{ type: 'ignore-pointer', pointerId: 3, reason: 'pen-active' }]);
  });

  it('cancels captured touches before a pen stroke and emits no later touch gesture', () => {
    const first = apply(createTouchInputState(), {
      type: 'pointer-down',
      pointerId: 1,
      pointerType: 'touch',
      x: 0,
      y: 0,
      time: 0,
    });
    const second = apply(first.state, {
      type: 'pointer-down',
      pointerId: 2,
      pointerType: 'touch',
      x: 20,
      y: 0,
      time: 1,
    });
    const pen = apply(second.state, {
      type: 'pointer-down',
      pointerId: 9,
      pointerType: 'pen',
      x: 10,
      y: 10,
      time: 2,
    });

    expect(pen.intents).toEqual([
      { type: 'ignore-pointer', pointerId: 1, reason: 'pen-active' },
      { type: 'release-pointer', pointerId: 1 },
      { type: 'ignore-pointer', pointerId: 2, reason: 'pen-active' },
      { type: 'release-pointer', pointerId: 2 },
      {
        type: 'stroke-start',
        pointerId: 9,
        sample: {
          x: 10,
          y: 10,
          pressure: 0.5,
          tiltX: 0,
          tiltY: 0,
          timestamp: 2,
          kind: 'stylus',
        },
      },
      { type: 'capture-pointer', pointerId: 9 },
    ]);
    expect(pen.state.pointers.filter((pointer) => pointer.pointerType === 'touch')).toEqual([
      expect.objectContaining({ pointerId: 1, mode: 'ignored', longPressFired: true }),
      expect.objectContaining({ pointerId: 2, mode: 'ignored', longPressFired: true }),
    ]);
    expect(apply(pen.state, { type: 'time', time: 1_000 }).intents).toEqual([]);
    expect(
      apply(pen.state, {
        type: 'pointer-move',
        pointerId: 1,
        pointerType: 'touch',
        x: 100,
        y: 100,
        time: 3,
      }).intents,
    ).toEqual([]);
  });

  it.each(['pointer-cancel', 'lost-pointer-capture'] as const)(
    'cleans up an interrupted pen stroke on %s',
    (type) => {
      const down = apply(createTouchInputState(), {
        type: 'pointer-down',
        pointerId: 9,
        pointerType: 'pen',
        x: 1,
        y: 2,
        time: 0,
      });
      const cancelled = apply(down.state, {
        type,
        pointerId: 9,
        pointerType: 'pen',
        x: 1,
        y: 2,
        time: 1,
      });
      expect(cancelled.intents).toEqual([
        { type: 'stroke-cancel', pointerId: 9 },
        { type: 'release-pointer', pointerId: 9 },
      ]);
      expect(cancelled.state.pointers).toEqual([]);
    },
  );

  it('ignores mouse input so pointer support does not replace mouse handlers', () => {
    const result = apply(createTouchInputState(), {
      type: 'pointer-down',
      pointerId: 1,
      pointerType: 'mouse',
      x: 0,
      y: 0,
      time: 0,
    });
    expect(result.preventDefault).toBe(false);
    expect(result.intents).toEqual([]);
  });

  it('publishes page-scroll, touch-target, and keyboard-alternative integration metadata', () => {
    expect(CANVAS_TOUCH_INPUT_METADATA).toEqual({
      touchAction: 'none',
      minimumTargetSize: 44,
      keyboardAlternatives: {
        pan: 'Arrow keys',
        zoomIn: 'Plus key',
        zoomOut: 'Minus key',
        activate: 'Enter or Space',
        contextMenu: 'Shift+F10',
      },
    });
    expect(resolveCanvasTouchTargetSize(16, 30)).toEqual({ width: 44, height: 44 });
    expect(Object.isFrozen(CANVAS_TOUCH_INPUT_METADATA)).toBe(true);
  });

  it('returns immutable state and rejects time traveling input', () => {
    const down = apply(createTouchInputState(), {
      type: 'pointer-down',
      pointerId: 1,
      pointerType: 'touch',
      x: 0,
      y: 0,
      time: 10,
    });
    expect(Object.isFrozen(down.state)).toBe(true);
    expect(Object.isFrozen(down.state.pointers)).toBe(true);
    expect(() =>
      apply(down.state, {
        type: 'pointer-move',
        pointerId: 1,
        pointerType: 'touch',
        x: 1,
        y: 1,
        time: 9,
      }),
    ).toThrow(/time/i);
  });
});
