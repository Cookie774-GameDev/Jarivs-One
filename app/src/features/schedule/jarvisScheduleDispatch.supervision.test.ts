import { describe, expect, it, vi } from 'vitest';
import type { Chat, Message } from '@/types/chat';
import type { ChatId, MessageId, WorkspaceId } from '@/types/common';
import type {
  ChatToChatDispatchInput,
  ChatToChatDispatchReceipt,
} from '@/features/chat/chatToChatDispatch';
import { runChatSupervisionOccurrence } from './jarvisScheduleDispatch';
import type { ChatSupervisionBindingV1 } from './chatSupervision';

const binding: ChatSupervisionBindingV1 = {
  version: 1,
  sourceChatId: 'chat-source',
  supervisingChatId: 'chat-supervisor',
  originatingMessageId: 'message-origin',
  originatingCardMessageId: 'message-card',
  handoffPolicyVersion: 1,
  instruction: 'Review current progress and identify blockers.',
  allowReplyToSource: false,
};

function chat(id: string, title: string, archived = false): Chat {
  return {
    id: id as ChatId,
    workspace_id: 'workspace-1' as WorkspaceId,
    title,
    mode: 'chat',
    active_agent_ids: [],
    created_at: 1,
    updated_at: 1,
    archived,
  };
}

function message(id: string, chatId: string, text: string, createdAt: number): Message {
  return {
    id: id as MessageId,
    chat_id: chatId as ChatId,
    role: 'user',
    parts: [{ kind: 'text', text }],
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function depsFixture() {
  let now = new Date(2026, 7, 31, 5, 0, 0, 0).getTime();
  const chats = new Map([
    [binding.sourceChatId, chat(binding.sourceChatId, 'Source chat')],
    [binding.supervisingChatId, chat(binding.supervisingChatId, 'Supervisor chat')],
  ]);
  const messages = new Map<string, Message[]>([
    [
      binding.sourceChatId,
      [message('source-1', binding.sourceChatId, 'Initial progress', now - 1_000)],
    ],
    [
      binding.supervisingChatId,
      [message('supervisor-1', binding.supervisingChatId, 'Prior review', now - 2_000)],
    ],
  ]);
  const chatReads: string[] = [];
  const messageReads: string[] = [];
  const dispatches: ChatToChatDispatchInput[] = [];
  const accepted = new Map<string, ChatToChatDispatchReceipt>();
  const deps = {
    getChat: vi.fn(async (id: string) => {
      chatReads.push(id);
      return chats.get(id);
    }),
    listMessages: vi.fn(async (id: string) => {
      messageReads.push(id);
      return messages.get(id) ?? [];
    }),
    canAccess: vi.fn((source: Chat, target: Chat) => !source.archived && !target.archived),
    dispatchChat: vi.fn(async (input: ChatToChatDispatchInput) => {
      dispatches.push(input);
      const prior = accepted.get(input.dispatchKey);
      if (prior) return prior;
      const receipt: ChatToChatDispatchReceipt = {
        status: 'dispatched',
        dispatchKey: input.dispatchKey,
        targetChatId: input.targetChatId,
        messageId: `dispatch-${accepted.size + 1}`,
      };
      accepted.set(input.dispatchKey, receipt);
      return receipt;
    }),
    now: () => now++,
  };
  return { deps, chats, messages, chatReads, messageReads, dispatches };
}

describe('runChatSupervisionOccurrence', () => {
  it('re-reads both bound chats and message streams and builds a fresh projection each occurrence', async () => {
    const { deps, messages, chatReads, messageReads, dispatches } = depsFixture();

    await runChatSupervisionOccurrence(
      { scheduleId: 'schedule-1', occurrenceId: '100', binding },
      deps,
    );
    messages
      .get(binding.sourceChatId)!
      .push(
        message(
          'source-2',
          binding.sourceChatId,
          'New progress after first run',
          dispatches[0]!.projection.snapshotAt + 1,
        ),
      );
    await runChatSupervisionOccurrence(
      { scheduleId: 'schedule-1', occurrenceId: '200', binding },
      deps,
    );

    expect(chatReads).toEqual([
      binding.sourceChatId,
      binding.supervisingChatId,
      binding.sourceChatId,
      binding.supervisingChatId,
    ]);
    expect(messageReads).toEqual([
      binding.sourceChatId,
      binding.supervisingChatId,
      binding.sourceChatId,
      binding.supervisingChatId,
    ]);
    expect(dispatches[0]!.projection.recentSections.map((section) => section.messageId)).toEqual([
      'source-1',
    ]);
    expect(dispatches[1]!.projection.recentSections.map((section) => section.messageId)).toEqual([
      'source-1',
      'source-2',
    ]);
    expect(dispatches[1]!.projection.snapshotAt).toBeGreaterThan(
      dispatches[0]!.projection.snapshotAt,
    );
  });

  it('uses the exact schedule occurrence dispatch key and includes the previous receipt', async () => {
    const { deps, dispatches } = depsFixture();
    const previousReceipt = {
      schemaVersion: 1 as const,
      at: 1_788_000_000_000,
      runId: 'chat-supervision:schedule-1:100',
      requestId: 'dispatch-previous',
      status: 'completed' as const,
      summary: 'Supervisor accepted the prior occurrence.',
    };

    const receipt = await runChatSupervisionOccurrence(
      {
        scheduleId: 'schedule-1',
        occurrenceId: '200',
        binding,
        previousReceipt,
      },
      deps,
    );

    expect(dispatches).toHaveLength(1);
    expect(dispatches[0]).toMatchObject({
      sourceChatId: binding.sourceChatId,
      targetChatId: binding.supervisingChatId,
      dispatchKey: 'schedule-1:200',
    });
    expect(dispatches[0]!.instruction).toContain('dispatch-previous');
    expect(dispatches[0]!.instruction).toContain('Supervisor accepted the prior occurrence.');
    expect(receipt).toMatchObject({
      scheduleId: 'schedule-1',
      occurrenceId: '200',
      dispatchKey: 'schedule-1:200',
      status: 'dispatched',
      messageId: 'dispatch-1',
      replyToSourceAllowed: false,
    });
  });

  it.each([
    [false, 'denied', 'Do not send'],
    [true, 'allowed', 'You may send'],
  ] as const)(
    'makes reply-to-source authorization explicit when allowReplyToSource is %s',
    async (allowReplyToSource, authorization, directive) => {
      const { deps, dispatches } = depsFixture();
      await runChatSupervisionOccurrence(
        {
          scheduleId: 'schedule-1',
          occurrenceId: '100',
          binding: { ...binding, allowReplyToSource },
        },
        deps,
      );

      expect(dispatches[0]!.instruction).toContain(
        `Reply-to-source authorization: ${authorization}`,
      );
      expect(dispatches[0]!.instruction).toContain(directive);
    },
  );

  it.each([
    ['missing source', binding.sourceChatId, 'chat_unavailable'],
    ['missing supervisor', binding.supervisingChatId, 'chat_unavailable'],
  ] as const)(
    'fails closed for %s without selecting a fallback chat',
    async (_case, missing, reason) => {
      const { deps, chats, dispatches } = depsFixture();
      chats.delete(missing);

      await expect(
        runChatSupervisionOccurrence(
          { scheduleId: 'schedule-1', occurrenceId: '100', binding },
          deps,
        ),
      ).resolves.toMatchObject({ status: 'rejected', reason });
      expect(dispatches).toEqual([]);
    },
  );

  it('fails closed when either bound chat is inaccessible', async () => {
    const { deps, chats, dispatches } = depsFixture();
    chats.set(binding.supervisingChatId, chat(binding.supervisingChatId, 'Supervisor', true));

    await expect(
      runChatSupervisionOccurrence(
        { scheduleId: 'schedule-1', occurrenceId: '100', binding },
        deps,
      ),
    ).resolves.toMatchObject({ status: 'rejected', reason: 'access_denied' });
    expect(dispatches).toEqual([]);
  });

  it('is idempotent across retry or reload through the exact canonical dispatch key', async () => {
    const { deps, dispatches } = depsFixture();
    const input = { scheduleId: 'schedule-1', occurrenceId: '100', binding } as const;

    const first = await runChatSupervisionOccurrence(input, deps);
    const second = await runChatSupervisionOccurrence(input, deps);

    expect(second).toMatchObject({
      scheduleId: first.scheduleId,
      occurrenceId: first.occurrenceId,
      dispatchKey: first.dispatchKey,
      status: first.status,
      targetChatId: first.targetChatId,
      messageId: first.messageId,
      replyToSourceAllowed: first.replyToSourceAllowed,
    });
    expect(dispatches.map((dispatch) => dispatch.dispatchKey)).toEqual([
      'schedule-1:100',
      'schedule-1:100',
    ]);
    expect(new Set(dispatches.map((dispatch) => dispatch.dispatchKey))).toEqual(
      new Set(['schedule-1:100']),
    );
  });
});
