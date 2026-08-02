import {
  loadAllAboutMeFile,
  saveAllAboutMeFile,
  type AllAboutMeFileResult,
} from './allAboutMeFile';
import { useAllAboutMeStore } from './store';
import { safeLocalStorage } from '@/lib/persistence/safeLocalStorage';
import { sanitizeAllAboutMeMarkdown } from './allAboutMeSecurity';

interface AllAboutMePersistenceBindings {
  getAccountId: () => string;
  subscribeAccount: (listener: () => void) => () => void;
  load?: (accountId: string) => Promise<AllAboutMeFileResult>;
  save?: (accountId: string, markdown: string) => Promise<unknown>;
  debounceMs?: number;
  onError?: (error: unknown) => void;
}

function account(value: string): string {
  return value.trim();
}

function requireAccountId(value: string): string {
  const accountId = account(value);
  if (!accountId) throw new Error('Account id is required for All About Me persistence.');
  return accountId;
}

function report(bindings: AllAboutMePersistenceBindings, error: unknown): void {
  if (bindings.onError) bindings.onError(error);
  else console.warn('[all-about-me] persistence unavailable', error);
}

const LEGACY_STORAGE_KEY = 'jarvis-all-about-me';

function legacyProfile(
  accountId: string,
): { markdown: string; matched: boolean; scope: string } | null {
  // safeLocalStorage is a synchronous StateStorage implementation. Zustand's
  // interface also permits async implementations, so narrow its concrete
  // return type here rather than leaking that union into JSON.parse.
  const raw = safeLocalStorage.getItem(LEGACY_STORAGE_KEY) as string | null;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      state?: { markdown?: unknown; accountScope?: unknown };
    };
    const scope =
      typeof parsed.state?.accountScope === 'string' ? account(parsed.state.accountScope) : '';
    if (scope && scope !== accountId) return { markdown: '', matched: false, scope };
    const markdown =
      typeof parsed.state?.markdown === 'string'
        ? sanitizeAllAboutMeMarkdown(parsed.state.markdown)
        : '';
    return { markdown, matched: true, scope };
  } catch {
    return null;
  }
}

function claimLegacyProfile(accountId: string): boolean {
  const raw = safeLocalStorage.getItem(LEGACY_STORAGE_KEY) as string | null;
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as {
      state?: Record<string, unknown>;
      [key: string]: unknown;
    };
    if (!parsed.state || Array.isArray(parsed.state)) return false;
    const scope =
      typeof parsed.state.accountScope === 'string' ? account(parsed.state.accountScope) : '';
    if (scope && scope !== accountId) return false;
    if (!scope) {
      safeLocalStorage.setItem(
        LEGACY_STORAGE_KEY,
        JSON.stringify({
          ...parsed,
          state: {
            ...parsed.state,
            accountScope: accountId,
          },
        }),
      );
    }
    const claimed = legacyProfile(accountId);
    return Boolean(claimed?.matched && claimed.scope === accountId);
  } catch {
    return false;
  }
}

export function startAllAboutMePersistence(
  bindings: AllAboutMePersistenceBindings,
): () => Promise<void> {
  const load = bindings.load ?? loadAllAboutMeFile;
  const save = bindings.save ?? saveAllAboutMeFile;
  const debounceMs = bindings.debounceMs ?? 300;
  let activeAccount = requireAccountId(bindings.getAccountId());
  let activation = 1;
  let disposed = false;
  let applying = false;
  let timer:
    | {
        handle: ReturnType<typeof setTimeout>;
        accountId: string;
        markdown: string;
      }
    | undefined;
  let writeQueue: Promise<void> = Promise.resolve();
  const activationPromises = new Set<Promise<void>>();
  const accountRevisions = new Map<string, number>();

  useAllAboutMeStore.getState().setAccountScope(activeAccount);

  const applyToStore = (apply: () => void): void => {
    applying = true;
    try {
      apply();
    } finally {
      applying = false;
    }
  };

  const isCurrent = (accountId: string, generation: number): boolean =>
    !disposed && activeAccount === accountId && activation === generation;

  const revisionFor = (accountId: string): number => accountRevisions.get(accountId) ?? 0;

  const isRevisionCurrent = (accountId: string, revision: number): boolean =>
    revisionFor(accountId) === revision;

  const persist = (
    accountId: string,
    markdown: string,
    expectedRevision?: number,
  ): Promise<boolean> => {
    const pending = writeQueue.then(async () => {
      if (expectedRevision !== undefined && !isRevisionCurrent(accountId, expectedRevision)) {
        return false;
      }
      try {
        await save(accountId, markdown);
        return true;
      } catch (error) {
        report(bindings, error);
        return false;
      }
    });
    writeQueue = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  };

  const loadIntoStore = async (
    accountId: string,
    resetFirst: boolean,
    generation: number,
    legacy: ReturnType<typeof legacyProfile>,
    revision: number,
  ) => {
    try {
      const result = await load(accountId);
      const current = isCurrent(accountId, generation);
      const revisionCurrent = isRevisionCurrent(accountId, revision);
      if (current && revisionCurrent && resetFirst) {
        applyToStore(() => useAllAboutMeStore.getState().resetProfile());
      }
      if (result.found) {
        if (!current) return;
        if (revisionCurrent) {
          applyToStore(() => useAllAboutMeStore.getState().setMarkdown(result.markdown));
        }
        if (legacy?.matched) {
          safeLocalStorage.removeItem(LEGACY_STORAGE_KEY);
        }
      } else if (legacy?.matched && legacy.markdown) {
        if (!revisionCurrent) return;
        // Migrate before deleting the only previous durable copy. A failed
        // write intentionally leaves localStorage untouched for a later retry.
        const saved = await persist(accountId, legacy.markdown, revision);
        if (
          !saved ||
          !isCurrent(accountId, generation) ||
          !isRevisionCurrent(accountId, revision)
        ) {
          return;
        }
        applyToStore(() => useAllAboutMeStore.getState().setMarkdown(legacy.markdown));
        safeLocalStorage.removeItem(LEGACY_STORAGE_KEY);
      } else if (legacy?.matched && !legacy.markdown && isCurrent(accountId, generation)) {
        safeLocalStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    } catch (error) {
      report(bindings, error);
    }
  };

  const startActivation = (
    accountId: string,
    resetFirst: boolean,
    generation: number,
    ready: Promise<unknown> = Promise.resolve(),
  ): Promise<void> => {
    const revision = revisionFor(accountId);
    let legacy = legacyProfile(accountId);
    if (legacy?.matched && !legacy.scope) {
      if (!claimLegacyProfile(accountId)) {
        report(bindings, new Error('Unable to claim legacy All About Me profile migration.'));
        legacy = null;
      } else {
        legacy = legacyProfile(accountId);
      }
    }
    const operation = (async () => {
      await ready;
      await loadIntoStore(accountId, resetFirst, generation, legacy, revision);
    })();
    activationPromises.add(operation);
    void operation.then(
      () => activationPromises.delete(operation),
      () => activationPromises.delete(operation),
    );
    return operation;
  };

  const unsubscribeStore = useAllAboutMeStore.subscribe((state, previous) => {
    if (applying || !activeAccount || state.markdown === previous.markdown) return;
    if (timer) clearTimeout(timer.handle);
    const accountAtChange = activeAccount;
    accountRevisions.set(accountAtChange, revisionFor(accountAtChange) + 1);
    const markdownAtChange = state.markdown;
    const handle = setTimeout(() => {
      timer = undefined;
      void persist(accountAtChange, markdownAtChange);
    }, debounceMs);
    timer = {
      handle,
      accountId: accountAtChange,
      markdown: markdownAtChange,
    };
  });

  const switchAccount = () => {
    const next = account(bindings.getAccountId());
    if (next === activeAccount) return;
    const pendingTimer = timer;
    if (timer) {
      clearTimeout(timer.handle);
      timer = undefined;
    }
    const pendingFlush = pendingTimer
      ? persist(pendingTimer.accountId, pendingTimer.markdown)
      : writeQueue.then(() => true);
    const generation = ++activation;
    if (!next) {
      activeAccount = '';
      applyToStore(() => useAllAboutMeStore.getState().clearAccountScope());
      void pendingFlush;
      return;
    }
    activeAccount = next;
    applyToStore(() => useAllAboutMeStore.getState().setAccountScope(next));
    void startActivation(next, true, generation, pendingFlush);
  };

  const unsubscribeAccount = bindings.subscribeAccount(switchAccount);
  void startActivation(activeAccount, false, activation);

  return async () => {
    disposed = true;
    activation += 1;
    unsubscribeStore();
    unsubscribeAccount();
    if (timer) {
      clearTimeout(timer.handle);
      persist(timer.accountId, timer.markdown);
      timer = undefined;
    }
    await Promise.allSettled([...activationPromises]);
    await writeQueue;
  };
}
