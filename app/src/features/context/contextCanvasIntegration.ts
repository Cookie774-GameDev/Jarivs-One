import { CONTEXT_ENTITY_KINDS, type ContextEntityKind, type ContextReferenceV2 } from './contracts';
import { buildContextChatAttachment, type ContextChatAttachment } from './contextChatIntegration';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,255}$/u;
const MAX_TEXT = 32_768;
const MAX_NODES = 5_000;
const MAX_EDGES = 10_000;
const MAX_COORDINATE = 10_000_000;

export interface ContextCanvasEntityReference {
  projectId: string | null;
  mapId: string;
  entityId: string;
  kind: ContextEntityKind;
  label: string;
  path?: string;
}

export interface ContextEntityCanvasOpenRequest {
  schemaVersion: 1;
  type: 'context_entity.open_on_canvas';
  entity: ContextCanvasEntityReference;
  target?: {
    canvasId?: string;
    frameId?: string;
  };
}

export interface CanvasFrameContextLink {
  schemaVersion: 1;
  projectId: string | null;
  canvasId: string;
  frameId: string;
  contextReferences: readonly ContextCanvasEntityReference[];
}

export interface ContextClusterCanvasTransfer {
  schemaVersion: 1;
  type: 'context_cluster.send_to_canvas';
  projectId: string | null;
  mapId: string;
  clusterId: string;
  label: string;
  entities: readonly ContextCanvasEntityReference[];
}

export type VibeSpaceCanvasObjectType = 'text' | 'file' | 'link' | 'group';

export interface VibeSpaceCanvasObject {
  id: string;
  type: VibeSpaceCanvasObjectType;
  label: string;
  text?: string;
  file?: string;
  subpath?: string;
  url?: string;
  groupLabel?: string;
  background?: string;
  backgroundStyle?: 'cover' | 'ratio' | 'repeat';
  color?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  selected: boolean;
  contextReferences: readonly ContextCanvasEntityReference[];
}

export interface VibeSpaceCanvasConnection {
  id: string;
  fromObjectId: string;
  toObjectId: string;
  label?: string;
  fromSide?: 'top' | 'right' | 'bottom' | 'left';
  toSide?: 'top' | 'right' | 'bottom' | 'left';
  fromEnd?: 'none' | 'arrow';
  toEnd?: 'none' | 'arrow';
  color?: string;
}

export interface VibeSpaceCanvasDocument {
  schemaVersion: 1;
  id: string;
  projectId: string | null;
  title: string;
  updatedAt: number;
  objects: readonly VibeSpaceCanvasObject[];
  connections: readonly VibeSpaceCanvasConnection[];
  compatibilitySource?: {
    format: 'open-json-canvas';
    version: 1;
  };
}

export interface OpenJsonCanvasNode {
  id: string;
  type: VibeSpaceCanvasObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  text?: string;
  file?: string;
  subpath?: string;
  url?: string;
  label?: string;
  background?: string;
  backgroundStyle?: 'cover' | 'ratio' | 'repeat';
}

export interface OpenJsonCanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: 'top' | 'right' | 'bottom' | 'left';
  toSide?: 'top' | 'right' | 'bottom' | 'left';
  fromEnd?: 'none' | 'arrow';
  toEnd?: 'none' | 'arrow';
  color?: string;
  label?: string;
}

export interface OpenJsonCanvasDocument {
  nodes: readonly OpenJsonCanvasNode[];
  edges: readonly OpenJsonCanvasEdge[];
}

function fail(detail: string): never {
  throw new Error(`Invalid Context Canvas integration: ${detail}.`);
}

function text(value: unknown, detail: string, allowEmpty = false): string {
  if (
    typeof value !== 'string' ||
    value.length > MAX_TEXT ||
    (!allowEmpty && value.trim().length === 0) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value)
  ) {
    fail(detail);
  }
  return value;
}

function id(value: unknown, detail: string): string {
  const parsed = text(value, detail);
  if (!SAFE_ID.test(parsed)) fail(detail);
  return parsed;
}

function projectId(value: unknown): string | null {
  return value === null ? null : id(value, 'project ID');
}

function coordinate(value: unknown, detail: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > MAX_COORDINATE) {
    fail(detail);
  }
  return value;
}

function dimension(value: unknown, detail: string): number {
  const parsed = coordinate(value, detail);
  if (parsed <= 0) fail(detail);
  return parsed;
}

function timestamp(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail('updated time');
  return value as number;
}

function portablePath(value: unknown, detail: string): string {
  const path = text(value, detail);
  if (
    path.includes('\\') ||
    path.startsWith('/') ||
    /^[A-Za-z]:/u.test(path) ||
    /^[a-z][a-z0-9+.-]*:/iu.test(path) ||
    path.includes('%') ||
    /(?:^|\/)\.{1,2}(?:\/|$)/u.test(path)
  ) {
    fail(detail);
  }
  return path;
}

function safeUrl(value: unknown): string {
  const raw = text(value, 'unsafe link');
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return fail('unsafe link');
  }
  if (!['https:', 'http:', 'mailto:'].includes(parsed.protocol)) fail('unsafe link');
  return raw;
}

function clone<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return fail('boundary');
  }
}

function assertPlainBoundary(value: unknown, depth = 0): void {
  if (value === null || typeof value !== 'object') return;
  if (depth > 6) fail('boundary');
  let isArray: boolean;
  let prototype: object | null;
  let keys: PropertyKey[];
  let descriptors: PropertyDescriptorMap;
  try {
    isArray = Array.isArray(value);
    prototype = Object.getPrototypeOf(value);
    keys = Reflect.ownKeys(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return fail('boundary');
  }
  if (keys.some((key) => typeof key !== 'string')) fail('boundary');
  if (isArray) {
    if (prototype !== Array.prototype) fail('boundary');
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    const length =
      lengthDescriptor && 'value' in lengthDescriptor ? lengthDescriptor.value : undefined;
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_EDGES) fail('boundary');
    if (keys.length !== length + 1 || !keys.includes('length')) fail('boundary');
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor?.enumerable || !('value' in descriptor)) fail('boundary');
      assertPlainBoundary(descriptor.value, depth + 1);
    }
    return;
  }
  if (prototype !== Object.prototype && prototype !== null) fail('boundary');
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (!descriptor?.enumerable || !('value' in descriptor)) fail('boundary');
    assertPlainBoundary(descriptor.value, depth + 1);
  }
}

function allowedKeys(value: object, allowed: readonly string[], detail: string): void {
  const expected = new Set(allowed);
  if (Object.keys(value).some((key) => !expected.has(key))) fail(detail);
}

function freezeEntity(value: ContextCanvasEntityReference): ContextCanvasEntityReference {
  if (!(CONTEXT_ENTITY_KINDS as readonly unknown[]).includes(value.kind)) fail('entity kind');
  return Object.freeze({
    projectId: projectId(value.projectId),
    mapId: id(value.mapId, 'map ID'),
    entityId: id(value.entityId, 'entity ID'),
    kind: value.kind,
    label: text(value.label, 'entity label'),
    ...(value.path === undefined ? {} : { path: portablePath(value.path, 'entity path') }),
  });
}

function uniqueEntities(
  values: readonly ContextCanvasEntityReference[],
  expectedProjectId?: string | null,
  expectedMapId?: string,
): readonly ContextCanvasEntityReference[] {
  if (!Array.isArray(values) || values.length > MAX_NODES) fail('entity selection');
  const seen = new Set<string>();
  const entities: ContextCanvasEntityReference[] = [];
  for (const value of values) {
    const entity = freezeEntity(value);
    if (expectedProjectId !== undefined && entity.projectId !== expectedProjectId) {
      fail('project mismatch');
    }
    if (expectedMapId !== undefined && entity.mapId !== expectedMapId) fail('map mismatch');
    const key = `${entity.projectId ?? ''}\u0000${entity.mapId}\u0000${entity.entityId}`;
    if (!seen.has(key)) {
      seen.add(key);
      entities.push(entity);
    }
  }
  return Object.freeze(entities);
}

export function createContextEntityCanvasOpenRequest(
  entity: ContextCanvasEntityReference,
  target?: { canvasId?: string; frameId?: string },
): Readonly<ContextEntityCanvasOpenRequest> {
  const normalizedTarget =
    target === undefined
      ? undefined
      : Object.freeze({
          ...(target.canvasId === undefined ? {} : { canvasId: id(target.canvasId, 'canvas ID') }),
          ...(target.frameId === undefined ? {} : { frameId: id(target.frameId, 'frame ID') }),
        });
  return Object.freeze({
    schemaVersion: 1,
    type: 'context_entity.open_on_canvas',
    entity: freezeEntity(entity),
    ...(normalizedTarget && Object.keys(normalizedTarget).length > 0
      ? { target: normalizedTarget }
      : {}),
  });
}

export function linkCanvasFrameToContext(
  frame: { projectId: string | null; canvasId: string; frameId: string },
  entities: readonly ContextCanvasEntityReference[],
): Readonly<CanvasFrameContextLink> {
  const scopedProjectId = projectId(frame.projectId);
  return Object.freeze({
    schemaVersion: 1,
    projectId: scopedProjectId,
    canvasId: id(frame.canvasId, 'canvas ID'),
    frameId: id(frame.frameId, 'frame ID'),
    contextReferences: uniqueEntities(entities, scopedProjectId),
  });
}

export function createContextClusterCanvasTransfer(input: {
  projectId: string | null;
  mapId: string;
  clusterId: string;
  label: string;
  entities: readonly ContextCanvasEntityReference[];
}): Readonly<ContextClusterCanvasTransfer> {
  const scopedProjectId = projectId(input.projectId);
  const mapId = id(input.mapId, 'map ID');
  return Object.freeze({
    schemaVersion: 1,
    type: 'context_cluster.send_to_canvas',
    projectId: scopedProjectId,
    mapId,
    clusterId: id(input.clusterId, 'cluster ID'),
    label: text(input.label, 'cluster label'),
    entities: uniqueEntities(input.entities, scopedProjectId, mapId),
  });
}

export function createCanvasObjectContextReference(
  document: VibeSpaceCanvasDocument,
  object: VibeSpaceCanvasObject,
): Readonly<ContextReferenceV2> {
  const canvasId = id(document.id, 'canvas ID');
  const objectId = id(object.id, 'Canvas object ID');
  return Object.freeze({
    entityId: `canvas:${canvasId}:${objectId}`,
    kind: 'canvas_object',
    label: text(object.label, 'Canvas object label'),
    sourceId: `canvas:${canvasId}`,
  });
}

function objectEvidence(object: VibeSpaceCanvasObject): string {
  if (object.type === 'text') return text(object.text, 'Canvas object text', true);
  if (object.type === 'file') return portablePath(object.file, 'Canvas object file');
  if (object.type === 'link') return safeUrl(object.url);
  return text(object.groupLabel ?? object.label, 'Canvas group label');
}

export function createCanvasRetrievalAttachments(
  document: VibeSpaceCanvasDocument,
  now = Date.now(),
): readonly ContextChatAttachment[] {
  const canvasId = id(document.id, 'canvas ID');
  const scopedProjectId = projectId(document.projectId);
  const title = text(document.title, 'canvas title');
  const generatedAt = timestamp(document.updatedAt);
  timestamp(now);
  const selected = document.objects.filter((object) => object.selected);
  if (selected.length > 100) fail('selected Canvas objects');
  return Object.freeze(
    selected.map((object) => {
      const evidence = objectEvidence(object);
      return Object.freeze(
        buildContextChatAttachment({
          projectId: scopedProjectId,
          rootDir: '',
          generatedAt,
          nodeId: `canvas:${canvasId}:${id(object.id, 'Canvas object ID')}`,
          mapId: canvasId,
          title: text(object.label, 'Canvas object label'),
          kind: object.type === 'text' ? 'note' : 'symbol',
          summary: evidence,
          ...(object.type === 'text' ? { exactExcerpt: evidence } : {}),
          attachmentLevel: object.type === 'text' ? 'block' : 'entity',
          source: { type: 'linked_vibespace_content', label: title },
          freshness: now >= generatedAt ? 'current' : 'unknown',
          itemCount: 1,
          lastIndexedAt: generatedAt,
        }),
      );
    }),
  );
}

function normalizeInternalObject(object: VibeSpaceCanvasObject): VibeSpaceCanvasObject {
  if (!['text', 'file', 'link', 'group'].includes(object.type)) fail('Canvas object type');
  const contextReferences = uniqueEntities(object.contextReferences);
  const base = {
    id: id(object.id, 'Canvas object ID'),
    type: object.type,
    label: text(object.label, 'Canvas object label'),
    x: coordinate(object.x, 'Canvas object x'),
    y: coordinate(object.y, 'Canvas object y'),
    width: dimension(object.width, 'Canvas object width'),
    height: dimension(object.height, 'Canvas object height'),
    selected: Boolean(object.selected),
    contextReferences,
    ...(object.color === undefined ? {} : { color: text(object.color, 'Canvas object color') }),
  };
  if (object.type === 'text') {
    return Object.freeze({ ...base, text: text(object.text, 'Canvas object text', true) });
  }
  if (object.type === 'file') {
    return Object.freeze({
      ...base,
      file: portablePath(object.file, 'Canvas object file'),
      ...(object.subpath === undefined
        ? {}
        : { subpath: text(object.subpath, 'Canvas object subpath', true) }),
    });
  }
  if (object.type === 'link') return Object.freeze({ ...base, url: safeUrl(object.url) });
  return Object.freeze({
    ...base,
    groupLabel: text(object.groupLabel ?? object.label, 'Canvas group label', true),
    ...(object.background === undefined
      ? {}
      : { background: portablePath(object.background, 'Canvas group background') }),
    ...(object.backgroundStyle === undefined ? {} : { backgroundStyle: object.backgroundStyle }),
  });
}

function normalizeConnection(
  connection: VibeSpaceCanvasConnection,
  objectIds: ReadonlySet<string>,
): VibeSpaceCanvasConnection {
  const fromObjectId = id(connection.fromObjectId, 'connection source');
  const toObjectId = id(connection.toObjectId, 'connection target');
  if (!objectIds.has(fromObjectId) || !objectIds.has(toObjectId)) fail('dangling edge');
  return Object.freeze({
    id: id(connection.id, 'connection ID'),
    fromObjectId,
    toObjectId,
    ...(connection.label === undefined ? {} : { label: text(connection.label, 'edge label') }),
    ...(connection.fromSide === undefined ? {} : { fromSide: connection.fromSide }),
    ...(connection.toSide === undefined ? {} : { toSide: connection.toSide }),
    ...(connection.fromEnd === undefined ? {} : { fromEnd: connection.fromEnd }),
    ...(connection.toEnd === undefined ? {} : { toEnd: connection.toEnd }),
    ...(connection.color === undefined ? {} : { color: text(connection.color, 'edge color') }),
  });
}

export function exportOpenJsonCanvas(
  document: VibeSpaceCanvasDocument,
): Readonly<OpenJsonCanvasDocument> {
  if (document.objects.length > MAX_NODES || document.connections.length > MAX_EDGES) {
    fail('compatibility size');
  }
  const objects = document.objects.map(normalizeInternalObject);
  const objectIds = new Set(objects.map((object) => object.id));
  if (objectIds.size !== objects.length) fail('duplicate Canvas object ID');
  const connections = document.connections.map((connection) =>
    normalizeConnection(connection, objectIds),
  );
  const connectionIds = new Set(connections.map((connection) => connection.id));
  if (connectionIds.size !== connections.length) fail('duplicate connection ID');
  const nodes = objects.map((object): Readonly<OpenJsonCanvasNode> => {
    const base = {
      id: object.id,
      type: object.type,
      x: object.x,
      y: object.y,
      width: object.width,
      height: object.height,
      ...(object.color === undefined ? {} : { color: object.color }),
    };
    if (object.type === 'text') return Object.freeze({ ...base, text: object.text });
    if (object.type === 'file') {
      return Object.freeze({
        ...base,
        file: object.file,
        ...(object.subpath === undefined ? {} : { subpath: object.subpath }),
      });
    }
    if (object.type === 'link') return Object.freeze({ ...base, url: object.url });
    return Object.freeze({
      ...base,
      label: object.groupLabel,
      ...(object.background === undefined ? {} : { background: object.background }),
      ...(object.backgroundStyle === undefined ? {} : { backgroundStyle: object.backgroundStyle }),
    });
  });
  const edges = connections.map((connection) =>
    Object.freeze({
      id: connection.id,
      fromNode: connection.fromObjectId,
      toNode: connection.toObjectId,
      ...(connection.fromSide === undefined ? {} : { fromSide: connection.fromSide }),
      ...(connection.toSide === undefined ? {} : { toSide: connection.toSide }),
      ...(connection.fromEnd === undefined ? {} : { fromEnd: connection.fromEnd }),
      ...(connection.toEnd === undefined ? {} : { toEnd: connection.toEnd }),
      ...(connection.color === undefined ? {} : { color: connection.color }),
      ...(connection.label === undefined ? {} : { label: connection.label }),
    }),
  );
  return Object.freeze({ nodes: Object.freeze(nodes), edges: Object.freeze(edges) });
}

function validateOptionalEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  detail: string,
): T | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) fail(detail);
  return value as T;
}

function importNode(raw: OpenJsonCanvasNode): VibeSpaceCanvasObject {
  allowedKeys(
    raw,
    [
      'id',
      'type',
      'x',
      'y',
      'width',
      'height',
      'color',
      'text',
      'file',
      'subpath',
      'url',
      'label',
      'background',
      'backgroundStyle',
    ],
    'node fields',
  );
  if (!['text', 'file', 'link', 'group'].includes(raw.type)) fail('node type');
  const common = {
    id: id(raw.id, 'node ID'),
    type: raw.type,
    x: coordinate(raw.x, 'node x'),
    y: coordinate(raw.y, 'node y'),
    width: dimension(raw.width, 'node width'),
    height: dimension(raw.height, 'node height'),
    selected: false,
    contextReferences: Object.freeze([]),
    ...(raw.color === undefined ? {} : { color: text(raw.color, 'node color') }),
  };
  if (raw.type === 'text') {
    const value = text(raw.text, 'node text', true);
    return Object.freeze({ ...common, label: value.trim().slice(0, 120) || 'Text', text: value });
  }
  if (raw.type === 'file') {
    const file = portablePath(raw.file, 'node file');
    return Object.freeze({
      ...common,
      label: file.split('/').at(-1) ?? file,
      file,
      ...(raw.subpath === undefined ? {} : { subpath: text(raw.subpath, 'node subpath', true) }),
    });
  }
  if (raw.type === 'link') {
    const url = safeUrl(raw.url);
    return Object.freeze({ ...common, label: url, url });
  }
  const label = text(raw.label ?? 'Group', 'group label');
  return Object.freeze({
    ...common,
    label,
    groupLabel: label,
    ...(raw.background === undefined
      ? {}
      : { background: portablePath(raw.background, 'group background') }),
    ...(raw.backgroundStyle === undefined
      ? {}
      : {
          backgroundStyle: validateOptionalEnum(
            raw.backgroundStyle,
            ['cover', 'ratio', 'repeat'],
            'group background style',
          ),
        }),
  });
}

function importEdge(
  raw: OpenJsonCanvasEdge,
  nodeIds: ReadonlySet<string>,
): VibeSpaceCanvasConnection {
  allowedKeys(
    raw,
    ['id', 'fromNode', 'toNode', 'fromSide', 'toSide', 'fromEnd', 'toEnd', 'color', 'label'],
    'edge fields',
  );
  const fromObjectId = id(raw.fromNode, 'edge source');
  const toObjectId = id(raw.toNode, 'edge target');
  if (!nodeIds.has(fromObjectId) || !nodeIds.has(toObjectId)) fail('dangling edge');
  return Object.freeze({
    id: id(raw.id, 'edge ID'),
    fromObjectId,
    toObjectId,
    ...(validateOptionalEnum(raw.fromSide, ['top', 'right', 'bottom', 'left'], 'edge side') ===
    undefined
      ? {}
      : { fromSide: raw.fromSide }),
    ...(validateOptionalEnum(raw.toSide, ['top', 'right', 'bottom', 'left'], 'edge side') ===
    undefined
      ? {}
      : { toSide: raw.toSide }),
    ...(validateOptionalEnum(raw.fromEnd, ['none', 'arrow'], 'edge end') === undefined
      ? {}
      : { fromEnd: raw.fromEnd }),
    ...(validateOptionalEnum(raw.toEnd, ['none', 'arrow'], 'edge end') === undefined
      ? {}
      : { toEnd: raw.toEnd }),
    ...(raw.color === undefined ? {} : { color: text(raw.color, 'edge color') }),
    ...(raw.label === undefined ? {} : { label: text(raw.label, 'edge label') }),
  });
}

export function importOpenJsonCanvas(
  raw: unknown,
  identity: { id: string; projectId: string | null; title: string; now?: number },
): Readonly<VibeSpaceCanvasDocument> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('boundary');
  assertPlainBoundary(raw);
  const parsed = clone(raw) as OpenJsonCanvasDocument;
  allowedKeys(parsed, ['nodes', 'edges'], 'document fields');
  if (
    !Array.isArray(parsed.nodes) ||
    !Array.isArray(parsed.edges) ||
    parsed.nodes.length > MAX_NODES ||
    parsed.edges.length > MAX_EDGES
  ) {
    fail('compatibility size');
  }
  const objects = parsed.nodes.map(importNode);
  const nodeIds = new Set(objects.map((object) => object.id));
  if (nodeIds.size !== objects.length) fail('duplicate node ID');
  const connections = parsed.edges.map((edge) => importEdge(edge, nodeIds));
  const edgeIds = new Set(connections.map((connection) => connection.id));
  if (edgeIds.size !== connections.length) fail('duplicate edge ID');
  return Object.freeze({
    schemaVersion: 1,
    id: id(identity.id, 'canvas ID'),
    projectId: projectId(identity.projectId),
    title: text(identity.title, 'canvas title'),
    updatedAt: timestamp(identity.now ?? Date.now()),
    objects: Object.freeze(objects),
    connections: Object.freeze(connections),
    compatibilitySource: Object.freeze({ format: 'open-json-canvas', version: 1 }),
  });
}
