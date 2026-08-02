import { describe, expect, it, vi } from 'vitest';
import {
  CONTEXT_RETRIEVAL_RANKING_SIGNALS,
  createContextRetrievalService,
  type ContextRetrievalCandidate,
  type ContextRetrievalDependencies,
  type ContextRetrievalRequest,
} from './contextRetrievalService';
import { ContextRevisionCache } from './contextRevisionCache';

const request: ContextRetrievalRequest = {
  projectId: 'project-1',
  chatId: 'chat-1',
  terminalSessionId: 'terminal-1',
  agentSlug: 'builder',
  userText: 'Fix the access webhook cancellation test',
  explicitMapIds: ['map-1'],
  explicitEntityIds: ['entity-explicit'],
  selectedSkillIds: ['testing'],
  preferredSourceKinds: ['local_file', 'github_repository'],
  maxTokens: 2_400,
  requireFresh: true,
};

function candidate(
  id: string,
  overrides: Partial<ContextRetrievalCandidate> = {},
): ContextRetrievalCandidate {
  return {
    id,
    mapId: 'map-1',
    mapRevision: 7,
    sourceId: `source-${id}`,
    sourceKind: 'local_file',
    entity: {
      entityId: `entity-${id}`,
      kind: 'file',
      label: `${id}.ts`,
      sourceId: `source-${id}`,
      path: `app/${id}.ts`,
      lineStart: 10,
      lineEnd: 14,
    },
    exactExcerpt: `export const ${id.replaceAll('-', '_')} = true;`,
    summary: `Relevant ${id} implementation.`,
    taskIntents: ['debug', 'code'],
    activeFile: false,
    lexicalMatch: 0.5,
    semanticMatch: 0.5,
    graphDistance: 2,
    sourceTrust: 'app_verified',
    observedAt: 1_700_000_000_000,
    freshness: 'current',
    terminalSessionId: null,
    agentSlug: null,
    skillIds: [],
    userPinnedImportance: 0,
    relatedEntities: [],
    provenance: {
      sourceRevision: 'rev-1',
      indexedAt: 1_700_000_000_000,
    },
    ...overrides,
  };
}

function dependencies(
  candidates: readonly ContextRetrievalCandidate[],
): ContextRetrievalDependencies {
  return {
    resolveActiveProject: vi.fn(async (projectId) => projectId),
    listActiveMaps: vi.fn(async () => [
      { id: 'map-1', knowledgeRevision: 7 },
      { id: 'map-ignored', knowledgeRevision: 2 },
    ]),
    retrieveCandidates: vi.fn(async () => candidates),
    now: () => 1_700_000_060_000,
    createQueryId: () => 'query-1',
  };
}

describe('createContextRetrievalService', () => {
  it('reuses candidate queries until a selected map revision changes', async () => {
    let knowledgeRevision = 7;
    const deps = dependencies([candidate('cached')]);
    deps.listActiveMaps = vi.fn(async () => [{ id: 'map-1', knowledgeRevision }]);
    deps.cache = new ContextRevisionCache();
    deps.cachePartitionId = 'account-1';
    const service = createContextRetrievalService(deps);

    await service.retrieve(request);
    await service.retrieve(request);
    expect(deps.retrieveCandidates).toHaveBeenCalledTimes(1);

    knowledgeRevision = 8;
    deps.retrieveCandidates = vi.fn(async () => [candidate('fresh', { mapRevision: 8 })]);
    const result = await service.retrieve(request);
    expect(deps.retrieveCandidates).toHaveBeenCalledTimes(1);
    expect(result.items[0]?.id).toBe('fresh');
  });

  it('requires an account/profile partition for shared query caches', async () => {
    const deps = dependencies([candidate('cached')]);
    deps.cache = new ContextRevisionCache();
    await expect(createContextRetrievalService(deps).retrieve(request)).rejects.toMatchObject({
      code: 'invalid_dependency_result',
      detail: 'cache_partition',
    });
    expect(deps.retrieveCandidates).not.toHaveBeenCalled();
  });

  it('digests the largest valid request into a bounded cache key', async () => {
    const deps = dependencies([]);
    deps.cache = new ContextRevisionCache();
    deps.cachePartitionId = 'account-1';
    const ids = Array.from({ length: 200 }, (_, index) => {
      const prefix = `id-${index}-`;
      return `${prefix}${'x'.repeat(200 - prefix.length)}`;
    });
    await expect(
      createContextRetrievalService(deps).retrieve({
        projectId: 'project-1',
        userText: 'x'.repeat(32_768),
        explicitMapIds: ['map-1', ...ids.slice(0, 199)],
        explicitEntityIds: ids,
        selectedSkillIds: ids,
        maxTokens: 2_400,
      }),
    ).resolves.toMatchObject({ items: [] });
    expect(deps.retrieveCandidates).toHaveBeenCalledTimes(1);
  });

  it('never caches an invalid dependency result before a valid retry', async () => {
    const deps = dependencies([]);
    deps.cache = new ContextRevisionCache();
    deps.cachePartitionId = 'account-1';
    deps.retrieveCandidates = vi
      .fn()
      .mockResolvedValueOnce([candidate('poisoned', { mapRevision: 6 })])
      .mockResolvedValueOnce([candidate('recovered')]);
    const service = createContextRetrievalService(deps);

    await expect(service.retrieve(request)).rejects.toMatchObject({
      code: 'invalid_candidate',
      detail: 'poisoned',
    });
    await expect(service.retrieve(request)).resolves.toMatchObject({
      items: [expect.objectContaining({ id: 'recovered' })],
    });
    expect(deps.retrieveCandidates).toHaveBeenCalledTimes(2);
  });

  it('orchestrates project, maps, task, candidates, provenance, and app-native citations', async () => {
    const explicit = candidate('explicit', {
      entity: {
        entityId: 'entity-explicit',
        kind: 'test',
        label: 'access.test.ts',
        sourceId: 'source-explicit',
        path: 'app/access.test.ts',
        lineStart: 24,
        lineEnd: 31,
      },
      terminalSessionId: 'terminal-1',
      agentSlug: 'builder',
      skillIds: ['testing'],
      userPinnedImportance: 1,
      relatedEntities: [
        {
          reference: {
            entityId: 'entity-webhook',
            kind: 'endpoint',
            label: 'stripe-webhook',
            sourceId: 'source-webhook',
          },
          provenance: {
            sourceRevision: 'sha-webhook',
            indexedAt: 1_700_000_000_000,
          },
        },
      ],
      provenance: {
        sourceRevision: 'sha-abc',
        indexedAt: 1_700_000_000_000,
        githubRef: 'main',
        githubSha: 'a'.repeat(40),
      },
    });
    const deps = dependencies([candidate('ordinary'), explicit]);

    const result = await createContextRetrievalService(deps).retrieve(request);

    expect(deps.resolveActiveProject).toHaveBeenCalledWith('project-1');
    expect(deps.listActiveMaps).toHaveBeenCalledWith('project-1');
    expect(deps.retrieveCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        mapIds: ['map-1'],
        task: expect.objectContaining({ kind: 'debug' }),
        limit: 200,
      }),
    );
    expect(result).toMatchObject({
      queryId: 'query-1',
      mapRevisions: { 'map-1': 7 },
      omittedCount: 0,
      staleItems: [],
      warnings: [],
      builtAt: 1_700_000_060_000,
    });
    expect(result.items[0]).toMatchObject({
      id: 'explicit',
      exactExcerpt: explicit.exactExcerpt,
      summary: explicit.summary,
      freshness: 'current',
      citation: {
        label: 'access.test.ts lines 24–31',
        action: {
          kind: 'highlight_entity',
          mapId: 'map-1',
          entityId: 'entity-explicit',
          path: 'app/access.test.ts',
          lineStart: 24,
          lineEnd: 31,
        },
      },
      provenance: explicit.provenance,
    });
    expect(result.relatedEntities).toEqual([
      {
        mapId: 'map-1',
        mapRevision: 7,
        entityId: 'entity-webhook',
        kind: 'endpoint',
        label: 'stripe-webhook',
        sourceId: 'source-webhook',
        admittedByItemIds: ['explicit'],
        provenance: {
          sourceRevision: 'sha-webhook',
          indexedAt: 1_700_000_000_000,
        },
      },
    ]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.items)).toBe(true);
  });

  it('uses every required ranking signal deterministically', async () => {
    expect(CONTEXT_RETRIEVAL_RANKING_SIGNALS).toEqual([
      'explicit_attachment',
      'active_file',
      'task_intent',
      'lexical_match',
      'semantic_match',
      'graph_distance',
      'source_trust',
      'recency',
      'freshness',
      'active_terminal',
      'selected_agent',
      'selected_skill',
      'user_pinned_importance',
    ]);
    const allSignals = candidate('all-signals', {
      entity: {
        entityId: 'entity-explicit',
        kind: 'file',
        label: 'all.ts',
        sourceId: 'source-all-signals',
        path: 'app/all.ts',
      },
      activeFile: true,
      lexicalMatch: 1,
      semanticMatch: 1,
      graphDistance: 0,
      sourceTrust: 'user_direct',
      observedAt: 1_700_000_060_000,
      terminalSessionId: 'terminal-1',
      agentSlug: 'builder',
      skillIds: ['testing'],
      userPinnedImportance: 1,
    });
    const result = await createContextRetrievalService(
      dependencies([candidate('baseline'), allSignals]),
    ).retrieve(request);

    expect(result.items.map(({ id }) => id)).toEqual(['all-signals', 'baseline']);
    expect(result.items[0]?.ranking.reasons).toEqual(CONTEXT_RETRIEVAL_RANKING_SIGNALS);
    expect(result.items[0]?.ranking.score).toBe(1);
  });

  it('enforces fresh-only task budgets without truncating exact excerpts', async () => {
    const oversized = candidate('oversized', {
      exactExcerpt: 'x'.repeat(6_000),
    });
    const stale = candidate('stale', {
      freshness: 'stale',
      exactExcerpt: 'stale but otherwise relevant',
    });
    const current = candidate('current', {
      exactExcerpt: 'short exact excerpt',
    });
    const result = await createContextRetrievalService(
      dependencies([oversized, stale, current]),
    ).retrieve({ ...request, maxTokens: 1_200 });

    expect(result.items.map(({ id }) => id)).toEqual(['current']);
    expect(result.items[0]?.exactExcerpt).toBe(current.exactExcerpt);
    expect(result.omittedCount).toBe(2);
    expect(result.staleItems).toEqual(['stale']);
    expect(result.warnings).toEqual(['stale_items_omitted', 'context_budget_exhausted']);
  });

  it('never scans an inactive full map and reports missing project or map state', async () => {
    const noProject = dependencies([candidate('unused')]);
    noProject.resolveActiveProject = vi.fn(async () => null);
    const projectResult = await createContextRetrievalService(noProject).retrieve({
      ...request,
      projectId: null,
      explicitMapIds: undefined,
      explicitEntityIds: undefined,
    });
    expect(noProject.retrieveCandidates).not.toHaveBeenCalled();
    expect(projectResult.warnings).toEqual(['active_project_not_found']);

    const noMap = dependencies([candidate('unused')]);
    noMap.listActiveMaps = vi.fn(async () => []);
    const mapResult = await createContextRetrievalService(noMap).retrieve(request);
    expect(noMap.retrieveCandidates).not.toHaveBeenCalled();
    expect(mapResult.warnings).toEqual(['active_context_map_not_found']);
  });

  it('rejects malformed identifiers, budgets, and untrusted candidate scores', async () => {
    const service = createContextRetrievalService(dependencies([]));
    await expect(service.retrieve({ ...request, maxTokens: 0 })).rejects.toMatchObject({
      code: 'invalid_request',
    });
    await expect(
      service.retrieve({ ...request, explicitEntityIds: ['../escape'] }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    await expect(
      createContextRetrievalService(
        dependencies([candidate('bad', { semanticMatch: Number.NaN })]),
      ).retrieve(request),
    ).rejects.toMatchObject({ code: 'invalid_candidate' });
    await expect(
      createContextRetrievalService(
        dependencies([candidate('old-revision', { mapRevision: 6 })]),
      ).retrieve(request),
    ).rejects.toMatchObject({ code: 'invalid_candidate' });
  });

  it('closes and detaches the request before crossing an async dependency boundary', async () => {
    let getterCalls = 0;
    const accessorRequest = { ...request } as ContextRetrievalRequest;
    Object.defineProperty(accessorRequest, 'userText', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return request.userText;
      },
    });
    await expect(
      createContextRetrievalService(dependencies([])).retrieve(accessorRequest),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    expect(getterCalls).toBe(0);

    const accessorIds = ['map-1'];
    Object.defineProperty(accessorIds, '0', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 'map-1';
      },
    });
    await expect(
      createContextRetrievalService(dependencies([])).retrieve({
        ...request,
        explicitMapIds: accessorIds,
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    expect(getterCalls).toBe(0);

    await expect(
      createContextRetrievalService(dependencies([])).retrieve({
        ...request,
        secret: 'must not cross the dependency boundary',
      } as ContextRetrievalRequest),
    ).rejects.toMatchObject({ code: 'invalid_request' });

    const mutable = structuredClone(request);
    const deps = dependencies([candidate('stable')]);
    deps.resolveActiveProject = vi.fn(async (projectId) => {
      mutable.explicitMapIds = ['map-ignored'];
      mutable.explicitEntityIds = ['entity-other'];
      mutable.maxTokens = 1;
      return projectId;
    });
    const result = await createContextRetrievalService(deps).retrieve(mutable);
    expect(result.mapRevisions).toEqual({ 'map-1': 7 });
    expect(result.items.map(({ id }) => id)).toEqual(['stable']);
    expect(deps.retrieveCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          explicitMapIds: ['map-1'],
          explicitEntityIds: ['entity-explicit'],
          maxTokens: 2_400,
        }),
      }),
    );
  });

  it('rejects hostile citation paths and retains scoped related provenance', async () => {
    for (const path of [
      '../secret.txt',
      '/etc/passwd',
      'C:/Users/viper/secret.txt',
      'app//file.ts',
      'app/file.ts\rspoof',
      'app/file.ts:secret',
      'app/CON.txt',
    ]) {
      await expect(
        createContextRetrievalService(
          dependencies([
            candidate(`bad-path-${path.length}`, {
              entity: {
                entityId: `entity-bad-${path.length}`,
                kind: 'file',
                label: 'bad',
                sourceId: `source-bad-path-${path.length}`,
                path,
              },
              sourceId: `source-bad-path-${path.length}`,
            }),
          ]),
        ).retrieve(request),
      ).rejects.toMatchObject({ code: 'invalid_candidate' });
    }

    const related = (sourceId: string) => ({
      reference: {
        entityId: 'shared-entity-id',
        kind: 'function' as const,
        label: `from ${sourceId}`,
        sourceId,
        path: `app/${sourceId}.ts`,
      },
      provenance: {
        sourceRevision: `rev-${sourceId}`,
        indexedAt: 1_700_000_000_000,
      },
    });
    const result = await createContextRetrievalService(
      dependencies([
        candidate('first', { relatedEntities: [related('source-first')] }),
        candidate('second', { relatedEntities: [related('source-second')] }),
      ]),
    ).retrieve(request);
    expect(result.relatedEntities).toHaveLength(2);
    expect(result.relatedEntities.map(({ sourceId }) => sourceId)).toEqual([
      'source-first',
      'source-second',
    ]);
    expect(result.relatedEntities.every(({ provenance }) => provenance.sourceRevision)).toBe(true);
  });

  it('charges multibyte excerpts and related evidence to the same conservative budget', async () => {
    const manyRelated = Array.from({ length: 12 }, (_, index) => ({
      reference: {
        entityId: `related-${index}`,
        kind: 'file' as const,
        label: `Related ${index} ${'界'.repeat(20)}`,
        sourceId: `related-source-${index}`,
        path: `app/related-${index}.ts`,
      },
      provenance: {
        sourceRevision: `related-rev-${index}`,
        indexedAt: 1_700_000_000_000,
      },
    }));
    const result = await createContextRetrievalService(
      dependencies([
        candidate('large-unicode', {
          exactExcerpt: '界'.repeat(500),
          relatedEntities: manyRelated,
        }),
        candidate('small', { exactExcerpt: 'ok' }),
      ]),
    ).retrieve({ ...request, maxTokens: 1_200 });

    expect(result.items.map(({ id }) => id)).toEqual(['small']);
    expect(result.relatedEntities).toEqual([]);
    expect(result.warnings).toContain('context_budget_exhausted');
  });
});
