/**
 * Pure, validated Canvas clipboard domain layer.
 *
 * Provides copy, cut, and paste operations for multiple blocks and their
 * optional spatial placements. All operations are side-effect-free document
 * transitions that never touch the system clipboard or execute pasted
 * content. Payloads are immutable, serializable, and validated fail-closed
 * with `CanvasValidationError`.
 */

import {
  CANVAS_ID_PATTERN,
  CanvasValidationError,
  createCanvasBlock,
  pageOrderedBlocks,
  parseCanvasBlockId,
  resolveEdgelessLayout,
  withBlockAdded,
  withBlockRemoved,
  withPlacement,
  type CanvasBlock,
  type CanvasBlockId,
  type CanvasDocument,
  type CanvasSpatialPlacement,
} from './contracts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Internal clipboard payload: canonical blocks plus optional placements. */
export interface CanvasClipboardPayload {
  readonly schemaVersion: 1;
  readonly blocks: readonly CanvasBlock[];
  readonly placements: readonly CanvasSpatialPlacement[];
}

/** Options for the paste transition. */
export interface CanvasPasteOptions {
  /** Injected factory producing collision-free block ids. */
  readonly generateId: () => string;
  /** Timestamp for the paste transition. */
  readonly now: number;
  /** World-space offset applied to pasted placements. Defaults to {0, 0}. */
  readonly offset?: { readonly dx: number; readonly dy: number };
  /** Insertion index within the document block list. Defaults to end. */
  readonly atIndex?: number;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function fail(
  code:
    | 'invalid-type'
    | 'invalid-id'
    | 'invalid-reference'
    | 'duplicate-id'
    | 'unsupported-value'
    | 'invalid-number',
  path: string,
  message: string,
): never {
  throw new CanvasValidationError(code, path, message);
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  Object.freeze(value);
  for (const key of Object.keys(value as Record<string, unknown>)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

function assertNonEmptyIds(blockIds: readonly string[], path: string): readonly string[] {
  if (!Array.isArray(blockIds) || blockIds.length === 0) {
    fail('invalid-type', path, 'expected a non-empty array of block ids');
  }
  // Deduplicate while preserving first occurrence
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const id of blockIds) {
    const parsed = parseCanvasBlockId(id);
    if (!seen.has(parsed)) {
      seen.add(parsed);
      unique.push(parsed);
    }
  }
  return unique;
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/**
 * Extracts the specified blocks (in document order) and their placements
 * into an immutable, serializable clipboard payload.
 */
export function copyBlocks(
  doc: CanvasDocument,
  blockIds: readonly string[],
): CanvasClipboardPayload {
  const ids = assertNonEmptyIds(blockIds, 'blockIds');

  // Verify all requested blocks exist
  for (const id of ids) {
    if (!doc.blocks.some((b) => b.id === id)) {
      fail('invalid-reference', 'blockIds', `references unknown block "${id}"`);
    }
  }

  const idSet = new Set(ids);

  // Preserve document order
  const blocks = pageOrderedBlocks(doc).filter((b) => idSet.has(b.id));
  const resolvedPlacements = doc.layoutMode === 'edgeless' ? resolveEdgelessLayout(doc) : null;
  const placements =
    resolvedPlacements === null
      ? doc.placements.filter((p) => idSet.has(p.blockId))
      : blocks.map((block) => resolvedPlacements.get(block.id)!);

  return deepFreeze({
    schemaVersion: 1 as const,
    blocks,
    placements,
  });
}

// ---------------------------------------------------------------------------
// Paste
// ---------------------------------------------------------------------------

/**
 * Pastes a clipboard payload into a document as a pure transition.
 *
 * Every block receives a new id from the injected factory. Placements are
 * remapped to the new ids and offset by the supplied world-space delta.
 * Throws `CanvasValidationError` if the factory produces an id that
 * collides with an existing document block or another pasted block.
 */
export function pasteBlocks(
  doc: CanvasDocument,
  payload: CanvasClipboardPayload,
  options: CanvasPasteOptions,
): CanvasDocument {
  const normalizedPayload = normalizeClipboardPayload(payload);

  const { generateId, now } = options;
  const dx = options.offset?.dx ?? 0;
  const dy = options.offset?.dy ?? 0;

  // Build old-id → new-id mapping, checking for collisions
  const existingIds = new Set(doc.blocks.map((b) => b.id as string));
  const newIds = new Set<string>();
  const idMap = new Map<string, CanvasBlockId>();

  for (const block of normalizedPayload.blocks) {
    const newId = generateId();
    // Validate the generated id shape
    if (typeof newId !== 'string' || !CANVAS_ID_PATTERN.test(newId)) {
      fail('invalid-id', 'generateId', `factory produced invalid id "${newId}"`);
    }
    if (existingIds.has(newId)) {
      fail(
        'duplicate-id',
        'generateId',
        `factory produced id "${newId}" that collides with an existing block`,
      );
    }
    if (newIds.has(newId)) {
      fail(
        'duplicate-id',
        'generateId',
        `factory produced duplicate id "${newId}" within the paste batch`,
      );
    }
    newIds.add(newId);
    idMap.set(block.id as string, parseCanvasBlockId(newId));
  }

  // Insert blocks
  let result = doc;
  const baseIndex = options.atIndex;
  for (let i = 0; i < normalizedPayload.blocks.length; i++) {
    const original = normalizedPayload.blocks[i];
    const newId = idMap.get(original.id as string)!;
    const newBlock = createCanvasBlock({
      id: newId,
      content: original.content,
      now,
    });
    const insertAt = baseIndex === undefined ? undefined : baseIndex + i;
    result = withBlockAdded(result, newBlock, now, insertAt);
  }

  // Insert remapped, offset placements
  for (const placement of normalizedPayload.placements) {
    const newBlockId = idMap.get(placement.blockId as string)!;
    result = withPlacement(
      result,
      {
        blockId: newBlockId,
        x: placement.x + dx,
        y: placement.y + dy,
        width: placement.width,
        height: placement.height,
        rotation: placement.rotation,
        z: placement.z,
        locked: placement.locked,
        hidden: placement.hidden,
      },
      now,
    );
  }

  return result;
}

// ---------------------------------------------------------------------------
// Cut
// ---------------------------------------------------------------------------

/**
 * Removes the specified blocks and their placements as a pure document
 * transition. Never touches the system clipboard.
 */
export function cutBlocks(
  doc: CanvasDocument,
  blockIds: readonly string[],
  now: number,
): CanvasDocument {
  const ids = assertNonEmptyIds(blockIds, 'blockIds');

  let result = doc;
  for (const id of ids) {
    result = withBlockRemoved(result, id, now);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Serialization (CANVAS-186 crash recovery)
// ---------------------------------------------------------------------------

/** Serializes a clipboard payload to a JSON string for persistence. */
export function serializeClipboard(payload: CanvasClipboardPayload): string {
  return JSON.stringify(normalizeClipboardPayload(payload));
}

const MAX_COORDINATE = 1_000_000_000;
const MAX_SIZE = 10_000_000;
const MAX_ROTATION = 360;
const PAYLOAD_KEYS = new Set(['schemaVersion', 'blocks', 'placements']);
const BLOCK_KEYS = new Set(['id', 'content', 'createdAt', 'updatedAt']);
const PLACEMENT_KEYS = new Set([
  'blockId',
  'x',
  'y',
  'width',
  'height',
  'rotation',
  'z',
  'locked',
  'hidden',
]);

function plainRecord(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('invalid-type', path, 'expected a plain object');
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      fail('unsupported-value', `${path}.${key}`, `unexpected field "${key}"`);
    }
  }
}

function assertFiniteNumber(
  value: unknown,
  path: string,
  opts: { min: number; max: number; exclusiveMin?: boolean },
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('invalid-number', path, 'expected a finite number');
  }
  if (opts.exclusiveMin ? value <= opts.min : value < opts.min) {
    fail('invalid-number', path, `value must be greater than ${opts.min}`);
  }
  if (value > opts.max) {
    fail('invalid-number', path, `value must not exceed ${opts.max}`);
  }
  return value;
}

function validatePlacement(
  raw: unknown,
  index: number,
  blockIds: Set<string>,
): CanvasSpatialPlacement {
  const path = `placements[${index}]`;
  const p = plainRecord(raw, path);
  assertExactKeys(p, PLACEMENT_KEYS, path);
  const blockId =
    typeof p.blockId === 'string'
      ? p.blockId
      : fail('invalid-id', `${path}.blockId`, 'expected a string block id');
  if (!CANVAS_ID_PATTERN.test(blockId)) {
    fail('invalid-id', `${path}.blockId`, `invalid block id "${blockId}"`);
  }
  if (!blockIds.has(blockId)) {
    fail('invalid-reference', `${path}.blockId`, `references unknown block "${blockId}"`);
  }
  const x = assertFiniteNumber(p.x, `${path}.x`, { min: -MAX_COORDINATE, max: MAX_COORDINATE });
  const y = assertFiniteNumber(p.y, `${path}.y`, { min: -MAX_COORDINATE, max: MAX_COORDINATE });
  const width = assertFiniteNumber(p.width, `${path}.width`, {
    min: 0,
    exclusiveMin: true,
    max: MAX_SIZE,
  });
  const height = assertFiniteNumber(p.height, `${path}.height`, {
    min: 0,
    exclusiveMin: true,
    max: MAX_SIZE,
  });
  const rotation =
    p.rotation === undefined
      ? 0
      : assertFiniteNumber(p.rotation, `${path}.rotation`, {
          min: -MAX_ROTATION,
          max: MAX_ROTATION,
        });
  const z =
    p.z === undefined
      ? 0
      : assertFiniteNumber(p.z, `${path}.z`, {
          min: -Number.MAX_SAFE_INTEGER,
          max: Number.MAX_SAFE_INTEGER,
        });
  if (!Number.isSafeInteger(z)) {
    fail('invalid-number', `${path}.z`, 'expected a safe integer');
  }
  const locked = p.locked === undefined ? false : p.locked;
  if (typeof locked !== 'boolean') {
    fail('invalid-type', `${path}.locked`, 'expected a boolean');
  }
  const hidden = p.hidden === undefined ? false : p.hidden;
  if (typeof hidden !== 'boolean') {
    fail('invalid-type', `${path}.hidden`, 'expected a boolean');
  }

  return Object.freeze({
    blockId: parseCanvasBlockId(blockId),
    x,
    y,
    width,
    height,
    rotation,
    z,
    locked,
    hidden,
  });
}

function normalizeClipboardPayload(raw: unknown): CanvasClipboardPayload {
  const obj = plainRecord(raw, 'payload');
  assertExactKeys(obj, PAYLOAD_KEYS, 'payload');
  if (obj.schemaVersion !== 1) {
    fail('unsupported-value', 'schemaVersion', 'expected schema version 1');
  }
  if (!Array.isArray(obj.blocks) || obj.blocks.length === 0) {
    fail('invalid-type', 'blocks', 'expected a non-empty array of blocks');
  }
  if (!Array.isArray(obj.placements)) {
    fail('invalid-type', 'placements', 'expected an array of placements');
  }

  const blockIds = new Set<string>();
  const blocks = obj.blocks.map((rawBlock: unknown, index: number): CanvasBlock => {
    const path = `blocks[${index}]`;
    const blockValue = plainRecord(rawBlock, path);
    assertExactKeys(blockValue, BLOCK_KEYS, path);
    const created = createCanvasBlock({
      id: blockValue.id as string,
      content: blockValue.content as CanvasBlock['content'],
      now: blockValue.createdAt as number,
    });
    const updated = createCanvasBlock({
      id: blockValue.id as string,
      content: blockValue.content as CanvasBlock['content'],
      now: blockValue.updatedAt as number,
    });
    if (updated.updatedAt < created.createdAt) {
      fail('invalid-number', `${path}.updatedAt`, 'updatedAt precedes createdAt');
    }
    if (blockIds.has(created.id)) {
      fail('duplicate-id', 'blocks', `duplicate block id "${created.id}"`);
    }
    blockIds.add(created.id);
    return Object.freeze({ ...created, updatedAt: updated.updatedAt });
  });

  const placedIds = new Set<string>();
  const placements = obj.placements.map((rawPlacement: unknown, index: number) => {
    const placement = validatePlacement(rawPlacement, index, blockIds);
    if (placedIds.has(placement.blockId)) {
      fail('duplicate-id', 'placements', `duplicate placement for "${placement.blockId}"`);
    }
    placedIds.add(placement.blockId);
    return placement;
  });

  return deepFreeze({ schemaVersion: 1 as const, blocks, placements });
}

/**
 * Deserializes and validates a clipboard payload from JSON.
 * Fails closed on malformed input, invalid blocks, or orphaned placements.
 */
export function deserializeClipboard(json: string): CanvasClipboardPayload {
  if (typeof json !== 'string') {
    fail('invalid-type', 'input', 'expected a JSON string');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    fail('invalid-type', 'input', 'invalid JSON');
  }

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('invalid-type', 'payload', 'expected a payload object');
  }

  return normalizeClipboardPayload(raw);
}
