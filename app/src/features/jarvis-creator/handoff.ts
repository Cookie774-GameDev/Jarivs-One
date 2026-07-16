import type { AgentId, ChatId, ProjectId, WorkspaceId } from '@/types/common';
import type { Chat, Message } from '@/types/chat';
import {
  buildJarvisCreatorQuestionBlock,
  type JarvisCreatorKind,
} from './contracts';

interface CreatorChatRepo {
  create: (input: Omit<Chat, 'id' | 'created_at' | 'updated_at'>) => Promise<Chat>;
}

interface CreatorMessageRepo {
  create: (input: Omit<Message, 'id' | 'created_at' | 'updated_at'>) => Promise<Message>;
}

export async function createJarvisCreatorChat({
  kind,
  workspaceId,
  projectId,
  jarvisAgentId,
  currentName,
  currentDescription,
  chatRepo,
  messageRepo,
}: {
  kind: JarvisCreatorKind;
  workspaceId: WorkspaceId;
  projectId: ProjectId | null | undefined;
  jarvisAgentId: AgentId;
  currentName?: string;
  currentDescription?: string;
  chatRepo: CreatorChatRepo;
  messageRepo: CreatorMessageRepo;
}): Promise<ChatId> {
  const chat = await chatRepo.create({
    workspace_id: workspaceId,
    ...(projectId ? { project_id: projectId } : {}),
    title: kind === 'agent' ? 'Create agent with Jarvis' : 'Create skill with Jarvis',
    mode: 'chat',
    active_agent_ids: [jarvisAgentId],
  });

  // Question card only — no long setup essay above the prompts.
  // Drafting instructions are injected by the AI runtime for creator chats.
  const block = buildJarvisCreatorQuestionBlock(kind);
  if (currentName?.trim()) {
    const label = kind === 'agent' ? 'agent' : 'skill';
    const descBits = [
      block.description,
      `Editing ${label}: ${currentName.trim()}.`,
      currentDescription?.trim() ? `Current description: ${currentDescription.trim()}` : '',
    ].filter(Boolean);
    block.description = descBits.join(' ');
  }

  await messageRepo.create({
    chat_id: chat.id,
    role: 'assistant',
    agent_id: jarvisAgentId,
    parts: [{ kind: 'question_block', block }],
  });
  return chat.id;
}
