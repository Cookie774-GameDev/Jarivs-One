import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Agent } from '@/types';
import type { CompiledJarvisPrompt } from '@/lib/jarvis/contracts';
import { useAuthStore } from '@/stores/auth';
import { AGENT_DEFAULT_PROVIDER_MODEL } from './agentProviderOptions';
import { selectionFromOption } from './modelSelection';
import { syncDiscoveredOllamaModels } from './models';
import { JarvisProviderAttemptFailureError } from './providerAttemptEvidence';

const { codexDetect, codexProbeAuth, codexSend, nativeInvoke, ollamaRun, openaiRun } = vi.hoisted(
  () => ({
    codexDetect: vi.fn(),
    codexProbeAuth: vi.fn(),
    codexSend: vi.fn(),
    nativeInvoke: vi.fn(),
    ollamaRun: vi.fn(),
    openaiRun: vi.fn(),
  }),
);

vi.mock('@tauri-apps/api/core', () => ({ invoke: nativeInvoke }));

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

import { NoModelSelectedError, resolveProviderAndModel, runAgent } from './router';

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

  it('uses the pinned provider for built-in Jarvis when that key is available', () => {
    useAuthStore.setState({
      apiKeys: { google: 'AIza-test', groq: 'gsk_test' },
      chatModelSelection: selectionFromOption('groq', 'llama-3.1-8b-instant'),
    });

    const resolved = resolveProviderAndModel(jarvis);
    expect(resolved.provider.id).toBe('google');
    expect(resolved.model).toBe('gemini-2.5-flash-lite');
  });

  it('throws when a pinned provider is unavailable instead of silently falling back', () => {
    syncDiscoveredOllamaModels(['qwen3:4b']);
    useAuthStore.setState({
      apiKeys: {},
      defaultProvider: 'google',
      defaultLocalModel: 'qwen3:4b',
    });

    expect(() => resolveProviderAndModel(jarvis)).toThrow(NoModelSelectedError);
  });

  it('throws when no provider or local model is available', () => {
    expect(() => resolveProviderAndModel(jarvis)).toThrow(NoModelSelectedError);
  });

  it('routes default-provider agents through the explicit chat model selection', () => {
    useAuthStore.setState({
      apiKeys: { groq: 'gsk_test' },
      chatModelSelection: selectionFromOption('groq', 'llama-3.1-8b-instant'),
    });

    const resolved = resolveProviderAndModel(defaultProviderAgent);
    expect(resolved.provider.id).toBe('groq');
    expect(resolved.model).toBe('llama-3.1-8b-instant');
  });

  it('routes a connected Qwen selection through the first-class Model Studio provider', () => {
    useAuthStore.setState({
      apiKeys: { qwen: 'qwen-test-key' },
      chatModelSelection: selectionFromOption('qwen', 'qwen3.7-plus'),
    });

    const resolved = resolveProviderAndModel(defaultProviderAgent);

    expect(resolved.provider.id).toBe('qwen');
    expect(resolved.model).toBe('qwen3.7-plus');
  });

  it('does not route unsupported advertised placeholders as real AI', () => {
    useAuthStore.setState({
      apiKeys: { perplexity: 'sk-test' },
      defaultProvider: 'perplexity',
    });

    expect(() => resolveProviderAndModel(defaultProviderAgent)).toThrow(NoModelSelectedError);
  });

  it('forces offline mode through the explicitly selected local model only', () => {
    useAuthStore.setState({
      apiKeys: { google: 'cloud-key-that-must-not-be-used' },
      offlineMode: true,
      chatModelSelection: selectionFromOption('ollama', 'qwen3:4b'),
    });

    const resolved = resolveProviderAndModel(jarvis);
    expect(resolved.provider.id).toBe('ollama');
    expect(resolved.model).toBe('qwen3:4b');
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
    expect(ollamaRun).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'prompt_forge',
        agent: expect.objectContaining({
          model: { provider: 'ollama', model: 'qwen3:8b' },
        }),
      }),
    );
  });

  it('runs verified Model Foundry weights through the native local boundary', async () => {
    const chunks: Array<{ delta: string; first?: boolean; done?: boolean }> = [];
    const foundryAgent: Agent = {
      ...jarvis,
      id: 'agent_foundry' as Agent['id'],
      slug: 'release-adapter',
      model: { provider: 'ollama', model: 'foundry:job_12345' },
    };
    nativeInvoke
      .mockResolvedValueOnce({
        kind: 'weight',
        artifactId: 'job_12345',
        modelName: 'Release adapter',
        version: 2,
        method: 'lora',
      })
      .mockResolvedValueOnce({
        artifactId: 'job_12345',
        modelName: 'Release adapter',
        version: 2,
        method: 'lora',
        text: 'Verified local response',
        inputTokens: 11,
        outputTokens: 3,
      });

    const response = await runAgent({
      agent: foundryAgent,
      messages: [{ role: 'user', content: 'Review this release.' }],
      max_output_tokens: 300,
      onChunk: (chunk) => chunks.push(chunk),
    });

    expect(nativeInvoke).toHaveBeenNthCalledWith(2, 'model_foundry_chat', {
      requestId: expect.stringMatching(/^infer_[A-Za-z0-9_-]+$/),
      artifactId: 'job_12345',
      messages: [
        { role: 'system', content: 'You are Jarvis.' },
        { role: 'user', content: 'Review this release.' },
      ],
      maxOutputTokens: 300,
    });
    expect(response).toEqual({
      text: 'Verified local response',
      usage: { input_tokens: 11, output_tokens: 3, cost_usd: 0 },
      provider: 'ollama',
      model: 'foundry:job_12345',
      finish_reason: 'stop',
    });
    expect(chunks).toEqual([
      { delta: 'Verified local response', first: true },
      { delta: '', done: true },
    ]);
    expect(ollamaRun).not.toHaveBeenCalled();
  });

  it('cancels the exact native Model Foundry request when the caller aborts', async () => {
    const controller = new AbortController();
    let rejectInference: ((error: Error) => void) | undefined;
    nativeInvoke
      .mockResolvedValueOnce({
        kind: 'weight',
        artifactId: 'job_12345',
        modelName: 'Release adapter',
        version: 2,
        method: 'lora',
      })
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectInference = reject;
          }),
      )
      .mockResolvedValueOnce(true);
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
    await vi.waitFor(() => expect(rejectInference).toBeTypeOf('function'));
    controller.abort();
    await vi.waitFor(() =>
      expect(nativeInvoke).toHaveBeenCalledWith('model_foundry_cancel_chat', {
        requestId: expect.stringMatching(/^infer_[A-Za-z0-9_-]+$/),
      }),
    );
    rejectInference?.(new Error('native process stopped'));

    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
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

    expect(openaiRun).toHaveBeenCalledOnce();
    const request = openaiRun.mock.calls[0]![0];
    expect(request).toMatchObject({
      purpose: 'chat',
      systemPrompt: compiledPrompt.systemText,
      messages,
      signal: controller.signal,
      temperature: 0.2,
      max_output_tokens: 321,
      provider_options: { reasoning_effort: 'high' },
    });
    expect(request.messages).not.toBe(messages);
    expect(request.agent.model).toEqual(openaiAgent.model);
    expect(request.systemPrompt).not.toContain(openaiAgent.system_prompt);
    expect(request.onResponseObservation).toEqual(expect.any(Function));
    expect(request.onActionDispatch).toEqual(expect.any(Function));
  });

  it('sends one exact protected preamble through the selected CLI connection', async () => {
    const controller = new AbortController();
    const codexAgent: Agent = {
      ...openaiAgent,
      model: { provider: 'openai', model: 'gpt-5.6-sol' },
    };
    const messages = [
      { role: 'user' as const, content: '--option $(whoami); Unicode æ¡œ' },
      { role: 'assistant' as const, content: 'line one\nline two' },
    ];

    const response = await runAgent({
      agent: codexAgent,
      messages,
      connectionId: 'openai-codex',
      compiledPrompt,
      requestId: protectedAttempt.requestId,
      protectedAttempt,
      signal: controller.signal,
      workingDirectory: 'C:\\workspace with spaces',
    });

    const expectedPrompt = [
      `<VIBESPACE_SYSTEM_CONTRACT schema="1" sha256="${compiledPrompt.promptHash}">`,
      compiledPrompt.systemText,
      '</VIBESPACE_SYSTEM_CONTRACT>',
      '<VIBESPACE_MESSAGES>',
      JSON.stringify(messages),
      '</VIBESPACE_MESSAGES>',
    ].join('\n');
    expect(codexSend).toHaveBeenCalledOnce();
    expect(codexSend).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: protectedAttempt.requestId,
        connection: expect.objectContaining({ id: 'openai-codex', providerId: 'openai' }),
        prompt: expectedPrompt,
        modelId: codexAgent.model.model,
        systemPrompt: undefined,
        workingDirectory: 'C:\\workspace with spaces',
        signal: controller.signal,
        onResponseObservation: expect.any(Function),
        onActionDispatch: expect.any(Function),
      }),
    );
    expect(openaiRun).not.toHaveBeenCalled();
    expect(response.text).toBe('cli response');
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
    openaiRun.mockRejectedValueOnce(new Error('raw provider detail must not become evidence'));

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
    openaiRun.mockImplementationOnce(async (request) => {
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
    openaiRun.mockRejectedValueOnce(midstreamAbort);
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
