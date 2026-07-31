import * as React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { liveChats } = vi.hoisted(() => ({
  liveChats: {
    current: [{ id: 'chat-1', title: 'Example chat', pinned: false }],
  },
}));

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: () => liveChats.current,
}));

vi.mock('@/stores/ui', () => ({
  useUIStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      activeChatId: 'chat-1',
      route: 'chat',
      setActiveChat: vi.fn(),
      setRoute: vi.fn(),
      setChatMode: vi.fn(),
    }),
}));

vi.mock('@/stores/auth', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      workspaceId: 'workspace-1',
      projectId: null,
      setProjectId: vi.fn(),
    }),
}));

vi.mock('@/lib/hotkeys', () => ({
  HOTKEYS: { NEW_TAB: 'Mod+T', CLOSE_TAB: 'Mod+W' },
  useHotkey: vi.fn(),
}));

vi.mock('@/components/ui/tooltip', () => ({
  Hint: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/features/chat/chatLifecycle', () => ({
  ensureActiveChat: vi.fn(),
}));

vi.mock('@/features/pets/petPresentationStore', () => ({
  usePetPresentationStore: { getState: vi.fn() },
}));

vi.mock('@/features/pets/petSettingsStore', () => ({
  usePetSettingsStore: { getState: vi.fn() },
}));

import { TabStrip } from './TabStrip';

describe('TabStrip MonoChrome appearance', () => {
  afterEach(() => {
    cleanup();
    liveChats.current = [{ id: 'chat-1', title: 'Example chat', pinned: false }];
  });

  it('keeps the themed strip outside a tablist that owns only real tabs', () => {
    render(<TabStrip />);

    const tabStrip = screen.getByRole('tablist', { name: 'Open chats' });
    const themedStrip = tabStrip.parentElement;
    expect(themedStrip?.getAttribute('data-monochrome-surface')).toBe('tab-strip');
    expect(themedStrip?.className).toContain('bg-panel');
    expect(themedStrip?.className).not.toMatch(/gradient|blur|shadow/);

    const tab = screen.getByRole('tab', { name: /Example chat/ });
    expect(tab.className).toContain('motion-reduce:!transform-none');
    expect(tab.className).toContain('motion-reduce:!opacity-100');

    expect(Array.from(tabStrip.children)).toEqual([tab]);
    expect(within(tabStrip).queryByRole('button', { name: 'New chat' })).toBeNull();

    const newChat = screen.getByRole('button', { name: 'New chat' });
    expect(themedStrip?.contains(newChat)).toBe(true);

    fireEvent.contextMenu(tab);
    const tabMenu = screen.getByRole('menu');
    expect(tabStrip.contains(tabMenu)).toBe(false);
    expect(
      Array.from(tabStrip.children).every((child) => child.getAttribute('role') === 'tab'),
    ).toBe(true);
  });

  it('shows a usable empty state without inventing an empty tablist or fake tab', () => {
    liveChats.current = [];

    render(<TabStrip />);

    const emptyState = screen.getByText('No chats in this project yet.');
    const themedStrip = emptyState.closest('[data-monochrome-surface="tab-strip"]');

    expect(themedStrip).not.toBeNull();
    expect(screen.queryByRole('tablist', { name: 'Open chats' })).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.getByRole('button', { name: 'New chat' })).not.toBeNull();
  });
});
