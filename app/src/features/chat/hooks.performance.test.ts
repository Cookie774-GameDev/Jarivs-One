import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '@/types';

const queryHarness = vi.hoisted(() => {
  const toArray = vi.fn();
  const limit = vi.fn(() => ({ toArray }));
  const reverse = vi.fn(() => ({ limit }));
  const between = vi.fn(() => ({ reverse }));
  const where = vi.fn(() => ({ between }));
  return { between, limit, reverse, toArray, where };
});

vi.mock('@/lib/db', () => ({
  db: {
    messages: {
      where: queryHarness.where,
    },
  },
}));

import { DEFAULT_CHAT_MESSAGE_PAGE_SIZE, queryChatMessagePage } from './hooks';

describe('indexed live chat message query', () => {
  beforeEach(() => {
    queryHarness.where.mockClear();
    queryHarness.between.mockClear();
    queryHarness.reverse.mockClear();
    queryHarness.limit.mockClear();
    queryHarness.toArray.mockReset();
  });

  it('reads only the newest bounded page from the compound chat/time index', async () => {
    const messages = Array.from({ length: DEFAULT_CHAT_MESSAGE_PAGE_SIZE + 1 }, (_, index) => ({
      id: `message-${DEFAULT_CHAT_MESSAGE_PAGE_SIZE - index}`,
      chat_id: 'chat-1',
      created_at: DEFAULT_CHAT_MESSAGE_PAGE_SIZE - index,
    })) as Message[];
    queryHarness.toArray.mockResolvedValue(messages);

    const page = await queryChatMessagePage('chat-1');

    expect(page.hasOlder).toBe(true);
    expect(page.messages).toHaveLength(DEFAULT_CHAT_MESSAGE_PAGE_SIZE);
    expect(page.messages[0]?.created_at).toBe(1);
    expect(page.messages.at(-1)?.created_at).toBe(DEFAULT_CHAT_MESSAGE_PAGE_SIZE);

    expect(queryHarness.where).toHaveBeenCalledOnce();
    expect(queryHarness.where).toHaveBeenCalledWith('[chat_id+created_at]');
    expect(queryHarness.between).toHaveBeenCalledOnce();
    expect(queryHarness.between).toHaveBeenCalledWith(
      ['chat-1', 0],
      ['chat-1', Number.POSITIVE_INFINITY],
    );
    expect(queryHarness.reverse).toHaveBeenCalledOnce();
    expect(queryHarness.limit).toHaveBeenCalledWith(DEFAULT_CHAT_MESSAGE_PAGE_SIZE + 1);
    expect(queryHarness.toArray).toHaveBeenCalledOnce();
  });

  it('returns a short page in ascending order without claiming older history', async () => {
    queryHarness.toArray.mockResolvedValue([
      { id: 'message-2', chat_id: 'chat-1', created_at: 20 },
      { id: 'message-1', chat_id: 'chat-1', created_at: 10 },
    ] as Message[]);

    await expect(queryChatMessagePage('chat-1', 100)).resolves.toEqual({
      messages: [
        { id: 'message-1', chat_id: 'chat-1', created_at: 10 },
        { id: 'message-2', chat_id: 'chat-1', created_at: 20 },
      ],
      hasOlder: false,
    });
    expect(queryHarness.limit).toHaveBeenCalledWith(101);
  });
});
