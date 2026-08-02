import {
  DEFAULT_SUBAGENT_LIFECYCLE_LIMITS,
  type DelegatedFileClaim,
  type DelegatedWorkItem,
  type SubagentAttempt,
  type SubagentLifecycleCheckpoint,
  type SubagentLifecycleLimits,
  type SubagentResult,
} from './contracts';
import {
  createDelegationPlanValidator,
  SubagentLifecycleError,
  type SubagentLifecycleErrorCode,
} from './planValidator';
import {
  createInMemorySubagentLifecycleRepository,
  type InMemorySubagentLifecycleRepository,
} from './repository';
import { validateSubagentResult } from './resultValidator';

const TERMINAL_STATUSES = new Set(['completed', 'partial', 'blocked', 'failed', 'cancelled']);
const ATTEMPT_STATUSES = new Set(['queued', 'running', 'reconnecting', ...TERMINAL_STATUSES]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/u;

function fail(code: SubagentLifecycleErrorCode): never {
  throw new SubagentLifecycleError(code);
}

function safeTime(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) return fail('invalid_input');
  return value;
}

function safeId(value: string): string {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) return fail('invalid_input');
  return value;
}

function pathsOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function claimsConflict(
  leftClaims: readonly DelegatedFileClaim[],
  rightClaims: readonly DelegatedFileClaim[],
): boolean {
  return leftClaims.some((left) =>
    rightClaims.some(
      (right) =>
        pathsOverlap(left.path, right.path) &&
        (left.access === 'write' || right.access === 'write'),
    ),
  );
}

function running(attempt: SubagentAttempt): boolean {
  return attempt.status === 'running' || attempt.status === 'reconnecting';
}

export interface SubagentLifecycleCoreOptions {
  limits?: SubagentLifecycleLimits;
  repository?: InMemorySubagentLifecycleRepository;
  checkpoint?: SubagentLifecycleCheckpoint;
  restartAt?: number;
}

export function createSubagentLifecycleCore(options: SubagentLifecycleCoreOptions = {}) {
  const limits = Object.freeze({ ...(options.limits ?? DEFAULT_SUBAGENT_LIFECYCLE_LIMITS) });
  const repository = options.repository ?? createInMemorySubagentLifecycleRepository();
  const validator = createDelegationPlanValidator(limits);

  if (options.checkpoint !== undefined) {
    if (
      options.repository !== undefined ||
      options.checkpoint.version !== 1 ||
      !Array.isArray(options.checkpoint.attempts) ||
      options.restartAt === undefined
    ) {
      return fail('invalid_checkpoint');
    }
    const restartAt = safeTime(options.restartAt);
    for (const raw of options.checkpoint.attempts) {
      const workItem = validator.validate(raw.workItem);
      if (
        raw.workItemId !== workItem.id ||
        raw.ownerId !== workItem.ownerId ||
        raw.parentRunId !== workItem.parentRunId ||
        !SAFE_ID.test(raw.id) ||
        !Number.isSafeInteger(raw.attemptNumber) ||
        raw.attemptNumber < 1 ||
        !ATTEMPT_STATUSES.has(raw.status) ||
        !Number.isSafeInteger(raw.createdAt) ||
        raw.createdAt < 0
      ) {
        return fail('invalid_checkpoint');
      }
      const result =
        raw.result === undefined ? undefined : validateSubagentResult(raw.result, workItem, raw.id);
      if (raw.status === 'completed' && result?.status !== 'completed') {
        return fail('invalid_checkpoint');
      }
      let restored: SubagentAttempt = Object.freeze({ ...raw, workItem, result });
      if (raw.status === 'running') {
        if (raw.remoteJob?.reconnectSupported === true) {
          restored = Object.freeze({ ...restored, status: 'reconnecting' });
        } else {
          restored = Object.freeze({
            ...restored,
            status: 'failed',
            finishedAt: restartAt,
            retryable: true,
            warning:
              raw.remoteJob === undefined ? 'local_process_lost' : 'remote_reconnect_unsupported',
          });
        }
      } else if (raw.status === 'reconnecting' && raw.remoteJob?.reconnectSupported !== true) {
        restored = Object.freeze({
          ...restored,
          status: 'failed',
          finishedAt: restartAt,
          retryable: true,
          warning: 'remote_reconnect_unsupported',
        });
      }
      repository.save(restored);
    }
  }

  function exactAttempt(ownerId: string, parentRunId: string, attemptId: string): SubagentAttempt {
    const attempt = repository.attempt(ownerId, parentRunId, attemptId);
    return attempt ?? fail('attempt_not_found');
  }

  return Object.freeze({
    submit(input: DelegatedWorkItem, nowInput: number): SubagentAttempt {
      const workItem = validator.validate(input);
      const now = safeTime(nowInput);
      const runAttempts = repository.attemptsForRun(workItem.ownerId, workItem.parentRunId);
      if (repository.attemptsForWork(workItem.ownerId, workItem.parentRunId, workItem.id).length) {
        return fail('work_item_exists');
      }
      for (const dependency of workItem.dependencies) {
        if (
          repository.attemptsForWork(workItem.ownerId, workItem.parentRunId, dependency).length ===
          0
        ) {
          return fail('dependency_missing');
        }
      }
      if (runAttempts.filter((attempt) => attempt.status === 'queued').length >= limits.maxQueued) {
        return fail('queue_capacity');
      }
      const attempt: SubagentAttempt = Object.freeze({
        id: `${workItem.id}:attempt:1`,
        workItemId: workItem.id,
        ownerId: workItem.ownerId,
        parentRunId: workItem.parentRunId,
        attemptNumber: 1,
        status: 'queued',
        workItem,
        createdAt: now,
        retryable: false,
      });
      repository.save(attempt);
      return attempt;
    },

    startNext(input: {
      ownerId: string;
      parentRunId: string;
      now: number;
    }):
      | Readonly<{ status: 'started'; attempt: SubagentAttempt }>
      | Readonly<{ status: 'blocked'; code: string }> {
      const now = safeTime(input.now);
      const runAttempts = repository.attemptsForRun(input.ownerId, input.parentRunId);
      if (runAttempts.filter(running).length >= limits.maxConcurrent) {
        return Object.freeze({ status: 'blocked', code: 'concurrent_capacity' });
      }
      const queued = runAttempts.filter((attempt) => attempt.status === 'queued');
      if (queued.length === 0) return Object.freeze({ status: 'blocked', code: 'queue_empty' });
      const candidate = queued[0];
      for (const dependencyId of candidate.workItem.dependencies) {
        const dependencyAttempts = repository.attemptsForWork(
          input.ownerId,
          input.parentRunId,
          dependencyId,
        );
        const latest = dependencyAttempts.at(-1);
        if (!latest) return Object.freeze({ status: 'blocked', code: 'dependency_missing' });
        if (latest.status !== 'completed') {
          return Object.freeze({
            status: 'blocked',
            code: TERMINAL_STATUSES.has(latest.status) ? 'dependency_failed' : 'dependency_pending',
          });
        }
      }
      const conflict = repository
        .allAttempts()
        .filter(running)
        .some((attempt) =>
          claimsConflict(candidate.workItem.fileClaims, attempt.workItem.fileClaims),
        );
      if (conflict) return Object.freeze({ status: 'blocked', code: 'claim_conflict' });
      const started: SubagentAttempt = Object.freeze({
        ...candidate,
        status: 'running',
        startedAt: now,
      });
      repository.save(started);
      return Object.freeze({ status: 'started', attempt: started });
    },

    cancelAttempt(input: {
      ownerId: string;
      parentRunId: string;
      attemptId: string;
      now: number;
    }): SubagentAttempt {
      const attempt = exactAttempt(input.ownerId, input.parentRunId, input.attemptId);
      if (TERMINAL_STATUSES.has(attempt.status)) return fail('terminal_immutable');
      const cancelled: SubagentAttempt = Object.freeze({
        ...attempt,
        status: 'cancelled',
        finishedAt: safeTime(input.now),
        retryable: true,
      });
      repository.save(cancelled);
      return cancelled;
    },

    attachRemoteJob(input: {
      ownerId: string;
      parentRunId: string;
      attemptId: string;
      remoteJobId: string;
      reconnectSupported: boolean;
    }): SubagentAttempt {
      const attempt = exactAttempt(input.ownerId, input.parentRunId, input.attemptId);
      if (attempt.status !== 'running') {
        return TERMINAL_STATUSES.has(attempt.status)
          ? fail('terminal_immutable')
          : fail('invalid_input');
      }
      const updated: SubagentAttempt = Object.freeze({
        ...attempt,
        remoteJob: Object.freeze({
          id: safeId(input.remoteJobId),
          reconnectSupported: input.reconnectSupported === true,
        }),
      });
      repository.save(updated);
      return updated;
    },

    completeAttempt(input: SubagentResult, nowInput: number): SubagentAttempt {
      const attempt = exactAttempt(input.ownerId, input.parentRunId, input.attemptId);
      if (TERMINAL_STATUSES.has(attempt.status)) return fail('terminal_immutable');
      if (attempt.status !== 'running' && attempt.status !== 'reconnecting') {
        return fail('invalid_input');
      }
      const result = validateSubagentResult(input, attempt.workItem, attempt.id);
      const completed: SubagentAttempt = Object.freeze({
        ...attempt,
        status: result.status,
        result,
        finishedAt: safeTime(nowInput),
        retryable: result.status !== 'completed',
      });
      repository.save(completed);
      return completed;
    },

    retryAttempt(input: {
      ownerId: string;
      parentRunId: string;
      attemptId: string;
      now: number;
    }): SubagentAttempt {
      const previous = exactAttempt(input.ownerId, input.parentRunId, input.attemptId);
      if (!TERMINAL_STATUSES.has(previous.status) || previous.status === 'completed') {
        return fail('retry_not_allowed');
      }
      const runAttempts = repository.attemptsForRun(input.ownerId, input.parentRunId);
      if (runAttempts.filter((attempt) => attempt.status === 'queued').length >= limits.maxQueued) {
        return fail('queue_capacity');
      }
      const attempts = repository.attemptsForWork(
        input.ownerId,
        input.parentRunId,
        previous.workItemId,
      );
      if (attempts.at(-1)?.id !== previous.id) return fail('retry_not_allowed');
      const attemptNumber = previous.attemptNumber + 1;
      const retry: SubagentAttempt = Object.freeze({
        id: `${previous.workItemId}:attempt:${attemptNumber}`,
        workItemId: previous.workItemId,
        ownerId: previous.ownerId,
        parentRunId: previous.parentRunId,
        attemptNumber,
        status: 'queued',
        workItem: previous.workItem,
        createdAt: safeTime(input.now),
        retryable: false,
      });
      repository.save(retry);
      return retry;
    },

    enforceTimeouts(nowInput: number): readonly SubagentAttempt[] {
      const now = safeTime(nowInput);
      const expired = repository
        .allAttempts()
        .filter(
          (attempt) =>
            running(attempt) &&
            attempt.startedAt !== undefined &&
            now >= attempt.startedAt + attempt.workItem.timeoutMs,
        )
        .map((attempt): SubagentAttempt => {
          const failed = Object.freeze({
            ...attempt,
            status: 'failed' as const,
            finishedAt: now,
            retryable: true,
            warning: 'timeout_exceeded',
          });
          repository.save(failed);
          return failed;
        });
      return Object.freeze(expired);
    },

    synthesisStatus(
      ownerId: string,
      parentRunId: string,
    ): Readonly<{
      complete: boolean;
      code: 'complete' | 'required_work_incomplete';
      incompleteWorkItemIds: readonly string[];
    }> {
      const attempts = repository.attemptsForRun(safeId(ownerId), safeId(parentRunId));
      const requiredIds = [
        ...new Set(
          attempts
            .filter((attempt) => attempt.workItem.required)
            .map((attempt) => attempt.workItemId),
        ),
      ].sort();
      const incompleteWorkItemIds = requiredIds.filter((workItemId) => {
        const latest = repository.attemptsForWork(ownerId, parentRunId, workItemId).at(-1);
        return latest?.status !== 'completed' || latest.result?.status !== 'completed';
      });
      return Object.freeze({
        complete: incompleteWorkItemIds.length === 0,
        code: incompleteWorkItemIds.length === 0 ? 'complete' : 'required_work_incomplete',
        incompleteWorkItemIds: Object.freeze(incompleteWorkItemIds),
      });
    },

    checkpoint(): SubagentLifecycleCheckpoint {
      return Object.freeze({
        version: 1,
        attempts: Object.freeze(
          repository
            .allAttempts()
            .map((attempt) => Object.freeze({ ...attempt }))
            .sort(
              (left, right) =>
                left.ownerId.localeCompare(right.ownerId) ||
                left.parentRunId.localeCompare(right.parentRunId) ||
                left.id.localeCompare(right.id),
            ),
        ),
      });
    },

    getAttempt(ownerId: string, parentRunId: string, attemptId: string): SubagentAttempt {
      return exactAttempt(ownerId, parentRunId, attemptId);
    },
  });
}
