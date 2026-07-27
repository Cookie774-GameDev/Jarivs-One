/**
 * Infinite Idea Canvas connector domain.
 *
 * Framework-agnostic, deterministic, side-effect-free contracts and pure
 * helpers for connectors between canvas blocks. A connector stores only
 * semantic endpoints (source/target block ids plus connection anchors); it
 * never stores screen coordinates. Geometry is resolved on demand from the
 * current edgeless layout, so connectors stay attached while objects move.
 * Supports straight, elbow, curved, and hand-drawn routes, start/end arrows,
 * bounded labels, practical orthogonal obstacle avoidance, and stable
 * keyboard-selection identifiers. Every factory and parser validates inputs
 * and fails closed with a `CanvasValidationError`; all returned values are
 * deeply frozen. No React, DOM, persistence, or filesystem dependencies.
 */

import {
  CANVAS_ID_PATTERN,
  CANVAS_MAX_TIMESTAMP,
  CanvasValidationError,
  resolveEdgelessLayout,
} from './contracts';
import type {
  CanvasBlockId,
  CanvasDocument,
  CanvasSpatialPlacement,
  CanvasTimestamp,
  CanvasValidationErrorCode,
} from './contracts';
import type { CanvasSelection } from './selection';

export { CanvasValidationError };
export type { CanvasValidationErrorCode };

// --- Constants and vocabularies -------------------------------------------

export const CANVAS_CONNECTOR_ANCHORS = ['top', 'right', 'bottom', 'left', 'center'] as const;
export type CanvasConnectorAnchor = (typeof CANVAS_CONNECTOR_ANCHORS)[number];

export const CANVAS_CONNECTOR_STYLES = ['straight', 'elbow', 'curved', 'hand-drawn'] as const;
export type CanvasConnectorStyle = (typeof CANVAS_CONNECTOR_STYLES)[number];

export const CANVAS_CONNECTOR_ARROWS = ['none', 'arrow'] as const;
export type CanvasConnectorArrow = (typeof CANVAS_CONNECTOR_ARROWS)[number];

/** Bounded connector label length. */
export const CANVAS_MAX_CONNECTOR_LABEL_LENGTH = 200;

/** Clearance margin applied around obstacles during elbow routing. */
export const CANVAS_CONNECTOR_OBSTACLE_MARGIN = 16;

const CONNECTOR_KEYS = new Set([
  'id',
  'source',
  'target',
  'style',
  'startArrow',
  'endArrow',
  'label',
  'createdAt',
  'updatedAt',
]);
const ENDPOINT_KEYS = new Set(['blockId', 'anchor']);
// --- Identifiers and contracts --------------------------------------------

declare const canvasConnectorBrand: unique symbol;
export type CanvasConnectorId = string & { [canvasConnectorBrand]: 'CanvasConnectorId' };

export interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

export interface CanvasConnectorEndpoint {
  readonly blockId: CanvasBlockId;
  readonly anchor: CanvasConnectorAnchor;
}

export interface CanvasConnectorEndpointInput {
  readonly blockId: string;
  readonly anchor: string;
}

export interface CanvasConnector {
  readonly id: CanvasConnectorId;
  readonly source: CanvasConnectorEndpoint;
  readonly target: CanvasConnectorEndpoint;
  readonly style: CanvasConnectorStyle;
  readonly startArrow: CanvasConnectorArrow;
  readonly endArrow: CanvasConnectorArrow;
  readonly label: string | null;
  readonly createdAt: CanvasTimestamp;
  readonly updatedAt: CanvasTimestamp;
}

export interface CreateCanvasConnectorInput {
  readonly id: string;
  readonly source: CanvasConnectorEndpointInput;
  readonly target: CanvasConnectorEndpointInput;
  readonly style?: string;
  readonly startArrow?: string;
  readonly endArrow?: string;
  readonly label?: string | null;
  readonly now: number;
}

export type CanvasConnectorChanges = {
  readonly source?: CanvasConnectorEndpointInput;
  readonly target?: CanvasConnectorEndpointInput;
  readonly style?: string;
  readonly startArrow?: string;
  readonly endArrow?: string;
  readonly label?: string | null;
};

export interface CanvasConnectorResolvedEndpoints {
  readonly source: CanvasPoint;
  readonly target: CanvasPoint;
}

export interface CanvasConnectorRoute {
  readonly style: CanvasConnectorStyle;
  readonly source: CanvasPoint;
  readonly target: CanvasPoint;
  readonly points: readonly CanvasPoint[];
  readonly path: string;
}

export interface CanvasConnectorRouteOptions {
  readonly obstacles?: readonly CanvasSpatialPlacement[];
}

export function isCanvasConnectorAnchor(value: unknown): value is CanvasConnectorAnchor {
  return (
    typeof value === 'string' && (CANVAS_CONNECTOR_ANCHORS as readonly string[]).includes(value)
  );
}

export function isCanvasConnectorStyle(value: unknown): value is CanvasConnectorStyle {
  return (
    typeof value === 'string' && (CANVAS_CONNECTOR_STYLES as readonly string[]).includes(value)
  );
}

export function isCanvasConnectorArrow(value: unknown): value is CanvasConnectorArrow {
  return (
    typeof value === 'string' && (CANVAS_CONNECTOR_ARROWS as readonly string[]).includes(value)
  );
}
// --- Validation helpers ---------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  keys: ReadonlySet<string>,
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) {
      fail('invalid-type', path, `unexpected key "${key}"`);
    }
  }
}

function fail(code: CanvasValidationErrorCode, path: string, message: string): never {
  throw new CanvasValidationError(code, path, message);
}

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
    Object.freeze(value);
  } else if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
    Object.freeze(value);
  }
  return value;
}

function assertFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('invalid-number', path, 'expected a finite number');
  }
  return value;
}

function assertTimestamp(value: unknown, path: string): CanvasTimestamp {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > CANVAS_MAX_TIMESTAMP
  ) {
    fail('invalid-timestamp', path, 'expected a non-negative safe-integer timestamp');
  }
  return value;
}

function hasControlCharacter(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function parseConnectorIdInternal(value: unknown, path: string): CanvasConnectorId {
  if (typeof value !== 'string' || !CANVAS_ID_PATTERN.test(value)) {
    fail('invalid-id', path, 'expected a stable alphanumeric id (1-64 chars)');
  }
  return value as CanvasConnectorId;
}

export function parseCanvasConnectorId(value: unknown): CanvasConnectorId {
  return parseConnectorIdInternal(value, 'id');
}

function parseBlockIdInternal(value: unknown, path: string): CanvasBlockId {
  if (typeof value !== 'string' || !CANVAS_ID_PATTERN.test(value)) {
    fail('invalid-id', path, 'expected a stable alphanumeric block id (1-64 chars)');
  }
  return value as CanvasBlockId;
}
function normalizeLabel(value: unknown, path: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    fail('invalid-type', `${path}.label`, 'expected a string or null');
  }
  if (value.length === 0) return null;
  if (value.length > CANVAS_MAX_CONNECTOR_LABEL_LENGTH) {
    fail(
      'unsupported-value',
      `${path}.label`,
      `label exceeds ${CANVAS_MAX_CONNECTOR_LABEL_LENGTH} characters`,
    );
  }
  if (hasControlCharacter(value)) {
    fail('unsupported-value', `${path}.label`, 'label contains control characters');
  }
  return value;
}

function normalizeEndpoint(value: unknown, path: string): CanvasConnectorEndpoint {
  if (!isPlainObject(value)) {
    fail('invalid-type', path, 'expected an endpoint object');
  }
  assertExactKeys(value, ENDPOINT_KEYS, path);
  const blockId = parseBlockIdInternal(value.blockId, `${path}.blockId`);
  if (!isCanvasConnectorAnchor(value.anchor)) {
    fail('unsupported-value', `${path}.anchor`, `unsupported anchor "${String(value.anchor)}"`);
  }
  return Object.freeze({ blockId, anchor: value.anchor });
}

interface RawConnector {
  readonly id: unknown;
  readonly source: unknown;
  readonly target: unknown;
  readonly style: unknown;
  readonly startArrow: unknown;
  readonly endArrow: unknown;
  readonly label: unknown;
  readonly createdAt: unknown;
  readonly updatedAt: unknown;
}

function normalizeConnector(raw: RawConnector, path: string): CanvasConnector {
  const id = parseConnectorIdInternal(raw.id, `${path}.id`);
  const source = normalizeEndpoint(raw.source, `${path}.source`);
  const target = normalizeEndpoint(raw.target, `${path}.target`);
  if (!isCanvasConnectorStyle(raw.style)) {
    fail('unsupported-value', `${path}.style`, `unsupported style "${String(raw.style)}"`);
  }
  if (!isCanvasConnectorArrow(raw.startArrow)) {
    fail(
      'unsupported-value',
      `${path}.startArrow`,
      `unsupported arrow "${String(raw.startArrow)}"`,
    );
  }
  if (!isCanvasConnectorArrow(raw.endArrow)) {
    fail('unsupported-value', `${path}.endArrow`, `unsupported arrow "${String(raw.endArrow)}"`);
  }
  const label = normalizeLabel(raw.label, path);
  const createdAt = assertTimestamp(raw.createdAt, `${path}.createdAt`);
  const updatedAt = assertTimestamp(raw.updatedAt, `${path}.updatedAt`);
  if (updatedAt < createdAt) {
    fail('invalid-timestamp', `${path}.updatedAt`, 'must be greater than or equal to createdAt');
  }
  return deepFreeze({
    id,
    source,
    target,
    style: raw.style,
    startArrow: raw.startArrow,
    endArrow: raw.endArrow,
    label,
    createdAt,
    updatedAt,
  });
}
// --- Factories, parsers, and collection transitions -----------------------

export function createCanvasConnector(input: CreateCanvasConnectorInput): CanvasConnector {
  if (!isPlainObject(input)) {
    fail('invalid-type', 'connector', 'expected an input object');
  }
  const now = assertTimestamp(input.now, 'connector.now');
  return normalizeConnector(
    {
      id: input.id,
      source: input.source,
      target: input.target,
      style: input.style === undefined ? 'straight' : input.style,
      startArrow: input.startArrow === undefined ? 'none' : input.startArrow,
      endArrow: input.endArrow === undefined ? 'arrow' : input.endArrow,
      label: input.label === undefined ? null : input.label,
      createdAt: now,
      updatedAt: now,
    },
    'connector',
  );
}

export function parseCanvasConnector(value: unknown): CanvasConnector {
  if (!isPlainObject(value)) {
    fail('invalid-type', 'connector', 'expected a connector object');
  }
  assertExactKeys(value, CONNECTOR_KEYS, 'connector');
  return normalizeConnector(
    {
      id: value.id,
      source: value.source,
      target: value.target,
      style: value.style,
      startArrow: value.startArrow,
      endArrow: value.endArrow,
      label: value.label,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    },
    'connector',
  );
}

export function assertUniqueConnectorIds(connectors: readonly CanvasConnector[]): void {
  const seen = new Set<string>();
  for (const connector of connectors) {
    if (seen.has(connector.id)) {
      fail('duplicate-id', 'connector.id', `duplicate connector id "${connector.id}"`);
    }
    seen.add(connector.id);
  }
}

export function createConnectorCollection(
  inputs: readonly CreateCanvasConnectorInput[],
): readonly CanvasConnector[] {
  const connectors = inputs.map((input) => createCanvasConnector(input));
  assertUniqueConnectorIds(connectors);
  return Object.freeze(connectors);
}
export function withConnectorAdded(
  connectors: readonly CanvasConnector[],
  input: CreateCanvasConnectorInput,
): readonly CanvasConnector[] {
  const connector = createCanvasConnector(input);
  if (connectors.some((existing) => existing.id === connector.id)) {
    fail('duplicate-id', 'connector.id', `duplicate connector id "${connector.id}"`);
  }
  return Object.freeze([...connectors, connector]);
}

export function withConnectorRemoved(
  connectors: readonly CanvasConnector[],
  id: string,
): readonly CanvasConnector[] {
  const connectorId = parseCanvasConnectorId(id);
  if (!connectors.some((connector) => connector.id === connectorId)) {
    return connectors;
  }
  return Object.freeze(connectors.filter((connector) => connector.id !== connectorId));
}

export function connectorById(
  connectors: readonly CanvasConnector[],
  id: string,
): CanvasConnector | undefined {
  const connectorId = parseCanvasConnectorId(id);
  return connectors.find((connector) => connector.id === connectorId);
}

export function withConnectorUpdated(
  connectors: readonly CanvasConnector[],
  id: string,
  changes: CanvasConnectorChanges,
  now: number,
): readonly CanvasConnector[] {
  const connectorId = parseCanvasConnectorId(id);
  const index = connectors.findIndex((connector) => connector.id === connectorId);
  if (index < 0) {
    fail('invalid-reference', 'connector.id', `references unknown connector "${connectorId}"`);
  }
  const existing = connectors[index];
  const updatedAt = assertTimestamp(now, 'now');
  const updated = normalizeConnector(
    {
      id: existing.id,
      source: changes.source ?? existing.source,
      target: changes.target ?? existing.target,
      style: changes.style ?? existing.style,
      startArrow: changes.startArrow ?? existing.startArrow,
      endArrow: changes.endArrow ?? existing.endArrow,
      label: changes.label === undefined ? existing.label : changes.label,
      createdAt: existing.createdAt,
      updatedAt,
    },
    'connector',
  );
  return Object.freeze(connectors.map((connector, i) => (i === index ? updated : connector)));
}
// --- Geometry: anchors and endpoints --------------------------------------

function anchorNormal(
  anchor: CanvasConnectorAnchor,
  from: CanvasPoint,
  to: CanvasPoint,
): CanvasPoint {
  switch (anchor) {
    case 'top':
      return { x: 0, y: -1 };
    case 'bottom':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
    case 'center': {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.hypot(dx, dy) || 1;
      return { x: dx / length, y: dy / length };
    }
  }
}

export function resolveAnchorPoint(
  placement: CanvasSpatialPlacement,
  anchor: CanvasConnectorAnchor,
): CanvasPoint {
  const x = assertFiniteNumber(placement.x, 'placement.x');
  const y = assertFiniteNumber(placement.y, 'placement.y');
  const width = assertFiniteNumber(placement.width, 'placement.width');
  const height = assertFiniteNumber(placement.height, 'placement.height');
  if (width < 0 || height < 0) {
    fail('invalid-number', 'placement', 'width and height must not be negative');
  }
  if (!isCanvasConnectorAnchor(anchor)) {
    fail('unsupported-value', 'anchor', `unsupported anchor "${String(anchor)}"`);
  }
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  switch (anchor) {
    case 'top':
      return Object.freeze({ x: centerX, y });
    case 'bottom':
      return Object.freeze({ x: centerX, y: y + height });
    case 'left':
      return Object.freeze({ x, y: centerY });
    case 'right':
      return Object.freeze({ x: x + width, y: centerY });
    case 'center':
      return Object.freeze({ x: centerX, y: centerY });
  }
}
export function resolveConnectorEndpoints(
  connector: CanvasConnector,
  layout: ReadonlyMap<CanvasBlockId, CanvasSpatialPlacement>,
): CanvasConnectorResolvedEndpoints {
  const sourcePlacement = layout.get(connector.source.blockId);
  if (!sourcePlacement) {
    fail(
      'invalid-reference',
      'connector.source.blockId',
      `references unknown block "${connector.source.blockId}"`,
    );
  }
  const targetPlacement = layout.get(connector.target.blockId);
  if (!targetPlacement) {
    fail(
      'invalid-reference',
      'connector.target.blockId',
      `references unknown block "${connector.target.blockId}"`,
    );
  }
  return Object.freeze({
    source: resolveAnchorPoint(sourcePlacement, connector.source.anchor),
    target: resolveAnchorPoint(targetPlacement, connector.target.anchor),
  });
}

export function resolveConnectorEndpointsFromDocument(
  connector: CanvasConnector,
  doc: CanvasDocument,
): CanvasConnectorResolvedEndpoints {
  return resolveConnectorEndpoints(connector, resolveEdgelessLayout(doc));
}

export function validateConnectorReferences(connector: CanvasConnector, doc: CanvasDocument): void {
  if (!doc.blocks.some((block) => block.id === connector.source.blockId)) {
    fail(
      'invalid-reference',
      'connector.source.blockId',
      `references unknown block "${connector.source.blockId}"`,
    );
  }
  if (!doc.blocks.some((block) => block.id === connector.target.blockId)) {
    fail(
      'invalid-reference',
      'connector.target.blockId',
      `references unknown block "${connector.target.blockId}"`,
    );
  }
}
// --- Route mathematics ----------------------------------------------------

function round3(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function formatNumber(value: number): string {
  return String(value);
}

function buildPath(style: CanvasConnectorStyle, points: readonly CanvasPoint[]): string {
  if (points.length === 0) {
    fail('invalid-number', 'route', 'route has no points');
  }
  if (style === 'curved') {
    if (points.length !== 4) {
      fail('invalid-number', 'route', 'curved route requires exactly four points');
    }
    const [start, c1, c2, end] = points;
    return (
      `M ${formatNumber(start.x)} ${formatNumber(start.y)} ` +
      `C ${formatNumber(c1.x)} ${formatNumber(c1.y)} ` +
      `${formatNumber(c2.x)} ${formatNumber(c2.y)} ` +
      `${formatNumber(end.x)} ${formatNumber(end.y)}`
    );
  }
  return points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'} ${formatNumber(point.x)} ${formatNumber(point.y)}`,
    )
    .join(' ');
}

interface ExpandedRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

function expandedRect(placement: CanvasSpatialPlacement, margin: number): ExpandedRect {
  return {
    left: placement.x - margin,
    top: placement.y - margin,
    right: placement.x + placement.width + margin,
    bottom: placement.y + placement.height + margin,
  };
}
function avoidBridge(
  coord: number,
  spanMin: number,
  spanMax: number,
  obstacles: readonly CanvasSpatialPlacement[],
  axis: 'x' | 'y',
): number {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  let blocked = false;
  for (const obstacle of obstacles) {
    const rect = expandedRect(obstacle, CANVAS_CONNECTOR_OBSTACLE_MARGIN);
    const overlapsSpan =
      axis === 'x'
        ? rect.top < spanMax && rect.bottom > spanMin
        : rect.left < spanMax && rect.right > spanMin;
    if (!overlapsSpan) continue;
    const contains =
      axis === 'x'
        ? coord >= rect.left && coord <= rect.right
        : coord >= rect.top && coord <= rect.bottom;
    if (!contains) continue;
    blocked = true;
    const intervalLo = axis === 'x' ? rect.left : rect.top;
    const intervalHi = axis === 'x' ? rect.right : rect.bottom;
    if (intervalLo < lo) lo = intervalLo;
    if (intervalHi > hi) hi = intervalHi;
  }
  if (!blocked) return coord;
  return Math.abs(coord - lo) <= Math.abs(coord - hi) ? lo : hi;
}

function collapseCollinear(points: readonly CanvasPoint[]): CanvasPoint[] {
  const deduped: CanvasPoint[] = [];
  for (const point of points) {
    const last = deduped[deduped.length - 1];
    if (last && last.x === point.x && last.y === point.y) continue;
    deduped.push(point);
  }
  if (deduped.length <= 2) return deduped;
  const result: CanvasPoint[] = [deduped[0]];
  for (let i = 1; i < deduped.length - 1; i += 1) {
    const a = result[result.length - 1];
    const b = deduped[i];
    const c = deduped[i + 1];
    const collinear = (b.x - a.x) * (c.y - a.y) === (b.y - a.y) * (c.x - a.x);
    if (!collinear) result.push(b);
  }
  result.push(deduped[deduped.length - 1]);
  return result;
}
function elbowPoints(
  source: CanvasPoint,
  target: CanvasPoint,
  sourceAnchor: CanvasConnectorAnchor,
  obstacles: readonly CanvasSpatialPlacement[],
): CanvasPoint[] {
  const horizontalFirst =
    sourceAnchor === 'left' || sourceAnchor === 'right' || sourceAnchor === 'center';
  if (horizontalFirst) {
    const bridgeX = avoidBridge(
      (source.x + target.x) / 2,
      Math.min(source.y, target.y),
      Math.max(source.y, target.y),
      obstacles,
      'x',
    );
    return collapseCollinear([
      source,
      { x: bridgeX, y: source.y },
      { x: bridgeX, y: target.y },
      target,
    ]);
  }
  const bridgeY = avoidBridge(
    (source.y + target.y) / 2,
    Math.min(source.x, target.x),
    Math.max(source.x, target.x),
    obstacles,
    'y',
  );
  return collapseCollinear([
    source,
    { x: source.x, y: bridgeY },
    { x: target.x, y: bridgeY },
    target,
  ]);
}

function curvedPoints(
  source: CanvasPoint,
  target: CanvasPoint,
  sourceAnchor: CanvasConnectorAnchor,
  targetAnchor: CanvasConnectorAnchor,
): CanvasPoint[] {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.hypot(dx, dy);
  const offset = Math.min(240, Math.max(24, distance * 0.4));
  const sourceNormal = anchorNormal(sourceAnchor, source, target);
  const targetNormal = anchorNormal(targetAnchor, target, source);
  return [
    source,
    { x: source.x + sourceNormal.x * offset, y: source.y + sourceNormal.y * offset },
    { x: target.x + targetNormal.x * offset, y: target.y + targetNormal.y * offset },
    target,
  ];
}
function hashString(input: string): number {
  let hash = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i += 1) {
    hash = Math.imul(hash ^ input.charCodeAt(i), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function handDrawnPoints(source: CanvasPoint, target: CanvasPoint, id: string): CanvasPoint[] {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.hypot(dx, dy);
  const segments = 6;
  const amplitude = Math.min(6, distance * 0.04);
  const perpX = distance > 0 ? -dy / distance : 0;
  const perpY = distance > 0 ? dx / distance : 0;
  const seed = hashString(
    `${id}:${Math.round(source.x)},${Math.round(source.y)}:${Math.round(target.x)},${Math.round(target.y)}`,
  );
  const random = mulberry32(seed);
  const points: CanvasPoint[] = [source];
  for (let i = 1; i < segments; i += 1) {
    const fraction = i / segments;
    const baseX = source.x + dx * fraction;
    const baseY = source.y + dy * fraction;
    const jitter = (random() * 2 - 1) * amplitude;
    points.push({ x: baseX + perpX * jitter, y: baseY + perpY * jitter });
  }
  points.push(target);
  return points;
}

function routePoints(
  connector: CanvasConnector,
  source: CanvasPoint,
  target: CanvasPoint,
  obstacles: readonly CanvasSpatialPlacement[],
): CanvasPoint[] {
  switch (connector.style) {
    case 'straight':
      return [source, target];
    case 'elbow':
      return elbowPoints(source, target, connector.source.anchor, obstacles);
    case 'curved':
      return curvedPoints(source, target, connector.source.anchor, connector.target.anchor);
    case 'hand-drawn':
      return handDrawnPoints(source, target, connector.id);
    default:
      return fail(
        'unsupported-value',
        'connector.style',
        `unsupported style "${String(connector.style)}"`,
      );
  }
}
// --- Route resolution -----------------------------------------------------

export function resolveConnectorRoute(
  connector: CanvasConnector,
  layout: ReadonlyMap<CanvasBlockId, CanvasSpatialPlacement>,
  options: CanvasConnectorRouteOptions = {},
): CanvasConnectorRoute {
  const { source, target } = resolveConnectorEndpoints(connector, layout);
  const obstacles = options.obstacles ?? [];
  const rawPoints = routePoints(connector, source, target, obstacles);
  const points = rawPoints.map((point) =>
    Object.freeze({
      x: round3(assertFiniteNumber(point.x, 'route.point.x')),
      y: round3(assertFiniteNumber(point.y, 'route.point.y')),
    }),
  );
  const path = buildPath(connector.style, points);
  return deepFreeze({
    style: connector.style,
    source: points[0],
    target: points[points.length - 1],
    points,
    path,
  });
}

export function resolveConnectorRouteFromDocument(
  connector: CanvasConnector,
  doc: CanvasDocument,
  options: CanvasConnectorRouteOptions = {},
): CanvasConnectorRoute {
  const layout = resolveEdgelessLayout(doc);
  const obstacles =
    options.obstacles ??
    [...layout.values()].filter(
      (placement) =>
        placement.blockId !== connector.source.blockId &&
        placement.blockId !== connector.target.blockId,
    );
  return resolveConnectorRoute(connector, layout, { obstacles });
}

// --- Keyboard selection identity ------------------------------------------

export function connectorSelectionId(connector: CanvasConnector): string {
  return connector.id;
}

export function connectorSelectionIds(connectors: readonly CanvasConnector[]): readonly string[] {
  return Object.freeze(connectors.map((connector) => connector.id as string));
}

export function isConnectorSelected(
  connector: CanvasConnector,
  selection: CanvasSelection,
): boolean {
  return selection.ids.includes(connector.id);
}
