import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SiyuanSafeIndexEntry } from './siyuanSafeIndex';
import {
  checkpointSiyuanIndexJob,
  checkpointSiyuanSummaryBatchNode,
  createSiyuanIndexJob,
  readSiyuanIndexJob,
  readSiyuanSummaryUsage,
  replaceSiyuanIndexJob,
  type SiyuanSummaryUsageBatch,
} from './siyuanIndexJobStore';

async function resetDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('vibespace-siyuan-index-jobs');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('database_delete_blocked'));
  });
}

function completed(nodeId: string): SiyuanSafeIndexEntry {
  return {
    nodeId,
    parentNodeId: null,
    title: `${nodeId}.ts`,
    kind: 'file',
    relativePath: `${nodeId}.ts`,
    sourcePointer: `C:/repo/${nodeId}.ts`,
    summary: `${nodeId} summary`,
    summaryState: 'completed',
    sizeBytes: 10,
    modifiedAt: 1,
  };
}

async function createRunningSummaryJob(mapId = 'map-1'): Promise<void> {
  const job = {
    ...createSiyuanIndexJob({
      projectId: 'project-1',
      mapId,
      canonicalRoot: 'C:/repo',
      policyFingerprint: 'policy-1',
      now: 1,
    }),
    phase: 'summarizing' as const,
    summaryEligible: 2,
    summaryProviderId: 'opencode',
    summaryConnectionId: 'opencode-cli',
    summaryModelId: 'opencode-go/deepseek-v4-flash-vision-exp',
    summaryEffort: 'high' as const,
  };
  await replaceSiyuanIndexJob(job, {
    path: 'C:/repo',
    relativePath: '',
    parentNodeId: null,
  });
  await checkpointSiyuanIndexJob({
    job,
    appendedEntries: [{ ...completed('one'), summary: null, summaryState: undefined }],
  });
}

function validBatchUsage(
  overrides: Partial<SiyuanSummaryUsageBatch> = {},
): SiyuanSummaryUsageBatch {
  return {
    batchId: 'batch-1',
    requestId: 'request-1',
    sessionId: 'session-1',
    nodeCount: 1,
    policyFingerprint: 'policy-1',
    lane: 0,
    attempt: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cacheProvenance: 'unavailable',
    costUsd: null,
    costProvenance: 'unavailable',
    dispatchedAt: 4,
    durationMs: 6,
    nodeId: 'batch:batch-1',
    sourceModifiedAt: null,
    sourceSizeBytes: null,
    providerId: 'opencode',
    connectionId: 'opencode-cli',
    modelId: 'opencode-go/deepseek-v4-flash-vision-exp',
    effort: 'high',
    effortProvenance: 'requested',
    inputTokens: 100,
    outputTokens: 20,
    totalTokens: 120,
    provenance: 'estimated',
    completedAt: 10,
    ...overrides,
  };
}

describe('atomic SiYuan batch summary apply checkpoint', () => {
  beforeEach(resetDatabase);

  it('counts a replayed node and batch usage exactly once', async () => {
    const job = {
      ...createSiyuanIndexJob({
        projectId: 'project-1',
        mapId: 'map-1',
        canonicalRoot: 'C:/repo',
        policyFingerprint: 'policy-1',
        now: 1,
      }),
      phase: 'summarizing' as const,
      summaryEligible: 2,
      summaryProviderId: 'opencode',
      summaryConnectionId: 'opencode-cli',
      summaryModelId: 'opencode-go/deepseek-v4-flash-vision-exp',
      summaryEffort: 'high' as const,
    };
    await replaceSiyuanIndexJob(job, { path: 'C:/repo', relativePath: '', parentNodeId: null });
    await checkpointSiyuanIndexJob({
      job,
      appendedEntries: [
        { ...completed('one'), summary: null, summaryState: undefined },
        { ...completed('two'), summary: null, summaryState: undefined },
      ],
    });
    const usage = {
      batchId: 'batch-1',
      requestId: 'request-1',
      sessionId: 'session-1',
      nodeCount: 2,
      policyFingerprint: 'policy-1',
      lane: 0,
      attempt: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      cacheProvenance: 'unavailable' as const,
      costUsd: null,
      costProvenance: 'unavailable' as const,
      dispatchedAt: 4,
      durationMs: 6,
      nodeId: 'batch:batch-1',
      sourceModifiedAt: null,
      sourceSizeBytes: null,
      providerId: 'opencode',
      connectionId: 'opencode-cli',
      modelId: 'opencode-go/deepseek-v4-flash-vision-exp',
      effort: 'high' as const,
      effortProvenance: 'requested' as const,
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
      provenance: 'estimated' as const,
      completedAt: 10,
    };
    await checkpointSiyuanSummaryBatchNode({
      projectId: 'project-1',
      mapId: 'map-1',
      entry: completed('one'),
      batchUsage: usage,
      now: 10,
    });
    await checkpointSiyuanSummaryBatchNode({
      projectId: 'project-1',
      mapId: 'map-1',
      entry: completed('one'),
      batchUsage: usage,
      now: 11,
    });
    await checkpointSiyuanSummaryBatchNode({
      projectId: 'project-1',
      mapId: 'map-1',
      entry: completed('two'),
      batchUsage: usage,
      now: 12,
    });
    const saved = await readSiyuanIndexJob('project-1', 'map-1');
    expect(saved).toMatchObject({
      summarized: 2,
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
    });
    const rows = await readSiyuanSummaryUsage('project-1', 'map-1');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ batchId: 'batch-1', nodeCount: 2, totalTokens: 120 });
  });

  it('rejects a stale apply after the durable job is paused', async () => {
    const job = {
      ...createSiyuanIndexJob({
        projectId: 'project-1',
        mapId: 'map-1',
        canonicalRoot: 'C:/repo',
        policyFingerprint: 'policy-1',
        now: 1,
      }),
      phase: 'summarizing' as const,
      status: 'paused' as const,
      pauseReason: 'user' as const,
    };
    await replaceSiyuanIndexJob(job, { path: 'C:/repo', relativePath: '', parentNodeId: null });
    await expect(
      checkpointSiyuanSummaryBatchNode({
        projectId: 'project-1',
        mapId: 'map-1',
        entry: completed('one'),
        now: 2,
      }),
    ).rejects.toThrow('siyuan_index_paused');
  });

  it.each([
    ['negative lane', { lane: -1 }, 'siyuan_summary_batch_lane_invalid'],
    ['lane above the executor maximum', { lane: 5 }, 'siyuan_summary_batch_usage_metadata_invalid'],
    ['negative attempt', { attempt: -1 }, 'siyuan_summary_batch_attempt_invalid'],
    ['fractional attempt', { attempt: 0.5 }, 'siyuan_summary_batch_attempt_invalid'],
  ] as const)('rejects %s at the durable apply boundary', async (_label, overrides, expected) => {
    await createRunningSummaryJob();
    await expect(
      checkpointSiyuanSummaryBatchNode({
        projectId: 'project-1',
        mapId: 'map-1',
        entry: completed('one'),
        batchUsage: validBatchUsage(overrides),
        now: 10,
      }),
    ).rejects.toThrow(expected);
    await expect(readSiyuanSummaryUsage('project-1', 'map-1')).resolves.toEqual([]);
  });

  it('rejects unavailable cache provenance with nonzero cache tokens', async () => {
    await createRunningSummaryJob();
    await expect(
      checkpointSiyuanSummaryBatchNode({
        projectId: 'project-1',
        mapId: 'map-1',
        entry: completed('one'),
        batchUsage: validBatchUsage({ cacheReadTokens: 12 }),
        now: 10,
      }),
    ).rejects.toThrow('siyuan_summary_batch_usage_metadata_invalid');
    await expect(readSiyuanSummaryUsage('project-1', 'map-1')).resolves.toEqual([]);
  });

  it.each([
    ['missing cost', null],
    ['negative cost', -0.01],
    ['non-finite cost', Number.NaN],
  ] as const)('rejects reported cost with %s', async (_label, costUsd) => {
    await createRunningSummaryJob();
    await expect(
      checkpointSiyuanSummaryBatchNode({
        projectId: 'project-1',
        mapId: 'map-1',
        entry: completed('one'),
        batchUsage: validBatchUsage({ costProvenance: 'reported', costUsd }),
        now: 10,
      }),
    ).rejects.toThrow('siyuan_summary_batch_usage_metadata_invalid');
    await expect(readSiyuanSummaryUsage('project-1', 'map-1')).resolves.toEqual([]);
  });

  it.each([
    ['dispatch after completion', { dispatchedAt: 11, durationMs: 0 }],
    ['completion after checkpoint', { completedAt: 11, durationMs: 7 }],
    ['duration inconsistent with timestamps', { durationMs: 5 }],
  ] as const)('rejects %s', async (_label, overrides) => {
    await createRunningSummaryJob();
    await expect(
      checkpointSiyuanSummaryBatchNode({
        projectId: 'project-1',
        mapId: 'map-1',
        entry: completed('one'),
        batchUsage: validBatchUsage(overrides),
        now: 10,
      }),
    ).rejects.toThrow('siyuan_summary_batch_usage_metadata_invalid');
    await expect(readSiyuanSummaryUsage('project-1', 'map-1')).resolves.toEqual([]);
  });
});
