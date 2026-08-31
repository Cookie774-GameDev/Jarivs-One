import { describe, expect, it, vi } from 'vitest';
import type { JarvisApprovalV1, JarvisEvent, JarvisRun } from '@/lib/jarvis/contracts/execution';
import type { CaoLiveTarget } from '@/lib/jarvis/executionJournal/caoTargetAuthority';
import type { CaoControlRecord } from './controlRuntime';
import { createProductionCaoControlRuntime } from './productionControlRuntime';

const scope = { accountId: 'account-1', workspaceId: 'workspace-1', projectId: 'project-1' };
const command = {
  action: 'verify' as const,
  selectors: [
    { kind: 'terminal' as const, selector: 'terminal-2', by: 'id' as const },
    { kind: 'chat' as const, selector: 'chat-1', by: 'id' as const },
  ],
  source: 'natural-language' as const,
};
const targets = [
  { kind: 'terminal' as const, targetId: 'terminal-2', revision: 8 },
  { kind: 'chat' as const, targetId: 'chat-1', revision: 4 },
];

function harness(options: { approval?: JarvisApprovalV1['status'] } = {}) {
  const records = new Map<string, CaoControlRecord>();
  const runs = new Map<string, JarvisRun>();
  const events = new Map<string, JarvisEvent[]>();
  const approvals = new Map<string, JarvisApprovalV1>();
  const owners = new Map<string, string>();
  let now = 1_000;
  const liveTargets: CaoLiveTarget[] = targets.map((target) => ({
    ...target,
    ...scope,
    selected: true,
    locked: false,
  }));
  const recordsAdapter = {
    load: vi.fn(async (requestId: string) => records.get(requestId)),
    save: vi.fn(async (expectedRevision: number, record: CaoControlRecord) => {
      const current = records.get(record.requestId);
      if ((current?.revision ?? 0) !== expectedRevision) return false;
      records.set(record.requestId, structuredClone(record));
      if (!runs.has(record.runId)) {
        runs.set(record.runId, {
          id: record.runId,
          ...scope,
          source: 'typed_chat',
          status: 'running',
          agentId: 'jarvis-cao',
          identityVersion: 1,
          profileRevisionId: 'profile-1',
          model: {} as JarvisRun['model'],
          createdAt: now,
          updatedAt: now,
        });
      }
      return true;
    }),
  };
  const journal = {
    getRun: vi.fn(async (accountId: string, runId: string) =>
      accountId === scope.accountId ? runs.get(runId) : undefined,
    ),
    appendEvent: vi.fn(
      async (accountId: string, runId: string, input: Omit<JarvisEvent, 'runId' | 'seq'>) => {
        if (accountId !== scope.accountId || !runs.has(runId)) throw new Error('run_missing');
        const list = events.get(runId) ?? [];
        const event = { ...structuredClone(input), runId, seq: list.length + 1 } as JarvisEvent;
        list.push(event);
        events.set(runId, list);
        return structuredClone(event);
      },
    ),
  };
  const eventRepository = {
    listByRun: vi.fn(async (_accountId: string, runId: string, input?: { afterSeq?: number }) =>
      (events.get(runId) ?? []).filter((event) => event.seq > (input?.afterSeq ?? 0)),
    ),
  };
  const registry = {
    claimExact: vi.fn(
      async (input: {
        leaseId: string;
        targets: readonly { kind: string; targetId: string }[];
      }) => {
        for (const target of input.targets)
          owners.set(`${target.kind}:${target.targetId}`, input.leaseId);
        return {
          applied: true as const,
          targets: input.targets.map((target) => ({
            ...liveTargets.find(
              (row) => row.kind === target.kind && row.targetId === target.targetId,
            )!,
            ownerLeaseId: input.leaseId,
          })),
        };
      },
    ),
    readExact: vi.fn(async (input: { targets: readonly { kind: string; targetId: string }[] }) =>
      input.targets.map((target) => {
        const row = liveTargets.find(
          (candidate) => candidate.kind === target.kind && candidate.targetId === target.targetId,
        )!;
        const ownerLeaseId = owners.get(`${target.kind}:${target.targetId}`);
        return { ...row, ...(ownerLeaseId ? { ownerLeaseId } : {}) };
      }),
    ),
    releaseExact: vi.fn(
      async (input: { targets: readonly { kind: string; targetId: string }[] }) => {
        for (const target of input.targets) owners.delete(`${target.kind}:${target.targetId}`);
      },
    ),
  };
  const approvalRepository = {
    getById: vi.fn(async (_accountId: string, approvalId: string) => approvals.get(approvalId)),
  };
  const requestApproval = vi.fn(async (record: CaoControlRecord) => {
    const approval: JarvisApprovalV1 = {
      schemaVersion: 1,
      id: `approval-${record.requestId}`,
      runId: record.runId,
      requestId: record.requestId,
      attemptNumber: 1,
      actionId: `cao.control.${record.command.action}`,
      actionVersion: 1,
      capabilityId: 'jarvis-cao-control',
      capabilitySnapshotHash: 'snapshot-1',
      params: {},
      paramsHash: 'params-1',
      expectedEffect: `CAO ${record.command.action}`,
      risk: 'confirm',
      status: options.approval ?? 'approved',
      createdAt: now,
      expiresAt: now + 60_000,
    };
    approvals.set(approval.id, approval);
    return approval.id;
  });
  const verifyAction = vi.fn(async () => ({
    status: 'completed' as const,
    receiptId: 'receipt-1',
  }));
  const restartAction = vi.fn(async () => ({
    status: 'completed' as const,
    receiptId: 'receipt-2',
  }));
  const cancelRun = vi.fn(async () => undefined);
  const actions = {
    supervise: { execute: verifyAction },
    diagnose: { execute: verifyAction },
    restart: { execute: restartAction },
    verify: { execute: verifyAction },
    grade: { execute: verifyAction },
    'force-check': { execute: restartAction },
    cancel: { execute: verifyAction },
  };
  const dependencies = {
    records: recordsAdapter,
    journal,
    events: eventRepository,
    approvals: approvalRepository,
    requestApproval,
    registry,
    actions,
    cancelRun,
    now: () => now++,
    newRunId: () => 'jrun_cao_production_1',
    newLeaseId: () => 'lease-production-1',
    leaseMs: 30_000,
  };
  return {
    dependencies,
    records,
    runs,
    approvals,
    registry,
    verifyAction,
    restartAction,
    cancelRun,
  };
}

describe('production CAO control runtime composition', () => {
  it('preserves exact durable identity and explicit multi-target order across reconnect dedupe', async () => {
    const h = harness();
    const input = { ...scope, requestId: 'request-1', command, targets };
    const firstRuntime = createProductionCaoControlRuntime(h.dependencies);
    const first = await firstRuntime.run(input);
    const reconnected = createProductionCaoControlRuntime(h.dependencies);
    const duplicate = await reconnected.run(structuredClone(input));

    expect(first).toEqual(duplicate);
    expect(first).toMatchObject({
      status: 'completed',
      runId: 'jrun_cao_production_1',
      targetIds: ['terminal:terminal-2', 'chat:chat-1'],
    });
    expect(h.registry.claimExact).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'jrun_cao_production_1',
        targets: [
          { kind: 'terminal', targetId: 'terminal-2' },
          { kind: 'chat', targetId: 'chat-1' },
        ],
      }),
    );
    expect(h.verifyAction).toHaveBeenCalledTimes(1);
  });

  it('uses the canonical approval row and resumes only the same approved request after reload', async () => {
    const h = harness({ approval: 'pending' });
    const runtime = createProductionCaoControlRuntime(h.dependencies);
    const input = {
      ...scope,
      requestId: 'request-restart',
      command: { ...command, action: 'restart' as const },
      targets,
    };
    expect((await runtime.run(input)).status).toBe('awaiting_approval');
    const approval = [...h.approvals.values()][0]!;
    h.approvals.set(approval.id, { ...approval, status: 'approved', decidedAt: 1_100 });

    const receipt = await createProductionCaoControlRuntime(h.dependencies).run(input);
    expect(receipt.status).toBe('completed');
    expect(h.restartAction).toHaveBeenCalledTimes(1);
    expect(h.dependencies.requestApproval).toHaveBeenCalledTimes(1);
  });

  it('cancels only the exact persisted run and does not replay an uncertain mutation', async () => {
    const h = harness();
    const runtime = createProductionCaoControlRuntime(h.dependencies);
    const verifyInput = { ...scope, requestId: 'request-cancel', command, targets };
    const pending = {
      schemaVersion: 1 as const,
      revision: 2,
      ...verifyInput,
      runId: 'jrun_cao_production_1',
      status: 'running' as const,
      leaseId: 'lease-production-1',
      updatedAt: 1_000,
    };
    h.records.set(verifyInput.requestId, pending);
    h.runs.set(pending.runId, {
      id: pending.runId,
      ...scope,
      source: 'typed_chat',
      status: 'running',
      agentId: 'jarvis-cao',
      identityVersion: 1,
      profileRevisionId: 'profile-1',
      model: {} as JarvisRun['model'],
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    expect((await runtime.cancel({ ...scope, requestId: verifyInput.requestId })).status).toBe(
      'cancelled',
    );
    expect(h.cancelRun).toHaveBeenCalledWith('jrun_cao_production_1');

    const restartRecord = {
      ...pending,
      requestId: 'request-uncertain',
      command: { ...command, action: 'restart' as const },
    };
    h.records.set(restartRecord.requestId, restartRecord);
    const recovered = await createProductionCaoControlRuntime(h.dependencies).run({
      ...scope,
      requestId: restartRecord.requestId,
      command: restartRecord.command,
      targets,
    });
    expect(recovered).toMatchObject({
      status: 'failed',
      errorCode: 'cao_control_recovery_required',
    });
    expect(h.restartAction).not.toHaveBeenCalled();
  });

  it('fails closed before persistence when an exact action or canonical adapter is missing', async () => {
    const h = harness();
    const actions = { ...h.dependencies.actions, verify: undefined };
    const runtime = createProductionCaoControlRuntime({ ...h.dependencies, actions });
    await expect(
      runtime.run({ ...scope, requestId: 'request-missing', command, targets }),
    ).rejects.toThrow('cao_control_action_adapter_unavailable');
    expect(h.dependencies.records.save).not.toHaveBeenCalled();
    expect(h.registry.claimExact).not.toHaveBeenCalled();

    expect(() =>
      createProductionCaoControlRuntime({ ...h.dependencies, registry: undefined as never }),
    ).toThrow('cao_control_composition_unavailable');
  });

  it('rejects duplicate, malformed, or reordered-envelope drift before effects', async () => {
    const h = harness();
    const runtime = createProductionCaoControlRuntime(h.dependencies);
    await expect(
      runtime.run({
        ...scope,
        requestId: 'request-duplicate-target',
        command,
        targets: [targets[0]!, targets[0]!],
      }),
    ).rejects.toThrow('cao_control_target_set_invalid');
    await runtime.run({ ...scope, requestId: 'request-drift', command, targets });
    await expect(
      runtime.run({
        ...scope,
        requestId: 'request-drift',
        command: { ...command, selectors: [...command.selectors].reverse() },
        targets: [...targets].reverse(),
      }),
    ).rejects.toThrow('cao_control_request_conflict');
    expect(h.verifyAction).toHaveBeenCalledTimes(1);
  });
});
