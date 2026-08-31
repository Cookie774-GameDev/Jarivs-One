import { describe, expect, it } from 'vitest';
import type { AgentId, ChatId, MessageId, ProjectId, WorkspaceId } from '@/types/common';
import type { AgentRunState } from '@/types/agent';
import type { Chat, Message } from '@/types/chat';
import { projectLiveChatStatuses } from './liveWork';

function chat(id: string, agents: string[], overrides: Partial<Chat> = {}): Chat {
  return {
    id: id as ChatId,
    workspace_id: 'workspace-a' as WorkspaceId,
    project_id: 'project-a' as ProjectId,
    title: id,
    mode: 'chat',
    active_agent_ids: agents as AgentId[],
    created_at: 1,
    updated_at: 10,
    ...overrides,
  };
}

function message(chatId: string, id: string, createdAt: number, text?: string): Message {
  return {
    id: id as MessageId,
    chat_id: chatId as ChatId,
    role: 'assistant',
    parts: text ? [{ kind: 'text', text }] : [{ kind: 'reasoning', text: 'private trace' }],
    created_at: createdAt,
    updated_at: createdAt,
  };
}

describe('Inspector live chat evidence projection', () => {
  it('attributes working state only to agents bound to that exact chat', () => {
    const runStates: Partial<Record<AgentId, AgentRunState>> = {
      ['agent-a' as AgentId]: 'streaming',
      ['agent-b' as AgentId]: 'done',
    };

    const statuses = projectLiveChatStatuses({
      chats: [chat('chat-a', ['agent-a']), chat('chat-b', ['agent-b']), chat('chat-c', [])],
      messages: [],
      runStates,
    });

    expect(statuses.map(({ chatId, status }) => ({ chatId, status }))).toEqual([
      { chatId: 'chat-a', status: 'working' },
      { chatId: 'chat-b', status: 'stationary' },
      { chatId: 'chat-c', status: 'stationary' },
    ]);
  });

  it('excludes archived chats and uses the latest visible persisted message as preview evidence', () => {
    const statuses = projectLiveChatStatuses({
      chats: [chat('visible', []), chat('archived', [], { archived: true, updated_at: 99 })],
      messages: [
        message('visible', 'm1', 20, 'First visible result'),
        message('visible', 'm2', 30),
        message('visible', 'm3', 40, 'Latest visible result'),
        message('archived', 'm4', 50, 'Must not leak'),
      ],
      runStates: {},
    });

    expect(statuses).toEqual([
      expect.objectContaining({
        chatId: 'visible',
        lastMessagePreview: 'Latest visible result',
        lastActivityAt: 40,
      }),
    ]);
  });

  it('keeps cancellation and missing run receipts stationary instead of borrowing another run', () => {
    const statuses = projectLiveChatStatuses({
      chats: [chat('cancelled', ['agent-cancelled']), chat('missing', ['agent-missing'])],
      messages: [],
      runStates: { ['agent-cancelled' as AgentId]: 'error' },
    });

    expect(statuses.every(({ status }) => status === 'stationary')).toBe(true);
  });
});
