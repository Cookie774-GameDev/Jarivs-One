/**
 * Canvas shapes domain contracts.
 *
 * Framework-agnostic, deterministic, side-effect-free data contracts for
 * canvas shape elements. Every factory and parser validates its inputs and
 * fails closed with a `CanvasValidationError`; all returned shapes are deeply
 * frozen. Shapes carry a kind, visual style properties, optional text label,
 * and optional link. Geometry helpers provide deterministic text-anchor and
 * connection-point computation.
 */

import {
  CanvasValidationError,
  CANVAS_ID_PATTERN,
  CANVAS_MAX_TEXT_LENGTH,
  type CanvasBlockId,
} from './contracts';
import { sanitizeCanvasUrl } from './security';

// ---------------------------------------------------------------------------
// Validation helper
// ---------------------------------------------------------------------------

function fail(
  code: 'invalid-type' | 'invalid-id' | 'invalid-number' | 'unsupported-value',
  path: string,
  message: string,
): never {
  throw new CanvasValidationError(code, path, message);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CANVAS_SHAPE_KINDS = [
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
] as const;
export type CanvasShapeKind = (typeof CANVAS_SHAPE_KINDS)[number];

export const CANVAS_SHAPE_DASH_PATTERNS = ['solid', 'dashed', 'dotted'] as const;
export type CanvasShapeDashPattern = (typeof CANVAS_SHAPE_DASH_PATTERNS)[number];

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const SHADOW_COLOR_PATTERN = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
const MAX_BORDER_WIDTH = 1000;
const MAX_CORNER_RADIUS = 10_000;
const MAX_GRADIENT_ANGLE = 360;
const MAX_SHADOW_OFFSET = 10_000;
const MAX_SHADOW_BLUR = 1000;

const KNOWN_SHAPE_FIELDS = new Set([
  'id',
  'kind',
  'fill',
  'gradient',
  'opacity',
  'borderColor',
  'borderWidth',
  'dash',
  'cornerRadius',
  'shadow',
  'text',
  'link',
]);
const FILL_FIELDS = new Set(['kind', 'color']);
const GRADIENT_FIELDS = new Set(['kind', 'angle', 'stops']);
const GRADIENT_STOP_FIELDS = new Set(['offset', 'color']);
const SHADOW_FIELDS = new Set(['color', 'offsetX', 'offsetY', 'blur']);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CanvasShapeFill {
  readonly kind: 'solid';
  readonly color: string;
}

export interface CanvasShapeGradientStop {
  readonly offset: number;
  readonly color: string;
}

export interface CanvasShapeGradient {
  readonly kind: 'linear' | 'radial';
  readonly angle: number;
  readonly stops: readonly CanvasShapeGradientStop[];
}

export interface CanvasShapeShadow {
  readonly color: string;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly blur: number;
}

export interface CanvasShape {
  readonly id: CanvasBlockId;
  readonly kind: CanvasShapeKind;
  readonly fill: CanvasShapeFill | null;
  readonly gradient: CanvasShapeGradient | null;
  readonly opacity: number;
  readonly borderColor: string | null;
  readonly borderWidth: number;
  readonly dash: CanvasShapeDashPattern;
  readonly cornerRadius: number;
  readonly shadow: CanvasShapeShadow | null;
  readonly text: string | null;
  readonly link: string | null;
}

export interface CanvasShapeInput {
  readonly id: string;
  readonly kind: CanvasShapeKind;
  readonly fill?: string | null;
  readonly gradient?: {
    readonly kind: 'linear' | 'radial';
    readonly angle: number;
    readonly stops: readonly { readonly offset: number; readonly color: string }[];
  } | null;
  readonly opacity?: number;
  readonly borderColor?: string | null;
  readonly borderWidth?: number;
  readonly dash?: CanvasShapeDashPattern;
  readonly cornerRadius?: number;
  readonly shadow?: {
    readonly color: string;
    readonly offsetX: number;
    readonly offsetY: number;
    readonly blur: number;
  } | null;
  readonly text?: string | null;
  readonly link?: string | null;
}

export interface CanvasShapeBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

// ---------------------------------------------------------------------------
// Deep freeze
// ---------------------------------------------------------------------------

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

function validateId(id: unknown, path: string): CanvasBlockId {
  if (typeof id !== 'string') {
    fail('invalid-type', path, 'expected a string');
  }
  if (!CANVAS_ID_PATTERN.test(id)) {
    fail('invalid-id', path, `does not match ${CANVAS_ID_PATTERN}`);
  }
  return id as CanvasBlockId;
}

function validateKind(kind: unknown, path: string): CanvasShapeKind {
  if (typeof kind !== 'string' || !(CANVAS_SHAPE_KINDS as readonly string[]).includes(kind)) {
    fail('unsupported-value', path, `unknown shape kind "${String(kind)}"`);
  }
  return kind as CanvasShapeKind;
}

function validateColor(color: unknown, path: string, pattern: RegExp): string {
  if (typeof color !== 'string' || !pattern.test(color)) {
    fail('unsupported-value', path, `invalid color "${String(color)}"`);
  }
  return color;
}

function validateFinite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('invalid-number', path, 'expected a finite number');
  }
  return value;
}

function validateKnownFields(
  value: Record<string, unknown>,
  fields: ReadonlySet<string>,
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) {
      fail('unsupported-value', `${path}.${key}`, `unknown field "${key}"`);
    }
  }
}

function validateFill(fill: unknown, path: string): CanvasShapeFill | null {
  if (fill === null || fill === undefined) return null;
  // Accept a plain color string (input form) or a { kind, color } object (serialized form).
  if (typeof fill === 'string') {
    const color = validateColor(fill, `${path}.color`, COLOR_PATTERN);
    return deepFreeze({ kind: 'solid' as const, color });
  }
  if (typeof fill === 'object' && !Array.isArray(fill)) {
    const obj = fill as Record<string, unknown>;
    validateKnownFields(obj, FILL_FIELDS, path);
    if (obj.kind !== 'solid') {
      fail('unsupported-value', `${path}.kind`, `unknown fill kind "${String(obj.kind)}"`);
    }
    const color = validateColor(obj.color, `${path}.color`, COLOR_PATTERN);
    return deepFreeze({ kind: 'solid' as const, color });
  }
  fail('invalid-type', path, 'expected a color string or fill object');
}

function validateGradient(gradient: unknown, path: string): CanvasShapeGradient | null {
  if (gradient === null || gradient === undefined) return null;
  if (typeof gradient !== 'object' || Array.isArray(gradient)) {
    fail('invalid-type', path, 'expected an object');
  }
  const g = gradient as Record<string, unknown>;
  validateKnownFields(g, GRADIENT_FIELDS, path);
  if (g.kind !== 'linear' && g.kind !== 'radial') {
    fail('unsupported-value', `${path}.kind`, `unknown gradient kind "${String(g.kind)}"`);
  }
  const angle = validateFinite(g.angle, `${path}.angle`);
  if (Math.abs(angle) > MAX_GRADIENT_ANGLE) {
    fail('invalid-number', `${path}.angle`, `exceeds maximum ${MAX_GRADIENT_ANGLE}`);
  }
  if (!Array.isArray(g.stops) || g.stops.length < 2) {
    fail('invalid-type', `${path}.stops`, 'expected at least two gradient stops');
  }
  const stops = (g.stops as unknown[]).map((raw, index) => {
    if (typeof raw !== 'object' || raw === null) {
      fail('invalid-type', `${path}.stops[${index}]`, 'expected an object');
    }
    const stop = raw as Record<string, unknown>;
    validateKnownFields(stop, GRADIENT_STOP_FIELDS, `${path}.stops[${index}]`);
    const offset = validateFinite(stop.offset, `${path}.stops[${index}].offset`);
    if (offset < 0 || offset > 1) {
      fail('invalid-number', `${path}.stops[${index}].offset`, 'must be between 0 and 1');
    }
    const color = validateColor(stop.color, `${path}.stops[${index}].color`, COLOR_PATTERN);
    return deepFreeze({ offset, color });
  });
  return deepFreeze({ kind: g.kind as 'linear' | 'radial', angle, stops });
}

function validateOpacity(opacity: unknown, path: string): number {
  if (opacity === undefined) return 1;
  const value = validateFinite(opacity, path);
  if (value < 0 || value > 1) {
    fail('invalid-number', path, 'opacity must be between 0 and 1');
  }
  return value;
}

function validateBorderColor(color: unknown, path: string): string | null {
  if (color === null || color === undefined) return null;
  return validateColor(color, path, COLOR_PATTERN);
}

function validateBorderWidth(width: unknown, path: string): number {
  if (width === undefined) return 1;
  const value = validateFinite(width, path);
  if (value < 0 || value > MAX_BORDER_WIDTH) {
    fail('invalid-number', path, `border width must be between 0 and ${MAX_BORDER_WIDTH}`);
  }
  return value;
}

function validateDash(dash: unknown, path: string): CanvasShapeDashPattern {
  if (dash === undefined) return 'solid';
  if (
    typeof dash !== 'string' ||
    !(CANVAS_SHAPE_DASH_PATTERNS as readonly string[]).includes(dash)
  ) {
    fail('unsupported-value', path, `unknown dash pattern "${String(dash)}"`);
  }
  return dash as CanvasShapeDashPattern;
}

function validateCornerRadius(radius: unknown, path: string): number {
  if (radius === undefined) return 0;
  const value = validateFinite(radius, path);
  if (value < 0 || value > MAX_CORNER_RADIUS) {
    fail('invalid-number', path, `corner radius must be between 0 and ${MAX_CORNER_RADIUS}`);
  }
  return value;
}

function validateShadow(shadow: unknown, path: string): CanvasShapeShadow | null {
  if (shadow === null || shadow === undefined) return null;
  if (typeof shadow !== 'object' || Array.isArray(shadow)) {
    fail('invalid-type', path, 'expected an object');
  }
  const s = shadow as Record<string, unknown>;
  validateKnownFields(s, SHADOW_FIELDS, path);
  const color = validateColor(s.color, `${path}.color`, SHADOW_COLOR_PATTERN);
  const offsetX = validateFinite(s.offsetX, `${path}.offsetX`);
  const offsetY = validateFinite(s.offsetY, `${path}.offsetY`);
  const blur = validateFinite(s.blur, `${path}.blur`);
  if (Math.abs(offsetX) > MAX_SHADOW_OFFSET || Math.abs(offsetY) > MAX_SHADOW_OFFSET) {
    fail('invalid-number', path, `shadow offset exceeds maximum ${MAX_SHADOW_OFFSET}`);
  }
  if (blur < 0 || blur > MAX_SHADOW_BLUR) {
    fail('invalid-number', `${path}.blur`, `blur must be between 0 and ${MAX_SHADOW_BLUR}`);
  }
  return deepFreeze({ color, offsetX, offsetY, blur });
}

function validateText(text: unknown, path: string): string | null {
  if (text === null || text === undefined) return null;
  if (typeof text !== 'string') {
    fail('invalid-type', path, 'expected a string');
  }
  if (text.length > CANVAS_MAX_TEXT_LENGTH) {
    fail('invalid-number', path, `exceeds maximum length ${CANVAS_MAX_TEXT_LENGTH}`);
  }
  return text;
}

function validateLink(link: unknown, path: string): string | null {
  if (link === null || link === undefined) return null;
  if (typeof link !== 'string') {
    fail('invalid-type', path, 'expected a string');
  }
  try {
    const safe = sanitizeCanvasUrl(link, path);
    if (!safe.startsWith('http://') && !safe.startsWith('https://')) {
      fail('unsupported-value', path, 'link must use http or https protocol');
    }
    return safe;
  } catch (error) {
    if (error instanceof CanvasValidationError) throw error;
    fail('unsupported-value', path, 'link must be a safe http or https URL');
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createCanvasShape(input: CanvasShapeInput): CanvasShape {
  if (typeof input !== 'object' || input === null) {
    fail('invalid-type', 'input', 'expected an object');
  }
  const shape: CanvasShape = {
    id: validateId(input.id, 'id'),
    kind: validateKind(input.kind, 'kind'),
    fill: validateFill(input.fill, 'fill'),
    gradient: validateGradient(input.gradient, 'gradient'),
    opacity: validateOpacity(input.opacity, 'opacity'),
    borderColor: validateBorderColor(input.borderColor, 'borderColor'),
    borderWidth: validateBorderWidth(input.borderWidth, 'borderWidth'),
    dash: validateDash(input.dash, 'dash'),
    cornerRadius: validateCornerRadius(input.cornerRadius, 'cornerRadius'),
    shadow: validateShadow(input.shadow, 'shadow'),
    text: validateText(input.text, 'text'),
    link: validateLink(input.link, 'link'),
  };
  return deepFreeze(shape);
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export function serializeCanvasShape(shape: CanvasShape): string {
  return JSON.stringify(parseCanvasShape(shape));
}

export function parseCanvasShape(raw: unknown): CanvasShape {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    fail('invalid-type', 'shape', 'expected a plain object');
  }
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!KNOWN_SHAPE_FIELDS.has(key)) {
      fail('unsupported-value', `shape.${key}`, `unknown field "${key}"`);
    }
  }
  return createCanvasShape(record as unknown as CanvasShapeInput);
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function validateBounds(bounds: CanvasShapeBounds, path: string): CanvasShapeBounds {
  const x = validateFinite(bounds.x, `${path}.x`);
  const y = validateFinite(bounds.y, `${path}.y`);
  const width = validateFinite(bounds.width, `${path}.width`);
  const height = validateFinite(bounds.height, `${path}.height`);
  if (width < 0 || height < 0) {
    fail('invalid-number', path, 'bounds dimensions must be non-negative');
  }
  return { x, y, width, height };
}

/**
 * Deterministic text anchor: the geometric center of the shape bounds.
 * All shape kinds anchor text at center for consistent layout.
 */
export function shapeTextAnchor(
  _shape: CanvasShape,
  bounds: CanvasShapeBounds,
): { readonly x: number; readonly y: number } {
  const b = validateBounds(bounds, 'bounds');
  return Object.freeze({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
}

/**
 * Deterministic connection points: top, right, bottom, left midpoints of the
 * shape bounding box. Returns exactly four frozen points in stable order.
 */
export function shapeConnectionPoints(
  _shape: CanvasShape,
  bounds: CanvasShapeBounds,
): readonly { readonly x: number; readonly y: number }[] {
  const b = validateBounds(bounds, 'bounds');
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  return Object.freeze([
    Object.freeze({ x: cx, y: b.y }),
    Object.freeze({ x: b.x + b.width, y: cy }),
    Object.freeze({ x: cx, y: b.y + b.height }),
    Object.freeze({ x: b.x, y: cy }),
  ]);
}
