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
      sourceId: 'map-1:file-1',
      contentHash: 'a'.repeat(64),
      contentRef: 'C:\\repo\\book.txt',
      path: 'C:\\repo\\book.txt',
    });
    expect(records[0]?.id).toContain('map-1:file-1:');
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
      recordId: expect.stringContaining('map-1:file-1:'),
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
      recordId: expect.stringContaining('map-1:file-1:'),
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

    expect(hits[0]?.recordId).toContain('file-1');
    expect(hits[0]?.preview).toContain('Observatory Lumen');
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
  });

  it('re-ranks derivative index hits against source content instead of trusting stale index scores', async () => {
    const fixtureMaps = maps();
    fixtureMaps[0]!.tree.nodes.push({
      id: 'file-2',
      kind: 'file' as const,
      title: 'handoff-51.txt',
      summary: '',
      path: 'C:\\repo\\handoff-51.txt',
      sizeBytes: 128,
      modifiedAt: 20,
    });
    const contents: Record<string, string> = {
      'C:\\repo\\book.txt': 'A generic clerk was left near an unrelated neighboring record.',
      'C:\\repo\\handoff-51.txt':
        'ORBIT HANDOFF PART TWO. The receiving clerk answers glass-peregrine with harbor-saffron.',
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
        {
          documentId: 'file-2',
          excerpt: contents['C:\\repo\\handoff-51.txt'],
          score: 1,
        },
      ]),
    });

    const hits = await repository.search(
      { accountId: 'account-1', projectId: 'project-1' },
      'the orbit relay handoff is split between neighboring records — what phrase was left and what answer did the receiving clerk pair with it?',
    );

    expect(hits[0]?.recordId).toContain('file-2');
    expect(hits[0]?.preview).toContain('harbor-saffron');
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

    expect(hits[0]?.recordId).toContain('file-2');
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
