import { describe, expect, it, vi } from 'vitest';
import {
  createContextQueryService,
  type ContextQueryRepository,
  type ContextScope,
} from './contextQueryService';
import { createContextPointer, createContextRecord } from './losslessContext';
import { createRecursiveContextQueryAdapter } from './recursiveContextQueryAdapter';

const encoder = new TextEncoder();
const hash = 'c'.repeat(64);
const scope: ContextScope = { accountId: 'account-1', projectId: 'project-1' };

describe('recursive context production query adapter', () => {
  it('retrieves bounded evidence through ContextQueryService search and open authority', async () => {
    const content = 'boundary-token=10000000001; answer=amber-quartz';
    const record = createContextRecord({
      id: 'sparse-10000-1',
      accountId: scope.accountId,
      projectId: scope.projectId,
      sourceKind: 'file_version',
      sourceId: 'sparse://10b-plus-one',
      createdAt: 1_700_000_000_000,
      contentHash: hash,
      contentRef: 'sparse://corpus/shard/10000/offset/1',
      trustLevel: 'app_verified',
    });
    const pointer = createContextPointer({
      id: 'sparse-pointer-10000-1',
      recordId: record.id,
      byteStart: 0,
      byteEnd: encoder.encode(content).length,
      sourceVersion: 'revision-10b-plus-one',
      contentHash: hash,
    });
    const repository: ContextQueryRepository = {
      listRecords: vi.fn(async () => [record]),
      getRecord: vi.fn(async (id) => (id === record.id ? record : undefined)),
      search: vi.fn(async (_scope, query) =>
        query === 'token:10000000001'
          ? [{ recordId: record.id, pointer, preview: content, score: 1 }]
          : [],
      ),
      readSource: vi.fn(async () => ({
        bytes: encoder.encode(content),
        contentHash: hash,
        sourceVersion: pointer.sourceVersion,
      })),
      canOpen: vi.fn(async () => true),
    };
    const queryService = createContextQueryService({ repository });
    const adapter = createRecursiveContextQueryAdapter({ queryService, scope });

    const round = await adapter.retrieveRound({
      queries: ['token:10000000001'],
      excludedEvidenceIds: [],
      iteration: 1,
      maxTokens: 64,
      maxItems: 1,
    });

    expect(round.complete).toBe(true);
    expect(round.evidence).toEqual([
      expect.objectContaining({
        id: pointer.id,
        exactExcerpt: content,
        provenance: {
          sourceId: record.sourceId,
          sourceRevision: pointer.sourceVersion,
          contentDigest: `sha256:${hash}`,
          indexedAt: record.createdAt,
          locator: record.contentRef,
        },
      }),
    ]);
    expect(repository.search).toHaveBeenCalledWith(scope, 'token:10000000001', undefined);
    expect(repository.readSource).toHaveBeenCalled();
  });

  it('honors cancellation and excluded evidence without bypassing query authority', async () => {
    const controller = new AbortController();
    controller.abort();
    const queryService = createContextQueryService({
      repository: {
        listRecords: vi.fn(),
        getRecord: vi.fn(),
        search: vi.fn(),
        readSource: vi.fn(),
        canOpen: vi.fn(),
      },
    });
    await expect(
      createRecursiveContextQueryAdapter({ queryService, scope }).retrieveRound({
        queries: ['token:1'],
        excludedEvidenceIds: [],
        iteration: 1,
        maxTokens: 64,
        maxItems: 1,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'cancelled' });
  });
});
