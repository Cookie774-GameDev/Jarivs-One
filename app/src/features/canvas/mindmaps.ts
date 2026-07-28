import {
  CANVAS_ID_PATTERN,
  CANVAS_MAX_TEXT_LENGTH,
  CANVAS_MAX_TIMESTAMP,
  CANVAS_MAX_TITLE_LENGTH,
  CanvasValidationError,
  type CanvasBlockId,
  type CanvasValidationErrorCode,
} from './contracts';

export const MIND_MAP_DIRECTIONS = ['right', 'left', 'both', 'down'] as const;
export type MindMapDirection = (typeof MIND_MAP_DIRECTIONS)[number];

export const MIND_MAP_CONNECTOR_STYLES = ['straight', 'elbow', 'curved'] as const;
export type MindMapConnectorStyle = (typeof MIND_MAP_CONNECTOR_STYLES)[number];

export const MIND_MAP_NODE_SHAPES = ['rounded', 'pill', 'card'] as const;
export type MindMapNodeShape = (typeof MIND_MAP_NODE_SHAPES)[number];

export const MIND_MAP_AI_KINDS = [
  'convert-text',
  'generate-from-prompt',
  'expand-node',
  'summarize-branch',
  'identify-missing-branches',
] as const;
export type MindMapAiKind = (typeof MIND_MAP_AI_KINDS)[number];

export const MIND_MAP_NAVIGATION_KEYS = [
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
] as const;
export type MindMapNavigationKey = (typeof MIND_MAP_NAVIGATION_KEYS)[number];

export const MIND_MAP_MAX_NODES = 10_000;
export const MIND_MAP_MAX_DEPTH = 512;

export interface MindMapNodeStyle {
  readonly shape: MindMapNodeShape;
  readonly fill: string;
  readonly textColor: string;
  readonly borderColor: string;
}

export interface MindMapNode {
  readonly id: CanvasBlockId;
  readonly parentId: CanvasBlockId | null;
  readonly childIds: readonly CanvasBlockId[];
  readonly label: string;
  readonly collapsed: boolean;
  readonly style: MindMapNodeStyle;
}

export interface MindMap {
  readonly schemaVersion: 1;
  readonly id: CanvasBlockId;
  readonly rootId: CanvasBlockId;
  readonly direction: MindMapDirection;
  readonly connectorStyle: MindMapConnectorStyle;
  readonly nodes: readonly MindMapNode[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface MindMapPlacement {
  readonly nodeId: CanvasBlockId;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

export interface MindMapAiRequest {
  readonly id: string;
  readonly kind: MindMapAiKind;
  readonly mapId: CanvasBlockId;
  readonly input: string;
  readonly targetNodeId: CanvasBlockId | null;
  readonly modelId: string;
  readonly previewRequired: true;
  readonly createdAt: number;
}

export interface MindMapAiPreview {
  readonly request: MindMapAiRequest;
  readonly before: MindMap;
  readonly after: MindMap;
  readonly addedNodeIds: readonly CanvasBlockId[];
  readonly removedNodeIds: readonly CanvasBlockId[];
  readonly changedNodeIds: readonly CanvasBlockId[];
  readonly createdAt: number;
}

export interface CreateMindMapInput {
  readonly id: string;
  readonly rootId: string;
  readonly label: string;
  readonly direction?: MindMapDirection;
  readonly connectorStyle?: MindMapConnectorStyle;
  readonly style?: Partial<MindMapNodeStyle>;
  readonly now: number;
}

export interface AddMindMapNodeInput {
  readonly parentId: string;
  readonly nodeId: string;
  readonly label: string;
  readonly style?: Partial<MindMapNodeStyle>;
  readonly now: number;
}

export interface AddMindMapSiblingInput {
  readonly siblingId: string;
  readonly nodeId: string;
  readonly label: string;
  readonly style?: Partial<MindMapNodeStyle>;
  readonly now: number;
}

export interface ReorderMindMapBranchInput {
  readonly parentId: string;
  readonly nodeId: string;
  readonly index: number;
  readonly now: number;
}

export interface CreateMindMapAiRequestInput {
  readonly id: string;
  readonly kind: MindMapAiKind;
  readonly input: string;
  readonly targetNodeId: string | null;
  readonly modelId: string;
  readonly now: number;
}

const DEFAULT_NODE_STYLE: MindMapNodeStyle = Object.freeze({
  shape: 'rounded',
  fill: '#232328',
  textColor: '#f5f5f7',
  borderColor: '#4f4f58',
});

const NODE_WIDTH = 180;
const NODE_HEIGHT = 56;
const HORIZONTAL_DEPTH_STEP = 260;
const VERTICAL_DEPTH_STEP = 136;
const SIBLING_STEP = 144;
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const UNSAFE_CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function fail(code: CanvasValidationErrorCode, path: string, message: string): never {
  throw new CanvasValidationError(code, path, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function freeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      freeze(item);
    }
  } else {
    for (const item of Object.values(value as Record<string, unknown>)) {
      freeze(item);
    }
  }
  return Object.freeze(value);
}

function id(value: unknown, path: string): CanvasBlockId {
  if (typeof value !== 'string' || !CANVAS_ID_PATTERN.test(value)) {
    fail('invalid-id', path, 'expected a stable Canvas id');
  }
  return value as CanvasBlockId;
}

function timestamp(value: unknown, path: string, minimum = 0): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > CANVAS_MAX_TIMESTAMP
  ) {
    fail(
      'invalid-timestamp',
      path,
      `expected a timestamp between ${minimum} and ${CANVAS_MAX_TIMESTAMP}`,
    );
  }
  return value;
}

function boundedText(
  value: unknown,
  path: string,
  maximum: number,
  allowNewlines: boolean,
): string {
  if (typeof value !== 'string') {
    fail('invalid-type', path, 'expected a string');
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximum) {
    fail('invalid-number', path, `expected 1-${maximum} characters`);
  }
  if (UNSAFE_CONTROL_PATTERN.test(normalized) || (!allowNewlines && /[\r\n]/.test(normalized))) {
    fail('unsupported-value', path, 'unsafe control characters are not allowed');
  }
  return normalized;
}

function direction(value: unknown): MindMapDirection {
  if (!MIND_MAP_DIRECTIONS.includes(value as MindMapDirection)) {
    fail('unsupported-value', 'mindMap.direction', 'unsupported mind-map direction');
  }
  return value as MindMapDirection;
}

function connectorStyle(value: unknown): MindMapConnectorStyle {
  if (!MIND_MAP_CONNECTOR_STYLES.includes(value as MindMapConnectorStyle)) {
    fail('unsupported-value', 'mindMap.connectorStyle', 'unsupported connector style');
  }
  return value as MindMapConnectorStyle;
}

function color(value: unknown, path: string): string {
  if (typeof value !== 'string' || !COLOR_PATTERN.test(value)) {
    fail('unsupported-value', path, 'expected a six-digit hex color');
  }
  return value.toLowerCase();
}

function nodeStyle(
  value: Partial<MindMapNodeStyle> | undefined,
  base = DEFAULT_NODE_STYLE,
): MindMapNodeStyle {
  if (value !== undefined && !isRecord(value)) {
    fail('invalid-type', 'mindMap.node.style', 'expected an object');
  }
  const shape = value?.shape ?? base.shape;
  if (!MIND_MAP_NODE_SHAPES.includes(shape as MindMapNodeShape)) {
    fail('unsupported-value', 'mindMap.node.style.shape', 'unsupported node shape');
  }
  return freeze({
    shape: shape as MindMapNodeShape,
    fill: color(value?.fill ?? base.fill, 'mindMap.node.style.fill'),
    textColor: color(value?.textColor ?? base.textColor, 'mindMap.node.style.textColor'),
    borderColor: color(value?.borderColor ?? base.borderColor, 'mindMap.node.style.borderColor'),
  });
}

function node(
  nodeId: CanvasBlockId,
  parentId: CanvasBlockId | null,
  label: string,
  style: MindMapNodeStyle,
  childIds: readonly CanvasBlockId[] = [],
  collapsed = false,
): MindMapNode {
  return freeze({
    id: nodeId,
    parentId,
    childIds: [...childIds],
    label,
    collapsed,
    style,
  });
}

function validateNode(value: unknown, path: string): MindMapNode {
  if (!isRecord(value)) {
    fail('invalid-type', path, 'expected a mind-map node');
  }
  const nodeId = id(value.id, `${path}.id`);
  const parentId = value.parentId === null ? null : id(value.parentId, `${path}.parentId`);
  if (!Array.isArray(value.childIds)) {
    fail('invalid-type', `${path}.childIds`, 'expected an array');
  }
  const childIds = value.childIds.map((childId, index) =>
    id(childId, `${path}.childIds[${index}]`),
  );
  if (new Set(childIds).size !== childIds.length) {
    fail('duplicate-id', `${path}.childIds`, 'duplicate child id');
  }
  if (typeof value.collapsed !== 'boolean') {
    fail('invalid-type', `${path}.collapsed`, 'expected a boolean');
  }
  return node(
    nodeId,
    parentId,
    boundedText(value.label, `${path}.label`, CANVAS_MAX_TITLE_LENGTH, false),
    nodeStyle(value.style as Partial<MindMapNodeStyle>),
    childIds,
    value.collapsed,
  );
}

export function validateMindMap(value: unknown): MindMap {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.nodes)) {
    fail('invalid-type', 'mindMap', 'expected a schema-version-1 mind map');
  }
  if (value.nodes.length === 0 || value.nodes.length > MIND_MAP_MAX_NODES) {
    fail('invalid-number', 'mindMap.nodes', `expected 1-${MIND_MAP_MAX_NODES} mind-map nodes`);
  }
  const mapId = id(value.id, 'mindMap.id');
  const rootId = id(value.rootId, 'mindMap.rootId');
  const nodes = value.nodes.map((entry, index) => validateNode(entry, `mindMap.nodes[${index}]`));
  const byId = new Map(nodes.map((entry) => [entry.id, entry]));
  if (byId.size !== nodes.length) {
    fail('duplicate-id', 'mindMap.nodes', 'duplicate node id');
  }
  const root = byId.get(rootId);
  if (root === undefined || root.parentId !== null) {
    fail('invalid-reference', 'mindMap.rootId', 'root must exist and have no parent');
  }
  for (const entry of nodes) {
    if (entry.id !== rootId && entry.parentId === null) {
      fail(
        'invalid-reference',
        `mindMap.nodes.${entry.id}.parentId`,
        'non-root node needs a parent',
      );
    }
    if (entry.parentId !== null) {
      const parent = byId.get(entry.parentId);
      if (parent === undefined || !parent.childIds.includes(entry.id)) {
        fail(
          'invalid-reference',
          `mindMap.nodes.${entry.id}.parentId`,
          'parent linkage is inconsistent',
        );
      }
    }
    for (const childId of entry.childIds) {
      const child = byId.get(childId);
      if (child === undefined || child.parentId !== entry.id) {
        fail(
          'invalid-reference',
          `mindMap.nodes.${entry.id}.childIds`,
          'child linkage is inconsistent',
        );
      }
    }
  }
  const visited = new Set<CanvasBlockId>();
  const active = new Set<CanvasBlockId>();
  const visit = (nodeId: CanvasBlockId, depth: number): void => {
    if (depth > MIND_MAP_MAX_DEPTH) {
      fail('invalid-number', 'mindMap.nodes', `mind-map depth exceeds ${MIND_MAP_MAX_DEPTH}`);
    }
    if (active.has(nodeId)) {
      fail('invalid-reference', 'mindMap.nodes', 'cycle detected');
    }
    if (visited.has(nodeId)) return;
    active.add(nodeId);
    for (const childId of byId.get(nodeId)?.childIds ?? []) visit(childId, depth + 1);
    active.delete(nodeId);
    visited.add(nodeId);
  };
  visit(rootId, 0);
  if (visited.size !== nodes.length) {
    fail('invalid-reference', 'mindMap.nodes', 'orphaned node detected');
  }
  const createdAt = timestamp(value.createdAt, 'mindMap.createdAt');
  const updatedAt = timestamp(value.updatedAt, 'mindMap.updatedAt', createdAt);
  return freeze({
    schemaVersion: 1,
    id: mapId,
    rootId,
    direction: direction(value.direction),
    connectorStyle: connectorStyle(value.connectorStyle),
    nodes,
    createdAt,
    updatedAt,
  });
}

function rebuild(
  mapValue: MindMap,
  changes: Partial<Pick<MindMap, 'direction' | 'connectorStyle' | 'nodes'>>,
  now: number,
): MindMap {
  const map = validateMindMap(mapValue);
  return validateMindMap({
    ...map,
    ...changes,
    updatedAt: timestamp(now, 'mindMap.updatedAt', map.updatedAt),
  });
}

function lookup(map: MindMap, nodeId: string): MindMapNode {
  const parsedId = id(nodeId, 'mindMap.nodeId');
  const found = map.nodes.find((entry) => entry.id === parsedId);
  if (found === undefined) {
    fail('invalid-reference', 'mindMap.nodeId', `unknown node "${parsedId}"`);
  }
  return found;
}

function replaceNode(map: MindMap, replacement: MindMapNode, now: number): MindMap {
  return rebuild(
    map,
    {
      nodes: map.nodes.map((entry) => (entry.id === replacement.id ? replacement : entry)),
    },
    now,
  );
}

export function createMindMap(input: CreateMindMapInput): MindMap {
  const mapId = id(input.id, 'mindMap.id');
  const rootId = id(input.rootId, 'mindMap.rootId');
  const now = timestamp(input.now, 'mindMap.createdAt');
  return validateMindMap({
    schemaVersion: 1,
    id: mapId,
    rootId,
    direction: direction(input.direction ?? 'right'),
    connectorStyle: connectorStyle(input.connectorStyle ?? 'curved'),
    nodes: [
      node(
        rootId,
        null,
        boundedText(input.label, 'mindMap.root.label', CANVAS_MAX_TITLE_LENGTH, false),
        nodeStyle(input.style),
      ),
    ],
    createdAt: now,
    updatedAt: now,
  });
}

export function addMindMapChild(mapValue: MindMap, input: AddMindMapNodeInput): MindMap {
  const map = validateMindMap(mapValue);
  const parent = lookup(map, input.parentId);
  const nodeId = id(input.nodeId, 'mindMap.nodeId');
  if (map.nodes.some((entry) => entry.id === nodeId)) {
    fail('duplicate-id', 'mindMap.nodeId', `duplicate node "${nodeId}"`);
  }
  const now = timestamp(input.now, 'mindMap.updatedAt', map.updatedAt);
  const child = node(
    nodeId,
    parent.id,
    boundedText(input.label, 'mindMap.node.label', CANVAS_MAX_TITLE_LENGTH, false),
    nodeStyle(input.style),
  );
  const nextParent = node(
    parent.id,
    parent.parentId,
    parent.label,
    parent.style,
    [...parent.childIds, nodeId],
    parent.collapsed,
  );
  return rebuild(
    map,
    {
      nodes: [...map.nodes.map((entry) => (entry.id === parent.id ? nextParent : entry)), child],
    },
    now,
  );
}

export function addMindMapSibling(mapValue: MindMap, input: AddMindMapSiblingInput): MindMap {
  const map = validateMindMap(mapValue);
  const sibling = lookup(map, input.siblingId);
  if (sibling.parentId === null) {
    fail('invalid-reference', 'mindMap.siblingId', 'the root cannot have a sibling');
  }
  const parent = lookup(map, sibling.parentId);
  const nodeId = id(input.nodeId, 'mindMap.nodeId');
  if (map.nodes.some((entry) => entry.id === nodeId)) {
    fail('duplicate-id', 'mindMap.nodeId', `duplicate node "${nodeId}"`);
  }
  const now = timestamp(input.now, 'mindMap.updatedAt', map.updatedAt);
  const insertAt = parent.childIds.indexOf(sibling.id) + 1;
  const childIds = [...parent.childIds];
  childIds.splice(insertAt, 0, nodeId);
  const nextParent = node(
    parent.id,
    parent.parentId,
    parent.label,
    parent.style,
    childIds,
    parent.collapsed,
  );
  const siblingNode = node(
    nodeId,
    parent.id,
    boundedText(input.label, 'mindMap.node.label', CANVAS_MAX_TITLE_LENGTH, false),
    nodeStyle(input.style),
  );
  return rebuild(
    map,
    {
      nodes: [
        ...map.nodes.map((entry) => (entry.id === parent.id ? nextParent : entry)),
        siblingNode,
      ],
    },
    now,
  );
}

export function setMindMapBranchCollapsed(
  mapValue: MindMap,
  nodeId: string,
  collapsed: boolean,
  now: number,
): MindMap {
  const map = validateMindMap(mapValue);
  const existing = lookup(map, nodeId);
  if (typeof collapsed !== 'boolean') {
    fail('invalid-type', 'mindMap.collapsed', 'expected a boolean');
  }
  return replaceNode(
    map,
    node(
      existing.id,
      existing.parentId,
      existing.label,
      existing.style,
      existing.childIds,
      collapsed,
    ),
    now,
  );
}

export function reorderMindMapBranch(mapValue: MindMap, input: ReorderMindMapBranchInput): MindMap {
  const map = validateMindMap(mapValue);
  const parent = lookup(map, input.parentId);
  const target = lookup(map, input.nodeId);
  if (target.parentId !== parent.id || !parent.childIds.includes(target.id)) {
    fail('invalid-reference', 'mindMap.nodeId', 'node is not a child of the supplied parent');
  }
  if (!Number.isInteger(input.index) || input.index < 0 || input.index >= parent.childIds.length) {
    fail('invalid-number', 'mindMap.index', 'index is outside the sibling range');
  }
  const childIds = parent.childIds.filter((childId) => childId !== target.id);
  childIds.splice(input.index, 0, target.id);
  return replaceNode(
    map,
    node(parent.id, parent.parentId, parent.label, parent.style, childIds, parent.collapsed),
    input.now,
  );
}

export function setMindMapDirection(
  mapValue: MindMap,
  value: MindMapDirection,
  now: number,
): MindMap {
  const map = validateMindMap(mapValue);
  return rebuild(map, { direction: direction(value) }, now);
}

export function setMindMapConnectorStyle(
  mapValue: MindMap,
  value: MindMapConnectorStyle,
  now: number,
): MindMap {
  const map = validateMindMap(mapValue);
  return rebuild(map, { connectorStyle: connectorStyle(value) }, now);
}

export function setMindMapNodeStyle(
  mapValue: MindMap,
  nodeId: string,
  style: Partial<MindMapNodeStyle>,
  now: number,
): MindMap {
  const map = validateMindMap(mapValue);
  const existing = lookup(map, nodeId);
  return replaceNode(
    map,
    node(
      existing.id,
      existing.parentId,
      existing.label,
      nodeStyle(style, existing.style),
      existing.childIds,
      existing.collapsed,
    ),
    now,
  );
}

export function navigateMindMap(
  mapValue: MindMap,
  currentNodeId: string,
  key: MindMapNavigationKey,
): CanvasBlockId {
  const map = validateMindMap(mapValue);
  const current = lookup(map, currentNodeId);
  if (!MIND_MAP_NAVIGATION_KEYS.includes(key as MindMapNavigationKey)) {
    fail('unsupported-value', 'mindMap.navigationKey', 'unsupported navigation key');
  }
  if (key === 'ArrowRight') {
    return current.collapsed ? current.id : (current.childIds[0] ?? current.id);
  }
  if (key === 'ArrowLeft') {
    return current.parentId ?? current.id;
  }
  if (current.parentId === null) {
    return current.id;
  }
  const parent = lookup(map, current.parentId);
  const index = parent.childIds.indexOf(current.id);
  if (key === 'ArrowUp') {
    return parent.childIds[index - 1] ?? current.id;
  }
  return parent.childIds[index + 1] ?? current.id;
}

export function layoutMindMap(mapValue: MindMap): readonly MindMapPlacement[] {
  const map = validateMindMap(mapValue);
  const byId = new Map(map.nodes.map((entry) => [entry.id, entry]));
  const coordinates = new Map<CanvasBlockId, { depth: number; row: number }>();
  let nextLeaf = 0;

  const visit = (nodeId: CanvasBlockId, depth: number): number => {
    const current = byId.get(nodeId)!;
    const visibleChildren = current.collapsed ? [] : current.childIds;
    let row: number;
    if (visibleChildren.length === 0) {
      row = nextLeaf * SIBLING_STEP;
      nextLeaf += 1;
    } else {
      const childRows = visibleChildren.map((childId) => visit(childId, depth + 1));
      row = (childRows[0] + childRows[childRows.length - 1]) / 2;
    }
    coordinates.set(nodeId, { depth, row });
    return row;
  };
  visit(map.rootId, 0);

  const root = byId.get(map.rootId)!;
  const rootSide = new Map<CanvasBlockId, 1 | -1>();
  root.childIds.forEach((childId, index) => rootSide.set(childId, index % 2 === 0 ? 1 : -1));
  const sideFor = (nodeId: CanvasBlockId): 1 | -1 => {
    let current = byId.get(nodeId)!;
    while (current.parentId !== null && current.parentId !== map.rootId) {
      current = byId.get(current.parentId)!;
    }
    return rootSide.get(current.id) ?? 1;
  };

  const placements: MindMapPlacement[] = [];
  const emit = (nodeId: CanvasBlockId): void => {
    const current = byId.get(nodeId)!;
    const point = coordinates.get(nodeId);
    if (point === undefined) return;
    let x: number;
    let y: number;
    if (map.direction === 'down') {
      x = point.row;
      y = point.depth * VERTICAL_DEPTH_STEP;
    } else {
      const sign = map.direction === 'left' ? -1 : map.direction === 'both' ? sideFor(nodeId) : 1;
      x = point.depth * HORIZONTAL_DEPTH_STEP * sign;
      y = point.row;
    }
    placements.push(
      freeze({
        nodeId,
        x,
        y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        depth: point.depth,
      }),
    );
    if (!current.collapsed) {
      current.childIds.forEach(emit);
    }
  };
  emit(root.id);
  return freeze(placements);
}

function aiKind(value: unknown): MindMapAiKind {
  if (!MIND_MAP_AI_KINDS.includes(value as MindMapAiKind)) {
    fail('unsupported-value', 'mindMap.ai.kind', 'unsupported AI mind-map operation');
  }
  return value as MindMapAiKind;
}

export function createMindMapAiRequest(
  mapValue: MindMap,
  input: CreateMindMapAiRequestInput,
): MindMapAiRequest {
  const map = validateMindMap(mapValue);
  const kind = aiKind(input.kind);
  const requestId = boundedText(input.id, 'mindMap.ai.id', 200, false);
  const modelId = boundedText(input.modelId, 'mindMap.ai.modelId', 128, false);
  if (!MODEL_ID_PATTERN.test(modelId)) {
    fail('unsupported-value', 'mindMap.ai.modelId', 'unsupported model id');
  }
  const targetNodeId = input.targetNodeId === null ? null : lookup(map, input.targetNodeId).id;
  if (
    ['expand-node', 'summarize-branch', 'identify-missing-branches'].includes(kind) &&
    targetNodeId === null
  ) {
    fail('invalid-reference', 'mindMap.ai.targetNodeId', `${kind} requires a target node`);
  }
  return freeze({
    id: requestId,
    kind,
    mapId: map.id,
    input: boundedText(input.input, 'mindMap.ai.input', CANVAS_MAX_TEXT_LENGTH, true),
    targetNodeId,
    modelId,
    previewRequired: true as const,
    createdAt: timestamp(input.now, 'mindMap.ai.createdAt', map.updatedAt),
  });
}

function nodeFingerprint(value: MindMapNode): string {
  return JSON.stringify(value);
}

export function previewMindMapAiChange(
  beforeValue: MindMap,
  request: MindMapAiRequest,
  afterValue: MindMap,
  now: number,
): MindMapAiPreview {
  const before = validateMindMap(beforeValue);
  const after = validateMindMap(afterValue);
  if (request === null || typeof request !== 'object' || Array.isArray(request)) {
    fail('invalid-type', 'mindMap.ai.request', 'expected an AI request object');
  }
  if (request.mapId !== before.id || after.id !== before.id || request.previewRequired !== true) {
    fail('invalid-reference', 'mindMap.ai.mapId', 'request and preview must target one map');
  }
  const validatedRequest = createMindMapAiRequest(before, {
    id: request.id,
    kind: request.kind,
    input: request.input,
    targetNodeId: request.targetNodeId,
    modelId: request.modelId,
    now: request.createdAt,
  });
  const beforeById = new Map(before.nodes.map((entry) => [entry.id, entry]));
  const afterById = new Map(after.nodes.map((entry) => [entry.id, entry]));
  const addedNodeIds = after.nodes
    .filter((entry) => !beforeById.has(entry.id))
    .map((entry) => entry.id);
  const removedNodeIds = before.nodes
    .filter((entry) => !afterById.has(entry.id))
    .map((entry) => entry.id);
  const changedNodeIds = after.nodes
    .filter((entry) => {
      const previous = beforeById.get(entry.id);
      return previous !== undefined && nodeFingerprint(previous) !== nodeFingerprint(entry);
    })
    .map((entry) => entry.id);
  return freeze({
    request: validatedRequest,
    before,
    after,
    addedNodeIds,
    removedNodeIds,
    changedNodeIds,
    createdAt: timestamp(now, 'mindMap.ai.preview.createdAt', validatedRequest.createdAt),
  });
}

export function applyMindMapAiPreview(preview: MindMapAiPreview): MindMap {
  return validateMindMap(preview.after);
}

export function undoMindMapAiPreview(preview: MindMapAiPreview): MindMap {
  return validateMindMap(preview.before);
}

export function branchToOutline(mapValue: MindMap, nodeId: string): string {
  const map = validateMindMap(mapValue);
  const root = lookup(map, nodeId);
  const byId = new Map(map.nodes.map((entry) => [entry.id, entry]));
  const lines: string[] = [];
  const visit = (current: MindMapNode, depth: number): void => {
    lines.push(`${'  '.repeat(depth)}- ${current.label}`);
    for (const childId of current.childIds) {
      visit(byId.get(childId)!, depth + 1);
    }
  };
  visit(root, 0);
  return lines.join('\n');
}
