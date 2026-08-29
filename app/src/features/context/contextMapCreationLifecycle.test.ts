import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createJarvisDb, type JarvisDexie } from '@/lib/db';
import { TEST_INDEXED_DB, uniqueTestDbName } from '@/test/indexedDb';
import { createContextPersistenceService } from './contextPersistence';
import { populatePersistedCreatedContextMap } from './contextMapCreationLifecycle';
import type { ProjectContextTree } from './tree';

function treeFixture(): ProjectContextTree {
  return {
    version: 1,
    projectId: 'project-1',
    rootDir: 'C:\\Users\\viper\\projects',
    generatedAt: 1_000,
    model: 'siyuan-managed-v1',
    fileCount: 1,
    totalBytes: 128,
    summary: 'Project knowledge.',
    nodes: [
      {
        id: 'file-readme',
        title: 'README.md',
        kind: 'file',
        summary: 'Project readme.',
        path: 'README.md',
        modifiedAt: 1_000,
      },
    ],
    recommendedEntryPoints: ['README.md'],
  };
}

let database: JarvisDexie;
let databaseName: string;

beforeEach(async () => {
  localStorage.clear();
  databaseName = uniqueTestDbName('context-creation-lifecycle');
  database = createJarvisDb(databaseName, TEST_INDEXED_DB);
  await database.open();
});

afterEach(async () => {
  database.close();
  const cleanup = new Dexie(databaseName, TEST_INDEXED_DB);
  await cleanup.delete();
  localStorage.clear();
});

describe('Context Map creation lifecycle', () => {
  it('keeps a newly persisted map active when physical search population fails', async () => {
    const service = createContextPersistenceService(database, localStorage);
    const tree = treeFixture();
    await service.initialize('account-1', tree.projectId);
    const persisted = await service.saveTree('account-1', tree);
    let repairAttempts = 0;

    await expect(
      populatePersistedCreatedContextMap({
        persisted,
        tree,
        populateCreatedMap: async () => {
          throw new Error('context_search_index_snapshot_invalid');
        },
        repairCreatedMap: async () => {
          repairAttempts += 1;
          throw new Error('context_search_index_snapshot_invalid');
        },
      }),
    ).rejects.toThrow('context_search_index_snapshot_invalid');

    expect(repairAttempts).toBe(1);
    const state = await service.load('account-1', tree.projectId);
    expect(state.maps).toMatchObject([
      {
        rootDir: 'C:\\Users\\viper\\projects',
        status: 'active',
      },
    ]);
    expect(state.maps.filter((map) => map.status === 'deleted')).toHaveLength(0);
  });

  it('repairs the same active map after initial search population fails', async () => {
    const service = createContextPersistenceService(database, localStorage);
    const tree = treeFixture();
    await service.initialize('account-1', tree.projectId);
    const persisted = await service.saveTree('account-1', tree);
    let populationAttempts = 0;
    let repairAttempts = 0;

    const result = await populatePersistedCreatedContextMap({
      persisted,
      tree,
      populateCreatedMap: async () => {
        populationAttempts += 1;
        throw new Error('context_search_index_snapshot_invalid');
      },
      repairCreatedMap: async (accountId, map) => {
        repairAttempts += 1;
        expect(accountId).toBe('account-1');
        expect(map.id).toBe(persisted.selectedMapId);
      },
    });

    expect(populationAttempts).toBe(1);
    expect(repairAttempts).toBe(1);
    expect(result.persistedMap.id).toBe(persisted.selectedMapId);

    const state = await service.load('account-1', tree.projectId);
    expect(state.maps.filter((map) => map.status === 'active')).toHaveLength(1);
    expect(state.maps.filter((map) => map.status === 'deleted')).toHaveLength(0);
  });
});
