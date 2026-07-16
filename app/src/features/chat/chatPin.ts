/**
 * Chat pin helpers — sidebar Pinned section + sort order.
 */
import type { Chat } from '@/types/chat';

/** Sort pinned chats first (by pinned_at), then unpinned by updated_at. */
export function sortChatsForDisplay(chats: readonly Chat[]): Chat[] {
  return [...chats].sort((a, b) => {
    const aPinned = a.pinned ? 1 : 0;
    const bPinned = b.pinned ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;
    if (a.pinned && b.pinned) {
      return (b.pinned_at ?? b.updated_at) - (a.pinned_at ?? a.updated_at);
    }
    return b.updated_at - a.updated_at;
  });
}

export function isChatPinned(chat: Pick<Chat, 'pinned'> | null | undefined): boolean {
  return Boolean(chat?.pinned);
}

/** Patch to apply when pinning or unpinning. */
export function chatPinPatch(pinned: boolean, nowMs = Date.now()): Pick<Chat, 'pinned' | 'pinned_at'> {
  if (pinned) {
    return { pinned: true, pinned_at: nowMs };
  }
  return { pinned: false, pinned_at: undefined };
}
