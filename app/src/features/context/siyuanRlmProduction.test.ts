import { describe, expect, it, vi } from 'vitest';
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
    listNotebooks: vi.fn(async () => []),
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
    createDocument: vi.fn(async () => ({ id: `document-${projectId}` })),
    updateBlock: vi.fn(async () => ({ applied: true as const })),
    deleteBlock: vi.fn(async () => ({ applied: true as const })),
    createDailyNote: vi.fn(async () => ({ id: `daily-${projectId}` })),
    createSnapshot: vi.fn(async () => ({ applied: true as const })),
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

  it('fails closed before native invocation while the checked-in feature gate is disabled', async () => {
    const port = createProductionSiyuanRlmPort();

    await expect(port.searchBlocks('project-a', 'needle', 2)).rejects.toThrow(
      'siyuan_feature_disabled',
    );
  });
});
