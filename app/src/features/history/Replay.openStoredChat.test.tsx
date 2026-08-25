import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  openStoredChat: vi.fn(),
  setActiveChat: vi.fn(),
  setRoute: vi.fn(),
  toastWarning: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {},
  chatRepo: {
    getById: vi.fn(async () => ({
      id: 'chat-a',
      workspace_id: 'workspace-a',
      title: 'Saved conversation',
      mode: 'chat',
      active_agent_ids: [],
      created_at: 1,
      updated_at: 2,
    })),
  },
  messageRepo: { listByChat: vi.fn(async () => []) },
}));

vi.mock('./openStoredChat', () => ({
  openStoredChat: mocks.openStoredChat,
}));

vi.mock('@/features/browser-chat/chatGptExport', () => ({
  createChatGptSnapshotRepository: () => ({ get: vi.fn() }),
}));

vi.mock('@/stores/auth', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ localUserId: 'account-a', cloudSession: null, workspaceId: 'workspace-a' }),
}));

vi.mock('@/stores/ui', () => ({
  useUIStore: (selector: (state: unknown) => unknown) =>
    selector({ setActiveChat: mocks.setActiveChat, setRoute: mocks.setRoute }),
}));

vi.mock('@/stores/agents', () => ({
  useAgentStore: (selector: (state: unknown) => unknown) => selector({ agents: {} }),
}));

vi.mock('@/components/ui/toast', () => ({
  toast: { warning: mocks.toastWarning, error: mocks.toastError },
}));

import { Replay } from './Replay';

describe('Replay open in chat', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the validated navigation service and reports unavailable exact model identity', async () => {
    let resolveOpen!: (value: { status: 'opened'; chatId: string; model: 'unavailable' }) => void;
    mocks.openStoredChat.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOpen = resolve;
        }),
    );
    render(<Replay chatId={'chat-a' as never} />);
    const openButton = await screen.findByRole('button', { name: 'Open in chat' });

    fireEvent.click(openButton);
    expect(screen.getByRole('button', { name: 'Opening saved chat' })).toBeTruthy();
    expect(mocks.openStoredChat).toHaveBeenCalledWith('chat-a');
    expect(mocks.setActiveChat).not.toHaveBeenCalled();
    expect(mocks.setRoute).not.toHaveBeenCalled();

    resolveOpen({ status: 'opened', chatId: 'chat-a', model: 'unavailable' });
    await waitFor(() =>
      expect(mocks.toastWarning).toHaveBeenCalledWith(
        'Saved model unavailable',
        expect.stringMatching(/messages were restored without selecting another model/i),
      ),
    );
  });

  it('surfaces a precise error when validation cannot open the stored chat', async () => {
    mocks.openStoredChat.mockResolvedValueOnce({ status: 'forbidden' });
    render(<Replay chatId={'chat-a' as never} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open in chat' }));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        'Chat not opened',
        'That saved chat does not belong to the current account and workspace.',
      ),
    );
    expect(mocks.setActiveChat).not.toHaveBeenCalled();
    expect(mocks.setRoute).not.toHaveBeenCalled();
  });
});
