import { sha256Text } from '@/lib/fs';
import { applySecretPolicy } from '@/lib/security/secretDetector';
import { planSiyuanSummaryBatches, type SiyuanPreparedSummary } from './siyuanSummaryBatch';
import type { SiyuanSummaryBatchGeneration } from './siyuanSummaryBatchGenerator';
import {
  claimSiyuanSummaryBatch,
  completeSiyuanSummaryBatch,
  listSiyuanSummaryBatches,
  markSiyuanSummaryBatchDispatched,
  markSiyuanSummaryBatchNodeApplied,
  releaseSiyuanSummaryBatch,
  renewSiyuanSummaryBatchLease,
  siyuanSummaryNodeRevisionKey,
  stageSiyuanSummaryBatchReceipt,
  type SiyuanSummaryBatchIdentity,
  type SiyuanSummaryBatchRecord,
} from './siyuanSummaryBatchStore';
import type { SiyuanIndexJobControl, SiyuanSafeIndexEntry } from './siyuanSafeIndex';

const LEASE_MS = 5 * 60 * 1000;

export interface SiyuanSummaryBatchExecutorResult {
  completedBatches: number;
  completedFiles: number;
}

function jobScope(projectId: string, mapId: string): string {
  return `${projectId}\u0000${mapId}`;
}

function sameBatchIdentity(
  left: SiyuanSummaryBatchIdentity,
  right: SiyuanSummaryBatchIdentity,
): boolean {
  return (
    left.providerId === right.providerId &&
    left.connectionId === right.connectionId &&
    left.modelId === right.modelId &&
    left.effort === right.effort
  );
}

function releaseReason(
  error: unknown,
  inputSignal: AbortSignal | undefined,
  executorSignal: AbortSignal,
): 'pause' | 'cancel' | 'failure' {
  const message = error instanceof Error ? error.message : String(error);
  if (message === 'siyuan_index_paused' || inputSignal?.reason === 'siyuan_index_paused') {
    return 'pause';
  }
  if (message === 'siyuan_index_cancelled' || inputSignal?.aborted) return 'cancel';
  if (executorSignal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
    return 'failure';
  }
  return 'failure';
}

export async function executeSiyuanSummaryBatches(input: {
  projectId: string;
  mapId: string;
  policyFingerprint: string;
  identity: SiyuanSummaryBatchIdentity;
  files: readonly SiyuanPreparedSummary[];
  laneCount?: number;
  control?: SiyuanIndexJobControl;
  durableControl: SiyuanIndexJobControl;
  signal?: AbortSignal;
  generate: (
    batch: ReturnType<typeof planSiyuanSummaryBatches>[number],
    signal: AbortSignal,
    markDispatched: (at: number) => Promise<void>,
  ) => Promise<SiyuanSummaryBatchGeneration>;
  apply: (input: {
    entry: SiyuanSafeIndexEntry;
    batchId: string;
    batchNodeCount: number;
    batchLane: number;
    batchAttempt: number;
    usage: SiyuanSummaryBatchGeneration;
  }) => Promise<void>;
}): Promise<SiyuanSummaryBatchExecutorResult> {
  const scope = jobScope(input.projectId, input.mapId);
  const executorAbort = new AbortController();
  const executionSignal = input.signal
    ? AbortSignal.any([input.signal, executorAbort.signal])
    : executorAbort.signal;
  const prepared: Array<{
    file: SiyuanPreparedSummary;
    revision: {
      nodeId: string;
      sourceModifiedAt: number | null;
      sourceSizeBytes: number | null;
      contentBytes: number;
      contentFingerprint: `sha256:${string}`;
    };
  }> = [];
  for (const file of input.files) {
    await input.control?.checkpoint(executionSignal);
    await input.durableControl.checkpoint(executionSignal);
    if (file.contentBytes > 96 * 1024) throw new Error('siyuan_summary_batch_content_too_large');
    prepared.push({
      file,
      revision: {
        nodeId: file.entry.nodeId,
        sourceModifiedAt: file.entry.modifiedAt,
        sourceSizeBytes: file.entry.sizeBytes,
        contentBytes: file.contentBytes,
        contentFingerprint: await sha256Text(file.content),
      },
    });
  }
  prepared.sort((left, right) =>
    siyuanSummaryNodeRevisionKey(left.revision).localeCompare(
      siyuanSummaryNodeRevisionKey(right.revision),
      'en-US',
    ),
  );
  const preparedByRevision = new Map(
    prepared.map((item) => [siyuanSummaryNodeRevisionKey(item.revision), item]),
  );
  const retainedPaidBatches = (await listSiyuanSummaryBatches(scope)).filter(
    (candidate) =>
      candidate.receipt !== null &&
      ['staged', 'applying'].includes(candidate.state) &&
      candidate.policyFingerprint === input.policyFingerprint &&
      sameBatchIdentity(candidate.identity, input.identity),
  );
  const retainedRevisionKeys = new Set<string>();
  const recoveryBatches = retainedPaidBatches.map((record) => {
    for (const key of record.nodeRevisionKeys) {
      if (retainedRevisionKeys.has(key)) {
        throw new Error('siyuan_summary_batch_paid_revision_conflict');
      }
      retainedRevisionKeys.add(key);
    }
    const pendingFiles = record.nodeRevisionKeys
      .filter((key) => !record.appliedNodeRevisionKeys.includes(key))
      .map((key) => {
        const pending = preparedByRevision.get(key);
        if (!pending) throw new Error('siyuan_summary_batch_paid_revision_missing');
        return pending.file;
      });
    return {
      record,
      batch: Object.freeze({
        id: record.batchId,
        lane: 0,
        files: Object.freeze(pendingFiles),
        totalContentBytes: pendingFiles.reduce((total, file) => total + file.contentBytes, 0),
      }),
    };
  });
  const batches = planSiyuanSummaryBatches(
    prepared
      .filter(({ revision }) => !retainedRevisionKeys.has(siyuanSummaryNodeRevisionKey(revision)))
      .map(({ file }) => file),
    { laneCount: input.laneCount ?? 3 },
  );
  const preparedByNode = new Map(prepared.map((item) => [item.file.entry.nodeId, item]));
  let completedBatches = 0;
  let completedFiles = 0;
  let applyQueue = Promise.resolve();

  const checkpoint = async () => {
    await input.control?.checkpoint(executionSignal);
    await input.durableControl.checkpoint(executionSignal);
    if (executionSignal.aborted) throw new DOMException('The request was aborted.', 'AbortError');
  };
  const serializeApply = async <T>(operation: () => Promise<T>): Promise<T> => {
    const previous = applyQueue;
    let release!: () => void;
    applyQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  };

  const runBatch = async (
    batch: (typeof batches)[number],
    retainedPaidBatch?: SiyuanSummaryBatchRecord,
  ) => {
    await checkpoint();
    const ownerId = globalThis.crypto.randomUUID();
    const revisions =
      retainedPaidBatch?.files ??
      batch.files.map((file) => preparedByNode.get(file.entry.nodeId)!.revision);
    let record: SiyuanSummaryBatchRecord | null = null;
    let effectiveBatch = batch;
    try {
      let batchId = retainedPaidBatch?.batchId;
      if (!batchId) {
        const revisionDigest = await sha256Text(
          [
            input.policyFingerprint,
            input.identity.providerId,
            input.identity.connectionId,
            input.identity.modelId,
            input.identity.effort === 'ultra' ? 'xhigh' : input.identity.effort,
            ...revisions.map((revision) => siyuanSummaryNodeRevisionKey(revision)),
          ].join('\n'),
        );
        const baseBatchId = `${batch.id}-${revisionDigest.slice('sha256:'.length, 'sha256:'.length + 16)}`;
        const priorAttempts = (await listSiyuanSummaryBatches(scope)).filter(
          (candidate) =>
            candidate.batchId === baseBatchId ||
            candidate.batchId.startsWith(`${baseBatchId}-retry-`),
        );
        const resumable = priorAttempts.find((candidate) =>
          ['claimed', 'staged', 'applying', 'completed'].includes(candidate.state),
        );
        batchId =
          resumable?.batchId ??
          (priorAttempts.length === 0
            ? baseBatchId
            : `${baseBatchId}-retry-${priorAttempts.length}`);
      }
      const batchAttempt = Number(/-retry-(\d+)$/u.exec(batchId)?.[1] ?? 0);
      effectiveBatch = Object.freeze({ ...batch, id: batchId });
      const claim = await claimSiyuanSummaryBatch({
        jobScope: scope,
        batchId,
        policyFingerprint: input.policyFingerprint,
        identity: input.identity,
        files: revisions,
        ownerId,
        leaseMs: LEASE_MS,
      });
      if (claim.kind === 'conflict') throw new Error('siyuan_summary_batch_claim_conflict');
      record = claim.batch;
      if (record.state === 'completed') {
        completedBatches += 1;
        completedFiles += record.files.length;
        return;
      }
      if (record.state === 'failed') {
        throw new Error('siyuan_summary_batch_terminal_claim');
      }
      if (!record.receipt) {
        await checkpoint();
        let heartbeatError: unknown = null;
        let heartbeatWork = Promise.resolve();
        const heartbeat = globalThis.setInterval(
          () => {
            heartbeatWork = heartbeatWork.then(async () => {
              try {
                await renewSiyuanSummaryBatchLease({ jobScope: scope, batchId, ownerId });
              } catch (error) {
                heartbeatError = error;
              }
            });
          },
          Math.floor(LEASE_MS / 4),
        );
        let generation: SiyuanSummaryBatchGeneration;
        try {
          generation = await input.generate(effectiveBatch, executionSignal, async (at) => {
            record = await markSiyuanSummaryBatchDispatched({
              jobScope: scope,
              batchId,
              ownerId,
              now: at,
            });
          });
        } finally {
          globalThis.clearInterval(heartbeat);
          await heartbeatWork;
        }
        if (heartbeatError) throw heartbeatError;
        const generatedEffort =
          generation.identity.effort === 'ultra' ? 'xhigh' : generation.identity.effort;
        const requestedEffort = input.identity.effort === 'ultra' ? 'xhigh' : input.identity.effort;
        if (
          generation.identity.providerId !== input.identity.providerId ||
          generation.identity.connectionId !== input.identity.connectionId ||
          generation.identity.modelId !== input.identity.modelId ||
          generatedEffort !== requestedEffort
        ) {
          throw new Error('siyuan_summary_model_identity_mismatch');
        }
        const byNode = new Map(
          generation.summaries.map((summary) => [summary.nodeId, summary.summary]),
        );
        const summaries = Object.fromEntries(
          revisions.map((revision) => {
            const summary = byNode.get(revision.nodeId);
            if (!summary) throw new Error('siyuan_summary_batch_missing_node');
            const safeSummary = applySecretPolicy(summary, 'exclude');
            if (safeSummary.decision !== 'allowed' || !safeSummary.text?.trim()) {
              throw new Error('siyuan_summary_output_rejected');
            }
            return [siyuanSummaryNodeRevisionKey(revision), safeSummary.text.trim()];
          }),
        );
        // Stage the paid result before consulting pause state. If pause raced
        // the provider response, restart recovery can apply it without paying twice.
        record = await stageSiyuanSummaryBatchReceipt({
          jobScope: scope,
          batchId,
          ownerId,
          receipt: {
            identity: input.identity,
            requestId: generation.requestId,
            sessionId: generation.sessionId,
            summaries,
            usage: {
              inputTokens: generation.inputTokens,
              outputTokens: generation.outputTokens,
              totalTokens: generation.totalTokens,
              cacheReadTokens: generation.cacheReadTokens,
              cacheWriteTokens: generation.cacheWriteTokens,
              costUsd: generation.costUsd,
              tokenProvenance: generation.tokenProvenance,
              cacheProvenance: generation.cacheProvenance,
              costProvenance: generation.costProvenance,
            },
            dispatchedAt: generation.dispatchedAt,
            durationMs: generation.durationMs,
            finishReason: generation.finishReason,
            receivedAt: generation.completedAt,
          },
        });
      }
      await checkpoint();
      const receipt = record.receipt;
      if (!receipt) throw new Error('siyuan_summary_batch_receipt_missing');
      for (const revision of revisions) {
        const key = siyuanSummaryNodeRevisionKey(revision);
        if (record.appliedNodeRevisionKeys.includes(key)) continue;
        await checkpoint();
        const original = preparedByRevision.get(key)?.file.entry;
        if (!original) throw new Error('siyuan_summary_batch_paid_revision_missing');
        const summary = receipt.summaries[key];
        if (!summary) throw new Error('siyuan_summary_batch_missing_node');
        await serializeApply(async () => {
          await checkpoint();
          await input.apply({
            entry: { ...original, summary, summaryState: 'completed' },
            batchId,
            batchNodeCount: revisions.length,
            batchLane: batch.lane,
            batchAttempt,
            usage: {
              identity: {
                providerId: receipt.identity.providerId,
                connectionId: receipt.identity.connectionId,
                modelId: receipt.identity.modelId,
                effort: receipt.identity.effort === 'xhigh' ? 'ultra' : receipt.identity.effort,
              },
              requestId: receipt.requestId,
              sessionId: receipt.sessionId,
              summaries: [],
              inputTokens: receipt.usage.inputTokens,
              outputTokens: receipt.usage.outputTokens,
              totalTokens: receipt.usage.totalTokens,
              costUsd: receipt.usage.costUsd,
              tokenProvenance: receipt.usage.tokenProvenance,
              cacheReadTokens: receipt.usage.cacheReadTokens,
              cacheWriteTokens: receipt.usage.cacheWriteTokens,
              cacheProvenance: receipt.usage.cacheProvenance,
              costProvenance: receipt.usage.costProvenance,
              finishReason: receipt.finishReason ?? null,
              dispatchedAt: receipt.dispatchedAt ?? record!.createdAt,
              completedAt: receipt.receivedAt,
              durationMs: receipt.durationMs ?? Math.max(0, receipt.receivedAt - record!.createdAt),
            },
          });
          record = await markSiyuanSummaryBatchNodeApplied({
            jobScope: scope,
            batchId,
            ownerId,
            nodeRevisionKey: key,
          });
        });
      }
      await checkpoint();
      record = await completeSiyuanSummaryBatch({
        jobScope: scope,
        batchId,
        ownerId,
      });
      completedBatches += 1;
      completedFiles += record.files.length;
    } catch (error) {
      if (record && record.ownerId === ownerId && !['completed', 'failed'].includes(record.state)) {
        await releaseSiyuanSummaryBatch({
          jobScope: scope,
          batchId: effectiveBatch.id,
          ownerId,
          reason: releaseReason(error, input.signal, executorAbort.signal),
        }).catch(() => undefined);
      }
      throw error;
    }
  };

  for (const recovery of recoveryBatches) {
    await runBatch(recovery.batch as (typeof batches)[number], recovery.record);
  }

  const laneCount = input.laneCount ?? 3;
  const lanes = Array.from({ length: laneCount }, (_, lane) =>
    batches.filter((batch) => batch.lane === lane),
  );
  const lanePromises = lanes.map(async (lane) => {
    for (const batch of lane) await runBatch(batch);
  });
  try {
    await Promise.all(lanePromises);
  } catch (error) {
    executorAbort.abort();
    await Promise.allSettled(lanePromises);
    throw error;
  }
  await applyQueue;
  return { completedBatches, completedFiles };
}
