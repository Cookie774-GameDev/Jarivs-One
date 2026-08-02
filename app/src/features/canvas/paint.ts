/**
 * Deterministic hybrid paint plans for the Infinite Idea Canvas.
 *
 * Paint remains compact and local-first: the saved representation contains a
 * validated vector outline plus bounded procedural dabs, never an embedded
 * bitmap. Renderers can rasterize the frozen plan into a paint layer without
 * making every artistic medium collapse to the same line primitive.
 */

import {
  CANVAS_ID_PATTERN,
  CanvasValidationError,
  type CanvasValidationErrorCode,
} from './contracts';
import {
  CANVAS_MAX_STROKE_POINTS,
  CANVAS_STROKE_MAX_COORDINATE,
  CANVAS_STROKE_MAX_RESOLVED_WIDTH,
  type CanvasStroke,
  type CanvasStrokeBounds,
  type CanvasStrokeCenterPoint,
  type CanvasStrokeOutlinePoint,
  type CanvasStrokeStyle,
} from './strokes';

export const CANVAS_PAINT_SCHEMA_VERSION = 1;
export const CANVAS_PAINT_MAX_DABS = 4096;
export const CANVAS_PAINT_MAX_SEED = 0xffff_ffff;
export const CANVAS_PAINT_MIN_DAB_RADIUS = 0.05;

export const CANVAS_PAINT_MEDIA = [
  'acrylic',
  'oil',
  'watercolor',
  'gouache',
  'dry-brush',
  'airbrush',
  'charcoal',
  'pastel',
  'crayon',
  'ink-wash',
  'palette-knife',
  'soft-eraser',
] as const;
export type CanvasPaintMedium = (typeof CANVAS_PAINT_MEDIA)[number];

export const CANVAS_PAINT_BLENDS = [
  'source-over',
  'multiply',
  'screen',
  'destination-out',
] as const;
export type CanvasPaintBlend = (typeof CANVAS_PAINT_BLENDS)[number];

export const CANVAS_PAINT_STAMP_SHAPES = ['round', 'bristle', 'wash', 'powder', 'chisel'] as const;
export type CanvasPaintStampShape = (typeof CANVAS_PAINT_STAMP_SHAPES)[number];

export interface CanvasPaintStamp {
  readonly shape: CanvasPaintStampShape;
  readonly sizeFactor: number;
  readonly aspect: number;
  readonly angleJitter: number;
}

export interface CanvasPaintPreset {
  readonly medium: CanvasPaintMedium;
  readonly stamp: CanvasPaintStamp;
  readonly grain: number;
  readonly opacityBuildup: number;
  readonly edgeSoftness: number;
  readonly pressureResponse: number;
  readonly blend: CanvasPaintBlend;
  readonly spacing: number;
  readonly jitter: number;
  readonly flow: number;
}

export interface CanvasPaintTilt {
  readonly tiltX: number;
  readonly tiltY: number;
}

export interface BuildCanvasPaintPlanOptions {
  readonly medium: CanvasPaintMedium;
  readonly seed: number;
  readonly color?: string;
  readonly opacity?: number;
  readonly tilt?: readonly CanvasPaintTilt[];
}

export interface CanvasPaintDab {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly opacity: number;
  readonly rotation: number;
  readonly grainSeed: number;
  readonly shape: CanvasPaintStampShape;
  readonly aspect: number;
  readonly grain: number;
  readonly edgeSoftness: number;
}

export interface CanvasPaintPlan {
  readonly schemaVersion: typeof CANVAS_PAINT_SCHEMA_VERSION;
  readonly strokeId: string;
  readonly medium: CanvasPaintMedium;
  readonly seed: number;
  readonly color: string;
  readonly opacity: number;
  readonly blend: CanvasPaintBlend;
  readonly preset: CanvasPaintPreset;
  readonly outline: readonly CanvasStrokeOutlinePoint[];
  readonly bounds: CanvasStrokeBounds;
  readonly dabs: readonly CanvasPaintDab[];
  readonly dabCount: number;
}

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const STROKE_KEYS = new Set(['id', 'style', 'center', 'outline', 'bounds']);
const STYLE_KEYS = new Set([
  'pen',
  'color',
  'opacity',
  'baseWidth',
  'pressureSensitivity',
  'smoothing',
  'streamline',
  'stabilization',
  'blend',
  'variableWidth',
]);
const CENTER_KEYS = new Set(['x', 'y', 'width']);
const OUTLINE_KEYS = new Set(['x', 'y']);
const BOUNDS_KEYS = new Set(['x', 'y', 'width', 'height']);
const OPTIONS_KEYS = new Set(['medium', 'seed', 'color', 'opacity', 'tilt']);
const TILT_KEYS = new Set(['tiltX', 'tiltY']);

function frozenPreset(
  medium: CanvasPaintMedium,
  shape: CanvasPaintStampShape,
  sizeFactor: number,
  aspect: number,
  angleJitter: number,
  grain: number,
  opacityBuildup: number,
  edgeSoftness: number,
  pressureResponse: number,
  blend: CanvasPaintBlend,
  spacing: number,
  jitter: number,
  flow: number,
): CanvasPaintPreset {
  return Object.freeze({
    medium,
    stamp: Object.freeze({ shape, sizeFactor, aspect, angleJitter }),
    grain,
    opacityBuildup,
    edgeSoftness,
    pressureResponse,
    blend,
    spacing,
    jitter,
    flow,
  });
}

export const CANVAS_PAINT_PRESETS: Readonly<Record<CanvasPaintMedium, CanvasPaintPreset>> =
  Object.freeze({
    acrylic: frozenPreset(
      'acrylic',
      'bristle',
      1.08,
      0.72,
      12,
      0.28,
      0.88,
      0.18,
      0.72,
      'source-over',
      0.32,
      0.08,
      0.92,
    ),
    oil: frozenPreset(
      'oil',
      'bristle',
      1.22,
      0.58,
      18,
      0.42,
      0.96,
      0.12,
      0.82,
      'source-over',
      0.27,
      0.06,
      0.97,
    ),
    watercolor: frozenPreset(
      'watercolor',
      'wash',
      1.48,
      0.9,
      8,
      0.34,
      0.42,
      0.86,
      0.48,
      'multiply',
      0.58,
      0.16,
      0.34,
    ),
    gouache: frozenPreset(
      'gouache',
      'round',
      1.15,
      0.82,
      6,
      0.18,
      0.82,
      0.38,
      0.64,
      'source-over',
      0.41,
      0.05,
      0.84,
    ),
    'dry-brush': frozenPreset(
      'dry-brush',
      'bristle',
      0.96,
      0.44,
      28,
      0.86,
      0.52,
      0.08,
      0.9,
      'source-over',
      0.72,
      0.29,
      0.58,
    ),
    airbrush: frozenPreset(
      'airbrush',
      'round',
      1.72,
      1,
      0,
      0.08,
      0.32,
      1,
      0.35,
      'source-over',
      0.36,
      0.04,
      0.24,
    ),
    charcoal: frozenPreset(
      'charcoal',
      'powder',
      1.12,
      0.68,
      42,
      0.95,
      0.58,
      0.32,
      0.74,
      'multiply',
      0.66,
      0.34,
      0.63,
    ),
    pastel: frozenPreset(
      'pastel',
      'powder',
      1.3,
      0.76,
      34,
      0.78,
      0.7,
      0.48,
      0.56,
      'source-over',
      0.62,
      0.24,
      0.72,
    ),
    crayon: frozenPreset(
      'crayon',
      'bristle',
      0.88,
      0.62,
      24,
      0.72,
      0.76,
      0.2,
      0.68,
      'multiply',
      0.49,
      0.2,
      0.79,
    ),
    'ink-wash': frozenPreset(
      'ink-wash',
      'wash',
      1.36,
      0.84,
      15,
      0.26,
      0.38,
      0.74,
      1,
      'multiply',
      0.53,
      0.13,
      0.46,
    ),
    'palette-knife': frozenPreset(
      'palette-knife',
      'chisel',
      1.18,
      0.28,
      5,
      0.12,
      1,
      0.02,
      0.58,
      'source-over',
      0.83,
      0.03,
      1,
    ),
    'soft-eraser': frozenPreset(
      'soft-eraser',
      'round',
      1.62,
      1,
      0,
      0,
      0.68,
      0.94,
      0.52,
      'destination-out',
      0.45,
      0,
      0.8,
    ),
  });

function fail(code: CanvasValidationErrorCode, path: string, message: string): never {
  throw new CanvasValidationError(code, path, message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, keys: ReadonlySet<string>, path: string) {
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) {
      fail('unsupported-value', `${path}.${key}`, `unexpected field "${key}"`);
    }
  }
}

function finite(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
  exclusiveMinimum = false,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('invalid-number', path, 'expected a finite number');
  }
  if ((exclusiveMinimum ? value <= minimum : value < minimum) || value > maximum) {
    fail('invalid-number', path, 'value is outside the allowed range');
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    value.forEach(deepFreeze);
  } else if (value !== null && typeof value === 'object') {
    Object.keys(value as Record<string, unknown>).forEach((key) =>
      deepFreeze((value as Record<string, unknown>)[key]),
    );
  }
  return Object.freeze(value);
}

function color(value: unknown, path: string): string {
  if (typeof value !== 'string' || !COLOR_PATTERN.test(value)) {
    fail('unsupported-value', path, 'expected a #rrggbb hex color');
  }
  return value.toLowerCase();
}

export function isCanvasPaintMedium(value: unknown): value is CanvasPaintMedium {
  return typeof value === 'string' && CANVAS_PAINT_MEDIA.includes(value as CanvasPaintMedium);
}

export function resolvePaintPreset(value: unknown): CanvasPaintPreset {
  if (!isCanvasPaintMedium(value)) {
    fail('unsupported-value', 'medium', 'unsupported paint medium');
  }
  return CANVAS_PAINT_PRESETS[value];
}

export function normalizePaintSeed(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > CANVAS_PAINT_MAX_SEED
  ) {
    fail('invalid-number', 'seed', 'expected a bounded non-negative integer seed');
  }
  return value;
}

function validateStyle(input: unknown): CanvasStrokeStyle {
  if (!isPlainObject(input)) {
    fail('invalid-type', 'stroke.style', 'expected a stroke style object');
  }
  assertExactKeys(input, STYLE_KEYS, 'stroke.style');
  const pen = input.pen;
  if (typeof pen !== 'string' || pen.length === 0) {
    fail('unsupported-value', 'stroke.style.pen', 'unsupported pen');
  }
  const strokeColor = color(input.color, 'stroke.style.color');
  const opacity = finite(input.opacity, 'stroke.style.opacity', 0, 1);
  const baseWidth = finite(
    input.baseWidth,
    'stroke.style.baseWidth',
    0,
    CANVAS_STROKE_MAX_RESOLVED_WIDTH,
    true,
  );
  const pressureSensitivity = finite(
    input.pressureSensitivity,
    'stroke.style.pressureSensitivity',
    0,
    1,
  );
  const smoothing = finite(input.smoothing, 'stroke.style.smoothing', 0, 1);
  const streamline = finite(input.streamline, 'stroke.style.streamline', 0, 1);
  const stabilization = finite(input.stabilization, 'stroke.style.stabilization', 0, 1);
  if (
    input.blend !== 'source-over' &&
    input.blend !== 'multiply' &&
    input.blend !== 'destination-out'
  ) {
    fail('unsupported-value', 'stroke.style.blend', 'unsupported blend');
  }
  if (typeof input.variableWidth !== 'boolean') {
    fail('invalid-type', 'stroke.style.variableWidth', 'expected a boolean');
  }
  return input as unknown as CanvasStrokeStyle & {
    readonly color: typeof strokeColor;
    readonly opacity: typeof opacity;
    readonly baseWidth: typeof baseWidth;
    readonly pressureSensitivity: typeof pressureSensitivity;
    readonly smoothing: typeof smoothing;
    readonly streamline: typeof streamline;
    readonly stabilization: typeof stabilization;
  };
}

function validateCenter(input: unknown): readonly CanvasStrokeCenterPoint[] {
  if (!Array.isArray(input)) {
    fail('invalid-type', 'stroke.center', 'expected an array');
  }
  if (input.length === 0 || input.length > CANVAS_MAX_STROKE_POINTS) {
    fail('unsupported-value', 'stroke.center', 'stroke center point count is out of range');
  }
  return input.map((raw, index) => {
    const path = `stroke.center[${index}]`;
    if (!isPlainObject(raw)) {
      fail('invalid-type', path, 'expected a center point object');
    }
    assertExactKeys(raw, CENTER_KEYS, path);
    return {
      x: finite(raw.x, `${path}.x`, -CANVAS_STROKE_MAX_COORDINATE, CANVAS_STROKE_MAX_COORDINATE),
      y: finite(raw.y, `${path}.y`, -CANVAS_STROKE_MAX_COORDINATE, CANVAS_STROKE_MAX_COORDINATE),
      width: finite(raw.width, `${path}.width`, 0, CANVAS_STROKE_MAX_RESOLVED_WIDTH, true),
    };
  });
}

function validateOutline(input: unknown): readonly CanvasStrokeOutlinePoint[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > CANVAS_MAX_STROKE_POINTS * 2) {
    fail('unsupported-value', 'stroke.outline', 'stroke outline point count is out of range');
  }
  return input.map((raw, index) => {
    const path = `stroke.outline[${index}]`;
    if (!isPlainObject(raw)) {
      fail('invalid-type', path, 'expected an outline point object');
    }
    assertExactKeys(raw, OUTLINE_KEYS, path);
    return {
      x: finite(raw.x, `${path}.x`, -CANVAS_STROKE_MAX_COORDINATE, CANVAS_STROKE_MAX_COORDINATE),
      y: finite(raw.y, `${path}.y`, -CANVAS_STROKE_MAX_COORDINATE, CANVAS_STROKE_MAX_COORDINATE),
    };
  });
}

function validateBounds(input: unknown): CanvasStrokeBounds {
  if (!isPlainObject(input)) {
    fail('invalid-type', 'stroke.bounds', 'expected a bounds object');
  }
  assertExactKeys(input, BOUNDS_KEYS, 'stroke.bounds');
  return {
    x: finite(
      input.x,
      'stroke.bounds.x',
      -CANVAS_STROKE_MAX_COORDINATE,
      CANVAS_STROKE_MAX_COORDINATE,
    ),
    y: finite(
      input.y,
      'stroke.bounds.y',
      -CANVAS_STROKE_MAX_COORDINATE,
      CANVAS_STROKE_MAX_COORDINATE,
    ),
    width: finite(input.width, 'stroke.bounds.width', 0, CANVAS_STROKE_MAX_COORDINATE),
    height: finite(input.height, 'stroke.bounds.height', 0, CANVAS_STROKE_MAX_COORDINATE),
  };
}

function validateStroke(input: unknown): CanvasStroke {
  if (!isPlainObject(input)) {
    fail('invalid-type', 'stroke', 'expected a stroke object');
  }
  assertExactKeys(input, STROKE_KEYS, 'stroke');
  if (typeof input.id !== 'string' || !CANVAS_ID_PATTERN.test(input.id)) {
    fail('invalid-id', 'stroke.id', 'expected a stable stroke id');
  }
  const style = validateStyle(input.style);
  const center = validateCenter(input.center);
  const outline = validateOutline(input.outline);
  const bounds = validateBounds(input.bounds);
  return { id: input.id, style, center, outline, bounds } as CanvasStroke;
}

function validateOptions(input: unknown): {
  readonly medium: CanvasPaintMedium;
  readonly seed: number;
  readonly color?: string;
  readonly opacity?: number;
  readonly tilt?: readonly CanvasPaintTilt[];
} {
  if (!isPlainObject(input)) {
    fail('invalid-type', 'options', 'expected a paint options object');
  }
  assertExactKeys(input, OPTIONS_KEYS, 'options');
  const preset = resolvePaintPreset(input.medium);
  const seed = normalizePaintSeed(input.seed);
  const colorOverride = input.color === undefined ? undefined : color(input.color, 'options.color');
  const opacity =
    input.opacity === undefined ? undefined : finite(input.opacity, 'options.opacity', 0, 1);
  let tilt: readonly CanvasPaintTilt[] | undefined;
  if (input.tilt !== undefined) {
    if (!Array.isArray(input.tilt)) {
      fail('invalid-type', 'options.tilt', 'expected an array');
    }
    tilt = input.tilt.map((raw, index) => {
      const path = `options.tilt[${index}]`;
      if (!isPlainObject(raw)) {
        fail('invalid-type', path, 'expected a tilt object');
      }
      assertExactKeys(raw, TILT_KEYS, path);
      if (!Object.hasOwn(raw, 'tiltX') || !Object.hasOwn(raw, 'tiltY')) {
        fail('unsupported-value', path, 'tiltX and tiltY are both required');
      }
      return {
        tiltX: finite(raw.tiltX, `${path}.tiltX`, -90, 90),
        tiltY: finite(raw.tiltY, `${path}.tiltY`, -90, 90),
      };
    });
  }
  return {
    medium: preset.medium,
    seed,
    ...(colorOverride === undefined ? {} : { color: colorOverride }),
    ...(opacity === undefined ? {} : { opacity }),
    ...(tilt === undefined ? {} : { tilt }),
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function randomFactory(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function angleForTilt(tilt: CanvasPaintTilt | undefined): number {
  if (tilt === undefined || (tilt.tiltX === 0 && tilt.tiltY === 0)) {
    return 0;
  }
  return (Math.atan2(tilt.tiltX, tilt.tiltY) * 180) / Math.PI;
}

interface SampledCenterPoint extends CanvasStrokeCenterPoint {
  readonly sourceIndex: number;
}

function sampleCenterline(
  center: readonly CanvasStrokeCenterPoint[],
  preset: CanvasPaintPreset,
): readonly SampledCenterPoint[] {
  if (center.length === 1) {
    return [{ ...center[0], sourceIndex: 0 }];
  }
  let totalLength = 0;
  for (let index = 1; index < center.length; index += 1) {
    totalLength += Math.hypot(
      center[index].x - center[index - 1].x,
      center[index].y - center[index - 1].y,
    );
  }
  const averageWidth = center.reduce((sum, point) => sum + point.width, 0) / center.length;
  const step = Math.max(CANVAS_PAINT_MIN_DAB_RADIUS * 2, averageWidth * preset.spacing);
  const count = Math.min(CANVAS_PAINT_MAX_DABS, Math.max(1, Math.ceil(totalLength / step) + 1));
  if (totalLength === 0 || count === 1) {
    return [{ ...center[0], sourceIndex: 0 }];
  }

  const sampled: SampledCenterPoint[] = [];
  let segmentIndex = 1;
  let segmentStartDistance = 0;
  let segmentLength = Math.hypot(center[1].x - center[0].x, center[1].y - center[0].y);
  for (let outputIndex = 0; outputIndex < count; outputIndex += 1) {
    const targetDistance = (totalLength * outputIndex) / (count - 1);
    while (
      segmentIndex < center.length - 1 &&
      targetDistance > segmentStartDistance + segmentLength
    ) {
      segmentStartDistance += segmentLength;
      segmentIndex += 1;
      segmentLength = Math.hypot(
        center[segmentIndex].x - center[segmentIndex - 1].x,
        center[segmentIndex].y - center[segmentIndex - 1].y,
      );
    }
    const from = center[segmentIndex - 1];
    const to = center[segmentIndex];
    const ratio =
      segmentLength === 0
        ? 0
        : clamp((targetDistance - segmentStartDistance) / segmentLength, 0, 1);
    sampled.push({
      x: from.x + (to.x - from.x) * ratio,
      y: from.y + (to.y - from.y) * ratio,
      width: from.width + (to.width - from.width) * ratio,
      sourceIndex: ratio < 0.5 ? segmentIndex - 1 : segmentIndex,
    });
  }
  return sampled;
}

export function buildPaintPlan(strokeInput: unknown, optionsInput: unknown): CanvasPaintPlan {
  const stroke = validateStroke(strokeInput);
  const options = validateOptions(optionsInput);
  if (options.tilt !== undefined && options.tilt.length !== stroke.center.length) {
    fail(
      'unsupported-value',
      'options.tilt',
      'tilt projection length must match the stroke centerline',
    );
  }
  const preset = CANVAS_PAINT_PRESETS[options.medium];
  const planColor = options.color ?? stroke.style.color.toLowerCase();
  const planOpacity = options.opacity ?? stroke.style.opacity;
  const sampled = sampleCenterline(stroke.center, preset);
  const random = randomFactory(options.seed ^ (CANVAS_PAINT_MEDIA.indexOf(options.medium) + 1));
  const dabs = sampled.map((point): CanvasPaintDab => {
    const randomX = random() * 2 - 1;
    const randomY = random() * 2 - 1;
    const randomAngle = random() * 2 - 1;
    const grainSeed = Math.floor(random() * (CANVAS_PAINT_MAX_SEED + 1));
    const sourceWidth = clamp(
      point.width,
      CANVAS_PAINT_MIN_DAB_RADIUS * 2,
      CANVAS_STROKE_MAX_RESOLVED_WIDTH,
    );
    const radius = clamp(
      (sourceWidth * preset.stamp.sizeFactor) / 2,
      CANVAS_PAINT_MIN_DAB_RADIUS,
      CANVAS_STROKE_MAX_RESOLVED_WIDTH,
    );
    const pressureRatio = clamp(
      sourceWidth / Math.max(stroke.style.baseWidth * 2, CANVAS_PAINT_MIN_DAB_RADIUS),
      0,
      1,
    );
    const pressureOpacity = 1 - preset.pressureResponse + preset.pressureResponse * pressureRatio;
    const jitterDistance = radius * preset.jitter;
    const rotation = clamp(
      angleForTilt(options.tilt?.[point.sourceIndex]) + randomAngle * preset.stamp.angleJitter,
      -180,
      180,
    );
    return Object.freeze({
      x: clamp(
        point.x + randomX * jitterDistance,
        -CANVAS_STROKE_MAX_COORDINATE,
        CANVAS_STROKE_MAX_COORDINATE,
      ),
      y: clamp(
        point.y + randomY * jitterDistance,
        -CANVAS_STROKE_MAX_COORDINATE,
        CANVAS_STROKE_MAX_COORDINATE,
      ),
      radius,
      opacity: clamp(planOpacity * preset.flow * preset.opacityBuildup * pressureOpacity, 0, 1),
      rotation,
      grainSeed,
      shape: preset.stamp.shape,
      aspect: preset.stamp.aspect,
      grain: preset.grain,
      edgeSoftness: preset.edgeSoftness,
    });
  });

  return deepFreeze({
    schemaVersion: CANVAS_PAINT_SCHEMA_VERSION,
    strokeId: stroke.id,
    medium: options.medium,
    seed: options.seed,
    color: planColor,
    opacity: planOpacity,
    blend: preset.blend,
    preset,
    outline: stroke.outline.map((point) => ({ ...point })),
    bounds: { ...stroke.bounds },
    dabs,
    dabCount: dabs.length,
  });
}
