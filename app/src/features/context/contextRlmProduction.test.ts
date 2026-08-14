import { describe, expect, it, vi } from 'vitest';
import type { VibeSpaceHarness } from '@/lib/harness/types';
import {
  createContextMapRlmRepository,
  createOllamaRlmChildRunner,
  requestsMappedFileAuthority,
} from './contextRlmProduction';

const SHA = `sha256:${'a'.repeat(64)}` as const;

describe('requestsMappedFileAuthority', () => {
  it.each([
    'Please read the files and answer with the exact source filename.',
    'What is the source file for this fact?',
    'Cite the source path.',
  ])('routes explicit mapped-file questions away from chat history: %s', (query) => {
    expect(requestsMappedFileAuthority(query)).toBe(true);
  });

  it('keeps ordinary cross-history research federated', () => {
    expect(requestsMappedFileAuthority('Summarize what we decided about the release.')).toBe(false);
  });
});

function maps() {
  return [
    {
      id: 'map-1',
      projectId: 'project-1',
      rootDir: 'C:\\repo',
      status: 'active' as const,
      updatedAt: 20,
      tree: {
        nodes: [
          {
            id: 'file-1',
            kind: 'file' as const,
            title: 'book.txt',
            summary: 'A public-domain story.',
            path: 'C:\\repo\\book.txt',
            sizeBytes: 128,
            modifiedAt: 20,
          },
        ],
      },
    },
    {
      id: 'map-foreign',
      projectId: 'project-2',
      rootDir: 'C:\\other',
      status: 'active' as const,
      updatedAt: 30,
      tree: {
        nodes: [
          {
            id: 'foreign',
            kind: 'file' as const,
            title: 'foreign.txt',
            summary: 'Must stay isolated.',
            path: 'C:\\other\\foreign.txt',
          },
        ],
      },
    },
  ];
}

describe('production Context Map RLM repository', () => {
  it('shares one authority-build stat pass across five parallel searches', async () => {
    const fixtureMaps = maps();
    const content = 'Observatory Lumen uses cobalt-fern verification 47291.';
    let releaseLexicalSearch!: () => void;
    const lexicalSearchGate = new Promise<void>((resolve) => {
      releaseLexicalSearch = resolve;
    });
    const stat = vi.fn(async (path) => ({
      ok: true as const,
      path,
      kind: 'file' as const,
      size: content.length,
      modifiedMs: 20,
      sha256: SHA,
    }));
    const lexicalSearch = vi.fn(async () => {
      await lexicalSearchGate;
      return [];
    });
    const read = vi.fn(async (path) => ({ ok: true as const, path, content }));
    const repository = createContextMapRlmRepository({
      loadMaps: vi.fn(async () => fixtureMaps),
      stat,
      read,
      lexicalSearch,
    });
    const scope = { accountId: 'account-1', projectId: 'project-1' };

    const searches = Array.from({ length: 5 }, () => repository.search(scope, 'Observatory Lumen'));

    await vi.waitFor(() => expect(lexicalSearch).toHaveBeenCalledTimes(5));
    expect(stat).toHaveBeenCalledTimes(1);
    releaseLexicalSearch();

    const results = await Promise.all(searches);
    expect(results.every((hits) => hits[0]?.preview.includes('cobalt-fern'))).toBe(true);
    expect(read).toHaveBeenCalledTimes(1);
    // The shared source result is still validated after its read.
    expect(stat).toHaveBeenCalledTimes(2);

    await repository.search(scope, 'Observatory Lumen');
    expect(read).toHaveBeenCalledTimes(2);
    // A later sequential search performs a fresh authority build and source
    // revalidation rather than retaining source bytes.
    expect(stat).toHaveBeenCalledTimes(4);
  });

  it('cancels one source-validation waiter without cancelling its concurrent peer', async () => {
    const content = 'Observatory Lumen uses cobalt-fern verification 47291.';
    let releaseRead!: () => void;
    const readGate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    const read = vi.fn(async (path) => {
      await readGate;
      return { ok: true as const, path, content };
    });
    const stat = vi.fn(async (path) => ({
      ok: true as const,
      path,
      kind: 'file' as const,
      size: content.length,
      modifiedMs: 20,
      sha256: SHA,
    }));
    const repository = createContextMapRlmRepository({
      loadMaps: vi.fn(async () => maps()),
      stat,
      read,
      lexicalSearch: vi.fn(async () => []),
    });
    const scope = { accountId: 'account-1', projectId: 'project-1' };
    const cancelled = new AbortController();

    const first = repository.search(scope, 'Observatory Lumen', cancelled.signal);
    const second = repository.search(scope, 'Observatory Lumen');
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    cancelled.abort();

    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    releaseRead();
    await expect(second).resolves.toHaveLength(1);
    expect(read).toHaveBeenCalledTimes(1);
    expect(stat).toHaveBeenCalledTimes(2);
  });

  it('bounds concurrent source validation and preserves stable authority ordering', async () => {
    const fixtureMaps = maps();
    fixtureMaps[0]!.tree.nodes = Array.from({ length: 20 }, (_, index) => ({
      id: `file-${String(index + 1).padStart(2, '0')}`,
      kind: 'file' as const,
      title: `book-${String(index + 1).padStart(2, '0')}.txt`,
      summary: '',
      path: `C:\\repo\\book-${String(index + 1).padStart(2, '0')}.txt`,
      sizeBytes: 128,
      modifiedAt: 20,
    }));
    let activeReads = 0;
    let maximumActiveReads = 0;
    let activeStats = 0;
    let maximumActiveStats = 0;
    const read = vi.fn(async (path: string) => {
      activeReads += 1;
      maximumActiveReads = Math.max(maximumActiveReads, activeReads);
      const ordinal = Number(path.match(/(\d+)\.txt$/u)?.[1] ?? 0);
      await new Promise((resolve) => setTimeout(resolve, 1 + ((20 - ordinal) % 5)));
      activeReads -= 1;
      return { ok: true as const, path, content: 'shared anchor' };
    });
    const repository = createContextMapRlmRepository({
      loadMaps: vi.fn(async () => fixtureMaps),
      stat: vi.fn(async (path) => {
        activeStats += 1;
        maximumActiveStats = Math.max(maximumActiveStats, activeStats);
        await new Promise((resolve) => setTimeout(resolve, 1));
        activeStats -= 1;
        return {
          ok: true as const,
          path,
          kind: 'file' as const,
          size: 128,
          modifiedMs: 20,
          sha256: SHA,
        };
      }),
      read,
      lexicalSearch: vi.fn(async () => []),
    });

    const hits = await repository.search(
      { accountId: 'account-1', projectId: 'project-1' },
      'shared anchor',
    );

    expect(maximumActiveReads).toBeGreaterThan(1);
    expect(maximumActiveReads).toBeLessThanOrEqual(8);
    expect(maximumActiveStats).toBeGreaterThan(1);
    expect(maximumActiveStats).toBeLessThanOrEqual(8);
    expect(read).toHaveBeenCalledTimes(20);
    const filenames = hits.map((hit) => hit.preview.match(/book-(\d+)\.txt/u)?.[1]);
    expect([...filenames].sort()).toEqual(
      Array.from({ length: 20 }, (_, index) => String(index + 1).padStart(2, '0')),
    );
    const repeated = await repository.search(
      { accountId: 'account-1', projectId: 'project-1' },
      'shared anchor',
    );
    expect(repeated.map((hit) => hit.recordId)).toEqual(hits.map((hit) => hit.recordId));
  });

  it('keeps identical map records isolated across account and workspace scopes', async () => {
    const fixtureMaps = maps();
    fixtureMaps[0]!.tree.nodes.push({
      id: 'file-2',
      kind: 'file' as const,
      title: 'second.txt',
      summary: '',
      path: 'C:\\repo\\second.txt',
      sizeBytes: 128,
      modifiedAt: 20,
    });
    const repository = createContextMapRlmRepository({
      loadMaps: vi.fn(async () => fixtureMaps),
      stat: vi.fn(async (path) => ({
        ok: true as const,
        path,
        kind: 'file' as const,
        size: 128,
        modifiedMs: 20,
        sha256: SHA,
      })),
      read: vi.fn(),
      lexicalSearch: vi.fn(),
    });
    const firstRecords = await repository.listRecords({
      accountId: 'account-1',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
    });
    const secondRecords = await repository.listRecords({
      accountId: 'account-2',
      workspaceId: 'workspace-2',
      projectId: 'project-1',
    });
    const first = firstRecords[0]!;
    const second = secondRecords[0]!;

    expect(first?.id).not.toBe(second?.id);
    await expect(repository.getRecord(first!.id)).resolves.toMatchObject({
      accountId: 'account-1',
      workspaceId: 'workspace-1',
    });
    await expect(repository.getRecord(second!.id)).resolves.toMatchObject({
      accountId: 'account-2',
      workspaceId: 'workspace-2',
    });
    await expect(repository.relatedRecordIds!(first.id)).resolves.toEqual([firstRecords[1]!.id]);
  });

  it('evicts a rejected authority build without publishing partial records', async () => {
    const fixtureMaps = maps();
    fixtureMaps[0]!.tree.nodes.push({
      id: 'file-2',
      kind: 'file' as const,
      title: 'second.txt',
      summary: '',
      path: 'C:\\repo\\second.txt',
      sizeBytes: 128,
      modifiedAt: 20,
    });
    let fail = true;
    const stat = vi.fn(async (path: string) => {
      if (fail && path.endsWith('second.txt')) throw new Error('bounded failure');
      return {
        ok: true as const,
        path,
        kind: 'file' as const,
        size: 128,
        modifiedMs: 20,
        sha256: SHA,
      };
    });
    const repository = createContextMapRlmRepository({
      loadMaps: vi.fn(async () => fixtureMaps),
      stat,
      read: vi.fn(),
      lexicalSearch: vi.fn(),
    });
    const scope = { accountId: 'account-1', projectId: 'project-1' };

    await expect(repository.listRecords(scope)).rejects.toThrow('bounded failure');
    const partialId = `rlm:${encodeURIComponent('account-1')}::${encodeURIComponent('project-1')}::map-1:file-1:${'a'.repeat(16)}`;
    await expect(repository.getRecord(partialId)).resolves.toBeUndefined();

    fail = false;
    await expect(repository.listRecords(scope)).resolves.toHaveLength(2);
  });

  it('drains bounded authority workers before rejecting and starting a retry', async () => {
    const fixtureMaps = maps();
    fixtureMaps[0]!.tree.nodes = Array.from({ length: 20 }, (_, index) => ({
      id: `file-${index}`,
      kind: 'file' as const,
      title: `file-${index}.txt`,
      summary: '',
      path: `C:\\repo\\file-${index}.txt`,
      sizeBytes: 128,
      modifiedAt: 20,
    }));
    let failing = true;
    let active = 0;
    let maximumActive = 0;
    let started = 0;
    const stat = vi.fn(async (path: string) => {
      active += 1;
      started += 1;
      maximumActive = Math.max(maximumActive, active);
      if (failing && path.endsWith('file-0.txt')) {
        await new Promise((resolve) => setTimeout(resolve, 1));
        active -= 1;
        throw new Error('first worker failed');
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return {
        ok: true as const,
        path,
        kind: 'file' as const,
        size: 128,
        modifiedMs: 20,
        sha256: SHA,
      };
    });
    const repository = createContextMapRlmRepository({
      loadMaps: vi.fn(async () => fixtureMaps),
      stat,
      read: vi.fn(),
      lexicalSearch: vi.fn(),
    });
    const scope = { accountId: 'account-1', projectId: 'project-1' };

    await expect(repository.listRecords(scope)).rejects.toThrow('first worker failed');
    expect(active).toBe(0);
    expect(started).toBeLessThanOrEqual(8);

    failing = false;
    await expect(repository.listRecords(scope)).resolves.toHaveLength(20);
    expect(maximumActive).toBeLessThanOrEqual(8);
  });

  it('isolates in-flight authority builds by map revision and rebuilds sequential requests', async () => {
    let revision = 20;
    let releaseStats!: () => void;
    const statGate = new Promise<void>((resolve) => {
      releaseStats = resolve;
    });
    const stat = vi.fn(async (path) => {
      await statGate;
      return {
        ok: true as const,
        path,
        kind: 'file' as const,
        size: 128,
        modifiedMs: revision,
        sha256: SHA,
      };
    });
    const loadMaps = vi.fn(async () => {
      const fixtureMaps = maps();
      fixtureMaps[0]!.updatedAt = revision;
      Object.assign(fixtureMaps[0]!.tree.nodes[0]!, { modifiedAt: revision });
      return fixtureMaps;
    });
    const repository = createContextMapRlmRepository({
      loadMaps,
      stat,
      read: vi.fn(),
      lexicalSearch: vi.fn(),
    });
    const scope = { accountId: 'account-1', projectId: 'project-1' };

    const firstRevision = repository.listRecords(scope);
    await vi.waitFor(() => expect(stat).toHaveBeenCalledTimes(1));
    revision = 21;
    const secondRevision = repository.listRecords(scope);
    await vi.waitFor(() => expect(stat).toHaveBeenCalledTimes(2));
    releaseStats();
    await Promise.all([firstRevision, secondRevision]);

    await repository.listRecords(scope);
    expect(stat).toHaveBeenCalledTimes(3);
  });

  it('does not let an older out-of-order build replace a newer scoped publication', async () => {
    let revision = 20;
    let releaseOld!: () => void;
    const oldGate = new Promise<void>((resolve) => {
      releaseOld = resolve;
    });
    let statCall = 0;
    const stat = vi.fn(async (path) => {
      statCall += 1;
      const currentCall = statCall;
      if (currentCall === 1) await oldGate;
      return {
        ok: true as const,
        path,
        kind: 'file' as const,
        size: 128,
        modifiedMs: currentCall === 1 ? 20 : 21,
        sha256: `sha256:${(currentCall === 1 ? 'a' : 'b').repeat(64)}` as const,
      };
    });
    const repository = createContextMapRlmRepository({
      loadMaps: vi.fn(async () => {
        const fixtureMaps = maps();
        fixtureMaps[0]!.updatedAt = revision;
        Object.assign(fixtureMaps[0]!.tree.nodes[0]!, { modifiedAt: revision });
        return fixtureMaps;
      }),
      stat,
      read: vi.fn(),
      lexicalSearch: vi.fn(),
    });
    const scope = { accountId: 'account-1', projectId: 'project-1' };

    const oldRequest = repository.listRecords(scope);
    await vi.waitFor(() => expect(stat).toHaveBeenCalledTimes(1));
    revision = 21;
    const [newRecord] = await repository.listRecords(scope);
    releaseOld();
    const [oldRecord] = await oldRequest;

    await expect(repository.getRecord(newRecord!.id)).resolves.toBeDefined();
    await expect(repository.getRecord(oldRecord!.id)).resolves.toBeUndefined();
  });

  it('allocates publication generation before an older delayed loadMaps resolves', async () => {
    let releaseOldMaps!: () => void;
    const oldMapsGate = new Promise<void>((resolve) => {
      releaseOldMaps = resolve;
    });
    let loadCall = 0;
    const repository = createContextMapRlmRepository({
      loadMaps: vi.fn(async () => {
        loadCall += 1;
        const currentCall = loadCall;
        if (currentCall === 1) await oldMapsGate;
        const fixtureMaps = maps();
        fixtureMaps[0]!.updatedAt = currentCall === 1 ? 20 : 21;
        Object.assign(fixtureMaps[0]!.tree.nodes[0]!, {
          modifiedAt: currentCall === 1 ? 20 : 21,
        });
        return fixtureMaps;
      }),
      stat: vi.fn(async (path) => ({
        ok: true as const,
        path,
        kind: 'file' as const,
        size: 128,
        modifiedMs: loadCall === 1 ? 20 : 21,
        sha256: `sha256:${(loadCall === 1 ? 'a' : 'b').repeat(64)}` as const,
      })),
      read: vi.fn(),
      lexicalSearch: vi.fn(),
    });
    const scope = { accountId: 'account-1', projectId: 'project-1' };

    const oldRequest = repository.listRecords(scope);
    await vi.waitFor(() => expect(loadCall).toBe(1));
    const [newRecord] = await repository.listRecords(scope);
    await expect(repository.getRecord(newRecord!.id)).resolves.toEqual(newRecord);
    releaseOldMaps();
    const [oldRecord] = await oldRequest;

    await expect(repository.getRecord(newRecord!.id)).resolves.toBeDefined();
    await expect(repository.getRecord(oldRecord!.id)).resolves.toBeUndefined();
  });

  it.each(['projectId', 'workspaceId', 'worktreeId'] as const)(
    'fails closed when runtime scope %s is null instead of missing',
    async (field) => {
      const repository = createContextMapRlmRepository({
        loadMaps: vi.fn(async () => maps()),
        stat: vi.fn(),
        read: vi.fn(),
        lexicalSearch: vi.fn(),
      });

      await expect(
        repository.listRecords({
          accountId: 'account-1',
          [field]: null,
        } as never),
      ).rejects.toThrow('invalid context scope');
    },
  );

  it('uses a fixed-length digest record ID without delimiter or truncated-hash collisions', async () => {
    const longId = 'map:with:delimiters/'.repeat(40);
    const fixtureMaps = maps();
    fixtureMaps[0]!.id = longId;
    fixtureMaps[0]!.tree.nodes[0]!.id = `${longId}:node`;
    fixtureMaps[0]!.tree.nodes[0]!.path = 'C:\\repo\\book.txt';
    let hash: `sha256:${string}` = `sha256:${'a'.repeat(63)}0`;
    const repository = createContextMapRlmRepository({
      loadMaps: vi.fn(async () => fixtureMaps),
      stat: vi.fn(async (path) => ({
        ok: true as const,
        path,
        kind: 'file' as const,
        size: 128,
        modifiedMs: 20,
        sha256: hash,
      })),
      read: vi.fn(),
      lexicalSearch: vi.fn(),
    });
    const scope = {
      accountId: 'account:one',
      workspaceId: 'workspace:two',
      projectId: 'project-1',
      worktreeId: 'worktree/four',
    };

    const [first] = await repository.listRecords(scope);
    hash = `sha256:${'a'.repeat(63)}1`;
    const [second] = await repository.listRecords(scope);

    expect(first!.id).toMatch(/^rlm:[a-f0-9]{64}$/u);
    expect(first!.id.length).toBe(68);
    expect(first!.id.length).toBeLessThanOrEqual(512);
    expect(second!.id).not.toBe(first!.id);
  });

  it('fails closed when source bytes change after the authority snapshot', async () => {
    const changedSha = `sha256:${'b'.repeat(64)}` as const;
    const stat = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true as const,
        path: 'C:\\repo\\book.txt',
        kind: 'file' as const,
        size: 64,
        modifiedMs: 20,
        sha256: SHA,
      })
      .mockResolvedValueOnce({
        ok: true as const,
        path: 'C:\\repo\\book.txt',
        kind: 'file' as const,
        size: 64,
        modifiedMs: 21,
        sha256: changedSha,
      });
    const repository = createContextMapRlmRepository({
      loadMaps: vi.fn(async () => maps()),
      stat,
      read: vi.fn(async (path) => ({
        ok: true as const,
        path,
        content: 'Observatory Lumen uses cobalt-fern.',
      })),
      lexicalSearch: vi.fn(async () => [
        {
          documentId: 'file-1',
          excerpt: 'Observatory Lumen uses cobalt-fern.',
          score: 10,
        },
      ]),
    });

    await expect(
      repository.search({ accountId: 'account-1', projectId: 'project-1' }, 'Observatory Lumen'),
    ).resolves.toEqual([]);
  });

  it('publishes a successful peer when the latest shared-build waiter aborts', async () => {
    let releaseStat!: () => void;
    const statGate = new Promise<void>((resolve) => {
      releaseStat = resolve;
    });
    const repository = createContextMapRlmRepository({
      loadMaps: vi.fn(async () => maps()),
      stat: vi.fn(async (path) => {
        await statGate;
        return {
          ok: true as const,
          path,
          kind: 'file' as const,
          size: 128,
          modifiedMs: 20,
          sha256: SHA,
        };
      }),
      read: vi.fn(async (path) => ({ ok: true as const, path, content: 'safe source' })),
      lexicalSearch: vi.fn(),
    });
    const scope = { accountId: 'account-1', projectId: 'project-1' };
    const controller = new AbortController();

    const successfulPeer = repository.listRecords(scope);
    const cancelledLatest = repository.listRecords(scope, controller.signal);
    controller.abort();
    releaseStat();

    await expect(cancelledLatest).rejects.toMatchObject({ name: 'AbortError' });
    const [record] = await successfulPeer;
    await expect(repository.getRecord(record!.id)).resolves.toEqual(record);
    await expect(repository.readSource!(record!)).resolves.toBeDefined();
  });

  it('evicts a rejected shared source read so a later search can retry', async () => {
    let failRead = true;
    const read = vi.fn(async (path) => {
      if (failRead) throw new Error('bounded read failure');
      return { ok: true as const, path, content: 'Observatory Lumen uses cobalt-fern.' };
    });
    const repository = createContextMapRlmRepository({
      loadMaps: vi.fn(async () => maps()),
      stat: vi.fn(async (path) => ({
        ok: true as const,
        path,
        kind: 'file' as const,
        size: 128,
        modifiedMs: 20,
        sha256: SHA,
      })),
      read,
      lexicalSearch: vi.fn(async () => []),
    });
    const scope = { accountId: 'account-1', projectId: 'project-1' };

    await expect(
      Promise.all([
        repository.search(scope, 'Observatory Lumen'),
        repository.search(scope, 'Observatory Lumen'),
      ]),
    ).rejects.toThrow('bounded read failure');
    expect(read).toHaveBeenCalledTimes(1);

    failRead = false;
    await expect(repository.search(scope, 'Observatory Lumen')).resolves.toHaveLength(1);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('creates immutable versioned records from active scoped file authorities', async () => {
    const stat = vi.fn(async (path) => ({
      ok: true as const,
      path,
      kind: 'file' as const,
      size: 128,
      modifiedMs: 20,
      sha256: SHA,
    }));
    const fixtureMaps = maps();
    fixtureMaps[0]!.tree.nodes[0]!.path = 'book.txt';
    const repository = createContextMapRlmRepository({
      loadMaps: vi.fn(async () => fixtureMaps),
      stat,
      read: vi.fn(),
      lexicalSearch: vi.fn(),
    });

    const records = await repository.listRecords({
      accountId: 'account-1',
      projectId: 'project-1',
    });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      accountId: 'account-1',
      projectId: 'project-1',
      sourceKind: 'file_version',
      sourceId: expect.stringMatching(/^rlm-source:[a-f0-9]{64}$/u),
      contentHash: 'a'.repeat(64),
      contentRef: 'C:\\repo\\book.txt',
      path: 'C:\\repo\\book.txt',
    });
    expect(records[0]?.id).toMatch(/^rlm:[a-f0-9]{64}$/u);
    expect(stat).toHaveBeenCalledWith(
      'C:\\repo\\book.txt',
      true,
      expect.objectContaining({ root: 'C:\\repo' }),
    );
  });

  it('turns indexed lexical hits into exact byte pointers after validating source bytes', async () => {
    const content = 'before\nNeedle: exact punctuation!\nafter';
    const repository = createContextMapRlmRepository({
      loadMaps: vi.fn(async () => maps()),
      stat: vi.fn(async (path) => ({
        ok: true as const,
        path,
        kind: 'file' as const,
        size: content.length,
        modifiedMs: 20,
        sha256: SHA,
      })),
      read: vi.fn(async (path) => ({ ok: true as const, path, content })),
      lexicalSearch: vi.fn(async () => [
        {
          documentId: 'file-1',
          title: 'book.txt',
          path: 'C:\\repo\\book.txt',
          sourceType: 'local_file',
          excerpt: 'Needle: exact punctuation!',
          matchReason: 'full_text',
          updatedAt: 20,
          score: 9,
        },
      ]),
    });

    const hits = await repository.search(
      { accountId: 'account-1', projectId: 'project-1' },
      'Needle: exact punctuation!',
    );

    const start = new TextEncoder().encode('before\n').length;
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      recordId: expect.stringMatching(/^rlm:[a-f0-9]{64}$/u),
      pointer: {
        byteStart: start,
        byteEnd: new TextEncoder().encode(content).length,
        contentHash: 'a'.repeat(64),
      },
    });
  });

  it('falls back to a bounded exact scan when the derivative index has no hit', async () => {
    const content = 'prefix\nrare anchor across\nlines exact continuation\nsuffix';
    const repository = createContextMapRlmRepository({
      loadMaps: vi.fn(async () => maps()),
      stat: vi.fn(async (path) => ({
        ok: true as const,
        path,
        kind: 'file' as const,
        size: content.length,
        modifiedMs: 20,
        sha256: SHA,
      })),
      read: vi.fn(async (path) => ({ ok: true as const, path, content })),
      lexicalSearch: vi.fn(async () => []),
    });

    const hits = await repository.search(
      { accountId: 'account-1', projectId: 'project-1' },
      '"rare anchor across lines"',
    );

    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      recordId: expect.stringMatching(/^rlm:[a-f0-9]{64}$/u),
      preview: expect.stringContaining('rare anchor across\nlines exact continuation'),
      pointer: {
        contentHash: 'a'.repeat(64),
      },
    });
  });

  it('admits and exact-scans mapped corpus shards larger than the former 512 KiB ceiling', async () => {
    const anchor = 'Observatory Lumen color cobalt-fern verification 47291';
    const content = `${'bounded corpus filler '.repeat(30_000)}\n${anchor}`;
    expect(new TextEncoder().encode(content).length).toBeGreaterThan(512 * 1024);
    expect(new TextEncoder().encode(content).length).toBeLessThan(1024 * 1024);
    const repository = createContextMapRlmRepository({
      loadMaps: vi.fn(async () => maps()),
      stat: vi.fn(async (path) => ({
        ok: true as const,
        path,
        kind: 'file' as const,
        size: new TextEncoder().encode(content).length,
        modifiedMs: 20,
        sha256: SHA,
      })),
      read: vi.fn(async (path, maxBytes) => {
        expect(maxBytes).toBe(1024 * 1024);
        return { ok: true as const, path, content };
      }),
      lexicalSearch: vi.fn(async () => []),
    });

    const hits = await repository.search(
      { accountId: 'account-1', projectId: 'project-1' },
      'Please read the files and answer: what color phrase and verification number belong to Observatory Lumen?',
    );

    expect(hits).toHaveLength(1);
    expect(hits[0]?.preview).toContain('[SOURCE FILE: book.txt]');
    expect(hits[0]?.preview).toContain(anchor);
    expect(hits[0]?.score).toBeGreaterThan(1);
  });

  it('retrieves the exact Q1 literature anchor and physical source filename', async () => {
    const fixtureMaps = maps();
    fixtureMaps[0]!.tree.nodes[0]!.title = '0007-pg2600.txt';
    fixtureMaps[0]!.tree.nodes[0]!.path = 'C:\\repo\\0007-pg2600.txt';
    fixtureMaps[0]!.tree.nodes.push({
      id: 'distractor-1',
      kind: 'file' as const,
      title: '0025-pg4300.txt',
      summary: '',
      path: 'C:\\repo\\0025-pg4300.txt',
      sizeBytes: 128,
      modifiedAt: 20,
    });
    const content = `The inhabitants discussed İstanbul and a bit of ordinary business. ${'Kutúzov with a letter about unrelated orders. '.repeat(62)}${'unrelated literature filler '.repeat(30)}commander in chief the buzz of talk ceased and all eyes were fixed on\nKutúzov who, wearing a white cap with a red band, was walking nearby. Kutúzov carried a note about a bit of talk in ordinary business. ${'Kutúzov rode away with unrelated dispatches. '.repeat(45)}`;
    const distractor =
      'The inhabitants discussed a bit of ordinary business while everybody watched the road.';
    const repository = createContextMapRlmRepository({
      loadMaps: vi.fn(async () => fixtureMaps),
      stat: vi.fn(async (path) => ({
        ok: true as const,
        path,
        kind: 'file' as const,
        size: content.length,
        modifiedMs: 20,
        sha256: SHA,
      })),
      read: vi.fn(async (path) => ({
        ok: true as const,
        path,
        content: path.endsWith('0025-pg4300.txt') ? distractor : content,
      })),
      lexicalSearch: vi.fn(async () => []),
    });

    const hits = await repository.search(
      { accountId: 'account-1', projectId: 'project-1' },
      'in the literature files, what are the eight words right after the bit where talk stopped and everybody watched Kutúzov? quote only those words and show me the file',
    );
    const entityOffsets = [...content.matchAll(/Kutúzov/gu)].map((match) => match.index);
    const contextStart = content.indexOf('talk ceased');

    expect(entityOffsets).toHaveLength(109);
    expect(entityOffsets[62]).toBe(content.indexOf('Kutúzov who'));
    expect(hits[0]?.preview).toContain('[SOURCE FILE: 0007-pg2600.txt]');
    expect(hits[0]?.pointer.byteStart).toBe(
      new TextEncoder().encode(content.slice(0, contextStart)).length,
    );
    expect(hits[0]?.preview).toContain(
      '\ntalk ceased and all eyes were fixed on\nKutúzov who, wearing a white cap with a red',
    );
    expect(hits[0]?.preview).toContain('who, wearing a white cap with a red');
    expect(hits[0]!.pointer.byteEnd).toBeGreaterThan(
      new TextEncoder().encode(content.slice(0, content.indexOf('red band') + 'red band'.length))
        .length,
    );
  });

  it('anchors Unicode singleton names without promoting sentence-leading directives', async () => {
    const fixtureMaps = maps();
    const content =
      'Tell the reader about ordinary records. Later everyone watched Élodie, while Łukasz took the cobalt ledger.';
    const repository = createContextMapRlmRepository({
      loadMaps: vi.fn(async () => fixtureMaps),
      stat: vi.fn(async (path) => ({
        ok: true as const,
        path,
        kind: 'file' as const,
        size: new TextEncoder().encode(content).length,
        modifiedMs: 20,
        sha256: SHA,
      })),
      read: vi.fn(async (path) => ({ ok: true as const, path, content })),
      lexicalSearch: vi.fn(async () => []),
    });

    const hits = await repository.search(
      { accountId: 'account-1', projectId: 'project-1' },
      'Tell me whom everyone watched: Élodie; show the ledger',
    );

    expect(hits[0]?.pointer.byteStart).toBe(
      new TextEncoder().encode(content.slice(0, content.indexOf('Élodie'))).length,
    );
    expect(hits[0]?.preview).toContain('\nÉlodie, while Łukasz');
  });

  it('anchors a singleton name ending in a non-ASCII letter', async () => {
    const fixtureMaps = maps();
    const content =
      'Find ordinary filing instructions first. Much later the witness René recorded the cobalt ledger.';
    const repository = createContextMapRlmRepository({
      loadMaps: vi.fn(async () => fixtureMaps),
      stat: vi.fn(async (path) => ({
        ok: true as const,
        path,
        kind: 'file' as const,
        size: new TextEncoder().encode(content).length,
        modifiedMs: 20,
        sha256: SHA,
      })),
      read: vi.fn(async (path) => ({ ok: true as const, path, content })),
      lexicalSearch: vi.fn(async () => []),
    });

    const hits = await repository.search(
      { accountId: 'account-1', projectId: 'project-1' },
      'Find what René recorded in the ledger',
    );

    expect(hits[0]?.pointer.byteStart).toBe(
      new TextEncoder().encode(content.slice(0, content.indexOf('René'))).length,
    );
    expect(hits[0]?.preview).toContain('\nRené recorded');
  });

  it('locates only the exact bounded singleton inside a contextual span', async () => {
    const fixtureMaps = maps();
    const content =
      'The clue appeared beside Annette before the exact witness Ann recorded the cobalt ledger.';
    const repository = createContextMapRlmRepository({
      loadMaps: vi.fn(async () => fixtureMaps),
      stat: vi.fn(async (path) => ({
        ok: true as const,
        path,
        kind: 'file' as const,
        size: new TextEncoder().encode(content).length,
        modifiedMs: 20,
        sha256: SHA,
      })),
      read: vi.fn(async (path) => ({ ok: true as const, path, content })),
      lexicalSearch: vi.fn(async () => []),
    });

    const hits = await repository.search(
      { accountId: 'account-1', projectId: 'project-1' },
      'Find the clue connected to Ann',
    );

    expect(hits[0]?.pointer.byteStart).toBe(
      new TextEncoder().encode(content.slice(0, content.indexOf('Ann recorded'))).length,
    );
    expect(hits[0]?.preview).toContain('\nAnn recorded');
  });

  it('ranks a contiguous entity phrase above scattered generic question words', async () => {
    const fixtureMaps = maps();
    fixtureMaps[0]!.tree.nodes.push({
      id: 'file-2',
      kind: 'file' as const,
      title: 'unrelated.txt',
      summary: '',
      path: 'C:\\repo\\unrelated.txt',
      sizeBytes: 128,
      modifiedAt: 20,
    });
    const repository = createContextMapRlmRepository({
      loadMaps: vi.fn(async () => fixtureMaps),
      stat: vi.fn(async (path) => ({
        ok: true as const,
        path,
        kind: 'file' as const,
        size: 128,
        modifiedMs: 20,
        sha256: SHA,
      })),
      read: vi.fn(async (path) => ({
        ok: true as const,
        path,
        content: path.endsWith('book.txt')
          ? 'Observatory Lumen is cobalt-fern, verification number 47291.'
          : 'Many records discuss color phrases and verification numbers.',
      })),
      lexicalSearch: vi.fn(async () => []),
    });

    const hits = await repository.search(
      { accountId: 'account-1', projectId: 'project-1' },
      'Please read the files: what color phrase and verification number belong to Observatory Lumen?',
    );

    expect(hits[0]?.preview).toContain('Observatory Lumen');
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
  });

  it('retrieves both exact Q3 neighboring handoff records within the first three results', async () => {
    const fixtureMaps = maps();
    fixtureMaps[0]!.tree.nodes[0]!.title = '0050-orbit.txt';
    fixtureMaps[0]!.tree.nodes[0]!.path = 'C:\\repo\\0050-orbit.txt';
    fixtureMaps[0]!.tree.nodes.push({
      id: 'file-2',
      kind: 'file' as const,
      title: '0051-orbit.txt',
      summary: '',
      path: 'C:\\repo\\0051-orbit.txt',
      sizeBytes: 128,
      modifiedAt: 20,
    });
    fixtureMaps[0]!.tree.nodes.push(
      {
        id: 'literature-44',
        kind: 'file' as const,
        title: '0044-pg1234.txt',
        summary: '',
        path: 'C:\\repo\\0044-pg1234.txt',
        sizeBytes: 128,
        modifiedAt: 20,
      },
      {
        id: 'literature-80',
        kind: 'file' as const,
        title: '0080-pg5678.txt',
        summary: '',
        path: 'C:\\repo\\0080-pg5678.txt',
        sizeBytes: 128,
        modifiedAt: 20,
      },
      {
        id: 'literature-01',
        kind: 'file' as const,
        title: '0001-pg9999.txt',
        summary: '',
        path: 'C:\\repo\\0001-pg9999.txt',
        sizeBytes: 128,
        modifiedAt: 20,
      },
    );
    const contents: Record<string, string> = {
      'C:\\repo\\0050-orbit.txt': `ORBIT HANDOFF PART ONE. ${'ordinary relay ledger filler '.repeat(30)}The phrase left in part one was glass-peregrine.`,
      'C:\\repo\\0051-orbit.txt': `ORBIT HANDOFF PART TWO. ${'ordinary relay ledger filler '.repeat(30)}The receiving clerk gave the answer harbor-saffron.`,
      'C:\\repo\\0044-pg1234.txt':
        'A relay handoff between neighboring literature records mentioned a phrase and answer.',
      'C:\\repo\\0080-pg5678.txt':
        'Part one and part two describe a receiving clerk, phrase, and answer in generic prose.',
      'C:\\repo\\0001-pg9999.txt':
        'A neighboring relay handoff has part one, part two, a phrase, a receiving clerk, and an answer.',
    };
    const repository = createContextMapRlmRepository({
      loadMaps: vi.fn(async () => fixtureMaps),
      stat: vi.fn(async (path) => ({
        ok: true as const,
        path,
        kind: 'file' as const,
        size: contents[path]!.length,
        modifiedMs: 20,
        sha256: SHA,
      })),
      read: vi.fn(async (path) => ({ ok: true as const, path, content: contents[path]! })),
      lexicalSearch: vi.fn(async () => [
        {
          documentId: 'file-1',
          excerpt: contents['C:\\repo\\0050-orbit.txt'],
          score: 100,
        },
        {
          documentId: 'file-2',
          excerpt: contents['C:\\repo\\0051-orbit.txt'],
          score: 1,
        },
        {
          documentId: 'literature-44',
          excerpt: contents['C:\\repo\\0044-pg1234.txt'],
          score: 500,
        },
        {
          documentId: 'literature-80',
          excerpt: contents['C:\\repo\\0080-pg5678.txt'],
          score: 500,
        },
        {
          documentId: 'literature-01',
          excerpt: contents['C:\\repo\\0001-pg9999.txt'],
          score: 500,
        },
      ]),
    });

    const hits = await repository.search(
      { accountId: 'account-1', projectId: 'project-1' },
      'the orbit relay handoff is split between neighboring files — what phrase was left in part one and what answer did the receiving clerk give in part two? show both files',
    );

    expect(hits.slice(0, 3).map((hit) => hit.preview)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('[SOURCE FILE: 0050-orbit.txt]'),
        expect.stringContaining('[SOURCE FILE: 0051-orbit.txt]'),
      ]),
    );
    expect(hits.find((hit) => hit.preview.includes('0050-orbit.txt'))?.preview).toContain(
      'glass-peregrine',
    );
    expect(hits.find((hit) => hit.preview.includes('0051-orbit.txt'))?.preview).toContain(
      'harbor-saffron',
    );
  });

  it('boosts only exact mapped leaf tokens and never root-path substrings', async () => {
    const fixtureMaps = maps();
    fixtureMaps[0]!.tree.nodes[0]!.title = '0050-orbit.txt';
    fixtureMaps[0]!.tree.nodes[0]!.path = 'C:\\orbit-root\\0050-orbit.txt';
    fixtureMaps[0]!.tree.nodes.push(
      {
        id: 'orbital',
        kind: 'file' as const,
        title: '0051-orbital.txt',
        summary: '',
        path: 'C:\\repo\\0051-orbital.txt',
        sizeBytes: 128,
        modifiedAt: 20,
      },
      {
        id: 'root-only',
        kind: 'file' as const,
        title: '0052-corpus.txt',
        summary: '',
        path: 'C:\\orbit-root\\0052-corpus.txt',
        sizeBytes: 128,
        modifiedAt: 20,
      },
    );
    const content = 'relay handoff phrase answer';
    const repository = createContextMapRlmRepository({
      loadMaps: vi.fn(async () => fixtureMaps),
      stat: vi.fn(async (path) => ({
        ok: true as const,
        path,
        kind: 'file' as const,
        size: content.length,
        modifiedMs: 20,
        sha256: SHA,
      })),
      read: vi.fn(async (path) => ({ ok: true as const, path, content })),
      lexicalSearch: vi.fn(async () => []),
    });

    const hits = await repository.search(
      { accountId: 'account-1', projectId: 'project-1' },
      'find the orbit relay handoff phrase and answer',
    );
    const scoreByFile = new Map(
      hits.map((hit) => [hit.preview.match(/\[SOURCE FILE: ([^\]]+)\]/)?.[1], hit.score]),
    );

    expect(hits[0]?.preview).toContain('[SOURCE FILE: 0050-orbit.txt]');
    expect(scoreByFile.get('0050-orbit.txt')).toBeGreaterThan(scoreByFile.get('0051-orbital.txt')!);
    expect(scoreByFile.get('0051-orbital.txt')).toBe(scoreByFile.get('0052-corpus.txt'));
  });

  it('returns deterministic tie ordering when derivative input order changes', async () => {
    const fixtureMaps = maps();
    fixtureMaps[0]!.tree.nodes.push({
      id: 'file-2',
      kind: 'file' as const,
      title: 'second.txt',
      summary: '',
      path: 'C:\\repo\\second.txt',
      sizeBytes: 128,
      modifiedAt: 20,
    });
    const content = 'shared deterministic anchor';
    let reverse = false;
    const indexed = [
      { documentId: 'file-1', excerpt: content, score: 10 },
      { documentId: 'file-2', excerpt: content, score: 10 },
    ];
    const repository = createContextMapRlmRepository({
      loadMaps: vi.fn(async () => fixtureMaps),
      stat: vi.fn(async (path) => ({
        ok: true as const,
        path,
        kind: 'file' as const,
        size: content.length,
        modifiedMs: 20,
        sha256: SHA,
      })),
      read: vi.fn(async (path) => ({ ok: true as const, path, content })),
      lexicalSearch: vi.fn(async () => {
        reverse = !reverse;
        return reverse ? [...indexed].reverse() : indexed;
      }),
    });
    const scope = { accountId: 'account-1', projectId: 'project-1' };

    const first = await repository.search(scope, 'shared deterministic anchor');
    const second = await repository.search(scope, 'shared deterministic anchor');

    expect(second.map((hit) => hit.recordId)).toEqual(first.map((hit) => hit.recordId));
  });

  it('recovers source-authoritative hits omitted by a nonempty stale lexical index', async () => {
    const fixtureMaps = maps();
    fixtureMaps[0]!.tree.nodes.push({
      id: 'file-2',
      kind: 'file' as const,
      title: 'observatory-lumen.txt',
      summary: '',
      path: 'C:\\repo\\observatory-lumen.txt',
      sizeBytes: 128,
      modifiedAt: 20,
    });
    const contents: Record<string, string> = {
      'C:\\repo\\book.txt': 'A generic record mentions a recovery color without naming any site.',
      'C:\\repo\\observatory-lumen.txt': 'Observatory Lumen uses the recovery color cobalt-fern.',
    };
    const repository = createContextMapRlmRepository({
      loadMaps: vi.fn(async () => fixtureMaps),
      stat: vi.fn(async (path) => ({
        ok: true as const,
        path,
        kind: 'file' as const,
        size: contents[path]!.length,
        modifiedMs: 20,
        sha256: SHA,
      })),
      read: vi.fn(async (path) => ({ ok: true as const, path, content: contents[path]! })),
      lexicalSearch: vi.fn(async () => [
        {
          documentId: 'file-1',
          excerpt: contents['C:\\repo\\book.txt'],
          score: 100,
        },
      ]),
    });

    const hits = await repository.search(
      { accountId: 'account-1', projectId: 'project-1' },
      'From the mapped files only: what recovery color belongs to Observatory Lumen?',
    );

    expect(hits[0]?.preview).toContain('[SOURCE FILE: observatory-lumen.txt]');
    expect(hits[0]?.preview).toContain('cobalt-fern');
  });

  it('rejects traversing relative node paths before native filesystem access', async () => {
    const fixtureMaps = maps();
    fixtureMaps[0]!.tree.nodes[0]!.path = '../outside.txt';
    const stat = vi.fn();
    const repository = createContextMapRlmRepository({
      loadMaps: vi.fn(async () => fixtureMaps),
      stat,
      read: vi.fn(),
      lexicalSearch: vi.fn(),
    });

    await expect(
      repository.listRecords({ accountId: 'account-1', projectId: 'project-1' }),
    ).resolves.toEqual([]);
    expect(stat).not.toHaveBeenCalled();
  });

  it('preserves local and Git source families and retrieves bounded evidence from both', async () => {
    const localContent = 'Restart support landed with checkpoint marker cross-source-uat.';
    const fixtureMaps = [
      {
        ...maps()[0]!,
        sourceType: 'local_folder' as const,
        tree: {
          nodes: [
            {
              ...maps()[0]!.tree.nodes[0]!,
              summary: localContent,
            },
          ],
        },
      },
      {
        id: 'map-git',
        projectId: 'project-1',
        rootDir: 'https://github.com/acme/vibespace/tree/abc123',
        status: 'active' as const,
        updatedAt: 21,
        sourceType: 'github_repository' as const,
        github: {
          owner: 'acme',
          repository: 'vibespace',
          resolvedCommitSha: 'abc123',
          visibility: 'private' as const,
        },
        tree: {
          nodes: [
            {
              id: 'git-file-1',
              kind: 'file' as const,
              title: 'pause.ts',
              summary: 'Pause support landed with checkpoint marker cross-source-uat.',
              path: 'https://github.com/acme/vibespace/blob/abc123/pause.ts',
            },
          ],
        },
      },
    ];
    const repository = createContextMapRlmRepository({
      loadMaps: vi.fn(async () => fixtureMaps),
      stat: vi.fn(async (path) => ({
        ok: true as const,
        path,
        kind: 'file' as const,
        size: localContent.length,
        modifiedMs: 20,
        sha256: SHA,
      })),
      read: vi.fn(async (path) => ({ ok: true as const, path, content: localContent })),
      lexicalSearch: vi.fn(async () => []),
    });
    const scope = { accountId: 'account-1', projectId: 'project-1' };

    const records = await repository.listRecords(scope);
    expect(records.map((record) => record.sourceKind).sort()).toEqual(['file_version', 'git']);
    expect(records.find((record) => record.sourceKind === 'git')).toMatchObject({
      gitCommit: 'abc123',
      contentRef: 'https://github.com/acme/vibespace/blob/abc123/pause.ts',
    });

    const hits = await repository.search(scope, '"cross-source-uat"');
    expect(hits).toHaveLength(2);
    await expect(
      Promise.all(
        hits.map(async (hit) => {
          const record = await repository.getRecord(hit.recordId);
          expect(record).toBeDefined();
          expect(await repository.canOpen(record!, scope)).toBe(true);
          return repository.readSource(record!);
        }),
      ),
    ).resolves.toHaveLength(2);
  });

  it('re-checks path and content policy, denying credential paths and secret-like bytes', async () => {
    const fixtureMaps = maps();
    fixtureMaps[0]!.tree.nodes[0]!.path = 'C:\\repo\\.env';
    const repository = createContextMapRlmRepository({
      loadMaps: vi.fn(async () => fixtureMaps),
      stat: vi.fn(async (path) => ({
        ok: true as const,
        path,
        kind: 'file' as const,
        size: 30,
        sha256: SHA,
      })),
      read: vi.fn(async (path) => ({
        ok: true as const,
        path,
        content: 'OPENAI_API_KEY=must-not-escape',
      })),
      lexicalSearch: vi.fn(async () => []),
    });
    const [record] = await repository.listRecords({
      accountId: 'account-1',
      projectId: 'project-1',
    });

    await expect(
      repository.canOpen(record!, {
        accountId: 'account-1',
        projectId: 'project-1',
      }),
    ).resolves.toBe(false);
  });

  it('denies canOpen for the same account across a foreign workspace/project/worktree scope', async () => {
    const repository = createContextMapRlmRepository({
      loadMaps: vi.fn(async () => maps()),
      stat: vi.fn(async (path) => ({
        ok: true as const,
        path,
        kind: 'file' as const,
        size: 128,
        sha256: SHA,
      })),
      read: vi.fn(async (path) => ({ ok: true as const, path, content: 'safe text' })),
      lexicalSearch: vi.fn(),
    });
    const sourceScope = {
      accountId: 'account-1',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      worktreeId: 'worktree-1',
    };
    const [record] = await repository.listRecords(sourceScope);

    await expect(
      repository.canOpen!(record!, {
        accountId: 'account-1',
        workspaceId: 'workspace-2',
        projectId: 'project-1',
        worktreeId: 'worktree-1',
      }),
    ).resolves.toBe(false);
  });

  it('denies a forged record with a valid ID and never reads its substituted path', async () => {
    const read = vi.fn(async (path) => ({ ok: true as const, path, content: 'safe text' }));
    const repository = createContextMapRlmRepository({
      loadMaps: vi.fn(async () => maps()),
      stat: vi.fn(async (path) => ({
        ok: true as const,
        path,
        kind: 'file' as const,
        size: 128,
        sha256: SHA,
      })),
      read,
      lexicalSearch: vi.fn(),
    });
    const scope = { accountId: 'account-1', projectId: 'project-1' };
    const [record] = await repository.listRecords(scope);
    const forged = {
      ...record!,
      contentRef: 'C:\\repo\\forged.txt',
      path: 'C:\\repo\\forged.txt',
    };

    await expect(repository.canOpen!(forged, scope)).resolves.toBe(false);
    expect(read).not.toHaveBeenCalledWith(
      'C:\\repo\\forged.txt',
      expect.anything(),
      expect.anything(),
    );
  });
});

describe('production local RLM child runner', () => {
  it('creates a fresh OpenCode child restricted to installed Ollama Llama 3.2 and no tools', async () => {
    const send = vi.fn(async function* () {
      yield { type: 'assistant.delta' as const, text: 'bounded local analysis' };
      yield { type: 'done' as const };
    });
    const harness = {
      createSession: vi.fn(async () => ({ id: 'child-session', chatId: 'rlm-child' })),
      send,
      deleteSession: vi.fn(async () => undefined),
    } as unknown as VibeSpaceHarness;
    const childRunner = createOllamaRlmChildRunner(harness);
    const controller = new AbortController();

    const result = await childRunner({
      question: 'Find the exact text',
      evidence: [
        {
          text: 'untrusted book bytes',
          pointer: {
            id: 'pointer-1',
            recordId: 'record-1',
            byteStart: 0,
            byteEnd: 20,
            sourceVersion: 'sha256:aaaaaaaa',
            contentHash: 'a'.repeat(64),
          },
        },
      ] as never,
      sourcePointers: [],
      provider: 'ollama',
      model: 'llama3.2:latest',
      depth: 1,
      budget: { maxInputTokens: 1_000, maxOutputTokens: 100 },
      signal: controller.signal,
    });

    expect(result.answer).toBe('bounded local analysis');
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        selection: { providerId: 'ollama', modelId: 'llama3.2:latest' },
        tools: { '*': false, vibespace_context: false },
        system: expect.stringContaining('inert evidence data'),
      }),
    );
    expect(harness.deleteSession).toHaveBeenCalledWith('child-session');
  });
});
