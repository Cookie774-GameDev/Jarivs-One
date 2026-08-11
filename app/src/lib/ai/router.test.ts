import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Agent } from '@/types';
import type { CompiledJarvisPrompt } from '@/lib/jarvis/contracts';
import { useAuthStore } from '@/stores/auth';
import { AGENT_DEFAULT_PROVIDER_MODEL } from './agentProviderOptions';
import { selectionFromOption } from './modelSelection';
import { syncDiscoveredOllamaModels } from './models';
import { JarvisProviderAttemptFailureError } from './providerAttemptEvidence';
import { providerActivityTracker } from '@/features/taskbar-usage/activityTracker';

const { codexDetect, codexProbeAuth, codexSend, harnessRun, nativeInvoke, ollamaRun, openaiRun } =
  vi.hoisted(() => ({
    codexDetect: vi.fn(),
    codexProbeAuth: vi.fn(),
    codexSend: vi.fn(),
    harnessRun: vi.fn(),
    nativeInvoke: vi.fn(),
    ollamaRun: vi.fn(),
    openaiRun: vi.fn(),
  }));

vi.mock('@tauri-apps/api/core', () => ({ invoke: nativeInvoke }));

vi.mock('./openCodeRunAgent', () => ({
  openCodeRunAgentAdapter: {
    run: harnessRun,
    clear: vi.fn(),
  },
}));

vi.mock('./providers/openai', () => ({
  OPENAI_DEFAULT_MODEL: 'gpt-4o-mini',
  openaiProvider: {
    id: 'openai',
    name: 'OpenAI',
    isAvailable: () => true,
    run: openaiRun,
  },
}));

vi.mock('./providers/ollama', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./providers/ollama')>();
  return {
    ...actual,
    ollamaProvider: {
      ...actual.ollamaProvider,
      run: ollamaRun,
    },
  };
});

vi.mock('./adapters/codex', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./adapters/codex')>();
  return {
    ...actual,
    codexCliAdapter: {
      id: 'codex-cli',
      detect: codexDetect,
      probeAuth: codexProbeAuth,
      send: codexSend,
    },
  };
});

import { runAgent } from './router';

const jarvis: Agent = {
  id: 'agent_jarvis' as Agent['id'],
  slug: 'jarvis',
  name: 'Jarvis',
  description: 'Jarvis',
  system_prompt: 'You are Jarvis.',
  model: { provider: 'google', model: 'gemini-2.5-flash-lite' },
  tools_allowed: [],
  memory_scope: 'workspace',
  capabilities: [],
  builtin: true,
  created_at: 1,
  updated_at: 1,
};

const defaultProviderAgent: Agent = {
  ...jarvis,
  id: 'agent_custom' as Agent['id'],
  slug: 'custom',
  builtin: false,
  model: { provider: 'mock', model: AGENT_DEFAULT_PROVIDER_MODEL },
};

const openaiAgent: Agent = {
  ...jarvis,
  id: 'agent_openai' as Agent['id'],
  system_prompt: 'MUTABLE AGENT PROMPT MUST NOT BE SENT',
  model: { provider: 'openai', model: 'gpt-protected' },
};

const compiledPrompt: Readonly<CompiledJarvisPrompt> = Object.freeze({
  schemaVersion: 1,
  layers: [],
  systemText: 'EXACT PROTECTED SYSTEM CONTRACT',
  promptHash: 'b'.repeat(64),
  identityVersion: 1,
  profileRevisionId: 'profile-revision-1',
  diagnostics: {
    totalChars: 31,
    omittedSourceRefs: [],
    warnings: [],
  },
});

const protectedAttempt = Object.freeze({
  accountId: 'account-1',
  runId: 'run-1',
  requestId: 'request-1',
  attemptNumber: 1,
});

const successfulResponse = {
  text: 'done',
  usage: { input_tokens: 2, output_tokens: 1, cost_usd: 0 },
  provider: 'openai' as const,
  model: 'gpt-protected',
};

describe('AI provider routing', () => {
  beforeEach(() => {
    codexDetect.mockReset();
    codexDetect.mockResolvedValue({ status: 'available' });
    codexProbeAuth.mockReset();
    codexProbeAuth.mockResolvedValue({ status: 'authenticated' });
    codexSend.mockReset();
    codexSend.mockImplementation(() =>
      (async function* () {
        yield { type: 'text', delta: 'cli response' };
        yield { type: 'done', finishReason: 'completed' };
      })(),
    );
    openaiRun.mockReset();
    openaiRun.mockResolvedValue(successfulResponse);
    harnessRun.mockReset();
    harnessRun.mockImplementation(async (request) => ({
      text: request.selection.providerId === 'ollama' ? 'local result' : 'done',
      usage: { input_tokens: 2, output_tokens: 1, cost_usd: 0 },
      provider: request.selection.runtimeProviderId ?? request.selection.providerId,
      model: request.selection.modelId,
    }));
    nativeInvoke.mockReset();
    ollamaRun.mockReset();
    ollamaRun.mockResolvedValue({
      text: 'local result',
      usage: { input_tokens: 3, output_tokens: 2, cost_usd: 0 },
      provider: 'ollama',
      model: 'qwen3:8b',
    });
    try {
      localStorage.clear();
    } catch {
      /* jsdom */
    }
    syncDiscoveredOllamaModels([]);
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

  it('routes ordinary production chat only through OpenCode with a stable chat scope', async () => {
    const onApprovalRequested = vi.fn();
    const tools = { 'terminal.list': true, 'terminal.write': false } as const;
    const response = await runAgent({
      agent: openaiAgent,
      chatId: 'chat-production-1',
      parentChatId: 'chat-parent-1',
      messages: [{ role: 'user', content: 'hello' }],
      onApprovalRequested,
      tools,
    });

    expect(response.text).toBe('done');
    expect(harnessRun).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeId: 'chat-production-1',
        parentScopeId: 'chat-parent-1',
        purpose: 'chat',
        onApprovalRequested,
        tools,
        selection: {
          providerId: 'openai',
          modelId: 'gpt-protected',
          runtimeProviderId: 'openai',
        },
      }),
    );
    expect(openaiRun).not.toHaveBeenCalled();
    expect(ollamaRun).not.toHaveBeenCalled();
    expect(codexSend).not.toHaveBeenCalled();
    expect(nativeInvoke).not.toHaveBeenCalled();
  });

  it('tracks the active OpenCode request until harness completion', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const enteredHarness = new Promise<void>((resolve) => {
      entered = resolve;
    });
    harnessRun.mockImplementationOnce(async (request) => {
      entered();
      await gate;
      return {
        text: 'done',
        usage: { input_tokens: 2, output_tokens: 1, cost_usd: 0 },
        provider: request.selection.providerId,
        model: request.selection.modelId,
      };
    });

    const pending = runAgent({
      agent: openaiAgent,
      messages: [{ role: 'user', content: 'hello' }],
    });
    await enteredHarness;
    expect(providerActivityTracker.snapshot().byProvider.openai).toBe(1);
    release();
    await pending;
    expect(providerActivityTracker.snapshot().total).toBe(0);
  });

  it('translates only a verified reasoning option into an OpenCode model variant', async () => {
    await runAgent({
      agent: openaiAgent,
      chatId: 'chat-variant-1',
      messages: [{ role: 'user', content: 'verify deeply' }],
      provider_options: { reasoning_effort: 'xhigh' },
    });

    expect(harnessRun).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'xhigh',
        selection: expect.objectContaining({
          providerId: 'openai',
          modelId: 'gpt-protected',
        }),
      }),
    );

    await expect(
      runAgent({
        agent: openaiAgent,
        messages: [{ role: 'user', content: 'unsafe option' }],
        provider_options: { reasoning_effort: 'arbitrary', unsafe_extra: 'ignored' },
      }),
    ).rejects.toThrow(/OpenCode model variant/i);
  });

  it('routes an exact local feature connection independently from the chat model', async () => {
    syncDiscoveredOllamaModels(['qwen3:8b']);
    useAuthStore.setState({
      chatModelSelection: { mode: 'none' },
      offlineMode: false,
    });
    const promptForgeAgent: Agent = {
      ...jarvis,
      id: 'agent_prompt_forge' as Agent['id'],
      slug: 'prompt-forge',
      model: { provider: 'ollama', model: 'qwen3:8b' },
    };

    const response = await runAgent({
      agent: promptForgeAgent,
      messages: [{ role: 'user', content: 'Upgrade this draft.' }],
      connectionId: 'ollama-local',
      purpose: 'prompt_forge',
    });

    expect(response.text).toBe('local result');
    expect(harnessRun).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'prompt_forge',
        selection: {
          providerId: 'ollama',
          modelId: 'qwen3:8b',
          connectionId: 'ollama-local',
          runtimeProviderId: 'ollama',
        },
      }),
    );
    expect(ollamaRun).not.toHaveBeenCalled();
  });

  it('routes Model Foundry selections through OpenCode without a native bypass', async () => {
    const chunks: Array<{ delta: string; first?: boolean; done?: boolean }> = [];
    const foundryAgent: Agent = {
      ...jarvis,
      id: 'agent_foundry' as Agent['id'],
      slug: 'release-adapter',
      model: { provider: 'ollama', model: 'foundry:job_12345' },
    };
    const response = await runAgent({
      agent: foundryAgent,
      messages: [{ role: 'user', content: 'Review this release.' }],
      max_output_tokens: 300,
      onChunk: (chunk) => chunks.push(chunk),
    });

    expect(nativeInvoke).not.toHaveBeenCalled();
    expect(harnessRun).toHaveBeenCalledWith(
      expect.objectContaining({
        selection: {
          providerId: 'ollama',
          modelId: 'foundry:job_12345',
          runtimeProviderId: 'ollama',
        },
      }),
    );
    expect(response).toEqual({
      text: 'local result',
      usage: { input_tokens: 2, output_tokens: 1, cost_usd: 0 },
      provider: 'ollama',
      model: 'foundry:job_12345',
    });
    expect(chunks).toEqual([]);
    expect(ollamaRun).not.toHaveBeenCalled();
  });

  it('passes Model Foundry cancellation through the OpenCode boundary', async () => {
    const controller = new AbortController();
    harnessRun.mockImplementationOnce(
      ({ signal }) =>
        new Promise((_, reject) =>
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted by user', 'AbortError')),
            { once: true },
          ),
        ),
    );
    const foundryAgent: Agent = {
      ...jarvis,
      id: 'agent_foundry' as Agent['id'],
      slug: 'release-adapter',
      model: { provider: 'ollama', model: 'foundry:job_12345' },
    };

    const result = runAgent({
      agent: foundryAgent,
      messages: [{ role: 'user', content: 'Review this release.' }],
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(harnessRun).toHaveBeenCalledOnce());
    controller.abort();

    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(nativeInvoke).not.toHaveBeenCalled();
  });

  it('preserves exact protected native transport inputs and the caller signal', async () => {
    const controller = new AbortController();
    const messages = [
      { role: 'user' as const, content: 'first' },
      { role: 'assistant' as const, content: 'second' },
      { role: 'user' as const, content: 'third' },
    ];

    await runAgent({
      agent: openaiAgent,
      messages,
      connectionId: 'openai-api',
      compiledPrompt,
      requestId: protectedAttempt.requestId,
      protectedAttempt,
      signal: controller.signal,
      temperature: 0.2,
      max_output_tokens: 321,
      provider_options: { reasoning_effort: 'high' },
    });

    expect(harnessRun).toHaveBeenCalledOnce();
    const request = harnessRun.mock.calls[0]![0];
    expect(request).toMatchObject({
      purpose: 'chat',
      compiledPrompt,
      messages,
      signal: controller.signal,
      selection: {
        providerId: 'openai',
        modelId: 'gpt-protected',
        connectionId: 'openai-api',
        runtimeProviderId: 'openai',
      },
    });
    expect(request.onResponseObservation).toEqual(expect.any(Function));
    expect(request.onActionDispatch).toEqual(expect.any(Function));
    expect(openaiRun).not.toHaveBeenCalled();
  });

  it('rejects an external provider CLI as alternate Chat transport', async () => {
    const controller = new AbortController();
    const codexAgent: Agent = {
      ...openaiAgent,
      model: { provider: 'openai', model: 'gpt-5.6-sol' },
    };
    const messages = [
      { role: 'user' as const, content: '--option $(whoami); Unicode æ¡œ' },
      { role: 'assistant' as const, content: 'line one\nline two' },
    ];

    await expect(
      runAgent({
        agent: codexAgent,
        messages,
        connectionId: 'openai-codex',
        compiledPrompt,
        requestId: protectedAttempt.requestId,
        protectedAttempt,
        signal: controller.signal,
        workingDirectory: 'C:\\workspace with spaces',
        provider_options: { reasoning_effort: 'xhigh' },
      }),
    ).rejects.toThrow('External provider CLI connections cannot transport VibeSpace Chat');

    expect(codexSend).not.toHaveBeenCalled();
    expect(harnessRun).not.toHaveBeenCalled();
    expect(openaiRun).not.toHaveBeenCalled();
  });

  it('requires exact protected request bindings before provider dispatch', async () => {
    await expect(
      runAgent({
        agent: openaiAgent,
        messages: [{ role: 'user', content: 'hello' }],
        connectionId: 'openai-api',
        compiledPrompt,
      }),
    ).rejects.toThrow();
    await expect(
      runAgent({
        agent: openaiAgent,
        messages: [{ role: 'user', content: 'hello' }],
        connectionId: 'openai-api',
        compiledPrompt,
        requestId: 'request-mismatch',
        protectedAttempt,
      }),
    ).rejects.toThrow();
    expect(openaiRun).not.toHaveBeenCalled();
  });

  it('classifies a zero-observation provider failure with exact durable binding', async () => {
    harnessRun.mockRejectedValueOnce(new Error('raw provider detail must not become evidence'));

    let failure: unknown;
    try {
      await runAgent({
        agent: openaiAgent,
        messages: [{ role: 'user', content: 'hello' }],
        connectionId: 'openai-api',
        compiledPrompt,
        requestId: protectedAttempt.requestId,
        protectedAttempt,
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(JarvisProviderAttemptFailureError);
    const classified = (failure as JarvisProviderAttemptFailureError).classification;
    expect(classified.kind).toBe('pre_effect_transport_failure');
    if (classified.kind !== 'pre_effect_transport_failure') throw new Error('unexpected kind');
    expect(classified.evidence).toMatchObject({
      ...protectedAttempt,
      providerId: 'openai',
      modelId: openaiAgent.model.model,
      responseStarted: false,
      chunkCount: 0,
      actionDispatchCount: 0,
      failureCategory: 'provider_transport_failure',
    });
    expect(classified.evidence.failureCategory).not.toContain('raw provider detail');
  });

  it('denies retry evidence after a provider response observation', async () => {
    harnessRun.mockImplementationOnce(async (request) => {
      request.onResponseObservation?.({ kind: 'sdk_chunk', observedAt: 100 });
      throw new Error('stream interrupted');
    });

    await expect(
      runAgent({
        agent: openaiAgent,
        messages: [{ role: 'user', content: 'hello' }],
        connectionId: 'openai-api',
        compiledPrompt,
        requestId: protectedAttempt.requestId,
        protectedAttempt,
      }),
    ).rejects.toMatchObject({
      classification: {
        kind: 'response_started_transport_failure',
        responseStarted: true,
        chunkCount: 1,
        actionDispatchCount: 0,
      },
    });
  });

  it('does not dispatch or mint provider failure evidence for aborts', async () => {
    const preAborted = new AbortController();
    preAborted.abort();
    await expect(
      runAgent({
        agent: openaiAgent,
        messages: [{ role: 'user', content: 'hello' }],
        connectionId: 'openai-api',
        compiledPrompt,
        requestId: protectedAttempt.requestId,
        protectedAttempt,
        signal: preAborted.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(openaiRun).not.toHaveBeenCalled();

    const midstreamAbort = new DOMException('Aborted by user', 'AbortError');
    harnessRun.mockRejectedValueOnce(midstreamAbort);
    let failure: unknown;
    try {
      await runAgent({
        agent: openaiAgent,
        messages: [{ role: 'user', content: 'hello' }],
        connectionId: 'openai-api',
        compiledPrompt,
        requestId: protectedAttempt.requestId,
        protectedAttempt,
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBe(midstreamAbort);
  });
});
