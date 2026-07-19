import { afterEach, describe, expect, it, vi } from 'vitest';

import type { JarvisApprovalV1, JarvisRun } from '@/lib/jarvis/contracts/execution';
import { TEST_INDEXED_DB, uniqueTestDbName } from '@/test/indexedDb';
import { createJarvisDb, type JarvisDexie } from './index';
import { fromJarvisApprovalRow, fromJarvisRunRow, toJarvisRunRow } from './jarvisMappers';
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
        }),
    );
    const ordinary = await createJarvisApprovalMutationRepository(ordinaryDb).createPending({
      accountId: run.accountId,
      approval,
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

    await mutations.createPending({ accountId: run.accountId, approval });
    const approved = await mutations.decide({
      accountId: run.accountId,
      runId: run.id,
      requestId: approval.requestId,
      attemptNumber: approval.attemptNumber,
      approvalId: approval.id,
      decision: 'approve',
      decidedAt: NOW + 1,
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

  it('denies replay and request drift without changing the committed rows', async () => {
    const db = await openDb('approval-context-drift');
    const run = runFixture();
    const approval = approvalFixture();
    await db.jarvis_runs.add(toJarvisRunRow(run));
    const mutations = createJarvisApprovalMutationRepository(db);
    await mutations.createPending({ accountId: run.accountId, approval });
    const before = {
      run: await db.jarvis_runs.toArray(),
      events: await db.jarvis_events.toArray(),
      approvals: await db.jarvis_approvals.toArray(),
    };

    await expect(
      mutations.createPending({
        accountId: run.accountId,
        approval: { ...approval, paramsHash: 'drifted-params-hash' },
      }),
    ).rejects.toMatchObject({ code: 'approval_status_conflict' });
    await expect(
      mutations.decide({
        accountId: run.accountId,
        runId: run.id,
        requestId: approval.requestId,
        attemptNumber: 1,
        approvalId: approval.id,
        decision: 'approve',
        decidedAt: approval.expiresAt,
      }),
    ).rejects.toMatchObject({ code: 'approval_status_conflict' });
    await expect(
      mutations.decide({
        accountId: run.accountId,
        runId: run.id,
        requestId: 'request-stale',
        attemptNumber: 1,
        approvalId: approval.id,
        decision: 'approve',
        decidedAt: NOW + 1,
      }),
    ).rejects.toMatchObject({ code: 'approval_scope_mismatch' });

    expect(await db.jarvis_runs.toArray()).toEqual(before.run);
    expect(await db.jarvis_events.toArray()).toEqual(before.events);
    expect(await db.jarvis_approvals.toArray()).toEqual(before.approvals);
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
          createPendingApprovalInContext(context, { accountId: run.accountId, approval }),
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
            decidedAt: NOW + 1,
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
          }),
      ),
    ).rejects.toMatchObject({ code: 'approval_status_conflict' });
    expect(await db.jarvis_approvals.count()).toBe(0);
    expect(await db.jarvis_events.count()).toBe(0);

    const result = await authority.approvalTransaction(
      ['jarvis_runs', 'jarvis_events', 'jarvis_approvals'],
      new AbortController().signal,
      (context) =>
        claimSafeAutoExecutionInContext(context, {
          accountId: run.accountId,
          approval,
          producerKind: 'action',
          ownerId: 'jexec-safe-auto',
          evidenceRef: 'evidence-safe-auto',
          startedAt: NOW + 1,
        }),
    );

    expect(result).toMatchObject({
      kind: 'committed',
      value: {
        approval: { id: approval.id, status: 'consumed', consumedAt: NOW + 1 },
        run: { id: run.id, status: 'running' },
        startEvent: {
          seq: 1,
          status: 'consequential_effect_claimed',
          producerSourceEvidence: { phase: 'start', state: 'ready' },
        },
      },
    });
    expect(await db.jarvis_approvals.count()).toBe(1);
    expect(await db.jarvis_events.count()).toBe(1);
  });
});
