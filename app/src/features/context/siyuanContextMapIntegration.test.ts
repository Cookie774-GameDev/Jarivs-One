import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ProductionSiyuanRlmPort } from './siyuanRlmProduction';
import {
  clearArchivedSiyuanSummaryDocuments,
  createSiyuanContextMapIntegration,
} from './siyuanContextMapIntegration';
import type { ContextMapRecord } from './tree';
import {
  createSiyuanMapManifest,
  readSiyuanMapManifest,
  updateSiyuanMapManifest,
  writeSiyuanMapManifest,
} from './siyuan/siyuanMapManifest';
import {
  clearSiyuanNodeBindings,
  readSiyuanNodeBindings,
  writeSiyuanNodeBindings,
} from './siyuan/siyuanBindingStore';
import { createSiyuanIndexJobControl } from './siyuan/siyuanSafeIndex';
import { siyuanIndexPolicyFingerprint } from './siyuan/siyuanSafeIndex';
import {
  checkpointSiyuanIndexJob,
  createSiyuanIndexJob,
  readSiyuanIndexJob,
  replaceSiyuanIndexJob,
} from './siyuan/siyuanIndexJobStore';
import { useAuthStore } from '@/stores/auth';

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
  let sequence = 0;
  let documents = existing
    ? [{ id: 'doc-1', notebookId: 'notebook-1', path: '/old', markdown: existing.markdown }]
    : [];
  return {
    searchBlocks: vi.fn(async () => []),
    getBlock: vi.fn(async (_projectId, id) => {
      const found = documents.find((document) => document.id === id);
      if (!found) throw new Error('missing');
      return found;
    }),
    listInboundBacklinks: vi.fn(async () => []),
    readManagedDocument: vi.fn(
      async (_projectId, lookup) =>
        documents.find((document) => document.markdown.includes(lookup.marker)) ?? null,
    ),
    createManagedDocument: vi.fn(async (_projectId, path, markdown) => {
      sequence += 1;
      const document = { id: `created-${sequence}`, notebookId: 'notebook-1', path, markdown };
      documents.push(document);
      return document;
    }),
    updateManagedDocument: vi.fn(async (_projectId, id, _expected, markdown) => {
      documents = documents.map((document) =>
        document.id === id ? { ...document, markdown } : document,
      );
      return documents.find((document) => document.id === id)!;
    }),
    deleteManagedDocument: vi.fn(async (_projectId, id) => {
      documents = documents.filter((document) => document.id !== id);
    }),
    createManagedSnapshot: vi.fn(),
    stopActive: vi.fn(),
  };
}

describe('SiYuan Context Map integration', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearSiyuanNodeBindings('project-1', 'map-1');
  });

  it('accounts for renderer-offline time before discovery can overwrite the checkpoint', () => {
    const source = readFileSync(
      resolve('src/features/context/siyuanContextMapIntegration.ts'),
      'utf8',
    );
    const integrationStart = source.indexOf('const syncNativeNodeDocuments');
    const accountIndex = source.indexOf('accountForSiyuanRendererOfflineTime(', integrationStart);
    const scanIndex = source.indexOf('scanSiyuanFilesystemIndex(', integrationStart);
    expect(accountIndex).toBeGreaterThan(integrationStart);
    expect(accountIndex).toBeLessThan(scanIndex);
  });

  it('publishes the ready manifest before the durable job is marked completed', () => {
    const source = readFileSync(
      resolve('src/features/context/siyuanContextMapIntegration.ts'),
      'utf8',
    );
    const integrationStart = source.indexOf('const syncNativeNodeDocuments');
    const readyManifest = source.indexOf('const readyManifest', integrationStart);
    const publishReady = source.indexOf('writeSiyuanMapManifest(readyManifest)', readyManifest);
    const completeJob = source.indexOf("status: 'completed'", readyManifest);
    expect(publishReady).toBeGreaterThan(readyManifest);
    expect(publishReady).toBeLessThan(completeJob);
  });

  it('prewarms the shared project runtime once without blocking map creation', async () => {
    const nativePort = port();
    const integration = createSiyuanContextMapIntegration(nativePort);
    await Promise.all([integration.prewarm('project-1'), integration.prewarm('project-1')]);
    expect(nativePort.searchBlocks).toHaveBeenCalledTimes(1);
  });

  it('removes archived summaries in place before an exact model restart', async () => {
    const record = map();
    const manifest = updateSiyuanMapManifest(
      createSiyuanMapManifest(record, 'project-1'),
      { notebookId: 'notebook-1', rootDocumentId: 'root-document' },
      100,
    );
    writeSiyuanMapManifest(manifest);
    await writeSiyuanNodeBindings('project-1', 'map-1', { 'file-node': 'doc-1' });
    const nativePort = port({
      markdown:
        '<!-- vibespace-context-node:v1 map=map-1 node=file-node -->\n# index.ts\n\n## Summary\n\nGenerated locally.\n',
    });
    const job = {
      ...createSiyuanIndexJob({
        projectId: 'project-1',
        mapId: 'map-1',
        canonicalRoot: record.rootDir,
        policyFingerprint: 'policy-a',
      }),
      phase: 'summarizing' as const,
      status: 'paused' as const,
      pauseReason: 'user' as const,
      summarized: 1,
    };
    const progress = vi.fn();

    await clearArchivedSiyuanSummaryDocuments(
      'project-1',
      'map-1',
      {
        scope: job.scope,
        archivedAt: 200,
        job,
        entries: [
          {
            nodeId: 'file-node',
            parentNodeId: null,
            title: 'index.ts',
            kind: 'file',
            relativePath: 'index.ts',
            sourcePointer: `${record.rootDir}\\index.ts`,
            summary: 'Generated locally.',
            summaryState: 'completed',
            sizeBytes: 42,
            modifiedAt: 1,
          },
        ],
        frontier: [],
        summaryUsage: [],
      },
      nativePort,
      { onProgress: progress },
    );

    expect(nativePort.updateManagedDocument).toHaveBeenCalledOnce();
    expect(vi.mocked(nativePort.updateManagedDocument).mock.calls[0]?.[1]).toBe('doc-1');
    expect(vi.mocked(nativePort.updateManagedDocument).mock.calls[0]?.[3]).not.toContain(
      '## Summary',
    );
    expect(nativePort.createManagedDocument).not.toHaveBeenCalled();
    expect(nativePort.deleteManagedDocument).not.toHaveBeenCalled();
    expect(progress.mock.calls).toEqual([
      [{ phase: 'validating', completed: 1, total: 1 }],
      [{ phase: 'rewriting', completed: 1, total: 1 }],
    ]);
  });

  it('times out a stalled native summary rewrite without repinning the durable job', async () => {
    const record = map();
    writeSiyuanMapManifest(
      updateSiyuanMapManifest(
        createSiyuanMapManifest(record, 'project-1'),
        { notebookId: 'notebook-1', rootDocumentId: 'root-document' },
        100,
      ),
    );
    await writeSiyuanNodeBindings('project-1', 'map-1', { 'file-node': 'doc-stalled' });
    const nativePort = port();
    vi.mocked(nativePort.getBlock).mockImplementationOnce(() => new Promise(() => undefined));
    const job = {
      ...createSiyuanIndexJob({
        projectId: 'project-1',
        mapId: 'map-1',
        canonicalRoot: record.rootDir,
        policyFingerprint: 'policy-a',
      }),
      phase: 'summarizing' as const,
      status: 'paused' as const,
      pauseReason: 'user' as const,
      summarized: 1,
    };

    await expect(
      clearArchivedSiyuanSummaryDocuments(
        'project-1',
        'map-1',
        {
          scope: job.scope,
          archivedAt: 200,
          job,
          entries: [
            {
              nodeId: 'file-node',
              parentNodeId: null,
              title: 'index.ts',
              kind: 'file',
              relativePath: 'index.ts',
              sourcePointer: `${record.rootDir}\\index.ts`,
              summary: 'Generated locally.',
              summaryState: 'completed',
              sizeBytes: 42,
              modifiedAt: 1,
            },
          ],
          frontier: [],
          summaryUsage: [],
        },
        nativePort,
        { operationTimeoutMs: 5 },
      ),
    ).rejects.toThrow('siyuan_summary_native_operation_timeout:read:1');
    expect(nativePort.updateManagedDocument).not.toHaveBeenCalled();
  });

  it('fails closed when a summarized node has lost its structural parent binding', async () => {
    const record = map();
    writeSiyuanMapManifest(
      updateSiyuanMapManifest(
        createSiyuanMapManifest(record, 'project-1'),
        { notebookId: 'notebook-1', rootDocumentId: 'root-document' },
        100,
      ),
    );
    await writeSiyuanNodeBindings('project-1', 'map-1', { 'file-node': 'doc-1' });
    const nativePort = port({
      markdown:
        '<!-- vibespace-context-node:v1 map=map-1 node=file-node -->\n# index.ts\n\n## Summary\n\nGenerated locally.\n',
    });
    const job = createSiyuanIndexJob({
      projectId: 'project-1',
      mapId: 'map-1',
      canonicalRoot: record.rootDir,
      policyFingerprint: 'policy-a',
    });

    await expect(
      clearArchivedSiyuanSummaryDocuments(
        'project-1',
        'map-1',
        {
          scope: job.scope,
          archivedAt: 200,
          job,
          entries: [
            {
              nodeId: 'file-node',
              parentNodeId: 'missing-parent',
              title: 'index.ts',
              kind: 'file',
              relativePath: 'index.ts',
              sourcePointer: `${record.rootDir}\\index.ts`,
              summary: 'Generated locally.',
              summaryState: 'completed',
              sizeBytes: 42,
              modifiedAt: 1,
            },
          ],
          frontier: [],
          summaryUsage: [],
        },
        nativePort,
      ),
    ).rejects.toThrow('siyuan_summary_parent_binding_missing');
    expect(nativePort.updateManagedDocument).not.toHaveBeenCalled();
  });

  it('uses an isolated production queue so a timeout cannot poison shared RLM work', () => {
    const source = readFileSync(
      resolve('src/features/context/siyuanContextMapIntegration.ts'),
      'utf8',
    );
    expect(source).toContain('port: ProductionSiyuanRlmPort = createProductionSiyuanRlmPort()');
    expect(source).not.toContain('port: ProductionSiyuanRlmPort = getProductionSiyuanRlmPort()');
  });

  it('fails closed before rewriting when an archived summary binding is not authoritative', async () => {
    const record = map();
    writeSiyuanMapManifest(
      updateSiyuanMapManifest(
        createSiyuanMapManifest(record, 'project-1'),
        { notebookId: 'notebook-1', rootDocumentId: 'root-document' },
        100,
      ),
    );
    await writeSiyuanNodeBindings('project-1', 'map-1', { 'file-node': 'doc-1' });
    const nativePort = port({ markdown: '<!-- unrelated -->\n# Other document\n' });
    const job = createSiyuanIndexJob({
      projectId: 'project-1',
      mapId: 'map-1',
      canonicalRoot: record.rootDir,
      policyFingerprint: 'policy-a',
    });
    await expect(
      clearArchivedSiyuanSummaryDocuments(
        'project-1',
        'map-1',
        {
          scope: job.scope,
          archivedAt: 200,
          job,
          entries: [
            {
              nodeId: 'file-node',
              parentNodeId: null,
              title: 'index.ts',
              kind: 'file',
              relativePath: 'index.ts',
              sourcePointer: `${record.rootDir}\\index.ts`,
              summary: 'Generated locally.',
              summaryState: 'completed',
              sizeBytes: 42,
              modifiedAt: 1,
            },
          ],
          frontier: [],
          summaryUsage: [],
        },
        nativePort,
      ),
    ).rejects.toThrow('siyuan_summary_binding_authority_mismatch');
    expect(nativePort.updateManagedDocument).not.toHaveBeenCalled();
  });

  it('creates a managed SiYuan document containing the real Context tree', async () => {
    const nativePort = port();
    const integration = createSiyuanContextMapIntegration(nativePort);
    const result = await integration.sync('project-1', map());
    expect(result.document.id).toBe('created-1');
    expect(result.tree.nodes[0]?.children?.[0]?.path).toBe('index.ts');
    expect(result.tree.nodes[0]?.children?.[0]?.id).toBe('file');
    expect(nativePort.createManagedDocument).toHaveBeenCalledTimes(3);
    const markdown = vi.mocked(nativePort.createManagedDocument).mock.calls[0]?.[2] ?? '';
    expect(markdown).toContain('vibespace-context-map:v1 map=map-1');
    expect(markdown).toMatch(/payload=[A-Za-z0-9_-]+/u);
    expect(markdown).not.toContain('index.ts');
    expect(markdown).not.toContain('apiKey');
    expect(nativePort.readManagedDocument).toHaveBeenCalledTimes(1);
    expect(result.manifest?.nodeBindings).toEqual({ root: 'created-2' });
    expect(result.manifest?.summaryModel).toEqual({
      kind: 'local',
      modelId: 'local-structural',
    });
    const nodeBodies = vi
      .mocked(nativePort.createManagedDocument)
      .mock.calls.slice(1)
      .map((call) => call[2]);
    expect(nodeBodies[0]).toContain('vibespace-context-node:v1 map=map-1 node=root');
    expect(nodeBodies[1]).toContain('Parent: ((created-2 "Parent"))');
    expect(nodeBodies[1]).toContain('# index.ts');
  });

  it('updates the exact owned document instead of creating a duplicate', async () => {
    const nativePort = port({ markdown: '<!-- vibespace-context-map:v1 map=map-1 -->\nold' });
    const integration = createSiyuanContextMapIntegration(nativePort);
    await integration.sync('project-1', map());
    expect(nativePort.updateManagedDocument).toHaveBeenCalledOnce();
    expect(nativePort.createManagedDocument).toHaveBeenCalledTimes(2);
  });

  it('recovers an uncheckpointed native node after an interrupted create', async () => {
    const nativePort = port();
    const originalCreate = vi.mocked(nativePort.createManagedDocument).getMockImplementation()!;
    let nodeCreateAttempts = 0;
    vi.mocked(nativePort.createManagedDocument).mockImplementation(
      async (projectId, path, markdown) => {
        if (markdown.includes('vibespace-context-node:v1')) {
          nodeCreateAttempts += 1;
          if (nodeCreateAttempts === 1) {
            const recovered = await originalCreate(projectId, path, markdown);
            throw new Error(`interrupted_after_create:${recovered.id}`);
          }
        }
        return originalCreate(projectId, path, markdown);
      },
    );

    const result = await createSiyuanContextMapIntegration(nativePort).sync('project-1', map());

    expect(result.manifest?.counts.indexed).toBe(2);
    expect(nativePort.readManagedDocument).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({ query: 'root' }),
    );
  });

  it('checkpoints each completed native node before a later create fails', async () => {
    const nativePort = port();
    const job = createSiyuanIndexJob({
      accountId: 'account-1',
      projectId: 'project-1',
      mapId: 'map-1',
      canonicalRoot: 'C:/Work/Example',
      policyFingerprint: 'policy',
    });
    await replaceSiyuanIndexJob(job, {
      path: 'C:/Work/Example',
      relativePath: '',
      parentNodeId: null,
    });
    const originalCreate = vi.mocked(nativePort.createManagedDocument).getMockImplementation()!;
    vi.mocked(nativePort.createManagedDocument).mockImplementation(
      async (projectId, path, markdown) => {
        if (markdown.includes('vibespace-context-node:v1 map=map-1 node=file')) {
          throw new Error('simulated_file_create_failure');
        }
        return originalCreate(projectId, path, markdown);
      },
    );

    await expect(
      createSiyuanContextMapIntegration(nativePort).sync('project-1', map()),
    ).rejects.toThrow('simulated_file_create_failure');

    expect(await readSiyuanNodeBindings('project-1', 'map-1')).toMatchObject({
      root: 'created-2',
    });
    expect(readSiyuanMapManifest('project-1', 'map-1')).toMatchObject({
      notebookId: 'notebook-1',
      rootDocumentId: 'created-1',
      status: 'error',
    });
    expect((await readSiyuanIndexJob('project-1', 'map-1'))?.status).toBe('failed');
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

  it('retires only owned SiYuan index documents and leaves original source pointers untouched', async () => {
    const nativePort = port();
    const integration = createSiyuanContextMapIntegration(nativePort);
    const record = map();
    await integration.sync('project-1', record);
    const job = createSiyuanIndexJob({
      accountId: 'account-1',
      projectId: 'project-1',
      mapId: record.id,
      canonicalRoot: 'C:/Work/Example',
      policyFingerprint: 'policy',
    });
    await replaceSiyuanIndexJob(job, {
      path: 'C:/Work/Example',
      relativePath: '',
      parentNodeId: null,
    });
    await integration.retire('project-1', record);

    expect(nativePort.deleteManagedDocument).toHaveBeenCalledTimes(3);
    expect(readSiyuanMapManifest('project-1', 'map-1')).toMatchObject({
      status: 'recycled',
      rootDocumentId: null,
      nodeBindings: {},
      counts: { indexed: 0 },
    });
    expect(record.rootDir).toBe('C:\\Work\\Example');
    expect((await readSiyuanIndexJob('project-1', record.id))?.status).toBe('paused');
  });

  it('keeps restore recoverable when native retirement fails after deleting one document', async () => {
    const nativePort = port();
    const integration = createSiyuanContextMapIntegration(nativePort);
    const record = map();
    await integration.sync('project-1', record);
    const originalDelete = vi.mocked(nativePort.deleteManagedDocument).getMockImplementation()!;
    let deletions = 0;
    vi.mocked(nativePort.deleteManagedDocument).mockImplementation(
      async (projectId, id, expectedMarkdown) => {
        deletions += 1;
        if (deletions === 2) throw new Error('simulated_retire_failure');
        return originalDelete(projectId, id, expectedMarkdown);
      },
    );

    await expect(integration.retire('project-1', record)).rejects.toThrow(
      'simulated_retire_failure',
    );
    expect(await readSiyuanNodeBindings('project-1', record.id)).toEqual({});
    expect(readSiyuanMapManifest('project-1', record.id)).toMatchObject({
      status: 'recycled',
      rootDocumentId: null,
      nodeBindings: {},
    });

    vi.mocked(nativePort.deleteManagedDocument).mockImplementation(originalDelete);
    const restored = await integration.sync('project-1', record);
    expect(restored.manifest?.status).toBe('ready');
    expect(restored.manifest?.counts.indexed).toBe(2);
    expect(await readSiyuanNodeBindings('project-1', record.id)).toEqual(
      expect.objectContaining({ root: expect.any(String), file: expect.any(String) }),
    );
  });

  it('reconciles a deleted source entry without rewriting unchanged native nodes', async () => {
    const nativePort = port();
    const integration = createSiyuanContextMapIntegration(nativePort);
    const changed = map();
    await integration.sync('project-1', changed);
    changed.tree.nodes[0]!.children = [];
    changed.tree.fileCount = 0;
    await integration.sync('project-1', changed);

    expect(nativePort.deleteManagedDocument).toHaveBeenCalledWith(
      'project-1',
      'created-3',
      expect.stringContaining('vibespace-context-node:v1 map=map-1 node=file'),
    );
  });

  it('keeps a cancelled index resumable instead of publishing a false ready state', async () => {
    const nativePort = port();
    const control = createSiyuanIndexJobControl();
    control.cancel();
    await expect(
      createSiyuanContextMapIntegration(nativePort).sync('project-1', map(), { control }),
    ).rejects.toThrow('siyuan_index_cancelled');
    expect(readSiyuanMapManifest('project-1', 'map-1')?.status).toBe('paused');
  });

  it('pauses both the durable job and manifest when no registered local summary model exists', async () => {
    const record = { ...map(), id: 'map-local-unavailable' };
    const policy = { mode: 'all' as const, selectedExtensions: [], selectedPaths: [] };
    const job = {
      ...createSiyuanIndexJob({
        accountId: 'account-1',
        projectId: 'project-1',
        mapId: record.id,
        canonicalRoot: record.rootDir,
        policyFingerprint: siyuanIndexPolicyFingerprint(record.rootDir, policy, []),
      }),
      phase: 'creating_nodes' as const,
      indexed: 1,
    };
    await replaceSiyuanIndexJob(job, {
      path: record.rootDir,
      relativePath: '',
      parentNodeId: null,
    });
    await checkpointSiyuanIndexJob({
      job,
      appendedEntries: [
        {
          nodeId: 'file',
          parentNodeId: null,
          title: 'index.ts',
          kind: 'file',
          relativePath: 'index.ts',
          sourcePointer: `${record.rootDir}\\index.ts`,
          summary: null,
          sizeBytes: 42,
          modifiedAt: 2,
        },
      ],
    });
    const previousInternals = (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    const previousModel = useAuthStore.getState().defaultLocalModel;
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    useAuthStore.setState({ defaultLocalModel: '' });
    try {
      await expect(
        createSiyuanContextMapIntegration(port()).sync('project-1', record, {
          accountId: 'account-1',
          summaryPolicy: policy,
          list: async (path) => ({
            ok: true,
            path,
            entries: [
              {
                name: 'index.ts',
                path: `${record.rootDir}\\index.ts`,
                isDir: false,
                size: 42,
                modifiedMs: 2,
              },
            ],
          }),
        }),
      ).rejects.toThrow('local_model_unavailable');
      expect(await readSiyuanIndexJob('project-1', record.id)).toMatchObject({
        phase: 'summarizing',
        status: 'paused',
        pauseReason: 'local_model_unavailable',
        indexed: 1,
        summarized: 0,
        totalTokens: 0,
      });
      expect(readSiyuanMapManifest('project-1', record.id)?.status).toBe('paused');
    } finally {
      useAuthStore.setState({ defaultLocalModel: previousModel });
      if (previousInternals === undefined) {
        delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
      } else {
        (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = previousInternals;
      }
    }
  });

  it.each([
    ['missing approval', null],
    [
      'changed approval route',
      {
        providerId: 'openai',
        connectionId: 'openai-api',
        modelId: 'gpt-5-mini',
        sourceRoot: 'C:\\Work\\Example',
        summaryPolicyFingerprint: 'placeholder',
        eligibleFileCount: 1,
        eligibleSourceBytes: 42,
        estimatedMaxSentBytes: 48 * 1024,
        privacyAcknowledged: true as const,
        approvedAt: 10,
      },
    ],
  ])('fails closed for a cloud-pinned job with %s', async (_label, approval) => {
    const record = { ...map(), id: `map-cloud-${approval ? 'changed' : 'missing'}` };
    const policy = { mode: 'all' as const, selectedExtensions: [], selectedPaths: [] };
    const fingerprint = siyuanIndexPolicyFingerprint(record.rootDir, policy, []);
    const job = {
      ...createSiyuanIndexJob({
        accountId: 'account-1',
        projectId: 'project-1',
        mapId: record.id,
        canonicalRoot: record.rootDir,
        policyFingerprint: fingerprint,
      }),
      phase: 'creating_nodes' as const,
      indexed: 1,
      summaryProviderId: 'deepseek',
      summaryConnectionId: 'deepseek-api',
      summaryModelId: 'deepseek-chat',
    };
    await replaceSiyuanIndexJob(job, {
      path: record.rootDir,
      relativePath: '',
      parentNodeId: null,
    });
    await checkpointSiyuanIndexJob({
      job,
      appendedEntries: [
        {
          nodeId: 'file',
          parentNodeId: null,
          title: 'index.ts',
          kind: 'file',
          relativePath: 'index.ts',
          sourcePointer: `${record.rootDir}\\index.ts`,
          summary: null,
          sizeBytes: 42,
          modifiedAt: 2,
        },
      ],
    });
    let manifest = createSiyuanMapManifest(record, 'project-1', policy);
    if (approval) {
      manifest = updateSiyuanMapManifest(manifest, {
        cloudSummaryApproval: { ...approval, summaryPolicyFingerprint: fingerprint },
      });
    }
    writeSiyuanMapManifest(manifest);
    const previousInternals = (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    try {
      await expect(
        createSiyuanContextMapIntegration(port()).sync('project-1', record, {
          accountId: 'account-1',
          summaryPolicy: policy,
          list: async (path) => ({
            ok: true,
            path,
            entries: [
              {
                name: 'index.ts',
                path: `${record.rootDir}\\index.ts`,
                isDir: false,
                size: 42,
                modifiedMs: 2,
              },
            ],
          }),
        }),
      ).rejects.toThrow(/siyuan_cloud_summary_(?:approval_required|restart_required)/u);
      expect(await readSiyuanIndexJob('project-1', record.id)).toMatchObject({
        status: 'paused',
        pauseReason: 'cloud_approval_required',
        summarized: 0,
        totalTokens: 0,
      });
      expect(readSiyuanMapManifest('project-1', record.id)?.status).toBe('paused');
    } finally {
      if (previousInternals === undefined) {
        delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
      } else {
        (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = previousInternals;
      }
    }
  });

  it('reconciles added and deleted native files before publishing a resumed map ready', async () => {
    const record = { ...map(), id: 'map-native-reconcile' };
    const policy = { mode: 'none' as const, selectedExtensions: [], selectedPaths: [] };
    const job = {
      ...createSiyuanIndexJob({
        accountId: 'account-1',
        projectId: 'project-1',
        mapId: record.id,
        canonicalRoot: record.rootDir,
        policyFingerprint: siyuanIndexPolicyFingerprint(record.rootDir, policy, []),
      }),
      phase: 'creating_nodes' as const,
      indexed: 1,
    };
    await replaceSiyuanIndexJob(job, {
      path: record.rootDir,
      relativePath: '',
      parentNodeId: null,
    });
    await checkpointSiyuanIndexJob({
      job,
      appendedEntries: [
        {
          nodeId: 'path:old.txt',
          parentNodeId: null,
          title: 'old.txt',
          kind: 'file',
          relativePath: 'old.txt',
          sourcePointer: `${record.rootDir}\\old.txt`,
          summary: null,
          sizeBytes: 1,
          modifiedAt: 1,
        },
      ],
    });
    const previousInternals = (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    const nativePort = port();
    try {
      const result = await createSiyuanContextMapIntegration(nativePort).sync('project-1', record, {
        accountId: 'account-1',
        summaryPolicy: policy,
        list: async (path) => ({
          ok: true,
          path,
          entries: [
            {
              name: 'new.txt',
              path: `${record.rootDir}\\new.txt`,
              isDir: false,
              size: 2,
              modifiedMs: 2,
            },
          ],
        }),
      });
      expect(result.manifest).toMatchObject({ status: 'ready', counts: { indexed: 1 } });
      expect((await readSiyuanIndexJob('project-1', record.id))?.status).toBe('completed');
      expect(await readSiyuanNodeBindings('project-1', record.id)).toEqual({
        'path:new.txt': expect.any(String),
      });
      expect(nativePort.deleteManagedDocument).toHaveBeenCalledWith(
        'project-1',
        expect.any(String),
        expect.stringContaining('node=path%3Aold.txt'),
      );
    } finally {
      if (previousInternals === undefined) {
        delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
      } else {
        (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = previousInternals;
      }
    }
  });

  it('keeps a brand-new native creation single-pass', async () => {
    const record = { ...map(), id: 'map-native-single-pass' };
    const previousInternals = (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    const list = vi.fn(async (path: string) => ({
      ok: true as const,
      path,
      entries: [
        {
          name: 'index.ts',
          path: `${record.rootDir}\\index.ts`,
          isDir: false,
          size: 42,
          modifiedMs: 2,
        },
      ],
    }));
    try {
      await createSiyuanContextMapIntegration(port()).sync('project-1', record, {
        accountId: 'account-1',
        summaryPolicy: { mode: 'none', selectedExtensions: [], selectedPaths: [] },
        list,
      });
      expect(list).toHaveBeenCalledOnce();
    } finally {
      if (previousInternals === undefined) {
        delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
      } else {
        (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = previousInternals;
      }
    }
  });

  it('pauses the authoritative active sync and prevents later native completion', async () => {
    const record = { ...map(), id: 'map-active-pause' };
    const previousInternals = (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    const integration = createSiyuanContextMapIntegration(port());
    let markListStarted!: () => void;
    const listStarted = new Promise<void>((resolve) => {
      markListStarted = resolve;
    });
    let releaseList!: () => void;
    const listReleased = new Promise<void>((resolve) => {
      releaseList = resolve;
    });
    try {
      const running = integration
        .sync('project-1', record, {
          accountId: 'account-1',
          summaryPolicy: { mode: 'none', selectedExtensions: [], selectedPaths: [] },
          list: async (path) => {
            markListStarted();
            await listReleased;
            return { ok: true, path, entries: [] };
          },
        })
        .catch((error: unknown) => error);
      await listStarted;
      const pausing = integration.pause('project-1', record.id);
      releaseList();
      await pausing;
      await expect(running).resolves.toMatchObject({ message: 'siyuan_index_cancelled' });
      expect(await readSiyuanIndexJob('project-1', record.id)).toMatchObject({
        status: 'paused',
        pauseReason: 'user',
        completedAt: null,
      });
      expect(readSiyuanMapManifest('project-1', record.id)?.status).toBe('paused');
    } finally {
      if (previousInternals === undefined) {
        delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
      } else {
        (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = previousInternals;
      }
    }
  });

  it('reconciles already-processed directories after a discovery-phase restart', async () => {
    const record = { ...map(), id: 'map-discovery-resume' };
    const policy = { mode: 'none' as const, selectedExtensions: [], selectedPaths: [] };
    const job = {
      ...createSiyuanIndexJob({
        accountId: 'account-1',
        projectId: 'project-1',
        mapId: record.id,
        canonicalRoot: record.rootDir,
        policyFingerprint: siyuanIndexPolicyFingerprint(record.rootDir, policy, []),
        now: 1,
      }),
      cursor: 1,
      indexed: 1,
      updatedAt: 2,
    };
    await replaceSiyuanIndexJob(job, {
      path: record.rootDir,
      relativePath: '',
      parentNodeId: null,
    });
    await checkpointSiyuanIndexJob({
      job,
      appendedEntries: [
        {
          nodeId: 'path:old.txt',
          parentNodeId: null,
          title: 'old.txt',
          kind: 'file',
          relativePath: 'old.txt',
          sourcePointer: `${record.rootDir}\\old.txt`,
          summary: null,
          sizeBytes: 1,
          modifiedAt: 1,
        },
      ],
    });
    const previousInternals = (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    try {
      await createSiyuanContextMapIntegration(port()).sync('project-1', record, {
        accountId: 'account-1',
        summaryPolicy: policy,
        list: async (path) => ({
          ok: true,
          path,
          entries: [
            {
              name: 'new.txt',
              path: `${record.rootDir}\\new.txt`,
              isDir: false,
              size: 2,
              modifiedMs: 2,
            },
          ],
        }),
      });
      expect(await readSiyuanNodeBindings('project-1', record.id)).toEqual({
        'path:new.txt': expect.any(String),
      });
      expect(await readSiyuanIndexJob('project-1', record.id)).toMatchObject({
        phase: 'completed',
        indexed: 1,
        reconciledAt: expect.any(Number),
      });
    } finally {
      if (previousInternals === undefined) {
        delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
      } else {
        (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = previousInternals;
      }
    }
  });
});
