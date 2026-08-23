import { describe, expect, it, vi } from 'vitest';
import type { ProductionSiyuanRlmPort } from './siyuanRlmProduction';
import { createSiyuanContextMapIntegration } from './siyuanContextMapIntegration';
import type { ContextMapRecord } from './tree';

function map(): ContextMapRecord {
  return {
    id: 'map-1',
    projectId: 'project-1',
    rootDir: 'C:\\Work\\Example',
    name: 'Example Context Map',
    status: 'active',
    createdAt: 1,
    updatedAt: 2,
    tree: {
      version: 1,
      projectId: 'project-1',
      rootDir: 'C:\\Work\\Example',
      generatedAt: 2,
      model: 'local-structural',
      fileCount: 1,
      totalBytes: 42,
      summary: 'A small project.',
      nodes: [
        {
          id: 'root',
          title: 'Example',
          kind: 'root',
          summary: 'Root',
          children: [
            {
              id: 'file',
              title: 'index.ts',
              kind: 'file',
              summary: 'Entry point',
              path: 'index.ts',
            },
          ],
        },
      ],
    },
  };
}

function port(existing: { markdown: string } | null = null): ProductionSiyuanRlmPort {
  let stored = existing
    ? { id: 'doc-1', notebookId: 'notebook-1', path: '/old', markdown: existing.markdown }
    : null;
  return {
    searchBlocks: vi.fn(async () => []),
    getBlock: vi.fn(),
    listInboundBacklinks: vi.fn(async () => []),
    readManagedDocument: vi.fn(async () => stored),
    createManagedDocument: vi.fn(async (_projectId, path, markdown) => {
      stored = { id: 'doc-1', notebookId: 'notebook-1', path, markdown };
      return stored;
    }),
    updateManagedDocument: vi.fn(async (_projectId, id, _expected, markdown) => {
      stored = { id, notebookId: 'notebook-1', path: '/updated', markdown };
      return stored;
    }),
    deleteManagedDocument: vi.fn(),
    createManagedSnapshot: vi.fn(),
    stopActive: vi.fn(),
  };
}

describe('SiYuan Context Map integration', () => {
  it('prewarms the shared project runtime once without blocking map creation', async () => {
    const nativePort = port();
    const integration = createSiyuanContextMapIntegration(nativePort);
    await Promise.all([integration.prewarm('project-1'), integration.prewarm('project-1')]);
    expect(nativePort.searchBlocks).toHaveBeenCalledTimes(1);
  });

  it('creates a managed SiYuan document containing the real Context tree', async () => {
    const nativePort = port();
    const integration = createSiyuanContextMapIntegration(nativePort);
    const result = await integration.sync('project-1', map());
    expect(result.document.id).toBe('doc-1');
    expect(result.tree.nodes[0]?.children?.[0]?.path).toBe('index.ts');
    expect(result.tree.nodes[0]?.children?.[0]?.id).toBe('file');
    expect(nativePort.createManagedDocument).toHaveBeenCalledOnce();
    const markdown = vi.mocked(nativePort.createManagedDocument).mock.calls[0]?.[2] ?? '';
    expect(markdown).toContain('vibespace-context-map:v1 map=map-1');
    expect(markdown).toMatch(/payload=[A-Za-z0-9_-]+/u);
    expect(markdown).toContain('index.ts');
    expect(markdown).not.toContain('apiKey');
    expect(nativePort.readManagedDocument).toHaveBeenCalledTimes(1);
  });

  it('updates the exact owned document instead of creating a duplicate', async () => {
    const nativePort = port({ markdown: '<!-- vibespace-context-map:v1 map=map-1 -->\nold' });
    const integration = createSiyuanContextMapIntegration(nativePort);
    await integration.sync('project-1', map());
    expect(nativePort.updateManagedDocument).toHaveBeenCalledOnce();
    expect(nativePort.createManagedDocument).not.toHaveBeenCalled();
  });

  it('repairs duplicate owned documents deterministically before updating SiYuan', async () => {
    const owned = '<!-- vibespace-context-map:v1 map=map-1 -->\nold';
    let documents = [
      { id: 'doc-b', notebookId: 'notebook-1', path: '/b', markdown: owned },
      { id: 'doc-a', notebookId: 'notebook-1', path: '/a', markdown: owned },
    ];
    const nativePort = port();
    vi.mocked(nativePort.readManagedDocument).mockImplementation(async () => {
      if (documents.length > 1) throw new Error('siyuan_managed_document_ambiguous');
      return documents[0] ?? null;
    });
    vi.mocked(nativePort.searchBlocks).mockResolvedValue(
      documents.map((document) => ({ id: document.id })) as never,
    );
    vi.mocked(nativePort.getBlock).mockImplementation(
      async (_projectId, id) => documents.find((document) => document.id === id)!,
    );
    vi.mocked(nativePort.deleteManagedDocument).mockImplementation(async (_projectId, id) => {
      documents = documents.filter((document) => document.id !== id);
    });
    vi.mocked(nativePort.updateManagedDocument).mockImplementation(
      async (_projectId, id, _expected, markdown) => {
        documents = documents.map((document) =>
          document.id === id ? { ...document, markdown } : document,
        );
        return documents.find((document) => document.id === id)!;
      },
    );

    const result = await createSiyuanContextMapIntegration(nativePort).sync('project-1', map());

    expect(result.document.id).toBe('doc-a');
    expect(nativePort.deleteManagedDocument).toHaveBeenCalledWith('project-1', 'doc-b', owned);
    expect(nativePort.updateManagedDocument).toHaveBeenCalledWith(
      'project-1',
      'doc-a',
      owned,
      expect.stringContaining('payload='),
    );
  });

  it('treats the old unversioned graph body as needing an in-place SiYuan refresh', async () => {
    const nativePort = port({ markdown: '<!-- vibespace-context-map:v1 map=map-1 -->\nold' });
    const integration = createSiyuanContextMapIntegration(nativePort);
    expect(await integration.read('project-1', map())).toBeNull();
  });

  it('keeps the canonical SiYuan root payload authoritative over presentation child blocks', async () => {
    const nativePort = port();
    const integration = createSiyuanContextMapIntegration(nativePort);
    const created = await integration.sync('project-1', map());
    const changed = created.document.markdown.replace('**index.ts**', '**renamed.ts**');
    vi.mocked(nativePort.readManagedDocument).mockResolvedValue({
      ...created.document,
      markdown: changed,
    });
    const snapshot = await integration.read('project-1', map());
    expect(snapshot?.tree.nodes[0]?.children?.[0]?.title).toBe('index.ts');
  });

  it('round-trips a Jarvis-managed graph edit through the canonical SiYuan payload', async () => {
    const nativePort = port();
    const integration = createSiyuanContextMapIntegration(nativePort);
    const changed = map();
    changed.tree.nodes[0]!.children![0]!.title = 'renamed.ts';
    await integration.sync('project-1', changed);
    const snapshot = await integration.read('project-1', changed);
    expect(snapshot?.tree.nodes[0]?.children?.[0]?.title).toBe('renamed.ts');
  });
});
