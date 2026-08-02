import type { SubagentAttempt } from './contracts';

function attemptKey(ownerId: string, parentRunId: string, attemptId: string): string {
  return JSON.stringify([ownerId, parentRunId, attemptId]);
}

function workKey(ownerId: string, parentRunId: string, workItemId: string): string {
  return JSON.stringify([ownerId, parentRunId, workItemId]);
}

export class InMemorySubagentLifecycleRepository {
  readonly #attempts = new Map<string, SubagentAttempt>();
  readonly #attemptIdsByWork = new Map<string, string[]>();

  save(attempt: SubagentAttempt): void {
    this.#attempts.set(attemptKey(attempt.ownerId, attempt.parentRunId, attempt.id), attempt);
    const key = workKey(attempt.ownerId, attempt.parentRunId, attempt.workItemId);
    const ids = this.#attemptIdsByWork.get(key) ?? [];
    if (!ids.includes(attempt.id)) this.#attemptIdsByWork.set(key, [...ids, attempt.id]);
  }

  attempt(ownerId: string, parentRunId: string, attemptId: string): SubagentAttempt | null {
    return this.#attempts.get(attemptKey(ownerId, parentRunId, attemptId)) ?? null;
  }

  attemptsForRun(ownerId: string, parentRunId: string): readonly SubagentAttempt[] {
    return Object.freeze(
      [...this.#attempts.values()]
        .filter((attempt) => attempt.ownerId === ownerId && attempt.parentRunId === parentRunId)
        .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id)),
    );
  }

  allAttempts(): readonly SubagentAttempt[] {
    return Object.freeze([...this.#attempts.values()]);
  }

  attemptsForWork(
    ownerId: string,
    parentRunId: string,
    workItemId: string,
  ): readonly SubagentAttempt[] {
    const ids = this.#attemptIdsByWork.get(workKey(ownerId, parentRunId, workItemId)) ?? [];
    return Object.freeze(
      ids
        .map((id) => this.attempt(ownerId, parentRunId, id))
        .filter((attempt): attempt is SubagentAttempt => attempt !== null),
    );
  }
}

export function createInMemorySubagentLifecycleRepository(): InMemorySubagentLifecycleRepository {
  return new InMemorySubagentLifecycleRepository();
}
