import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForDocumentVisible, waitForIdle } from './bootWhenVisible';

describe('waitForDocumentVisible', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('resolves immediately when the document is already visible', async () => {
    await expect(waitForDocumentVisible({ timeoutMs: 50 })).resolves.toBeUndefined();
  });

  it('resolves on visibilitychange or timeout when hidden', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    vi.useFakeTimers();
    const pending = waitForDocumentVisible({ timeoutMs: 25 });
    await vi.advanceTimersByTimeAsync(25);
    await expect(pending).resolves.toBeUndefined();
  });
});

describe('waitForIdle', () => {
  it('resolves through setTimeout when requestIdleCallback is missing', async () => {
    vi.useFakeTimers();
    const pending = waitForIdle(1000);
    await vi.advanceTimersByTimeAsync(32);
    await expect(pending).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});
