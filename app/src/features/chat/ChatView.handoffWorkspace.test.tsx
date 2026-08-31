import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chat } from '@/types/chat';
import { useUIStore } from '@/stores/ui';
import { VIBESPACE_CHAT_MIME, CHAT_OPEN_BESIDE_EVENT } from './chatDragPayload';
import { chatWorkspaceStorageKey } from './chatWorkspaceLayout';
import { ChatView } from './ChatView';

const chats = vi.hoisted(() =>
  ['chat-1', 'chat-2', 'chat-3', 'chat-4', 'chat-5'].map((id, index) => ({
    id: id as Chat['id'],
    workspace_id: 'workspace-a' as Chat['workspace_id'],
    project_id: 'project-a' as NonNullable<Chat['project_id']>,
    title: `Chat ${index + 1}`,
    mode: 'chat',
    active_agent_ids: [],
    created_at: index + 1,
    updated_at: index + 1,
  })),
);

vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => chats }));

vi.mock('@/stores/auth', () => ({
  useAuthStore: (selector: (state: object) => unknown) =>
    selector({
      localUserId: 'account-a',
      cloudSession: null,
      workspaceId: 'workspace-a',
      projectId: 'project-a',
    }),
}));

vi.mock('@/lib/db', () => ({
  chatRepo: {
    list: vi.fn(async () => chats),
    getById: vi.fn(async (id: string) => chats.find((chat) => String(chat.id) === String(id))),
  },
}));

vi.mock('./chatLifecycle', () => ({ ensureActiveChat: vi.fn() }));
vi.mock('./ChatThread', () => ({
  ChatThread: ({ chatId }: { chatId: string }) => (
    <div data-testid={`thread-${chatId}`} data-chat-id={chatId} />
  ),
}));
vi.mock('./Composer', () => ({
  Composer: ({ chatId }: { chatId: string }) => (
    <div data-testid={`composer-${chatId}`} data-chat-id={chatId} />
  ),
}));
vi.mock('@/features/browser/BrowserGoalStatus', () => ({
  BrowserGoalStatus: ({ chatId }: { chatId: string }) => (
    <div data-testid={`goal-${chatId}`} data-chat-id={chatId} />
  ),
}));
vi.mock('@/features/browser-chat', () => ({
  useBrowserChatStore: (selector: (state: object) => unknown) => selector({}),
  resolveChatEngine: () => 'native',
  BrowserChatHub: () => null,
}));
vi.mock('./OrigamiChatDecor', () => ({ OrigamiChatDecor: () => null }));
vi.mock('./WarmChatWelcome', () => ({ WarmChatWelcome: () => null }));
vi.mock('./TokenBossCinematic', () => ({ TokenBossCinematic: () => null }));
vi.mock('./ChatOutputPanel', () => ({ ChatOutputPanel: () => null }));
vi.mock('./EmptyChat', () => ({ EmptyChat: () => <div data-testid="empty-chat" /> }));

function typedTransfer(chatId: string) {
  const source = chats.find((chat) => String(chat.id) === chatId)!;
  return {
    types: [VIBESPACE_CHAT_MIME],
    files: [],
    getData: (type: string) =>
      type === VIBESPACE_CHAT_MIME
        ? JSON.stringify({
            version: 1,
            chatId,
            workspaceId: String(source.workspace_id),
            projectId: String(source.project_id),
            title: source.title,
          })
        : '',
  };
}

const scope = {
  accountId: 'account-a',
  workspaceId: 'workspace-a',
  projectId: 'project-a',
};

describe('ChatView handoff workspace integration', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState({ activeChatId: 'chat-1' });
    delete document.documentElement.dataset.monochromeChatState;
    delete document.documentElement.dataset.monochromeChatFixture;
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('opens a typed conversation-area drop beside the current chat and restores it from persistence', async () => {
    const first = render(<ChatView />);

    fireEvent.drop(screen.getByTestId('chat-conversation-region-chat-1'), {
      dataTransfer: typedTransfer('chat-2'),
    });

    await screen.findByTestId('chat-pane-chat-2');
    expect(screen.getAllByTestId(/^chat-pane-/)).toHaveLength(2);
    expect(JSON.parse(localStorage.getItem(chatWorkspaceStorageKey(scope))!)).toEqual({
      version: 1,
      chatIds: ['chat-1', 'chat-2'],
      focusedChatId: 'chat-2',
    });

    first.unmount();
    render(<ChatView />);
    expect(screen.getAllByTestId(/^chat-pane-/)).toHaveLength(2);
    expect(screen.getByTestId('composer-chat-1').getAttribute('data-chat-id')).toBe('chat-1');
    expect(screen.getByTestId('composer-chat-2').getAttribute('data-chat-id')).toBe('chat-2');
  });

  it('keeps composer drops out of open-beside handling while the conversation region accepts them', async () => {
    render(<ChatView />);

    fireEvent.drop(screen.getByTestId('composer-chat-1'), {
      dataTransfer: typedTransfer('chat-2'),
    });
    expect(screen.queryByTestId('chat-pane-chat-2')).toBeNull();

    fireEvent.drop(screen.getByTestId('chat-conversation-region-chat-1'), {
      dataTransfer: typedTransfer('chat-2'),
    });
    expect(await screen.findByTestId('chat-pane-chat-2')).toBeTruthy();
  });

  it('accepts the sidebar open-beside event and global navigation replaces only the primary pane', async () => {
    render(<ChatView />);
    window.dispatchEvent(
      new CustomEvent(CHAT_OPEN_BESIDE_EVENT, {
        detail: {
          version: 1,
          chatId: 'chat-2',
          workspaceId: 'workspace-a',
          projectId: 'project-a',
          title: 'Chat 2',
        },
      }),
    );
    await screen.findByTestId('chat-pane-chat-2');

    act(() => useUIStore.getState().setActiveChat('chat-3'));

    await waitFor(() => expect(screen.getByTestId('chat-pane-chat-3')).toBeTruthy());
    expect(screen.queryByTestId('chat-pane-chat-1')).toBeNull();
    expect(screen.getByTestId('chat-pane-chat-2')).toBeTruthy();
    expect(screen.getAllByTestId(/^chat-pane-/)).toHaveLength(2);
  });

  it('focuses and closes panes without cancelling their independent runs', async () => {
    const cancelled = vi.fn();
    window.addEventListener('jarvis:cancel', cancelled);
    render(<ChatView />);
    fireEvent.drop(screen.getByTestId('chat-conversation-region-chat-1'), {
      dataTransfer: typedTransfer('chat-2'),
    });
    const second = await screen.findByTestId('chat-pane-chat-2');

    fireEvent.click(screen.getByRole('button', { name: 'Focus Chat 1' }));
    expect(useUIStore.getState().activeChatId).toBe('chat-1');
    expect(screen.getByTestId('chat-pane-chat-1').getAttribute('data-focused')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Close Chat 1' }));
    expect(screen.queryByTestId('chat-pane-chat-1')).toBeNull();
    expect(second.getAttribute('data-focused')).toBe('true');
    expect(useUIStore.getState().activeChatId).toBe('chat-2');
    expect(cancelled).not.toHaveBeenCalled();
    window.removeEventListener('jarvis:cancel', cancelled);
  });
});
