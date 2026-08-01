import type { ChatId, Message, MessageId } from '@/types';

export interface MonochromeChatFixtureSource {
  readonly id: 'chat';
  readonly clock: '2026-07-16T12:00:00.000Z';
  readonly activeConversationId: 'fixture-chat-001';
  readonly messages: readonly [
    Readonly<{
      id: 'fixture-message-001';
      role: 'user';
      text: 'Summarize the deterministic workspace.';
    }>,
    Readonly<{
      id: 'fixture-message-002';
      role: 'assistant';
      text: 'The workspace fixture is local, synthetic, and ready for review.';
    }>,
  ];
}

/**
 * Product-side replay of the frozen MC0B chat fixture. A focused contract test
 * keeps this serialization identical to tests/visual/monochrome/fixtures.ts.
 */
const MONOCHROME_CHAT_FIXTURE_SOURCE_MESSAGES = Object.freeze([
  Object.freeze({
    id: 'fixture-message-001',
    role: 'user',
    text: 'Summarize the deterministic workspace.',
  }),
  Object.freeze({
    id: 'fixture-message-002',
    role: 'assistant',
    text: 'The workspace fixture is local, synthetic, and ready for review.',
  }),
] as const);

export const MONOCHROME_CHAT_FIXTURE_SOURCE: MonochromeChatFixtureSource = Object.freeze({
  id: 'chat',
  clock: '2026-07-16T12:00:00.000Z',
  activeConversationId: 'fixture-chat-001',
  messages: MONOCHROME_CHAT_FIXTURE_SOURCE_MESSAGES,
});

const FIXTURE_EPOCH_MS = Date.parse(MONOCHROME_CHAT_FIXTURE_SOURCE.clock);
const FIXTURE_CHAT_ID = MONOCHROME_CHAT_FIXTURE_SOURCE.activeConversationId as ChatId;

export const MONOCHROME_CHAT_FIXTURE_MESSAGES: readonly Message[] = Object.freeze(
  MONOCHROME_CHAT_FIXTURE_SOURCE.messages.map((message, index): Message => {
    const timestamp = FIXTURE_EPOCH_MS + index * 1_000;
    const productMessage: Message = {
      id: message.id as MessageId,
      chat_id: FIXTURE_CHAT_ID,
      role: message.role,
      parts: [{ kind: 'text', text: message.text }],
      created_at: timestamp,
      updated_at: timestamp,
    };
    return Object.freeze(productMessage);
  }),
);

export const MONOCHROME_CHAT_FIXTURE = Object.freeze({
  activeConversationId: FIXTURE_CHAT_ID,
  messages: MONOCHROME_CHAT_FIXTURE_MESSAGES,
});
