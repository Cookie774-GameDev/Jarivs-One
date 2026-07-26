const MAX_NODES = 100_000;
const MAX_EDGES = 500_000;
const MAX_LAYOUT_NODES = 100_000;
const MAX_COORDINATE = 1_000_000_000;
const MAX_DIMENSION = 1_000_000;
const MIN_CELL_SIZE = 1;
const MAX_CELL_SIZE = 65_536;
const MAX_NODE_CELLS = 4_096;
const MAX_QUERY_CELLS = 100_000;
const MAX_VISIBLE_NODES = 10_000;
const MAX_VISIBLE_EDGES = 20_000;
const MAX_QUERY_NODE_SCANS = 100_000;
const MAX_QUERY_EDGE_SCANS = 250_000;
const SAFE_ID = /^[A-Za-z0-9_][A-Za-z0-9._:/@-]{0,199}$/;

export interface ContextGraphPerformanceNode {
  id: string;
  x: number;
  y: number;
  radius: number;
}

export interface ContextGraphPerformanceEdge {
  id: string;
  sourceId: string;
  targetId: string;
}

export interface ContextGraphPerformancePatch {
  revision: number;
  upsertNodes: ContextGraphPerformanceNode[];
  removeNodeIds: string[];
  upsertEdges: ContextGraphPerformanceEdge[];
  removeEdgeIds: string[];
}

export interface ContextGraphViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ContextGraphLayoutNode {
  id: string;
  parentId: string | null;
  depth: number;
  order: number;
  radius: number;
}

export interface ContextGraphLayoutRequest {
  version: 1;
  requestId: number;
  width: number;
  height: number;
  nodes: ContextGraphLayoutNode[];
}

export interface ContextGraphLayoutResultNode {
  id: string;
  x: number;
  y: number;
}

export interface ContextGraphLayoutResult {
  version: 1;
  requestId: number;
  nodes: ContextGraphLayoutResultNode[];
}

export interface ContextGraphLayoutWorker {
  postMessage(message: ContextGraphLayoutRequest): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  addEventListener(type: 'error' | 'messageerror', listener: (event: Event) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: 'error' | 'messageerror', listener: (event: Event) => void): void;
  terminate(): void;
}

export function createContextGraphLayoutWorker(): ContextGraphLayoutWorker {
  if (typeof Worker !== 'function') {
    throw new ContextGraphPerformanceError('worker_failed', 'unavailable');
  }
  return new Worker(new URL('./graphLayout.worker.ts', import.meta.url), {
    type: 'module',
    name: 'vibespace-context-graph-layout',
  }) as ContextGraphLayoutWorker;
}

export type ContextGraphPerformanceErrorCode =
  | 'invalid_input'
  | 'too_many_items'
  | 'duplicate_id'
  | 'dangling_edge'
  | 'stale_revision'
  | 'superseded'
  | 'disposed'
  | 'worker_failed';

export class ContextGraphPerformanceError extends Error {
  constructor(
    readonly code: ContextGraphPerformanceErrorCode,
    readonly detail?: string,
  ) {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'ContextGraphPerformanceError';
  }
}

function record(value: unknown): Record<string, unknown> | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    if (Reflect.ownKeys(value).some((key) => typeof key !== 'string')) return null;
    const output: Record<string, unknown> = Object.create(null);
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) return null;
      output[key] = descriptor.value;
    }
    return output;
  } catch {
    return null;
  }
}

function array(value: unknown, maximum: number): readonly unknown[] | null {
  try {
    if (!Array.isArray(value)) return null;
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
    if (length > maximum) throw new ContextGraphPerformanceError('too_many_items');
    if (
      Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Reflect.ownKeys(value).length !== length + 1
    ) {
      return null;
    }
    const output: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) return null;
      output.push(descriptor.value);
    }
    return output;
  } catch (error) {
    if (error instanceof ContextGraphPerformanceError) throw error;
    return null;
  }
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function id(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ID.test(value);
}

function finite(value: unknown, maximum = MAX_COORDINATE): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= maximum;
}

function positive(value: unknown, maximum = MAX_DIMENSION): value is number {
  return finite(value, maximum) && value > 0;
}

function nonNegativeInteger(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= maximum;
}

function cloneable(value: unknown): void {
  if (typeof structuredClone !== 'function') {
    throw new ContextGraphPerformanceError('invalid_input', 'structured_clone_unavailable');
  }
  try {
    structuredClone(value);
  } catch {
    throw new ContextGraphPerformanceError('invalid_input', 'uncloneable');
  }
}

function parseNode(value: unknown): Readonly<ContextGraphPerformanceNode> {
  const input = record(value);
  if (
    !input ||
    !exactKeys(input, ['id', 'x', 'y', 'radius']) ||
    !id(input.id) ||
    !finite(input.x) ||
    !finite(input.y) ||
    !positive(input.radius)
  ) {
    throw new ContextGraphPerformanceError('invalid_input', 'node');
  }
  return Object.freeze({
    id: input.id,
    x: input.x,
    y: input.y,
    radius: input.radius,
  });
}

function parseEdge(value: unknown): Readonly<ContextGraphPerformanceEdge> {
  const input = record(value);
  if (
    !input ||
    !exactKeys(input, ['id', 'sourceId', 'targetId']) ||
    !id(input.id) ||
    !id(input.sourceId) ||
    !id(input.targetId) ||
    input.sourceId === input.targetId
  ) {
    throw new ContextGraphPerformanceError('invalid_input', 'edge');
  }
  return Object.freeze({
    id: input.id,
    sourceId: input.sourceId,
    targetId: input.targetId,
  });
}

function parseIds(value: unknown, maximum: number): string[] {
  const input = array(value, maximum);
  if (!input || input.some((entry) => !id(entry))) {
    throw new ContextGraphPerformanceError('invalid_input', 'ids');
  }
  const output = input as string[];
  if (new Set(output).size !== output.length) {
    throw new ContextGraphPerformanceError('duplicate_id', 'ids');
  }
  return output;
}

function parseNodes(value: unknown): Readonly<ContextGraphPerformanceNode>[] {
  const input = array(value, MAX_NODES);
  if (!input) throw new ContextGraphPerformanceError('invalid_input', 'nodes');
  const output = input.map(parseNode);
  if (new Set(output.map(({ id: nodeId }) => nodeId)).size !== output.length) {
    throw new ContextGraphPerformanceError('duplicate_id', 'node');
  }
  return output;
}

function parseEdges(value: unknown): Readonly<ContextGraphPerformanceEdge>[] {
  const input = array(value, MAX_EDGES);
  if (!input) throw new ContextGraphPerformanceError('invalid_input', 'edges');
  const output = input.map(parseEdge);
  if (new Set(output.map(({ id: edgeId }) => edgeId)).size !== output.length) {
    throw new ContextGraphPerformanceError('duplicate_id', 'edge');
  }
  return output;
}

function compareIds(left: { id: string }, right: { id: string }): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function cellKey(x: number, y: number): string {
  return `${x}:${y}`;
}

function cellRange(
  node: Readonly<ContextGraphPerformanceNode>,
  cellSize: number,
): [number, number, number, number] {
  return [
    Math.floor((node.x - node.radius) / cellSize),
    Math.floor((node.x + node.radius) / cellSize),
    Math.floor((node.y - node.radius) / cellSize),
    Math.floor((node.y + node.radius) / cellSize),
  ];
}

function assertBoundedCellCoverage(
  node: Readonly<ContextGraphPerformanceNode>,
  cellSize: number,
): void {
  const [minX, maxX, minY, maxY] = cellRange(node, cellSize);
  const cellCount = (maxX - minX + 1) * (maxY - minY + 1);
  if (!Number.isSafeInteger(cellCount) || cellCount > MAX_NODE_CELLS) {
    throw new ContextGraphPerformanceError('too_many_items', 'node_cells');
  }
}

export class ContextGraphPerformanceIndex {
  readonly #cellSize: number;
  readonly #nodes = new Map<string, Readonly<ContextGraphPerformanceNode>>();
  readonly #edges = new Map<string, Readonly<ContextGraphPerformanceEdge>>();
  readonly #cells = new Map<string, Set<string>>();
  readonly #incidentEdges = new Map<string, Set<string>>();
  #revision = 0;

  constructor(input: {
    nodes: ContextGraphPerformanceNode[];
    edges: ContextGraphPerformanceEdge[];
    cellSize: number;
  }) {
    try {
      const root = record(input);
      if (
        !root ||
        !exactKeys(root, ['nodes', 'edges', 'cellSize']) ||
        !positive(root.cellSize, MAX_CELL_SIZE) ||
        root.cellSize < MIN_CELL_SIZE
      ) {
        throw new ContextGraphPerformanceError('invalid_input', 'root');
      }
      const nodes = parseNodes(root.nodes);
      const edges = parseEdges(root.edges);
      nodes.forEach((node) => assertBoundedCellCoverage(node, root.cellSize as number));
      const nodeIds = new Set(nodes.map(({ id: nodeId }) => nodeId));
      if (
        edges.some(({ sourceId, targetId }) => !nodeIds.has(sourceId) || !nodeIds.has(targetId))
      ) {
        throw new ContextGraphPerformanceError('dangling_edge');
      }
      cloneable(input);
      this.#cellSize = root.cellSize;
      for (const node of nodes) {
        this.#nodes.set(node.id, node);
        this.#addNodeToCells(node);
      }
      for (const edge of edges) {
        this.#edges.set(edge.id, edge);
        this.#addIncident(edge);
      }
    } catch (error) {
      if (error instanceof ContextGraphPerformanceError) throw error;
      throw new ContextGraphPerformanceError('invalid_input', 'unreadable');
    }
  }

  #addNodeToCells(node: Readonly<ContextGraphPerformanceNode>): void {
    const [minX, maxX, minY, maxY] = cellRange(node, this.#cellSize);
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        const key = cellKey(x, y);
        const ids = this.#cells.get(key) ?? new Set<string>();
        ids.add(node.id);
        this.#cells.set(key, ids);
      }
    }
  }

  #removeNodeFromCells(node: Readonly<ContextGraphPerformanceNode>): void {
    const [minX, maxX, minY, maxY] = cellRange(node, this.#cellSize);
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        const key = cellKey(x, y);
        const ids = this.#cells.get(key);
        ids?.delete(node.id);
        if (ids?.size === 0) this.#cells.delete(key);
      }
    }
  }

  #addIncident(edge: Readonly<ContextGraphPerformanceEdge>): void {
    for (const nodeId of [edge.sourceId, edge.targetId]) {
      const ids = this.#incidentEdges.get(nodeId) ?? new Set<string>();
      ids.add(edge.id);
      this.#incidentEdges.set(nodeId, ids);
    }
  }

  #removeIncident(edge: Readonly<ContextGraphPerformanceEdge>): void {
    for (const nodeId of [edge.sourceId, edge.targetId]) {
      const ids = this.#incidentEdges.get(nodeId);
      ids?.delete(edge.id);
      if (ids?.size === 0) this.#incidentEdges.delete(nodeId);
    }
  }

  query(
    viewport: ContextGraphViewport,
    overscan: number,
  ): Readonly<{
    revision: number;
    nodes: readonly Readonly<ContextGraphPerformanceNode>[];
    edges: readonly Readonly<ContextGraphPerformanceEdge>[];
    truncated: boolean;
  }> {
    const input = record(viewport);
    if (
      !input ||
      !exactKeys(input, ['x', 'y', 'width', 'height']) ||
      !finite(input.x) ||
      !finite(input.y) ||
      !positive(input.width) ||
      !positive(input.height) ||
      !finite(overscan, MAX_DIMENSION) ||
      overscan < 0
    ) {
      throw new ContextGraphPerformanceError('invalid_input', 'viewport');
    }
    const minX = input.x - overscan;
    const maxX = input.x + input.width + overscan;
    const minY = input.y - overscan;
    const maxY = input.y + input.height + overscan;
    const minCellX = Math.floor(minX / this.#cellSize);
    const maxCellX = Math.floor(maxX / this.#cellSize);
    const minCellY = Math.floor(minY / this.#cellSize);
    const maxCellY = Math.floor(maxY / this.#cellSize);
    const cellCount = (maxCellX - minCellX + 1) * (maxCellY - minCellY + 1);
    if (!Number.isSafeInteger(cellCount) || cellCount > MAX_QUERY_CELLS) {
      throw new ContextGraphPerformanceError('too_many_items', 'viewport_cells');
    }
    const candidateIds = new Set<string>();
    const nodes: Readonly<ContextGraphPerformanceNode>[] = [];
    let nodeScans = 0;
    let truncated = false;
    collectCandidates: for (let x = minCellX; x <= maxCellX; x += 1) {
      for (let y = minCellY; y <= maxCellY; y += 1) {
        for (const nodeId of this.#cells.get(cellKey(x, y)) ?? []) {
          if (candidateIds.has(nodeId)) continue;
          candidateIds.add(nodeId);
          nodeScans += 1;
          if (nodeScans > MAX_QUERY_NODE_SCANS) {
            truncated = true;
            break collectCandidates;
          }
          const node = this.#nodes.get(nodeId)!;
          if (
            node.x + node.radius >= minX &&
            node.x - node.radius <= maxX &&
            node.y + node.radius >= minY &&
            node.y - node.radius <= maxY
          ) {
            nodes.push(node);
            if (nodes.length >= MAX_VISIBLE_NODES) {
              truncated = true;
              break collectCandidates;
            }
          }
        }
      }
    }
    nodes.sort(compareIds);
    const visibleIds = new Set(nodes.map(({ id: nodeId }) => nodeId));
    const edgeIds = new Set<string>();
    const edges: Readonly<ContextGraphPerformanceEdge>[] = [];
    let edgeScans = 0;
    collectEdges: for (const nodeId of visibleIds) {
      for (const edgeId of this.#incidentEdges.get(nodeId) ?? []) {
        if (edgeIds.has(edgeId)) continue;
        edgeIds.add(edgeId);
        edgeScans += 1;
        if (edgeScans > MAX_QUERY_EDGE_SCANS) {
          truncated = true;
          break collectEdges;
        }
        const edge = this.#edges.get(edgeId)!;
        if (visibleIds.has(edge.sourceId) && visibleIds.has(edge.targetId)) {
          edges.push(edge);
          if (edges.length >= MAX_VISIBLE_EDGES) {
            truncated = true;
            break collectEdges;
          }
        }
      }
    }
    edges.sort(compareIds);
    return Object.freeze({
      revision: this.#revision,
      nodes: Object.freeze(nodes),
      edges: Object.freeze(edges),
      truncated,
    });
  }

  applyPatch(patch: ContextGraphPerformancePatch): void {
    try {
      const root = record(patch);
      if (
        !root ||
        !exactKeys(root, [
          'revision',
          'upsertNodes',
          'removeNodeIds',
          'upsertEdges',
          'removeEdgeIds',
        ]) ||
        !nonNegativeInteger(root.revision) ||
        root.revision !== this.#revision + 1
      ) {
        throw new ContextGraphPerformanceError('stale_revision');
      }
      const upsertNodes = parseNodes(root.upsertNodes);
      const removeNodeIds = parseIds(root.removeNodeIds, MAX_NODES);
      const upsertEdges = parseEdges(root.upsertEdges);
      const removeEdgeIds = parseIds(root.removeEdgeIds, MAX_EDGES);
      upsertNodes.forEach((node) => assertBoundedCellCoverage(node, this.#cellSize));
      cloneable(patch);
      const removedNodes = new Set(removeNodeIds);
      const removedEdges = new Set(removeEdgeIds);
      if (
        upsertNodes.some(({ id: nodeId }) => removedNodes.has(nodeId)) ||
        upsertEdges.some(({ id: edgeId }) => removedEdges.has(edgeId))
      ) {
        throw new ContextGraphPerformanceError('duplicate_id', 'patch_overlap');
      }
      const upsertNodeIds = new Set(upsertNodes.map(({ id: nodeId }) => nodeId));
      const nodeExistsAfter = (nodeId: string): boolean =>
        upsertNodeIds.has(nodeId) || (this.#nodes.has(nodeId) && !removedNodes.has(nodeId));
      for (const edge of upsertEdges) {
        if (!nodeExistsAfter(edge.sourceId) || !nodeExistsAfter(edge.targetId)) {
          throw new ContextGraphPerformanceError('dangling_edge', edge.id);
        }
      }
      const upsertEdgesById = new Map(upsertEdges.map((edge) => [edge.id, edge]));
      for (const nodeId of removedNodes) {
        for (const edgeId of this.#incidentEdges.get(nodeId) ?? []) {
          const replacement = upsertEdgesById.get(edgeId);
          if (
            !removedEdges.has(edgeId) &&
            (!replacement || replacement.sourceId === nodeId || replacement.targetId === nodeId)
          ) {
            throw new ContextGraphPerformanceError('dangling_edge', edgeId);
          }
        }
      }
      if (
        this.#nodes.size -
          removeNodeIds.filter((nodeId) => this.#nodes.has(nodeId)).length +
          upsertNodes.filter(({ id: nodeId }) => !this.#nodes.has(nodeId)).length >
          MAX_NODES ||
        this.#edges.size -
          removeEdgeIds.filter((edgeId) => this.#edges.has(edgeId)).length +
          upsertEdges.filter(({ id: edgeId }) => !this.#edges.has(edgeId)).length >
          MAX_EDGES
      ) {
        throw new ContextGraphPerformanceError('too_many_items');
      }

      for (const edgeId of removeEdgeIds) {
        const edge = this.#edges.get(edgeId);
        if (edge) {
          this.#removeIncident(edge);
          this.#edges.delete(edgeId);
        }
      }
      for (const nodeId of removeNodeIds) {
        const node = this.#nodes.get(nodeId);
        if (node) {
          this.#removeNodeFromCells(node);
          this.#nodes.delete(nodeId);
          this.#incidentEdges.delete(nodeId);
        }
      }
      for (const node of upsertNodes) {
        const previous = this.#nodes.get(node.id);
        if (previous) this.#removeNodeFromCells(previous);
        this.#nodes.set(node.id, node);
        this.#addNodeToCells(node);
      }
      for (const edge of upsertEdges) {
        const previous = this.#edges.get(edge.id);
        if (previous) this.#removeIncident(previous);
        this.#edges.set(edge.id, edge);
        this.#addIncident(edge);
      }
      this.#revision = root.revision;
    } catch (error) {
      if (error instanceof ContextGraphPerformanceError) throw error;
      throw new ContextGraphPerformanceError('invalid_input', 'unreadable_patch');
    }
  }
}

export function hasMoreThanContextGraphNodes<TNode extends { children?: readonly TNode[] }>(
  root: TNode,
  maximum: number,
): boolean {
  if (!Number.isSafeInteger(maximum) || maximum < 0 || maximum > MAX_NODES) {
    throw new ContextGraphPerformanceError('invalid_input', 'tree_limit');
  }
  const seen = new Set<TNode>();
  const stack: Array<{ nodes: readonly TNode[]; index: number }> = [{ nodes: [root], index: 0 }];
  let count = 0;
  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!;
    if (frame.index >= frame.nodes.length) {
      stack.pop();
      continue;
    }
    const node = frame.nodes[frame.index++]!;
    if (seen.has(node)) throw new ContextGraphPerformanceError('invalid_input', 'tree_cycle');
    seen.add(node);
    count += 1;
    if (count > maximum) return true;
    if (node.children?.length) stack.push({ nodes: node.children, index: 0 });
  }
  return false;
}

export async function buildContextGraphPerformanceIndexCooperatively<
  TNode = ContextGraphPerformanceNode,
  TEdge = ContextGraphPerformanceEdge,
>(
  input: {
    nodes: readonly TNode[];
    edges: readonly TEdge[];
    cellSize: number;
  },
  options: {
    chunkSize?: number;
    signal?: AbortSignal;
    yieldControl?: () => Promise<void>;
    mapNode?: (node: TNode) => ContextGraphPerformanceNode;
    mapEdge?: (edge: TEdge) => ContextGraphPerformanceEdge;
  } = {},
): Promise<ContextGraphPerformanceIndex> {
  const chunkSize = options.chunkSize ?? 500;
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0 || chunkSize > 10_000) {
    throw new ContextGraphPerformanceError('invalid_input', 'chunk_size');
  }
  if (
    !Array.isArray(input.nodes) ||
    !Array.isArray(input.edges) ||
    input.nodes.length > MAX_NODES ||
    input.edges.length > MAX_EDGES
  ) {
    throw new ContextGraphPerformanceError('too_many_items');
  }
  const yieldControl =
    options.yieldControl ??
    (() => new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0)));
  const index = new ContextGraphPerformanceIndex({
    nodes: [],
    edges: [],
    cellSize: input.cellSize,
  });
  let revision = 0;
  const ensureActive = () => {
    if (options.signal?.aborted) {
      throw new ContextGraphPerformanceError('disposed', 'aborted');
    }
  };
  for (let offset = 0; offset < input.nodes.length; offset += chunkSize) {
    ensureActive();
    index.applyPatch({
      revision: ++revision,
      upsertNodes: input.nodes
        .slice(offset, offset + chunkSize)
        .map((node) =>
          options.mapNode
            ? options.mapNode(node)
            : (node as unknown as ContextGraphPerformanceNode),
        ),
      removeNodeIds: [],
      upsertEdges: [],
      removeEdgeIds: [],
    });
    await yieldControl();
  }
  for (let offset = 0; offset < input.edges.length; offset += chunkSize) {
    ensureActive();
    index.applyPatch({
      revision: ++revision,
      upsertNodes: [],
      removeNodeIds: [],
      upsertEdges: input.edges
        .slice(offset, offset + chunkSize)
        .map((edge) =>
          options.mapEdge
            ? options.mapEdge(edge)
            : (edge as unknown as ContextGraphPerformanceEdge),
        ),
      removeEdgeIds: [],
    });
    await yieldControl();
  }
  ensureActive();
  return index;
}

export type ContextGraphHit =
  | Readonly<{ kind: 'node'; id: string }>
  | Readonly<{ kind: 'edge'; id: string; targetId: string }>;

export function sampleContextGraphEdge(
  source: Readonly<{ x: number; y: number }>,
  target: Readonly<{ x: number; y: number }>,
  segments = 16,
): readonly Readonly<{ x: number; y: number }>[] {
  if (
    !finite(source.x) ||
    !finite(source.y) ||
    !finite(target.x) ||
    !finite(target.y) ||
    !Number.isSafeInteger(segments) ||
    segments < 1 ||
    segments > 128
  ) {
    throw new ContextGraphPerformanceError('invalid_input', 'edge_geometry');
  }
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const curve = Math.min(155, distance * 0.18);
  const control = {
    x: (source.x + target.x) / 2 - (dy / distance) * curve,
    y: (source.y + target.y) / 2 + (dx / distance) * curve,
  };
  const points: Array<Readonly<{ x: number; y: number }>> = [Object.freeze({ ...source })];
  for (let step = 1; step <= segments; step += 1) {
    const ratio = step / segments;
    const inverse = 1 - ratio;
    points.push(
      Object.freeze({
        x:
          inverse * inverse * source.x + 2 * inverse * ratio * control.x + ratio * ratio * target.x,
        y:
          inverse * inverse * source.y + 2 * inverse * ratio * control.y + ratio * ratio * target.y,
      }),
    );
  }
  return Object.freeze(points);
}

export function hitTestContextGraph(
  point: Readonly<{ x: number; y: number }>,
  nodes: readonly Readonly<ContextGraphPerformanceNode>[],
  edges: readonly Readonly<ContextGraphPerformanceEdge>[],
  nodeById: ReadonlyMap<string, Readonly<ContextGraphPerformanceNode>>,
  edgeTolerance = 12,
): ContextGraphHit | null {
  if (
    !finite(point.x) ||
    !finite(point.y) ||
    !finite(edgeTolerance, MAX_DIMENSION) ||
    edgeTolerance < 0
  ) {
    throw new ContextGraphPerformanceError('invalid_input', 'hit_test');
  }
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index]!;
    if (Math.hypot(node.x - point.x, node.y - point.y) <= node.radius) {
      return Object.freeze({ kind: 'node', id: node.id });
    }
  }
  const distanceToSegment = (
    start: Readonly<{ x: number; y: number }>,
    end: Readonly<{ x: number; y: number }>,
  ): number => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const ratio =
      lengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
          );
    return Math.hypot(point.x - (start.x + dx * ratio), point.y - (start.y + dy * ratio));
  };
  for (let index = edges.length - 1; index >= 0; index -= 1) {
    const edge = edges[index]!;
    const source = nodeById.get(edge.sourceId);
    const target = nodeById.get(edge.targetId);
    if (!source || !target) continue;
    const points = sampleContextGraphEdge(source, target);
    let hit = false;
    for (let step = 1; step < points.length; step += 1) {
      if (distanceToSegment(points[step - 1]!, points[step]!) <= edgeTolerance) {
        hit = true;
        break;
      }
    }
    if (hit) {
      return Object.freeze({ kind: 'edge', id: edge.id, targetId: edge.targetId });
    }
  }
  return null;
}

export function selectGraphRenderer(input: {
  totalNodes: number;
  totalEdges: number;
  canvas2d: boolean;
  webgl2: boolean;
}): 'svg' | 'canvas' | 'webgl' {
  const root = record(input);
  if (
    !root ||
    !exactKeys(root, ['totalNodes', 'totalEdges', 'canvas2d', 'webgl2']) ||
    !nonNegativeInteger(root.totalNodes, MAX_NODES) ||
    !nonNegativeInteger(root.totalEdges, MAX_EDGES) ||
    typeof root.canvas2d !== 'boolean' ||
    typeof root.webgl2 !== 'boolean'
  ) {
    throw new ContextGraphPerformanceError('invalid_input', 'renderer');
  }
  if ((root.totalNodes >= 10_000 || root.totalEdges >= 20_000) && root.webgl2) return 'webgl';
  if ((root.totalNodes > 1_000 || root.totalEdges > 2_000) && root.canvas2d) return 'canvas';
  return 'svg';
}

function parseLayoutNode(value: unknown): Readonly<ContextGraphLayoutNode> {
  const input = record(value);
  if (
    !input ||
    !exactKeys(input, ['id', 'parentId', 'depth', 'order', 'radius']) ||
    !id(input.id) ||
    (input.parentId !== null && !id(input.parentId)) ||
    !nonNegativeInteger(input.depth, MAX_LAYOUT_NODES) ||
    !nonNegativeInteger(input.order, MAX_LAYOUT_NODES) ||
    !positive(input.radius)
  ) {
    throw new ContextGraphPerformanceError('invalid_input', 'layout_node');
  }
  return Object.freeze({
    id: input.id,
    parentId: input.parentId,
    depth: input.depth,
    order: input.order,
    radius: input.radius,
  });
}

function parseLayoutRequest(value: unknown): Readonly<ContextGraphLayoutRequest> {
  const input = record(value);
  if (
    !input ||
    !exactKeys(input, ['version', 'requestId', 'width', 'height', 'nodes']) ||
    input.version !== 1 ||
    !nonNegativeInteger(input.requestId) ||
    !positive(input.width) ||
    !positive(input.height)
  ) {
    throw new ContextGraphPerformanceError('invalid_input', 'layout_request');
  }
  const rawNodes = array(input.nodes, MAX_LAYOUT_NODES);
  if (!rawNodes) throw new ContextGraphPerformanceError('invalid_input', 'layout_nodes');
  const width = input.width as number;
  const height = input.height as number;
  const nodes = rawNodes.map(parseLayoutNode);
  if (new Set(nodes.map(({ id: nodeId }) => nodeId)).size !== nodes.length) {
    throw new ContextGraphPerformanceError('duplicate_id', 'layout_node');
  }
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (
    nodes.some((node) =>
      node.parentId === null
        ? node.depth !== 0
        : !byId.has(node.parentId) || byId.get(node.parentId)!.depth >= node.depth,
    )
  ) {
    throw new ContextGraphPerformanceError('invalid_input', 'layout_hierarchy');
  }
  if (nodes.some((node) => node.radius * 2 > width || node.radius * 2 > height)) {
    throw new ContextGraphPerformanceError('invalid_input', 'layout_geometry');
  }
  cloneable(value);
  return Object.freeze({
    version: 1,
    requestId: input.requestId,
    width,
    height,
    nodes: Object.freeze(nodes) as unknown as ContextGraphLayoutNode[],
  });
}

function freezeLayoutResult(
  requestId: number,
  nodes: ContextGraphLayoutResultNode[],
): Readonly<ContextGraphLayoutResult> {
  return Object.freeze({
    version: 1,
    requestId,
    nodes: Object.freeze(
      nodes.map((node) => Object.freeze(node)),
    ) as unknown as ContextGraphLayoutResultNode[],
  });
}

export function layoutGraph(input: ContextGraphLayoutRequest): Readonly<ContextGraphLayoutResult> {
  const request = parseLayoutRequest(input);
  const byDepth = new Map<number, Readonly<ContextGraphLayoutNode>[]>();
  for (const node of request.nodes) {
    const values = byDepth.get(node.depth) ?? [];
    values.push(node);
    byDepth.set(node.depth, values);
  }
  for (const values of byDepth.values()) {
    values.sort((left, right) => left.order - right.order || compareIds(left, right));
  }
  const centerX = request.width / 2;
  const centerY = request.height / 2;
  const ringStep = Math.max(1, Math.min(request.width, request.height) / 6);
  const positions = new Map<string, ContextGraphLayoutResultNode>();
  for (const [depth, values] of [...byDepth].sort(([left], [right]) => left - right)) {
    values.forEach((node, index) => {
      const angle =
        values.length === 1 ? -Math.PI / 2 : (Math.PI * 2 * index) / values.length - Math.PI / 2;
      const distance = depth * ringStep;
      positions.set(node.id, {
        id: node.id,
        x: Math.min(
          request.width - node.radius,
          Math.max(node.radius, centerX + Math.cos(angle) * distance),
        ),
        y: Math.min(
          request.height - node.radius,
          Math.max(node.radius, centerY + Math.sin(angle) * distance),
        ),
      });
    });
  }
  return freezeLayoutResult(
    request.requestId,
    request.nodes.map(({ id: nodeId }) => positions.get(nodeId)!),
  );
}

function parseLayoutResult(
  value: unknown,
  request: Readonly<ContextGraphLayoutRequest>,
): Readonly<ContextGraphLayoutResult> {
  const input = record(value);
  if (
    !input ||
    !exactKeys(input, ['version', 'requestId', 'nodes']) ||
    input.version !== 1 ||
    input.requestId !== request.requestId
  ) {
    throw new ContextGraphPerformanceError('worker_failed', 'response');
  }
  const rawNodes = array(input.nodes, MAX_LAYOUT_NODES);
  if (!rawNodes) throw new ContextGraphPerformanceError('worker_failed', 'nodes');
  const nodes = rawNodes.map((value) => {
    const node = record(value);
    if (
      !node ||
      !exactKeys(node, ['id', 'x', 'y']) ||
      !id(node.id) ||
      !finite(node.x) ||
      !finite(node.y)
    ) {
      throw new ContextGraphPerformanceError('worker_failed', 'node');
    }
    return { id: node.id, x: node.x, y: node.y };
  });
  if (new Set(nodes.map(({ id: nodeId }) => nodeId)).size !== nodes.length) {
    throw new ContextGraphPerformanceError('duplicate_id', 'worker_node');
  }
  const expectedNodeIds = new Set(request.nodes.map(({ id: nodeId }) => nodeId));
  if (
    nodes.length !== expectedNodeIds.size ||
    nodes.some(({ id: nodeId }) => !expectedNodeIds.has(nodeId))
  ) {
    throw new ContextGraphPerformanceError('worker_failed', 'node_set');
  }
  cloneable(value);
  return freezeLayoutResult(request.requestId, nodes);
}

function prepareLayoutRequest(
  input: Omit<ContextGraphLayoutRequest, 'version' | 'requestId'>,
  requestId: number,
): ContextGraphLayoutRequest {
  const root = record(input);
  if (
    !root ||
    !exactKeys(root, ['width', 'height', 'nodes']) ||
    !positive(root.width) ||
    !positive(root.height) ||
    !Array.isArray(root.nodes) ||
    root.nodes.length > MAX_LAYOUT_NODES
  ) {
    throw new ContextGraphPerformanceError('invalid_input', 'layout_request');
  }
  const candidate = {
    version: 1 as const,
    requestId,
    width: root.width,
    height: root.height,
    nodes: root.nodes as ContextGraphLayoutNode[],
  };
  return candidate.nodes.length > 1_000
    ? Object.freeze(candidate)
    : (parseLayoutRequest(candidate) as ContextGraphLayoutRequest);
}

async function parseLayoutResultCooperatively(
  value: unknown,
  request: Readonly<ContextGraphLayoutRequest>,
  yieldControl: () => Promise<void>,
): Promise<Readonly<ContextGraphLayoutResult>> {
  const input = record(value);
  if (
    !input ||
    !exactKeys(input, ['version', 'requestId', 'nodes']) ||
    input.version !== 1 ||
    input.requestId !== request.requestId ||
    !Array.isArray(input.nodes) ||
    input.nodes.length !== request.nodes.length ||
    input.nodes.length > MAX_LAYOUT_NODES
  ) {
    throw new ContextGraphPerformanceError('worker_failed', 'response');
  }
  const nodes: ContextGraphLayoutResultNode[] = [];
  const seen = new Set<string>();
  for (let offset = 0; offset < input.nodes.length; offset += 500) {
    const end = Math.min(input.nodes.length, offset + 500);
    for (let index = offset; index < end; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(input.nodes, String(index));
      const expectedDescriptor = Object.getOwnPropertyDescriptor(request.nodes, String(index));
      const node =
        descriptor && Object.hasOwn(descriptor, 'value') ? record(descriptor.value) : null;
      const expected =
        expectedDescriptor && Object.hasOwn(expectedDescriptor, 'value')
          ? record(expectedDescriptor.value)
          : null;
      if (
        !descriptor?.enumerable ||
        !expectedDescriptor?.enumerable ||
        !node ||
        !expected ||
        !exactKeys(node, ['id', 'x', 'y']) ||
        !id(node.id) ||
        !id(expected.id) ||
        node.id !== expected.id ||
        seen.has(node.id) ||
        !finite(node.x) ||
        !finite(node.y)
      ) {
        throw new ContextGraphPerformanceError('worker_failed', 'node');
      }
      seen.add(node.id);
      nodes.push(Object.freeze({ id: node.id, x: node.x, y: node.y }));
    }
    await yieldControl();
  }
  return Object.freeze({
    version: 1,
    requestId: request.requestId,
    nodes: Object.freeze(nodes) as unknown as ContextGraphLayoutResultNode[],
  });
}

export function createGraphLayoutCoordinator(
  createWorker: () => ContextGraphLayoutWorker,
  options: { timeoutMs?: number; yieldControl?: () => Promise<void> } = {},
): Readonly<{
  layout(
    input: Omit<ContextGraphLayoutRequest, 'version' | 'requestId'>,
  ): Promise<Readonly<ContextGraphLayoutResult>>;
  dispose(): void;
}> {
  let worker: ContextGraphLayoutWorker | undefined;
  let disposed = false;
  let nextRequestId = 1;
  const timeoutMs =
    Number.isSafeInteger(options.timeoutMs) &&
    (options.timeoutMs as number) > 0 &&
    (options.timeoutMs as number) <= 60_000
      ? (options.timeoutMs as number)
      : 10_000;
  const yieldControl =
    options.yieldControl ??
    (() => new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0)));
  let pending:
    | {
        request: ContextGraphLayoutRequest;
        resolve: (value: Readonly<ContextGraphLayoutResult>) => void;
        reject: (reason: ContextGraphPerformanceError) => void;
        timeout: ReturnType<typeof setTimeout>;
      }
    | undefined;

  function resetWorker(): void {
    if (!worker) return;
    worker.removeEventListener('message', onMessage);
    worker.removeEventListener('error', onWorkerFailure);
    worker.removeEventListener('messageerror', onWorkerFailure);
    worker.terminate();
    worker = undefined;
  }

  function settleWithFallback(): void {
    const active = pending;
    if (!active) return;
    pending = undefined;
    clearTimeout(active.timeout);
    resetWorker();
    if (active.request.nodes.length > 1_000) {
      active.reject(new ContextGraphPerformanceError('worker_failed', 'large_layout'));
    } else {
      active.resolve(layoutGraph(active.request));
    }
  }

  function onMessage(event: MessageEvent<unknown>): void {
    const active = pending;
    if (!active) return;
    const message = record(event.data);
    if (!message || message.requestId !== active.request.requestId) return;
    void (async () => {
      try {
        const result =
          active.request.nodes.length > 1_000
            ? await parseLayoutResultCooperatively(event.data, active.request, yieldControl)
            : parseLayoutResult(event.data, active.request);
        if (pending?.request.requestId !== active.request.requestId) return;
        pending = undefined;
        clearTimeout(active.timeout);
        active.resolve(result);
      } catch {
        if (pending?.request.requestId === active.request.requestId) settleWithFallback();
      }
    })();
  }

  function onWorkerFailure(): void {
    settleWithFallback();
  }

  function ensureWorker(): ContextGraphLayoutWorker {
    if (!worker) {
      worker = createWorker();
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onWorkerFailure);
      worker.addEventListener('messageerror', onWorkerFailure);
    }
    return worker;
  }

  return Object.freeze({
    layout(input) {
      if (disposed) {
        return Promise.reject(new ContextGraphPerformanceError('disposed'));
      }
      let request: ContextGraphLayoutRequest;
      try {
        request = prepareLayoutRequest(input, nextRequestId++);
      } catch (error) {
        return Promise.reject(
          error instanceof ContextGraphPerformanceError
            ? error
            : new ContextGraphPerformanceError('invalid_input', 'layout_request'),
        );
      }
      if (pending) {
        const superseded = pending;
        pending = undefined;
        clearTimeout(superseded.timeout);
        superseded.reject(new ContextGraphPerformanceError('superseded'));
        resetWorker();
      }
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (pending?.request.requestId === request.requestId) settleWithFallback();
        }, timeoutMs);
        pending = { request, resolve, reject, timeout };
        try {
          ensureWorker().postMessage(request);
        } catch {
          settleWithFallback();
        }
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (pending) {
        clearTimeout(pending.timeout);
        pending.reject(new ContextGraphPerformanceError('disposed'));
      }
      pending = undefined;
      resetWorker();
    },
  });
}
