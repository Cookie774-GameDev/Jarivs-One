import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  claimSiyuanSummaryBatch,
  completeSiyuanSummaryBatch,
  listSiyuanSummaryBatches,
  markSiyuanSummaryBatchNodeApplied,
  readSiyuanSummaryBatch,
  recoverExpiredSiyuanSummaryBatchClaims,
  releaseSiyuanSummaryBatch,
  resetSiyuanSummaryBatchStoreForTests,
  siyuanSummaryNodeRevisionKey,
  stageSiyuanSummaryBatchReceipt,
  type SiyuanSummaryBatchClaimInput,
  type SiyuanSummaryBatchReceipt,
} from './siyuanSummaryBatchStore';

const identity = Object.freeze({
  providerId: 'opencode',
  connectionId: 'opencode-cli',
  modelId: 'opencode-go/deepseek-v4-flash-vision-exp',
  effort: 'high' as const,
});

function file(nodeId: string, revision = 1) {
  const digestWord = (nodeId.length * 65_537 + revision).toString(16).padStart(8, '0').slice(-8);
  return {
    nodeId,
    sourceModifiedAt: revision,
    sourceSizeBytes: revision * 100,
    contentBytes: revision * 100,
    contentFingerprint: `sha256:${digestWord.repeat(8)}`,
  } as const;
}

function claim(
  batchId: string,
  ownerId: string,
  files = [file('node-a')],
  overrides: Partial<SiyuanSummaryBatchClaimInput> = {},
): SiyuanSummaryBatchClaimInput {
  return {
    jobScope: 'project-1\u0000map-1',
    batchId,
    policyFingerprint: 'policy-v2',
    identity,
    files,
    ownerId,
    now: 1_000,
    leaseMs: 5_000,
    ...overrides,
  };
}

function receipt(
  files = [file('node-a')],
  summaries: Record<string, string> = Object.fromEntries(
    files.map((entry) => [siyuanSummaryNodeRevisionKey(entry), `Summary for ${entry.nodeId}`]),
  ),
): SiyuanSummaryBatchReceipt {
  return {
    identity,
    requestId: 'request-1',
    sessionId: 'session-1',
    summaries,
    usage: {
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
      cacheReadTokens: 30,
      cacheWriteTokens: 4,
      costUsd: 0.001,
      tokenProvenance: 'reported',
      cacheProvenance: 'reported',
      costProvenance: 'reported',
    },
    receivedAt: 1_500,
  };
}

describe('durable SiYuan summary batch store', () => {
  beforeEach(resetSiyuanSummaryBatchStoreForTests);

  it('atomically grants a node revision to only one concurrent batch', async () => {
    const [left, right] = await Promise.all([
      claimSiyuanSummaryBatch(claim('batch-left', 'lane-1')),
      claimSiyuanSummaryBatch(claim('batch-right', 'lane-2')),
    ]);

    expect([left.kind, right.kind].sort()).toEqual(['claimed', 'conflict']);
    const winner =
      left.kind === 'claimed' ? left.batch : right.kind === 'claimed' ? right.batch : null;
    expect(winner?.files).toEqual([file('node-a')]);
  });

  it('pins policy and exact provider, connection, model, and effort for an idempotent claim', async () => {
    await expect(claimSiyuanSummaryBatch(claim('batch-1', 'lane-1'))).resolves.toMatchObject({
      kind: 'claimed',
    });
    await expect(
      claimSiyuanSummaryBatch(claim('batch-1', 'lane-1', [file('node-a')], { now: 2_000 })),
    ).resolves.toMatchObject({ kind: 'existing' });
    await expect(
      claimSiyuanSummaryBatch(
        claim('batch-1', 'lane-1', [file('node-a')], {
          identity: { ...identity, effort: 'ultra' },
        }),
      ),
    ).rejects.toThrow('siyuan_summary_batch_authority_mismatch');
    await expect(
      claimSiyuanSummaryBatch(
        claim('batch-1', 'lane-1', [file('node-a')], { policyFingerprint: 'other-policy' }),
      ),
    ).rejects.toThrow('siyuan_summary_batch_authority_mismatch');
  });

  it('rejects a receipt whose claimed duration does not match its persisted timestamps', async () => {
    await expect(claimSiyuanSummaryBatch(claim('batch-duration', 'lane-1'))).resolves.toMatchObject(
      {
        kind: 'claimed',
      },
    );

    await expect(
      stageSiyuanSummaryBatchReceipt({
        jobScope: 'project-1\u0000map-1',
        batchId: 'batch-duration',
        ownerId: 'lane-1',
        receipt: {
          ...receipt(),
          dispatchedAt: 1_100,
          receivedAt: 1_500,
          durationMs: 399,
        },
        now: 1_500,
      }),
    ).rejects.toThrow('siyuan_summary_batch_duration_mismatch');
  });

  it.each([
    ['requestId', '', 'siyuan_summary_batch_request_id_invalid'],
    ['requestId', '   ', 'siyuan_summary_batch_request_id_invalid'],
    ['sessionId', '', 'siyuan_summary_batch_session_id_invalid'],
    ['sessionId', '   ', 'siyuan_summary_batch_session_id_invalid'],
  ] as const)('rejects an empty %s before staging a paid receipt', async (field, value, error) => {
    const batchId = `invalid-${field}-${value.length === 0 ? 'empty' : 'whitespace'}`;
    await claimSiyuanSummaryBatch(claim(batchId, 'lane-1'));

    await expect(
      stageSiyuanSummaryBatchReceipt({
        jobScope: 'project-1\u0000map-1',
        batchId,
        ownerId: 'lane-1',
        receipt: { ...receipt(), [field]: value },
        now: 1_500,
      }),
    ).rejects.toThrow(error);
    await expect(readSiyuanSummaryBatch('project-1\u0000map-1', batchId)).resolves.toMatchObject({
      state: 'claimed',
      receipt: null,
    });
  });

  it('preserves exact request and session IDs across the IndexedDB close/reopen read boundary', async () => {
    await claimSiyuanSummaryBatch(claim('durable-completion-identity', 'lane-1'));
    await stageSiyuanSummaryBatchReceipt({
      jobScope: 'project-1\u0000map-1',
      batchId: 'durable-completion-identity',
      ownerId: 'lane-1',
      receipt: {
        ...receipt(),
        requestId: 'req_deepseek_completion_01',
        sessionId: 'ses_opencode_summary_01',
      },
      now: 1_500,
    });

    // Staging closes its database handle; this read opens a fresh handle to the durable record.
    await expect(
      readSiyuanSummaryBatch('project-1\u0000map-1', 'durable-completion-identity'),
    ).resolves.toMatchObject({
      receipt: {
        requestId: 'req_deepseek_completion_01',
        sessionId: 'ses_opencode_summary_01',
      },
    });
  });

  it('keeps DeepSeek high and separately authorized Luna xhigh receipt identities isolated', async () => {
    const lunaIdentity = {
      providerId: 'opencode',
      connectionId: 'opencode-cli',
      modelId: 'openai/gpt-5.6-luna',
      effort: 'xhigh' as const,
    };
    await claimSiyuanSummaryBatch(claim('deepseek', 'lane-1', [file('node-deepseek')]));
    await claimSiyuanSummaryBatch(
      claim('luna', 'lane-2', [file('node-luna')], { identity: lunaIdentity }),
    );
    await stageSiyuanSummaryBatchReceipt({
      jobScope: 'project-1\u0000map-1',
      batchId: 'luna',
      ownerId: 'lane-2',
      receipt: { ...receipt([file('node-luna')]), identity: lunaIdentity },
      now: 1_500,
    });

    await expect(listSiyuanSummaryBatches('project-1\u0000map-1')).resolves.toEqual([
      expect.objectContaining({ batchId: 'deepseek', identity }),
      expect.objectContaining({ batchId: 'luna', identity: lunaIdentity }),
    ]);
  });

  it('stages one immutable keyed receipt and never duplicates aggregate usage', async () => {
    await claimSiyuanSummaryBatch(claim('batch-1', 'lane-1'));
    const first = await stageSiyuanSummaryBatchReceipt({
      jobScope: 'project-1\u0000map-1',
      batchId: 'batch-1',
      ownerId: 'lane-1',
      receipt: receipt(),
      now: 1_500,
    });
    const repeated = await stageSiyuanSummaryBatchReceipt({
      jobScope: 'project-1\u0000map-1',
      batchId: 'batch-1',
      ownerId: 'lane-1',
      receipt: receipt(),
      now: 1_600,
    });

    expect(first.receipt).toEqual(repeated.receipt);
    expect(repeated.receipt?.usage).toMatchObject({ totalTokens: 120, cacheReadTokens: 30 });
    await expect(
      stageSiyuanSummaryBatchReceipt({
        jobScope: 'project-1\u0000map-1',
        batchId: 'batch-1',
        ownerId: 'lane-1',
        receipt: receipt([file('node-a')], {
          [siyuanSummaryNodeRevisionKey(file('node-a'))]: 'A different summary',
        }),
        now: 1_700,
      }),
    ).rejects.toThrow('siyuan_summary_batch_receipt_already_staged');
    await expect(
      stageSiyuanSummaryBatchReceipt({
        jobScope: 'project-1\u0000map-1',
        batchId: 'batch-1',
        ownerId: 'lane-1',
        receipt: receipt([file('node-a')], {}),
        now: 1_800,
      }),
    ).rejects.toThrow('siyuan_summary_batch_receipt_membership_invalid');
  });

  it('marks per-node application idempotently and completes only after every summary is applied', async () => {
    const files = [file('node-a'), file('node-b')];
    await claimSiyuanSummaryBatch(claim('batch-1', 'lane-1', files));
    await stageSiyuanSummaryBatchReceipt({
      jobScope: 'project-1\u0000map-1',
      batchId: 'batch-1',
      ownerId: 'lane-1',
      receipt: receipt(files),
      now: 1_500,
    });
    const firstKey = siyuanSummaryNodeRevisionKey(files[0]!);
    const secondKey = siyuanSummaryNodeRevisionKey(files[1]!);
    await markSiyuanSummaryBatchNodeApplied({
      jobScope: 'project-1\u0000map-1',
      batchId: 'batch-1',
      ownerId: 'lane-1',
      nodeRevisionKey: firstKey,
      now: 1_600,
    });
    await markSiyuanSummaryBatchNodeApplied({
      jobScope: 'project-1\u0000map-1',
      batchId: 'batch-1',
      ownerId: 'lane-1',
      nodeRevisionKey: firstKey,
      now: 1_700,
    });
    await expect(
      completeSiyuanSummaryBatch({
        jobScope: 'project-1\u0000map-1',
        batchId: 'batch-1',
        ownerId: 'lane-1',
        now: 1_800,
      }),
    ).rejects.toThrow('siyuan_summary_batch_application_incomplete');

    await markSiyuanSummaryBatchNodeApplied({
      jobScope: 'project-1\u0000map-1',
      batchId: 'batch-1',
      ownerId: 'lane-1',
      nodeRevisionKey: secondKey,
      now: 1_900,
    });
    const completed = await completeSiyuanSummaryBatch({
      jobScope: 'project-1\u0000map-1',
      batchId: 'batch-1',
      ownerId: 'lane-1',
      now: 2_000,
    });

    expect(completed).toMatchObject({
      state: 'completed',
      appliedNodeRevisionKeys: [firstKey, secondKey],
      receipt: { usage: { totalTokens: 120 } },
    });
  });

  it('recovers expired claims while preserving staged work for receipt-only resume', async () => {
    await claimSiyuanSummaryBatch(
      claim('expired-unstarted', 'lane-1', [file('node-a')], { leaseMs: 100 }),
    );
    await claimSiyuanSummaryBatch(
      claim('expired-staged', 'lane-2', [file('node-b')], { leaseMs: 100 }),
    );
    await stageSiyuanSummaryBatchReceipt({
      jobScope: 'project-1\u0000map-1',
      batchId: 'expired-staged',
      ownerId: 'lane-2',
      receipt: receipt([file('node-b')]),
      now: 1_050,
    });

    await expect(
      recoverExpiredSiyuanSummaryBatchClaims('project-1\u0000map-1', 1_200),
    ).resolves.toEqual({ released: 1, resumable: 1 });
    expect(await readSiyuanSummaryBatch('project-1\u0000map-1', 'expired-unstarted')).toMatchObject(
      {
        state: 'failed',
        failureReason: 'lease_expired',
      },
    );
    expect(await readSiyuanSummaryBatch('project-1\u0000map-1', 'expired-staged')).toMatchObject({
      state: 'staged',
      ownerId: null,
      receipt: { usage: { totalTokens: 120 } },
    });
    await expect(
      claimSiyuanSummaryBatch(claim('replacement', 'lane-3', [file('node-a')], { now: 1_300 })),
    ).resolves.toMatchObject({ kind: 'claimed' });
    await expect(
      claimSiyuanSummaryBatch(claim('expired-staged', 'lane-3', [file('node-b')], { now: 1_300 })),
    ).resolves.toMatchObject({ kind: 'existing', batch: { state: 'staged', ownerId: 'lane-3' } });
  });

  it('recovers a staged partially-applied crash without losing receipt or apply markers', async () => {
    const files = [file('node-a'), file('node-b')];
    await claimSiyuanSummaryBatch(
      claim('crash-staged', 'lane-1', files, { now: 1_000, leaseMs: 100 }),
    );
    await stageSiyuanSummaryBatchReceipt({
      jobScope: 'project-1\u0000map-1',
      batchId: 'crash-staged',
      ownerId: 'lane-1',
      receipt: receipt(files),
      now: 1_050,
    });
    const firstKey = siyuanSummaryNodeRevisionKey(files[0]!);
    await markSiyuanSummaryBatchNodeApplied({
      jobScope: 'project-1\u0000map-1',
      batchId: 'crash-staged',
      ownerId: 'lane-1',
      nodeRevisionKey: firstKey,
      now: 1_075,
    });

    await expect(
      recoverExpiredSiyuanSummaryBatchClaims('project-1\u0000map-1', 1_200),
    ).resolves.toEqual({ released: 0, resumable: 1 });
    await expect(listSiyuanSummaryBatches('project-1\u0000map-1')).resolves.toEqual([
      expect.objectContaining({
        batchId: 'crash-staged',
        state: 'staged',
        ownerId: null,
        appliedNodeRevisionKeys: [firstKey],
        receipt: expect.objectContaining({
          usage: expect.objectContaining({ totalTokens: 120 }),
        }),
      }),
    ]);
  });

  it('releases unstarted work but retains paid staged receipts across pause and cancel', async () => {
    await claimSiyuanSummaryBatch(claim('pause-unstarted', 'lane-1', [file('node-a')]));
    await releaseSiyuanSummaryBatch({
      jobScope: 'project-1\u0000map-1',
      batchId: 'pause-unstarted',
      ownerId: 'lane-1',
      reason: 'pause',
      now: 1_200,
    });
    await expect(
      claimSiyuanSummaryBatch(claim('after-pause', 'lane-2', [file('node-a')], { now: 1_300 })),
    ).resolves.toMatchObject({ kind: 'claimed' });

    await claimSiyuanSummaryBatch(claim('pause-staged', 'lane-1', [file('node-b')]));
    await stageSiyuanSummaryBatchReceipt({
      jobScope: 'project-1\u0000map-1',
      batchId: 'pause-staged',
      ownerId: 'lane-1',
      receipt: receipt([file('node-b')]),
      now: 1_500,
    });
    await releaseSiyuanSummaryBatch({
      jobScope: 'project-1\u0000map-1',
      batchId: 'pause-staged',
      ownerId: 'lane-1',
      reason: 'pause',
      now: 1_600,
    });
    expect(await readSiyuanSummaryBatch('project-1\u0000map-1', 'pause-staged')).toMatchObject({
      state: 'staged',
      ownerId: null,
    });
    await expect(
      claimSiyuanSummaryBatch(claim('competing', 'lane-3', [file('node-b')], { now: 1_700 })),
    ).resolves.toMatchObject({ kind: 'conflict' });

    await claimSiyuanSummaryBatch(claim('cancel-staged', 'lane-1', [file('node-c')]));
    await stageSiyuanSummaryBatchReceipt({
      jobScope: 'project-1\u0000map-1',
      batchId: 'cancel-staged',
      ownerId: 'lane-1',
      receipt: receipt([file('node-c')]),
      now: 1_500,
    });
    await releaseSiyuanSummaryBatch({
      jobScope: 'project-1\u0000map-1',
      batchId: 'cancel-staged',
      ownerId: 'lane-1',
      reason: 'cancel',
      now: 1_600,
    });
    expect(await readSiyuanSummaryBatch('project-1\u0000map-1', 'cancel-staged')).toMatchObject({
      state: 'staged',
      ownerId: null,
      receipt: { usage: { totalTokens: 120 } },
    });
    await expect(
      claimSiyuanSummaryBatch(claim('after-cancel', 'lane-4', [file('node-c')], { now: 1_700 })),
    ).resolves.toMatchObject({ kind: 'conflict' });
    await expect(
      claimSiyuanSummaryBatch(claim('cancel-staged', 'lane-4', [file('node-c')], { now: 1_700 })),
    ).resolves.toMatchObject({ kind: 'existing', batch: { state: 'staged', ownerId: 'lane-4' } });
  });

  it('rejects duplicate revisions and batches above hard file and byte boundaries', async () => {
    await expect(
      claimSiyuanSummaryBatch(claim('duplicates', 'lane-1', [file('node-a'), file('node-a')])),
    ).rejects.toThrow('siyuan_summary_batch_files_invalid');
    await expect(
      claimSiyuanSummaryBatch(
        claim(
          'too-many',
          'lane-1',
          Array.from({ length: 9 }, (_, index) => file(`node-${index}`)),
        ),
      ),
    ).rejects.toThrow('siyuan_summary_batch_files_invalid');
    await expect(
      claimSiyuanSummaryBatch(
        claim('too-large', 'lane-1', [{ ...file('node-large'), contentBytes: 96 * 1024 + 1 }]),
      ),
    ).rejects.toThrow('siyuan_summary_batch_files_invalid');
  });

  it('rejects provenance drift, unsafe arithmetic, owner mismatch, and cross-scope access', async () => {
    await claimSiyuanSummaryBatch(claim('batch-1', 'lane-1'));
    const invalidProvenance = receipt();
    await expect(
      stageSiyuanSummaryBatchReceipt({
        jobScope: 'project-1\u0000map-1',
        batchId: 'batch-1',
        ownerId: 'lane-1',
        receipt: {
          ...invalidProvenance,
          usage: { ...invalidProvenance.usage, tokenProvenance: 'invented' as 'reported' },
        },
        now: 1_500,
      }),
    ).rejects.toThrow('siyuan_summary_batch_usage_provenance_invalid');
    await expect(
      claimSiyuanSummaryBatch(
        claim('overflow', 'lane-1', [file('node-overflow')], {
          now: Number.MAX_SAFE_INTEGER,
          leaseMs: 2,
        }),
      ),
    ).rejects.toThrow('siyuan_summary_batch_lease_expiry_invalid');
    await expect(
      releaseSiyuanSummaryBatch({
        jobScope: 'project-1\u0000map-1',
        batchId: 'batch-1',
        ownerId: 'lane-other',
        reason: 'pause',
        now: 1_600,
      }),
    ).rejects.toThrow('siyuan_summary_batch_lease_not_owned');
    await expect(readSiyuanSummaryBatch('project-2\u0000map-2', 'batch-1')).resolves.toBeNull();
    await expect(
      stageSiyuanSummaryBatchReceipt({
        jobScope: 'project-1\u0000map-1',
        batchId: 'batch-1',
        ownerId: 'lane-1',
        receipt: receipt(),
        now: 999,
      }),
    ).rejects.toThrow('siyuan_summary_batch_clock_regression');
    await expect(
      claimSiyuanSummaryBatch(
        claim('bad-digest', 'lane-1', [
          { ...file('node-digest'), contentFingerprint: 'sha256:not-a-digest' },
        ]),
      ),
    ).rejects.toThrow('siyuan_summary_batch_content_fingerprint_invalid');
  });

  it('rejects backward timestamps for stage, apply, complete, and release mutations', async () => {
    await claimSiyuanSummaryBatch(claim('monotonic', 'lane-1'));
    await expect(
      stageSiyuanSummaryBatchReceipt({
        jobScope: 'project-1\u0000map-1',
        batchId: 'monotonic',
        ownerId: 'lane-1',
        receipt: receipt(),
        now: 999,
      }),
    ).rejects.toThrow('siyuan_summary_batch_clock_regression');
    await stageSiyuanSummaryBatchReceipt({
      jobScope: 'project-1\u0000map-1',
      batchId: 'monotonic',
      ownerId: 'lane-1',
      receipt: receipt(),
      now: 1_500,
    });
    const key = siyuanSummaryNodeRevisionKey(file('node-a'));
    await expect(
      markSiyuanSummaryBatchNodeApplied({
        jobScope: 'project-1\u0000map-1',
        batchId: 'monotonic',
        ownerId: 'lane-1',
        nodeRevisionKey: key,
        now: 1_499,
      }),
    ).rejects.toThrow('siyuan_summary_batch_clock_regression');
    await markSiyuanSummaryBatchNodeApplied({
      jobScope: 'project-1\u0000map-1',
      batchId: 'monotonic',
      ownerId: 'lane-1',
      nodeRevisionKey: key,
      now: 1_600,
    });
    await expect(
      completeSiyuanSummaryBatch({
        jobScope: 'project-1\u0000map-1',
        batchId: 'monotonic',
        ownerId: 'lane-1',
        now: 1_599,
      }),
    ).rejects.toThrow('siyuan_summary_batch_clock_regression');
    await expect(
      releaseSiyuanSummaryBatch({
        jobScope: 'project-1\u0000map-1',
        batchId: 'monotonic',
        ownerId: 'lane-1',
        reason: 'pause',
        now: 1_599,
      }),
    ).rejects.toThrow('siyuan_summary_batch_clock_regression');
  });
});
