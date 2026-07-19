import { afterEach, describe, expect, it, vi } from 'vitest';

import type { JarvisApprovalV1, JarvisEvent, JarvisRun } from '@/lib/jarvis/contracts/execution';
import { TEST_INDEXED_DB, uniqueTestDbName } from '@/test/indexedDb';
import { createJarvisDb, type JarvisDexie } from './index';
import {
  fromJarvisApprovalRow,
  fromJarvisRunRow,
  toJarvisEventRow,
  toJarvisRunRow,
} from './jarvisMappers';
import {
  claimApprovedExecutionInContext,
  claimSafeAutoExecutionInContext,
  createJarvisApprovalMutationRepository,
  createPendingApprovalInContext,
  decideApprovalInContext,
} from './jarvisRepositories';
import { createKernelTurnTransactionAuthority } from './kernelTurnTransactionAuthority';

const NOW = 1_786_301_000_000;
const opened: JarvisDexie[] = [];

async function openDb(label: string): Promise<JarvisDexie> {
  const db = createJarvisDb(uniqueTestDbName(label), TEST_INDEXED_DB);
  opened.push(db);
  await db.open();
  return db;
}

function runFixture(overrides: Partial<JarvisRun> = {}): JarvisRun {
  return {
    id: 'jrun-approval-context',
    accountId: 'account-approval-context',
    workspaceId: 'workspace-approval-context',
    chatId: 'chat-approval-context',
    source: 'typed_chat',
    status: 'running',
    agentId: 'agent-jarvis',
    identityVersion: 1,
    profileRevisionId: 'profile-approval-context',
    model: {
      connectionId: 'connection-approval-context',
      providerId: 'provider-approval-context',
      modelId: 'model-approval-context',
      connectionMode: 'native-api',
      capabilities: { tools: true, vision: false },
      capturedAt: NOW - 20,
    },
    createdAt: NOW - 20,
    updatedAt: NOW - 20,
    ...overrides,
  };
}

function approvalFixture(overrides: Partial<JarvisApprovalV1> = {}): JarvisApprovalV1 {
  return {
    schemaVersion: 1,
    id: 'jappr-approval-context',
    runId: 'jrun-approval-context',
    requestId: 'request-approval-context',
    attemptNumber: 1,
    actionId: 'notes.create',
    actionVersion: 1,
    capabilityId: 'capability.notes.write',
    capabilitySnapshotHash: 'capability-hash-approval-context',
    expectedEffect: 'Create one note at the registered target.',
    expiresAt: NOW + 60_000,
    params: { title: 'Approval context' },
    paramsHash: 'params-hash-approval-context',
    targetSnapshot: {
      kind: 'app_resource',
      namespace: 'notes',
      resourceId: 'approval-context',
    },
    risk: 'confirm',
    status: 'pending',
    createdAt: NOW,
    ...overrides,
  };
}

async function rows(db: JarvisDexie) {
  return {
    runs: await db.jarvis_runs.toArray(),
    events: await db.jarvis_events.toArray(),
    approvals: await db.jarvis_approvals.toArray(),
  };
}

async function appendCancellation(
  db: JarvisDexie,
  runId: string,
  seq: number,
  createdAt: number,
): Promise<void> {
  const event: JarvisEvent = {
    runId,
    seq,
    idempotencyKey: `jcancel-${runId}-${seq}`,
    type: 'run_state',
    status: 'cancellation_requested',
    title: 'Cancellation requested',
    safeSummary: 'Cancellation intent was committed.',
    sourceRefs: [],
    artifactIds: [],
    createdAt,
  };
  await db.jarvis_events.add(toJarvisEventRow(event));
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(opened.splice(0).map((db) => db.delete()));
});

describe('signal-bound approval context cores', () => {
  it('atomically creates pending truth and matches the ordinary mutation repository', async () => {
    const directDb = await openDb('approval-context-direct');
    const ordinaryDb = await openDb('approval-context-ordinary');
    const run = runFixture();
    const approval = approvalFixture();
    await Promise.all([
      directDb.jarvis_runs.add(toJarvisRunRow(run)),
      ordinaryDb.jarvis_runs.add(toJarvisRunRow(run)),
    ]);
    const authority = createKernelTurnTransactionAuthority(directDb);
    const direct = await authority.approvalTransaction(
      ['jarvis_runs', 'jarvis_events', 'jarvis_approvals'],
      new AbortController().signal,
      (context) =>
        createPendingApprovalInContext(context, {
          accountId: run.accountId,
          approval,
          expectedEventTailSeq: 0,
        }),
    );
    const ordinary = await createJarvisApprovalMutationRepository(ordinaryDb).createPending({
      accountId: run.accountId,
      approval,
      expectedEventTailSeq: 0,
    });

    expect(direct).toEqual({ kind: 'committed', value: ordinary });
    expect(ordinary).toMatchObject({
      approval: { id: approval.id, status: 'pending' },
      run: { id: run.id, status: 'awaiting_approval' },
      events: [
        { seq: 1, type: 'run_state', status: 'awaiting_approval' },
        { seq: 2, type: 'approval', status: 'pending', idempotencyKey: approval.id },
      ],
    });
    expect(await directDb.jarvis_runs.toArray()).toEqual(await ordinaryDb.jarvis_runs.toArray());
    expect(await directDb.jarvis_events.toArray()).toEqual(
      await ordinaryDb.jarvis_events.toArray(),
    );
    expect(await directDb.jarvis_approvals.toArray()).toEqual(
      await ordinaryDb.jarvis_approvals.toArray(),
    );
  });

  it('keeps approval decisions and approved execution claims in the exact three-table boundary', async () => {
    const db = await openDb('approval-context-claim');
    const run = runFixture();
    const approval = approvalFixture();
    await db.jarvis_runs.add(toJarvisRunRow(run));
    const mutations = createJarvisApprovalMutationRepository(db);

    await mutations.createPending({ accountId: run.accountId, approval, expectedEventTailSeq: 0 });
    const approved = await mutations.decide({
      accountId: run.accountId,
      runId: run.id,
      requestId: approval.requestId,
      attemptNumber: approval.attemptNumber,
      approvalId: approval.id,
      decision: 'approve',
      decidedAt: NOW + 1,
      expectedEventTailSeq: 2,
    });
    expect(approved).toMatchObject({
      approval: { status: 'approved', decidedAt: NOW + 1 },
      run: { status: 'awaiting_approval' },
      events: [{ seq: 3, type: 'approval', status: 'approved' }],
    });

    const claimed = await mutations.claimApprovedExecution({
      accountId: run.accountId,
      runId: run.id,
      requestId: approval.requestId,
      attemptNumber: approval.attemptNumber,
      approvalId: approval.id,
      producerKind: 'action',
      ownerId: 'jexec-approval-context',
      evidenceRef: 'evidence-approval-context',
      startedAt: NOW + 2,
      expectedEventTailSeq: 3,
    });

    expect(claimed).toMatchObject({
      approval: { status: 'consumed', consumedAt: NOW + 2 },
      run: { status: 'running' },
      startEvent: {
        seq: 4,
        type: 'tool',
        status: 'consequential_effect_claimed',
        executionEvidence: {
          kind: 'consequential_effect_claimed',
          requestId: approval.requestId,
          attemptNumber: 1,
          ownerKind: 'action',
          ownerId: 'jexec-approval-context',
        },
        producerSourceEvidence: {
          producerKind: 'action',
          phase: 'start',
          state: 'ready',
          resultRef: 'evidence-approval-context',
        },
      },
    });
    expect(fromJarvisRunRow((await db.jarvis_runs.get(run.id))!).status).toBe('running');
    expect(fromJarvisApprovalRow((await db.jarvis_approvals.get(approval.id))!).status).toBe(
      'consumed',
    );
    expect(await db.jarvis_events.count()).toBe(4);
  });

  it('rolls back every table when the second or third table write fails', async () => {
    for (const failedTable of ['jarvis_approvals', 'jarvis_events'] as const) {
      const db = await openDb(`approval-context-rollback-${failedTable}`);
      const run = runFixture({ id: `jrun-rollback-${failedTable}` });
      const approval = approvalFixture({
        id: `jappr-rollback-${failedTable}`,
        runId: run.id,
      });
      await db.jarvis_runs.add(toJarvisRunRow(run));
      const authority = createKernelTurnTransactionAuthority(db);
      if (failedTable === 'jarvis_approvals') {
        vi.spyOn(db.jarvis_approvals, 'add').mockRejectedValueOnce(
          new Error('injected_second_table_failure'),
        );
      } else {
        vi.spyOn(db.jarvis_events, 'bulkAdd').mockRejectedValueOnce(
          new Error('injected_third_table_failure'),
        );
      }

      await expect(
        authority.approvalTransaction(
          ['jarvis_runs', 'jarvis_events', 'jarvis_approvals'],
          new AbortController().signal,
          (context) =>
            createPendingApprovalInContext(context, {
              accountId: run.accountId,
              approval,
              expectedEventTailSeq: 0,
            }),
        ),
      ).rejects.toThrow(
        `injected_${failedTable === 'jarvis_approvals' ? 'second' : 'third'}_table_failure`,
      );

      expect(fromJarvisRunRow((await db.jarvis_runs.get(run.id))!).status).toBe('running');
      expect(await db.jarvis_events.count()).toBe(0);
      expect(await db.jarvis_approvals.count()).toBe(0);
      vi.restoreAllMocks();
    }
  });

  it('returns exact detached committed rows on replay and rejects changed reuse without writes', async () => {
    const db = await openDb('approval-context-drift');
    const run = runFixture();
    const approval = approvalFixture();
    await db.jarvis_runs.add(toJarvisRunRow(run));
    const mutations = createJarvisApprovalMutationRepository(db);
    const createInput = { accountId: run.accountId, approval, expectedEventTailSeq: 0 };
    const created = await mutations.createPending(createInput);
    expect(await mutations.createPending(createInput)).toEqual(created);
    created.run.status = 'failed';
    created.events[0]!.title = 'mutated caller copy';
    expect(fromJarvisRunRow((await db.jarvis_runs.get(run.id))!).status).toBe('awaiting_approval');
    const afterCreate = await rows(db);

    await expect(
      mutations.createPending({
        accountId: run.accountId,
        approval: { ...approval, paramsHash: 'drifted-params-hash' },
        expectedEventTailSeq: 0,
      }),
    ).rejects.toMatchObject({ name: 'JarvisRepositoryError' });
    expect(await rows(db)).toEqual(afterCreate);

    const decideInput = {
      accountId: run.accountId,
      runId: run.id,
      requestId: approval.requestId,
      attemptNumber: 1,
      approvalId: approval.id,
      decision: 'approve' as const,
      decidedAt: NOW + 1,
      expectedEventTailSeq: 2,
    };
    const decided = await mutations.decide(decideInput);
    const decidedReplay = await mutations.decide(decideInput);
    expect(decidedReplay).toEqual(decided);
    decidedReplay.events[0]!.title = 'mutated decision replay';
    expect((await db.jarvis_events.get([run.id, 3]))!.title).toBe('Approval granted');
    const afterDecision = await rows(db);
    await expect(
      mutations.decide({
        ...decideInput,
        decidedAt: NOW + 2,
      }),
    ).rejects.toMatchObject({ name: 'JarvisRepositoryError' });
    expect(await rows(db)).toEqual(afterDecision);

    const claimInput = {
      accountId: run.accountId,
      runId: run.id,
      requestId: approval.requestId,
      attemptNumber: 1,
      approvalId: approval.id,
      producerKind: 'action' as const,
      ownerId: 'jexec-replay',
      evidenceRef: 'evidence-replay',
      startedAt: NOW + 2,
      expectedEventTailSeq: 3,
    };
    const claimed = await mutations.claimApprovedExecution(claimInput);
    const claimedReplay = await mutations.claimApprovedExecution(claimInput);
    expect(claimedReplay).toEqual(claimed);
    claimedReplay.run.status = 'failed';
    expect(fromJarvisRunRow((await db.jarvis_runs.get(run.id))!).status).toBe('running');
    const afterClaim = await rows(db);
    await expect(
      mutations.claimApprovedExecution({
        ...claimInput,
        ownerId: 'jexec-drifted',
      }),
    ).rejects.toMatchObject({ name: 'JarvisRepositoryError' });
    expect(await rows(db)).toEqual(afterClaim);
  });

  it('fails closed with no changes when cancellation intent races decision or claim', async () => {
    const decisionDb = await openDb('approval-context-cancel-decision');
    const decisionRun = runFixture({ id: 'jrun-cancel-decision' });
    const decisionApproval = approvalFixture({
      id: 'jappr-cancel-decision',
      runId: decisionRun.id,
    });
    await decisionDb.jarvis_runs.add(toJarvisRunRow(decisionRun));
    const decisionMutations = createJarvisApprovalMutationRepository(decisionDb);
    await decisionMutations.createPending({
      accountId: decisionRun.accountId,
      approval: decisionApproval,
      expectedEventTailSeq: 0,
    });
    await appendCancellation(decisionDb, decisionRun.id, 3, NOW + 1);
    const beforeDecision = await rows(decisionDb);
    await expect(
      decisionMutations.decide({
        accountId: decisionRun.accountId,
        runId: decisionRun.id,
        requestId: decisionApproval.requestId,
        attemptNumber: 1,
        approvalId: decisionApproval.id,
        decision: 'approve',
        decidedAt: NOW + 2,
        expectedEventTailSeq: 3,
      }),
    ).rejects.toMatchObject({ code: 'approval_status_conflict' });
    expect(await rows(decisionDb)).toEqual(beforeDecision);

    const claimDb = await openDb('approval-context-cancel-claim');
    const claimRun = runFixture({ id: 'jrun-cancel-claim' });
    const claimApproval = approvalFixture({ id: 'jappr-cancel-claim', runId: claimRun.id });
    await claimDb.jarvis_runs.add(toJarvisRunRow(claimRun));
    const claimMutations = createJarvisApprovalMutationRepository(claimDb);
    await claimMutations.createPending({
      accountId: claimRun.accountId,
      approval: claimApproval,
      expectedEventTailSeq: 0,
    });
    await claimMutations.decide({
      accountId: claimRun.accountId,
      runId: claimRun.id,
      requestId: claimApproval.requestId,
      attemptNumber: 1,
      approvalId: claimApproval.id,
      decision: 'approve',
      decidedAt: NOW + 1,
      expectedEventTailSeq: 2,
    });
    await appendCancellation(claimDb, claimRun.id, 4, NOW + 2);
    const beforeClaim = await rows(claimDb);
    await expect(
      claimMutations.claimApprovedExecution({
        accountId: claimRun.accountId,
        runId: claimRun.id,
        requestId: claimApproval.requestId,
        attemptNumber: 1,
        approvalId: claimApproval.id,
        producerKind: 'action',
        ownerId: 'jexec-cancel-claim',
        evidenceRef: 'evidence-cancel-claim',
        startedAt: NOW + 3,
        expectedEventTailSeq: 4,
      }),
    ).rejects.toMatchObject({ code: 'approval_status_conflict' });
    expect(await rows(claimDb)).toEqual(beforeClaim);

    const safeDb = await openDb('approval-context-cancel-safe');
    const safeRun = runFixture({ id: 'jrun-cancel-safe' });
    const safeApproval = approvalFixture({
      id: 'jappr-cancel-safe',
      runId: safeRun.id,
      risk: 'safe',
    });
    await safeDb.jarvis_runs.add(toJarvisRunRow(safeRun));
    await appendCancellation(safeDb, safeRun.id, 1, NOW);
    const beforeSafe = await rows(safeDb);
    await expect(
      createJarvisApprovalMutationRepository(safeDb).claimSafeAutoExecution({
        accountId: safeRun.accountId,
        approval: safeApproval,
        producerKind: 'action',
        ownerId: 'jexec-cancel-safe',
        evidenceRef: 'evidence-cancel-safe',
        startedAt: NOW + 1,
        expectedEventTailSeq: 1,
      }),
    ).rejects.toMatchObject({ code: 'approval_status_conflict' });
    expect(await rows(safeDb)).toEqual(beforeSafe);
  });

  it('rejects invalid decisions, early expiry, and backward operation times', async () => {
    const createDb = await openDb('approval-context-time-create');
    const createRun = runFixture({ id: 'jrun-time-create', updatedAt: NOW + 1 });
    const createApproval = approvalFixture({ id: 'jappr-time-create', runId: createRun.id });
    await createDb.jarvis_runs.add(toJarvisRunRow(createRun));
    await expect(
      createJarvisApprovalMutationRepository(createDb).createPending({
        accountId: createRun.accountId,
        approval: createApproval,
        expectedEventTailSeq: 0,
      }),
    ).rejects.toMatchObject({ code: 'approval_integrity_error' });
    expect(await createDb.jarvis_approvals.count()).toBe(0);

    for (const [label, decision, decidedAt] of [
      ['backward', 'approve', NOW - 1],
      ['early-expire', 'expire', NOW + 1],
      ['invalid', 'invalid', NOW + 1],
    ] as const) {
      const db = await openDb(`approval-context-time-decision-${label}`);
      const run = runFixture({ id: `jrun-time-${label}` });
      const approval = approvalFixture({ id: `jappr-time-${label}`, runId: run.id });
      await db.jarvis_runs.add(toJarvisRunRow(run));
      const mutations = createJarvisApprovalMutationRepository(db);
      await mutations.createPending({
        accountId: run.accountId,
        approval,
        expectedEventTailSeq: 0,
      });
      const before = await rows(db);
      await expect(
        mutations.decide({
          accountId: run.accountId,
          runId: run.id,
          requestId: approval.requestId,
          attemptNumber: 1,
          approvalId: approval.id,
          decision: decision as never,
          decidedAt,
          expectedEventTailSeq: 2,
        }),
      ).rejects.toMatchObject({
        code: decision === 'invalid' ? 'approval_integrity_error' : 'approval_status_conflict',
      });
      expect(await rows(db)).toEqual(before);
    }

    const claimDb = await openDb('approval-context-time-claim');
    const claimRun = runFixture({ id: 'jrun-time-claim' });
    const claimApproval = approvalFixture({ id: 'jappr-time-claim', runId: claimRun.id });
    await claimDb.jarvis_runs.add(toJarvisRunRow(claimRun));
    const claimMutations = createJarvisApprovalMutationRepository(claimDb);
    await claimMutations.createPending({
      accountId: claimRun.accountId,
      approval: claimApproval,
      expectedEventTailSeq: 0,
    });
    await claimMutations.decide({
      accountId: claimRun.accountId,
      runId: claimRun.id,
      requestId: claimApproval.requestId,
      attemptNumber: 1,
      approvalId: claimApproval.id,
      decision: 'approve',
      decidedAt: NOW + 1,
      expectedEventTailSeq: 2,
    });
    await expect(
      claimMutations.claimApprovedExecution({
        accountId: claimRun.accountId,
        runId: claimRun.id,
        requestId: claimApproval.requestId,
        attemptNumber: 1,
        approvalId: claimApproval.id,
        producerKind: 'action',
        ownerId: 'jexec-time-claim',
        evidenceRef: 'evidence-time-claim',
        startedAt: NOW,
        expectedEventTailSeq: 3,
      }),
    ).rejects.toMatchObject({ code: 'approval_status_conflict' });

    const safeDb = await openDb('approval-context-time-safe');
    const safeRun = runFixture({ id: 'jrun-time-safe' });
    const safeApproval = approvalFixture({
      id: 'jappr-time-safe',
      runId: safeRun.id,
      risk: 'safe',
    });
    await safeDb.jarvis_runs.add(toJarvisRunRow(safeRun));
    await expect(
      createJarvisApprovalMutationRepository(safeDb).claimSafeAutoExecution({
        accountId: safeRun.accountId,
        approval: safeApproval,
        producerKind: 'action',
        ownerId: 'jexec-time-safe',
        evidenceRef: 'evidence-time-safe',
        startedAt: NOW - 1,
        expectedEventTailSeq: 0,
      }),
    ).rejects.toMatchObject({ code: 'approval_status_conflict' });
  });

  it('binds every operation to the exact expected event tail without writes on drift', async () => {
    const createDb = await openDb('approval-context-tail-create');
    const createRun = runFixture({ id: 'jrun-tail-create' });
    const createApproval = approvalFixture({ id: 'jappr-tail-create', runId: createRun.id });
    await createDb.jarvis_runs.add(toJarvisRunRow(createRun));
    await expect(
      createJarvisApprovalMutationRepository(createDb).createPending({
        accountId: createRun.accountId,
        approval: createApproval,
        expectedEventTailSeq: 1,
      }),
    ).rejects.toMatchObject({ code: 'approval_scope_mismatch' });
    expect(await createDb.jarvis_events.count()).toBe(0);

    const decisionDb = await openDb('approval-context-tail-decision');
    const decisionRun = runFixture({ id: 'jrun-tail-decision' });
    const decisionApproval = approvalFixture({
      id: 'jappr-tail-decision',
      runId: decisionRun.id,
    });
    await decisionDb.jarvis_runs.add(toJarvisRunRow(decisionRun));
    const decisionMutations = createJarvisApprovalMutationRepository(decisionDb);
    await decisionMutations.createPending({
      accountId: decisionRun.accountId,
      approval: decisionApproval,
      expectedEventTailSeq: 0,
    });
    const beforeDecision = await rows(decisionDb);
    await expect(
      decisionMutations.decide({
        accountId: decisionRun.accountId,
        runId: decisionRun.id,
        requestId: decisionApproval.requestId,
        attemptNumber: 1,
        approvalId: decisionApproval.id,
        decision: 'approve',
        decidedAt: NOW + 1,
        expectedEventTailSeq: 1,
      }),
    ).rejects.toMatchObject({ code: 'approval_scope_mismatch' });
    expect(await rows(decisionDb)).toEqual(beforeDecision);

    const claimDb = await openDb('approval-context-tail-claim');
    const claimRun = runFixture({ id: 'jrun-tail-claim' });
    const claimApproval = approvalFixture({ id: 'jappr-tail-claim', runId: claimRun.id });
    await claimDb.jarvis_runs.add(toJarvisRunRow(claimRun));
    const claimMutations = createJarvisApprovalMutationRepository(claimDb);
    await claimMutations.createPending({
      accountId: claimRun.accountId,
      approval: claimApproval,
      expectedEventTailSeq: 0,
    });
    await claimMutations.decide({
      accountId: claimRun.accountId,
      runId: claimRun.id,
      requestId: claimApproval.requestId,
      attemptNumber: 1,
      approvalId: claimApproval.id,
      decision: 'approve',
      decidedAt: NOW + 1,
      expectedEventTailSeq: 2,
    });
    const beforeClaim = await rows(claimDb);
    await expect(
      claimMutations.claimApprovedExecution({
        accountId: claimRun.accountId,
        runId: claimRun.id,
        requestId: claimApproval.requestId,
        attemptNumber: 1,
        approvalId: claimApproval.id,
        producerKind: 'action',
        ownerId: 'jexec-tail-claim',
        evidenceRef: 'evidence-tail-claim',
        startedAt: NOW + 2,
        expectedEventTailSeq: 2,
      }),
    ).rejects.toMatchObject({ code: 'approval_scope_mismatch' });
    expect(await rows(claimDb)).toEqual(beforeClaim);

    const safeDb = await openDb('approval-context-tail-safe');
    const safeRun = runFixture({ id: 'jrun-tail-safe' });
    const safeApproval = approvalFixture({
      id: 'jappr-tail-safe',
      runId: safeRun.id,
      risk: 'safe',
    });
    await safeDb.jarvis_runs.add(toJarvisRunRow(safeRun));
    await expect(
      createJarvisApprovalMutationRepository(safeDb).claimSafeAutoExecution({
        accountId: safeRun.accountId,
        approval: safeApproval,
        producerKind: 'action',
        ownerId: 'jexec-tail-safe',
        evidenceRef: 'evidence-tail-safe',
        startedAt: NOW + 1,
        expectedEventTailSeq: 1,
      }),
    ).rejects.toMatchObject({ code: 'approval_scope_mismatch' });
    expect(await safeDb.jarvis_events.count()).toBe(0);
  });

  it('rolls back each operation when exact persisted event readback is unavailable', async () => {
    const scenarios = ['create', 'decide', 'claim', 'safe'] as const;
    for (const scenario of scenarios) {
      const db = await openDb(`approval-context-readback-${scenario}`);
      const run = runFixture({ id: `jrun-readback-${scenario}` });
      const approval = approvalFixture({
        id: `jappr-readback-${scenario}`,
        runId: run.id,
        ...(scenario === 'safe' ? { risk: 'safe' as const } : {}),
      });
      await db.jarvis_runs.add(toJarvisRunRow(run));
      const mutations = createJarvisApprovalMutationRepository(db);
      if (scenario !== 'create' && scenario !== 'safe') {
        await mutations.createPending({
          accountId: run.accountId,
          approval,
          expectedEventTailSeq: 0,
        });
      }
      if (scenario === 'claim') {
        await mutations.decide({
          accountId: run.accountId,
          runId: run.id,
          requestId: approval.requestId,
          attemptNumber: 1,
          approvalId: approval.id,
          decision: 'approve',
          decidedAt: NOW + 1,
          expectedEventTailSeq: 2,
        });
      }
      const before = await rows(db);
      vi.spyOn(db.jarvis_events, 'get').mockResolvedValue(undefined);
      const operation =
        scenario === 'create'
          ? mutations.createPending({
              accountId: run.accountId,
              approval,
              expectedEventTailSeq: 0,
            })
          : scenario === 'decide'
            ? mutations.decide({
                accountId: run.accountId,
                runId: run.id,
                requestId: approval.requestId,
                attemptNumber: 1,
                approvalId: approval.id,
                decision: 'approve',
                decidedAt: NOW + 1,
                expectedEventTailSeq: 2,
              })
            : scenario === 'claim'
              ? mutations.claimApprovedExecution({
                  accountId: run.accountId,
                  runId: run.id,
                  requestId: approval.requestId,
                  attemptNumber: 1,
                  approvalId: approval.id,
                  producerKind: 'action',
                  ownerId: 'jexec-readback-claim',
                  evidenceRef: 'evidence-readback-claim',
                  startedAt: NOW + 2,
                  expectedEventTailSeq: 3,
                })
              : mutations.claimSafeAutoExecution({
                  accountId: run.accountId,
                  approval,
                  producerKind: 'action',
                  ownerId: 'jexec-readback-safe',
                  evidenceRef: 'evidence-readback-safe',
                  startedAt: NOW + 1,
                  expectedEventTailSeq: 0,
                });
      await expect(operation).rejects.toMatchObject({ code: 'approval_integrity_error' });
      expect(await rows(db)).toEqual(before);
      vi.restoreAllMocks();
    }
  });

  it('supports denial and expiry decisions by resuming the parent run atomically', async () => {
    for (const decision of ['deny', 'expire'] as const) {
      const db = await openDb(`approval-context-${decision}`);
      const run = runFixture({ id: `jrun-${decision}` });
      const approval = approvalFixture({ id: `jappr-${decision}`, runId: run.id });
      await db.jarvis_runs.add(toJarvisRunRow(run));
      const authority = createKernelTurnTransactionAuthority(db);
      await authority.approvalTransaction(
        ['jarvis_runs', 'jarvis_events', 'jarvis_approvals'],
        new AbortController().signal,
        (context) =>
          createPendingApprovalInContext(context, {
            accountId: run.accountId,
            approval,
            expectedEventTailSeq: 0,
          }),
      );
      const result = await authority.approvalTransaction(
        ['jarvis_runs', 'jarvis_events', 'jarvis_approvals'],
        new AbortController().signal,
        (context) =>
          decideApprovalInContext(context, {
            accountId: run.accountId,
            runId: run.id,
            requestId: approval.requestId,
            attemptNumber: 1,
            approvalId: approval.id,
            decision,
            decidedAt: decision === 'expire' ? approval.expiresAt : NOW + 1,
            expectedEventTailSeq: 2,
          }),
      );

      expect(result).toMatchObject({
        kind: 'committed',
        value: {
          approval: { status: decision === 'deny' ? 'denied' : 'expired' },
          run: { status: 'running' },
          events: [
            { type: 'approval', status: decision === 'deny' ? 'denied' : 'expired' },
            { type: 'run_state', status: 'running' },
          ],
        },
      });
    }
  });

  it('atomically records a consumed safe-auto audit and claim while the run stays running', async () => {
    const db = await openDb('approval-context-safe-auto');
    const run = runFixture();
    const approval = approvalFixture({
      id: 'jappr-safe-auto',
      risk: 'safe',
      status: 'pending',
    });
    await db.jarvis_runs.add(toJarvisRunRow(run));
    const authority = createKernelTurnTransactionAuthority(db);

    await expect(
      authority.approvalTransaction(
        ['jarvis_runs', 'jarvis_events', 'jarvis_approvals'],
        new AbortController().signal,
        (context) =>
          claimSafeAutoExecutionInContext(context, {
            accountId: run.accountId,
            approval: { ...approval, expiresAt: NOW },
            producerKind: 'action',
            ownerId: 'jexec-safe-auto-expired',
            evidenceRef: 'evidence-safe-auto-expired',
            startedAt: NOW + 1,
            expectedEventTailSeq: 0,
          }),
      ),
    ).rejects.toMatchObject({ code: 'approval_status_conflict' });
    expect(await db.jarvis_approvals.count()).toBe(0);
    expect(await db.jarvis_events.count()).toBe(0);

    const safeInput = {
      accountId: run.accountId,
      approval,
      producerKind: 'action' as const,
      ownerId: 'jexec-safe-auto',
      evidenceRef: 'evidence-safe-auto',
      startedAt: NOW + 1,
      expectedEventTailSeq: 0,
    };
    const mutations = createJarvisApprovalMutationRepository(db);
    const result = await mutations.claimSafeAutoExecution(safeInput);

    expect(result).toMatchObject({
      approval: { id: approval.id, status: 'consumed', consumedAt: NOW + 1 },
      run: { id: run.id, status: 'running' },
      startEvent: {
        seq: 1,
        status: 'consequential_effect_claimed',
        producerSourceEvidence: { phase: 'start', state: 'ready' },
      },
    });
    const safeReplay = await mutations.claimSafeAutoExecution(safeInput);
    expect(safeReplay).toEqual(result);
    safeReplay.startEvent.title = 'mutated safe replay';
    expect((await db.jarvis_events.get([run.id, 1]))!.title).toBe(
      'Approved action execution claimed',
    );
    const committed = await rows(db);
    await expect(
      mutations.claimSafeAutoExecution({ ...safeInput, evidenceRef: 'evidence-safe-drifted' }),
    ).rejects.toMatchObject({ name: 'JarvisRepositoryError' });
    expect(await rows(db)).toEqual(committed);
    expect(await db.jarvis_approvals.count()).toBe(1);
    expect(await db.jarvis_events.count()).toBe(1);
  });
});
