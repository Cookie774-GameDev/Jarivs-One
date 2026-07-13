import { describe, expect, it } from 'vitest';
import type { Chat } from '@/types/chat';
import type { ChatId, WorkspaceId } from '@/types/common';
import { chatPinPatch, isChatPinned, sortChatsForDisplay } from './chatPin';

function chat(partial: Omit<Partial<Chat>, 'id'> & { id: string }): Chat {
  return {
    workspace_id: 'ws_1' as WorkspaceId,
    title: partial.title ?? partial.id,
    mode: 'chat',
    active_agent_ids: [],
    created_at: 1,
    updated_at: partial.updated_at ?? 1,
    ...partial,
    id: partial.id as ChatId,
  };
}

describe('chatPin', () => {
  it('sorts pinned chats above unpinned, then by pin/update time', () => {
    const rows = [
      chat({ id: 'c_old_unpinned', updated_at: 100 }),
      chat({ id: 'c_new_unpinned', updated_at: 300 }),
      chat({ id: 'c_pin_early', pinned: true, pinned_at: 10, updated_at: 50 }),
      chat({ id: 'c_pin_late', pinned: true, pinned_at: 20, updated_at: 40 }),
    ];
    expect(sortChatsForDisplay(rows).map((c) => c.id)).toEqual([
      'c_pin_late',
      'c_pin_early',
      'c_new_unpinned',
      'c_old_unpinned',
    ]);
  });

  it('builds pin/unpin patches', () => {
    expect(chatPinPatch(true, 123)).toEqual({ pinned: true, pinned_at: 123 });
    expect(chatPinPatch(false)).toEqual({ pinned: false, pinned_at: undefined });
    expect(isChatPinned({ pinned: true })).toBe(true);
    expect(isChatPinned({ pinned: false })).toBe(false);
  });
});
