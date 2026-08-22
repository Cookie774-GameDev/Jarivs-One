import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  messagesThroughBranchPoint,
} from './chatLifecycle';
import type { Message, MessageId } from '@/types';

beforeEach(() => {
  requireHealthyLocalChatStorage.mockReset();
  requireHealthyLocalChatStorage.mockResolvedValue(undefined);
  runLocalChatStorageOperation.mockReset();
  runLocalChatStorageOperation.mockImplementation(async <T>(operation: () => Promise<T>) =>
    operation(),
  );
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
