/**
 * Infinite Idea Canvas - Frames domain slice.
 *
 * Framework-agnostic, deterministic, side-effect-free operations for canvas
 * frames: named sections with independent backgrounds, validated nested child
 * containment, movement, resize-to-content, locking, collapse-to-thumbnail,
 * deterministic presentation order, export metadata, and linkable references.
 *
 * Every operation validates its inputs and fails closed with the
 * CanvasValidationError reused from the canonical contracts module. Mutating
 * operations return a deeply frozen "{ frame, operation }" result so the
 * existing history/undo layer can consume immutable results plus metadata
 * instead of a second history system. Frames never duplicate document content;
 * child containment references stable block or frame ids only.
 */
import {
  CANVAS_BACKGROUND_KINDS,
  CANVAS_ID_PATTERN,
  CANVAS_MAX_TIMESTAMP,
  CanvasValidationError,
  type CanvasBackgroundKind,
  type CanvasSpatialPlacement,
  type CanvasValidationErrorCode,
} from './contracts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FRAME_COORDINATE = 1_000_000_000;
const MAX_FRAME_SIZE = 10_000_000;
const MAX_FRAME_NAME_LENGTH = 200;
const MAX_THUMBNAIL_LENGTH = 2048;
const MAX_EXPORT_LABEL_LENGTH = 200;
const MAX_EXPORT_SCALE = 32;
const DEFAULT_FRAME_WIDTH = 320;
const DEFAULT_FRAME_HEIGHT = 200;
const DEFAULT_FRAME_PADDING = 24;
const MIN_FRAME_SIZE = 16;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function fail(code: CanvasValidationErrorCode, path: string, message: string): never {
  throw new CanvasValidationError(code, path, message);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  for (const key of Object.keys(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}

function assertFrameId(value: unknown, path: string): string {
  if (typeof value !== 'string' || !CANVAS_ID_PATTERN.test(value)) {
    fail('invalid-id', path, 'expected a stable id matching /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/');
  }
  return value;
}

function assertTimestamp(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    fail('invalid-timestamp', path, 'expected an integer timestamp');
  }
  if (value < 0 || value > CANVAS_MAX_TIMESTAMP) {
    fail('invalid-timestamp', path, 'timestamp out of range');
  }
  return value;
}

function assertFiniteNumber(
  value: unknown,
  path: string,
  bounds: { readonly min?: number; readonly max?: number; readonly exclusiveMin?: boolean } = {},
): number {
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

function assertSafeInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    fail('invalid-number', path, 'expected a safe integer');
  }
  return value;
}

function assertBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    fail('invalid-type', path, 'expected a boolean');
  }
  return value;
}

function normalizeName(value: unknown, path: string): string {
  if (value === undefined) {
    return 'Untitled frame';
  }
  if (typeof value !== 'string') {
    fail('invalid-type', path, 'expected a string');
  }
  const text = value.trim();
  if (CONTROL_CHAR_PATTERN.test(text)) {
    fail('unsupported-value', path, 'name contains control characters');
  }
  if (text.length > MAX_FRAME_NAME_LENGTH) {
    fail('unsupported-value', path, 'name exceeds ' + MAX_FRAME_NAME_LENGTH + ' characters');
  }
  return text === '' ? 'Untitled frame' : text;
}

function normalizeFrameBackground(value: unknown, path: string): CanvasFrameBackground {
  if (typeof value !== 'object' || value === null) {
    fail('invalid-type', path, 'expected a background object');
  }
  const input = value as Record<string, unknown>;
  const kind = input.kind;
  if (typeof kind !== 'string' || !(CANVAS_BACKGROUND_KINDS as readonly string[]).includes(kind)) {
    fail('unsupported-value', path + '.kind', 'unsupported background kind');
  }
  const color = input.color;
  if (typeof color !== 'string' || !COLOR_PATTERN.test(color)) {
    fail('unsupported-value', path + '.color', 'expected a #rrggbb hex color');
  }
  return { kind: kind as CanvasBackgroundKind, color };
}

function normalizeChildren(value: unknown, frameId: string, path: string): readonly string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    fail('invalid-type', path, 'expected an array of child ids');
  }
  const seen = new Set<string>();
  const children: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const child = assertFrameId(value[index], path + '[' + index + ']');
    if (child === frameId) {
      fail('invalid-reference', path + '[' + index + ']', 'a frame cannot contain itself');
    }
    if (seen.has(child)) {
      fail('duplicate-id', path + '[' + index + ']', 'duplicate child "' + child + '"');
    }
    seen.add(child);
    children.push(child);
  }
  return children;
}

function normalizeThumbnail(value: unknown, path: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    fail('invalid-type', path, 'expected a thumbnail string or null');
  }
  if (value.length === 0 || value.length > MAX_THUMBNAIL_LENGTH) {
    fail('unsupported-value', path, 'thumbnail length out of range');
  }
  if (CONTROL_CHAR_PATTERN.test(value)) {
    fail('unsupported-value', path, 'thumbnail contains control characters');
  }
  return value;
}

function normalizeExportDescriptor(value: unknown, path: string): CanvasFrameExportDescriptor {
  if (typeof value !== 'object' || value === null) {
    fail('invalid-type', path, 'expected an export descriptor object');
  }
  const input = value as Record<string, unknown>;
  const exportable = assertBoolean(input.exportable, path + '.exportable');
  let label: string | null;
  if (input.label === null || input.label === undefined) {
    label = null;
  } else if (typeof input.label !== 'string') {
    fail('invalid-type', path + '.label', 'expected a label string or null');
  } else {
    const text = input.label.trim();
    if (
      text.length === 0 ||
      text.length > MAX_EXPORT_LABEL_LENGTH ||
      CONTROL_CHAR_PATTERN.test(text)
    ) {
      fail(
        'unsupported-value',
        path + '.label',
        'label must be 1-' + MAX_EXPORT_LABEL_LENGTH + ' printable characters',
      );
    }
    label = text;
  }
  const scale = assertFiniteNumber(input.scale, path + '.scale', {
    min: 0,
    exclusiveMin: true,
    max: MAX_EXPORT_SCALE,
  });
  return { exportable, label, scale };
}

function assertUnlocked(frame: CanvasFrame): void {
  if (frame.locked) {
    fail('unsupported-value', 'frame.locked', 'frame "' + frame.id + '" is locked');
  }
}

function mutation(frame: CanvasFrame, operation: CanvasFrameOperation): CanvasFrameMutationResult {
  return deepFreeze({ frame, operation });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CanvasFrameBackground {
  readonly kind: CanvasBackgroundKind;
  readonly color: string;
}

export interface CanvasFrameExportDescriptor {
  readonly exportable: boolean;
  readonly label: string | null;
  readonly scale: number;
}

export interface CanvasFrameReference {
  readonly frameId: string;
  readonly alias: string;
}

export interface CanvasFrameDelta {
  readonly x: number;
  readonly y: number;
}

export interface CanvasFrameResizeOptions {
  readonly padding?: number;
  readonly minSize?: number;
}

export interface CanvasFrame {
  readonly id: string;
  readonly name: string;
  readonly background: CanvasFrameBackground;
  readonly children: readonly string[];
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly z: number;
  readonly locked: boolean;
  readonly collapsed: boolean;
  readonly thumbnail: string | null;
  readonly exportDescriptor: CanvasFrameExportDescriptor;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface CreateCanvasFrameInput {
  readonly id: string;
  readonly now: number;
  readonly name?: string;
  readonly background?: CanvasFrameBackground;
  readonly children?: readonly string[];
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly z?: number;
}

export type CanvasFrameOperation =
  | {
      readonly type: 'frame-renamed';
      readonly frameId: string;
      readonly from: string;
      readonly to: string;
      readonly at: number;
    }
  | { readonly type: 'frame-background-changed'; readonly frameId: string; readonly at: number }
  | {
      readonly type: 'frame-child-added';
      readonly frameId: string;
      readonly childId: string;
      readonly at: number;
    }
  | {
      readonly type: 'frame-child-removed';
      readonly frameId: string;
      readonly childId: string;
      readonly at: number;
    }
  | {
      readonly type: 'frame-moved';
      readonly frameId: string;
      readonly dx: number;
      readonly dy: number;
      readonly at: number;
    }
  | { readonly type: 'frame-resized'; readonly frameId: string; readonly at: number }
  | {
      readonly type: 'frame-lock-changed';
      readonly frameId: string;
      readonly locked: boolean;
      readonly at: number;
    }
  | {
      readonly type: 'frame-collapse-changed';
      readonly frameId: string;
      readonly collapsed: boolean;
      readonly at: number;
    }
  | { readonly type: 'frame-export-changed'; readonly frameId: string; readonly at: number };

export interface CanvasFrameMutationResult {
  readonly frame: CanvasFrame;
  readonly operation: CanvasFrameOperation;
}

export interface CanvasContainmentResult {
  readonly valid: true;
  readonly order: readonly string[];
}

const DEFAULT_EXPORT_DESCRIPTOR: CanvasFrameExportDescriptor = Object.freeze({
  exportable: true,
  label: null,
  scale: 1,
});

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createFrame(input: CreateCanvasFrameInput): CanvasFrame {
  const id = assertFrameId(input.id, 'frame.id');
  const now = assertTimestamp(input.now, 'frame.now');
  const name = normalizeName(input.name, 'frame.name');
  const background: CanvasFrameBackground = input.background
    ? normalizeFrameBackground(input.background, 'frame.background')
    : { kind: 'plain', color: '#ffffff' };
  const children = normalizeChildren(input.children, id, 'frame.children');
  const x = assertFiniteNumber(input.x ?? 0, 'frame.x', {
    min: -MAX_FRAME_COORDINATE,
    max: MAX_FRAME_COORDINATE,
  });
  const y = assertFiniteNumber(input.y ?? 0, 'frame.y', {
    min: -MAX_FRAME_COORDINATE,
    max: MAX_FRAME_COORDINATE,
  });
  const width = assertFiniteNumber(input.width ?? DEFAULT_FRAME_WIDTH, 'frame.width', {
    min: 0,
    exclusiveMin: true,
    max: MAX_FRAME_SIZE,
  });
  const height = assertFiniteNumber(input.height ?? DEFAULT_FRAME_HEIGHT, 'frame.height', {
    min: 0,
    exclusiveMin: true,
    max: MAX_FRAME_SIZE,
  });
  const z = assertSafeInteger(input.z ?? 0, 'frame.z');

  return deepFreeze({
    id,
    name,
    background,
    children,
    x,
    y,
    width,
    height,
    z,
    locked: false,
    collapsed: false,
    thumbnail: null,
    exportDescriptor: DEFAULT_EXPORT_DESCRIPTOR,
    createdAt: now,
    updatedAt: now,
  });
}

// ---------------------------------------------------------------------------
// Mutations (each returns an immutable result plus undo-ready metadata)
// ---------------------------------------------------------------------------

export function renameFrame(
  frame: CanvasFrame,
  name: string,
  now: number,
): CanvasFrameMutationResult {
  assertUnlocked(frame);
  const at = assertTimestamp(now, 'now');
  const to = normalizeName(name, 'name');
  const next: CanvasFrame = { ...frame, name: to, updatedAt: at };
  return mutation(next, { type: 'frame-renamed', frameId: frame.id, from: frame.name, to, at });
}

export function setFrameBackground(
  frame: CanvasFrame,
  background: CanvasFrameBackground,
  now: number,
): CanvasFrameMutationResult {
  assertUnlocked(frame);
  const at = assertTimestamp(now, 'now');
  const next: CanvasFrame = {
    ...frame,
    background: normalizeFrameBackground(background, 'background'),
    updatedAt: at,
  };
  return mutation(next, { type: 'frame-background-changed', frameId: frame.id, at });
}

export function addFrameChild(
  frame: CanvasFrame,
  childId: string,
  now: number,
): CanvasFrameMutationResult {
  assertUnlocked(frame);
  const at = assertTimestamp(now, 'now');
  const child = assertFrameId(childId, 'childId');
  if (child === frame.id) {
    fail('invalid-reference', 'childId', 'a frame cannot contain itself');
  }
  if (frame.children.includes(child)) {
    fail('duplicate-id', 'childId', 'duplicate child "' + child + '"');
  }
  const next: CanvasFrame = { ...frame, children: [...frame.children, child], updatedAt: at };
  return mutation(next, { type: 'frame-child-added', frameId: frame.id, childId: child, at });
}

export function removeFrameChild(
  frame: CanvasFrame,
  childId: string,
  now: number,
): CanvasFrameMutationResult {
  assertUnlocked(frame);
  const at = assertTimestamp(now, 'now');
  const child = assertFrameId(childId, 'childId');
  if (!frame.children.includes(child)) {
    fail('invalid-reference', 'childId', 'frame has no child "' + child + '"');
  }
  const next: CanvasFrame = {
    ...frame,
    children: frame.children.filter((existing) => existing !== child),
    updatedAt: at,
  };
  return mutation(next, { type: 'frame-child-removed', frameId: frame.id, childId: child, at });
}

export function moveFrame(
  frame: CanvasFrame,
  delta: CanvasFrameDelta,
  now: number,
): CanvasFrameMutationResult {
  assertUnlocked(frame);
  const at = assertTimestamp(now, 'now');
  const dx = assertFiniteNumber(delta.x, 'delta.x', {
    min: -MAX_FRAME_COORDINATE,
    max: MAX_FRAME_COORDINATE,
  });
  const dy = assertFiniteNumber(delta.y, 'delta.y', {
    min: -MAX_FRAME_COORDINATE,
    max: MAX_FRAME_COORDINATE,
  });
  const next: CanvasFrame = { ...frame, x: frame.x + dx, y: frame.y + dy, updatedAt: at };
  return mutation(next, { type: 'frame-moved', frameId: frame.id, dx, dy, at });
}

export function resizeFrameToContent(
  frame: CanvasFrame,
  childPlacements: readonly CanvasSpatialPlacement[],
  now: number,
  options: CanvasFrameResizeOptions = {},
): CanvasFrameMutationResult {
  assertUnlocked(frame);
  const at = assertTimestamp(now, 'now');
  const padding = assertFiniteNumber(options.padding ?? DEFAULT_FRAME_PADDING, 'options.padding', {
    min: 0,
  });
  const minSize = assertFiniteNumber(options.minSize ?? MIN_FRAME_SIZE, 'options.minSize', {
    min: 0,
    exclusiveMin: true,
  });

  const placed = childPlacements.filter((placement) => frame.children.includes(placement.blockId));
  if (placed.length === 0) {
    fail(
      'invalid-reference',
      'childPlacements',
      'frame "' + frame.id + '" has no placed content to resize to',
    );
  }

  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const placement of placed) {
    const x = assertFiniteNumber(placement.x, 'placement.x');
    const y = assertFiniteNumber(placement.y, 'placement.y');
    const width = assertFiniteNumber(placement.width, 'placement.width', {
      min: 0,
      exclusiveMin: true,
    });
    const height = assertFiniteNumber(placement.height, 'placement.height', {
      min: 0,
      exclusiveMin: true,
    });
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + width);
    bottom = Math.max(bottom, y + height);
  }

  const next: CanvasFrame = {
    ...frame,
    x: left - padding,
    y: top - padding,
    width: Math.max(minSize, right - left + 2 * padding),
    height: Math.max(minSize, bottom - top + 2 * padding),
    updatedAt: at,
  };
  return mutation(next, { type: 'frame-resized', frameId: frame.id, at });
}

export function setFrameLocked(
  frame: CanvasFrame,
  locked: boolean,
  now: number,
): CanvasFrameMutationResult {
  const at = assertTimestamp(now, 'now');
  const value = assertBoolean(locked, 'locked');
  const next: CanvasFrame = { ...frame, locked: value, updatedAt: at };
  return mutation(next, { type: 'frame-lock-changed', frameId: frame.id, locked: value, at });
}

export function setFrameCollapsed(
  frame: CanvasFrame,
  collapsed: boolean,
  now: number,
  thumbnail: string | null = null,
): CanvasFrameMutationResult {
  const at = assertTimestamp(now, 'now');
  const value = assertBoolean(collapsed, 'collapsed');
  const nextThumbnail = value ? normalizeThumbnail(thumbnail, 'thumbnail') : null;
  const next: CanvasFrame = { ...frame, collapsed: value, thumbnail: nextThumbnail, updatedAt: at };
  return mutation(next, {
    type: 'frame-collapse-changed',
    frameId: frame.id,
    collapsed: value,
    at,
  });
}

export function withFrameExport(
  frame: CanvasFrame,
  descriptor: CanvasFrameExportDescriptor,
  now: number,
): CanvasFrameMutationResult {
  assertUnlocked(frame);
  const at = assertTimestamp(now, 'now');
  const next: CanvasFrame = {
    ...frame,
    exportDescriptor: normalizeExportDescriptor(descriptor, 'descriptor'),
    updatedAt: at,
  };
  return mutation(next, { type: 'frame-export-changed', frameId: frame.id, at });
}

// ---------------------------------------------------------------------------
// Derived views
// ---------------------------------------------------------------------------

export function frameExportDescriptor(frame: CanvasFrame): CanvasFrameExportDescriptor {
  return frame.exportDescriptor;
}

export function referenceFrame(frame: CanvasFrame, alias: string): CanvasFrameReference {
  if (typeof alias !== 'string') {
    fail('invalid-type', 'alias', 'expected a string alias');
  }
  const text = alias.trim();
  if (text.length === 0 || text.length > MAX_FRAME_NAME_LENGTH || CONTROL_CHAR_PATTERN.test(text)) {
    fail(
      'unsupported-value',
      'alias',
      'alias must be 1-' + MAX_FRAME_NAME_LENGTH + ' printable characters',
    );
  }
  return deepFreeze({ frameId: frame.id, alias: text });
}

export function presentationOrderedFrames(
  frames: readonly CanvasFrame[],
  order: readonly string[],
): readonly CanvasFrame[] {
  const byId = new Map<string, CanvasFrame>();
  for (const frame of frames) {
    if (byId.has(frame.id)) {
      fail('duplicate-id', 'frames', 'duplicate frame id "' + frame.id + '"');
    }
    byId.set(frame.id, frame);
  }
  const seen = new Set<string>();
  const ordered: CanvasFrame[] = [];
  for (let index = 0; index < order.length; index += 1) {
    const id = assertFrameId(order[index], 'order[' + index + ']');
    if (seen.has(id)) {
      fail('duplicate-id', 'order[' + index + ']', 'duplicate presentation id "' + id + '"');
    }
    const frame = byId.get(id);
    if (!frame) {
      fail(
        'invalid-reference',
        'order[' + index + ']',
        'presentation id "' + id + '" references an unknown frame',
      );
    }
    seen.add(id);
    ordered.push(frame);
  }
  return Object.freeze(ordered);
}

// ---------------------------------------------------------------------------
// Nested containment validation
// ---------------------------------------------------------------------------

export function validateContainmentGraph(
  frames: readonly CanvasFrame[],
  blockIds?: readonly string[],
): CanvasContainmentResult {
  const frameIds = new Set<string>();
  for (const frame of frames) {
    assertFrameId(frame.id, 'frame.id');
    if (frameIds.has(frame.id)) {
      fail('duplicate-id', 'frames', 'duplicate frame id "' + frame.id + '"');
    }
    frameIds.add(frame.id);
  }
  const knownBlocks = blockIds === undefined ? null : new Set(blockIds);

  // Per-frame local checks plus frame-subgraph adjacency.
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const frame of frames) {
    indegree.set(frame.id, 0);
  }
  for (const frame of frames) {
    const seen = new Set<string>();
    const frameEdges: string[] = [];
    for (const child of frame.children) {
      assertFrameId(child, 'frame.children');
      if (child === frame.id) {
        fail(
          'invalid-reference',
          'frame.children',
          'frame "' + frame.id + '" cannot contain itself',
        );
      }
      if (seen.has(child)) {
        fail(
          'duplicate-id',
          'frame.children',
          'duplicate child "' + child + '" in frame "' + frame.id + '"',
        );
      }
      seen.add(child);
      if (frameIds.has(child)) {
        frameEdges.push(child);
        indegree.set(child, (indegree.get(child) ?? 0) + 1);
      } else if (knownBlocks !== null && !knownBlocks.has(child)) {
        fail(
          'invalid-reference',
          'frame.children',
          'child "' + child + '" is a missing reference (not a frame or known block)',
        );
      }
    }
    adjacency.set(frame.id, frameEdges);
  }

  // Deterministic Kahn topological order over the frame-subgraph; a leftover
  // node proves a containment cycle.
  const frontier: string[] = [...frameIds].filter((id) => (indegree.get(id) ?? 0) === 0).sort();
  const order: string[] = [];
  while (frontier.length > 0) {
    frontier.sort();
    const id = frontier.shift() as string;
    order.push(id);
    for (const child of adjacency.get(id) ?? []) {
      const remaining = (indegree.get(child) ?? 0) - 1;
      indegree.set(child, remaining);
      if (remaining === 0) {
        frontier.push(child);
      }
    }
  }
  if (order.length !== frameIds.size) {
    const cyclic = [...frameIds].filter((id) => !order.includes(id)).sort();
    fail(
      'invalid-reference',
      'frames',
      'containment cycle detected involving frames: ' + cyclic.join(', '),
    );
  }

  return deepFreeze({ valid: true, order });
}
