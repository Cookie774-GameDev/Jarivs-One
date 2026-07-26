import {
  validateJarvisContextPack,
  type JarvisContextPack,
  type JarvisSourceRef,
} from '@/lib/jarvis/contracts';
import type { DeepReadonly } from './contracts';

const MAX_BINDINGS = 1_000;
const MAX_GRAPH_NODES = 10_000;
const MAX_GRAPH_EDGES = 50_000;
const MAX_PATH_EVIDENCE = 2_000;
const MAX_PACK_ITEMS = 500;
const MAX_PACK_EXCLUSIONS = 1_000;
const MAX_TIMESTAMP = 8_640_000_000_000_000;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,199}$/;
const UNSAFE_TEXT_CONTROLS =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u206f\ufeff]/u;

const LIFECYCLES = ['retrieving', 'running', 'completed', 'cancelled', 'failed'] as const;
const PATH_STATES = ['active', 'observed'] as const;

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
    !Number.isSafeInteger(pack.budget.usedChars) ||
    pack.budget.usedChars < 0 ||
    pack.budget.usedChars > pack.budget.maxChars ||
    pack.items.some(({ source }) => source.accountId !== accountId) ||
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
      usedNodes,
      activePathIds,
      animateActivePaths:
        !root.reducedMotion && root.lifecycle === 'retrieving' && activePathIds.length > 0,
      inspection: {
        runId: root.runId,
        contextPack,
      },
    });
  } catch (error) {
    if (error instanceof ContextJarvisGraphActivityError) throw error;
    throw new ContextJarvisGraphActivityError('invalid_input', 'unreadable');
  }
}
