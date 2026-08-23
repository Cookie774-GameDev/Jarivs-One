// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  installPatchers: vi.fn(() => vi.fn()),
  subscribe: vi.fn(() => vi.fn()),
  matchesHotkey: vi.fn((event: KeyboardEvent, binding: string) =>
    binding === 'DEV_CONSOLE' ? event.key === 'd' : event.key === 'F12',
  ),
}));

vi.mock('./patchers', () => ({ installPatchers: mocks.installPatchers }));
vi.mock('@/lib/hotkeys', () => ({
  matchesHotkey: mocks.matchesHotkey,
  resolveHotkey: (id: string) => id,
}));
vi.mock('@/stores/ui', () => ({
  useUIStore: {
    getState: () => ({ route: 'chat' }),
    subscribe: mocks.subscribe,
  },
}));

import { DevConsoleHost } from './DevConsoleHost';
import { useDevConsoleStore } from './store';

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

describe('DevConsoleHost', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    mocks.installPatchers.mockClear();
    mocks.subscribe.mockClear();
    mocks.matchesHotkey.mockClear();
    useDevConsoleStore.getState().clear();
    useDevConsoleStore.getState().setOpen(false);
  });

  afterEach(() => {
    act(() => useDevConsoleStore.getState().setOpen(false));
    vi.unstubAllGlobals();
  });

  it('boots real breadcrumbs and opens the Full Dev Log from both registered shortcuts', () => {
    const teardown = vi.fn();
    mocks.installPatchers.mockReturnValueOnce(teardown);
    const view = render(<DevConsoleHost />);

    expect(mocks.installPatchers).toHaveBeenCalledOnce();
    expect(useDevConsoleStore.getState().entries.map((entry) => entry.message)).toEqual([
      'Full Dev Log booted',
      'Route boot: chat',
    ]);
    expect(screen.queryByRole('region', { name: 'Full Dev Log' })).toBeNull();

    fireEvent.keyDown(window, { key: 'd' });
    expect(screen.getByRole('region', { name: 'Full Dev Log' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close Full Dev Log' }));
    expect(screen.queryByRole('region', { name: 'Full Dev Log' })).toBeNull();

    fireEvent.keyDown(window, { key: 'F12' });
    expect(screen.getByRole('region', { name: 'Full Dev Log' })).not.toBeNull();

    view.unmount();
    expect(teardown).toHaveBeenCalledOnce();
  });
});
