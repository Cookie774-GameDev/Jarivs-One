import { describe, expect, it, vi } from 'vitest';

import type { JarvisApprovalV1, JarvisRecoveryDecision, JarvisRun } from '@/lib/jarvis/contracts';
import { presentCanonicalJarvisRecovery, resumeRecoverableJarvisRuns } from './recoveryExecutor';

function run(overrides: Partial<JarvisRun> = {}): JarvisRun {
  return {
    id: 'jrun_1',
    accountId: 'account-a',
    source: 'typed_chat',
    status: 'awaiting_approval',
    agentId: 'jarvis',
    identityVersion: 1,
    profileRevisionId: 'profile-1',
    model: {
      providerId: 'test',
      modelId: 'test-model',
      connectionMode: 'local',
      capabilities: {},
      capturedAt: 1,
    },
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

function approval(overrides: Partial<JarvisApprovalV1> = {}): JarvisApprovalV1 {
  return {
    id: 'jappr_1',
    schemaVersion: 1,
    runId: 'jrun_1',
    requestId: 'request-1',
    attemptNumber: 1,
    actionId: 'notes.create',
    actionVersion: 1,
    params: { title: 'Hello' },
    secretHandleRefs: [{ field: 'token', handleId: 'jsecret_private' }],
    paramsHash: 'params-hash',
    targetSnapshot: { kind: 'app_resource', namespace: 'notes', resourceId: 'hello' },
    risk: 'confirm',
    status: 'pending',
    capabilityId: 'notes.write',
    capabilitySnapshotHash: 'capability-hash',
    expectedEffect: 'Create the approved note.',
    expiresAt: 20_000,
    createdAt: 10_000,
    ...overrides,
  };
}

describe('canonical JARVIS recovery presentation adapter', () => {
  it('re-presents only the exact canonical pending approval and makes fail-closed manual-only', () => {
    const parentRun = run();
    const pending = approval();

    expect(
      presentCanonicalJarvisRecovery(
        { kind: 'await_approval', run: parentRun, events: [], approvalId: 'jappr_1' },
        pending,
      ),
    ).toEqual({
      kind: 'await_approval',
      runId: 'jrun_1',
      callId: 'jarvisapproval:jappr_1',
      presentation: {
        actionId: 'notes.create',
        expectedEffect: 'Create the approved note.',
        risk: 'confirm',
        parameters: [{ field: 'title', safeValue: 'Hello' }],
      },
    });
    expect(
      presentCanonicalJarvisRecovery(
        { kind: 'await_approval', run: parentRun, events: [], approvalId: 'jappr_other' },
        pending,
      ),
    ).toEqual({
      kind: 'manual_retry_required',
      runId: 'jrun_1',
      message: 'This task could not be recovered safely. Review it and retry manually.',
    });
  });

  it('consumes only bounded scanner decisions and never receives an executor', async () => {
    const parentRun = run();
    const decisions: JarvisRecoveryDecision[] = [
      { kind: 'await_approval', run: parentRun, events: [], approvalId: 'jappr_1' },
      { kind: 'fail_closed', run: run({ id: 'jrun_2' }), reason: 'manual_retry_required' },
    ];
    const scanner = { scanAccount: vi.fn(async () => decisions) };
    const approvals = { getById: vi.fn(async () => approval()) };
    const onPresentation = vi.fn(async () => undefined);

    await expect(
      resumeRecoverableJarvisRuns({
        accountId: 'account-a',
        scanner,
        approvals,
        onPresentation,
        runLimit: 12,
        eventLimitPerRun: 34,
      }),
    ).resolves.toBe(2);

    expect(scanner.scanAccount).toHaveBeenCalledWith('account-a', {
      runLimit: 12,
      eventLimitPerRun: 34,
    });
    expect(approvals.getById).toHaveBeenCalledWith('account-a', 'jappr_1');
    expect(onPresentation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ kind: 'await_approval', callId: 'jarvisapproval:jappr_1' }),
    );
    expect(onPresentation).toHaveBeenNthCalledWith(2, {
      kind: 'manual_retry_required',
      runId: 'jrun_2',
      message: 'This task could not be recovered safely. Review it and retry manually.',
    });
  });

  it('is inert without canonical wiring and stops after account invalidation', async () => {
    await expect(resumeRecoverableJarvisRuns()).resolves.toBe(0);

    const scanner = {
      scanAccount: vi.fn(
        async (): Promise<JarvisRecoveryDecision[]> => [
          { kind: 'fail_closed', run: run(), reason: 'manual_retry_required' },
        ],
      ),
    };
    const approvals = { getById: vi.fn() };
    const onPresentation = vi.fn();
    await expect(
      resumeRecoverableJarvisRuns({
        accountId: 'account-a',
        scanner,
        approvals,
        onPresentation,
        isCurrent: () => false,
      }),
    ).resolves.toBe(0);
    expect(scanner.scanAccount).not.toHaveBeenCalled();
    expect(approvals.getById).not.toHaveBeenCalled();
    expect(onPresentation).not.toHaveBeenCalled();
  });
});
