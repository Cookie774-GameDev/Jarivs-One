import { describe, expect, it } from 'vitest';
import { CanvasValidationError, type CanvasValidationErrorCode } from './contracts';
import {
  CANVAS_MAX_STROKE_POINTS,
  CANVAS_STROKE_MAX_COORDINATE,
  CANVAS_STROKE_MAX_RESOLVED_WIDTH,
  buildStroke,
  type CanvasStroke,
} from './strokes';
import {
  CANVAS_PAINT_BLENDS,
  CANVAS_PAINT_MAX_DABS,
  CANVAS_PAINT_MAX_SEED,
  CANVAS_PAINT_MEDIA,
  CANVAS_PAINT_MIN_DAB_RADIUS,
  CANVAS_PAINT_PRESETS,
  CANVAS_PAINT_SCHEMA_VERSION,
  CANVAS_PAINT_STAMP_SHAPES,
  buildPaintPlan,
  isCanvasPaintMedium,
  normalizePaintSeed,
  resolvePaintPreset,
  type CanvasPaintMedium,
  type CanvasPaintPlan,
  type CanvasPaintPreset,
} from './paint';

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

const REQUIRED_MEDIA: readonly CanvasPaintMedium[] = [
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
];

/** A genuine pressure-aware stroke with a ramping pressure profile. */
function standardStroke(): CanvasStroke {
  const samples = [];
  for (let i = 0; i <= 8; i += 1) {
    samples.push({ x: i * 10, y: 0, pressure: 0.1 + i * 0.1, kind: 'stylus' as const });
  }
  return buildStroke({ id: 'stroke-1', style: { pen: 'pen' }, samples });
}

/** A constant-width (non variable) stroke. */
function constantStroke(): CanvasStroke {
  const samples = [];
  for (let i = 0; i <= 6; i += 1) {
    samples.push({ x: i * 12, y: 4, pressure: 0.5, kind: 'stylus' as const });
  }
  return buildStroke({ id: 'stroke-2', style: { pen: 'technical-pen' }, samples });
}

function planOptions(medium: CanvasPaintMedium, seed = 1234) {
  return { medium, seed };
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function presetAxisVector(preset: CanvasPaintPreset): readonly (string | number)[] {
  return [
    preset.stamp.shape,
    preset.stamp.sizeFactor,
    preset.stamp.aspect,
    preset.stamp.angleJitter,
    preset.grain,
    preset.opacityBuildup,
    preset.edgeSoftness,
    preset.pressureResponse,
    preset.blend,
    preset.spacing,
    preset.jitter,
    preset.flow,
  ];
}

function differingAxes(a: CanvasPaintPreset, b: CanvasPaintPreset): number {
  const va = presetAxisVector(a);
  const vb = presetAxisVector(b);
  let count = 0;
  for (let i = 0; i < va.length; i += 1) {
    if (va[i] !== vb[i]) {
      count += 1;
    }
  }
  return count;
}

/** A behavior signature derived from the generated render instructions. */
function planBehaviorSignature(plan: CanvasPaintPlan): string {
  const first = plan.dabs[0];
  const last = plan.dabs[plan.dabs.length - 1];
  return [
    plan.blend,
    plan.dabs.length,
    round(first.radius, 3),
    round(first.opacity, 4),
    round(first.rotation, 3),
    first.grainSeed,
    round(last.opacity, 4),
    plan.preset.stamp.shape,
    round(plan.preset.spacing, 3),
    round(plan.preset.grain, 3),
    round(plan.preset.edgeSoftness, 3),
  ].join('|');
}

describe('paint preset registry', () => {
  it('exposes exactly the twelve required artistic media', () => {
    expect([...CANVAS_PAINT_MEDIA].sort()).toEqual([...REQUIRED_MEDIA].sort());
    expect(CANVAS_PAINT_MEDIA).toHaveLength(REQUIRED_MEDIA.length);
  });

  it('provides a deeply frozen preset for every medium', () => {
    for (const medium of REQUIRED_MEDIA) {
      const preset = CANVAS_PAINT_PRESETS[medium];
      expect(preset).toBeDefined();
      expect(preset.medium).toBe(medium);
      expect(Object.isFrozen(preset)).toBe(true);
      expect(Object.isFrozen(preset.stamp)).toBe(true);
    }
    expect(Object.isFrozen(CANVAS_PAINT_PRESETS)).toBe(true);
  });

  it('keeps every preset parameter within its bounded range', () => {
    for (const medium of REQUIRED_MEDIA) {
      const preset = CANVAS_PAINT_PRESETS[medium];
      expect(CANVAS_PAINT_STAMP_SHAPES).toContain(preset.stamp.shape);
      expect(CANVAS_PAINT_BLENDS).toContain(preset.blend);
      expect(preset.stamp.sizeFactor).toBeGreaterThan(0);
      expect(preset.stamp.aspect).toBeGreaterThan(0);
      expect(preset.stamp.aspect).toBeLessThanOrEqual(1);
      expect(preset.stamp.angleJitter).toBeGreaterThanOrEqual(0);
      expect(preset.stamp.angleJitter).toBeLessThanOrEqual(180);
      for (const value of [
        preset.grain,
        preset.opacityBuildup,
        preset.edgeSoftness,
        preset.pressureResponse,
        preset.jitter,
        preset.flow,
      ]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      expect(preset.spacing).toBeGreaterThan(0);
    }
  });

  it('makes every preset pairwise distinct across at least two rendering axes', () => {
    for (let i = 0; i < REQUIRED_MEDIA.length; i += 1) {
      for (let j = i + 1; j < REQUIRED_MEDIA.length; j += 1) {
        const a = CANVAS_PAINT_PRESETS[REQUIRED_MEDIA[i]];
        const b = CANVAS_PAINT_PRESETS[REQUIRED_MEDIA[j]];
        expect(differingAxes(a, b)).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('uses an explicit safe erase composite mode for the soft eraser', () => {
    expect(CANVAS_PAINT_PRESETS['soft-eraser'].blend).toBe('destination-out');
  });
});

describe('isCanvasPaintMedium / resolvePaintPreset', () => {
  it('recognizes every required medium and rejects others', () => {
    for (const medium of REQUIRED_MEDIA) {
      expect(isCanvasPaintMedium(medium)).toBe(true);
    }
    expect(isCanvasPaintMedium('spray')).toBe(false);
    expect(isCanvasPaintMedium('')).toBe(false);
    expect(isCanvasPaintMedium(42)).toBe(false);
    expect(isCanvasPaintMedium(null)).toBe(false);
    expect(isCanvasPaintMedium(undefined)).toBe(false);
  });

  it('resolves the frozen preset for each valid medium', () => {
    for (const medium of REQUIRED_MEDIA) {
      const preset = resolvePaintPreset(medium);
      expect(preset).toBe(CANVAS_PAINT_PRESETS[medium]);
      expect(Object.isFrozen(preset)).toBe(true);
    }
  });

  it('fails closed for invalid preset names', () => {
    expectCanvasError(() => resolvePaintPreset('spray'), 'unsupported-value');
    expectCanvasError(() => resolvePaintPreset(''), 'unsupported-value');
    expectCanvasError(() => resolvePaintPreset(123), 'unsupported-value');
    expectCanvasError(() => resolvePaintPreset(null), 'unsupported-value');
    expectCanvasError(() => resolvePaintPreset(undefined), 'unsupported-value');
    expectCanvasError(() => resolvePaintPreset({ medium: 'oil' }), 'unsupported-value');
  });
});

describe('normalizePaintSeed', () => {
  it('accepts bounded safe integers', () => {
    expect(normalizePaintSeed(0)).toBe(0);
    expect(normalizePaintSeed(1)).toBe(1);
    expect(normalizePaintSeed(CANVAS_PAINT_MAX_SEED)).toBe(CANVAS_PAINT_MAX_SEED);
  });

  it('fails closed for non-finite, fractional, negative, or oversized seeds', () => {
    expectCanvasError(() => normalizePaintSeed(Number.NaN), 'invalid-number');
    expectCanvasError(() => normalizePaintSeed(Number.POSITIVE_INFINITY), 'invalid-number');
    expectCanvasError(() => normalizePaintSeed(1.5), 'invalid-number');
    expectCanvasError(() => normalizePaintSeed(-1), 'invalid-number');
    expectCanvasError(() => normalizePaintSeed(CANVAS_PAINT_MAX_SEED + 1), 'invalid-number');
    expectCanvasError(() => normalizePaintSeed('12'), 'invalid-number');
    expectCanvasError(() => normalizePaintSeed(null), 'invalid-number');
  });
});

describe('buildPaintPlan input validation (fail closed)', () => {
  const stroke = standardStroke();

  it('rejects a non-object stroke', () => {
    expectCanvasError(() => buildPaintPlan(null, planOptions('oil')), 'invalid-type');
    expectCanvasError(() => buildPaintPlan('stroke', planOptions('oil')), 'invalid-type');
  });

  it('rejects forged nested fields on the stroke', () => {
    const forged = { ...stroke, renderLayer: 'evil' };
    expectCanvasError(() => buildPaintPlan(forged, planOptions('oil')), 'unsupported-value');
  });

  it('rejects an invalid stroke id', () => {
    const bad = { ...stroke, id: '!!bad id!!' };
    expectCanvasError(() => buildPaintPlan(bad, planOptions('oil')), 'invalid-id');
  });

  it('rejects non-finite and oversized center coordinates', () => {
    const nanCenter = {
      ...stroke,
      center: [{ x: Number.NaN, y: 0, width: 4 }],
    };
    expectCanvasError(() => buildPaintPlan(nanCenter, planOptions('oil')), 'invalid-number');
    const hugeCenter = {
      ...stroke,
      center: [{ x: CANVAS_STROKE_MAX_COORDINATE + 1, y: 0, width: 4 }],
    };
    expectCanvasError(() => buildPaintPlan(hugeCenter, planOptions('oil')), 'invalid-number');
  });

  it('rejects invalid center widths', () => {
    const zeroWidth = { ...stroke, center: [{ x: 0, y: 0, width: 0 }] };
    expectCanvasError(() => buildPaintPlan(zeroWidth, planOptions('oil')), 'invalid-number');
    const bigWidth = {
      ...stroke,
      center: [{ x: 0, y: 0, width: CANVAS_STROKE_MAX_RESOLVED_WIDTH + 1 }],
    };
    expectCanvasError(() => buildPaintPlan(bigWidth, planOptions('oil')), 'invalid-number');
  });

  it('rejects empty and oversized point counts', () => {
    const empty = { ...stroke, center: [] };
    expectCanvasError(() => buildPaintPlan(empty, planOptions('oil')), 'unsupported-value');
    const tooMany = {
      ...stroke,
      center: Array.from({ length: CANVAS_MAX_STROKE_POINTS + 1 }, (_, i) => ({
        x: i,
        y: 0,
        width: 4,
      })),
    };
    expectCanvasError(() => buildPaintPlan(tooMany, planOptions('oil')), 'unsupported-value');
  });

  it('rejects forged nested fields on center points', () => {
    const forgedPoint = {
      ...stroke,
      center: [{ x: 0, y: 0, width: 4, wobble: 1 }],
    };
    expectCanvasError(() => buildPaintPlan(forgedPoint, planOptions('oil')), 'unsupported-value');
  });

  it('rejects an invalid stroke style color and opacity', () => {
    const badColor = { ...stroke, style: { ...stroke.style, color: 'red' } };
    expectCanvasError(() => buildPaintPlan(badColor, planOptions('oil')), 'unsupported-value');
    const badOpacity = { ...stroke, style: { ...stroke.style, opacity: 2 } };
    expectCanvasError(() => buildPaintPlan(badOpacity, planOptions('oil')), 'invalid-number');
  });

  it('rejects forged nested fields on the options object', () => {
    expectCanvasError(
      () => buildPaintPlan(stroke, { medium: 'oil', seed: 1, deviceId: 'x' }),
      'unsupported-value',
    );
  });

  it('rejects invalid option values', () => {
    expectCanvasError(
      () => buildPaintPlan(stroke, { medium: 'spray', seed: 1 }),
      'unsupported-value',
    );
    expectCanvasError(() => buildPaintPlan(stroke, { medium: 'oil', seed: -5 }), 'invalid-number');
    expectCanvasError(
      () => buildPaintPlan(stroke, { medium: 'oil', seed: 1, color: 'blue' }),
      'unsupported-value',
    );
    expectCanvasError(
      () => buildPaintPlan(stroke, { medium: 'oil', seed: 1, opacity: 3 }),
      'invalid-number',
    );
    expectCanvasError(() => buildPaintPlan(stroke, { seed: 1 } as never), 'unsupported-value');
  });

  it('rejects a malformed tilt projection', () => {
    expectCanvasError(
      () => buildPaintPlan(stroke, { medium: 'oil', seed: 1, tilt: [{ tiltX: 0 }] }),
      'unsupported-value',
    );
    expectCanvasError(
      () => buildPaintPlan(stroke, { medium: 'oil', seed: 1, tilt: [{ tiltX: 91, tiltY: 0 }] }),
      'invalid-number',
    );
    expectCanvasError(
      () =>
        buildPaintPlan(stroke, {
          medium: 'oil',
          seed: 1,
          tilt: [{ tiltX: 0, tiltY: 0, z: 1 }],
        }),
      'unsupported-value',
    );
    expectCanvasError(
      () =>
        buildPaintPlan(stroke, {
          medium: 'oil',
          seed: 1,
          tilt: [{ tiltX: 0, tiltY: 0 }],
        }),
      'unsupported-value',
    );
  });
});

describe('buildPaintPlan rendering plan', () => {
  const stroke = standardStroke();

  it('produces a deeply frozen plan with a bounded, bitmap-free shape', () => {
    const plan = buildPaintPlan(stroke, planOptions('oil'));
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.dabs)).toBe(true);
    expect(Object.isFrozen(plan.dabs[0])).toBe(true);
    expect(plan.schemaVersion).toBe(CANVAS_PAINT_SCHEMA_VERSION);
    expect(Object.keys(plan).sort()).toEqual(
      [
        'blend',
        'bounds',
        'color',
        'dabCount',
        'dabs',
        'medium',
        'opacity',
        'outline',
        'preset',
        'schemaVersion',
        'seed',
        'strokeId',
      ].sort(),
    );
    const serialized = JSON.stringify(plan);
    expect(serialized).not.toContain('data:');
    expect(plan.dabCount).toBe(plan.dabs.length);
  });

  it('is a hybrid plan carrying the vector outline and bounded raster dabs', () => {
    const plan = buildPaintPlan(stroke, planOptions('charcoal'));
    expect(plan.outline).toEqual(stroke.outline);
    expect(plan.bounds).toEqual(stroke.bounds);
    expect(plan.dabs.length).toBeGreaterThan(0);
    expect(plan.dabs.length).toBeLessThanOrEqual(CANVAS_PAINT_MAX_DABS);
  });

  it('is deterministic for identical inputs', () => {
    const a = buildPaintPlan(stroke, planOptions('watercolor', 99));
    const b = buildPaintPlan(stroke, planOptions('watercolor', 99));
    expect(a).toEqual(b);
  });

  it('changes jittered dabs when the seed changes for a grainy preset', () => {
    const a = buildPaintPlan(stroke, planOptions('charcoal', 1));
    const b = buildPaintPlan(stroke, planOptions('charcoal', 2));
    expect(JSON.stringify(a.dabs)).not.toEqual(JSON.stringify(b.dabs));
  });

  it('keeps every dab finite and bounded', () => {
    const plan = buildPaintPlan(stroke, planOptions('dry-brush', 7));
    for (const dab of plan.dabs) {
      expect(Number.isFinite(dab.x)).toBe(true);
      expect(Number.isFinite(dab.y)).toBe(true);
      expect(Math.abs(dab.x)).toBeLessThanOrEqual(CANVAS_STROKE_MAX_COORDINATE);
      expect(Math.abs(dab.y)).toBeLessThanOrEqual(CANVAS_STROKE_MAX_COORDINATE);
      expect(dab.radius).toBeGreaterThanOrEqual(CANVAS_PAINT_MIN_DAB_RADIUS);
      expect(dab.radius).toBeLessThanOrEqual(CANVAS_STROKE_MAX_RESOLVED_WIDTH);
      expect(dab.opacity).toBeGreaterThanOrEqual(0);
      expect(dab.opacity).toBeLessThanOrEqual(1);
      expect(Number.isFinite(dab.rotation)).toBe(true);
      expect(Math.abs(dab.rotation)).toBeLessThanOrEqual(180);
      expect(Number.isInteger(dab.grainSeed)).toBe(true);
      expect(dab.grainSeed).toBeGreaterThanOrEqual(0);
    }
  });

  it('modulates dab opacity from pressure-aware width via pressureResponse', () => {
    const responsive = buildPaintPlan(stroke, planOptions('ink-wash', 5));
    const opacities = responsive.dabs.map((d) => round(d.opacity, 6));
    expect(Math.max(...opacities)).toBeGreaterThan(Math.min(...opacities));
  });

  it('emits a safe erase plan for the soft eraser', () => {
    const plan = buildPaintPlan(stroke, planOptions('soft-eraser', 3));
    expect(plan.blend).toBe('destination-out');
    expect(plan.preset.blend).toBe('destination-out');
  });

  it('resolves color and opacity from the stroke style with validated overrides', () => {
    const base = buildPaintPlan(stroke, planOptions('acrylic', 1));
    expect(base.color).toBe(stroke.style.color);
    expect(base.opacity).toBe(stroke.style.opacity);
    const overridden = buildPaintPlan(stroke, {
      medium: 'acrylic',
      seed: 1,
      color: '#ff0000',
      opacity: 0.25,
    });
    expect(overridden.color).toBe('#ff0000');
    expect(overridden.opacity).toBe(0.25);
    const baseMax = Math.max(...base.dabs.map((d) => d.opacity));
    const scaledMax = Math.max(...overridden.dabs.map((d) => d.opacity));
    expect(scaledMax).toBeLessThan(baseMax);
  });

  it('caps the raster dab count for an extremely long stroke', () => {
    const longStroke = {
      id: 'long-1',
      style: {
        pen: 'technical-pen',
        color: '#000000',
        opacity: 1,
        baseWidth: 1,
        pressureSensitivity: 0,
        smoothing: 0,
        streamline: 0,
        stabilization: 0,
        blend: 'source-over',
        variableWidth: false,
      },
      center: [
        { x: 0, y: 0, width: 1 },
        { x: 100_000_000, y: 0, width: 1 },
      ],
      outline: [
        { x: 0, y: -1 },
        { x: 100_000_000, y: 1 },
      ],
      bounds: { x: 0, y: -1, width: 100_000_000, height: 2 },
    };
    const plan = buildPaintPlan(longStroke, { medium: 'airbrush', seed: 1 });
    expect(plan.dabs.length).toBe(CANVAS_PAINT_MAX_DABS);
    expect(plan.dabCount).toBe(CANVAS_PAINT_MAX_DABS);
  });

  it('accepts an optional validated tilt projection that rotates chisel stamps', () => {
    const tilt = stroke.center.map(() => ({ tiltX: 45, tiltY: 0 }));
    const flat = buildPaintPlan(stroke, planOptions('palette-knife', 4));
    const tilted = buildPaintPlan(stroke, { medium: 'palette-knife', seed: 4, tilt });
    expect(tilted.dabs[0].rotation).not.toEqual(flat.dabs[0].rotation);
  });
});

describe('presets do not collapse to the same line behavior', () => {
  const stroke = standardStroke();

  it('generates a unique behavior signature for every medium', () => {
    const signatures = new Set<string>();
    for (const medium of REQUIRED_MEDIA) {
      const plan = buildPaintPlan(stroke, planOptions(medium, 42));
      signatures.add(planBehaviorSignature(plan));
    }
    expect(signatures.size).toBe(REQUIRED_MEDIA.length);
  });

  it('varies the raster dab geometry across presets, not just metadata', () => {
    const dabCounts = new Set<number>();
    const firstRadii = new Set<number>();
    const firstOpacities = new Set<number>();
    for (const medium of REQUIRED_MEDIA) {
      const plan = buildPaintPlan(stroke, planOptions(medium, 42));
      dabCounts.add(plan.dabs.length);
      firstRadii.add(round(plan.dabs[0].radius, 3));
      firstOpacities.add(round(plan.dabs[0].opacity, 4));
    }
    expect(dabCounts.size).toBeGreaterThan(1);
    expect(firstRadii.size).toBeGreaterThan(1);
    expect(firstOpacities.size).toBeGreaterThan(1);
  });

  it('also distinguishes presets on a constant-width stroke', () => {
    const stroke2 = constantStroke();
    const signatures = new Set<string>();
    for (const medium of REQUIRED_MEDIA) {
      const plan = buildPaintPlan(stroke2, planOptions(medium, 42));
      signatures.add(planBehaviorSignature(plan));
    }
    expect(signatures.size).toBe(REQUIRED_MEDIA.length);
  });
});
