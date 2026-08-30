import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detectExplicitVoiceAgentSlug,
  detectVoiceMention,
  ensureJarvisChatForVoice,
  isJarvisChat,
  voiceMessageTextForAgentRoute,
} from './voiceChatRouting';
import type { Agent, Chat } from '@/types';
import { chatRepo, db } from '@/lib/db';
import { useAgentStore } from '@/stores/agents';
import { useAuthStore } from '@/stores/auth';

const jarvisAgent = {
  id: 'agent-jarvis',
  slug: 'jarvis',
  name: 'Jarvis',
  builtin: true,
} as Agent;

const jarvisCollision = {
  ...jarvisAgent,
  id: 'agent-jarvis-collision',
  builtin: false,
} as Agent;

const criticAgent = {
  id: 'agent-critic',
  slug: 'critic',
  name: 'Critic',
} as Agent;

const agents = {
  [jarvisAgent.id]: jarvisAgent,
  [criticAgent.id]: criticAgent,
};

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('voiceChatRouting detection', () => {
  it('single-flights concurrent Jarvis voice creation in one exact scope', async () => {
    const previousAuth = useAuthStore.getState();
    const previousAgents = useAgentStore.getState().agents;
    useAuthStore.setState({
      cloudSession: null,
      localUserId: 'account-voice',
      workspaceId: 'workspace-voice' as never,
      projectId: 'project-voice' as never,
    });
    useAgentStore.setState({ agents: { [jarvisAgent.id]: jarvisAgent } });
    vi.spyOn(db.chats, 'where').mockReturnValue({
      equals: () => ({ toArray: async () => [] }),
    } as never);
    const create = vi.spyOn(chatRepo, 'create').mockResolvedValue({
      id: 'chat-voice',
      workspace_id: 'workspace-voice',
      project_id: 'project-voice',
      active_agent_ids: [jarvisAgent.id],
    } as never);

    try {
      await expect(
        Promise.all([ensureJarvisChatForVoice('first'), ensureJarvisChatForVoice('second')]),
      ).resolves.toEqual(['chat-voice', 'chat-voice']);
      expect(create).toHaveBeenCalledTimes(1);
    } finally {
      useAuthStore.setState(previousAuth);
      useAgentStore.setState({ agents: previousAgents });
    }
  });

  it('rereads the exact scope before creation and reuses a newly visible chat', async () => {
    const previousAuth = useAuthStore.getState();
    const previousAgents = useAgentStore.getState().agents;
    useAuthStore.setState({
      cloudSession: null,
      localUserId: 'account-voice',
      workspaceId: 'workspace-voice' as never,
      projectId: 'project-voice' as never,
    });
    useAgentStore.setState({ agents: { [jarvisAgent.id]: jarvisAgent } });
    let reads = 0;
    vi.spyOn(db.chats, 'where').mockReturnValue({
      equals: () => ({
        toArray: async () => {
          reads += 1;
          return reads === 1
            ? []
            : [
                {
                  id: 'chat-visible',
                  workspace_id: 'workspace-voice',
                  project_id: 'project-voice',
                  active_agent_ids: [jarvisAgent.id],
                  updated_at: 20,
                },
              ];
        },
      }),
    } as never);
    const create = vi.spyOn(chatRepo, 'create');

    try {
      await expect(ensureJarvisChatForVoice()).resolves.toBe('chat-visible');
      expect(create).not.toHaveBeenCalled();
    } finally {
      useAuthStore.setState(previousAuth);
      useAgentStore.setState({ agents: previousAgents });
    }
  });

  it('treats empty active_agent_ids as a Jarvis chat', () => {
    const chat = { active_agent_ids: [] } as unknown as Chat;
    expect(isJarvisChat(chat, agents)).toBe(true);
  });

  it('treats critic-bound chats as non-Jarvis', () => {
    const chat = { active_agent_ids: [criticAgent.id] } as unknown as Chat;
    expect(isJarvisChat(chat, agents)).toBe(false);
  });

  it('rejects a user-created jarvis slug collision as a protected voice chat', () => {
    const collisionAgents = { [jarvisCollision.id]: jarvisCollision };
    const chat = { active_agent_ids: [jarvisCollision.id] } as unknown as Chat;

    expect(isJarvisChat(chat, collisionAgents)).toBe(false);
    expect(isJarvisChat({ active_agent_ids: [] } as unknown as Chat, collisionAgents)).toBe(false);
  });

  it('defaults generic utterances to Jarvis (no explicit agent)', () => {
    expect(detectExplicitVoiceAgentSlug('open five terminals')).toBeNull();
    expect(detectExplicitVoiceAgentSlug('hey Jarvis what is up')).toBeNull();
  });

  it('routes ask-the-agent phrasing to the named specialist', () => {
    expect(detectExplicitVoiceAgentSlug('ask the critic to review this')).toBe('critic');
    expect(voiceMessageTextForAgentRoute('ask the critic to review this', 'critic')).toBe(
      'to review this',
    );
  });

  it('routes @mentions to specialists but ignores @jarvis', () => {
    expect(detectVoiceMention('@critic fix the intro')).toBe('critic');
    expect(detectExplicitVoiceAgentSlug('@critic fix the intro')).toBe('critic');
    expect(detectExplicitVoiceAgentSlug('@jarvis summarize')).toBeNull();
  });

  it('routes dictation-into-agent phrasing', () => {
    expect(detectExplicitVoiceAgentSlug('type into critic the new paragraph')).toBe('critic');
    expect(voiceMessageTextForAgentRoute('type into critic the new paragraph', 'critic')).toBe(
      'the new paragraph',
    );
  });
});
