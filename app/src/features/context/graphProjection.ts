import {
  CONTEXT_EDGE_KINDS,
  CONTEXT_ENTITY_KINDS,
  type ContextEdgeKind,
  type ContextEntityKind,
  type DeepReadonly,
} from './contracts';

const MAX_NODES = 10_000;
const MAX_EDGES = 50_000;
const MAX_GROUPS = 100;
const MAX_FILTER_VALUES = 100;
const MAX_PROPERTIES = 64;
const MAX_TAGS = 64;
const MAX_TEXT = 4_096;
const MAX_TIMESTAMP = 8_640_000_000_000_000;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,199}$/;
const SAFE_PROPERTY = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const UNSAFE_TEXT_CONTROLS =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u206f\ufeff]/u;

const FRESHNESS = [
  'current',
  'stale',
  'offline',
  'permission_required',
  'indexing',
  'error',
  'removed',
] as const;
const ATTACHMENT_TYPES = ['image', 'audio', 'video', 'pdf', 'file', 'other'] as const;
const TASK_STATES = ['todo', 'in_progress', 'blocked', 'done', 'cancelled'] as const;
const COLOR_TOKENS = [
  'accent-copper',
  'accent-amber',
  'accent-sakura',
  'foreground',
  'muted',
  'success',
  'warning',
  'danger',
] as const;
const NODE_SIZE_METRICS = ['backlinks', 'importance', 'centrality', 'recent_use', 'fixed'] as const;

export type ContextGraphFreshness = (typeof FRESHNESS)[number];
export type ContextGraphAttachmentType = (typeof ATTACHMENT_TYPES)[number];
export type ContextGraphTaskState = (typeof TASK_STATES)[number];
export type ContextGraphColorToken = (typeof COLOR_TOKENS)[number];
export type ContextGraphNodeSizeMetric = (typeof NODE_SIZE_METRICS)[number];

export interface ContextGraphProjectionPropertyV1 {
  name: string;
  value: string;
}

export interface ContextGraphProjectionNodeV1 {
  version: 1;
  id: string;
  accountId: string;
  mapId: string;
  sourceId: string;
  entityType: ContextEntityKind;
  label: string;
  path: string | null;
  tags: string[];
  properties: ContextGraphProjectionPropertyV1[];
  folder: string | null;
  repository: string | null;
  branch: string | null;
  language: string | null;
  freshness: ContextGraphFreshness;
  attachmentType: ContextGraphAttachmentType | null;
  taskState: ContextGraphTaskState | null;
  searchText: string;
  importance: number;
  recentUseAt: number | null;
}

export interface ContextGraphProjectionEdgeV1 {
  version: 1;
  id: string;
  accountId: string;
  mapId: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationship: ContextEdgeKind;
  weight: number;
}

export interface ContextGraphFiltersV1 {
  sourceIds?: string[];
  entityTypes?: ContextEntityKind[];
  relationships?: ContextEdgeKind[];
  tags?: string[];
  properties?: ContextGraphProjectionPropertyV1[];
  folders?: string[];
  repositories?: string[];
  branches?: string[];
  languages?: string[];
  freshness?: ContextGraphFreshness[];
  attachmentTypes?: ContextGraphAttachmentType[];
  taskStates?: ContextGraphTaskState[];
  searchQuery?: string;
}

export interface ContextGraphGroupV1 {
  version: 1;
  id: string;
  name: string;
  query: ContextGraphFiltersV1;
  colorToken: ContextGraphColorToken;
  priority: number;
  visible: boolean;
}

export interface ContextGraphDisplayControlsV1 {
  arrows: boolean;
  nodeSizeMetric: ContextGraphNodeSizeMetric;
  linkThickness: number;
  labelThreshold: number;
  relationLabels: boolean;
  connectionDepth: number;
  centerForce: number;
  repulsion: number;
  linkForce: number;
  linkDistance: number;
  clustering: boolean;
  animation: boolean;
  reducedMotion: boolean;
}

export interface ContextGraphProjectionInputV1 {
  version: 1;
  accountId: string;
  mapId: string;
  now: number;
  scope: { kind: 'global' } | { kind: 'local'; selectedId: string };
  nodes: ContextGraphProjectionNodeV1[];
  edges: ContextGraphProjectionEdgeV1[];
  filters: ContextGraphFiltersV1;
  groups: ContextGraphGroupV1[];
  controls: ContextGraphDisplayControlsV1;
}

export type ContextGraphProjectionErrorCode =
  | 'invalid_input'
  | 'scope_mismatch'
  | 'duplicate_id'
  | 'dangling_edge'
  | 'selected_node_not_found'
  | 'too_many_items';

export class ContextGraphProjectionError extends Error {
  constructor(
    readonly code: ContextGraphProjectionErrorCode,
    readonly detail?: string,
  ) {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'ContextGraphProjectionError';
  }
}

function dataRecord(value: unknown): Record<string, unknown> | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    if (Reflect.ownKeys(value).some((key) => typeof key !== 'string')) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const record: Record<string, unknown> = Object.create(null);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) return null;
      record[key] = descriptor.value;
    }
    return record;
  } catch {
    return null;
  }
}

function dataArray(value: unknown, maximum: number): unknown[] | null {
  try {
    if (!Array.isArray(value)) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<
      string,
      PropertyDescriptor
    >;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== 'string')) return null;
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (
      !lengthDescriptor ||
      !Object.hasOwn(lengthDescriptor, 'value') ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0
    ) {
      return null;
    }
    const length = lengthDescriptor.value as number;
    if (length > maximum) throw new ContextGraphProjectionError('too_many_items');
    if (ownKeys.length !== length + 1) return null;
    const output: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        return null;
      }
      output.push(descriptor.value);
    }
    return output;
  } catch (error) {
    if (error instanceof ContextGraphProjectionError) throw error;
    return null;
  }
}

function exactKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(record);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

function allowedKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(record).every((key) => allowed.includes(key));
}

function oneOf<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
): value is Values[number] {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function id(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ID.test(value);
}

function safeText(value: unknown, maximum = MAX_TEXT): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximum &&
    !UNSAFE_TEXT_CONTROLS.test(value)
  );
}

function timestamp(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= MAX_TIMESTAMP
  );
}

function finiteRange(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
  );
}

function integerRange(value: unknown, minimum: number, maximum: number): value is number {
  return (
    Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum
  );
}

function portablePath(value: unknown): value is string {
  if (
    !safeText(value) ||
    value.length > MAX_TEXT ||
    value.includes('\\') ||
    value.includes('%') ||
    value.startsWith('/') ||
    /^[A-Za-z]:/.test(value) ||
    /^[a-z][a-z0-9+.-]*:/i.test(value)
  ) {
    return false;
  }
  return value
    .split('/')
    .every(
      (segment) =>
        segment.length > 0 &&
        segment !== '.' &&
        segment !== '..' &&
        !segment.endsWith('.') &&
        !segment.endsWith(' '),
    );
}

function optionalPortable(value: unknown): string | null | undefined {
  if (value === null) return null;
  return portablePath(value) ? value : undefined;
}

function uniqueStrings(
  value: unknown,
  validator: (entry: unknown) => entry is string,
  maximum = MAX_FILTER_VALUES,
): string[] | null {
  const values = dataArray(value, maximum);
  if (!values) return null;
  const entries = values.map((entry) => (validator(entry) ? entry : null));
  if (entries.some((entry) => entry === null)) return null;
  const strings = entries as string[];
  return new Set(strings).size === strings.length ? strings : null;
}

function property(value: unknown): ContextGraphProjectionPropertyV1 | null {
  const record = dataRecord(value);
  if (
    !record ||
    !exactKeys(record, ['name', 'value']) ||
    typeof record.name !== 'string' ||
    !SAFE_PROPERTY.test(record.name) ||
    !safeText(record.value, 1_000)
  ) {
    return null;
  }
  return { name: record.name, value: record.value };
}

function properties(value: unknown): ContextGraphProjectionPropertyV1[] | null {
  const values = dataArray(value, MAX_PROPERTIES);
  if (!values) return null;
  const parsed = values.map(property);
  if (parsed.some((entry) => entry === null)) return null;
  const output = parsed as ContextGraphProjectionPropertyV1[];
  return new Set(output.map(({ name }) => name)).size === output.length ? output : null;
}

function parseNode(value: unknown, now: number): ContextGraphProjectionNodeV1 {
  const record = dataRecord(value);
  if (
    !record ||
    !exactKeys(record, [
      'version',
      'id',
      'accountId',
      'mapId',
      'sourceId',
      'entityType',
      'label',
      'path',
      'tags',
      'properties',
      'folder',
      'repository',
      'branch',
      'language',
      'freshness',
      'attachmentType',
      'taskState',
      'searchText',
      'importance',
      'recentUseAt',
    ]) ||
    record.version !== 1 ||
    !id(record.id) ||
    !id(record.accountId) ||
    !id(record.mapId) ||
    !id(record.sourceId) ||
    !oneOf(record.entityType, CONTEXT_ENTITY_KINDS) ||
    !safeText(record.label, 500) ||
    !oneOf(record.freshness, FRESHNESS) ||
    (record.attachmentType !== null && !oneOf(record.attachmentType, ATTACHMENT_TYPES)) ||
    (record.taskState !== null && !oneOf(record.taskState, TASK_STATES)) ||
    !safeText(record.searchText) ||
    !finiteRange(record.importance, 0, 1) ||
    (record.recentUseAt !== null &&
      (!timestamp(record.recentUseAt) || (record.recentUseAt as number) > now))
  ) {
    throw new ContextGraphProjectionError('invalid_input', 'node');
  }
  const path = optionalPortable(record.path);
  const folder = optionalPortable(record.folder);
  const tags = uniqueStrings(
    record.tags,
    (entry): entry is string => safeText(entry, 128),
    MAX_TAGS,
  );
  const parsedProperties = properties(record.properties);
  if (
    path === undefined ||
    folder === undefined ||
    !tags ||
    !parsedProperties ||
    (record.repository !== null && !id(record.repository)) ||
    (record.branch !== null && !safeText(record.branch, 255)) ||
    (record.language !== null && !safeText(record.language, 100))
  ) {
    throw new ContextGraphProjectionError('invalid_input', 'node_metadata');
  }
  return {
    version: 1,
    id: record.id,
    accountId: record.accountId,
    mapId: record.mapId,
    sourceId: record.sourceId,
    entityType: record.entityType,
    label: record.label,
    path,
    tags,
    properties: parsedProperties,
    folder,
    repository: record.repository as string | null,
    branch: record.branch as string | null,
    language: record.language as string | null,
    freshness: record.freshness,
    attachmentType: record.attachmentType as ContextGraphAttachmentType | null,
    taskState: record.taskState as ContextGraphTaskState | null,
    searchText: record.searchText,
    importance: record.importance,
    recentUseAt: record.recentUseAt as number | null,
  };
}

function parseEdge(value: unknown): ContextGraphProjectionEdgeV1 {
  const record = dataRecord(value);
  if (
    !record ||
    !exactKeys(record, [
      'version',
      'id',
      'accountId',
      'mapId',
      'sourceEntityId',
      'targetEntityId',
      'relationship',
      'weight',
    ]) ||
    record.version !== 1 ||
    !id(record.id) ||
    !id(record.accountId) ||
    !id(record.mapId) ||
    !id(record.sourceEntityId) ||
    !id(record.targetEntityId) ||
    record.sourceEntityId === record.targetEntityId ||
    !oneOf(record.relationship, CONTEXT_EDGE_KINDS) ||
    !finiteRange(record.weight, 0, 1)
  ) {
    throw new ContextGraphProjectionError('invalid_input', 'edge');
  }
  return {
    version: 1,
    id: record.id,
    accountId: record.accountId,
    mapId: record.mapId,
    sourceEntityId: record.sourceEntityId,
    targetEntityId: record.targetEntityId,
    relationship: record.relationship,
    weight: record.weight,
  };
}

function enumValues<Values extends readonly string[]>(
  value: unknown,
  allowed: Values,
): Values[number][] | null {
  const entries = uniqueStrings(value, (entry): entry is Values[number] => oneOf(entry, allowed));
  return entries as Values[number][] | null;
}

interface ParsedFilters {
  sourceIds: string[];
  entityTypes: ContextEntityKind[];
  relationships: ContextEdgeKind[];
  tags: string[];
  properties: ContextGraphProjectionPropertyV1[];
  folders: string[];
  repositories: string[];
  branches: string[];
  languages: string[];
  freshness: ContextGraphFreshness[];
  attachmentTypes: ContextGraphAttachmentType[];
  taskStates: ContextGraphTaskState[];
  searchQuery: string | null;
}

function parseFilters(value: unknown): ParsedFilters {
  const record = dataRecord(value);
  const keys = [
    'sourceIds',
    'entityTypes',
    'relationships',
    'tags',
    'properties',
    'folders',
    'repositories',
    'branches',
    'languages',
    'freshness',
    'attachmentTypes',
    'taskStates',
    'searchQuery',
  ];
  if (!record || !allowedKeys(record, keys)) {
    throw new ContextGraphProjectionError('invalid_input', 'filters');
  }
  const sourceIds = record.sourceIds === undefined ? [] : uniqueStrings(record.sourceIds, id);
  const entityTypes =
    record.entityTypes === undefined ? [] : enumValues(record.entityTypes, CONTEXT_ENTITY_KINDS);
  const relationships =
    record.relationships === undefined ? [] : enumValues(record.relationships, CONTEXT_EDGE_KINDS);
  const tags =
    record.tags === undefined
      ? []
      : uniqueStrings(record.tags, (entry): entry is string => safeText(entry, 128));
  const parsedProperties = record.properties === undefined ? [] : properties(record.properties);
  const folders = record.folders === undefined ? [] : uniqueStrings(record.folders, portablePath);
  const repositories =
    record.repositories === undefined ? [] : uniqueStrings(record.repositories, id);
  const branches =
    record.branches === undefined
      ? []
      : uniqueStrings(record.branches, (entry): entry is string => safeText(entry, 255));
  const languages =
    record.languages === undefined
      ? []
      : uniqueStrings(record.languages, (entry): entry is string => safeText(entry, 100));
  const freshness = record.freshness === undefined ? [] : enumValues(record.freshness, FRESHNESS);
  const attachmentTypes =
    record.attachmentTypes === undefined
      ? []
      : enumValues(record.attachmentTypes, ATTACHMENT_TYPES);
  const taskStates =
    record.taskStates === undefined ? [] : enumValues(record.taskStates, TASK_STATES);
  const searchQuery =
    record.searchQuery === undefined
      ? null
      : safeText(record.searchQuery, 500)
        ? record.searchQuery
        : undefined;
  if (
    !sourceIds ||
    !entityTypes ||
    !relationships ||
    !tags ||
    !parsedProperties ||
    !folders ||
    !repositories ||
    !branches ||
    !languages ||
    !freshness ||
    !attachmentTypes ||
    !taskStates ||
    searchQuery === undefined
  ) {
    throw new ContextGraphProjectionError('invalid_input', 'filter_values');
  }
  return {
    sourceIds,
    entityTypes,
    relationships,
    tags,
    properties: parsedProperties,
    folders,
    repositories,
    branches,
    languages,
    freshness,
    attachmentTypes,
    taskStates,
    searchQuery,
  };
}

interface ParsedGroup extends Omit<ContextGraphGroupV1, 'query'> {
  query: ParsedFilters;
}

function parseGroup(value: unknown): ParsedGroup {
  const record = dataRecord(value);
  if (
    !record ||
    !exactKeys(record, ['version', 'id', 'name', 'query', 'colorToken', 'priority', 'visible']) ||
    record.version !== 1 ||
    !id(record.id) ||
    !safeText(record.name, 200) ||
    !oneOf(record.colorToken, COLOR_TOKENS) ||
    !integerRange(record.priority, 0, 1_000) ||
    typeof record.visible !== 'boolean'
  ) {
    throw new ContextGraphProjectionError('invalid_input', 'group');
  }
  return {
    version: 1,
    id: record.id,
    name: record.name,
    query: parseFilters(record.query),
    colorToken: record.colorToken,
    priority: record.priority,
    visible: record.visible,
  };
}

interface ParsedControls extends ContextGraphDisplayControlsV1 {
  motion: 'off' | 'restrained';
}

function parseControls(value: unknown): ParsedControls {
  const record = dataRecord(value);
  if (
    !record ||
    !exactKeys(record, [
      'arrows',
      'nodeSizeMetric',
      'linkThickness',
      'labelThreshold',
      'relationLabels',
      'connectionDepth',
      'centerForce',
      'repulsion',
      'linkForce',
      'linkDistance',
      'clustering',
      'animation',
      'reducedMotion',
    ]) ||
    typeof record.arrows !== 'boolean' ||
    !oneOf(record.nodeSizeMetric, NODE_SIZE_METRICS) ||
    !finiteRange(record.linkThickness, 0.5, 8) ||
    !finiteRange(record.labelThreshold, 0, 1) ||
    typeof record.relationLabels !== 'boolean' ||
    !integerRange(record.connectionDepth, 0, 5) ||
    !finiteRange(record.centerForce, 0, 1) ||
    !finiteRange(record.repulsion, 0, 1) ||
    !finiteRange(record.linkForce, 0, 1) ||
    !finiteRange(record.linkDistance, 20, 1_000) ||
    typeof record.clustering !== 'boolean' ||
    typeof record.animation !== 'boolean' ||
    typeof record.reducedMotion !== 'boolean'
  ) {
    throw new ContextGraphProjectionError('invalid_input', 'controls');
  }
  const animation = record.animation && !record.reducedMotion;
  return {
    arrows: record.arrows,
    nodeSizeMetric: record.nodeSizeMetric,
    linkThickness: record.linkThickness,
    labelThreshold: record.labelThreshold,
    relationLabels: record.relationLabels,
    connectionDepth: record.connectionDepth,
    centerForce: record.centerForce,
    repulsion: record.repulsion,
    linkForce: record.linkForce,
    linkDistance: record.linkDistance,
    clustering: record.clustering,
    animation,
    reducedMotion: record.reducedMotion,
    motion: animation ? 'restrained' : 'off',
  };
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function includesFolder(folder: string | null, filters: readonly string[]): boolean {
  return (
    filters.length === 0 ||
    (folder !== null &&
      filters.some((candidate) => folder === candidate || folder.startsWith(`${candidate}/`)))
  );
}

function nodeMatches(
  node: ContextGraphProjectionNodeV1,
  filters: ParsedFilters,
  incidentRelationships?: ReadonlySet<ContextEdgeKind>,
): boolean {
  const propertyMap = new Map(node.properties.map((entry) => [entry.name, entry.value]));
  const query = filters.searchQuery?.toLocaleLowerCase('en-US');
  return (
    (filters.sourceIds.length === 0 || filters.sourceIds.includes(node.sourceId)) &&
    (filters.entityTypes.length === 0 || filters.entityTypes.includes(node.entityType)) &&
    filters.tags.every((tag) => node.tags.includes(tag)) &&
    filters.properties.every(({ name, value }) => propertyMap.get(name) === value) &&
    includesFolder(node.folder, filters.folders) &&
    (filters.repositories.length === 0 ||
      (node.repository !== null && filters.repositories.includes(node.repository))) &&
    (filters.branches.length === 0 ||
      (node.branch !== null && filters.branches.includes(node.branch))) &&
    (filters.languages.length === 0 ||
      (node.language !== null && filters.languages.includes(node.language))) &&
    (filters.freshness.length === 0 || filters.freshness.includes(node.freshness)) &&
    (filters.attachmentTypes.length === 0 ||
      (node.attachmentType !== null && filters.attachmentTypes.includes(node.attachmentType))) &&
    (filters.taskStates.length === 0 ||
      (node.taskState !== null && filters.taskStates.includes(node.taskState))) &&
    (!query || node.searchText.toLocaleLowerCase('en-US').includes(query)) &&
    (filters.relationships.length === 0 ||
      (incidentRelationships !== undefined &&
        filters.relationships.some((relationship) => incidentRelationships.has(relationship))))
  );
}

function incidentRelationshipMap(
  nodes: readonly ContextGraphProjectionNodeV1[],
  edges: readonly ContextGraphProjectionEdgeV1[],
): Map<string, Set<ContextEdgeKind>> {
  const output = new Map(nodes.map(({ id: nodeId }) => [nodeId, new Set<ContextEdgeKind>()]));
  for (const edge of edges) {
    output.get(edge.sourceEntityId)?.add(edge.relationship);
    output.get(edge.targetEntityId)?.add(edge.relationship);
  }
  return output;
}

function localNodeIds(
  selectedId: string,
  depth: number,
  nodeIds: ReadonlySet<string>,
  edges: readonly ContextGraphProjectionEdgeV1[],
): Set<string> {
  if (!nodeIds.has(selectedId)) return new Set();
  const adjacency = new Map([...nodeIds].map((nodeId) => [nodeId, new Set<string>()]));
  for (const edge of edges) {
    if (!nodeIds.has(edge.sourceEntityId) || !nodeIds.has(edge.targetEntityId)) continue;
    adjacency.get(edge.sourceEntityId)!.add(edge.targetEntityId);
    adjacency.get(edge.targetEntityId)!.add(edge.sourceEntityId);
  }
  const seen = new Set([selectedId]);
  let frontier = [selectedId];
  for (let level = 0; level < depth && frontier.length > 0; level += 1) {
    const next = new Set<string>();
    for (const nodeId of frontier) {
      for (const neighbor of adjacency.get(nodeId) ?? []) {
        if (!seen.has(neighbor)) next.add(neighbor);
      }
    }
    frontier = [...next].sort(compareIds);
    for (const nodeId of frontier) seen.add(nodeId);
  }
  return seen;
}

function centrality(
  nodeIds: readonly string[],
  edges: readonly ContextGraphProjectionEdgeV1[],
): Map<string, number> {
  if (nodeIds.length === 0) return new Map();
  const allowed = new Set(nodeIds);
  const outgoing = new Map(nodeIds.map((nodeId) => [nodeId, new Set<string>()]));
  for (const edge of edges) {
    if (allowed.has(edge.sourceEntityId) && allowed.has(edge.targetEntityId)) {
      outgoing.get(edge.sourceEntityId)!.add(edge.targetEntityId);
    }
  }
  const base = 1 / nodeIds.length;
  let scores = new Map(nodeIds.map((nodeId) => [nodeId, base]));
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const next = new Map(nodeIds.map((nodeId) => [nodeId, (1 - 0.85) * base]));
    let dangling = 0;
    for (const nodeId of nodeIds) {
      const targets = outgoing.get(nodeId)!;
      const score = scores.get(nodeId)!;
      if (targets.size === 0) {
        dangling += score;
        continue;
      }
      const share = (0.85 * score) / targets.size;
      for (const target of targets) next.set(target, next.get(target)! + share);
    }
    const danglingShare = (0.85 * dangling) / nodeIds.length;
    for (const nodeId of nodeIds) next.set(nodeId, next.get(nodeId)! + danglingShare);
    scores = next;
  }
  return scores;
}

const METRIC_LABELS: Record<ContextGraphNodeSizeMetric, string> = {
  backlinks: 'Backlinks',
  importance: 'Importance',
  centrality: 'Graph centrality',
  recent_use: 'Recent use',
  fixed: 'Fixed size',
};

function metricValues(
  metric: ContextGraphNodeSizeMetric,
  nodes: readonly ContextGraphProjectionNodeV1[],
  edges: readonly ContextGraphProjectionEdgeV1[],
  now: number,
): Map<string, number> {
  if (metric === 'importance') return new Map(nodes.map((node) => [node.id, node.importance]));
  if (metric === 'recent_use') {
    return new Map(
      nodes.map((node) => [
        node.id,
        node.recentUseAt === null ? 0 : 1 / (1 + (now - node.recentUseAt) / 86_400_000),
      ]),
    );
  }
  if (metric === 'fixed') return new Map(nodes.map((node) => [node.id, 1]));
  if (metric === 'centrality') {
    return centrality(
      nodes.map(({ id: nodeId }) => nodeId),
      edges,
    );
  }
  const backlinks = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    backlinks.set(edge.targetEntityId, (backlinks.get(edge.targetEntityId) ?? 0) + 1);
  }
  return backlinks;
}

function sizeFor(value: number, minimum: number, maximum: number): number {
  if (maximum === minimum) return 32;
  return 16 + ((value - minimum) / (maximum - minimum)) * 32;
}

function projectUnsafe(input: unknown) {
  const root = dataRecord(input);
  if (
    !root ||
    !exactKeys(root, [
      'version',
      'accountId',
      'mapId',
      'now',
      'scope',
      'nodes',
      'edges',
      'filters',
      'groups',
      'controls',
    ]) ||
    root.version !== 1 ||
    !id(root.accountId) ||
    !id(root.mapId) ||
    !timestamp(root.now) ||
    root.nodes === undefined ||
    root.edges === undefined ||
    root.groups === undefined
  ) {
    throw new ContextGraphProjectionError('invalid_input', 'root');
  }
  const nodeInputs = dataArray(root.nodes, MAX_NODES);
  const edgeInputs = dataArray(root.edges, MAX_EDGES);
  const groupInputs = dataArray(root.groups, MAX_GROUPS);
  if (!nodeInputs || !edgeInputs || !groupInputs) {
    throw new ContextGraphProjectionError('invalid_input', 'collections');
  }
  const nodes = nodeInputs.map((entry) => parseNode(entry, root.now as number));
  const edges = edgeInputs.map(parseEdge);
  const filters = parseFilters(root.filters);
  const groups = groupInputs.map(parseGroup);
  const controls = parseControls(root.controls);
  const scope = dataRecord(root.scope);
  if (
    !scope ||
    (scope.kind === 'global' && !exactKeys(scope, ['kind'])) ||
    (scope.kind === 'local' &&
      (!exactKeys(scope, ['kind', 'selectedId']) || !id(scope.selectedId))) ||
    (scope.kind !== 'global' && scope.kind !== 'local')
  ) {
    throw new ContextGraphProjectionError('invalid_input', 'scope');
  }
  if (
    nodes.some((node) => node.accountId !== root.accountId || node.mapId !== root.mapId) ||
    edges.some((edge) => edge.accountId !== root.accountId || edge.mapId !== root.mapId)
  ) {
    throw new ContextGraphProjectionError('scope_mismatch');
  }
  if (
    new Set(nodes.map(({ id: nodeId }) => nodeId)).size !== nodes.length ||
    new Set(edges.map(({ id: edgeId }) => edgeId)).size !== edges.length ||
    new Set(groups.map(({ id: groupId }) => groupId)).size !== groups.length
  ) {
    throw new ContextGraphProjectionError('duplicate_id');
  }
  const allNodeIds = new Set(nodes.map(({ id: nodeId }) => nodeId));
  if (
    edges.some(
      (edge) => !allNodeIds.has(edge.sourceEntityId) || !allNodeIds.has(edge.targetEntityId),
    )
  ) {
    throw new ContextGraphProjectionError('dangling_edge');
  }
  if (scope.kind === 'local' && !allNodeIds.has(scope.selectedId as string)) {
    throw new ContextGraphProjectionError('selected_node_not_found');
  }

  const relationshipFilteredEdges = edges.filter(
    (edge) =>
      filters.relationships.length === 0 || filters.relationships.includes(edge.relationship),
  );
  const incident = incidentRelationshipMap(nodes, relationshipFilteredEdges);
  let projectedNodes = nodes.filter((node) => nodeMatches(node, filters, incident.get(node.id)));
  const selectedId = scope.kind === 'local' ? (scope.selectedId as string) : null;
  if (selectedId && !projectedNodes.some((node) => node.id === selectedId)) {
    projectedNodes.push(nodes.find((node) => node.id === selectedId)!);
  }
  let projectedNodeIds = new Set(projectedNodes.map(({ id: nodeId }) => nodeId));
  let projectedEdges = relationshipFilteredEdges.filter(
    (edge) =>
      projectedNodeIds.has(edge.sourceEntityId) && projectedNodeIds.has(edge.targetEntityId),
  );

  if (scope.kind === 'local') {
    const localIds = localNodeIds(
      scope.selectedId as string,
      controls.connectionDepth,
      projectedNodeIds,
      projectedEdges,
    );
    projectedNodes = projectedNodes.filter((node) => localIds.has(node.id));
    projectedNodeIds = localIds;
    projectedEdges = projectedEdges.filter(
      (edge) =>
        projectedNodeIds.has(edge.sourceEntityId) && projectedNodeIds.has(edge.targetEntityId),
    );
  }

  const sortedGroups = [...groups].sort(
    (left, right) => right.priority - left.priority || compareIds(left.id, right.id),
  );
  const groupByNode = new Map<string, ParsedGroup | null>();
  const groupMatchCounts = new Map(sortedGroups.map((group) => [group.id, 0]));
  projectedNodes = projectedNodes.filter((node) => {
    const winning =
      sortedGroups.find((group) => nodeMatches(node, group.query, incident.get(node.id))) ?? null;
    groupByNode.set(node.id, winning);
    if (winning) groupMatchCounts.set(winning.id, groupMatchCounts.get(winning.id)! + 1);
    return node.id === selectedId || winning?.visible !== false;
  });
  projectedNodeIds = new Set(projectedNodes.map(({ id: nodeId }) => nodeId));
  projectedEdges = projectedEdges.filter(
    (edge) =>
      projectedNodeIds.has(edge.sourceEntityId) && projectedNodeIds.has(edge.targetEntityId),
  );
  if (scope.kind === 'local') {
    const visibleLocalIds = localNodeIds(
      scope.selectedId as string,
      controls.connectionDepth,
      projectedNodeIds,
      projectedEdges,
    );
    projectedNodes = projectedNodes.filter((node) => visibleLocalIds.has(node.id));
    projectedNodeIds = visibleLocalIds;
    projectedEdges = projectedEdges.filter(
      (edge) =>
        projectedNodeIds.has(edge.sourceEntityId) && projectedNodeIds.has(edge.targetEntityId),
    );
  }
  projectedNodes.sort((left, right) => compareIds(left.id, right.id));
  projectedEdges.sort((left, right) => compareIds(left.id, right.id));

  const values = metricValues(
    controls.nodeSizeMetric,
    projectedNodes,
    projectedEdges,
    root.now as number,
  );
  const numericValues = [...values.values()];
  const minimum = numericValues.length === 0 ? 0 : Math.min(...numericValues);
  const maximum = numericValues.length === 0 ? 0 : Math.max(...numericValues);
  const outputNodes = projectedNodes.map((node) => {
    const metricValue = values.get(node.id) ?? 0;
    return {
      ...node,
      tags: [...node.tags],
      properties: node.properties.map((entry) => ({ ...entry })),
      groupId: groupByNode.get(node.id)?.id ?? null,
      metricValue,
      size: sizeFor(metricValue, minimum, maximum),
    };
  });
  const selectedNodeId =
    scope.kind === 'local' && projectedNodeIds.has(scope.selectedId as string)
      ? (scope.selectedId as string)
      : null;
  return {
    version: 1 as const,
    accountId: root.accountId,
    mapId: root.mapId,
    scope: scope.kind,
    selectedNodeId,
    nodes: outputNodes,
    edges: projectedEdges.map((edge) => ({ ...edge })),
    groups: sortedGroups.map((group) => ({
      version: 1 as const,
      id: group.id,
      name: group.name,
      query: group.query,
      colorToken: group.colorToken,
      priority: group.priority,
      visible: group.visible,
      matchedNodeCount: groupMatchCounts.get(group.id) ?? 0,
    })),
    controls,
    nodeSizeMetric: {
      kind: controls.nodeSizeMetric,
      label: METRIC_LABELS[controls.nodeSizeMetric],
    },
  };
}

function detachedFreeze<T>(value: T): DeepReadonly<T> {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => detachedFreeze(entry))) as DeepReadonly<T>;
  }
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const copy: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(source)) copy[key] = detachedFreeze(entry);
    return Object.freeze(copy) as DeepReadonly<T>;
  }
  return value as DeepReadonly<T>;
}

export function projectContextGraph(
  input: ContextGraphProjectionInputV1,
): DeepReadonly<ReturnType<typeof projectUnsafe>> {
  try {
    const projection = projectUnsafe(input);
    if (typeof structuredClone !== 'function') {
      throw new ContextGraphProjectionError('invalid_input', 'structured_clone_unavailable');
    }
    structuredClone(input);
    return detachedFreeze(projection);
  } catch (error) {
    if (error instanceof ContextGraphProjectionError) throw error;
    throw new ContextGraphProjectionError('invalid_input', 'unreadable');
  }
}
