/**
 * Pressure-aware Canvas stroke engine foundation.
 *
 * Framework-agnostic, deterministic, side-effect-free stroke primitives for
 * the infinite idea canvas. Normalizes mouse/touch/stylus pointer samples
 * (pressure and tilt where available), resolves genuinely distinct typed pen
 * presets, applies smoothing/streamline/stabilization, generates
 * variable-width outlines, and provides bounds, hit testing, and a bounded
 * serialized stroke format. Every entry point validates its inputs and fails
 * closed with a `CanvasValidationError`; all returned values are deeply
 * frozen. Rendering/painting is intentionally left to higher layers.
 */

import {
  CANVAS_ID_PATTERN,
  CanvasValidationError,
  type CanvasValidationErrorCode,
} from './contracts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CANVAS_STROKE_SCHEMA_VERSION = 1;
export const CANVAS_MAX_STROKE_POINTS = 8192;
export const CANVAS_STROKE_MAX_COORDINATE = 1_000_000_000;
export const CANVAS_STROKE_MAX_WIDTH = 1000;
export const CANVAS_STROKE_MAX_RESOLVED_WIDTH = 2 * CANVAS_STROKE_MAX_WIDTH;
export const CANVAS_DEFAULT_PRESSURE = 0.5;
export const CANVAS_MAX_TILT = 90;

const MIN_WIDTH_FACTOR = 0.05;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export const CANVAS_POINTER_KINDS = ['mouse', 'touch', 'stylus'] as const;
export type CanvasPointerKind = (typeof CANVAS_POINTER_KINDS)[number];

export const CANVAS_PEN_KINDS = [
  'pen',
  'ballpoint',
  'marker',
  'highlighter',
  'eraser',
  'fountain-pen',
  'technical-pen',
] as const;
export type CanvasPenKind = (typeof CANVAS_PEN_KINDS)[number];

export type CanvasStrokeBlend = 'source-over' | 'multiply' | 'destination-out';

export const CANVAS_STROKE_BLENDS: readonly CanvasStrokeBlend[] = [
  'source-over',
  'multiply',
  'destination-out',
];

// ---------------------------------------------------------------------------
// Validation helpers (module-local, mirroring contracts.ts conventions)
// ---------------------------------------------------------------------------

function fail(code: CanvasValidationErrorCode, path: string, message: string): never {
  throw new CanvasValidationError(code, path, message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function assertUnit(value: unknown, path: string): number {
  return assertFiniteNumber(value, path, { min: 0, max: 1 });
}

function assertString(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    fail('invalid-type', path, 'expected a string');
  }
  return value;
}

function assertId(value: unknown, path: string): string {
  const text = assertString(value, path);
  if (!CANVAS_ID_PATTERN.test(text)) {
    fail('invalid-id', path, 'expected a stable id matching /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/');
  }
  return text;
}

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
    Object.freeze(value);
  } else if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CanvasPointerSampleInput {
  readonly x: number;
  readonly y: number;
  readonly pressure?: number;
  readonly tiltX?: number;
  readonly tiltY?: number;
  readonly timestamp?: number;
  readonly kind?: CanvasPointerKind;
}

export interface CanvasPointerSample {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly tiltX: number;
  readonly tiltY: number;
  readonly timestamp: number;
  readonly kind: CanvasPointerKind;
}

export interface CanvasPenPreset {
  readonly kind: CanvasPenKind;
  readonly color: string;
  readonly baseWidth: number;
  readonly opacity: number;
  readonly pressureSensitivity: number;
  readonly smoothing: number;
  readonly streamline: number;
  readonly stabilization: number;
  readonly blend: CanvasStrokeBlend;
  readonly variableWidth: boolean;
}

export interface CanvasStrokeStyleInput {
  readonly pen: CanvasPenKind;
  readonly color?: string;
  readonly opacity?: number;
  readonly width?: number;
  readonly pressureSensitivity?: number;
  readonly smoothing?: number;
  readonly streamline?: number;
  readonly stabilization?: number;
}

export interface CanvasStrokeStyle {
  readonly pen: CanvasPenKind;
  readonly color: string;
  readonly opacity: number;
  readonly baseWidth: number;
  readonly pressureSensitivity: number;
  readonly smoothing: number;
  readonly streamline: number;
  readonly stabilization: number;
  readonly blend: CanvasStrokeBlend;
  readonly variableWidth: boolean;
}

/** Working centerline point carrying normalized pressure. */
export interface CanvasStrokeSamplePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
}

/** Final centerline point with its resolved variable width. */
export interface CanvasStrokeCenterPoint {
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

export interface CanvasStrokeOutlinePoint {
  readonly x: number;
  readonly y: number;
}

export interface CanvasStrokeBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

declare const canvasStrokeBrand: unique symbol;
export type CanvasStrokeId = string & { [canvasStrokeBrand]: 'CanvasStrokeId' };

export interface CanvasStroke {
  readonly id: CanvasStrokeId;
  readonly style: CanvasStrokeStyle;
  readonly center: readonly CanvasStrokeCenterPoint[];
  readonly outline: readonly CanvasStrokeOutlinePoint[];
  readonly bounds: CanvasStrokeBounds;
}

export interface CanvasStrokeInput {
  readonly id: string;
  readonly style: CanvasStrokeStyleInput;
  readonly samples: readonly CanvasPointerSampleInput[];
}

// ---------------------------------------------------------------------------
// Pen presets
// ---------------------------------------------------------------------------

export const CANVAS_PEN_PRESETS: Readonly<Record<CanvasPenKind, CanvasPenPreset>> = Object.freeze({
  pen: Object.freeze({
    kind: 'pen',
    color: '#000000',
    baseWidth: 4,
    opacity: 1,
    pressureSensitivity: 0.5,
    smoothing: 0.5,
    streamline: 0.3,
    stabilization: 0.2,
    blend: 'source-over',
    variableWidth: true,
  }),
  ballpoint: Object.freeze({
    kind: 'ballpoint',
    color: '#000000',
    baseWidth: 2,
    opacity: 1,
    pressureSensitivity: 0.15,
    smoothing: 0.2,
    streamline: 0.15,
    stabilization: 0.05,
    blend: 'source-over',
    variableWidth: true,
  }),
  marker: Object.freeze({
    kind: 'marker',
    color: '#000000',
    baseWidth: 8,
    opacity: 0.9,
    pressureSensitivity: 0.7,
    smoothing: 0.6,
    streamline: 0.4,
    stabilization: 0.3,
    blend: 'source-over',
    variableWidth: true,
  }),
  highlighter: Object.freeze({
    kind: 'highlighter',
    color: '#ffe14d',
    baseWidth: 18,
    opacity: 0.35,
    pressureSensitivity: 0,
    smoothing: 0.7,
    streamline: 0.5,
    stabilization: 0.4,
    blend: 'multiply',
    variableWidth: false,
  }),
  eraser: Object.freeze({
    kind: 'eraser',
    color: '#000000',
    baseWidth: 24,
    opacity: 1,
    pressureSensitivity: 0.3,
    smoothing: 0.5,
    streamline: 0.3,
    stabilization: 0.2,
    blend: 'destination-out',
    variableWidth: true,
  }),
  'fountain-pen': Object.freeze({
    kind: 'fountain-pen',
    color: '#1a1a2e',
    baseWidth: 6,
    opacity: 1,
    pressureSensitivity: 0.85,
    smoothing: 0.45,
    streamline: 0.25,
    stabilization: 0.15,
    blend: 'source-over',
    variableWidth: true,
  }),
  'technical-pen': Object.freeze({
    kind: 'technical-pen',
    color: '#000000',
    baseWidth: 1.5,
    opacity: 1,
    pressureSensitivity: 0.05,
    smoothing: 0.15,
    streamline: 0.1,
    stabilization: 0.05,
    blend: 'source-over',
    variableWidth: false,
  }),
});
// ---------------------------------------------------------------------------
// Pointer sample normalization
// ---------------------------------------------------------------------------

const POINTER_SAMPLE_KEYS = new Set(['x', 'y', 'pressure', 'tiltX', 'tiltY', 'timestamp', 'kind']);

export function normalizePointerSample(input: unknown, index = 0): CanvasPointerSample {
  if (!isPlainObject(input)) {
    fail('invalid-type', 'sample', 'expected a pointer sample object');
  }
  assertExactKeys(input, POINTER_SAMPLE_KEYS, 'sample');
  const coordinateBounds: FiniteNumberBounds = {
    min: -CANVAS_STROKE_MAX_COORDINATE,
    max: CANVAS_STROKE_MAX_COORDINATE,
  };
  const x = assertFiniteNumber(input.x, 'sample.x', coordinateBounds);
  const y = assertFiniteNumber(input.y, 'sample.y', coordinateBounds);
  const pressure =
    input.pressure === undefined
      ? CANVAS_DEFAULT_PRESSURE
      : assertFiniteNumber(input.pressure, 'sample.pressure', { min: 0, max: 1 });
  const tiltX =
    input.tiltX === undefined
      ? 0
      : assertFiniteNumber(input.tiltX, 'sample.tiltX', {
          min: -CANVAS_MAX_TILT,
          max: CANVAS_MAX_TILT,
        });
  const tiltY =
    input.tiltY === undefined
      ? 0
      : assertFiniteNumber(input.tiltY, 'sample.tiltY', {
          min: -CANVAS_MAX_TILT,
          max: CANVAS_MAX_TILT,
        });
  let timestamp: number;
  if (input.timestamp === undefined) {
    timestamp = index;
  } else {
    if (typeof input.timestamp !== 'number' || !Number.isSafeInteger(input.timestamp)) {
      fail('invalid-timestamp', 'sample.timestamp', 'expected an integer timestamp');
    }
    if (input.timestamp < 0) {
      fail('invalid-timestamp', 'sample.timestamp', 'timestamp must be non-negative');
    }
    timestamp = input.timestamp;
  }
  let kind: CanvasPointerKind = 'mouse';
  if (input.kind !== undefined) {
    const raw = assertString(input.kind, 'sample.kind');
    if (!CANVAS_POINTER_KINDS.includes(raw as CanvasPointerKind)) {
      fail('unsupported-value', 'sample.kind', `unsupported pointer kind "${raw}"`);
    }
    kind = raw as CanvasPointerKind;
  }
  return deepFreeze({ x, y, pressure, tiltX, tiltY, timestamp, kind });
}

export function normalizePointerSamples(inputs: unknown): readonly CanvasPointerSample[] {
  if (!Array.isArray(inputs)) {
    fail('invalid-type', 'samples', 'expected an array of pointer samples');
  }
  if (inputs.length === 0) {
    fail('unsupported-value', 'samples', 'a stroke requires at least one sample');
  }
  if (inputs.length > CANVAS_MAX_STROKE_POINTS) {
    fail('unsupported-value', 'samples', `stroke exceeds ${CANVAS_MAX_STROKE_POINTS} points`);
  }
  const samples = inputs.map((input, index) => normalizePointerSample(input, index));
  for (let i = 1; i < samples.length; i += 1) {
    if (samples[i].timestamp < samples[i - 1].timestamp) {
      fail('unsupported-value', `samples[${i}].timestamp`, 'timestamps must not decrease');
    }
  }
  return deepFreeze(samples);
}

/**
 * Converts a stylus tilt vector into a nib orientation angle in degrees.
 * Round nibs ignore this; chisel rendering layers can use it to rotate the
 * tip. A flat stylus (no tilt) yields angle 0.
 */
export function tiltToNibAngle(tiltX: unknown, tiltY: unknown): number {
  const x = assertFiniteNumber(tiltX, 'tiltX', { min: -CANVAS_MAX_TILT, max: CANVAS_MAX_TILT });
  const y = assertFiniteNumber(tiltY, 'tiltY', { min: -CANVAS_MAX_TILT, max: CANVAS_MAX_TILT });
  if (x === 0 && y === 0) {
    return 0;
  }
  return (Math.atan2(y, x) * 180) / Math.PI;
}

// ---------------------------------------------------------------------------
// Stroke style resolution
// ---------------------------------------------------------------------------

const STYLE_KEYS = new Set([
  'pen',
  'color',
  'opacity',
  'width',
  'pressureSensitivity',
  'smoothing',
  'streamline',
  'stabilization',
]);

export function resolveStrokeStyle(input: unknown): CanvasStrokeStyle {
  if (!isPlainObject(input)) {
    fail('invalid-type', 'style', 'expected a stroke style object');
  }
  assertExactKeys(input, STYLE_KEYS, 'style');
  const rawPen = assertString(input.pen, 'style.pen');
  if (!CANVAS_PEN_KINDS.includes(rawPen as CanvasPenKind)) {
    fail('unsupported-value', 'style.pen', `unsupported pen "${rawPen}"`);
  }
  const preset = CANVAS_PEN_PRESETS[rawPen as CanvasPenKind];
  let color = preset.color;
  if (input.color !== undefined) {
    color = assertString(input.color, 'style.color');
    if (!COLOR_PATTERN.test(color)) {
      fail('unsupported-value', 'style.color', 'expected a #rrggbb hex color');
    }
  }
  const opacity =
    input.opacity === undefined
      ? preset.opacity
      : assertFiniteNumber(input.opacity, 'style.opacity', { min: 0, max: 1 });
  const baseWidth =
    input.width === undefined
      ? preset.baseWidth
      : assertFiniteNumber(input.width, 'style.width', {
          min: 0,
          exclusiveMin: true,
          max: CANVAS_STROKE_MAX_WIDTH,
        });
  const pressureSensitivity =
    input.pressureSensitivity === undefined
      ? preset.pressureSensitivity
      : assertUnit(input.pressureSensitivity, 'style.pressureSensitivity');
  const smoothing =
    input.smoothing === undefined
      ? preset.smoothing
      : assertUnit(input.smoothing, 'style.smoothing');
  const streamline =
    input.streamline === undefined
      ? preset.streamline
      : assertUnit(input.streamline, 'style.streamline');
  const stabilization =
    input.stabilization === undefined
      ? preset.stabilization
      : assertUnit(input.stabilization, 'style.stabilization');
  return deepFreeze({
    pen: preset.kind,
    color,
    opacity,
    baseWidth,
    pressureSensitivity,
    smoothing,
    streamline,
    stabilization,
    blend: preset.blend,
    variableWidth: preset.variableWidth,
  });
}
// ---------------------------------------------------------------------------
// Centerline processing: stabilization, smoothing, streamlining, widths
// ---------------------------------------------------------------------------

function assertSamplePoint(point: unknown, path: string): CanvasStrokeSamplePoint {
  if (!isPlainObject(point)) {
    fail('invalid-type', path, 'expected a stroke point object');
  }
  const coordinateBounds: FiniteNumberBounds = {
    min: -CANVAS_STROKE_MAX_COORDINATE,
    max: CANVAS_STROKE_MAX_COORDINATE,
  };
  const x = assertFiniteNumber(point.x, `${path}.x`, coordinateBounds);
  const y = assertFiniteNumber(point.y, `${path}.y`, coordinateBounds);
  const pressure = assertFiniteNumber(point.pressure, `${path}.pressure`, { min: 0, max: 1 });
  return { x, y, pressure };
}

function assertSamplePoints(points: unknown, path: string): readonly CanvasStrokeSamplePoint[] {
  if (!Array.isArray(points)) {
    fail('invalid-type', path, 'expected an array of stroke points');
  }
  if (points.length === 0) {
    fail('unsupported-value', path, 'stroke points must not be empty');
  }
  if (points.length > CANVAS_MAX_STROKE_POINTS) {
    fail('unsupported-value', path, `stroke exceeds ${CANVAS_MAX_STROKE_POINTS} points`);
  }
  return points.map((point, index) => assertSamplePoint(point, `${path}[${index}]`));
}

/**
 * Low-pass stabilizer: each output point chases the input through a running
 * anchor. Amount 0 is the identity; amount 1 freezes the stroke at its first
 * point. Reduces hand jitter while preserving the starting point.
 */
export function stabilizeStrokePoints(
  points: readonly CanvasStrokeSamplePoint[],
  amount: number,
): readonly CanvasStrokeSamplePoint[] {
  const input = assertSamplePoints(points, 'points');
  const strength = assertUnit(amount, 'amount');
  if (strength === 0) {
    return deepFreeze(input.map((point) => ({ ...point })));
  }
  const keep = 1 - strength;
  const out: CanvasStrokeSamplePoint[] = [{ ...input[0] }];
  let anchor = input[0];
  for (let i = 1; i < input.length; i += 1) {
    const next = input[i];
    anchor = {
      x: anchor.x + (next.x - anchor.x) * keep,
      y: anchor.y + (next.y - anchor.y) * keep,
      pressure: anchor.pressure + (next.pressure - anchor.pressure) * keep,
    };
    out.push({ ...anchor });
  }
  return deepFreeze(out);
}

/**
 * Weighted moving-average smoothing. Interior points move toward the average
 * of themselves and their two neighbors by `amount`; endpoints are fixed.
 */
export function smoothStrokePoints(
  points: readonly CanvasStrokeSamplePoint[],
  amount: number,
): readonly CanvasStrokeSamplePoint[] {
  const input = assertSamplePoints(points, 'points');
  const strength = assertUnit(amount, 'amount');
  if (strength === 0 || input.length < 3) {
    return deepFreeze(input.map((point) => ({ ...point })));
  }
  const out: CanvasStrokeSamplePoint[] = [{ ...input[0] }];
  for (let i = 1; i < input.length - 1; i += 1) {
    const prev = input[i - 1];
    const cur = input[i];
    const next = input[i + 1];
    out.push({
      x: cur.x + ((prev.x + cur.x + next.x) / 3 - cur.x) * strength,
      y: cur.y + ((prev.y + cur.y + next.y) / 3 - cur.y) * strength,
      pressure:
        cur.pressure +
        ((prev.pressure + cur.pressure + next.pressure) / 3 - cur.pressure) * strength,
    });
  }
  out.push({ ...input[input.length - 1] });
  return deepFreeze(out);
}

/**
 * Arc-length resampling: walks the polyline emitting evenly spaced points at
 * `spacing` world units, interpolating pressure. The first and last input
 * points are always preserved. Coincident runs collapse to a single point.
 */
export function streamlineStrokePoints(
  points: readonly CanvasStrokeSamplePoint[],
  spacing: number,
): readonly CanvasStrokeSamplePoint[] {
  const input = assertSamplePoints(points, 'points');
  const step = assertFiniteNumber(spacing, 'spacing', { min: 0, exclusiveMin: true });
  const out: CanvasStrokeSamplePoint[] = [{ ...input[0] }];
  let last = input[0];
  let distanceToNext = step;
  for (let i = 1; i < input.length; i += 1) {
    const target = input[i];
    let remaining = Math.hypot(target.x - last.x, target.y - last.y);
    if (remaining === 0) {
      continue;
    }
    let from = last;
    while (remaining >= distanceToNext) {
      const t = distanceToNext / remaining;
      const emitted = {
        x: from.x + (target.x - from.x) * t,
        y: from.y + (target.y - from.y) * t,
        pressure: from.pressure + (target.pressure - from.pressure) * t,
      };
      out.push(emitted);
      from = emitted;
      remaining -= distanceToNext;
      distanceToNext = step;
    }
    distanceToNext -= remaining;
    last = target;
  }
  const tail = input[input.length - 1];
  const lastOut = out[out.length - 1];
  if (Math.hypot(tail.x - lastOut.x, tail.y - lastOut.y) > 1e-9) {
    out.push({ ...tail });
  }
  return deepFreeze(out);
}

function strokeWidth(pressure: number, style: CanvasStrokeStyle): number {
  if (!style.variableWidth) {
    return Math.min(style.baseWidth, CANVAS_STROKE_MAX_RESOLVED_WIDTH);
  }
  const sensitivity = style.pressureSensitivity;
  const factor = Math.max(MIN_WIDTH_FACTOR, 1 - sensitivity + 2 * sensitivity * pressure);
  return Math.min(style.baseWidth * factor, CANVAS_STROKE_MAX_RESOLVED_WIDTH);
}

/** Resolves per-point variable widths from pressure for a resolved style. */
export function computeStrokeWidths(
  points: readonly CanvasStrokeSamplePoint[],
  style: CanvasStrokeStyle,
): readonly CanvasStrokeCenterPoint[] {
  const input = assertSamplePoints(points, 'points');
  return deepFreeze(
    input.map((point) => ({ x: point.x, y: point.y, width: strokeWidth(point.pressure, style) })),
  );
}

// ---------------------------------------------------------------------------
// Outline, bounds, hit testing
// ---------------------------------------------------------------------------

function assertCenterPoint(point: unknown, path: string): CanvasStrokeCenterPoint {
  if (!isPlainObject(point)) {
    fail('invalid-type', path, 'expected a stroke center point object');
  }
  const coordinateBounds: FiniteNumberBounds = {
    min: -CANVAS_STROKE_MAX_COORDINATE,
    max: CANVAS_STROKE_MAX_COORDINATE,
  };
  const x = assertFiniteNumber(point.x, `${path}.x`, coordinateBounds);
  const y = assertFiniteNumber(point.y, `${path}.y`, coordinateBounds);
  const width = assertFiniteNumber(point.width, `${path}.width`, {
    min: 0,
    exclusiveMin: true,
    max: CANVAS_STROKE_MAX_RESOLVED_WIDTH,
  });
  return { x, y, width };
}

/**
 * Builds the closed variable-width outline polygon for a centerline: two
 * rails offset by half the local width along the path normal. A single point
 * becomes a diamond dot.
 */
export function buildStrokeOutline(
  center: readonly CanvasStrokeCenterPoint[],
): readonly CanvasStrokeOutlinePoint[] {
  if (!Array.isArray(center)) {
    fail('invalid-type', 'center', 'expected an array of stroke center points');
  }
  if (center.length === 0) {
    fail('unsupported-value', 'center', 'stroke outline requires at least one point');
  }
  const points = center.map((point, index) => assertCenterPoint(point, `center[${index}]`));
  if (points.length === 1) {
    const point = points[0];
    const half = point.width / 2;
    return deepFreeze([
      { x: point.x, y: point.y - half },
      { x: point.x + half, y: point.y },
      { x: point.x, y: point.y + half },
      { x: point.x - half, y: point.y },
    ]);
  }
  const left: CanvasStrokeOutlinePoint[] = [];
  const right: CanvasStrokeOutlinePoint[] = [];
  let prevNormal = { x: 0, y: 1 };
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const length = Math.hypot(tx, ty);
    let normal: CanvasStrokeOutlinePoint;
    if (length === 0) {
      normal = prevNormal;
    } else {
      normal = { x: -ty / length, y: tx / length };
      prevNormal = normal;
    }
    const half = point.width / 2;
    left.push({ x: point.x + normal.x * half, y: point.y + normal.y * half });
    right.push({ x: point.x - normal.x * half, y: point.y - normal.y * half });
  }
  right.reverse();
  return deepFreeze([...left, ...right]);
}

/** Axis-aligned bounds of an outline polygon. */
export function computeStrokeBounds(
  outline: readonly CanvasStrokeOutlinePoint[],
): CanvasStrokeBounds {
  if (!Array.isArray(outline)) {
    fail('invalid-type', 'outline', 'expected an array of stroke outline points');
  }
  if (outline.length === 0) {
    fail('unsupported-value', 'outline', 'stroke bounds require at least one point');
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const raw of outline) {
    if (!isPlainObject(raw)) {
      fail('invalid-type', 'outline.point', 'expected a stroke outline point object');
    }
    const x = assertFiniteNumber(raw.x, 'outline.point.x');
    const y = assertFiniteNumber(raw.y, 'outline.point.y');
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return deepFreeze({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
}

/**
 * Hit-tests a world point against a stroke: the minimum distance to the
 * centerline polyline, reduced by the interpolated half-width, must fall
 * within `tolerance`. Uses the stroke bounds for a cheap early reject.
 */
export function hitTestStroke(stroke: CanvasStroke, target: unknown, tolerance = 0): boolean {
  if (!isPlainObject(target)) {
    fail('invalid-type', 'target', 'expected a target point object');
  }
  const coordinateBounds: FiniteNumberBounds = {
    min: -CANVAS_STROKE_MAX_COORDINATE,
    max: CANVAS_STROKE_MAX_COORDINATE,
  };
  const tx = assertFiniteNumber(target.x, 'target.x', coordinateBounds);
  const ty = assertFiniteNumber(target.y, 'target.y', coordinateBounds);
  const slack = assertFiniteNumber(tolerance, 'tolerance', { min: 0 });
  const center = stroke.center;
  let maxHalf = 0;
  for (const point of center) {
    maxHalf = Math.max(maxHalf, point.width / 2);
  }
  const bounds = stroke.bounds;
  if (
    tx < bounds.x - maxHalf - slack ||
    tx > bounds.x + bounds.width + maxHalf + slack ||
    ty < bounds.y - maxHalf - slack ||
    ty > bounds.y + bounds.height + maxHalf + slack
  ) {
    return false;
  }
  if (center.length === 1) {
    const point = center[0];
    return Math.hypot(tx - point.x, ty - point.y) - point.width / 2 <= slack;
  }
  for (let i = 0; i < center.length - 1; i += 1) {
    const a = center[i];
    const b = center[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    let t = lengthSquared === 0 ? 0 : ((tx - a.x) * dx + (ty - a.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    const closestX = a.x + dx * t;
    const closestY = a.y + dy * t;
    const halfWidth = (a.width + (b.width - a.width) * t) / 2;
    if (Math.hypot(tx - closestX, ty - closestY) - halfWidth <= slack) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Stroke building pipeline
// ---------------------------------------------------------------------------

const STROKE_KEYS = new Set(['id', 'style', 'samples']);

/**
 * Builds a complete stroke: normalize samples, stabilize, smooth, streamline,
 * resolve variable widths, then derive the outline and bounds. Deterministic
 * and side-effect-free.
 */
export function buildStroke(input: unknown): CanvasStroke {
  if (!isPlainObject(input)) {
    fail('invalid-type', 'stroke', 'expected a stroke input object');
  }
  assertExactKeys(input, STROKE_KEYS, 'stroke');
  const id = assertId(input.id, 'stroke.id') as CanvasStrokeId;
  const style = resolveStrokeStyle(input.style);
  const samples = normalizePointerSamples(input.samples);
  let working: readonly CanvasStrokeSamplePoint[] = samples.map((sample) => ({
    x: sample.x,
    y: sample.y,
    pressure: sample.pressure,
  }));
  if (style.stabilization > 0) {
    working = stabilizeStrokePoints(working, style.stabilization);
  }
  if (style.smoothing > 0) {
    working = smoothStrokePoints(working, style.smoothing);
  }
  if (style.streamline > 0) {
    const spacing = Math.max(0.5, style.baseWidth * (1.25 - style.streamline));
    working = streamlineStrokePoints(working, spacing);
  }
  const center = computeStrokeWidths(working, style);
  const outline = buildStrokeOutline(center);
  const bounds = computeStrokeBounds(outline);
  return deepFreeze({ id, style, center, outline, bounds });
}
// ---------------------------------------------------------------------------
// Bounded serialized stroke format
//
// Layout (little-endian): version u8, pen index u8, flags u8, color rgb
// 3*u8, opacity u8 (0..255), base width f32, pressure sensitivity u8,
// smoothing u8, streamline u8, stabilization u8, point count u32, then per
// point x f32, y f32, width f32 (12 bytes/point). Wrapped as base64 text.
// ---------------------------------------------------------------------------

const OFFSET_PEN = 1;
const OFFSET_FLAGS = 2;
const OFFSET_COLOR = 3;
const OFFSET_OPACITY = 6;
const OFFSET_BASE_WIDTH = 7;
const OFFSET_SENSITIVITY = 11;
const OFFSET_SMOOTHING = 12;
const OFFSET_STREAMLINE = 13;
const OFFSET_STABILIZATION = 14;
const OFFSET_POINT_COUNT = 15;
const HEADER_LENGTH = 19;
const BYTES_PER_POINT = 12;
const FLAG_VARIABLE_WIDTH = 1;
const MAX_SERIALIZED_BYTES = HEADER_LENGTH + CANVAS_MAX_STROKE_POINTS * BYTES_PER_POINT;
const MAX_BASE64_LENGTH = Math.ceil(MAX_SERIALIZED_BYTES / 3) * 4;

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;
const B64_LOOKUP: Readonly<Record<string, number>> = (() => {
  const map: Record<string, number> = {};
  for (let i = 0; i < B64_CHARS.length; i += 1) {
    map[B64_CHARS[i]] = i;
  }
  return Object.freeze(map);
})();

function base64Encode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64_CHARS[b0 >> 2];
    out += B64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? B64_CHARS[b2 & 63] : '=';
  }
  return out;
}

function base64Decode(text: string): Uint8Array {
  if (text.length === 0 || text.length % 4 !== 0 || !B64_PATTERN.test(text)) {
    fail('unsupported-value', 'data', 'expected a base64 payload');
  }
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 4) {
    const c0 = B64_LOOKUP[text[i]];
    const c1 = B64_LOOKUP[text[i + 1]];
    const c2 = text[i + 2] === '=' ? -1 : B64_LOOKUP[text[i + 2]];
    const c3 = text[i + 3] === '=' ? -1 : B64_LOOKUP[text[i + 3]];
    bytes.push((c0 << 2) | (c1 >> 4));
    if (c2 >= 0) {
      bytes.push(((c1 & 15) << 4) | (c2 >> 2));
    }
    if (c3 >= 0) {
      bytes.push(((c2 & 3) << 6) | c3);
    }
  }
  return new Uint8Array(bytes);
}

function hex2(value: number): string {
  return value.toString(16).padStart(2, '0');
}

function parseHexColor(color: string): [number, number, number] {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}

/** Serializes a stroke into a compact, bounded, base64-encoded payload. */
export function serializeStroke(stroke: CanvasStroke): string {
  // Never trust a cast CanvasStroke; validate structurally before encoding.
  if (!isPlainObject(stroke)) {
    fail('invalid-type', 'stroke', 'expected a stroke object');
  }
  assertId((stroke as Record<string, unknown>).id, 'stroke.id');
  const style = stroke.style;
  if (!isPlainObject(style)) {
    fail('invalid-type', 'stroke.style', 'expected a stroke style object');
  }
  if (!(CANVAS_PEN_KINDS as readonly string[]).includes(style.pen)) {
    fail('unsupported-value', 'stroke.style.pen', `unsupported pen "${String(style.pen)}"`);
  }
  const preset = CANVAS_PEN_PRESETS[style.pen];
  if (typeof style.color !== 'string' || !COLOR_PATTERN.test(style.color)) {
    fail('unsupported-value', 'stroke.style.color', 'expected a #rrggbb hex color');
  }
  assertFiniteNumber(style.opacity, 'stroke.style.opacity', { min: 0, max: 1 });
  assertFiniteNumber(style.baseWidth, 'stroke.style.baseWidth', {
    min: 0,
    exclusiveMin: true,
    max: CANVAS_STROKE_MAX_WIDTH,
  });
  assertUnit(style.pressureSensitivity, 'stroke.style.pressureSensitivity');
  assertUnit(style.smoothing, 'stroke.style.smoothing');
  assertUnit(style.streamline, 'stroke.style.streamline');
  assertUnit(style.stabilization, 'stroke.style.stabilization');
  if (!(CANVAS_STROKE_BLENDS as readonly string[]).includes(style.blend)) {
    fail('unsupported-value', 'stroke.style.blend', `unsupported blend "${String(style.blend)}"`);
  }
  if (style.variableWidth !== preset.variableWidth) {
    fail(
      'unsupported-value',
      'stroke.style.variableWidth',
      'variable-width flag conflicts with the pen preset',
    );
  }
  const center = stroke.center;
  if (!Array.isArray(center)) {
    fail('invalid-type', 'stroke.center', 'expected an array of center points');
  }
  if (center.length === 0) {
    fail('unsupported-value', 'stroke.center', 'cannot serialize an empty stroke');
  }
  if (center.length > CANVAS_MAX_STROKE_POINTS) {
    fail('unsupported-value', 'stroke.center', `stroke exceeds ${CANVAS_MAX_STROKE_POINTS} points`);
  }
  const bytes = new Uint8Array(HEADER_LENGTH + center.length * BYTES_PER_POINT);
  const view = new DataView(bytes.buffer);
  bytes[0] = CANVAS_STROKE_SCHEMA_VERSION;
  bytes[OFFSET_PEN] = CANVAS_PEN_KINDS.indexOf(style.pen);
  bytes[OFFSET_FLAGS] = style.variableWidth ? FLAG_VARIABLE_WIDTH : 0;
  const [red, green, blue] = parseHexColor(style.color);
  bytes[OFFSET_COLOR] = red;
  bytes[OFFSET_COLOR + 1] = green;
  bytes[OFFSET_COLOR + 2] = blue;
  bytes[OFFSET_OPACITY] = Math.round(style.opacity * 255);
  view.setFloat32(OFFSET_BASE_WIDTH, style.baseWidth, true);
  bytes[OFFSET_SENSITIVITY] = Math.round(style.pressureSensitivity * 255);
  bytes[OFFSET_SMOOTHING] = Math.round(style.smoothing * 255);
  bytes[OFFSET_STREAMLINE] = Math.round(style.streamline * 255);
  bytes[OFFSET_STABILIZATION] = Math.round(style.stabilization * 255);
  view.setUint32(OFFSET_POINT_COUNT, center.length, true);
  let offset = HEADER_LENGTH;
  for (let i = 0; i < center.length; i += 1) {
    const point = center[i];
    if (!isPlainObject(point)) {
      fail('invalid-type', `stroke.center[${i}]`, 'expected a center point object');
    }
    if (
      typeof point.x !== 'number' ||
      !Number.isFinite(point.x) ||
      Math.abs(point.x) > CANVAS_STROKE_MAX_COORDINATE
    ) {
      fail('invalid-number', `stroke.center[${i}].x`, 'invalid coordinate');
    }
    if (
      typeof point.y !== 'number' ||
      !Number.isFinite(point.y) ||
      Math.abs(point.y) > CANVAS_STROKE_MAX_COORDINATE
    ) {
      fail('invalid-number', `stroke.center[${i}].y`, 'invalid coordinate');
    }
    if (
      typeof point.width !== 'number' ||
      !Number.isFinite(point.width) ||
      point.width <= 0 ||
      point.width > CANVAS_STROKE_MAX_RESOLVED_WIDTH
    ) {
      fail('invalid-number', `stroke.center[${i}].width`, 'invalid resolved width');
    }
    view.setFloat32(offset, point.x, true);
    view.setFloat32(offset + 4, point.y, true);
    view.setFloat32(offset + 8, point.width, true);
    offset += BYTES_PER_POINT;
  }
  return base64Encode(bytes);
}

/** Restores a stroke from its serialized payload, recomputing outline/bounds. */
export function deserializeStroke(id: unknown, data: unknown): CanvasStroke {
  const strokeId = assertId(id, 'stroke.id') as CanvasStrokeId;
  if (typeof data !== 'string') {
    fail('invalid-type', 'data', 'expected a base64 payload string');
  }
  if (data.length > MAX_BASE64_LENGTH) {
    fail(
      'unsupported-value',
      'data',
      `payload exceeds the maximum encoded stroke size of ${MAX_BASE64_LENGTH} characters`,
    );
  }
  const bytes = base64Decode(data);
  if (bytes.length < HEADER_LENGTH) {
    fail('unsupported-value', 'data', 'payload shorter than the stroke header');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = bytes[0];
  if (version !== CANVAS_STROKE_SCHEMA_VERSION) {
    fail('unsupported-value', 'data.version', `unsupported stroke schema version ${version}`);
  }
  const penIndex = bytes[OFFSET_PEN];
  if (penIndex >= CANVAS_PEN_KINDS.length) {
    fail('unsupported-value', 'data.pen', `unsupported pen index ${penIndex}`);
  }
  const pen = CANVAS_PEN_KINDS[penIndex];
  const preset = CANVAS_PEN_PRESETS[pen];
  const flags = bytes[OFFSET_FLAGS];
  if ((flags & ~FLAG_VARIABLE_WIDTH) !== 0) {
    fail('unsupported-value', 'data.flags', 'unsupported stroke flags');
  }
  const variableWidth = (flags & FLAG_VARIABLE_WIDTH) !== 0;
  if (variableWidth !== preset.variableWidth) {
    fail('unsupported-value', 'data.flags', 'variable-width flag conflicts with the pen preset');
  }
  const color = `#${hex2(bytes[OFFSET_COLOR])}${hex2(bytes[OFFSET_COLOR + 1])}${hex2(bytes[OFFSET_COLOR + 2])}`;
  const opacity = bytes[OFFSET_OPACITY] / 255;
  const baseWidth = view.getFloat32(OFFSET_BASE_WIDTH, true);
  if (!Number.isFinite(baseWidth) || baseWidth <= 0 || baseWidth > CANVAS_STROKE_MAX_WIDTH) {
    fail('invalid-number', 'data.baseWidth', 'invalid serialized base width');
  }
  const pressureSensitivity = bytes[OFFSET_SENSITIVITY] / 255;
  const smoothing = bytes[OFFSET_SMOOTHING] / 255;
  const streamline = bytes[OFFSET_STREAMLINE] / 255;
  const stabilization = bytes[OFFSET_STABILIZATION] / 255;
  const count = view.getUint32(OFFSET_POINT_COUNT, true);
  if (count === 0) {
    fail('unsupported-value', 'data.count', 'stroke must contain at least one point');
  }
  if (count > CANVAS_MAX_STROKE_POINTS) {
    fail('unsupported-value', 'data.count', `stroke exceeds ${CANVAS_MAX_STROKE_POINTS} points`);
  }
  if (bytes.length !== HEADER_LENGTH + count * BYTES_PER_POINT) {
    fail('unsupported-value', 'data', 'payload length does not match the point count');
  }
  const center: CanvasStrokeCenterPoint[] = [];
  let offset = HEADER_LENGTH;
  for (let i = 0; i < count; i += 1) {
    const x = view.getFloat32(offset, true);
    const y = view.getFloat32(offset + 4, true);
    const width = view.getFloat32(offset + 8, true);
    if (!Number.isFinite(x) || Math.abs(x) > CANVAS_STROKE_MAX_COORDINATE) {
      fail('invalid-number', `data.center[${i}].x`, 'invalid serialized coordinate');
    }
    if (!Number.isFinite(y) || Math.abs(y) > CANVAS_STROKE_MAX_COORDINATE) {
      fail('invalid-number', `data.center[${i}].y`, 'invalid serialized coordinate');
    }
    if (!Number.isFinite(width) || width <= 0 || width > CANVAS_STROKE_MAX_RESOLVED_WIDTH) {
      fail('invalid-number', `data.center[${i}].width`, 'invalid serialized width');
    }
    center.push({ x, y, width });
    offset += BYTES_PER_POINT;
  }
  const style = deepFreeze({
    pen,
    color,
    opacity,
    baseWidth,
    pressureSensitivity,
    smoothing,
    streamline,
    stabilization,
    blend: preset.blend,
    variableWidth,
  });
  const outline = buildStrokeOutline(center);
  const bounds = computeStrokeBounds(outline);
  return deepFreeze({ id: strokeId, style, center, outline, bounds });
}
