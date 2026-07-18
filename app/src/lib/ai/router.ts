/**
 * Provider router. One public entry point - `runAgent` - that:
 *   1. Picks the right provider based on the agent's model spec and the
 *      user's explicit chat model selection (no hidden fallbacks).
 *   2. Streams chunks through to the caller's onChunk.
 *   3. Surfaces real-provider errors instead of disguising them as mock output.
 *   4. Updates the per-agent token + cost meter via `useAgentStore.addTokens`.
 *
 * Cancellation is honored throughout - if the caller's signal aborts mid-run,
 * the provider stops streaming and the router rethrows AbortError without
 * trying to fall back.
 */
import type { Agent, ProviderId } from '@/types';
import type { CompiledJarvisPrompt } from '@/lib/jarvis/contracts';
import { useAuthStore } from '@/stores/auth';
import { useAgentStore } from '@/stores/agents';
import { toast } from '@/components/ui/toast';
import { devConsole } from '@/features/dev-console';
import type {
  LLMMessage,
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMResponseObservation,
  LLMStreamChunk,
} from './types';
import { mockProvider } from './providers/mock';
import { anthropicProvider } from './providers/anthropic';
import { openaiProvider } from './providers/openai';
import { googleProvider } from './providers/google';
import { groqProvider } from './providers/groq';
import { ollamaProvider } from './providers/ollama';
import {
  openrouterProvider,
  deepseekProvider,
  mistralProvider,
  togetherProvider,
  xaiProvider,
} from './providers/compatibleInstances';
import { agentUsesDefaultProvider } from './agentProviderOptions';
import { EMPTY_CHAT_MODEL_SELECTION } from './modelSelection';
import type {
  ProviderAdapter,
  ProviderCapabilities,
  ProviderConnection,
  ProviderEvent,
} from './adapters/types';
import { getProviderConnectionDescriptor } from './adapters/catalog';
import { codexCliAdapter } from './adapters/codex';
import { claudeCliAdapter } from './adapters/claude';
import { geminiCliAdapter } from './adapters/gemini';
import { copilotCliAdapter } from './adapters/copilot';
import { qwenCliAdapter } from './adapters/qwen';
import { openCodeCliAdapter } from './adapters/opencode';
import { llmContentToText } from './types';
import {
  UnsupportedPromptTransportError,
  buildProviderPromptTransport,
} from './providerPromptTransport';
import {
  JarvisProviderAttemptFailureError,
  createJarvisProviderAttemptEvidenceAuthority,
} from './providerAttemptEvidence';

export class NoModelSelectedError extends Error {
  constructor() {
    super('No model selected. Choose a model before sending.');
    this.name = 'NoModelSelectedError';
  }
}

const providers: Record<ProviderId, LLMProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  google: googleProvider,
  groq: groqProvider,
  mock: mockProvider,
  local: ollamaProvider,
  xai: xaiProvider,
  openrouter: openrouterProvider,
  deepseek: deepseekProvider,
  mistral: mistralProvider,
  together: togetherProvider,
  ollama: ollamaProvider,
  cohere: mockProvider,
  perplexity: mockProvider,
  fireworks: mockProvider,
  replicate: mockProvider,
  hyperbolic: mockProvider,
  novita: mockProvider,
  lambda: mockProvider,
  azure: mockProvider,
  cerebras: mockProvider,
  huggingface: mockProvider,
  bedrock: mockProvider,
};

const externalAdapters: Readonly<Record<string, ProviderAdapter>> = Object.freeze({
  [codexCliAdapter.id]: codexCliAdapter,
  [claudeCliAdapter.id]: claudeCliAdapter,
  [geminiCliAdapter.id]: geminiCliAdapter,
  [copilotCliAdapter.id]: copilotCliAdapter,
  [qwenCliAdapter.id]: qwenCliAdapter,
  [openCodeCliAdapter.id]: openCodeCliAdapter,
});

async function sha256Hex(canonical: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const providerAttemptEvidenceAuthority = createJarvisProviderAttemptEvidenceAuthority({
  sha256: sha256Hex,
});

type ProtectedAttemptBinding = Readonly<{
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
  providerId: string;
  modelId: string;
}>;

type ProtectedAttemptHooks = Readonly<{
  onResponseObservation: (observation: LLMResponseObservation) => void;
  onActionDispatch: (input: { observedAt: number }) => void;
}>;

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError')
  );
}

async function runProtectedProviderAttempt<T>(
  binding: ProtectedAttemptBinding,
  dispatch: (hooks: ProtectedAttemptHooks) => Promise<T>,
): Promise<T> {
  const tracker = providerAttemptEvidenceAuthority.begin(binding);
  const hooks: ProtectedAttemptHooks = Object.freeze({
    onResponseObservation: (observation) => {
      providerAttemptEvidenceAuthority.noteResponseObservation(tracker, observation);
    },
    onActionDispatch: (input) => {
      providerAttemptEvidenceAuthority.noteActionDispatch(tracker, input);
    },
  });
  try {
    const result = await dispatch(hooks);
    providerAttemptEvidenceAuthority.complete(tracker);
    return result;
  } catch (error) {
    if (isAbortError(error)) {
      providerAttemptEvidenceAuthority.complete(tracker);
      throw error;
    }
    const classification = await providerAttemptEvidenceAuthority.classifyFailure(tracker, {
      failureCategory: 'provider_transport_failure',
      failedAt: Date.now(),
    });
    throw new JarvisProviderAttemptFailureError(classification);
  }
}

export interface ConnectionRequirements {
  images?: boolean;
  files?: boolean;
  tools?: boolean;
}

function assertConnectionCapabilities(
  connection: ProviderConnection,
  requirements: ConnectionRequirements = {},
): void {
  const checks: Array<[keyof ProviderCapabilities, boolean | undefined, string]> = [
    ['images', requirements.images, 'image attachments'],
    ['files', requirements.files, 'file attachments'],
    ['tools', requirements.tools, 'tools'],
  ];
  for (const [capability, required, label] of checks) {
    if (required && !connection.capabilities[capability]) {
      throw new Error(`${connection.displayName} does not support ${label}`);
    }
  }
}

function usageNumber(value: { value?: number } | undefined): number {
  return typeof value?.value === 'number' && Number.isFinite(value.value) ? value.value : 0;
}

/** Exact, fail-closed external bridge seam. Exported so routing can be tested without Tauri. */
export async function runExternalConnection(args: {
  connection: ProviderConnection;
  adapter: ProviderAdapter;
  requestId: string;
  prompt: string;
  modelId?: string;
  systemPrompt?: string;
  workingDirectory?: string;
  signal?: AbortSignal;
  requirements?: ConnectionRequirements;
  onChunk?: (chunk: LLMStreamChunk) => void;
  onResponseObservation?: (observation: LLMResponseObservation) => void;
  onActionDispatch?: (input: { observedAt: number }) => void;
}): Promise<LLMResponse> {
  const { connection, adapter } = args;
  if (args.signal?.aborted) throw new DOMException('The request was aborted.', 'AbortError');
  if (connection.promptTransport === 'unsupported') {
    throw new UnsupportedPromptTransportError(connection.id);
  }
  if (!connection.enabled) throw new Error(`Provider connection is disabled: ${connection.id}`);
  if (connection.mode !== 'external-cli') {
    throw new Error(`Provider connection is not an external agent: ${connection.id}`);
  }
  if (adapter.id !== connection.adapterId) {
    throw new Error(`Provider adapter mismatch for connection: ${connection.id}`);
  }
  assertConnectionCapabilities(connection, args.requirements);
  if (!adapter.send) throw new Error(`${connection.displayName} cannot send requests`);

  const detection = adapter.detect ? await adapter.detect() : { status: 'unavailable' as const };
  if (detection.status !== 'available') {
    throw new Error(`${connection.displayName} is unavailable`);
  }
  const auth = adapter.probeAuth
    ? await adapter.probeAuth(connection)
    : { status: 'unknown' as const };
  if (auth.status === 'unauthenticated') throw new Error(`${connection.displayName} is signed out`);
  if (args.signal?.aborted) throw new DOMException('The request was aborted.', 'AbortError');

  let text = '';
  let first = true;
  let finishReason: string | undefined;
  let usage: Extract<ProviderEvent, { type: 'usage' }>['usage'] | undefined;
  for await (const event of adapter.send({
    requestId: args.requestId,
    connection,
    prompt: args.prompt,
    modelId: args.modelId,
    systemPrompt: args.systemPrompt,
    workingDirectory: args.workingDirectory,
    signal: args.signal,
    onResponseObservation: args.onResponseObservation,
    onActionDispatch: args.onActionDispatch,
  })) {
    if (args.signal?.aborted) {
      throw new DOMException('The request was aborted.', 'AbortError');
    }
    if (event.type === 'text') {
      text += event.delta;
      args.onChunk?.({ delta: event.delta, first });
      first = false;
    } else if (event.type === 'usage') {
      usage = event.usage;
    } else if (event.type === 'error') {
      throw new Error(event.message);
    } else if (event.type === 'done') {
      finishReason = event.finishReason;
    }
  }
  if (args.signal?.aborted) {
    throw new DOMException('The request was aborted.', 'AbortError');
  }
  args.onChunk?.({ delta: '', done: true });
  return {
    text,
    usage: {
      input_tokens: usageNumber(usage?.inputTokens),
      output_tokens: usageNumber(usage?.outputTokens),
      cost_usd: usageNumber(usage?.costUsd),
    },
    provider: connection.providerId as ProviderId,
    model: args.modelId ?? connection.modelId ?? connection.displayName,
    ...(finishReason ? { finish_reason: finishReason } : {}),
  };
}

function resolveExplicitSingleSelection(auth: ReturnType<typeof useAuthStore.getState>): {
  provider: LLMProvider;
  model: string;
} {
  const sel = auth.chatModelSelection ?? EMPTY_CHAT_MODEL_SELECTION;
  if (sel.mode !== 'single') throw new NoModelSelectedError();
  const p = providers[sel.providerId];
  if (!p?.isAvailable()) throw new NoModelSelectedError();
  return { provider: p, model: sel.modelId };
}

function resolveLocalSelection(auth: ReturnType<typeof useAuthStore.getState>): {
  provider: LLMProvider;
  model: string;
} {
  const sel = auth.chatModelSelection ?? EMPTY_CHAT_MODEL_SELECTION;
  if (sel.mode !== 'single') throw new NoModelSelectedError();
  if (sel.providerId !== 'ollama' && sel.providerId !== 'local') {
    throw new NoModelSelectedError();
  }
  if (!ollamaProvider.isAvailable()) throw new NoModelSelectedError();
  return { provider: ollamaProvider, model: sel.modelId };
}

/**
 * Decide which provider + model actually handles this call.
 *
 * The agent's model spec is authoritative for pinned agents. Jarvis and
 * default-provider agents are overridden at runtime via `applyChatModelSelectionToAgent`
 * before this is called. No silent provider fallbacks — missing selection throws.
 */
export function resolveProviderAndModel(agent: Agent): { provider: LLMProvider; model: string } {
  const auth = useAuthStore.getState();

  if (auth.offlineMode) {
    return resolveLocalSelection(auth);
  }

  const provId = agent.model.provider;
  const usesDefault =
    agentUsesDefaultProvider(provId, agent.model.model) ||
    (agent.builtin && provId === 'mock' && agent.model.model === 'mock-default');

  if (usesDefault) {
    return resolveExplicitSingleSelection(auth);
  }

  if (provId === 'local' || provId === 'ollama') {
    return resolveLocalSelection(auth);
  }

  if (provId !== 'mock') {
    const p = providers[provId];
    if (p?.isAvailable()) {
      return { provider: p, model: agent.model.model };
    }
    throw new NoModelSelectedError();
  }

  if (mockProvider.isAvailable()) {
    return { provider: mockProvider, model: agent.model.model || 'mock-default' };
  }
  throw new NoModelSelectedError();
}

/**
 * Public entry point used by the runtime and any caller that wants a one-shot
 * agent invocation. The agent object is treated as immutable input; the router
 * may construct a derived agent for the call but never mutates the original.
 */
export async function runAgent(req: {
  agent: Agent;
  messages: LLMMessage[];
  signal?: AbortSignal;
  onChunk?: (chunk: LLMStreamChunk) => void;
  temperature?: number;
  max_output_tokens?: number;
  provider_options?: Record<string, unknown>;
  /** Exact local connection selected for this chat. Never inferred or substituted. */
  connectionId?: string;
  connectionRequirements?: ConnectionRequirements;
  workingDirectory?: string;
  compiledPrompt?: Readonly<CompiledJarvisPrompt>;
  requestId?: string;
  protectedAttempt?: Readonly<{
    accountId: string;
    runId: string;
    requestId: string;
    attemptNumber: number;
  }>;
}): Promise<LLMResponse> {
  if (req.signal?.aborted) {
    throw new DOMException('The request was aborted.', 'AbortError');
  }

  const protectedDispatch = req.compiledPrompt !== undefined;
  if (protectedDispatch) {
    if (!req.connectionId || !req.requestId || !req.protectedAttempt) {
      throw new Error('Protected provider dispatch requires exact connection and attempt binding.');
    }
    if (req.requestId !== req.protectedAttempt.requestId) {
      throw new Error('Protected provider request IDs do not match.');
    }
  }

  const connectionId = req.connectionId;
  let selectedConnection: ProviderConnection | undefined;
  let protectedTransport: ReturnType<typeof buildProviderPromptTransport> | undefined;
  if (connectionId) {
    const connection = getProviderConnectionDescriptor(connectionId);
    selectedConnection = connection;
    if (!connection.enabled) throw new Error(`Provider connection is disabled: ${connectionId}`);
    assertConnectionCapabilities(connection, req.connectionRequirements);
    const expectedProvider = connection.mode === 'local' ? 'ollama' : connection.providerId;
    if (
      req.agent.model.provider !== expectedProvider &&
      !(connection.mode === 'local' && req.agent.model.provider === 'local')
    ) {
      throw new Error(`Selected model does not match provider connection: ${connectionId}`);
    }
    if (protectedDispatch) {
      protectedTransport = buildProviderPromptTransport({
        compiled: req.compiledPrompt!,
        connection,
        messages: req.messages,
      });
    }
    if (connection.mode === 'external-cli') {
      const adapter = externalAdapters[connection.adapterId];
      if (!adapter) throw new Error(`Provider adapter is unavailable: ${connection.adapterId}`);
      const prompt = protectedDispatch
        ? protectedTransport?.strategy === 'prefixed-preamble'
          ? protectedTransport.prompt
          : (() => {
              throw new Error('Protected external provider transport is invalid.');
            })()
        : req.messages
            .map((message) => `${message.role}: ${llmContentToText(message.content)}`)
            .join('\n\n');
      const dispatchExternal = (hooks?: ProtectedAttemptHooks) =>
        runExternalConnection({
          connection,
          adapter,
          requestId: req.requestId ?? globalThis.crypto?.randomUUID?.() ?? `req-${Date.now()}`,
          prompt,
          modelId: req.agent.model.model,
          systemPrompt: protectedDispatch ? undefined : req.agent.system_prompt,
          workingDirectory: req.workingDirectory,
          signal: req.signal,
          requirements: req.connectionRequirements,
          onChunk: req.onChunk,
          onResponseObservation: hooks?.onResponseObservation,
          onActionDispatch: hooks?.onActionDispatch,
        });
      const response = protectedDispatch
        ? await runProtectedProviderAttempt(
            {
              ...req.protectedAttempt!,
              providerId: connection.providerId,
              modelId: req.agent.model.model,
            },
            dispatchExternal,
          )
        : await dispatchExternal();
      useAgentStore
        .getState()
        .addTokens(
          req.agent.id,
          response.usage.input_tokens,
          response.usage.output_tokens,
          response.usage.cost_usd,
        );
      return response;
    }
  }
  const { provider, model } = resolveProviderAndModel(req.agent);

  if (protectedDispatch) {
    if (!selectedConnection || selectedConnection.mode === 'external-cli') {
      throw new Error('Protected native provider connection is missing.');
    }
    if (provider.id !== selectedConnection.providerId || model !== req.agent.model.model) {
      throw new Error('Protected provider selection changed before dispatch.');
    }
    if (protectedTransport?.strategy !== 'native-system') {
      throw new Error('Protected native provider transport is invalid.');
    }
  }

  const effectiveAgent: Agent =
    provider.id === req.agent.model.provider && model === req.agent.model.model
      ? req.agent
      : { ...req.agent, model: { ...req.agent.model, provider: provider.id, model } };

  let emittedAny = false;
  const wrappedOnChunk = req.onChunk
    ? (chunk: LLMStreamChunk) => {
        if (chunk.delta && chunk.delta.length > 0) emittedAny = true;
        req.onChunk!(chunk);
      }
    : undefined;

  const llmReq: LLMRequest = {
    agent: effectiveAgent,
    messages:
      protectedTransport?.strategy === 'native-system'
        ? [...protectedTransport.messages]
        : req.messages,
    ...(protectedTransport?.strategy === 'native-system'
      ? { systemPrompt: protectedTransport.systemPrompt }
      : {}),
    signal: req.signal,
    onChunk: wrappedOnChunk,
    temperature: req.temperature,
    max_output_tokens: req.max_output_tokens,
    provider_options: req.provider_options,
  };

  let response: LLMResponse;
  if (protectedDispatch) {
    response = await runProtectedProviderAttempt(
      {
        ...req.protectedAttempt!,
        providerId: selectedConnection!.providerId,
        modelId: model,
      },
      (hooks) =>
        provider.run({
          ...llmReq,
          onResponseObservation: hooks.onResponseObservation,
          onActionDispatch: hooks.onActionDispatch,
        }),
    );
  } else {
    try {
      response = await provider.run(llmReq);
    } catch (err) {
      if (isAbortError(err)) throw err;

      if (provider.id === 'mock') throw err;
      if (emittedAny) throw err;

      const reason = err instanceof Error ? err.message : String(err);
      toast.warning(`Provider ${provider.name} failed`, reason.slice(0, 240));
      devConsole.log({
        channel: 'ai',
        level: 'warn',
        message: `AI provider failed: ${provider.id}`,
        detail: {
          agent: req.agent.slug,
          provider: provider.id,
          model,
          reason: reason.slice(0, 500),
        },
      });

      throw err;
    }
  }

  useAgentStore
    .getState()
    .addTokens(
      req.agent.id,
      response.usage.input_tokens,
      response.usage.output_tokens,
      response.usage.cost_usd,
    );

  return response;
}
