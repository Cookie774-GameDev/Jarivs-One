import type { CanvasSpatialPlacement } from './contracts';

export interface CanvasGeometryDelta {
  readonly x: number;
  readonly y: number;
}

export interface CanvasResizeGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type CanvasAlignment =
  | 'left'
  | 'horizontal-center'
  | 'right'
  | 'top'
  | 'vertical-center'
  | 'bottom';

export type CanvasDistributionAxis = 'horizontal' | 'vertical';
export type CanvasZOrderCommand = 'forward' | 'backward' | 'front' | 'back';

const DEFAULT_MIN_SIZE = 16;
const ALIGNMENTS: readonly CanvasAlignment[] = [
  'left',
  'horizontal-center',
  'right',
  'top',
  'vertical-center',
  'bottom',
];
const DISTRIBUTION_AXES: readonly CanvasDistributionAxis[] = ['horizontal', 'vertical'];
const Z_ORDER_COMMANDS: readonly CanvasZOrderCommand[] = ['forward', 'backward', 'front', 'back'];

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Canvas geometry ${label} must be finite`);
  }
  return value;
}

function selectedIdSet(ids: readonly string[]): ReadonlySet<string> {
  if (ids.some((id) => typeof id !== 'string' || id.length === 0)) {
    throw new Error('Canvas geometry selection IDs must be non-empty strings');
  }
  return new Set(ids);
}

function placementWith(
  placement: CanvasSpatialPlacement,
  changes: Partial<CanvasSpatialPlacement>,
): CanvasSpatialPlacement {
  return Object.freeze({ ...placement, ...changes });
}

function frozenPlacements(
  placements: readonly CanvasSpatialPlacement[],
): readonly CanvasSpatialPlacement[] {
  return Object.freeze(placements);
}

export function translateCanvasPlacements(
  placements: readonly CanvasSpatialPlacement[],
  ids: readonly string[],
  delta: CanvasGeometryDelta,
): readonly CanvasSpatialPlacement[] {
  const selected = selectedIdSet(ids);
  const x = finite(delta.x, 'delta x');
  const y = finite(delta.y, 'delta y');
  return frozenPlacements(
    placements.map((placement) =>
      selected.has(placement.blockId)
        ? placementWith(placement, { x: placement.x + x, y: placement.y + y })
        : placement,
    ),
  );
}

export function resizeCanvasPlacement(
  placement: CanvasSpatialPlacement,
  geometry: CanvasResizeGeometry,
  minimumSize = DEFAULT_MIN_SIZE,
): CanvasSpatialPlacement {
  const minimum = finite(minimumSize, 'minimum size');
  if (minimum <= 0) {
    throw new Error('Canvas geometry minimum size must be positive');
  }
  return placementWith(placement, {
    x: finite(geometry.x, 'resize x'),
    y: finite(geometry.y, 'resize y'),
    width: Math.max(minimum, finite(geometry.width, 'resize width')),
    height: Math.max(minimum, finite(geometry.height, 'resize height')),
  });
}

export function rotateCanvasPlacement(
  placement: CanvasSpatialPlacement,
  degreesValue: number,
): CanvasSpatialPlacement {
  const degrees = finite(degreesValue, 'rotation');
  const rotation = ((((degrees + 180) % 360) + 360) % 360) - 180;
  return placementWith(placement, { rotation });
}

function selectedPlacements(
  placements: readonly CanvasSpatialPlacement[],
  ids: readonly string[],
): readonly CanvasSpatialPlacement[] {
  const selected = selectedIdSet(ids);
  return placements.filter((placement) => selected.has(placement.blockId));
}

export function alignCanvasPlacements(
  placements: readonly CanvasSpatialPlacement[],
  ids: readonly string[],
  alignment: CanvasAlignment,
): readonly CanvasSpatialPlacement[] {
  if (!ALIGNMENTS.includes(alignment)) {
    throw new Error('Unsupported Canvas geometry alignment');
  }
  const selected = selectedPlacements(placements, ids);
  if (selected.length < 2) return frozenPlacements([...placements]);
  const selectedIds = new Set(selected.map((placement) => placement.blockId));
  const left = Math.min(...selected.map((placement) => placement.x));
  const right = Math.max(...selected.map((placement) => placement.x + placement.width));
  const top = Math.min(...selected.map((placement) => placement.y));
  const bottom = Math.max(...selected.map((placement) => placement.y + placement.height));

  return frozenPlacements(
    placements.map((placement) => {
      if (!selectedIds.has(placement.blockId)) return placement;
      switch (alignment) {
        case 'left':
          return placementWith(placement, { x: left });
        case 'horizontal-center':
          return placementWith(placement, { x: (left + right - placement.width) / 2 });
        case 'right':
          return placementWith(placement, { x: right - placement.width });
        case 'top':
          return placementWith(placement, { y: top });
        case 'vertical-center':
          return placementWith(placement, { y: (top + bottom - placement.height) / 2 });
        case 'bottom':
          return placementWith(placement, { y: bottom - placement.height });
      }
    }),
  );
}

export function distributeCanvasPlacements(
  placements: readonly CanvasSpatialPlacement[],
  ids: readonly string[],
  axis: CanvasDistributionAxis,
): readonly CanvasSpatialPlacement[] {
  if (!DISTRIBUTION_AXES.includes(axis)) {
    throw new Error('Unsupported Canvas geometry distribution axis');
  }
  const selected = [...selectedPlacements(placements, ids)].sort((left, right) =>
    axis === 'horizontal' ? left.x - right.x : left.y - right.y,
  );
  if (selected.length < 3) return frozenPlacements([...placements]);

  const start = axis === 'horizontal' ? selected[0].x : selected[0].y;
  const last = selected.at(-1)!;
  const end = axis === 'horizontal' ? last.x + last.width : last.y + last.height;
  const occupied = selected.reduce(
    (total, placement) => total + (axis === 'horizontal' ? placement.width : placement.height),
    0,
  );
  const gap = (end - start - occupied) / (selected.length - 1);
  const updates = new Map<string, CanvasSpatialPlacement>();
  let cursor = start;
  for (const placement of selected) {
    updates.set(
      placement.blockId,
      axis === 'horizontal'
        ? placementWith(placement, { x: cursor })
        : placementWith(placement, { y: cursor }),
    );
    cursor += (axis === 'horizontal' ? placement.width : placement.height) + gap;
  }
  return frozenPlacements(
    placements.map((placement) => updates.get(placement.blockId) ?? placement),
  );
}

export function reorderCanvasPlacement(
  placements: readonly CanvasSpatialPlacement[],
  id: string,
  command: CanvasZOrderCommand,
): readonly CanvasSpatialPlacement[] {
  if (!Z_ORDER_COMMANDS.includes(command)) {
    throw new Error('Unsupported Canvas geometry z-order command');
  }
  const target = placements.find((placement) => placement.blockId === id);
  if (!target) return frozenPlacements([...placements]);
  const ordered = [...placements].sort((left, right) => left.z - right.z);
  const targetIndex = ordered.findIndex((placement) => placement.blockId === id);
  const updates = new Map<string, number>();

  if (command === 'front') {
    updates.set(id, Math.max(...placements.map((placement) => placement.z)) + 1);
  } else if (command === 'back') {
    updates.set(id, Math.min(...placements.map((placement) => placement.z)) - 1);
  } else {
    const adjacentIndex = command === 'forward' ? targetIndex + 1 : targetIndex - 1;
    const adjacent = ordered[adjacentIndex];
    if (adjacent) {
      updates.set(id, adjacent.z);
      updates.set(adjacent.blockId, target.z);
    }
  }

  return frozenPlacements(
    placements.map((placement) => {
      const z = updates.get(placement.blockId);
      return z === undefined ? placement : placementWith(placement, { z });
    }),
  );
}
