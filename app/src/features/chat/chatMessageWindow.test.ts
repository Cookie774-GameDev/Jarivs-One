import { describe, expect, it } from 'vitest';
import {
  CHAT_MESSAGE_WINDOW_PAGE,
  INITIAL_CHAT_MESSAGE_WINDOW,
  anchoredChatScrollTop,
  nextChatMessageWindowCount,
  windowChatMessages,
} from './chatMessageWindow';

describe('classic chat message window', () => {
  it('mounts the newest 400 messages and pages older history in groups of 100', () => {
    const messages = Array.from({ length: 650 }, (_, index) => `message-${index}`);

    const initial = windowChatMessages(messages);
    expect(initial).toHaveLength(INITIAL_CHAT_MESSAGE_WINDOW);
    expect(initial[0]).toBe('message-250');

    const nextCount = nextChatMessageWindowCount(messages.length, initial.length);
    expect(nextCount).toBe(INITIAL_CHAT_MESSAGE_WINDOW + CHAT_MESSAGE_WINDOW_PAGE);
    const next = windowChatMessages(messages, nextCount);
    expect(next).toHaveLength(500);
    expect(next[0]).toBe('message-150');
  });

  it('keeps short transcripts byte-for-byte ordered and never exceeds total history', () => {
    const messages = ['first', 'second', 'third'] as const;

    expect(windowChatMessages(messages)).toEqual(messages);
    expect(nextChatMessageWindowCount(messages.length, 400)).toBe(messages.length);
  });

  it('preserves the visible scroll anchor when older content is prepended', () => {
    expect(anchoredChatScrollTop(2_000, 12, 2_750)).toBe(762);
    expect(anchoredChatScrollTop(2_000, 0, 1_900)).toBe(0);
  });
});
