import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearJarvisMemoryStatus,
  publishJarvisMemoryStatus,
  readJarvisMemoryStatus,
} from './memoryStatusRuntime';

describe('Jarvis memory status replay', () => {
  afterEach(() => {
    clearJarvisMemoryStatus();
    vi.useRealTimers();
  });

  it('replays only the safe status envelope to a late matching subscriber', () => {
    publishJarvisMemoryStatus({ state: 'recovered' });
    expect(readJarvisMemoryStatus('chat-a')).toEqual({ state: 'recovered' });
    expect(JSON.stringify(readJarvisMemoryStatus('chat-a'))).not.toMatch(/path|content|source/i);
  });

  it('keeps chat-scoped status isolated and expires buffered truth', () => {
    vi.useFakeTimers();
    publishJarvisMemoryStatus({ chatId: 'chat-a', state: 'error' });
    expect(readJarvisMemoryStatus('chat-b')).toBeNull();
    expect(readJarvisMemoryStatus('chat-a')).toEqual({ chatId: 'chat-a', state: 'error' });
    vi.advanceTimersByTime(2_001);
    expect(readJarvisMemoryStatus('chat-a')).toBeNull();
  });

  it('clears replay state at an account boundary', () => {
    publishJarvisMemoryStatus({ state: 'recovered' });
    clearJarvisMemoryStatus();
    expect(readJarvisMemoryStatus('chat-a')).toBeNull();
  });
});
