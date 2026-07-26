import { describe, expect, it } from 'vitest';
import type { JarvisContextPack, JarvisSourceRef } from '@/lib/jarvis/contracts';
import {
  ContextJarvisGraphActivityError,
  buildContextJarvisGraphActivity,
  type ContextJarvisGraphActivityInputV1,
} from './jarvisGraphActivity';

function source(id: string): JarvisSourceRef {
  return {
    id,
    kind: 'context_node',
    label: `Context source ${id}`,
    uri: `vibespace://context/${id}`,
    accountId: 'account-1',
    projectId: 'project-1',
    trust: 'app_verified',
    origin: 'app_observed',
    sensitivity: 'private',
    observedAt: 100,
    contentHash: `${id}-hash`,
  };
}

function pack(): JarvisContextPack {
  return {
    items: [
      {
        source: source('source-a'),
        purpose: 'answer',
        excerpt: 'Verified context A',
        score: 0.9,
        freshness: 'current',
        truncated: false,
      },
      {
        source: source('source-b'),
        purpose: 'citation',
        excerpt: 'Verified context B',
        score: 0.8,
        freshness: 'current',
        truncated: false,
      },
    ],
    budget: { maxChars: 4_000, usedChars: 36 },
    exclusions: [{ source: source('source-excluded'), reason: 'restricted_source' }],
  };
}

function input(
  overrides: Partial<ContextJarvisGraphActivityInputV1> = {},
): ContextJarvisGraphActivityInputV1 {
  return {
    version: 1,
    accountId: 'account-1',
    mapId: 'map-1',
    runId: 'run-1',
    startedAt: 100,
    now: 120,
    lifecycle: 'retrieving',
    reducedMotion: false,
    contextPackEvidence: {
      version: 1,
      accountId: 'account-1',
      mapId: 'map-1',
      runId: 'run-1',
      retrievedAt: 105,
      contextPack: pack(),
    },
    graphNodes: [
      { version: 1, id: 'node-a', accountId: 'account-1', mapId: 'map-1' },
      { version: 1, id: 'node-b', accountId: 'account-1', mapId: 'map-1' },
      { version: 1, id: 'node-unused', accountId: 'account-1', mapId: 'map-1' },
    ],
    graphEdges: [
      {
        version: 1,
        id: 'path-a-b',
        accountId: 'account-1',
        mapId: 'map-1',
        sourceNodeId: 'node-a',
        targetNodeId: 'node-b',
      },
      {
        version: 1,
        id: 'path-b-unused',
        accountId: 'account-1',
        mapId: 'map-1',
        sourceNodeId: 'node-b',
        targetNodeId: 'node-unused',
      },
    ],
    bindings: [
      {
        version: 1,
        accountId: 'account-1',
        mapId: 'map-1',
        runId: 'run-1',
        sourceId: 'source-a',
        nodeId: 'node-a',
        path: 'notes/a.md',
      },
      {
        version: 1,
        accountId: 'account-1',
        mapId: 'map-1',
        runId: 'run-1',
        sourceId: 'source-b',
        nodeId: 'node-b',
        path: 'notes/b.md',
      },
      {
        version: 1,
        accountId: 'account-1',
        mapId: 'map-1',
        runId: 'run-1',
        sourceId: 'source-unused',
        nodeId: 'node-unused',
        path: 'notes/unused.md',
      },
    ],
    pathEvidence: [
      {
        version: 1,
        id: 'path-a-b',
        accountId: 'account-1',
        mapId: 'map-1',
        runId: 'run-1',
        sourceNodeId: 'node-a',
        targetNodeId: 'node-b',
        state: 'active',
        observedAt: 110,
      },
      {
        version: 1,
        id: 'path-b-unused',
        accountId: 'account-1',
        mapId: 'map-1',
        runId: 'run-1',
        sourceNodeId: 'node-b',
        targetNodeId: 'node-unused',
        state: 'active',
        observedAt: 111,
      },
    ],
    ...overrides,
  };
}

describe('truthful Context JARVIS graph activity', () => {
  it('derives used-node badges, exact source references, active paths, and pack inspection', () => {
    const activity = buildContextJarvisGraphActivity(input());

    expect(activity.usedNodes.map(({ nodeId }) => nodeId)).toEqual(['node-a', 'node-b']);
    expect(activity.usedNodes[0]).toMatchObject({
      nodeId: 'node-a',
      badge: 'Used by JARVIS',
      sourceReferences: [{ id: 'source-a', accountId: 'account-1' }],
    });
    expect(activity.activePathIds).toEqual(['path-a-b']);
    expect(activity.animateActivePaths).toBe(true);
    expect(activity.inspection.contextPack).toEqual(pack());
    expect(Object.isFrozen(activity)).toBe(true);
    expect(Object.isFrozen(activity.usedNodes[0]?.sourceReferences[0])).toBe(true);
    expect(Object.isFrozen(activity.inspection.contextPack.items[0]?.source)).toBe(true);
  });

  it.each(['running', 'completed', 'cancelled', 'failed'] as const)(
    'never exposes active animation after retrieval enters %s',
    (lifecycle) => {
      const activity = buildContextJarvisGraphActivity(input({ lifecycle }));
      expect(activity.activePathIds).toEqual([]);
      expect(activity.animateActivePaths).toBe(false);
      expect(activity.usedNodes).toHaveLength(2);
    },
  );

  it('respects reduced motion without discarding verified active-path evidence', () => {
    const activity = buildContextJarvisGraphActivity(input({ reducedMotion: true }));
    expect(activity.activePathIds).toEqual(['path-a-b']);
    expect(activity.animateActivePaths).toBe(false);
  });

  it('rejects scope/run mismatch, duplicates, and malformed canonical packs', () => {
    expect(() =>
      buildContextJarvisGraphActivity(
        input({
          pathEvidence: [
            {
              ...input().pathEvidence[0]!,
              runId: 'run-forged',
            },
          ],
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'scope_mismatch' }));
    expect(() =>
      buildContextJarvisGraphActivity(
        input({
          bindings: [input().bindings[0]!, input().bindings[0]!],
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'duplicate_id' }));
    expect(() =>
      buildContextJarvisGraphActivity(
        input({
          contextPackEvidence: {
            ...input().contextPackEvidence,
            contextPack: {
              ...pack(),
              budget: { maxChars: 1, usedChars: 100 },
            },
          },
        }),
      ),
    ).toThrowError(ContextJarvisGraphActivityError);
  });

  it('rejects cross-account exclusion metadata before exposing exact pack inspection', () => {
    const crossAccountPack = pack();
    crossAccountPack.exclusions[0]!.source.accountId = 'account-2';

    expect(() =>
      buildContextJarvisGraphActivity(
        input({
          contextPackEvidence: {
            ...input().contextPackEvidence,
            contextPack: crossAccountPack,
          },
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'invalid_context_pack' }));
  });

  it.each([
    {
      label: 'declared character budget',
      contextPack: {
        ...pack(),
        budget: { maxChars: 1_000_001, usedChars: 36 },
      },
    },
    {
      label: 'pack metadata',
      contextPack: {
        ...pack(),
        exclusions: [
          {
            ...pack().exclusions[0]!,
            reason: 'x'.repeat(2_000_001),
          },
        ],
      },
    },
  ])('rejects an oversized $label before cloning inspection data', ({ contextPack }) => {
    expect(() =>
      buildContextJarvisGraphActivity(
        input({
          contextPackEvidence: {
            ...input().contextPackEvidence,
            contextPack,
          },
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'invalid_context_pack' }));
  });

  it('rejects replayed packs, unscoped bindings, and nodes absent from the scoped graph', () => {
    expect(() =>
      buildContextJarvisGraphActivity(
        input({
          contextPackEvidence: {
            ...input().contextPackEvidence,
            mapId: 'map-replayed',
          },
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'scope_mismatch' }));
    expect(() =>
      buildContextJarvisGraphActivity(
        input({
          bindings: [{ ...input().bindings[0]!, runId: 'run-replayed' }],
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'scope_mismatch' }));
    expect(() =>
      buildContextJarvisGraphActivity(
        input({
          bindings: [{ ...input().bindings[0]!, nodeId: 'node-forged' }],
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'missing_node' }));
  });

  it('rejects path and pack evidence outside the authoritative run window', () => {
    expect(() =>
      buildContextJarvisGraphActivity(
        input({
          pathEvidence: [{ ...input().pathEvidence[0]!, observedAt: 99 }],
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'invalid_chronology' }));
    expect(() =>
      buildContextJarvisGraphActivity(
        input({
          pathEvidence: [{ ...input().pathEvidence[0]!, observedAt: 121 }],
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'invalid_chronology' }));
    expect(() =>
      buildContextJarvisGraphActivity(
        input({
          contextPackEvidence: {
            ...input().contextPackEvidence,
            retrievedAt: 99,
          },
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'invalid_chronology' }));
  });

  it('rejects active path evidence that is not backed by a scoped graph edge', () => {
    const withGraphEdges = {
      ...input(),
      graphEdges: [
        {
          version: 1,
          id: 'edge-a-b',
          accountId: 'account-1',
          mapId: 'map-1',
          sourceNodeId: 'node-a',
          targetNodeId: 'node-b',
        },
      ],
    } as ContextJarvisGraphActivityInputV1;

    expect(() =>
      buildContextJarvisGraphActivity({
        ...withGraphEdges,
        pathEvidence: [
          {
            ...withGraphEdges.pathEvidence[0]!,
            id: 'edge-forged',
          },
        ],
      }),
    ).toThrowError(expect.objectContaining({ code: 'missing_edge' }));
  });

  it('rejects path evidence whose endpoints do not match its backing graph edge', () => {
    expect(() =>
      buildContextJarvisGraphActivity(
        input({
          pathEvidence: [
            {
              ...input().pathEvidence[0]!,
              sourceNodeId: 'node-b',
              targetNodeId: 'node-a',
            },
          ],
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'invalid_active_path' }));
  });

  it('returns a detached snapshot and fails closed on proxy/accessor input', () => {
    const mutable = input();
    const activity = buildContextJarvisGraphActivity(mutable);
    mutable.contextPackEvidence.contextPack.items[0]!.source.label = 'mutated';
    mutable.bindings[0]!.path = 'notes/mutated.md';
    expect(activity.inspection.contextPack.items[0]!.source.label).toBe('Context source source-a');
    expect(activity.usedNodes[0]!.sourceReferences[0]!.label).toBe('Context source source-a');

    expect(() => buildContextJarvisGraphActivity(new Proxy(input(), {}))).toThrowError(
      ContextJarvisGraphActivityError,
    );
    expect(() =>
      buildContextJarvisGraphActivity(
        Object.defineProperty({}, 'version', {
          enumerable: true,
          get() {
            throw new Error('must not invoke accessors');
          },
        }) as ContextJarvisGraphActivityInputV1,
      ),
    ).toThrowError(ContextJarvisGraphActivityError);
  });
});
