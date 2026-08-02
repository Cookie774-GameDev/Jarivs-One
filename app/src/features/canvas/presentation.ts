/**
 * Canvas presentation domain.
 *
 * Framework-agnostic, deterministic, side-effect-free state machine for turning
 * canvas blocks into presentation frames ("slides") and navigating them. Frames
 * are an ordered, unique subset of canvas block ids mirroring
 * `CanvasDocument.presentationOrder`. The model supports add/remove/drag-reorder
 * with strict fail-closed validation, present-mode enter/exit, bounded keyboard
 * navigation, progress reporting, per-frame presenter notes, honest zoom-to-frame
 * camera targets (computed via the shared camera utilities), and a deterministic
 * portable snapshot for persistence and hand-off.
 *
 * Honesty guarantee: this module performs no fullscreen entry and no PDF export.
 * It only reports the capabilities the surrounding environment declares through
 * `PresentationCapabilities`; it never fabricates a successful export or a
 * fullscreen side effect. Actual execution belongs to the UI/Tauri shell layer.
 *
 * Every factory and transition validates its inputs and fails closed with a
 * `CanvasValidationError`; all returned values are deeply frozen.
 */

import {
  CANVAS_MAX_TEXT_LENGTH,
  CanvasValidationError,
  parseCanvasBlockId,
  type CanvasBlockId,
  type CanvasCamera,
  type CanvasDocument,
  type CanvasSpatialPlacement,
  type CanvasValidationErrorCode,
} from './contracts';
import { fitWorldBounds, type CanvasViewport, type CanvasWorldBounds } from './camera';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Presentation session status. */
export type PresentationStatus = 'idle' | 'presenting';

/** A canvas block promoted to a presentation frame, with presenter notes. */
export interface PresentationFrame {
  readonly id: CanvasBlockId;
  readonly notes: string;
}

/**
 * Honest capability descriptor. Populated from the real environment by the UI
 * layer; the domain never fakes fullscreen or PDF execution.
 */
export interface PresentationCapabilities {
  readonly fullscreen: boolean;
  readonly pdfExport: boolean;
}

/** Immutable presentation state machine value. */
export interface PresentationState {
  readonly status: PresentationStatus;
  readonly frames: readonly PresentationFrame[];
  /** Active frame index while presenting with frames; otherwise -1. */
  readonly currentIndex: number;
  readonly capabilities: PresentationCapabilities;
}

/** Progress summary for the active presentation. */
export interface PresentationProgress {
  readonly total: number;
  /** 1-based position of the active frame; 0 when there is none. */
  readonly current: number;
  /** 0-based active frame index; -1 when there is none. */
  readonly index: number;
  /** Completion fraction in [0, 1]; 0 when there is no active frame. */
  readonly fraction: number;
  /** Rounded completion percentage in [0, 100]. */
  readonly percent: number;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly hasActiveFrame: boolean;
}

/** One frame in a portable snapshot; ids are plain strings for serialization. */
export interface PresentationSnapshotFrame {
  readonly id: string;
  readonly notes: string;
}

/** Deterministic, JSON-portable presentation snapshot. */
export interface PresentationSnapshot {
  readonly schemaVersion: 1;
  readonly status: PresentationStatus;
  readonly currentIndex: number;
  readonly frames: readonly PresentationSnapshotFrame[];
  readonly capabilities: PresentationCapabilities;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function fail(code: CanvasValidationErrorCode, path: string, message: string): never {
  throw new CanvasValidationError(code, path, message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: string,
): void {
  const allowed = new Set(allowedKeys);
  const unknownKey = Object.keys(value).find((key) => !allowed.has(key));
  if (unknownKey !== undefined) {
    fail('unsupported-value', `${path}.${unknownKey}`, 'unknown field');
  }
}

function assertBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    fail('invalid-type', path, 'expected a boolean');
  }
  return value;
}

function assertInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    fail('invalid-number', path, 'expected an integer');
  }
  return value;
}

function assertInsertIndex(value: number, length: number): number {
  const index = assertInteger(value, 'presentation.index');
  if (index < 0 || index > length) {
    fail('invalid-number', 'presentation.index', `expected an index between 0 and ${length}`);
  }
  return index;
}

function assertFrameIndex(value: number, length: number): number {
  const index = assertInteger(value, 'presentation.index');
  if (index < 0 || index > length - 1) {
    fail('invalid-number', 'presentation.index', `expected an index between 0 and ${length - 1}`);
  }
  return index;
}

function assertNotes(value: unknown): string {
  if (typeof value !== 'string') {
    fail('invalid-type', 'presentation.notes', 'expected a string');
  }
  if (value.length > CANVAS_MAX_TEXT_LENGTH) {
    fail(
      'invalid-number',
      'presentation.notes',
      `exceeds maximum length ${CANVAS_MAX_TEXT_LENGTH}`,
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

const DEFAULT_CAPABILITIES: PresentationCapabilities = Object.freeze({
  fullscreen: false,
  pdfExport: false,
});

function makeFrame(id: CanvasBlockId, notes: string): PresentationFrame {
  return Object.freeze({ id, notes });
}

function resolveCapabilities(
  base: PresentationCapabilities,
  override?: Partial<PresentationCapabilities>,
): PresentationCapabilities {
  if (override === undefined) {
    return base;
  }
  return Object.freeze({
    fullscreen:
      override.fullscreen === undefined
        ? base.fullscreen
        : assertBoolean(override.fullscreen, 'capabilities.fullscreen'),
    pdfExport:
      override.pdfExport === undefined
        ? base.pdfExport
        : assertBoolean(override.pdfExport, 'capabilities.pdfExport'),
  });
}

function presentation(
  status: PresentationStatus,
  frames: readonly PresentationFrame[],
  currentIndex: number,
  capabilities: PresentationCapabilities,
): PresentationState {
  return Object.freeze({
    status,
    frames: Object.freeze(
      frames.map((frame) => Object.freeze({ id: frame.id, notes: frame.notes })),
    ),
    currentIndex,
    capabilities,
  });
}

/** Creates an idle presentation with no frames and honest default capabilities. */
export function createPresentation(
  capabilities?: Partial<PresentationCapabilities>,
): PresentationState {
  return presentation('idle', [], -1, resolveCapabilities(DEFAULT_CAPABILITIES, capabilities));
}

/** Promotes a document's presentation order and persisted notes to idle frames. */
export function presentationFromDocument(
  doc: CanvasDocument,
  capabilities?: Partial<PresentationCapabilities>,
): PresentationState {
  const notesByFrame = new Map(doc.presentationNotes.map((entry) => [entry.frameId, entry.text]));
  const frames = doc.presentationOrder.map((id) => makeFrame(id, notesByFrame.get(id) ?? ''));
  return presentation('idle', frames, -1, resolveCapabilities(DEFAULT_CAPABILITIES, capabilities));
}

// ---------------------------------------------------------------------------
// Frame ordering (add / remove / reorder)
// ---------------------------------------------------------------------------

function indexOfFrame(state: PresentationState, id: CanvasBlockId): number {
  return state.frames.findIndex((frame) => frame.id === id);
}

function assertKnownFrame(state: PresentationState, id: CanvasBlockId): number {
  const index = indexOfFrame(state, id);
  if (index < 0) {
    fail('invalid-reference', 'presentation.frames', `unknown frame id "${id}"`);
  }
  return index;
}

function assertUniqueFrames(frames: readonly PresentationFrame[]): void {
  const seen = new Set<CanvasBlockId>();
  for (const frame of frames) {
    if (seen.has(frame.id)) {
      fail('duplicate-id', 'presentation.frames', `duplicate frame id "${frame.id}"`);
    }
    seen.add(frame.id);
  }
}

/** Rebuilds state around a new frame list, keeping the active frame stable. */
function rebuild(
  state: PresentationState,
  frames: readonly PresentationFrame[],
): PresentationState {
  assertUniqueFrames(frames);
  if (state.status !== 'presenting') {
    return presentation('idle', frames, -1, state.capabilities);
  }
  if (frames.length === 0) {
    return presentation('presenting', frames, -1, state.capabilities);
  }
  const activeFrame = state.frames[state.currentIndex];
  const activeId = activeFrame === undefined ? undefined : activeFrame.id;
  let currentIndex: number;
  if (activeId !== undefined) {
    const found = frames.findIndex((frame) => frame.id === activeId);
    currentIndex = found >= 0 ? found : Math.min(state.currentIndex, frames.length - 1);
  } else {
    currentIndex = Math.min(Math.max(state.currentIndex, 0), frames.length - 1);
  }
  return presentation('presenting', frames, currentIndex, state.capabilities);
}

/** Adds a frame at `index` (appends when omitted). Rejects duplicate ids. */
export function addFrame(state: PresentationState, id: string, index?: number): PresentationState {
  const frameId = parseCanvasBlockId(id);
  if (indexOfFrame(state, frameId) >= 0) {
    fail('duplicate-id', 'presentation.frames', `duplicate frame id "${frameId}"`);
  }
  const insertAt =
    index === undefined ? state.frames.length : assertInsertIndex(index, state.frames.length);
  const frames = [
    ...state.frames.slice(0, insertAt),
    makeFrame(frameId, ''),
    ...state.frames.slice(insertAt),
  ];
  return rebuild(state, frames);
}

/** Removes a frame. Rejects unknown ids. */
export function removeFrame(state: PresentationState, id: string): PresentationState {
  const frameId = parseCanvasBlockId(id);
  const index = assertKnownFrame(state, frameId);
  const frames = [...state.frames.slice(0, index), ...state.frames.slice(index + 1)];
  return rebuild(state, frames);
}

/** Moves a frame to `toIndex` (drag reorder). Rejects unknown ids and bad indices. */
export function moveFrame(
  state: PresentationState,
  id: string,
  toIndex: number,
): PresentationState {
  const frameId = parseCanvasBlockId(id);
  const from = assertKnownFrame(state, frameId);
  const target = assertFrameIndex(toIndex, state.frames.length);
  if (from === target) {
    return state;
  }
  const remaining = state.frames.filter((_, i) => i !== from);
  const moved = state.frames[from];
  const frames = [...remaining.slice(0, target), moved, ...remaining.slice(target)];
  return rebuild(state, frames);
}

/** Replaces the full frame order, preserving notes for retained ids. */
export function setFrames(state: PresentationState, ids: readonly string[]): PresentationState {
  const notesById = new Map<CanvasBlockId, string>(
    state.frames.map((frame) => [frame.id, frame.notes]),
  );
  const frames = ids.map((rawId) => {
    const frameId = parseCanvasBlockId(rawId);
    return makeFrame(frameId, notesById.get(frameId) ?? '');
  });
  return rebuild(state, frames);
}

// ---------------------------------------------------------------------------
// Present mode enter / exit
// ---------------------------------------------------------------------------

/** Enters present mode at the first frame (idempotent when already presenting). */
export function enterPresentMode(state: PresentationState): PresentationState {
  if (state.status === 'presenting') {
    return state;
  }
  const currentIndex = state.frames.length > 0 ? 0 : -1;
  return presentation('presenting', state.frames, currentIndex, state.capabilities);
}

/** Exits present mode and clears the active index (idempotent when idle). */
export function exitPresentMode(state: PresentationState): PresentationState {
  if (state.status === 'idle') {
    return state;
  }
  return presentation('idle', state.frames, -1, state.capabilities);
}

// ---------------------------------------------------------------------------
// Keyboard navigation (bounded; never wraps)
// ---------------------------------------------------------------------------

/** Advances to the next frame, clamping at the last frame. No-op unless presenting. */
export function nextFrame(state: PresentationState): PresentationState {
  if (state.status !== 'presenting' || state.currentIndex >= state.frames.length - 1) {
    return state;
  }
  return presentation('presenting', state.frames, state.currentIndex + 1, state.capabilities);
}

/** Returns to the previous frame, clamping at the first frame. No-op unless presenting. */
export function previousFrame(state: PresentationState): PresentationState {
  if (state.status !== 'presenting' || state.currentIndex <= 0) {
    return state;
  }
  return presentation('presenting', state.frames, state.currentIndex - 1, state.capabilities);
}

/** Jumps to `index`, clamping to the frame bounds. Requires an integer index. */
export function goToFrame(state: PresentationState, index: number): PresentationState {
  assertInteger(index, 'presentation.index');
  if (state.status !== 'presenting' || state.frames.length === 0) {
    return state;
  }
  const clamped = Math.min(state.frames.length - 1, Math.max(0, index));
  if (clamped === state.currentIndex) {
    return state;
  }
  return presentation('presenting', state.frames, clamped, state.capabilities);
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

/** Reports honest progress for the active presentation. */
export function presentationProgress(state: PresentationState): PresentationProgress {
  const total = state.frames.length;
  const index = state.currentIndex;
  const hasActiveFrame = state.status === 'presenting' && index >= 0 && index < total;
  const fraction = hasActiveFrame ? (index + 1) / total : 0;
  return Object.freeze({
    total,
    current: hasActiveFrame ? index + 1 : 0,
    index,
    fraction,
    percent: Math.round(fraction * 100),
    isFirst: hasActiveFrame && index === 0,
    isLast: hasActiveFrame && index === total - 1,
    hasActiveFrame,
  });
}

// ---------------------------------------------------------------------------
// Zoom-to-frame targets (honest; reuses shared camera utilities)
// ---------------------------------------------------------------------------

function placementBounds(placement: CanvasSpatialPlacement): CanvasWorldBounds {
  return Object.freeze({
    x: placement.x,
    y: placement.y,
    width: placement.width,
    height: placement.height,
  });
}

/**
 * Computes the camera that fits the frame at `index` into `viewport`, or
 * `undefined` when that frame has no spatial placement to zoom to. Never fakes
 * a target.
 */
export function frameZoomTarget(
  state: PresentationState,
  index: number,
  placements: readonly CanvasSpatialPlacement[],
  viewport: CanvasViewport,
  padding?: number,
): CanvasCamera | undefined {
  assertFrameIndex(index, state.frames.length);
  const frame = state.frames[index];
  const placement = placements.find((candidate) => candidate.blockId === frame.id);
  if (placement === undefined) {
    return undefined;
  }
  const bounds = placementBounds(placement);
  return padding === undefined
    ? fitWorldBounds(bounds, viewport)
    : fitWorldBounds(bounds, viewport, padding);
}

/** Zoom target for the active frame, or `undefined` when nothing is active. */
export function activeFrameZoomTarget(
  state: PresentationState,
  placements: readonly CanvasSpatialPlacement[],
  viewport: CanvasViewport,
  padding?: number,
): CanvasCamera | undefined {
  if (
    state.status !== 'presenting' ||
    state.currentIndex < 0 ||
    state.currentIndex >= state.frames.length
  ) {
    return undefined;
  }
  return frameZoomTarget(state, state.currentIndex, placements, viewport, padding);
}

// ---------------------------------------------------------------------------
// Presenter notes
// ---------------------------------------------------------------------------

/** Sets presenter notes for a frame. Rejects unknown ids and oversized notes. */
export function setFrameNotes(
  state: PresentationState,
  id: string,
  notes: string,
): PresentationState {
  const frameId = parseCanvasBlockId(id);
  const validatedNotes = assertNotes(notes);
  const index = assertKnownFrame(state, frameId);
  const frames = state.frames.map((frame, i) =>
    i === index ? makeFrame(frameId, validatedNotes) : frame,
  );
  return presentation(state.status, frames, state.currentIndex, state.capabilities);
}

/** Reads presenter notes for a frame. Rejects unknown ids. */
export function frameNotes(state: PresentationState, id: string): string {
  const frameId = parseCanvasBlockId(id);
  const index = assertKnownFrame(state, frameId);
  return state.frames[index].notes;
}

// ---------------------------------------------------------------------------
// Deterministic portable state
// ---------------------------------------------------------------------------

/** Serializes to a deterministic, JSON-portable snapshot. */
export function serializePresentation(state: PresentationState): PresentationSnapshot {
  return Object.freeze({
    schemaVersion: 1,
    status: state.status,
    currentIndex: state.currentIndex,
    frames: Object.freeze(
      state.frames.map((frame) => Object.freeze({ id: frame.id as string, notes: frame.notes })),
    ),
    capabilities: Object.freeze({
      fullscreen: state.capabilities.fullscreen,
      pdfExport: state.capabilities.pdfExport,
    }),
  });
}

function deserializeCapabilities(value: unknown): PresentationCapabilities {
  if (!isPlainObject(value)) {
    fail('invalid-type', 'presentation.capabilities', 'expected an object');
  }
  assertExactKeys(value, ['fullscreen', 'pdfExport'], 'presentation.capabilities');
  return Object.freeze({
    fullscreen: assertBoolean(value.fullscreen, 'presentation.capabilities.fullscreen'),
    pdfExport: assertBoolean(value.pdfExport, 'presentation.capabilities.pdfExport'),
  });
}

function deserializeCurrentIndex(
  value: unknown,
  status: PresentationStatus,
  frameCount: number,
): number {
  const index = assertInteger(value, 'presentation.currentIndex');
  if (status === 'idle') {
    if (index !== -1) {
      fail('invalid-number', 'presentation.currentIndex', 'idle presentation must use index -1');
    }
    return -1;
  }
  if (frameCount === 0) {
    if (index !== -1) {
      fail('invalid-number', 'presentation.currentIndex', 'empty presentation must use index -1');
    }
    return -1;
  }
  if (index < 0 || index > frameCount - 1) {
    fail(
      'invalid-number',
      'presentation.currentIndex',
      `expected an index between 0 and ${frameCount - 1}`,
    );
  }
  return index;
}

/** Strictly validates and rebuilds a presentation from a portable snapshot. */
export function deserializePresentation(snapshot: unknown): PresentationState {
  if (!isPlainObject(snapshot)) {
    fail('invalid-type', 'presentation', 'expected a snapshot object');
  }
  assertExactKeys(
    snapshot,
    ['schemaVersion', 'status', 'currentIndex', 'frames', 'capabilities'],
    'presentation',
  );
  if (snapshot.schemaVersion !== 1) {
    fail('unsupported-value', 'presentation.schemaVersion', 'expected schema version 1');
  }
  if (snapshot.status !== 'idle' && snapshot.status !== 'presenting') {
    fail('unsupported-value', 'presentation.status', "expected 'idle' or 'presenting'");
  }
  const status = snapshot.status as PresentationStatus;
  if (!Array.isArray(snapshot.frames)) {
    fail('invalid-type', 'presentation.frames', 'expected an array');
  }
  const frames: PresentationFrame[] = snapshot.frames.map((entry, index) => {
    if (!isPlainObject(entry)) {
      fail('invalid-type', `presentation.frames[${index}]`, 'expected an object');
    }
    assertExactKeys(entry, ['id', 'notes'], `presentation.frames[${index}]`);
    const frameId = parseCanvasBlockId(entry.id);
    const notes = assertNotes(entry.notes);
    return makeFrame(frameId, notes);
  });
  assertUniqueFrames(frames);
  const capabilities = deserializeCapabilities(snapshot.capabilities);
  const currentIndex = deserializeCurrentIndex(snapshot.currentIndex, status, frames.length);
  return presentation(status, frames, currentIndex, capabilities);
}

// ---------------------------------------------------------------------------
// Honest capabilities
// ---------------------------------------------------------------------------

/** Updates declared capabilities. Rejects non-boolean values. Performs no side effect. */
export function withCapabilities(
  state: PresentationState,
  capabilities: Partial<PresentationCapabilities>,
): PresentationState {
  const resolved = resolveCapabilities(state.capabilities, capabilities);
  if (resolved === state.capabilities) {
    return state;
  }
  return presentation(state.status, state.frames, state.currentIndex, resolved);
}

/** Honest query: can the environment enter fullscreen? (no side effect) */
export function canEnterFullscreen(state: PresentationState): boolean {
  return state.capabilities.fullscreen;
}

/** Honest query: can the environment export PDF? (no side effect) */
export function canExportPdf(state: PresentationState): boolean {
  return state.capabilities.pdfExport;
}
