import { safeLocalStorage } from '@/lib/persistence/safeLocalStorage';
import { privateAccountDirectory } from '@/features/jarvis-memory/accountStorage';

import type { JarvisTaskRun } from './taskRunStore';
import { useJarvisTaskRunStore } from './taskRunStore';

const LEGACY_KEY = 'jarvis-task-runs-v1';
const KEY_PREFIX = 'jarvis-task-runs-v2:';
const MAX_PERSISTED_RUNS = 100;

interface TaskRunPersistenceBindings {
  getAccountId: () => string;
  subscribeAccount?: (listener: () => void) => () => void;
  onHydrated?: () => void | Promise<void>;
  onError?: (error: unknown) => void;
}

function report(bindings: TaskRunPersistenceBindings, error: unknown): void {
  if (bindings.onError) bindings.onError(error);
  else console.warn('[jarvis-task] account persistence unavailable', error);
}

function isTaskRun(value: unknown): value is JarvisTaskRun {
  if (!value || typeof value !== 'object') return false;
  const run = value as Partial<JarvisTaskRun>;
  return (
    typeof run.id === 'string' &&
    typeof run.goal === 'string' &&
    typeof run.status === 'string' &&
    typeof run.startedAt === 'string' &&
    typeof run.updatedAt === 'string' &&
    Array.isArray(run.steps) &&
    run.steps.every((step) =>
      Boolean(
        step &&
        typeof step.id === 'string' &&
        typeof step.action === 'string' &&
        typeof step.label === 'string' &&
        typeof step.status === 'string' &&
        typeof step.recoverable === 'boolean',
      ),
    )
  );
}

function parseRuns(raw: string | null): JarvisTaskRun[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as {
      runs?: unknown;
      state?: { runs?: unknown };
    };
    const candidate = parsed.runs ?? parsed.state?.runs;
    const values = Array.isArray(candidate)
      ? candidate
      : candidate && typeof candidate === 'object'
        ? Object.values(candidate as Record<string, unknown>)
        : [];
    return values.filter(isTaskRun).slice(0, MAX_PERSISTED_RUNS);
  } catch {
    return [];
  }
}

function serializeRuns(runs: Record<string, JarvisTaskRun>): string {
  const bounded = Object.values(runs)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, MAX_PERSISTED_RUNS);
  return JSON.stringify({ version: 2, runs: bounded });
}

/**
 * Keeps persistent runs isolated under a SHA-256 account scope. The store is
 * cleared synchronously on account changes, before the next account's hashed
 * key is derived, so prior task content is never visible or recoverable across
 * accounts.
 */
export function startJarvisTaskRunPersistence(
  bindings: TaskRunPersistenceBindings,
): () => Promise<void> {
  const store = useJarvisTaskRunStore;
  let activeScope = '';
  let requestedAccountId = '';
  let activation = 0;
  let applying = false;
  let disposed = false;

  const persist = (scope: string, runs = store.getState().runs): boolean => {
    if (!scope) return false;
    const key = `${KEY_PREFIX}${scope}`;
    const value = serializeRuns(runs);
    safeLocalStorage.setItem(key, value);
    return (safeLocalStorage.getItem(key) as string | null) === value;
  };

  const activate = async () => {
    const accountId = bindings.getAccountId().trim();
    if (!accountId) {
      activation += 1;
      requestedAccountId = '';
      if (activeScope) persist(activeScope);
      activeScope = '';
      applying = true;
      store.getState().setAccountScope('');
      applying = false;
      return;
    }
    if (accountId === requestedAccountId) return;
    requestedAccountId = accountId;
    const token = ++activation;
    if (activeScope) persist(activeScope);
    activeScope = '';
    applying = true;
    store.getState().setAccountScope('');
    applying = false;

    try {
      const scope = await privateAccountDirectory(accountId);
      if (disposed || token !== activation) return;
      activeScope = scope;
      const key = `${KEY_PREFIX}${scope}`;
      const current = safeLocalStorage.getItem(key) as string | null;
      const legacy = current ? null : (safeLocalStorage.getItem(LEGACY_KEY) as string | null);
      const runs = parseRuns(current ?? legacy);
      applying = true;
      store.getState().setAccountScope(scope);
      store.getState().replaceForAccount(scope, runs);
      applying = false;
      if (legacy && persist(scope) && !disposed && token === activation) {
        safeLocalStorage.removeItem(LEGACY_KEY);
      }
      await bindings.onHydrated?.();
    } catch (error) {
      applying = false;
      if (token === activation) requestedAccountId = '';
      report(bindings, error);
    }
  };

  const unsubscribeStore = store.subscribe((state, previous) => {
    if (applying || !activeScope || state.runs === previous.runs) return;
    persist(activeScope, state.runs);
  });
  const unsubscribeAccount = bindings.subscribeAccount?.(() => {
    void activate();
  });
  void activate();

  return async () => {
    disposed = true;
    activation += 1;
    if (activeScope) persist(activeScope);
    unsubscribeStore();
    unsubscribeAccount?.();
    applying = true;
    store.getState().setAccountScope('');
    applying = false;
  };
}
