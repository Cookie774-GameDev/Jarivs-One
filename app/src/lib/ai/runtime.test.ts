import { vi } from 'vitest';
import { createJarvisDb } from '@/lib/db';
import { TEST_INDEXED_DB, uniqueTestDbName } from '@/test/indexedDb';
import type { Agent, Message, Part } from '@/types';
import type { AgentId, ChatId, MessageId } from '@/types/common';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';
import { useAllAboutMeStore } from '@/features/all-about-me/store';
import { useVoiceStore } from '@/features/voice/store';
import { createVoiceSessionBinding } from '@/features/voice/voiceSessionBinding';
import { toast } from '@/components/ui/toast';
import { writeConnectionPickerStates } from './connectionState';
import type { JarvisShadowCompilationDeps } from '@/lib/jarvis/shadowCompilation';
import type { CanonicalProviderEvidence } from '@/lib/jarvis/artifactProducerAdapters';
import { toJarvisApprovalRow, toJarvisRunRow } from '@/lib/db/jarvisMappers';
import type {
  JarvisApprovalV1,
  JarvisCapabilitySnapshot,
  JarvisContextItem,
  JarvisRun,
} from '@/lib/jarvis/contracts';
import { createJarvisRepositories } from '@/lib/db/jarvisRepositories';
import {
  createJarvisActionCatalog,
  DEFAULT_JARVIS_ACTION_REGISTRATIONS,
} from '@/lib/jarvis/actions/catalog';
import { createJarvisSecurityRuntime } from '@/lib/jarvis/jarvisSecurityRuntime';
import {
  createJarvisExistingCredentialAuthorization,
  createPluginCredentialAccountGrantRepository,
} from '@/features/plugins/credentialAuthorization';
import type { CanonicalPluginArtifactCapability } from '@/features/plugins/runtime';

const mocks = vi.hoisted(() => ({
  runAgent: vi.fn(),
  chatGetById: vi.fn(),
  getProjectContextBlock: vi.fn(),
  getProjectContextTreeBlock: vi.fn(),
  getConnectedFilesBlock: vi.fn(),
  getJarvisCoordinationContextBlock: vi.fn(),
  getJarvisTerminalOperatingContextBlock: vi.fn(),
  getJarvisConnectivityInventoryBlock: vi.fn(),
  retrieveApprovedLocalKnowledge:
    vi.fn<typeof import('@/features/context/retrieval').retrieveApprovedLocalKnowledge>(),
  buildJarvisContextPackForAi: vi.fn(
    async (input: { maxChars: number; candidates?: readonly unknown[] }) => ({
      items: [] as JarvisContextItem[],
      budget: { maxChars: input.maxChars, usedChars: 0 },
      exclusions: [],
    }),
  ),
  notifyDone: vi.fn(),
  devLog: vi.fn(),
  streamingSession: {
    onDelta: vi.fn(),
    onComplete: vi.fn(async () => undefined),
    stop: vi.fn(),
    haltPlayback: vi.fn(),
  },
  voiceCanSpeak: true,
  nativeFetch: vi.fn(),
  buildRoutedMcpTaskContext: vi.fn(),
}));

vi.mock('@/lib/nativeFetch', () => ({ nativeFetch: mocks.nativeFetch }));

vi.mock('@/lib/mcp/taskContext', () => ({
  buildRoutedMcpTaskContext: mocks.buildRoutedMcpTaskContext,
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
  jarvisProviderAttemptEvidenceRevalidator: Object.freeze({
    revalidateFailure: vi.fn(async () => null),
  }),
}));

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    chatRepo: { getById: mocks.chatGetById, update: vi.fn() },
  };
});

vi.mock('@/features/dev-console', () => ({
  devConsole: { log: mocks.devLog },
}));

vi.mock('@/lib/notifications', () => ({
  getAiCompletionInstruction: () => '',
  notifyDone: mocks.notifyDone,
}));

vi.mock('@/features/voice/streamingVoice', () => ({
  createCanonicalVoicePlaybackAdapter: () => Object.freeze({ prepare: () => null }),
  createStreamingVoiceSession: () => mocks.streamingSession,
}));

vi.mock('@/features/terminals/agentContext', () => ({
  buildAgentTerminalContext: () => '',
}));

vi.mock('@/lib/jarvis/connectivityInventory', () => ({
  getJarvisConnectivityInventoryBlock: mocks.getJarvisConnectivityInventoryBlock,
}));

vi.mock('@/features/context/retrieval', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/context/retrieval')>();
  return {
    ...actual,
    retrieveApprovedLocalKnowledge: mocks.retrieveApprovedLocalKnowledge,
  };
});

vi.mock('./context', () => ({
  buildJarvisContextPackForAi: mocks.buildJarvisContextPackForAi,
  getProjectContextBlock: mocks.getProjectContextBlock,
  getProjectContextTreeBlock: mocks.getProjectContextTreeBlock,
  getConnectedFilesBlock: mocks.getConnectedFilesBlock,
  getExplicitContextBlock: () => '',
  getExplicitFilesBlock: async () => '',
  getExplicitTerminalBlock: () => '',
  getJarvisCoordinationContextBlock: mocks.getJarvisCoordinationContextBlock,
  getJarvisTerminalOperatingContextBlock: mocks.getJarvisTerminalOperatingContextBlock,
  rememberConversationDestination: () => undefined,
  resolveJarvisContext: async () => ({
    relevantFiles: [],
    enabledCapabilities: [],
    sourceReasons: [],
  }),
  formatResolvedJarvisContext: () => '',
}));

import {
  createCanonicalProviderEvidenceAuthority,
  createJarvisCommandCenterHostPort,
  executeApprovalThenActivateTerminalHandoff,
  executeInstalledJarvisRegisteredAction,
  handleInstalledJarvisKernelClientRequest,
  installJarvisKernelRuntimeHost,
  startRuntimeListener as startKernelAwareRuntimeListener,
} from './runtime';
import { selectionFromOption } from './modelSelection';
import { DEFAULT_CUSTOM_STEPS } from './stacks/presets';

function startRuntimeListener(
  ...args: Parameters<typeof startKernelAwareRuntimeListener>
): ReturnType<typeof startKernelAwareRuntimeListener> {
  const [bindings, options] = args;
  return startKernelAwareRuntimeListener(bindings, options ?? { jarvisKernelMode: 'legacy' });
}

function agent(id: string, slug: string, systemPrompt: string, builtin = slug === 'jarvis'): Agent {
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
    builtin,
    created_at: 1,
    updated_at: 1,
  };
}

const activeStoppers: Array<() => void> = [];

describe('startRuntimeListener agent routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runAgent.mockReset();
    mocks.nativeFetch.mockReset();
    mocks.buildRoutedMcpTaskContext.mockReset();
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
      localUserId: 'runtime-test-account',
      plan: 'free',
      apiKeys: { groq: 'gsk_test' },
      defaultProvider: 'mock',
      offlineMode: false,
      automaticModelRoutingEnabled: false,
      chatModelSelection: selectionFromOption('groq', 'llama-3.3-70b-versatile'),
    });
    useUIStore.setState({ voiceModalOpen: true });
    useVoiceStore.getState().reset();
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
    mocks.getJarvisTerminalOperatingContextBlock.mockReturnValue('');
    mocks.getJarvisConnectivityInventoryBlock.mockReturnValue('');
    mocks.retrieveApprovedLocalKnowledge.mockReset();
    mocks.retrieveApprovedLocalKnowledge.mockResolvedValue([]);
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

  it('activates the terminal surface only after the durable handoff resolves', async () => {
    const order: string[] = [];
    let resolveExecution!: (value: {
      kind: 'committed';
      value: { kind: 'handoff_pending' };
    }) => void;
    const pending = executeApprovalThenActivateTerminalHandoff(
      () =>
        new Promise<{
          kind: 'committed';
          value: { kind: 'handoff_pending' };
        }>((resolve) => {
          resolveExecution = resolve;
        }),
      () => order.push('activate'),
    );

    expect(order).toEqual([]);
    resolveExecution({ kind: 'committed', value: { kind: 'handoff_pending' } });

    await expect(pending).resolves.toEqual({
      kind: 'committed',
      value: { kind: 'handoff_pending' },
    });
    expect(order).toEqual(['activate']);
  });

  it('returns only the bounded redacted presentation for an account-owned approval', async () => {
    const database = createJarvisDb(
      uniqueTestDbName('runtime-installed-approval-presentation'),
      TEST_INDEXED_DB,
    );
    await database.open();
    const run: JarvisRun = {
      id: 'jrun_runtime_approval_presentation',
      accountId: 'runtime-test-account',
      workspaceId: 'workspace-runtime-presentation',
      chatId: 'chat-runtime-presentation',
      source: 'typed_chat',
      status: 'awaiting_approval',
      agentId: 'agent-runtime-presentation',
      identityVersion: 1,
      profileRevisionId: 'profile-runtime-presentation',
      model: {
        connectionId: 'connection-runtime-presentation',
        providerId: 'provider-runtime-presentation',
        modelId: 'model-runtime-presentation',
        connectionMode: 'native-api',
        capabilities: { tools: true, vision: false },
        capturedAt: 1,
      },
      createdAt: 1,
      updatedAt: 2,
    };
    const approval: JarvisApprovalV1 = {
      id: 'jappr_runtime_presentation',
      runId: run.id,
      actionId: 'terminal.create',
      actionVersion: 1,
      params: { count: 1, token: 'jsecret_runtime_hidden' },
      secretHandleRefs: [{ field: 'token', handleId: 'jsecret_runtime_hidden' }],
      paramsHash: 'params-runtime-presentation',
      targetSnapshot: { kind: 'external_resource', service: 'terminal', resourceId: 'new' },
      risk: 'confirm',
      status: 'pending',
      createdAt: 2,
      schemaVersion: 1,
      requestId: 'request-runtime-presentation',
      attemptNumber: 1,
      capabilityId: 'terminal.execute',
      capabilitySnapshotHash: 'capability-runtime-presentation',
      expectedEffect: 'Create one terminal owned by the active account.',
      expiresAt: 10_000,
    };
    await database.jarvis_runs.add(toJarvisRunRow(run));
    await database.jarvis_approvals.add(toJarvisApprovalRow(approval));
    const disposeHost = await installJarvisKernelRuntimeHost({
      db: database,
      bindKernelActions: () =>
        ({
          create: vi.fn() as never,
          decide: vi.fn() as never,
          execute: vi.fn() as never,
          executeAutoApprovedSafe: vi.fn() as never,
        }) as never,
      capabilitySnapshots: {
        getForAccount: vi.fn(async () => ({
          capturedAt: 1,
          tools: [],
          plugins: [],
          mcps: [],
          terminals: [],
          agents: [],
          entitlements: { source: 'unavailable' as const, capabilities: [] },
        })),
      },
      randomUUID: () => 'runtime-approval-presentation',
      now: () => 10,
    });
    trackListener(disposeHost);

    try {
      await expect(
        handleInstalledJarvisKernelClientRequest({
          version: 1,
          kind: 'approval_present',
          accountId: run.accountId,
          approvalId: approval.id,
        }),
      ).resolves.toEqual({
        version: 1,
        kind: 'approval_presentation',
        approvalId: approval.id,
        actionId: 'terminal.create',
        expectedEffect: 'Create one terminal owned by the active account.',
        risk: 'confirm',
        parameters: [
          { field: 'count', safeValue: '1' },
          { field: 'token', safeValue: '[redacted]' },
        ],
      });
    } finally {
      disposeHost();
      await database.delete();
    }
  });

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

    const stop = trackListener(
      startRuntimeListener({
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
      }),
    );

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
    expect(mocks.getJarvisTerminalOperatingContextBlock).not.toHaveBeenCalled();
    expect(mocks.getJarvisConnectivityInventoryBlock).not.toHaveBeenCalled();

    stop();
  });

  it('auto-routes a protected Jarvis image turn through an active catalog connection without changing the picker', async () => {
    const jarvis = agent('agent_jarvis_auto_route', 'jarvis', 'You are Jarvis.');
    const chatId = 'chat_auto_route' as ChatId;
    const placeholderId = 'msg_auto_route_assistant' as MessageId;
    const userMessage: Message = {
      id: 'msg_auto_route_user' as MessageId,
      chat_id: chatId,
      role: 'user',
      parts: [{ kind: 'text', text: 'Describe this image.' }],
      created_at: 1,
      updated_at: 1,
    };
    const originalSelection = selectionFromOption('groq', 'llama-3.3-70b-versatile');
    useAuthStore.setState({
      automaticModelRoutingEnabled: true,
      apiKeys: { google: 'test-google-key', groq: 'gsk_test' },
      chatModelSelection: originalSelection,
    });
    writeConnectionPickerStates({
      'google-gemini-api': { available: true, auth: 'authenticated' },
    });
    const info = vi.spyOn(toast, 'info').mockImplementation(() => 'toast-auto-route');

    trackListener(
      startRuntimeListener({
        getAgentById: (id) => (id === jarvis.id ? jarvis : null),
        getAgentBySlug: (slug) => (slug === 'jarvis' ? jarvis : null),
        getAgentForChat: vi.fn(async () => jarvis),
        getMessages: vi.fn(async () => [userMessage]),
        appendMessage: vi.fn(async (message) => ({
          ...message,
          id: placeholderId,
          created_at: 2,
          updated_at: 2,
        })),
        updateMessage: vi.fn(async () => undefined),
      }),
    );

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: {
          chatId,
          text: 'Describe this image.',
          modelSelectionOverride: originalSelection,
          automaticModelRoutingEligible: true,
          imageAttachments: [
            {
              id: 'image-auto-route',
              name: 'example.png',
              mimeType: 'image/png',
              data: 'data:image/png;base64,AA==',
            },
          ],
        },
      }),
    );

    await vi.waitFor(() => expect(mocks.runAgent).toHaveBeenCalledTimes(1));
    expect(mocks.runAgent.mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        agent: expect.objectContaining({
          model: { provider: 'google', model: 'gemini-2.0-flash' },
        }),
        connectionId: 'google-gemini-api',
      }),
    );
    expect(info).toHaveBeenCalledWith(
      'Automatic model routing',
      'Auto-selected gemini-2.0-flash because this request includes images.',
    );
    expect(useAuthStore.getState().chatModelSelection).toEqual(originalSelection);
  });

  it('preserves an explicit per-send model override when automatic routing is enabled', async () => {
    const jarvis = agent('agent_jarvis_model_override', 'jarvis', 'You are Jarvis.');
    const chatId = 'chat_model_override' as ChatId;
    const originalSelection = selectionFromOption('google', 'gemini-2.0-flash');
    useAuthStore.setState({
      automaticModelRoutingEnabled: true,
      apiKeys: { google: 'test-google-key' },
      chatModelSelection: originalSelection,
    });
    writeConnectionPickerStates({
      'google-gemini-api': { available: true, auth: 'authenticated' },
    });
    const info = vi.spyOn(toast, 'info').mockImplementation(() => 'toast-model-override');
    trackListener(
      startRuntimeListener({
        getAgentById: (id) => (id === jarvis.id ? jarvis : null),
        getAgentBySlug: (slug) => (slug === 'jarvis' ? jarvis : null),
        getAgentForChat: vi.fn(async () => jarvis),
        getMessages: vi.fn(async () => []),
        appendMessage: vi.fn(async (message) => ({
          ...message,
          id: 'msg_model_override_assistant' as MessageId,
          created_at: 2,
          updated_at: 2,
        })),
        updateMessage: vi.fn(async () => undefined),
      }),
    );

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: {
          chatId,
          text: 'Use this model for this turn.',
          modelSelectionOverride: selectionFromOption('google', 'gemini-3.1-pro'),
        },
      }),
    );

    await vi.waitFor(() => expect(mocks.runAgent).toHaveBeenCalledTimes(1));
    expect(mocks.runAgent.mock.calls[0]![0].agent.model).toEqual({
      provider: 'google',
      model: 'gemini-3.1-pro',
    });
    expect(info).not.toHaveBeenCalledWith('Automatic model routing', expect.any(String));
    expect(useAuthStore.getState().chatModelSelection).toEqual(originalSelection);
  });

  it('injects bounded terminal operating intelligence only into protected Jarvis turns', async () => {
    useAuthStore.setState({ projectId: 'project-terminal-context' as never });
    mocks.getJarvisTerminalOperatingContextBlock.mockReturnValueOnce(
      '## Terminal operating intelligence\n1 terminal pane observed: 1 active.\npane=pane-live state=running',
    );
    const jarvis = agent('agent_jarvis_terminal_context', 'jarvis', 'You are Jarvis.');
    const chatId = 'chat_jarvis_terminal_context' as ChatId;
    const placeholderId = 'msg_jarvis_terminal_context_assistant' as MessageId;
    const userMessage: Message = {
      id: 'msg_jarvis_terminal_context_user' as MessageId,
      chat_id: chatId,
      role: 'user',
      parts: [{ kind: 'text', text: 'what are the terminals doing?' }],
      created_at: 1,
      updated_at: 1,
    };

    const stop = trackListener(
      startRuntimeListener({
        getAgentById: (id) => (id === jarvis.id ? jarvis : null),
        getAgentBySlug: (slug) => (slug === 'jarvis' ? jarvis : null),
        getAgentForChat: vi.fn(async () => jarvis),
        getMessages: vi.fn(async () => [userMessage]),
        appendMessage: vi.fn(async (message) => ({
          ...message,
          id: placeholderId,
          created_at: 2,
          updated_at: 2,
        })),
        updateMessage: vi.fn(async () => undefined),
      }),
    );

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId, text: 'what are the terminals doing?' },
      }),
    );

    await vi.waitFor(() => expect(mocks.runAgent).toHaveBeenCalledTimes(1));
    expect(mocks.getJarvisTerminalOperatingContextBlock).toHaveBeenCalledWith(
      expect.any(Number),
      'project-terminal-context',
    );
    expect(mocks.runAgent.mock.calls[0][0].agent.system_prompt).toContain(
      '## Terminal operating intelligence',
    );
    expect(mocks.runAgent.mock.calls[0][0].agent.system_prompt).toContain(
      'pane=pane-live state=running',
    );

    stop();
  });

  it('injects the app-observed model and skill inventory only into protected Jarvis turns', async () => {
    mocks.getJarvisConnectivityInventoryBlock.mockReturnValueOnce(
      [
        '## App-observed model and skill inventory',
        '- model=ollama/llama3.2 connection=local catalog=listed connected=yes usable=yes',
        '- skill=build catalog=listed selected=yes',
      ].join('\n'),
    );
    const jarvis = agent('agent_jarvis_inventory', 'jarvis', 'You are Jarvis.');
    const chatId = 'chat_jarvis_inventory' as ChatId;
    const placeholderId = 'msg_jarvis_inventory_assistant' as MessageId;
    const userMessage: Message = {
      id: 'msg_jarvis_inventory_user' as MessageId,
      chat_id: chatId,
      role: 'user',
      parts: [{ kind: 'text', text: 'which models and skills can you use?' }],
      created_at: 1,
      updated_at: 1,
    };

    const stop = trackListener(
      startRuntimeListener({
        getAgentById: (id) => (id === jarvis.id ? jarvis : null),
        getAgentBySlug: (slug) => (slug === 'jarvis' ? jarvis : null),
        getAgentForChat: vi.fn(async () => jarvis),
        getMessages: vi.fn(async () => [userMessage]),
        appendMessage: vi.fn(async (message) => ({
          ...message,
          id: placeholderId,
          created_at: 2,
          updated_at: 2,
        })),
        updateMessage: vi.fn(async () => undefined),
      }),
    );

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: {
          chatId,
          text: 'which models and skills can you use?',
          skillIds: ['build'],
        },
      }),
    );

    await vi.waitFor(() => expect(mocks.runAgent).toHaveBeenCalledTimes(1));
    expect(mocks.getJarvisConnectivityInventoryBlock).toHaveBeenCalledWith(
      expect.objectContaining({ localUserId: 'runtime-test-account' }),
      ['build'],
    );
    expect(mocks.runAgent.mock.calls[0][0].agent.system_prompt).toContain(
      '## App-observed model and skill inventory',
    );
    expect(mocks.runAgent.mock.calls[0][0].agent.system_prompt).toContain(
      'model=ollama/llama3.2 connection=local catalog=listed connected=yes usable=yes',
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

    const stop = trackListener(
      startRuntimeListener({
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
      }),
    );

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
    const runStates: Array<{ status?: string; errorCode?: string }> = [];
    const onStreamEnd = (event: Event) => streamEnds.push(event);
    const onRunState = (event: Event) => {
      runStates.push((event as CustomEvent<{ status?: string; errorCode?: string }>).detail);
    };
    window.addEventListener('jarvis:streaming-voice:end', onStreamEnd);
    window.addEventListener('jarvis:run-state', onRunState);

    const stop = trackListener(
      startRuntimeListener({
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
      }),
    );

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId, text: 'hello Jarvis', speakReply: true },
      }),
    );

    await vi.waitFor(() => expect(streamEnds).toHaveLength(1));
    expect(mocks.runAgent).not.toHaveBeenCalled();
    expect(runStates.at(-1)).toEqual({
      chatId: String(chatId),
      status: 'error',
      errorCode: 'kernel_runtime_agent_unavailable',
    });

    window.removeEventListener('jarvis:streaming-voice:end', onStreamEnd);
    window.removeEventListener('jarvis:run-state', onRunState);
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

    const stop = trackListener(
      startRuntimeListener({
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
      }),
    );

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

    const stop = trackListener(
      startRuntimeListener({
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
      }),
    );

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

    const stop = trackListener(
      startRuntimeListener({
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
      }),
    );

    window.dispatchEvent(
      new CustomEvent('jarvis:send', { detail: { chatId, text: 'what changed here?' } }),
    );

    await vi.waitFor(() => expect(mocks.runAgent).toHaveBeenCalledTimes(1));
    expect(mocks.getProjectContextBlock).toHaveBeenCalledWith('project_chat');
    expect(mocks.getProjectContextTreeBlock).toHaveBeenCalledWith('project_chat');
    expect(mocks.runAgent.mock.calls[0][0].agent.system_prompt).toContain(
      'project-context-for-chat',
    );
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

    const stop = trackListener(
      startRuntimeListener({
        getAgentById: (id) =>
          id === builder.id
            ? builder
            : id === reviewer.id
              ? reviewer
              : id === jarvis.id
                ? jarvis
                : null,
        getAgentBySlug: (slug) =>
          slug === 'builder'
            ? builder
            : slug === 'reviewer'
              ? reviewer
              : slug === 'jarvis'
                ? jarvis
                : null,
        getAgentForChat: vi.fn(async () => jarvis),
        getMessages: vi.fn(async () => [userMessage]),
        appendMessage: vi.fn(async (msg) => ({
          ...msg,
          id: placeholderId,
          created_at: 2,
          updated_at: 2,
        })),
        updateMessage: vi.fn(async () => undefined),
      }),
    );

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: {
          chatId,
          text: '@builder @reviewer summarize the handoff',
          mentionedAgentIds: [builder.id, reviewer.id],
        },
      }),
    );

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

    const stop = trackListener(
      startRuntimeListener({
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
      }),
    );

    window.dispatchEvent(
      new CustomEvent('jarvis:send', { detail: { chatId, text: 'what should I do next?' } }),
    );

    await vi.waitFor(() => expect(mocks.runAgent).toHaveBeenCalledTimes(1));
    const prompt = mocks.runAgent.mock.calls[0][0].agent.system_prompt;
    expect(prompt).toContain('Answer in 1-3 short sentences');
    expect(prompt).toContain(
      'Name the relevant file, agent, terminal, context map, or page when it matters',
    );
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

    const stop = trackListener(
      startRuntimeListener({
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
      }),
    );

    window.dispatchEvent(
      new CustomEvent('jarvis:send', { detail: { chatId, text: 'write this like me' } }),
    );

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

    const stop = trackListener(
      startRuntimeListener({
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
      }),
    );

    window.dispatchEvent(
      new CustomEvent('jarvis:send', { detail: { chatId, text: 'hey what is my name' } }),
    );

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
      parts: [
        {
          kind: 'text',
          text:
            index === 9 ? 'Please keep it short and launch-ready.' : `prior user message ${index}`,
        },
      ],
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

    const stop = trackListener(
      startRuntimeListener({
        getAgentById: (id) => (id === jarvis.id ? jarvis : null),
        getAgentBySlug: (slug) => (slug === 'jarvis' ? jarvis : null),
        getAgentForChat: vi.fn(async () => jarvis),
        getMessages: vi.fn(async () => history),
        appendMessage: vi.fn(async (msg) => ({
          ...msg,
          id: placeholderId,
          created_at: 20,
          updated_at: 20,
        })),
        updateMessage: vi.fn(async () => undefined),
      }),
    );

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: {
          chatId,
          text: 'Please keep it short and launch-ready.',
          forceAllAboutMeUpdate: true,
        },
      }),
    );

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

    const stop = trackListener(
      startRuntimeListener({
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
      }),
    );

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
    const stop = trackListener(
      startRuntimeListener({
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
      }),
    );

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
    const stop = trackListener(
      startRuntimeListener({
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
      }),
    );

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
    const stop = trackListener(
      startRuntimeListener({
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
      }),
    );

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

    const stop = trackListener(
      startRuntimeListener({
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
      }),
    );

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

    const stop = trackListener(
      startRuntimeListener({
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
      }),
    );

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
    expect(finalWrite.parts[0]).toEqual({
      kind: 'text',
      text:
        'Certainly, sir. The action is prepared and awaiting your authorisation. ' +
        'Action: Open Settings because the user asked to see it.',
    });
    expect(finalWrite.parts[0]).not.toMatchObject({
      text: expect.stringContaining('Approve the action card below'),
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

    const stop = trackListener(
      startRuntimeListener({
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
      }),
    );

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

    const stop = trackListener(
      startRuntimeListener({
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
      }),
    );

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

    const stop = trackListener(
      startRuntimeListener({
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
      }),
    );

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

  it('fails legacy /Hive quality closed instead of reopening a provider-side stack path', async () => {
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

    const stop = trackListener(
      startRuntimeListener({
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
      }),
    );

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId, text: '/Hive quality explain the release' },
      }),
    );

    await vi.waitFor(() =>
      expect(mocks.devLog).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
          message: expect.stringContaining('Hive requires the canonical JARVIS kernel runtime'),
        }),
      ),
    );
    expect(mocks.runAgent).not.toHaveBeenCalled();

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
    trackListener(
      startRuntimeListener({
        getAgentById: () => jarvis,
        getAgentBySlug: () => jarvis,
        getAgentForChat: vi.fn(async () => jarvis),
        getMessages: vi.fn(async () => [userMessage]),
        appendMessage: vi.fn(async (message) => ({
          ...message,
          id: 'msg_explicit_questions_assistant' as MessageId,
          created_at: 2,
          updated_at: 2,
        })),
        updateMessage,
      }),
    );
    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId, text: 'Build a game, but ask me three questions first.' },
      }),
    );

    await vi.waitFor(() => expect(updateMessage).toHaveBeenCalled());
    const final = (updateMessage.mock.calls as unknown as Array<[MessageId, { parts: Part[] }]>).at(
      -1,
    )?.[1].parts;
    const questionPart = final?.find((part) => part.kind === 'question_block');
    expect(questionPart?.kind).toBe('question_block');
    if (questionPart?.kind !== 'question_block') return;
    expect(questionPart.block.questions).toHaveLength(3);
    expect(questionPart.block.questions.every((question) => question.options?.length === 3)).toBe(
      true,
    );
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
    trackListener(
      startRuntimeListener({
        getAgentById: () => jarvis,
        getAgentBySlug: () => jarvis,
        getAgentForChat: vi.fn(async () => jarvis),
        getMessages: vi.fn(async () => [userMessage]),
        appendMessage: vi.fn(async (message) => ({
          ...message,
          id: 'msg_plan_information_assistant' as MessageId,
          created_at: 2,
          updated_at: 2,
        })),
        updateMessage,
      }),
    );
    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId, text: 'How do I make coffee step by step?', interactionMode: 'plan' },
      }),
    );

    await vi.waitFor(() => expect(updateMessage).toHaveBeenCalled());
    const final = (updateMessage.mock.calls as unknown as Array<[MessageId, { parts: Part[] }]>).at(
      -1,
    )?.[1].parts;
    expect(final).toEqual([
      { kind: 'text', text: '1. Heat water.\n2. Brew the coffee.\n3. Serve.' },
    ]);
  });

  function shadowHarness() {
    let now = 100;
    const deps: JarvisShadowCompilationDeps = {
      createPersistedRun: vi.fn(async (input) => ({
        ...input,
        id: input.id!,
        status: 'queued' as const,
        createdAt: now,
        updatedAt: now,
      })),
      buildEnvelope: vi.fn(
        async (input) =>
          ({
            schemaVersion: 1,
            requestId: input.attempt.requestId,
            runId: input.attempt.runId,
            accountId: input.accountId,
            agent: input.agent,
          }) as never,
      ),
      compilePrompt: vi.fn(() => ({
        schemaVersion: 1 as const,
        layers: [],
        systemText: 'SHADOW PROMPT MUST NOT DISPATCH',
        promptHash: 'd'.repeat(64),
        identityVersion: 1,
        profileRevisionId: 'shadow-runtime-profile',
        diagnostics: { totalChars: 0, omittedSourceRefs: [], warnings: [] },
      })),
      transitionRun: vi.fn(async (input) => ({
        id: input.runId,
        accountId: input.accountId,
        source: 'typed_chat' as const,
        status: input.nextStatus,
        agentId: 'agent_jarvis',
        identityVersion: 1,
        profileRevisionId: 'shadow-runtime-profile',
        model: {
          providerId: 'mock',
          modelId: 'mock-default',
          connectionMode: 'local' as const,
          capabilities: {},
          capturedAt: now,
        },
        createdAt: now,
        updatedAt: now,
      })),
      recordDiagnostic: vi.fn(),
      now: vi.fn(() => now++),
    };
    return deps;
  }

  function runtimeInterlocks() {
    return {
      assertCanonicalAccountIdentity: vi.fn(),
      assertSourcesAdmitted: vi.fn(),
      assertEntitlementAllowsRequestedCapability: vi.fn(),
      assertBrowserOperatorAvailableOrQuarantined: vi.fn(),
      assertPrivateSyncBoundary: vi.fn(),
      assertSelectedPromptTransportSupported: vi.fn(),
    };
  }

  function kernelRuntimeBindings(selectedAgent: Agent) {
    const chatId = 'chat_kernel_gate' as ChatId;
    const updateMessage = vi.fn(async () => undefined);
    return {
      chatId,
      updateMessage,
      bindings: {
        getAgentById: () => selectedAgent,
        getAgentBySlug: () => selectedAgent,
        getAgentForChat: vi.fn(async () => selectedAgent),
        getMessages: vi.fn(async () => [
          {
            id: 'msg_kernel_user' as MessageId,
            chat_id: chatId,
            role: 'user' as const,
            parts: [{ kind: 'text' as const, text: 'Run the kernel gate.' }],
            created_at: 1,
            updated_at: 1,
          },
        ]),
        appendMessage: vi.fn(async (message) => ({
          ...message,
          id: 'msg_kernel_assistant' as MessageId,
          created_at: 2,
          updated_at: 2,
        })),
        updateMessage,
      },
    };
  }

  it('binds Command Center effects to the exact current account session', async () => {
    const order: string[] = [];
    const read = {
      accountId: 'account-command-center',
      snapshot: vi.fn(async () => undefined),
      subscribe: vi.fn(() => () => undefined),
    };
    const accountSession = {
      accountId: 'account-command-center',
      read,
      assertCurrent: vi.fn(() => order.push('assert')),
      dispose: vi.fn(),
    };
    const requestCancellation = vi.fn(() => {
      order.push('cancel');
      return Promise.resolve({ kind: 'authority_revoked_before_intent' as const });
    });
    const retryScheduledTransport = vi.fn(() => {
      order.push('transport');
      return Promise.resolve({ kind: 'account_authority_revoked' as const });
    });
    const retryLogicalRun = vi.fn(() => {
      order.push('logical');
      return Promise.resolve({ kind: 'account_authority_revoked' as const });
    });

    const port = createJarvisCommandCenterHostPort({
      accountSession,
      kernel: { requestCancellation },
      scheduledTransportRetry: { retry: retryScheduledTransport },
      scheduledLogicalRetry: { retry: retryLogicalRun },
    });

    expect(port.accountId).toBe('account-command-center');
    expect(port.liveEvidence).toBe(read);
    await port.requestCancellation('run-command-center');
    await port.retryScheduledTransport('run-command-center');
    await port.retryLogicalRun('run-command-center');
    expect(requestCancellation).toHaveBeenCalledWith({
      accountId: 'account-command-center',
      runId: 'run-command-center',
    });
    expect(retryScheduledTransport).toHaveBeenCalledWith({
      accountId: 'account-command-center',
      runId: 'run-command-center',
    });
    expect(retryLogicalRun).toHaveBeenCalledWith({
      accountId: 'account-command-center',
      previousRunId: 'run-command-center',
    });
    expect(order).toEqual([
      'assert',
      'assert',
      'cancel',
      'assert',
      'transport',
      'assert',
      'logical',
    ]);
  });

  it('rejects mismatched and stale Command Center account sessions before effects', () => {
    const requestCancellation = vi.fn(async () => ({
      kind: 'authority_revoked_before_intent' as const,
    }));
    const retry = vi.fn(async () => ({ kind: 'account_authority_revoked' as const }));
    const mismatchedSession = {
      accountId: 'account-command-center',
      read: {
        accountId: 'account-other',
        snapshot: vi.fn(async () => undefined),
        subscribe: vi.fn(() => () => undefined),
      },
      assertCurrent: vi.fn(),
      dispose: vi.fn(),
    };
    expect(() =>
      createJarvisCommandCenterHostPort({
        accountSession: mismatchedSession,
        kernel: { requestCancellation },
        scheduledTransportRetry: { retry },
        scheduledLogicalRetry: { retry },
      }),
    ).toThrow('jarvis_command_center_account_mismatch');
    expect(mismatchedSession.assertCurrent).not.toHaveBeenCalled();

    let stale = false;
    const staleSession = {
      ...mismatchedSession,
      read: { ...mismatchedSession.read, accountId: 'account-command-center' },
      assertCurrent: vi.fn(() => {
        if (stale) throw new Error('account_epoch_revoked');
      }),
    };
    const port = createJarvisCommandCenterHostPort({
      accountSession: staleSession,
      kernel: { requestCancellation },
      scheduledTransportRetry: { retry },
      scheduledLogicalRetry: { retry },
    });
    stale = true;
    expect(() => port.requestCancellation('run-command-center')).toThrow('account_epoch_revoked');
    expect(() => port.retryScheduledTransport('run-command-center')).toThrow(
      'account_epoch_revoked',
    );
    expect(() => port.retryLogicalRun('run-command-center')).toThrow('account_epoch_revoked');
    expect(requestCancellation).not.toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled();
  });

  it('runs explicit shadow mode as one observational compile plus one unchanged legacy dispatch', async () => {
    const protectedJarvis = agent('agent_jarvis', 'jarvis', 'LEGACY SYSTEM PROMPT', true);
    const shadow = shadowHarness();
    const interlocks = runtimeInterlocks();
    const harness = kernelRuntimeBindings(protectedJarvis);
    trackListener(
      startRuntimeListener(harness.bindings, {
        jarvisKernelMode: 'shadow',
        jarvisShadow: shadow,
        jarvisInterlocks: interlocks,
      }),
    );

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId: harness.chatId, text: 'Run the kernel gate.' },
      }),
    );

    await vi.waitFor(() => expect(mocks.runAgent).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(shadow.transitionRun).toHaveBeenCalledWith(
        expect.objectContaining({ nextStatus: 'completed' }),
      ),
    );
    expect(shadow.createPersistedRun).toHaveBeenCalledOnce();
    expect(shadow.createPersistedRun).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'runtime-test-account' }),
    );
    expect(JSON.stringify(vi.mocked(shadow.createPersistedRun).mock.calls)).not.toContain(
      'local-unassigned',
    );
    expect(shadow.buildEnvelope).toHaveBeenCalledOnce();
    expect(shadow.compilePrompt).toHaveBeenCalledOnce();
    expect(mocks.runAgent.mock.calls[0]![0].agent.system_prompt).toContain('LEGACY SYSTEM PROMPT');
    expect(mocks.runAgent.mock.calls[0]![0].agent.system_prompt).not.toContain(
      'SHADOW PROMPT MUST NOT DISPATCH',
    );
    for (const assertion of Object.values(interlocks)) expect(assertion).toHaveBeenCalledOnce();
  });

  it('runs explicit legacy mode once without building a shadow envelope', async () => {
    const protectedJarvis = agent('agent_jarvis', 'jarvis', 'LEGACY SYSTEM PROMPT', true);
    const shadow = shadowHarness();
    const interlocks = runtimeInterlocks();
    const harness = kernelRuntimeBindings(protectedJarvis);
    trackListener(
      startRuntimeListener(harness.bindings, {
        jarvisKernelMode: 'legacy',
        jarvisShadow: shadow,
        jarvisInterlocks: interlocks,
      }),
    );

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId: harness.chatId, text: 'Run the kernel gate.' },
      }),
    );

    await vi.waitFor(() => expect(mocks.runAgent).toHaveBeenCalledTimes(1));
    expect(shadow.createPersistedRun).not.toHaveBeenCalled();
    for (const assertion of Object.values(interlocks)) expect(assertion).toHaveBeenCalledOnce();
  });

  it('fails kernel mode before provider dispatch until the canonical dispatcher exists', async () => {
    const protectedJarvis = agent('agent_jarvis', 'jarvis', 'LEGACY SYSTEM PROMPT', true);
    const harness = kernelRuntimeBindings(protectedJarvis);
    trackListener(
      startRuntimeListener(harness.bindings, {
        jarvisKernelMode: 'kernel',
        jarvisInterlocks: runtimeInterlocks(),
      }),
    );

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId: harness.chatId, text: 'Run the kernel gate.' },
      }),
    );

    await vi.waitFor(() =>
      expect(mocks.devLog).toHaveBeenCalledWith(expect.objectContaining({ level: 'error' })),
    );
    expect(mocks.runAgent).not.toHaveBeenCalled();
    expect(harness.bindings.appendMessage).not.toHaveBeenCalled();
  });

  it('persists a length-limited provider response as partial through the installed host', async () => {
    mocks.buildRoutedMcpTaskContext.mockReturnValueOnce(
      Object.freeze({
        key: 'mcp_tool_schemas',
        text: '{"schemaVersion":1,"tools":[{"serverId":"github","toolName":"repo.read"}]}',
      }),
    );
    useAuthStore.setState({
      apiKeys: { groq: 'gsk_test', openai: 'sk_test' },
      chatModelSelection: {
        mode: 'single',
        providerId: 'openai',
        modelId: 'gpt-5.5',
        connectionId: 'openai-api',
        connectionMode: 'native-api',
        authSource: 'api-key',
        capabilities: {
          text: true,
          images: false,
          files: false,
          tools: false,
          modelSelection: true,
          structuredOutput: false,
          streaming: true,
          cancellation: true,
          resumeSession: false,
          systemPrompt: true,
          workingDirectory: false,
          usage: true,
          subscriptionQuota: false,
          localOnly: false,
        },
      },
    });
    const protectedJarvis = agent('agent_jarvis', 'jarvis', 'LEGACY SYSTEM PROMPT', true);
    mocks.getProjectContextBlock.mockResolvedValue(
      '## Project context\nPROJECT_CONTEXT_PROVENANCE_SENTINEL',
    );
    useAllAboutMeStore.setState({
      markdown: '# AllAboutMe.md\n\nAAM_PROVENANCE_SENTINEL',
    });
    mocks.retrieveApprovedLocalKnowledge.mockResolvedValueOnce([
      {
        sourceId: 'jlocal_1111111111111111',
        mapId: 'context-map-local',
        title: 'Clients',
        relativePath: 'notes/Clients.md',
        heading: 'Renewal plan',
        lineStart: 9,
        lineEnd: 14,
        excerpt: 'Acme renewal is in October.',
        tags: ['acme', 'client'],
        wikiLinks: ['Finance'],
        markdownLinks: [],
        backlinks: [],
        modifiedAt: 90,
        score: 42,
        contentHash: 'a'.repeat(64),
      },
    ]);
    mocks.buildJarvisContextPackForAi.mockImplementationOnce(async (input) => {
      const candidates = (input.candidates ?? []) as readonly {
        source: JarvisContextItem['source'];
        purpose: JarvisContextItem['purpose'];
        excerpt: string;
      }[];
      const items: JarvisContextItem[] = candidates.map((candidate) => ({
        source: candidate.source,
        purpose: candidate.purpose,
        excerpt: candidate.excerpt,
        truncated: false,
      }));
      return {
        items,
        budget: {
          maxChars: input.maxChars,
          usedChars: items.reduce((total, item) => total + item.excerpt.length, 0),
        },
        exclusions: [],
      };
    });
    const harness = kernelRuntimeBindings(protectedJarvis);
    mocks.chatGetById.mockResolvedValueOnce({
      id: harness.chatId,
      workspace_id: 'workspace_runtime_kernel_host' as never,
      project_id: 'project-local-knowledge' as never,
      title: 'Installed kernel host',
      mode: 'chat',
      active_agent_ids: [protectedJarvis.id],
      created_at: 1,
      updated_at: 1,
    });
    const database = createJarvisDb(
      uniqueTestDbName('runtime-installed-kernel-host'),
      TEST_INDEXED_DB,
    );
    await database.open();
    await database.chats.add({
      id: harness.chatId,
      workspace_id: 'workspace_runtime_kernel_host' as never,
      title: 'Installed kernel host',
      mode: 'chat',
      active_agent_ids: [protectedJarvis.id],
      created_at: 1,
      updated_at: 1,
    });
    mocks.runAgent.mockImplementation(async (providerInput) => ({
      text: 'The installed kernel host returned a partial response, Sir.',
      usage: { input_tokens: 1, output_tokens: 1, cost_usd: 0 },
      provider: providerInput.agent.model.provider,
      model: providerInput.agent.model.model,
      finish_reason: 'length',
    }));
    const getCapabilities = vi.fn(async () => ({
      capturedAt: 1,
      tools: [],
      plugins: [],
      mcps: [],
      terminals: [],
      agents: [],
      entitlements: { source: 'unavailable' as const, capabilities: [] },
    }));
    const disposeHost = await installJarvisKernelRuntimeHost({
      db: database,
      bindKernelActions: () =>
        ({
          create: vi.fn() as never,
          decide: vi.fn() as never,
          execute: vi.fn() as never,
          executeAutoApprovedSafe: vi.fn() as never,
        }) as never,
      capabilitySnapshots: {
        getForAccount: getCapabilities,
      },
      randomUUID: () => 'runtime-installed-kernel-host',
      now: () => 10,
    });
    trackListener(disposeHost);
    trackListener(
      startRuntimeListener(harness.bindings, {
        jarvisInterlocks: runtimeInterlocks(),
      }),
    );

    try {
      window.dispatchEvent(
        new CustomEvent('jarvis:send', {
          detail: { chatId: harness.chatId, text: 'Run the installed kernel host.' },
        }),
      );

      await vi.waitFor(() => expect(mocks.runAgent).toHaveBeenCalledOnce(), { timeout: 3_000 });
      await vi.waitFor(async () => {
        expect(await database.messages.where('chat_id').equals(harness.chatId).count()).toBe(1);
      });
      const providerInput = mocks.runAgent.mock.calls[0]![0];
      expect(providerInput.signal).toBeInstanceOf(AbortSignal);
      expect(providerInput.compiledPrompt.systemText).toContain('strict JARVIS identity');
      expect(providerInput.compiledPrompt.systemText).not.toContain('LEGACY SYSTEM PROMPT');
      expect(providerInput.agent.system_prompt).toContain('LEGACY SYSTEM PROMPT');
      const contextInput = mocks.buildJarvisContextPackForAi.mock.calls.at(-1)?.[0] as
        | {
            candidates?: Array<{
              source: { label: string; origin?: string };
              excerpt?: string;
            }>;
          }
        | undefined;
      expect(contextInput?.candidates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: expect.objectContaining({
              label: 'Project context',
              origin: 'user_authored',
            }),
            excerpt: expect.stringContaining('PROJECT_CONTEXT_PROVENANCE_SENTINEL'),
          }),
          expect.objectContaining({
            source: expect.objectContaining({
              label: 'AllAboutMe profile',
              origin: 'mixed',
            }),
            excerpt: expect.stringContaining('AAM_PROVENANCE_SENTINEL'),
          }),
          expect.objectContaining({
            source: expect.objectContaining({
              kind: 'mcp',
              label: 'Task-relevant external MCP tool schemas',
              trust: 'external_untrusted',
              origin: 'external_retrieved',
            }),
            purpose: 'capability',
            excerpt: expect.stringContaining('"toolName":"repo.read"'),
          }),
          expect.objectContaining({
            source: {
              id: 'jlocal_1111111111111111',
              kind: 'project_file',
              label: 'Clients — Renewal plan',
              uri: 'notes/Clients.md#Renewal%20plan',
              accountId: 'runtime-test-account',
              projectId: 'project-local-knowledge',
              trust: 'app_verified',
              origin: 'user_authored',
              sensitivity: 'private',
              observedAt: 90,
              contentHash: 'a'.repeat(64),
            },
            purpose: 'citation',
            excerpt: expect.stringContaining('Acme renewal is in October.'),
            score: 42,
          }),
        ]),
      );
      expect(mocks.retrieveApprovedLocalKnowledge).toHaveBeenCalledWith({
        projectId: 'project-local-knowledge',
        query: 'Run the installed kernel host.',
      });
      expect(mocks.buildRoutedMcpTaskContext).toHaveBeenCalledWith(
        'Run the installed kernel host.',
      );
      expect(harness.bindings.appendMessage).not.toHaveBeenCalled();
      const canonicalRun = await database.jarvis_runs
        .where('chat_id')
        .equals(harness.chatId)
        .first();
      expect(canonicalRun).toMatchObject({ status: 'partial' });
      const contextEvent = (
        await createJarvisRepositories(database).event.listByRun(
          'runtime-test-account',
          canonicalRun!.id,
        )
      ).find((event) => event.type === 'context');
      expect(contextEvent).toMatchObject({
        status: 'completed',
        title: 'Protected context selected',
        safeSummary: expect.stringMatching(/approved context sources? selected/i),
      });
      expect(contextEvent?.sourceRefs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: 'Project context',
            accountId: 'runtime-test-account',
            origin: 'user_authored',
          }),
          expect.objectContaining({
            label: 'AllAboutMe profile',
            accountId: 'runtime-test-account',
            origin: 'mixed',
          }),
          {
            id: 'jlocal_1111111111111111',
            kind: 'project_file',
            label: 'Clients — Renewal plan',
            uri: 'notes/Clients.md#Renewal%20plan',
            accountId: 'runtime-test-account',
            projectId: 'project-local-knowledge',
            trust: 'app_verified',
            origin: 'user_authored',
            sensitivity: 'private',
            observedAt: 90,
            contentHash: 'a'.repeat(64),
          },
        ]),
      );
      expect(
        contextEvent?.sourceRefs
          .filter((source) => source.id !== 'jlocal_1111111111111111')
          .every((source) => source.observedAt === contextEvent.createdAt),
      ).toBe(true);
      expect(JSON.stringify(contextEvent)).not.toContain('PROJECT_CONTEXT_PROVENANCE_SENTINEL');
      expect(JSON.stringify(contextEvent)).not.toContain('AAM_PROVENANCE_SENTINEL');
      expect(JSON.stringify(contextEvent)).not.toContain('Acme renewal is in October.');
      await expect(
        createJarvisRepositories(database).artifact.listByRun(
          'runtime-test-account',
          canonicalRun!.id,
        ),
      ).resolves.toEqual([]);
      await vi.waitFor(() => expect(mocks.notifyDone).toHaveBeenCalledOnce());
    } finally {
      disposeHost();
      database.close();
      await database.delete();
    }
  });

  it('executes a response safe action through the installed security binder without losing scope', async () => {
    useAuthStore.setState({
      apiKeys: { openai: 'sk_test' },
      chatModelSelection: {
        mode: 'single',
        providerId: 'openai',
        modelId: 'gpt-5.5',
        connectionId: 'openai-api',
        connectionMode: 'native-api',
        authSource: 'api-key',
        capabilities: {
          text: true,
          images: false,
          files: false,
          tools: false,
          modelSelection: true,
          structuredOutput: false,
          streaming: true,
          cancellation: true,
          resumeSession: false,
          systemPrompt: true,
          workingDirectory: false,
          usage: true,
          subscriptionQuota: false,
          localOnly: false,
        },
      },
    });
    const protectedJarvis = agent('agent_jarvis', 'jarvis', 'LEGACY SYSTEM PROMPT', true);
    const harness = kernelRuntimeBindings(protectedJarvis);
    const database = createJarvisDb(
      uniqueTestDbName('runtime-installed-safe-action-host'),
      TEST_INDEXED_DB,
    );
    await database.open();
    await database.chats.add({
      id: harness.chatId,
      workspace_id: 'workspace_runtime_safe_action' as never,
      title: 'Installed safe action host',
      mode: 'chat',
      active_agent_ids: [protectedJarvis.id],
      created_at: 1,
      updated_at: 1,
    });
    const { setStoredProjectRoot } = await import('@/features/files/projectFiles');
    setStoredProjectRoot(
      useAuthStore.getState().projectId ?? null,
      'C:\\vibespace-runtime-safe-action',
    );
    mocks.runAgent.mockResolvedValueOnce({
      text: [
        '```action',
        JSON.stringify({
          id: 'file.search',
          params: { query: 'smoke fixture', maxResults: 1 },
          rationale: 'Execute the fixed development smoke fixture.',
        }),
        '```',
      ].join('\n'),
      usage: { input_tokens: 1, output_tokens: 1, cost_usd: 0 },
      provider: 'openai',
      model: 'gpt-5.5',
    });
    let clock = 100;
    let uuid = 0;
    const now = () => ++clock;
    const randomUUID = () => `runtime-safe-action-${++uuid}`;
    const catalog = createJarvisActionCatalog(DEFAULT_JARVIS_ACTION_REGISTRATIONS);
    const capabilitySnapshots = {
      getForAccount: vi.fn(async () => ({
        capturedAt: now(),
        tools: [
          {
            id: 'files.read',
            state: 'available' as const,
            operations: ['execute'],
            evidenceRef: 'registered:file.search:1:test',
            lastVerifiedAt: now(),
          },
        ],
        plugins: [],
        mcps: [],
        terminals: [],
        agents: [],
        entitlements: {
          source: 'local_development' as const,
          capabilities: [],
          verifiedAt: clock,
          expiresAt: clock + 60_000,
        },
      })),
    };
    const securityRuntime = createJarvisSecurityRuntime({
      repositories: createJarvisRepositories(database),
      catalog,
      capabilitySnapshots,
      entitlementSnapshots: {
        getForAccount: vi.fn(async () => ({
          source: 'local_development' as const,
          capabilities: [],
          verifiedAt: clock,
          expiresAt: clock + 60_000,
        })),
      },
      credentialGrants: {} as never,
      credentialAuthorization: {} as never,
      pluginConnections: {
        upsertConnection: vi.fn(),
        removeConnection: vi.fn(),
      },
      activeAccountId: () => 'runtime-test-account',
      executeRegisteredAction: (dispatchInput) =>
        executeInstalledJarvisRegisteredAction(dispatchInput),
      bootId: 'runtime-safe-action-boot',
      randomUUID,
      now,
    });
    const disposeHost = await installJarvisKernelRuntimeHost({
      db: database,
      bindKernelActions: securityRuntime.bindKernelActions,
      actionCatalog: catalog,
      capabilitySnapshots,
      randomUUID,
      now,
    });
    trackListener(disposeHost);
    trackListener(
      startRuntimeListener(harness.bindings, {
        jarvisInterlocks: runtimeInterlocks(),
      }),
    );

    try {
      window.dispatchEvent(
        new CustomEvent('jarvis:send', {
          detail: { chatId: harness.chatId, text: 'Search for the fixed smoke fixture.' },
        }),
      );

      await vi.waitFor(
        async () => {
          const run = await database.jarvis_runs.where('chat_id').equals(harness.chatId).first();
          const runtimeError = mocks.devLog.mock.calls
            .map(([entry]) => entry)
            .find((entry) => entry?.channel === 'ai' && entry?.level === 'error');
          if (runtimeError) throw new Error(JSON.stringify({ runtimeError, run }));
          expect(run?.status).toBe('completed');
        },
        { timeout: 5_000 },
      );
      const message = await database.messages.where('chat_id').equals(harness.chatId).first();
      expect(message?.parts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'action_proposal',
            action_id: 'file.search',
            status: 'success',
            call_id: expect.stringMatching(/^jarvisapproval:/),
          }),
        ]),
      );
      expect(await database.jarvis_approvals.count()).toBe(1);
      await vi.waitFor(() => expect(mocks.notifyDone).toHaveBeenCalledOnce());
    } finally {
      disposeHost();
      securityRuntime.invalidateAll();
      database.close();
      await database.delete();
    }
  }, 15_000);

  it('persists a real canonical GitHub link from the exact approval-bound plugin result', async () => {
    useAuthStore.setState({
      apiKeys: { openai: 'sk_test' },
      chatModelSelection: {
        mode: 'single',
        providerId: 'openai',
        modelId: 'gpt-5.5',
        connectionId: 'openai-api',
        connectionMode: 'native-api',
        authSource: 'api-key',
        capabilities: {
          text: true,
          images: false,
          files: false,
          tools: false,
          modelSelection: true,
          structuredOutput: false,
          streaming: true,
          cancellation: true,
          resumeSession: false,
          systemPrompt: true,
          workingDirectory: false,
          usage: true,
          subscriptionQuota: false,
          localOnly: false,
        },
      },
    });
    const protectedJarvis = agent('agent_jarvis', 'jarvis', 'LEGACY SYSTEM PROMPT', true);
    const harness = kernelRuntimeBindings(protectedJarvis);
    const database = createJarvisDb(
      uniqueTestDbName('runtime-installed-github-output'),
      TEST_INDEXED_DB,
    );
    await database.open();
    await database.chats.add({
      id: harness.chatId,
      workspace_id: 'workspace_runtime_github_output' as never,
      title: 'Installed GitHub output',
      mode: 'chat',
      active_agent_ids: [protectedJarvis.id],
      created_at: 1,
      updated_at: 1,
    });
    mocks.runAgent.mockResolvedValueOnce({
      text: [
        '```action',
        JSON.stringify({
          id: 'github.repository.read',
          params: { owner: 'octocat', repository: 'hello-world' },
          rationale: 'Read the fixed repository metadata.',
        }),
        '```',
      ].join('\n'),
      usage: { input_tokens: 1, output_tokens: 1, cost_usd: 0 },
      provider: 'openai',
      model: 'gpt-5.5',
    });
    mocks.nativeFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          full_name: 'octocat/hello-world',
          visibility: 'public',
          archived: false,
          default_branch: 'main',
          stargazers_count: 80,
          forks_count: 9,
          open_issues_count: 3,
          updated_at: '2026-07-23T10:00:00Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    let rawGrants: string | null = null;
    const credentialGrants = createPluginCredentialAccountGrantRepository({
      storage: {
        readRaw: () => rawGrants,
        compareAndSetRaw: ({ expectedRaw, nextRaw }) => {
          if (rawGrants !== expectedRaw) throw new Error('grant CAS conflict');
          rawGrants = nextRaw;
        },
      },
    });
    const credentialAuthorization = createJarvisExistingCredentialAuthorization({
      grants: credentialGrants,
      getActiveAccountId: () => 'runtime-test-account',
    });
    let clock = 500;
    let uuid = 0;
    const now = () => ++clock;
    const randomUUID = () => `runtime-github-output-${++uuid}`;
    const catalog = createJarvisActionCatalog(DEFAULT_JARVIS_ACTION_REGISTRATIONS);
    const capabilitySnapshot: Readonly<JarvisCapabilitySnapshot> = Object.freeze({
      capturedAt: 500,
      tools: [],
      plugins: [
        {
          id: 'plugin.github.repository_context',
          state: 'available' as const,
          operations: ['execute'],
          evidenceRef: 'plugin:github:repository:runtime-test',
          lastVerifiedAt: 500,
        },
      ],
      mcps: [],
      terminals: [],
      agents: [],
      entitlements: {
        source: 'local_development' as const,
        capabilities: [],
        verifiedAt: 500,
        expiresAt: 60_500,
      },
    });
    const capabilitySnapshots = {
      getForAccount: vi.fn(async () => capabilitySnapshot),
    };
    let kernelPluginArtifacts: CanonicalPluginArtifactCapability | undefined;
    const securityRuntime = createJarvisSecurityRuntime({
      repositories: createJarvisRepositories(database),
      catalog,
      capabilitySnapshots,
      entitlementSnapshots: {
        getForAccount: vi.fn(async () => ({
          source: 'local_development' as const,
          capabilities: [],
          verifiedAt: clock,
          expiresAt: clock + 60_000,
        })),
      },
      credentialGrants,
      credentialAuthorization,
      pluginConnections: {
        upsertConnection: vi.fn(),
        removeConnection: vi.fn(),
      },
      bindKernelPluginArtifacts(capability) {
        kernelPluginArtifacts = capability;
      },
      activeAccountId: () => 'runtime-test-account',
      executeRegisteredAction: (dispatchInput) =>
        executeInstalledJarvisRegisteredAction(dispatchInput),
      bootId: 'runtime-github-output-boot',
      randomUUID,
      now,
    });
    if (!kernelPluginArtifacts) throw new Error('plugin artifact capability was not bound');
    await securityRuntime.pluginManagement.saveCredential({
      accountId: 'runtime-test-account',
      pluginId: 'github',
      fieldId: 'token',
      value: 'synthetic-github-test-token',
    });
    const disposeHost = await installJarvisKernelRuntimeHost({
      db: database,
      bindKernelActions: securityRuntime.bindKernelActions,
      pluginArtifacts: kernelPluginArtifacts,
      actionCatalog: catalog,
      capabilitySnapshots,
      randomUUID,
      now,
    });
    trackListener(disposeHost);
    trackListener(
      startRuntimeListener(harness.bindings, {
        jarvisInterlocks: runtimeInterlocks(),
      }),
    );

    try {
      window.dispatchEvent(
        new CustomEvent('jarvis:send', {
          detail: { chatId: harness.chatId, text: 'Read octocat/hello-world.' },
        }),
      );

      let runId = '';
      await vi.waitFor(
        async () => {
          const run = await database.jarvis_runs.where('chat_id').equals(harness.chatId).first();
          const runtimeError = mocks.devLog.mock.calls
            .map(([entry]) => entry)
            .find((entry) => entry?.channel === 'ai' && entry?.level === 'error');
          if (runtimeError) throw new Error(JSON.stringify({ runtimeError, run }));
          expect(run?.status).toBe('completed');
          runId = run?.id ?? '';
        },
        { timeout: 5_000 },
      );
      const artifacts = await createJarvisRepositories(database).artifact.listByRun(
        'runtime-test-account',
        runId,
      );
      expect(artifacts).toMatchObject([
        {
          kind: 'link',
          state: 'ready',
          title: 'GitHub repository octocat/hello-world',
          uri: 'https://github.com/octocat/hello-world',
        },
      ]);
      expect(mocks.nativeFetch).toHaveBeenCalledOnce();
      expect(String(mocks.nativeFetch.mock.calls[0]?.[0])).toBe(
        'https://api.github.com/repos/octocat/hello-world',
      );
    } finally {
      disposeHost();
      securityRuntime.invalidateAll();
      database.close();
      await database.delete();
    }
  }, 15_000);

  it('runs Hive only through persisted kernel workers and one protected hive-final turn', async () => {
    useAuthStore.setState({
      apiKeys: {
        google: 'google-test',
        openrouter: 'openrouter-test',
        deepseek: 'deepseek-test',
        openai: 'openai-test',
      },
      chatModelSelection: { mode: 'hive', hiveId: 'balanced' },
    });
    const protectedJarvis = agent('agent_jarvis', 'jarvis', 'LEGACY SYSTEM PROMPT', true);
    const harness = kernelRuntimeBindings(protectedJarvis);
    const database = createJarvisDb(
      uniqueTestDbName('runtime-installed-hive-host'),
      TEST_INDEXED_DB,
    );
    await database.open();
    await database.chats.add({
      id: harness.chatId,
      workspace_id: 'workspace_runtime_hive_host' as never,
      title: 'Installed Hive host',
      mode: 'chat',
      active_agent_ids: [protectedJarvis.id],
      created_at: 1,
      updated_at: 1,
    });
    mocks.runAgent.mockImplementation(async (providerInput) => ({
      text: providerInput.compiledPrompt ? 'Protected Hive synthesis.' : 'Verified worker output.',
      usage: { input_tokens: 1, output_tokens: 1, cost_usd: 0 },
      provider: providerInput.agent.model.provider,
      model: providerInput.agent.model.model,
    }));
    const disposeHost = await installJarvisKernelRuntimeHost({
      db: database,
      bindKernelActions: () =>
        ({
          create: vi.fn() as never,
          decide: vi.fn() as never,
          execute: vi.fn() as never,
          executeAutoApprovedSafe: vi.fn() as never,
        }) as never,
      capabilitySnapshots: {
        getForAccount: vi.fn(async () => ({
          capturedAt: 1,
          tools: [],
          plugins: [],
          mcps: [],
          terminals: [],
          agents: [],
          entitlements: { source: 'unavailable' as const, capabilities: [] },
        })),
      },
      randomUUID: () => 'runtime-installed-hive-host',
      now: () => 10,
    });
    trackListener(disposeHost);
    trackListener(
      startRuntimeListener(harness.bindings, { jarvisInterlocks: runtimeInterlocks() }),
    );

    try {
      window.dispatchEvent(
        new CustomEvent('jarvis:send', {
          detail: { chatId: harness.chatId, text: 'Run the protected Hive.' },
        }),
      );

      await vi.waitFor(
        () => {
          const runtimeError = mocks.devLog.mock.calls
            .map(([entry]) => entry)
            .find((entry) => entry?.level === 'error');
          if (runtimeError) {
            throw new Error(
              `${JSON.stringify(runtimeError)}; providerCalls=${mocks.runAgent.mock.calls.length}`,
            );
          }
          expect(mocks.runAgent).toHaveBeenCalledTimes(6);
        },
        { timeout: 5_000 },
      );
      await vi.waitFor(async () => {
        const parent = await database.jarvis_runs
          .where('chat_id')
          .equals(harness.chatId)
          .filter((row) => row.source === 'hive_final' && row.parent_run_id === undefined)
          .first();
        expect(parent).toMatchObject({ status: 'completed' });
        expect(parent?.hive_stack_plan?.steps).toHaveLength(5);
      });
      const providerCalls = mocks.runAgent.mock.calls.map(([providerInput]) => providerInput);
      expect(providerCalls.slice(0, 5).every((input) => input.compiledPrompt === undefined)).toBe(
        true,
      );
      expect(providerCalls[5]?.compiledPrompt.systemText).toContain('strict JARVIS identity');
      expect(providerCalls[5]?.messages).toEqual(
        expect.arrayContaining([{ role: 'user', content: 'Run the protected Hive.' }]),
      );
      expect(harness.bindings.appendMessage).not.toHaveBeenCalled();
    } finally {
      disposeHost();
      database.close();
      await database.delete();
    }
  }, 15_000);

  it('bridges message cancellation to the canonical Hive parent and active child owner', async () => {
    useAuthStore.setState({
      apiKeys: {
        google: 'google-test',
        openrouter: 'openrouter-test',
        deepseek: 'deepseek-test',
        openai: 'openai-test',
      },
      chatModelSelection: { mode: 'hive', hiveId: 'balanced' },
    });
    const protectedJarvis = agent('agent_jarvis', 'jarvis', 'LEGACY SYSTEM PROMPT', true);
    const harness = kernelRuntimeBindings(protectedJarvis);
    const database = createJarvisDb(uniqueTestDbName('runtime-hive-cancellation'), TEST_INDEXED_DB);
    await database.open();
    await database.chats.add({
      id: harness.chatId,
      workspace_id: 'workspace_runtime_hive_cancel' as never,
      title: 'Hive cancellation',
      mode: 'chat',
      active_agent_ids: [protectedJarvis.id],
      created_at: 1,
      updated_at: 1,
    });
    const workerSignals: AbortSignal[] = [];
    mocks.runAgent.mockImplementation(
      (providerInput) =>
        new Promise((_, reject) => {
          workerSignals.push(providerInput.signal);
          const rejectCancelled = () =>
            reject(new DOMException('Hive worker cancelled', 'AbortError'));
          if (providerInput.signal.aborted) {
            rejectCancelled();
          } else {
            providerInput.signal.addEventListener('abort', rejectCancelled, { once: true });
          }
        }),
    );
    const disposeHost = await installJarvisKernelRuntimeHost({
      db: database,
      bindKernelActions: () =>
        ({
          create: vi.fn() as never,
          decide: vi.fn() as never,
          execute: vi.fn() as never,
          executeAutoApprovedSafe: vi.fn() as never,
        }) as never,
      capabilitySnapshots: {
        getForAccount: vi.fn(async () => ({
          capturedAt: 1,
          tools: [],
          plugins: [],
          mcps: [],
          terminals: [],
          agents: [],
          entitlements: { source: 'unavailable' as const, capabilities: [] },
        })),
      },
      randomUUID: () => 'runtime-hive-cancel',
      now: () => 10,
    });
    trackListener(disposeHost);
    trackListener(
      startRuntimeListener(harness.bindings, { jarvisInterlocks: runtimeInterlocks() }),
    );

    try {
      window.dispatchEvent(
        new CustomEvent('jarvis:send', {
          detail: {
            chatId: harness.chatId,
            text: 'Cancel this protected Hive.',
            cancellationKey: 'msg_kernel_user' as MessageId,
          },
        }),
      );
      await vi.waitFor(() => expect(workerSignals).toHaveLength(1));
      expect(workerSignals[0]!.aborted).toBe(false);

      window.dispatchEvent(
        new CustomEvent('jarvis:cancel', {
          detail: { messageId: 'msg_stale_unrelated' as MessageId },
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(workerSignals[0]!.aborted).toBe(false);

      window.dispatchEvent(
        new CustomEvent('jarvis:cancel', {
          detail: { messageId: 'msg_kernel_user' as MessageId },
        }),
      );

      await vi.waitFor(() => expect(workerSignals[0]!.aborted).toBe(true));
      await vi.waitFor(async () => {
        const parent = await database.jarvis_runs
          .where('chat_id')
          .equals(harness.chatId)
          .filter((row) => row.source === 'hive_final' && row.parent_run_id === undefined)
          .first();
        expect(parent).toBeDefined();
        const cancellation = await database.jarvis_events
          .where('run_id')
          .equals(parent!.id)
          .filter((row) => row.status === 'cancellation_requested')
          .first();
        expect(cancellation).toBeDefined();
      });
    } finally {
      disposeHost();
      database.close();
      await database.delete();
    }
  }, 15_000);

  it('owns cancellation before awaited setup and never dispatches after listener teardown', async () => {
    useAuthStore.setState({
      apiKeys: { groq: 'gsk_test', openai: 'sk_test' },
      chatModelSelection: {
        mode: 'single',
        providerId: 'openai',
        modelId: 'gpt-5.5',
        connectionId: 'openai-api',
        connectionMode: 'native-api',
        authSource: 'api-key',
        capabilities: {
          text: true,
          images: false,
          files: false,
          tools: false,
          modelSelection: true,
          structuredOutput: false,
          streaming: true,
          cancellation: true,
          resumeSession: false,
          systemPrompt: true,
          workingDirectory: false,
          usage: true,
          subscriptionQuota: false,
          localOnly: false,
        },
      },
    });
    const protectedJarvis = agent('agent_jarvis', 'jarvis', 'LEGACY SYSTEM PROMPT', true);
    const harness = kernelRuntimeBindings(protectedJarvis);
    const database = createJarvisDb(uniqueTestDbName('runtime-early-cancel'), TEST_INDEXED_DB);
    await database.open();
    let resolveChat: ((value: undefined) => void) | undefined;
    mocks.chatGetById.mockReturnValueOnce(
      new Promise<undefined>((resolve) => {
        resolveChat = resolve;
      }),
    );
    const disposeHost = await installJarvisKernelRuntimeHost({
      db: database,
      bindKernelActions: () =>
        ({
          create: vi.fn() as never,
          decide: vi.fn() as never,
          execute: vi.fn() as never,
          executeAutoApprovedSafe: vi.fn() as never,
        }) as never,
      capabilitySnapshots: {
        getForAccount: vi.fn(async () => ({
          capturedAt: 1,
          tools: [],
          plugins: [],
          mcps: [],
          terminals: [],
          agents: [],
          entitlements: { source: 'unavailable' as const, capabilities: [] },
        })),
      },
      randomUUID: () => 'runtime-early-cancel',
      now: () => 10,
    });
    trackListener(disposeHost);
    const stop = trackListener(
      startRuntimeListener(harness.bindings, { jarvisInterlocks: runtimeInterlocks() }),
    );

    try {
      window.dispatchEvent(
        new CustomEvent('jarvis:send', {
          detail: {
            chatId: harness.chatId,
            text: 'Never dispatch this protected turn.',
            cancellationKey: 'msg_kernel_user' as MessageId,
          },
        }),
      );
      await vi.waitFor(() => expect(mocks.chatGetById).toHaveBeenCalledOnce());
      stop();
      resolveChat?.(undefined);

      await vi.waitFor(() =>
        expect(mocks.devLog).toHaveBeenCalledWith(
          expect.objectContaining({ message: expect.stringContaining('AI cancelled') }),
        ),
      );
      expect(mocks.runAgent).not.toHaveBeenCalled();
      expect(await database.jarvis_runs.count()).toBe(0);
    } finally {
      disposeHost();
      database.close();
      await database.delete();
    }
  }, 15_000);

  it('releases early cancellation ownership when agent resolution rejects', async () => {
    const selectedAgent = agent('agent_apple', 'apple', 'Always answer with APPLE.');
    const harness = kernelRuntimeBindings(selectedAgent);
    const getAgentForChat = vi
      .fn()
      .mockRejectedValueOnce(new Error('agent lookup unavailable'))
      .mockResolvedValueOnce(selectedAgent);
    trackListener(startRuntimeListener({ ...harness.bindings, getAgentForChat }));
    const detail = {
      chatId: harness.chatId,
      text: 'Reuse this exact turn key.',
      cancellationKey: 'msg_kernel_user' as MessageId,
    };
    const runStates: Array<{ status?: string; errorCode?: string }> = [];
    const onRunState = (event: Event) => {
      runStates.push((event as CustomEvent<{ status?: string; errorCode?: string }>).detail);
    };
    window.addEventListener('jarvis:run-state', onRunState);

    try {
      window.dispatchEvent(new CustomEvent('jarvis:send', { detail }));
      await vi.waitFor(() =>
        expect(mocks.devLog).toHaveBeenCalledWith(
          expect.objectContaining({
            level: 'error',
            message: 'AI setup failed before dispatch',
          }),
        ),
      );
      expect(runStates).toContainEqual({
        chatId: String(harness.chatId),
        status: 'error',
        errorCode: 'kernel_runtime_setup_agent',
      });

      window.dispatchEvent(new CustomEvent('jarvis:send', { detail }));
      await vi.waitFor(() => expect(mocks.runAgent).toHaveBeenCalledOnce());
      expect(mocks.devLog).not.toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Duplicate AI cancellation key rejected' }),
      );
    } finally {
      window.removeEventListener('jarvis:run-state', onRunState);
    }
  });

  it('allocates no run or fallback effects when account changes during awaited canonical voice setup', async () => {
    useAuthStore.setState({
      localUserId: 'account-voice-a',
      cloudSession: null,
      apiKeys: { groq: 'gsk_test', openai: 'sk_test' },
      chatModelSelection: {
        mode: 'single',
        providerId: 'openai',
        modelId: 'gpt-5.5',
        connectionId: 'openai-api',
        connectionMode: 'native-api',
        authSource: 'api-key',
        capabilities: {
          text: true,
          images: false,
          files: false,
          tools: false,
          modelSelection: true,
          structuredOutput: false,
          streaming: true,
          cancellation: true,
          resumeSession: false,
          systemPrompt: true,
          workingDirectory: false,
          usage: true,
          subscriptionQuota: false,
          localOnly: false,
        },
      },
    });
    const protectedJarvis = agent('agent_jarvis', 'jarvis', 'LEGACY SYSTEM PROMPT', true);
    const harness = kernelRuntimeBindings(protectedJarvis);
    const database = createJarvisDb(
      uniqueTestDbName('runtime-voice-account-switch'),
      TEST_INDEXED_DB,
    );
    await database.open();
    await database.chats.add({
      id: harness.chatId,
      workspace_id: 'workspace_runtime_voice_switch' as never,
      title: 'Voice account switch',
      mode: 'chat',
      active_agent_ids: [protectedJarvis.id],
      created_at: 1,
      updated_at: 1,
    });
    useVoiceStore.getState().beginSession(
      createVoiceSessionBinding({
        sessionId: 'vsession_runtime_account_switch',
        accountId: 'account-voice-a',
        chatId: harness.chatId,
        startedAt: 1,
      }),
    );
    let releaseCapabilities!: (value: {
      capturedAt: number;
      tools: never[];
      plugins: never[];
      mcps: never[];
      terminals: never[];
      agents: never[];
      entitlements: { source: 'unavailable'; capabilities: never[] };
    }) => void;
    const getCapabilities = vi.fn(
      () =>
        new Promise<Parameters<typeof releaseCapabilities>[0]>((resolve) => {
          releaseCapabilities = resolve;
        }),
    );
    const disposeHost = await installJarvisKernelRuntimeHost({
      db: database,
      bindKernelActions: () =>
        ({
          create: vi.fn() as never,
          decide: vi.fn() as never,
          execute: vi.fn() as never,
          executeAutoApprovedSafe: vi.fn() as never,
        }) as never,
      capabilitySnapshots: { getForAccount: getCapabilities },
      randomUUID: () => 'runtime-voice-account-switch',
      now: () => 10,
    });
    trackListener(disposeHost);
    trackListener(
      startRuntimeListener(harness.bindings, { jarvisInterlocks: runtimeInterlocks() }),
    );

    try {
      window.dispatchEvent(
        new CustomEvent('jarvis:send', {
          detail: {
            accountId: 'account-voice-a',
            voiceSessionId: 'vsession_runtime_account_switch',
            chatId: harness.chatId,
            text: 'Keep this voice turn in its original account.',
            speakReply: true,
          },
        }),
      );
      await vi.waitFor(() => expect(getCapabilities).toHaveBeenCalledWith('account-voice-a'));

      useAuthStore.setState({ localUserId: 'account-voice-b' });
      releaseCapabilities({
        capturedAt: 1,
        tools: [],
        plugins: [],
        mcps: [],
        terminals: [],
        agents: [],
        entitlements: { source: 'unavailable', capabilities: [] },
      });

      await vi.waitFor(() =>
        expect(mocks.devLog).toHaveBeenCalledWith(expect.objectContaining({ level: 'error' })),
      );
      expect(await database.jarvis_runs.count()).toBe(0);
      expect(await database.messages.count()).toBe(0);
      expect(harness.bindings.appendMessage).not.toHaveBeenCalled();
      expect(harness.bindings.updateMessage).not.toHaveBeenCalled();
      expect(mocks.runAgent).not.toHaveBeenCalled();
      expect(mocks.streamingSession.onDelta).not.toHaveBeenCalled();
      expect(mocks.streamingSession.onComplete).not.toHaveBeenCalled();
      expect(mocks.streamingSession.stop).not.toHaveBeenCalled();
      expect(mocks.streamingSession.haltPlayback).not.toHaveBeenCalled();
      expect(useVoiceStore.getState().session?.activeRunId).toBeUndefined();
    } finally {
      disposeHost();
      useVoiceStore.getState().reset();
      database.close();
      await database.delete();
    }
  });

  it('releases the exact claimed voice run when canonical execution fails', async () => {
    const protectedJarvis = agent('agent_jarvis', 'jarvis', 'LEGACY SYSTEM PROMPT', true);
    const harness = kernelRuntimeBindings(protectedJarvis);
    const database = createJarvisDb(
      uniqueTestDbName('runtime-voice-failed-run-release'),
      TEST_INDEXED_DB,
    );
    await database.open();
    await database.chats.add({
      id: harness.chatId,
      workspace_id: 'workspace_runtime_voice_failed_run' as never,
      title: 'Voice failed run release',
      mode: 'chat',
      active_agent_ids: [protectedJarvis.id],
      created_at: 1,
      updated_at: 1,
    });
    useVoiceStore.getState().beginSession(
      createVoiceSessionBinding({
        sessionId: 'vsession_runtime_failed_run',
        accountId: 'runtime-test-account',
        chatId: harness.chatId,
        startedAt: 1,
      }),
    );
    mocks.runAgent.mockRejectedValueOnce(new Error('provider_failed_after_voice_claim'));
    const disposeHost = await installJarvisKernelRuntimeHost({
      db: database,
      bindKernelActions: () =>
        ({
          create: vi.fn() as never,
          decide: vi.fn() as never,
          execute: vi.fn() as never,
          executeAutoApprovedSafe: vi.fn() as never,
        }) as never,
      capabilitySnapshots: {
        getForAccount: vi.fn(async () => ({
          capturedAt: 1,
          tools: [],
          plugins: [],
          mcps: [],
          terminals: [],
          agents: [],
          entitlements: { source: 'unavailable' as const, capabilities: [] },
        })),
      },
      randomUUID: () => 'runtime-voice-failed-run-release',
      now: () => 10,
    });
    trackListener(disposeHost);
    trackListener(
      startRuntimeListener(harness.bindings, { jarvisInterlocks: runtimeInterlocks() }),
    );

    try {
      window.dispatchEvent(
        new CustomEvent('jarvis:send', {
          detail: {
            accountId: 'runtime-test-account',
            voiceSessionId: 'vsession_runtime_failed_run',
            chatId: harness.chatId,
            text: 'Fail safely after claiming this voice run.',
            speakReply: true,
          },
        }),
      );

      await vi.waitFor(() =>
        expect(mocks.devLog).toHaveBeenCalledWith(expect.objectContaining({ level: 'error' })),
      );
      expect(useVoiceStore.getState().session).toEqual(
        expect.objectContaining({ sessionId: 'vsession_runtime_failed_run' }),
      );
      expect(useVoiceStore.getState().session?.activeRunId).toBeUndefined();
    } finally {
      disposeHost();
      useVoiceStore.getState().reset();
      database.close();
      await database.delete();
    }
  });

  it('skips shadow and mode interlocks for a user-created jarvis slug collision', async () => {
    const collision = agent('agent_collision', 'jarvis', 'USER COLLISION', false);
    const shadow = shadowHarness();
    const interlocks = runtimeInterlocks();
    interlocks.assertCanonicalAccountIdentity.mockImplementation(() => {
      throw new Error('must not run for collision');
    });
    const harness = kernelRuntimeBindings(collision);
    trackListener(
      startRuntimeListener(harness.bindings, {
        jarvisKernelMode: 'shadow',
        jarvisShadow: shadow,
        jarvisInterlocks: interlocks,
      }),
    );

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId: harness.chatId, text: 'Run the kernel gate.' },
      }),
    );

    await vi.waitFor(() => expect(mocks.runAgent).toHaveBeenCalledTimes(1));
    expect(shadow.createPersistedRun).not.toHaveBeenCalled();
    for (const assertion of Object.values(interlocks)) expect(assertion).not.toHaveBeenCalled();
  });

  it('records a safe failed shadow run while a compiler defect still allows legacy dispatch', async () => {
    const protectedJarvis = agent('agent_jarvis', 'jarvis', 'LEGACY SYSTEM PROMPT', true);
    const shadow = shadowHarness();
    vi.mocked(shadow.compilePrompt).mockImplementation(() => {
      throw new Error('private prompt text /users/viper/secret.txt');
    });
    const harness = kernelRuntimeBindings(protectedJarvis);
    trackListener(
      startRuntimeListener(harness.bindings, {
        jarvisKernelMode: 'shadow',
        jarvisShadow: shadow,
        jarvisInterlocks: runtimeInterlocks(),
      }),
    );

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId: harness.chatId, text: 'Run the kernel gate.' },
      }),
    );

    await vi.waitFor(() => expect(mocks.runAgent).toHaveBeenCalledOnce());
    expect(shadow.transitionRun).toHaveBeenCalledWith(
      expect.objectContaining({ expectedStatus: 'queued', nextStatus: 'failed' }),
    );
    expect(JSON.stringify(vi.mocked(shadow.recordDiagnostic).mock.calls)).not.toContain('viper');
  });

  it('rejects an invalid protected mode before interlocks, persistence, or provider dispatch', async () => {
    const protectedJarvis = agent('agent_jarvis', 'jarvis', 'LEGACY SYSTEM PROMPT', true);
    const shadow = shadowHarness();
    const interlocks = runtimeInterlocks();
    const harness = kernelRuntimeBindings(protectedJarvis);
    trackListener(
      startRuntimeListener(harness.bindings, {
        jarvisKernelMode: 'invalid' as never,
        jarvisShadow: shadow,
        jarvisInterlocks: interlocks,
      }),
    );

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId: harness.chatId, text: 'Run the kernel gate.' },
      }),
    );

    await vi.waitFor(() =>
      expect(mocks.devLog).toHaveBeenCalledWith(expect.objectContaining({ level: 'error' })),
    );
    expect(mocks.runAgent).not.toHaveBeenCalled();
    expect(shadow.createPersistedRun).not.toHaveBeenCalled();
    for (const assertion of Object.values(interlocks)) expect(assertion).not.toHaveBeenCalled();
  });

  it('keeps signal delivery nonterminal until the provider verifies cancellation', async () => {
    const protectedJarvis = agent('agent_jarvis', 'jarvis', 'LEGACY SYSTEM PROMPT', true);
    const shadow = shadowHarness();
    let rejectProvider: ((reason: unknown) => void) | undefined;
    mocks.runAgent.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectProvider = reject;
      }),
    );
    const harness = kernelRuntimeBindings(protectedJarvis);
    trackListener(
      startRuntimeListener(harness.bindings, {
        jarvisKernelMode: 'shadow',
        jarvisShadow: shadow,
        jarvisInterlocks: runtimeInterlocks(),
      }),
    );

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId: harness.chatId, text: 'Run the kernel gate.' },
      }),
    );
    await vi.waitFor(() => expect(mocks.runAgent).toHaveBeenCalledOnce());
    window.dispatchEvent(
      new CustomEvent('jarvis:cancel', {
        detail: { messageId: 'msg_kernel_assistant' as MessageId },
      }),
    );
    await Promise.resolve();
    expect(shadow.transitionRun).not.toHaveBeenCalledWith(
      expect.objectContaining({ nextStatus: 'cancelled' }),
    );

    rejectProvider?.(new DOMException('Provider stopped', 'AbortError'));
    await vi.waitFor(() =>
      expect(shadow.transitionRun).toHaveBeenCalledWith(
        expect.objectContaining({ expectedStatus: 'running', nextStatus: 'cancelled' }),
      ),
    );
  });

  it.each([
    ['legacy', 'assertPrivateSyncBoundary'],
    ['shadow', 'assertPrivateSyncBoundary'],
    ['kernel', 'assertPrivateSyncBoundary'],
    ['legacy', 'assertSelectedPromptTransportSupported'],
    ['shadow', 'assertSelectedPromptTransportSupported'],
    ['kernel', 'assertSelectedPromptTransportSupported'],
  ] as const)('keeps %s mode fail-closed when %s denies', async (mode, deniedMethod) => {
    const protectedJarvis = agent('agent_jarvis', 'jarvis', 'LEGACY SYSTEM PROMPT', true);
    const shadow = shadowHarness();
    const interlocks = runtimeInterlocks();
    interlocks[deniedMethod].mockImplementation(() => {
      throw new Error(`${deniedMethod}_denied`);
    });
    const harness = kernelRuntimeBindings(protectedJarvis);
    trackListener(
      startRuntimeListener(harness.bindings, {
        jarvisKernelMode: mode,
        jarvisShadow: shadow,
        jarvisInterlocks: interlocks,
      }),
    );

    window.dispatchEvent(
      new CustomEvent('jarvis:send', {
        detail: { chatId: harness.chatId, text: 'Run the kernel gate.' },
      }),
    );

    await vi.waitFor(() => expect(mocks.devLog).toHaveBeenCalled());
    expect(mocks.runAgent).not.toHaveBeenCalled();
    expect(shadow.createPersistedRun).not.toHaveBeenCalled();
  });
});

describe('canonical provider artifact evidence authority', () => {
  const exact = Object.freeze({
    producerId: 'provider_response',
    accountId: 'account-provider',
    runId: 'jrun_provider',
    requestId: 'jrequest_provider',
    attemptNumber: 1,
    resultRef: 'jprovider_result_provider',
    state: 'completed',
    verifiedAt: 1_786_202_000_000,
    providerId: 'openai',
    modelId: 'gpt-sol',
    modelSnapshotRef: 'openai:gpt-sol:2026-07-19',
  }) satisfies CanonicalProviderEvidence;

  it('accepts only the exact frozen canonical provider result re-read', async () => {
    const readCanonicalProviderEvidence = vi.fn(async () => exact);
    const authority = createCanonicalProviderEvidenceAuthority({
      readCanonicalProviderEvidence,
    });

    await expect(authority.verify(exact)).resolves.toBe(exact);
    for (const changed of [
      Object.freeze({ ...exact, runId: 'jrun_other' }),
      Object.freeze({ ...exact, providerId: 'other-provider' }),
      Object.freeze({ ...exact, modelId: 'other-model' }),
      Object.freeze({ ...exact, modelSnapshotRef: 'other-snapshot' }),
    ]) {
      await expect(authority.verify(changed)).resolves.toBeNull();
    }
  });

  it('rejects non-frozen, nonterminal, and invalid numeric provider evidence before re-read', async () => {
    const readCanonicalProviderEvidence = vi.fn(async () => exact);
    const authority = createCanonicalProviderEvidenceAuthority({
      readCanonicalProviderEvidence,
    });

    await expect(authority.verify({ ...exact })).resolves.toBeNull();
    await expect(
      authority.verify(Object.freeze({ ...exact, state: 'queued' }) as never),
    ).resolves.toBeNull();
    await expect(
      authority.verify(Object.freeze({ ...exact, attemptNumber: 1.5 })),
    ).resolves.toBeNull();
    await expect(
      authority.verify(Object.freeze({ ...exact, verifiedAt: Number.NaN })),
    ).resolves.toBeNull();
    expect(readCanonicalProviderEvidence).not.toHaveBeenCalled();
  });
});
