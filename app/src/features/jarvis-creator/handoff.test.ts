import { describe, expect, it, vi } from 'vitest';
import type { AgentId, ChatId, ProjectId, WorkspaceId } from '@/types/common';
import { createJarvisCreatorChat } from './handoff';

describe('createJarvisCreatorChat', () => {
  it('creates an agent helper chat with Jarvis selected and question-only seed', async () => {
    const chatRepo = {
      create: vi.fn(async (input) => ({ ...input, id: 'chat_1' as ChatId, created_at: 1, updated_at: 1 })),
    };
    const messageRepo = {
      create: vi.fn(async (input) => ({ ...input, id: 'msg_1', created_at: 1, updated_at: 1 })),
    };

    const chatId = await createJarvisCreatorChat({
      kind: 'agent',
      workspaceId: 'workspace_1' as WorkspaceId,
      projectId: 'project_1' as ProjectId,
      jarvisAgentId: 'agent_jarvis' as AgentId,
      currentName: 'Existing Agent',
      currentDescription: 'Existing description',
      chatRepo,
      messageRepo,
    });

    expect(chatId).toBe('chat_1');
    expect(chatRepo.create).toHaveBeenCalledWith({
      workspace_id: 'workspace_1',
      project_id: 'project_1',
      title: 'Create agent with Jarvis',
      mode: 'chat',
      active_agent_ids: ['agent_jarvis'],
    });
    // No long setup essay — only the question card part.
    expect(messageRepo.create).toHaveBeenCalledWith({
      chat_id: 'chat_1',
      role: 'assistant',
      agent_id: 'agent_jarvis',
      parts: [
        expect.objectContaining({
          kind: 'question_block',
          block: expect.objectContaining({
            id: 'jarvis_creator_agent',
            status: 'pending',
            description: expect.stringContaining('Editing agent: Existing Agent'),
            questions: [
              expect.objectContaining({ id: 'goal', type: 'text' }),
              expect.objectContaining({ id: 'rules_boundaries', type: 'text' }),
            ],
          }),
        }),
      ],
    });
    const parts = messageRepo.create.mock.calls[0]?.[0].parts as Array<{ kind: string }>;
    expect(parts.every((part) => part.kind === 'question_block')).toBe(true);
  });

  it('creates a skill helper chat without a project when project is not set', async () => {
    const chatRepo = {
      create: vi.fn(async (input) => ({ ...input, id: 'chat_2' as ChatId, created_at: 1, updated_at: 1 })),
    };
    const messageRepo = {
      create: vi.fn(async (input) => ({ ...input, id: 'msg_2', created_at: 1, updated_at: 1 })),
    };

    await createJarvisCreatorChat({
      kind: 'skill',
      workspaceId: 'workspace_1' as WorkspaceId,
      projectId: null,
      jarvisAgentId: 'agent_jarvis' as AgentId,
      currentName: 'Custom Skill',
      currentDescription: 'Existing skill description',
      chatRepo,
      messageRepo,
    });

    expect(chatRepo.create.mock.calls[0]?.[0]).not.toHaveProperty('project_id');
    const parts = messageRepo.create.mock.calls[0]?.[0].parts as Array<{
      kind: string;
      block?: { id: string; description?: string };
    }>;
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({
      kind: 'question_block',
      block: {
        id: 'jarvis_creator_skill',
      },
    });
    expect(parts[0]?.block?.description).toContain('Editing skill: Custom Skill');
    expect(parts[0]?.block?.description).toContain('Existing skill description');
  });
});
