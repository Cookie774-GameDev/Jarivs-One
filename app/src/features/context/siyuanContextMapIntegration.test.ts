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
  return {
    searchBlocks: vi.fn(async () => []),
    getBlock: vi.fn(),
    listInboundBacklinks: vi.fn(async () => []),
    readManagedDocument: vi.fn(async () =>
      existing
        ? { id: 'doc-1', notebookId: 'notebook-1', path: '/old', markdown: existing.markdown }
        : null,
    ),
    createManagedDocument: vi.fn(async (_projectId, path, markdown) => ({
      id: 'doc-1',
      notebookId: 'notebook-1',
      path,
      markdown,
    })),
    updateManagedDocument: vi.fn(async (_projectId, id, _expected, markdown) => ({
      id,
      notebookId: 'notebook-1',
      path: '/updated',
      markdown,
    })),
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
    expect(result.id).toBe('doc-1');
    expect(nativePort.createManagedDocument).toHaveBeenCalledOnce();
    const markdown = vi.mocked(nativePort.createManagedDocument).mock.calls[0]?.[2] ?? '';
    expect(markdown).toContain('vibespace-context-map:v1 map=map-1');
    expect(markdown).toContain('index.ts');
    expect(markdown).not.toContain('apiKey');
  });

  it('updates the exact owned document instead of creating a duplicate', async () => {
    const nativePort = port({ markdown: '<!-- vibespace-context-map:v1 map=map-1 -->\nold' });
    const integration = createSiyuanContextMapIntegration(nativePort);
    await integration.sync('project-1', map());
    expect(nativePort.updateManagedDocument).toHaveBeenCalledOnce();
    expect(nativePort.createManagedDocument).not.toHaveBeenCalled();
  });
});
