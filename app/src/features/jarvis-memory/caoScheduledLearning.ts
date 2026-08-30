export type CaoLearningTrigger = 'scheduled' | 'manual_force' | 'learning_threshold';

export interface CaoScheduledLearningScope {
  accountId: string;
  workspaceId: string;
  projectId: string;
  scheduleId: string;
  targetId: string;
  scheduleAnchorAt: number;
}

export interface CaoLearningPass {
  passId: string;
  requestId: string;
  trigger: CaoLearningTrigger;
  fromSeqExclusive: number;
  throughSeqInclusive: number;
  requestedAt: number;
  scheduledDueAt?: number;
}

export interface CaoLearningCompletion extends Omit<CaoLearningPass, 'passId'> {
  passId: string | null;
  completedAt: number;
  receiptId?: string;
}

export interface CaoScheduledLearningSnapshot extends CaoScheduledLearningScope {
  schemaVersion: 1;
  revision: number;
  lastLearningSeqConsumed: number;
  scheduledOccurrenceCount: number;
  lastScheduledDueAt?: number;
  pending?: CaoLearningPass;
  completions: CaoLearningCompletion[];
}

export interface CaoScheduledLearningPersistence {
  load(scope: CaoScheduledLearningScope): Promise<unknown>;
  save(input: { expectedRevision: number; snapshot: CaoScheduledLearningSnapshot }): Promise<void>;
}

export interface CaoLearningExecutionInput {
  accountId: string;
  workspaceId: string;
  projectId: string;
  scheduleId: string;
  targetId: string;
  passId: string;
  requestId: string;
  trigger: CaoLearningTrigger;
  fromSeqExclusive: number;
  throughSeqInclusive: number;
  requestedAt: number;
  scheduledDueAt?: number;
}

export type CaoLearningExecutionResult =
  { status: 'completed'; receiptId: string } | { status: 'failed' | 'cancelled' };

export interface CaoScheduledLearningRunInput extends CaoScheduledLearningScope {
  trigger: CaoLearningTrigger;
  requestId: string;
  journalHighWaterSeq: number;
  scheduledDueAt?: number;
}

export type CaoScheduledLearningRunResult = {
  status: 'completed' | 'failed' | 'cancelled';
  passId: string | null;
  consumed: { fromSeqExclusive: number; throughSeqInclusive: number };
  scheduledOccurrenceCount: number;
  deduplicated: boolean;
};

export type CaoScheduledLearningErrorCode =
  | 'invalid_cao_learning_input'
  | 'invalid_cao_learning_snapshot'
  | 'cao_learning_scope_mismatch'
  | 'cao_learning_persistence_failed'
  | 'cao_learning_pending_recovery_required'
  | 'journal_cursor_regressed'
  | 'request_id_conflict'
  | 'scheduled_occurrence_regressed'
  | 'invalid_learning_receipt';

export class CaoScheduledLearningError extends Error {
  readonly code: CaoScheduledLearningErrorCode;

  constructor(code: CaoScheduledLearningErrorCode) {
    super(code);
    this.name = 'CaoScheduledLearningError';
    this.code = code;
  }
}

interface CaoScheduledLearningControllerDeps {
  persistence: CaoScheduledLearningPersistence;
  execute(input: CaoLearningExecutionInput): Promise<CaoLearningExecutionResult>;
  now?: () => number;
  newPassId?: () => string;
}

const MAX_COMPLETIONS = 32;
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SNAPSHOT_KEYS = new Set([
  'schemaVersion',
  'revision',
  'accountId',
  'workspaceId',
  'projectId',
  'scheduleId',
  'targetId',
  'scheduleAnchorAt',
  'lastLearningSeqConsumed',
  'scheduledOccurrenceCount',
  'lastScheduledDueAt',
  'pending',
  'completions',
]);
const PASS_KEYS = new Set([
  'passId',
  'requestId',
  'trigger',
  'fromSeqExclusive',
  'throughSeqInclusive',
  'requestedAt',
  'scheduledDueAt',
]);
const COMPLETION_KEYS = new Set([...PASS_KEYS, 'completedAt', 'receiptId']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isOpaqueId(value: unknown): value is string {
  return typeof value === 'string' && OPAQUE_ID.test(value);
}

function isCounter(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isTrigger(value: unknown): value is CaoLearningTrigger {
  return value === 'scheduled' || value === 'manual_force' || value === 'learning_threshold';
}

function parsePass(value: unknown, allowEmpty = false): CaoLearningPass | null {
  if (!isRecord(value) || !hasOnlyKeys(value, PASS_KEYS)) return null;
  if (
    !isOpaqueId(value.passId) ||
    !isOpaqueId(value.requestId) ||
    !isTrigger(value.trigger) ||
    !isCounter(value.fromSeqExclusive) ||
    !isCounter(value.throughSeqInclusive) ||
    (allowEmpty
      ? value.throughSeqInclusive < value.fromSeqExclusive
      : value.throughSeqInclusive <= value.fromSeqExclusive) ||
    !isTimestamp(value.requestedAt)
  ) {
    return null;
  }
  const scheduled = value.trigger === 'scheduled';
  if (scheduled !== isTimestamp(value.scheduledDueAt)) return null;
  return {
    passId: value.passId,
    requestId: value.requestId,
    trigger: value.trigger,
    fromSeqExclusive: value.fromSeqExclusive,
    throughSeqInclusive: value.throughSeqInclusive,
    requestedAt: value.requestedAt,
    ...(scheduled ? { scheduledDueAt: value.scheduledDueAt as number } : {}),
  };
}

function parseCompletion(value: unknown): CaoLearningCompletion | null {
  if (!isRecord(value) || !hasOnlyKeys(value, COMPLETION_KEYS)) return null;
  const pass = parsePass(
    {
      passId: value.passId ?? 'no_delta',
      requestId: value.requestId,
      trigger: value.trigger,
      fromSeqExclusive: value.fromSeqExclusive,
      throughSeqInclusive: value.throughSeqInclusive,
      requestedAt: value.requestedAt,
      ...(value.scheduledDueAt !== undefined ? { scheduledDueAt: value.scheduledDueAt } : {}),
    },
    true,
  );
  if (!pass || !isTimestamp(value.completedAt)) return null;
  if (value.passId !== null && !isOpaqueId(value.passId)) return null;
  if (value.passId === null && value.fromSeqExclusive !== value.throughSeqInclusive) return null;
  if (value.passId !== null && !isOpaqueId(value.receiptId)) return null;
  if (value.passId === null && value.receiptId !== undefined) return null;
  return {
    ...pass,
    passId: value.passId as string | null,
    completedAt: value.completedAt,
    ...(typeof value.receiptId === 'string' ? { receiptId: value.receiptId } : {}),
  };
}

export function parseCaoScheduledLearningSnapshot(
  value: unknown,
): CaoScheduledLearningSnapshot | null {
  if (!isRecord(value) || !hasOnlyKeys(value, SNAPSHOT_KEYS)) return null;
  if (
    value.schemaVersion !== 1 ||
    !isCounter(value.revision) ||
    !isOpaqueId(value.accountId) ||
    !isOpaqueId(value.workspaceId) ||
    !isOpaqueId(value.projectId) ||
    !isOpaqueId(value.scheduleId) ||
    !isOpaqueId(value.targetId) ||
    !isTimestamp(value.scheduleAnchorAt) ||
    !isCounter(value.lastLearningSeqConsumed) ||
    !isCounter(value.scheduledOccurrenceCount) ||
    (value.lastScheduledDueAt !== undefined && !isTimestamp(value.lastScheduledDueAt)) ||
    !Array.isArray(value.completions) ||
    value.completions.length > MAX_COMPLETIONS
  ) {
    return null;
  }
  const pending = value.pending === undefined ? undefined : parsePass(value.pending);
  if (value.pending !== undefined && !pending) return null;
  if (
    pending?.fromSeqExclusive !== undefined &&
    pending.fromSeqExclusive !== value.lastLearningSeqConsumed
  )
    return null;
  if (
    pending?.trigger === 'scheduled' &&
    Number(pending.scheduledDueAt) < Number(value.scheduleAnchorAt)
  )
    return null;
  const completions = value.completions.map(parseCompletion);
  if (completions.some((entry) => entry === null)) return null;
  const completed = completions as CaoLearningCompletion[];
  if (new Set(completed.map((entry) => entry.requestId)).size !== completed.length) return null;
  if (completed.some((entry) => entry.throughSeqInclusive > Number(value.lastLearningSeqConsumed)))
    return null;
  if (
    value.lastScheduledDueAt !== undefined &&
    Number(value.lastScheduledDueAt) < Number(value.scheduleAnchorAt)
  )
    return null;
  if ((value.scheduledOccurrenceCount === 0) !== (value.lastScheduledDueAt === undefined))
    return null;
  if (
    completed.some(
      (entry) =>
        entry.completedAt < entry.requestedAt ||
        (entry.trigger === 'scheduled' &&
          Number(entry.scheduledDueAt) < Number(value.scheduleAnchorAt)),
    )
  )
    return null;
  return {
    schemaVersion: 1,
    revision: value.revision,
    accountId: value.accountId,
    workspaceId: value.workspaceId,
    projectId: value.projectId,
    scheduleId: value.scheduleId,
    targetId: value.targetId,
    scheduleAnchorAt: value.scheduleAnchorAt,
    lastLearningSeqConsumed: value.lastLearningSeqConsumed,
    scheduledOccurrenceCount: value.scheduledOccurrenceCount,
    ...(value.lastScheduledDueAt !== undefined
      ? { lastScheduledDueAt: value.lastScheduledDueAt as number }
      : {}),
    ...(pending ? { pending } : {}),
    completions: completed,
  };
}

function assertScope(scope: CaoScheduledLearningScope): void {
  if (
    !isOpaqueId(scope.accountId) ||
    !isOpaqueId(scope.workspaceId) ||
    !isOpaqueId(scope.projectId) ||
    !isOpaqueId(scope.scheduleId) ||
    !isOpaqueId(scope.targetId) ||
    !isTimestamp(scope.scheduleAnchorAt)
  ) {
    throw new CaoScheduledLearningError('invalid_cao_learning_input');
  }
}

function scopeMatches(
  snapshot: CaoScheduledLearningSnapshot,
  scope: CaoScheduledLearningScope,
): boolean {
  return (
    snapshot.accountId === scope.accountId &&
    snapshot.workspaceId === scope.workspaceId &&
    snapshot.projectId === scope.projectId &&
    snapshot.scheduleId === scope.scheduleId &&
    snapshot.targetId === scope.targetId &&
    snapshot.scheduleAnchorAt === scope.scheduleAnchorAt
  );
}

function initialSnapshot(scope: CaoScheduledLearningScope): CaoScheduledLearningSnapshot {
  return {
    schemaVersion: 1,
    revision: 0,
    accountId: scope.accountId,
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    scheduleId: scope.scheduleId,
    targetId: scope.targetId,
    scheduleAnchorAt: scope.scheduleAnchorAt,
    lastLearningSeqConsumed: 0,
    scheduledOccurrenceCount: 0,
    completions: [],
  };
}

function storageScope(scope: CaoScheduledLearningScope): CaoScheduledLearningScope {
  return {
    accountId: scope.accountId,
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    scheduleId: scope.scheduleId,
    targetId: scope.targetId,
    scheduleAnchorAt: scope.scheduleAnchorAt,
  };
}

function sameRequest(
  value: Pick<CaoLearningPass, 'requestId' | 'trigger' | 'throughSeqInclusive' | 'scheduledDueAt'>,
  input: CaoScheduledLearningRunInput,
): boolean {
  return (
    value.requestId === input.requestId &&
    value.trigger === input.trigger &&
    value.throughSeqInclusive === input.journalHighWaterSeq &&
    value.scheduledDueAt === input.scheduledDueAt
  );
}

function resultFromCompletion(
  completion: CaoLearningCompletion,
  count: number,
  deduplicated: boolean,
): CaoScheduledLearningRunResult {
  return {
    status: 'completed',
    passId: completion.passId,
    consumed: {
      fromSeqExclusive: completion.fromSeqExclusive,
      throughSeqInclusive: completion.throughSeqInclusive,
    },
    scheduledOccurrenceCount: count,
    deduplicated,
  };
}

export function createCaoScheduledLearningController(deps: CaoScheduledLearningControllerDeps) {
  const now = deps.now ?? Date.now;
  const newPassId =
    deps.newPassId ??
    (() => {
      if (!globalThis.crypto?.randomUUID)
        throw new CaoScheduledLearningError('invalid_cao_learning_input');
      return `cao_pass_${globalThis.crypto.randomUUID()}`;
    });
  let queue: Promise<unknown> = Promise.resolve();

  const serialized = <T>(operation: () => Promise<T>): Promise<T> => {
    const pending = queue.then(operation, operation);
    queue = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  };

  const load = async (scope: CaoScheduledLearningScope) => {
    let raw: unknown;
    try {
      raw = await deps.persistence.load(storageScope(scope));
    } catch {
      throw new CaoScheduledLearningError('cao_learning_persistence_failed');
    }
    if (raw === null || raw === undefined) return initialSnapshot(scope);
    const parsed = parseCaoScheduledLearningSnapshot(raw);
    if (!parsed) throw new CaoScheduledLearningError('invalid_cao_learning_snapshot');
    if (!scopeMatches(parsed, scope))
      throw new CaoScheduledLearningError('cao_learning_scope_mismatch');
    return parsed;
  };

  const save = async (
    previous: CaoScheduledLearningSnapshot,
    next: Omit<CaoScheduledLearningSnapshot, 'revision'>,
  ): Promise<CaoScheduledLearningSnapshot> => {
    const snapshot: CaoScheduledLearningSnapshot = {
      ...next,
      revision: previous.revision + 1,
    };
    if (!parseCaoScheduledLearningSnapshot(snapshot) || !scopeMatches(snapshot, previous)) {
      throw new CaoScheduledLearningError('invalid_cao_learning_snapshot');
    }
    try {
      await deps.persistence.save({ expectedRevision: previous.revision, snapshot });
    } catch {
      throw new CaoScheduledLearningError('cao_learning_persistence_failed');
    }
    return snapshot;
  };

  const settlePending = async (
    snapshot: CaoScheduledLearningSnapshot,
  ): Promise<CaoScheduledLearningRunResult> => {
    const pending = snapshot.pending;
    if (!pending) throw new CaoScheduledLearningError('invalid_cao_learning_snapshot');
    let outcome: CaoLearningExecutionResult;
    try {
      outcome = await deps.execute({
        accountId: snapshot.accountId,
        workspaceId: snapshot.workspaceId,
        projectId: snapshot.projectId,
        scheduleId: snapshot.scheduleId,
        targetId: snapshot.targetId,
        ...pending,
      });
    } catch {
      outcome = { status: 'failed' };
    }
    if (outcome.status === 'completed' && !isOpaqueId(outcome.receiptId)) {
      const { pending: _pending, ...withoutPending } = snapshot;
      await save(snapshot, withoutPending);
      throw new CaoScheduledLearningError('invalid_learning_receipt');
    }
    if (outcome.status !== 'completed') {
      const { pending: _pending, ...withoutPending } = snapshot;
      const settled = await save(snapshot, withoutPending);
      return {
        status: outcome.status,
        passId: pending.passId,
        consumed: {
          fromSeqExclusive: pending.fromSeqExclusive,
          throughSeqInclusive: pending.throughSeqInclusive,
        },
        scheduledOccurrenceCount: settled.scheduledOccurrenceCount,
        deduplicated: false,
      };
    }
    const completion: CaoLearningCompletion = {
      ...pending,
      completedAt: now(),
      receiptId: outcome.receiptId,
    };
    const { pending: _pending, ...withoutPending } = snapshot;
    const settled = await save(snapshot, {
      ...withoutPending,
      lastLearningSeqConsumed: pending.throughSeqInclusive,
      scheduledOccurrenceCount:
        snapshot.scheduledOccurrenceCount + Number(pending.trigger === 'scheduled'),
      ...(pending.trigger === 'scheduled'
        ? { lastScheduledDueAt: pending.scheduledDueAt }
        : snapshot.lastScheduledDueAt !== undefined
          ? { lastScheduledDueAt: snapshot.lastScheduledDueAt }
          : {}),
      completions: [...snapshot.completions, completion].slice(-MAX_COMPLETIONS),
    });
    return resultFromCompletion(completion, settled.scheduledOccurrenceCount, false);
  };

  const run = (input: CaoScheduledLearningRunInput) =>
    serialized(async (): Promise<CaoScheduledLearningRunResult> => {
      assertScope(input);
      if (
        !isTrigger(input.trigger) ||
        !isOpaqueId(input.requestId) ||
        !isCounter(input.journalHighWaterSeq) ||
        (input.trigger === 'scheduled') !== isTimestamp(input.scheduledDueAt)
      ) {
        throw new CaoScheduledLearningError('invalid_cao_learning_input');
      }
      if (input.trigger === 'scheduled' && Number(input.scheduledDueAt) < input.scheduleAnchorAt) {
        throw new CaoScheduledLearningError('scheduled_occurrence_regressed');
      }
      const snapshot = await load(input);
      const completed = snapshot.completions.find((entry) => entry.requestId === input.requestId);
      if (completed) {
        if (!sameRequest(completed, input))
          throw new CaoScheduledLearningError('request_id_conflict');
        return resultFromCompletion(completed, snapshot.scheduledOccurrenceCount, true);
      }
      if (snapshot.pending) {
        if (!sameRequest(snapshot.pending, input))
          throw new CaoScheduledLearningError('cao_learning_pending_recovery_required');
        return settlePending(snapshot);
      }
      if (input.journalHighWaterSeq < snapshot.lastLearningSeqConsumed)
        throw new CaoScheduledLearningError('journal_cursor_regressed');
      if (
        input.trigger === 'scheduled' &&
        snapshot.lastScheduledDueAt !== undefined &&
        Number(input.scheduledDueAt) <= snapshot.lastScheduledDueAt
      ) {
        throw new CaoScheduledLearningError('scheduled_occurrence_regressed');
      }
      if (input.journalHighWaterSeq === snapshot.lastLearningSeqConsumed) {
        const completion: CaoLearningCompletion = {
          passId: null,
          requestId: input.requestId,
          trigger: input.trigger,
          fromSeqExclusive: snapshot.lastLearningSeqConsumed,
          throughSeqInclusive: input.journalHighWaterSeq,
          requestedAt: now(),
          completedAt: now(),
          ...(input.trigger === 'scheduled' ? { scheduledDueAt: input.scheduledDueAt } : {}),
        };
        const settled = await save(snapshot, {
          ...snapshot,
          scheduledOccurrenceCount:
            snapshot.scheduledOccurrenceCount + Number(input.trigger === 'scheduled'),
          ...(input.trigger === 'scheduled'
            ? { lastScheduledDueAt: input.scheduledDueAt }
            : snapshot.lastScheduledDueAt !== undefined
              ? { lastScheduledDueAt: snapshot.lastScheduledDueAt }
              : {}),
          completions: [...snapshot.completions, completion].slice(-MAX_COMPLETIONS),
        });
        return resultFromCompletion(completion, settled.scheduledOccurrenceCount, false);
      }
      const passId = newPassId();
      if (!isOpaqueId(passId)) throw new CaoScheduledLearningError('invalid_cao_learning_input');
      const pending: CaoLearningPass = {
        passId,
        requestId: input.requestId,
        trigger: input.trigger,
        fromSeqExclusive: snapshot.lastLearningSeqConsumed,
        throughSeqInclusive: input.journalHighWaterSeq,
        requestedAt: now(),
        ...(input.trigger === 'scheduled' ? { scheduledDueAt: input.scheduledDueAt } : {}),
      };
      const durablePending = await save(snapshot, { ...snapshot, pending });
      return settlePending(durablePending);
    });

  const recover = (scope: CaoScheduledLearningScope) =>
    serialized(async (): Promise<CaoScheduledLearningRunResult | null> => {
      assertScope(scope);
      const snapshot = await load(scope);
      if (!snapshot.pending) return null;
      return settlePending(snapshot);
    });

  return { run, recover };
}
