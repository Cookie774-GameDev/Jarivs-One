import { useAgentStore } from '@/stores/agents';
import type { PetAnimId } from './petStateMachine';

export const PET_RUNTIME_EVENT_STORAGE_KEY = 'vibespace-pet-runtime-event';
export const PET_RUNTIME_EVENT_NAME = 'vibespace:pet-runtime-event';

export type PetRuntimeEventKind =
  | 'chat.started'
  | 'chat.streaming'
  | 'chat.completed'
  | 'chat.failed'
  | 'terminal.started'
  | 'terminal.running'
  | 'terminal.waiting_for_input'
  | 'terminal.completed'
  | 'terminal.failed'
  | 'agent.started'
  | 'agent.blocked'
  | 'agent.completed'
  | 'agent.failed'
  | 'app.notification'
  | 'app.error'
  | 'app.update_available'
  | 'app.tray_entered'
  | 'app.resume'
  | 'app.shutdown';

export interface PetRuntimeEvent {
  id: string;
  kind: PetRuntimeEventKind;
  sourceId: string;
  occurredAt: number;
}

export type PetReactionId =
  | 'idle'
  | 'hover'
  | 'working'
  | 'waiting'
  | 'success'
  | 'blocked'
  | 'error'
  | 'notification';

export interface PetReactionDescriptor {
  reaction: PetReactionId;
  animation: PetAnimId;
  priority: number;
  durationMs: number;
}

const KINDS = new Set<PetRuntimeEventKind>([
  'chat.started',
  'chat.streaming',
  'chat.completed',
  'chat.failed',
  'terminal.started',
  'terminal.running',
  'terminal.waiting_for_input',
  'terminal.completed',
  'terminal.failed',
  'agent.started',
  'agent.blocked',
  'agent.completed',
  'agent.failed',
  'app.notification',
  'app.error',
  'app.update_available',
  'app.tray_entered',
  'app.resume',
  'app.shutdown',
]);

const publishedIds = new Set<string>();
const consumedIds = new Set<string>();

function boundedRemember(set: Set<string>, id: string): boolean {
  if (set.has(id)) return false;
  set.add(id);
  if (set.size > 256) {
    const first = set.values().next().value as string | undefined;
    if (first) set.delete(first);
  }
  return true;
}

function safeId(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const clean = value.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 80);
  return clean || fallback;
}

function parsePetRuntimeEvent(value: unknown): PetRuntimeEvent | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<PetRuntimeEvent>;
  if (!KINDS.has(candidate.kind as PetRuntimeEventKind)) return null;
  if (!Number.isFinite(candidate.occurredAt)) return null;
  return {
    id: safeId(candidate.id, 'pet-event'),
    kind: candidate.kind as PetRuntimeEventKind,
    sourceId: safeId(candidate.sourceId, 'app'),
    occurredAt: Number(candidate.occurredAt),
  };
}

export function publishPetRuntimeEvent(event: PetRuntimeEvent): void {
  const safe = parsePetRuntimeEvent(event);
  if (!safe || !boundedRemember(publishedIds, safe.id)) return;
  const payload = JSON.stringify(safe);
  if (payload.length > 512) return;
  try {
    localStorage.setItem(PET_RUNTIME_EVENT_STORAGE_KEY, payload);
  } catch {
    // Same-window delivery remains available.
  }
  window.dispatchEvent(new CustomEvent(PET_RUNTIME_EVENT_NAME, { detail: safe }));
}

export function subscribePetRuntimeEvents(listener: (event: PetRuntimeEvent) => void): () => void {
  const deliver = (value: unknown) => {
    const event = parsePetRuntimeEvent(value);
    if (!event || !boundedRemember(consumedIds, event.id)) return;
    listener(event);
  };
  const onLocal = (event: Event) => deliver((event as CustomEvent).detail);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== PET_RUNTIME_EVENT_STORAGE_KEY || !event.newValue) return;
    try {
      deliver(JSON.parse(event.newValue));
    } catch {
      // Corrupt local state is ignored.
    }
  };
  window.addEventListener(PET_RUNTIME_EVENT_NAME, onLocal);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(PET_RUNTIME_EVENT_NAME, onLocal);
    window.removeEventListener('storage', onStorage);
  };
}

export function petReactionForEvent(kind: PetRuntimeEventKind): PetReactionDescriptor {
  if (
    kind === 'app.error' ||
    kind === 'chat.failed' ||
    kind === 'terminal.failed' ||
    kind === 'agent.failed'
  ) {
    return { reaction: 'error', animation: 'idleFun', priority: 100, durationMs: 3_200 };
  }
  if (kind === 'agent.blocked' || kind === 'terminal.waiting_for_input') {
    return { reaction: 'blocked', animation: 'idleFun', priority: 90, durationMs: 3_000 };
  }
  if (kind === 'chat.completed' || kind === 'terminal.completed' || kind === 'agent.completed') {
    return { reaction: 'success', animation: 'welcome', priority: 60, durationMs: 2_400 };
  }
  if (
    kind === 'chat.started' ||
    kind === 'chat.streaming' ||
    kind === 'terminal.started' ||
    kind === 'terminal.running' ||
    kind === 'agent.started'
  ) {
    return { reaction: 'working', animation: 'idlePrimary', priority: 40, durationMs: 5_000 };
  }
  if (kind === 'app.shutdown') {
    return { reaction: 'idle', animation: 'idlePrimary', priority: 110, durationMs: 500 };
  }
  return { reaction: 'notification', animation: 'idleFun', priority: 30, durationMs: 1_800 };
}

export function shouldAcceptPetReaction(
  current: PetReactionDescriptor | null,
  incoming: PetReactionDescriptor,
  now: number,
  currentExpiresAt: number,
): boolean {
  return current == null || now >= currentExpiresAt || incoming.priority >= current.priority;
}

function eventId(sourceId: string, kind: PetRuntimeEventKind): string {
  return `${safeId(sourceId, 'app')}:${kind}:${Math.floor(Date.now() / 4_000)}`;
}

function publish(kind: PetRuntimeEventKind, sourceId: string): void {
  publishPetRuntimeEvent({
    id: eventId(sourceId, kind),
    kind,
    sourceId: safeId(sourceId, 'app'),
    occurredAt: Date.now(),
  });
}

export function installPetApplicationEventAdapters(
  options: {
    subscribeAgents?: boolean;
    subscribeTerminals?: boolean;
  } = {},
): () => void {
  const cleanups: Array<() => void> = [];
  const onRunState = (event: Event) => {
    const detail = (event as CustomEvent).detail as
      | { chatId?: unknown; status?: unknown }
      | undefined;
    const chatId = safeId(detail?.chatId, 'chat');
    const kind: PetRuntimeEventKind | null =
      detail?.status === 'running'
        ? 'chat.streaming'
        : detail?.status === 'done'
          ? 'chat.completed'
          : detail?.status === 'error'
            ? 'chat.failed'
            : null;
    if (kind) publish(kind, chatId);
  };
  const onDoneNotification = (event: Event) => {
    const detail = (event as CustomEvent).detail as { kind?: unknown } | undefined;
    const kind =
      detail?.kind === 'terminal'
        ? 'terminal.completed'
        : detail?.kind === 'jarvis'
          ? 'chat.completed'
          : 'app.notification';
    publish(kind, safeId(detail?.kind, 'notification'));
  };
  const onTrayEntered = () => publish('app.tray_entered', 'app');
  const onUpdateAvailable = () => publish('app.update_available', 'updater');
  const onResume = () => publish('app.resume', 'app');
  const onShutdown = () => publish('app.shutdown', 'app');
  window.addEventListener('jarvis:run-state', onRunState);
  window.addEventListener('jarvis:done-notification', onDoneNotification);
  window.addEventListener('jarvis:before-hide', onTrayEntered);
  window.addEventListener('jarvis:update-available', onUpdateAvailable);
  window.addEventListener('pageshow', onResume);
  window.addEventListener('beforeunload', onShutdown);
  cleanups.push(() => {
    window.removeEventListener('jarvis:run-state', onRunState);
    window.removeEventListener('jarvis:done-notification', onDoneNotification);
    window.removeEventListener('jarvis:before-hide', onTrayEntered);
    window.removeEventListener('jarvis:update-available', onUpdateAvailable);
    window.removeEventListener('pageshow', onResume);
    window.removeEventListener('beforeunload', onShutdown);
  });

  if (options.subscribeAgents !== false) {
    const unsubscribeAgents = useAgentStore.subscribe((state, previous) => {
      for (const [agentId, runState] of Object.entries(state.runStates)) {
        if ((previous.runStates as Record<string, unknown>)[agentId] === runState) continue;
        const kind: PetRuntimeEventKind | null =
          runState === 'done'
            ? 'agent.completed'
            : runState === 'error'
              ? 'agent.failed'
              : runState === 'waiting_for_user'
                ? 'agent.blocked'
                : runState && runState !== 'idle'
                  ? 'agent.started'
                  : null;
        if (kind) publish(kind, agentId);
      }
    });
    cleanups.push(unsubscribeAgents);
  }

  if (options.subscribeTerminals !== false) {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void import('@tauri-apps/api/event')
      .then(({ listen }) =>
        listen<{ sessionId?: string; code?: number | null }>('terminal://exit', (event) => {
          const sessionId = safeId(event.payload?.sessionId, 'terminal');
          publish(
            event.payload?.code === 0 || event.payload?.code == null
              ? 'terminal.completed'
              : 'terminal.failed',
            sessionId,
          );
        }),
      )
      .then((cleanup) => {
        if (disposed) cleanup();
        else unlisten = cleanup;
      })
      .catch(() => undefined);
    cleanups.push(() => {
      disposed = true;
      unlisten?.();
    });
  }

  return () => cleanups.splice(0).forEach((cleanup) => cleanup());
}

export function resetPetRuntimeEventDedupeForTests(): void {
  publishedIds.clear();
  consumedIds.clear();
}
