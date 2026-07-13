import { vi } from 'vitest';
import type { Agent, Message, Part } from '@/types';
import type { AgentId, ChatId, MessageId } from '@/types/common';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';
import { useAllAboutMeStore } from '@/features/all-about-me/store';

const mocks = vi.hoisted(() => ({
  runAgent: vi.fn(),
  chatGetById: vi.fn(),
  getProjectContextBlock: vi.fn(),
  getProjectContextTreeBlock: vi.fn(),
  getConnectedFilesBlock: vi.fn(),
  getJarvisCoordinationContextBlock: vi.fn(),
  notifyDone: vi.fn(),
  devLog: vi.fn(),
  streamingSession: {
    onDelta: vi.fn(),
    onComplete: vi.fn(async () => undefined),
    stop: vi.fn(),
    haltPlayback: vi.fn(),
  },
  voiceCanSpeak: true,
}));

vi.mock('@/features/voice/voiceRouter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/voice/voiceRouter')>();
  return {
    ...actual,
    canVoiceModuleSpeak: () => mocks.voiceCanSpeak,
  };
});

vi.mock('./router', () => ({
  runAgent: mocks.runAgent,
}));

vi.mock('@/lib/db', () => ({
  chatRepo: { getById: mocks.chatGetById, update: vi.fn() },
}));

vi.mock('@/features/dev-console', () => ({
  devConsole: { log: mocks.devLog },
}));

vi.mock('@/lib/notifications', () => ({
  getAiCompletionInstruction: () => '',
  notifyDone: mocks.notifyDone,
}));

vi.mock('@/features/voice/streamingVoice', () => ({
  createStreamingVoiceSession: () => mocks.streamingSession,
}));

vi.mock('@/features/terminals/agentContext', () => ({
  buildAgentTerminalContext: () => '',
}));

vi.mock('./context', () => ({
  getProjectContextBlock: mocks.getProjectContextBlock,
  getProjectContextTreeBlock: mocks.getProjectContextTreeBlock,
  getConnectedFilesBlock: mocks.getConnectedFilesBlock,
  getExplicitContextBlock: () => '',
  getExplicitFilesBlock: async () => '',
  getExplicitTerminalBlock: () => '',
  getJarvisCoordinationContextBlock: mocks.getJarvisCoordinationContextBlock,
  rememberConversationDestination: () => undefined,
  resolveJarvisContext: async () => ({
    relevantFiles: [],
    enabledCapabilities: [],
    sourceReasons: [],
  }),
  formatResolvedJarvisContext: () => '',
}));

import { startRuntimeListener } from './runtime';
import { selectionFromOption } from './modelSelection';
import { DEFAULT_CUSTOM_STEPS } from './stacks/presets';

function agent(id: string, slug: string, systemPrompt: string): Agent {
  return {
    id: id as AgentId,
    slug,
    name: slug,
    description: slug,
    system_prompt: systemPrompt,
    model: { provider: 'mock', model: 'mock-default' },
    tools_allowed: [],
    memory_scope: 'workspace',
    capabilities: [],
    created_at: 1,
    updated_at: 1,
  };
}

const activeStoppers: Array<() => void> = [];

describe('startRuntimeListener agent routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.voiceCanSpeak = true;
    try {
      localStorage.clear();
    } catch {
      /* jsdom */
    }
    mocks.streamingSession.onDelta.mockClear();
    mocks.streamingSession.onComplete.mockClear();
    mocks.streamingSession.stop.mockClear();
    mocks.streamingSession.haltPlayback.mockClear();
    useAuthStore.setState({
      speakReplies: false,
      voicePreset: 'jarvis-prime',
      voiceEngine: 'system',
      stackPreset: 'off',
      stackCustomSteps: DEFAULT_CUSTOM_STEPS,
      plan: 'free',
      apiKeys: { groq: 'gsk_test' },
      defaultProvider: 'mock',
      offlineMode: false,
      chatModelSelection: selectionFromOption('groq', 'llama-3.3-70b-versatile'),
    });
    useUIStore.setState({ voiceModalOpen: true });
    mocks.runAgent.mockResolvedValue({
      text: 'APPLE',
      usage: { input_tokens: 1, output_tokens: 1, cost_usd: 0 },
      provider: 'mock',
      model: 'mock-default',
    });
    mocks.getProjectContextBlock.mockResolvedValue('');
    mocks.getProjectContextTreeBlock.mockReturnValue('');
    mocks.getConnectedFilesBlock.mockResolvedValue('');
    mocks.getJarvisCoordinationContextBlock.mockResolvedValue('');
    mocks.chatGetById.mockResolvedValue(undefined);
    useAllAboutMeStore.setState(useAllAboutMeStore.getInitialState(), true);
  });

  afterEach(() => {
    while (activeStoppers.length > 0) {
      activeStoppers.pop()!();
    }
  });

  function trackListener(stop: () => void): () => void {
    activeStoppers.push(stop);
    return stop;
  }

  it('uses the chat-bound active agent and its system prompt', async () => {
    const apple = agent('agent_apple', 'apple', 'Always answer with APPLE.');
    const jarvis = agent('agent_jarvis', 'jarvis', 'You are Jarvis.');
    const chatId = 'chat_1' as ChatId;
    const placeholderId = 'msg_assistant' as MessageId;
    const userMessage: Message = {
      id: 'msg_user' as MessageId,
      chat_id: chatId,
      role: 'user',
      parts: [{ kind: 'text', text: 'what is the code word?' }],
      created_at: 1,
      updated_at: 1,
    };

    const stop = trackListener(startRuntimeListener({
      getAgentById: (id) => (id === apple.id ? apple : id === jarvis.id ? jarvis : null),
      getAgentBySlug: (slug) => (slug === 'apple' ? apple : slug === 'jarvis' ? jarvis : null),
      getAgentForChat: vi.fn(async () => apple),
      getMessages: vi.fn(async () => [userMessage]),
      appendMessage: vi.fn(async (msg) => ({
        ...msg,
        id: placeholderId,
        created_at: 2,
        updated_at: 2,
      })),
      updateMessage: vi.fn(async () => undefined),
    }));

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId, text: 'what is the code word?' },
      }),
    );

    await vi.waitFor(() => expect(mocks.runAgent).toHaveBeenCalledTimes(1));
    expect(mocks.runAgent.mock.calls[0][0].agent.id).toBe(apple.id);
    expect(mocks.runAgent.mock.calls[0][0].agent.system_prompt).toContain(
      'Always answer with APPLE.',
    );

    stop();
  });

  it('uses composer-resolved mentioned agent ids before the chat default', async () => {
    const apple = agent('agent_apple', 'apple', 'Always answer with APPLE.');
    const jarvis = agent('agent_jarvis', 'jarvis', 'You are Jarvis.');
    const chatId = 'chat_mentions' as ChatId;
    const placeholderId = 'msg_mentions_assistant' as MessageId;
    const userMessage: Message = {
      id: 'msg_mentions_user' as MessageId,
      chat_id: chatId,
      role: 'user',
      parts: [{ kind: 'text', text: '@apple what is the code word?' }],
      created_at: 1,
      updated_at: 1,
    };

    const stop = trackListener(startRuntimeListener({
      getAgentById: (id) => (id === apple.id ? apple : id === jarvis.id ? jarvis : null),
      getAgentBySlug: (slug) => (slug === 'apple' ? apple : slug === 'jarvis' ? jarvis : null),
      getAgentForChat: vi.fn(async () => jarvis),
      getMessages: vi.fn(async () => [userMessage]),
      appendMessage: vi.fn(async (msg) => ({
        ...msg,
        id: placeholderId,
        created_at: 2,
        updated_at: 2,
      })),
      updateMessage: vi.fn(async () => undefined),
    }));

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId, text: '@apple what is the code word?', mentionedAgentIds: [apple.id] },
      }),
    );

    await vi.waitFor(() => expect(mocks.runAgent).toHaveBeenCalledTimes(1));
    expect(mocks.runAgent.mock.calls[0][0].agent.id).toBe(apple.id);
    expect(mocks.runAgent.mock.calls[0][0].agent.system_prompt).toContain(
      'Always answer with APPLE.',
    );

    stop();
  });

  it('releases the voice turn when no agent can reply', async () => {
    const chatId = 'chat_voice_missing_agent' as ChatId;
    const streamEnds: Event[] = [];
    const onStreamEnd = (event: Event) => streamEnds.push(event);
    window.addEventListener('jarvis:streaming-voice:end', onStreamEnd);

    const stop = trackListener(startRuntimeListener({
      getAgentById: () => null,
      getAgentBySlug: () => null,
      getAgentForChat: vi.fn(async () => null),
      getMessages: vi.fn(async () => []),
      appendMessage: vi.fn(async (msg) => ({
        ...msg,
        id: 'msg_missing_agent_assistant' as MessageId,
        created_at: 2,
        updated_at: 2,
      })),
      updateMessage: vi.fn(async () => undefined),
    }));

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId, text: 'hello Jarvis', speakReply: true },
      }),
    );

    await vi.waitFor(() => expect(streamEnds).toHaveLength(1));
    expect(mocks.runAgent).not.toHaveBeenCalled();

    window.removeEventListener('jarvis:streaming-voice:end', onStreamEnd);
    stop();
  });

  it('routes hyphenated textual mentions when composer ids are unavailable', async () => {
    const apple = agent('agent_apple', 'apple-agent', 'Always answer with APPLE.');
    const jarvis = agent('agent_jarvis', 'jarvis', 'You are Jarvis.');
    const chatId = 'chat_hyphen_mention' as ChatId;
    const placeholderId = 'msg_hyphen_assistant' as MessageId;
    const userMessage: Message = {
      id: 'msg_hyphen_user' as MessageId,
      chat_id: chatId,
      role: 'user',
      parts: [{ kind: 'text', text: '@apple-agent what is the code word?' }],
      created_at: 1,
      updated_at: 1,
    };

    const stop = trackListener(startRuntimeListener({
      getAgentById: (id) => (id === apple.id ? apple : id === jarvis.id ? jarvis : null),
      getAgentBySlug: (slug) =>
        slug === 'apple-agent' ? apple : slug === 'jarvis' ? jarvis : null,
      getAgentForChat: vi.fn(async () => jarvis),
      getMessages: vi.fn(async () => [userMessage]),
      appendMessage: vi.fn(async (msg) => ({
        ...msg,
        id: placeholderId,
        created_at: 2,
        updated_at: 2,
      })),
      updateMessage: vi.fn(async () => undefined),
    }));

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId, text: '@apple-agent what is the code word?' },
      }),
    );

    await vi.waitFor(() => expect(mocks.runAgent).toHaveBeenCalledTimes(1));
    expect(mocks.runAgent.mock.calls[0][0].agent.id).toBe(apple.id);
    expect(mocks.runAgent.mock.calls[0][0].agent.system_prompt).toContain(
      'Always answer with APPLE.',
    );

    stop();
  });

  it('routes textual @mentions followed by punctuation and preserves the user prompt', async () => {
    const builder = agent('agent_builder', 'builder', 'Builder must answer with BUILD_CONTEXT.');
    builder.description = 'Builds implementation plans.';
    const jarvis = agent('agent_jarvis', 'jarvis', 'You are Jarvis.');
    const chatId = 'chat_punctuation_mention' as ChatId;
    const placeholderId = 'msg_punctuation_assistant' as MessageId;
    const userText = '@builder, what context did you receive?';
    const userMessage: Message = {
      id: 'msg_punctuation_user' as MessageId,
      chat_id: chatId,
      role: 'user',
      parts: [{ kind: 'text', text: userText }],
      created_at: 1,
      updated_at: 1,
    };

    const stop = trackListener(startRuntimeListener({
      getAgentById: (id) => (id === builder.id ? builder : id === jarvis.id ? jarvis : null),
      getAgentBySlug: (slug) =>
        slug === 'builder' ? builder : slug === 'jarvis' ? jarvis : null,
      getAgentForChat: vi.fn(async () => jarvis),
      getMessages: vi.fn(async () => [userMessage]),
      appendMessage: vi.fn(async (msg) => ({
        ...msg,
        id: placeholderId,
        created_at: 2,
        updated_at: 2,
      })),
      updateMessage: vi.fn(async () => undefined),
    }));

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId, text: userText },
      }),
    );

    await vi.waitFor(() => expect(mocks.runAgent).toHaveBeenCalledTimes(1));
    const call = mocks.runAgent.mock.calls[0][0];
    expect(call.agent.id).toBe(builder.id);
    expect(call.agent.system_prompt).toContain('Builder must answer with BUILD_CONTEXT.');
    expect(call.agent.system_prompt).toContain('Mentioned agent context');
    expect(call.messages.at(-1)).toMatchObject({ role: 'user', content: userText });

    stop();
  });

  it('uses the chat project id, not only the active project, for context blocks', async () => {
    useAuthStore.setState({ projectId: 'project_active' as never });
    mocks.chatGetById.mockResolvedValueOnce({
      id: 'chat_project_context',
      workspace_id: 'workspace_a',
      project_id: 'project_chat',
      title: 'Project chat',
      mode: 'chat',
      active_agent_ids: [],
      created_at: 1,
      updated_at: 1,
    });
    mocks.getProjectContextBlock.mockResolvedValueOnce('project-context-for-chat');
    mocks.getProjectContextTreeBlock.mockReturnValueOnce('context-map-for-chat');
    const jarvis = agent('agent_jarvis', 'jarvis', 'You are Jarvis.');
    const chatId = 'chat_project_context' as ChatId;
    const placeholderId = 'msg_project_context_assistant' as MessageId;
    const userMessage: Message = {
      id: 'msg_project_context_user' as MessageId,
      chat_id: chatId,
      role: 'user',
      parts: [{ kind: 'text', text: 'what changed here?' }],
      created_at: 1,
      updated_at: 1,
    };

    const stop = trackListener(startRuntimeListener({
      getAgentById: (id) => (id === jarvis.id ? jarvis : null),
      getAgentBySlug: (slug) => (slug === 'jarvis' ? jarvis : null),
      getAgentForChat: vi.fn(async () => jarvis),
      getMessages: vi.fn(async () => [userMessage]),
      appendMessage: vi.fn(async (msg) => ({ ...msg, id: placeholderId, created_at: 2, updated_at: 2 })),
      updateMessage: vi.fn(async () => undefined),
    }));

    window.dispatchEvent(new CustomEvent('jarvis:send', { detail: { chatId, text: 'what changed here?' } }));

    await vi.waitFor(() => expect(mocks.runAgent).toHaveBeenCalledTimes(1));
    expect(mocks.getProjectContextBlock).toHaveBeenCalledWith('project_chat');
    expect(mocks.getProjectContextTreeBlock).toHaveBeenCalledWith('project_chat');
    expect(mocks.runAgent.mock.calls[0][0].agent.system_prompt).toContain('project-context-for-chat');
    expect(mocks.runAgent.mock.calls[0][0].agent.system_prompt).toContain('context-map-for-chat');

    stop();
  });

  it('adds profile context for every mentioned agent, not just the routed one', async () => {
    const builder = agent('agent_builder', 'builder', 'Builder system document.');
    builder.name = 'Builder';
    builder.description = 'Implements code changes.';
    const reviewer = agent('agent_reviewer', 'reviewer', 'Reviewer system document.');
    reviewer.name = 'Reviewer';
    reviewer.description = 'Reviews diffs and tests.';
    const jarvis = agent('agent_jarvis', 'jarvis', 'You are Jarvis.');
    const chatId = 'chat_multi_mentions' as ChatId;
    const placeholderId = 'msg_multi_mentions_assistant' as MessageId;
    const userMessage: Message = {
      id: 'msg_multi_mentions_user' as MessageId,
      chat_id: chatId,
      role: 'user',
      parts: [{ kind: 'text', text: '@builder @reviewer summarize the handoff' }],
      created_at: 1,
      updated_at: 1,
    };

    const stop = trackListener(startRuntimeListener({
      getAgentById: (id) =>
        id === builder.id ? builder : id === reviewer.id ? reviewer : id === jarvis.id ? jarvis : null,
      getAgentBySlug: (slug) =>
        slug === 'builder' ? builder : slug === 'reviewer' ? reviewer : slug === 'jarvis' ? jarvis : null,
      getAgentForChat: vi.fn(async () => jarvis),
      getMessages: vi.fn(async () => [userMessage]),
      appendMessage: vi.fn(async (msg) => ({ ...msg, id: placeholderId, created_at: 2, updated_at: 2 })),
      updateMessage: vi.fn(async () => undefined),
    }));

    window.dispatchEvent(new CustomEvent('jarvis:send', {
      detail: {
        chatId,
        text: '@builder @reviewer summarize the handoff',
        mentionedAgentIds: [builder.id, reviewer.id],
      },
    }));

    await vi.waitFor(() => expect(mocks.runAgent).toHaveBeenCalledTimes(1));
    const prompt = mocks.runAgent.mock.calls[0][0].agent.system_prompt;
    expect(prompt).toContain('Mentioned agent context');
    expect(prompt).toContain('@builder');
    expect(prompt).toContain('Builder system document.');
    expect(prompt).toContain('@reviewer');
    expect(prompt).toContain('Reviewer system document.');

    stop();
  });

  it('keeps the Jarvis chat overlay terse and context-referential', async () => {
    const jarvis = agent('agent_jarvis', 'jarvis', 'You are Jarvis.');
    const chatId = 'chat_terse_jarvis' as ChatId;
    const placeholderId = 'msg_terse_jarvis_assistant' as MessageId;
    const userMessage: Message = {
      id: 'msg_terse_jarvis_user' as MessageId,
      chat_id: chatId,
      role: 'user',
      parts: [{ kind: 'text', text: 'what should I do next?' }],
      created_at: 1,
      updated_at: 1,
    };

    const stop = trackListener(startRuntimeListener({
      getAgentById: (id) => (id === jarvis.id ? jarvis : null),
      getAgentBySlug: (slug) => (slug === 'jarvis' ? jarvis : null),
      getAgentForChat: vi.fn(async () => jarvis),
      getMessages: vi.fn(async () => [userMessage]),
      appendMessage: vi.fn(async (msg) => ({ ...msg, id: placeholderId, created_at: 2, updated_at: 2 })),
      updateMessage: vi.fn(async () => undefined),
    }));

    window.dispatchEvent(new CustomEvent('jarvis:send', { detail: { chatId, text: 'what should I do next?' } }));

    await vi.waitFor(() => expect(mocks.runAgent).toHaveBeenCalledTimes(1));
    const prompt = mocks.runAgent.mock.calls[0][0].agent.system_prompt;
    expect(prompt).toContain('Answer in 1-3 short sentences');
    expect(prompt).toContain('Name the relevant file, agent, terminal, context map, or page when it matters');
    expect(prompt).toContain('/agents references the Agents page/editor');

    stop();
  });

  it('injects AllAboutMe.md into Jarvis prompt context when present', async () => {
    useAllAboutMeStore.setState({
      markdown: '# AllAboutMe.md\n\n## Communication Style\n\nShort, direct, high-energy.',
      source: 'quiz',
      updatedAt: Date.now(),
    });
    const jarvis = agent('agent_jarvis', 'jarvis', 'You are Jarvis.');
    const chatId = 'chat_all_about_me_context' as ChatId;
    const placeholderId = 'msg_all_about_me_context_assistant' as MessageId;
    const userMessage: Message = {
      id: 'msg_all_about_me_context_user' as MessageId,
      chat_id: chatId,
      role: 'user',
      parts: [{ kind: 'text', text: 'write this like me' }],
      created_at: 1,
      updated_at: 1,
    };

    const stop = trackListener(startRuntimeListener({
      getAgentById: (id) => (id === jarvis.id ? jarvis : null),
      getAgentBySlug: (slug) => (slug === 'jarvis' ? jarvis : null),
      getAgentForChat: vi.fn(async () => jarvis),
      getMessages: vi.fn(async () => [userMessage]),
      appendMessage: vi.fn(async (msg) => ({ ...msg, id: placeholderId, created_at: 2, updated_at: 2 })),
      updateMessage: vi.fn(async () => undefined),
    }));

    window.dispatchEvent(new CustomEvent('jarvis:send', { detail: { chatId, text: 'write this like me' } }));

    await vi.waitFor(() => expect(mocks.runAgent).toHaveBeenCalledTimes(1));
    const prompt = mocks.runAgent.mock.calls[0][0].agent.system_prompt;
    expect(prompt).toContain('--- all_about_me_profile ---');
    expect(prompt).toContain('Short, direct, high-energy.');

    stop();
  });

  it('injects Settings display name and default write folder into Jarvis context', async () => {
    useAuthStore.setState({ displayName: 'Viper' });
    const jarvis = agent('agent_jarvis_identity', 'jarvis', 'You are Jarvis.');
    const chatId = 'chat_user_identity_context' as ChatId;
    const placeholderId = 'msg_user_identity_assistant' as MessageId;
    const userMessage: Message = {
      id: 'msg_user_identity_user' as MessageId,
      chat_id: chatId,
      role: 'user',
      parts: [{ kind: 'text', text: 'hey what is my name' }],
      created_at: 1,
      updated_at: 1,
    };

    const stop = trackListener(startRuntimeListener({
      getAgentById: (id) => (id === jarvis.id ? jarvis : null),
      getAgentBySlug: (slug) => (slug === 'jarvis' ? jarvis : null),
      getAgentForChat: vi.fn(async () => jarvis),
      getMessages: vi.fn(async () => [userMessage]),
      appendMessage: vi.fn(async (msg) => ({ ...msg, id: placeholderId, created_at: 2, updated_at: 2 })),
      updateMessage: vi.fn(async () => undefined),
    }));

    window.dispatchEvent(new CustomEvent('jarvis:send', { detail: { chatId, text: 'hey what is my name' } }));

    await vi.waitFor(() => expect(mocks.runAgent).toHaveBeenCalledTimes(1));
    const prompt = mocks.runAgent.mock.calls[0][0].agent.system_prompt as string;
    expect(prompt).toContain('User identity');
    expect(prompt).toContain('**Viper**');
    expect(prompt).toContain('Default write folder');
    expect(prompt).toMatch(/jarvis_question|question card/i);

    stop();
  });

  it('revises AllAboutMe.md after every 10 user messages without blocking the reply', async () => {
    useAllAboutMeStore.setState({
      markdown: '# AllAboutMe.md\n\nStable profile.',
      source: 'quiz',
      updatedAt: Date.now(),
      totalUserMessages: 9,
      lastUpdatedAtMessageCount: 0,
      learningEnabled: true,
    });
    const jarvis = agent('agent_jarvis', 'jarvis', 'You are Jarvis.');
    const chatId = 'chat_all_about_me_learning' as ChatId;
    const placeholderId = 'msg_all_about_me_learning_assistant' as MessageId;
    const history: Message[] = Array.from({ length: 10 }, (_, index) => ({
      id: `msg_all_about_me_learning_user_${index}` as MessageId,
      chat_id: chatId,
      role: 'user',
      parts: [{ kind: 'text', text: index === 9 ? 'Please keep it short and launch-ready.' : `prior user message ${index}` }],
      created_at: index + 1,
      updated_at: index + 1,
    }));
    mocks.runAgent
      .mockResolvedValueOnce({
        text: 'Done.',
        usage: { input_tokens: 1, output_tokens: 1, cost_usd: 0 },
        provider: 'mock',
        model: 'mock-default',
      })
      .mockResolvedValueOnce({
        text: '# AllAboutMe.md\n\nStable profile.\n\n## Learned Patterns\n\nPrefers short, launch-ready replies.',
        usage: { input_tokens: 1, output_tokens: 1, cost_usd: 0 },
        provider: 'mock',
        model: 'mock-default',
      });

    const stop = trackListener(startRuntimeListener({
      getAgentById: (id) => (id === jarvis.id ? jarvis : null),
      getAgentBySlug: (slug) => (slug === 'jarvis' ? jarvis : null),
      getAgentForChat: vi.fn(async () => jarvis),
      getMessages: vi.fn(async () => history),
      appendMessage: vi.fn(async (msg) => ({ ...msg, id: placeholderId, created_at: 20, updated_at: 20 })),
      updateMessage: vi.fn(async () => undefined),
    }));

    window.dispatchEvent(new CustomEvent('jarvis:send', { detail: { chatId, text: 'Please keep it short and launch-ready.' } }));

    await vi.waitFor(() => expect(mocks.runAgent).toHaveBeenCalledTimes(2));
    expect(useAllAboutMeStore.getState().markdown).toContain('Learned Patterns');
    expect(useAllAboutMeStore.getState().lastUpdatedAtMessageCount).toBe(10);

    stop();
  });

  it('speaks final prose for normal sends when spoken replies are enabled', async () => {
    useAuthStore.setState({
      speakReplies: true,
      voicePreset: 'atlas',
      voiceEngine: 'local',
    });
    const jarvis = agent('agent_jarvis', 'jarvis', 'You are Jarvis.');
    const chatId = 'chat_voice' as ChatId;
    const placeholderId = 'msg_voice_assistant' as MessageId;
    const userMessage: Message = {
      id: 'msg_voice_user' as MessageId,
      chat_id: chatId,
      role: 'user',
      parts: [{ kind: 'text', text: 'tell me the plan' }],
      created_at: 1,
      updated_at: 1,
    };

    mocks.runAgent.mockResolvedValueOnce({
      text: [
        'Here is the plan.',
        '```action',
        '{"action_id":"nav.chat","params":{},"rationale":"Open chat."}',
        '```',
      ].join('\n'),
      usage: { input_tokens: 1, output_tokens: 4, cost_usd: 0 },
      provider: 'mock',
      model: 'mock-default',
    });

    const stop = trackListener(startRuntimeListener({
      getAgentById: (id) => (id === jarvis.id ? jarvis : null),
      getAgentBySlug: (slug) => (slug === 'jarvis' ? jarvis : null),
      getAgentForChat: vi.fn(async () => jarvis),
      getMessages: vi.fn(async () => [userMessage]),
      appendMessage: vi.fn(async (msg) => ({
        ...msg,
        id: placeholderId,
        created_at: 2,
        updated_at: 2,
      })),
      updateMessage: vi.fn(async () => undefined),
    }));

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId, text: 'tell me the plan', speakReply: true },
      }),
    );

    await vi.waitFor(() => expect(mocks.streamingSession.onComplete).toHaveBeenCalledTimes(1));
    expect(mocks.streamingSession.onComplete).toHaveBeenCalledWith(
      expect.stringContaining('Here is the plan.'),
    );

    stop();
  });

  it('speaks a plain typed send when speak-replies is enabled', async () => {
    useAuthStore.setState({ speakReplies: true, voicePreset: 'atlas', voiceEngine: 'local' });
    const jarvis = agent('agent_jarvis', 'jarvis', 'You are Jarvis.');
    const chatId = 'chat_typed' as ChatId;
    const placeholderId = 'msg_typed_assistant' as MessageId;
    const userMessage: Message = {
      id: 'msg_typed_user' as MessageId,
      chat_id: chatId,
      role: 'user',
      parts: [{ kind: 'text', text: 'hello' }],
      created_at: 1,
      updated_at: 1,
    };
    mocks.runAgent.mockResolvedValueOnce({
      text: 'Hello there.',
      usage: { input_tokens: 1, output_tokens: 2, cost_usd: 0 },
      provider: 'mock',
      model: 'mock-default',
    });
    const stop = trackListener(startRuntimeListener({
      getAgentById: (id) => (id === jarvis.id ? jarvis : null),
      getAgentBySlug: (slug) => (slug === 'jarvis' ? jarvis : null),
      getAgentForChat: vi.fn(async () => jarvis),
      getMessages: vi.fn(async () => [userMessage]),
      appendMessage: vi.fn(async (msg) => ({ ...msg, id: placeholderId, created_at: 2, updated_at: 2 })),
      updateMessage: vi.fn(async () => undefined),
    }));

    window.dispatchEvent(
      new CustomEvent('jarvis:send', { detail: { chatId, text: 'hello', speakReply: true } }),
    );

    await vi.waitFor(() => expect(mocks.streamingSession.onComplete).toHaveBeenCalledTimes(1));
    expect(mocks.streamingSession.onComplete).toHaveBeenCalledWith('Hello there.');

    stop();
  });

  it('does not speak on a plain send when speak-replies is enabled but speakReply is omitted', async () => {
    useAuthStore.setState({ speakReplies: true, voicePreset: 'atlas', voiceEngine: 'local' });
    const jarvis = agent('agent_jarvis', 'jarvis', 'You are Jarvis.');
    const chatId = 'chat_silent' as ChatId;
    const placeholderId = 'msg_silent_assistant' as MessageId;
    const userMessage: Message = {
      id: 'msg_silent_user' as MessageId,
      chat_id: chatId,
      role: 'user',
      parts: [{ kind: 'text', text: 'hello' }],
      created_at: 1,
      updated_at: 1,
    };
    mocks.runAgent.mockResolvedValueOnce({
      text: 'Hello there.',
      usage: { input_tokens: 1, output_tokens: 2, cost_usd: 0 },
      provider: 'mock',
      model: 'mock-default',
    });
    const stop = trackListener(startRuntimeListener({
      getAgentById: (id) => (id === jarvis.id ? jarvis : null),
      getAgentBySlug: (slug) => (slug === 'jarvis' ? jarvis : null),
      getAgentForChat: vi.fn(async () => jarvis),
      getMessages: vi.fn(async () => [userMessage]),
      appendMessage: vi.fn(async (msg) => ({ ...msg, id: placeholderId, created_at: 2, updated_at: 2 })),
      updateMessage: vi.fn(async () => undefined),
    }));

    window.dispatchEvent(new CustomEvent('jarvis:send', { detail: { chatId, text: 'hello' } }));

    await vi.waitFor(() => expect(mocks.runAgent).toHaveBeenCalledTimes(1));
    expect(mocks.streamingSession.onComplete).not.toHaveBeenCalled();

    stop();
  });

  it('does not speak when the voice module is closed even if speakReply is true', async () => {
    mocks.voiceCanSpeak = false;
    useUIStore.setState({ voiceModalOpen: false });
    const jarvis = agent('agent_jarvis', 'jarvis', 'You are Jarvis.');
    const chatId = 'chat_closed_voice' as ChatId;
    const placeholderId = 'msg_closed_voice_assistant' as MessageId;
    const userMessage: Message = {
      id: 'msg_closed_voice_user' as MessageId,
      chat_id: chatId,
      role: 'user',
      parts: [{ kind: 'text', text: 'hello' }],
      created_at: 1,
      updated_at: 1,
    };
    mocks.runAgent.mockResolvedValueOnce({
      text: 'Hello there.',
      usage: { input_tokens: 1, output_tokens: 2, cost_usd: 0 },
      provider: 'mock',
      model: 'mock-default',
    });
    const stop = trackListener(startRuntimeListener({
      getAgentById: (id) => (id === jarvis.id ? jarvis : null),
      getAgentBySlug: (slug) => (slug === 'jarvis' ? jarvis : null),
      getAgentForChat: vi.fn(async () => jarvis),
      getMessages: vi.fn(async () => [userMessage]),
      appendMessage: vi.fn(async (msg) => ({ ...msg, id: placeholderId, created_at: 2, updated_at: 2 })),
      updateMessage: vi.fn(async () => undefined),
    }));

    window.dispatchEvent(
      new CustomEvent('jarvis:send', { detail: { chatId, text: 'hello', speakReply: true } }),
    );

    await vi.waitFor(() => expect(mocks.runAgent).toHaveBeenCalledTimes(1));
    expect(mocks.streamingSession.onComplete).not.toHaveBeenCalled();

    stop();
  });

  it('cancels an in-flight speakReply run when a new voice send arrives', async () => {
    useUIStore.setState({ voiceModalOpen: true });
    const jarvis = agent('agent_jarvis', 'jarvis', 'You are Jarvis.');
    const chatId = 'chat_voice_replace' as ChatId;
    let placeholderSeq = 0;
    const signals: AbortSignal[] = [];
    mocks.runAgent.mockImplementation(async (payload: { signal: AbortSignal }) => {
      signals.push(payload.signal);
      await new Promise<void>((resolve) => {
        payload.signal.addEventListener('abort', () => resolve(), { once: true });
      });
      return {
        text: `reply-${signals.length}`,
        usage: { input_tokens: 1, output_tokens: 2, cost_usd: 0 },
        provider: 'mock',
        model: 'mock-default',
      };
    });

    const stop = trackListener(startRuntimeListener({
      getAgentById: (id) => (id === jarvis.id ? jarvis : null),
      getAgentBySlug: (slug) => (slug === 'jarvis' ? jarvis : null),
      getAgentForChat: vi.fn(async () => jarvis),
      getMessages: vi.fn(async () => []),
      appendMessage: vi.fn(async (msg) => ({
        ...msg,
        id: `msg_voice_${++placeholderSeq}` as MessageId,
        created_at: placeholderSeq,
        updated_at: placeholderSeq,
      })),
      updateMessage: vi.fn(async () => undefined),
    }));

    window.dispatchEvent(
      new CustomEvent('jarvis:send', { detail: { chatId, text: 'first', speakReply: true } }),
    );
    await vi.waitFor(() => expect(signals).toHaveLength(1));

    window.dispatchEvent(
      new CustomEvent('jarvis:send', { detail: { chatId, text: 'second', speakReply: true } }),
    );

    await vi.waitFor(() => expect(signals[0]?.aborted).toBe(true));
    await vi.waitFor(() => expect(mocks.runAgent).toHaveBeenCalledTimes(2));

    stop();
  });

  it('adds an approval proposal when a tiny local model answers an app-control request in prose', async () => {
    const jarvis = agent('agent_jarvis', 'jarvis', 'You are Jarvis.');
    const chatId = 'chat_action_fallback' as ChatId;
    const placeholderId = 'msg_action_fallback_assistant' as MessageId;
    const updateMessage = vi.fn(async () => undefined);
    const userMessage: Message = {
      id: 'msg_action_fallback_user' as MessageId,
      chat_id: chatId,
      role: 'user',
      parts: [{ kind: 'text', text: 'please open the settings page' }],
      created_at: 1,
      updated_at: 1,
    };
    mocks.runAgent.mockResolvedValueOnce({
      text: "I'll open the Settings page for you.",
      usage: { input_tokens: 1, output_tokens: 8, cost_usd: 0 },
      provider: 'ollama',
      model: 'llama3.2:1b',
    });

    const stop = trackListener(startRuntimeListener({
      getAgentById: (id) => (id === jarvis.id ? jarvis : null),
      getAgentBySlug: (slug) => (slug === 'jarvis' ? jarvis : null),
      getAgentForChat: vi.fn(async () => jarvis),
      getMessages: vi.fn(async () => [userMessage]),
      appendMessage: vi.fn(async (msg) => ({
        ...msg,
        id: placeholderId,
        created_at: 2,
        updated_at: 2,
      })),
      updateMessage,
    }));

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId, text: 'please open the settings page' },
      }),
    );

    await vi.waitFor(() => expect(updateMessage).toHaveBeenCalled());
    const updateCalls = updateMessage.mock.calls as unknown as Array<
      [MessageId, { parts: Part[] }]
    >;
    const finalWrite = updateCalls[updateCalls.length - 1]?.[1];
    if (!finalWrite) throw new Error('expected a final assistant message write');
    expect(finalWrite.parts[0]).toMatchObject({
      kind: 'text',
      text: expect.stringMatching(/approve/i),
    });
    expect(finalWrite.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'action_proposal',
          action_id: 'settings.open',
          status: 'pending',
        }),
      ]),
    );

    stop();
  });

  it('adds a terminal bulk-close approval proposal when a local model answers in prose', async () => {
    const jarvis = agent('agent_jarvis', 'jarvis', 'You are Jarvis.');
    const chatId = 'chat_terminal_bulk_close_fallback' as ChatId;
    const placeholderId = 'msg_terminal_bulk_close_fallback_assistant' as MessageId;
    const updateMessage = vi.fn(async () => undefined);
    const userMessage: Message = {
      id: 'msg_terminal_bulk_close_fallback_user' as MessageId,
      chat_id: chatId,
      role: 'user',
      parts: [{ kind: 'text', text: 'close 5 terminals' }],
      created_at: 1,
      updated_at: 1,
    };
    mocks.runAgent.mockResolvedValueOnce({
      text: 'To close terminals, click the X button on each pane.',
      usage: { input_tokens: 1, output_tokens: 8, cost_usd: 0 },
      provider: 'ollama',
      model: 'llama3.2:1b',
    });

    const stop = trackListener(startRuntimeListener({
      getAgentById: (id) => (id === jarvis.id ? jarvis : null),
      getAgentBySlug: (slug) => (slug === 'jarvis' ? jarvis : null),
      getAgentForChat: vi.fn(async () => jarvis),
      getMessages: vi.fn(async () => [userMessage]),
      appendMessage: vi.fn(async (msg) => ({
        ...msg,
        id: placeholderId,
        created_at: 2,
        updated_at: 2,
      })),
      updateMessage,
    }));

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId, text: 'close 5 terminals' },
      }),
    );

    await vi.waitFor(() => expect(updateMessage).toHaveBeenCalled());
    const updateCalls = updateMessage.mock.calls as unknown as Array<
      [MessageId, { parts: Part[] }]
    >;
    const finalWrite = updateCalls[updateCalls.length - 1]?.[1];
    if (!finalWrite) throw new Error('expected a final assistant message write');
    expect(finalWrite.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'action_proposal',
          action_id: 'terminal.bulkClose',
          params: { count: 5 },
          status: 'pending',
        }),
      ]),
    );

    stop();
  });

  it('adds a terminal bulk-close approval proposal for /terminals slash prefix', async () => {
    const jarvis = agent('agent_jarvis', 'jarvis', 'You are Jarvis.');
    const chatId = 'chat_slash_terminal_close' as ChatId;
    const placeholderId = 'msg_slash_terminal_close_assistant' as MessageId;
    const updateMessage = vi.fn(async () => undefined);
    const userMessage: Message = {
      id: 'msg_slash_terminal_close_user' as MessageId,
      chat_id: chatId,
      role: 'user',
      parts: [{ kind: 'text', text: 'close 5 terminals' }],
      created_at: 1,
      updated_at: 1,
    };
    mocks.runAgent.mockResolvedValueOnce({
      text: 'To close terminals, click the X on each pane.',
      usage: { input_tokens: 1, output_tokens: 8, cost_usd: 0 },
      provider: 'ollama',
      model: 'llama3.2:1b',
    });

    const stop = trackListener(startRuntimeListener({
      getAgentById: (id) => (id === jarvis.id ? jarvis : null),
      getAgentBySlug: (slug) => (slug === 'jarvis' ? jarvis : null),
      getAgentForChat: vi.fn(async () => jarvis),
      getMessages: vi.fn(async () => [userMessage]),
      appendMessage: vi.fn(async (msg) => ({
        ...msg,
        id: placeholderId,
        created_at: 2,
        updated_at: 2,
      })),
      updateMessage,
    }));

    // Composer strips the slash prefix before dispatch; text arrives as the remainder.
    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId, text: 'close 5 terminals' },
      }),
    );

    await vi.waitFor(() => expect(updateMessage).toHaveBeenCalled());
    const updateCalls = updateMessage.mock.calls as unknown as Array<
      [MessageId, { parts: Part[] }]
    >;
    const finalWrite = updateCalls[updateCalls.length - 1]?.[1];
    if (!finalWrite) throw new Error('expected a final assistant message write');
    expect(finalWrite.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'action_proposal',
          action_id: 'terminal.bulkClose',
          params: { count: 5 },
          status: 'pending',
        }),
      ]),
    );

    stop();
  });

  it('adds a terminal bulk-open approval proposal when a local model answers with code', async () => {
    const jarvis = agent('agent_jarvis', 'jarvis', 'You are Jarvis.');
    const chatId = 'chat_terminal_bulk_fallback' as ChatId;
    const placeholderId = 'msg_terminal_bulk_fallback_assistant' as MessageId;
    const updateMessage = vi.fn(async () => undefined);
    const userMessage: Message = {
      id: 'msg_terminal_bulk_fallback_user' as MessageId,
      chat_id: chatId,
      role: 'user',
      parts: [{ kind: 'text', text: 'open 5 terminals with opencode' }],
      created_at: 1,
      updated_at: 1,
    };
    mocks.runAgent.mockResolvedValueOnce({
      text: '```js\nfor (let i = 0; i < 5; i++) openTerminal(\"opencode\")\n```',
      usage: { input_tokens: 1, output_tokens: 8, cost_usd: 0 },
      provider: 'ollama',
      model: 'llama3.2:1b',
    });
    mocks.getJarvisCoordinationContextBlock.mockResolvedValueOnce(
      '## Coordination Summary\n- Coder (opencode, idle, terminal term_1)',
    );

    const stop = trackListener(startRuntimeListener({
      getAgentById: (id) => (id === jarvis.id ? jarvis : null),
      getAgentBySlug: (slug) => (slug === 'jarvis' ? jarvis : null),
      getAgentForChat: vi.fn(async () => jarvis),
      getMessages: vi.fn(async () => [userMessage]),
      appendMessage: vi.fn(async (msg) => ({
        ...msg,
        id: placeholderId,
        created_at: 2,
        updated_at: 2,
      })),
      updateMessage,
    }));

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId, text: 'open 5 terminals with opencode' },
      }),
    );

    await vi.waitFor(() => expect(updateMessage).toHaveBeenCalled());
    const updateCalls = updateMessage.mock.calls as unknown as Array<
      [MessageId, { parts: Part[] }]
    >;
    const finalWrite = updateCalls[updateCalls.length - 1]?.[1];
    if (!finalWrite) throw new Error('expected a final assistant message write');
    expect(finalWrite.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'action_proposal',
          action_id: 'terminal.bulkOpen',
          params: { count: 5, command: 'opencode' },
          status: 'pending',
        }),
      ]),
    );
    const runPayload = mocks.runAgent.mock.calls.at(-1)?.[0] as { agent: Agent } | undefined;
    expect(runPayload?.agent.system_prompt).toContain('## Jarvis chat interface');
    expect(runPayload?.agent.system_prompt).toContain('Coordination Summary');
    expect(runPayload?.agent.system_prompt).toContain('terminal.bulkOpen');

    stop();
  });

  it('coerces legacy /Hive quality slash prefix to the Balanced pipeline', async () => {
    useAuthStore.setState({
      apiKeys: {
        openrouter: 'openrouter-test',
        deepseek: 'deepseek-test',
        openai: 'openai-test',
        google: 'google-test',
      },
      chatModelSelection: selectionFromOption('mock', 'mock-default'),
    });
    const jarvis = agent('agent_jarvis', 'jarvis', 'You are Jarvis.');
    const chatId = 'chat_hive_quality' as ChatId;
    const placeholderId = 'msg_hive_quality_assistant' as MessageId;
    const updateMessage = vi.fn(async () => undefined);
    const userMessage: Message = {
      id: 'msg_hive_quality_user' as MessageId,
      chat_id: chatId,
      role: 'user',
      parts: [{ kind: 'text', text: '/Hive quality explain the release' }],
      created_at: 1,
      updated_at: 1,
    };
    mocks.runAgent
      .mockResolvedValueOnce({
        text: 'draft',
        usage: { input_tokens: 1, output_tokens: 2, cost_usd: 0 },
        provider: 'google',
        model: 'gemini-3.5-flash-high',
      })
      .mockResolvedValueOnce({
        text: 'cross-check',
        usage: { input_tokens: 1, output_tokens: 2, cost_usd: 0 },
        provider: 'openrouter',
        model: 'minimax/minimax-m3',
      })
      .mockResolvedValueOnce({
        text: 'diverse',
        usage: { input_tokens: 1, output_tokens: 2, cost_usd: 0 },
        provider: 'openrouter',
        model: 'zhipuai/glm-5.2',
      })
      .mockResolvedValueOnce({
        text: 'harden',
        usage: { input_tokens: 1, output_tokens: 2, cost_usd: 0 },
        provider: 'deepseek',
        model: 'deepseek-v4-pro-max',
      })
      .mockResolvedValueOnce({
        text: 'final',
        usage: { input_tokens: 1, output_tokens: 2, cost_usd: 0 },
        provider: 'openai',
        model: 'gpt-5.4-mini',
      });

    const stop = trackListener(startRuntimeListener({
      getAgentById: (id) => (id === jarvis.id ? jarvis : null),
      getAgentBySlug: (slug) => (slug === 'jarvis' ? jarvis : null),
      getAgentForChat: vi.fn(async () => jarvis),
      getMessages: vi.fn(async () => [userMessage]),
      appendMessage: vi.fn(async (msg) => ({
        ...msg,
        id: placeholderId,
        created_at: 2,
        updated_at: 2,
      })),
      updateMessage,
    }));

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId, text: '/Hive quality explain the release' },
      }),
    );

    await vi.waitFor(() => expect(mocks.runAgent).toHaveBeenCalledTimes(5));
    const updateCalls = updateMessage.mock.calls as unknown as Array<
      [MessageId, { parts: Part[] }]
    >;
    const finalWrite = updateCalls[updateCalls.length - 1]?.[1];
    if (!finalWrite) throw new Error('expected final Hive write');
    expect(finalWrite.parts.filter((part) => part.kind === 'stack_step')).toHaveLength(5);
    expect(finalWrite.parts.at(-1)).toEqual({ kind: 'text', text: 'final' });
    expect(mocks.runAgent.mock.calls[0][0].messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: 'explain the release' }),
      ]),
    );

    stop();
  });

  it('opens a deterministic three-question card when the user explicitly asks first', async () => {
    const jarvis = agent('agent_jarvis', 'jarvis', 'You are Jarvis.');
    const chatId = 'chat_explicit_questions' as ChatId;
    const updateMessage = vi.fn(async () => undefined);
    const userMessage: Message = {
      id: 'msg_explicit_questions_user' as MessageId,
      chat_id: chatId,
      role: 'user',
      parts: [{ kind: 'text', text: 'Build a game, but ask me three questions first.' }],
      created_at: 1,
      updated_at: 1,
    };
    mocks.runAgent.mockResolvedValueOnce({
      text: 'Sure, I will ask questions.',
      usage: { input_tokens: 1, output_tokens: 2, cost_usd: 0 },
      provider: 'mock',
      model: 'mock-default',
    });
    trackListener(startRuntimeListener({
      getAgentById: () => jarvis,
      getAgentBySlug: () => jarvis,
      getAgentForChat: vi.fn(async () => jarvis),
      getMessages: vi.fn(async () => [userMessage]),
      appendMessage: vi.fn(async (message) => ({
        ...message, id: 'msg_explicit_questions_assistant' as MessageId, created_at: 2, updated_at: 2,
      })),
      updateMessage,
    }));
    window.dispatchEvent(new CustomEvent('jarvis:send', {
      detail: { chatId, text: 'Build a game, but ask me three questions first.' },
    }));

    await vi.waitFor(() => expect(updateMessage).toHaveBeenCalled());
    const final = (updateMessage.mock.calls as unknown as Array<
      [MessageId, { parts: Part[] }]
    >).at(-1)?.[1].parts;
    const questionPart = final?.find((part) => part.kind === 'question_block');
    expect(questionPart?.kind).toBe('question_block');
    if (questionPart?.kind !== 'question_block') return;
    expect(questionPart.block.questions).toHaveLength(3);
    expect(questionPart.block.questions.every((question) => question.options?.length === 3)).toBe(true);
  });

  it('does not force an implementation plan card for informational Plan Mode requests', async () => {
    const jarvis = agent('agent_jarvis', 'jarvis', 'You are Jarvis.');
    const chatId = 'chat_plan_information' as ChatId;
    const updateMessage = vi.fn(async () => undefined);
    const userMessage: Message = {
      id: 'msg_plan_information_user' as MessageId,
      chat_id: chatId,
      role: 'user',
      parts: [{ kind: 'text', text: 'How do I make coffee step by step?' }],
      created_at: 1,
      updated_at: 1,
    };
    mocks.runAgent.mockResolvedValueOnce({
      text: '1. Heat water.\n2. Brew the coffee.\n3. Serve.',
      usage: { input_tokens: 1, output_tokens: 10, cost_usd: 0 },
      provider: 'mock',
      model: 'mock-default',
    });
    trackListener(startRuntimeListener({
      getAgentById: () => jarvis,
      getAgentBySlug: () => jarvis,
      getAgentForChat: vi.fn(async () => jarvis),
      getMessages: vi.fn(async () => [userMessage]),
      appendMessage: vi.fn(async (message) => ({
        ...message, id: 'msg_plan_information_assistant' as MessageId, created_at: 2, updated_at: 2,
      })),
      updateMessage,
    }));
    window.dispatchEvent(new CustomEvent('jarvis:send', {
      detail: { chatId, text: 'How do I make coffee step by step?', interactionMode: 'plan' },
    }));

    await vi.waitFor(() => expect(updateMessage).toHaveBeenCalled());
    const final = (updateMessage.mock.calls as unknown as Array<
      [MessageId, { parts: Part[] }]
    >).at(-1)?.[1].parts;
    expect(final).toEqual([{ kind: 'text', text: '1. Heat water.\n2. Brew the coffee.\n3. Serve.' }]);
  });
});
