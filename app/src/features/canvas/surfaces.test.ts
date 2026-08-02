import { describe, expect, it } from 'vitest';
import { CanvasValidationError } from './contracts';
import {
  CANVAS_SURFACE_PRESETS,
  CANVAS_SURFACE_PRESET_DEFAULTS,
  createCanvasSurface,
  isCanvasSurfacePreset,
  parseCanvasSurface,
  serializeCanvasSurface,
  surfaceRenderDescriptor,
  withSurfaceColor,
  withSurfaceGridSize,
  withSurfaceGridVisible,
  withSurfacePrintExport,
  withSurfaceTextureStrength,
  type CanvasSurfacePreset,
} from './surfaces';

const REQUIRED: readonly CanvasSurfacePreset[] = [
  'plain-warm-paper',
  'white-paper',
  'dark-paper',
  'dot-grid',
  'square-grid',
  'lined-paper',
  'graph-paper',
  'blueprint',
  'corkboard',
  'canvas-fabric',
  'watercolor-paper',
  'sketch-paper',
  'transparent',
];

describe('Canvas surface presets', () => {
  it('contains every required preset exactly once', () => {
    expect(CANVAS_SURFACE_PRESETS).toEqual(REQUIRED);
    expect(new Set(CANVAS_SURFACE_PRESETS).size).toBe(13);
  });

  it('provides immutable defaults for every preset', () => {
    for (const preset of REQUIRED) {
      const value = CANVAS_SURFACE_PRESET_DEFAULTS[preset];
      expect(value.preset).toBe(preset);
      expect(Object.isFrozen(value)).toBe(true);
    }
  });

  it('recognizes only canonical preset names', () => {
    REQUIRED.forEach((preset) => expect(isCanvasSurfacePreset(preset)).toBe(true));
    expect(isCanvasSurfacePreset('paper')).toBe(false);
    expect(isCanvasSurfacePreset(null)).toBe(false);
  });
});

describe('Canvas surface configuration', () => {
  it('creates every preset deterministically from bounded defaults', () => {
    for (const preset of REQUIRED) {
      const first = createCanvasSurface({ preset });
      const second = createCanvasSurface({ preset });
      expect(first).toEqual(second);
      expect(Object.isFrozen(first)).toBe(true);
    }
  });

  it('supports all five per-surface settings', () => {
    const surface = createCanvasSurface({
      preset: 'dot-grid',
      backgroundColor: '#ABCDEF',
      textureStrength: 0.72,
      gridSize: 48,
      gridVisible: false,
      includeInPrintExport: false,
    });
    expect(surface).toEqual({
      preset: 'dot-grid',
      backgroundColor: '#abcdef',
      textureStrength: 0.72,
      gridSize: 48,
      gridVisible: false,
      includeInPrintExport: false,
    });
  });

  it('fails closed for unknown fields and invalid values', () => {
    expect(() => createCanvasSurface({ preset: 'unknown' } as never)).toThrow(
      CanvasValidationError,
    );
    expect(() =>
      createCanvasSurface({
        preset: 'white-paper',
        embeddedTexture: 'data:image/png;base64,x',
      } as never),
    ).toThrow(CanvasValidationError);
    expect(() => createCanvasSurface({ preset: 'white-paper', backgroundColor: 'red' })).toThrow(
      CanvasValidationError,
    );
    expect(() => createCanvasSurface({ preset: 'white-paper', textureStrength: 2 })).toThrow(
      CanvasValidationError,
    );
    expect(() => createCanvasSurface({ preset: 'white-paper', gridSize: 2 })).toThrow(
      CanvasValidationError,
    );
    expect(() => createCanvasSurface({ preset: 'white-paper', gridSize: 10.5 })).toThrow(
      CanvasValidationError,
    );
  });

  it('allows transparent only as the transparent preset color', () => {
    expect(createCanvasSurface({ preset: 'transparent' }).backgroundColor).toBe('transparent');
    expect(() =>
      createCanvasSurface({ preset: 'white-paper', backgroundColor: 'transparent' }),
    ).toThrow(CanvasValidationError);
    expect(() =>
      createCanvasSurface({ preset: 'transparent', backgroundColor: '#ffffff' }),
    ).toThrow(CanvasValidationError);
  });

  it('updates settings immutably and preserves identity for no-op changes', () => {
    const base = createCanvasSurface({ preset: 'graph-paper' });
    const colored = withSurfaceColor(base, '#112233');
    const textured = withSurfaceTextureStrength(colored, 0.8);
    const resized = withSurfaceGridSize(textured, 64);
    const hidden = withSurfaceGridVisible(resized, false);
    const excluded = withSurfacePrintExport(hidden, false);
    expect(excluded).toMatchObject({
      backgroundColor: '#112233',
      textureStrength: 0.8,
      gridSize: 64,
      gridVisible: false,
      includeInPrintExport: false,
    });
    expect(withSurfaceColor(colored, '#112233')).toBe(colored);
    expect(withSurfaceTextureStrength(textured, 0.8)).toBe(textured);
    expect(Object.isFrozen(excluded)).toBe(true);
  });

  it('round-trips through deterministic strict JSON', () => {
    for (const preset of REQUIRED) {
      const surface = createCanvasSurface({ preset });
      expect(parseCanvasSurface(serializeCanvasSurface(surface))).toEqual(surface);
      expect(serializeCanvasSurface(surface)).toBe(serializeCanvasSurface(surface));
    }
    expect(() => parseCanvasSurface('{"preset":"white-paper","unknown":true}')).toThrow(
      CanvasValidationError,
    );
    expect(() => parseCanvasSurface('{broken')).toThrow(CanvasValidationError);
  });
});

describe('generated surface render descriptors', () => {
  it('uses only bounded generated/repeating layers, never embedded images', () => {
    for (const preset of REQUIRED) {
      const descriptor = surfaceRenderDescriptor(createCanvasSurface({ preset }));
      expect(Object.isFrozen(descriptor)).toBe(true);
      expect(descriptor.layers.length).toBeLessThanOrEqual(3);
      expect(descriptor.layers.every((layer) => String(layer.kind) !== 'image')).toBe(true);
      expect(JSON.stringify(descriptor)).not.toContain('data:');
      expect(JSON.stringify(descriptor)).not.toContain('base64');
    }
  });

  it('makes required visual families materially distinct', () => {
    const signatures = new Set(
      REQUIRED.map((preset) =>
        JSON.stringify(surfaceRenderDescriptor(createCanvasSurface({ preset }))),
      ),
    );
    expect(signatures.size).toBe(REQUIRED.length);
  });

  it('honors texture, grid visibility, grid size, and print inclusion', () => {
    const descriptor = surfaceRenderDescriptor(
      createCanvasSurface({
        preset: 'dot-grid',
        textureStrength: 0.75,
        gridSize: 72,
        gridVisible: false,
        includeInPrintExport: false,
      }),
    );
    expect(descriptor.textureStrength).toBe(0.75);
    expect(descriptor.gridSize).toBe(72);
    expect(descriptor.layers.some((layer) => layer.role === 'grid')).toBe(false);
    expect(descriptor.includeInPrintExport).toBe(false);
  });
});
