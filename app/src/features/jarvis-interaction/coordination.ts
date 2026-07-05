import { readTextFile, writeTextFile } from '@/lib/fs';
import type {
  JarvisAgentStatus,
  JarvisCoordinationAgent,
  JarvisCoordinationSnapshot,
  JarvisFileLock,
} from './types';

function normalizePath(path: string): string {
  return path.trim().replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function eventId(prefix: string, now: string, suffix: string): string {
  return `${prefix}_${now.replace(/[^0-9]/g, '')}_${suffix}`;
}

function appendEvent(
  snapshot: JarvisCoordinationSnapshot,
  event: JarvisCoordinationSnapshot['events'][number],
): JarvisCoordinationSnapshot['events'] {
  return [...snapshot.events, event].slice(-80);
}

export function createEmptyJarvisCoordinationSnapshot(
  projectRoot: string,
  now: string,
): JarvisCoordinationSnapshot {
  return {
    version: 1,
    projectRoot,
    generatedAt: now,
    agents: [],
    locks: [],
    events: [],
  };
}

export function registerJarvisChatAgent(
  snapshot: JarvisCoordinationSnapshot,
  input: {
    agentId: string;
    name: string;
    modelLabel: string;
    chatId: string;
    task: string;
    now: string;
  },
): JarvisCoordinationSnapshot {
  const existing = snapshot.agents.find((agent) => agent.agentId === input.agentId);
  const nextAgent: JarvisCoordinationAgent = {
    ...(existing ?? {
      childChatId: input.chatId,
      lockedFiles: [],
      plannedChanges: [],
      completedChanges: [],
      conflicts: [],
      errors: [],
      summary: undefined,
      error: undefined,
      currentStep: undefined,
    }),
    agentId: input.agentId,
    name: input.name,
    modelLabel: input.modelLabel,
    chatId: input.chatId,
    task: input.task,
    status: existing?.status ?? 'queued',
    lastUpdatedAt: input.now,
    startedAt: existing?.startedAt ?? input.now,
  };
  const agents = existing
    ? snapshot.agents.map((agent) => (agent.agentId === input.agentId ? nextAgent : agent))
    : [...snapshot.agents, nextAgent];
  return {
    ...snapshot,
    generatedAt: input.now,
    agents,
    events: appendEvent(snapshot, {
      id: eventId('agent_registered', input.now, input.agentId),
      ts: input.now,
      agentId: input.agentId,
      type: 'agent_registered',
      summary: `${input.name} registered for ${input.task}`,
    }),
  };
}

export function acquireJarvisFileLock(
  snapshot: JarvisCoordinationSnapshot,
  input: {
    agentId: string;
    filePath: string;
    reason?: string;
    now: string;
  },
): { ok: true; snapshot: JarvisCoordinationSnapshot; lock: JarvisFileLock } | {
  ok: false;
  snapshot: JarvisCoordinationSnapshot;
  conflict: JarvisFileLock;
} {
  const filePath = normalizePath(input.filePath);
  const conflict = snapshot.locks.find((lock) => (
    normalizePath(lock.filePath) === filePath &&
    lock.status === 'active' &&
    lock.lockedByAgentId !== input.agentId
  ));
  if (conflict) return { ok: false, snapshot, conflict };

  const agent = snapshot.agents.find((item) => item.agentId === input.agentId);
  const lock: JarvisFileLock = {
    filePath,
    lockedByAgentId: input.agentId,
    lockedByAgentName: agent?.name ?? input.agentId,
    reason: input.reason,
    lockedAt: input.now,
    status: 'active',
  };
  const locks = [
    ...snapshot.locks.filter((item) => !(
      normalizePath(item.filePath) === filePath &&
      item.lockedByAgentId === input.agentId &&
      item.status === 'active'
    )),
    lock,
  ];
  const agents = snapshot.agents.map((item) => {
    if (item.agentId !== input.agentId) return item;
    return {
      ...item,
      lockedFiles: Array.from(new Set([...item.lockedFiles.map(normalizePath), filePath])),
      lastUpdatedAt: input.now,
      status: item.status === 'queued' ? 'thinking' : item.status,
    };
  });
  const next: JarvisCoordinationSnapshot = {
    ...snapshot,
    generatedAt: input.now,
    locks,
    agents,
    events: appendEvent(snapshot, {
      id: eventId('file_locked', input.now, input.agentId),
      ts: input.now,
      agentId: input.agentId,
      type: 'file_locked',
      filePath,
      summary: input.reason ?? `Locked ${filePath}`,
    }),
  };
  return { ok: true, snapshot: next, lock };
}

export function updateJarvisAgentStatus(
  snapshot: JarvisCoordinationSnapshot,
  input: { agentId: string; status: JarvisAgentStatus; now: string; summary?: string; error?: string },
): JarvisCoordinationSnapshot {
  return {
    ...snapshot,
    generatedAt: input.now,
    agents: snapshot.agents.map((agent) => (
      agent.agentId === input.agentId
        ? {
            ...agent,
            status: input.status,
            summary: input.summary ?? agent.summary,
            error: input.error ?? agent.error,
            lastUpdatedAt: input.now,
          }
        : agent
    )),
    events: appendEvent(snapshot, {
      id: eventId('agent_status', input.now, input.agentId),
      ts: input.now,
      agentId: input.agentId,
      type: 'agent_status',
      summary: input.summary ?? `Status changed to ${input.status}`,
    }),
  };
}

export function releaseJarvisAgentLocks(
  snapshot: JarvisCoordinationSnapshot,
  input: { agentId: string; now: string },
): JarvisCoordinationSnapshot {
  const locks = snapshot.locks.map((lock) => (
    lock.lockedByAgentId === input.agentId && lock.status === 'active'
      ? { ...lock, status: 'released' as const, releasedAt: input.now }
      : lock
  ));
  const agents = snapshot.agents.map((agent) => (
    agent.agentId === input.agentId
      ? { ...agent, lockedFiles: [], lastUpdatedAt: input.now }
      : agent
  ));
  return {
    ...snapshot,
    generatedAt: input.now,
    locks,
    agents,
    events: appendEvent(snapshot, {
      id: eventId('locks_released', input.now, input.agentId),
      ts: input.now,
      agentId: input.agentId,
      type: 'locks_released',
      summary: 'Released active file locks.',
    }),
  };
}

export function coordinationFilePath(projectRoot: string): string {
  const root = projectRoot.replace(/[\\/]$/, '');
  return `${root}/.jarvis/agent-coordination.json`;
}

export async function loadJarvisCoordinationSnapshot(projectRoot: string): Promise<JarvisCoordinationSnapshot> {
  const now = new Date().toISOString();
  const path = coordinationFilePath(projectRoot);
  const result = await readTextFile(path, { root: projectRoot });
  if (!result.ok) return createEmptyJarvisCoordinationSnapshot(projectRoot, now);
  try {
    const parsed = JSON.parse(result.content) as JarvisCoordinationSnapshot;
    if (parsed?.version === 1 && Array.isArray(parsed.agents) && Array.isArray(parsed.locks)) {
      return parsed;
    }
  } catch {
    // Fall through to a clean snapshot if a user hand-edits invalid JSON.
  }
  return createEmptyJarvisCoordinationSnapshot(projectRoot, now);
}

export async function saveJarvisCoordinationSnapshot(
  projectRoot: string,
  snapshot: JarvisCoordinationSnapshot,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const path = coordinationFilePath(projectRoot);
  const result = await writeTextFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, { root: projectRoot });
  if (result.ok) return { ok: true };
  return { ok: false, error: result.error.raw ?? result.error.code };
}
