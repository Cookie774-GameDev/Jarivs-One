import { describe, expect, it, vi } from 'vitest';
import type { SiyuanAppendBlockInput } from './siyuan/siyuanContracts';
import type { SiyuanNativeBridge } from './siyuan/siyuanNativeBridge';
import { createProductionSiyuanRlmPort } from './siyuanRlmProduction';

function mockBridge(projectId: string, events: string[]): SiyuanNativeBridge {
  return {
    status: vi.fn(async () => ({
      featureEnabled: true,
      runtimeBundled: true,
      state: 'ready' as const,
    })),
    start: vi.fn(async () => {
      events.push(`start:${projectId}`);
      return { featureEnabled: true, runtimeBundled: true, state: 'ready' as const };
    }),
    stop: vi.fn(async () => {
      events.push(`stop:${projectId}`);
      return { featureEnabled: true, runtimeBundled: true, state: 'stopped' as const };
    }),
    version: vi.fn(async () => ({
      version: '3.8.1',
      commit: 'afa823b6b4e4f183511e0bc0a3be93caa94c7c97',
    })),
    listNotebooks: vi.fn(async () => {
      events.push(`notebooks:${projectId}`);
      return [];
    }),
    createNotebook: vi.fn(async (name: string) => {
      events.push(`create-notebook:${projectId}:${name}`);
      return {
        id: `notebook-${projectId}`,
        name,
        closed: false,
      };
    }),
    searchBlocks: vi.fn(async (query: string) => {
      events.push(`search:${projectId}:${query}`);
      return [
        {
          id: `block-${projectId}`,
          notebookId: `notebook-${projectId}`,
          path: `/${projectId}`,
          content: query,
        },
      ];
    }),
    getBlock: vi.fn(async (id: string) => {
      events.push(`get:${projectId}:${id}`);
      return {
        id,
        notebookId: `notebook-${projectId}`,
        path: `/${projectId}`,
        markdown: `body:${projectId}`,
      };
    }),
    listInboundBacklinks: vi.fn(async (id: string) => {
      events.push(`inbound:${projectId}:${id}`);
      return [`source-${projectId}`];
    }),
    createDocument: vi.fn(async (_notebookId, path) => {
      events.push(`create-document:${projectId}:${path}`);
      return { id: `document-${projectId}` };
    }),
    createDocumentUnderParent: vi.fn(async (_notebookId, mapRootId, parentId, stagingPath) => {
      events.push(
        `create-document-under-parent:${projectId}:${mapRootId}:${parentId}:${stagingPath}`,
      );
      return { id: `document-${projectId}` };
    }),
    batchAppendBlocks: vi.fn(
      async (_notebookId, _mapRootId, blocks: readonly SiyuanAppendBlockInput[]) => {
        events.push(`batch-append:${projectId}:${blocks.length}`);
        return blocks.map((_, index: number) => `block-${projectId}-${index}`);
      },
    ),
    updateBlock: vi.fn(async (_mapRootId, id) => {
      events.push(`update:${projectId}:${id}`);
      return { applied: true as const };
    }),
    deleteBlock: vi.fn(async (_mapRootId, id) => {
      events.push(`delete:${projectId}:${id}`);
      return { applied: true as const };
    }),
    createDailyNote: vi.fn(async () => ({ id: `daily-${projectId}` })),
    createSnapshot: vi.fn(async (memo) => {
      events.push(`snapshot:${projectId}:${memo}`);
      return { applied: true as const };
    }),
  };
}

describe('production SiYuan RLM port', () => {
  it('starts once, serializes same-project operations, and stops the owned runtime', async () => {
    const events: string[] = [];
    const bridge = mockBridge('project-a', events);
    const createBridge = vi.fn(() => bridge);
    const port = createProductionSiyuanRlmPort({ featureEnabled: true, createBridge });

    await expect(port.searchBlocks('project-a', 'needle', 4)).resolves.toHaveLength(1);
    await expect(port.getBlock('project-a', 'block-project-a')).resolves.toMatchObject({
      markdown: 'body:project-a',
    });
    await port.stopActive();

    expect(createBridge).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      'start:project-a',
      'search:project-a:needle',
      'get:project-a:block-project-a',
      'stop:project-a',
    ]);
  });

  it('exposes only typed inbound backlinks under one project authority', async () => {
    const events: string[] = [];
    const bridge = mockBridge('project-a', events);
    const port = createProductionSiyuanRlmPort({
      featureEnabled: true,
      createBridge: () => bridge,
    });

    await expect(port.listInboundBacklinks!('project-a', 'block-project-a')).resolves.toEqual([
      'source-project-a',
    ]);
    expect(events).toEqual(['start:project-a', 'inbound:project-a:block-project-a']);
  });

  it('stops the previous project before starting a different project authority', async () => {
    const events: string[] = [];
    const createBridge = vi.fn((projectId: string) => mockBridge(projectId, events));
    const port = createProductionSiyuanRlmPort({ featureEnabled: true, createBridge });

    await port.searchBlocks('project-a', 'first', 2);
    await port.searchBlocks('project-b', 'second', 2);

    expect(events).toEqual([
      'start:project-a',
      'search:project-a:first',
      'stop:project-a',
      'start:project-b',
      'search:project-b:second',
    ]);
  });

  it('rebinds once when a same-project renderer bridge loses its native transport', async () => {
    const events: string[] = [];
    const stale = mockBridge('project-a-stale', events);
    vi.mocked(stale.searchBlocks).mockRejectedValue('siyuan_transport_unavailable');
    const replacement = mockBridge('project-a', events);
    const createBridge = vi
      .fn<(projectId: string) => SiyuanNativeBridge>()
      .mockReturnValueOnce(stale)
      .mockReturnValueOnce(replacement);
    const port = createProductionSiyuanRlmPort({ featureEnabled: true, createBridge });

    await expect(port.searchBlocks('project-a', 'needle', 2)).resolves.toHaveLength(1);

    expect(createBridge).toHaveBeenCalledTimes(2);
    expect(events).toEqual(['start:project-a-stale', 'start:project-a', 'search:project-a:needle']);
  });

  it('does not retry unrelated bridge failures', async () => {
    const events: string[] = [];
    const bridge = mockBridge('project-a', events);
    vi.mocked(bridge.searchBlocks).mockRejectedValue(new Error('siyuan_query_failed'));
    const createBridge = vi.fn(() => bridge);
    const port = createProductionSiyuanRlmPort({ featureEnabled: true, createBridge });

    await expect(port.searchBlocks('project-a', 'needle', 2)).rejects.toThrow(
      'siyuan_query_failed',
    );

    expect(createBridge).toHaveBeenCalledTimes(1);
  });

  it('fails closed before native invocation when the feature is explicitly disabled', async () => {
    const port = createProductionSiyuanRlmPort({ featureEnabled: false });

    await expect(port.searchBlocks('project-a', 'needle', 2)).rejects.toThrow(
      'siyuan_feature_disabled',
    );
  });

  it('finds only the exact managed notebook and marker-backed document', async () => {
    const events: string[] = [];
    const bridge = mockBridge('project-a', events);
    vi.mocked(bridge.listNotebooks).mockResolvedValue([
      { id: 'notebook-project-a', name: 'VibeSpace Project Vault', closed: false },
      { id: 'other', name: 'Other', closed: false },
    ]);
    vi.mocked(bridge.searchBlocks).mockResolvedValue([
      {
        id: 'marker-block-project-a',
        notebookId: 'notebook-project-a',
        path: '/managed-document-project-a.sy',
        content: '&lt;!-- vibespace-managed-key:project-context --&gt;',
      },
    ]);
    vi.mocked(bridge.getBlock).mockImplementation(async (id) => ({
      id,
      notebookId: 'notebook-project-a',
      path: '/managed-document-project-a.sy',
      markdown: '# VibeSpace Project Context\n\n<!-- vibespace-managed-key:project-context -->',
    }));
    const port = createProductionSiyuanRlmPort({
      featureEnabled: true,
      createBridge: () => bridge,
    });

    await expect(
      port.readManagedDocument('project-a', {
        query: 'VibeSpace Project Context',
        marker: '<!-- vibespace-managed-key:project-context -->',
      }),
    ).resolves.toMatchObject({
      id: 'managed-document-project-a',
      notebookId: 'notebook-project-a',
    });
    expect(bridge.getBlock).toHaveBeenCalledExactlyOnceWith('managed-document-project-a');
  });

  it('creates the managed notebook lazily and exposes only typed mutations', async () => {
    const events: string[] = [];
    const bridge = mockBridge('project-a', events);
    const port = createProductionSiyuanRlmPort({
      featureEnabled: true,
      createBridge: () => bridge,
    });

    await port.createManagedSnapshot('project-a', 'Before managed writes');
    await expect(
      port.createManagedDocument('project-a', '/VibeSpace Managed/Project Context', '# Context'),
    ).resolves.toMatchObject({ id: 'document-project-a', notebookId: 'notebook-project-a' });
    await port.updateManagedDocument('project-a', 'document-project-a', '# Context', '# Updated');
    await port.deleteManagedDocument('project-a', 'document-project-a', '# Updated');

    expect(events).toEqual([
      'start:project-a',
      'snapshot:project-a:Before managed writes',
      'notebooks:project-a',
      'create-notebook:project-a:VibeSpace Project Vault',
      'create-document:project-a:/VibeSpace Managed/Project Context',
      'get:project-a:document-project-a',
      'update:project-a:document-project-a',
      'get:project-a:document-project-a',
      'delete:project-a:document-project-a',
    ]);
  });

  it('creates a bounded same-project document batch under one notebook lookup', async () => {
    const events: string[] = [];
    const bridge = mockBridge('project-a', events);
    vi.mocked(bridge.listNotebooks).mockResolvedValue([
      { id: 'notebook-project-a', name: 'VibeSpace Project Vault', closed: false },
    ]);
    let active = 0;
    let peak = 0;
    vi.mocked(bridge.createDocument).mockImplementation(async (_notebookId, path) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
      active -= 1;
      return { id: `document-${path.slice(1)}` };
    });
    const port = createProductionSiyuanRlmPort({
      featureEnabled: true,
      createBridge: () => bridge,
    });
    const inputs = Array.from({ length: 4 }, (_, index) => ({
      path: `/node-${index}`,
      markdown: `# Node ${index}`,
    }));

    const results = await port.createManagedDocuments!('project-a', inputs);

    expect(results).toHaveLength(4);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(peak).toBe(4);
    expect(bridge.listNotebooks).toHaveBeenCalledOnce();
    expect(bridge.createDocument).toHaveBeenCalledTimes(4);
    expect(bridge.getBlock).toHaveBeenCalledTimes(4);
    await expect(port.createManagedDocuments!('project-a', [])).rejects.toThrow(
      'siyuan_managed_document_batch_invalid',
    );
    await expect(
      port.createManagedDocuments!('project-a', [inputs[0]!, inputs[0]!]),
    ).rejects.toThrow('siyuan_managed_document_batch_duplicate');
  });

  it('creates managed documents under exact active-map parents instead of ambiguous hpaths', async () => {
    const events: string[] = [];
    const bridge = mockBridge('project-a', events);
    vi.mocked(bridge.listNotebooks).mockResolvedValue([
      { id: 'notebook-project-a', name: 'VibeSpace Project Vault', closed: false },
    ]);
    vi.mocked(bridge.getBlock).mockImplementation(async (id) => ({
      id,
      notebookId: 'notebook-project-a',
      path: id === 'map-root-1' ? '/20260828182841-tbwq3n7.sy' : `/20260828182841-tbwq3n7/${id}.sy`,
      markdown: '# Node',
    }));
    const port = createProductionSiyuanRlmPort({
      featureEnabled: true,
      createBridge: () => bridge,
    });

    const results = await port.createManagedDocumentsUnderParents!('project-a', 'map-root-1', [
      {
        parentId: 'map-root-1',
        path: '/staging/node-1',
        markdown: '# Node',
        marker: 'vibespace-context-node:v1 map=map-1 node=root',
      },
    ]);

    expect(results).toEqual([
      expect.objectContaining({
        ok: true,
        document: expect.objectContaining({ id: 'document-project-a' }),
      }),
    ]);
    expect(bridge.createDocumentUnderParent).toHaveBeenCalledExactlyOnceWith(
      'notebook-project-a',
      'map-root-1',
      'map-root-1',
      '/staging/node-1',
      '# Node',
      'vibespace-context-node:v1 map=map-1 node=root',
    );
  });

  it('rejects an exact-parent create receipt whose physical document remains outside the active root', async () => {
    const bridge = mockBridge('project-a', []);
    vi.mocked(bridge.listNotebooks).mockResolvedValue([
      { id: 'notebook-project-a', name: 'VibeSpace Project Vault', closed: false },
    ]);
    vi.mocked(bridge.getBlock).mockImplementation(async (id) => ({
      id,
      notebookId: 'notebook-project-a',
      path:
        id === 'map-root-1'
          ? '/20260828182841-tbwq3n7.sy'
          : `/20260827200803-5gqj8rz/${id}.sy`,
      markdown: '# Node',
    }));
    const port = createProductionSiyuanRlmPort({
      featureEnabled: true,
      createBridge: () => bridge,
    });

    await expect(
      port.createManagedDocumentUnderParent!('project-a', 'map-root-1', {
        parentId: 'map-root-1',
        path: '/staging/node-1',
        markdown: '# Node',
        marker: 'vibespace-context-node:v1 map=map-1 node=root',
      }),
    ).rejects.toThrow('siyuan_managed_document_authority_invalid');
  });

  it('appends an ordered file-node batch through one notebook lookup and one bridge call', async () => {
    const events: string[] = [];
    const bridge = mockBridge('project-a', events);
    vi.mocked(bridge.listNotebooks).mockResolvedValue([
      { id: 'notebook-project-a', name: 'VibeSpace Project Vault', closed: false },
    ]);
    vi.mocked(bridge.batchAppendBlocks).mockResolvedValue(['block-2', 'block-1']);
    const port = createProductionSiyuanRlmPort({
      featureEnabled: true,
      createBridge: () => bridge,
    });
    const inputs = [
      { parentId: 'parent-2', markdown: 'Second' },
      { parentId: 'parent-1', markdown: 'First' },
    ];

    await expect(port.appendManagedBlocks!('project-a', 'map-root-1', inputs)).resolves.toEqual([
      'block-2',
      'block-1',
    ]);
    expect(bridge.listNotebooks).toHaveBeenCalledOnce();
    expect(bridge.batchAppendBlocks).toHaveBeenCalledExactlyOnceWith(
      'notebook-project-a',
      'map-root-1',
      inputs,
    );
  });
});
