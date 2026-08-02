import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StateStorage } from 'zustand/middleware';

import { createDebouncedStateStorage } from './debouncedStateStorage';

describe('createDebouncedStateStorage', () => {
  afterEach(() => vi.useRealTimers());

  it('flushes the latest pending write synchronously on explicit request', () => {
    vi.useFakeTimers();
    const setItem = vi.fn();
    const base: StateStorage = {
      getItem: vi.fn(() => null),
      setItem,
      removeItem: vi.fn(),
    };
    const storage = createDebouncedStateStorage(base, 60_000);

    storage.setItem('jarvis-ui', 'superseded-active-chat');
    storage.setItem('jarvis-ui', 'pending-active-chat');
    expect(setItem).not.toHaveBeenCalled();

    storage.flush();

    expect(setItem).toHaveBeenCalledOnce();
    expect(setItem).toHaveBeenCalledWith('jarvis-ui', 'pending-active-chat');

    vi.advanceTimersByTime(60_000);
    expect(setItem).toHaveBeenCalledOnce();
  });
});
