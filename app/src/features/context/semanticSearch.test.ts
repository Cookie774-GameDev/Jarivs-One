import { describe, expect, it } from 'vitest';
import {
  ContextSemanticSearchError,
  parseContextEmbeddingRecordV1,
  planContextEmbeddingUpdates,
  rankContextHybrid,
  resolveContextEmbeddingProvider,
  scoreContextEmbeddings,
  type ContextEmbeddingChunkV1,
  type ContextEmbeddingRecordV1,
} from './semanticSearch';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

function chunk(id: string, contentHash = HASH_A, textHash = HASH_B): ContextEmbeddingChunkV1 {
  return {
    version: 1,
    id,
    accountId: 'account-1',
    mapId: 'map-1',
    documentId: 'document-1',
    sourceId: 'source-1',
    chunkOrdinal: Number(id.replace(/\D/g, '')) || 0,
    contentHash,
    textHash,
    text: `Bounded source text for ${id}`,
    provenance: {
      path: 'notes/security.md',
      lineStart: 4,
      lineEnd: 8,
      blockId: 'security-review',
    },
  };
}

function record(
  id: string,
  vector: number[] = [1, 0, 0],
  overrides: Partial<ContextEmbeddingRecordV1> = {},
): ContextEmbeddingRecordV1 {
  return {
    version: 1,
    id,
    accountId: 'account-1',
    mapId: 'map-1',
    documentId: 'document-1',
    sourceId: 'source-1',
    chunkOrdinal: Number(id.replace(/\D/g, '')) || 0,
    contentHash: HASH_A,
    textHash: HASH_B,
    providerKind: 'local',
    providerId: 'ollama',
    modelId: 'nomic-embed-text',
    embeddingVersion: 'ollama:nomic-embed-text@1',
    dimensions: vector.length,
    vector,
    provenance: {
      path: 'notes/security.md',
      lineStart: 4,
      lineEnd: 8,
      blockId: 'security-review',
    },
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

describe('Context semantic search contracts', () => {
  it('defaults to an available local model and permits only an explicitly authorized cloud selection', () => {
    const local = {
      kind: 'local' as const,
      providerId: 'ollama',
      modelId: 'nomic-embed-text',
      embeddingVersion: 'ollama:nomic-embed-text@1',
      available: true,
    };
    expect(
      resolveContextEmbeddingProvider({
        accountId: 'account-1',
        mapId: 'map-1',
        now: 100,
        local,
      }),
    ).toMatchObject({ kind: 'local', providerId: 'ollama' });

    const cloud = {
      kind: 'cloud' as const,
      providerId: 'openai',
      modelId: 'text-embedding-3-small',
      embeddingVersion: 'openai:text-embedding-3-small@2026-01',
      available: true,
      permission: {
        version: 1 as const,
        id: 'permission-1',
        accountId: 'account-1',
        mapId: 'map-1',
        providerId: 'openai',
        purpose: 'context_embedding' as const,
        status: 'granted' as const,
        grantedAt: 90,
        expiresAt: 110,
      },
    };
    expect(
      resolveContextEmbeddingProvider({
        accountId: 'account-1',
        mapId: 'map-1',
        now: 100,
        local,
        selectedCloud: cloud,
      }),
    ).toMatchObject({ kind: 'cloud', providerId: 'openai' });

    expect(() =>
      resolveContextEmbeddingProvider({
        accountId: 'account-1',
        mapId: 'map-1',
        now: 111,
        local,
        selectedCloud: cloud,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ContextSemanticSearchError>>({
        code: 'cloud_permission_required',
      }),
    );
    expect(
      resolveContextEmbeddingProvider({
        accountId: 'account-1',
        mapId: 'map-1',
        now: 100,
        local: { ...local, available: false },
      }),
    ).toBeNull();
  });

  it('plans only changed chunks and exact deletion cleanup for one provider version', () => {
    const provider = resolveContextEmbeddingProvider({
      accountId: 'account-1',
      mapId: 'map-1',
      now: 100,
      local: {
        kind: 'local',
        providerId: 'ollama',
        modelId: 'nomic-embed-text',
        embeddingVersion: 'ollama:nomic-embed-text@1',
        available: true,
      },
    })!;
    const unchanged = record('chunk-1');
    const staleContent = record('chunk-2', [0, 1, 0], { contentHash: HASH_C });
    const deleted = record('chunk-deleted');
    const plan = planContextEmbeddingUpdates({
      accountId: 'account-1',
      mapId: 'map-1',
      now: 100,
      provider,
      chunks: [chunk('chunk-1'), chunk('chunk-2'), chunk('chunk-3')],
      existing: [unchanged, staleContent, deleted],
    });

    expect(plan.unchangedIds).toEqual(['chunk-1']);
    expect(plan.upsertChunks.map(({ id }) => id)).toEqual(['chunk-2', 'chunk-3']);
    expect(plan.deleteIds).toEqual(['chunk-deleted']);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.upsertChunks)).toBe(true);
    expect(Object.isFrozen(plan.upsertChunks[0])).toBe(true);
    expect(Object.isFrozen(plan.upsertChunks[0]?.provenance)).toBe(true);

    const changedVersion = planContextEmbeddingUpdates({
      accountId: 'account-1',
      mapId: 'map-1',
      now: 100,
      provider: { ...provider, embeddingVersion: 'ollama:nomic-embed-text@2' },
      chunks: [chunk('chunk-1')],
      existing: [unchanged],
    });
    expect(changedVersion.upsertChunks).toHaveLength(1);
    expect(changedVersion.deleteIds).toEqual(['chunk-1']);
  });

  it('revalidates the complete current cloud permission at the last pre-embedding boundary', () => {
    const permission = {
      version: 1 as const,
      id: 'permission-1',
      accountId: 'account-1',
      mapId: 'map-1',
      providerId: 'openai',
      purpose: 'context_embedding' as const,
      status: 'granted' as const,
      grantedAt: 90,
      expiresAt: 110,
    };
    const provider = resolveContextEmbeddingProvider({
      accountId: 'account-1',
      mapId: 'map-1',
      now: 100,
      selectedCloud: {
        kind: 'cloud',
        providerId: 'openai',
        modelId: 'text-embedding-3-small',
        embeddingVersion: 'openai:text-embedding-3-small@2026-01',
        available: true,
        permission,
      },
    })!;

    expect(() =>
      planContextEmbeddingUpdates({
        accountId: 'account-1',
        mapId: 'map-1',
        now: 111,
        provider,
        cloudPermission: permission,
        chunks: [chunk('chunk-1')],
        existing: [],
      }),
    ).toThrowError(expect.objectContaining({ code: 'cloud_permission_required' }));
    expect(() =>
      planContextEmbeddingUpdates({
        accountId: 'account-1',
        mapId: 'map-1',
        now: 100,
        provider: { ...provider, permissionId: 'permission-forged' },
        cloudPermission: permission,
        chunks: [chunk('chunk-1')],
        existing: [],
      }),
    ).toThrowError(expect.objectContaining({ code: 'cloud_permission_required' }));
  });

  it('returns deeply immutable validated chunks in update plans', () => {
    const provider = resolveContextEmbeddingProvider({
      accountId: 'account-1',
      mapId: 'map-1',
      now: 100,
      local: {
        kind: 'local',
        providerId: 'ollama',
        modelId: 'nomic-embed-text',
        embeddingVersion: 'ollama:nomic-embed-text@1',
        available: true,
      },
    })!;
    const plan = planContextEmbeddingUpdates({
      accountId: 'account-1',
      mapId: 'map-1',
      now: 100,
      provider,
      chunks: [chunk('chunk-1')],
      existing: [],
    });

    expect(Object.isFrozen(plan.upsertChunks[0])).toBe(true);
    expect(Object.isFrozen(plan.upsertChunks[0]?.provenance)).toBe(true);
  });

  it('validates stored vectors without accepting raw text, unknown fields, or malformed provenance', () => {
    const parsed = parseContextEmbeddingRecordV1(record('chunk-1'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(Object.isFrozen(parsed.value)).toBe(true);
    expect(Object.isFrozen(parsed.value.vector)).toBe(true);

    expect(
      parseContextEmbeddingRecordV1({ ...record('chunk-1'), text: 'must not persist' }),
    ).toMatchObject({ ok: false });
    expect(
      parseContextEmbeddingRecordV1({ ...record('chunk-1'), vector: [1, Number.NaN, 0] }),
    ).toMatchObject({ ok: false });
    expect(
      parseContextEmbeddingRecordV1({
        ...record('chunk-1'),
        provenance: { path: 'C:\\private\\note.md', lineStart: 1, lineEnd: 2 },
      }),
    ).toMatchObject({ ok: false });
    expect(
      parseContextEmbeddingRecordV1({
        ...record('chunk-1'),
        dimensions: 4_097,
        vector: Array.from({ length: 4_097 }, () => 0),
      }),
    ).toMatchObject({ ok: false });
  });

  it('scores only the exact account/map/version and uses bounded deterministic cosine ranking', () => {
    const results = scoreContextEmbeddings({
      accountId: 'account-1',
      mapId: 'map-1',
      providerKind: 'local',
      providerId: 'ollama',
      modelId: 'nomic-embed-text',
      embeddingVersion: 'ollama:nomic-embed-text@1',
      queryVector: [1, 0, 0],
      records: [
        record('chunk-2', [0.5, 0.5, 0]),
        record('chunk-1', [1, 0, 0]),
        record('chunk-other-account', [1, 0, 0], { accountId: 'account-2' }),
        record('chunk-old-version', [1, 0, 0], { embeddingVersion: 'old@1' }),
        record('chunk-other-model', [1, 0, 0], {
          providerId: 'other-local',
          modelId: 'other-model',
        }),
      ],
      limit: 10,
    });

    expect(results).toEqual([
      { id: 'chunk-1', score: 1 },
      { id: 'chunk-2', score: expect.closeTo(Math.SQRT1_2, 10) },
    ]);
    expect(Object.isFrozen(results)).toBe(true);
    expect(() =>
      scoreContextEmbeddings({
        accountId: 'account-1',
        mapId: 'map-1',
        providerKind: 'local',
        providerId: 'ollama',
        modelId: 'nomic-embed-text',
        embeddingVersion: 'ollama:nomic-embed-text@1',
        queryVector: [0, 0, 0],
        records: [],
        limit: 1,
      }),
    ).toThrowError(expect.objectContaining({ code: 'invalid_vector' }));
  });

  it('uses hybrid ranking while retaining lexical evidence and deterministic tie-breaking', () => {
    const ranked = rankContextHybrid({
      lexical: [
        { id: 'lexical-first', score: 20 },
        { id: 'shared', score: 10 },
        { id: 'lexical-third', score: 5 },
      ],
      semantic: [
        { id: 'semantic-first', score: 0.99 },
        { id: 'shared', score: 0.9 },
      ],
      limit: 3,
    });

    expect(ranked[0]?.id).toBe('shared');
    expect(ranked.map(({ id }) => id)).toContain('lexical-first');
    expect(ranked.find(({ id }) => id === 'lexical-first')?.lexicalRank).toBe(1);
    expect(ranked.find(({ id }) => id === 'semantic-first')?.semanticRank).toBe(1);
    expect(Object.isFrozen(ranked)).toBe(true);
    expect(
      rankContextHybrid({ lexical: [], semantic: [{ id: 'only-semantic', score: 1 }] }),
    ).toEqual([]);
  });

  it('uses ASCII code-unit tie-breaking independent of locale collation', () => {
    expect(
      rankContextHybrid({
        lexical: [
          { id: 'Z-result', score: 1 },
          { id: 'a-result', score: 1 },
        ],
        semantic: [],
        limit: 2,
      }).map(({ id }) => id),
    ).toEqual(['Z-result', 'a-result']);
  });
});
