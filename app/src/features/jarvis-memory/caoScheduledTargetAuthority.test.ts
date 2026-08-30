import { describe, expect, it, vi } from 'vitest';

import type { CaoTargetLeaseV1 } from '@/lib/jarvis/contracts/execution';

import {
  CaoScheduledTargetAuthorityError,
  createCaoScheduledTargetExecution,
} from './caoScheduledTargetAuthority';

const execution = {
  accountId: 'account-1',
  workspaceId: 'workspace-1',
  projectId: 'project-1',
  scheduleId: 'schedule-1',
  targetId: 'terminal-1',
  passId: 'pass-1',
  requestId: 'request-1',
  trigger: 'scheduled' as const,
  fromSeqExclusive: 4,
  throughSeqInclusive: 9,
  requestedAt: 1_000,
};

function lease(overrides: Partial<CaoTargetLeaseV1> = {}): CaoTargetLeaseV1 {
  return {
    schemaVersion: 1,
    kind: 'cao_target_lease',
    leaseId: 'lease-1',
    accountId: execution.accountId,
    workspaceId: execution.workspaceId,
    projectId: execution.projectId,
    runId: 'run-1',
    selectionMode: 'explicit_single',
    targets: [{ kind: 'terminal', targetId: execution.targetId, revision: 7 }],
    acquiredAt: 900,
    expiresAt: 1_500,
    ...overrides,
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    execution,
    runId: 'run-1',
    leaseId: 'lease-1',
    targetKind: 'terminal' as const,
    targetRevision: 7,
    ...overrides,
  };
}

describe('createCaoScheduledTargetExecution', () => {
  it('verifies the exact learning scope and explicit target immediately before execution', async () => {
    const verify = vi.fn().mockResolvedValue(lease());
    const execute = vi.fn().mockResolvedValue({ status: 'completed', receiptId: 'receipt-1' });
    const scoped = createCaoScheduledTargetExecution({ authority: { verify }, execute });

    await expect(scoped.execute(input())).resolves.toEqual({
      status: 'completed',
      receiptId: 'receipt-1',
    });

    expect(verify).toHaveBeenCalledWith({
      accountId: execution.accountId,
      workspaceId: execution.workspaceId,
      projectId: execution.projectId,
      runId: 'run-1',
      leaseId: 'lease-1',
    });
    expect(execute).toHaveBeenCalledWith(execution);
    expect(verify.mock.invocationCallOrder[0]).toBeLessThan(execute.mock.invocationCallOrder[0]);
  });

  it('fails closed before authority access when an explicit lease identity is absent', async () => {
    const verify = vi.fn();
    const execute = vi.fn();
    const scoped = createCaoScheduledTargetExecution({ authority: { verify }, execute });

    await expect(scoped.execute(input({ leaseId: '' }))).rejects.toMatchObject({
      code: 'cao_learning_target_lease_required',
    } satisfies Partial<CaoScheduledTargetAuthorityError>);
    expect(verify).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    [
      'target identity',
      lease({ targets: [{ kind: 'terminal', targetId: 'terminal-2', revision: 7 }] }),
      'cao_learning_target_not_authorized',
    ],
    [
      'target revision',
      lease({ targets: [{ kind: 'terminal', targetId: execution.targetId, revision: 8 }] }),
      'cao_learning_target_revision_stale',
    ],
    ['lease run', lease({ runId: 'run-2' }), 'cao_learning_target_lease_scope_mismatch'],
  ])('rejects a mismatched %s with zero learning execution', async (_case, verifiedLease, code) => {
    const execute = vi.fn();
    const scoped = createCaoScheduledTargetExecution({
      authority: { verify: vi.fn().mockResolvedValue(verifiedLease) },
      execute,
    });

    await expect(scoped.execute(input())).rejects.toMatchObject({ code });
    expect(execute).not.toHaveBeenCalled();
  });

  it('propagates expiry or ownership revalidation failures without executing', async () => {
    const verify = vi.fn().mockRejectedValue(new Error('cao_target_lease_stale'));
    const execute = vi.fn();
    const scoped = createCaoScheduledTargetExecution({ authority: { verify }, execute });

    await expect(scoped.execute(input())).rejects.toThrow('cao_target_lease_stale');
    expect(execute).not.toHaveBeenCalled();
  });

  it('revalidates on every failure-recovery attempt and never acquires or renews authority', async () => {
    const verify = vi
      .fn()
      .mockResolvedValueOnce(lease())
      .mockRejectedValueOnce(new Error('cao_target_lease_stale'));
    const execute = vi.fn().mockResolvedValue({ status: 'failed' });
    const scoped = createCaoScheduledTargetExecution({ authority: { verify }, execute });

    await expect(scoped.execute(input())).resolves.toEqual({ status: 'failed' });
    await expect(scoped.execute(input())).rejects.toThrow('cao_target_lease_stale');

    expect(verify).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(Object.keys(scoped)).toEqual(['execute']);
  });
});
