import { describe, expect, it } from 'vitest';
import type { Chat } from '@/types/chat';
import {
  VIBESPACE_CHAT_MIME,
  readChatDragPayload,
  resolveAcceptedChatDrop,
  writeChatDragPayload,
} from './chatDragPayload';

class MemoryDataTransfer {
  private readonly values = new Map<string, string>();

  setData(type: string, value: string) {
    this.values.set(type, value);
  }

  getData(type: string) {
    return this.values.get(type) ?? '';
  }
}

function chat(overrides: Partial<Chat> = {}): Chat {
  return {
    id: 'chat-source' as Chat['id'],
    workspace_id: 'workspace-1' as Chat['workspace_id'],
    project_id: 'project-1' as NonNullable<Chat['project_id']>,
    title: 'Canonical source',
    mode: 'chat',
    active_agent_ids: [],
    created_at: 1,
    updated_at: 2,
    ...overrides,
  };
}

describe('typed VibeSpace chat drag payload', () => {
  it('serializes identifiers and display metadata without transcript content', () => {
    const transfer = new MemoryDataTransfer();
    const payload = writeChatDragPayload(transfer, chat());

    expect(payload).toEqual({
      version: 1,
      chatId: 'chat-source',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      title: 'Canonical source',
    });
    expect(JSON.parse(transfer.getData(VIBESPACE_CHAT_MIME))).toEqual(payload);
    expect(transfer.getData(VIBESPACE_CHAT_MIME)).not.toMatch(/transcript|message|reasoning/i);
  });

  it('rejects malformed, wrong-version, and extra-key payloads', () => {
    const transfer = new MemoryDataTransfer();
    transfer.setData(VIBESPACE_CHAT_MIME, '{not-json');
    expect(readChatDragPayload(transfer)).toBeNull();

    transfer.setData(
      VIBESPACE_CHAT_MIME,
      JSON.stringify({
        version: 2,
        chatId: 'chat-source',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        title: 'Source',
      }),
    );
    expect(readChatDragPayload(transfer)).toBeNull();

    transfer.setData(
      VIBESPACE_CHAT_MIME,
      JSON.stringify({
        version: 1,
        chatId: 'chat-source',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        title: 'Source',
        transcript: 'must never cross DataTransfer',
      }),
    );
    expect(readChatDragPayload(transfer)).toBeNull();
  });

  it('revalidates canonical chat state and ignores forged display metadata', async () => {
    const source = chat();
    const target = chat({ id: 'chat-target' as Chat['id'], title: 'Target' });
    const chats = new Map<string, Chat>([
      [String(source.id), source],
      [String(target.id), target],
    ]);

    await expect(
      resolveAcceptedChatDrop(
        {
          payload: {
            version: 1,
            chatId: 'chat-source',
            workspaceId: 'workspace-1',
            projectId: 'project-1',
            title: 'Forged title',
          },
          targetChatId: 'chat-target',
        },
        {
          getChat: async (id) => chats.get(String(id)),
          canAccess: () => true,
        },
      ),
    ).resolves.toEqual({ ok: true, chat: source });
  });

  it('rejects stale, self, scope-forged, and inaccessible drops', async () => {
    const source = chat();
    const target = chat({ id: 'chat-target' as Chat['id'], title: 'Target' });
    const chats = new Map<string, Chat>([
      [String(source.id), source],
      [String(target.id), target],
    ]);
    const payload = {
      version: 1 as const,
      chatId: 'chat-source',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      title: 'Source',
    };

    await expect(
      resolveAcceptedChatDrop(
        { payload: { ...payload, chatId: 'missing' }, targetChatId: 'chat-target' },
        { getChat: async (id) => chats.get(String(id)), canAccess: () => true },
      ),
    ).resolves.toEqual({ ok: false, reason: 'chat_unavailable' });
    await expect(
      resolveAcceptedChatDrop(
        { payload, targetChatId: 'chat-source' },
        { getChat: async (id) => chats.get(String(id)), canAccess: () => true },
      ),
    ).resolves.toEqual({ ok: false, reason: 'same_chat' });
    await expect(
      resolveAcceptedChatDrop(
        { payload: { ...payload, workspaceId: 'forged-workspace' }, targetChatId: 'chat-target' },
        { getChat: async (id) => chats.get(String(id)), canAccess: () => true },
      ),
    ).resolves.toEqual({ ok: false, reason: 'chat_unavailable' });
    await expect(
      resolveAcceptedChatDrop(
        { payload, targetChatId: 'chat-target' },
        { getChat: async (id) => chats.get(String(id)), canAccess: () => false },
      ),
    ).resolves.toEqual({ ok: false, reason: 'access_denied' });
  });
});
