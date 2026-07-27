import { describe, expect, it } from 'vitest';
import {
  alignCanvasPlacements,
  distributeCanvasPlacements,
  reorderCanvasPlacement,
  resizeCanvasPlacement,
  rotateCanvasPlacement,
  translateCanvasPlacements,
} from './geometry';
import type { CanvasSpatialPlacement } from './contracts';

const placements = [
  { blockId: 'a', x: 0, y: 0, width: 100, height: 40, rotation: 0, z: 1 },
  { blockId: 'b', x: 200, y: 80, width: 80, height: 60, rotation: 0, z: 2 },
  { blockId: 'c', x: 500, y: 200, width: 120, height: 80, rotation: 0, z: 3 },
] as unknown as readonly CanvasSpatialPlacement[];

describe('canvas geometry operations', () => {
  it('translates only selected placements by finite world deltas', () => {
    const moved = translateCanvasPlacements(placements, ['a', 'c'], { x: 12.5, y: -8 });

    expect(moved.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 12.5, y: -8 },
      { x: 200, y: 80 },
      { x: 512.5, y: 192 },
    ]);
    expect(() => translateCanvasPlacements(placements, ['a'], { x: Number.NaN, y: 0 })).toThrow(
      'finite',
    );
  });

  it('resizes with a bounded minimum and normalizes rotation', () => {
    expect(
      resizeCanvasPlacement(placements[0], { x: 4, y: 5, width: 8, height: 200 }),
    ).toMatchObject({ x: 4, y: 5, width: 16, height: 200 });
    expect(rotateCanvasPlacement(placements[0], 450).rotation).toBe(90);
    expect(rotateCanvasPlacement(placements[0], -190).rotation).toBe(170);
  });

  it('aligns selected objects without moving unselected objects', () => {
    const aligned = alignCanvasPlacements(placements, ['a', 'b'], 'horizontal-center');

    expect(aligned[0].x + aligned[0].width / 2).toBe(140);
    expect(aligned[1].x + aligned[1].width / 2).toBe(140);
    expect(aligned[2]).toEqual(placements[2]);
  });

  it('distributes three or more objects by equal edge gaps', () => {
    const distributed = distributeCanvasPlacements(placements, ['a', 'b', 'c'], 'horizontal');

    const firstGap = distributed[1].x - (distributed[0].x + distributed[0].width);
    const secondGap = distributed[2].x - (distributed[1].x + distributed[1].width);
    expect(firstGap).toBe(secondGap);
  });

  it('reorders z values without changing geometry', () => {
    expect(
      reorderCanvasPlacement(placements, 'a', 'front').find((item) => item.blockId === 'a')?.z,
    ).toBe(4);
    expect(
      reorderCanvasPlacement(placements, 'c', 'backward').find((item) => item.blockId === 'c')?.z,
    ).toBe(2);
  });

  it('fails closed for unsupported geometry commands', () => {
    expect(() => alignCanvasPlacements(placements, ['a', 'b'], 'diagonal' as never)).toThrow(
      'alignment',
    );
    expect(() => distributeCanvasPlacements(placements, ['a', 'b', 'c'], 'depth' as never)).toThrow(
      'axis',
    );
    expect(() => reorderCanvasPlacement(placements, 'a', 'sideways' as never)).toThrow('z-order');
  });
});
