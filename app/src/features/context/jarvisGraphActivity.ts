import {
  validateJarvisContextPack,
  type JarvisContextPack,
  type JarvisSourceRef,
} from '@/lib/jarvis/contracts';
import { CONTEXT_SOURCE_KINDS, type DeepReadonly } from './contracts';
import type {
  ContextRetrievalRequest,
  ContextRetrievalResult,
  RetrievedContextCitation,
  RetrievedContextItem,
} from './contextRetrievalService';

const MAX_BINDINGS = 1_000;
const MAX_GRAPH_NODES = 10_000;
const MAX_GRAPH_EDGES = 50_000;
const MAX_PATH_EVIDENCE = 2_000;
const MAX_PACK_ITEMS = 500;
const MAX_PACK_EXCLUSIONS = 1_000;
const MAX_PACK_BUDGET_CHARS = 1_000_000;
const MAX_PACK_TEXT_CHARS = 2_000_000;
const MAX_TIMESTAMP = 8_640_000_000_000_000;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,199}$/;
const UNSAFE_TEXT_CONTROLS =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u206f\ufeff]/u;

const LIFECYCLES = ['retrieving', 'running', 'completed', 'cancelled', 'failed'] as const;
const PATH_STATES = ['active', 'observed'] as const;
const RETRY_PLAN_BRAND = new WeakSet<object>();
const RETRY_AUTHORITIES = new WeakSet<object>();
const RETRIEVAL_RECEIPTS = new WeakMap<
  object,
  {
    authority: object;
    runId: string;
    request: ContextRetrievalRequest;
    result: {
      queryId: string;
      builtAt: number;
      itemRefs: Array<{ id: string; sourceId: string }>;
    };
  }
>();
const REMOVAL_GRANTS = new WeakMap<
  object,
  {
    authority: object;
    receipt: object;
    removedItemId: string;
    requestedAt: number;
  }
>();
const VOICE_CITATION_AUTHORITIES = new WeakSet<object>();
const VOICE_CITATION_GRANTS = new WeakMap<object, { authority: object; itemIds: string[] }>();
const MAX_RETRY_ITEMS = 500;
const MAX_VOICE_CHARS = 280;

export type ContextJarvisGraphLifecycleV1 = (typeof LIFECYCLES)[number];
export type ContextJarvisGraphPathStateV1 = (typeof PATH_STATES)[number];

export interface ContextJarvisGraphBindingV1 {
  version: 1;
  accountId: string;
  mapId: string;
  runId: string;
  sourceId: string;
  nodeId: string;
  path: string;
}

export interface ContextJarvisGraphNodeV1 {
  version: 1;
  id: string;
  accountId: string;
  mapId: string;
}

export interface ContextJarvisGraphEdgeV1 {
  version: 1;
  id: string;
  accountId: string;
  mapId: string;
  sourceNodeId: string;
  targetNodeId: string;
}

export interface ContextJarvisGraphPackEvidenceV1 {
  version: 1;
  accountId: string;
  mapId: string;
  runId: string;
  retrievedAt: number;
  contextPack: JarvisContextPack;
}

export interface ContextJarvisGraphPathEvidenceV1 {
  version: 1;
  id: string;
  accountId: string;
  mapId: string;
  runId: string;
  sourceNodeId: string;
  targetNodeId: string;
  state: ContextJarvisGraphPathStateV1;
  observedAt: number;
}

export interface ContextJarvisGraphActivityInputV1 {
  version: 1;
  accountId: string;
  mapId: string;
  runId: string;
  startedAt: number;
  now: number;
  lifecycle: ContextJarvisGraphLifecycleV1;
  reducedMotion: boolean;
  contextPackEvidence: ContextJarvisGraphPackEvidenceV1;
  graphNodes: ContextJarvisGraphNodeV1[];
  graphEdges: ContextJarvisGraphEdgeV1[];
  bindings: ContextJarvisGraphBindingV1[];
  pathEvidence: ContextJarvisGraphPathEvidenceV1[];
}

export type ContextJarvisGraphActivityErrorCode =
  | 'invalid_input'
  | 'invalid_context_pack'
  | 'scope_mismatch'
  | 'duplicate_id'
  | 'missing_node'
  | 'missing_edge'
  | 'invalid_active_path'
  | 'invalid_chronology'
  | 'too_many_items';

export class ContextJarvisGraphActivityError extends Error {
  constructor(
    readonly code: ContextJarvisGraphActivityErrorCode,
    readonly detail?: string,
  ) {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'ContextJarvisGraphActivityError';
  }
}

function dataRecord(value: unknown): Record<string, unknown> | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    if (Reflect.ownKeys(value).some((key) => typeof key !== 'string')) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const output: Record<string, unknown> = Object.create(null);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) return null;
      output[key] = descriptor.value;
    }
    return output;
  } catch {
    return null;
  }
}

function dataArray(value: unknown, maximum: number): readonly unknown[] | null {
  try {
    if (!Array.isArray(value)) return null;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== 'string')) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (
      !lengthDescriptor ||
      !Object.hasOwn(lengthDescriptor, 'value') ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      (lengthDescriptor.value as number) < 0
    ) {
      return null;
    }
    const length = lengthDescriptor.value as number;
    if (length > maximum) throw new ContextJarvisGraphActivityError('too_many_items');
    if (ownKeys.length !== length + 1) return null;
    const output: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) return null;
      output.push(descriptor.value);
    }
    return Object.freeze(output);
  } catch (error) {
    if (error instanceof ContextJarvisGraphActivityError) throw error;
    return null;
  }
}

function exactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(record);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
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

function timestamp(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= MAX_TIMESTAMP
  );
}

function portablePath(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 1_000 ||
    UNSAFE_TEXT_CONTROLS.test(value) ||
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
        !segment.includes(':') &&
        !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(segment) &&
        !segment.endsWith('.') &&
        !segment.endsWith(' '),
    );
}

function binding(value: unknown): ContextJarvisGraphBindingV1 {
  const record = dataRecord(value);
  if (
    !record ||
    !exactKeys(record, ['version', 'accountId', 'mapId', 'runId', 'sourceId', 'nodeId', 'path']) ||
    record.version !== 1 ||
    !id(record.accountId) ||
    !id(record.mapId) ||
    !id(record.runId) ||
    !id(record.sourceId) ||
    !id(record.nodeId) ||
    !portablePath(record.path)
  ) {
    throw new ContextJarvisGraphActivityError('invalid_input', 'binding');
  }
  return {
    version: 1,
    accountId: record.accountId,
    mapId: record.mapId,
    runId: record.runId,
    sourceId: record.sourceId,
    nodeId: record.nodeId,
    path: record.path,
  };
}

function graphNode(value: unknown): ContextJarvisGraphNodeV1 {
  const record = dataRecord(value);
  if (
    !record ||
    !exactKeys(record, ['version', 'id', 'accountId', 'mapId']) ||
    record.version !== 1 ||
    !id(record.id) ||
    !id(record.accountId) ||
    !id(record.mapId)
  ) {
    throw new ContextJarvisGraphActivityError('invalid_input', 'graph_node');
  }
  return {
    version: 1,
    id: record.id,
    accountId: record.accountId,
    mapId: record.mapId,
  };
}

function graphEdge(value: unknown): ContextJarvisGraphEdgeV1 {
  const record = dataRecord(value);
  if (
    !record ||
    !exactKeys(record, ['version', 'id', 'accountId', 'mapId', 'sourceNodeId', 'targetNodeId']) ||
    record.version !== 1 ||
    !id(record.id) ||
    !id(record.accountId) ||
    !id(record.mapId) ||
    !id(record.sourceNodeId) ||
    !id(record.targetNodeId) ||
    record.sourceNodeId === record.targetNodeId
  ) {
    throw new ContextJarvisGraphActivityError('invalid_input', 'graph_edge');
  }
  return {
    version: 1,
    id: record.id,
    accountId: record.accountId,
    mapId: record.mapId,
    sourceNodeId: record.sourceNodeId,
    targetNodeId: record.targetNodeId,
  };
}

function pathEvidence(value: unknown): ContextJarvisGraphPathEvidenceV1 {
  const record = dataRecord(value);
  if (
    !record ||
    !exactKeys(record, [
      'version',
      'id',
      'accountId',
      'mapId',
      'runId',
      'sourceNodeId',
      'targetNodeId',
      'state',
      'observedAt',
    ]) ||
    record.version !== 1 ||
    !id(record.id) ||
    !id(record.accountId) ||
    !id(record.mapId) ||
    !id(record.runId) ||
    !id(record.sourceNodeId) ||
    !id(record.targetNodeId) ||
    record.sourceNodeId === record.targetNodeId ||
    !oneOf(record.state, PATH_STATES) ||
    !timestamp(record.observedAt)
  ) {
    throw new ContextJarvisGraphActivityError('invalid_input', 'path_evidence');
  }
  return {
    version: 1,
    id: record.id,
    accountId: record.accountId,
    mapId: record.mapId,
    runId: record.runId,
    sourceNodeId: record.sourceNodeId,
    targetNodeId: record.targetNodeId,
    state: record.state,
    observedAt: record.observedAt,
  };
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function detachedFreeze<T>(value: T): DeepReadonly<T> {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => detachedFreeze(entry))) as DeepReadonly<T>;
  }
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      output[key] = detachedFreeze(entry);
    }
    return Object.freeze(output) as DeepReadonly<T>;
  }
  return value as DeepReadonly<T>;
}

function packTextWithinLimit(pack: JarvisContextPack): boolean {
  let total = 0;
  const add = (value: string | undefined): boolean => {
    if (value !== undefined) total += value.length;
    return total <= MAX_PACK_TEXT_CHARS;
  };
  const addSource = (source: JarvisSourceRef): boolean =>
    add(source.id) &&
    add(source.kind) &&
    add(source.label) &&
    add(source.uri) &&
    add(source.accountId) &&
    add(source.projectId) &&
    add(source.trust) &&
    add(source.origin) &&
    add(source.sensitivity) &&
    add(source.contentHash);

  for (const item of pack.items) {
    if (
      !addSource(item.source) ||
      !add(item.purpose) ||
      !add(item.excerpt) ||
      !add(item.freshness)
    ) {
      return false;
    }
    if (item.conflict) {
      if (
        !add(item.conflict.groupId) ||
        !add(item.conflict.status) ||
        item.conflict.sourceIds.some((sourceId) => !add(sourceId))
      ) {
        return false;
      }
      if (
        item.conflict.status === 'resolved' &&
        (!add(item.conflict.winnerSourceId) || !add(item.conflict.basis))
      ) {
        return false;
      }
    }
  }
  for (const exclusion of pack.exclusions) {
    if (!addSource(exclusion.source) || !add(exclusion.reason)) return false;
  }
  return true;
}

function validPack(value: unknown, accountId: string): JarvisContextPack {
  const validation = validateJarvisContextPack(value);
  if (!validation.ok) {
    throw new ContextJarvisGraphActivityError('invalid_context_pack', 'contract');
  }
  const pack = validation.value;
  if (
    pack.items.length > MAX_PACK_ITEMS ||
    pack.exclusions.length > MAX_PACK_EXCLUSIONS ||
    !Number.isSafeInteger(pack.budget.maxChars) ||
    pack.budget.maxChars < 0 ||
    pack.budget.maxChars > MAX_PACK_BUDGET_CHARS ||
    !Number.isSafeInteger(pack.budget.usedChars) ||
    pack.budget.usedChars < 0 ||
    pack.budget.usedChars > pack.budget.maxChars ||
    pack.items.some(({ source }) => source.accountId !== accountId) ||
    pack.exclusions.some(({ source }) => source.accountId !== accountId) ||
    !packTextWithinLimit(pack) ||
    pack.items.reduce((total, item) => total + item.excerpt.length, 0) !== pack.budget.usedChars
  ) {
    throw new ContextJarvisGraphActivityError('invalid_context_pack', 'semantic');
  }
  return pack;
}

function packEvidence(value: unknown): ContextJarvisGraphPackEvidenceV1 {
  const record = dataRecord(value);
  if (
    !record ||
    !exactKeys(record, ['version', 'accountId', 'mapId', 'runId', 'retrievedAt', 'contextPack']) ||
    record.version !== 1 ||
    !id(record.accountId) ||
    !id(record.mapId) ||
    !id(record.runId) ||
    !timestamp(record.retrievedAt)
  ) {
    throw new ContextJarvisGraphActivityError('invalid_input', 'pack_evidence');
  }
  return {
    version: 1,
    accountId: record.accountId,
    mapId: record.mapId,
    runId: record.runId,
    retrievedAt: record.retrievedAt,
    contextPack: validPack(record.contextPack, record.accountId),
  };
}

export function buildContextJarvisGraphActivity(
  input: ContextJarvisGraphActivityInputV1,
): DeepReadonly<{
  version: 1;
  accountId: string;
  mapId: string;
  runId: string;
  lifecycle: ContextJarvisGraphLifecycleV1;
  activityEvent: {
    version: 1;
    id: string;
    kind: 'context_used';
    accountId: string;
    mapId: string;
    runId: string;
    occurredAt: number;
    sourceIds: string[];
  };
  usedNodes: Array<{
    nodeId: string;
    badge: 'Used by JARVIS';
    sourceReferences: JarvisSourceRef[];
    sourcePaths: string[];
  }>;
  activePathIds: string[];
  animateActivePaths: boolean;
  inspection: {
    runId: string;
    contextPack: JarvisContextPack;
    sources: Array<{
      sourceId: string;
      label: string;
      excerpt: string;
      freshness: 'current' | 'stale' | 'unknown';
      removable: true;
    }>;
  };
}> {
  try {
    const root = dataRecord(input);
    if (
      !root ||
      !exactKeys(root, [
        'version',
        'accountId',
        'mapId',
        'runId',
        'startedAt',
        'now',
        'lifecycle',
        'reducedMotion',
        'contextPackEvidence',
        'graphNodes',
        'graphEdges',
        'bindings',
        'pathEvidence',
      ]) ||
      root.version !== 1 ||
      !id(root.accountId) ||
      !id(root.mapId) ||
      !id(root.runId) ||
      !timestamp(root.startedAt) ||
      !timestamp(root.now) ||
      !oneOf(root.lifecycle, LIFECYCLES) ||
      typeof root.reducedMotion !== 'boolean'
    ) {
      throw new ContextJarvisGraphActivityError('invalid_input', 'root');
    }
    const startedAt = root.startedAt as number;
    const now = root.now as number;
    if (startedAt > now) {
      throw new ContextJarvisGraphActivityError('invalid_chronology', 'run');
    }
    const nodeInputs = dataArray(root.graphNodes, MAX_GRAPH_NODES);
    const edgeInputs = dataArray(root.graphEdges, MAX_GRAPH_EDGES);
    const bindingInputs = dataArray(root.bindings, MAX_BINDINGS);
    const pathInputs = dataArray(root.pathEvidence, MAX_PATH_EVIDENCE);
    if (!nodeInputs || !edgeInputs || !bindingInputs || !pathInputs) {
      throw new ContextJarvisGraphActivityError('invalid_input', 'collections');
    }
    const nodes = nodeInputs.map(graphNode);
    const edges = edgeInputs.map(graphEdge);
    const bindings = bindingInputs.map(binding);
    const paths = pathInputs.map(pathEvidence);
    const evidence = packEvidence(root.contextPackEvidence);
    const contextPack = evidence.contextPack;
    if (
      new Set(nodes.map(({ id: nodeId }) => nodeId)).size !== nodes.length ||
      new Set(edges.map(({ id: edgeId }) => edgeId)).size !== edges.length ||
      new Set(bindings.map(({ sourceId }) => sourceId)).size !== bindings.length ||
      new Set(paths.map(({ id: pathId }) => pathId)).size !== paths.length
    ) {
      throw new ContextJarvisGraphActivityError('duplicate_id');
    }
    if (
      evidence.accountId !== root.accountId ||
      evidence.mapId !== root.mapId ||
      evidence.runId !== root.runId ||
      nodes.some((node) => node.accountId !== root.accountId || node.mapId !== root.mapId) ||
      edges.some((edge) => edge.accountId !== root.accountId || edge.mapId !== root.mapId) ||
      bindings.some(
        (entry) =>
          entry.accountId !== root.accountId ||
          entry.mapId !== root.mapId ||
          entry.runId !== root.runId,
      ) ||
      paths.some(
        (path) =>
          path.accountId !== root.accountId ||
          path.mapId !== root.mapId ||
          path.runId !== root.runId,
      )
    ) {
      throw new ContextJarvisGraphActivityError('scope_mismatch');
    }
    if (
      evidence.retrievedAt < startedAt ||
      evidence.retrievedAt > now ||
      paths.some((path) => path.observedAt < startedAt || path.observedAt > now)
    ) {
      throw new ContextJarvisGraphActivityError('invalid_chronology');
    }

    const nodeIds = new Set(nodes.map(({ id: nodeId }) => nodeId));
    if (
      edges.some(
        ({ sourceNodeId, targetNodeId }) =>
          !nodeIds.has(sourceNodeId) || !nodeIds.has(targetNodeId),
      ) ||
      bindings.some(({ nodeId }) => !nodeIds.has(nodeId)) ||
      paths.some(
        ({ sourceNodeId, targetNodeId }) =>
          !nodeIds.has(sourceNodeId) || !nodeIds.has(targetNodeId),
      )
    ) {
      throw new ContextJarvisGraphActivityError('missing_node');
    }
    const edgesById = new Map(edges.map((edge) => [edge.id, edge]));
    for (const path of paths) {
      const edge = edgesById.get(path.id);
      if (!edge) {
        throw new ContextJarvisGraphActivityError('missing_edge', path.id);
      }
      if (edge.sourceNodeId !== path.sourceNodeId || edge.targetNodeId !== path.targetNodeId) {
        throw new ContextJarvisGraphActivityError('invalid_active_path', path.id);
      }
    }
    const bindingsBySource = new Map(bindings.map((entry) => [entry.sourceId, entry]));
    const usedByNode = new Map<
      string,
      { references: Map<string, JarvisSourceRef>; paths: Set<string> }
    >();
    for (const item of contextPack.items) {
      const mapped = bindingsBySource.get(item.source.id);
      if (!mapped) continue;
      const current = usedByNode.get(mapped.nodeId) ?? {
        references: new Map<string, JarvisSourceRef>(),
        paths: new Set<string>(),
      };
      current.references.set(item.source.id, item.source);
      current.paths.add(mapped.path);
      usedByNode.set(mapped.nodeId, current);
    }
    const usedNodeIds = new Set(usedByNode.keys());
    const usedNodes = [...usedByNode.entries()]
      .sort(([left], [right]) => compareIds(left, right))
      .map(([nodeId, evidence]) => ({
        nodeId,
        badge: 'Used by JARVIS' as const,
        sourceReferences: [...evidence.references.values()].sort((left, right) =>
          compareIds(left.id, right.id),
        ),
        sourcePaths: [...evidence.paths].sort(compareIds),
      }));
    const activePathIds =
      root.lifecycle === 'retrieving'
        ? paths
            .filter(
              (path) =>
                path.state === 'active' &&
                usedNodeIds.has(path.sourceNodeId) &&
                usedNodeIds.has(path.targetNodeId),
            )
            .map(({ id: pathId }) => pathId)
            .sort(compareIds)
        : [];
    if (typeof structuredClone !== 'function') {
      throw new ContextJarvisGraphActivityError('invalid_input', 'structured_clone_unavailable');
    }
    structuredClone(input);
    return detachedFreeze({
      version: 1 as const,
      accountId: root.accountId,
      mapId: root.mapId,
      runId: root.runId,
      lifecycle: root.lifecycle,
      activityEvent: {
        version: 1 as const,
        id: `context-used:${root.runId}`,
        kind: 'context_used' as const,
        accountId: root.accountId,
        mapId: root.mapId,
        runId: root.runId,
        occurredAt: evidence.retrievedAt,
        sourceIds: Array.from(new Set(contextPack.items.map(({ source }) => source.id))).sort(
          compareIds,
        ),
      },
      usedNodes,
      activePathIds,
      animateActivePaths:
        !root.reducedMotion && root.lifecycle === 'retrieving' && activePathIds.length > 0,
      inspection: {
        runId: root.runId,
        contextPack,
        sources: contextPack.items
          .map((item) => ({
            sourceId: item.source.id,
            label: item.source.label,
            excerpt: item.excerpt,
            freshness: item.freshness ?? 'unknown',
            removable: true as const,
          }))
          .sort((left, right) => compareIds(left.sourceId, right.sourceId)),
      },
    });
  } catch (error) {
    if (error instanceof ContextJarvisGraphActivityError) throw error;
    throw new ContextJarvisGraphActivityError('invalid_input', 'unreadable');
  }
}

export interface ContextJarvisRetrievalReceiptV1 {
  version: 1;
  id: string;
}

export interface ContextJarvisRemovalGrantV1 {
  version: 1;
  id: string;
}

export interface ContextJarvisRetryAuthority {
  recordRetrieval(input: {
    runId: string;
    request: ContextRetrievalRequest;
    result: ContextRetrievalResult;
  }): DeepReadonly<ContextJarvisRetrievalReceiptV1>;
  authorizeRemoval(input: {
    receipt: DeepReadonly<ContextJarvisRetrievalReceiptV1>;
    removedItemId: string;
    requestedAt: number;
  }): DeepReadonly<ContextJarvisRemovalGrantV1>;
}

export interface ContextJarvisSourceRetryInputV1 {
  version: 1;
  authority: ContextJarvisRetryAuthority;
  receipt: DeepReadonly<ContextJarvisRetrievalReceiptV1>;
  removalGrant: DeepReadonly<ContextJarvisRemovalGrantV1>;
}

export interface ContextJarvisSourceRetryPlanV1 {
  version: 1;
  runId: string;
  priorQueryId: string;
  removedItemId: string;
  removedSourceId: string;
  excludedItemIds: string[];
  excludedSourceIds: string[];
  retainedItemIds: string[];
  retryReason: 'user_removed_context_source';
  requestedAt: number;
  request: ContextRetrievalRequest;
}

function prose(value: unknown, maximum: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximum &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u206f\ufeff]/u.test(
      value,
    )
  );
}

function singleLineProse(value: unknown, maximum: number): value is string {
  return prose(value, maximum) && !/[\r\n\u2028\u2029]/u.test(value);
}

function copiedIds(value: unknown, maximum: number): string[] | undefined {
  if (value === undefined) return undefined;
  const values = dataArray(value, maximum);
  if (!values || values.some((entry) => !id(entry)) || new Set(values).size !== values.length) {
    throw new ContextJarvisGraphActivityError('invalid_input', 'request_ids');
  }
  return values as string[];
}

function copyRetryRequest(value: unknown): ContextRetrievalRequest {
  const record = dataRecord(value);
  const allowed = [
    'projectId',
    'chatId',
    'terminalSessionId',
    'agentSlug',
    'userText',
    'explicitMapIds',
    'explicitEntityIds',
    'selectedSkillIds',
    'preferredSourceKinds',
    'maxTokens',
    'requireFresh',
  ];
  if (
    !record ||
    Object.keys(record).some((key) => !allowed.includes(key)) ||
    !Object.hasOwn(record, 'projectId') ||
    !Object.hasOwn(record, 'userText') ||
    !Object.hasOwn(record, 'maxTokens') ||
    (record.projectId !== null && !id(record.projectId)) ||
    !prose(record.userText, 32_768) ||
    !Number.isSafeInteger(record.maxTokens) ||
    (record.maxTokens as number) < 1 ||
    (record.maxTokens as number) > 32_768 ||
    (record.requireFresh !== undefined && typeof record.requireFresh !== 'boolean')
  ) {
    throw new ContextJarvisGraphActivityError('invalid_input', 'request');
  }
  for (const key of ['chatId', 'terminalSessionId', 'agentSlug'] as const) {
    if (record[key] !== undefined && !id(record[key])) {
      throw new ContextJarvisGraphActivityError('invalid_input', key);
    }
  }
  const explicitMapIds = copiedIds(record.explicitMapIds, 200);
  const explicitEntityIds = copiedIds(record.explicitEntityIds, 200);
  const selectedSkillIds = copiedIds(record.selectedSkillIds, 200);
  const preferredSourceKinds = copiedIds(record.preferredSourceKinds, 20);
  return {
    projectId: record.projectId as string | null,
    ...(record.chatId === undefined ? {} : { chatId: record.chatId as string }),
    ...(record.terminalSessionId === undefined
      ? {}
      : { terminalSessionId: record.terminalSessionId as string }),
    ...(record.agentSlug === undefined ? {} : { agentSlug: record.agentSlug as string }),
    userText: record.userText,
    ...(explicitMapIds === undefined ? {} : { explicitMapIds }),
    ...(explicitEntityIds === undefined ? {} : { explicitEntityIds }),
    ...(selectedSkillIds === undefined ? {} : { selectedSkillIds }),
    ...(preferredSourceKinds === undefined
      ? {}
      : {
          preferredSourceKinds:
            preferredSourceKinds as ContextRetrievalRequest['preferredSourceKinds'],
        }),
    maxTokens: record.maxTokens as number,
    ...(record.requireFresh === undefined ? {} : { requireFresh: record.requireFresh as boolean }),
  };
}

function validatedRetryResult(value: unknown): {
  queryId: string;
  builtAt: number;
  itemRefs: Array<{ id: string; sourceId: string }>;
} {
  const result = dataRecord(value);
  if (
    !result ||
    !exactKeys(result, [
      'queryId',
      'mapRevisions',
      'items',
      'relatedEntities',
      'omittedCount',
      'staleItems',
      'warnings',
      'builtAt',
    ]) ||
    !id(result.queryId) ||
    !timestamp(result.builtAt)
  ) {
    throw new ContextJarvisGraphActivityError('invalid_input', 'retry_result');
  }
  const items = dataArray(result.items, MAX_RETRY_ITEMS);
  if (!items) throw new ContextJarvisGraphActivityError('invalid_input', 'retry_items');
  const itemRefs = items.map((value) => {
    const item = dataRecord(value);
    if (!item || !id(item.id) || !id(item.sourceId)) {
      throw new ContextJarvisGraphActivityError('invalid_input', 'retry_item');
    }
    return { id: item.id, sourceId: item.sourceId };
  });
  if (new Set(itemRefs.map(({ id: itemId }) => itemId)).size !== itemRefs.length) {
    throw new ContextJarvisGraphActivityError('duplicate_id', 'retry_item');
  }
  return { queryId: result.queryId, builtAt: result.builtAt, itemRefs };
}

/**
 * Create a host-owned authority. Keep this object in the trusted UI controller
 * and invoke authorizeRemoval only from a direct source-chip removal event.
 */
export function createContextJarvisRetryAuthority(): ContextJarvisRetryAuthority {
  let ordinal = 0;
  const authority: ContextJarvisRetryAuthority = Object.freeze({
    recordRetrieval(input: Parameters<ContextJarvisRetryAuthority['recordRetrieval']>[0]) {
      const root = dataRecord(input);
      if (!root || !exactKeys(root, ['runId', 'request', 'result']) || !id(root.runId)) {
        throw new ContextJarvisGraphActivityError('invalid_input', 'retrieval_receipt');
      }
      const receipt = Object.freeze({
        version: 1 as const,
        id: `retrieval-receipt-${++ordinal}`,
      });
      RETRIEVAL_RECEIPTS.set(receipt, {
        authority: authority as object,
        runId: root.runId,
        request: detachedFreeze(copyRetryRequest(root.request)) as ContextRetrievalRequest,
        result: validatedRetryResult(root.result),
      });
      return receipt;
    },
    authorizeRemoval(input: Parameters<ContextJarvisRetryAuthority['authorizeRemoval']>[0]) {
      const root = dataRecord(input);
      if (
        !root ||
        !exactKeys(root, ['receipt', 'removedItemId', 'requestedAt']) ||
        !id(root.removedItemId) ||
        !timestamp(root.requestedAt)
      ) {
        throw new ContextJarvisGraphActivityError('invalid_input', 'removal_grant');
      }
      const evidence =
        root.receipt && typeof root.receipt === 'object'
          ? RETRIEVAL_RECEIPTS.get(root.receipt as object)
          : undefined;
      if (!evidence || evidence.authority !== authority) {
        throw new ContextJarvisGraphActivityError('invalid_input', 'retrieval_receipt');
      }
      if ((root.requestedAt as number) < evidence.result.builtAt) {
        throw new ContextJarvisGraphActivityError('invalid_chronology', 'retry');
      }
      if (!evidence.result.itemRefs.some(({ id: itemId }) => itemId === root.removedItemId)) {
        throw new ContextJarvisGraphActivityError('invalid_input', 'removed_item');
      }
      const grant = Object.freeze({
        version: 1 as const,
        id: `source-removal-${++ordinal}`,
      });
      REMOVAL_GRANTS.set(grant, {
        authority: authority as object,
        receipt: root.receipt as object,
        removedItemId: root.removedItemId,
        requestedAt: root.requestedAt,
      });
      return grant;
    },
  });
  RETRY_AUTHORITIES.add(authority as object);
  return authority;
}

export function planContextJarvisSourceRetry(
  input: ContextJarvisSourceRetryInputV1,
): DeepReadonly<ContextJarvisSourceRetryPlanV1> {
  const root = dataRecord(input);
  if (
    !root ||
    !exactKeys(root, ['version', 'authority', 'receipt', 'removalGrant']) ||
    root.version !== 1
  ) {
    throw new ContextJarvisGraphActivityError('invalid_input', 'retry');
  }
  const authority =
    root.authority && typeof root.authority === 'object'
      ? (root.authority as ContextJarvisRetryAuthority)
      : null;
  const receiptEvidence =
    root.receipt && typeof root.receipt === 'object'
      ? RETRIEVAL_RECEIPTS.get(root.receipt as object)
      : undefined;
  const grant =
    root.removalGrant && typeof root.removalGrant === 'object'
      ? REMOVAL_GRANTS.get(root.removalGrant as object)
      : undefined;
  if (
    !authority ||
    !RETRY_AUTHORITIES.has(authority as object) ||
    !receiptEvidence ||
    receiptEvidence.authority !== authority ||
    !grant ||
    grant.authority !== authority ||
    grant.receipt !== root.receipt
  ) {
    throw new ContextJarvisGraphActivityError('invalid_input', 'retry_authority');
  }
  const { itemRefs } = receiptEvidence.result;
  const removed = itemRefs.find(({ id: itemId }) => itemId === grant.removedItemId);
  if (!removed) throw new ContextJarvisGraphActivityError('invalid_input', 'removed_item');
  const plan = detachedFreeze({
    version: 1 as const,
    runId: receiptEvidence.runId,
    priorQueryId: receiptEvidence.result.queryId,
    removedItemId: removed.id,
    removedSourceId: removed.sourceId,
    excludedItemIds: [removed.id],
    excludedSourceIds: [removed.sourceId],
    retainedItemIds: itemRefs
      .filter(({ id: itemId }) => itemId !== removed.id)
      .map(({ id: itemId }) => itemId)
      .sort(compareIds),
    retryReason: 'user_removed_context_source' as const,
    requestedAt: grant.requestedAt,
    request: receiptEvidence.request,
  });
  RETRY_PLAN_BRAND.add(plan as object);
  return plan;
}

export function applyContextJarvisSourceRetry<T extends Readonly<{ id: string; sourceId: string }>>(
  plan: DeepReadonly<ContextJarvisSourceRetryPlanV1>,
  candidates: readonly T[],
): readonly DeepReadonly<T>[] {
  if (!plan || typeof plan !== 'object' || !RETRY_PLAN_BRAND.has(plan as object)) {
    throw new ContextJarvisGraphActivityError('invalid_input', 'retry_plan');
  }
  const values = dataArray(candidates, MAX_RETRY_ITEMS);
  if (!values) throw new ContextJarvisGraphActivityError('invalid_input', 'retry_candidates');
  const excludedItems = new Set(plan.excludedItemIds);
  const excludedSources = new Set(plan.excludedSourceIds);
  const retained = values.map((value) => {
    const record = dataRecord(value);
    if (!record || !id(record.id) || !id(record.sourceId)) {
      throw new ContextJarvisGraphActivityError('invalid_input', 'retry_candidate');
    }
    return value as T;
  });
  return detachedFreeze(
    retained.filter(
      ({ id: itemId, sourceId }) => !excludedItems.has(itemId) && !excludedSources.has(sourceId),
    ),
  );
}

export interface ContextJarvisDeliveryInputV1 {
  version: 1;
  surface: 'written' | 'voice';
  visualText: string;
  spokenSentences?: string[];
  citationDetailGrant?: DeepReadonly<ContextJarvisVoiceCitationGrantV1>;
  items: RetrievedContextItem[];
}

export interface ContextJarvisVoiceCitationGrantV1 {
  version: 1;
  id: string;
}

export interface ContextJarvisVoiceCitationAuthority {
  authorizeCitationDetails(input: {
    itemIds: string[];
  }): DeepReadonly<ContextJarvisVoiceCitationGrantV1>;
}

export interface ContextJarvisSourceChipV1 {
  itemId: string;
  label: string;
  freshness: 'current' | 'stale' | 'unknown';
  action: RetrievedContextCitation['action'];
}

/**
 * Host-owned direct-user authority. Do not expose it to models, tools, or
 * provider output; only the transcript UI's explicit citation request uses it.
 */
export function createContextJarvisVoiceCitationAuthority(): ContextJarvisVoiceCitationAuthority {
  let ordinal = 0;
  const authority: ContextJarvisVoiceCitationAuthority = Object.freeze({
    authorizeCitationDetails(
      input: Parameters<ContextJarvisVoiceCitationAuthority['authorizeCitationDetails']>[0],
    ) {
      const root = dataRecord(input);
      if (!root || !exactKeys(root, ['itemIds'])) {
        throw new ContextJarvisGraphActivityError('invalid_input', 'voice_citation_grant');
      }
      const itemIds = copiedIds(root.itemIds, MAX_RETRY_ITEMS);
      if (!itemIds || itemIds.length === 0) {
        throw new ContextJarvisGraphActivityError('invalid_input', 'voice_citation_items');
      }
      const grant = Object.freeze({
        version: 1 as const,
        id: `voice-citation-${++ordinal}`,
      });
      VOICE_CITATION_GRANTS.set(grant, {
        authority: authority as object,
        itemIds: [...itemIds].sort(compareIds),
      });
      return grant;
    },
  });
  VOICE_CITATION_AUTHORITIES.add(authority as object);
  return authority;
}

function sourceChip(value: unknown): ContextJarvisSourceChipV1 {
  const item = dataRecord(value);
  const entity = item ? dataRecord(item.entity) : null;
  const citation = item ? dataRecord(item.citation) : null;
  const action = citation ? dataRecord(citation.action) : null;
  const expectedLabel =
    entity && typeof entity.label === 'string'
      ? entity.lineStart === undefined
        ? entity.label
        : entity.lineEnd === undefined || entity.lineEnd === entity.lineStart
          ? `${entity.label} line ${entity.lineStart}`
          : `${entity.label} lines ${entity.lineStart}\u2013${entity.lineEnd}`
      : null;
  const expectedActionKind =
    item?.sourceKind === 'github_repository' ? 'open_source' : 'highlight_entity';
  if (
    !item ||
    !id(item.id) ||
    !id(item.mapId) ||
    !id(item.sourceId) ||
    !oneOf(item.sourceKind, CONTEXT_SOURCE_KINDS) ||
    !oneOf(item.freshness, ['current', 'stale', 'unknown'] as const) ||
    !entity ||
    !id(entity.entityId) ||
    !id(entity.sourceId) ||
    entity.sourceId !== item.sourceId ||
    !singleLineProse(entity.label, 500) ||
    (entity.path !== undefined && !portablePath(entity.path)) ||
    ((entity.lineStart !== undefined || entity.lineEnd !== undefined) &&
      entity.path === undefined) ||
    (entity.lineEnd !== undefined && entity.lineStart === undefined) ||
    (entity.lineStart !== undefined &&
      (!Number.isSafeInteger(entity.lineStart) || (entity.lineStart as number) < 1)) ||
    (entity.lineEnd !== undefined &&
      (!Number.isSafeInteger(entity.lineEnd) ||
        (entity.lineEnd as number) < ((entity.lineStart as number | undefined) ?? 1))) ||
    !citation ||
    !exactKeys(citation, ['label', 'action']) ||
    !singleLineProse(citation.label, 500) ||
    citation.label !== expectedLabel ||
    !action ||
    action.kind !== expectedActionKind ||
    action.sourceKind !== item.sourceKind ||
    action.mapId !== item.mapId ||
    action.entityId !== entity.entityId ||
    action.path !== entity.path ||
    action.lineStart !== entity.lineStart ||
    action.lineEnd !== entity.lineEnd
  ) {
    throw new ContextJarvisGraphActivityError('invalid_input', 'delivery_item');
  }
  return {
    itemId: item.id,
    label: citation.label,
    freshness: item.freshness,
    action: {
      kind: action.kind as RetrievedContextCitation['action']['kind'],
      sourceKind: action.sourceKind as RetrievedContextCitation['action']['sourceKind'],
      mapId: action.mapId,
      entityId: action.entityId,
      ...(action.path === undefined ? {} : { path: action.path as string }),
      ...(action.lineStart === undefined ? {} : { lineStart: action.lineStart as number }),
      ...(action.lineEnd === undefined ? {} : { lineEnd: action.lineEnd as number }),
    },
  };
}

function normalizedLeakText(value: string): string {
  return value.normalize('NFKC').replaceAll('\\', '/').toLocaleLowerCase('en-US');
}

function forbiddenCitationTokens(chip: ContextJarvisSourceChipV1): string[] {
  const values = [chip.label, chip.action.path ?? ''];
  if (chip.action.path) values.push(chip.action.path.split('/').at(-1) ?? '');
  const labelHead = chip.label.replace(/\s+lines?\s+\d+(?:\u2013\d+)?$/u, '');
  values.push(labelHead);
  return Array.from(new Set(values.map(normalizedLeakText).filter((value) => value.length > 0)));
}

function escapedRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function containsBoundedCitation(value: string, citation: string): boolean {
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}_])${escapedRegex(citation)}(?=$|[^\\p{L}\\p{N}_])`,
    'u',
  ).test(value);
}

function conciseVoiceSentences(value: unknown): string[] {
  const sentences = dataArray(value, 2);
  if (!sentences || sentences.length === 0) {
    throw new ContextJarvisGraphActivityError('invalid_input', 'voice_conciseness');
  }
  const output = sentences.map((sentence) => {
    if (!prose(sentence, MAX_VOICE_CHARS) || /[\r\n]/u.test(sentence)) {
      throw new ContextJarvisGraphActivityError('invalid_input', 'voice_conciseness');
    }
    const terminators = [...sentence.matchAll(/[!?\u3002\uff01\uff1f]|\.(?=$|\s|[A-Z])/gu)];
    if (
      terminators.length > 1 ||
      (terminators.length === 1 && terminators[0]!.index !== sentence.length - 1)
    ) {
      throw new ContextJarvisGraphActivityError('invalid_input', 'voice_conciseness');
    }
    return sentence;
  });
  if (output.join(' ').length > MAX_VOICE_CHARS) {
    throw new ContextJarvisGraphActivityError('invalid_input', 'voice_conciseness');
  }
  return output;
}

export function buildContextJarvisDelivery(input: ContextJarvisDeliveryInputV1): DeepReadonly<{
  version: 1;
  surface: 'written' | 'voice';
  visualTranscript: {
    text: string;
    sourceChips: ContextJarvisSourceChipV1[];
  };
  spokenText: string | null;
  spokenCitationLabels: string[];
}> {
  const root = dataRecord(input);
  const deliveryKeys = [
    'version',
    'surface',
    'visualText',
    'spokenSentences',
    'citationDetailGrant',
    'items',
  ];
  if (
    !root ||
    Object.keys(root).some((key) => !deliveryKeys.includes(key)) ||
    !['version', 'surface', 'visualText', 'items'].every((key) => Object.hasOwn(root, key)) ||
    root.version !== 1 ||
    !oneOf(root.surface, ['written', 'voice'] as const) ||
    !prose(root.visualText, 64_000)
  ) {
    throw new ContextJarvisGraphActivityError('invalid_input', 'delivery');
  }
  const itemValues = dataArray(root.items, MAX_RETRY_ITEMS);
  if (!itemValues) throw new ContextJarvisGraphActivityError('invalid_input', 'delivery_items');
  const sourceChips = itemValues.map(sourceChip);
  const itemIds = sourceChips.map(({ itemId }) => itemId).sort(compareIds);
  const citationGrant =
    root.citationDetailGrant && typeof root.citationDetailGrant === 'object'
      ? VOICE_CITATION_GRANTS.get(root.citationDetailGrant as object)
      : undefined;
  if (
    root.citationDetailGrant !== undefined &&
    (!citationGrant ||
      !VOICE_CITATION_AUTHORITIES.has(citationGrant.authority) ||
      citationGrant.itemIds.length !== itemIds.length ||
      citationGrant.itemIds.some((itemId, index) => itemId !== itemIds[index]))
  ) {
    throw new ContextJarvisGraphActivityError('invalid_input', 'voice_citation_grant');
  }
  let spokenText: string | null = null;
  if (root.surface === 'voice') {
    const sentences = conciseVoiceSentences(root.spokenSentences);
    const normalizedSpoken = normalizedLeakText(sentences.join(' '));
    if (
      !citationGrant &&
      sourceChips.some((chip) =>
        forbiddenCitationTokens(chip).some((token) =>
          containsBoundedCitation(normalizedSpoken, token),
        ),
      )
    ) {
      throw new ContextJarvisGraphActivityError('invalid_input', 'unrequested_spoken_citation');
    }
    spokenText = sentences.join(' ');
  } else if (root.spokenSentences !== undefined || root.citationDetailGrant !== undefined) {
    throw new ContextJarvisGraphActivityError('invalid_input', 'written_spoken_text');
  }
  return detachedFreeze({
    version: 1 as const,
    surface: root.surface,
    visualTranscript: {
      text: root.visualText,
      sourceChips,
    },
    spokenText,
    spokenCitationLabels:
      root.surface === 'voice' && citationGrant ? sourceChips.map(({ label }) => label) : [],
  });
}
