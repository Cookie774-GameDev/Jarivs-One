import { vi } from 'vitest';

const fsMocks = vi.hoisted(() => ({
  listDirectory: vi.fn(),
  readTextFileSample: vi.fn(),
  writeTextFile: vi.fn(),
}));

vi.mock('@/lib/fs', () => ({
  listDirectory: fsMocks.listDirectory,
  readTextFileSample: fsMocks.readTextFileSample,
  writeTextFile: fsMocks.writeTextFile,
}));

import {
  describeContextRootError,
  generateProjectContextTree,
  isContextTreeCoverageBounded,
  MAX_CONTEXT_FILE_BYTES,
  CONTEXT_MIME,
  contextMapBackingFilePath,
  contextMapCollectionKey,
  contextMapSlashOptions,
  contextNodeFilePath,
  contextStorageKey,
  contextTreeBackingFilePath,
  loadStoredContextMaps,
  nodeToAttachment,
  resolveContextMapRecord,
  type ContextMapRecord,
  type ProjectContextTree,
} from './tree';

describe('Context map physical file authority', () => {
  const tree = (model: string): ProjectContextTree => ({
    version: 1,
    projectId: 'project-authority',
    rootDir: 'C:\\vault',
    generatedAt: 1,
    model,
    fileCount: 1,
    totalBytes: 12,
    summary: 'Context authority fixture',
    nodes: [],
  });

  const record = (model: string, filePath?: string): ContextMapRecord => ({
    id: `map-${model}`,
    projectId: 'project-authority',
    rootDir: 'C:\\vault',
    ...(filePath === undefined ? {} : { filePath }),
    name: 'Authority map',
    status: 'active',
    createdAt: 1,
    updatedAt: 1,
    tree: tree(model),
  });

  it.each(['siyuan-metadata-index-v1', 'siyuan-managed-v1', 'context-map-v2'])(
    'denies invented root-file authority for virtual model %s',
    (model) => {
      const map = record(model, 'C:\\vault\\context_map.json');
      const root = {
        id: '__jarvis-context-root__',
        title: 'Vault',
        kind: 'root' as const,
        summary: 'Root',
      };

      expect(contextMapBackingFilePath(map)).toBeUndefined();
      expect(nodeToAttachment(map.tree, root).path).toBeUndefined();
    },
  );

  it('requires explicit backing-file evidence for a legacy map row', () => {
    expect(contextMapBackingFilePath(record('local-fallback'))).toBeUndefined();
    expect(
      contextMapBackingFilePath(record('local-fallback', ' C:\\vault\\context_map.json ')),
    ).toBe('C:\\vault\\context_map.json');
    expect(contextTreeBackingFilePath(tree('local-fallback'))).toBe('C:\\vault\\context_map.json');
    expect(
      nodeToAttachment(tree('local-fallback'), {
        id: '__jarvis-context-root__',
        title: 'Vault',
        kind: 'root',
        summary: 'Root',
        path: 'C:\\vault',
      }).path,
    ).toBe('C:\\vault\\context_map.json');
  });

  it('preserves exact physical authority for a real child file', () => {
    const managed = tree('context-map-v2');
    const child = {
      id: 'notes-file',
      title: 'notes.md',
      kind: 'file' as const,
      summary: 'Notes',
      path: 'notes.md',
    };

    expect(nodeToAttachment(managed, child)).toMatchObject({
      path: 'notes.md',
      kind: 'file',
    });
    expect(contextNodeFilePath(managed, child)).toBe('C:\\vault\\notes.md');
    expect(CONTEXT_MIME).toBe('application/x-jarvis-context');
  });
});

describe('Context map scan coverage', () => {
  it('conservatively marks an exact-cap legacy map as bounded without rewriting it', () => {
    const legacyTree = {
      version: 1,
      projectId: null,
      rootDir: 'C:\\proj',
      generatedAt: 1,
      model: 'local-fallback',
      fileCount: 120,
      totalBytes: 0,
      summary: 'Legacy map',
      nodes: [],
    } satisfies ProjectContextTree;

    expect(isContextTreeCoverageBounded(legacyTree)).toBe(true);
    expect(legacyTree).not.toHaveProperty('coverage');
  });
});

describe('generateProjectContextTree file safeguards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    fsMocks.writeTextFile.mockResolvedValue({ ok: true, path: 'C:\\proj\\context_map.json' });
  });

  it('validates media through a one-byte native sample and samples large text files', async () => {
    fsMocks.listDirectory.mockResolvedValue({
      ok: true,
      path: 'C:\\proj',
      entries: [
        {
          name: 'clip.mp4',
          path: 'C:\\proj\\assets\\clip.mp4',
          isDir: false,
          size: 90 * 1024 * 1024,
          modifiedMs: 1_700_000_000_000,
        },
        {
          name: 'large.ts',
          path: 'C:\\proj\\src\\large.ts',
          isDir: false,
          size: 8 * 1024 * 1024,
          modifiedMs: 1_700_000_000_001,
        },
      ],
    });
    fsMocks.readTextFileSample.mockResolvedValue({
      ok: true,
      path: 'C:\\proj\\src\\large.ts',
      content: 'export const value = 1;\n',
    });

    const tree = await generateProjectContextTree({
      projectId: null,
      rootDir: 'C:\\proj',
      provider: 'local',
    });

    expect(tree.fileCount).toBe(2);
    expect(JSON.stringify(tree.nodes)).toContain('clip.mp4');
    expect(JSON.stringify(tree.nodes)).toContain('large.ts');
    const indexedFlags = tree.nodes.flatMap((node) =>
      (node.children ?? []).map((child) => [child.path, child.contentIndexEligible]),
    );
    expect(indexedFlags).toContainEqual(['assets/clip.mp4', false]);
    expect(indexedFlags).toContainEqual(['src/large.ts', false]);
    expect(fsMocks.readTextFileSample).toHaveBeenCalledTimes(2);
    expect(fsMocks.readTextFileSample).toHaveBeenCalledWith('C:\\proj\\assets\\clip.mp4', 1, {
      root: 'C:\\proj',
      strictProjectBoundary: true,
    });
    expect(fsMocks.readTextFileSample).toHaveBeenCalledWith('C:\\proj\\src\\large.ts', 64 * 1024, {
      root: 'C:\\proj',
      strictProjectBoundary: true,
    });
    expect(fsMocks.listDirectory).toHaveBeenCalledWith('C:\\proj', {
      root: 'C:\\proj',
      strictProjectBoundary: true,
    });
    expect(localStorage.getItem(contextMapCollectionKey(null))).toBeNull();
    expect(localStorage.getItem(contextStorageKey(null))).toBeNull();
  });

  it('keeps every scanned root file addressable in the bounded structural map', async () => {
    const entries = Array.from({ length: 20 }, (_, index) => ({
      name: `shard-${String(index + 1).padStart(2, '0')}.txt`,
      path: `C:\\proj\\shard-${String(index + 1).padStart(2, '0')}.txt`,
      isDir: false,
      size: 32,
      modifiedMs: 1_700_000_000_000 + index,
    }));
    fsMocks.listDirectory.mockResolvedValue({
      ok: true,
      path: 'C:\\proj',
      entries,
    });
    fsMocks.readTextFileSample.mockImplementation(async (path: string) => ({
      ok: true,
      path,
      content: `bounded sample for ${path}`,
    }));

    const tree = await generateProjectContextTree({
      projectId: null,
      rootDir: 'C:\\proj',
      provider: 'local',
    });
    const filePaths = tree.nodes.flatMap((node) =>
      (node.children ?? []).flatMap((child) => (child.kind === 'file' ? [child.path] : [])),
    );

    expect(tree.fileCount).toBe(20);
    expect(filePaths).toHaveLength(20);
    expect(filePaths).toEqual(entries.map((entry) => entry.name));
  });

  it('marks a bounded scan as incomplete instead of presenting the sample as the whole vault', async () => {
    const entries = Array.from({ length: 121 }, (_, index) => ({
      name: `file-${index}.txt`,
      path: `C:\\proj\\file-${index}.txt`,
      isDir: false,
      size: 8,
    }));
    fsMocks.listDirectory.mockResolvedValue({ ok: true, path: 'C:\\proj', entries });
    fsMocks.readTextFileSample.mockResolvedValue({ ok: true, path: '', content: 'sample' });

    const tree = await generateProjectContextTree({
      projectId: null,
      rootDir: 'C:\\proj',
      provider: 'local',
    });

    expect(tree.fileCount).toBe(120);
    expect(tree.coverage).toEqual({ complete: false, limitations: ['file_limit'] });
    expect(tree.summary).toContain('bounded preview');
  });

  it('preserves every recursive subfolder level instead of flattening files into the first folder', async () => {
    fsMocks.listDirectory.mockImplementation(async (path: string) => {
      const entriesByPath: Record<string, Array<Record<string, unknown>>> = {
        'C:\\proj': [{ name: 'one', path: 'C:\\proj\\one', isDir: true }],
        'C:\\proj\\one': [{ name: 'two', path: 'C:\\proj\\one\\two', isDir: true }],
        'C:\\proj\\one\\two': [{ name: 'three', path: 'C:\\proj\\one\\two\\three', isDir: true }],
        'C:\\proj\\one\\two\\three': [
          {
            name: 'deep.md',
            path: 'C:\\proj\\one\\two\\three\\deep.md',
            isDir: false,
            size: 32,
          },
        ],
      };
      return { ok: true, path, entries: entriesByPath[path] ?? [] };
    });
    fsMocks.readTextFileSample.mockResolvedValue({ ok: true, path: '', content: '# deep' });

    const tree = await generateProjectContextTree({
      projectId: null,
      rootDir: 'C:\\proj',
      provider: 'local',
    });

    const one = tree.nodes.find((node) => node.path === 'one');
    const two = one?.children?.find((node) => node.path === 'one/two');
    const three = two?.children?.find((node) => node.path === 'one/two/three');
    const file = three?.children?.find((node) => node.path === 'one/two/three/deep.md');
    expect(one).toMatchObject({ kind: 'area', title: 'one' });
    expect(two).toMatchObject({ kind: 'area', title: 'two' });
    expect(three).toMatchObject({ kind: 'area', title: 'three' });
    expect(file).toMatchObject({ kind: 'file', title: 'deep.md' });
  });

  it('keeps an undecodable file as SiYuan graph metadata without admitting it to RLM full text', async () => {
    fsMocks.listDirectory.mockResolvedValue({
      ok: true,
      path: 'C:\\proj',
      entries: [{ name: 'cache.pile', path: 'C:\\proj\\cache.pile', isDir: false, size: 100 }],
    });
    fsMocks.readTextFileSample.mockResolvedValue({
      ok: true,
      path: 'C:\\proj\\cache.pile',
      content: 'binary\uFFFDbytes',
    });
    const tree = await generateProjectContextTree({
      projectId: null,
      rootDir: 'C:\\proj',
      provider: 'local',
    });
    const node = tree.nodes[0]?.children?.[0];
    expect(node?.path).toBe('cache.pile');
    expect(node?.contentIndexEligible).toBe(false);
    expect(node?.summary).not.toContain('\uFFFD');
  });

  it('keeps control-character text as metadata without sending an invalid body to RLM', async () => {
    fsMocks.listDirectory.mockResolvedValue({
      ok: true,
      path: 'C:\\proj',
      entries: [{ name: 'trace.log', path: 'C:\\proj\\trace.log', isDir: false, size: 20 }],
    });
    fsMocks.readTextFileSample.mockResolvedValue({
      ok: true,
      path: 'C:\\proj\\trace.log',
      content: 'prefix\u0000suffix',
    });

    const tree = await generateProjectContextTree({
      projectId: null,
      rootDir: 'C:\\proj',
      provider: 'local',
    });

    const node = tree.nodes[0]?.children?.[0];
    expect(node?.path).toBe('trace.log');
    expect(node?.contentIndexEligible).toBe(false);
    expect(node?.summary).not.toContain('\u0000');
  });

  it('continues indexing file identities after the summary sample budget is exhausted', async () => {
    const entries = Array.from({ length: 30 }, (_, index) => ({
      name: `corpus-${String(index + 1).padStart(2, '0')}.txt`,
      path: `C:\\proj\\corpus-${String(index + 1).padStart(2, '0')}.txt`,
      isDir: false,
      size: 400_000,
      modifiedMs: 1_700_000_000_000 + index,
    }));
    fsMocks.listDirectory.mockResolvedValue({
      ok: true,
      path: 'C:\\proj',
      entries,
    });
    fsMocks.readTextFileSample.mockImplementation(async (path: string) => ({
      ok: true,
      path,
      content: 'x'.repeat(12_000),
    }));

    const tree = await generateProjectContextTree({
      projectId: null,
      rootDir: 'C:\\proj',
      provider: 'local',
    });
    const filePaths = tree.nodes.flatMap((node) =>
      (node.children ?? []).flatMap((child) => (child.kind === 'file' ? [child.path] : [])),
    );

    expect(tree.fileCount).toBe(30);
    expect(filePaths).toEqual(entries.map((entry) => entry.name));
  });

  it('accepts image and video metadata up to 100 MB and rejects larger files', async () => {
    fsMocks.listDirectory.mockResolvedValue({
      ok: true,
      path: 'C:\\proj',
      entries: [
        {
          name: 'hero.heic',
          path: 'C:\\proj\\media\\hero.heic',
          isDir: false,
          size: MAX_CONTEXT_FILE_BYTES,
          modifiedMs: 1_700_000_000_000,
        },
        {
          name: 'walkthrough.mkv',
          path: 'C:\\proj\\media\\walkthrough.mkv',
          isDir: false,
          size: MAX_CONTEXT_FILE_BYTES,
          modifiedMs: 1_700_000_000_001,
        },
        {
          name: 'too-big.mp4',
          path: 'C:\\proj\\media\\too-big.mp4',
          isDir: false,
          size: MAX_CONTEXT_FILE_BYTES + 1,
          modifiedMs: 1_700_000_000_002,
        },
      ],
    });
    fsMocks.readTextFileSample.mockResolvedValue({ ok: true, path: '', content: 'discarded' });

    const tree = await generateProjectContextTree({
      projectId: null,
      rootDir: 'C:\\proj',
      provider: 'local',
    });
    const serialized = JSON.stringify(tree.nodes);

    expect(tree.fileCount).toBe(2);
    expect(tree.totalBytes).toBe(MAX_CONTEXT_FILE_BYTES * 2);
    expect(serialized).toContain('hero.heic');
    expect(serialized).toContain('walkthrough.mkv');
    expect(serialized).not.toContain('too-big.mp4');
    expect(serialized).toContain('image media');
    expect(serialized).toContain('video media');
    expect(fsMocks.readTextFileSample).toHaveBeenCalledTimes(2);
    expect(fsMocks.readTextFileSample).toHaveBeenCalledWith('C:\\proj\\media\\hero.heic', 1, {
      root: 'C:\\proj',
      strictProjectBoundary: true,
    });
    expect(fsMocks.readTextFileSample).toHaveBeenCalledWith('C:\\proj\\media\\walkthrough.mkv', 1, {
      root: 'C:\\proj',
      strictProjectBoundary: true,
    });
  });

  it('reloads validated GitHub badge metadata without retaining installation authority', () => {
    localStorage.setItem(
      contextMapCollectionKey('p1'),
      JSON.stringify({
        version: 1,
        projectId: 'p1',
        selectedMapId: 'map-github',
        maps: [
          {
            id: 'map-github',
            projectId: 'p1',
            rootDir: 'C:\\proj',
            name: 'GitHub map',
            status: 'active',
            createdAt: 1,
            updatedAt: 2,
            sourceType: 'github_repository',
            sourceLabel: 'octo/vibespace',
            sourceStatus: 'stale',
            branchRef: 'main',
            github: {
              installationId: 'must-not-survive',
              owner: 'octo',
              repository: 'vibespace',
              resolvedCommitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              visibility: 'private',
            },
            tree: {
              version: 1,
              projectId: 'p1',
              rootDir: 'C:\\proj',
              generatedAt: 2,
              model: 'github-context',
              fileCount: 0,
              totalBytes: 0,
              summary: '',
              nodes: [],
            },
          },
        ],
      }),
    );

    expect(loadStoredContextMaps('p1')[0]).toMatchObject({
      sourceStatus: 'stale',
      github: {
        owner: 'octo',
        repository: 'vibespace',
        resolvedCommitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        visibility: 'private',
      },
    });
    expect(loadStoredContextMaps('p1')[0]?.github).not.toHaveProperty('installationId');
  });

  it('never reads denied secret paths, traverses credential directories, or includes secret content', async () => {
    fsMocks.listDirectory.mockImplementation(async (path: string) => {
      if (path === 'C:\\proj') {
        return {
          ok: true,
          path,
          entries: [
            { name: '.aws', path: 'C:\\proj\\.aws', isDir: true },
            { name: '.azure', path: 'C:\\proj\\.azure', isDir: true },
            { name: 'gcloud', path: 'C:\\proj\\gcloud', isDir: true },
            { name: '.codex', path: 'C:\\proj\\.codex', isDir: true },
            { name: '.claude', path: 'C:\\proj\\.claude', isDir: true },
            { name: '.gemini', path: 'C:\\proj\\.gemini', isDir: true },
            { name: '.credentials', path: 'C:\\proj\\.credentials', isDir: true },
            { name: '.config', path: 'C:\\proj\\.config', isDir: true },
            { name: '.env.local', path: 'C:\\proj\\.env.local', isDir: false, size: 32 },
            { name: '.npmrc', path: 'C:\\proj\\.npmrc', isDir: false, size: 32 },
            { name: 'notes.txt', path: 'C:\\proj\\notes.txt', isDir: false, size: 64 },
            { name: 'readme.md', path: 'C:\\proj\\readme.md', isDir: false, size: 64 },
          ],
        };
      }
      if (path === 'C:\\proj\\.config') {
        return {
          ok: true,
          path,
          entries: [
            { name: 'openai', path: 'C:\\proj\\.config\\openai', isDir: true },
            { name: 'opencode', path: 'C:\\proj\\.config\\opencode', isDir: true },
          ],
        };
      }
      throw new Error(`unexpected traversal: ${path}`);
    });
    fsMocks.readTextFileSample.mockImplementation(async (path: string) => ({
      ok: true,
      path,
      content: path.endsWith('notes.txt')
        ? '{"OPENAI_API_KEY":"abcdefghijklmnopqrstuvwxyz123456"}'
        : '# Safe project',
    }));

    const tree = await generateProjectContextTree({
      projectId: null,
      rootDir: 'C:\\proj',
      provider: 'local',
    });
    const serialized = JSON.stringify(tree);

    expect(tree.fileCount).toBe(1);
    expect(serialized).toContain('readme.md');
    expect(serialized).not.toContain('.env.local');
    expect(serialized).not.toContain('.npmrc');
    expect(serialized).not.toContain('synthetic-secret');
    expect(fsMocks.readTextFileSample).not.toHaveBeenCalledWith(
      'C:\\proj\\.env.local',
      expect.anything(),
      expect.anything(),
    );
    expect(fsMocks.readTextFileSample).not.toHaveBeenCalledWith(
      'C:\\proj\\.npmrc',
      expect.anything(),
      expect.anything(),
    );
    expect(fsMocks.listDirectory).not.toHaveBeenCalledWith('C:\\proj\\.aws', expect.anything());
    expect(fsMocks.listDirectory).not.toHaveBeenCalledWith('C:\\proj\\.azure', expect.anything());
    expect(fsMocks.listDirectory).not.toHaveBeenCalledWith('C:\\proj\\gcloud', expect.anything());
    expect(fsMocks.listDirectory).not.toHaveBeenCalledWith('C:\\proj\\.codex', expect.anything());
    expect(fsMocks.listDirectory).not.toHaveBeenCalledWith('C:\\proj\\.claude', expect.anything());
    expect(fsMocks.listDirectory).not.toHaveBeenCalledWith('C:\\proj\\.gemini', expect.anything());
    expect(fsMocks.listDirectory).not.toHaveBeenCalledWith(
      'C:\\proj\\.credentials',
      expect.anything(),
    );
    expect(fsMocks.listDirectory).not.toHaveBeenCalledWith(
      'C:\\proj\\.config\\openai',
      expect.anything(),
    );
    expect(fsMocks.listDirectory).not.toHaveBeenCalledWith(
      'C:\\proj\\.config\\opencode',
      expect.anything(),
    );
  });

  it.each(['outside_root', 'too_large'] as const)(
    'omits media when native validation returns %s',
    async (code) => {
      fsMocks.listDirectory.mockResolvedValue({
        ok: true,
        path: 'C:\\proj',
        entries: [
          { name: 'hero.png', path: 'C:\\proj\\hero.png', isDir: false, size: 10 },
          { name: 'readme.md', path: 'C:\\proj\\readme.md', isDir: false, size: 10 },
        ],
      });
      fsMocks.readTextFileSample.mockImplementation(async (path: string) =>
        path.endsWith('hero.png')
          ? { ok: false, path, error: { code } }
          : { ok: true, path, content: '# Safe project' },
      );

      const tree = await generateProjectContextTree({
        projectId: null,
        rootDir: 'C:\\proj',
        provider: 'local',
      });

      expect(tree.fileCount).toBe(1);
      expect(JSON.stringify(tree)).not.toContain('hero.png');
      expect(fsMocks.readTextFileSample).toHaveBeenCalledWith('C:\\proj\\hero.png', 1, {
        root: 'C:\\proj',
        strictProjectBoundary: true,
      });
    },
  );

  it('rejects a lexical root traversal synchronously before the first listing', async () => {
    await expect(
      generateProjectContextTree({
        projectId: null,
        rootDir: 'C:\\repo\\..\\outside',
        provider: 'local',
      }),
    ).rejects.toThrow();
    expect(fsMocks.listDirectory).not.toHaveBeenCalled();
  });

  it('reports a missing root folder instead of "no readable text files"', async () => {
    fsMocks.listDirectory.mockResolvedValue({
      ok: false,
      path: 'C:\\does-not-exist',
      error: { code: 'not_found' },
    });

    await expect(
      generateProjectContextTree({
        projectId: null,
        rootDir: 'C:\\does-not-exist',
        provider: 'local',
      }),
    ).rejects.toThrow(/project folder was not found/i);

    const message = describeContextRootError('C:\\does-not-exist', {
      code: 'root_not_found',
      raw: 'missing C:\\does-not-exist',
    });
    expect(message).not.toContain('C:\\does-not-exist');
    expect(message).not.toContain('missing');
  });

  it('reports a file-not-folder root and a blocked root distinctly', async () => {
    fsMocks.listDirectory.mockResolvedValue({
      ok: false,
      path: 'C:\\proj\\readme.md',
      error: { code: 'not_a_dir' },
    });
    await expect(
      generateProjectContextTree({
        projectId: null,
        rootDir: 'C:\\proj\\readme.md',
        provider: 'local',
      }),
    ).rejects.toThrow(/selected Context root is a file/i);

    fsMocks.listDirectory.mockResolvedValue({
      ok: false,
      path: 'C:\\blocked',
      error: { code: 'unknown', raw: 'Access is denied. (os error 5)' },
    });
    await expect(
      generateProjectContextTree({ projectId: null, rootDir: 'C:\\blocked', provider: 'local' }),
    ).rejects.toThrow(/could not read the selected Context root/i);

    for (const [error, category] of [
      [{ code: 'root_not_dir' as const, raw: 'C:\\private\\file.txt' }, /root is a file/i],
      [{ code: 'outside_root' as const, raw: 'C:\\private\\outside' }, /access.*blocked/i],
      [{ code: 'symlink_blocked' as const, raw: 'C:\\private\\linked' }, /links or junctions/i],
      [{ code: 'other_user_folder' as const, raw: 'C:\\Users\\Other' }, /another user profile/i],
      [{ code: 'unknown' as const, raw: 'Access is denied. (os error 5)' }, /could not read/i],
    ] as const) {
      const message = describeContextRootError('C:\\private\\root', error);
      expect(message).toMatch(category);
      expect(message).not.toContain('C:\\private');
      expect(message).not.toContain('os error 5');
    }
  });

  it('explains the browser-preview limitation for an unavailable fs bridge', () => {
    expect(describeContextRootError('C:\\proj', { code: 'unavailable' })).toContain('desktop app');
  });

  it('publishes a structural map before deep analysis and cancels without writing', async () => {
    fsMocks.listDirectory.mockResolvedValue({
      ok: true,
      path: 'C:\\proj',
      entries: [{ name: 'readme.md', path: 'C:\\proj\\readme.md', isDir: false, size: 16 }],
    });
    fsMocks.readTextFileSample.mockResolvedValue({
      ok: true,
      path: 'C:\\proj\\readme.md',
      content: '# Project',
    });
    const controller = new AbortController();
    const structural = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        }),
    );
    try {
      const generation = generateProjectContextTree({
        projectId: null,
        rootDir: 'C:\\proj',
        provider: 'openai',
        apiKey: 'test-key',
        signal: controller.signal,
        yieldControl: async () => {},
        onStructuralMap: structural,
      });
      await vi.waitFor(() => expect(structural).toHaveBeenCalledTimes(1));
      expect(structural.mock.calls[0]?.[0]).toMatchObject({
        fileCount: 1,
        model: 'local-structural',
      });
      expect(fsMocks.writeTextFile).not.toHaveBeenCalled();

      controller.abort('superseded');
      await expect(generation).rejects.toThrow(/cancelled/i);
      expect(fsMocks.writeTextFile).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('cooperatively yields during bounded scanning before returning the local map', async () => {
    fsMocks.listDirectory.mockResolvedValue({
      ok: true,
      path: 'C:\\proj',
      entries: [{ name: 'readme.md', path: 'C:\\proj\\readme.md', isDir: false, size: 16 }],
    });
    fsMocks.readTextFileSample.mockResolvedValue({
      ok: true,
      path: 'C:\\proj\\readme.md',
      content: '# Project',
    });
    const yieldControl = vi.fn(async () => {});
    const structural = vi.fn();
    const tree = await generateProjectContextTree({
      projectId: null,
      rootDir: 'C:\\proj',
      provider: 'local',
      yieldControl,
      onStructuralMap: structural,
    });
    expect(yieldControl).toHaveBeenCalled();
    expect(structural).toHaveBeenCalledWith(
      expect.objectContaining({
        generatedAt: tree.generatedAt,
        fileCount: tree.fileCount,
        model: 'local-structural',
      }),
    );
    expect(tree.model).toBe('local-fallback');
  });

  it('rejects cancellation that arrives during the final file write', async () => {
    fsMocks.listDirectory.mockResolvedValue({
      ok: true,
      path: 'C:\\proj',
      entries: [{ name: 'readme.md', path: 'C:\\proj\\readme.md', isDir: false, size: 16 }],
    });
    fsMocks.readTextFileSample.mockResolvedValue({
      ok: true,
      path: 'C:\\proj\\readme.md',
      content: '# Project',
    });
    let finishWrite!: (result: { ok: true; path: string }) => void;
    fsMocks.writeTextFile.mockImplementation(
      async () =>
        await new Promise<{ ok: true; path: string }>((resolve) => {
          finishWrite = resolve;
        }),
    );
    const controller = new AbortController();
    const generation = generateProjectContextTree({
      projectId: null,
      rootDir: 'C:\\proj',
      provider: 'local',
      signal: controller.signal,
      yieldControl: async () => {},
    });
    await vi.waitFor(() => expect(fsMocks.writeTextFile).toHaveBeenCalledTimes(1));
    controller.abort('scope_changed');
    finishWrite({ ok: true, path: 'C:\\proj\\.context-map.json' });
    await expect(generation).rejects.toThrow(/cancelled/i);
  });
});

describe('contextMapSlashOptions', () => {
  it('keys each row by stable map id even when names match', () => {
    const maps: ContextMapRecord[] = [
      {
        id: 'map-a',
        projectId: 'p1',
        rootDir: 'C:\\one',
        name: 'Jarvis Context Map',
        status: 'active',
        createdAt: 1,
        updatedAt: 1,
        tree: {
          version: 1,
          projectId: 'p1',
          rootDir: 'C:\\one',
          generatedAt: 1,
          model: 'local-fallback',
          fileCount: 0,
          totalBytes: 0,
          summary: '',
          nodes: [{ id: 'root-a', title: 'A', kind: 'root', summary: '' }],
        },
      },
      {
        id: 'map-b',
        projectId: 'p1',
        rootDir: 'C:\\two',
        name: 'Jarvis Context Map',
        status: 'active',
        createdAt: 2,
        updatedAt: 2,
        tree: {
          version: 1,
          projectId: 'p1',
          rootDir: 'C:\\two',
          generatedAt: 2,
          model: 'local-fallback',
          fileCount: 0,
          totalBytes: 0,
          summary: '',
          nodes: [{ id: 'root-b', title: 'B', kind: 'root', summary: '' }],
        },
      },
    ];
    const options = contextMapSlashOptions(maps);
    expect(options).toHaveLength(2);
    expect(new Set(options.map((o) => o.id)).size).toBe(2);
    expect(options.map((o) => o.id)).toEqual(['map-a', 'map-b']);
  });
});

describe('resolveContextMapRecord', () => {
  const maps: ContextMapRecord[] = [
    {
      id: 'map-a',
      projectId: 'p1',
      rootDir: 'C:\\one',
      name: 'Alpha',
      status: 'active',
      createdAt: 1,
      updatedAt: 1,
      tree: {
        version: 1,
        projectId: 'p1',
        rootDir: 'C:\\one',
        generatedAt: 1,
        model: 'local-fallback',
        fileCount: 0,
        totalBytes: 0,
        summary: '',
        nodes: [],
      },
    },
  ];

  it('resolves by stable id first', () => {
    expect(resolveContextMapRecord(maps, 'map-a')?.name).toBe('Alpha');
  });

  it('falls back to name match for legacy values', () => {
    expect(resolveContextMapRecord(maps, 'Alpha')?.id).toBe('map-a');
  });
});
