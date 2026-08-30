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
import { db } from '@/lib/db';
import type { Message, MessageId } from '@/types';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';
import { createJarvisChatIntentStore } from './jarvisChatIntent';

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

describe('Jarvis chat intent routing', () => {
  it('does not recreate when an exact specific-chat intent is unavailable in an empty scope', async () => {
    const previousAuth = useAuthStore.getState();
    const previousActiveChatId = useUIStore.getState().activeChatId;
    useAuthStore.setState({
      cloudSession: null,
      localUserId: 'account-intent',
      workspaceId: 'workspace-intent' as never,
      projectId: 'project-intent' as never,
    });
    useUIStore.getState().setActiveChat(null);
    createJarvisChatIntentStore(window.localStorage).write(
      {
        accountId: 'account-intent',
        workspaceId: 'workspace-intent',
        projectId: 'project-intent',
      },
      { intent: { kind: 'specific-chat', chatId: 'chat-missing' } },
    );
    vi.spyOn(db.chats, 'where').mockReturnValue({
      equals: () => ({ toArray: async () => [] }),
    } as never);
    const create = vi.spyOn(chatRepo, 'create').mockResolvedValue({ id: 'chat-new' } as never);

    try {
      await expect(ensureActiveChat()).resolves.toBeNull();
      expect(create).not.toHaveBeenCalled();
    } finally {
      useAuthStore.setState(previousAuth);
      useUIStore.getState().setActiveChat(previousActiveChatId);
      window.localStorage.clear();
    }
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

  it('lets the initial useful request win concurrent agent fallback naming exactly once', async () => {
    const chatId = 'cht_title_once' as never;
    let storedTitle = 'New chat';
    let releaseFirstUpdate: (() => void) | undefined;
    const firstUpdateGate = new Promise<void>((resolve) => {
      releaseFirstUpdate = resolve;
    });
    let firstUpdate = true;
    const getById = vi.spyOn(chatRepo, 'getById').mockImplementation(async () => {
      return { id: chatId, title: storedTitle } as never;
    });
    const update = vi.spyOn(chatRepo, 'update').mockImplementation(async (_id, patch) => {
      if (firstUpdate) {
        firstUpdate = false;
        await firstUpdateGate;
      }
      storedTitle = patch.title ?? storedTitle;
      return { id: chatId, title: storedTitle } as never;
    });

    const initialRequest = maybeRenameChat(chatId, 'Build the launch dashboard.');
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const agentFallback = maybeRenameChat(chatId, 'I finished the dashboard implementation.');

    await Promise.resolve();
    expect(getById).toHaveBeenCalledTimes(1);
    releaseFirstUpdate?.();
    await Promise.all([initialRequest, agentFallback]);

    expect(update).toHaveBeenCalledTimes(1);
    expect(storedTitle).toBe('Build the launch dashboard');
  });

  it('keeps automatic naming persistence failures off the response path', async () => {
    const chatId = 'cht_title_failure' as never;
    vi.spyOn(chatRepo, 'getById').mockRejectedValueOnce(
      new Error('storage temporarily unavailable'),
    );

    await expect(maybeRenameChat(chatId, 'Build the launch dashboard.')).resolves.toBeUndefined();
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
