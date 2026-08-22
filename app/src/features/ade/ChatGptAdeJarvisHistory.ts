import type {
  JarvisRunRepository,
  JarvisRunTransitionEventInput,
} from '@/lib/db/jarvisRepositories';
import type { JarvisRun, JarvisRunStatus } from '@/lib/jarvis/contracts/execution';
import type { JarvisSourceRef } from '@/lib/jarvis/contracts/source';
import type { ChatGptAdeLifecycleEvent, ChatGptAdeRunStatus } from './adeContracts';

export type ChatGptAdeHistoryRunRepository = Pick<
  JarvisRunRepository,
  'createIdempotent' | 'compareAndAppendTransitionEvent'
>;

export class ChatGptAdeHistoryError extends Error {
  constructor(readonly code: 'invalid-seed' | 'event-scope-mismatch' | 'transition-conflict') {
    super(code);
    this.name = 'ChatGptAdeHistoryError';
  }
}

const TERMINAL_STATUSES = new Set<ChatGptAdeRunStatus>([
  'completed',
  'failed',
  'blocked',
  'cancelled',
]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,199}$/u;

function targetStatus(status: ChatGptAdeRunStatus): JarvisRunStatus {
  switch (status) {
    case 'preparing-context':
      return 'compiling';
    case 'dispatching':
      return 'running';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    case 'blocked':
    case 'failed':
      return 'failed';
  }
}

function expectedStatuses(status: ChatGptAdeRunStatus): readonly JarvisRunStatus[] {
  switch (status) {
    case 'preparing-context':
      return ['queued'];
    case 'dispatching':
      return ['compiling'];
    case 'completed':
      return ['running'];
    case 'blocked':
      return ['queued', 'compiling'];
    case 'failed':
    case 'cancelled':
      return ['compiling', 'running'];
  }
}

function eventTimestamp(at: string): number {
  const value = Date.parse(at);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ChatGptAdeHistoryError('event-scope-mismatch');
  }
  return value;
}

function eventSourceRefs(
  event: Readonly<ChatGptAdeLifecycleEvent>,
  seed: Readonly<JarvisRun>,
): JarvisSourceRef[] {
  if (
    (event.receiptId !== null && !SAFE_ID.test(event.receiptId)) ||
    (event.terminalSessionId !== null && !SAFE_ID.test(event.terminalSessionId)) ||
    (event.receiptId !== null && event.receiptId === event.terminalSessionId)
  ) {
    throw new ChatGptAdeHistoryError('event-scope-mismatch');
  }
  const common = {
    accountId: seed.accountId,
    ...(seed.projectId === undefined ? {} : { projectId: seed.projectId }),
    trust: 'app_verified' as const,
    origin: 'app_observed' as const,
    sensitivity: 'private' as const,
    observedAt: eventTimestamp(event.at),
  };
  const refs: JarvisSourceRef[] = [];
  if (event.receiptId !== null) {
    refs.push(
      Object.freeze({
        ...common,
        id: event.receiptId,
        kind: 'context_node' as const,
        label: 'VibeSpace Context receipt',
      }),
    );
  }
  if (event.terminalSessionId !== null) {
    refs.push(
      Object.freeze({
        ...common,
        id: event.terminalSessionId,
        kind: 'terminal' as const,
        label: 'Linked VibeSpace terminal',
      }),
    );
  }
  return refs;
}

function transitionEvent(
  event: Readonly<ChatGptAdeLifecycleEvent>,
  seed: Readonly<JarvisRun>,
): JarvisRunTransitionEventInput {
  const timestamp = eventTimestamp(event.at);
  return Object.freeze({
    idempotencyKey: `ade:${event.runId}:${event.requestId}:${event.type}:${timestamp}`,
    title: `ChatGPT ADE ${event.type}`,
    safeSummary: event.safeFailure
      ? `ChatGPT ADE lifecycle: ${event.type} (${event.safeFailure}).`
      : `ChatGPT ADE lifecycle: ${event.type}.`,
    sourceRefs: eventSourceRefs(event, seed),
    artifactIds: [],
    createdAt: timestamp,
  });
}

export class ChatGptAdeJarvisHistory {
  private pending: Promise<void> = Promise.resolve();
  private failure: unknown = null;
  private durableStatus: JarvisRunStatus;
  private readonly seed: Readonly<JarvisRun>;

  constructor(
    private readonly repository: Readonly<ChatGptAdeHistoryRunRepository>,
    seed: Readonly<JarvisRun>,
  ) {
    if (seed.source !== 'chatgpt_ade' || seed.status !== 'queued') {
      throw new ChatGptAdeHistoryError('invalid-seed');
    }
    this.seed = Object.freeze(structuredClone(seed));
    this.durableStatus = this.seed.status;
    this.enqueue(async () => {
      const created = await this.repository.createIdempotent(this.seed);
      if (
        created.id !== this.seed.id ||
        created.accountId !== this.seed.accountId ||
        created.source !== 'chatgpt_ade'
      ) {
        throw new ChatGptAdeHistoryError('invalid-seed');
      }
      this.durableStatus = created.status;
    });
  }

  readonly recordEvent = (event: Readonly<ChatGptAdeLifecycleEvent>): void => {
    if (event.runId !== this.seed.id) {
      throw new ChatGptAdeHistoryError('event-scope-mismatch');
    }
    const detached = Object.freeze({ ...event });
    this.enqueue(() => this.persist(detached));
  };

  async flush(): Promise<void> {
    await this.pending;
    if (this.failure) throw this.failure;
  }

  private enqueue(task: () => Promise<void>): void {
    this.pending = this.pending.then(async () => {
      if (this.failure) return;
      try {
        await task();
      } catch (error) {
        this.failure = error;
      }
    });
  }

  private async persist(event: Readonly<ChatGptAdeLifecycleEvent>): Promise<void> {
    const nextStatus = targetStatus(event.type);
    if (this.durableStatus === nextStatus) return;
    if (!expectedStatuses(event.type).includes(this.durableStatus)) {
      throw new ChatGptAdeHistoryError('transition-conflict');
    }
    const timestamp = eventTimestamp(event.at);
    const result = await this.repository.compareAndAppendTransitionEvent({
      accountId: this.seed.accountId,
      runId: this.seed.id,
      expectedStatus: this.durableStatus,
      nextStatus,
      updatedAt: timestamp,
      ...(TERMINAL_STATUSES.has(event.type) ? { completedAt: timestamp } : {}),
      event: transitionEvent(event, this.seed),
    });
    if (!result.applied) {
      if (result.current.status === nextStatus) {
        this.durableStatus = nextStatus;
        return;
      }
      throw new ChatGptAdeHistoryError('transition-conflict');
    }
    this.durableStatus = result.run.status;
  }
}
