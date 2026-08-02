import { describe, expect, it, vi } from 'vitest';
import type {
  JarvisEvent,
  JarvisRecoveryApprovalVerifier,
  JarvisRun,
  JarvisRunStatus,
  JarvisTransportAttemptV1,
} from '@/lib/jarvis/contracts/execution';
import type { JarvisEventRepository, JarvisRunRepository } from '@/lib/db/jarvisRepositories';
import { createJarvisRecoveryScanner } from './recovery';

function run(status: JarvisRunStatus, input: Partial<JarvisRun> = {}): JarvisRun {
  return {
    id: 'jrun-a',
    accountId: 'account-a',
    source: 'typed_chat',
    status,
    agentId: 'agent-a',
    identityVersion: 1,
    profileRevisionId: 'profile-r1',
    model: { providerId: 'provider-a', modelId: 'model-a' },
    createdAt: 1,
    updatedAt: 2,
    ...input,
  } as JarvisRun;
}

function event(seq: number, input: Partial<JarvisEvent> = {}): JarvisEvent {
  return {
    runId: 'jrun-a',
    seq,
    idempotencyKey: `event-${seq}`,
    type: 'warning',
    title: 'Safe event',
    safeSummary: 'Safe summary.',
    sourceRefs: [],
    artifactIds: [],
    createdAt: seq,
    ...input,
  };
}

function retryableAttempt(): JarvisTransportAttemptV1 {
  const boundary = {
    schemaVersion: 1 as const,
    accountId: 'account-a',
    runId: 'jrun-a',
    requestId: 'request-a',
    attemptNumber: 1,
    providerId: 'provider-a',
    modelId: 'model-a',
    boundary: 'before_first_response_byte' as const,
    responseStarted: false as const,
    chunkCount: 0 as const,
    actionDispatchCount: 0 as const,
    failureCategory: 'network',
    evidenceRef: 'transport-a',
    verifiedAt: 10,
  };
  return {
    schemaVersion: 1,
    attemptNumber: 1,
    kind: 'initial',
    requestId: 'request-a',
    state: 'retryable_failed',
    startedEventSeq: 1,
    effectBarrier: { state: 'open', version: 0, updatedAt: 10 },
    createdAt: 1,
    updatedAt: 10,
    failureCategory: 'network',
    zeroEffectEvidence: {
      schemaVersion: 1,
      accountId: 'account-a',
      runId: 'jrun-a',
      requestId: 'request-a',
      attemptNumber: 1,
      assessedAt: 10,
      providerBoundary: boundary,
      effectBarrier: { state: 'open', version: 0 },
      approvals: { count: 0, evidenceRef: 'approvals-none' },
      artifacts: { count: 0, evidenceRef: 'artifacts-none' },
      executorClaims: { count: 0, throughSeq: 3, evidenceRef: 'claims-none' },
    },
  };
}

function fixture(runs: JarvisRun[], events: JarvisEvent[] = []) {
  const listByAccount = vi.fn(async () => structuredClone(runs));
  const listByRun = vi.fn(async () => structuredClone(events));
  return {
    runs: { listByAccount } as Pick<JarvisRunRepository, 'listByAccount'>,
    events: { listByRun } as Pick<JarvisEventRepository, 'listByRun'>,
    listByAccount,
    listByRun,
  };
}

describe('Jarvis recovery scanner', () => {
  it.each([
    [0, 1],
    [501, 500],
    [Number.MAX_SAFE_INTEGER, 500],
  ])(
    'clamps %s and scans only nonterminal runs with bounded event tails',
    async (requested, clamped) => {
      const repos = fixture([run('queued')]);
      const scanner = createJarvisRecoveryScanner(repos);
      await expect(
        scanner.scanAccount('account-a', {
          runLimit: requested,
          eventLimitPerRun: requested,
        }),
      ).resolves.toMatchObject([{ kind: 'fail_closed', reason: 'manual_retry_required' }]);

      expect(repos.listByAccount).toHaveBeenCalledWith('account-a', {
        statuses: ['queued', 'compiling', 'running', 'awaiting_approval'],
        limit: clamped,
      });
      expect(repos.listByRun).toHaveBeenCalledWith('account-a', 'jrun-a', { limit: clamped });
    },
  );

  it('returns await_approval only for one exact event and matching read-only authority', async () => {
    const approvalEvent = event(4, {
      idempotencyKey: 'japproval-a',
      type: 'approval',
      status: 'pending',
      title: 'Approval required',
      safeSummary: 'Review the registered action before it runs.',
    });
    const repos = fixture([run('awaiting_approval')], [event(3), approvalEvent]);
    const verifyPendingApproval = vi.fn(async () => ({
      valid: true as const,
      approvalId: 'japproval-a',
    }));
    const approvalVerifier: JarvisRecoveryApprovalVerifier = { verifyPendingApproval };
    const scanner = createJarvisRecoveryScanner({ ...repos, approvalVerifier });

    await expect(scanner.scanAccount('account-a')).resolves.toEqual([
      {
        kind: 'await_approval',
        run: run('awaiting_approval'),
        events: [event(3), approvalEvent],
        approvalId: 'japproval-a',
      },
    ]);
    expect(verifyPendingApproval).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['title', { title: 'Approval requested' }],
    ['summary', { safeSummary: 'Review before execution.' }],
  ] as const)('rejects altered closed-contract approval %s prose', async (_field, changed) => {
    const approvalEvent = event(4, {
      idempotencyKey: 'japproval-a',
      type: 'approval',
      status: 'pending',
      title: 'Approval required',
      safeSummary: 'Review the registered action before it runs.',
      ...changed,
    });
    const verifyPendingApproval = vi.fn(async () => ({
      valid: true as const,
      approvalId: 'japproval-a',
    }));
    const scanner = createJarvisRecoveryScanner({
      ...fixture([run('awaiting_approval')], [approvalEvent]),
      approvalVerifier: { verifyPendingApproval },
    });

    await expect(scanner.scanAccount('account-a')).resolves.toMatchObject([
      { kind: 'fail_closed', reason: 'approval_missing' },
    ]);
    expect(verifyPendingApproval).not.toHaveBeenCalled();
  });

  it('fails closed without authority and for duplicate or mismatched approval bindings', async () => {
    const approval = (seq: number, id: string) =>
      event(seq, {
        idempotencyKey: id,
        type: 'approval',
        status: 'pending',
        title: 'Approval required',
        safeSummary: 'Review the registered action before it runs.',
      });
    const missing = createJarvisRecoveryScanner(
      fixture([run('awaiting_approval')], [approval(1, 'japproval-a')]),
    );
    await expect(missing.scanAccount('account-a')).resolves.toMatchObject([
      { kind: 'fail_closed', reason: 'approval_missing' },
    ]);

    const verifyPendingApproval = vi.fn(async () => ({
      valid: true as const,
      approvalId: 'japproval-b',
    }));
    const duplicate = createJarvisRecoveryScanner({
      ...fixture(
        [run('awaiting_approval')],
        [approval(1, 'japproval-a'), approval(2, 'japproval-b')],
      ),
      approvalVerifier: { verifyPendingApproval },
    });
    await expect(duplicate.scanAccount('account-a')).resolves.toMatchObject([
      { kind: 'fail_closed', reason: 'approval_binding_mismatch' },
    ]);
    expect(verifyPendingApproval).not.toHaveBeenCalled();
  });

  it('distinguishes exact scheduled retry evidence from crash-time ambiguity', async () => {
    const retryable = run('running', {
      source: 'schedule',
      transportAttempts: [retryableAttempt()],
    });
    const inFlight = run('running', {
      id: 'jrun-b',
      source: 'schedule',
      transportAttempts: [
        {
          ...retryableAttempt(),
          requestId: 'request-b',
          state: 'provider_in_flight',
          failureCategory: undefined,
          zeroEffectEvidence: undefined,
        },
      ],
    });
    const scanner = createJarvisRecoveryScanner(fixture([retryable, inFlight]));
    await expect(scanner.scanAccount('account-a')).resolves.toMatchObject([
      { run: { id: 'jrun-a' }, reason: 'scheduled_transport_retry_available' },
      { run: { id: 'jrun-b' }, reason: 'ambiguous_executor_state' },
    ]);
  });

  it('rejects foreign zero-effect evidence and excludes every terminal status', async () => {
    const latest = retryableAttempt();
    const malformed = {
      ...latest,
      zeroEffectEvidence: { ...latest.zeroEffectEvidence!, accountId: 'account-foreign' },
    };
    const repos = fixture([run('running', { source: 'schedule', transportAttempts: [malformed] })]);
    await expect(
      createJarvisRecoveryScanner(repos).scanAccount('account-a'),
    ).resolves.toMatchObject([{ reason: 'manual_retry_required' }]);
    const call = repos.listByAccount.mock.calls[0] as unknown as [
      string,
      { statuses: JarvisRunStatus[] },
    ];
    expect(call[1].statuses).not.toEqual(
      expect.arrayContaining(['partial', 'completed', 'failed', 'cancelled', 'timed_out']),
    );
  });

  it('defensively ignores terminal rows returned by a nonconforming repository adapter', async () => {
    const repos = fixture([
      run('completed'),
      run('failed', { id: 'jrun-failed' }),
      run('queued', { id: 'jrun-queued' }),
    ]);
    const scanner = createJarvisRecoveryScanner(repos);

    await expect(scanner.scanAccount('account-a')).resolves.toEqual([
      {
        kind: 'fail_closed',
        run: run('queued', { id: 'jrun-queued' }),
        reason: 'manual_retry_required',
      },
    ]);
    expect(repos.listByRun).toHaveBeenCalledOnce();
    expect(repos.listByRun).toHaveBeenCalledWith('account-a', 'jrun-queued', { limit: 500 });
  });

  it('fails closed when the read-only approval verifier is unavailable at call time', async () => {
    const approvalEvent = event(4, {
      idempotencyKey: 'japproval-a',
      type: 'approval',
      status: 'pending',
      title: 'Approval required',
      safeSummary: 'Review the registered action before it runs.',
    });
    const repos = fixture([run('awaiting_approval')], [approvalEvent]);
    const approvalVerifier: JarvisRecoveryApprovalVerifier = {
      verifyPendingApproval: vi.fn(async () => {
        throw new Error('approval repository unavailable');
      }),
    };

    await expect(
      createJarvisRecoveryScanner({ ...repos, approvalVerifier }).scanAccount('account-a'),
    ).resolves.toMatchObject([{ kind: 'fail_closed', reason: 'approval_missing' }]);
  });

  it('rejects a scheduled retry whose stored failure category disagrees with its proof', async () => {
    const latest = retryableAttempt();
    const scanner = createJarvisRecoveryScanner(
      fixture([
        run('running', {
          source: 'schedule',
          transportAttempts: [{ ...latest, failureCategory: 'different_failure' }],
        }),
      ]),
    );

    await expect(scanner.scanAccount('account-a')).resolves.toMatchObject([
      { kind: 'fail_closed', reason: 'manual_retry_required' },
    ]);
  });
});
