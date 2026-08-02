import { describe, expect, it } from 'vitest';

import type { CanvasSpatialPlacement } from './contracts';
import {
  CANVAS_GRID_SIZE,
  CANVAS_SNAP_THRESHOLD_PX,
  canvasSnapBounds,
  snapCanvasDrag,
} from './snapping';

function placement(
  blockId: string,
  x: number,
  y: number,
  width = 100,
  height = 80,
): CanvasSpatialPlacement {
  return {
    blockId,
    x,
    y,
    width,
    height,
    rotation: 0,
    z: 0,
    locked: false,
    hidden: false,
  } as CanvasSpatialPlacement;
}

describe('canvas drag snapping', () => {
  it('computes one axis-aligned bounding box for a multi-object selection', () => {
    expect(
      canvasSnapBounds([placement('a', -20, 10, 40, 30), placement('b', 50, -10, 25, 80)]),
    ).toEqual({
      x: -20,
      y: -10,
      width: 95,
      height: 80,
    });
  });

  it('snaps moving edges and centers to nearby object anchors with smart guides', () => {
    const result = snapCanvasDrag({
      movingBounds: { x: 0, y: 0, width: 100, height: 80 },
      delta: { x: 97, y: 116 },
      targets: [placement('target', 200, 200, 120, 100)],
      threshold: CANVAS_SNAP_THRESHOLD_PX,
      gridSize: null,
    });

    expect(result.delta).toEqual({ x: 100, y: 120 });
    expect(result.guides).toEqual([
      {
        axis: 'x',
        position: 200,
        start: 120,
        end: 300,
        source: 'object',
        targetId: 'target',
      },
      {
        axis: 'y',
        position: 200,
        start: 100,
        end: 320,
        source: 'object',
        targetId: 'target',
      },
    ]);
  });

  it('uses camera-scaled thresholds and deterministic nearest object anchors', () => {
    const result = snapCanvasDrag({
      movingBounds: { x: 0, y: 0, width: 100, height: 80 },
      delta: { x: 95.5, y: 0 },
      targets: [placement('farther', 200, 0), placement('nearer', 197, 0)],
      threshold: CANVAS_SNAP_THRESHOLD_PX / 2,
      gridSize: null,
    });

    expect(result.delta.x).toBe(97);
    expect(result.guides[0]).toMatchObject({
      axis: 'x',
      position: 197,
      targetId: 'nearer',
    });
  });

  it('snaps the moving top-left to the world grid when no object anchor wins', () => {
    const result = snapCanvasDrag({
      movingBounds: { x: 5, y: -5, width: 100, height: 80 },
      delta: { x: 13, y: 17 },
      targets: [],
      threshold: CANVAS_SNAP_THRESHOLD_PX,
      gridSize: CANVAS_GRID_SIZE,
    });

    expect(result.delta).toEqual({ x: 19, y: 5 });
    expect(result.guides).toEqual([
      {
        axis: 'x',
        position: 24,
        start: 0,
        end: 80,
        source: 'grid',
        targetId: null,
      },
      {
        axis: 'y',
        position: 0,
        start: 24,
        end: 124,
        source: 'grid',
        targetId: null,
      },
    ]);
  });

  it('prefers an object anchor over the grid independently on each axis', () => {
    const result = snapCanvasDrag({
      movingBounds: { x: 0, y: 0, width: 100, height: 80 },
      delta: { x: 98, y: 13 },
      targets: [placement('target', 200, 500)],
      threshold: CANVAS_SNAP_THRESHOLD_PX,
      gridSize: CANVAS_GRID_SIZE,
    });

    expect(result.delta).toEqual({ x: 100, y: 24 });
    expect(result.guides.map((guide) => guide.source)).toEqual(['object', 'grid']);
  });

  it('rejects malformed geometry instead of emitting non-finite placement data', () => {
    expect(() =>
      snapCanvasDrag({
        movingBounds: { x: Number.NaN, y: 0, width: 100, height: 80 },
        delta: { x: 0, y: 0 },
        targets: [],
        threshold: CANVAS_SNAP_THRESHOLD_PX,
        gridSize: null,
      }),
    ).toThrow(RangeError);
    expect(() =>
      snapCanvasDrag({
        movingBounds: { x: 0, y: 0, width: 100, height: 80 },
        delta: { x: 0, y: 0 },
        targets: [],
        threshold: CANVAS_SNAP_THRESHOLD_PX,
        gridSize: 0,
      }),
    ).toThrow(RangeError);
  });
});
