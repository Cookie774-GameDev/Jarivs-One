import Dexie from 'dexie';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createJarvisDb, type JarvisDexie } from '@/lib/db';
import type { ContextGraphSnapshotV2 } from '@/features/context/contracts';
import { createContextGraphRepository } from '@/features/context/repository';
import {
  createTerminalCliContextContentService,
  type TerminalCliContextContentStorage,
} from './terminalCliContextContent';
import { TEST_INDEXED_DB, uniqueTestDbName } from '@/test/indexedDb';

const ACCOUNT_ID = 'account-a';
const PROJECT_ID = 'project-a';
const MAP_ID = 'map-a';

function graphFixture(): ContextGraphSnapshotV2 {
  const provenanceId = 'provenance-root';
  return {
    version: 2,
    map: {
      version: 2,
      id: MAP_ID,
      accountId: ACCOUNT_ID,
      projectId: PROJECT_ID,
      name: 'VibeSpace',
      status: 'active',
      sourceIds: ['source-a'],
      summary: 'Project Context',
      recommendedEntryPoints: [],
      statistics: {
        sourceCount: 1,
        entityCount: 1,
        edgeCount: 0,
        noteCount: 0,
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
        id: 'source-a',
        accountId: ACCOUNT_ID,
        mapId: MAP_ID,
        kind: 'local_folder',
        label: 'VibeSpace',
        status: 'ready',
        localRoot: 'C:\\VibeSpace',
        createdAt: 100,
        updatedAt: 100,
        lastIndexedAt: 100,
        parserVersion: 1,
      },
    ],
    entities: [
      {
        version: 2,
        id: 'entity-root',
        accountId: ACCOUNT_ID,
        mapId: MAP_ID,
        sourceId: 'source-a',
        kind: 'folder',
        label: 'VibeSpace',
        sourceRevision: 'revision-a',
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
        accountId: ACCOUNT_ID,
        mapId: MAP_ID,
        targetKind: 'entity',
        targetId: 'entity-root',
        sourceId: 'source-a',
        sourceKind: 'local_folder',
        extractedAt: 100,
        parser: 'terminal-cli-test',
        confidence: 1,
        sourceRevision: 'revision-a',
      },
    ],
  };
}

function memoryStorage(): TerminalCliContextContentStorage & {
  files: Map<string, string>;
} {
  const files = new Map<string, string>();
  return {
    files,
    async create(relativePath, content) {
      if (files.has(relativePath)) throw new Error('already_exists');
      files.set(relativePath, content);
    },
    async read(relativePath) {
      const content = files.get(relativePath);
      if (content === undefined) throw new Error('not_found');
      return content;
    },
  };
}

let database: JarvisDexie;
let databaseName: string;
let now: number;
let nonce: number;

beforeEach(async () => {
  databaseName = uniqueTestDbName('terminal-cli-context-content');
  database = createJarvisDb(databaseName, TEST_INDEXED_DB);
  await database.open();
  await createContextGraphRepository(database).putSnapshot(ACCOUNT_ID, graphFixture(), {
    expectedKnowledgeRevision: 0,
  });
  now = 1_000;
  nonce = 0;
});

afterEach(async () => {
  database.close();
  await new Dexie(databaseName, TEST_INDEXED_DB).delete();
});

function service(storage = memoryStorage()) {
  return {
    storage,
    content: createTerminalCliContextContentService({
      database,
      storage,
      now: () => now++,
      randomId: () => `nonce-${++nonce}`,
      digestSha256: async (value) => createHash('sha256').update(value).digest('hex'),
    }),
  };
}

describe('terminal CLI executable Context Notes', () => {
  it('atomically creates and resolves an app-managed note in the selected Context Map', async () => {
    const { content, storage } = service();

    const created = await content.createNote({
      accountId: ACCOUNT_ID,
      projectId: PROJECT_ID,
      mapId: MAP_ID,
      title: 'Untitled',
    });

    expect(created).toMatchObject({ name: 'Untitled' });
    await expect(
      content.openNote({
        accountId: ACCOUNT_ID,
        projectId: PROJECT_ID,
        mapId: MAP_ID,
        name: 'untitled',
      }),
    ).resolves.toEqual(created);
    expect(storage.files.size).toBe(3);
    await expect(database.context_notes.count()).resolves.toBe(1);
    await expect(database.context_note_revisions.count()).resolves.toBe(1);
    await expect(database.context_assets.count()).resolves.toBe(3);
    await expect(database.context_entities.get(created.entityId)).resolves.toMatchObject({
      kind: 'markdown_note',
      label: 'Untitled',
    });
  });

  it('creates today once and appends a durable revision without overwriting history', async () => {
    const { content, storage } = service();
    const daily = await content.openDailyNote({
      accountId: ACCOUNT_ID,
      projectId: PROJECT_ID,
      mapId: MAP_ID,
      localDate: '2026-07-26',
    });
    const reopened = await content.openDailyNote({
      accountId: ACCOUNT_ID,
      projectId: PROJECT_ID,
      mapId: MAP_ID,
      localDate: '2026-07-26',
    });
    expect(reopened.id).toBe(daily.id);

    const appended = await content.appendDailyNote({
      accountId: ACCOUNT_ID,
      projectId: PROJECT_ID,
      mapId: MAP_ID,
      localDate: '2026-07-26',
      text: 'Build passed.',
    });

    expect(appended.id).toBe(daily.id);
    await expect(
      database.context_note_revisions.where('noteId').equals(daily.id).count(),
    ).resolves.toBe(2);
    const stored = await database.context_notes.get(daily.id);
    const currentAsset = await database.context_assets.get(stored!.contentAssetId);
    expect(await storage.read(currentAsset!.relativePath)).toContain('Build passed.');
    expect(storage.files.size).toBe(6);
  });

  it('links two exact notes bidirectionally and keeps repeated linking idempotent', async () => {
    const { content } = service();
    await content.createNote({
      accountId: ACCOUNT_ID,
      projectId: PROJECT_ID,
      mapId: MAP_ID,
      title: 'Architecture',
    });
    await content.createNote({
      accountId: ACCOUNT_ID,
      projectId: PROJECT_ID,
      mapId: MAP_ID,
      title: 'Security',
    });

    const first = await content.linkNotes({
      accountId: ACCOUNT_ID,
      projectId: PROJECT_ID,
      mapId: MAP_ID,
      source: 'Architecture',
      target: 'Security',
    });
    const repeated = await content.linkNotes({
      accountId: ACCOUNT_ID,
      projectId: PROJECT_ID,
      mapId: MAP_ID,
      source: 'Architecture',
      target: 'Security',
    });

    expect(first).toEqual({ created: true, edgeCount: 2 });
    expect(repeated).toEqual({ created: false, edgeCount: 2 });
    await expect(database.context_edges.where('mapId').equals(MAP_ID).count()).resolves.toBe(2);
  });

  it('fails closed on ambiguous names and cross-project map scope', async () => {
    const { content } = service();
    for (let index = 0; index < 2; index += 1) {
      await content.createNote({
        accountId: ACCOUNT_ID,
        projectId: PROJECT_ID,
        mapId: MAP_ID,
        title: 'Duplicate',
      });
    }

    await expect(
      content.openNote({
        accountId: ACCOUNT_ID,
        projectId: PROJECT_ID,
        mapId: MAP_ID,
        name: 'duplicate',
      }),
    ).rejects.toMatchObject({ code: 'conflict' });
    await expect(
      content.createNote({
        accountId: ACCOUNT_ID,
        projectId: 'project-other',
        mapId: MAP_ID,
        title: 'Blocked',
      }),
    ).rejects.toMatchObject({ code: 'permission_denied' });
  });
});
