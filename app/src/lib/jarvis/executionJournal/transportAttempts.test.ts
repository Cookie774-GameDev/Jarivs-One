import { afterEach, describe, expect, it, vi } from 'vitest';
import { createJarvisDb, type JarvisDexie } from '@/lib/db';
import { createJarvisRepositories } from '@/lib/db/jarvisRepositories';
import type {
  JarvisConsequentialEffectSafetyAuthority,
  JarvisPreEffectTransportFailureEvidence,
  JarvisRun,
  JarvisScheduledAttemptLease,
  JarvisTransportAttemptV1,
  JarvisZeroConsequentialEffectEvidenceV1,
} from '@/lib/jarvis/contracts/execution';
import {
  createDenyAllJarvisConsequentialEffectSafetyAuthority,
  createJarvisAttemptEffectBarrierAuthority,
  createJarvisTransportAttemptCoordinator,
  type JarvisTransportAttemptRepository,
} from './transportAttempts';
import { TEST_INDEXED_DB, uniqueTestDbName } from '@/test/indexedDb';

const openedDatabases: JarvisDexie[] = [];

afterEach(async () => {
  while (openedDatabases.length > 0) {
    const database = openedDatabases.pop();
    if (!database) continue;
    database.close();
    await database.delete();
  }
});

function run(input: Partial<JarvisRun> = {}): JarvisRun {
  return {
    id: 'jrun-a',
    accountId: 'account-a',
    source: 'schedule',
    status: 'queued',
    agentId: 'agent-a',
    identityVersion: 1,
    profileRevisionId: 'profile-r1',
    model: {
      connectionId: 'connection-a',
      providerId: 'provider-a',
      modelId: 'model-a',
      connectionMode: 'native-api',
      capabilities: { tools: true, vision: false },
      effectiveTemperature: 0.4,
      capturedAt: 1,
    },
    createdAt: 1,
    updatedAt: 1,
    ...input,
  } as JarvisRun;
}

function attempt(input: Partial<JarvisTransportAttemptV1> = {}): JarvisTransportAttemptV1 {
  return {
    schemaVersion: 1,
    attemptNumber: 1,
    kind: 'initial',
    requestId: 'request-a',
    state: 'provider_in_flight',
    startedEventSeq: 2,
    effectBarrier: { state: 'open', version: 0, updatedAt: 10 },
    createdAt: 10,
    updatedAt: 10,
    ...input,
  };
}

function failure(): JarvisPreEffectTransportFailureEvidence {
  return {
    schemaVersion: 1,
    accountId: 'account-a',
    runId: 'jrun-a',
    requestId: 'request-a',
    attemptNumber: 1,
    providerId: 'provider-a',
    modelId: 'model-a',
    boundary: 'before_first_response_byte',
    responseStarted: false,
    chunkCount: 0,
    actionDispatchCount: 0,
    failureCategory: 'network',
    evidenceRef: 'transport-a',
    verifiedAt: 12,
  };
}

function proof(input: Partial<JarvisZeroConsequentialEffectEvidenceV1> = {}) {
  return {
    schemaVersion: 1 as const,
    accountId: 'account-a',
    runId: 'jrun-a',
    requestId: 'request-a',
    attemptNumber: 1,
    assessedAt: 12,
    providerBoundary: failure(),
    effectBarrier: { state: 'open' as const, version: 0 as const },
    approvals: { count: 0 as const, evidenceRef: 'approvals-none' },
    artifacts: { count: 0 as const, evidenceRef: 'artifacts-none' },
    executorClaims: { count: 0 as const, throughSeq: 3, evidenceRef: 'claims-none' },
    ...input,
  } satisfies JarvisZeroConsequentialEffectEvidenceV1;
}

function repository(initial: JarvisRun) {
  let current = structuredClone(initial);
  const getById = vi.fn(async () => structuredClone(current));
  const compareAndMutateTransportAttempt = vi.fn(
    async (
      input: Parameters<JarvisTransportAttemptRepository['compareAndMutateTransportAttempt']>[0],
    ): Promise<
      Awaited<ReturnType<JarvisTransportAttemptRepository['compareAndMutateTransportAttempt']>>
    > => {
      if (input.kind === 'begin_initial') {
        current = {
          ...current,
          status: 'running',
          updatedAt: input.updatedAt,
          transportAttempts: [{ ...input.attempt, startedEventSeq: 2 }],
        } as JarvisRun;
      } else if (input.kind === 'begin_retry') {
        const previous = current.transportAttempts!.at(-1)!;
        current = {
          ...current,
          transportAttempts: [
            ...current.transportAttempts!.slice(0, -1),
            {
              ...previous,
              effectBarrier: {
                ...previous.effectBarrier,
                state: 'sealed_for_retry',
                updatedAt: input.updatedAt,
              },
            },
            { ...input.attempt, startedEventSeq: input.expectedEventTailSeq + 1 },
          ],
          updatedAt: input.updatedAt,
        } as JarvisRun;
      } else if (input.kind === 'settle_retryable') {
        const latest = current.transportAttempts!.at(-1)!;
        current = {
          ...current,
          transportAttempts: [
            ...current.transportAttempts!.slice(0, -1),
            {
              ...latest,
              state: 'retryable_failed',
              failureCategory: input.providerFailure.failureCategory,
              zeroEffectEvidence: input.zeroEffectEvidence,
            },
          ],
        } as JarvisRun;
      } else {
        current = { ...current, status: 'failed', completedAt: input.completedAt } as JarvisRun;
      }
      return {
        applied: true as const,
        run: structuredClone(current),
        event: {
          runId: current.id,
          seq: 2,
          idempotencyKey: `transport:${input.kind}`,
          type:
            input.kind === 'begin_retry' || input.kind === 'settle_retryable'
              ? ('warning' as const)
              : ('run_state' as const),
          status: current.status,
          title: 'Transport attempt recorded',
          safeSummary: 'Transport state changed.',
          sourceRefs: [],
          artifactIds: [],
          createdAt: input.updatedAt,
        },
      };
    },
  );
  const claimAttemptEffect = vi.fn();
  return {
    adapter: { getById, compareAndMutateTransportAttempt, claimAttemptEffect },
    compareAndMutateTransportAttempt,
    claimAttemptEffect,
    set(value: JarvisRun) {
      current = structuredClone(value);
    },
  };
}

describe('Jarvis transport attempt coordinator', () => {
  it('atomically begins an initial attempt before issuing a current uncloneable lease', async () => {
    const repo = repository(run());
    const coordinator = createJarvisTransportAttemptCoordinator({ repository: repo.adapter });
    const lease = await coordinator.beginInitialScheduledAttempt({
      accountId: 'account-a',
      runId: 'jrun-a',
      requestId: 'request-a',
      createdAt: 10,
    });
    expect(repo.compareAndMutateTransportAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'begin_initial',
        expectedStatus: 'queued',
        attempt: expect.objectContaining({ attemptNumber: 1, state: 'provider_in_flight' }),
      }),
    );
    await expect(coordinator.verifyLease(lease)).resolves.toMatchObject({ status: 'running' });
    await expect(
      coordinator.verifyLease(structuredClone(lease) as JarvisScheduledAttemptLease),
    ).rejects.toThrow('transport_attempt_invalid_lease');
  });

  it('revalidates exact zero-effect evidence and starts a same-running-run retry', async () => {
    const prior = {
      ...attempt({ state: 'retryable_failed', failureCategory: 'network' }),
      zeroEffectEvidence: proof(),
    };
    const repo = repository(run({ status: 'running', transportAttempts: [prior] }));
    const safety: JarvisConsequentialEffectSafetyAuthority = {
      proveZeroConsequentialEffect: vi.fn(async () => null),
      revalidateZeroConsequentialEffect: vi.fn(async () => structuredClone(proof())),
    };
    const coordinator = createJarvisTransportAttemptCoordinator({
      repository: repo.adapter,
      safetyAuthority: safety,
    });
    const lease = await coordinator.beginScheduledTransportRetry({
      accountId: 'account-a',
      runId: 'jrun-a',
      previousAttemptNumber: 1,
      requestId: 'request-b',
      createdAt: 20,
      revalidatedEvidence: proof(),
    });
    expect(repo.compareAndMutateTransportAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'begin_retry',
        expectedStatus: 'running',
        expectedEventTailSeq: 4,
      }),
    );
    await expect(coordinator.verifyLease(lease)).resolves.toMatchObject({
      status: 'running',
      transportAttempts: [
        { effectBarrier: { state: 'sealed_for_retry' } },
        { state: 'provider_in_flight', requestId: 'request-b' },
      ],
    });
  });

  it('begins a settled retry through the real repository retry-available bridge', async () => {
    const database = createJarvisDb(
      uniqueTestDbName('jarvis-transport-coordinator-retry'),
      TEST_INDEXED_DB,
    );
    openedDatabases.push(database);
    await database.open();
    const repositories = createJarvisRepositories(database);
    await repositories.run.createIdempotent(run());
    const bridgeProof = proof({
      executorClaims: { count: 0, throughSeq: 1, evidenceRef: 'claims-none' },
    });
    const safety: JarvisConsequentialEffectSafetyAuthority = {
      proveZeroConsequentialEffect: vi.fn(async () => structuredClone(bridgeProof)),
      revalidateZeroConsequentialEffect: vi.fn(async () => structuredClone(bridgeProof)),
    };
    const coordinator = createJarvisTransportAttemptCoordinator({
      repository: repositories.run,
      safetyAuthority: safety,
    });
    const initialLease = await coordinator.beginInitialScheduledAttempt({
      accountId: 'account-a',
      runId: 'jrun-a',
      requestId: 'request-a',
      createdAt: 10,
    });
    await expect(
      coordinator.settleScheduledTransportFailure({
        lease: initialLease,
        providerFailure: failure(),
        zeroEffectEvidence: bridgeProof,
        settledAt: 12,
      }),
    ).resolves.toMatchObject({ kind: 'retryable' });

    await expect(
      coordinator.beginScheduledTransportRetry({
        accountId: 'account-a',
        runId: 'jrun-a',
        previousAttemptNumber: 1,
        requestId: 'request-b',
        createdAt: 20,
        revalidatedEvidence: bridgeProof,
      }),
    ).resolves.toMatchObject({ attemptNumber: 2, requestId: 'request-b' });
  });

  it('settles exact authority proof as retryable and deny-all proof as terminal failed', async () => {
    const repo = repository(run());
    const safety: JarvisConsequentialEffectSafetyAuthority = {
      proveZeroConsequentialEffect: vi.fn(async () => structuredClone(proof())),
      revalidateZeroConsequentialEffect: vi.fn(async () => structuredClone(proof())),
    };
    const coordinator = createJarvisTransportAttemptCoordinator({
      repository: repo.adapter,
      safetyAuthority: safety,
    });
    const lease = await coordinator.beginInitialScheduledAttempt({
      accountId: 'account-a',
      runId: 'jrun-a',
      requestId: 'request-a',
      createdAt: 10,
    });
    await expect(
      coordinator.settleScheduledTransportFailure({
        lease,
        providerFailure: failure(),
        zeroEffectEvidence: proof(),
        settledAt: 12,
      }),
    ).resolves.toMatchObject({ kind: 'retryable', run: { status: 'running' } });

    const deniedRepo = repository(run());
    const denied = createJarvisTransportAttemptCoordinator({ repository: deniedRepo.adapter });
    const deniedLease = await denied.beginInitialScheduledAttempt({
      accountId: 'account-a',
      runId: 'jrun-a',
      requestId: 'request-a',
      createdAt: 10,
    });
    await expect(
      denied.settleScheduledTransportFailure({
        lease: deniedLease,
        providerFailure: failure(),
        zeroEffectEvidence: proof(),
        settledAt: 12,
      }),
    ).resolves.toMatchObject({ kind: 'terminal_failed', run: { status: 'failed' } });
  });

  it('terminalizes when an effect claim dirties the barrier before retryable settlement wins', async () => {
    const repo = repository(run());
    const safety: JarvisConsequentialEffectSafetyAuthority = {
      proveZeroConsequentialEffect: vi.fn(async () => structuredClone(proof())),
      revalidateZeroConsequentialEffect: vi.fn(async () => structuredClone(proof())),
    };
    const coordinator = createJarvisTransportAttemptCoordinator({
      repository: repo.adapter,
      safetyAuthority: safety,
    });
    const lease = await coordinator.beginInitialScheduledAttempt({
      accountId: 'account-a',
      runId: 'jrun-a',
      requestId: 'request-a',
      createdAt: 10,
    });
    repo.compareAndMutateTransportAttempt.mockResolvedValueOnce({
      applied: false,
      current: run({
        status: 'running',
        transportAttempts: [
          attempt({ effectBarrier: { state: 'dirty', version: 1, updatedAt: 11 } }),
        ],
      }),
      reason: 'attempt_conflict',
    });

    await expect(
      coordinator.settleScheduledTransportFailure({
        lease,
        providerFailure: failure(),
        zeroEffectEvidence: proof(),
        settledAt: 12,
      }),
    ).resolves.toMatchObject({ kind: 'terminal_failed', run: { status: 'failed' } });
    expect(repo.compareAndMutateTransportAttempt).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'settle_uncertain_failed' }),
    );
  });

  it('terminalizes when the zero-effect safety authority cannot prove the attempt', async () => {
    const repo = repository(run());
    const safety: JarvisConsequentialEffectSafetyAuthority = {
      proveZeroConsequentialEffect: vi.fn(async () => {
        throw new Error('safety authority unavailable');
      }),
      revalidateZeroConsequentialEffect: vi.fn(async () => null),
    };
    const coordinator = createJarvisTransportAttemptCoordinator({
      repository: repo.adapter,
      safetyAuthority: safety,
    });
    const lease = await coordinator.beginInitialScheduledAttempt({
      accountId: 'account-a',
      runId: 'jrun-a',
      requestId: 'request-a',
      createdAt: 10,
    });

    await expect(
      coordinator.settleScheduledTransportFailure({
        lease,
        providerFailure: failure(),
        zeroEffectEvidence: proof(),
        settledAt: 12,
      }),
    ).resolves.toMatchObject({ kind: 'terminal_failed', run: { status: 'failed' } });
    expect(repo.compareAndMutateTransportAttempt).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'settle_uncertain_failed' }),
    );
  });

  it('caps attempt history and delegates effect-barrier claims to one repository CAS', async () => {
    const capped = Array.from({ length: 32 }, (_, index) =>
      attempt({
        attemptNumber: index + 1,
        requestId: `request-${index + 1}`,
        state: index === 31 ? 'retryable_failed' : 'completed',
      }),
    );
    const repo = repository(run({ status: 'running', transportAttempts: capped }));
    const coordinator = createJarvisTransportAttemptCoordinator({ repository: repo.adapter });
    await expect(
      coordinator.beginScheduledTransportRetry({
        accountId: 'account-a',
        runId: 'jrun-a',
        previousAttemptNumber: 32,
        requestId: 'request-33',
        createdAt: 30,
        revalidatedEvidence: proof({ attemptNumber: 32, requestId: 'request-32' }),
      }),
    ).rejects.toThrow('transport_attempt_limit');

    const claimResult = {
      applied: false as const,
      reason: 'attempt_sealed' as const,
      current: run({ status: 'running' }),
    };
    repo.claimAttemptEffect.mockResolvedValue(claimResult);
    const authority = createJarvisAttemptEffectBarrierAuthority(repo.adapter);
    await expect(
      authority.claim({
        accountId: 'account-a',
        runId: 'jrun-a',
        requestId: 'request-a',
        attemptNumber: 1,
        ownerKind: 'action',
        ownerId: 'action-a',
        evidenceRef: 'effect-a',
        claimedAt: 12,
      }),
    ).resolves.toEqual(claimResult);
    expect(createDenyAllJarvisConsequentialEffectSafetyAuthority()).toBeDefined();
  });
});
