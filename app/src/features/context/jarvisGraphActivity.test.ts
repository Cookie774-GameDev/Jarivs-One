import { describe, expect, it } from 'vitest';
import type { JarvisContextPack, JarvisSourceRef } from '@/lib/jarvis/contracts';
import {
  applyContextJarvisSourceRetry,
  buildContextJarvisDelivery,
  ContextJarvisGraphActivityError,
  buildContextJarvisGraphActivity,
  createContextJarvisRetryAuthority,
  createContextJarvisVoiceCitationAuthority,
  planContextJarvisSourceRetry,
  type ContextJarvisGraphActivityInputV1,
} from './jarvisGraphActivity';
import type {
  ContextRetrievalRequest,
  ContextRetrievalResult,
  RetrievedContextItem,
} from './contextRetrievalService';

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
    expect(activity.activityEvent).toEqual({
      version: 1,
      id: 'context-used:run-1',
      kind: 'context_used',
      accountId: 'account-1',
      mapId: 'map-1',
      runId: 'run-1',
      occurredAt: 105,
      sourceIds: ['source-a', 'source-b'],
    });
    expect(activity.inspection.sources).toEqual([
      {
        sourceId: 'source-a',
        label: 'Context source source-a',
        excerpt: 'Verified context A',
        freshness: 'current',
        removable: true,
      },
      {
        sourceId: 'source-b',
        label: 'Context source source-b',
        excerpt: 'Verified context B',
        freshness: 'current',
        removable: true,
      },
    ]);
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

function retrievedItem(id: string, sourceId: string): RetrievedContextItem {
  return {
    id,
    mapId: 'map-1',
    sourceId,
    sourceKind: 'local_file',
    entity: {
      entityId: `entity-${id}`,
      kind: 'file',
      label: `${id}.ts`,
      sourceId,
      path: `app/${id}.ts`,
      lineStart: 4,
      lineEnd: 8,
    },
    exactExcerpt: `export const ${id} = true;`,
    summary: `${id} summary`,
    freshness: 'current',
    ranking: { score: 0.9, reasons: ['lexical_match'] },
    citation: {
      label: `${id}.ts lines 4–8`,
      action: {
        kind: 'highlight_entity',
        sourceKind: 'local_file',
        mapId: 'map-1',
        entityId: `entity-${id}`,
        path: `app/${id}.ts`,
        lineStart: 4,
        lineEnd: 8,
      },
    },
    provenance: {
      sourceRevision: `rev-${id}`,
      indexedAt: 100,
    },
  };
}

const retrievalRequest: ContextRetrievalRequest = {
  projectId: 'project-1',
  userText: 'Fix the access flow',
  maxTokens: 1_200,
};

function retrievalResult(): ContextRetrievalResult {
  return {
    queryId: 'query-1',
    mapRevisions: { 'map-1': 7 },
    items: [retrievedItem('keep', 'source-a'), retrievedItem('remove', 'source-b')],
    relatedEntities: [],
    omittedCount: 0,
    staleItems: [],
    warnings: [],
    builtAt: 100,
  };
}

describe('Context JARVIS retry and delivery experience', () => {
  it('plans a user-selected source removal and applies it to the bounded retry set', () => {
    const authority = createContextJarvisRetryAuthority();
    const receipt = authority.recordRetrieval({
      runId: 'run-1',
      request: retrievalRequest,
      result: retrievalResult(),
    });
    const removalGrant = authority.authorizeRemoval({
      receipt,
      removedItemId: 'remove',
      requestedAt: 110,
    });
    const plan = planContextJarvisSourceRetry({
      version: 1,
      authority,
      receipt,
      removalGrant,
    });

    expect(plan).toEqual({
      version: 1,
      runId: 'run-1',
      priorQueryId: 'query-1',
      removedItemId: 'remove',
      removedSourceId: 'source-b',
      excludedItemIds: ['remove'],
      excludedSourceIds: ['source-b'],
      retainedItemIds: ['keep'],
      retryReason: 'user_removed_context_source',
      requestedAt: 110,
      request: retrievalRequest,
    });
    expect(
      applyContextJarvisSourceRetry(plan, [
        { id: 'keep', sourceId: 'source-a', value: 1 },
        { id: 'remove', sourceId: 'source-b', value: 2 },
        { id: 'new-id-same-source', sourceId: 'source-b', value: 3 },
        { id: 'new', sourceId: 'source-c', value: 4 },
      ]),
    ).toEqual([
      { id: 'keep', sourceId: 'source-a', value: 1 },
      { id: 'new', sourceId: 'source-c', value: 4 },
    ]);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.request)).toBe(true);
  });

  it('rejects removal outside the prior result or chronology', () => {
    const authority = createContextJarvisRetryAuthority();
    const receipt = authority.recordRetrieval({
      runId: 'run-1',
      request: retrievalRequest,
      result: retrievalResult(),
    });
    expect(() =>
      authority.authorizeRemoval({
        receipt,
        removedItemId: 'forged',
        requestedAt: 110,
      }),
    ).toThrowError(expect.objectContaining({ code: 'invalid_input' }));
    expect(() =>
      authority.authorizeRemoval({
        receipt,
        removedItemId: 'remove',
        requestedAt: 99,
      }),
    ).toThrowError(expect.objectContaining({ code: 'invalid_chronology' }));
    expect(() =>
      planContextJarvisSourceRetry({
        version: 1,
        authority,
        receipt: Object.freeze({ version: 1, id: 'forged' }),
        removalGrant: Object.freeze({ version: 1, id: 'forged' }),
      } as never),
    ).toThrowError(expect.objectContaining({ code: 'invalid_input' }));
  });

  it('keeps source chips visual while enforcing a concise citation-free voice reply', () => {
    const items = retrievalResult().items;
    const delivery = buildContextJarvisDelivery({
      version: 1,
      surface: 'voice',
      visualText: 'The access flow is fixed. See the two verified sources below.',
      spokenSentences: ['I found the access path and fixed the mismatch, sir.'],
      items,
    });

    expect(delivery.spokenText).toBe('I found the access path and fixed the mismatch, sir.');
    expect(delivery.visualTranscript.sourceChips).toEqual([
      {
        itemId: 'keep',
        label: 'keep.ts lines 4–8',
        freshness: 'current',
        action: items[0]!.citation.action,
      },
      {
        itemId: 'remove',
        label: 'remove.ts lines 4–8',
        freshness: 'current',
        action: items[1]!.citation.action,
      },
    ]);
    expect(delivery.spokenCitationLabels).toEqual([]);

    const written = buildContextJarvisDelivery({
      version: 1,
      surface: 'written',
      visualText: 'Written answer with the same source chips.',
      items,
    });
    expect(written.spokenText).toBeNull();
    expect(written.visualTranscript.sourceChips).toHaveLength(2);

    const redirected = structuredClone(items);
    redirected[0]!.citation.action.entityId = 'entity-other';
    expect(() =>
      buildContextJarvisDelivery({
        version: 1,
        surface: 'written',
        visualText: 'Forged chip target.',
        items: redirected,
      }),
    ).toThrowError(expect.objectContaining({ code: 'invalid_input' }));
  });

  it('rejects long voice replies and unrequested spoken paths or citations', () => {
    const items = retrievalResult().items;
    for (const spokenSentences of [
      ['One.', 'Two.', 'Three.'],
      ['One!Two!Three!'],
      ['x'.repeat(281)],
      ['Open app/keep.ts for details.'],
      ['Open keep.ts for details.'],
      ['Open app\\keep.ts for details.'],
      ['See keep.ts lines 4–8.'],
    ]) {
      expect(() =>
        buildContextJarvisDelivery({
          version: 1,
          surface: 'voice',
          visualText: 'Visual answer with source chips.',
          spokenSentences,
          items,
        }),
      ).toThrowError(ContextJarvisGraphActivityError);
    }
    const ordinary = buildContextJarvisDelivery({
      version: 1,
      surface: 'voice',
      visualText: 'Ordinary voice reply.',
      spokenSentences: ['I applied the fix.'],
      items,
    });
    expect(ordinary.spokenText).toBe('I applied the fix.');

    const shortName = retrievedItem('short', 'source-short');
    shortName.entity.label = 'go';
    shortName.entity.path = 'cmd/go';
    shortName.entity.lineStart = undefined;
    shortName.entity.lineEnd = undefined;
    shortName.citation.label = 'go';
    shortName.citation.action.path = 'cmd/go';
    shortName.citation.action.lineStart = undefined;
    shortName.citation.action.lineEnd = undefined;
    expect(() =>
      buildContextJarvisDelivery({
        version: 1,
        surface: 'voice',
        visualText: 'Short basename source.',
        spokenSentences: ['Run go now.'],
        items: [shortName],
      }),
    ).toThrowError(ContextJarvisGraphActivityError);

    const voiceAuthority = createContextJarvisVoiceCitationAuthority();
    const citationDetailGrant = voiceAuthority.authorizeCitationDetails({
      itemIds: items.map(({ id }) => id),
    });
    const requested = buildContextJarvisDelivery({
      version: 1,
      surface: 'voice',
      visualText: 'Visual answer with source chips.',
      spokenSentences: ['See keep.ts lines 4–8.'],
      citationDetailGrant,
      items,
    });
    expect(requested.spokenCitationLabels).toEqual(['keep.ts lines 4–8', 'remove.ts lines 4–8']);
  });
});
