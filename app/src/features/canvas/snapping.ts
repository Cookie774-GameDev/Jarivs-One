import type { CanvasSpatialPlacement } from './contracts';

export const CANVAS_SNAP_THRESHOLD_PX = 8;
export const CANVAS_GRID_SIZE = 24;

export interface CanvasSnapBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CanvasSnapGuide {
  readonly axis: 'x' | 'y';
  readonly position: number;
  readonly start: number;
  readonly end: number;
  readonly source: 'object' | 'grid';
  readonly targetId: string | null;
}

export interface CanvasDragSnapInput {
  readonly movingBounds: CanvasSnapBounds;
  readonly delta: Readonly<{ x: number; y: number }>;
  readonly targets: readonly CanvasSpatialPlacement[];
  readonly threshold: number;
  readonly gridSize: number | null;
}

export interface CanvasDragSnapResult {
  readonly delta: Readonly<{ x: number; y: number }>;
  readonly guides: readonly CanvasSnapGuide[];
}

interface ObjectSnapCandidate {
  readonly adjustment: number;
  readonly distance: number;
  readonly position: number;
  readonly target: CanvasSpatialPlacement;
  readonly targetAnchor: number;
  readonly movingAnchor: number;
}

function finite(value: number, path: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${path} must be finite`);
  }
  return value;
}

function assertBounds(bounds: CanvasSnapBounds, path: string): CanvasSnapBounds {
  const x = finite(bounds.x, `${path}.x`);
  const y = finite(bounds.y, `${path}.y`);
  const width = finite(bounds.width, `${path}.width`);
  const height = finite(bounds.height, `${path}.height`);
  if (width <= 0 || height <= 0) {
    throw new RangeError(`${path} dimensions must be positive`);
  }
  return { x, y, width, height };
}

function anchorPositions(start: number, size: number): readonly number[] {
  return [start, start + size / 2, start + size];
}

function candidatePrecedes(left: ObjectSnapCandidate, right: ObjectSnapCandidate): boolean {
  const comparison =
    left.distance - right.distance ||
    left.target.blockId.localeCompare(right.target.blockId) ||
    left.position - right.position ||
    left.targetAnchor - right.targetAnchor ||
    left.movingAnchor - right.movingAnchor;
  return comparison < 0;
}

function bestObjectCandidate(
  movingStart: number,
  movingSize: number,
  targets: readonly CanvasSpatialPlacement[],
  axis: 'x' | 'y',
  threshold: number,
): ObjectSnapCandidate | null {
  const movingAnchors = anchorPositions(movingStart, movingSize);
  let best: ObjectSnapCandidate | null = null;

  for (const target of targets) {
    if (target.hidden) continue;
    const targetStart = axis === 'x' ? target.x : target.y;
    const targetSize = axis === 'x' ? target.width : target.height;
    const targetAnchors = anchorPositions(targetStart, targetSize);
    for (let movingAnchor = 0; movingAnchor < movingAnchors.length; movingAnchor += 1) {
      for (let targetAnchor = 0; targetAnchor < targetAnchors.length; targetAnchor += 1) {
        const adjustment = targetAnchors[targetAnchor] - movingAnchors[movingAnchor];
        const distance = Math.abs(adjustment);
        if (distance <= threshold) {
          const candidate = {
            adjustment,
            distance,
            position: targetAnchors[targetAnchor],
            target,
            targetAnchor,
            movingAnchor,
          };
          if (best === null || candidatePrecedes(candidate, best)) {
            best = candidate;
          }
        }
      }
    }
  }

  return best;
}

function nearestGridLine(value: number, gridSize: number): number {
  const lower = Math.floor(value / gridSize) * gridSize;
  const upper = lower + gridSize;
  return value - lower <= upper - value ? lower : upper;
}

function objectGuide(
  axis: 'x' | 'y',
  candidate: ObjectSnapCandidate,
  moving: CanvasSnapBounds,
): CanvasSnapGuide {
  const movingStart = axis === 'x' ? moving.y : moving.x;
  const movingEnd = movingStart + (axis === 'x' ? moving.height : moving.width);
  const targetStart = axis === 'x' ? candidate.target.y : candidate.target.x;
  const targetEnd = targetStart + (axis === 'x' ? candidate.target.height : candidate.target.width);
  return Object.freeze({
    axis,
    position: candidate.position,
    start: Math.min(movingStart, targetStart),
    end: Math.max(movingEnd, targetEnd),
    source: 'object',
    targetId: candidate.target.blockId,
  });
}

function gridGuide(axis: 'x' | 'y', position: number, moving: CanvasSnapBounds): CanvasSnapGuide {
  const start = axis === 'x' ? moving.y : moving.x;
  const size = axis === 'x' ? moving.height : moving.width;
  return Object.freeze({
    axis,
    position,
    start,
    end: start + size,
    source: 'grid',
    targetId: null,
  });
}

export function canvasSnapBounds(placements: readonly CanvasSpatialPlacement[]): CanvasSnapBounds {
  if (placements.length === 0) {
    throw new RangeError('placements must contain at least one object');
  }
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < placements.length; index += 1) {
    const placement = placements[index];
    const bounds = assertBounds(placement, `placements[${index}]`);
    left = Math.min(left, bounds.x);
    top = Math.min(top, bounds.y);
    right = Math.max(right, bounds.x + bounds.width);
    bottom = Math.max(bottom, bounds.y + bounds.height);
  }

  return Object.freeze({ x: left, y: top, width: right - left, height: bottom - top });
}

export function snapCanvasDrag(input: CanvasDragSnapInput): CanvasDragSnapResult {
  const movingBounds = assertBounds(input.movingBounds, 'movingBounds');
  const rawDelta = {
    x: finite(input.delta.x, 'delta.x'),
    y: finite(input.delta.y, 'delta.y'),
  };
  const threshold = finite(input.threshold, 'threshold');
  if (threshold < 0) {
    throw new RangeError('threshold must not be negative');
  }
  if (input.gridSize !== null) {
    finite(input.gridSize, 'gridSize');
    if (input.gridSize <= 0) {
      throw new RangeError('gridSize must be positive');
    }
  }
  input.targets.forEach((target, index) => assertBounds(target, `targets[${index}]`));

  const proposed = {
    ...movingBounds,
    x: movingBounds.x + rawDelta.x,
    y: movingBounds.y + rawDelta.y,
  };
  const xCandidate = bestObjectCandidate(proposed.x, proposed.width, input.targets, 'x', threshold);
  const yCandidate = bestObjectCandidate(
    proposed.y,
    proposed.height,
    input.targets,
    'y',
    threshold,
  );

  const snappedX =
    proposed.x +
    (xCandidate
      ? xCandidate.adjustment
      : input.gridSize === null
        ? 0
        : nearestGridLine(proposed.x, input.gridSize) - proposed.x);
  const snappedY =
    proposed.y +
    (yCandidate
      ? yCandidate.adjustment
      : input.gridSize === null
        ? 0
        : nearestGridLine(proposed.y, input.gridSize) - proposed.y);
  const snappedBounds = { ...proposed, x: snappedX, y: snappedY };
  const guides: CanvasSnapGuide[] = [];

  if (xCandidate) {
    guides.push(objectGuide('x', xCandidate, snappedBounds));
  } else if (input.gridSize !== null) {
    guides.push(gridGuide('x', snappedX, snappedBounds));
  }
  if (yCandidate) {
    guides.push(objectGuide('y', yCandidate, snappedBounds));
  } else if (input.gridSize !== null) {
    guides.push(gridGuide('y', snappedY, snappedBounds));
  }

  return Object.freeze({
    delta: Object.freeze({
      x: snappedX - movingBounds.x,
      y: snappedY - movingBounds.y,
    }),
    guides: Object.freeze(guides),
  });
}
