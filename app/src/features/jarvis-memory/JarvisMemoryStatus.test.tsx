import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { JarvisMemoryStatus } from './JarvisMemoryStatus';
import { clearJarvisMemoryStatus, publishJarvisMemoryStatus } from './memoryStatusRuntime';

describe('JarvisMemoryStatus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    clearJarvisMemoryStatus();
    vi.useRealTimers();
  });

  it('shows an accessible chat-scoped update and disappears after completion', () => {
    render(<JarvisMemoryStatus chatId="chat-a" />);

    act(() =>
      window.dispatchEvent(
        new CustomEvent('jarvis:memory-status', {
          detail: { chatId: 'chat-a', state: 'updating' },
        }),
      ),
    );
    expect(screen.getByRole('status').textContent).toMatch(/updating jarvis memory/i);

    act(() =>
      window.dispatchEvent(
        new CustomEvent('jarvis:memory-status', {
          detail: { chatId: 'chat-a', state: 'updated' },
        }),
      ),
    );
    expect(screen.getByRole('status').textContent).toMatch(/memory updated/i);

    act(() => vi.advanceTimersByTime(1_800));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('ignores updates belonging to another chat', () => {
    const { container } = render(<JarvisMemoryStatus chatId="chat-a" />);
    act(() =>
      window.dispatchEvent(
        new CustomEvent('jarvis:memory-status', {
          detail: { chatId: 'chat-b', state: 'updating' },
        }),
      ),
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows account recovery truth without exposing private recovery details', () => {
    render(<JarvisMemoryStatus chatId="chat-a" />);
    act(() =>
      window.dispatchEvent(
        new CustomEvent('jarvis:memory-status', {
          detail: {
            state: 'recovered',
            recoverySource: 'backup',
            path: 'C:\\private\\account-hash\\learning.md',
          },
        }),
      ),
    );

    const status = screen.getByRole('status');
    expect(status.textContent).toMatch(/memory recovered/i);
    expect(status.textContent).not.toMatch(/backup|private|learning\.md/i);
  });

  it('replays recovery truth when Chat mounts after hydration completed', () => {
    publishJarvisMemoryStatus({ state: 'recovered' });
    render(<JarvisMemoryStatus chatId="chat-a" />);
    expect(screen.getByRole('status').textContent).toMatch(/memory recovered/i);
  });
});
