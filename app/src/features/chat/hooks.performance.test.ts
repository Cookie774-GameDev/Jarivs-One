import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '@/types';

const queryHarness = vi.hoisted(() => {
  const toArray = vi.fn();
  const between = vi.fn(() => ({ toArray }));
  const where = vi.fn(() => ({ between }));
  return { between, toArray, where };
});

vi.mock('@/lib/db', () => ({
  db: {
    messages: {
      where: queryHarness.where,
    },
  },
}));

import { queryChatMessagesInOrder } from './hooks';

describe('indexed live chat message query', () => {
  beforeEach(() => {
    queryHarness.where.mockClear();
    queryHarness.between.mockClear();
    queryHarness.toArray.mockReset();
  });

  it('uses the existing compound chat/time index and preserves its ascending order', async () => {
    const messages = [
      { id: 'message-1', chat_id: 'chat-1', created_at: 10 },
      { id: 'message-2', chat_id: 'chat-1', created_at: 20 },
    ] as Message[];
    queryHarness.toArray.mockResolvedValue(messages);

    await expect(queryChatMessagesInOrder('chat-1')).resolves.toBe(messages);

    expect(queryHarness.where).toHaveBeenCalledOnce();
    expect(queryHarness.where).toHaveBeenCalledWith('[chat_id+created_at]');
    expect(queryHarness.between).toHaveBeenCalledOnce();
    expect(queryHarness.between).toHaveBeenCalledWith(
      ['chat-1', 0],
      ['chat-1', Number.POSITIVE_INFINITY],
    );
    expect(queryHarness.toArray).toHaveBeenCalledOnce();
  });
});
