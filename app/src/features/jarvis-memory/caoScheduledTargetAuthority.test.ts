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

  it('executes the exact input snapshot verified before asynchronous recovery', async () => {
    let resolveVerify!: (value: CaoTargetLeaseV1) => void;
    const verify = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<CaoTargetLeaseV1>((resolve) => {
            resolveVerify = resolve;
          }),
      )
      .mockResolvedValueOnce(lease());
    const execute = vi.fn().mockResolvedValue({ status: 'completed', receiptId: 'receipt-1' });
    const scoped = createCaoScheduledTargetExecution({ authority: { verify }, execute });
    const mutable = structuredClone(input());
    const expectedExecution = structuredClone(mutable.execution);

    const pending = scoped.execute(mutable);
    mutable.execution.targetId = 'terminal-mutated';
    mutable.execution.requestId = 'request-mutated';
    mutable.runId = 'run-mutated';
    mutable.leaseId = 'lease-mutated';
    mutable.targetRevision = 99;
    resolveVerify(lease());

    await expect(pending).resolves.toEqual({ status: 'completed', receiptId: 'receipt-1' });
    expect(verify).toHaveBeenCalledWith({
      accountId: execution.accountId,
      workspaceId: execution.workspaceId,
      projectId: execution.projectId,
      runId: 'run-1',
      leaseId: 'lease-1',
    });
    expect(execute).toHaveBeenCalledWith(expectedExecution);
  });

  it.each([
    [
      'duplicate target identity',
      lease({
        selectionMode: 'explicit_set',
        targets: [
          { kind: 'terminal', targetId: execution.targetId, revision: 7 },
          { kind: 'terminal', targetId: execution.targetId, revision: 7 },
        ],
      }),
    ],
    ['invalid temporal bounds', lease({ acquiredAt: 1_600 })],
  ])('rejects a recovered lease with %s before execution', async (_case, malformed) => {
    const execute = vi.fn();
    const scoped = createCaoScheduledTargetExecution({
      authority: { verify: vi.fn().mockResolvedValue(malformed) },
      execute,
    });

    await expect(scoped.execute(input())).rejects.toMatchObject({
      code: 'cao_learning_target_lease_invalid',
    } satisfies Partial<CaoScheduledTargetAuthorityError>);
    expect(execute).not.toHaveBeenCalled();
  });

  it('collapses unknown recovery failures without exposing raw authority details', async () => {
    const execute = vi.fn();
    const scoped = createCaoScheduledTargetExecution({
      authority: {
        verify: vi.fn().mockRejectedValue(new Error('private registry path and payload')),
      },
      execute,
    });

    const failure = await scoped.execute(input()).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'cao_learning_target_authority_unavailable' });
    expect(String(failure)).not.toContain('private registry path');
    expect(execute).not.toHaveBeenCalled();
  });

  it('revalidates the same exact lease after completed execution before returning success', async () => {
    const verify = vi.fn().mockResolvedValue(lease());
    const execute = vi.fn().mockResolvedValue({ status: 'completed', receiptId: 'receipt-1' });
    const scoped = createCaoScheduledTargetExecution({ authority: { verify }, execute });

    await expect(scoped.execute(input())).resolves.toEqual({
      status: 'completed',
      receiptId: 'receipt-1',
    });
    expect(verify).toHaveBeenCalledTimes(2);
    expect(verify.mock.calls[1]).toEqual(verify.mock.calls[0]);
  });

  it('does not return completed truth when authority expires during execution', async () => {
    const verify = vi
      .fn()
      .mockResolvedValueOnce(lease())
      .mockRejectedValueOnce(new Error('cao_target_lease_stale'));
    const execute = vi.fn().mockResolvedValue({ status: 'completed', receiptId: 'receipt-1' });
    const scoped = createCaoScheduledTargetExecution({ authority: { verify }, execute });

    await expect(scoped.execute(input())).rejects.toThrow('cao_target_lease_stale');
    expect(execute).toHaveBeenCalledOnce();
    expect(verify).toHaveBeenCalledTimes(2);
  });

  it('rejects revision drift in the recovered lease after completed execution', async () => {
    const verify = vi
      .fn()
      .mockResolvedValueOnce(lease())
      .mockResolvedValueOnce(
        lease({ targets: [{ kind: 'terminal', targetId: execution.targetId, revision: 8 }] }),
      );
    const execute = vi.fn().mockResolvedValue({ status: 'completed', receiptId: 'receipt-1' });
    const scoped = createCaoScheduledTargetExecution({ authority: { verify }, execute });

    await expect(scoped.execute(input())).rejects.toMatchObject({
      code: 'cao_learning_target_revision_stale',
    });
    expect(execute).toHaveBeenCalledOnce();
  });

  it('redacts unknown completion-time revalidation failures', async () => {
    const verify = vi
      .fn()
      .mockResolvedValueOnce(lease())
      .mockRejectedValueOnce(new Error('private completion registry payload'));
    const execute = vi.fn().mockResolvedValue({ status: 'completed', receiptId: 'receipt-1' });
    const scoped = createCaoScheduledTargetExecution({ authority: { verify }, execute });

    const failure = await scoped.execute(input()).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'cao_learning_target_authority_unavailable' });
    expect(String(failure)).not.toContain('private completion registry payload');
  });

  it('does not revalidate work that already failed or was cancelled', async () => {
    const verify = vi.fn().mockResolvedValue(lease());
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ status: 'failed' })
      .mockResolvedValueOnce({ status: 'cancelled' });
    const scoped = createCaoScheduledTargetExecution({ authority: { verify }, execute });

    await expect(scoped.execute(input())).resolves.toEqual({ status: 'failed' });
    await expect(scoped.execute(input())).resolves.toEqual({ status: 'cancelled' });
    expect(verify).toHaveBeenCalledTimes(2);
  });
});
