import type { StateStorage } from 'zustand/middleware';

export interface FlushableStateStorage extends StateStorage {
  flush: () => void;
}

/**
 * Debounces zustand persist writes so rapid navigation (route, chat, inspector)
 * does not synchronously hammer localStorage on every store tick.
 */
export function createDebouncedStateStorage(
  base: StateStorage,
  delayMs = 400,
): FlushableStateStorage {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { name: string; value: string } | null = null;

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!pending) return;
    const next = pending;
    pending = null;
    void base.setItem(next.name, next.value);
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
  }

  return {
    getItem: (name) => base.getItem(name),
    setItem: (name, value) => {
      pending = { name, value };
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    removeItem: (name) => {
      flush();
      base.removeItem(name);
    },
    flush,
  };
}
