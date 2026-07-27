import {
  consumeOneTurnTerminalContext,
  createTerminalContextSession,
  type TerminalContextSession,
} from './terminalCommandFoundation';

export type TerminalContextScope = Readonly<{
  terminalSessionId?: string | null;
  paneId?: string | null;
  projectId?: string | null;
}>;

type TerminalContextUpdate = Readonly<
  Partial<
    Pick<
      TerminalContextSession,
      'activeMapIds' | 'pinnedEntityIds' | 'activeSkillIds' | 'agentSlug' | 'mode'
    >
  >
>;

const sessions = new Map<string, TerminalContextSession>();
const listeners = new Set<(session: TerminalContextSession) => void>();

function publish(session: TerminalContextSession): void {
  for (const listener of [...listeners]) {
    try {
      listener(session);
    } catch {
      // A view subscriber cannot interrupt the terminal Context authority.
    }
  }
}

export function subscribeTerminalContextSessions(
  listener: (session: TerminalContextSession) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getTerminalContextSession(
  terminalSessionId: string,
): TerminalContextSession | null {
  return sessions.get(terminalSessionId) ?? null;
}

function sessionIdForScope(scope: TerminalContextScope): string {
  return scope.terminalSessionId ?? `external:${scope.projectId ?? 'current'}`;
}

function normalizedScope(scope: TerminalContextScope): Readonly<{
  terminalSessionId: string;
  paneId: string | null;
  projectId: string | null;
}> {
  return Object.freeze({
    terminalSessionId: sessionIdForScope(scope),
    paneId: scope.paneId ?? null,
    projectId: scope.projectId ?? null,
  });
}

function assertMatchingScope(
  current: TerminalContextSession,
  scope: ReturnType<typeof normalizedScope>,
): void {
  if (
    current.terminalSessionId !== scope.terminalSessionId ||
    current.paneId !== scope.paneId ||
    current.projectId !== scope.projectId
  ) {
    throw new Error('Terminal context scope conflict');
  }
}

export function getOrCreateTerminalContextSession(
  rawScope: TerminalContextScope,
  now = Date.now(),
): TerminalContextSession {
  const scope = normalizedScope(rawScope);
  const existing = sessions.get(scope.terminalSessionId);
  if (existing) {
    assertMatchingScope(existing, scope);
    return existing;
  }
  const created = createTerminalContextSession({
    version: 1,
    terminalSessionId: scope.terminalSessionId,
    paneId: scope.paneId,
    projectId: scope.projectId,
    activeMapIds: [],
    pinnedEntityIds: [],
    activeSkillIds: [],
    agentSlug: null,
    mode: 'persistent',
    updatedAt: now,
    contextRevision: 0,
  });
  sessions.set(created.terminalSessionId, created);
  publish(created);
  return created;
}

export function updateTerminalContextSession(
  scope: TerminalContextScope,
  update: TerminalContextUpdate,
  now = Date.now(),
): TerminalContextSession {
  const current = getOrCreateTerminalContextSession(scope, now);
  if (now < current.updatedAt) {
    throw new Error('Terminal context update time moved backwards');
  }
  const next = createTerminalContextSession({
    ...current,
    ...update,
    terminalSessionId: current.terminalSessionId,
    paneId: current.paneId,
    projectId: current.projectId,
    updatedAt: now,
    contextRevision: current.contextRevision + 1,
  });
  sessions.set(next.terminalSessionId, next);
  publish(next);
  return next;
}

export function consumeTerminalContextSessionOnce(
  scope: TerminalContextScope,
  now = Date.now(),
): Readonly<{ entityIds: readonly string[]; next: TerminalContextSession }> {
  const current = getOrCreateTerminalContextSession(scope, now);
  const consumed = consumeOneTurnTerminalContext(current, now);
  if (consumed.next !== current) {
    sessions.set(consumed.next.terminalSessionId, consumed.next);
    publish(consumed.next);
  }
  return consumed;
}

export function rebindTerminalContextSessionProject(
  scope: TerminalContextScope,
  projectId: string | null,
  now = Date.now(),
): TerminalContextSession {
  const current = getOrCreateTerminalContextSession(scope, now);
  if (now < current.updatedAt) {
    throw new Error('Terminal context update time moved backwards');
  }
  const next = createTerminalContextSession({
    ...current,
    projectId,
    activeMapIds: [],
    pinnedEntityIds: [],
    mode: 'persistent',
    updatedAt: now,
    contextRevision: current.contextRevision + 1,
  });
  sessions.set(next.terminalSessionId, next);
  publish(next);
  return next;
}

export function resetTerminalContextSessionsForTests(): void {
  sessions.clear();
  listeners.clear();
}
