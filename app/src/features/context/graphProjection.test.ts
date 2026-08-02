import { describe, expect, it } from 'vitest';
import {
  ContextGraphProjectionError,
  projectContextGraph,
  type ContextGraphProjectionInputV1,
  type ContextGraphProjectionNodeV1,
} from './graphProjection';

function node(
  id: string,
  overrides: Partial<ContextGraphProjectionNodeV1> = {},
): ContextGraphProjectionNodeV1 {
  return {
    version: 1,
    id,
    accountId: 'account-1',
    mapId: 'map-1',
    sourceId: 'source-1',
    entityType: 'file',
    label: `Node ${id}`,
    path: `src/${id}.ts`,
    tags: ['security'],
    properties: [{ name: 'status', value: 'active' }],
    folder: 'src',
    repository: 'vibespace',
    branch: 'main',
    language: 'typescript',
    freshness: 'current',
    attachmentType: null,
    taskState: null,
    searchText: `Node ${id} signing key`,
    importance: 0.5,
    recentUseAt: 900,
    ...overrides,
  };
}

function input(
  overrides: Partial<ContextGraphProjectionInputV1> = {},
): ContextGraphProjectionInputV1 {
  return {
    version: 1,
    accountId: 'account-1',
    mapId: 'map-1',
    now: 1_000,
    scope: { kind: 'global' },
    nodes: [node('a'), node('b'), node('c')],
    edges: [
      {
        version: 1,
        id: 'edge-a-b',
        accountId: 'account-1',
        mapId: 'map-1',
        sourceEntityId: 'a',
        targetEntityId: 'b',
        relationship: 'calls',
        weight: 0.8,
      },
      {
        version: 1,
        id: 'edge-b-c',
        accountId: 'account-1',
        mapId: 'map-1',
        sourceEntityId: 'b',
        targetEntityId: 'c',
        relationship: 'depends_on',
        weight: 0.6,
      },
    ],
    filters: {},
    groups: [],
    controls: {
      arrows: true,
      nodeSizeMetric: 'fixed',
      linkThickness: 2,
      labelThreshold: 0.4,
      relationLabels: true,
      connectionDepth: 2,
      centerForce: 0.4,
      repulsion: 0.5,
      linkForce: 0.5,
      linkDistance: 120,
      clustering: true,
      animation: true,
      reducedMotion: false,
    },
    ...overrides,
  };
}

describe('Context graph projection', () => {
  it('projects the global graph through every approved filter surface', () => {
    const matching = node('matching', {
      sourceId: 'source-match',
      entityType: 'task',
      tags: ['security', 'release'],
      properties: [
        { name: 'status', value: 'blocked' },
        { name: 'owner', value: 'jarvis' },
      ],
      folder: 'src/security',
      repository: 'vibespace',
      branch: 'release',
      language: 'typescript',
      freshness: 'stale',
      attachmentType: 'pdf',
      taskState: 'blocked',
      searchText: 'Signing key rotation checklist',
    });
    const other = node('other', { sourceId: 'source-other', tags: ['docs'] });
    const result = projectContextGraph(
      input({
        nodes: [matching, other],
        edges: [
          {
            version: 1,
            id: 'edge-filtered',
            accountId: 'account-1',
            mapId: 'map-1',
            sourceEntityId: 'matching',
            targetEntityId: 'other',
            relationship: 'depends_on',
            weight: 1,
          },
        ],
        filters: {
          sourceIds: ['source-match'],
          entityTypes: ['task'],
          relationships: ['depends_on'],
          tags: ['security', 'release'],
          properties: [{ name: 'status', value: 'blocked' }],
          folders: ['src/security'],
          repositories: ['vibespace'],
          branches: ['release'],
          languages: ['typescript'],
          freshness: ['stale'],
          attachmentTypes: ['pdf'],
          taskStates: ['blocked'],
          searchQuery: 'key rotation',
        },
      }),
    );

    expect(result.nodes.map(({ id }) => id)).toEqual(['matching']);
    expect(result.edges).toEqual([]);
  });

  it('projects deterministic local neighborhoods to the configured connection depth', () => {
    const depthOne = projectContextGraph(
      input({
        scope: { kind: 'local', selectedId: 'a' },
        controls: { ...input().controls, connectionDepth: 1 },
      }),
    );
    expect(depthOne.nodes.map(({ id }) => id)).toEqual(['a', 'b']);
    expect(depthOne.edges.map(({ id }) => id)).toEqual(['edge-a-b']);

    const depthTwo = projectContextGraph(
      input({
        scope: { kind: 'local', selectedId: 'a' },
        controls: { ...input().controls, connectionDepth: 2 },
      }),
    );
    expect(depthTwo.nodes.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
    expect(depthTwo.selectedNodeId).toBe('a');
  });

  it('removes nodes that are not incident to an allowed relationship filter', () => {
    const result = projectContextGraph(
      input({
        filters: { relationships: ['calls'] },
      }),
    );

    expect(result.nodes.map(({ id }) => id)).toEqual(['a', 'b']);
    expect(result.edges.map(({ id }) => id)).toEqual(['edge-a-b']);
  });

  it('retains the selected local anchor through node filters and invisible groups', () => {
    const result = projectContextGraph(
      input({
        scope: { kind: 'local', selectedId: 'a' },
        nodes: [
          node('a', { entityType: 'file', tags: ['internal'] }),
          node('b', { entityType: 'task', tags: ['release'] }),
        ],
        edges: [input().edges[0]!],
        filters: { entityTypes: ['task'] },
        groups: [
          {
            version: 1,
            id: 'hidden-internal',
            name: 'Internal',
            query: { tags: ['internal'] },
            colorToken: 'muted',
            priority: 100,
            visible: false,
          },
        ],
        controls: { ...input().controls, connectionDepth: 1 },
      }),
    );

    expect(result.nodes.map(({ id }) => id)).toEqual(['a', 'b']);
    expect(result.selectedNodeId).toBe('a');
  });

  it('prunes local nodes disconnected when an invisible group removes their bridge', () => {
    const result = projectContextGraph(
      input({
        scope: { kind: 'local', selectedId: 'a' },
        nodes: [node('a'), node('b', { tags: ['hidden-bridge'] }), node('c')],
        groups: [
          {
            version: 1,
            id: 'hidden-bridge',
            name: 'Hidden bridge',
            query: { tags: ['hidden-bridge'] },
            colorToken: 'muted',
            priority: 100,
            visible: false,
          },
        ],
        controls: { ...input().controls, connectionDepth: 2 },
      }),
    );

    expect(result.nodes.map(({ id }) => id)).toEqual(['a']);
    expect(result.edges).toEqual([]);
    expect(result.selectedNodeId).toBe('a');
  });

  it('applies prioritized theme-aware query groups and hides the winning invisible group', () => {
    const result = projectContextGraph(
      input({
        nodes: [
          node('visible', { tags: ['security'] }),
          node('hidden', { tags: ['internal'] }),
          node('ungrouped', { tags: ['docs'] }),
        ],
        edges: [],
        groups: [
          {
            version: 1,
            id: 'group-security',
            name: 'Security',
            query: { tags: ['security'] },
            colorToken: 'accent-copper',
            priority: 10,
            visible: true,
          },
          {
            version: 1,
            id: 'group-hidden',
            name: 'Internal',
            query: { tags: ['internal'] },
            colorToken: 'muted',
            priority: 20,
            visible: false,
          },
        ],
      }),
    );

    expect(result.nodes.map(({ id, groupId }) => ({ id, groupId }))).toEqual([
      { id: 'ungrouped', groupId: null },
      { id: 'visible', groupId: 'group-security' },
    ]);
    expect(result.groups).toMatchObject([
      {
        id: 'group-hidden',
        name: 'Internal',
        colorToken: 'muted',
        priority: 20,
        visible: false,
        matchedNodeCount: 1,
      },
      {
        id: 'group-security',
        name: 'Security',
        colorToken: 'accent-copper',
        priority: 10,
        visible: true,
        matchedNodeCount: 1,
      },
    ]);
  });

  it('normalizes every display control and disables animation for reduced motion', () => {
    const result = projectContextGraph(
      input({
        controls: {
          arrows: false,
          nodeSizeMetric: 'importance',
          linkThickness: 7.5,
          labelThreshold: 0.8,
          relationLabels: false,
          connectionDepth: 4,
          centerForce: 0.9,
          repulsion: 0.8,
          linkForce: 0.7,
          linkDistance: 300,
          clustering: false,
          animation: true,
          reducedMotion: true,
        },
      }),
    );

    expect(result.controls).toEqual({
      arrows: false,
      nodeSizeMetric: 'importance',
      linkThickness: 7.5,
      labelThreshold: 0.8,
      relationLabels: false,
      connectionDepth: 4,
      centerForce: 0.9,
      repulsion: 0.8,
      linkForce: 0.7,
      linkDistance: 300,
      clustering: false,
      animation: false,
      reducedMotion: true,
      motion: 'off',
    });
  });

  it.each([
    ['backlinks', 'Backlinks'],
    ['importance', 'Importance'],
    ['centrality', 'Graph centrality'],
    ['recent_use', 'Recent use'],
    ['fixed', 'Fixed size'],
  ] as const)('returns the selected %s node-size metric and label', (nodeSizeMetric, label) => {
    const result = projectContextGraph(
      input({
        nodes: [
          node('a', { importance: 0.1, recentUseAt: 100 }),
          node('b', { importance: 0.9, recentUseAt: 990 }),
          node('c', { importance: 0.2, recentUseAt: null }),
        ],
        controls: { ...input().controls, nodeSizeMetric },
      }),
    );

    expect(result.nodeSizeMetric).toEqual({ kind: nodeSizeMetric, label });
    expect(
      result.nodes.every(({ size, metricValue }) => size >= 16 && size <= 48 && metricValue >= 0),
    ).toBe(true);
    if (nodeSizeMetric === 'backlinks') {
      expect(result.nodes.find(({ id }) => id === 'b')!.metricValue).toBeGreaterThan(
        result.nodes.find(({ id }) => id === 'a')!.metricValue,
      );
    }
  });

  it('rejects cross-scope records, dangling edges, duplicates, unsafe groups, and invalid controls', () => {
    expect(() =>
      projectContextGraph(input({ nodes: [node('a', { accountId: 'account-2' })], edges: [] })),
    ).toThrowError(expect.objectContaining({ code: 'scope_mismatch' }));
    expect(() =>
      projectContextGraph(
        input({
          nodes: [node('a')],
          edges: [
            {
              ...input().edges[0]!,
              targetEntityId: 'missing',
            },
          ],
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'dangling_edge' }));
    expect(() =>
      projectContextGraph(input({ nodes: [node('a'), node('a')], edges: [] })),
    ).toThrowError(expect.objectContaining({ code: 'duplicate_id' }));
    expect(() =>
      projectContextGraph(
        input({
          groups: [
            {
              version: 1,
              id: 'bad-group',
              name: 'Bad',
              query: {},
              colorToken: '#ff00ff' as 'accent-copper',
              priority: 1,
              visible: true,
            },
          ],
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'invalid_input' }));
    expect(() =>
      projectContextGraph(
        input({ controls: { ...input().controls, linkDistance: Number.POSITIVE_INFINITY } }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'invalid_input' }));
  });

  it('returns detached deeply immutable snapshots and fails closed on accessor-backed input', () => {
    const original = node('a');
    const result = projectContextGraph(input({ nodes: [original], edges: [] }));
    original.tags[0] = 'mutated';
    original.properties[0]!.value = 'mutated';

    expect(result.nodes[0]?.tags).toEqual(['security']);
    expect(result.nodes[0]?.properties).toEqual([{ name: 'status', value: 'active' }]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.nodes[0]?.properties)).toBe(true);
    expect(Object.isFrozen(result.nodes[0]?.properties[0])).toBe(true);

    expect(() =>
      projectContextGraph(
        Object.defineProperty({}, 'version', {
          enumerable: true,
          get() {
            throw new Error('must not invoke accessors');
          },
        }) as ContextGraphProjectionInputV1,
      ),
    ).toThrowError(ContextGraphProjectionError);

    let nestedAccessorInvoked = false;
    const accessorTags: string[] = [];
    Object.defineProperty(accessorTags, '0', {
      enumerable: true,
      configurable: true,
      get() {
        nestedAccessorInvoked = true;
        return 'security';
      },
    });
    accessorTags.length = 1;
    expect(() =>
      projectContextGraph(
        input({
          nodes: [node('nested-accessor', { tags: accessorTags })],
          edges: [],
        }),
      ),
    ).toThrowError(ContextGraphProjectionError);
    expect(nestedAccessorInvoked).toBe(false);
  });

  it('rejects symbol-keyed records, transparent proxies, and unsafe display controls', () => {
    const symbolNode = node('symbol-node');
    Object.defineProperty(symbolNode, Symbol('hidden-filter'), {
      enumerable: true,
      value: 'must not be ignored',
    });
    expect(() => projectContextGraph(input({ nodes: [symbolNode], edges: [] }))).toThrowError(
      ContextGraphProjectionError,
    );

    expect(() => projectContextGraph(new Proxy(input(), {}))).toThrowError(
      ContextGraphProjectionError,
    );
    expect(() =>
      projectContextGraph(
        input({
          nodes: [new Proxy(node('proxied-node'), {})],
          edges: [],
        }),
      ),
    ).toThrowError(ContextGraphProjectionError);

    expect(() =>
      projectContextGraph(
        input({
          nodes: [node('unsafe-control', { label: 'Unsafe\u009bnode' })],
          edges: [],
        }),
      ),
    ).toThrowError(ContextGraphProjectionError);
    expect(() =>
      projectContextGraph(
        input({
          groups: [
            {
              version: 1,
              id: 'bidi-group',
              name: 'Spoof\u202egroup',
              query: {},
              colorToken: 'muted',
              priority: 1,
              visible: true,
            },
          ],
        }),
      ),
    ).toThrowError(ContextGraphProjectionError);
  });
});
