import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rows: [] as Array<{
    id: string;
    workspace_id: string;
    title: string;
    mode: 'chat';
    active_agent_ids: string[];
    created_at: number;
    updated_at: number;
  }>,
  ensureActiveChat: vi.fn(),
  updateChat: vi.fn(),
  setActiveChat: vi.fn(),
}));

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: () => mocks.rows,
}));

vi.mock('@/features/chat/ChatThread', () => ({
  ChatThread: ({ chatId }: { chatId: string }) => (
    <div data-testid="shared-chat-thread" data-chat-id={chatId} />
  ),
}));

vi.mock('@/features/chat/Composer', () => ({
  Composer: ({ chatId }: { chatId: string }) => (
    <div data-testid="shared-chat-composer" data-chat-id={chatId} />
  ),
}));

vi.mock('@/features/chat/chatLifecycle', () => ({
  ensureActiveChat: mocks.ensureActiveChat,
}));

vi.mock('@/lib/db', () => ({
  chatRepo: {
    list: vi.fn(),
    update: mocks.updateChat,
  },
}));

vi.mock('@/stores/auth', () => ({
  useAuthStore: (selector: (state: { workspaceId: string }) => unknown) =>
    selector({ workspaceId: 'workspace-1' }),
}));

vi.mock('@/stores/ui', () => ({
  useUIStore: (selector: (state: { setActiveChat: typeof mocks.setActiveChat }) => unknown) =>
    selector({ setActiveChat: mocks.setActiveChat }),
}));

import { PetChatSurface } from './PetChatSurface';
import { usePetPresentationStore } from './petPresentationStore';

const firstChat = {
  id: 'chat-one',
  workspace_id: 'workspace-1',
  title: 'First chat',
  mode: 'chat' as const,
  active_agent_ids: [],
  created_at: 1,
  updated_at: 2,
};

const secondChat = {
  ...firstChat,
  id: 'chat-two',
  title: 'Second chat',
  created_at: 3,
  updated_at: 4,
};

describe('PetChatSurface shared chat identity and title editing', () => {
  beforeEach(() => {
    mocks.rows.splice(0, mocks.rows.length, firstChat, secondChat);
    mocks.ensureActiveChat.mockReset();
    mocks.updateChat.mockReset().mockResolvedValue({ ...firstChat, title: 'Renamed from Pet' });
    mocks.setActiveChat.mockReset();
    usePetPresentationStore.setState({
      chats: {
        'chat-one': {
          chatId: 'chat-one',
          owner: 'pet-mini-panel',
          activeRequestId: null,
        },
        'chat-two': {
          chatId: 'chat-two',
          owner: 'pet-mini-panel',
          activeRequestId: null,
        },
      },
      terminals: {},
      panelActiveChatId: 'chat-one',
      panelActiveTerminalId: null,
      activity: [],
      activitySeenIds: [],
      unreadActivity: 0,
      panelLifecycle: 'open',
      lastLimitMessage: null,
    });
  });

  it('switches the real shared thread and composer by existing chat ID without creating a chat', async () => {
    render(<PetChatSurface />);

    expect(screen.getByTestId('shared-chat-thread').getAttribute('data-chat-id')).toBe('chat-one');
    expect(screen.getByTestId('shared-chat-composer').getAttribute('data-chat-id')).toBe(
      'chat-one',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open chat Second chat' }));

    await waitFor(() => {
      expect(screen.getByTestId('shared-chat-thread').getAttribute('data-chat-id')).toBe(
        'chat-two',
      );
      expect(screen.getByTestId('shared-chat-composer').getAttribute('data-chat-id')).toBe(
        'chat-two',
      );
    });
    expect(mocks.ensureActiveChat).not.toHaveBeenCalled();
    expect(Object.keys(usePetPresentationStore.getState().chats)).toEqual(['chat-one', 'chat-two']);
  });

  it('renames the exact shared chat from the Pet tab without creating or cloning it', async () => {
    render(<PetChatSurface />);

    fireEvent.doubleClick(screen.getByRole('button', { name: 'Open chat First chat' }));
    const input = screen.getByRole('textbox', { name: 'Rename First chat' });
    fireEvent.change(input, { target: { value: 'Renamed from Pet' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(mocks.updateChat).toHaveBeenCalledWith('chat-one', { title: 'Renamed from Pet' });
    });
    expect(mocks.ensureActiveChat).not.toHaveBeenCalled();
    expect(Object.keys(usePetPresentationStore.getState().chats)).toEqual(['chat-one', 'chat-two']);
  });

  it('creates only when New chat is explicitly requested and presents the returned ID', async () => {
    mocks.ensureActiveChat.mockResolvedValue('chat-three');
    render(<PetChatSurface />);

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));

    await waitFor(() => {
      expect(mocks.ensureActiveChat).toHaveBeenCalledTimes(1);
      expect(mocks.ensureActiveChat).toHaveBeenCalledWith({
        forceNew: true,
        navigateToChat: false,
        title: 'Pet chat',
      });
      expect(screen.getByTestId('shared-chat-thread').getAttribute('data-chat-id')).toBe(
        'chat-three',
      );
      expect(screen.getByTestId('shared-chat-composer').getAttribute('data-chat-id')).toBe(
        'chat-three',
      );
    });
    expect(usePetPresentationStore.getState().chats['chat-three']).toMatchObject({
      chatId: 'chat-three',
      owner: 'pet-mini-panel',
    });
    expect(mocks.setActiveChat).toHaveBeenCalledWith('chat-three');
  });
});
