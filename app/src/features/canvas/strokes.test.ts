import { describe, expect, it } from 'vitest';
import { CanvasValidationError, type CanvasValidationErrorCode } from './contracts';
import {
  CANVAS_DEFAULT_PRESSURE,
  CANVAS_MAX_STROKE_POINTS,
  CANVAS_PEN_KINDS,
  CANVAS_PEN_PRESETS,
  CANVAS_STROKE_MAX_RESOLVED_WIDTH,
  CANVAS_STROKE_MAX_WIDTH,
  CANVAS_STROKE_SCHEMA_VERSION,
  buildStroke,
  buildStrokeOutline,
  computeStrokeBounds,
  computeStrokeWidths,
  deserializeStroke,
  hitTestStroke,
  normalizePointerSample,
  normalizePointerSamples,
  resolveStrokeStyle,
  serializeStroke,
  smoothStrokePoints,
  stabilizeStrokePoints,
  streamlineStrokePoints,
  tiltToNibAngle,
  type CanvasPenKind,
  type CanvasStroke,
  type CanvasStrokeCenterPoint,
  type CanvasStrokeSamplePoint,
} from './strokes';

function expectCanvasError(fn: () => unknown, code: CanvasValidationErrorCode): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(CanvasValidationError);
    expect((error as CanvasValidationError).code).toBe(code);
    return;
  }
  throw new Error(`Expected CanvasValidationError(${code}) but nothing was thrown`);
}

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToB64(bytes: readonly number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;
    out += B64_ALPHABET[b0 >> 2];
    out += B64_ALPHABET[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? '=' : B64_ALPHABET[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? '=' : B64_ALPHABET[b2 & 63];
  }
  return out;
}

function f32Bytes(value: number): number[] {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value, true);
  return [view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)];
}

function u32Bytes(value: number): number[] {
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, value, true);
  return [view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)];
}

interface CraftOptions {
  version?: number;
  pen?: number;
  flags?: number;
  color?: number[];
  opacity?: number;
  baseWidth?: number;
  sensitivity?: number;
  smoothing?: number;
  streamline?: number;
  stabilization?: number;
  count?: number;
  pointBytes?: number[];
}

function craftPayload(options: CraftOptions = {}): string {
  const bytes = [
    options.version ?? CANVAS_STROKE_SCHEMA_VERSION,
    options.pen ?? 0,
    options.flags ?? 1,
    ...(options.color ?? [0, 0, 0]),
    options.opacity ?? 255,
    ...f32Bytes(options.baseWidth ?? 4),
    options.sensitivity ?? 0,
    options.smoothing ?? 0,
    options.streamline ?? 0,
    options.stabilization ?? 0,
    ...u32Bytes(options.count ?? 0),
    ...(options.pointBytes ?? []),
  ];
  return bytesToB64(bytes);
}

function pointBytes(x: number, y: number, width: number): number[] {
  return [...f32Bytes(x), ...f32Bytes(y), ...f32Bytes(width)];
}

describe('pointer sample normalization', () => {
  it('normalizes a bare mouse sample with deterministic defaults', () => {
    expect(normalizePointerSample({ x: 1, y: 2 })).toEqual({
      x: 1,
      y: 2,
      pressure: CANVAS_DEFAULT_PRESSURE,
      tiltX: 0,
      tiltY: 0,
      timestamp: 0,
      kind: 'mouse',
    });
    expect(normalizePointerSample({ x: 1, y: 2 }, 3).timestamp).toBe(3);
  });

  it('preserves stylus pressure, tilt, timestamp, and kind', () => {
    expect(
      normalizePointerSample({
        x: 10,
        y: 20,
        pressure: 0.8,
        tiltX: 15,
        tiltY: -30,
        timestamp: 123,
        kind: 'stylus',
      }),
    ).toEqual({
      x: 10,
      y: 20,
      pressure: 0.8,
      tiltX: 15,
      tiltY: -30,
      timestamp: 123,
      kind: 'stylus',
    });
  });

  it('accepts touch samples and boundary pressure/tilt values', () => {
    expect(normalizePointerSample({ x: 0, y: 0, kind: 'touch', pressure: 1 }).kind).toBe('touch');
    expect(normalizePointerSample({ x: 0, y: 0, pressure: 0 }).pressure).toBe(0);
    expect(normalizePointerSample({ x: 0, y: 0, tiltX: 90, tiltY: -90 }).tiltX).toBe(90);
  });

  it('returns deeply frozen samples', () => {
    const sample = normalizePointerSample({ x: 1, y: 2 });
    expect(Object.isFrozen(sample)).toBe(true);
  });

  it('rejects non-finite or out-of-bounds coordinates', () => {
    expectCanvasError(() => normalizePointerSample({ x: Number.NaN, y: 0 }), 'invalid-number');
    expectCanvasError(
      () => normalizePointerSample({ x: 0, y: Number.POSITIVE_INFINITY }),
      'invalid-number',
    );
    expectCanvasError(() => normalizePointerSample({ x: 2_000_000_000, y: 0 }), 'invalid-number');
    expectCanvasError(() => normalizePointerSample({ y: 0 }), 'invalid-number');
  });

  it('rejects out-of-range pressure and tilt', () => {
    expectCanvasError(
      () => normalizePointerSample({ x: 0, y: 0, pressure: 1.5 }),
      'invalid-number',
    );
    expectCanvasError(
      () => normalizePointerSample({ x: 0, y: 0, pressure: -0.1 }),
      'invalid-number',
    );
    expectCanvasError(() => normalizePointerSample({ x: 0, y: 0, tiltX: 91 }), 'invalid-number');
    expectCanvasError(() => normalizePointerSample({ x: 0, y: 0, tiltY: -91 }), 'invalid-number');
  });

  it('rejects malformed shapes, unknown fields, kinds, and timestamps', () => {
    expectCanvasError(() => normalizePointerSample(null), 'invalid-type');
    expectCanvasError(() => normalizePointerSample(5), 'invalid-type');
    expectCanvasError(() => normalizePointerSample({ x: 0, y: 0, button: 1 }), 'unsupported-value');
    expectCanvasError(
      () => normalizePointerSample({ x: 0, y: 0, kind: 'feather' }),
      'unsupported-value',
    );
    expectCanvasError(
      () => normalizePointerSample({ x: 0, y: 0, timestamp: 1.5 }),
      'invalid-timestamp',
    );
    expectCanvasError(
      () => normalizePointerSample({ x: 0, y: 0, timestamp: -1 }),
      'invalid-timestamp',
    );
  });
});

describe('pointer sample stream normalization', () => {
  it('normalizes every sample with its index as the default timestamp', () => {
    const samples = normalizePointerSamples([
      { x: 0, y: 0 },
      { x: 1, y: 1, kind: 'stylus', pressure: 0.9 },
    ]);
    expect(samples).toHaveLength(2);
    expect(samples[0].timestamp).toBe(0);
    expect(samples[1].timestamp).toBe(1);
    expect(samples[1].kind).toBe('stylus');
    expect(Object.isFrozen(samples)).toBe(true);
    expect(Object.isFrozen(samples[0])).toBe(true);
  });

  it('rejects empty streams, non-arrays, and decreasing timestamps', () => {
    expectCanvasError(() => normalizePointerSamples([]), 'unsupported-value');
    expectCanvasError(() => normalizePointerSamples('nope'), 'invalid-type');
    expectCanvasError(
      () =>
        normalizePointerSamples([
          { x: 0, y: 0, timestamp: 5 },
          { x: 1, y: 1, timestamp: 4 },
        ]),
      'unsupported-value',
    );
  });

  it('enforces the bounded stroke point limit', () => {
    const tooMany = Array.from({ length: CANVAS_MAX_STROKE_POINTS + 1 }, (_, i) => ({
      x: i,
      y: i,
    }));
    expectCanvasError(() => normalizePointerSamples(tooMany), 'unsupported-value');
    const atLimit = Array.from({ length: CANVAS_MAX_STROKE_POINTS }, (_, i) => ({ x: i, y: i }));
    expect(normalizePointerSamples(atLimit)).toHaveLength(CANVAS_MAX_STROKE_POINTS);
  });
});
describe('pen presets and stroke style resolution', () => {
  it('exposes genuinely distinct typed pen presets', () => {
    const kinds = [...CANVAS_PEN_KINDS];
    expect(kinds).toEqual([
      'pen',
      'ballpoint',
      'marker',
      'highlighter',
      'eraser',
      'fountain-pen',
      'technical-pen',
    ]);
    const widths = new Set(kinds.map((kind) => CANVAS_PEN_PRESETS[kind].baseWidth));
    expect(widths.size).toBe(kinds.length);
    expect(CANVAS_PEN_PRESETS.highlighter.variableWidth).toBe(false);
    expect(CANVAS_PEN_PRESETS.highlighter.blend).toBe('multiply');
    expect(CANVAS_PEN_PRESETS.eraser.blend).toBe('destination-out');
    expect(CANVAS_PEN_PRESETS.pen.blend).toBe('source-over');
    expect(Object.isFrozen(CANVAS_PEN_PRESETS)).toBe(true);
  });

  it('resolves a pen style from its preset with default color', () => {
    expect(resolveStrokeStyle({ pen: 'pen' })).toEqual({
      pen: 'pen',
      color: '#000000',
      opacity: 1,
      baseWidth: 4,
      pressureSensitivity: 0.5,
      smoothing: 0.5,
      streamline: 0.3,
      stabilization: 0.2,
      blend: 'source-over',
      variableWidth: true,
    });
  });

  it('applies validated overrides on top of the preset', () => {
    const style = resolveStrokeStyle({
      pen: 'pen',
      color: '#ff0000',
      opacity: 0.25,
      width: 12,
      smoothing: 1,
      streamline: 0,
      stabilization: 0,
      pressureSensitivity: 1,
    });
    expect(style.color).toBe('#ff0000');
    expect(style.opacity).toBe(0.25);
    expect(style.baseWidth).toBe(12);
    expect(style.smoothing).toBe(1);
    expect(style.streamline).toBe(0);
    expect(style.stabilization).toBe(0);
    expect(style.pressureSensitivity).toBe(1);
  });

  it('keeps blend and variable-width behavior intrinsic to the preset', () => {
    const highlighter = resolveStrokeStyle({ pen: 'highlighter' });
    expect(highlighter.blend).toBe('multiply');
    expect(highlighter.variableWidth).toBe(false);
    expect(highlighter.opacity).toBe(0.35);
    expect(highlighter.color).toBe('#ffe14d');
    expect(resolveStrokeStyle({ pen: 'eraser' }).blend).toBe('destination-out');
  });

  it('rejects malformed styles strictly', () => {
    expectCanvasError(() => resolveStrokeStyle({ pen: 'brush' }), 'unsupported-value');
    expectCanvasError(() => resolveStrokeStyle({}), 'invalid-type');
    expectCanvasError(() => resolveStrokeStyle(null), 'invalid-type');
    expectCanvasError(
      () => resolveStrokeStyle({ pen: 'pen', color: '#12345' }),
      'unsupported-value',
    );
    expectCanvasError(() => resolveStrokeStyle({ pen: 'pen', color: 'red' }), 'unsupported-value');
    expectCanvasError(() => resolveStrokeStyle({ pen: 'pen', opacity: 1.5 }), 'invalid-number');
    expectCanvasError(() => resolveStrokeStyle({ pen: 'pen', opacity: -0.1 }), 'invalid-number');
    expectCanvasError(() => resolveStrokeStyle({ pen: 'pen', width: 0 }), 'invalid-number');
    expectCanvasError(() => resolveStrokeStyle({ pen: 'pen', width: -2 }), 'invalid-number');
    expectCanvasError(() => resolveStrokeStyle({ pen: 'pen', width: 1001 }), 'invalid-number');
    expectCanvasError(() => resolveStrokeStyle({ pen: 'pen', smoothing: 1.5 }), 'invalid-number');
    expectCanvasError(() => resolveStrokeStyle({ pen: 'pen', flow: 1 }), 'unsupported-value');
  });
});

describe('tilt to nib angle', () => {
  it('converts tilt vectors into deterministic nib angles', () => {
    expect(tiltToNibAngle(0, 0)).toBe(0);
    expect(tiltToNibAngle(1, 0)).toBe(0);
    expect(tiltToNibAngle(0, 1)).toBe(90);
    expect(tiltToNibAngle(1, 1)).toBeCloseTo(45, 6);
  });

  it('rejects non-finite or out-of-range tilt', () => {
    expectCanvasError(() => tiltToNibAngle(Number.NaN, 0), 'invalid-number');
    expectCanvasError(() => tiltToNibAngle(0, 91), 'invalid-number');
  });
});

const sampleLine: readonly CanvasStrokeSamplePoint[] = [
  { x: 0, y: 0, pressure: 0.5 },
  { x: 1, y: 10, pressure: 0.5 },
  { x: 2, y: 0, pressure: 0.5 },
];

describe('stroke stabilization', () => {
  it('is the identity transform at amount zero', () => {
    expect(stabilizeStrokePoints(sampleLine, 0)).toEqual(sampleLine);
  });

  it('reduces jitter while preserving the first point', () => {
    const zigzag: readonly CanvasStrokeSamplePoint[] = [
      { x: 0, y: 0, pressure: 0.5 },
      { x: 1, y: 1, pressure: 0.5 },
      { x: 2, y: 0, pressure: 0.5 },
      { x: 3, y: 1, pressure: 0.5 },
      { x: 4, y: 0, pressure: 0.5 },
    ];
    const stabilized = stabilizeStrokePoints(zigzag, 0.8);
    expect(stabilized[0]).toEqual(zigzag[0]);
    const deviation = (points: readonly CanvasStrokeSamplePoint[]): number =>
      points.slice(1).reduce((sum, point) => sum + (point.y - 0.5) ** 2, 0);
    expect(deviation(stabilized)).toBeLessThan(deviation(zigzag));
    expect(Object.isFrozen(stabilized)).toBe(true);
  });

  it('rejects invalid amounts and samples', () => {
    expectCanvasError(() => stabilizeStrokePoints(sampleLine, 1.5), 'invalid-number');
    expectCanvasError(() => stabilizeStrokePoints([], 0.5), 'unsupported-value');
    expectCanvasError(
      () => stabilizeStrokePoints([{ x: Number.NaN, y: 0, pressure: 0.5 }], 0.5),
      'invalid-number',
    );
    expectCanvasError(
      () => stabilizeStrokePoints([{ x: 0, y: 0, pressure: 2 }], 0.5),
      'invalid-number',
    );
  });
});

describe('stroke smoothing', () => {
  it('is the identity transform at amount zero', () => {
    expect(smoothStrokePoints(sampleLine, 0)).toEqual(sampleLine);
  });

  it('moves interior points toward their neighbors, keeping endpoints', () => {
    const full = smoothStrokePoints(sampleLine, 1);
    expect(full[0]).toEqual(sampleLine[0]);
    expect(full[2]).toEqual(sampleLine[2]);
    expect(full[1].x).toBeCloseTo(1, 6);
    expect(full[1].y).toBeCloseTo(10 / 3, 6);
    const half = smoothStrokePoints(sampleLine, 0.5);
    expect(half[1].y).toBeCloseTo(20 / 3, 6);
  });

  it('smooths pressure alongside geometry', () => {
    const pressured: readonly CanvasStrokeSamplePoint[] = [
      { x: 0, y: 0, pressure: 0 },
      { x: 1, y: 0, pressure: 1 },
      { x: 2, y: 0, pressure: 0 },
    ];
    expect(smoothStrokePoints(pressured, 1)[1].pressure).toBeCloseTo(1 / 3, 6);
  });

  it('rejects invalid amounts', () => {
    expectCanvasError(() => smoothStrokePoints(sampleLine, -0.1), 'invalid-number');
    expectCanvasError(() => smoothStrokePoints([], 0.5), 'unsupported-value');
  });
});

describe('stroke streamlining (arc-length resampling)', () => {
  it('resamples a straight line at even spacing', () => {
    const line: readonly CanvasStrokeSamplePoint[] = [
      { x: 0, y: 0, pressure: 0 },
      { x: 10, y: 0, pressure: 1 },
    ];
    const resampled = streamlineStrokePoints(line, 2.5);
    expect(resampled.map((point) => point.x)).toEqual([0, 2.5, 5, 7.5, 10]);
    expect(resampled[2].pressure).toBeCloseTo(0.5, 6);
  });

  it('always preserves the final endpoint', () => {
    const line: readonly CanvasStrokeSamplePoint[] = [
      { x: 0, y: 0, pressure: 0.5 },
      { x: 10, y: 0, pressure: 0.5 },
    ];
    const resampled = streamlineStrokePoints(line, 3);
    expect(resampled.map((point) => point.x)).toEqual([0, 3, 6, 9, 10]);
    expect(resampled.at(-1)).toEqual({ x: 10, y: 0, pressure: 0.5 });
  });

  it('collapses coincident points into a single sample', () => {
    const coincident: readonly CanvasStrokeSamplePoint[] = [
      { x: 5, y: 5, pressure: 0.4 },
      { x: 5, y: 5, pressure: 0.6 },
      { x: 5, y: 5, pressure: 0.8 },
    ];
    expect(streamlineStrokePoints(coincident, 2)).toEqual([{ x: 5, y: 5, pressure: 0.4 }]);
  });

  it('rejects non-positive spacing and empty input', () => {
    expectCanvasError(() => streamlineStrokePoints(sampleLine, 0), 'invalid-number');
    expectCanvasError(() => streamlineStrokePoints(sampleLine, -1), 'invalid-number');
    expectCanvasError(() => streamlineStrokePoints(sampleLine, Number.NaN), 'invalid-number');
    expectCanvasError(() => streamlineStrokePoints([], 2), 'unsupported-value');
  });
});
describe('variable-width outline generation', () => {
  it('derives per-point widths from pressure for variable pens', () => {
    const style = resolveStrokeStyle({ pen: 'pen', smoothing: 0, streamline: 0, stabilization: 0 });
    const points: readonly CanvasStrokeSamplePoint[] = [
      { x: 0, y: 0, pressure: 0 },
      { x: 1, y: 0, pressure: 0.5 },
      { x: 2, y: 0, pressure: 1 },
    ];
    const center = computeStrokeWidths(points, style);
    expect(center.map((point) => point.width)).toEqual([2, 4, 6]);
  });

  it('clamps extreme pressure response to a positive minimum width', () => {
    const style = resolveStrokeStyle({
      pen: 'pen',
      pressureSensitivity: 1,
      smoothing: 0,
      streamline: 0,
      stabilization: 0,
    });
    const center = computeStrokeWidths([{ x: 0, y: 0, pressure: 0 }], style);
    expect(center[0].width).toBeCloseTo(0.2, 6);
  });

  it('uses a constant width when variable width is disabled', () => {
    const style = resolveStrokeStyle({ pen: 'highlighter' });
    const points: readonly CanvasStrokeSamplePoint[] = [
      { x: 0, y: 0, pressure: 0.1 },
      { x: 1, y: 0, pressure: 0.9 },
    ];
    const center = computeStrokeWidths(points, style);
    expect(center.map((point) => point.width)).toEqual([18, 18]);
  });

  it('builds a rectangular outline for a constant-width straight stroke', () => {
    const center: readonly CanvasStrokeCenterPoint[] = [
      { x: 0, y: 0, width: 4 },
      { x: 10, y: 0, width: 4 },
    ];
    expect(buildStrokeOutline(center)).toEqual([
      { x: 0, y: 2 },
      { x: 10, y: 2 },
      { x: 10, y: -2 },
      { x: 0, y: -2 },
    ]);
  });

  it('offsets rails by the local width for variable-width strokes', () => {
    const center: readonly CanvasStrokeCenterPoint[] = [
      { x: 0, y: 0, width: 2 },
      { x: 10, y: 0, width: 6 },
    ];
    expect(buildStrokeOutline(center)).toEqual([
      { x: 0, y: 1 },
      { x: 10, y: 3 },
      { x: 10, y: -3 },
      { x: 0, y: -1 },
    ]);
  });

  it('emits twice as many outline vertices as center points', () => {
    const center: readonly CanvasStrokeCenterPoint[] = [
      { x: 0, y: 0, width: 2 },
      { x: 5, y: 5, width: 2 },
      { x: 10, y: 0, width: 2 },
    ];
    expect(buildStrokeOutline(center)).toHaveLength(6);
  });

  it('renders a single point as a diamond dot', () => {
    expect(buildStrokeOutline([{ x: 5, y: 5, width: 4 }])).toEqual([
      { x: 5, y: 3 },
      { x: 7, y: 5 },
      { x: 5, y: 7 },
      { x: 3, y: 5 },
    ]);
  });

  it('rejects empty centerlines', () => {
    expectCanvasError(() => buildStrokeOutline([]), 'unsupported-value');
  });
});

describe('stroke bounds', () => {
  it('computes the axis-aligned bounds of an outline', () => {
    const outline = [
      { x: 0, y: 2 },
      { x: 10, y: 2 },
      { x: 10, y: -2 },
      { x: 0, y: -2 },
    ];
    expect(computeStrokeBounds(outline)).toEqual({ x: 0, y: -2, width: 10, height: 4 });
  });

  it('rejects empty outlines', () => {
    expectCanvasError(() => computeStrokeBounds([]), 'unsupported-value');
  });
});

function controlledStroke(): CanvasStroke {
  return buildStroke({
    id: 'hit1',
    style: { pen: 'pen', smoothing: 0, streamline: 0, stabilization: 0, pressureSensitivity: 0 },
    samples: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
  });
}

describe('stroke hit testing', () => {
  it('hits inside the variable width and misses outside it', () => {
    const stroke = controlledStroke();
    expect(hitTestStroke(stroke, { x: 5, y: 0 })).toBe(true);
    expect(hitTestStroke(stroke, { x: 5, y: 1.9 })).toBe(true);
    expect(hitTestStroke(stroke, { x: 5, y: 2.5 })).toBe(false);
    expect(hitTestStroke(stroke, { x: -1, y: 0 })).toBe(true);
    expect(hitTestStroke(stroke, { x: -3, y: 0 })).toBe(false);
    expect(hitTestStroke(stroke, { x: 100, y: 100 })).toBe(false);
  });

  it('expands the hit area by the tolerance', () => {
    const stroke = controlledStroke();
    expect(hitTestStroke(stroke, { x: 5, y: 2.5 }, 1)).toBe(true);
    expect(hitTestStroke(stroke, { x: 5, y: 4 }, 1)).toBe(false);
  });

  it('rejects invalid targets and tolerances', () => {
    const stroke = controlledStroke();
    expectCanvasError(() => hitTestStroke(stroke, { x: Number.NaN, y: 0 }), 'invalid-number');
    expectCanvasError(() => hitTestStroke(stroke, { x: 0, y: 0 }, -1), 'invalid-number');
  });
});

describe('stroke building pipeline', () => {
  it('builds a deterministic, deeply frozen stroke', () => {
    const input = {
      id: 'stroke1',
      style: { pen: 'pen', smoothing: 0, streamline: 0, stabilization: 0 },
      samples: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 0 },
      ],
    };
    const stroke = buildStroke(input);
    expect(stroke.id).toBe('stroke1');
    expect(stroke.center).toHaveLength(3);
    expect(stroke.outline).toHaveLength(6);
    expect(stroke.bounds).toEqual({ x: 0, y: -2, width: 10, height: 4 });
    expect(Object.isFrozen(stroke)).toBe(true);
    expect(Object.isFrozen(stroke.center)).toBe(true);
    expect(Object.isFrozen(stroke.outline)).toBe(true);
    expect(Object.isFrozen(stroke.style)).toBe(true);
    expect(JSON.stringify(buildStroke(input))).toBe(JSON.stringify(stroke));
  });

  it('builds a single-sample stroke as a dot', () => {
    const stroke = buildStroke({ id: 'dot1', style: { pen: 'pen' }, samples: [{ x: 3, y: 4 }] });
    expect(stroke.center).toHaveLength(1);
    expect(stroke.outline).toHaveLength(4);
    expect(stroke.bounds).toEqual({ x: 1, y: 2, width: 4, height: 4 });
  });

  it('carries highlighter and eraser behavior into the stroke', () => {
    const highlighter = buildStroke({
      id: 'hl1',
      style: { pen: 'highlighter' },
      samples: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    });
    expect(highlighter.style.blend).toBe('multiply');
    expect(highlighter.center.every((point) => point.width === 18)).toBe(true);
    const eraser = buildStroke({
      id: 'er1',
      style: { pen: 'eraser' },
      samples: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    });
    expect(eraser.style.blend).toBe('destination-out');
  });

  it('rejects malformed stroke input strictly', () => {
    const samples = [{ x: 0, y: 0 }];
    expectCanvasError(
      () => buildStroke({ id: 'bad id!', style: { pen: 'pen' }, samples }),
      'invalid-id',
    );
    expectCanvasError(
      () => buildStroke({ id: 'ok1', style: { pen: 'pen' }, samples: [] }),
      'unsupported-value',
    );
    expectCanvasError(() => buildStroke({ id: 'ok1', style: { pen: 'pen' } }), 'invalid-type');
    expectCanvasError(() => buildStroke({ id: 'ok1', samples }), 'invalid-type');
    expectCanvasError(
      () => buildStroke({ id: 'ok1', style: { pen: 'pen' }, samples, extra: 1 }),
      'unsupported-value',
    );
  });
});

describe('bounded serialized stroke format', () => {
  const input = {
    id: 'ser1',
    style: {
      pen: 'pen' as CanvasPenKind,
      smoothing: 0,
      streamline: 0,
      stabilization: 0,
      pressureSensitivity: 0,
    },
    samples: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ],
  };

  it('round-trips a stroke losslessly and byte-stably', () => {
    const stroke = buildStroke(input);
    const data = serializeStroke(stroke);
    expect(typeof data).toBe('string');
    const restored = deserializeStroke('ser1', data);
    expect(restored).toEqual(stroke);
    expect(serializeStroke(restored)).toBe(data);
  });

  it('round-trips a highlighter byte-stably with quantized opacity', () => {
    const stroke = buildStroke({
      id: 'ser2',
      style: { pen: 'highlighter', smoothing: 0, streamline: 0, stabilization: 0 },
      samples: [
        { x: 0, y: 0 },
        { x: 8, y: 0 },
      ],
    });
    const data = serializeStroke(stroke);
    const restored = deserializeStroke('ser2', data);
    expect(serializeStroke(restored)).toBe(data);
    expect(restored.style.pen).toBe('highlighter');
    expect(restored.style.blend).toBe('multiply');
    expect(restored.style.variableWidth).toBe(false);
    expect(restored.style.opacity).toBeCloseTo(0.35, 2);
  });

  it('deserializes a crafted minimal valid payload', () => {
    const payload = craftPayload({ count: 1, pointBytes: pointBytes(0, 0, 4) });
    const stroke = deserializeStroke('ok1', payload);
    expect(stroke.center).toHaveLength(1);
    expect(stroke.outline).toHaveLength(4);
    expect(stroke.style.pen).toBe('pen');
  });

  it('rejects malformed payloads strictly', () => {
    expectCanvasError(() => deserializeStroke('ok1', '!!!not-base64!!!'), 'unsupported-value');
    expectCanvasError(() => deserializeStroke('bad id', craftPayload({ count: 0 })), 'invalid-id');
    expectCanvasError(
      () => deserializeStroke('ok1', craftPayload({ version: 2 })),
      'unsupported-value',
    );
    expectCanvasError(
      () => deserializeStroke('ok1', craftPayload({ count: 0 })),
      'unsupported-value',
    );
    expectCanvasError(
      () => deserializeStroke('ok1', craftPayload({ count: 2, pointBytes: pointBytes(0, 0, 4) })),
      'unsupported-value',
    );
    expectCanvasError(
      () => deserializeStroke('ok1', craftPayload({ count: CANVAS_MAX_STROKE_POINTS + 1 })),
      'unsupported-value',
    );
    expectCanvasError(
      () =>
        deserializeStroke(
          'ok1',
          craftPayload({
            count: 1,
            pointBytes: [...f32Bytes(Number.NaN), ...f32Bytes(0), ...f32Bytes(4)],
          }),
        ),
      'invalid-number',
    );
    expectCanvasError(
      () => deserializeStroke('ok1', craftPayload({ count: 1, pointBytes: pointBytes(0, 0, 0) })),
      'invalid-number',
    );
    expectCanvasError(
      () =>
        deserializeStroke(
          'ok1',
          craftPayload({ pen: 99, count: 1, pointBytes: pointBytes(0, 0, 4) }),
        ),
      'unsupported-value',
    );
    expectCanvasError(
      () =>
        deserializeStroke(
          'ok1',
          craftPayload({ pen: 3, flags: 1, count: 1, pointBytes: pointBytes(0, 0, 4) }),
        ),
      'unsupported-value',
    );
  });
});

describe('required freehand pen kinds', () => {
  it('includes fountain-pen and technical-pen as genuinely distinct presets', () => {
    expect(CANVAS_PEN_KINDS).toContain('fountain-pen');
    expect(CANVAS_PEN_KINDS).toContain('technical-pen');
    const fountain = CANVAS_PEN_PRESETS['fountain-pen'];
    const technical = CANVAS_PEN_PRESETS['technical-pen'];
    expect(fountain.kind).toBe('fountain-pen');
    expect(technical.kind).toBe('technical-pen');
    // Fountain pen: flexible nib, high sensitivity, variable width
    expect(fountain.variableWidth).toBe(true);
    expect(fountain.pressureSensitivity).toBeGreaterThan(0.7);
    expect(fountain.blend).toBe('source-over');
    // Technical pen: precise, minimal sensitivity, fixed width
    expect(technical.variableWidth).toBe(false);
    expect(technical.pressureSensitivity).toBeLessThan(0.1);
    expect(technical.blend).toBe('source-over');
    // All presets remain pairwise distinct
    const seen = new Set<string>();
    for (const kind of CANVAS_PEN_KINDS) {
      const preset = CANVAS_PEN_PRESETS[kind];
      const fingerprint = [
        preset.baseWidth,
        preset.opacity,
        preset.pressureSensitivity,
        preset.smoothing,
        preset.streamline,
        preset.stabilization,
        preset.blend,
        preset.variableWidth,
      ].join('|');
      expect(seen.has(fingerprint)).toBe(false);
      seen.add(fingerprint);
    }
  });

  it('builds and round-trips fountain-pen and technical-pen strokes', () => {
    const fountainStroke = buildStroke({
      id: 'fp1',
      style: { pen: 'fountain-pen', smoothing: 0, streamline: 0, stabilization: 0 },
      samples: [
        { x: 0, y: 0, pressure: 0.2 },
        { x: 10, y: 0, pressure: 0.9 },
      ],
    });
    expect(fountainStroke.style.pen).toBe('fountain-pen');
    expect(fountainStroke.style.variableWidth).toBe(true);
    // Variable width: low pressure -> narrower, high pressure -> wider
    expect(fountainStroke.center[0].width).toBeLessThan(fountainStroke.center[1].width);
    const fpData = serializeStroke(fountainStroke);
    expect(serializeStroke(deserializeStroke('fp1', fpData))).toBe(fpData);

    const techStroke = buildStroke({
      id: 'tp1',
      style: { pen: 'technical-pen', smoothing: 0, streamline: 0, stabilization: 0 },
      samples: [
        { x: 0, y: 0, pressure: 0.2 },
        { x: 10, y: 0, pressure: 0.9 },
      ],
    });
    expect(techStroke.style.pen).toBe('technical-pen');
    expect(techStroke.style.variableWidth).toBe(false);
    // Fixed width: same width regardless of pressure
    expect(techStroke.center[0].width).toBe(techStroke.center[1].width);
    const tpData = serializeStroke(techStroke);
    expect(serializeStroke(deserializeStroke('tp1', tpData))).toBe(tpData);
  });

  it('does not include artistic paint media (pencil, chalk) in this slice', () => {
    expect(CANVAS_PEN_KINDS).not.toContain('pencil');
    expect(CANVAS_PEN_KINDS).not.toContain('chalk');
  });
});

describe('serialization security hardening', () => {
  const validStroke = buildStroke({
    id: 'sec1',
    style: { pen: 'pen', smoothing: 0, streamline: 0, stabilization: 0, pressureSensitivity: 0 },
    samples: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
  });

  it('rejects a forged stroke id', () => {
    const forged = { ...validStroke, id: 'bad id!!' } as unknown as CanvasStroke;
    expectCanvasError(() => serializeStroke(forged), 'invalid-id');
  });

  it('rejects a forged pen kind', () => {
    const forged = {
      ...validStroke,
      style: { ...validStroke.style, pen: 'spray-can' },
    } as unknown as CanvasStroke;
    expectCanvasError(() => serializeStroke(forged), 'unsupported-value');
  });

  it('rejects a forged color', () => {
    const forged = {
      ...validStroke,
      style: { ...validStroke.style, color: 'red' },
    } as unknown as CanvasStroke;
    expectCanvasError(() => serializeStroke(forged), 'unsupported-value');
  });

  it('rejects a forged blend mode', () => {
    const forged = {
      ...validStroke,
      style: { ...validStroke.style, blend: 'screen' },
    } as unknown as CanvasStroke;
    expectCanvasError(() => serializeStroke(forged), 'unsupported-value');
  });

  it('rejects a variable-width flag that conflicts with the pen preset', () => {
    // highlighter preset has variableWidth: false
    const highlighterStroke = buildStroke({
      id: 'sec2',
      style: { pen: 'highlighter', smoothing: 0, streamline: 0, stabilization: 0 },
      samples: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    });
    const forged = {
      ...highlighterStroke,
      style: { ...highlighterStroke.style, variableWidth: true },
    } as unknown as CanvasStroke;
    expectCanvasError(() => serializeStroke(forged), 'unsupported-value');
  });

  it('rejects forged center point widths above the resolved maximum', () => {
    const forged = {
      ...validStroke,
      center: [{ x: 0, y: 0, width: CANVAS_STROKE_MAX_RESOLVED_WIDTH + 1 }],
    } as unknown as CanvasStroke;
    expectCanvasError(() => serializeStroke(forged), 'invalid-number');
  });

  it('rejects forged center point coordinates', () => {
    const forged = {
      ...validStroke,
      center: [{ x: Number.NaN, y: 0, width: 4 }],
    } as unknown as CanvasStroke;
    expectCanvasError(() => serializeStroke(forged), 'invalid-number');
  });

  it('rejects forged opacity out of range', () => {
    const forged = {
      ...validStroke,
      style: { ...validStroke.style, opacity: 1.5 },
    } as unknown as CanvasStroke;
    expectCanvasError(() => serializeStroke(forged), 'invalid-number');
  });

  it('rejects forged baseWidth above CANVAS_STROKE_MAX_WIDTH', () => {
    const forged = {
      ...validStroke,
      style: { ...validStroke.style, baseWidth: CANVAS_STROKE_MAX_WIDTH + 1 },
    } as unknown as CanvasStroke;
    expectCanvasError(() => serializeStroke(forged), 'invalid-number');
  });
});

describe('deserialization security hardening', () => {
  it('rejects oversized base64 payloads before allocation', () => {
    // A payload just over the maximum encoded size
    const maxBytes = 19 + CANVAS_MAX_STROKE_POINTS * 12;
    const maxB64 = Math.ceil(maxBytes / 3) * 4;
    const oversized = 'A'.repeat(maxB64 + 4);
    expectCanvasError(() => deserializeStroke('ok1', oversized), 'unsupported-value');
  });

  it('rejects serialized point widths above the resolved maximum', () => {
    // Craft a payload with a width just above 2 * CANVAS_STROKE_MAX_WIDTH
    const badWidth = CANVAS_STROKE_MAX_RESOLVED_WIDTH + 1;
    const payload = craftPayload({
      count: 1,
      pointBytes: pointBytes(0, 0, badWidth),
    });
    expectCanvasError(() => deserializeStroke('ok1', payload), 'invalid-number');
  });

  it('accepts serialized point widths at exactly the resolved maximum', () => {
    const payload = craftPayload({
      count: 1,
      pointBytes: pointBytes(0, 0, CANVAS_STROKE_MAX_RESOLVED_WIDTH),
    });
    const stroke = deserializeStroke('ok1', payload);
    expect(stroke.center[0].width).toBeCloseTo(CANVAS_STROKE_MAX_RESOLVED_WIDTH, 0);
  });
});

describe('resolved width clamping', () => {
  it('clamps computed widths to CANVAS_STROKE_MAX_RESOLVED_WIDTH', () => {
    const style = resolveStrokeStyle({
      pen: 'pen',
      width: CANVAS_STROKE_MAX_WIDTH,
      pressureSensitivity: 1,
      smoothing: 0,
      streamline: 0,
      stabilization: 0,
    });
    const points: CanvasStrokeSamplePoint[] = [
      { x: 0, y: 0, pressure: 1 },
      { x: 1, y: 0, pressure: 0 },
    ];
    const center = computeStrokeWidths(points, style);
    for (const point of center) {
      expect(point.width).toBeLessThanOrEqual(CANVAS_STROKE_MAX_RESOLVED_WIDTH);
      expect(point.width).toBeGreaterThan(0);
    }
  });
});

describe('focused performance budgets', () => {
  const samples = Array.from({ length: 2000 }, (_, i) => ({
    x: i,
    y: Math.round(50 * Math.sin(i / 20)),
  }));

  it('builds a 2000-sample stroke outline well within budget', () => {
    const start = performance.now();
    const stroke = buildStroke({
      id: 'perf1',
      style: { pen: 'pen', smoothing: 0, streamline: 0, stabilization: 0, pressureSensitivity: 0 },
      samples,
    });
    const elapsed = performance.now() - start;
    expect(stroke.center).toHaveLength(2000);
    expect(stroke.outline).toHaveLength(4000);
    expect(Number.isFinite(stroke.bounds.width)).toBe(true);
    expect(elapsed).toBeLessThan(1000);
  });

  it('serializes and restores 2000 points byte-stably within budget', () => {
    const stroke = buildStroke({
      id: 'perf2',
      style: { pen: 'pen', smoothing: 0, streamline: 0, stabilization: 0, pressureSensitivity: 0 },
      samples,
    });
    const start = performance.now();
    const data = serializeStroke(stroke);
    const restored = deserializeStroke('perf2', data);
    const elapsed = performance.now() - start;
    expect(serializeStroke(restored)).toBe(data);
    expect(restored.center).toHaveLength(2000);
    expect(elapsed).toBeLessThan(1000);
  });

  it('hit-tests hundreds of probes within budget', () => {
    const stroke = buildStroke({
      id: 'perf3',
      style: { pen: 'pen', smoothing: 0, streamline: 0, stabilization: 0, pressureSensitivity: 0 },
      samples,
    });
    const start = performance.now();
    let hits = 0;
    for (let i = 0; i < 200; i += 1) {
      if (hitTestStroke(stroke, { x: i * 10, y: 0 })) hits += 1;
    }
    const elapsed = performance.now() - start;
    expect(hits).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(500);
  });
});
