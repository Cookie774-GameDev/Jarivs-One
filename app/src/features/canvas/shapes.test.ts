import { describe, expect, it } from 'vitest';
import {
  CANVAS_SHAPE_KINDS,
  type CanvasShapeKind,
  type CanvasShapeInput,
  createCanvasShape,
  parseCanvasShape,
  serializeCanvasShape,
  shapeTextAnchor,
  shapeConnectionPoints,
  CANVAS_SHAPE_DASH_PATTERNS,
} from './shapes';
import { CanvasValidationError, CANVAS_ID_PATTERN } from './contracts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function minimalInput(overrides: Partial<CanvasShapeInput> = {}): CanvasShapeInput {
  return { id: 'shape-01', kind: 'rectangle', ...overrides };
}

// ---------------------------------------------------------------------------
// Shape kinds (CANVAS-232 through CANVAS-243)
// ---------------------------------------------------------------------------

describe('canvas shape kinds', () => {
  it('exposes exactly the twelve required shape kinds', () => {
    expect(CANVAS_SHAPE_KINDS).toEqual([
      'rectangle',
      'rounded-rectangle',
      'ellipse',
      'diamond',
      'triangle',
      'hexagon',
      'cloud',
      'cylinder',
      'actor',
      'speech-bubble',
      'callout',
      'custom-icon',
    ]);
  });

  it.each(CANVAS_SHAPE_KINDS.map((k) => [k]))('creates a frozen shape of kind "%s"', (kind) => {
    const shape = createCanvasShape(minimalInput({ kind }));
    expect(shape.kind).toBe(kind);
    expect(Object.isFrozen(shape)).toBe(true);
  });

  it('rejects an unknown shape kind', () => {
    expect(() => createCanvasShape(minimalInput({ kind: 'star' as CanvasShapeKind }))).toThrow(
      CanvasValidationError,
    );
  });

  it('rejects a non-string shape kind', () => {
    expect(() =>
      createCanvasShape(minimalInput({ kind: 42 as unknown as CanvasShapeKind })),
    ).toThrow(CanvasValidationError);
  });
});

// ---------------------------------------------------------------------------
// Shape identity
// ---------------------------------------------------------------------------

describe('canvas shape identity', () => {
  it('accepts a valid id matching CANVAS_ID_PATTERN', () => {
    const shape = createCanvasShape(minimalInput({ id: 'Abc_123-x' }));
    expect(shape.id).toBe('Abc_123-x');
  });

  it.each([
    ['empty string', ''],
    ['leading hyphen', '-abc'],
    ['leading underscore', '_abc'],
    ['space inside', 'ab cd'],
    ['too long (65 chars)', 'a'.repeat(65)],
    ['special characters', 'ab@cd'],
  ])('rejects id: %s', (_label, id) => {
    expect(() => createCanvasShape(minimalInput({ id }))).toThrow(CanvasValidationError);
  });

  it('rejects a non-string id', () => {
    expect(() => createCanvasShape(minimalInput({ id: 123 as unknown as string }))).toThrow(
      CanvasValidationError,
    );
  });
});

// ---------------------------------------------------------------------------
// Fill (CANVAS-244)
// ---------------------------------------------------------------------------

describe('canvas shape fill', () => {
  it('accepts a valid hex fill color', () => {
    const shape = createCanvasShape(minimalInput({ fill: '#ff8800' }));
    expect(shape.fill).toEqual({ kind: 'solid', color: '#ff8800' });
  });

  it('defaults fill to null when omitted', () => {
    const shape = createCanvasShape(minimalInput());
    expect(shape.fill).toBeNull();
  });

  it.each([
    ['no hash', 'ff8800'],
    ['short hex', '#f80'],
    ['too long', '#ff88001'],
    ['non-hex chars', '#gggggg'],
    ['empty', ''],
  ])('rejects invalid fill color: %s', (_label, color) => {
    expect(() => createCanvasShape(minimalInput({ fill: color }))).toThrow(CanvasValidationError);
  });
});

// ---------------------------------------------------------------------------
// Gradient (CANVAS-245)
// ---------------------------------------------------------------------------

describe('canvas shape gradient', () => {
  const validGradient = {
    kind: 'linear' as const,
    angle: 45,
    stops: [
      { offset: 0, color: '#000000' },
      { offset: 1, color: '#ffffff' },
    ],
  };

  it('accepts a valid linear gradient', () => {
    const shape = createCanvasShape(minimalInput({ gradient: validGradient }));
    expect(shape.gradient).toEqual(validGradient);
  });

  it('accepts a valid radial gradient', () => {
    const radial = { ...validGradient, kind: 'radial' as const };
    const shape = createCanvasShape(minimalInput({ gradient: radial }));
    expect(shape.gradient!.kind).toBe('radial');
  });

  it('defaults gradient to null when omitted', () => {
    expect(createCanvasShape(minimalInput()).gradient).toBeNull();
  });

  it('rejects gradient with fewer than two stops', () => {
    const oneStop = { ...validGradient, stops: [{ offset: 0, color: '#000000' }] };
    expect(() => createCanvasShape(minimalInput({ gradient: oneStop }))).toThrow(
      CanvasValidationError,
    );
  });

  it('rejects gradient stop offset outside 0..1', () => {
    const bad = {
      ...validGradient,
      stops: [
        { offset: -0.1, color: '#000000' },
        { offset: 1, color: '#ffffff' },
      ],
    };
    expect(() => createCanvasShape(minimalInput({ gradient: bad }))).toThrow(CanvasValidationError);
  });

  it('rejects gradient with invalid stop color', () => {
    const bad = {
      ...validGradient,
      stops: [
        { offset: 0, color: 'red' },
        { offset: 1, color: '#ffffff' },
      ],
    };
    expect(() => createCanvasShape(minimalInput({ gradient: bad }))).toThrow(CanvasValidationError);
  });

  it('rejects gradient with non-finite angle', () => {
    const bad = { ...validGradient, angle: Number.NaN };
    expect(() => createCanvasShape(minimalInput({ gradient: bad }))).toThrow(CanvasValidationError);
  });

  it('rejects unknown gradient kind', () => {
    const bad = { ...validGradient, kind: 'conic' };
    expect(() =>
      createCanvasShape(minimalInput({ gradient: bad as unknown as typeof validGradient })),
    ).toThrow(CanvasValidationError);
  });
});

// ---------------------------------------------------------------------------
// Opacity (CANVAS-246)
// ---------------------------------------------------------------------------

describe('canvas shape opacity', () => {
  it('accepts opacity 0 (fully transparent)', () => {
    expect(createCanvasShape(minimalInput({ opacity: 0 })).opacity).toBe(0);
  });

  it('accepts opacity 1 (fully opaque)', () => {
    expect(createCanvasShape(minimalInput({ opacity: 1 })).opacity).toBe(1);
  });

  it('accepts fractional opacity', () => {
    expect(createCanvasShape(minimalInput({ opacity: 0.5 })).opacity).toBe(0.5);
  });

  it('defaults opacity to 1', () => {
    expect(createCanvasShape(minimalInput()).opacity).toBe(1);
  });

  it.each([
    ['negative', -0.01],
    ['above one', 1.01],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('rejects opacity: %s', (_label, value) => {
    expect(() => createCanvasShape(minimalInput({ opacity: value }))).toThrow(
      CanvasValidationError,
    );
  });
});

// ---------------------------------------------------------------------------
// Border (CANVAS-247) and border width (CANVAS-248)
// ---------------------------------------------------------------------------

describe('canvas shape border', () => {
  it('accepts a valid border color', () => {
    const shape = createCanvasShape(minimalInput({ borderColor: '#336699' }));
    expect(shape.borderColor).toBe('#336699');
  });

  it('defaults borderColor to null', () => {
    expect(createCanvasShape(minimalInput()).borderColor).toBeNull();
  });

  it('rejects invalid border color', () => {
    expect(() => createCanvasShape(minimalInput({ borderColor: 'blue' }))).toThrow(
      CanvasValidationError,
    );
  });

  it('accepts border width 0', () => {
    expect(createCanvasShape(minimalInput({ borderWidth: 0 })).borderWidth).toBe(0);
  });

  it('accepts positive border width', () => {
    expect(createCanvasShape(minimalInput({ borderWidth: 2.5 })).borderWidth).toBe(2.5);
  });

  it('defaults border width to 1', () => {
    expect(createCanvasShape(minimalInput()).borderWidth).toBe(1);
  });

  it.each([
    ['negative', -1],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('rejects border width: %s', (_label, value) => {
    expect(() => createCanvasShape(minimalInput({ borderWidth: value }))).toThrow(
      CanvasValidationError,
    );
  });
});

// ---------------------------------------------------------------------------
// Dash pattern (CANVAS-249)
// ---------------------------------------------------------------------------

describe('canvas shape dash pattern', () => {
  it('exposes the required dash patterns', () => {
    expect(CANVAS_SHAPE_DASH_PATTERNS).toEqual(['solid', 'dashed', 'dotted']);
  });

  it.each(CANVAS_SHAPE_DASH_PATTERNS.map((d) => [d]))('accepts dash "%s"', (dash) => {
    expect(createCanvasShape(minimalInput({ dash })).dash).toBe(dash);
  });

  it('defaults dash to solid', () => {
    expect(createCanvasShape(minimalInput()).dash).toBe('solid');
  });

  it('rejects unknown dash pattern', () => {
    expect(() => createCanvasShape(minimalInput({ dash: 'dash-dot' as never }))).toThrow(
      CanvasValidationError,
    );
  });
});

// ---------------------------------------------------------------------------
// Corner radius (CANVAS-250)
// ---------------------------------------------------------------------------

describe('canvas shape corner radius', () => {
  it('accepts corner radius 0', () => {
    expect(createCanvasShape(minimalInput({ cornerRadius: 0 })).cornerRadius).toBe(0);
  });

  it('accepts positive corner radius', () => {
    expect(createCanvasShape(minimalInput({ cornerRadius: 12 })).cornerRadius).toBe(12);
  });

  it('defaults corner radius to 0', () => {
    expect(createCanvasShape(minimalInput()).cornerRadius).toBe(0);
  });

  it.each([
    ['negative', -1],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('rejects corner radius: %s', (_label, value) => {
    expect(() => createCanvasShape(minimalInput({ cornerRadius: value }))).toThrow(
      CanvasValidationError,
    );
  });
});

// ---------------------------------------------------------------------------
// Shadow (CANVAS-251)
// ---------------------------------------------------------------------------

describe('canvas shape shadow', () => {
  const validShadow = { color: '#00000066', offsetX: 2, offsetY: 4, blur: 8 };

  it('accepts a valid shadow', () => {
    const shape = createCanvasShape(minimalInput({ shadow: validShadow }));
    expect(shape.shadow).toEqual(validShadow);
  });

  it('defaults shadow to null', () => {
    expect(createCanvasShape(minimalInput()).shadow).toBeNull();
  });

  it('rejects shadow with invalid color', () => {
    expect(() =>
      createCanvasShape(minimalInput({ shadow: { ...validShadow, color: 'black' } })),
    ).toThrow(CanvasValidationError);
  });

  it('rejects shadow with negative blur', () => {
    expect(() => createCanvasShape(minimalInput({ shadow: { ...validShadow, blur: -1 } }))).toThrow(
      CanvasValidationError,
    );
  });

  it('rejects shadow with non-finite offset', () => {
    expect(() =>
      createCanvasShape(minimalInput({ shadow: { ...validShadow, offsetX: Number.NaN } })),
    ).toThrow(CanvasValidationError);
  });
});

// ---------------------------------------------------------------------------
// Text (CANVAS-252)
// ---------------------------------------------------------------------------

describe('canvas shape text', () => {
  it('accepts a text label', () => {
    expect(createCanvasShape(minimalInput({ text: 'Hello' })).text).toBe('Hello');
  });

  it('defaults text to null', () => {
    expect(createCanvasShape(minimalInput()).text).toBeNull();
  });

  it('accepts empty string text', () => {
    expect(createCanvasShape(minimalInput({ text: '' })).text).toBe('');
  });

  it('rejects text exceeding maximum length', () => {
    expect(() => createCanvasShape(minimalInput({ text: 'x'.repeat(100_001) }))).toThrow(
      CanvasValidationError,
    );
  });

  it('rejects non-string text', () => {
    expect(() => createCanvasShape(minimalInput({ text: 42 as unknown as string }))).toThrow(
      CanvasValidationError,
    );
  });
});

// ---------------------------------------------------------------------------
// Link (CANVAS-253)
// ---------------------------------------------------------------------------

describe('canvas shape link', () => {
  it('accepts a valid https URL', () => {
    expect(createCanvasShape(minimalInput({ link: 'https://example.com' })).link).toBe(
      'https://example.com',
    );
  });

  it('accepts a valid http URL', () => {
    expect(createCanvasShape(minimalInput({ link: 'http://example.com/path?q=1' })).link).toBe(
      'http://example.com/path?q=1',
    );
  });

  it('defaults link to null', () => {
    expect(createCanvasShape(minimalInput()).link).toBeNull();
  });

  it.each([
    ['javascript protocol', 'javascript:alert(1)'],
    ['data URI', 'data:text/html,<h1>hi</h1>'],
    ['no protocol', 'example.com'],
    ['empty string', ''],
    ['control character', 'https://example.com\njavascript:alert(1)'],
  ])('rejects link: %s', (_label, link) => {
    expect(() => createCanvasShape(minimalInput({ link }))).toThrow(CanvasValidationError);
  });
});

// ---------------------------------------------------------------------------
// Immutability and serialization (CANVAS-254)
// ---------------------------------------------------------------------------

describe('canvas shape immutability and serialization', () => {
  it('returns a deeply frozen shape', () => {
    const shape = createCanvasShape(
      minimalInput({
        fill: '#ff0000',
        gradient: {
          kind: 'linear',
          angle: 90,
          stops: [
            { offset: 0, color: '#000000' },
            { offset: 1, color: '#ffffff' },
          ],
        },
        shadow: { color: '#000000', offsetX: 1, offsetY: 1, blur: 2 },
      }),
    );
    expect(Object.isFrozen(shape)).toBe(true);
    expect(Object.isFrozen(shape.fill)).toBe(true);
    expect(Object.isFrozen(shape.gradient)).toBe(true);
    expect(Object.isFrozen(shape.gradient!.stops)).toBe(true);
    expect(Object.isFrozen(shape.shadow)).toBe(true);
  });

  it('round-trips through serialization', () => {
    const input = minimalInput({
      kind: 'ellipse',
      fill: '#aabbcc',
      opacity: 0.75,
      borderColor: '#112233',
      borderWidth: 3,
      dash: 'dashed',
      cornerRadius: 8,
      text: 'Label',
      link: 'https://example.com',
    });
    const shape = createCanvasShape(input);
    const json = serializeCanvasShape(shape);
    const restored = parseCanvasShape(JSON.parse(json));
    expect(restored).toEqual(shape);
  });

  it('rejects unknown fields during parse', () => {
    const raw = { id: 'shape-01', kind: 'rectangle', bogus: true };
    expect(() => parseCanvasShape(raw)).toThrow(CanvasValidationError);
  });

  it('rejects unknown nested fields during parse', () => {
    const raw = {
      id: 'shape-01',
      kind: 'rectangle',
      gradient: {
        kind: 'linear',
        angle: 0,
        stops: [
          { offset: 0, color: '#000000', bogus: true },
          { offset: 1, color: '#ffffff' },
        ],
      },
    };
    expect(() => parseCanvasShape(raw)).toThrow(CanvasValidationError);
  });

  it('validates a cast shape before serialization', () => {
    expect(() =>
      serializeCanvasShape({
        ...createCanvasShape(minimalInput()),
        opacity: Number.NaN,
      }),
    ).toThrow(CanvasValidationError);
  });

  it('rejects non-object parse input', () => {
    expect(() => parseCanvasShape('not-an-object')).toThrow(CanvasValidationError);
    expect(() => parseCanvasShape(null)).toThrow(CanvasValidationError);
    expect(() => parseCanvasShape(42)).toThrow(CanvasValidationError);
  });
});

// ---------------------------------------------------------------------------
// Geometry: text anchor and connection points (CANVAS-255)
// ---------------------------------------------------------------------------

describe('canvas shape geometry', () => {
  const bounds = { x: 100, y: 200, width: 300, height: 150 };

  it('returns a deterministic center text anchor for every kind', () => {
    for (const kind of CANVAS_SHAPE_KINDS) {
      const shape = createCanvasShape(minimalInput({ kind }));
      const anchor = shapeTextAnchor(shape, bounds);
      expect(anchor).toEqual({ x: 250, y: 275 });
    }
  });

  it('returns deterministic connection points for every kind', () => {
    for (const kind of CANVAS_SHAPE_KINDS) {
      const shape = createCanvasShape(minimalInput({ kind }));
      const points = shapeConnectionPoints(shape, bounds);
      expect(points.length).toBe(4);
      expect(Object.isFrozen(points)).toBe(true);
      // top, right, bottom, left midpoints
      expect(points[0]).toEqual({ x: 250, y: 200 });
      expect(points[1]).toEqual({ x: 400, y: 275 });
      expect(points[2]).toEqual({ x: 250, y: 350 });
      expect(points[3]).toEqual({ x: 100, y: 275 });
    }
  });

  it('rejects non-finite bounds', () => {
    const shape = createCanvasShape(minimalInput());
    expect(() => shapeTextAnchor(shape, { x: Number.NaN, y: 0, width: 10, height: 10 })).toThrow(
      CanvasValidationError,
    );
  });

  it('rejects negative-size bounds', () => {
    const shape = createCanvasShape(minimalInput());
    expect(() => shapeConnectionPoints(shape, { x: 0, y: 0, width: -1, height: 10 })).toThrow(
      CanvasValidationError,
    );
  });
});
