import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createJarvisDb, type JarvisDexie } from '@/lib/db';
import { TEST_INDEXED_DB, uniqueTestDbName } from '@/test/indexedDb';
import type { ContextAssetV2, ContextNoteRevisionV2, ContextNoteV2 } from './contentContracts';
import type { ContextGraphSnapshotV2 } from './contracts';
import {
  ContextContentRepositoryError,
  createContextContentRepository,
  type ContextNoteBundleV2,
} from './contentRepository';
import { createContextGraphRepository } from './repository';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

type Scope = Readonly<{
  accountId: string;
  mapId: string;
  sourceId: string;
  entityId: string;
}>;

const DEFAULT_SCOPE: Scope = {
  accountId: 'account-1',
  mapId: 'map-1',
  sourceId: 'source-1',
  entityId: 'note-entity-1',
};

function graphFixture(
  scope: Scope = DEFAULT_SCOPE,
  entityKind: 'markdown_note' | 'file' = 'markdown_note',
): ContextGraphSnapshotV2 {
  const provenanceId = `${scope.entityId}:provenance`;
  return {
    version: 2,
    map: {
      version: 2,
      id: scope.mapId,
      accountId: scope.accountId,
      projectId: 'project-1',
      name: 'Research map',
      status: 'active',
      sourceIds: [scope.sourceId],
      summary: 'Local research notes.',
      recommendedEntryPoints: [],
      statistics: {
        sourceCount: 1,
        entityCount: 1,
        edgeCount: 0,
        noteCount: entityKind === 'markdown_note' ? 1 : 0,
        attachmentCount: 0,
        staleSourceCount: 0,
      },
      createdAt: 100,
      updatedAt: 100,
      lastIndexedAt: 100,
      knowledgeRevision: 1,
    },
    sources: [
      {
        version: 2,
        id: scope.sourceId,
        accountId: scope.accountId,
        mapId: scope.mapId,
        kind: 'local_folder',
        label: 'Notes',
        status: 'ready',
        localRoot: 'C:\\VibeSpace\\Notes',
        createdAt: 100,
        updatedAt: 100,
        lastIndexedAt: 100,
        sourceRevision: 'source-revision-1',
        parserVersion: 1,
      },
    ],
    entities: [
      {
        version: 2,
        id: scope.entityId,
        accountId: scope.accountId,
        mapId: scope.mapId,
        sourceId: scope.sourceId,
        kind: entityKind,
        label: 'Research note',
        path: 'Research/note-1.md',
        summary: 'Research summary.',
        sourceRevision: 'source-revision-1',
        provenanceIds: [provenanceId],
        createdAt: 100,
        updatedAt: 100,
      },
    ],
    edges: [],
    provenance: [
      {
        version: 2,
        id: provenanceId,
        accountId: scope.accountId,
        mapId: scope.mapId,
        targetKind: 'entity',
        targetId: scope.entityId,
        sourceId: scope.sourceId,
        sourceKind: 'local_folder',
        path: 'Research/note-1.md',
        extractedAt: 100,
        parser: 'content-repository-test',
        confidence: 1,
        sourceRevision: 'source-revision-1',
      },
    ],
  };
}

function assetFixture(
  id: string,
  checksumSha256: string,
  relativePath: string,
  scope: Scope = DEFAULT_SCOPE,
  createdAt = 110,
): ContextAssetV2 {
  const fileName = relativePath.split('/').at(-1)!;
  const markdown = relativePath.endsWith('.md');
  return {
    version: 2,
    id,
    accountId: scope.accountId,
    mapId: scope.mapId,
    entityId: scope.entityId,
    sourceId: scope.sourceId,
    kind: markdown ? 'markdown' : 'text',
    status: 'ready',
    storageMode: 'app_managed',
    storageRootId: 'context-content',
    relativePath,
    fileName,
    mimeType: markdown ? 'text/markdown' : 'text/plain',
    checksumSha256,
    sizeBytes: 128,
    executable: false,
    extraction: {
      mode: 'direct_text',
      status: 'ready',
    },
    createdAt,
    updatedAt: createdAt,
  };
}

function firstBundle(scope: Scope = DEFAULT_SCOPE): ContextNoteBundleV2 {
  const note: ContextNoteV2 = {
    version: 2,
    id: 'note-1',
    accountId: scope.accountId,
    mapId: scope.mapId,
    entityId: scope.entityId,
    sourceId: scope.sourceId,
    kind: 'standard',
    title: 'Research note',
    status: 'active',
    storageMode: 'app_managed',
    storageRootId: 'context-content',
    relativePath: 'notes/note-1.md',
    contentAssetId: 'asset-content-1',
    contentHash: HASH_A,
    currentRevisionId: 'revision-1',
    aliases: ['Research'],
    tags: ['knowledge'],
    blockIds: ['intro'],
    createdAt: 110,
    updatedAt: 110,
  };
  const revision: ContextNoteRevisionV2 = {
    version: 2,
    id: 'revision-1',
    accountId: scope.accountId,
    mapId: scope.mapId,
    noteId: note.id,
    sequence: 1,
    changeKind: 'created',
    authorSource: 'user',
    beforeHash: null,
    afterHash: HASH_A,
    diffAssetId: 'asset-diff-1',
    recoveryMode: 'snapshot',
    recoveryAssetId: 'asset-recovery-1',
    createdAt: 110,
  };
  return {
    note,
    revision,
    assets: [
      assetFixture('asset-content-1', HASH_A, 'content/note-1.md', scope),
      assetFixture('asset-diff-1', HASH_B, 'history/revision-1.diff', scope),
      assetFixture('asset-recovery-1', HASH_A, 'history/revision-1.md', scope),
    ],
  };
}

function nextBundle(
  previous: ContextNoteBundleV2,
  options: Readonly<{
    sequence?: number;
    beforeHash?: string;
    createdAt?: number;
    changeKind?: ContextNoteRevisionV2['changeKind'];
    status?: ContextNoteV2['status'];
    restoredFromRevisionId?: string;
  }> = {},
): ContextNoteBundleV2 {
  const sequence = options.sequence ?? previous.revision.sequence + 1;
  const createdAt = options.createdAt ?? previous.note.updatedAt + 10;
  const afterHash = sequence === 2 ? HASH_B : HASH_C;
  const revisionId = `revision-${sequence}`;
  const contentAssetId = `asset-content-${sequence}`;
  const deleted = options.status === 'deleted';
  const note: ContextNoteV2 = {
    ...previous.note,
    status: options.status ?? 'active',
    contentAssetId,
    contentHash: afterHash,
    currentRevisionId: revisionId,
    updatedAt: createdAt,
    ...(deleted ? { deletedAt: createdAt } : {}),
  };
  if (!deleted) delete note.deletedAt;
  return {
    note,
    revision: {
      version: 2,
      id: revisionId,
      accountId: previous.note.accountId,
      mapId: previous.note.mapId,
      noteId: previous.note.id,
      sequence,
      changeKind: options.changeKind ?? 'edited',
      authorSource: 'user',
      beforeHash: options.beforeHash ?? previous.note.contentHash,
      afterHash,
      diffAssetId: `asset-diff-${sequence}`,
      recoveryMode: 'snapshot',
      recoveryAssetId: `asset-recovery-${sequence}`,
      ...(options.restoredFromRevisionId
        ? { restoredFromRevisionId: options.restoredFromRevisionId }
        : {}),
      createdAt,
    },
    assets: [
      assetFixture(
        contentAssetId,
        afterHash,
        `content/note-${sequence}.md`,
        {
          accountId: previous.note.accountId,
          mapId: previous.note.mapId,
          sourceId: previous.note.sourceId,
          entityId: previous.note.entityId,
        },
        createdAt,
      ),
      assetFixture(
        `asset-diff-${sequence}`,
        HASH_C,
        `history/revision-${sequence}.diff`,
        {
          accountId: previous.note.accountId,
          mapId: previous.note.mapId,
          sourceId: previous.note.sourceId,
          entityId: previous.note.entityId,
        },
        createdAt,
      ),
      assetFixture(
        `asset-recovery-${sequence}`,
        afterHash,
        `history/revision-${sequence}.md`,
        {
          accountId: previous.note.accountId,
          mapId: previous.note.mapId,
          sourceId: previous.note.sourceId,
          entityId: previous.note.entityId,
        },
        createdAt,
      ),
    ],
  };
}

let database: JarvisDexie;
let databaseName: string;

beforeEach(async () => {
  databaseName = uniqueTestDbName('context-content-repository');
  database = createJarvisDb(databaseName, TEST_INDEXED_DB);
  await database.open();
});

afterEach(async () => {
  database.close();
  const cleanup = new Dexie(databaseName, TEST_INDEXED_DB);
  await cleanup.delete();
});

async function seedGraph(
  scope: Scope = DEFAULT_SCOPE,
  entityKind: 'markdown_note' | 'file' = 'markdown_note',
): Promise<void> {
  await createContextGraphRepository(database).putSnapshot(
    scope.accountId,
    graphFixture(scope, entityKind),
    { expectedKnowledgeRevision: 0 },
  );
}

describe('Context content repository', () => {
  it('atomically round-trips a validated first note bundle as immutable account data', async () => {
    await seedGraph();
    const repository = createContextContentRepository(database);
    const input = firstBundle();

    const stored = await repository.putNoteBundle('account-1', input);
    input.note.title = 'mutated input';

    expect(stored.note.title).toBe('Research note');
    expect(Object.isFrozen(stored)).toBe(true);
    expect(Object.isFrozen(stored.assets)).toBe(true);
    await expect(repository.getNoteBundle('account-1', 'note-1')).resolves.toEqual(stored);
    await expect(repository.getNoteBundle('account-2', 'note-1')).resolves.toBeNull();
    await expect(repository.listNotes('account-1', 'map-1')).resolves.toMatchObject([
      { id: 'note-1', contentHash: HASH_A },
    ]);
    await expect(repository.listNoteRevisions('account-1', 'note-1')).resolves.toMatchObject([
      { id: 'revision-1', sequence: 1, afterHash: HASH_A },
    ]);
  });

  it('rejects uncontracted payload fields without persisting any partial rows', async () => {
    await seedGraph();
    const repository = createContextContentRepository(database);
    const invalid = firstBundle() as unknown as {
      note: ContextNoteV2 & { rawContent?: string };
      revision: ContextNoteRevisionV2;
      assets: ContextAssetV2[];
    };
    invalid.note.rawContent = '# secret payload';

    await expect(repository.putNoteBundle('account-1', invalid)).rejects.toMatchObject({
      code: 'invalid_bundle',
    });
    await expect(database.context_notes.count()).resolves.toBe(0);
    await expect(database.context_note_revisions.count()).resolves.toBe(0);
    await expect(database.context_assets.count()).resolves.toBe(0);
  });

  it('requires an account-owned graph map, source, and markdown-note entity', async () => {
    const repository = createContextContentRepository(database);
    await expect(repository.putNoteBundle('account-1', firstBundle())).rejects.toMatchObject({
      code: 'parent_not_found',
    });

    await seedGraph(DEFAULT_SCOPE, 'file');
    await expect(repository.putNoteBundle('account-1', firstBundle())).rejects.toMatchObject({
      code: 'parent_not_found',
    });
    await expect(database.context_notes.count()).resolves.toBe(0);
  });

  it('rejects a source that is no longer attached to the parent map', async () => {
    await seedGraph();
    await database.context_maps.update('map-1', { sourceIds: [] });
    const repository = createContextContentRepository(database);

    await expect(repository.putNoteBundle('account-1', firstBundle())).rejects.toMatchObject({
      code: 'parent_not_found',
    });
    await expect(database.context_notes.count()).resolves.toBe(0);
  });

  it('fails closed on global note, revision, and asset IDs owned by another account', async () => {
    await seedGraph();
    const repository = createContextContentRepository(database);
    await repository.putNoteBundle('account-1', firstBundle());

    const otherScope: Scope = {
      accountId: 'account-2',
      mapId: 'map-2',
      sourceId: 'source-2',
      entityId: 'note-entity-2',
    };
    await seedGraph(otherScope);
    const collision = firstBundle(otherScope);

    await expect(repository.putNoteBundle('account-2', collision)).rejects.toMatchObject({
      code: 'record_id_conflict',
    });
    await expect(database.context_notes.get('note-1')).resolves.toMatchObject({
      accountId: 'account-1',
      mapId: 'map-1',
    });
    await expect(database.context_note_revisions.count()).resolves.toBe(1);
    await expect(database.context_assets.count()).resolves.toBe(3);
  });

  it('rejects dangling and cross-scope asset references atomically', async () => {
    await seedGraph();
    const repository = createContextContentRepository(database);
    const missing = firstBundle();
    missing.assets = missing.assets.filter(({ id }) => id !== 'asset-recovery-1');

    await expect(repository.putNoteBundle('account-1', missing)).rejects.toMatchObject({
      code: 'dangling_asset_reference',
    });

    const crossScope = firstBundle();
    crossScope.assets[0]!.accountId = 'account-2';
    await expect(repository.putNoteBundle('account-1', crossScope)).rejects.toMatchObject({
      code: 'account_mismatch',
    });
    await expect(database.context_notes.count()).resolves.toBe(0);
    await expect(database.context_note_revisions.count()).resolves.toBe(0);
    await expect(database.context_assets.count()).resolves.toBe(0);
  });

  it('appends one exact next revision and preserves immutable history', async () => {
    await seedGraph();
    const repository = createContextContentRepository(database);
    const first = firstBundle();
    const second = nextBundle(first);
    await repository.putNoteBundle('account-1', first);

    await repository.putNoteBundle('account-1', second);

    await expect(repository.listNoteRevisions('account-1', 'note-1')).resolves.toMatchObject([
      { id: 'revision-1', sequence: 1, beforeHash: null, afterHash: HASH_A },
      { id: 'revision-2', sequence: 2, beforeHash: HASH_A, afterHash: HASH_B },
    ]);
    await expect(repository.getNoteBundle('account-1', 'note-1')).resolves.toMatchObject({
      note: {
        currentRevisionId: 'revision-2',
        contentHash: HASH_B,
      },
      revision: {
        id: 'revision-2',
        sequence: 2,
      },
    });
    await expect(repository.listNotes('account-1', 'map-1', 'active')).resolves.toHaveLength(1);
    await expect(repository.listNotes('account-1', 'map-1', 'deleted')).resolves.toHaveLength(0);
  });

  it('lists revisions from one atomic read snapshot during a concurrent append', async () => {
    await seedGraph();
    const repository = createContextContentRepository(database);
    const first = firstBundle();
    const second = nextBundle(first);
    await repository.putNoteBundle('account-1', first);
    const originalGet = database.context_notes.get.bind(database.context_notes);
    let injected = false;
    let append: Promise<unknown> | undefined;
    database.context_notes.get = (async (key: string) => {
      const row = await originalGet(key);
      if (!injected) {
        injected = true;
        append = Dexie.ignoreTransaction(() => repository.putNoteBundle('account-1', second));
        if (!Dexie.currentTransaction) await append;
      }
      return row;
    }) as typeof database.context_notes.get;

    try {
      await expect(repository.listNoteRevisions('account-1', 'note-1')).resolves.toMatchObject([
        { id: 'revision-1', sequence: 1 },
      ]);
      await append;
    } finally {
      database.context_notes.get = originalGet as typeof database.context_notes.get;
    }
    await expect(repository.listNoteRevisions('account-1', 'note-1')).resolves.toHaveLength(2);
  });

  it.each([
    ['a sequence gap', (first: ContextNoteBundleV2) => nextBundle(first, { sequence: 3 })],
    [
      'a stale before hash',
      (first: ContextNoteBundleV2) => nextBundle(first, { beforeHash: HASH_C }),
    ],
    [
      'a non-advancing timestamp',
      (first: ContextNoteBundleV2) => nextBundle(first, { createdAt: 110 }),
    ],
  ])('rejects %s without changing the current note', async (_label, mutate) => {
    await seedGraph();
    const repository = createContextContentRepository(database);
    const first = firstBundle();
    await repository.putNoteBundle('account-1', first);

    await expect(repository.putNoteBundle('account-1', mutate(first))).rejects.toMatchObject({
      code: 'revision_conflict',
    });
    await expect(database.context_notes.get('note-1')).resolves.toMatchObject({
      currentRevisionId: 'revision-1',
      contentHash: HASH_A,
      updatedAt: 110,
    });
    await expect(database.context_note_revisions.count()).resolves.toBe(1);
  });

  it('requires deletion and restoration revisions to match the note lifecycle', async () => {
    await seedGraph();
    const repository = createContextContentRepository(database);
    const first = firstBundle();
    await repository.putNoteBundle('account-1', first);

    const inconsistentDeletion = nextBundle(first, { status: 'deleted' });
    await expect(repository.putNoteBundle('account-1', inconsistentDeletion)).rejects.toMatchObject(
      { code: 'revision_conflict' },
    );

    const deletion = nextBundle(first, {
      status: 'deleted',
      changeKind: 'deleted',
    });
    await repository.putNoteBundle('account-1', deletion);
    const restoration = nextBundle(deletion, {
      changeKind: 'restored',
      status: 'active',
      restoredFromRevisionId: 'revision-2',
    });
    await repository.putNoteBundle('account-1', restoration);

    await expect(repository.getNoteBundle('account-1', 'note-1')).resolves.toMatchObject({
      note: { status: 'active', currentRevisionId: 'revision-3' },
      revision: {
        changeKind: 'restored',
        restoredFromRevisionId: 'revision-2',
      },
    });
    await expect(repository.listNoteRevisions('account-1', 'note-1')).resolves.toHaveLength(3);
  });

  it('rejects a deletion timestamp that is not the append-only revision time', async () => {
    await seedGraph();
    const repository = createContextContentRepository(database);
    const first = firstBundle();
    await repository.putNoteBundle('account-1', first);
    const deletion = nextBundle(first, {
      status: 'deleted',
      changeKind: 'deleted',
    });
    deletion.note.deletedAt = deletion.revision.createdAt + 1;

    await expect(repository.putNoteBundle('account-1', deletion)).rejects.toMatchObject({
      code: 'revision_conflict',
    });
    await expect(database.context_note_revisions.count()).resolves.toBe(1);
  });

  it('rejects unreferenced incoming assets with a dangling nested reference', async () => {
    await seedGraph();
    const repository = createContextContentRepository(database);
    const bundle = firstBundle();
    bundle.assets.push({
      ...assetFixture('asset-extra-1', HASH_C, 'attachments/extra.png'),
      kind: 'image',
      mimeType: 'image/png',
      extraction: { mode: 'none', status: 'not_requested' },
      thumbnailAssetId: 'asset-missing-thumbnail',
    });

    await expect(repository.putNoteBundle('account-1', bundle)).rejects.toMatchObject({
      code: 'dangling_asset_reference',
      detail: 'asset-missing-thumbnail',
    });
    await expect(database.context_assets.count()).resolves.toBe(0);
  });

  it('fails closed when any historical revision loses a required asset', async () => {
    await seedGraph();
    const repository = createContextContentRepository(database);
    const first = firstBundle();
    await repository.putNoteBundle('account-1', first);
    await repository.putNoteBundle('account-1', nextBundle(first));
    await database.context_assets.delete('asset-recovery-1');

    await expect(repository.getNoteBundle('account-1', 'note-1')).rejects.toMatchObject({
      code: 'stored_record_invalid',
      detail: 'asset-recovery-1',
    });
  });

  it('accepts an exact retry but rejects mutation of an existing revision or asset ID', async () => {
    await seedGraph();
    const repository = createContextContentRepository(database);
    const first = firstBundle();
    await repository.putNoteBundle('account-1', first);

    await expect(repository.putNoteBundle('account-1', first)).resolves.toMatchObject({
      note: { id: 'note-1' },
      revision: { id: 'revision-1' },
    });

    const revisionMutation = firstBundle();
    revisionMutation.revision.authorSource = 'migration';
    await expect(repository.putNoteBundle('account-1', revisionMutation)).rejects.toMatchObject({
      code: 'record_id_conflict',
    });

    const assetMutation = firstBundle();
    assetMutation.assets[0]!.sizeBytes = 129;
    await expect(repository.putNoteBundle('account-1', assetMutation)).rejects.toMatchObject({
      code: 'record_id_conflict',
    });
  });

  it('fails closed when persisted note or revision metadata is corrupt', async () => {
    await seedGraph();
    const repository = createContextContentRepository(database);
    await repository.putNoteBundle('account-1', firstBundle());
    await database.context_notes.update('note-1', { relativePath: 'C:\\Secrets\\note.md' });

    await expect(repository.getNoteBundle('account-1', 'note-1')).rejects.toBeInstanceOf(
      ContextContentRepositoryError,
    );
    await expect(repository.getNoteBundle('account-1', 'note-1')).rejects.toMatchObject({
      code: 'stored_record_invalid',
    });
    await expect(repository.listNotes('account-1', 'map-1')).rejects.toMatchObject({
      code: 'stored_record_invalid',
    });
  });

  it('fails closed when persisted history has impossible time or lifecycle truth', async () => {
    await seedGraph();
    const repository = createContextContentRepository(database);
    const first = firstBundle();
    await repository.putNoteBundle('account-1', first);
    await repository.putNoteBundle('account-1', nextBundle(first));

    await database.context_note_revisions.update('revision-2', {
      changeKind: 'deleted',
    });
    await expect(repository.getNoteBundle('account-1', 'note-1')).rejects.toMatchObject({
      code: 'stored_record_invalid',
      detail: 'revision_lifecycle_invalid',
    });

    await database.context_note_revisions.update('revision-2', {
      changeKind: 'edited',
      createdAt: 110,
    });
    await database.context_notes.update('note-1', { updatedAt: 110 });
    await expect(repository.listNoteRevisions('account-1', 'note-1')).rejects.toMatchObject({
      code: 'stored_record_invalid',
      detail: 'revision_history_invalid',
    });
  });

  it('fails closed when a stored restoration target is absent from note history', async () => {
    await seedGraph();
    const repository = createContextContentRepository(database);
    const first = firstBundle();
    const deletion = nextBundle(first, {
      status: 'deleted',
      changeKind: 'deleted',
    });
    const restoration = nextBundle(deletion, {
      changeKind: 'restored',
      status: 'active',
      restoredFromRevisionId: 'revision-2',
    });
    await repository.putNoteBundle('account-1', first);
    await repository.putNoteBundle('account-1', deletion);
    await repository.putNoteBundle('account-1', restoration);
    await database.context_note_revisions.update('revision-3', {
      restoredFromRevisionId: 'revision-missing',
    });

    await expect(repository.getNoteBundle('account-1', 'note-1')).rejects.toMatchObject({
      code: 'stored_record_invalid',
      detail: 'revision_restore_target_invalid',
    });
  });

  it('fails closed on reads after the note loses verified graph ownership', async () => {
    await seedGraph();
    const repository = createContextContentRepository(database);
    await repository.putNoteBundle('account-1', firstBundle());
    await database.context_maps.update('map-1', { sourceIds: [] });

    await expect(repository.getNoteBundle('account-1', 'note-1')).rejects.toMatchObject({
      code: 'stored_record_invalid',
      detail: 'parent_not_found',
    });
    await expect(repository.listNotes('account-1', 'map-1')).rejects.toMatchObject({
      code: 'stored_record_invalid',
      detail: 'parent_not_found',
    });
    await expect(repository.listNoteRevisions('account-1', 'note-1')).rejects.toMatchObject({
      code: 'stored_record_invalid',
      detail: 'parent_not_found',
    });
  });
});
