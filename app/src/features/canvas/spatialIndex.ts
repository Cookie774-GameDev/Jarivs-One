/**
 * Bounded spatial index and viewport-culling primitive for the Infinite Idea
 * Canvas.
 *
 * The index reasons entirely in world/document coordinates: it stores each
 * placement's axis-aligned world bounding box (derived from `x`, `y`, `width`,
 * `height`) and never stores or returns screen-space positions. Screen mapping
 * is the camera's responsibility; viewport queries convert a camera+viewport
 * into a world rectangle and query that rectangle.
 *
 * Design:
 * - A uniform hash grid buckets objects by the grid cells their bounding box
 *   overlaps, so small range/viewport queries touch only nearby cells instead
 *   of scanning every object.
 * - Insertion is bounded: an object whose footprint would exceed
 *   `maxCellsPerObject` cells is kept in a separate "oversized" set that is
 *   always considered as a candidate (then exactly filtered), so a single huge
 *   object can never explode the grid.
 * - Queries are bounded: a query spanning more than `MAX_QUERY_CELLS` cells
 *   falls back to a single full scan rather than iterating an unbounded number
 *   of cells.
 * - Results are deterministic: candidates are sorted back-to-front by
 *   ascending `z`, with ties broken by first-insertion order. Re-upserting an
 *   existing id preserves its first-insertion sequence, so ordering is stable
 *   across updates; removal followed by re-insertion assigns a fresh sequence.
 *
 * Every input is validated at this trust boundary and fails closed with a
 * `CanvasValidationError`, mirroring the conventions in `contracts.ts`.
 */
import {
  CANVAS_MAX_ZOOM,
  CANVAS_MIN_ZOOM,
  CanvasValidationError,
  type CanvasCamera,
  type CanvasSpatialPlacement,
  type CanvasValidationErrorCode,
} from './contracts';
import type { CanvasViewport, CanvasWorldBounds } from './camera';

// ---------------------------------------------------------------------------
// Bounds (mirror the domain contracts in contracts.ts)
// ---------------------------------------------------------------------------

const MAX_COORDINATE = 1_000_000_000;
const MAX_SIZE = 10_000_000;
const MAX_ROTATION = 360;

// Grid defaults and option bounds.
const DEFAULT_CELL_SIZE = 512;
const MIN_CELL_SIZE = 64;
const MAX_CELL_SIZE = 4096;
const DEFAULT_MAX_CELLS_PER_OBJECT = 4096;
const MIN_MAX_CELLS_PER_OBJECT = 1;
const MAX_MAX_CELLS_PER_OBJECT = 16384;

// A query spanning more cells than this falls back to a full scan.
const MAX_QUERY_CELLS = 16384;

// ---------------------------------------------------------------------------
// Validation helpers (mirror contracts.ts; fail closed)
// ---------------------------------------------------------------------------

function fail(code: CanvasValidationErrorCode, path: string, message: string): never {
  throw new CanvasValidationError(code, path, message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface FiniteNumberBounds {
  readonly min?: number;
  readonly max?: number;
  readonly exclusiveMin?: boolean;
}

function assertFiniteNumber(value: unknown, path: string, bounds: FiniteNumberBounds = {}): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('invalid-number', path, 'expected a finite number');
  }
  const { min, max, exclusiveMin } = bounds;
  if (min !== undefined && (exclusiveMin ? value <= min : value < min)) {
    fail('invalid-number', path, 'value below the allowed minimum');
  }
  if (max !== undefined && value > max) {
    fail('invalid-number', path, 'value above the allowed maximum');
  }
  return value;
}

function assertSafeInteger(
  value: unknown,
  path: string,
  bounds: { readonly min?: number; readonly max?: number } = {},
): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    fail('invalid-number', path, 'expected a safe integer');
  }
  if (bounds.min !== undefined && value < bounds.min) {
    fail('invalid-number', path, `value must be >= ${bounds.min}`);
  }
  if (bounds.max !== undefined && value > bounds.max) {
    fail('invalid-number', path, `value must be <= ${bounds.max}`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CanvasSpatialIndexOptions {
  /** Grid cell size in world units. Defaults to 512; bounded to [64, 4096]. */
  readonly cellSize?: number;
  /**
   * Maximum grid cells an object may occupy before it is treated as oversized
   * and scanned directly. Defaults to 4096; bounded to [1, 16384].
   */
  readonly maxCellsPerObject?: number;
}

export interface CanvasSpatialIndex {
  /** Number of indexed placements. */
  readonly size: number;
  /** Inserts a placement, or updates it in place when its blockId exists. */
  upsert(placement: CanvasSpatialPlacement): void;
  /** Removes a placement. Returns true when something was removed. */
  remove(blockId: string): boolean;
  /** Returns the stored world-space placement for an id, if present. */
  get(blockId: string): CanvasSpatialPlacement | undefined;
  /** Whether an id is indexed. */
  has(blockId: string): boolean;
  /** Removes every placement. */
  clear(): void;
  /**
   * Returns placements whose world bounding box intersects `rect` (inclusive
   * edges), sorted back-to-front by ascending `z` then first-insertion order.
   */
  queryRange(rect: CanvasWorldBounds): readonly CanvasSpatialPlacement[];
  /**
   * Converts a camera+viewport into its visible world rectangle and returns the
   * intersecting placements in the same stable z-order as `queryRange`.
   */
  queryViewport(camera: CanvasCamera, viewport: CanvasViewport): readonly CanvasSpatialPlacement[];
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface IndexEntry {
  readonly placement: CanvasSpatialPlacement;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  /** First-insertion sequence; stable tie-break for equal `z`. */
  readonly seq: number;
  /** True when stored in the oversized set instead of grid buckets. */
  readonly oversized: boolean;
}

interface CellRange {
  readonly minCx: number;
  readonly maxCx: number;
  readonly minCy: number;
  readonly maxCy: number;
}

function intersects(
  entry: IndexEntry,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): boolean {
  return entry.minX <= maxX && entry.maxX >= minX && entry.minY <= maxY && entry.maxY >= minY;
}

export function createCanvasSpatialIndex(
  options: CanvasSpatialIndexOptions = {},
): CanvasSpatialIndex {
  const cellSize =
    options.cellSize === undefined
      ? DEFAULT_CELL_SIZE
      : assertFiniteNumber(options.cellSize, 'options.cellSize', {
          min: MIN_CELL_SIZE,
          max: MAX_CELL_SIZE,
        });
  const maxCellsPerObject =
    options.maxCellsPerObject === undefined
      ? DEFAULT_MAX_CELLS_PER_OBJECT
      : assertSafeInteger(options.maxCellsPerObject, 'options.maxCellsPerObject', {
          min: MIN_MAX_CELLS_PER_OBJECT,
          max: MAX_MAX_CELLS_PER_OBJECT,
        });

  const entries = new Map<string, IndexEntry>();
  const buckets = new Map<string, Set<string>>();
  const oversizedIds = new Set<string>();
  let nextSeq = 0;

  const cellKey = (cx: number, cy: number): string => `${cx}:${cy}`;

  const rangeOf = (minX: number, minY: number, maxX: number, maxY: number): CellRange => ({
    minCx: Math.floor(minX / cellSize),
    maxCx: Math.floor(maxX / cellSize),
    minCy: Math.floor(minY / cellSize),
    maxCy: Math.floor(maxY / cellSize),
  });

  const cellCount = (range: CellRange): number =>
    (range.maxCx - range.minCx + 1) * (range.maxCy - range.minCy + 1);

  const addToBuckets = (blockId: string, range: CellRange): void => {
    for (let cx = range.minCx; cx <= range.maxCx; cx += 1) {
      for (let cy = range.minCy; cy <= range.maxCy; cy += 1) {
        const key = cellKey(cx, cy);
        let bucket = buckets.get(key);
        if (bucket === undefined) {
          bucket = new Set<string>();
          buckets.set(key, bucket);
        }
        bucket.add(blockId);
      }
    }
  };

  const removeFromBuckets = (blockId: string, range: CellRange): void => {
    for (let cx = range.minCx; cx <= range.maxCx; cx += 1) {
      for (let cy = range.minCy; cy <= range.maxCy; cy += 1) {
        const key = cellKey(cx, cy);
        const bucket = buckets.get(key);
        if (bucket === undefined) {
          continue;
        }
        bucket.delete(blockId);
        if (bucket.size === 0) {
          buckets.delete(key);
        }
      }
    }
  };

  const detach = (blockId: string, entry: IndexEntry): void => {
    if (entry.oversized) {
      oversizedIds.delete(blockId);
    } else {
      removeFromBuckets(blockId, rangeOf(entry.minX, entry.minY, entry.maxX, entry.maxY));
    }
  };

  const validatePlacement = (
    placement: unknown,
  ): { blockId: string; minX: number; minY: number; maxX: number; maxY: number } => {
    if (!isPlainObject(placement)) {
      fail('invalid-type', 'placement', 'expected a placement object');
    }
    const blockId = placement.blockId;
    if (typeof blockId !== 'string' || blockId.length === 0) {
      fail('invalid-id', 'placement.blockId', 'expected a non-empty block id');
    }
    const x = assertFiniteNumber(placement.x, 'placement.x', {
      min: -MAX_COORDINATE,
      max: MAX_COORDINATE,
    });
    const y = assertFiniteNumber(placement.y, 'placement.y', {
      min: -MAX_COORDINATE,
      max: MAX_COORDINATE,
    });
    const width = assertFiniteNumber(placement.width, 'placement.width', {
      min: 0,
      exclusiveMin: true,
      max: MAX_SIZE,
    });
    const height = assertFiniteNumber(placement.height, 'placement.height', {
      min: 0,
      exclusiveMin: true,
      max: MAX_SIZE,
    });
    assertFiniteNumber(placement.rotation, 'placement.rotation', {
      min: -MAX_ROTATION,
      max: MAX_ROTATION,
    });
    assertSafeInteger(placement.z, 'placement.z');
    return { blockId, minX: x, minY: y, maxX: x + width, maxY: y + height };
  };

  const validateRect = (rect: unknown): { x: number; y: number; width: number; height: number } => {
    if (!isPlainObject(rect)) {
      fail('invalid-type', 'query', 'expected a rectangle object');
    }
    const x = assertFiniteNumber(rect.x, 'query.x');
    const y = assertFiniteNumber(rect.y, 'query.y');
    const width = assertFiniteNumber(rect.width, 'query.width', { min: 0 });
    const height = assertFiniteNumber(rect.height, 'query.height', { min: 0 });
    if (!Number.isFinite(x + width)) {
      fail('invalid-number', 'query.width', 'rectangle exceeds finite bounds');
    }
    if (!Number.isFinite(y + height)) {
      fail('invalid-number', 'query.height', 'rectangle exceeds finite bounds');
    }
    return { x, y, width, height };
  };

  const upsert = (placement: CanvasSpatialPlacement): void => {
    const validated = validatePlacement(placement);
    const { blockId, minX, minY, maxX, maxY } = validated;

    const existing = entries.get(blockId);
    const seq = existing === undefined ? nextSeq++ : existing.seq;
    if (existing !== undefined) {
      detach(blockId, existing);
    }

    const range = rangeOf(minX, minY, maxX, maxY);
    const oversized = cellCount(range) > maxCellsPerObject;
    const entry: IndexEntry = { placement, minX, minY, maxX, maxY, seq, oversized };
    entries.set(blockId, entry);
    if (oversized) {
      oversizedIds.add(blockId);
    } else {
      addToBuckets(blockId, range);
    }
  };

  const remove = (blockId: string): boolean => {
    const entry = entries.get(blockId);
    if (entry === undefined) {
      return false;
    }
    detach(blockId, entry);
    entries.delete(blockId);
    return true;
  };

  const queryRange = (rect: CanvasWorldBounds): readonly CanvasSpatialPlacement[] => {
    const validated = validateRect(rect);
    const minX = validated.x;
    const minY = validated.y;
    const maxX = validated.x + validated.width;
    const maxY = validated.y + validated.height;

    const range = rangeOf(minX, minY, maxX, maxY);
    const candidates: IndexEntry[] = [];

    if (cellCount(range) <= MAX_QUERY_CELLS) {
      const seen = new Set<string>();
      for (let cx = range.minCx; cx <= range.maxCx; cx += 1) {
        for (let cy = range.minCy; cy <= range.maxCy; cy += 1) {
          const bucket = buckets.get(cellKey(cx, cy));
          if (bucket === undefined) {
            continue;
          }
          for (const id of bucket) {
            if (seen.has(id)) {
              continue;
            }
            seen.add(id);
            const entry = entries.get(id);
            if (entry !== undefined) {
              candidates.push(entry);
            }
          }
        }
      }
      for (const id of oversizedIds) {
        if (seen.has(id)) {
          continue;
        }
        seen.add(id);
        const entry = entries.get(id);
        if (entry !== undefined) {
          candidates.push(entry);
        }
      }
    } else {
      for (const entry of entries.values()) {
        candidates.push(entry);
      }
    }

    const matches = candidates.filter((entry) => intersects(entry, minX, minY, maxX, maxY));
    matches.sort((a, b) => a.placement.z - b.placement.z || a.seq - b.seq);
    return Object.freeze(matches.map((entry) => entry.placement));
  };

  const queryViewport = (
    camera: CanvasCamera,
    viewport: CanvasViewport,
  ): readonly CanvasSpatialPlacement[] => {
    if (!isPlainObject(camera)) {
      fail('invalid-type', 'camera', 'expected a camera object');
    }
    const cameraX = assertFiniteNumber(camera.x, 'camera.x', {
      min: -MAX_COORDINATE,
      max: MAX_COORDINATE,
    });
    const cameraY = assertFiniteNumber(camera.y, 'camera.y', {
      min: -MAX_COORDINATE,
      max: MAX_COORDINATE,
    });
    const zoom = assertFiniteNumber(camera.zoom, 'camera.zoom', {
      min: CANVAS_MIN_ZOOM,
      max: CANVAS_MAX_ZOOM,
    });
    if (!isPlainObject(viewport)) {
      fail('invalid-type', 'viewport', 'expected a viewport object');
    }
    const viewportWidth = assertFiniteNumber(viewport.width, 'viewport.width', {
      min: 0,
      exclusiveMin: true,
    });
    const viewportHeight = assertFiniteNumber(viewport.height, 'viewport.height', {
      min: 0,
      exclusiveMin: true,
    });

    // Visible world rectangle: the camera is centered at (cameraX, cameraY) and
    // zoom is the world-to-screen scale, so the world span is viewport / zoom.
    const halfWidth = viewportWidth / (2 * zoom);
    const halfHeight = viewportHeight / (2 * zoom);
    return queryRange({
      x: cameraX - halfWidth,
      y: cameraY - halfHeight,
      width: 2 * halfWidth,
      height: 2 * halfHeight,
    });
  };

  return Object.freeze({
    get size(): number {
      return entries.size;
    },
    upsert,
    remove,
    get(blockId: string): CanvasSpatialPlacement | undefined {
      return entries.get(blockId)?.placement;
    },
    has(blockId: string): boolean {
      return entries.has(blockId);
    },
    clear(): void {
      entries.clear();
      buckets.clear();
      oversizedIds.clear();
      nextSeq = 0;
    },
    queryRange,
    queryViewport,
  });
}
