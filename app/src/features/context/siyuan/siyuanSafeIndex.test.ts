import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ContextMapRecord } from '../tree';
import {
  buildSiyuanSafeIndex,
  createDurableSiyuanIndexJobControl,
  createSiyuanIndexJobControl,
  scanSiyuanFilesystemIndex,
  siyuanIndexPolicyFingerprint,
} from './siyuanSafeIndex';
import {
  checkpointSiyuanIndexJob,
  createSiyuanIndexJob,
  readSiyuanIndexJob,
  replaceSiyuanIndexJob,
  updateSiyuanIndexJobStatus,
} from './siyuanIndexJobStore';

async function resetDurableJobs(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('vibespace-siyuan-index-jobs');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('database_delete_blocked'));
  });
}

function map(): ContextMapRecord {
  return {
    id: 'map-1',
    projectId: 'project-1',
    rootDir: 'C:\\Users\\viper',
    name: 'Viper',
    status: 'active',
    createdAt: 1,
    updatedAt: 1,
    tree: {
      version: 1,
      projectId: 'project-1',
      rootDir: 'C:\\Users\\viper',
      generatedAt: 1,
      model: 'local-structural',
      fileCount: 4,
      totalBytes: 4,
      summary: '',
      nodes: [
        {
          id: 'docs',
          title: 'Documents',
          kind: 'area',
          summary: 'Documents folder',
          path: 'Documents',
          children: [
            {
              id: 'safe',
              title: 'notes.md',
              kind: 'file',
              summary: 'Useful notes',
              path: 'Documents/notes.md',
            },
            {
              id: 'secret',
              title: '.env',
              kind: 'file',
              summary: 'API_KEY=secret-value',
              path: 'Documents/.env',
            },
            {
              id: 'outside',
              title: 'outside.txt',
              kind: 'file',
              summary: 'Outside',
              path: 'D:\\outside.txt',
            },
          ],
        },
      ],
    },
  };
}

describe('SiYuan safe read-only index', () => {
  beforeEach(resetDurableJobs);

  it('keeps source pointers inside the selected root and excludes credentials', () => {
    const index = buildSiyuanSafeIndex(map(), {
      mode: 'all',
      selectedExtensions: [],
      selectedPaths: [],
    });
    expect(index.entries.map((entry) => entry.nodeId)).toEqual(['docs', 'safe']);
    expect(index.entries[1]?.sourcePointer).toBe('C:/Users/viper/Documents/notes.md');
    expect(index.excluded).toBe(2);
  });

  it('maps every safe node while summarizing only the user-selected content', () => {
    const index = buildSiyuanSafeIndex(map(), {
      mode: 'selected',
      selectedExtensions: ['md'],
      selectedPaths: [],
    });
    expect(index.entries).toHaveLength(2);
    expect(index.entries.find((entry) => entry.nodeId === 'docs')?.summary).toBeNull();
    expect(index.entries.find((entry) => entry.nodeId === 'safe')?.summary).toBe('Useful notes');
    expect(index.summarized).toBe(1);
  });

  it('accepts an absolute selected summary folder inside the source root', () => {
    const index = buildSiyuanSafeIndex(map(), {
      mode: 'selected',
      selectedExtensions: [],
      selectedPaths: ['C:\\Users\\viper\\Documents'],
    });
    expect(index.entries.find((entry) => entry.nodeId === 'docs')?.summary).toBe(
      'Documents folder',
    );
    expect(index.entries.find((entry) => entry.nodeId === 'safe')?.summary).toBe('Useful notes');
    expect(index.summarized).toBe(2);
  });

  it('treats selecting the exact source root as all eligible content in that root', () => {
    const index = buildSiyuanSafeIndex(map(), {
      mode: 'selected',
      selectedExtensions: [],
      selectedPaths: ['C:\\Users\\viper'],
    });

    expect(index.entries.find((entry) => entry.nodeId === 'docs')?.summary).toBe(
      'Documents folder',
    );
    expect(index.entries.find((entry) => entry.nodeId === 'safe')?.summary).toBe('Useful notes');
    expect(index.summarized).toBe(2);
  });

  it('migrates a durable legacy root-summary fingerprint without restarting discovery', async () => {
    const legacyFingerprint = JSON.stringify({
      schemaVersion: 1,
      root: 'c:/users/viper',
      summaryMode: 'selected',
      selectedExtensions: [],
      selectedPaths: [],
      excludedPaths: [],
    });
    const legacy = createSiyuanIndexJob({
      projectId: 'project-1',
      mapId: 'map-1',
      canonicalRoot: 'C:/Users/viper',
      policyFingerprint: legacyFingerprint,
      now: 100,
    });
    await replaceSiyuanIndexJob(legacy, {
      path: 'C:/Users/viper',
      relativePath: '',
      parentNodeId: null,
    });
    await checkpointSiyuanIndexJob({
      job: { ...legacy, phase: 'creating_nodes', updatedAt: 200 },
    });

    await scanSiyuanFilesystemIndex(
      map(),
      { mode: 'selected', selectedExtensions: [], selectedPaths: ['C:\\Users\\viper'] },
      { durableJob: { accountId: null, projectId: 'project-1', mapId: 'map-1' } },
    );

    expect((await readSiyuanIndexJob('project-1', 'map-1'))?.policyFingerprint).toContain(
      '"schemaVersion":2',
    );
  });

  it('accepts Windows authority roots that differ only by slash and letter casing', async () => {
    const policy = { mode: 'none' as const, selectedExtensions: [], selectedPaths: [] };
    const existing = createSiyuanIndexJob({
      projectId: 'project-1',
      mapId: 'map-1',
      canonicalRoot: 'c:/users/VIPER',
      policyFingerprint: siyuanIndexPolicyFingerprint('C:/Users/viper', policy, []),
      now: 100,
    });
    await replaceSiyuanIndexJob(existing, {
      path: 'c:/users/VIPER',
      relativePath: '',
      parentNodeId: null,
    });
    await checkpointSiyuanIndexJob({
      job: { ...existing, phase: 'creating_nodes', updatedAt: 200 },
    });

    await expect(
      scanSiyuanFilesystemIndex(map(), policy, {
        durableJob: { accountId: null, projectId: 'project-1', mapId: 'map-1' },
      }),
    ).resolves.toBeDefined();
  });

  it('maps structure without sending any summaries when the user chooses none', () => {
    const index = buildSiyuanSafeIndex(map(), {
      mode: 'none',
      selectedExtensions: ['md'],
      selectedPaths: ['Documents'],
    });
    expect(index.entries).toHaveLength(2);
    expect(index.entries.every((entry) => entry.summary === null)).toBe(true);
  });

  it('honors a user-reviewed absolute exclusion only inside the selected root', () => {
    const index = buildSiyuanSafeIndex(
      map(),
      { mode: 'none', selectedExtensions: [], selectedPaths: [] },
      ['C:\\Users\\viper\\Documents'],
    );
    expect(index.entries).toEqual([]);
    expect(index.excluded).toBe(1);
  });

  it('excludes credential-bearing configuration directories and token files by default', async () => {
    const index = await scanSiyuanFilesystemIndex(
      map(),
      { mode: 'none', selectedExtensions: [], selectedPaths: [] },
      {
        list: async (path) => ({
          ok: true,
          path,
          entries:
            path === 'C:/Users/viper'
              ? [
                  { name: '.codex', path: 'C:/Users/viper/.codex', isDir: true },
                  { name: '.aws', path: 'C:/Users/viper/.aws', isDir: true },
                  { name: 'token.json', path: 'C:/Users/viper/token.json', isDir: false },
                  { name: 'Projects', path: 'C:/Users/viper/Projects', isDir: true },
                ]
              : [],
        }),
      },
    );
    expect(index.entries.map((entry) => entry.relativePath)).toEqual(['Projects']);
    expect(index.excluded).toBe(3);
  });

  it('walks nested filesystem metadata beyond the bounded content preview and fails safely', async () => {
    const listings = new Map<
      string,
      Array<{ name: string; path: string; isDir: boolean; size?: number }>
    >([
      [
        'C:/Users/viper',
        [
          { name: 'Documents', path: 'C:/Users/viper/Documents', isDir: true },
          { name: 'AppData', path: 'C:/Users/viper/AppData/Local/Google/Chrome', isDir: true },
          { name: 'Locked', path: 'C:/Users/viper/Locked', isDir: true },
        ],
      ],
      [
        'C:/Users/viper/Documents',
        [
          { name: '.env', path: 'C:/Users/viper/Documents/.env', isDir: false },
          { name: 'nested', path: 'C:/Users/viper/Documents/nested', isDir: true },
          { name: 'notes.md', path: 'C:/Users/viper/Documents/notes.md', isDir: false, size: 12 },
        ],
      ],
      [
        'C:/Users/viper/Documents/nested',
        [{ name: 'page.html', path: 'C:/Users/viper/Documents/nested/page.html', isDir: false }],
      ],
    ]);
    const progress: number[] = [];
    const index = await scanSiyuanFilesystemIndex(
      map(),
      { mode: 'selected', selectedExtensions: ['md', 'html'], selectedPaths: [] },
      {
        list: async (path) => {
          if (path === 'C:/Users/viper/Locked') {
            return { ok: false, path, error: { code: 'symlink_blocked' } };
          }
          return { ok: true, path, entries: listings.get(path) ?? [] };
        },
        onProgress: ({ indexed }) => progress.push(indexed),
      },
    );

    expect(index.entries.map((entry) => entry.relativePath)).toEqual([
      'Documents',
      'Locked',
      'Documents/nested',
      'Documents/notes.md',
      'Documents/nested/page.html',
    ]);
    expect(
      index.entries.find((entry) => entry.relativePath === 'Documents/notes.md')?.summary,
    ).toBe('Useful notes');
    expect(index.excluded).toBe(2);
    expect(index.unreadable).toBe(1);
    expect(progress.length).toBeGreaterThan(1);
  });

  it('pauses, resumes, and cancels cooperatively without losing the job identity', async () => {
    const control = createSiyuanIndexJobControl();
    control.pause();
    let continued = false;
    const waiting = control.checkpoint().then(() => {
      continued = true;
    });
    await Promise.resolve();
    expect(continued).toBe(false);
    control.resume();
    await waiting;
    expect(continued).toBe(true);
    control.cancel();
    await expect(control.checkpoint()).rejects.toThrow('siyuan_index_cancelled');
  });

  it('enumerates independent directories with bounded concurrency', async () => {
    let active = 0;
    let maximum = 0;
    let releaseChildren!: () => void;
    const childrenReady = new Promise<void>((resolve) => {
      releaseChildren = resolve;
    });
    const index = await scanSiyuanFilesystemIndex(
      map(),
      { mode: 'none', selectedExtensions: [], selectedPaths: [] },
      {
        list: async (path) => {
          if (path === 'C:/Users/viper') {
            return {
              ok: true,
              path,
              entries: [
                { name: 'One', path: 'C:/Users/viper/One', isDir: true },
                { name: 'Two', path: 'C:/Users/viper/Two', isDir: true },
              ],
            };
          }
          active += 1;
          maximum = Math.max(maximum, active);
          if (active === 2) releaseChildren();
          await childrenReady;
          active -= 1;
          return { ok: true, path, entries: [] };
        },
      },
    );
    expect(maximum).toBe(2);
    expect(index.entries.map((entry) => entry.relativePath)).toEqual(['One', 'Two']);
  });

  it('indexes a synthetic source far beyond the 120-file content-preview limit', async () => {
    const files = Array.from({ length: 5_000 }, (_, index) => ({
      name: `file-${index}.txt`,
      path: `C:/Users/viper/large/file-${index}.txt`,
      isDir: false,
      size: index,
    }));
    const index = await scanSiyuanFilesystemIndex(
      { ...map(), rootDir: 'C:\\Users\\viper\\large' },
      { mode: 'none', selectedExtensions: [], selectedPaths: [] },
      { list: async (path) => ({ ok: true, path, entries: files }) },
    );
    expect(index.entries).toHaveLength(5_000);
    expect(index.entries.at(-1)?.sourcePointer).toMatch(/file-\d+\.txt$/u);
  });

  it('resumes discovery from the last durable directory batch after renderer shutdown', async () => {
    const controller = new AbortController();
    let rootReads = 0;
    const list = async (path: string) => {
      if (path === 'C:/Users/viper') {
        rootReads += 1;
        return {
          ok: true as const,
          path,
          entries: [
            { name: 'One', path: 'C:/Users/viper/One', isDir: true },
            { name: 'Two', path: 'C:/Users/viper/Two', isDir: true },
          ],
        };
      }
      if (!controller.signal.aborted) controller.abort('renderer_shutdown');
      return {
        ok: true as const,
        path,
        entries: [{ name: `${path.slice(-3)}.txt`, path: `${path}/child.txt`, isDir: false }],
      };
    };
    const options = {
      list,
      signal: controller.signal,
      durableJob: { accountId: null, projectId: 'project-1', mapId: 'map-1' },
    };
    await expect(
      scanSiyuanFilesystemIndex(
        map(),
        { mode: 'none', selectedExtensions: [], selectedPaths: [] },
        options,
      ),
    ).rejects.toThrow('siyuan_index_cancelled');

    const resumed = await scanSiyuanFilesystemIndex(
      map(),
      { mode: 'none', selectedExtensions: [], selectedPaths: [] },
      {
        list: async (path) => ({
          ok: true,
          path,
          entries:
            path === 'C:/Users/viper'
              ? []
              : [{ name: 'child.txt', path: `${path}/child.txt`, isDir: false }],
        }),
        durableJob: { accountId: null, projectId: 'project-1', mapId: 'map-1' },
      },
    );
    expect(rootReads).toBe(1);
    expect(resumed.entries.map((entry) => entry.relativePath)).toEqual(
      expect.arrayContaining(['One', 'Two', 'One/child.txt', 'Two/child.txt']),
    );
  });

  it('follows durable pause, resume, and cancellation across an app-wide worker', async () => {
    const job = createSiyuanIndexJob({
      accountId: 'account-1',
      projectId: 'project-1',
      mapId: 'map-1',
      canonicalRoot: 'C:/Users/viper',
      policyFingerprint: 'policy',
    });
    await replaceSiyuanIndexJob(job, {
      path: 'C:/Users/viper',
      relativePath: '',
      parentNodeId: null,
    });
    const control = createDurableSiyuanIndexJobControl('project-1', 'map-1');
    await updateSiyuanIndexJobStatus('project-1', 'map-1', 'paused');
    let released = false;
    const waiting = control.checkpoint().then(() => {
      released = true;
    });
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 20));
    expect(released).toBe(false);
    expect(control.state).toBe('paused');
    await updateSiyuanIndexJobStatus('project-1', 'map-1', 'running');
    await waiting;
    expect(control.state).toBe('running');
    await updateSiyuanIndexJobStatus('project-1', 'map-1', 'cancelled');
    await expect(control.checkpoint()).rejects.toThrow('siyuan_index_cancelled');
    expect(control.state).toBe('cancelled');
  });
});
