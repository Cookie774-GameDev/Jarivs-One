import { getActiveAccountIdentity } from '@/lib/accountIdentity';
import { db, type JarvisDexie } from '@/lib/db';
import { eventRepo } from '@/lib/db/repositories';
import { useAuthStore } from '@/stores/auth';
import type { EventRow } from '@/types/event';

import { parseJarvisScheduleMetadata } from '@/features/schedule/jarvisSchedules';
import {
  createCaoScheduledLearningController,
  type CaoLearningExecutionInput,
  type CaoLearningExecutionResult,
  type CaoLearningTrigger,
  type CaoScheduledLearningPersistence,
  type CaoScheduledLearningRunResult,
  type CaoScheduledLearningScope,
} from './caoScheduledLearning';
import { useJarvisLearningStore } from './learningStore';

export type CaoScheduledLearningRuntimeState =
  'idle' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface CaoScheduledLearningRuntimeStatus {
  state: CaoScheduledLearningRuntimeState;
  trigger?: CaoLearningTrigger;
  scope?: CaoScheduledLearningScope;
  updatedAt?: number;
}

export interface CaoScheduledLearningRuntimeInput {
  scope: CaoScheduledLearningScope;
  trigger: CaoLearningTrigger;
  requestId?: string;
  scheduledDueAt?: number;
}

interface CaoScheduledLearningRuntimeDeps {
  persistence: CaoScheduledLearningPersistence;
  journalHighWater(scope: CaoScheduledLearningScope): Promise<number> | number;
  execute(
    input: CaoLearningExecutionInput,
    signal: AbortSignal,
  ): Promise<CaoLearningExecutionResult>;
  now?: () => number;
  newPassId?: () => string;
  newRequestId?: () => string;
}

function scopeKey(scope: CaoScheduledLearningScope): string {
  return JSON.stringify([
    scope.accountId,
    scope.workspaceId,
    scope.projectId,
    scope.scheduleId,
    scope.targetId,
    scope.scheduleAnchorAt,
  ]);
}

function requestKey(input: CaoScheduledLearningRuntimeInput, requestId: string): string {
  return `${scopeKey(input.scope)}\u0000${input.trigger}\u0000${requestId}\u0000${input.scheduledDueAt ?? ''}`;
}

export function createCaoScheduledLearningRuntime(deps: CaoScheduledLearningRuntimeDeps) {
  const now = deps.now ?? Date.now;
  const controllers = new Map<string, ReturnType<typeof createCaoScheduledLearningController>>();
  const aborters = new Map<string, AbortController>();
  const inFlight = new Map<string, Promise<CaoScheduledLearningRunResult>>();
  const listeners = new Set<(status: CaoScheduledLearningRuntimeStatus) => void>();
  let status: CaoScheduledLearningRuntimeStatus = { state: 'idle' };

  const publish = (next: CaoScheduledLearningRuntimeStatus) => {
    status = next;
    for (const listener of listeners) listener(status);
  };

  const controllerFor = (scope: CaoScheduledLearningScope) => {
    const key = scopeKey(scope);
    const existing = controllers.get(key);
    if (existing) return existing;
    const created = createCaoScheduledLearningController({
      persistence: deps.persistence,
      now,
      newPassId: deps.newPassId,
      execute: async (input) => {
        const aborter = aborters.get(key) ?? new AbortController();
        aborters.set(key, aborter);
        try {
          return await deps.execute(input, aborter.signal);
        } finally {
          if (aborters.get(key) === aborter) aborters.delete(key);
        }
      },
    });
    controllers.set(key, created);
    return created;
  };

  const settleStatus = (
    result: CaoScheduledLearningRunResult,
    input: { scope: CaoScheduledLearningScope; trigger: CaoLearningTrigger },
  ) => {
    publish({ state: result.status, trigger: input.trigger, scope: input.scope, updatedAt: now() });
    return result;
  };

  const run = (input: CaoScheduledLearningRuntimeInput) => {
    const requestId = input.requestId ?? deps.newRequestId?.();
    if (!requestId) return Promise.reject(new Error('cao_learning_request_id_unavailable'));
    const key = requestKey(input, requestId);
    const active = inFlight.get(key);
    if (active) return active;
    const activeAborter = new AbortController();
    aborters.set(scopeKey(input.scope), activeAborter);
    publish({ state: 'running', trigger: input.trigger, scope: input.scope, updatedAt: now() });
    const pending = Promise.resolve(deps.journalHighWater(input.scope))
      .then((journalHighWaterSeq) =>
        controllerFor(input.scope).run({
          ...input.scope,
          trigger: input.trigger,
          requestId,
          journalHighWaterSeq,
          ...(input.trigger === 'scheduled' ? { scheduledDueAt: input.scheduledDueAt } : {}),
        }),
      )
      .then((result) => settleStatus(result, input))
      .catch((error) => {
        publish({ state: 'failed', trigger: input.trigger, scope: input.scope, updatedAt: now() });
        throw error;
      })
      .finally(() => {
        inFlight.delete(key);
        if (aborters.get(scopeKey(input.scope)) === activeAborter) {
          aborters.delete(scopeKey(input.scope));
        }
      });
    inFlight.set(key, pending);
    return pending;
  };

  const recover = async (scope: CaoScheduledLearningScope) => {
    publish({ state: 'running', scope, updatedAt: now() });
    try {
      const result = await controllerFor(scope).recover(scope);
      if (!result) {
        publish({ state: 'idle', scope, updatedAt: now() });
        return null;
      }
      return settleStatus(result, { scope, trigger: 'scheduled' });
    } catch (error) {
      publish({ state: 'failed', scope, updatedAt: now() });
      throw error;
    }
  };

  return {
    run,
    recover,
    cancel(scope?: CaoScheduledLearningScope) {
      if (scope) aborters.get(scopeKey(scope))?.abort();
      else for (const aborter of aborters.values()) aborter.abort();
    },
    getStatus: () => status,
    subscribe(listener: (next: CaoScheduledLearningRuntimeStatus) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

async function persistenceKey(scope: CaoScheduledLearningScope): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('cao_learning_crypto_unavailable');
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(scopeKey(scope)),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
  return `cao-scheduled-learning-v1:${hex}`;
}

export function createCaoScheduledLearningDexiePersistence(
  database: JarvisDexie = db,
): CaoScheduledLearningPersistence {
  return {
    async load(scope) {
      const row = await database.settings.get(await persistenceKey(scope));
      return row?.value;
    },
    async save({ expectedRevision, snapshot }) {
      const key = await persistenceKey(snapshot);
      await database.transaction('rw', database.settings, async () => {
        const existing = await database.settings.get(key);
        const revision =
          existing?.value && typeof existing.value === 'object'
            ? Number((existing.value as { revision?: unknown }).revision ?? 0)
            : 0;
        if (revision !== expectedRevision) throw new Error('cao_learning_revision_conflict');
        await database.settings.put({
          key,
          value: structuredClone(snapshot),
          updated_at: Date.now(),
        });
      });
    },
  };
}

function productionHighWater(scope: CaoScheduledLearningScope): number {
  const state = useJarvisLearningStore.getState();
  if (state.activeAccountId !== scope.accountId) throw new Error('cao_learning_account_mismatch');
  return state.currentProfile().meaningfulMessageCount;
}

async function productionExecute(
  input: CaoLearningExecutionInput,
  signal: AbortSignal,
): Promise<CaoLearningExecutionResult> {
  signal.throwIfAborted();
  const state = useJarvisLearningStore.getState();
  const profile = state.currentProfile();
  if (state.activeAccountId !== input.accountId || profile.accountId !== input.accountId) {
    return { status: 'failed' };
  }
  if (!profile.enabled) return { status: 'cancelled' };
  state.markEvaluated();
  signal.throwIfAborted();
  const settled = useJarvisLearningStore.getState().currentProfile();
  if (settled.lastEvaluationCount < input.throughSeqInclusive) return { status: 'failed' };
  return { status: 'completed', receiptId: `cao_receipt_${input.passId}`.slice(0, 128) };
}

const productionRuntime = createCaoScheduledLearningRuntime({
  persistence: createCaoScheduledLearningDexiePersistence(),
  journalHighWater: productionHighWater,
  execute: async (input, signal) => {
    try {
      return await productionExecute(input, signal);
    } catch (error) {
      return error instanceof DOMException && error.name === 'AbortError'
        ? { status: 'cancelled' }
        : { status: 'failed' };
    }
  },
  newRequestId: () => `cao_request_${globalThis.crypto.randomUUID()}`,
});

export const runCaoScheduledLearning = productionRuntime.run;
export const recoverCaoScheduledLearning = productionRuntime.recover;
export const cancelCaoScheduledLearning = productionRuntime.cancel;
export const getCaoScheduledLearningStatus = productionRuntime.getStatus;
export const subscribeCaoScheduledLearningStatus = productionRuntime.subscribe;

function scopeForEvent(accountId: string, event: EventRow): CaoScheduledLearningScope | null {
  const cao = parseJarvisScheduleMetadata(event)?.caoSupervision;
  if (!cao) return null;
  return {
    accountId,
    workspaceId: String(event.workspace_id),
    projectId: cao.projectId,
    scheduleId: cao.scheduleId,
    targetId: cao.targetId,
    scheduleAnchorAt: event.start_at,
  };
}

export async function runManualCaoLearningChecks(): Promise<{
  status: 'completed' | 'failed' | 'cancelled';
}> {
  const account = getActiveAccountIdentity();
  const workspaceId = useAuthStore.getState().workspaceId;
  if (!account || !workspaceId) return { status: 'failed' };
  const events = await eventRepo.list({ workspace_id: workspaceId as never });
  const scopes = events
    .filter((event) => event.status === 'scheduled')
    .map((event) => scopeForEvent(account.accountId, event))
    .filter((scope): scope is CaoScheduledLearningScope => scope !== null);
  if (scopes.length === 0) return { status: 'failed' };
  for (const scope of scopes) {
    const result = await productionRuntime.run({ scope, trigger: 'manual_force' });
    if (result.status !== 'completed') return { status: result.status };
  }
  return { status: 'completed' };
}
