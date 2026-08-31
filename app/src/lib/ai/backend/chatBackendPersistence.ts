import { db } from '@/lib/db/database';
import type { Chat, Message } from '@/types/chat';
import type { ChatId } from '@/types/common';
import {
  lockChatBackendOnFirstMessage,
  resolveChatBackendAffinity,
  selectChatBackend,
  type ChatBackend,
  type ChatBackendAffinityV1,
} from './chatBackend';

export interface ChatBackendPersistencePort {
  transaction<T>(run: () => Promise<T>): Promise<T>;
  getChat(chatId: string): Promise<Chat | undefined>;
  hasCommittedUserMessage(chatId: string): Promise<boolean>;
  updateChat(chatId: string, patch: Pick<Chat, 'backend_affinity'>): Promise<unknown>;
}

function requireChat(chat: Chat | undefined): Chat {
  if (!chat) throw new Error('Chat backend authority is unavailable.');
  return chat;
}

export async function selectPersistedChatBackend(
  storage: ChatBackendPersistencePort,
  chatId: string,
  requested: ChatBackend,
  selectedAt: number,
): Promise<ChatBackendAffinityV1> {
  return storage.transaction(async () => {
    const chat = requireChat(await storage.getChat(chatId));
    const hasCommittedUserMessage = await storage.hasCommittedUserMessage(chatId);
    const current = resolveChatBackendAffinity(chat.backend_affinity, {
      hasCommittedUserMessage,
      chatCreatedAt: chat.created_at,
    });
    const next = selectChatBackend(current, requested, selectedAt);
    if (chat.backend_affinity !== next) {
      await storage.updateChat(chatId, { backend_affinity: next });
    }
    return next;
  });
}

export async function lockChatBackendForDispatch(
  storage: ChatBackendPersistencePort,
  chatId: string,
  committedAt: number,
): Promise<ChatBackendAffinityV1> {
  return storage.transaction(async () => {
    const chat = requireChat(await storage.getChat(chatId));
    if (!(await storage.hasCommittedUserMessage(chatId))) {
      throw new Error('Chat backend cannot lock before the first user message commits.');
    }
    const current = resolveChatBackendAffinity(chat.backend_affinity, {
      // Dispatch is the atomic lock point. Parse the pre-dispatch authority first,
      // then stamp the actual committed turn time below instead of backdating it.
      hasCommittedUserMessage: false,
      chatCreatedAt: chat.created_at,
    });
    const next = lockChatBackendOnFirstMessage(current, committedAt);
    if (chat.backend_affinity !== next) {
      await storage.updateChat(chatId, { backend_affinity: next });
    }
    return next;
  });
}

export const dexieChatBackendPersistence: ChatBackendPersistencePort = {
  transaction: (run) => db.transaction('rw', db.chats, db.messages, run),
  getChat: (chatId) => db.chats.get(chatId as ChatId),
  hasCommittedUserMessage: async (chatId) =>
    Boolean(
      await db.messages
        .where('chat_id')
        .equals(chatId)
        .and((message: Message) => message.role === 'user')
        .first(),
    ),
  updateChat: (chatId, patch) => db.chats.update(chatId as ChatId, patch),
};
