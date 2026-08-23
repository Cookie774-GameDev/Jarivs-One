import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenCodeSystemLogWindow } from './OpenCodeSystemLogWindow';
import { revealExistingOpenCodeSystemLogWindow } from './OpenCodeSystemLogHost';
import {
  OPENCODE_SYSTEM_LOG_STORAGE_KEY,
  OPENCODE_SYSTEM_LOG_UPDATE_EVENT,
  type OpenCodeSystemLogPayload,
} from './opencodeSystemLog';

describe('OpenCodeSystemLogWindow', () => {
  beforeEach(() => window.localStorage.clear());

  it('renders a live payload delivered by the app instead of polling a raw file origin', () => {
    render(<OpenCodeSystemLogWindow />);
    const payload: OpenCodeSystemLogPayload = {
      version: 1,
      updatedAt: 100,
      steps: [
        {
          id: 1,
          ts: 100,
          kind: 'siyuan',
          title: 'SiYuan added the Context Map',
          summary: '42 files are ready in the local project vault.',
          status: 'success',
        },
      ],
    };
    act(() => {
      window.dispatchEvent(new CustomEvent(OPENCODE_SYSTEM_LOG_UPDATE_EVENT, { detail: payload }));
    });
    expect(screen.getByText('SiYuan added the Context Map')).toBeTruthy();
    expect(screen.getByText(/42 files are ready/)).toBeTruthy();
  });

  it('clears only the human view', () => {
    window.localStorage.setItem(
      OPENCODE_SYSTEM_LOG_STORAGE_KEY,
      JSON.stringify({ version: 1, updatedAt: 100, steps: [] }),
    );
    render(<OpenCodeSystemLogWindow />);
    fireEvent.click(screen.getByRole('button', { name: /clear this view/i }));
    expect(window.localStorage.getItem(OPENCODE_SYSTEM_LOG_STORAGE_KEY)).toBeNull();
  });
});

describe('OpenCode System Log native window recovery', () => {
  it('reuses a healthy native window', async () => {
    const existing = {
      isVisible: vi.fn().mockResolvedValue(false),
      show: vi.fn().mockResolvedValue(undefined),
      unminimize: vi.fn().mockResolvedValue(undefined),
      setFocus: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
    };

    await expect(revealExistingOpenCodeSystemLogWindow(existing)).resolves.toBe(true);
    expect(existing.show).toHaveBeenCalledOnce();
    expect(existing.setFocus).toHaveBeenCalledOnce();
    expect(existing.destroy).not.toHaveBeenCalled();
  });

  it('removes a stale label so the caller can create a fresh live window', async () => {
    const existing = {
      isVisible: vi.fn().mockRejectedValue(new Error('window not found')),
      show: vi.fn(),
      unminimize: vi.fn(),
      setFocus: vi.fn(),
      destroy: vi.fn().mockResolvedValue(undefined),
    };

    await expect(revealExistingOpenCodeSystemLogWindow(existing)).resolves.toBe(false);
    expect(existing.destroy).toHaveBeenCalledOnce();
    expect(existing.show).not.toHaveBeenCalled();
  });
});
