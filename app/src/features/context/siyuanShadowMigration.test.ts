import { describe, expect, it, vi } from 'vitest';
import type { ContextGraphSnapshotV2 } from './contracts';
import {
  createSiyuanShadowMigration,
  parseSiyuanShadowMigrationManifest,
  type SiyuanShadowMigrationManifest,
  type SiyuanShadowMigrationPort,
  type SiyuanShadowMigrationStore,
} from './siyuanShadowMigration';

function snapshot(mapId: string, revision = 1): ContextGraphSnapshotV2 {
  const sourceId = `${mapId}:source`;
  const entityId = `${mapId}:note`;
  const now = 1_000 + revision;
  return {
    version: 2,
    map: {
      version: 2,
      id: mapId,
      accountId: 'account-1',
      projectId: 'project-1',
      name: `${mapId} Context`,
      status: 'active',
      sourceIds: [sourceId],
      summary: `Summary for ${mapId}`,
      recommendedEntryPoints: [],
      statistics: {
        sourceCount: 1,
        entityCount: 1,
        edgeCount: 0,
        noteCount: 1,
        attachmentCount: 0,
        staleSourceCount: 0,
      },
      createdAt: now,
      updatedAt: now,
      knowledgeRevision: revision,
    },
    sources: [
      {
        version: 2,
        id: sourceId,
        accountId: 'account-1',
        mapId,
        kind: 'linked_vibespace_content',
        label: `${mapId} source`,
        status: 'ready',
        createdAt: now,
        updatedAt: now,
        sourceRevision: `revision-${revision}`,
        parserVersion: 1,
      },
    ],
    entities: [
      {
        version: 2,
        id: entityId,
        accountId: 'account-1',
        mapId,
        sourceId,
        kind: 'markdown_note',
        label: `${mapId} note`,
        path: `notes/${mapId}.md`,
        summary: `Durable note ${mapId}`,
        sourceRevision: `revision-${revision}`,
        provenanceIds: [`${mapId}:provenance`],
        createdAt: now,
        updatedAt: now,
      },
    ],
    edges: [],
    provenance: [
      {
        version: 2,
        id: `${mapId}:provenance`,
        accountId: 'account-1',
        mapId,
        targetKind: 'entity',
        targetId: entityId,
        sourceId,
        sourceKind: 'linked_vibespace_content',
        path: `notes/${mapId}.md`,
        extractedAt: now,
        parser: 'fixture',
        confidence: 1,
        sourceRevision: `revision-${revision}`,
      },
    ],
  };
}

function memoryStore(snapshots: ContextGraphSnapshotV2[]) {
  let manifest: SiyuanShadowMigrationManifest | null = null;
  const store: SiyuanShadowMigrationStore = {
    async listSnapshots(accountId, projectId) {
      expect(accountId).toBe('account-1');
      expect(projectId).toBe('project-1');
      return structuredClone(snapshots);
    },
    async readManifest() {
      return manifest ? structuredClone(manifest) : null;
    },
    async writeManifest(value) {
      manifest = parseSiyuanShadowMigrationManifest(structuredClone(value));
    },
  };
  return { store, manifest: () => manifest, snapshots };
}

function memoryPort() {
  const documents = new Map<
    string,
    { id: string; notebookId: string; path: string; markdown: string }
  >();
  let nextId = 1;
  const port: SiyuanShadowMigrationPort = {
    readManagedDocument: vi.fn(async (_projectId, lookup) => {
      return (
        [...documents.values()].find((document) => document.markdown.includes(lookup.marker)) ??
        null
      );
    }),
    createManagedDocument: vi.fn(async (_projectId, path, markdown) => {
      const document = { id: `document-${nextId++}`, notebookId: 'notebook-1', path, markdown };
      documents.set(document.id, document);
      return document;
    }),
    getBlock: vi.fn(async (_projectId, id) => {
      const document = documents.get(id);
      if (!document) throw new Error('siyuan_block_missing');
      return document;
    }),
    deleteManagedDocument: vi.fn(async (_projectId, id, expectedMarkdown) => {
      const document = documents.get(id);
      if (!document || document.markdown !== expectedMarkdown)
        throw new Error('siyuan_update_conflict');
      documents.delete(id);
    }),
    createManagedSnapshot: vi.fn(async () => undefined),
  };
  return { port, documents };
}

describe('SiYuan staged shadow migration', () => {
  it('previews without writes and requires explicit shadow-write authority', async () => {
    const source = memoryStore([snapshot('map-one')]);
    const target = memoryPort();
    const migration = createSiyuanShadowMigration(source.store, target.port);

    await expect(migration.preview('account-1', 'project-1')).resolves.toMatchObject({
      mapCount: 1,
      entityCount: 1,
      edgeCount: 0,
      provenanceCount: 1,
    });
    await expect(migration.project('account-1', 'project-1', false)).rejects.toThrow(
      'siyuan_shadow_write_not_approved',
    );
    expect(target.port.createManagedDocument).not.toHaveBeenCalled();
    expect(source.manifest()).toBeNull();
  });

  it('projects exact source/provenance, rereads it, retains Context bytes, and is idempotent', async () => {
    const source = memoryStore([snapshot('map-one'), snapshot('map-two')]);
    const original = JSON.stringify(source.snapshots);
    const target = memoryPort();
    let clock = 2_000;
    const migration = createSiyuanShadowMigration(source.store, target.port, {
      now: () => clock++,
    });

    const first = await migration.project('account-1', 'project-1', true);
    expect(first.state).toBe('verified');
    expect(first.manifest).toMatchObject({
      status: 'verified',
      sourceRetained: true,
      snapshotCreated: true,
    });
    expect(first.manifest.mappings).toHaveLength(2);
    expect(target.port.createManagedSnapshot).toHaveBeenCalledTimes(1);
    expect(target.port.createManagedDocument).toHaveBeenCalledTimes(2);
    expect(target.port.getBlock).toHaveBeenCalled();
    expect(JSON.stringify(source.snapshots)).toBe(original);
    for (const document of target.documents.values()) {
      expect(document.markdown).toContain('Original Context records remain authoritative');
      expect(document.markdown).toContain('"provenance"');
      expect(document.markdown).not.toContain('account-1');
    }

    await expect(migration.project('account-1', 'project-1', true)).resolves.toMatchObject({
      state: 'already_verified',
    });
    expect(target.port.createManagedDocument).toHaveBeenCalledTimes(2);
    expect(target.port.createManagedSnapshot).toHaveBeenCalledTimes(1);
  });

  it('persists prepared progress and resumes without duplicating an accepted document', async () => {
    const source = memoryStore([snapshot('map-one'), snapshot('map-two')]);
    const target = memoryPort();
    const create = vi.mocked(target.port.createManagedDocument);
    const original = create.getMockImplementation();
    create.mockImplementationOnce(original!).mockRejectedValueOnce(new Error('simulated_crash'));
    const migration = createSiyuanShadowMigration(source.store, target.port);

    await expect(migration.project('account-1', 'project-1', true)).rejects.toThrow(
      'simulated_crash',
    );
    expect(source.manifest()).toMatchObject({
      status: 'prepared',
      mappings: [{ mapId: 'map-one' }],
    });
    expect(target.documents).toHaveLength(1);

    create.mockImplementation(original!);
    await expect(migration.project('account-1', 'project-1', true)).resolves.toMatchObject({
      state: 'verified',
    });
    expect(target.documents).toHaveLength(2);
    expect(create).toHaveBeenCalledTimes(3);
  });

  it('fails closed on source drift or authoritative round-trip drift', async () => {
    const source = memoryStore([snapshot('map-one')]);
    const target = memoryPort();
    vi.mocked(target.port.createManagedDocument).mockImplementationOnce(
      async (_project, path, markdown) => ({
        id: 'document-drift',
        notebookId: 'notebook-1',
        path,
        markdown: `${markdown}\nchanged`,
      }),
    );
    const migration = createSiyuanShadowMigration(source.store, target.port);
    await expect(migration.project('account-1', 'project-1', true)).rejects.toThrow(
      'siyuan_shadow_round_trip_mismatch',
    );
    expect(source.manifest()).toMatchObject({ status: 'prepared', mappings: [] });

    source.snapshots[0] = snapshot('map-one', 2);
    await expect(migration.project('account-1', 'project-1', true)).rejects.toThrow(
      'siyuan_shadow_source_changed',
    );
  });

  it('rolls back only unchanged owned shadow documents and retains the source authority', async () => {
    const source = memoryStore([snapshot('map-one'), snapshot('map-two')]);
    const original = JSON.stringify(source.snapshots);
    const target = memoryPort();
    const migration = createSiyuanShadowMigration(source.store, target.port);
    const projected = await migration.project('account-1', 'project-1', true);
    const firstId = projected.manifest.mappings[0]!.documentId;
    target.documents.get(firstId)!.markdown += '\nuser edit';

    await expect(migration.rollback('account-1', 'project-1')).rejects.toThrow(
      'siyuan_shadow_remote_conflict',
    );
    expect(source.manifest()?.status).toBe('verified');
    expect(target.documents).toHaveLength(2);
    expect(JSON.stringify(source.snapshots)).toBe(original);

    target.documents.get(firstId)!.markdown = target.documents
      .get(firstId)!
      .markdown.replace(/\nuser edit$/u, '');
    await expect(migration.rollback('account-1', 'project-1')).resolves.toMatchObject({
      state: 'rolled_back',
      manifest: { status: 'rolled_back', sourceRetained: true },
    });
    expect(target.documents).toHaveLength(0);
    await expect(migration.rollback('account-1', 'project-1')).resolves.toMatchObject({
      state: 'already_rolled_back',
    });
  });

  it('resumes a rollback after an operational failure without re-deleting completed work', async () => {
    const source = memoryStore([snapshot('map-one'), snapshot('map-two')]);
    const target = memoryPort();
    const migration = createSiyuanShadowMigration(source.store, target.port);
    await migration.project('account-1', 'project-1', true);
    const remove = vi.mocked(target.port.deleteManagedDocument);
    const original = remove.getMockImplementation();
    remove.mockImplementationOnce(original!).mockRejectedValueOnce(new Error('simulated_stop'));

    await expect(migration.rollback('account-1', 'project-1')).rejects.toThrow('simulated_stop');
    expect(source.manifest()).toMatchObject({
      status: 'rolling_back',
      rollbackCompletedDocumentIds: ['document-2'],
    });
    expect(target.documents).toHaveLength(1);

    remove.mockImplementation(original!);
    await expect(migration.rollback('account-1', 'project-1')).resolves.toMatchObject({
      state: 'rolled_back',
    });
    expect(target.documents).toHaveLength(0);
    expect(remove).toHaveBeenCalledTimes(3);
  });

  it('reconciles a crash after delete success but before its completion checkpoint', async () => {
    const source = memoryStore([snapshot('map-one')]);
    const target = memoryPort();
    const migration = createSiyuanShadowMigration(source.store, target.port);
    await migration.project('account-1', 'project-1', true);
    const write = source.store.writeManifest.bind(source.store);
    let interrupted = false;
    source.store.writeManifest = async (manifest) => {
      if (
        !interrupted &&
        manifest.status === 'rolling_back' &&
        manifest.rollbackCompletedDocumentIds.length === 1
      ) {
        interrupted = true;
        throw new Error('simulated_checkpoint_crash');
      }
      await write(manifest);
    };

    await expect(migration.rollback('account-1', 'project-1')).rejects.toThrow(
      'simulated_checkpoint_crash',
    );
    expect(target.documents).toHaveLength(0);
    expect(source.manifest()).toMatchObject({
      status: 'rolling_back',
      rollbackPendingDocumentId: 'document-1',
      rollbackCompletedDocumentIds: [],
    });

    await expect(migration.rollback('account-1', 'project-1')).resolves.toMatchObject({
      state: 'rolled_back',
      manifest: { rollbackCompletedDocumentIds: ['document-1'] },
    });
    expect(target.port.deleteManagedDocument).toHaveBeenCalledTimes(1);
  });

  it('rejects mapping manifests with extra fields or duplicate ownership', () => {
    const base = {
      version: 1,
      id: 'siyuan-shadow-manifest',
      accountId: 'account-1',
      projectId: 'project-1',
      status: 'prepared',
      sourceDigest: 'a'.repeat(64),
      mappings: [],
      rollbackCompletedDocumentIds: [],
      sourceRetained: true,
      snapshotCreated: false,
      rollbackSnapshotCreated: false,
      createdAt: 1,
      updatedAt: 1,
    };
    expect(() => parseSiyuanShadowMigrationManifest({ ...base, token: 'forbidden' })).toThrow(
      'siyuan_shadow_manifest_invalid',
    );
    expect(() =>
      parseSiyuanShadowMigrationManifest({
        ...base,
        mappings: [
          {
            mapId: 'map-one',
            knowledgeRevision: 1,
            sourceDigest: 'b'.repeat(64),
            marker: 'vibespace-siyuan-shadow:v1 map=map-one',
            path: '/VibeSpace Shadow/map-one',
            documentId: 'document-1',
            markdownDigest: 'c'.repeat(64),
          },
          {
            mapId: 'map-one',
            knowledgeRevision: 1,
            sourceDigest: 'b'.repeat(64),
            marker: 'vibespace-siyuan-shadow:v1 map=map-one',
            path: '/VibeSpace Shadow/map-one',
            documentId: 'document-2',
            markdownDigest: 'c'.repeat(64),
          },
        ],
      }),
    ).toThrow('siyuan_shadow_manifest_invalid');
  });
});
