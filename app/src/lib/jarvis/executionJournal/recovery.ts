import type {
  JarvisEvent,
  JarvisRecoveryApprovalVerifier,
  JarvisRecoveryDecision,
  JarvisRecoveryScanner,
  JarvisRun,
  JarvisRunStatus,
  JarvisTransportAttemptV1,
  JarvisZeroConsequentialEffectEvidenceV1,
} from '@/lib/jarvis/contracts/execution';
import type { JarvisEventRepository, JarvisRunRepository } from '@/lib/db/jarvisRepositories';

const NONTERMINAL_STATUSES: JarvisRunStatus[] = [
  'queued',
  'compiling',
  'running',
  'awaiting_approval',
];
const NONTERMINAL_STATUS_SET = new Set<JarvisRunStatus>(NONTERMINAL_STATUSES);
const PENDING_APPROVAL_EVENT_TITLE = 'Approval required';
const PENDING_APPROVAL_EVENT_SUMMARY = 'Review the registered action before it runs.';

export type CreateJarvisRecoveryScannerInput = Readonly<{
  runs: Pick<JarvisRunRepository, 'listByAccount'>;
  events: Pick<JarvisEventRepository, 'listByRun'>;
  approvalVerifier?: JarvisRecoveryApprovalVerifier;
}>;

function clampLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 500;
  return Math.max(1, Math.min(500, Math.trunc(value)));
}

function pendingApprovalEvents(events: readonly JarvisEvent[]): JarvisEvent[] {
  return events.filter(
    (event) =>
      event.type === 'approval' &&
      event.status === 'pending' &&
      event.idempotencyKey.trim().length > 0 &&
      event.title === PENDING_APPROVAL_EVENT_TITLE &&
      event.safeSummary === PENDING_APPROVAL_EVENT_SUMMARY &&
      event.sourceRefs.length === 0 &&
      event.artifactIds.length === 0,
  );
}

function exactZeroEffectProof(
  run: Readonly<JarvisRun>,
  attempt: Readonly<JarvisTransportAttemptV1>,
  proof: Readonly<JarvisZeroConsequentialEffectEvidenceV1>,
): boolean {
  const boundary = proof.providerBoundary;
  return (
    proof.schemaVersion === 1 &&
    proof.accountId === run.accountId &&
    proof.runId === run.id &&
    proof.requestId === attempt.requestId &&
    proof.attemptNumber === attempt.attemptNumber &&
    Number.isFinite(proof.assessedAt) &&
    boundary.schemaVersion === 1 &&
    boundary.accountId === run.accountId &&
    boundary.runId === run.id &&
    boundary.requestId === attempt.requestId &&
    boundary.attemptNumber === attempt.attemptNumber &&
    boundary.providerId === run.model.providerId &&
    boundary.modelId === run.model.modelId &&
    boundary.boundary === 'before_first_response_byte' &&
    boundary.responseStarted === false &&
    boundary.chunkCount === 0 &&
    boundary.actionDispatchCount === 0 &&
    attempt.failureCategory === boundary.failureCategory &&
    boundary.failureCategory.trim().length > 0 &&
    boundary.evidenceRef.trim().length > 0 &&
    Number.isFinite(boundary.verifiedAt) &&
    proof.effectBarrier.state === 'open' &&
    proof.effectBarrier.version === 0 &&
    proof.approvals.count === 0 &&
    proof.approvals.evidenceRef.trim().length > 0 &&
    proof.artifacts.count === 0 &&
    proof.artifacts.evidenceRef.trim().length > 0 &&
    proof.executorClaims.count === 0 &&
    Number.isSafeInteger(proof.executorClaims.throughSeq) &&
    proof.executorClaims.throughSeq >= attempt.startedEventSeq &&
    proof.executorClaims.evidenceRef.trim().length > 0
  );
}

export function isJarvisScheduledTransportRetryAvailable(run: Readonly<JarvisRun>): boolean {
  if (run.status !== 'running' || run.source !== 'schedule') return false;
  const attempts = run.transportAttempts;
  if (!attempts || attempts.length < 1 || attempts.length > 32) return false;
  const latest = attempts.at(-1)!;
  return (
    latest.schemaVersion === 1 &&
    latest.state === 'retryable_failed' &&
    latest.effectBarrier.state === 'open' &&
    latest.effectBarrier.version === 0 &&
    !!latest.failureCategory &&
    !!latest.zeroEffectEvidence &&
    exactZeroEffectProof(run, latest, latest.zeroEffectEvidence)
  );
}

function recoveryReason(
  run: Readonly<JarvisRun>,
): Extract<JarvisRecoveryDecision, { kind: 'fail_closed' }>['reason'] {
  if (isJarvisScheduledTransportRetryAvailable(run)) {
    return 'scheduled_transport_retry_available';
  }
  if (run.status === 'running' && run.transportAttempts?.at(-1)?.state === 'provider_in_flight') {
    return 'ambiguous_executor_state';
  }
  return 'manual_retry_required';
}

export function createJarvisRecoveryScanner(
  input: CreateJarvisRecoveryScannerInput,
): JarvisRecoveryScanner {
  return {
    async scanAccount(accountId, options = {}) {
      const runLimit = clampLimit(options.runLimit);
      const eventLimit = clampLimit(options.eventLimitPerRun);
      const runs = await input.runs.listByAccount(accountId, {
        statuses: [...NONTERMINAL_STATUSES],
        limit: runLimit,
      });
      const decisions: JarvisRecoveryDecision[] = [];

      for (const run of runs) {
        if (!NONTERMINAL_STATUS_SET.has(run.status)) continue;
        const events = await input.events.listByRun(accountId, run.id, { limit: eventLimit });
        if (run.status !== 'awaiting_approval') {
          decisions.push({ kind: 'fail_closed', run, reason: recoveryReason(run) });
          continue;
        }

        const candidates = pendingApprovalEvents(events);
        if (candidates.length === 0 || !input.approvalVerifier) {
          decisions.push({ kind: 'fail_closed', run, reason: 'approval_missing' });
          continue;
        }
        if (candidates.length !== 1) {
          decisions.push({ kind: 'fail_closed', run, reason: 'approval_binding_mismatch' });
          continue;
        }

        let verification: Awaited<
          ReturnType<JarvisRecoveryApprovalVerifier['verifyPendingApproval']>
        >;
        try {
          verification = await input.approvalVerifier.verifyPendingApproval({
            accountId,
            run,
            events,
          });
        } catch {
          decisions.push({ kind: 'fail_closed', run, reason: 'approval_missing' });
          continue;
        }
        if (!verification.valid) {
          decisions.push({ kind: 'fail_closed', run, reason: verification.reason });
          continue;
        }
        if (verification.approvalId !== candidates[0]!.idempotencyKey) {
          decisions.push({ kind: 'fail_closed', run, reason: 'approval_binding_mismatch' });
          continue;
        }
        decisions.push({
          kind: 'await_approval',
          run,
          events: structuredClone(events),
          approvalId: verification.approvalId,
        });
      }
      return decisions;
    },
  };
}
