import type {
  JarvisAttemptEffectBarrierAuthority,
  JarvisAttemptEffectClaimInput,
  JarvisAttemptEffectClaimResult,
  JarvisConsequentialEffectSafetyAuthority,
  JarvisEvent,
  JarvisPreEffectTransportFailureEvidence,
  JarvisRun,
  JarvisScheduledAttemptLease,
  JarvisScheduledRetrySnapshotV1,
  JarvisTransportAttemptCoordinator,
  JarvisTransportAttemptV1,
  JarvisZeroConsequentialEffectEvidenceV1,
} from '@/lib/jarvis/contracts/execution';

export type JarvisTransportAttemptMutationInput =
  | {
      kind: 'begin_initial';
      accountId: string;
      runId: string;
      expectedStatus: 'queued';
      snapshot: Readonly<JarvisScheduledRetrySnapshotV1>;
      attempt: Omit<JarvisTransportAttemptV1, 'startedEventSeq'>;
      updatedAt: number;
    }
  | {
      kind: 'begin_retry';
      accountId: string;
      runId: string;
      expectedStatus: 'running';
      expectedSnapshot: Readonly<JarvisScheduledRetrySnapshotV1>;
      expectedLatestAttemptNumber: number;
      expectedBarrierVersion: 0;
      expectedEventTailSeq: number;
      revalidatedEvidence: JarvisZeroConsequentialEffectEvidenceV1;
      attempt: Omit<JarvisTransportAttemptV1, 'startedEventSeq'>;
      updatedAt: number;
    }
  | {
      kind: 'settle_retryable';
      accountId: string;
      runId: string;
      expectedStatus: 'running';
      expectedSnapshot: Readonly<JarvisScheduledRetrySnapshotV1>;
      expectedAttemptNumber: number;
      expectedBarrierVersion: 0;
      expectedEventTailSeq: number;
      providerFailure: JarvisPreEffectTransportFailureEvidence;
      zeroEffectEvidence: JarvisZeroConsequentialEffectEvidenceV1;
      updatedAt: number;
    }
  | {
      kind: 'settle_uncertain_failed';
      accountId: string;
      runId: string;
      expectedStatus: 'running';
      expectedSnapshot: Readonly<JarvisScheduledRetrySnapshotV1>;
      expectedAttemptNumber: number;
      providerFailure: JarvisPreEffectTransportFailureEvidence;
      updatedAt: number;
      completedAt: number;
    };

export interface JarvisTransportAttemptRepository {
  getById(accountId: string, runId: string): Promise<JarvisRun | undefined>;
  compareAndMutateTransportAttempt(input: JarvisTransportAttemptMutationInput): Promise<
    | { applied: true; run: JarvisRun; event: JarvisEvent }
    | {
        applied: false;
        current: JarvisRun;
        reason: 'status_conflict' | 'attempt_conflict';
      }
  >;
  claimAttemptEffect(input: JarvisAttemptEffectClaimInput): Promise<JarvisAttemptEffectClaimResult>;
}

export type JarvisTransportAttemptErrorCode =
  | 'transport_attempt_invalid_input'
  | 'transport_attempt_run_missing'
  | 'transport_attempt_conflict'
  | 'transport_attempt_invalid_lease'
  | 'transport_attempt_limit'
  | 'transport_attempt_safety_denied';

export class JarvisTransportAttemptError extends Error {
  readonly code: JarvisTransportAttemptErrorCode;

  constructor(code: JarvisTransportAttemptErrorCode) {
    super(code);
    this.name = 'JarvisTransportAttemptError';
    this.code = code;
  }
}

function fail(code: JarvisTransportAttemptErrorCode): never {
  throw new JarvisTransportAttemptError(code);
}

function exactEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => exactEqual(value, right[index]))
    );
  }
  if (typeof left !== 'object' || typeof right !== 'object') return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) => key === rightKeys[index] && exactEqual(leftRecord[key], rightRecord[key]),
    )
  );
}

function snapshotMatchesRun(
  snapshot: unknown,
  run: Readonly<JarvisRun>,
): snapshot is Readonly<JarvisScheduledRetrySnapshotV1> {
  if (!snapshot || typeof snapshot !== 'object') return false;
  const value = snapshot as Partial<JarvisScheduledRetrySnapshotV1>;
  const request = value.request;
  return (
    !!request &&
    value.accountId === run.accountId &&
    request.accountId === run.accountId &&
    request.runId === run.id &&
    request.surface === 'schedule' &&
    request.workspaceId === run.workspaceId &&
    request.projectId === run.projectId &&
    request.chatId === run.chatId &&
    request.parentRunId === run.parentRunId &&
    request.agent?.id === run.agentId &&
    request.identity?.identityVersion === run.identityVersion &&
    request.profile?.revisionId === run.profileRevisionId &&
    exactEqual(request.model, run.model)
  );
}

function assertIdentifier(value: string): void {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    fail('transport_attempt_invalid_input');
  }
}

function assertTime(value: number): void {
  if (!Number.isFinite(value) || value < 0) fail('transport_attempt_invalid_input');
}

function requireCurrentAttempt(
  run: Readonly<JarvisRun>,
  attemptNumber: number,
  requestId: string,
): Readonly<JarvisTransportAttemptV1> {
  const attempt = run.transportAttempts?.at(-1);
  if (
    run.status !== 'running' ||
    run.source !== 'schedule' ||
    !attempt ||
    attempt.state !== 'provider_in_flight' ||
    attempt.attemptNumber !== attemptNumber ||
    attempt.requestId !== requestId
  ) {
    fail('transport_attempt_invalid_lease');
  }
  return attempt;
}

function requireExactSnapshot(
  run: Readonly<JarvisRun>,
  expectedSnapshot: Readonly<JarvisScheduledRetrySnapshotV1>,
): void {
  const persisted = run.scheduledRetrySnapshot;
  if (!snapshotMatchesRun(persisted, run) || !exactEqual(persisted, expectedSnapshot)) {
    fail('transport_attempt_conflict');
  }
}

function failureMatches(
  run: Readonly<JarvisRun>,
  attempt: Readonly<JarvisTransportAttemptV1>,
  failure: Readonly<JarvisPreEffectTransportFailureEvidence>,
): boolean {
  return (
    failure.schemaVersion === 1 &&
    failure.accountId === run.accountId &&
    failure.runId === run.id &&
    failure.requestId === attempt.requestId &&
    failure.attemptNumber === attempt.attemptNumber &&
    failure.providerId === run.model.providerId &&
    failure.modelId === run.model.modelId &&
    failure.boundary === 'before_first_response_byte' &&
    failure.responseStarted === false &&
    failure.chunkCount === 0 &&
    failure.actionDispatchCount === 0 &&
    failure.failureCategory.trim().length > 0 &&
    failure.evidenceRef.trim().length > 0 &&
    Number.isFinite(failure.verifiedAt)
  );
}

function zeroEffectMatches(
  run: Readonly<JarvisRun>,
  attempt: Readonly<JarvisTransportAttemptV1>,
  evidence: Readonly<JarvisZeroConsequentialEffectEvidenceV1>,
): boolean {
  return (
    evidence.schemaVersion === 1 &&
    evidence.accountId === run.accountId &&
    evidence.runId === run.id &&
    evidence.requestId === attempt.requestId &&
    evidence.attemptNumber === attempt.attemptNumber &&
    Number.isFinite(evidence.assessedAt) &&
    failureMatches(run, attempt, evidence.providerBoundary) &&
    evidence.effectBarrier.state === 'open' &&
    evidence.effectBarrier.version === 0 &&
    evidence.approvals.count === 0 &&
    evidence.approvals.evidenceRef.trim().length > 0 &&
    evidence.artifacts.count === 0 &&
    evidence.artifacts.evidenceRef.trim().length > 0 &&
    evidence.executorClaims.count === 0 &&
    Number.isSafeInteger(evidence.executorClaims.throughSeq) &&
    evidence.executorClaims.throughSeq >= attempt.startedEventSeq &&
    evidence.executorClaims.evidenceRef.trim().length > 0
  );
}

function zeroEffectExtends(
  run: Readonly<JarvisRun>,
  attempt: Readonly<JarvisTransportAttemptV1>,
  previous: Readonly<JarvisZeroConsequentialEffectEvidenceV1>,
  candidate: Readonly<JarvisZeroConsequentialEffectEvidenceV1>,
): boolean {
  return (
    zeroEffectMatches(run, attempt, previous) &&
    zeroEffectMatches(run, attempt, candidate) &&
    exactEqual(candidate.providerBoundary, previous.providerBoundary) &&
    exactEqual(candidate.effectBarrier, previous.effectBarrier) &&
    exactEqual(candidate.approvals, previous.approvals) &&
    exactEqual(candidate.artifacts, previous.artifacts) &&
    candidate.executorClaims.throughSeq >= previous.executorClaims.throughSeq
  );
}

export function createDenyAllJarvisConsequentialEffectSafetyAuthority(): JarvisConsequentialEffectSafetyAuthority {
  return {
    async proveZeroConsequentialEffect() {
      return null;
    },
    async revalidateZeroConsequentialEffect() {
      return null;
    },
  };
}

export function createJarvisAttemptEffectBarrierAuthority(
  repository: Pick<JarvisTransportAttemptRepository, 'claimAttemptEffect'>,
): JarvisAttemptEffectBarrierAuthority {
  return {
    claim(input) {
      return repository.claimAttemptEffect(structuredClone(input));
    },
  };
}

export function createJarvisTransportAttemptCoordinator(input: {
  repository: JarvisTransportAttemptRepository;
  safetyAuthority?: JarvisConsequentialEffectSafetyAuthority;
}): JarvisTransportAttemptCoordinator {
  const safetyAuthority =
    input.safetyAuthority ?? createDenyAllJarvisConsequentialEffectSafetyAuthority();
  const issuedLeases = new WeakSet<object>();

  function issueLease(
    accountId: string,
    runId: string,
    attemptValue: Readonly<JarvisTransportAttemptV1>,
  ): JarvisScheduledAttemptLease {
    const lease = Object.freeze({
      accountId,
      runId,
      attemptNumber: attemptValue.attemptNumber,
      requestId: attemptValue.requestId,
      kind: attemptValue.kind,
    }) as JarvisScheduledAttemptLease;
    issuedLeases.add(lease);
    return lease;
  }

  async function currentRun(accountId: string, runId: string): Promise<JarvisRun> {
    const run = await input.repository.getById(accountId, runId);
    if (!run) fail('transport_attempt_run_missing');
    return run;
  }

  async function applyMutation(mutation: JarvisTransportAttemptMutationInput): Promise<JarvisRun> {
    const result = await input.repository.compareAndMutateTransportAttempt(mutation);
    if (!result.applied) fail('transport_attempt_conflict');
    return result.run;
  }

  const coordinator: JarvisTransportAttemptCoordinator = {
    async beginInitialScheduledAttempt(begin) {
      assertIdentifier(begin.accountId);
      assertIdentifier(begin.runId);
      assertIdentifier(begin.requestId);
      assertTime(begin.createdAt);
      const expectedSnapshot = structuredClone(begin.snapshot);
      if (!expectedSnapshot || typeof expectedSnapshot !== 'object') {
        fail('transport_attempt_conflict');
      }
      const current = await currentRun(begin.accountId, begin.runId);
      if (
        current.status !== 'queued' ||
        current.source !== 'schedule' ||
        current.scheduledRetrySnapshot !== undefined ||
        !snapshotMatchesRun(expectedSnapshot, current) ||
        (current.transportAttempts?.length ?? 0) !== 0
      ) {
        fail('transport_attempt_conflict');
      }
      const attemptValue: Omit<JarvisTransportAttemptV1, 'startedEventSeq'> = {
        schemaVersion: 1,
        attemptNumber: 1,
        kind: 'initial',
        requestId: begin.requestId,
        state: 'provider_in_flight',
        effectBarrier: { state: 'open', version: 0, updatedAt: begin.createdAt },
        createdAt: begin.createdAt,
        updatedAt: begin.createdAt,
      };
      const updated = await applyMutation({
        kind: 'begin_initial',
        accountId: begin.accountId,
        runId: begin.runId,
        expectedStatus: 'queued',
        snapshot: expectedSnapshot,
        attempt: attemptValue,
        updatedAt: begin.createdAt,
      });
      const persisted = requireCurrentAttempt(updated, 1, begin.requestId);
      requireExactSnapshot(updated, expectedSnapshot);
      return issueLease(begin.accountId, begin.runId, persisted);
    },

    async beginScheduledTransportRetry(begin) {
      assertIdentifier(begin.accountId);
      assertIdentifier(begin.runId);
      assertIdentifier(begin.requestId);
      assertTime(begin.createdAt);
      const expectedSnapshot = structuredClone(begin.expectedSnapshot);
      const current = await currentRun(begin.accountId, begin.runId);
      requireExactSnapshot(current, expectedSnapshot);
      const attempts = current.transportAttempts;
      if (!attempts || attempts.length === 0) fail('transport_attempt_conflict');
      if (attempts.length >= 32) fail('transport_attempt_limit');
      const previous = attempts.at(-1)!;
      if (
        current.status !== 'running' ||
        current.source !== 'schedule' ||
        previous.state !== 'retryable_failed' ||
        previous.attemptNumber !== begin.previousAttemptNumber ||
        previous.effectBarrier.state !== 'open' ||
        previous.effectBarrier.version !== 0 ||
        !previous.zeroEffectEvidence ||
        attempts.some((attempt) => attempt.requestId === begin.requestId) ||
        !zeroEffectMatches(current, previous, begin.revalidatedEvidence) ||
        !zeroEffectExtends(
          current,
          previous,
          previous.zeroEffectEvidence,
          begin.revalidatedEvidence,
        )
      ) {
        fail('transport_attempt_conflict');
      }
      const revalidated = await safetyAuthority.revalidateZeroConsequentialEffect({
        run: current,
        attempt: previous,
        evidence: begin.revalidatedEvidence,
      });
      if (
        !revalidated ||
        !zeroEffectExtends(current, previous, previous.zeroEffectEvidence, revalidated) ||
        !zeroEffectExtends(current, previous, begin.revalidatedEvidence, revalidated)
      ) {
        fail('transport_attempt_safety_denied');
      }
      const attemptValue: Omit<JarvisTransportAttemptV1, 'startedEventSeq'> = {
        schemaVersion: 1,
        attemptNumber: previous.attemptNumber + 1,
        kind: 'transport_retry',
        requestId: begin.requestId,
        state: 'provider_in_flight',
        effectBarrier: { state: 'open', version: 0, updatedAt: begin.createdAt },
        createdAt: begin.createdAt,
        updatedAt: begin.createdAt,
      };
      const updated = await applyMutation({
        kind: 'begin_retry',
        accountId: begin.accountId,
        runId: begin.runId,
        expectedStatus: 'running',
        expectedSnapshot,
        expectedLatestAttemptNumber: previous.attemptNumber,
        expectedBarrierVersion: 0,
        expectedEventTailSeq: revalidated.executorClaims.throughSeq,
        revalidatedEvidence: structuredClone(revalidated),
        attempt: attemptValue,
        updatedAt: begin.createdAt,
      });
      const persisted = requireCurrentAttempt(updated, attemptValue.attemptNumber, begin.requestId);
      requireExactSnapshot(updated, expectedSnapshot);
      return issueLease(begin.accountId, begin.runId, persisted);
    },

    async verifyLease(lease, expectedSnapshot) {
      if (!issuedLeases.has(lease as object)) fail('transport_attempt_invalid_lease');
      const detachedExpectedSnapshot = structuredClone(expectedSnapshot);
      const run = await currentRun(lease.accountId, lease.runId);
      requireExactSnapshot(run, detachedExpectedSnapshot);
      const attemptValue = requireCurrentAttempt(run, lease.attemptNumber, lease.requestId);
      if (attemptValue.kind !== lease.kind) fail('transport_attempt_invalid_lease');
      return structuredClone(run);
    },

    async settleScheduledTransportFailure(settle) {
      assertTime(settle.settledAt);
      const expectedSnapshot = structuredClone(settle.expectedSnapshot);
      const current = await coordinator.verifyLease(settle.lease, expectedSnapshot);
      const attemptValue = requireCurrentAttempt(
        current,
        settle.lease.attemptNumber,
        settle.lease.requestId,
      );
      const failureValid = failureMatches(current, attemptValue, settle.providerFailure);
      let revalidatedProof: JarvisZeroConsequentialEffectEvidenceV1 | null = null;
      if (failureValid && settle.zeroEffectEvidence) {
        try {
          revalidatedProof = await safetyAuthority.revalidateZeroConsequentialEffect({
            run: current,
            attempt: attemptValue,
            evidence: settle.zeroEffectEvidence,
          });
        } catch {
          revalidatedProof = null;
        }
        if (
          revalidatedProof &&
          !zeroEffectExtends(
            current,
            attemptValue,
            settle.zeroEffectEvidence,
            revalidatedProof,
          )
        ) {
          revalidatedProof = null;
        }
      }

      if (revalidatedProof) {
        const retryable = await input.repository.compareAndMutateTransportAttempt({
          kind: 'settle_retryable',
          accountId: settle.lease.accountId,
          runId: settle.lease.runId,
          expectedStatus: 'running',
          expectedSnapshot,
          expectedAttemptNumber: settle.lease.attemptNumber,
          expectedBarrierVersion: 0,
          expectedEventTailSeq: revalidatedProof.executorClaims.throughSeq,
          providerFailure: structuredClone(settle.providerFailure),
          zeroEffectEvidence: structuredClone(revalidatedProof),
          updatedAt: settle.settledAt,
        });
        if (retryable.applied) return { kind: 'retryable', run: retryable.run };
        const concurrentAttempt = retryable.current.transportAttempts?.at(-1);
        if (
          retryable.current.status === 'running' &&
          retryable.current.scheduledRetrySnapshot !== undefined &&
          exactEqual(retryable.current.scheduledRetrySnapshot, expectedSnapshot) &&
          concurrentAttempt?.attemptNumber === settle.lease.attemptNumber &&
          concurrentAttempt.requestId === settle.lease.requestId &&
          concurrentAttempt.state === 'retryable_failed' &&
          concurrentAttempt.zeroEffectEvidence &&
          exactEqual(concurrentAttempt.zeroEffectEvidence, revalidatedProof)
        ) {
          return { kind: 'retryable', run: retryable.current };
        }
        if (
          retryable.current.status !== 'running' ||
          concurrentAttempt?.attemptNumber !== settle.lease.attemptNumber ||
          concurrentAttempt.requestId !== settle.lease.requestId ||
          concurrentAttempt.state !== 'provider_in_flight'
        ) {
          fail('transport_attempt_conflict');
        }
      }

      if (!failureValid) fail('transport_attempt_invalid_input');
      const updated = await applyMutation({
        kind: 'settle_uncertain_failed',
        accountId: settle.lease.accountId,
        runId: settle.lease.runId,
        expectedStatus: 'running',
        expectedSnapshot,
        expectedAttemptNumber: settle.lease.attemptNumber,
        providerFailure: structuredClone(settle.providerFailure),
        updatedAt: settle.settledAt,
        completedAt: settle.settledAt,
      });
      return { kind: 'terminal_failed', run: updated };
    },
  };

  return coordinator;
}
