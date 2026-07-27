import Dexie from 'dexie';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJarvisDb, type JarvisDexie } from '@/lib/db';
import { createContextGraphRepository } from '@/features/context/repository';
import { TEST_INDEXED_DB, uniqueTestDbName } from '@/test/indexedDb';
import { createTerminalCliContextSourceService } from './terminalCliContextSources';

let database: JarvisDexie;
let databaseName: string;
let now: number;
const readLocalFile = vi.fn();

beforeEach(async () => {
  databaseName = uniqueTestDbName('terminal-cli-context-sources');
  database = createJarvisDb(databaseName, TEST_INDEXED_DB);
  await database.open();
  now = 1_000;
  readLocalFile.mockReset();
  readLocalFile.mockResolvedValue({
    content: 'export function bootstrap() { return true; }\n',
  });
});

afterEach(async () => {
  database.close();
  await new Dexie(databaseName, TEST_INDEXED_DB).delete();
});

function service() {
  return createTerminalCliContextSourceService({
    database,
    now: () => now++,
    digestSha256: async (value) => createHash('sha256').update(value).digest('hex'),
    readLocalFile,
  });
}

describe('terminal CLI local-file Context sources', () => {
  it('creates a project-scoped local-file map with portable graph provenance', async () => {
    const created = await service().createLocalFile({
      accountId: 'account-a',
      projectId: 'project-a',
      path: 'C:\\VibeSpace\\src\\bootstrap.ts',
    });

    expect(created).toMatchObject({
      mapId: expect.stringMatching(/^ctxmap-file-/),
      name: 'bootstrap.ts Context Map',
      path: 'C:\\VibeSpace\\src\\bootstrap.ts',
    });
    const snapshot = await createContextGraphRepository(database).getSnapshot(
      'account-a',
      created.mapId,
    );
    expect(snapshot).toMatchObject({
      map: {
        projectId: 'project-a',
        status: 'active',
        statistics: { sourceCount: 1, entityCount: 1 },
      },
      sources: [
        {
          kind: 'local_file',
          localFile: 'C:\\VibeSpace\\src\\bootstrap.ts',
          status: 'ready',
        },
      ],
      entities: [
        {
          kind: 'file',
          path: 'bootstrap.ts',
          summary: expect.stringContaining('bootstrap'),
        },
      ],
    });
  });

  it('redacts detected secrets before any local-file content enters the graph', async () => {
    const secret = 'sk-example0123456789abcdefghijkl';
    readLocalFile.mockResolvedValueOnce({
      content: `export const API_KEY = '${secret}';\n`,
    });

    const created = await service().createLocalFile({
      accountId: 'account-a',
      projectId: 'project-a',
      path: 'C:\\VibeSpace\\src\\config.ts',
    });
    const snapshot = await createContextGraphRepository(database).getSnapshot(
      'account-a',
      created.mapId,
    );
    const serialized = JSON.stringify(snapshot);

    expect(serialized).not.toContain(secret);
    expect(snapshot?.map.summary).toContain('[redacted:');
  });

  it('refreshes the same map at a higher knowledge revision and never changes its identity', async () => {
    const source = service();
    const created = await source.createLocalFile({
      accountId: 'account-a',
      projectId: 'project-a',
      path: 'C:\\VibeSpace\\README.md',
    });
    const before = await database.context_maps.get(created.mapId);
    readLocalFile.mockResolvedValueOnce({ content: '# VibeSpace\n\nUpdated Context.\n' });

    const refreshed = await source.refreshLocalFile({
      accountId: 'account-a',
      projectId: 'project-a',
      mapId: created.mapId,
    });

    expect(refreshed.mapId).toBe(created.mapId);
    const after = await database.context_maps.get(created.mapId);
    expect(after!.knowledgeRevision).toBe(before!.knowledgeRevision + 1);
    expect(after!.summary).toContain('Updated Context');
  });

  it('normalizes Windows path identity without collapsing distinct POSIX paths', async () => {
    const source = service();
    const windows = await source.createLocalFile({
      accountId: 'account-a',
      projectId: 'project-a',
      path: 'C:\\Repo\\Source.ts',
    });
    const sameWindowsFile = await source.createLocalFile({
      accountId: 'account-a',
      projectId: 'project-a',
      path: 'c:/repo/source.ts',
    });
    const posixUpper = await source.createLocalFile({
      accountId: 'account-a',
      projectId: 'project-a',
      path: '/repo/Source.ts',
    });
    const posixLower = await source.createLocalFile({
      accountId: 'account-a',
      projectId: 'project-a',
      path: '/repo/source.ts',
    });

    expect(sameWindowsFile.mapId).toBe(windows.mapId);
    expect(posixLower.mapId).not.toBe(posixUpper.mapId);
  });

  it('fails closed for cross-project refresh and unreadable files', async () => {
    const source = service();
    const created = await source.createLocalFile({
      accountId: 'account-a',
      projectId: 'project-a',
      path: 'C:\\VibeSpace\\README.md',
    });

    await expect(
      source.refreshLocalFile({
        accountId: 'account-a',
        projectId: 'project-b',
        mapId: created.mapId,
      }),
    ).rejects.toMatchObject({ code: 'permission_denied' });

    readLocalFile.mockRejectedValueOnce(new Error('sensitive native path detail'));
    await expect(
      source.createLocalFile({
        accountId: 'account-a',
        projectId: 'project-a',
        path: 'C:\\VibeSpace\\missing.txt',
      }),
    ).rejects.toMatchObject({
      code: 'not_found',
      message: 'The local Context file could not be read.',
    });
  });
});
