import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '@/types/chat';
import { useJarvisInteractionStore } from '@/features/jarvis-interaction/sessionStore';
import { TooltipProvider } from '@/components/ui/tooltip';

const mockState = vi.hoisted(() => ({
  messages: [] as Message[],
}));

vi.mock('./hooks', () => ({
  useChatMessages: () => mockState.messages,
}));

import { ChatThread } from './ChatThread';

const CREATOR_QUESTION_BLOCK: Message['parts'][number] = {
  kind: 'question_block',
  block: {
    id: 'jarvis_creator_agent',
    title: 'Make This Agent With Jarvis',
    status: 'pending',
    questions: [
      { id: 'goal', prompt: 'What do you want this agent to do?', type: 'text', required: true },
    ],
  },
};

const AGENT_DRAFT_MARKDOWN = [
  '## Security Review Agent',
  '',
  'This agent reviews pull requests for security risks before release.',
  '',
  '**Behavior rules:**',
  '- Read the code and cite exact files.',
  '- Ask before changing files or running risky commands.',
  '',
  '**Avoid:**',
  '- Do not invent vulnerabilities.',
].join('\n');

function message(overrides: Partial<Message> & Pick<Message, 'id' | 'role' | 'parts'>): Message {
  return {
    chat_id: 'chat_creator' as Message['chat_id'],
    created_at: 1,
    updated_at: 1,
    ...overrides,
  } as Message;
}

function renderThread() {
  return render(
    <TooltipProvider>
      <ChatThread chatId="chat_creator" />
    </TooltipProvider>,
  );
}

describe('ChatThread creator push-button scoping', () => {
  beforeEach(() => {
    mockState.messages = [];
    useJarvisInteractionStore.setState({
      modesByChat: {},
      planSafeApprovalsByChat: {},
      agentsByChat: {},
    });
  });

  it('shows Push to agent only on assistant draft replies in creator threads', () => {
    mockState.messages = [
      message({
        id: 'msg_seed' as Message['id'],
        role: 'assistant',
        parts: [{ kind: 'text', text: 'Create an agent with Jarvis' }, CREATOR_QUESTION_BLOCK],
      }),
      message({
        id: 'msg_draft' as Message['id'],
        role: 'assistant',
        parts: [{ kind: 'text', text: AGENT_DRAFT_MARKDOWN }],
      }),
    ];

    renderThread();

    expect(screen.getAllByRole('button', { name: /Push to agent/i })).toHaveLength(1);
  });

  it('never shows push buttons on user messages, even with draft-like content', () => {
    mockState.messages = [
      message({
        id: 'msg_seed' as Message['id'],
        role: 'assistant',
        parts: [{ kind: 'text', text: 'Create an agent with Jarvis' }, CREATOR_QUESTION_BLOCK],
      }),
      message({
        id: 'msg_user_paste' as Message['id'],
        role: 'user',
        parts: [{ kind: 'text', text: AGENT_DRAFT_MARKDOWN }],
      }),
    ];

    renderThread();

    expect(screen.queryByRole('button', { name: /Push to agent/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Apply agent draft/i })).toBeNull();
  });

  it('does not show a push button on the seeded creator prompt message itself', () => {
    mockState.messages = [
      message({
        id: 'msg_seed' as Message['id'],
        role: 'assistant',
        // Seed text intentionally resembles an agent draft; the question_block
        // marks it as the setup prompt, so the button must stay hidden.
        parts: [{ kind: 'text', text: AGENT_DRAFT_MARKDOWN }, CREATOR_QUESTION_BLOCK],
      }),
    ];

    renderThread();

    expect(screen.queryByRole('button', { name: /Push to agent/i })).toBeNull();
  });

  it('never shows push buttons in normal chats without a creator question block', () => {
    mockState.messages = [
      message({
        id: 'msg_normal' as Message['id'],
        role: 'assistant',
        parts: [{ kind: 'text', text: AGENT_DRAFT_MARKDOWN }],
      }),
    ];

    renderThread();

    expect(screen.queryByRole('button', { name: /Push to agent/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Push to skill/i })).toBeNull();
  });
});
