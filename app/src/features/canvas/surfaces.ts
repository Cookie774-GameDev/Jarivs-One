/**
 * Bounded Canvas surface configuration and generated render descriptors.
 *
 * Surface state persists only small scalar settings. Texture and grid layers
 * are deterministic repeating instructions, so no large bitmap or data URL is
 * stored in a document.
 */

import { CanvasValidationError, type CanvasValidationErrorCode } from './contracts';

export const CANVAS_SURFACE_PRESETS = [
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
] as const;
export type CanvasSurfacePreset = (typeof CANVAS_SURFACE_PRESETS)[number];

export const CANVAS_SURFACE_MIN_GRID_SIZE = 4;
export const CANVAS_SURFACE_MAX_GRID_SIZE = 512;

export interface CanvasSurfaceConfiguration {
  readonly preset: CanvasSurfacePreset;
  readonly backgroundColor: string;
  readonly textureStrength: number;
  readonly gridSize: number;
  readonly gridVisible: boolean;
  readonly includeInPrintExport: boolean;
}

export interface CreateCanvasSurfaceInput {
  readonly preset: CanvasSurfacePreset;
  readonly backgroundColor?: string;
  readonly textureStrength?: number;
  readonly gridSize?: number;
  readonly gridVisible?: boolean;
  readonly includeInPrintExport?: boolean;
}

export type CanvasSurfaceLayerRole = 'texture' | 'grid';
export type CanvasSurfaceLayerKind =
  | 'noise'
  | 'fibers'
  | 'speckles'
  | 'weave'
  | 'dots'
  | 'square-grid'
  | 'lines'
  | 'graph';

export interface CanvasSurfaceGeneratedLayer {
  readonly role: CanvasSurfaceLayerRole;
  readonly kind: CanvasSurfaceLayerKind;
  readonly color: string;
  readonly opacity: number;
  readonly repeatSize: number;
  readonly angle: number;
  readonly seed: number;
}

export interface CanvasSurfaceRenderDescriptor {
  readonly preset: CanvasSurfacePreset;
  readonly backgroundColor: string;
  readonly textureStrength: number;
  readonly gridSize: number;
  readonly includeInPrintExport: boolean;
  readonly layers: readonly CanvasSurfaceGeneratedLayer[];
}

const INPUT_KEYS = new Set([
  'preset',
  'backgroundColor',
  'textureStrength',
  'gridSize',
  'gridVisible',
  'includeInPrintExport',
]);
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

function fail(code: CanvasValidationErrorCode, path: string, message: string): never {
  throw new CanvasValidationError(code, path, message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>): void {
  for (const key of Object.keys(value)) {
    if (!INPUT_KEYS.has(key)) {
      fail('unsupported-value', `surface.${key}`, `unexpected field "${key}"`);
    }
  }
}

function unit(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    fail('invalid-number', path, 'expected a finite number from 0 through 1');
  }
  return value;
}

function gridSize(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < CANVAS_SURFACE_MIN_GRID_SIZE ||
    value > CANVAS_SURFACE_MAX_GRID_SIZE
  ) {
    fail(
      'invalid-number',
      'surface.gridSize',
      `expected an integer from ${CANVAS_SURFACE_MIN_GRID_SIZE} through ${CANVAS_SURFACE_MAX_GRID_SIZE}`,
    );
  }
  return value;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    fail('invalid-type', path, 'expected a boolean');
  }
  return value;
}

function surfaceColor(value: unknown, preset: CanvasSurfacePreset): string {
  if (typeof value !== 'string') {
    fail('invalid-type', 'surface.backgroundColor', 'expected a color string');
  }
  if (preset === 'transparent') {
    if (value !== 'transparent') {
      fail(
        'unsupported-value',
        'surface.backgroundColor',
        'the transparent preset must remain transparent',
      );
    }
    return value;
  }
  if (!COLOR_PATTERN.test(value)) {
    fail('unsupported-value', 'surface.backgroundColor', 'expected a #rrggbb hex color');
  }
  return value.toLowerCase();
}

function preset(
  name: CanvasSurfacePreset,
  backgroundColor: string,
  textureStrength: number,
  gridSizeValue: number,
  gridVisible: boolean,
  includeInPrintExport = true,
): CanvasSurfaceConfiguration {
  return Object.freeze({
    preset: name,
    backgroundColor,
    textureStrength,
    gridSize: gridSizeValue,
    gridVisible,
    includeInPrintExport,
  });
}

export const CANVAS_SURFACE_PRESET_DEFAULTS: Readonly<
  Record<CanvasSurfacePreset, CanvasSurfaceConfiguration>
> = Object.freeze({
  'plain-warm-paper': preset('plain-warm-paper', '#f4eddf', 0.18, 32, false),
  'white-paper': preset('white-paper', '#ffffff', 0.06, 32, false),
  'dark-paper': preset('dark-paper', '#191816', 0.12, 32, false),
  'dot-grid': preset('dot-grid', '#f7f1e6', 0.08, 24, true),
  'square-grid': preset('square-grid', '#f7f1e6', 0.07, 24, true),
  'lined-paper': preset('lined-paper', '#fffdf7', 0.06, 28, true),
  'graph-paper': preset('graph-paper', '#fafcff', 0.08, 20, true),
  blueprint: preset('blueprint', '#17385f', 0.14, 24, true),
  corkboard: preset('corkboard', '#a96e3f', 0.72, 32, false),
  'canvas-fabric': preset('canvas-fabric', '#e9dec9', 0.48, 32, false),
  'watercolor-paper': preset('watercolor-paper', '#f5efe3', 0.58, 32, false),
  'sketch-paper': preset('sketch-paper', '#eee7d7', 0.36, 32, false),
  transparent: preset('transparent', 'transparent', 0, 32, false, false),
});

export function isCanvasSurfacePreset(value: unknown): value is CanvasSurfacePreset {
  return typeof value === 'string' && CANVAS_SURFACE_PRESETS.includes(value as CanvasSurfacePreset);
}

export function createCanvasSurface(input: unknown): CanvasSurfaceConfiguration {
  if (!isPlainObject(input)) {
    fail('invalid-type', 'surface', 'expected a plain object');
  }
  assertExactKeys(input);
  if (!isCanvasSurfacePreset(input.preset)) {
    fail('unsupported-value', 'surface.preset', 'unsupported Canvas surface preset');
  }
  const defaults = CANVAS_SURFACE_PRESET_DEFAULTS[input.preset];
  const backgroundColor = surfaceColor(
    input.backgroundColor ?? defaults.backgroundColor,
    input.preset,
  );
  const textureStrength =
    input.textureStrength === undefined
      ? defaults.textureStrength
      : unit(input.textureStrength, 'surface.textureStrength');
  const parsedGridSize =
    input.gridSize === undefined ? defaults.gridSize : gridSize(input.gridSize);
  const gridVisible =
    input.gridVisible === undefined
      ? defaults.gridVisible
      : boolean(input.gridVisible, 'surface.gridVisible');
  const includeInPrintExport =
    input.includeInPrintExport === undefined
      ? defaults.includeInPrintExport
      : boolean(input.includeInPrintExport, 'surface.includeInPrintExport');
  return Object.freeze({
    preset: input.preset,
    backgroundColor,
    textureStrength,
    gridSize: parsedGridSize,
    gridVisible,
    includeInPrintExport,
  });
}

export function parseCanvasSurface(input: unknown): CanvasSurfaceConfiguration {
  if (typeof input !== 'string') {
    return createCanvasSurface(input);
  }
  if (input.length > 4096) {
    fail('unsupported-value', 'surface', 'serialized surface exceeds 4096 characters');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    fail('unsupported-value', 'surface', 'invalid Canvas surface JSON');
  }
  return createCanvasSurface(parsed);
}

export function serializeCanvasSurface(surface: CanvasSurfaceConfiguration): string {
  const parsed = createCanvasSurface(surface);
  return JSON.stringify({
    preset: parsed.preset,
    backgroundColor: parsed.backgroundColor,
    textureStrength: parsed.textureStrength,
    gridSize: parsed.gridSize,
    gridVisible: parsed.gridVisible,
    includeInPrintExport: parsed.includeInPrintExport,
  });
}

function replace(
  surface: CanvasSurfaceConfiguration,
  update: Partial<CreateCanvasSurfaceInput>,
): CanvasSurfaceConfiguration {
  const current = createCanvasSurface(surface);
  const next = createCanvasSurface({ ...current, ...update });
  return serializeCanvasSurface(current) === serializeCanvasSurface(next) ? surface : next;
}

export function withSurfaceColor(
  surface: CanvasSurfaceConfiguration,
  backgroundColor: string,
): CanvasSurfaceConfiguration {
  return replace(surface, { backgroundColor });
}

export function withSurfaceTextureStrength(
  surface: CanvasSurfaceConfiguration,
  textureStrength: number,
): CanvasSurfaceConfiguration {
  return replace(surface, { textureStrength });
}

export function withSurfaceGridSize(
  surface: CanvasSurfaceConfiguration,
  value: number,
): CanvasSurfaceConfiguration {
  return replace(surface, { gridSize: value });
}

export function withSurfaceGridVisible(
  surface: CanvasSurfaceConfiguration,
  gridVisible: boolean,
): CanvasSurfaceConfiguration {
  return replace(surface, { gridVisible });
}

export function withSurfacePrintExport(
  surface: CanvasSurfaceConfiguration,
  includeInPrintExport: boolean,
): CanvasSurfaceConfiguration {
  return replace(surface, { includeInPrintExport });
}

function layer(
  role: CanvasSurfaceLayerRole,
  kind: CanvasSurfaceLayerKind,
  color: string,
  opacity: number,
  repeatSize: number,
  angle: number,
  seed: number,
): CanvasSurfaceGeneratedLayer {
  return Object.freeze({ role, kind, color, opacity, repeatSize, angle, seed });
}

function textureLayer(
  presetName: CanvasSurfacePreset,
  strength: number,
): CanvasSurfaceGeneratedLayer | null {
  switch (presetName) {
    case 'plain-warm-paper':
      return layer('texture', 'fibers', '#8f7658', strength, 96, 4, 1103);
    case 'white-paper':
      return layer('texture', 'noise', '#8a8a8a', strength, 64, 0, 2039);
    case 'dark-paper':
      return layer('texture', 'noise', '#d9c6a7', strength, 72, 0, 3251);
    case 'dot-grid':
    case 'square-grid':
    case 'lined-paper':
    case 'graph-paper':
    case 'blueprint':
      return strength === 0 ? null : layer('texture', 'noise', '#7d6f5b', strength, 80, 0, 4027);
    case 'corkboard':
      return layer('texture', 'speckles', '#5f341f', strength, 48, 0, 5107);
    case 'canvas-fabric':
      return layer('texture', 'weave', '#8b7456', strength, 18, 0, 6211);
    case 'watercolor-paper':
      return layer('texture', 'fibers', '#8f7f68', strength, 84, 17, 7331);
    case 'sketch-paper':
      return layer('texture', 'fibers', '#6f675a', strength, 52, -8, 8461);
    case 'transparent':
      return null;
  }
}

function gridLayer(surface: CanvasSurfaceConfiguration): CanvasSurfaceGeneratedLayer | null {
  if (!surface.gridVisible) {
    return null;
  }
  switch (surface.preset) {
    case 'dot-grid':
      return layer('grid', 'dots', '#927f67', 0.42, surface.gridSize, 0, 101);
    case 'square-grid':
      return layer('grid', 'square-grid', '#a08e75', 0.32, surface.gridSize, 0, 211);
    case 'lined-paper':
      return layer('grid', 'lines', '#8fa7bd', 0.3, surface.gridSize, 0, 307);
    case 'graph-paper':
      return layer('grid', 'graph', '#82a2c3', 0.36, surface.gridSize, 0, 401);
    case 'blueprint':
      return layer('grid', 'graph', '#b6d8ed', 0.48, surface.gridSize, 0, 503);
    default:
      return layer('grid', 'square-grid', '#8c7b65', 0.28, surface.gridSize, 0, 601);
  }
}

export function surfaceRenderDescriptor(
  input: CanvasSurfaceConfiguration,
): CanvasSurfaceRenderDescriptor {
  const surface = createCanvasSurface(input);
  const layers: CanvasSurfaceGeneratedLayer[] = [];
  const texture = textureLayer(surface.preset, surface.textureStrength);
  if (texture !== null && surface.textureStrength > 0) {
    layers.push(texture);
  }
  const grid = gridLayer(surface);
  if (grid !== null) {
    layers.push(grid);
  }
  return Object.freeze({
    preset: surface.preset,
    backgroundColor: surface.backgroundColor,
    textureStrength: surface.textureStrength,
    gridSize: surface.gridSize,
    includeInPrintExport: surface.includeInPrintExport,
    layers: Object.freeze(layers),
  });
}
