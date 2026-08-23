// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DevConsolePanel } from './DevConsolePanel';
import { devConsole, useDevConsoleStore } from './store';

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

describe('Full Dev Log panel', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    useDevConsoleStore.getState().clear();
    useDevConsoleStore.getState().resetFilters();
    useDevConsoleStore.getState().setViewMode('human');
    useDevConsoleStore.getState().setOpen(true);
  });

  afterEach(() => {
    act(() => useDevConsoleStore.getState().setOpen(false));
    vi.unstubAllGlobals();
  });

  it('renders the warm Full Dev Log, evidence lanes, and only a virtual window of rows', async () => {
    for (let index = 0; index < 1_000; index += 1) {
      devConsole.log({
        channel: 'ai',
        level: 'info',
        message: `model event ${index}`,
        detail:
          index === 999
            ? {
                requestId: 'req-live-1',
                providerId: 'openai',
                modelId: 'gpt-5.6-luna-fast',
                rlmEnabled: true,
                tool: 'read',
              }
            : undefined,
      });
    }

    const { container } = render(<DevConsolePanel />);
    const surface = screen.getByRole('region', { name: 'Full Dev Log' });
    expect(surface.getAttribute('data-warm-surface')).toBe('full-dev-log');
    expect(screen.getByText(/Request req-live-1/u)).not.toBeNull();
    expect(screen.getByText(/Model openai \/ gpt-5\.6-luna-fast/u)).not.toBeNull();
    expect(screen.getByText(/RLM on/u)).not.toBeNull();
    expect(screen.getByText(/Tool read/u)).not.toBeNull();
    await waitFor(() => {
      const renderedRows = container.querySelectorAll('[data-dev-log-row="true"]').length;
      expect(renderedRows).toBeGreaterThan(0);
      expect(renderedRows).toBeLessThan(50);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Deep trace' }));
    expect(screen.getByRole('button', { name: 'Deep trace' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });
});
