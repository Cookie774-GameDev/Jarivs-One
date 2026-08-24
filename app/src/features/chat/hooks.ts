import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import type { ChatId, Message } from '@/types';

/**
 * Read one chat in the order already maintained by IndexedDB's compound
 * `[chat_id+created_at]` index. Keeping this query separate makes the live
 * hook observable without re-sorting the full result set in JavaScript on
 * every streaming update.
 */
export function queryChatMessagesInOrder(chatId: ChatId | string): Promise<Message[]> {
  return db.messages
    .where('[chat_id+created_at]')
    .between([chatId as string, 0], [chatId as string, Number.POSITIVE_INFINITY])
    .toArray();
}

/**
 * Live-stream the messages for a chat in ascending creation order.
 *
 * Uses dexie-react-hooks so any insert/update on the messages table
 * for this chat (including streaming partial assistant outputs) re-renders
 * the consumer. Returns [] while the chatId is null/undefined so callers
 * never have to null-check.
 */
export function useChatMessages(chatId: ChatId | string | null | undefined): Message[] {
  const result = useLiveQuery(
    async () => {
      if (!chatId) return [];
      return queryChatMessagesInOrder(chatId);
    },
    [chatId],
    [] as Message[],
  );
  return result ?? [];
}
