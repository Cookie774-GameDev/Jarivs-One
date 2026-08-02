import type {
  AllocateJarvisRunInput,
  JarvisEvent,
  JarvisExecutionJournal,
  JarvisRun,
  TransitionJarvisRunInput,
} from '@/lib/jarvis/contracts/execution';
import {
  JarvisRepositoryError,
  type JarvisNonTransitionEventInput,
  type JarvisRepositories,
} from '@/lib/db/jarvisRepositories';
import { assertJarvisRunTransition } from './stateMachine';

const JARVIS_RUN_ID = /^jrun_[A-Za-z0-9][A-Za-z0-9_-]*$/;

function defaultNewRunId(): string {
  return `jrun_${crypto.randomUUID()}`;
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

function allocationMatches(run: JarvisRun, input: AllocateJarvisRunInput): boolean {
  const immutableRunPayload = {
    accountId: run.accountId,
    workspaceId: run.workspaceId,
    projectId: run.projectId,
    chatId: run.chatId,
    parentRunId: run.parentRunId,
    source: run.source,
    agentId: run.agentId,
    identityVersion: run.identityVersion,
    profileRevisionId: run.profileRevisionId,
    model: run.model,
  };
  const immutableInputPayload = {
    accountId: input.accountId,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    chatId: input.chatId,
    parentRunId: input.parentRunId,
    source: input.source,
    agentId: input.agentId,
    identityVersion: input.identityVersion,
    profileRevisionId: input.profileRevisionId,
    model: input.model,
  };
  return valuesEqual(immutableRunPayload, immutableInputPayload);
}

function assertRunId(runId: string): void {
  if (!JARVIS_RUN_ID.test(runId)) {
    throw new JarvisExecutionJournalValidationError('invalid_jarvis_run_id');
  }
}

function assertTimestamp(value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new JarvisExecutionJournalValidationError('invalid_journal_timestamp');
  }
}

export type JarvisExecutionJournalValidationErrorCode =
  | 'invalid_jarvis_run_id'
  | 'invalid_journal_timestamp'
  | 'transition_event_requires_atomic_run_update';

export class JarvisExecutionJournalValidationError extends Error {
  readonly code: JarvisExecutionJournalValidationErrorCode;

  constructor(code: JarvisExecutionJournalValidationErrorCode) {
    super(code);
    this.name = 'JarvisExecutionJournalValidationError';
    this.code = code;
  }
}

export class JarvisRunAllocationConflictError extends Error {
  readonly code = 'run_allocation_conflict';
  readonly runId: string;

  constructor(runId: string) {
    super(`run_allocation_conflict:${runId}`);
    this.name = 'JarvisRunAllocationConflictError';
    this.runId = runId;
  }
}

export class JarvisTransitionConflictError extends Error {
  readonly code = 'run_transition_conflict';
  readonly current: JarvisRun;

  constructor(current: JarvisRun) {
    super(`run_transition_conflict:${current.id}:${current.status}`);
    this.name = 'JarvisTransitionConflictError';
    this.current = structuredClone(current);
  }
}

export function createJarvisExecutionJournal(
  repositories: JarvisRepositories,
  dependencies: { now?: () => number; newRunId?: () => string } = {},
): JarvisExecutionJournal {
  const now = dependencies.now ?? Date.now;
  const newRunId = dependencies.newRunId ?? defaultNewRunId;

  return {
    async allocateRun(input) {
      const runId = input.id ?? newRunId();
      assertRunId(runId);
      const existing = await repositories.run.getById(input.accountId, runId);
      if (existing) {
        if (!allocationMatches(existing, input)) throw new JarvisRunAllocationConflictError(runId);
        return existing;
      }
      const allocatedAt = now();
      assertTimestamp(allocatedAt);
      const run: JarvisRun = {
        ...input,
        id: runId,
        status: 'queued',
        createdAt: allocatedAt,
        updatedAt: allocatedAt,
      };
      try {
        return await repositories.run.createIdempotent(run);
      } catch (error) {
        if (error instanceof JarvisRepositoryError && error.code === 'run_id_conflict') {
          const concurrent = await repositories.run.getById(input.accountId, runId);
          if (concurrent && allocationMatches(concurrent, input)) return concurrent;
          throw new JarvisRunAllocationConflictError(runId);
        }
        throw error;
      }
    },

    getRun(accountId, runId) {
      return repositories.run.getById(accountId, runId);
    },

    appendEvent(accountId, runId, event) {
      if (event.type === 'run_state') {
        throw new JarvisExecutionJournalValidationError(
          'transition_event_requires_atomic_run_update',
        );
      }
      return repositories.event.appendIdempotent(
        accountId,
        runId,
        event as JarvisNonTransitionEventInput,
      );
    },

    async transitionRun(input: TransitionJarvisRunInput) {
      assertJarvisRunTransition(input.expectedStatus, input.nextStatus);
      const updatedAt = now();
      assertTimestamp(updatedAt);
      if (input.completedAt !== undefined) assertTimestamp(input.completedAt);
      const result = await repositories.run.compareAndAppendTransitionEvent({
        accountId: input.accountId,
        runId: input.runId,
        expectedStatus: input.expectedStatus,
        nextStatus: input.nextStatus,
        updatedAt,
        ...(input.completedAt === undefined ? {} : { completedAt: input.completedAt }),
        event: input.event,
      });
      if (!result.applied) throw new JarvisTransitionConflictError(result.current);
      return result.run;
    },
  };
}

export type { AllocateJarvisRunInput, JarvisExecutionJournal, TransitionJarvisRunInput };
export type { JarvisEvent };
