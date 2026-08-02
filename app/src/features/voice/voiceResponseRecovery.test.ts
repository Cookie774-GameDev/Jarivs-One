import { describe, expect, it, vi } from 'vitest';

import type {
  JarvisRecoveryDecision,
  JarvisRecoveryScanner,
  JarvisRun,
  JarvisRunStatus,
} from '@/lib/jarvis/contracts/execution';
import { recoverVoiceResponses, type VoiceResponseRecoveryHandle } from './voiceResponseRecovery';

function run(
  id: string,
  status: JarvisRunStatus = 'running',
  source: JarvisRun['source'] = 'voice',
): JarvisRun {
  return {
    id,
    accountId: 'account-a',
    source,
    status,
    agentId: 'agent-a',
    identityVersion: 1,
    profileRevisionId: 'profile-a',
    model: {
      providerId: 'provider-a',
      modelId: 'model-a',
      connectionMode: 'native-api',
      capabilities: {},
      capturedAt: 1,
    },
    createdAt: 1,
    updatedAt: 1,
  };
}

function failClosed(
  id: string,
  reason: Extract<
    JarvisRecoveryDecision,
    { kind: 'fail_closed' }
  >['reason'] = 'manual_retry_required',
  status: JarvisRunStatus = 'running',
  source: JarvisRun['source'] = 'voice',
): JarvisRecoveryDecision {
  return { kind: 'fail_closed', run: run(id, status, source), reason };
}

function scanner(decisions: JarvisRecoveryDecision[]): Pick<JarvisRecoveryScanner, 'scanAccount'> {
  return { scanAccount: vi.fn(async () => decisions) };
}

function handle(committed: boolean = true) {
  const commitRecoveredPartial = vi.fn<VoiceResponseRecoveryHandle['commitRecoveredPartial']>(
    async (): ReturnType<VoiceResponseRecoveryHandle['commitRecoveredPartial']> => ({
      kind: 'committed' as const,
      value: { committed },
    }),
  );
  const dispose = vi.fn();
  const value: VoiceResponseRecoveryHandle = { commitRecoveredPartial, dispose };
  return { value, commitRecoveredPartial, dispose };
}

describe('recoverVoiceResponses', () => {
  it('opens, commits, and disposes one eligible voice decision exactly once', async () => {
    const issued = handle();
    const recoveryScanner = scanner([failClosed('voice-a')]);
    const openVoiceRecovery = vi.fn(async () => ({
      kind: 'committed' as const,
      value: issued.value,
    }));

    await expect(
      recoverVoiceResponses({
        accountId: 'account-a',
        scanner: recoveryScanner,
        openVoiceRecovery,
      }),
    ).resolves.toEqual({
      accountId: 'account-a',
      ignored: 0,
      revoked: 0,
      committed: 1,
      conflicts: 0,
    });

    expect(recoveryScanner.scanAccount).toHaveBeenCalledTimes(1);
    expect(recoveryScanner.scanAccount).toHaveBeenCalledWith('account-a');
    expect(openVoiceRecovery).toHaveBeenCalledTimes(1);
    expect(openVoiceRecovery).toHaveBeenCalledWith({ accountId: 'account-a', runId: 'voice-a' });
    expect(issued.commitRecoveredPartial).toHaveBeenCalledTimes(1);
    expect(issued.dispose).toHaveBeenCalledTimes(1);
  });

  it('truthfully reports a commit conflict and still disposes the handle', async () => {
    const issued = handle(false);

    await expect(
      recoverVoiceResponses({
        accountId: 'account-a',
        scanner: scanner([failClosed('voice-a')]),
        openVoiceRecovery: vi.fn(async () => ({
          kind: 'committed' as const,
          value: issued.value,
        })),
      }),
    ).resolves.toMatchObject({ committed: 0, conflicts: 1, revoked: 0 });

    expect(issued.commitRecoveredPartial).toHaveBeenCalledTimes(1);
    expect(issued.dispose).toHaveBeenCalledTimes(1);
  });

  it('preserves outer authority revocation without issuing a terminal commit', async () => {
    const issued = handle();
    const openVoiceRecovery = vi.fn(async () => ({
      kind: 'account_authority_revoked' as const,
    }));

    await expect(
      recoverVoiceResponses({
        accountId: 'account-a',
        scanner: scanner([failClosed('voice-a')]),
        openVoiceRecovery,
      }),
    ).resolves.toEqual({
      accountId: 'account-a',
      ignored: 0,
      revoked: 1,
      committed: 0,
      conflicts: 0,
    });

    expect(openVoiceRecovery).toHaveBeenCalledTimes(1);
    expect(issued.commitRecoveredPartial).not.toHaveBeenCalled();
    expect(issued.dispose).not.toHaveBeenCalled();
  });

  it('preserves authority revocation returned by the recovery terminal method', async () => {
    const issued = handle();
    issued.commitRecoveredPartial.mockResolvedValueOnce({
      kind: 'account_authority_revoked' as const,
    });

    await expect(
      recoverVoiceResponses({
        accountId: 'account-a',
        scanner: scanner([failClosed('voice-a')]),
        openVoiceRecovery: vi.fn(async () => ({
          kind: 'committed' as const,
          value: issued.value,
        })),
      }),
    ).resolves.toMatchObject({ committed: 0, conflicts: 0, revoked: 1 });

    expect(issued.dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes exactly once when commit rejects and propagates the failure', async () => {
    const issued = handle();
    issued.commitRecoveredPartial.mockRejectedValueOnce(new Error('commit unavailable'));

    await expect(
      recoverVoiceResponses({
        accountId: 'account-a',
        scanner: scanner([failClosed('voice-a')]),
        openVoiceRecovery: vi.fn(async () => ({
          kind: 'committed' as const,
          value: issued.value,
        })),
      }),
    ).rejects.toThrow('commit unavailable');

    expect(issued.commitRecoveredPartial).toHaveBeenCalledTimes(1);
    expect(issued.dispose).toHaveBeenCalledTimes(1);
  });

  it('attempts a later eligible decision after the first recovery open rejects', async () => {
    const openFailure = new Error('open unavailable');
    const later = handle();
    const openVoiceRecovery = vi
      .fn()
      .mockRejectedValueOnce(openFailure)
      .mockResolvedValueOnce({ kind: 'committed' as const, value: later.value });

    await expect(
      recoverVoiceResponses({
        accountId: 'account-a',
        scanner: scanner([failClosed('voice-a'), failClosed('voice-b')]),
        openVoiceRecovery,
      }),
    ).rejects.toBe(openFailure);

    expect(openVoiceRecovery.mock.calls).toEqual([
      [{ accountId: 'account-a', runId: 'voice-a' }],
      [{ accountId: 'account-a', runId: 'voice-b' }],
    ]);
    expect(later.commitRecoveredPartial).toHaveBeenCalledTimes(1);
    expect(later.dispose).toHaveBeenCalledTimes(1);
  });

  it('attempts a later eligible decision after the first commit rejects and disposes', async () => {
    const commitFailure = new Error('commit unavailable');
    const first = handle();
    first.commitRecoveredPartial.mockRejectedValueOnce(commitFailure);
    const later = handle();
    const openVoiceRecovery = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'committed' as const, value: first.value })
      .mockResolvedValueOnce({ kind: 'committed' as const, value: later.value });

    await expect(
      recoverVoiceResponses({
        accountId: 'account-a',
        scanner: scanner([failClosed('voice-a'), failClosed('voice-b')]),
        openVoiceRecovery,
      }),
    ).rejects.toBe(commitFailure);

    expect(openVoiceRecovery).toHaveBeenCalledTimes(2);
    expect(first.commitRecoveredPartial).toHaveBeenCalledTimes(1);
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(later.commitRecoveredPartial).toHaveBeenCalledTimes(1);
    expect(later.dispose).toHaveBeenCalledTimes(1);
  });

  it('aggregates multiple failures only after every eligible decision is attempted', async () => {
    const firstFailure = new Error('open unavailable');
    const secondFailure = new Error('commit unavailable');
    const second = handle();
    second.commitRecoveredPartial.mockRejectedValueOnce(secondFailure);
    const later = handle();
    const openVoiceRecovery = vi
      .fn()
      .mockRejectedValueOnce(firstFailure)
      .mockResolvedValueOnce({ kind: 'committed' as const, value: second.value })
      .mockResolvedValueOnce({ kind: 'committed' as const, value: later.value });

    const outcome = await recoverVoiceResponses({
      accountId: 'account-a',
      scanner: scanner([failClosed('voice-a'), failClosed('voice-b'), failClosed('voice-c')]),
      openVoiceRecovery,
    }).catch((error: unknown) => error);

    expect(outcome).toBeInstanceOf(AggregateError);
    expect(outcome).toMatchObject({
      message: 'voice_response_recovery_failed',
      errors: [firstFailure, secondFailure],
    });
    expect(openVoiceRecovery).toHaveBeenCalledTimes(3);
    expect(second.dispose).toHaveBeenCalledTimes(1);
    expect(later.commitRecoveredPartial).toHaveBeenCalledTimes(1);
    expect(later.dispose).toHaveBeenCalledTimes(1);
  });

  it('ignores terminal voice, non-voice, non-fail-closed, and ineligible reasons', async () => {
    const ignored: JarvisRecoveryDecision[] = [
      failClosed('terminal', 'manual_retry_required', 'completed'),
      failClosed('typed', 'manual_retry_required', 'running', 'typed_chat'),
      {
        kind: 'await_approval',
        run: run('approval'),
        events: [],
        approvalId: 'approval-a',
      },
      failClosed('approval-missing', 'approval_missing'),
      failClosed('scheduled', 'scheduled_transport_retry_available'),
    ];
    const openVoiceRecovery = vi.fn();

    await expect(
      recoverVoiceResponses({
        accountId: 'account-a',
        scanner: scanner(ignored),
        openVoiceRecovery,
      }),
    ).resolves.toEqual({
      accountId: 'account-a',
      ignored: ignored.length,
      revoked: 0,
      committed: 0,
      conflicts: 0,
    });

    expect(openVoiceRecovery).not.toHaveBeenCalled();
  });

  it('bounds multiple eligible decisions to one open and commit per scanner decision', async () => {
    const issuedA = handle();
    const issuedB = handle();
    const openVoiceRecovery = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'committed' as const, value: issuedA.value })
      .mockResolvedValueOnce({ kind: 'committed' as const, value: issuedB.value });

    await expect(
      recoverVoiceResponses({
        accountId: 'account-a',
        scanner: scanner([
          failClosed('voice-a', 'manual_retry_required'),
          failClosed('voice-b', 'ambiguous_executor_state'),
        ]),
        openVoiceRecovery,
      }),
    ).resolves.toMatchObject({ ignored: 0, revoked: 0, committed: 2, conflicts: 0 });

    expect(openVoiceRecovery).toHaveBeenCalledTimes(2);
    expect(openVoiceRecovery.mock.calls).toEqual([
      [{ accountId: 'account-a', runId: 'voice-a' }],
      [{ accountId: 'account-a', runId: 'voice-b' }],
    ]);
    expect(issuedA.commitRecoveredPartial).toHaveBeenCalledTimes(1);
    expect(issuedB.commitRecoveredPartial).toHaveBeenCalledTimes(1);
    expect(issuedA.dispose).toHaveBeenCalledTimes(1);
    expect(issuedB.dispose).toHaveBeenCalledTimes(1);
  });

  it('returns an immutable summary', async () => {
    const summary = await recoverVoiceResponses({
      accountId: 'account-a',
      scanner: scanner([]),
      openVoiceRecovery: vi.fn(),
    });

    expect(Object.isFrozen(summary)).toBe(true);
    expect(() => {
      (summary as { ignored: number }).ignored = 99;
    }).toThrow(TypeError);
    expect(summary.ignored).toBe(0);
  });
});
