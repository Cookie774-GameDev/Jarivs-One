import type {
  IndexedSessionTurn,
  RecallScope,
  SessionContentSource,
  SessionIndexInput,
  SessionRecord,
  SessionStatus,
} from './types';

export interface StoredSession {
  session: SessionRecord;
  source: SessionContentSource;
  turns: IndexedSessionTurn[];
  tags: string[];
  status: SessionStatus;
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

function matchesScope(record: SessionRecord, scope: RecallScope): boolean {
  return (
    record.ownerId === scope.ownerId &&
    record.profileId === scope.profileId &&
    (scope.projectId === undefined || record.projectId === scope.projectId)
  );
}

export class InMemorySessionRecallRepository {
  readonly #records = new Map<string, StoredSession>();

  put(input: SessionIndexInput): void {
    const current = this.#records.get(input.session.id);
    if (
      current &&
      (current.session.ownerId !== input.session.ownerId ||
        current.session.profileId !== input.session.profileId ||
        current.session.projectId !== input.session.projectId)
    ) {
      throw new Error('Session id is already owned by a different isolation scope.');
    }
    if (current && input.session.contentRevision < current.session.contentRevision) {
      throw new Error('Session content revision cannot move backwards.');
    }
    this.#records.set(input.session.id, {
      session: copy(input.session),
      source: copy(input.source),
      turns: copy(input.turns).sort((left, right) => left.sequence - right.sequence),
      tags: [...new Set(input.tags ?? [])].sort(),
      status: input.status ?? (input.session.archivedAt === undefined ? 'active' : 'archived'),
    });
  }

  get(scope: RecallScope, sessionId: string): StoredSession | null {
    const record = this.#records.get(sessionId);
    return record && matchesScope(record.session, scope) ? copy(record) : null;
  }

  list(scope: RecallScope): StoredSession[] {
    return [...this.#records.values()]
      .filter((record) => matchesScope(record.session, scope))
      .map(copy);
  }

  delete(scope: RecallScope, sessionId: string): boolean {
    const record = this.#records.get(sessionId);
    if (!record || !matchesScope(record.session, scope)) return false;
    return this.#records.delete(sessionId);
  }

  deleteWhere(scope: RecallScope, predicate: (record: StoredSession) => boolean): number {
    let deleted = 0;
    for (const record of this.list(scope)) {
      if (predicate(record) && this.delete(scope, record.session.id)) deleted += 1;
    }
    return deleted;
  }
}
