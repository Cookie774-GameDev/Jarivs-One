import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Agent } from '@/types';
import type { HarnessEvent, HarnessProvider } from '@/lib/harness/types';
import { useAuthStore } from '@/stores/auth';
import { rememberLiveOpenCodeProviders } from './openCodeProductionTransport';

const { listProviders, send, createSession } = vi.hoisted(() => ({
  listProviders: vi.fn(),
  send: vi.fn(),
  createSession: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@/lib/harness/toolGatewayAuthority', () => ({
  captureToolGatewayAuthorityClaim: () => ({
    scope: {
      accountId: 'account-a',
      accountSource: 'local',
      workspaceId: 'workspace-a',
      projectId: 'project-a',
    },
    generation: 1,
  }),
  bindToolGatewaySessionAuthority: () => true,
  releaseToolGatewaySessionAuthority: vi.fn(),
}));

vi.mock('@/lib/harness/openCodeHarness', () => ({
  openCodeHarness: {
    ensureReady: vi.fn(async () => ({ source: 'managed' as const, version: '1.18.16' })),
    createSession,
    deleteSession: vi.fn(async () => undefined),
    send,
    cancel: vi.fn(async () => undefined),
    listProviders,
    listModels: vi.fn(async () => []),
    respondToApproval: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
  },
}));

import { runAgent } from './router';

const liveCatalog: readonly HarnessProvider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    connected: true,
    models: [
      {
        id: 'gpt-protected',
        name: 'gpt-protected',
        variants: ['low', 'medium', 'high', 'xhigh'],
      },
    ],
  },
];

const usageEvent: HarnessEvent = {
  type: 'usage.updated',
  usage: {
    inputTokens: 1,
    outputTokens: 1,
    costUsd: 0,
    providerId: 'openai',
    modelId: 'gpt-protected',
  },
};

const agent: Agent = {
  id: 'agent_openai' as Agent['id'],
  slug: 'jarvis',
  name: 'Jarvis',
  description: 'Jarvis',
  system_prompt: 'You are Jarvis.',
  model: { provider: 'openai', model: 'gpt-protected' },
  tools_allowed: [],
  memory_scope: 'workspace',
  capabilities: [],
  builtin: true,
  created_at: 1,
  updated_at: 1,
};

describe('runAgent live OpenCode effort gate', () => {
  beforeEach(() => {
    rememberLiveOpenCodeProviders([]);
    createSession.mockReset();
    createSession.mockImplementation(async (input: { chatId: string }) => ({
      id: `session-${createSession.mock.calls.length}`,
      chatId: input.chatId,
    }));
    send.mockReset();
    send.mockImplementation(() =>
      (async function* () {
        yield usageEvent;
        yield { type: 'done', finishReason: 'stop' } as const;
      })(),
    );
    listProviders.mockReset();
    listProviders.mockResolvedValue(liveCatalog);
    useAuthStore.setState({
      apiKeys: {},
      defaultProvider: 'google',
      selectedModels: {},
      chatModelSelection: { mode: 'none' },
      offlineMode: false,
      defaultLocalModel: 'llama3.2',
      plan: 'free',
    });
  });

  it('sends an explicit reasoning effort after listProviders, with an empty cache', async () => {
    const response = await runAgent({
      agent,
      chatId: 'chat-live-effort',
      messages: [{ role: 'user', content: 'verify deeply' }],
      provider_options: { reasoning_effort: 'xhigh' },
    });

    expect(response.text).toBe('');
    expect(listProviders).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ variant: 'xhigh' }));
    expect(send.mock.invocationCallOrder[0]).toBeGreaterThan(listProviders.mock.invocationCallOrder[0]!);
  });

  it('rejects an unsupported effort from the live listProviders result, not a pre-seeded cache', async () => {
    await expect(
      runAgent({
        agent,
        messages: [{ role: 'user', content: 'unsafe option' }],
        provider_options: { reasoning_effort: 'arbitrary' },
      }),
    ).rejects.toThrow(/OpenCode model variant "arbitrary" is unsupported/);
    expect(listProviders).toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses send when listProviders returns no live catalog', async () => {
    listProviders.mockResolvedValue([]);
    await expect(
      runAgent({
        agent,
        messages: [{ role: 'user', content: 'hello' }],
        provider_options: { reasoning_effort: 'high' },
      }),
    ).rejects.toThrow(/Static model lists cannot execute/);
    expect(send).not.toHaveBeenCalled();
  });
});
