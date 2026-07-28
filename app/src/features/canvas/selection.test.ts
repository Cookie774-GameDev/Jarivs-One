import { describe, expect, it } from 'vitest';
import {
  createCanvasSelection,
  lassoSelect,
  marqueeSelect,
  selectAllCanvasBlocks,
  selectCanvasBlock,
  selectionHas,
  type CanvasSelectableBounds,
} from './selection';

const objects: readonly CanvasSelectableBounds[] = [
  { id: 'back', x: 0, y: 0, width: 100, height: 100, z: 1 },
  { id: 'front', x: 50, y: 50, width: 100, height: 100, z: 2 },
  { id: 'outside', x: 300, y: 300, width: 50, height: 50, z: 3 },
];

describe('canvas selection', () => {
  it('selects one block and toggles additive selections deterministically', () => {
    const one = selectCanvasBlock(createCanvasSelection(), 'back');
    const two = selectCanvasBlock(one, 'front', true);
    const toggled = selectCanvasBlock(two, 'back', true);

    expect(one.ids).toEqual(['back']);
    expect(two.ids).toEqual(['back', 'front']);
    expect(toggled.ids).toEqual(['front']);
  });

  it('deduplicates and preserves the supplied block order for select all', () => {
    const selection = selectAllCanvasBlocks(['front', 'back', 'front', 'outside']);

    expect(selection.ids).toEqual(['front', 'back', 'outside']);
    expect(selectionHas(selection, 'back')).toBe(true);
  });

  it('selects intersecting objects with a marquee dragged in either direction', () => {
    const forward = marqueeSelect(objects, { x: 25, y: 25 }, { x: 125, y: 125 }, 'intersect');
    const reverse = marqueeSelect(objects, { x: 125, y: 125 }, { x: 25, y: 25 }, 'intersect');

    expect(forward.ids).toEqual(['back', 'front']);
    expect(reverse).toEqual(forward);
  });

  it('supports containment selection and rejects non-finite marquee coordinates', () => {
    expect(marqueeSelect(objects, { x: -1, y: -1 }, { x: 151, y: 151 }, 'contain').ids).toEqual([
      'back',
      'front',
    ]);
    expect(() =>
      marqueeSelect(objects, { x: Number.NaN, y: 0 }, { x: 1, y: 1 }, 'intersect'),
    ).toThrow('finite');
  });

  it('selects object centers inside a freeform lasso in either winding direction', () => {
    const polygon = [
      { x: -10, y: -10 },
      { x: 80, y: -10 },
      { x: 80, y: 80 },
      { x: -10, y: 80 },
    ];

    expect(lassoSelect(objects, polygon).ids).toEqual(['back']);
    expect(lassoSelect(objects, [...polygon].reverse()).ids).toEqual(['back']);
    expect(() => lassoSelect(objects, polygon.slice(0, 2))).toThrow('three points');
    expect(() => lassoSelect(objects, [{ x: Number.NaN, y: 0 }, ...polygon])).toThrow('finite');
  });
});
