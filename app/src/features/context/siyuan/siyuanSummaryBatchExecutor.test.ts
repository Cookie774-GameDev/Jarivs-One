import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SiyuanIndexJobControl, SiyuanSafeIndexEntry } from './siyuanSafeIndex';
import type { SiyuanPreparedSummary } from './siyuanSummaryBatch';
import type { SiyuanSummaryBatchGeneration } from './siyuanSummaryBatchGenerator';
import { executeSiyuanSummaryBatches } from './siyuanSummaryBatchExecutor';
import {
  listSiyuanSummaryBatches,
  resetSiyuanSummaryBatchStoreForTests,
} from './siyuanSummaryBatchStore';

const identity = Object.freeze({
  providerId: 'opencode',
  connectionId: 'opencode-cli',
  modelId: 'opencode-go/deepseek-v4-flash-vision-exp',
  effort: 'high' as const,
});

function prepared(nodeId: string): SiyuanPreparedSummary {
  const content = `export const ${nodeId} = true;`;
  return {
    entry: {
      nodeId,
      parentNodeId: 'managed-root',
      title: `${nodeId}.ts`,
      kind: 'file',
      relativePath: `src/${nodeId}.ts`,
      sourcePointer: `C:/repo/src/${nodeId}.ts`,
      summary: null,
      sizeBytes: new TextEncoder().encode(content).byteLength,
      modifiedAt: 1,
    },
    content,
    contentBytes: new TextEncoder().encode(content).byteLength,
  };
}

function generation(
  files: readonly SiyuanPreparedSummary[],
  summaryFor: (nodeId: string) => string = (nodeId) => `${nodeId} summary.`,
): SiyuanSummaryBatchGeneration {
  const completedAt = Date.now();
  return {
    identity,
    requestId: 'request-1',
    sessionId: 'session-1',
    summaries: files.map((file) => ({
      nodeId: file.entry.nodeId,
      summary: summaryFor(file.entry.nodeId),
    })),
    inputTokens: 100,
    outputTokens: 20,
    totalTokens: 120,
    costUsd: 0.01,
    tokenProvenance: 'estimated',
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cacheProvenance: 'unavailable',
    costProvenance: 'reported',
    finishReason: 'stop',
    dispatchedAt: completedAt,
    completedAt,
    durationMs: 0,
  };
}

function runningControl(): SiyuanIndexJobControl {
  return {
    state: 'running',
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(),
    checkpoint: vi.fn(async () => undefined),
  };
}

function executorInput(files: readonly SiyuanPreparedSummary[]) {
  return {
    projectId: 'project-1',
    mapId: 'map-1',
    policyFingerprint: 'policy-1',
    identity,
    files,
    laneCount: 1,
    durableControl: runningControl(),
  };
}

describe('durable SiYuan summary batch executor', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetSiyuanSummaryBatchStoreForTests();
  });

  it('recovers a paid partially-applied receipt without another model request', async () => {
    const files = [prepared('one'), prepared('two')];
    const firstGenerate = vi.fn(async () => generation(files));
    let firstApplyCount = 0;
    await expect(
      executeSiyuanSummaryBatches({
        ...executorInput(files),
        generate: firstGenerate,
        apply: vi.fn(async () => {
          firstApplyCount += 1;
          if (firstApplyCount === 2) throw new Error('simulated_apply_crash');
        }),
      }),
    ).rejects.toThrow('simulated_apply_crash');

    const afterCrash = await listSiyuanSummaryBatches('project-1\u0000map-1');
    expect(afterCrash).toHaveLength(1);
    expect(afterCrash[0]).toMatchObject({
      state: 'staged',
      ownerId: null,
      receipt: {
        identity,
        requestId: 'request-1',
        sessionId: 'session-1',
        usage: { totalTokens: 120 },
      },
    });
    expect(afterCrash[0]!.appliedNodeRevisionKeys).toHaveLength(1);

    const resumeGenerate = vi.fn(async () => generation(files));
    const resumedEntries: SiyuanSafeIndexEntry[] = [];
    await expect(
      executeSiyuanSummaryBatches({
        ...executorInput(files),
        generate: resumeGenerate,
        apply: vi.fn(async ({ entry }) => {
          resumedEntries.push(entry);
        }),
      }),
    ).resolves.toEqual({ completedBatches: 1, completedFiles: 2 });

    expect(firstGenerate).toHaveBeenCalledTimes(1);
    expect(resumeGenerate).not.toHaveBeenCalled();
    expect(resumedEntries.map((entry) => entry.nodeId)).toEqual(['two']);
    await expect(listSiyuanSummaryBatches('project-1\u0000map-1')).resolves.toEqual([
      expect.objectContaining({
        state: 'completed',
        receipt: expect.objectContaining({ identity }),
      }),
    ]);
  });

  it('resumes a paid partial batch deterministically after input order changes', async () => {
    const originalOrder = [prepared('three'), prepared('one'), prepared('two')];
    const successfullyApplied: string[] = [];
    let applyAttempt = 0;
    await expect(
      executeSiyuanSummaryBatches({
        ...executorInput(originalOrder),
        generate: vi.fn(async (batch) => generation(batch.files)),
        apply: vi.fn(async ({ entry }) => {
          applyAttempt += 1;
          if (applyAttempt === 2) throw new Error('simulated_apply_crash');
          successfullyApplied.push(entry.nodeId);
        }),
      }),
    ).rejects.toThrow('simulated_apply_crash');

    const [staged] = await listSiyuanSummaryBatches('project-1\u0000map-1');
    expect(staged).toMatchObject({
      state: 'staged',
      ownerId: null,
      receipt: expect.objectContaining({ identity }),
    });
    expect(staged!.appliedNodeRevisionKeys).toHaveLength(1);

    const reversedInput = [...originalOrder].reverse();
    const resumedGenerate = vi.fn(async (batch) => generation(batch.files));
    await expect(
      executeSiyuanSummaryBatches({
        ...executorInput(reversedInput),
        generate: resumedGenerate,
        apply: vi.fn(async ({ entry }) => {
          successfullyApplied.push(entry.nodeId);
        }),
      }),
    ).resolves.toEqual({ completedBatches: 1, completedFiles: 3 });

    expect(resumedGenerate).not.toHaveBeenCalled();
    expect(successfullyApplied).toHaveLength(3);
    expect(new Set(successfullyApplied)).toEqual(new Set(['one', 'two', 'three']));
    const [completed] = await listSiyuanSummaryBatches('project-1\u0000map-1');
    expect(completed).toMatchObject({
      batchId: staged!.batchId,
      state: 'completed',
      appliedNodeRevisionKeys: staged!.nodeRevisionKeys,
    });
  });

  it('reports base attempt zero and the exact numbered retry attempt', async () => {
    const baseAttempts: Array<{ batchId: string; attempt: number }> = [];
    await expect(
      executeSiyuanSummaryBatches({
        ...executorInput([prepared('base')]),
        mapId: 'map-base-attempt',
        generate: vi.fn(async (batch) => generation(batch.files)),
        apply: vi.fn(async ({ batchId, batchAttempt }) => {
          baseAttempts.push({ batchId, attempt: batchAttempt });
        }),
      }),
    ).resolves.toEqual({ completedBatches: 1, completedFiles: 1 });
    expect(baseAttempts).toEqual([
      expect.objectContaining({ attempt: 0, batchId: expect.not.stringMatching(/-retry-/u) }),
    ]);

    const retryInput = {
      ...executorInput([prepared('retry')]),
      mapId: 'map-retry-attempt',
    };
    await expect(
      executeSiyuanSummaryBatches({
        ...retryInput,
        generate: vi.fn(async () => {
          throw new Error('siyuan_index_paused');
        }),
        apply: vi.fn(async () => undefined),
      }),
    ).rejects.toThrow('siyuan_index_paused');

    const retryAttempts: Array<{ batchId: string; attempt: number }> = [];
    await expect(
      executeSiyuanSummaryBatches({
        ...retryInput,
        generate: vi.fn(async (batch) => generation(batch.files)),
        apply: vi.fn(async ({ batchId, batchAttempt }) => {
          retryAttempts.push({ batchId, attempt: batchAttempt });
        }),
      }),
    ).resolves.toEqual({ completedBatches: 1, completedFiles: 1 });
    expect(retryAttempts).toEqual([
      expect.objectContaining({ attempt: 1, batchId: expect.stringMatching(/-retry-1$/u) }),
    ]);
  });

  it('releases unpaid pause and cancellation claims but retains provider-failure claims', async () => {
    const pauseInput = {
      ...executorInput([prepared('pause')]),
      mapId: 'map-pause-release',
    };
    await expect(
      executeSiyuanSummaryBatches({
        ...pauseInput,
        generate: vi.fn(async () => {
          throw new Error('siyuan_index_paused');
        }),
        apply: vi.fn(async () => undefined),
      }),
    ).rejects.toThrow('siyuan_index_paused');
    await expect(listSiyuanSummaryBatches('project-1\u0000map-pause-release')).resolves.toEqual([
      expect.objectContaining({ state: 'failed', failureReason: 'pause_released' }),
    ]);
    await expect(
      executeSiyuanSummaryBatches({
        ...pauseInput,
        generate: vi.fn(async (batch) => generation(batch.files)),
        apply: vi.fn(async () => undefined),
      }),
    ).resolves.toEqual({ completedBatches: 1, completedFiles: 1 });

    const cancellation = new AbortController();
    const cancelInput = {
      ...executorInput([prepared('cancel')]),
      mapId: 'map-cancel-release',
      signal: cancellation.signal,
    };
    await expect(
      executeSiyuanSummaryBatches({
        ...cancelInput,
        generate: vi.fn(async () => {
          cancellation.abort();
          throw new DOMException('The request was aborted.', 'AbortError');
        }),
        apply: vi.fn(async () => undefined),
      }),
    ).rejects.toThrow('The request was aborted.');
    await expect(listSiyuanSummaryBatches('project-1\u0000map-cancel-release')).resolves.toEqual([
      expect.objectContaining({ state: 'failed', failureReason: 'cancel_released' }),
    ]);
    await expect(
      executeSiyuanSummaryBatches({
        ...executorInput([prepared('cancel')]),
        mapId: 'map-cancel-release',
        generate: vi.fn(async (batch) => generation(batch.files)),
        apply: vi.fn(async () => undefined),
      }),
    ).resolves.toEqual({ completedBatches: 1, completedFiles: 1 });

    const failureInput = {
      ...executorInput([prepared('failure')]),
      mapId: 'map-provider-failure',
    };
    await expect(
      executeSiyuanSummaryBatches({
        ...failureInput,
        generate: vi.fn(async () => {
          throw new Error('provider_failed_after_dispatch');
        }),
        apply: vi.fn(async () => undefined),
      }),
    ).rejects.toThrow('provider_failed_after_dispatch');
    await expect(listSiyuanSummaryBatches('project-1\u0000map-provider-failure')).resolves.toEqual([
      expect.objectContaining({ state: 'failed', failureReason: 'provider_failed' }),
    ]);
    const forbiddenRepay = vi.fn(async (batch) => generation(batch.files));
    await expect(
      executeSiyuanSummaryBatches({
        ...failureInput,
        generate: forbiddenRepay,
        apply: vi.fn(async () => undefined),
      }),
    ).rejects.toThrow('siyuan_summary_batch_claim_conflict');
    expect(forbiddenRepay).not.toHaveBeenCalled();
  });

  it('stages a paid response before a raced durable pause and resumes receipt-only', async () => {
    const files = [prepared('one')];
    let paused = false;
    const durableControl: SiyuanIndexJobControl = {
      state: 'running',
      pause: vi.fn(),
      resume: vi.fn(),
      cancel: vi.fn(),
      checkpoint: vi.fn(async () => {
        if (paused) throw new Error('siyuan_index_paused');
      }),
    };
    const paidGenerate = vi.fn(async () => {
      paused = true;
      return generation(files);
    });

    await expect(
      executeSiyuanSummaryBatches({
        ...executorInput(files),
        durableControl,
        generate: paidGenerate,
        apply: vi.fn(async () => undefined),
      }),
    ).rejects.toThrow('siyuan_index_paused');
    await expect(listSiyuanSummaryBatches('project-1\u0000map-1')).resolves.toEqual([
      expect.objectContaining({
        state: 'staged',
        ownerId: null,
        receipt: expect.objectContaining({ identity }),
      }),
    ]);

    const resumeGenerate = vi.fn(async () => generation(files));
    const apply = vi.fn(async () => undefined);
    await expect(
      executeSiyuanSummaryBatches({
        ...executorInput(files),
        generate: resumeGenerate,
        apply,
      }),
    ).resolves.toEqual({ completedBatches: 1, completedFiles: 1 });
    expect(paidGenerate).toHaveBeenCalledTimes(1);
    expect(resumeGenerate).not.toHaveBeenCalled();
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('rejects generated route identity drift before staging or apply', async () => {
    const files = [prepared('one')];
    const apply = vi.fn(async () => undefined);
    await expect(
      executeSiyuanSummaryBatches({
        ...executorInput(files),
        generate: vi.fn(async () => ({
          ...generation(files),
          identity: { ...identity, modelId: 'substituted-model' },
        })),
        apply,
      }),
    ).rejects.toThrow('siyuan_summary_model_identity_mismatch');
    expect(apply).not.toHaveBeenCalled();
    await expect(listSiyuanSummaryBatches('project-1\u0000map-1')).resolves.toEqual([
      expect.objectContaining({ state: 'failed', receipt: null }),
    ]);
  });

  it('keeps completed receipts separate when an authorized restart changes exact route', async () => {
    const files = [prepared('one')];
    await expect(
      executeSiyuanSummaryBatches({
        ...executorInput(files),
        generate: vi.fn(async () => generation(files)),
        apply: vi.fn(async () => undefined),
      }),
    ).resolves.toEqual({ completedBatches: 1, completedFiles: 1 });

    const alternateIdentity = {
      providerId: 'opencode',
      connectionId: 'opencode-cli',
      modelId: 'openai/gpt-5.6-luna',
      effort: 'ultra' as const,
    };
    const alternateGenerate = vi.fn(async () => ({
      ...generation(files),
      identity: alternateIdentity,
    }));
    await expect(
      executeSiyuanSummaryBatches({
        ...executorInput(files),
        identity: alternateIdentity,
        generate: alternateGenerate,
        apply: vi.fn(async () => undefined),
      }),
    ).resolves.toEqual({ completedBatches: 1, completedFiles: 1 });

    expect(alternateGenerate).toHaveBeenCalledTimes(1);
    const receipts = await listSiyuanSummaryBatches('project-1\u0000map-1');
    expect(receipts).toHaveLength(2);
    expect(receipts.map((receipt) => receipt.identity)).toEqual([identity, alternateIdentity]);
  });

  it('does not return from a failed lane until aborted sibling generations settle', async () => {
    const files = Array.from({ length: 9 }, (_, index) => prepared(`node-${index}`));
    let releaseLaneZero!: () => void;
    const laneOneStarted = new Promise<void>((resolve) => {
      releaseLaneZero = resolve;
    });
    let siblingSettled = false;
    let resolveSiblingSettled!: () => void;
    const siblingDone = new Promise<void>((resolve) => {
      resolveSiblingSettled = resolve;
    });

    const execution = executeSiyuanSummaryBatches({
      ...executorInput(files),
      laneCount: 2,
      generate: vi.fn(async (batch, signal) => {
        if (batch.lane === 0) {
          await laneOneStarted;
          throw new Error('lane_zero_failed');
        }
        releaseLaneZero();
        return new Promise<SiyuanSummaryBatchGeneration>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              setTimeout(() => {
                siblingSettled = true;
                resolveSiblingSettled();
                reject(new DOMException('The request was aborted.', 'AbortError'));
              }, 10);
            },
            { once: true },
          );
        });
      }),
      apply: vi.fn(async () => undefined),
    });

    await expect(execution).rejects.toThrow('lane_zero_failed');
    const settledWhenExecutorReturned = siblingSettled;
    await siblingDone;
    expect(settledWhenExecutorReturned).toBe(true);
  });

  it('retains ownership until a bounded paid generation can be staged', async () => {
    const files = [prepared('one')];
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const apply = vi.fn(async () => undefined);

    const result = executeSiyuanSummaryBatches({
      ...executorInput(files),
      generate: vi.fn(async () => {
        now += 5 * 60 * 1_000 + 1;
        return { ...generation(files), completedAt: now };
      }),
      apply,
    });

    await expect(result).resolves.toEqual({ completedBatches: 1, completedFiles: 1 });
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('rejects secret-bearing model output before it reaches native or durable apply', async () => {
    const files = [prepared('one')];
    const apply = vi.fn(async () => undefined);

    await expect(
      executeSiyuanSummaryBatches({
        ...executorInput(files),
        generate: vi.fn(async () =>
          generation(files, () => 'The credential is sk-live-123456789012345678901234.'),
        ),
        apply,
      }),
    ).rejects.toThrow('siyuan_summary_output_rejected');
    expect(apply).not.toHaveBeenCalled();
  });
});
