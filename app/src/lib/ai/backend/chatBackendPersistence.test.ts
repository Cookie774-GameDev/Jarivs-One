import { describe, expect, it, vi } from 'vitest';
import type { Chat } from '@/types/chat';
import {
  lockChatBackendForDispatch,
  selectPersistedChatBackend,
  type ChatBackendPersistencePort,
} from './chatBackendPersistence';

const baseChat = (): Chat => ({
  id: 'chat-backend' as Chat['id'],
  workspace_id: 'workspace-backend' as Chat['workspace_id'],
  title: 'Backend test',
  mode: 'chat',
  active_agent_ids: [],
  created_at: 100,
  updated_at: 100,
});

function port(chat: Chat, hasUserMessage = false): ChatBackendPersistencePort {
  let current = chat;
  return {
    transaction: async (run) => run(),
    getChat: vi.fn(async () => current),
    hasCommittedUserMessage: vi.fn(async () => hasUserMessage),
    updateChat: vi.fn(async (_id, patch) => {
      current = { ...current, ...patch };
    }),
  };
}

describe('persisted Chat backend affinity', () => {
  it('selects Codex before the first user message and atomically locks it for dispatch', async () => {
    const storage = port(baseChat(), false);
    const selected = await selectPersistedChatBackend(storage, 'chat-backend', 'codex', 150);
    expect(selected).toMatchObject({ backend: 'codex', locked: false, selectedAt: 150 });

    vi.mocked(storage.hasCommittedUserMessage).mockResolvedValue(true);
    const locked = await lockChatBackendForDispatch(storage, 'chat-backend', 200);
    expect(locked).toEqual({
      version: 1,
      backend: 'codex',
      locked: true,
      selectedAt: 150,
      lockedAt: 200,
    });
  });

  it('refuses to lock until the first user message is durably visible', async () => {
    const storage = port(baseChat(), false);
    await expect(lockChatBackendForDispatch(storage, 'chat-backend', 200)).rejects.toThrow(
      'Chat backend cannot lock before the first user message commits.',
    );
    expect(storage.updateChat).not.toHaveBeenCalled();
  });

  it('migrates a legacy Chat to locked OpenCode and rejects later switching', async () => {
    const storage = port(baseChat(), true);
    const locked = await lockChatBackendForDispatch(storage, 'chat-backend', 200);
    expect(locked.backend).toBe('opencode');
    expect(locked.locked).toBe(true);
    await expect(
      selectPersistedChatBackend(storage, 'chat-backend', 'codex', 250),
    ).rejects.toMatchObject({ code: 'chat_backend_locked' });
  });

  it('fails closed for a missing Chat without writing', async () => {
    const updateChat = vi.fn();
    const storage: ChatBackendPersistencePort = {
      transaction: async (run) => run(),
      getChat: vi.fn(async () => undefined),
      hasCommittedUserMessage: vi.fn(async () => false),
      updateChat,
    };
    await expect(lockChatBackendForDispatch(storage, 'missing', 1)).rejects.toThrow(
      'Chat backend authority is unavailable.',
    );
    expect(updateChat).not.toHaveBeenCalled();
  });
});
