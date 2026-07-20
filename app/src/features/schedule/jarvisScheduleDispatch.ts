import type { JarvisEventRepository, JarvisRunRepository } from '@/lib/db/jarvisRepositories';
import type {
  JarvisAuthorityBoundResult,
  JarvisCanonicalLiveProducerEvidence,
  JarvisCanonicalLiveProducerVerifier,
  JarvisCanonicalResultEvidenceV1,
  JarvisEvent,
  JarvisProducerSourceEvidenceV1,
  JarvisRun,
  JarvisTransportAttemptV1,
} from '@/lib/jarvis/contracts/execution';
import { canonicalizeJarvisApprovalJson } from '@/lib/jarvis/contracts/execution';
import type { JarvisKernelTurnResult } from '@/lib/jarvis/kernel';

type ScheduleSourceEvidence = Extract<JarvisProducerSourceEvidenceV1, { producerKind: 'schedule' }>;

const SCHEDULE_SOURCE_COMMON_KEYS = [
  'accountId',
  'attemptNumber',
  'observedAt',
  'producerIdentity',
  'producerKind',
  'requestId',
  'resultRef',
  'runId',
  'schemaVersion',
] as const;

const CANONICAL_RESULT_COMMON_KEYS = [
  'accountId',
  'attemptNumber',
  'kind',
  'observedAt',
  'requestId',
  'resultRef',
  'runId',
  'schemaVersion',
  'state',
] as const;

function exactKeys(value: object, expected: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function stableIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

function sameCanonicalValue(left: unknown, right: unknown): boolean {
  try {
    return canonicalizeJarvisApprovalJson(left) === canonicalizeJarvisApprovalJson(right);
  } catch {
    return false;
  }
}

function validScheduleSource(source: ScheduleSourceEvidence): boolean {
  const identity = source.producerIdentity;
  const expectedKeys =
    source.phase === 'result'
      ? [...SCHEDULE_SOURCE_COMMON_KEYS, 'phase', 'resultAuthority', 'state']
      : [...SCHEDULE_SOURCE_COMMON_KEYS, 'phase', 'state'];
  const authority = source.phase === 'result' ? source.resultAuthority : undefined;
  return (
    exactKeys(source, expectedKeys) &&
    exactKeys(identity, ['eventId', 'occurrenceId', 'producerKind']) &&
    source.schemaVersion === 1 &&
    source.producerKind === 'schedule' &&
    identity.producerKind === 'schedule' &&
    stableIdentifier(source.accountId) &&
    stableIdentifier(source.runId) &&
    stableIdentifier(source.requestId) &&
    Number.isSafeInteger(source.attemptNumber) &&
    source.attemptNumber > 0 &&
    stableIdentifier(source.resultRef) &&
    Number.isFinite(source.observedAt) &&
    stableIdentifier(identity.eventId) &&
    stableIdentifier(identity.occurrenceId) &&
    (source.phase === 'start'
      ? source.state === 'started'
      : (source.state === 'completed' || source.state === 'degraded') &&
        source.resultRef.startsWith('jresult_') &&
        authority !== undefined &&
        exactKeys(authority, ['eventSeq', 'evidenceRef', 'runId']) &&
        stableIdentifier(authority.runId) &&
        Number.isSafeInteger(authority.eventSeq) &&
        authority.eventSeq > 0 &&
        stableIdentifier(authority.evidenceRef) &&
        authority.evidenceRef.startsWith('jresult_'))
  );
}

function scheduleSourceForEvent(event: JarvisEvent | undefined): ScheduleSourceEvidence | null {
  const source = event?.producerSourceEvidence;
  if (!source || source.producerKind !== 'schedule' || !validScheduleSource(source)) return null;
  return source;
}

function validScheduleCanonicalResult(result: JarvisCanonicalResultEvidenceV1): boolean {
  return (
    exactKeys(result, CANONICAL_RESULT_COMMON_KEYS) &&
    result.schemaVersion === 1 &&
    (result.kind === 'kernel_turn_committed' || result.kind === 'scheduled_transport_settled') &&
    stableIdentifier(result.accountId) &&
    stableIdentifier(result.runId) &&
    stableIdentifier(result.requestId) &&
    Number.isSafeInteger(result.attemptNumber) &&
    result.attemptNumber > 0 &&
    (result.state === 'completed' || result.state === 'degraded') &&
    stableIdentifier(result.resultRef) &&
    result.resultRef.startsWith('jresult_') &&
    Number.isFinite(result.observedAt)
  );
}

function scheduleSourceOwnsEvidence(
  source: ScheduleSourceEvidence,
  evidence: JarvisCanonicalLiveProducerEvidence<'schedule'>,
): boolean {
  return (
    source.accountId === evidence.accountId &&
    source.runId === evidence.runId &&
    source.requestId === evidence.requestId &&
    source.attemptNumber === evidence.attemptNumber &&
    sameCanonicalValue(source.producerIdentity, evidence.producerIdentity)
  );
}

function validScheduleEvidence(evidence: JarvisCanonicalLiveProducerEvidence<'schedule'>): boolean {
  const identity = evidence.producerIdentity;
  return (
    exactKeys(evidence, [
      'accountId',
      'attemptNumber',
      'producerIdentity',
      'producerKind',
      'requestId',
      'resultEventSeq',
      'resultRef',
      'runId',
      'schemaVersion',
      'state',
      'verifiedAt',
    ]) &&
    exactKeys(identity, ['eventId', 'occurrenceId', 'producerKind']) &&
    evidence.schemaVersion === 1 &&
    evidence.producerKind === 'schedule' &&
    identity.producerKind === 'schedule' &&
    stableIdentifier(evidence.accountId) &&
    stableIdentifier(evidence.runId) &&
    stableIdentifier(evidence.requestId) &&
    Number.isSafeInteger(evidence.attemptNumber) &&
    evidence.attemptNumber > 0 &&
    Number.isSafeInteger(evidence.resultEventSeq) &&
    evidence.resultEventSeq > 0 &&
    stableIdentifier(evidence.resultRef) &&
    Number.isFinite(evidence.verifiedAt) &&
    stableIdentifier(identity.eventId) &&
    stableIdentifier(identity.occurrenceId) &&
    (evidence.state === 'busy' || evidence.state === 'completed' || evidence.state === 'degraded')
  );
}

/** @internal Imported in production only by app/src/lib/ai/runtime.ts. */
export function createJarvisScheduleLiveEvidenceVerifier(input: {
  runs: JarvisRunRepository;
  events: JarvisEventRepository;
}): JarvisCanonicalLiveProducerVerifier<'schedule'> {
  return Object.freeze({
    async verify(evidence: JarvisCanonicalLiveProducerEvidence<'schedule'>) {
      try {
        if (!validScheduleEvidence(evidence)) return null;
        const run = await input.runs.getById(evidence.accountId, evidence.runId);
        const snapshot = run?.scheduledRetrySnapshot;
        if (
          !run ||
          !snapshot ||
          run.id !== evidence.runId ||
          run.accountId !== evidence.accountId ||
          run.source !== 'schedule' ||
          snapshot.schemaVersion !== 1 ||
          snapshot.accountId !== evidence.accountId ||
          snapshot.eventId !== evidence.producerIdentity.eventId ||
          snapshot.occurrenceId !== evidence.producerIdentity.occurrenceId
        ) {
          return null;
        }
        const attempts =
          run.transportAttempts?.filter(
            (candidate) =>
              candidate.requestId === evidence.requestId &&
              candidate.attemptNumber === evidence.attemptNumber,
          ) ?? [];
        if (attempts.length !== 1) return null;
        const attempt = attempts[0]!;
        const target = await input.events.getBySeq(
          evidence.accountId,
          evidence.runId,
          evidence.resultEventSeq,
        );
        const source = scheduleSourceForEvent(target);
        if (
          !target ||
          target.runId !== evidence.runId ||
          !source ||
          !scheduleSourceOwnsEvidence(source, evidence) ||
          target.canonicalResultEvidence !== undefined
        ) {
          return null;
        }

        if (evidence.state === 'busy') {
          if (
            attempt.startedEventSeq !== evidence.resultEventSeq ||
            target.type !== 'run_state' ||
            target.status !== 'running' ||
            source.phase !== 'start' ||
            source.state !== 'started' ||
            source.resultRef !== evidence.resultRef ||
            source.observedAt !== evidence.verifiedAt
          ) {
            return null;
          }
          return Object.freeze(structuredClone(evidence));
        }

        if (
          target.type !== 'tool' ||
          target.status !== evidence.state ||
          source.phase !== 'result' ||
          source.state !== evidence.state ||
          source.resultRef !== evidence.resultRef ||
          source.observedAt !== evidence.verifiedAt
        ) {
          return null;
        }
        const authority = source.resultAuthority;
        if (
          !authority ||
          authority.runId !== evidence.runId ||
          authority.eventSeq <= attempt.startedEventSeq ||
          authority.eventSeq >= evidence.resultEventSeq ||
          authority.evidenceRef !== evidence.resultRef
        ) {
          return null;
        }
        const authorityRow = await input.events.getBySeq(
          evidence.accountId,
          authority.runId,
          authority.eventSeq,
        );
        const canonical = authorityRow?.canonicalResultEvidence;
        if (
          !authorityRow ||
          authorityRow.runId !== authority.runId ||
          authorityRow.seq !== authority.eventSeq ||
          authorityRow.type !== 'run_state' ||
          !canonical ||
          !validScheduleCanonicalResult(canonical) ||
          canonical.accountId !== evidence.accountId ||
          canonical.runId !== evidence.runId ||
          canonical.requestId !== evidence.requestId ||
          canonical.attemptNumber !== evidence.attemptNumber ||
          canonical.state !== evidence.state ||
          canonical.resultRef !== evidence.resultRef ||
          canonical.observedAt !== evidence.verifiedAt
        ) {
          return null;
        }
        return Object.freeze(structuredClone(evidence));
      } catch {
        return null;
      }
    },
  });
}

/** Fieldless structural views of runtime-owned opaque values. */
export interface JarvisAllocatedScheduledOccurrence {}
export interface JarvisPreparedScheduledAttempt {}
export interface JarvisScheduledAttemptHandle {}

export type ScheduledJarvisAttemptResult =
  | { kind: 'committed'; result: JarvisKernelTurnResult }
  | {
      kind: 'transport_retry_available';
      run: JarvisRun;
      attempt: JarvisTransportAttemptV1;
    }
  | { kind: 'terminal_transport_failure'; run: JarvisRun }
  | { kind: 'account_authority_revoked' };

interface ScheduledKernelPort {
  allocateScheduledOccurrence(input: {
    accountId: string;
    eventId: string;
    dueAt: number;
  }): Promise<JarvisAuthorityBoundResult<JarvisAllocatedScheduledOccurrence>>;
  loadScheduledRun(input: {
    accountId: string;
    runId: string;
  }): Promise<JarvisAuthorityBoundResult<JarvisAllocatedScheduledOccurrence | undefined>>;
  allocateScheduledLogicalRetry(input: {
    accountId: string;
    previousRunId: string;
  }): Promise<JarvisAuthorityBoundResult<JarvisAllocatedScheduledOccurrence>>;
  prepareScheduledAttempt(input: {
    allocation: JarvisAllocatedScheduledOccurrence;
  }): Promise<JarvisPreparedScheduledAttempt>;
  beginPreparedScheduledAttempt(input: {
    prepared: JarvisPreparedScheduledAttempt;
  }): Promise<JarvisAuthorityBoundResult<JarvisScheduledAttemptHandle>>;
  dispatchPreparedScheduledAttempt(input: {
    prepared: JarvisPreparedScheduledAttempt;
    handle: JarvisScheduledAttemptHandle;
  }): Promise<
    JarvisAuthorityBoundResult<
      | { kind: 'committed'; result: JarvisKernelTurnResult }
      | { kind: 'pre_effect_transport_failure' }
    >
  >;
  settleScheduledTransportFailure(input: {
    handle: JarvisScheduledAttemptHandle;
  }): Promise<
    JarvisAuthorityBoundResult<
      { kind: 'retryable'; run: JarvisRun } | { kind: 'terminal_failed'; run: JarvisRun }
    >
  >;
  disposeScheduledAttempt(handle: JarvisScheduledAttemptHandle): void;
}

export interface ScheduledJarvisDispatchDeps {
  kernel: Pick<
    ScheduledKernelPort,
    | 'allocateScheduledOccurrence'
    | 'loadScheduledRun'
    | 'allocateScheduledLogicalRetry'
    | 'prepareScheduledAttempt'
    | 'beginPreparedScheduledAttempt'
    | 'dispatchPreparedScheduledAttempt'
    | 'settleScheduledTransportFailure'
    | 'disposeScheduledAttempt'
  >;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function scheduleOccurrenceId(input: {
  accountId: string;
  eventId: string;
  dueAt: number;
}): Promise<`jocc_${string}`> {
  const occurrenceDigest = await sha256(
    `schedule-occurrence-v1\u0000${input.accountId}\u0000${input.eventId}\u0000${input.dueAt}`,
  );
  return `jocc_${occurrenceDigest.slice(0, 32)}`;
}

export async function scheduleOccurrenceRunId(input: {
  accountId: string;
  occurrenceId: `jocc_${string}`;
  logicalAttempt: number;
}): Promise<string> {
  const runDigest = await sha256(
    `schedule-run-v1\u0000${input.accountId}\u0000${input.occurrenceId}\u0000${input.logicalAttempt}`,
  );
  return `jrun_${runDigest.slice(0, 32)}`;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected scheduled Jarvis result: ${String(value)}`);
}

export async function dispatchScheduledJarvisOccurrence(
  input: {
    accountId: string;
    eventId: string;
    dueAt: number;
  },
  deps: ScheduledJarvisDispatchDeps,
): Promise<ScheduledJarvisAttemptResult> {
  const allocation = await deps.kernel.allocateScheduledOccurrence(input);
  if (allocation.kind === 'account_authority_revoked') return allocation;

  const prepared = await deps.kernel.prepareScheduledAttempt({ allocation: allocation.value });
  const begun = await deps.kernel.beginPreparedScheduledAttempt({ prepared });
  if (begun.kind === 'account_authority_revoked') return begun;

  const handle = begun.value;
  let resolvedByKernel = false;

  try {
    const dispatched = await deps.kernel.dispatchPreparedScheduledAttempt({ prepared, handle });
    if (dispatched.kind === 'account_authority_revoked') return dispatched;

    switch (dispatched.value.kind) {
      case 'committed':
        resolvedByKernel = true;
        return dispatched.value;
      case 'pre_effect_transport_failure': {
        const settled = await deps.kernel.settleScheduledTransportFailure({ handle });
        if (settled.kind === 'account_authority_revoked') return settled;

        switch (settled.value.kind) {
          case 'retryable': {
            const attempt = settled.value.run.transportAttempts?.at(-1);
            if (!attempt || attempt.state !== 'retryable_failed') {
              throw new Error('scheduled_transport_retry_attempt_missing');
            }
            resolvedByKernel = true;
            return {
              kind: 'transport_retry_available',
              run: settled.value.run,
              attempt,
            };
          }
          case 'terminal_failed':
            resolvedByKernel = true;
            return { kind: 'terminal_transport_failure', run: settled.value.run };
          default:
            return assertNever(settled.value);
        }
      }
      default:
        return assertNever(dispatched.value);
    }
  } finally {
    if (!resolvedByKernel) deps.kernel.disposeScheduledAttempt(handle);
  }
}
