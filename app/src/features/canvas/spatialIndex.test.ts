import { describe, expect, it } from 'vitest';
import {
  CanvasValidationError,
  type CanvasBlockId,
  type CanvasSpatialPlacement,
  type CanvasValidationErrorCode,
} from './contracts';
import type { CanvasViewport } from './camera';
import { createCanvasSpatialIndex } from './spatialIndex';

interface WorldRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Build a valid, frozen world-space placement for tests. */
function placement(
  blockId: string,
  overrides: Partial<Omit<CanvasSpatialPlacement, 'blockId'>> = {},
): CanvasSpatialPlacement {
  return Object.freeze({
    blockId: blockId as CanvasBlockId,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    z: 0,
    locked: false,
    hidden: false,
    ...overrides,
  });
}

/** Force an invalid value through the typed boundary to exercise runtime validation. */
function invalid(value: unknown): CanvasSpatialPlacement {
  return value as CanvasSpatialPlacement;
}

function catchValidationError(fn: () => void): CanvasValidationError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(CanvasValidationError);
    return error as CanvasValidationError;
  }
  throw new Error('expected a CanvasValidationError to be thrown');
}

function expectCode(fn: () => void, code: CanvasValidationErrorCode): void {
  expect(catchValidationError(fn).code).toBe(code);
}

/** Inclusive AABB intersection reference, mirroring the documented semantics. */
function bruteIntersects(p: CanvasSpatialPlacement, rect: WorldRect): boolean {
  return (
    p.x <= rect.x + rect.width &&
    p.x + p.width >= rect.x &&
    p.y <= rect.y + rect.height &&
    p.y + p.height >= rect.y
  );
}

/**
 * Reference ordering: back-to-front by ascending z, ties broken by first-insertion
 * order. `insertion` must be each placement's original insertion sequence.
 */
function expectedZOrder(
  source: readonly { readonly p: CanvasSpatialPlacement; readonly insertion: number }[],
  rect: WorldRect,
): string[] {
  return source
    .filter(({ p }) => bruteIntersects(p, rect))
    .sort((u, v) => u.p.z - v.p.z || u.insertion - v.insertion)
    .map(({ p }) => p.blockId);
}

describe('canvas spatial index', () => {
  describe('insertion and lookup', () => {
    it('inserts a placement and reports size, has, and get', () => {
      const index = createCanvasSpatialIndex();
      const a = placement('a', { x: 10, y: 20 });

      index.upsert(a);

      expect(index.size).toBe(1);
      expect(index.has('a')).toBe(true);
      expect(index.get('a')).toBe(a);
    });

    it('returns undefined and false for unknown ids', () => {
      const index = createCanvasSpatialIndex();
      expect(index.size).toBe(0);
      expect(index.has('missing')).toBe(false);
      expect(index.get('missing')).toBeUndefined();
    });

    it('preserves world-space geometry and never stores screen-space coordinates', () => {
      const index = createCanvasSpatialIndex();
      const a = placement('a', { x: 1000, y: 2000, width: 50, height: 60 });

      index.upsert(a);

      // The stored placement is the exact world-space object: no transform applied.
      expect(index.get('a')).toBe(a);
      expect(index.get('a')).toMatchObject({ x: 1000, y: 2000, width: 50, height: 60 });

      // A camera centered on the world point finds it, confirming world-space indexing.
      const hits = index.queryViewport({ x: 1025, y: 2030, zoom: 1 }, { width: 200, height: 200 });
      expect(hits).toEqual([a]);
    });

    it('clears all entries', () => {
      const index = createCanvasSpatialIndex();
      index.upsert(placement('a'));
      index.upsert(placement('b'));
      index.clear();
      expect(index.size).toBe(0);
      expect(index.has('a')).toBe(false);
      expect(index.queryRange({ x: -1e6, y: -1e6, width: 2e6, height: 2e6 })).toEqual([]);
    });
  });

  describe('geometry validation (fail closed)', () => {
    it.each([
      ['x is NaN', placement('a', { x: Number.NaN })],
      ['y is +Infinity', placement('a', { y: Number.POSITIVE_INFINITY })],
      ['width is NaN', placement('a', { width: Number.NaN })],
      ['height is -Infinity', placement('a', { height: Number.NEGATIVE_INFINITY })],
      ['rotation is NaN', placement('a', { rotation: Number.NaN })],
    ])('rejects non-finite geometry when %s', (_label, bad) => {
      const index = createCanvasSpatialIndex();
      expectCode(() => index.upsert(bad), 'invalid-number');
      expect(index.size).toBe(0);
    });

    it.each([
      ['zero width', placement('a', { width: 0 })],
      ['negative width', placement('a', { width: -1 })],
      ['zero height', placement('a', { height: 0 })],
      ['negative height', placement('a', { height: -10 })],
    ])('rejects non-positive size when %s', (_label, bad) => {
      const index = createCanvasSpatialIndex();
      expectCode(() => index.upsert(bad), 'invalid-number');
    });

    it('rejects coordinates beyond the bounded world', () => {
      const index = createCanvasSpatialIndex();
      expectCode(() => index.upsert(placement('a', { x: 1_000_000_001 })), 'invalid-number');
      expectCode(() => index.upsert(placement('a', { y: -1_000_000_001 })), 'invalid-number');
      // The boundary itself is allowed.
      index.upsert(placement('ok', { x: 1_000_000_000, y: -1_000_000_000 }));
      expect(index.size).toBe(1);
    });

    it('rejects oversized extents that would overflow world bounds', () => {
      const index = createCanvasSpatialIndex();
      expectCode(() => index.upsert(placement('a', { width: 10_000_001 })), 'invalid-number');
      expectCode(() => index.upsert(placement('a', { height: 10_000_001 })), 'invalid-number');
    });

    it('rejects a non-safe-integer z', () => {
      const index = createCanvasSpatialIndex();
      expectCode(() => index.upsert(placement('a', { z: 1.5 })), 'invalid-number');
      expectCode(() => index.upsert(placement('a', { z: Number.NaN })), 'invalid-number');
    });

    it('rejects an empty or non-string blockId', () => {
      const index = createCanvasSpatialIndex();
      expectCode(() => index.upsert(placement('')), 'invalid-id');
      expectCode(() => index.upsert(invalid({ ...placement('a'), blockId: 42 })), 'invalid-id');
    });

    it('rejects a non-object placement', () => {
      const index = createCanvasSpatialIndex();
      expectCode(() => index.upsert(invalid(null)), 'invalid-type');
      expectCode(() => index.upsert(invalid(undefined)), 'invalid-type');
    });
  });

  describe('update', () => {
    it('upserting an existing id updates geometry without growing size', () => {
      const index = createCanvasSpatialIndex();
      index.upsert(placement('a', { x: 0, y: 0 }));
      const moved = placement('a', { x: 5000, y: 5000 });

      index.upsert(moved);

      expect(index.size).toBe(1);
      expect(index.get('a')).toBe(moved);
    });

    it('moving an object updates range-query membership', () => {
      const index = createCanvasSpatialIndex();
      index.upsert(placement('a', { x: 0, y: 0, width: 10, height: 10 }));
      const origin = { x: -5, y: -5, width: 20, height: 20 };
      const far = { x: 5000, y: 5000, width: 20, height: 20 };

      expect(index.queryRange(origin).map((p) => p.blockId)).toEqual(['a']);
      expect(index.queryRange(far)).toEqual([]);

      index.upsert(placement('a', { x: 5005, y: 5005, width: 10, height: 10 }));

      expect(index.queryRange(origin)).toEqual([]);
      expect(index.queryRange(far).map((p) => p.blockId)).toEqual(['a']);
    });
  });

  describe('removal', () => {
    it('removes an existing placement and reports true', () => {
      const index = createCanvasSpatialIndex();
      index.upsert(placement('a', { x: 0, y: 0 }));

      expect(index.remove('a')).toBe(true);
      expect(index.size).toBe(0);
      expect(index.has('a')).toBe(false);
      expect(index.get('a')).toBeUndefined();
      expect(index.queryRange({ x: -100, y: -100, width: 200, height: 200 })).toEqual([]);
    });

    it('returns false when removing an unknown id', () => {
      const index = createCanvasSpatialIndex();
      expect(index.remove('nope')).toBe(false);
    });
  });

  describe('range queries', () => {
    it('returns intersecting objects and excludes distant ones', () => {
      const index = createCanvasSpatialIndex();
      const inside = placement('inside', { x: 10, y: 10, width: 20, height: 20 });
      const outside = placement('outside', { x: 1000, y: 1000, width: 20, height: 20 });
      index.upsert(inside);
      index.upsert(outside);

      const hits = index.queryRange({ x: 0, y: 0, width: 100, height: 100 });
      expect(hits).toEqual([inside]);
    });

    it('treats touching edges as intersecting (inclusive bounds)', () => {
      const index = createCanvasSpatialIndex();
      // Right edge of object at x=100 exactly meets the left edge of the query rect.
      index.upsert(placement('edge', { x: 50, y: 0, width: 50, height: 10 }));

      expect(
        index.queryRange({ x: 100, y: 0, width: 10, height: 10 }).map((p) => p.blockId),
      ).toEqual(['edge']);
      // Strictly disjoint by one unit: no intersection.
      expect(index.queryRange({ x: 101, y: 0, width: 10, height: 10 })).toEqual([]);
    });

    it('matches a zero-area point query against containing objects', () => {
      const index = createCanvasSpatialIndex();
      index.upsert(placement('box', { x: 0, y: 0, width: 100, height: 100 }));

      expect(index.queryRange({ x: 50, y: 50, width: 0, height: 0 }).map((p) => p.blockId)).toEqual(
        ['box'],
      );
      expect(
        index.queryRange({ x: 100, y: 100, width: 0, height: 0 }).map((p) => p.blockId),
      ).toEqual(['box']);
      expect(index.queryRange({ x: 101, y: 50, width: 0, height: 0 })).toEqual([]);
    });

    it('returns a frozen result array', () => {
      const index = createCanvasSpatialIndex();
      index.upsert(placement('a'));
      const hits = index.queryRange({ x: -10, y: -10, width: 200, height: 200 });
      expect(Object.isFrozen(hits)).toBe(true);
    });

    it('rejects an invalid query rectangle', () => {
      const index = createCanvasSpatialIndex();
      expectCode(
        () => index.queryRange({ x: Number.NaN, y: 0, width: 10, height: 10 }),
        'invalid-number',
      );
      expectCode(() => index.queryRange({ x: 0, y: 0, width: -1, height: 10 }), 'invalid-number');
      expectCode(
        () => index.queryRange({ x: 0, y: 0, width: 10, height: Number.POSITIVE_INFINITY }),
        'invalid-number',
      );
    });
  });

  describe('viewport queries', () => {
    const viewport: CanvasViewport = { width: 1200, height: 800 };

    it('derives the visible world rectangle from camera center and zoom', () => {
      const index = createCanvasSpatialIndex();
      // Camera centered at world (0,0), zoom 1, viewport 1200x800 => visible world
      // rect is x in [-600,600], y in [-400,400].
      const visible = placement('visible', { x: 500, y: 300, width: 50, height: 50 });
      const hidden = placement('hidden', { x: 700, y: 300, width: 50, height: 50 });
      index.upsert(visible);
      index.upsert(hidden);

      const hits = index.queryViewport({ x: 0, y: 0, zoom: 1 }, viewport);
      expect(hits).toEqual([visible]);
    });

    it('higher zoom narrows the visible world rectangle', () => {
      const index = createCanvasSpatialIndex();
      index.upsert(placement('near', { x: 250, y: 0, width: 20, height: 20 }));

      // zoom 1 sees x in [-600,600] => includes x=250.
      expect(index.queryViewport({ x: 0, y: 0, zoom: 1 }, viewport).map((p) => p.blockId)).toEqual([
        'near',
      ]);
      // zoom 8 sees x in [-75,75] => excludes x=250.
      expect(index.queryViewport({ x: 0, y: 0, zoom: 8 }, viewport)).toEqual([]);
    });

    it('returns world-space placements, not screen coordinates', () => {
      const index = createCanvasSpatialIndex();
      const a = placement('a', { x: 10, y: 10, width: 20, height: 20 });
      index.upsert(a);
      const hits = index.queryViewport({ x: 0, y: 0, zoom: 4 }, viewport);
      expect(hits).toEqual([a]);
      expect(hits[0]).toMatchObject({ x: 10, y: 10 });
    });

    it('rejects invalid camera and viewport values', () => {
      const index = createCanvasSpatialIndex();
      expectCode(
        () => index.queryViewport({ x: Number.NaN, y: 0, zoom: 1 }, viewport),
        'invalid-number',
      );
      expectCode(() => index.queryViewport({ x: 0, y: 0, zoom: 0 }, viewport), 'invalid-number');
      expectCode(() => index.queryViewport({ x: 0, y: 0, zoom: 33 }, viewport), 'invalid-number');
      expectCode(
        () => index.queryViewport({ x: 0, y: 0, zoom: 1 }, { width: 0, height: 800 }),
        'invalid-number',
      );
      expectCode(
        () => index.queryViewport({ x: 0, y: 0, zoom: 1 }, { width: 1200, height: -1 }),
        'invalid-number',
      );
    });
  });

  describe('z-order stability', () => {
    it('sorts results back-to-front by ascending z', () => {
      const index = createCanvasSpatialIndex();
      const back = placement('back', { x: 0, y: 0, z: 0 });
      const mid = placement('mid', { x: 0, y: 0, z: 5 });
      const front = placement('front', { x: 0, y: 0, z: 10 });
      // Insert out of order to prove sorting is by z, not insertion order.
      index.upsert(front);
      index.upsert(back);
      index.upsert(mid);

      const hits = index.queryRange({ x: -10, y: -10, width: 200, height: 200 });
      expect(hits.map((p) => p.blockId)).toEqual(['back', 'mid', 'front']);
    });

    it('breaks z ties by first-insertion order and stays stable across updates', () => {
      const index = createCanvasSpatialIndex();
      index.upsert(placement('a', { z: 0 }));
      index.upsert(placement('b', { z: 0 }));
      index.upsert(placement('c', { z: 0 }));

      const rect = { x: -10, y: -10, width: 200, height: 200 };
      expect(index.queryRange(rect).map((p) => p.blockId)).toEqual(['a', 'b', 'c']);

      // Re-upserting an existing id keeps its first-insertion tie-break position.
      index.upsert(placement('a', { z: 0, x: 5 }));
      expect(index.queryRange(rect).map((p) => p.blockId)).toEqual(['a', 'b', 'c']);

      // Repeated identical queries return identical ordering.
      const first = index.queryRange(rect).map((p) => p.blockId);
      const second = index.queryRange(rect).map((p) => p.blockId);
      expect(second).toEqual(first);
    });

    it('assigns fresh insertion order after removal and re-insertion', () => {
      const index = createCanvasSpatialIndex();
      index.upsert(placement('a', { z: 0 }));
      index.upsert(placement('b', { z: 0 }));
      index.remove('a');
      index.upsert(placement('a', { z: 0 }));

      const rect = { x: -10, y: -10, width: 200, height: 200 };
      // 'a' was re-inserted after 'b', so it now sorts after 'b'.
      expect(index.queryRange(rect).map((p) => p.blockId)).toEqual(['b', 'a']);
    });
  });

  describe('options validation', () => {
    it('rejects out-of-bounds cell options', () => {
      expectCode(() => createCanvasSpatialIndex({ cellSize: 0 }), 'invalid-number');
      expectCode(() => createCanvasSpatialIndex({ cellSize: Number.NaN }), 'invalid-number');
      expectCode(() => createCanvasSpatialIndex({ maxCellsPerObject: 0 }), 'invalid-number');
    });

    it('accepts valid custom options', () => {
      const index = createCanvasSpatialIndex({ cellSize: 128, maxCellsPerObject: 256 });
      index.upsert(placement('a', { x: 0, y: 0 }));
      expect(
        index.queryRange({ x: -10, y: -10, width: 200, height: 200 }).map((p) => p.blockId),
      ).toEqual(['a']);
    });
  });

  describe('large fixture (thousands of objects)', () => {
    const COLS = 100;
    const ROWS = 50;
    const COUNT = COLS * ROWS; // 5000
    const BLOCK_W = 280;
    const BLOCK_H = 180;
    const GAP_X = 48;
    const GAP_Y = 48;

    function buildFixture(): {
      index: ReturnType<typeof createCanvasSpatialIndex>;
      source: { readonly p: CanvasSpatialPlacement; readonly insertion: number }[];
    } {
      const index = createCanvasSpatialIndex();
      const source: { p: CanvasSpatialPlacement; insertion: number }[] = [];
      let i = 0;
      for (let row = 0; row < ROWS; row += 1) {
        for (let col = 0; col < COLS; col += 1) {
          const p = placement(`block-${i}`, {
            x: col * (BLOCK_W + GAP_X),
            y: row * (BLOCK_H + GAP_Y),
            width: BLOCK_W,
            height: BLOCK_H,
            z: i % 7,
          });
          source.push({ p, insertion: i });
          index.upsert(p);
          i += 1;
        }
      }
      return { index, source };
    }

    it('indexes thousands of objects and matches a brute-force reference', () => {
      const { index, source } = buildFixture();
      expect(index.size).toBe(COUNT);

      const queries: WorldRect[] = [
        { x: 0, y: 0, width: 1200, height: 800 },
        { x: 5000, y: 3000, width: 2000, height: 1500 },
        { x: 30000, y: 10000, width: 3000, height: 2000 },
        { x: -500, y: -500, width: 1000, height: 1000 },
        { x: 999999, y: 999999, width: 100, height: 100 },
      ];

      for (const rect of queries) {
        expect(index.queryRange(rect).map((p) => p.blockId)).toEqual(expectedZOrder(source, rect));
      }
    });

    it('keeps small-viewport queries cheap and correct at scale', () => {
      const { index, source } = buildFixture();
      const viewport: CanvasViewport = { width: 1200, height: 800 };

      // Correctness for a small viewport against the brute-force reference.
      const camera = { x: 5000, y: 3000, zoom: 1 };
      const worldRect: WorldRect = {
        x: camera.x - viewport.width / 2,
        y: camera.y - viewport.height / 2,
        width: viewport.width,
        height: viewport.height,
      };
      const hits = index.queryViewport(camera, viewport);
      expect(hits.map((p) => p.blockId)).toEqual(expectedZOrder(source, worldRect));
      // A small viewport sees far fewer than the full population.
      expect(hits.length).toBeGreaterThan(0);
      expect(hits.length).toBeLessThan(100);

      // Performance sanity: many small queries over 5000 objects stay well bounded.
      const iterations = 500;
      const start = performance.now();
      let total = 0;
      for (let k = 0; k < iterations; k += 1) {
        const cx = (k * 137) % 32000;
        const cy = (k * 211) % 11000;
        total += index.queryViewport({ x: cx, y: cy, zoom: 1 }, viewport).length;
      }
      const elapsed = performance.now() - start;
      expect(total).toBeGreaterThanOrEqual(0);
      // Generous, non-flaky upper bound for 500 small queries over 5000 objects.
      expect(elapsed).toBeLessThan(5000);
    });

    it('reflects large-scale removals correctly', () => {
      const { index, source } = buildFixture();
      // Remove every other object (even insertion indices).
      for (const { p, insertion } of source) {
        if (insertion % 2 === 0) {
          expect(index.remove(p.blockId)).toBe(true);
        }
      }
      expect(index.size).toBe(COUNT / 2);

      const remaining = source.filter(({ insertion }) => insertion % 2 === 1);
      const rect: WorldRect = { x: 0, y: 0, width: 8000, height: 5000 };
      expect(index.queryRange(rect).map((p) => p.blockId)).toEqual(expectedZOrder(remaining, rect));
    });
  });
});
