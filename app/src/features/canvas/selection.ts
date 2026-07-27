export interface CanvasSelection {
  readonly ids: readonly string[];
}

export interface CanvasSelectionPoint {
  readonly x: number;
  readonly y: number;
}

export interface CanvasSelectableBounds {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly z: number;
}

export type CanvasMarqueeMode = 'intersect' | 'contain';

function assertId(id: string): string {
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('Canvas selection IDs must be non-empty strings');
  }
  return id;
}

function assertFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Canvas selection ${label} must be finite`);
  }
  return value;
}

function uniqueIds(ids: Iterable<string>): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const rawId of ids) {
    const id = assertId(rawId);
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return Object.freeze(result);
}

function selection(ids: Iterable<string>): CanvasSelection {
  return Object.freeze({ ids: uniqueIds(ids) });
}

export function createCanvasSelection(ids: Iterable<string> = []): CanvasSelection {
  return selection(ids);
}

export function selectionHas(value: CanvasSelection, id: string): boolean {
  return value.ids.includes(assertId(id));
}

export function selectCanvasBlock(
  current: CanvasSelection,
  idValue: string,
  additive = false,
): CanvasSelection {
  const id = assertId(idValue);
  if (!additive) {
    return current.ids.length === 1 && current.ids[0] === id ? current : selection([id]);
  }
  return selection(
    selectionHas(current, id)
      ? current.ids.filter((selectedId) => selectedId !== id)
      : [...current.ids, id],
  );
}

export function clearCanvasSelection(current: CanvasSelection): CanvasSelection {
  return current.ids.length === 0 ? current : selection([]);
}

export function selectAllCanvasBlocks(ids: Iterable<string>): CanvasSelection {
  return selection(ids);
}

function normalizedMarquee(start: CanvasSelectionPoint, end: CanvasSelectionPoint) {
  const startX = assertFinite(start.x, 'marquee start x');
  const startY = assertFinite(start.y, 'marquee start y');
  const endX = assertFinite(end.x, 'marquee end x');
  const endY = assertFinite(end.y, 'marquee end y');
  return {
    left: Math.min(startX, endX),
    top: Math.min(startY, endY),
    right: Math.max(startX, endX),
    bottom: Math.max(startY, endY),
  };
}

function validatedBounds(value: CanvasSelectableBounds) {
  const x = assertFinite(value.x, `${value.id} x`);
  const y = assertFinite(value.y, `${value.id} y`);
  const width = assertFinite(value.width, `${value.id} width`);
  const height = assertFinite(value.height, `${value.id} height`);
  assertFinite(value.z, `${value.id} z`);
  if (width < 0 || height < 0) {
    throw new Error('Canvas selection bounds width and height must not be negative');
  }
  return { left: x, top: y, right: x + width, bottom: y + height };
}

export function marqueeSelect(
  objects: readonly CanvasSelectableBounds[],
  start: CanvasSelectionPoint,
  end: CanvasSelectionPoint,
  mode: CanvasMarqueeMode = 'intersect',
): CanvasSelection {
  const marquee = normalizedMarquee(start, end);
  const selected = objects.filter((object) => {
    assertId(object.id);
    const bounds = validatedBounds(object);
    if (mode === 'contain') {
      return (
        bounds.left >= marquee.left &&
        bounds.right <= marquee.right &&
        bounds.top >= marquee.top &&
        bounds.bottom <= marquee.bottom
      );
    }
    return (
      bounds.right >= marquee.left &&
      bounds.left <= marquee.right &&
      bounds.bottom >= marquee.top &&
      bounds.top <= marquee.bottom
    );
  });
  return selection(selected.map((object) => object.id));
}
