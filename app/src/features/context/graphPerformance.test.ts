import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ContextGraphPerformanceError,
  ContextGraphPerformanceIndex,
  buildContextGraphPerformanceIndexCooperatively,
  createGraphLayoutCoordinator,
  hasMoreThanContextGraphNodes,
  hitTestContextGraph,
  layoutGraph,
  selectGraphRenderer,
  type ContextGraphLayoutRequest,
  type ContextGraphLayoutWorker,
  type ContextGraphPerformanceEdge,
  type ContextGraphPerformanceNode,
} from './graphPerformance';

const nodes: ContextGraphPerformanceNode[] = [
  { id: 'a', x: 10, y: 10, radius: 5 },
  { id: 'b', x: 110, y: 10, radius: 5 },
  { id: 'c', x: 1_010, y: 1_010, radius: 5 },
];

const edges: ContextGraphPerformanceEdge[] = [
  { id: 'a-b', sourceId: 'a', targetId: 'b' },
  { id: 'b-c', sourceId: 'b', targetId: 'c' },
];

describe('Context large-graph performance pipeline', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('spatially culls an overscanned viewport and returns only drawable edges', () => {
    const index = new ContextGraphPerformanceIndex({ nodes, edges, cellSize: 100 });

    expect(index.query({ x: 0, y: 0, width: 100, height: 100 }, 20)).toEqual({
      revision: 0,
      nodes: [nodes[0], nodes[1]],
      edges: [edges[0]],
      truncated: false,
    });
  });

  it('accepts internal Context root identifiers used by the live map', () => {
    const index = new ContextGraphPerformanceIndex({
      nodes: [{ id: '__jarvis-context-root__', x: 10, y: 10, radius: 5 }],
      edges: [],
      cellSize: 100,
    });

    expect(index.query({ x: 0, y: 0, width: 20, height: 20 }, 0).nodes[0]?.id).toBe(
      '__jarvis-context-root__',
    );
  });

  it('applies graph changes incrementally without rebuilding unchanged records', () => {
    const index = new ContextGraphPerformanceIndex({ nodes, edges, cellSize: 100 });
    const before = index.query({ x: 0, y: 0, width: 200, height: 100 }, 0);

    index.applyPatch({
      revision: 1,
      upsertNodes: [{ id: 'c', x: 150, y: 10, radius: 5 }],
      removeNodeIds: [],
      upsertEdges: [],
      removeEdgeIds: [],
    });

    const after = index.query({ x: 0, y: 0, width: 200, height: 100 }, 0);
    expect(after.revision).toBe(1);
    expect(after.nodes.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
    expect(after.edges.map(({ id }) => id)).toEqual(['a-b', 'b-c']);
    expect(after.nodes[0]).toBe(before.nodes[0]);
    expect(() =>
      index.applyPatch({
        revision: 1,
        upsertNodes: [],
        removeNodeIds: [],
        upsertEdges: [],
        removeEdgeIds: [],
      }),
    ).toThrowError(expect.objectContaining({ code: 'stale_revision' }));
  });

  it('fails patches atomically when they introduce dangling or duplicate graph data', () => {
    const index = new ContextGraphPerformanceIndex({ nodes, edges, cellSize: 100 });
    const before = index.query({ x: 0, y: 0, width: 200, height: 100 }, 0);

    expect(() =>
      index.applyPatch({
        revision: 1,
        upsertNodes: [],
        removeNodeIds: ['a'],
        upsertEdges: [],
        removeEdgeIds: [],
      }),
    ).toThrowError(expect.objectContaining({ code: 'dangling_edge' }));
    expect(() =>
      index.applyPatch({
        revision: 1,
        upsertNodes: [nodes[0]!],
        removeNodeIds: ['a'],
        upsertEdges: [],
        removeEdgeIds: [],
      }),
    ).toThrowError(expect.objectContaining({ code: 'duplicate_id' }));
    expect(() =>
      index.applyPatch({
        revision: 1,
        upsertNodes: [],
        removeNodeIds: [],
        upsertEdges: [{ id: 'a-b', sourceId: 'a', targetId: 'missing' }],
        removeEdgeIds: [],
      }),
    ).toThrowError(expect.objectContaining({ code: 'dangling_edge' }));
    expect(index.query({ x: 0, y: 0, width: 200, height: 100 }, 0)).toEqual(before);

    index.applyPatch({
      revision: 1,
      upsertNodes: [],
      removeNodeIds: ['a'],
      upsertEdges: [{ id: 'a-b', sourceId: 'b', targetId: 'c' }],
      removeEdgeIds: [],
    });
    expect(index.query({ x: 0, y: 0, width: 2_000, height: 2_000 }, 0)).toMatchObject({
      revision: 1,
      nodes: [nodes[1], nodes[2]],
      edges: [
        { id: 'a-b', sourceId: 'b', targetId: 'c' },
        { id: 'b-c', sourceId: 'b', targetId: 'c' },
      ],
    });
  });

  it('caps dense visible output before sorting can monopolize the caller', () => {
    const denseNodes = Array.from({ length: 12_000 }, (_, index) => ({
      id: `dense-${index.toString().padStart(5, '0')}`,
      x: index % 100,
      y: Math.floor(index / 100),
      radius: 1,
    }));
    const index = new ContextGraphPerformanceIndex({
      nodes: denseNodes,
      edges: [],
      cellSize: 100,
    });

    const visible = index.query({ x: 0, y: 0, width: 200, height: 200 }, 0);
    expect(visible.nodes).toHaveLength(10_000);
    expect(visible.truncated).toBe(true);
  });

  it('filters boundary-cell false positives before applying visible caps', () => {
    const falsePositives = Array.from({ length: 10_000 }, (_, index) => ({
      id: `false-${index.toString().padStart(5, '0')}`,
      x: 1,
      y: 1,
      radius: 1,
    }));
    const visible = { id: 'visible-last', x: 99, y: 1, radius: 1 };
    const index = new ContextGraphPerformanceIndex({
      nodes: [...falsePositives, visible],
      edges: [],
      cellSize: 100,
    });

    expect(index.query({ x: 98, y: 0, width: 2, height: 2 }, 0).nodes).toEqual([visible]);
  });

  it('filters non-drawable incident edges before applying edge caps', () => {
    const offscreenNodes = Array.from({ length: 20_000 }, (_, index) => ({
      id: `off-${index.toString().padStart(5, '0')}`,
      x: 10_000 + index,
      y: 10_000,
      radius: 1,
    }));
    const visibleNodes = [
      { id: 'visible-source', x: 10, y: 10, radius: 2 },
      { id: 'visible-target', x: 20, y: 10, radius: 2 },
    ];
    const offscreenEdges = offscreenNodes.map((node, index) => ({
      id: `off-edge-${index.toString().padStart(5, '0')}`,
      sourceId: 'visible-source',
      targetId: node.id,
    }));
    const visibleEdge = {
      id: 'visible-edge',
      sourceId: 'visible-source',
      targetId: 'visible-target',
    };
    const index = new ContextGraphPerformanceIndex({
      nodes: [...visibleNodes, ...offscreenNodes],
      edges: [...offscreenEdges, visibleEdge],
      cellSize: 100,
    });

    expect(index.query({ x: 0, y: 0, width: 30, height: 30 }, 0).edges).toEqual([visibleEdge]);
  });

  it('classifies map scale from bounded actual tree nodes instead of file metadata', () => {
    interface TreeNode {
      id: string;
      children?: TreeNode[];
    }
    const root: TreeNode = {
      id: 'root',
      children: Array.from({ length: 1_001 }, (_, index) => ({ id: `topic-${index}` })),
    };

    expect(hasMoreThanContextGraphNodes<TreeNode>(root, 1_000)).toBe(true);
    expect(
      hasMoreThanContextGraphNodes<TreeNode>(
        { id: 'root', children: root.children!.slice(0, 999) },
        1_000,
      ),
    ).toBe(false);
  });

  it('builds the graph index in bounded cooperative slices', async () => {
    let yields = 0;
    const index = await buildContextGraphPerformanceIndexCooperatively(
      { nodes, edges, cellSize: 100 },
      {
        chunkSize: 1,
        yieldControl: async () => {
          yields += 1;
        },
      },
    );

    expect(yields).toBe(5);
    expect(index.query({ x: 0, y: 0, width: 2_000, height: 2_000 }, 0)).toMatchObject({
      nodes,
      edges,
    });
  });

  it('hit-tests topmost nodes before edges and returns the edge target', () => {
    const hitNodes = [
      { id: 'under', x: 10, y: 10, radius: 8 },
      { id: 'top', x: 10, y: 10, radius: 5 },
    ];
    const hitEdges = [{ id: 'under-target', sourceId: 'under', targetId: 'target' }];
    const nodeById = new Map([
      ['under', hitNodes[0]!],
      ['target', { id: 'target', x: 50, y: 10, radius: 5 }],
    ]);

    expect(hitTestContextGraph({ x: 10, y: 10 }, hitNodes, hitEdges, nodeById)).toEqual({
      kind: 'node',
      id: 'top',
    });
    expect(hitTestContextGraph({ x: 30, y: 12 }, hitNodes, hitEdges, nodeById)).toEqual({
      kind: 'edge',
      id: 'under-target',
      targetId: 'target',
    });
    const curvedNodes = new Map([
      ['wide-source', { id: 'wide-source', x: 0, y: 0, radius: 5 }],
      ['wide-target', { id: 'wide-target', x: 1_000, y: 0, radius: 5 }],
    ]);
    expect(
      hitTestContextGraph(
        { x: 500, y: 77.5 },
        [...curvedNodes.values()],
        [{ id: 'wide-edge', sourceId: 'wide-source', targetId: 'wide-target' }],
        curvedNodes,
      ),
    ).toEqual({ kind: 'edge', id: 'wide-edge', targetId: 'wide-target' });
    expect(hitTestContextGraph({ x: 30, y: 40 }, hitNodes, hitEdges, nodeById)).toBeNull();
  });

  it('chooses SVG, canvas, or WebGL from scale and verified capabilities', () => {
    expect(
      selectGraphRenderer({
        totalNodes: 500,
        totalEdges: 700,
        canvas2d: true,
        webgl2: true,
      }),
    ).toBe('svg');
    expect(
      selectGraphRenderer({
        totalNodes: 5_000,
        totalEdges: 8_000,
        canvas2d: true,
        webgl2: true,
      }),
    ).toBe('canvas');
    expect(
      selectGraphRenderer({
        totalNodes: 20_000,
        totalEdges: 40_000,
        canvas2d: true,
        webgl2: true,
      }),
    ).toBe('webgl');
    expect(
      selectGraphRenderer({
        totalNodes: 20_000,
        totalEdges: 40_000,
        canvas2d: false,
        webgl2: false,
      }),
    ).toBe('svg');
  });

  it('computes deterministic bounded layout snapshots', () => {
    const result = layoutGraph({
      version: 1,
      requestId: 7,
      width: 1_000,
      height: 700,
      nodes: [
        { id: 'root', parentId: null, depth: 0, order: 0, radius: 50 },
        { id: 'a', parentId: 'root', depth: 1, order: 0, radius: 30 },
        { id: 'b', parentId: 'root', depth: 1, order: 1, radius: 30 },
      ],
    });

    expect(result.requestId).toBe(7);
    expect(result.nodes).toHaveLength(3);
    expect(result.nodes[0]).toMatchObject({ id: 'root', x: 500, y: 350 });
    expect(result.nodes.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    expect(Object.isFrozen(result.nodes)).toBe(true);
  });

  it('rejects spatial fan-out and impossible layout geometry before blocking work', () => {
    expect(() => new ContextGraphPerformanceIndex({ nodes, edges, cellSize: 0.5 })).toThrowError(
      expect.objectContaining({ code: 'invalid_input' }),
    );
    expect(
      () =>
        new ContextGraphPerformanceIndex({
          nodes: [{ id: 'wide', x: 0, y: 0, radius: 100 }],
          edges: [],
          cellSize: 1,
        }),
    ).toThrowError(expect.objectContaining({ code: 'too_many_items' }));

    const index = new ContextGraphPerformanceIndex({ nodes, edges, cellSize: 100 });
    expect(() => index.query({ x: 0, y: 0, width: 40_000, height: 40_000 }, 0)).toThrowError(
      expect.objectContaining({ code: 'too_many_items' }),
    );

    expect(() =>
      layoutGraph({
        version: 1,
        requestId: 8,
        width: 100,
        height: 100,
        nodes: [{ id: 'root', parentId: null, depth: 0, order: 0, radius: 60 }],
      }),
    ).toThrowError(expect.objectContaining({ code: 'invalid_input' }));
  });

  it('uses a worker and ignores superseded layout responses', async () => {
    const workers: Array<{
      posted: unknown[];
      listeners: Map<string, (event: Event) => void>;
      terminated: boolean;
      worker: ContextGraphLayoutWorker;
    }> = [];
    const coordinator = createGraphLayoutCoordinator(() => {
      const state = {
        posted: [] as unknown[],
        listeners: new Map<string, (event: Event) => void>(),
        terminated: false,
        worker: undefined as unknown as ContextGraphLayoutWorker,
      };
      state.worker = {
        postMessage(message) {
          state.posted.push(message);
        },
        addEventListener(type, next) {
          state.listeners.set(type, next as unknown as (event: Event) => void);
        },
        removeEventListener(type) {
          state.listeners.delete(type);
        },
        terminate() {
          state.terminated = true;
        },
      };
      workers.push(state);
      return state.worker;
    });
    const first = coordinator.layout({
      width: 800,
      height: 600,
      nodes: [{ id: 'root', parentId: null, depth: 0, order: 0, radius: 50 }],
    });
    const firstRejected = expect(first).rejects.toMatchObject({ code: 'superseded' });
    const second = coordinator.layout({
      width: 900,
      height: 700,
      nodes: [{ id: 'root', parentId: null, depth: 0, order: 0, radius: 50 }],
    });
    const firstRequest = workers[0]!.posted[0] as { requestId: number };
    const secondRequest = workers[1]!.posted[0] as { requestId: number };
    expect(workers[0]!.terminated).toBe(true);
    workers[0]!.listeners.get('message')?.({
      data: {
        version: 1,
        requestId: firstRequest.requestId,
        nodes: [{ id: 'root', x: 400, y: 300 }],
      },
    } as MessageEvent);
    workers[1]!.listeners.get('message')?.({
      data: {
        version: 1,
        requestId: secondRequest.requestId,
        nodes: [{ id: 'root', x: 450, y: 350 }],
      },
    } as MessageEvent);

    await firstRejected;
    await expect(second).resolves.toMatchObject({
      requestId: secondRequest.requestId,
      nodes: [{ id: 'root', x: 450, y: 350 }],
    });
    coordinator.dispose();
  });

  it('validates large worker results cooperatively and rejects failure without local layout', async () => {
    const listeners = new Map<string, (event: Event) => void>();
    const posted: ContextGraphLayoutRequest[] = [];
    let yields = 0;
    const coordinator = createGraphLayoutCoordinator(
      () =>
        ({
          postMessage(message: ContextGraphLayoutRequest) {
            posted.push(message);
          },
          addEventListener(type: string, next: (event: Event) => void) {
            listeners.set(type, next);
          },
          removeEventListener(type: string) {
            listeners.delete(type);
          },
          terminate() {},
        }) as unknown as ContextGraphLayoutWorker,
      {
        yieldControl: async () => {
          yields += 1;
        },
      },
    );
    const largeNodes = Array.from({ length: 1_001 }, (_, index) => ({
      id: `large-${index}`,
      parentId: index === 0 ? null : 'large-0',
      depth: index === 0 ? 0 : 1,
      order: index,
      radius: 5,
    }));
    const successful = coordinator.layout({ width: 800, height: 600, nodes: largeNodes });
    await vi.waitFor(() => expect(posted).toHaveLength(1));
    listeners.get('message')?.({
      data: {
        version: 1,
        requestId: posted[0]!.requestId,
        nodes: largeNodes.map((node, index) => ({ id: node.id, x: index, y: index })),
      },
    } as MessageEvent);
    await expect(successful).resolves.toMatchObject({ nodes: { length: 1_001 } });
    expect(yields).toBeGreaterThan(0);

    const failed = coordinator.layout({ width: 800, height: 600, nodes: largeNodes });
    await vi.waitFor(() => expect(posted).toHaveLength(2));
    listeners.get('error')?.(new Event('error'));
    await expect(failed).rejects.toMatchObject({ code: 'worker_failed' });
    coordinator.dispose();
  });

  it.each(['error', 'messageerror'] as const)(
    'settles through local fallback and resets after worker %s',
    async (failureType) => {
      const listeners = new Map<string, (event: Event) => void>();
      let factoryCalls = 0;
      const coordinator = createGraphLayoutCoordinator(() => {
        factoryCalls += 1;
        return {
          postMessage() {},
          addEventListener(type: string, next: (event: Event) => void) {
            listeners.set(type, next);
          },
          removeEventListener(type: string) {
            listeners.delete(type);
          },
          terminate() {},
        } as unknown as ContextGraphLayoutWorker;
      });
      const pending = coordinator.layout({
        width: 800,
        height: 600,
        nodes: [{ id: 'root', parentId: null, depth: 0, order: 0, radius: 50 }],
      });
      listeners.get(failureType)?.(new Event(failureType));

      await expect(pending).resolves.toMatchObject({
        nodes: [{ id: 'root', x: 400, y: 300 }],
      });
      const next = coordinator.layout({
        width: 800,
        height: 600,
        nodes: [{ id: 'root', parentId: null, depth: 0, order: 0, radius: 50 }],
      });
      const nextDisposed = expect(next).rejects.toMatchObject({ code: 'disposed' });
      expect(factoryCalls).toBe(2);
      coordinator.dispose();
      await nextDisposed;
    },
  );

  it('resets a failed posting worker and bounds an unresponsive request', async () => {
    vi.useFakeTimers();
    let factoryCalls = 0;
    const coordinator = createGraphLayoutCoordinator(
      () => {
        factoryCalls += 1;
        return {
          postMessage() {
            if (factoryCalls === 1) throw new Error('post failed');
          },
          addEventListener() {},
          removeEventListener() {},
          terminate() {},
        };
      },
      { timeoutMs: 50 },
    );
    await expect(
      coordinator.layout({
        width: 800,
        height: 600,
        nodes: [{ id: 'root', parentId: null, depth: 0, order: 0, radius: 50 }],
      }),
    ).resolves.toMatchObject({ nodes: [{ id: 'root' }] });

    const pending = coordinator.layout({
      width: 800,
      height: 600,
      nodes: [{ id: 'root', parentId: null, depth: 0, order: 0, radius: 50 }],
    });
    await vi.advanceTimersByTimeAsync(50);
    await expect(pending).resolves.toMatchObject({ nodes: [{ id: 'root' }] });
    expect(factoryCalls).toBe(2);
    coordinator.dispose();
  });

  it('falls back locally when a worker response changes the requested node set', async () => {
    let listener: ((event: MessageEvent<unknown>) => void) | undefined;
    const worker: ContextGraphLayoutWorker = {
      postMessage() {},
      addEventListener(_type, next) {
        listener = next;
      },
      removeEventListener() {},
      terminate() {},
    };
    const coordinator = createGraphLayoutCoordinator(() => worker);
    const pending = coordinator.layout({
      width: 800,
      height: 600,
      nodes: [{ id: 'root', parentId: null, depth: 0, order: 0, radius: 50 }],
    });
    listener?.({
      data: {
        version: 1,
        requestId: 1,
        nodes: [{ id: 'injected', x: 1, y: 1 }],
      },
    } as MessageEvent);

    await expect(pending).resolves.toMatchObject({
      nodes: [{ id: 'root', x: 400, y: 300 }],
    });
    coordinator.dispose();
  });

  it('rejects malformed runtime inputs, accessors, proxies, and oversized work', () => {
    expect(
      () =>
        new ContextGraphPerformanceIndex({
          nodes: [{ id: 'a', x: Number.NaN, y: 0, radius: 1 }],
          edges: [],
          cellSize: 100,
        }),
    ).toThrowError(ContextGraphPerformanceError);
    expect(
      () =>
        new ContextGraphPerformanceIndex(new Proxy({ nodes: [], edges: [], cellSize: 100 }, {})),
    ).toThrowError(ContextGraphPerformanceError);
  });
});
