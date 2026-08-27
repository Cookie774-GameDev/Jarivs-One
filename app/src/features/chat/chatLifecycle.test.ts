import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { requireHealthyLocalChatStorage, runLocalChatStorageOperation } = vi.hoisted(() => ({
  requireHealthyLocalChatStorage: vi.fn(async () => undefined),
  runLocalChatStorageOperation: vi.fn(async <T>(operation: () => Promise<T>) => operation()),
}));

vi.mock('@/lib/doctor/storageDoctor', () => ({
  requireHealthyLocalChatStorage,
  runLocalChatStorageOperation,
}));

import {
  deriveChatTitle,
  ensureActiveChat,
  formatBranchChatTitle,
  isDefaultChatTitle,
  maybeRenameChat,
  messagesThroughBranchPoint,
} from './chatLifecycle';
import { chatRepo } from '@/lib/db';
import type { Message, MessageId } from '@/types';

beforeEach(() => {
  requireHealthyLocalChatStorage.mockReset();
  requireHealthyLocalChatStorage.mockResolvedValue(undefined);
  runLocalChatStorageOperation.mockReset();
  runLocalChatStorageOperation.mockImplementation(async <T>(operation: () => Promise<T>) =>
    operation(),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('chat storage gate', () => {
  it('stops forced chat creation before any persistence work when Doctor blocks storage', async () => {
    runLocalChatStorageOperation.mockRejectedValueOnce(
      new Error('Local chat storage needs repair. Nothing has been erased.'),
    );

    await expect(ensureActiveChat({ forceNew: true })).rejects.toThrow(
      'Local chat storage needs repair',
    );
  });
});

describe('isDefaultChatTitle', () => {
  it('recognises placeholder titles', () => {
    expect(isDefaultChatTitle('')).toBe(true);
    expect(isDefaultChatTitle('New chat')).toBe(true);
    expect(isDefaultChatTitle('New chat 3')).toBe(true);
    expect(isDefaultChatTitle('Chat with Jarvis')).toBe(true);
    expect(isDefaultChatTitle('Deploy plan')).toBe(false);
  });
});

describe('deriveChatTitle', () => {
  it('uses the first sentence and strips markdown', () => {
    expect(deriveChatTitle('Fix the login bug. We should reset tokens.')).toBe('Fix the login bug');
    expect(deriveChatTitle('```ts\nconst x = 1;\n```\nHello world.')).toBe('Hello world');
  });

  it('returns empty for unusable text', () => {
    expect(deriveChatTitle('')).toBe('');
    expect(deriveChatTitle('ok')).toBe('');
  });

  it('keeps generated titles bounded for chat tabs', () => {
    const title = deriveChatTitle(
      'Build a production-ready launch dashboard with every possible operational detail included',
    );

    expect(title.length).toBeLessThanOrEqual(48);
    expect(title.endsWith('…')).toBe(true);
  });
});

describe('maybeRenameChat', () => {
  it('derives the title from the initial useful request in the exact chat scope', async () => {
    const chatId = 'cht_scoped' as never;
    const getById = vi.spyOn(chatRepo, 'getById').mockResolvedValueOnce({
      id: chatId,
      title: 'New chat 4',
    } as never);
    const update = vi.spyOn(chatRepo, 'update').mockResolvedValueOnce({} as never);

    await maybeRenameChat(chatId, 'Build the launch dashboard. Then verify it.');

    expect(getById).toHaveBeenCalledWith(chatId);
    expect(update).toHaveBeenCalledWith(chatId, { title: 'Build the launch dashboard' });
  });

  it('allows the first useful agent response to name an untouched default chat', async () => {
    const chatId = 'cht_agent_fallback' as never;
    const getById = vi.spyOn(chatRepo, 'getById').mockResolvedValueOnce({
      id: chatId,
      title: 'New chat',
    } as never);
    const update = vi.spyOn(chatRepo, 'update').mockResolvedValueOnce({} as never);

    await maybeRenameChat(chatId, 'ok');
    expect(getById).not.toHaveBeenCalled();

    await maybeRenameChat(chatId, 'I prepared the deployment checklist.');

    expect(update).toHaveBeenCalledWith(chatId, {
      title: 'I prepared the deployment checklist',
    });
  });

  it('never overwrites a stored user rename with a later agent response', async () => {
    const chatId = 'cht_user_named' as never;
    const getById = vi.spyOn(chatRepo, 'getById').mockResolvedValueOnce({
      id: chatId,
      title: 'My launch command center',
    } as never);
    const update = vi.spyOn(chatRepo, 'update').mockResolvedValueOnce({} as never);

    await maybeRenameChat(
      chatId,
      'A later assistant response that would otherwise become a title.',
    );

    expect(getById).toHaveBeenCalledWith(chatId);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('formatBranchChatTitle', () => {
  it('prefixes the source title', () => {
    expect(formatBranchChatTitle('Deploy plan')).toBe('Branch: Deploy plan');
  });

  it('avoids stacking branch prefixes', () => {
    expect(formatBranchChatTitle('Branch: Deploy plan')).toBe('Branch: Deploy plan · fork');
  });
});

describe('messagesThroughBranchPoint', () => {
  const messages = [
    {
      id: 'msg_a' as MessageId,
      chat_id: 'cht_1' as never,
      role: 'user',
      parts: [],
      created_at: 1,
      updated_at: 1,
    },
    {
      id: 'msg_b' as MessageId,
      chat_id: 'cht_1' as never,
      role: 'assistant',
      parts: [],
      created_at: 2,
      updated_at: 2,
    },
    {
      id: 'msg_c' as MessageId,
      chat_id: 'cht_1' as never,
      role: 'user',
      parts: [],
      created_at: 3,
      updated_at: 3,
    },
  ] satisfies Message[];

  it('returns history through the selected message', () => {
    expect(messagesThroughBranchPoint(messages, 'msg_b' as MessageId).map((m) => m.id)).toEqual([
      'msg_a',
      'msg_b',
    ]);
  });

  it('returns empty when the message is missing', () => {
    expect(messagesThroughBranchPoint(messages, 'msg_z' as MessageId)).toEqual([]);
  });
});
