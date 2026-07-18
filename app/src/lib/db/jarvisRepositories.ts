import Dexie from 'dexie';
import type {
  JarvisApproval,
  JarvisArtifact,
  JarvisAttemptEffectClaimInput,
  JarvisAttemptEffectClaimResult,
  JarvisDurableLiveEvidenceV1,
  JarvisEvent,
  JarvisPreEffectTransportFailureEvidence,
  JarvisRun,
  JarvisRunStatus,
  JarvisTransportAttemptV1,
  JarvisZeroConsequentialEffectEvidenceV1,
} from '@/lib/jarvis/contracts/execution';
import {
  validateJarvisDurableLiveEvidence,
  validateJarvisEvent,
} from '@/lib/jarvis/contracts/validators';
import type { JarvisIdentityRevision } from '@/lib/jarvis/identity';
import type { JarvisProfile } from '@/lib/jarvis/profiles/types';
import { db, type JarvisDexie } from './index';
import {
  fromJarvisApprovalRow,
  fromJarvisArtifactRow,
  fromJarvisEventRow,
  fromJarvisIdentityRevisionRow,
  fromJarvisProfileRow,
  fromJarvisRunRow,
  toJarvisApprovalRow,
  toJarvisArtifactRow,
  toJarvisEventRow,
  toJarvisIdentityRevisionRow,
  toJarvisProfileRow,
  toJarvisRunRow,
  type JarvisProfileMigrationMetadata,
} from './jarvisMappers';

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 500;
const MAX_TRANSPORT_ATTEMPTS = 32;
const JARVIS_ATTEMPT_EFFECT_IDEMPOTENCY_PREFIX = 'jeffect:';

export interface JarvisIdentityRepository {
  getVersion(identityId: 'jarvis', version: number): Promise<JarvisIdentityRevision | undefined>;
  putIfAbsent(revision: JarvisIdentityRevision): Promise<JarvisIdentityRevision>;
}

export interface JarvisProfileRepository {
  getById(accountId: string, profileId: string): Promise<JarvisProfile | undefined>;
  getActive(accountId: string): Promise<JarvisProfile | undefined>;
  putForAccount(
    accountId: string,
    input: {
      profile: JarvisProfile;
      migration: JarvisProfileMigrationMetadata;
    },
  ): Promise<JarvisProfile>;
  updateCustomInstructions(
    accountId: string,
    profileId: string,
    customInstructions: string,
  ): Promise<JarvisProfile>;
}

export type JarvisRunTransitionEventInput = Omit<JarvisEvent, 'runId' | 'seq' | 'type' | 'status'>;

export interface JarvisRunRepository {
  createIdempotent(run: JarvisRun): Promise<JarvisRun>;
  getById(accountId: string, runId: string): Promise<JarvisRun | undefined>;
  listByAccount(
    accountId: string,
    options?: { statuses?: JarvisRunStatus[]; limit?: number },
  ): Promise<JarvisRun[]>;
  compareAndAppendTransitionEvent(input: {
    accountId: string;
    runId: string;
    expectedStatus: JarvisRunStatus;
    nextStatus: JarvisRunStatus;
    updatedAt: number;
    completedAt?: number;
    event: JarvisRunTransitionEventInput;
  }): Promise<
    { applied: true; run: JarvisRun; event: JarvisEvent } | { applied: false; current: JarvisRun }
  >;
  compareAndMutateTransportAttempt(
    input: JarvisTransportAttemptMutationInput,
  ): Promise<
    | { applied: true; run: JarvisRun; event: JarvisEvent }
    | { applied: false; current: JarvisRun; reason: 'status_conflict' | 'attempt_conflict' }
  >;
  claimAttemptEffect(input: JarvisAttemptEffectClaimInput): Promise<JarvisAttemptEffectClaimResult>;
}

export type JarvisTransportAttemptMutationInput =
  | {
      kind: 'begin_initial';
      accountId: string;
      runId: string;
      expectedStatus: 'queued';
      attempt: Omit<JarvisTransportAttemptV1, 'startedEventSeq'>;
      updatedAt: number;
    }
  | {
      kind: 'begin_retry';
      accountId: string;
      runId: string;
      expectedStatus: 'running';
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
      expectedAttemptNumber: number;
      providerFailure: JarvisPreEffectTransportFailureEvidence;
      updatedAt: number;
      completedAt: number;
    };

export type JarvisNonTransitionEventInput = Omit<JarvisEvent, 'runId' | 'seq' | 'type'> & {
  type: Exclude<JarvisEvent['type'], 'run_state'>;
};

export interface JarvisEventRepository {
  appendIdempotent(
    accountId: string,
    runId: string,
    event: JarvisNonTransitionEventInput,
  ): Promise<JarvisEvent>;
  listByRun(
    accountId: string,
    runId: string,
    options?: { afterSeq?: number; limit?: number },
  ): Promise<JarvisEvent[]>;
  getBySeq(accountId: string, runId: string, seq: number): Promise<JarvisEvent | undefined>;
}

/** @internal Closed test harness only; production modules must not import this authority. */
export interface JarvisLiveEvidenceEventCommitAuthority {
  appendLiveEvidence(input: {
    accountId: string;
    runId: string;
    evidence: JarvisDurableLiveEvidenceV1;
  }): Promise<JarvisEvent>;
}

export interface JarvisApprovalRepository {
  getById(accountId: string, approvalId: string): Promise<JarvisApproval | undefined>;
  putForRun(accountId: string, approval: JarvisApproval): Promise<JarvisApproval>;
}

export interface JarvisArtifactRepository {
  getById(accountId: string, artifactId: string): Promise<JarvisArtifact | undefined>;
  listByRun(accountId: string, runId: string, limit?: number): Promise<JarvisArtifact[]>;
  putForRun(accountId: string, artifact: JarvisArtifact): Promise<JarvisArtifact>;
}

export type JarvisRepositoryErrorCode =
  | 'account_scope_mismatch'
  | 'parent_run_not_found'
  | 'run_id_conflict'
  | 'event_idempotency_conflict'
  | 'transition_event_requires_atomic_run_update'
  | 'live_evidence_integrity_error'
  | 'transport_attempt_integrity_error'
  | 'attempt_effect_integrity_error'
  | 'profile_integrity_error'
  | 'invalid_limit';

export class JarvisRepositoryError extends Error {
  readonly code: JarvisRepositoryErrorCode;

  constructor(code: JarvisRepositoryErrorCode) {
    super(code);
    this.name = 'JarvisRepositoryError';
    this.code = code;
  }
}

export type JarvisRepositories = {
  identity: JarvisIdentityRepository;
  profile: JarvisProfileRepository;
  run: JarvisRunRepository;
  event: JarvisEventRepository;
  approval: JarvisApprovalRepository;
  artifact: JarvisArtifactRepository;
};

export function newJarvisProfileRevisionId(): string {
  return `jprof_rev_${crypto.randomUUID()}`;
}

function repositoryError(code: JarvisRepositoryErrorCode): never {
  throw new JarvisRepositoryError(code);
}

function detachRepositoryInput<T>(value: T, errorCode: JarvisRepositoryErrorCode): T {
  try {
    return structuredClone(value);
  } catch {
    repositoryError(errorCode);
  }
}

function assertAccountId(accountId: string): void {
  if (typeof accountId !== 'string' || accountId.length === 0 || accountId !== accountId.trim()) {
    repositoryError('account_scope_mismatch');
  }
}

function normalizedLimit(limit: number | undefined): number {
  const resolved = limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > MAX_LIMIT) {
    repositoryError('invalid_limit');
  }
  return resolved;
}

function assertAfterSeq(afterSeq: number | undefined): void {
  if (
    afterSeq !== undefined &&
    (!Number.isSafeInteger(afterSeq) || !Number.isFinite(afterSeq) || afterSeq < 0)
  ) {
    repositoryError('invalid_limit');
  }
}

function assertIdempotencyKey(idempotencyKey: string): void {
  if (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
    repositoryError('event_idempotency_conflict');
  }
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => valuesEqual(value, right[index]));
  }
  if (typeof left !== 'object' || typeof right !== 'object') return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) => key === rightKeys[index] && valuesEqual(leftRecord[key], rightRecord[key]),
    )
  );
}

function normalizeCustomInstructions(value: string): string {
  return value.replace(/\r\n?/g, '\n');
}

async function requireOwnedRun(database: JarvisDexie, accountId: string, runId: string) {
  const row = await database.jarvis_runs.get(runId);
  if (!row || row.account_id !== accountId) repositoryError('parent_run_not_found');
  return row;
}

function nextSequence(lastSequence: number | undefined): number {
  const next = (lastSequence ?? 0) + 1;
  if (!Number.isSafeInteger(next)) repositoryError('event_idempotency_conflict');
  return next;
}

function isFiniteTimestamp(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function isStableText(value: string): boolean {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) repositoryError('live_evidence_integrity_error');
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function liveEvidenceOperationsAreClosed(evidence: JarvisDurableLiveEvidenceV1): boolean {
  const allowed =
    evidence.kind === 'model'
      ? new Set(['generate', 'stream', 'embed'])
      : new Set(['execute', 'cancel', 'inspect']);
  return (
    evidence.operations.length > 0 &&
    new Set(evidence.operations).size === evidence.operations.length &&
    evidence.operations.every((operation) => allowed.has(operation))
  );
}

function sameLiveEvidenceOccurrence(
  left: JarvisDurableLiveEvidenceV1,
  right: JarvisDurableLiveEvidenceV1,
): boolean {
  return (
    left.accountId === right.accountId &&
    left.runId === right.runId &&
    left.requestId === right.requestId &&
    left.attemptNumber === right.attemptNumber &&
    left.registrationId === right.registrationId &&
    left.previousProofRef === right.previousProofRef
  );
}

async function sha256Hex(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function transportAttemptInputIsValid(
  attempt: Omit<JarvisTransportAttemptV1, 'startedEventSeq'>,
  expected: { number: number; kind: JarvisTransportAttemptV1['kind'] },
): boolean {
  return (
    attempt.schemaVersion === 1 &&
    attempt.attemptNumber === expected.number &&
    attempt.kind === expected.kind &&
    isStableText(attempt.requestId) &&
    attempt.state === 'provider_in_flight' &&
    attempt.effectBarrier.state === 'open' &&
    attempt.effectBarrier.version === 0 &&
    isFiniteTimestamp(attempt.effectBarrier.updatedAt) &&
    isFiniteTimestamp(attempt.createdAt) &&
    isFiniteTimestamp(attempt.updatedAt) &&
    attempt.failureCategory === undefined &&
    attempt.zeroEffectEvidence === undefined
  );
}

function transportEvidenceMatches(
  run: JarvisRun,
  attempt: JarvisTransportAttemptV1,
  failure: JarvisPreEffectTransportFailureEvidence,
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
    isStableText(failure.failureCategory) &&
    isStableText(failure.evidenceRef) &&
    isFiniteTimestamp(failure.verifiedAt)
  );
}

function zeroEffectEvidenceMatches(
  run: JarvisRun,
  attempt: JarvisTransportAttemptV1,
  failure: JarvisPreEffectTransportFailureEvidence,
  evidence: JarvisZeroConsequentialEffectEvidenceV1,
): boolean {
  return (
    evidence.schemaVersion === 1 &&
    evidence.accountId === run.accountId &&
    evidence.runId === run.id &&
    evidence.requestId === attempt.requestId &&
    evidence.attemptNumber === attempt.attemptNumber &&
    valuesEqual(evidence.providerBoundary, failure) &&
    evidence.effectBarrier.state === 'open' &&
    evidence.effectBarrier.version === 0 &&
    evidence.approvals.count === 0 &&
    evidence.artifacts.count === 0 &&
    evidence.executorClaims.count === 0 &&
    Number.isSafeInteger(evidence.executorClaims.throughSeq) &&
    evidence.executorClaims.throughSeq >= 0 &&
    isFiniteTimestamp(evidence.assessedAt)
  );
}

function transportEventInput(input: {
  runId: string;
  seq: number;
  idempotencyKey: string;
  type: 'run_state' | 'warning';
  status: string;
  title: string;
  safeSummary: string;
  createdAt: number;
}): JarvisEvent {
  return {
    ...input,
    sourceRefs: [],
    artifactIds: [],
  };
}

function attemptEffectClaimIdempotencyKey(input: JarvisAttemptEffectClaimInput): string {
  return `${JARVIS_ATTEMPT_EFFECT_IDEMPOTENCY_PREFIX}${input.runId}:${input.requestId}:${input.attemptNumber}:${encodeURIComponent(input.ownerKind)}:${encodeURIComponent(input.ownerId)}:${encodeURIComponent(input.evidenceRef)}`;
}

function attemptEffectClaimEvent(input: JarvisAttemptEffectClaimInput, seq: number): JarvisEvent {
  return {
    runId: input.runId,
    seq,
    idempotencyKey: attemptEffectClaimIdempotencyKey(input),
    type: 'tool',
    status: 'consequential_effect_claimed',
    title: 'Consequential effect claimed',
    safeSummary: 'An execution owner claimed the current attempt barrier.',
    sourceRefs: [],
    artifactIds: [],
    createdAt: input.claimedAt,
    executionEvidence: {
      schemaVersion: 1,
      requestId: input.requestId,
      attemptNumber: input.attemptNumber,
      kind: 'consequential_effect_claimed',
      ownerKind: input.ownerKind,
      ownerId: input.ownerId,
      evidenceRef: input.evidenceRef,
      observedAt: input.claimedAt,
    },
  };
}

async function lastEventForRun(database: JarvisDexie, runId: string) {
  return database.jarvis_events
    .where('[run_id+seq]')
    .between([runId, Dexie.minKey], [runId, Dexie.maxKey], true, true)
    .last();
}

export function createJarvisRepositories(
  database: JarvisDexie,
  dependencies: {
    now?: () => number;
    newProfileRevisionId?: () => string;
  } = {},
): JarvisRepositories {
  const now = dependencies.now ?? Date.now;
  const newProfileRevision = dependencies.newProfileRevisionId ?? newJarvisProfileRevisionId;

  const identity: JarvisIdentityRepository = {
    async getVersion(identityId, version) {
      const row = await database.jarvis_identity_revisions
        .where('[identity_id+version]')
        .equals([identityId, version])
        .first();
      return row ? fromJarvisIdentityRevisionRow(row) : undefined;
    },

    async putIfAbsent(revision) {
      const desired = toJarvisIdentityRevisionRow(revision);
      return database.transaction('rw', database.jarvis_identity_revisions, async () => {
        const [byId, byVersion] = await Promise.all([
          database.jarvis_identity_revisions.get(desired.id),
          database.jarvis_identity_revisions
            .where('[identity_id+version]')
            .equals([desired.identity_id, desired.version])
            .first(),
        ]);
        const existing = byId ?? byVersion;
        if (existing) {
          if (
            !valuesEqual(existing, desired) ||
            (byId !== undefined && !valuesEqual(byId, desired)) ||
            (byVersion !== undefined && !valuesEqual(byVersion, desired))
          ) {
            repositoryError('profile_integrity_error');
          }
          return fromJarvisIdentityRevisionRow(existing);
        }
        await database.jarvis_identity_revisions.add(desired);
        return fromJarvisIdentityRevisionRow(desired);
      });
    },
  };

  const profile: JarvisProfileRepository = {
    async getById(accountId, profileId) {
      assertAccountId(accountId);
      const row = await database.jarvis_profiles.get(profileId);
      if (!row || row.account_id !== accountId) return undefined;
      return fromJarvisProfileRow(row).profile;
    },

    async getActive(accountId) {
      assertAccountId(accountId);
      const rows = await database.jarvis_profiles
        .where('[account_id+active]')
        .equals([accountId, 1])
        .toArray();
      if (rows.length > 1) repositoryError('profile_integrity_error');
      return rows[0] ? fromJarvisProfileRow(rows[0]).profile : undefined;
    },

    async putForAccount(accountId, input) {
      assertAccountId(accountId);
      if (input.profile.accountId !== accountId) repositoryError('account_scope_mismatch');
      const desired = toJarvisProfileRow(input);
      return database.transaction('rw', database.jarvis_profiles, async () => {
        const existing = await database.jarvis_profiles.get(desired.id);
        if (existing && existing.account_id !== accountId) {
          repositoryError('account_scope_mismatch');
        }
        if (desired.active === 1) {
          const activeRows = await database.jarvis_profiles
            .where('[account_id+active]')
            .equals([accountId, 1])
            .toArray();
          if (activeRows.some((row) => row.id !== desired.id)) {
            repositoryError('profile_integrity_error');
          }
        }
        await database.jarvis_profiles.put(desired);
        return fromJarvisProfileRow(desired).profile;
      });
    },

    async updateCustomInstructions(accountId, profileId, customInstructions) {
      assertAccountId(accountId);
      const normalized = normalizeCustomInstructions(customInstructions);
      return database.transaction('rw', database.jarvis_profiles, async () => {
        const row = await database.jarvis_profiles.get(profileId);
        if (!row || row.account_id !== accountId) repositoryError('profile_integrity_error');
        const current = fromJarvisProfileRow(row);
        if (normalizeCustomInstructions(current.profile.customInstructions) === normalized) {
          return current.profile;
        }

        const { sourcePromptHash: _sourcePromptHash, ...profileWithoutSourceHash } =
          current.profile;
        const updated: JarvisProfile = {
          ...profileWithoutSourceHash,
          revisionId: newProfileRevision(),
          customInstructions: normalized,
          instructionSource: normalized.length === 0 ? 'none' : 'user',
          updatedAt: now(),
        };
        const updatedRow = toJarvisProfileRow({ profile: updated, migration: current.migration });
        await database.jarvis_profiles.put(updatedRow);
        return fromJarvisProfileRow(updatedRow).profile;
      });
    },
  };

  const run: JarvisRunRepository = {
    async createIdempotent(value) {
      assertAccountId(value.accountId);
      const desired = toJarvisRunRow(value);
      return database.transaction('rw', database.jarvis_runs, async () => {
        if (value.parentRunId !== undefined) {
          await requireOwnedRun(database, value.accountId, value.parentRunId);
        }
        const existing = await database.jarvis_runs.get(value.id);
        if (existing) {
          if (!valuesEqual(existing, desired)) repositoryError('run_id_conflict');
          return fromJarvisRunRow(existing);
        }
        await database.jarvis_runs.add(desired);
        return fromJarvisRunRow(desired);
      });
    },

    async getById(accountId, runId) {
      assertAccountId(accountId);
      const row = await database.jarvis_runs.get(runId);
      if (!row || row.account_id !== accountId) return undefined;
      return fromJarvisRunRow(row);
    },

    async listByAccount(accountId, options = {}) {
      assertAccountId(accountId);
      const limit = normalizedLimit(options.limit);
      const statuses = options.statuses ? new Set(options.statuses) : undefined;
      if (statuses?.size === 0) return [];
      let collection = database.jarvis_runs
        .where('[account_id+updated_at]')
        .between([accountId, Dexie.minKey], [accountId, Dexie.maxKey], true, true)
        .reverse();
      if (statuses) collection = collection.filter((row) => statuses.has(row.status));
      const rows = await collection.limit(limit).toArray();
      return rows.map(fromJarvisRunRow);
    },

    async compareAndAppendTransitionEvent(input) {
      assertAccountId(input.accountId);
      return database.transaction('rw', database.jarvis_runs, database.jarvis_events, async () => {
        const row = await requireOwnedRun(database, input.accountId, input.runId);
        const current = fromJarvisRunRow(row);
        if (current.status !== input.expectedStatus) {
          return { applied: false as const, current };
        }
        assertIdempotencyKey(input.event.idempotencyKey);

        const { completedAt: _completedAt, ...withoutCompletedAt } = current;
        const updated: JarvisRun = {
          ...withoutCompletedAt,
          status: input.nextStatus,
          updatedAt: input.updatedAt,
          ...(input.completedAt === undefined ? {} : { completedAt: input.completedAt }),
        };
        const updatedRow = toJarvisRunRow(updated);
        const lastEvent = await database.jarvis_events
          .where('[run_id+seq]')
          .between([input.runId, Dexie.minKey], [input.runId, Dexie.maxKey], true, true)
          .last();
        const event: JarvisEvent = {
          ...input.event,
          runId: input.runId,
          seq: nextSequence(lastEvent?.seq),
          type: 'run_state',
          status: input.nextStatus,
        };
        const eventRow = toJarvisEventRow(event);
        await database.jarvis_runs.put(updatedRow);
        await database.jarvis_events.add(eventRow);
        return {
          applied: true as const,
          run: fromJarvisRunRow(updatedRow),
          event: fromJarvisEventRow(eventRow),
        };
      });
    },

    async compareAndMutateTransportAttempt(input) {
      assertAccountId(input.accountId);
      return database.transaction('rw', database.jarvis_runs, database.jarvis_events, async () => {
        const row = await requireOwnedRun(database, input.accountId, input.runId);
        const current = fromJarvisRunRow(row);
        if (current.status !== input.expectedStatus) {
          return { applied: false as const, current, reason: 'status_conflict' as const };
        }
        if (!isFiniteTimestamp(input.updatedAt)) {
          repositoryError('transport_attempt_integrity_error');
        }

        const attempts = structuredClone([...(current.transportAttempts ?? [])]);
        const tail = await lastEventForRun(database, input.runId);
        let updated: JarvisRun;
        let eventValue: JarvisEvent;

        if (input.kind === 'begin_initial') {
          if (
            current.source !== 'schedule' ||
            attempts.length !== 0 ||
            !transportAttemptInputIsValid(input.attempt, { number: 1, kind: 'initial' })
          ) {
            return { applied: false as const, current, reason: 'attempt_conflict' as const };
          }
          const seq = nextSequence(tail?.seq);
          const attempt: JarvisTransportAttemptV1 = {
            ...structuredClone(input.attempt),
            startedEventSeq: seq,
          };
          const { completedAt: _completedAt, ...withoutCompletedAt } = current;
          updated = {
            ...withoutCompletedAt,
            status: 'running',
            updatedAt: input.updatedAt,
            transportAttempts: [attempt],
          };
          eventValue = transportEventInput({
            runId: input.runId,
            seq,
            idempotencyKey: `jtransport:${input.runId}:${attempt.requestId}:initial_started`,
            type: 'run_state',
            status: 'running',
            title: 'Scheduled transport started',
            safeSummary: 'The scheduled provider attempt is in flight.',
            createdAt: input.updatedAt,
          });
        } else if (input.kind === 'begin_retry') {
          const latest = attempts.at(-1);
          const proof = latest?.zeroEffectEvidence;
          const availabilityKey = latest
            ? `jtransport:${input.runId}:${latest.requestId}:${latest.attemptNumber}:retry_available`
            : '';
          if (
            current.source !== 'schedule' ||
            attempts.length >= MAX_TRANSPORT_ATTEMPTS ||
            !latest ||
            latest.state !== 'retryable_failed' ||
            latest.attemptNumber !== input.expectedLatestAttemptNumber ||
            latest.effectBarrier.state !== 'open' ||
            latest.effectBarrier.version !== input.expectedBarrierVersion ||
            !proof ||
            !valuesEqual(proof, input.revalidatedEvidence) ||
            tail?.seq !== input.expectedEventTailSeq ||
            input.expectedEventTailSeq !== proof.executorClaims.throughSeq + 1 ||
            tail.idempotency_key !== availabilityKey ||
            tail.type !== 'warning' ||
            tail.status !== 'transport_retry_available' ||
            attempts.some((attempt) => attempt.requestId === input.attempt.requestId) ||
            !transportAttemptInputIsValid(input.attempt, {
              number: latest.attemptNumber + 1,
              kind: 'transport_retry',
            })
          ) {
            return { applied: false as const, current, reason: 'attempt_conflict' as const };
          }
          attempts[attempts.length - 1] = {
            ...latest,
            effectBarrier: {
              state: 'sealed_for_retry',
              version: latest.effectBarrier.version,
              updatedAt: input.updatedAt,
            },
            updatedAt: input.updatedAt,
          };
          const seq = nextSequence(tail.seq);
          const attempt: JarvisTransportAttemptV1 = {
            ...structuredClone(input.attempt),
            startedEventSeq: seq,
          };
          attempts.push(attempt);
          updated = { ...current, updatedAt: input.updatedAt, transportAttempts: attempts };
          eventValue = transportEventInput({
            runId: input.runId,
            seq,
            idempotencyKey: `jtransport:${input.runId}:${attempt.requestId}:${attempt.attemptNumber}:retry_started`,
            type: 'warning',
            status: 'transport_retry_started',
            title: 'Scheduled transport retry started',
            safeSummary: 'A verified transport retry is in flight.',
            createdAt: input.updatedAt,
          });
        } else if (input.kind === 'settle_retryable') {
          const latest = attempts.at(-1);
          if (
            current.source !== 'schedule' ||
            !latest ||
            latest.state !== 'provider_in_flight' ||
            latest.attemptNumber !== input.expectedAttemptNumber ||
            latest.effectBarrier.state !== 'open' ||
            latest.effectBarrier.version !== input.expectedBarrierVersion ||
            tail?.seq !== input.expectedEventTailSeq ||
            input.zeroEffectEvidence.executorClaims.throughSeq !== input.expectedEventTailSeq ||
            !transportEvidenceMatches(current, latest, input.providerFailure) ||
            !zeroEffectEvidenceMatches(
              current,
              latest,
              input.providerFailure,
              input.zeroEffectEvidence,
            )
          ) {
            return { applied: false as const, current, reason: 'attempt_conflict' as const };
          }
          attempts[attempts.length - 1] = {
            ...latest,
            state: 'retryable_failed',
            failureCategory: input.providerFailure.failureCategory,
            zeroEffectEvidence: structuredClone(input.zeroEffectEvidence),
            updatedAt: input.updatedAt,
          };
          updated = { ...current, updatedAt: input.updatedAt, transportAttempts: attempts };
          const seq = nextSequence(tail.seq);
          eventValue = transportEventInput({
            runId: input.runId,
            seq,
            idempotencyKey: `jtransport:${input.runId}:${latest.requestId}:${latest.attemptNumber}:retry_available`,
            type: 'warning',
            status: 'transport_retry_available',
            title: 'Scheduled transport retry available',
            safeSummary: 'The failed attempt has verified zero consequential effect.',
            createdAt: input.updatedAt,
          });
        } else {
          const latest = attempts.at(-1);
          if (
            !isFiniteTimestamp(input.completedAt) ||
            current.source !== 'schedule' ||
            !latest ||
            latest.state !== 'provider_in_flight' ||
            latest.attemptNumber !== input.expectedAttemptNumber ||
            !transportEvidenceMatches(current, latest, input.providerFailure)
          ) {
            return { applied: false as const, current, reason: 'attempt_conflict' as const };
          }
          attempts[attempts.length - 1] = {
            ...latest,
            state: 'effect_uncertain',
            failureCategory: input.providerFailure.failureCategory,
            updatedAt: input.updatedAt,
          };
          updated = {
            ...current,
            status: 'failed',
            updatedAt: input.updatedAt,
            completedAt: input.completedAt,
            transportAttempts: attempts,
          };
          const seq = nextSequence(tail?.seq);
          eventValue = transportEventInput({
            runId: input.runId,
            seq,
            idempotencyKey: `jtransport:${input.runId}:${latest.requestId}:${latest.attemptNumber}:uncertain_failed`,
            type: 'run_state',
            status: 'failed',
            title: 'Scheduled transport failed',
            safeSummary: 'The provider attempt ended with uncertain effect state.',
            createdAt: input.updatedAt,
          });
        }

        const updatedRow = toJarvisRunRow(updated);
        const eventRow = toJarvisEventRow(eventValue);
        await database.jarvis_runs.put(updatedRow);
        await database.jarvis_events.add(eventRow);
        return {
          applied: true as const,
          run: fromJarvisRunRow(updatedRow),
          event: fromJarvisEventRow(eventRow),
        };
      });
    },

    async claimAttemptEffect(input) {
      const claim = detachRepositoryInput(input, 'attempt_effect_integrity_error');
      assertAccountId(claim.accountId);
      if (
        !isPositiveSafeInteger(claim.attemptNumber) ||
        !isStableText(claim.requestId) ||
        !isStableText(claim.ownerId) ||
        !isStableText(claim.evidenceRef) ||
        !isFiniteTimestamp(claim.claimedAt)
      ) {
        repositoryError('attempt_effect_integrity_error');
      }
      if (!validateJarvisEvent(attemptEffectClaimEvent(claim, 1)).ok) {
        repositoryError('attempt_effect_integrity_error');
      }
      return database.transaction('rw', database.jarvis_runs, database.jarvis_events, async () => {
        const row = await requireOwnedRun(database, claim.accountId, claim.runId);
        const current = fromJarvisRunRow(row);
        if (current.status !== 'running') {
          return { applied: false as const, current, reason: 'status_conflict' as const };
        }
        const attempts = structuredClone([...(current.transportAttempts ?? [])]);
        if (attempts.length === 0) {
          if (current.source === 'schedule') {
            return { applied: false as const, current, reason: 'attempt_conflict' as const };
          }
          return { applied: true as const, kind: 'not_applicable' as const, run: current };
        }
        const latest = attempts.at(-1)!;
        if (
          latest.state !== 'provider_in_flight' ||
          latest.attemptNumber !== claim.attemptNumber ||
          latest.requestId !== claim.requestId
        ) {
          return { applied: false as const, current, reason: 'attempt_conflict' as const };
        }
        if (latest.effectBarrier.state === 'sealed_for_retry') {
          return { applied: false as const, current, reason: 'attempt_sealed' as const };
        }
        if (
          !Number.isSafeInteger(latest.effectBarrier.version) ||
          latest.effectBarrier.version < 0
        ) {
          repositoryError('attempt_effect_integrity_error');
        }

        const idempotencyKey = attemptEffectClaimIdempotencyKey(claim);
        const existing = await database.jarvis_events
          .where('[run_id+idempotency_key]')
          .equals([claim.runId, idempotencyKey])
          .first();
        if (existing) {
          const expectedRow = toJarvisEventRow(attemptEffectClaimEvent(claim, existing.seq));
          if (latest.effectBarrier.state !== 'dirty' || !valuesEqual(existing, expectedRow)) {
            repositoryError('attempt_effect_integrity_error');
          }
          return {
            applied: true as const,
            kind: 'barrier_claimed' as const,
            run: current,
            event: fromJarvisEventRow(existing),
          };
        }

        const tail = await lastEventForRun(database, claim.runId);
        const updatedAttempt: JarvisTransportAttemptV1 = {
          ...latest,
          effectBarrier: {
            state: 'dirty',
            version: latest.effectBarrier.version + 1,
            updatedAt: claim.claimedAt,
          },
          updatedAt: claim.claimedAt,
        };
        attempts[attempts.length - 1] = updatedAttempt;
        const updated: JarvisRun = {
          ...current,
          updatedAt: claim.claimedAt,
          transportAttempts: attempts,
        };
        const eventValue = attemptEffectClaimEvent(claim, nextSequence(tail?.seq));
        const updatedRow = toJarvisRunRow(updated);
        const eventRow = toJarvisEventRow(eventValue);
        await database.jarvis_runs.put(updatedRow);
        await database.jarvis_events.add(eventRow);
        return {
          applied: true as const,
          kind: 'barrier_claimed' as const,
          run: fromJarvisRunRow(updatedRow),
          event: fromJarvisEventRow(eventRow),
        };
      });
    },
  };

  const event: JarvisEventRepository = {
    async appendIdempotent(accountId, runId, input) {
      const eventInput = detachRepositoryInput(input, 'event_idempotency_conflict');
      assertAccountId(accountId);
      if ((eventInput as { type: JarvisEvent['type'] }).type === 'run_state') {
        repositoryError('transition_event_requires_atomic_run_update');
      }
      assertIdempotencyKey(eventInput.idempotencyKey);
      if (
        eventInput.idempotencyKey.startsWith(JARVIS_ATTEMPT_EFFECT_IDEMPOTENCY_PREFIX) ||
        eventInput.executionEvidence?.kind === 'consequential_effect_claimed'
      ) {
        repositoryError('attempt_effect_integrity_error');
      }
      if (!validateJarvisEvent({ ...eventInput, runId, seq: 1 }).ok) {
        repositoryError('event_idempotency_conflict');
      }
      return database.transaction('rw', database.jarvis_runs, database.jarvis_events, async () => {
        await requireOwnedRun(database, accountId, runId);
        const existing = await database.jarvis_events
          .where('[run_id+idempotency_key]')
          .equals([runId, eventInput.idempotencyKey])
          .first();
        if (existing) {
          const desiredRetry = toJarvisEventRow({ ...eventInput, runId, seq: existing.seq });
          if (!valuesEqual(existing, desiredRetry)) {
            repositoryError('event_idempotency_conflict');
          }
          return fromJarvisEventRow(existing);
        }

        const lastEvent = await database.jarvis_events
          .where('[run_id+seq]')
          .between([runId, Dexie.minKey], [runId, Dexie.maxKey], true, true)
          .last();
        const value: JarvisEvent = {
          ...eventInput,
          runId,
          seq: nextSequence(lastEvent?.seq),
        };
        const row = toJarvisEventRow(value);
        await database.jarvis_events.add(row);
        return fromJarvisEventRow(row);
      });
    },

    async listByRun(accountId, runId, options = {}) {
      assertAccountId(accountId);
      const limit = normalizedLimit(options.limit);
      assertAfterSeq(options.afterSeq);
      await requireOwnedRun(database, accountId, runId);
      if (options.afterSeq !== undefined) {
        const rows = await database.jarvis_events
          .where('[run_id+seq]')
          .between([runId, options.afterSeq], [runId, Dexie.maxKey], false, true)
          .limit(limit)
          .toArray();
        return rows.map(fromJarvisEventRow);
      }

      const rows = await database.jarvis_events
        .where('[run_id+seq]')
        .between([runId, Dexie.minKey], [runId, Dexie.maxKey], true, true)
        .reverse()
        .limit(limit)
        .toArray();
      rows.reverse();
      return rows.map(fromJarvisEventRow);
    },

    async getBySeq(accountId, runId, seq) {
      assertAccountId(accountId);
      if (!Number.isSafeInteger(seq) || seq < 1) repositoryError('invalid_limit');
      await requireOwnedRun(database, accountId, runId);
      const row = await database.jarvis_events.get([runId, seq]);
      return row ? fromJarvisEventRow(row) : undefined;
    },
  };

  const approval: JarvisApprovalRepository = {
    async getById(accountId, approvalId) {
      assertAccountId(accountId);
      const row = await database.jarvis_approvals.get(approvalId);
      if (!row) return undefined;
      const parent = await database.jarvis_runs.get(row.run_id);
      if (!parent || parent.account_id !== accountId) return undefined;
      return fromJarvisApprovalRow(row);
    },

    async putForRun(accountId, value) {
      assertAccountId(accountId);
      return database.transaction(
        'rw',
        database.jarvis_runs,
        database.jarvis_approvals,
        async () => {
          await requireOwnedRun(database, accountId, value.runId);
          const existing = await database.jarvis_approvals.get(value.id);
          if (existing && existing.run_id !== value.runId) {
            repositoryError('parent_run_not_found');
          }
          const row = toJarvisApprovalRow(value);
          await database.jarvis_approvals.put(row);
          return fromJarvisApprovalRow(row);
        },
      );
    },
  };

  const artifact: JarvisArtifactRepository = {
    async getById(accountId, artifactId) {
      assertAccountId(accountId);
      const row = await database.jarvis_artifacts.get(artifactId);
      if (!row) return undefined;
      const parent = await database.jarvis_runs.get(row.run_id);
      if (!parent || parent.account_id !== accountId) return undefined;
      return fromJarvisArtifactRow(row);
    },

    async listByRun(accountId, runId, inputLimit) {
      assertAccountId(accountId);
      const limit = normalizedLimit(inputLimit);
      await requireOwnedRun(database, accountId, runId);
      const rows = await database.jarvis_artifacts
        .where('run_id')
        .equals(runId)
        .limit(limit)
        .toArray();
      return rows.map(fromJarvisArtifactRow);
    },

    async putForRun(accountId, value) {
      assertAccountId(accountId);
      return database.transaction(
        'rw',
        database.jarvis_runs,
        database.jarvis_artifacts,
        async () => {
          await requireOwnedRun(database, accountId, value.runId);
          const existing = await database.jarvis_artifacts.get(value.id);
          if (existing && existing.run_id !== value.runId) {
            repositoryError('parent_run_not_found');
          }
          const row = toJarvisArtifactRow(value);
          await database.jarvis_artifacts.put(row);
          return fromJarvisArtifactRow(row);
        },
      );
    },
  };

  return { identity, profile, run, event, approval, artifact };
}

/** @internal Closed Task 18 test harness only; production modules must not import this factory. */
export function createJarvisLiveEvidenceEventCommitAuthority(
  database: JarvisDexie,
): JarvisLiveEvidenceEventCommitAuthority {
  return {
    async appendLiveEvidence(input) {
      assertAccountId(input.accountId);
      const validated = validateJarvisDurableLiveEvidence(input.evidence);
      if (!validated.ok) repositoryError('live_evidence_integrity_error');
      const evidence = structuredClone(validated.value);
      if (
        evidence.producerIdentity.producerKind !== evidence.producerKind ||
        !isPositiveSafeInteger(evidence.attemptNumber) ||
        !isPositiveSafeInteger(evidence.resultEventSeq) ||
        !isStableText(evidence.registrationId) ||
        !isStableText(evidence.resultRef) ||
        !isFiniteTimestamp(evidence.observedAt) ||
        !liveEvidenceOperationsAreClosed(evidence)
      ) {
        repositoryError('live_evidence_integrity_error');
      }
      const idempotencyKey = `jlive-event:${await sha256Hex(evidence)}`;

      return database.transaction('rw', database.jarvis_runs, database.jarvis_events, async () => {
        await requireOwnedRun(database, input.accountId, input.runId);
        if (evidence.accountId !== input.accountId || evidence.runId !== input.runId) {
          repositoryError('live_evidence_integrity_error');
        }
        const occurrence = await database.jarvis_events
          .where('[run_id+seq]')
          .between([input.runId, Dexie.minKey], [input.runId, Dexie.maxKey], true, true)
          .filter((row) => {
            const existingEvidence = row.live_evidence;
            return (
              existingEvidence !== undefined &&
              sameLiveEvidenceOccurrence(existingEvidence, evidence)
            );
          })
          .first();
        if (occurrence && !valuesEqual(occurrence.live_evidence, evidence)) {
          repositoryError('event_idempotency_conflict');
        }
        const sourceRow = await database.jarvis_events.get([input.runId, evidence.resultEventSeq]);
        if (!sourceRow) repositoryError('live_evidence_integrity_error');
        const source = fromJarvisEventRow(sourceRow).producerSourceEvidence;
        const phaseMatches =
          evidence.transition === 'completed' || evidence.transition === 'degraded'
            ? source?.phase === 'result' && source.state === evidence.transition
            : source?.phase === 'start' && source.state === evidence.transition;
        if (
          !source ||
          source.accountId !== evidence.accountId ||
          source.runId !== evidence.runId ||
          source.requestId !== evidence.requestId ||
          source.attemptNumber !== evidence.attemptNumber ||
          source.producerKind !== evidence.producerKind ||
          !valuesEqual(source.producerIdentity, evidence.producerIdentity) ||
          source.resultRef !== evidence.resultRef ||
          source.observedAt !== evidence.observedAt ||
          !phaseMatches
        ) {
          repositoryError('live_evidence_integrity_error');
        }

        const existing = await database.jarvis_events
          .where('[run_id+idempotency_key]')
          .equals([input.runId, idempotencyKey])
          .first();
        const eventType = evidence.kind === 'model' ? ('model' as const) : ('tool' as const);
        const title =
          evidence.kind === 'model'
            ? 'Model live evidence committed'
            : 'Capability live evidence committed';
        if (existing) {
          const desired = toJarvisEventRow({
            runId: input.runId,
            seq: existing.seq,
            idempotencyKey,
            type: eventType,
            status: evidence.transition,
            title,
            safeSummary: 'Canonical live evidence was recorded.',
            sourceRefs: [],
            artifactIds: [],
            createdAt: evidence.observedAt,
            liveEvidence: evidence,
          });
          if (!valuesEqual(existing, desired)) repositoryError('live_evidence_integrity_error');
          return fromJarvisEventRow(existing);
        }

        if (occurrence) repositoryError('event_idempotency_conflict');

        const tail = await lastEventForRun(database, input.runId);
        const eventValue: JarvisEvent = {
          runId: input.runId,
          seq: nextSequence(tail?.seq),
          idempotencyKey,
          type: eventType,
          status: evidence.transition,
          title,
          safeSummary: 'Canonical live evidence was recorded.',
          sourceRefs: [],
          artifactIds: [],
          createdAt: evidence.observedAt,
          liveEvidence: evidence,
        };
        const eventRow = toJarvisEventRow(eventValue);
        await database.jarvis_events.add(eventRow);
        return fromJarvisEventRow(eventRow);
      });
    },
  };
}

const globalRepositories = createJarvisRepositories(db);

export const jarvisIdentityRepo: JarvisIdentityRepository = globalRepositories.identity;
export const jarvisProfileRepo: JarvisProfileRepository = globalRepositories.profile;
export const jarvisRunRepo: JarvisRunRepository = globalRepositories.run;
export const jarvisEventRepo: JarvisEventRepository = globalRepositories.event;
export const jarvisApprovalRepo: JarvisApprovalRepository = globalRepositories.approval;
export const jarvisArtifactRepo: JarvisArtifactRepository = globalRepositories.artifact;
