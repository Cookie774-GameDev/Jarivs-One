import { describe, expect, it, vi } from 'vitest';

import {
  CaoScheduledLearningError,
  createCaoScheduledLearningController,
  parseCaoScheduledLearningSnapshot,
  type CaoLearningExecutionInput,
  type CaoScheduledLearningPersistence,
  type CaoScheduledLearningSnapshot,
} from './caoScheduledLearning';

const scope = {
  accountId: 'acct_1',
  workspaceId: 'workspace_1',
  projectId: 'project_1',
  scheduleId: 'schedule_1',
  targetId: 'chat_1',
  scheduleAnchorAt: 1_000,
} as const;

function memoryPersistence(initial: unknown = null) {
  let stored = initial;
  const writes: Array<{ expectedRevision: number; snapshot: CaoScheduledLearningSnapshot }> = [];
  const persistence: CaoScheduledLearningPersistence = {
    load: vi.fn(async () => stored),
    save: vi.fn(async (input) => {
      const current = parseCaoScheduledLearningSnapshot(stored);
      expect(current?.revision ?? 0).toBe(input.expectedRevision);
      expect(parseCaoScheduledLearningSnapshot(input.snapshot)).not.toBeNull();
      stored = structuredClone(input.snapshot);
      writes.push(structuredClone(input));
    }),
  };
  return { persistence, writes, read: () => stored };
}

describe('CAO scheduled learning cursor contract', () => {
  it('persists a pending pass before consuming only the new journal delta', async () => {
    const durable = memoryPersistence();
    const execute = vi.fn(async () => ({ status: 'completed' as const, receiptId: 'receipt_1' }));
    const controller = createCaoScheduledLearningController({
      persistence: durable.persistence,
      execute,
      newPassId: () => 'pass_1',
      now: () => 2_000,
    });

    const first = await controller.run({
      ...scope,
      trigger: 'scheduled',
      requestId: 'occurrence_1000',
      scheduledDueAt: 1_000,
      journalHighWaterSeq: 12,
    });

    expect(execute).toHaveBeenCalledWith({
      accountId: 'acct_1',
      workspaceId: 'workspace_1',
      projectId: 'project_1',
      scheduleId: 'schedule_1',
      targetId: 'chat_1',
      passId: 'pass_1',
      requestId: 'occurrence_1000',
      trigger: 'scheduled',
      fromSeqExclusive: 0,
      throughSeqInclusive: 12,
      requestedAt: 2_000,
      scheduledDueAt: 1_000,
    });
    expect(durable.writes[0]?.snapshot.pending?.passId).toBe('pass_1');
    expect(first).toMatchObject({
      status: 'completed',
      passId: 'pass_1',
      consumed: { fromSeqExclusive: 0, throughSeqInclusive: 12 },
      scheduledOccurrenceCount: 1,
      deduplicated: false,
    });
    const firstSnapshot = parseCaoScheduledLearningSnapshot(durable.read());
    expect(firstSnapshot).toMatchObject({
      revision: 2,
      scheduleAnchorAt: 1_000,
      lastLearningSeqConsumed: 12,
      scheduledOccurrenceCount: 1,
      lastScheduledDueAt: 1_000,
    });
    expect(firstSnapshot?.pending).toBeUndefined();

    await controller.run({
      ...scope,
      trigger: 'learning_threshold',
      requestId: 'threshold_19',
      journalHighWaterSeq: 19,
    });
    expect(execute).toHaveBeenLastCalledWith(
      expect.objectContaining({ fromSeqExclusive: 12, throughSeqInclusive: 19 }),
    );
  });

  it('lets manual force consume a delta without moving the schedule anchor or occurrence count', async () => {
    const durable = memoryPersistence();
    const execute = vi.fn(async (_input: CaoLearningExecutionInput) => ({
      status: 'completed' as const,
      receiptId: 'receipt_ok',
    }));
    const controller = createCaoScheduledLearningController({
      persistence: durable.persistence,
      execute,
      newPassId: () => `pass_${execute.mock.calls.length + 1}`,
      now: () => 2_000,
    });
    await controller.run({
      ...scope,
      trigger: 'scheduled',
      requestId: 'scheduled_1',
      scheduledDueAt: 1_000,
      journalHighWaterSeq: 4,
    });

    const forced = await controller.run({
      ...scope,
      trigger: 'manual_force',
      requestId: 'manual_1',
      journalHighWaterSeq: 9,
    });

    expect(forced).toMatchObject({ status: 'completed', scheduledOccurrenceCount: 1 });
    expect(parseCaoScheduledLearningSnapshot(durable.read())).toMatchObject({
      scheduleAnchorAt: 1_000,
      lastLearningSeqConsumed: 9,
      scheduledOccurrenceCount: 1,
      lastScheduledDueAt: 1_000,
    });
    expect(execute).toHaveBeenLastCalledWith(expect.objectContaining({ trigger: 'manual_force' }));
    expect(execute.mock.calls.at(-1)?.[0]).not.toHaveProperty('scheduledDueAt');
  });

  it.each(['failed', 'cancelled'] as const)(
    'does not advance the cursor or scheduled count when execution is %s',
    async (status) => {
      const durable = memoryPersistence();
      const controller = createCaoScheduledLearningController({
        persistence: durable.persistence,
        execute: async () => ({ status }),
        newPassId: () => 'pass_failed',
        now: () => 2_000,
      });

      const result = await controller.run({
        ...scope,
        trigger: 'scheduled',
        requestId: 'scheduled_failed',
        scheduledDueAt: 1_000,
        journalHighWaterSeq: 7,
      });

      expect(result.status).toBe(status);
      const snapshot = parseCaoScheduledLearningSnapshot(durable.read());
      expect(snapshot).toMatchObject({
        lastLearningSeqConsumed: 0,
        scheduledOccurrenceCount: 0,
      });
      expect(snapshot?.pending).toBeUndefined();
    },
  );

  it('does not execute when the pending-state write fails', async () => {
    const execute = vi.fn();
    const persistence: CaoScheduledLearningPersistence = {
      load: async () => null,
      save: async () => {
        throw new Error('disk unavailable');
      },
    };
    const controller = createCaoScheduledLearningController({
      persistence,
      execute,
      newPassId: () => 'pass_1',
      now: () => 2_000,
    });

    await expect(
      controller.run({
        ...scope,
        trigger: 'manual_force',
        requestId: 'manual_1',
        journalHighWaterSeq: 5,
      }),
    ).rejects.toThrow('cao_learning_persistence_failed');
    expect(execute).not.toHaveBeenCalled();
  });

  it('recovers an interrupted pass with the same pass id and advances exactly once', async () => {
    let stored: unknown = null;
    let failCompletionWrite = true;
    const persistence: CaoScheduledLearningPersistence = {
      load: async () => stored,
      save: async ({ expectedRevision, snapshot }) => {
        const current = parseCaoScheduledLearningSnapshot(stored);
        expect(current?.revision ?? 0).toBe(expectedRevision);
        if (snapshot.pending === undefined && failCompletionWrite) {
          failCompletionWrite = false;
          throw new Error('crash before commit');
        }
        stored = structuredClone(snapshot);
      },
    };
    const execute = vi.fn(async (_input: CaoLearningExecutionInput) => ({
      status: 'completed' as const,
      receiptId: 'receipt_1',
    }));
    const first = createCaoScheduledLearningController({
      persistence,
      execute,
      newPassId: () => 'pass_stable',
      now: () => 2_000,
    });
    await expect(
      first.run({
        ...scope,
        trigger: 'scheduled',
        requestId: 'scheduled_1',
        scheduledDueAt: 1_000,
        journalHighWaterSeq: 8,
      }),
    ).rejects.toThrow('cao_learning_persistence_failed');
    expect(parseCaoScheduledLearningSnapshot(stored)?.pending?.passId).toBe('pass_stable');

    const afterRestart = createCaoScheduledLearningController({
      persistence,
      execute,
      newPassId: () => 'must_not_be_used',
      now: () => 9_000,
    });
    const recovered = await afterRestart.recover(scope);

    expect(recovered).toMatchObject({ status: 'completed', passId: 'pass_stable' });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0]?.[0]).toEqual(execute.mock.calls[1]?.[0]);
    const recoveredSnapshot = parseCaoScheduledLearningSnapshot(stored);
    expect(recoveredSnapshot).toMatchObject({
      lastLearningSeqConsumed: 8,
      scheduledOccurrenceCount: 1,
    });
    expect(recoveredSnapshot?.pending).toBeUndefined();
  });

  it('deduplicates a completed request without executing or counting it again', async () => {
    const durable = memoryPersistence();
    const execute = vi.fn(async () => ({ status: 'completed' as const, receiptId: 'receipt_1' }));
    const controller = createCaoScheduledLearningController({
      persistence: durable.persistence,
      execute,
      newPassId: () => 'pass_1',
      now: () => 2_000,
    });
    const input = {
      ...scope,
      trigger: 'scheduled' as const,
      requestId: 'scheduled_1',
      scheduledDueAt: 1_000,
      journalHighWaterSeq: 8,
    };
    await controller.run(input);

    const duplicate = await controller.run(input);

    expect(duplicate).toMatchObject({ status: 'completed', deduplicated: true });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(parseCaoScheduledLearningSnapshot(durable.read())?.scheduledOccurrenceCount).toBe(1);
  });

  it('counts a scheduled no-delta check without invoking the learner', async () => {
    const durable = memoryPersistence();
    const execute = vi.fn();
    const controller = createCaoScheduledLearningController({
      persistence: durable.persistence,
      execute,
      newPassId: () => 'unused',
      now: () => 2_000,
    });

    const result = await controller.run({
      ...scope,
      trigger: 'scheduled',
      requestId: 'scheduled_empty',
      scheduledDueAt: 1_000,
      journalHighWaterSeq: 0,
    });

    expect(result).toMatchObject({
      status: 'completed',
      passId: null,
      scheduledOccurrenceCount: 1,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('passes only the exact account-scoped storage key to persistence', async () => {
    const durable = memoryPersistence();
    const controller = createCaoScheduledLearningController({
      persistence: durable.persistence,
      execute: async () => ({ status: 'completed', receiptId: 'receipt_1' }),
      now: () => 2_000,
    });

    await controller.run({
      ...scope,
      trigger: 'manual_force',
      requestId: 'manual_empty',
      journalHighWaterSeq: 0,
    });

    expect(durable.persistence.load).toHaveBeenCalledWith(scope);
  });

  it('rejects a scheduled occurrence before its immutable anchor', async () => {
    const execute = vi.fn();
    const controller = createCaoScheduledLearningController({
      persistence: memoryPersistence().persistence,
      execute,
      now: () => 2_000,
    });

    await expect(
      controller.run({
        ...scope,
        trigger: 'scheduled',
        requestId: 'scheduled_before_anchor',
        scheduledDueAt: 999,
        journalHighWaterSeq: 0,
      }),
    ).rejects.toMatchObject({ code: 'scheduled_occurrence_regressed' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('fails closed for stale cursors, conflicting pending work, and foreign or corrupt state', async () => {
    const durable = memoryPersistence();
    const controller = createCaoScheduledLearningController({
      persistence: durable.persistence,
      execute: async () => ({ status: 'completed', receiptId: 'receipt_1' }),
      newPassId: () => 'pass_1',
      now: () => 2_000,
    });
    await controller.run({
      ...scope,
      trigger: 'manual_force',
      requestId: 'manual_1',
      journalHighWaterSeq: 8,
    });
    await expect(
      controller.run({
        ...scope,
        trigger: 'manual_force',
        requestId: 'manual_stale',
        journalHighWaterSeq: 7,
      }),
    ).rejects.toMatchObject({ code: 'journal_cursor_regressed' });

    const foreign = memoryPersistence({
      ...(parseCaoScheduledLearningSnapshot(durable.read()) as CaoScheduledLearningSnapshot),
      accountId: 'acct_foreign',
    });
    await expect(
      createCaoScheduledLearningController({
        persistence: foreign.persistence,
        execute: async () => ({ status: 'completed', receiptId: 'receipt_2' }),
      }).recover(scope),
    ).rejects.toMatchObject({ code: 'cao_learning_scope_mismatch' });

    const corrupt = memoryPersistence({
      ...(parseCaoScheduledLearningSnapshot(durable.read()) as CaoScheduledLearningSnapshot),
      rawTranscript: 'must never enter scheduled-learning state',
    });
    await expect(
      createCaoScheduledLearningController({
        persistence: corrupt.persistence,
        execute: async () => ({ status: 'completed', receiptId: 'receipt_2' }),
      }).recover(scope),
    ).rejects.toMatchObject({ code: 'invalid_cao_learning_snapshot' });
  });

  it('rejects malformed snapshots, including negative counters and trigger/span mismatches', () => {
    const valid: CaoScheduledLearningSnapshot = {
      schemaVersion: 1,
      revision: 1,
      accountId: 'acct_1',
      workspaceId: 'workspace_1',
      projectId: 'project_1',
      scheduleId: 'schedule_1',
      targetId: 'chat_1',
      scheduleAnchorAt: 1_000,
      lastLearningSeqConsumed: 2,
      scheduledOccurrenceCount: 0,
      completions: [],
      pending: {
        passId: 'pass_1',
        requestId: 'manual_1',
        trigger: 'manual_force',
        fromSeqExclusive: 2,
        throughSeqInclusive: 3,
        requestedAt: 2_000,
      },
    };
    expect(parseCaoScheduledLearningSnapshot(valid)).toEqual(valid);
    expect(parseCaoScheduledLearningSnapshot({ ...valid, revision: -1 })).toBeNull();
    expect(parseCaoScheduledLearningSnapshot({ ...valid, lastLearningSeqConsumed: -1 })).toBeNull();
    expect(
      parseCaoScheduledLearningSnapshot({ ...valid, scheduledOccurrenceCount: -1 }),
    ).toBeNull();
    expect(
      parseCaoScheduledLearningSnapshot({
        ...valid,
        pending: { ...valid.pending, scheduledDueAt: 1_000 },
      }),
    ).toBeNull();
    expect(
      parseCaoScheduledLearningSnapshot({
        ...valid,
        pending: {
          ...valid.pending,
          trigger: 'scheduled',
          scheduledDueAt: undefined,
        },
      }),
    ).toBeNull();
    expect(
      parseCaoScheduledLearningSnapshot({
        ...valid,
        pending: {
          ...valid.pending,
          trigger: 'scheduled',
          scheduledDueAt: 999,
        },
      }),
    ).toBeNull();
    expect(
      parseCaoScheduledLearningSnapshot({
        ...valid,
        scheduledOccurrenceCount: 1,
      }),
    ).toBeNull();
  });

  it('exposes stable fail-closed error codes without persistence error contents', async () => {
    const controller = createCaoScheduledLearningController({
      persistence: { load: async () => ({ secret: 'do not echo' }), save: async () => undefined },
      execute: async () => ({ status: 'completed', receiptId: 'receipt_1' }),
    });

    const failure = await controller.recover(scope).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(CaoScheduledLearningError);
    expect(failure).toMatchObject({ code: 'invalid_cao_learning_snapshot' });
    expect(String(failure)).not.toContain('do not echo');
  });
});
