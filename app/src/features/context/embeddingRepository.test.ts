import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJarvisDb, type JarvisDexie } from '@/lib/db';
import { TEST_INDEXED_DB, uniqueTestDbName } from '@/test/indexedDb';
import {
  ContextEmbeddingRepositoryError,
  createContextEmbeddingRepository,
} from './embeddingRepository';
import { MAX_CONTEXT_EMBEDDING_ITEMS, type ContextEmbeddingRecordV1 } from './semanticSearch';

function mapFixture(accountId = 'account-1', mapId = 'map-1') {
  return {
    version: 2 as const,
    id: mapId,
    accountId,
    projectId: 'project-1',
    name: 'Research map',
    status: 'active' as const,
    sourceIds: ['source-1'],
    summary: 'Research notes.',
    recommendedEntryPoints: [],
    statistics: {
      sourceCount: 1,
      entityCount: 0,
      edgeCount: 0,
      noteCount: 0,
      attachmentCount: 0,
      staleSourceCount: 0,
    },
    createdAt: 100,
    updatedAt: 100,
    lastIndexedAt: 100,
    knowledgeRevision: 1,
  };
}

function record(
  id: string,
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
    contentHash: 'a'.repeat(64),
    textHash: 'b'.repeat(64),
    providerKind: 'local',
    providerId: 'ollama',
    modelId: 'nomic-embed-text',
    embeddingVersion: 'ollama:nomic-embed-text@1',
    dimensions: 3,
    vector: [1, 0, 0],
    provenance: { path: 'notes/research.md', lineStart: 1, lineEnd: 4 },
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

let database: JarvisDexie;
let databaseName: string;

beforeEach(async () => {
  databaseName = uniqueTestDbName('context-embedding-repository');
  database = createJarvisDb(databaseName, TEST_INDEXED_DB);
  await database.open();
  await database.context_maps.put(mapFixture());
});

afterEach(async () => {
  database.close();
  const cleanup = new Dexie(databaseName, TEST_INDEXED_DB);
  await cleanup.delete();
});

describe('Context embedding repository', () => {
  it('atomically applies incremental upserts and exact deletion cleanup without sync writes', async () => {
    const repository = createContextEmbeddingRepository(database);
    await repository.applyUpdate('account-1', 'map-1', {
      upserts: [record('chunk-1'), record('chunk-2')],
      deleteIds: [],
    });
    const next = record('chunk-2', {
      contentHash: 'c'.repeat(64),
      vector: [0, 1, 0],
      updatedAt: 110,
    });

    const rows = await repository.applyUpdate('account-1', 'map-1', {
      upserts: [next, record('chunk-3', { createdAt: 110, updatedAt: 110 })],
      deleteIds: ['chunk-1'],
    });

    expect(rows.map(({ id }) => id)).toEqual(['chunk-2', 'chunk-3']);
    expect(rows[0]).toMatchObject({ contentHash: 'c'.repeat(64), vector: [0, 1, 0] });
    expect(Object.isFrozen(rows)).toBe(true);
    expect(Object.isFrozen(rows[0]?.vector)).toBe(true);
    await expect(database.sync_queue.count()).resolves.toBe(0);
  });

  it('requires an active account-owned map and rejects cross-account global ID collisions', async () => {
    const repository = createContextEmbeddingRepository(database);
    await expect(
      repository.applyUpdate('account-2', 'map-1', {
        upserts: [record('chunk-1', { accountId: 'account-2' })],
        deleteIds: [],
      }),
    ).rejects.toMatchObject({ code: 'parent_not_found' });

    await repository.applyUpdate('account-1', 'map-1', {
      upserts: [record('chunk-1')],
      deleteIds: [],
    });
    await database.context_maps.put(mapFixture('account-2', 'map-2'));
    await expect(
      repository.applyUpdate('account-2', 'map-2', {
        upserts: [
          record('chunk-1', {
            accountId: 'account-2',
            mapId: 'map-2',
            documentId: 'document-2',
          }),
        ],
        deleteIds: [],
      }),
    ).rejects.toMatchObject({ code: 'record_id_conflict' });
    await expect(database.context_embeddings.get('chunk-1')).resolves.toMatchObject({
      accountId: 'account-1',
      mapId: 'map-1',
    });
  });

  it('rejects malformed payloads and out-of-scope deletes without partial mutation', async () => {
    const repository = createContextEmbeddingRepository(database);
    await repository.applyUpdate('account-1', 'map-1', {
      upserts: [record('chunk-1')],
      deleteIds: [],
    });
    await database.context_maps.put(mapFixture('account-2', 'map-2'));
    await database.context_embeddings.put(
      record('chunk-other', { accountId: 'account-2', mapId: 'map-2' }),
    );

    await expect(
      repository.applyUpdate('account-1', 'map-1', {
        upserts: [{ ...record('chunk-2'), rawText: 'must never persist' }],
        deleteIds: ['chunk-other'],
      }),
    ).rejects.toBeInstanceOf(ContextEmbeddingRepositoryError);
    await expect(repository.list('account-1', 'map-1')).resolves.toMatchObject([{ id: 'chunk-1' }]);
    await expect(database.context_embeddings.get('chunk-other')).resolves.toMatchObject({
      accountId: 'account-2',
    });
  });

  it('fails closed on corrupt stored vectors and supports idempotent exact retries', async () => {
    const repository = createContextEmbeddingRepository(database);
    const value = record('chunk-1');
    await repository.applyUpdate('account-1', 'map-1', {
      upserts: [value],
      deleteIds: [],
    });
    await expect(
      repository.applyUpdate('account-1', 'map-1', {
        upserts: [value],
        deleteIds: [],
      }),
    ).resolves.toHaveLength(1);

    await database.context_embeddings.update('chunk-1', { dimensions: 2 });
    await expect(repository.list('account-1', 'map-1')).rejects.toMatchObject({
      code: 'stored_record_invalid',
    });
  });

  it('can delete every record ID accepted by the embedding contract', async () => {
    const repository = createContextEmbeddingRepository(database);
    const longestAcceptedId = `c${'h'.repeat(239)}`;
    await repository.applyUpdate('account-1', 'map-1', {
      upserts: [record(longestAcceptedId)],
      deleteIds: [],
    });

    await expect(
      repository.applyUpdate('account-1', 'map-1', {
        upserts: [],
        deleteIds: [longestAcceptedId],
      }),
    ).resolves.toEqual([]);
  });

  it('purges account-owned embeddings after a map is archived without opening cross-account deletion', async () => {
    const repository = createContextEmbeddingRepository(database);
    await repository.applyUpdate('account-1', 'map-1', {
      upserts: [record('chunk-1')],
      deleteIds: [],
    });
    await database.context_maps.update('map-1', { status: 'archived' });

    await expect(repository.purge('account-2', 'map-1')).rejects.toMatchObject({
      code: 'parent_not_found',
    });
    await expect(database.context_embeddings.count()).resolves.toBe(1);
    await expect(repository.purge('account-1', 'map-1')).resolves.toBe(1);
    await expect(database.context_embeddings.count()).resolves.toBe(0);
  });

  it('fails closed before materializing a scoped corpus above the shared search bound', async () => {
    const repository = createContextEmbeddingRepository(database);
    const scoped = database.context_embeddings
      .where('[accountId+mapId]')
      .equals(['account-1', 'map-1']);
    vi.spyOn(scoped, 'count').mockResolvedValue(MAX_CONTEXT_EMBEDDING_ITEMS + 1);
    const materialize = vi
      .spyOn(scoped, 'toArray')
      .mockRejectedValue(new Error('scope_must_not_be_materialized'));
    vi.spyOn(database.context_embeddings, 'where').mockReturnValue({
      equals: () => scoped,
    } as unknown as ReturnType<JarvisDexie['context_embeddings']['where']>);

    await expect(repository.list('account-1', 'map-1')).rejects.toMatchObject({
      code: 'scope_too_large',
    });
    expect(materialize).not.toHaveBeenCalled();
  });
});
