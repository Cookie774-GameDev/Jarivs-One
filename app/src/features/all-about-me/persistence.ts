import { loadAllAboutMeFile, saveAllAboutMeFile, type AllAboutMeFileResult } from './allAboutMeFile';
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
  return value.trim() || 'local-unassigned';
}

function report(bindings: AllAboutMePersistenceBindings, error: unknown): void {
  if (bindings.onError) bindings.onError(error);
  else console.warn('[all-about-me] persistence unavailable', error);
}

const LEGACY_STORAGE_KEY = 'jarvis-all-about-me';

function legacyProfile(accountId: string): { markdown: string; matched: boolean } | null {
  // safeLocalStorage is a synchronous StateStorage implementation. Zustand's
  // interface also permits async implementations, so narrow its concrete
  // return type here rather than leaking that union into JSON.parse.
  const raw = safeLocalStorage.getItem(LEGACY_STORAGE_KEY) as string | null;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      state?: { markdown?: unknown; accountScope?: unknown };
    };
    const scope = typeof parsed.state?.accountScope === 'string'
      ? account(parsed.state.accountScope)
      : '';
    if (scope && scope !== accountId) return { markdown: '', matched: false };
    const markdown = typeof parsed.state?.markdown === 'string'
      ? sanitizeAllAboutMeMarkdown(parsed.state.markdown)
      : '';
    return { markdown, matched: true };
  } catch {
    return null;
  }
}

export function startAllAboutMePersistence(bindings: AllAboutMePersistenceBindings): () => void {
  const load = bindings.load ?? loadAllAboutMeFile;
  const save = bindings.save ?? saveAllAboutMeFile;
  const debounceMs = bindings.debounceMs ?? 300;
  let activeAccount = account(bindings.getAccountId());
  let disposed = false;
  let applying = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  useAllAboutMeStore.getState().setAccountScope(activeAccount);

  const loadIntoStore = async (accountId: string, resetFirst: boolean) => {
    try {
      const result = await load(accountId);
      if (disposed || activeAccount !== accountId) return;
      applying = true;
      if (resetFirst) useAllAboutMeStore.getState().resetProfile();
      const legacy = legacyProfile(accountId);
      if (result.found) {
        useAllAboutMeStore.getState().setMarkdown(result.markdown);
        if (legacy?.matched) safeLocalStorage.removeItem(LEGACY_STORAGE_KEY);
      } else if (legacy?.matched && legacy.markdown) {
        // Migrate before deleting the only previous durable copy. A failed
        // write intentionally leaves localStorage untouched for a later retry.
        await save(accountId, legacy.markdown);
        if (disposed || activeAccount !== accountId) return;
        useAllAboutMeStore.getState().setMarkdown(legacy.markdown);
        safeLocalStorage.removeItem(LEGACY_STORAGE_KEY);
      } else if (legacy?.matched && !legacy.markdown) {
        safeLocalStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    } catch (error) {
      report(bindings, error);
    } finally {
      applying = false;
    }
  };

  const persist = (accountId: string, markdown: string) => {
    return Promise.resolve(save(accountId, markdown)).catch((error) => report(bindings, error));
  };

  const unsubscribeStore = useAllAboutMeStore.subscribe((state, previous) => {
    if (applying || state.markdown === previous.markdown) return;
    if (timer) clearTimeout(timer);
    const accountAtChange = activeAccount;
    const markdownAtChange = state.markdown;
    timer = setTimeout(() => {
      timer = undefined;
      void persist(accountAtChange, markdownAtChange);
    }, debounceMs);
  });

  const switchAccount = () => {
    const next = account(bindings.getAccountId());
    if (next === activeAccount) return;
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    const previousAccount = activeAccount;
    const previousMarkdown = useAllAboutMeStore.getState().markdown;
    activeAccount = next;
    applying = true;
    useAllAboutMeStore.getState().setAccountScope(next);
    applying = false;
    void (async () => {
      await persist(previousAccount, previousMarkdown);
      await loadIntoStore(next, true);
    })();
  };

  const unsubscribeAccount = bindings.subscribeAccount(switchAccount);
  void loadIntoStore(activeAccount, false);

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    unsubscribeStore();
    unsubscribeAccount();
  };
}
