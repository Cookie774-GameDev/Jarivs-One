import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createJarvisDb, type JarvisDexie } from '@/lib/db';
import { TEST_INDEXED_DB, uniqueTestDbName } from '@/test/indexedDb';
import type { ContextGraphSnapshotV2 } from './contracts';
import { ContextGraphRepositoryError, createContextGraphRepository } from './repository';

function snapshotFixture(
  accountId = 'account-1',
  options: { mapId?: string; revision?: number; entityId?: string } = {},
): ContextGraphSnapshotV2 {
  const mapId = options.mapId ?? 'map-1';
  const entityId = options.entityId ?? 'entity-1';
  const sourceId = `${mapId}:source`;
  const provenanceId = `${entityId}:provenance`;
  const revision = options.revision ?? 1;
  return {
    version: 2,
    map: {
      version: 2,
      id: mapId,
      accountId,
      projectId: 'project-1',
      name: 'Project map',
      status: 'active',
      sourceIds: [sourceId],
      summary: 'Migrated project knowledge.',
      recommendedEntryPoints: [],
      statistics: {
        sourceCount: 1,
        entityCount: 1,
        edgeCount: 0,
        noteCount: 0,
        attachmentCount: 0,
        staleSourceCount: 1,
      },
      createdAt: 100,
      updatedAt: 100 + revision,
      lastIndexedAt: 100,
      knowledgeRevision: revision,
    },
    sources: [
      {
        version: 2,
        id: sourceId,
        accountId,
        mapId,
        kind: 'local_folder',
        label: 'Project root',
        status: 'stale',
        localRoot: 'C:\\Projects\\Example',
        createdAt: 100,
        updatedAt: 100 + revision,
        lastIndexedAt: 100,
        sourceRevision: `revision-${revision}`,
        parserVersion: 1,
      },
    ],
    entities: [
      {
        version: 2,
        id: entityId,
        accountId,
        mapId,
        sourceId,
        kind: 'file',
        label: 'README.md',
        path: 'README.md',
        summary: 'Project readme.',
        sourceRevision: `revision-${revision}`,
        provenanceIds: [provenanceId],
        createdAt: 100,
        updatedAt: 100 + revision,
      },
    ],
    edges: [],
    provenance: [
      {
        version: 2,
        id: provenanceId,
        accountId,
        mapId,
        targetKind: 'entity',
        targetId: entityId,
        sourceId,
        sourceKind: 'local_folder',
        path: 'README.md',
        extractedAt: 100,
        parser: 'repository-test',
        confidence: 1,
        sourceRevision: `revision-${revision}`,
      },
    ],
  };
}

let database: JarvisDexie;
let databaseName: string;

beforeEach(async () => {
  databaseName = uniqueTestDbName('context-repository');
  database = createJarvisDb(databaseName, TEST_INDEXED_DB);
  await database.open();
});

afterEach(async () => {
  database.close();
  const cleanup = new Dexie(databaseName, TEST_INDEXED_DB);
  await cleanup.delete();
});

describe('Context graph repository', () => {
  it('validates snapshots before writing and never persists a partial invalid graph', async () => {
    const repository = createContextGraphRepository(database);
    const invalid = snapshotFixture();
    invalid.edges.push({
      version: 2,
      id: 'edge-invalid',
      accountId: 'account-1',
      mapId: 'map-1',
      sourceEntityId: 'entity-1',
      targetEntityId: 'missing',
      kind: 'links_to',
      provenanceIds: ['edge-invalid:provenance'],
      confidence: 1,
      sourceRevision: 'revision-1',
      createdAt: 100,
      updatedAt: 101,
    });
    invalid.map.statistics.edgeCount = 1;

    await expect(repository.putSnapshot('account-1', invalid)).rejects.toMatchObject({
      code: 'invalid_snapshot',
    });
    await expect(database.context_maps.count()).resolves.toBe(0);
    await expect(database.context_edges.count()).resolves.toBe(0);
  });

  it('round-trips one account-scoped snapshot as detached immutable data', async () => {
    const repository = createContextGraphRepository(database);
    const input = snapshotFixture();
    await repository.putSnapshot('account-1', input, { expectedKnowledgeRevision: 0 });

    const stored = await repository.getSnapshot('account-1', 'map-1');
    expect(stored).not.toBeNull();
    expect(stored?.map.id).toBe('map-1');
    expect(Object.isFrozen(stored)).toBe(true);
    expect(Object.isFrozen(stored?.entities)).toBe(true);
    expect(await repository.getSnapshot('account-2', 'map-1')).toBeNull();

    input.map.name = 'mutated input';
    expect(stored?.map.name).toBe('Project map');
  });

  it('atomically replaces derived rows and enforces optimistic revisions', async () => {
    const repository = createContextGraphRepository(database);
    await repository.putSnapshot('account-1', snapshotFixture(), {
      expectedKnowledgeRevision: 0,
    });

    const replacement = snapshotFixture('account-1', {
      revision: 2,
      entityId: 'entity-2',
    });
    await expect(
      repository.putSnapshot('account-1', replacement, {
        expectedKnowledgeRevision: 0,
      }),
    ).rejects.toMatchObject({ code: 'revision_conflict' });

    await repository.putSnapshot('account-1', replacement, {
      expectedKnowledgeRevision: 1,
    });
    await expect(database.context_entities.get('entity-1')).resolves.toBeUndefined();
    await expect(database.context_provenance.get('entity-1:provenance')).resolves.toBeUndefined();
    await expect(database.context_entities.get('entity-2')).resolves.toMatchObject({
      mapId: 'map-1',
      sourceRevision: 'revision-2',
    });
  });

  it('fails closed on a global id collision owned by another account', async () => {
    const repository = createContextGraphRepository(database);
    await repository.putSnapshot('account-1', snapshotFixture(), {
      expectedKnowledgeRevision: 0,
    });

    await expect(
      repository.putSnapshot('account-2', snapshotFixture('account-2'), {
        expectedKnowledgeRevision: 0,
      }),
    ).rejects.toBeInstanceOf(ContextGraphRepositoryError);
    await expect(
      repository.putSnapshot('account-2', snapshotFixture('account-2'), {
        expectedKnowledgeRevision: 0,
      }),
    ).rejects.toMatchObject({ code: 'record_id_conflict' });
    await expect(database.context_maps.get('map-1')).resolves.toMatchObject({
      accountId: 'account-1',
    });
  });

  it('treats a same-account cross-project map id as a real collision', async () => {
    const repository = createContextGraphRepository(database);
    await repository.putSnapshot('account-1', snapshotFixture(), {
      expectedKnowledgeRevision: 0,
    });
    const otherProject = snapshotFixture();
    otherProject.map.projectId = 'project-2';

    await expect(repository.putSnapshot('account-1', otherProject)).rejects.toMatchObject({
      code: 'record_id_conflict',
    });
    await expect(database.context_maps.get('map-1')).resolves.toMatchObject({
      projectId: 'project-1',
    });
  });

  it.each([
    ['Windows absolute', 'C:\\Private\\secrets.txt'],
    ['UNC absolute', '\\\\server\\share\\secrets.txt'],
    ['POSIX absolute', '/private/secrets.txt'],
  ])('rejects %s graph paths before persistence', async (_label, absolutePath) => {
    const repository = createContextGraphRepository(database);
    const input = snapshotFixture();
    input.entities[0]!.path = absolutePath;
    input.provenance[0]!.path = absolutePath;
    input.map.recommendedEntryPoints = [
      {
        entityId: 'entity-1',
        kind: 'file',
        label: 'README.md',
        sourceId: 'map-1:source',
        path: absolutePath,
      },
    ];

    await expect(repository.putSnapshot('account-1', input)).rejects.toMatchObject({
      code: 'invalid_snapshot',
      detail: 'snapshot_path_not_relative',
    });
    await expect(database.context_maps.count()).resolves.toBe(0);
  });

  it.each(['entity', 'provenance', 'recommended entry point'] as const)(
    'rejects and quarantines a persisted absolute %s path on every read surface',
    async (pathKind) => {
      const repository = createContextGraphRepository(database);
      await repository.putSnapshot('account-1', snapshotFixture(), {
        expectedKnowledgeRevision: 0,
      });
      const absolutePath = 'C:\\Private\\secrets.txt';
      if (pathKind === 'entity') {
        await database.context_entities.update('entity-1', { path: absolutePath });
      } else if (pathKind === 'provenance') {
        await database.context_provenance.update('entity-1:provenance', {
          path: absolutePath,
        });
      } else {
        await database.context_entities.update('entity-1', { path: absolutePath });
        await database.context_provenance.update('entity-1:provenance', {
          path: absolutePath,
        });
        await database.context_maps.update('map-1', {
          recommendedEntryPoints: [
            {
              entityId: 'entity-1',
              kind: 'file',
              label: 'README.md',
              sourceId: 'map-1:source',
              path: absolutePath,
            },
          ],
        });
      }

      await expect(repository.getSnapshot('account-1', 'map-1')).rejects.toMatchObject({
        code: 'snapshot_corrupt',
        detail: 'snapshot_path_not_relative',
      });
      await expect(repository.readWithRecovery('account-1', 'map-1')).resolves.toMatchObject({
        state: 'quarantined',
        reason: 'snapshot_path_not_relative',
      });
      await expect(repository.listMaps('account-1', 'project-1')).resolves.toEqual([]);
      await expect(database.context_quarantine.count()).resolves.toBe(1);
      await expect(database.context_maps.get('map-1')).resolves.toBeDefined();
    },
  );

  it('quarantines corrupt persisted snapshots without deleting source rows', async () => {
    const repository = createContextGraphRepository(database);
    await repository.putSnapshot('account-1', snapshotFixture(), {
      expectedKnowledgeRevision: 0,
    });
    await database.context_maps.update('map-1', {
      statistics: {
        sourceCount: 2,
        entityCount: 1,
        edgeCount: 0,
        noteCount: 0,
        attachmentCount: 0,
        staleSourceCount: 1,
      },
    });

    const result = await repository.readWithRecovery('account-1', 'map-1');
    expect(result).toMatchObject({
      state: 'quarantined',
      reason: 'snapshot_statistics_mismatch',
      recoveryOptions: ['retry', 'restore_backup', 'export_then_discard'],
    });
    await expect(database.context_quarantine.count()).resolves.toBe(1);
    await expect(database.context_maps.get('map-1')).resolves.toBeDefined();

    await repository.readWithRecovery('account-1', 'map-1');
    await expect(database.context_quarantine.count()).resolves.toBe(1);
  });

  it('quarantines corrupt maps discovered during listing without deleting them', async () => {
    const repository = createContextGraphRepository(database);
    await repository.putSnapshot('account-1', snapshotFixture(), {
      expectedKnowledgeRevision: 0,
    });
    await database.context_maps.update('map-1', { name: '' });

    await expect(repository.listMaps('account-1', 'project-1')).resolves.toEqual([]);
    await expect(database.context_quarantine.toArray()).resolves.toMatchObject([
      {
        accountId: 'account-1',
        mapId: 'map-1',
        recordKind: 'map',
        reason: 'map_name_invalid',
      },
    ]);
    await expect(database.context_maps.get('map-1')).resolves.toBeDefined();

    await repository.listMaps('account-1', 'project-1');
    await expect(database.context_quarantine.count()).resolves.toBe(1);
  });

  it('quarantines an invalid persisted project scope before applying a list filter', async () => {
    const repository = createContextGraphRepository(database);
    await repository.putSnapshot('account-1', snapshotFixture(), {
      expectedKnowledgeRevision: 0,
    });
    await database.context_maps.update('map-1', { projectId: '' });

    await expect(repository.listMaps('account-1', 'project-1')).resolves.toEqual([]);
    await expect(database.context_quarantine.toArray()).resolves.toMatchObject([
      {
        accountId: 'account-1',
        mapId: 'map-1',
        recordKind: 'map',
        reason: 'map_project_id_invalid',
      },
    ]);
    await expect(database.context_maps.get('map-1')).resolves.toBeDefined();
  });

  it('lists only maps owned by the requested account and project', async () => {
    const repository = createContextGraphRepository(database);
    await repository.putSnapshot('account-1', snapshotFixture(), {
      expectedKnowledgeRevision: 0,
    });
    await repository.putSnapshot(
      'account-2',
      snapshotFixture('account-2', { mapId: 'map-2', entityId: 'entity-2' }),
      { expectedKnowledgeRevision: 0 },
    );

    await expect(repository.listMaps('account-1', 'project-1')).resolves.toMatchObject([
      { id: 'map-1', accountId: 'account-1' },
    ]);
    await expect(repository.listMaps('account-2', 'project-1')).resolves.toMatchObject([
      { id: 'map-2', accountId: 'account-2' },
    ]);
  });
});
