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
import type {
  AiPurpose,
  LLMMessage,
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMResponseObservation,
  LLMStreamChunk,
} from './types';
import { agentUsesDefaultProvider } from './agentProviderOptions';
import { EMPTY_CHAT_MODEL_SELECTION } from './modelSelection';
import type {
  ProviderAdapter,
  ProviderCapabilities,
  ProviderConnection,
  ProviderEvent,
} from './adapters/types';
import { CONNECTION_MODEL_OPTIONS, getProviderConnectionDescriptor } from './adapters/catalog';
import { kernelSmokeCliAdapter } from './adapters/cliBridge';
import { llmContentToText } from './types';
import { runSubscriptionCliBridge } from './subscriptionCliBridge';
import { shouldDispatchOpenCodeThroughHarness } from './openCodeProductionTransport';
import { isKernelSmokeEnabled } from '@/lib/jarvis/smoke/config';
import {
  isKernelSmokeBindingActive,
  kernelSmokeProvider,
  KERNEL_SMOKE_PROVIDER_ID,
  recordKernelSmokeRouterDispatch,
} from './providers/kernelSmoke';
import {
  UnsupportedPromptTransportError,
  buildProviderPromptTransport,
} from './providerPromptTransport';
import {
  JarvisProviderAttemptFailureError,
  createJarvisProviderAttemptEvidenceAuthority,
} from './providerAttemptEvidence';
import { providerActivityTracker } from '@/features/taskbar-usage/activityTracker';
import { recordConnectionUsage } from './connectionUsageLedger';
import {
  LocalCloudEscalationRequiredError,
  planLocalCloudEscalation,
  readLocalAgentPreferences,
  type LocalInferenceFailure,
} from './localAgentRuntime';
import {
  artifactIdForAgent,
  prepareFoundryAgentRequest,
  runFoundryWeightArtifact,
} from '@/features/model-foundry/foundryRuntime';
import { openCodeRunAgentAdapter, type OpenCodeRunAgentInput } from './openCodeRunAgent';
import type { HarnessModelSelection } from '@/lib/harness/types';

export class NoModelSelectedError extends Error {
  constructor() {
    super('No model selected. Choose a model before sending.');
    this.name = 'NoModelSelectedError';
  }
}

const KERNEL_SMOKE_ENABLED = isKernelSmokeEnabled({
  devBuild: import.meta.env.DEV,
  explicitFlag: import.meta.env.VITE_SIK_SMOKE,
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

/** @internal Exact failure revalidation port for the closed Jarvis kernel runtime. */
export const jarvisProviderAttemptEvidenceRevalidator = Object.freeze({
  revalidateFailure: providerAttemptEvidenceAuthority.revalidateFailure.bind(
    providerAttemptEvidenceAuthority,
  ),
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

function subscriptionToolScope(
  connection: ProviderConnection,
  tools: Readonly<Record<string, boolean>> | undefined,
  requirements: ConnectionRequirements | undefined,
): Readonly<{
  tools?: Readonly<Record<string, boolean>>;
  requirements?: ConnectionRequirements;
}> {
  if (connection.id !== 'openai-codex' || connection.adapterId !== 'codex-cli') {
    return { tools, requirements };
  }
  const enabledTools = Object.entries(tools ?? {})
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);
  if (enabledTools.length === 1 && enabledTools[0] === 'vibespace_context') {
    return { tools: Object.freeze({ vibespace_context: true }), requirements };
  }
  if (!requirements) return {};
  const { tools: _tools, ...nonToolRequirements } = requirements;
  return Object.keys(nonToolRequirements).length === 0 ? {} : { requirements: nonToolRequirements };
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

type KernelSmokeCliConnectionArgs = {
  connection: ProviderConnection;
  adapter: ProviderAdapter;
  requestId: string;
  prompt: string;
  modelId?: string;
  systemPrompt?: string;
  reasoningEffort?: string;
  workingDirectory?: string;
  signal?: AbortSignal;
  requirements?: ConnectionRequirements;
  onChunk?: (chunk: LLMStreamChunk) => void;
  onResponseObservation?: (observation: LLMResponseObservation) => void;
  onActionDispatch?: (input: { observedAt: number }) => void;
};

async function runKernelSmokeCliConnection(
  args: KernelSmokeCliConnectionArgs,
): Promise<LLMResponse> {
  const { connection, adapter } = args;
  if (
    !KERNEL_SMOKE_ENABLED ||
    connection.providerId !== KERNEL_SMOKE_PROVIDER_ID ||
    adapter !== kernelSmokeCliAdapter ||
    connection.adapterId !== kernelSmokeCliAdapter.id ||
    connection.authSource !== 'debug-native-attestation' ||
    !isKernelSmokeBindingActive()
  ) {
    throw new Error('The debug-only kernel smoke CLI transport is unavailable.');
  }
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
  const exactModels = CONNECTION_MODEL_OPTIONS[connection.id];
  if (exactModels && args.modelId && !exactModels.some((model) => model.id === args.modelId)) {
    throw new Error(`${args.modelId} is unavailable for ${connection.displayName}`);
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
  const hasProtectedKernelSmokeAttestation = auth.status === 'unknown';
  if (auth.status !== 'authenticated' && !hasProtectedKernelSmokeAttestation) {
    throw new Error(`${connection.displayName} authentication could not be verified`);
  }
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

function resolveKernelSmokeProviderAndModel(
  connection: ProviderConnection,
  agent: Agent,
): { provider: LLMProvider; model: string } {
  if (
    !KERNEL_SMOKE_ENABLED ||
    agent.model.provider !== KERNEL_SMOKE_PROVIDER_ID ||
    connection.providerId !== KERNEL_SMOKE_PROVIDER_ID ||
    !kernelSmokeProvider.isAvailable()
  ) {
    throw new NoModelSelectedError();
  }
  return { provider: kernelSmokeProvider, model: agent.model.model };
}

function configuredCloudEscalationTarget(
  auth: ReturnType<typeof useAuthStore.getState>,
): Readonly<{ providerId: ProviderId; modelId: string }> | null {
  const candidates = [auth.defaultProvider, ...(Object.keys(auth.apiKeys) as ProviderId[]).sort()];
  for (const providerId of new Set(candidates)) {
    if (providerId === 'local' || providerId === 'ollama' || providerId === 'mock') continue;
    const modelId = auth.selectedModels[providerId]?.trim();
    if (modelId && auth.apiKeys[providerId]?.trim()) {
      return Object.freeze({ providerId, modelId });
    }
  }
  return null;
}

function classifyLocalFailure(error: unknown): LocalInferenceFailure {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(?:unsupported|not supported|capability unavailable)\b/iu.test(message)
    ? 'capability_unavailable'
    : 'inference_failed';
}

function resolveOpenCodeVariant(
  options: Readonly<Record<string, unknown>> | undefined,
): string | undefined {
  if (!options) return undefined;
  const candidates = [options.reasoning_effort, options.thinking_level].filter(
    (value): value is string => typeof value === 'string',
  );
  if (candidates.length === 0) return undefined;
  const unique = [...new Set(candidates)];
  if (unique.length !== 1) {
    throw new Error('OpenCode model variant is invalid or ambiguous.');
  }
  return unique[0];
}

export interface RunAgentRequest {
  agent: Agent;
  messages: LLMMessage[];
  /** Product surface using the shared router. Existing callers default to chat. */
  purpose?: AiPurpose;
  signal?: AbortSignal;
  onChunk?: (chunk: LLMStreamChunk) => void;
  temperature?: number;
  max_output_tokens?: number;
  provider_options?: Record<string, unknown>;
  /** Exact local connection selected for this call. Never inferred or substituted. */
  connectionId?: string;
  /** Stable chat scope used to reuse exactly one OpenCode session. */
  chatId?: string;
  /** Parent VibeSpace chat scope for user-facing multitask/subagent children. */
  parentChatId?: string;
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
  onApprovalRequested?: OpenCodeRunAgentInput['onApprovalRequested'];
  onHarnessSessionBound?: OpenCodeRunAgentInput['onSessionBound'];
  tools?: Readonly<Record<string, boolean>>;
}

function resolveOpenCodeSelection(req: RunAgentRequest): HarnessModelSelection {
  const auth = useAuthStore.getState();
  if (req.connectionId) {
    const connection = getProviderConnectionDescriptor(req.connectionId);
    if (!connection.enabled) {
      throw new Error(`Provider connection is disabled: ${req.connectionId}`);
    }
    if (auth.offlineMode && connection.mode !== 'local') throw new NoModelSelectedError();
    assertConnectionCapabilities(connection, req.connectionRequirements);
    const providerId = connection.mode === 'local' ? 'ollama' : connection.providerId;
    if (
      req.agent.model.provider !== providerId &&
      !(providerId === 'ollama' && req.agent.model.provider === 'local')
    ) {
      throw new Error(`Selected model does not match provider connection: ${req.connectionId}`);
    }
    return {
      providerId,
      modelId: req.agent.model.model,
      connectionId: connection.id,
      runtimeProviderId: providerId === 'bedrock' ? 'amazon-bedrock' : providerId,
    };
  }

  if (auth.offlineMode) {
    const selection = auth.chatModelSelection ?? EMPTY_CHAT_MODEL_SELECTION;
    if (
      selection.mode !== 'single' ||
      (selection.providerId !== 'ollama' && selection.providerId !== 'local')
    ) {
      throw new NoModelSelectedError();
    }
    return {
      providerId: 'ollama',
      runtimeProviderId: 'ollama',
      modelId: selection.modelId,
    };
  }

  const usesDefault =
    agentUsesDefaultProvider(req.agent.model.provider, req.agent.model.model) ||
    (req.agent.builtin &&
      req.agent.model.provider === 'mock' &&
      req.agent.model.model === 'mock-default');
  if (usesDefault) {
    const selection = auth.chatModelSelection ?? EMPTY_CHAT_MODEL_SELECTION;
    if (selection.mode !== 'single') throw new NoModelSelectedError();
    return {
      providerId: selection.providerId,
      modelId: selection.modelId,
      runtimeProviderId:
        selection.providerId === 'local'
          ? 'ollama'
          : selection.providerId === 'bedrock'
            ? 'amazon-bedrock'
            : selection.providerId,
    };
  }

  return {
    providerId: req.agent.model.provider,
    modelId: req.agent.model.model,
    runtimeProviderId:
      req.agent.model.provider === 'local'
        ? 'ollama'
        : req.agent.model.provider === 'bedrock'
          ? 'amazon-bedrock'
          : req.agent.model.provider,
  };
}

async function dispatchThroughOpenCode(req: RunAgentRequest): Promise<LLMResponse> {
  const protectedDispatch = req.compiledPrompt !== undefined;
  if (protectedDispatch) {
    if (!req.connectionId || !req.requestId || !req.protectedAttempt) {
      throw new Error('Protected provider dispatch requires exact connection and attempt binding.');
    }
    if (req.requestId !== req.protectedAttempt.requestId) {
      throw new Error('Protected provider request IDs do not match.');
    }
  }

  const exactConnection = req.connectionId
    ? getProviderConnectionDescriptor(req.connectionId)
    : undefined;
  if (
    exactConnection?.mode === 'external-cli' &&
    !shouldDispatchOpenCodeThroughHarness(exactConnection)
  ) {
    assertConnectionCapabilities(exactConnection, req.connectionRequirements);
    const toolScope = subscriptionToolScope(exactConnection, req.tools, req.connectionRequirements);
    const transport = req.compiledPrompt
      ? buildProviderPromptTransport({
          compiled: req.compiledPrompt,
          connection: exactConnection,
          messages: req.messages,
        })
      : undefined;
    const prompt =
      transport?.strategy === 'prefixed-preamble'
        ? transport.prompt
        : req.messages
            .map((message) => `${message.role}: ${llmContentToText(message.content)}`)
            .join('\n\n');
    const reasoningEffort = resolveOpenCodeVariant(req.provider_options);
    const dispatch = (hooks?: ProtectedAttemptHooks) =>
      runSubscriptionCliBridge({
        connection: exactConnection,
        requestId: req.requestId ?? globalThis.crypto?.randomUUID?.() ?? `req-${Date.now()}`,
        prompt,
        modelId: req.agent.model.model,
        reasoningEffort,
        workingDirectory: req.workingDirectory,
        signal: req.signal,
        requirements: toolScope.requirements,
        tools: toolScope.tools,
        onChunk: req.onChunk,
        onResponseObservation: hooks?.onResponseObservation,
        onActionDispatch: hooks?.onActionDispatch,
      });
    const response = protectedDispatch
      ? await runProtectedProviderAttempt(
          {
            ...req.protectedAttempt!,
            providerId: exactConnection.providerId,
            modelId: req.agent.model.model,
          },
          dispatch,
        )
      : await dispatch();
    useAgentStore
      .getState()
      .addTokens(
        req.agent.id,
        response.usage.input_tokens,
        response.usage.output_tokens,
        response.usage.cost_usd,
      );
    recordConnectionUsage({
      connectionId: exactConnection.id,
      providerId: response.provider,
      modelId: response.model,
      timestamp: Date.now(),
      inputTokens: response.usage.input_tokens,
      cachedInputTokens: 0,
      outputTokens: response.usage.output_tokens,
      costUsd: response.usage.cost_usd,
    });
    return response;
  }

  const selection = resolveOpenCodeSelection(req);
  const variant = resolveOpenCodeVariant(req.provider_options);
  const scopeId =
    req.chatId ??
    req.requestId ??
    req.protectedAttempt?.requestId ??
    globalThis.crypto?.randomUUID?.() ??
    `request-${Date.now()}`;
  const dispatch = (hooks?: ProtectedAttemptHooks) =>
    openCodeRunAgentAdapter.run({
      agent: req.agent,
      messages: req.messages,
      selection,
      variant,
      scopeId,
      parentScopeId: req.parentChatId,
      purpose: req.purpose ?? 'chat',
      signal: req.signal,
      onChunk: req.onChunk,
      workingDirectory: req.workingDirectory,
      compiledPrompt: req.compiledPrompt,
      onResponseObservation: hooks?.onResponseObservation,
      onActionDispatch: hooks?.onActionDispatch,
      onApprovalRequested: req.onApprovalRequested,
      onSessionBound: req.onHarnessSessionBound,
      tools: req.tools,
    });

  let response: LLMResponse;
  try {
    response = protectedDispatch
      ? await runProtectedProviderAttempt(
          {
            ...req.protectedAttempt!,
            providerId: selection.runtimeProviderId ?? selection.providerId,
            modelId: selection.modelId,
          },
          dispatch,
        )
      : await dispatch();
  } catch (error) {
    if (
      !protectedDispatch &&
      (selection.providerId === 'ollama' || selection.providerId === 'local') &&
      !isAbortError(error)
    ) {
      const auth = useAuthStore.getState();
      const preferences = readLocalAgentPreferences();
      const target = configuredCloudEscalationTarget(auth);
      if (target) {
        const messageChars = req.messages.reduce(
          (total, message) => total + llmContentToText(message.content).length,
          0,
        );
        const proposal = planLocalCloudEscalation({
          offlineMode: auth.offlineMode,
          enabled: preferences.cloudEscalationEnabled,
          failure: classifyLocalFailure(error),
          providerId: target.providerId,
          modelId: target.modelId,
          data: {
            messageChars,
            contextChars: 0,
            categories: ['prompt'],
          },
        });
        if (proposal.status === 'approval_required') {
          throw new LocalCloudEscalationRequiredError(proposal);
        }
      }
    }
    throw error;
  }

  useAgentStore
    .getState()
    .addTokens(
      req.agent.id,
      response.usage.input_tokens,
      response.usage.output_tokens,
      response.usage.cost_usd,
    );
  recordConnectionUsage({
    connectionId: selection.connectionId ?? selection.providerId,
    providerId: response.provider,
    modelId: response.model,
    timestamp: Date.now(),
    inputTokens: response.usage.input_tokens,
    cachedInputTokens: 0,
    outputTokens: response.usage.output_tokens,
    costUsd: response.usage.cost_usd,
  });
  return response;
}

/**
 * Public entry point used by the runtime and any caller that wants a one-shot
 * agent invocation. The agent object is treated as immutable input; the router
 * may construct a derived agent for the call but never mutates the original.
 */
async function runKernelSmokeDispatch(req: RunAgentRequest): Promise<LLMResponse> {
  if (!KERNEL_SMOKE_ENABLED || req.agent.model.provider !== KERNEL_SMOKE_PROVIDER_ID) {
    throw new Error('The debug-only kernel smoke dispatch is unavailable.');
  }
  if (req.signal?.aborted) {
    throw new DOMException('The request was aborted.', 'AbortError');
  }

  const protectedDispatch = req.compiledPrompt !== undefined;
  let foundryBaseModel: string | null = null;
  let foundryWeight:
    | Awaited<ReturnType<typeof prepareFoundryAgentRequest>>['weightArtifact']
    | null = null;
  if (artifactIdForAgent(req.agent)) {
    if (protectedDispatch) {
      throw new Error('Model Foundry artifacts cannot replace a protected provider binding.');
    }
    const { invoke } = await import('@tauri-apps/api/core');
    const prepared = await prepareFoundryAgentRequest({
      agent: req.agent,
      messages: req.messages,
      invoke,
    });
    req = { ...req, agent: prepared.agent };
    foundryBaseModel = prepared.agent.model.model;
    foundryWeight = prepared.weightArtifact;
    if (foundryWeight) {
      const originalModel = req.agent.model.model;
      const requestId =
        `infer_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random()}`}`
          .replace(/[^A-Za-z0-9_-]/g, '_')
          .slice(0, 80);
      const cancel = () => {
        void invoke('model_foundry_cancel_chat', { requestId }).catch(() => undefined);
      };
      req.signal?.addEventListener('abort', cancel, { once: true });
      let response: Awaited<ReturnType<typeof runFoundryWeightArtifact>>;
      try {
        response = await runFoundryWeightArtifact({
          artifact: foundryWeight,
          requestId,
          agent: req.agent,
          messages: req.messages,
          maxOutputTokens: req.max_output_tokens,
          invoke,
        });
      } catch (error) {
        if (req.signal?.aborted) {
          throw new DOMException('The request was aborted.', 'AbortError');
        }
        throw error;
      } finally {
        req.signal?.removeEventListener('abort', cancel);
      }
      if (req.signal?.aborted) {
        throw new DOMException('The request was aborted.', 'AbortError');
      }
      req.onChunk?.({ delta: response.text, first: true });
      req.onChunk?.({ delta: '', done: true });
      const usage = {
        input_tokens: response.inputTokens,
        output_tokens: response.outputTokens,
        cost_usd: 0,
      };
      useAgentStore
        .getState()
        .addTokens(req.agent.id, usage.input_tokens, usage.output_tokens, usage.cost_usd);
      return {
        text: response.text,
        usage,
        provider: 'ollama',
        model: originalModel,
        finish_reason: 'stop',
      };
    }
  }
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
    const exactModels = CONNECTION_MODEL_OPTIONS[connection.id];
    if (
      exactModels &&
      !exactModels.some((modelOption) => modelOption.id === req.agent.model.model)
    ) {
      throw new Error(`${req.agent.model.model} is unavailable for ${connection.displayName}`);
    }
    if (protectedDispatch) {
      protectedTransport = buildProviderPromptTransport({
        compiled: req.compiledPrompt!,
        connection,
        messages: req.messages,
      });
    }
    if (connection.providerId === KERNEL_SMOKE_PROVIDER_ID) {
      recordKernelSmokeRouterDispatch(protectedDispatch ? 'protected' : 'unprotected');
    }
    if (connection.mode === 'external-cli') {
      if (
        connection.providerId !== KERNEL_SMOKE_PROVIDER_ID ||
        connection.adapterId !== kernelSmokeCliAdapter.id
      ) {
        throw new Error('The debug-only kernel smoke CLI transport is unavailable.');
      }
      const adapter = kernelSmokeCliAdapter;
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
        runKernelSmokeCliConnection({
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
      recordConnectionUsage({
        connectionId: connection.id,
        providerId: connection.providerId,
        modelId: req.agent.model.model,
        timestamp: Date.now(),
        inputTokens: response.usage.input_tokens,
        cachedInputTokens: 0,
        outputTokens: response.usage.output_tokens,
        costUsd: response.usage.cost_usd,
      });
      return response;
    }
  }
  const resolvedProvider =
    selectedConnection === undefined
      ? { provider: kernelSmokeProvider, model: req.agent.model.model }
      : resolveKernelSmokeProviderAndModel(selectedConnection, req.agent);
  const provider = resolvedProvider.provider;
  const model = foundryBaseModel ?? resolvedProvider.model;

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

  const wrappedOnChunk = req.onChunk
    ? (chunk: LLMStreamChunk) => {
        req.onChunk!(chunk);
      }
    : undefined;

  const llmReq: LLMRequest = {
    purpose: req.purpose ?? 'chat',
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
    ...(protectedDispatch ? { protectedAttempt: req.protectedAttempt } : {}),
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
    response = await provider.run(llmReq);
  }

  useAgentStore
    .getState()
    .addTokens(
      req.agent.id,
      response.usage.input_tokens,
      response.usage.output_tokens,
      response.usage.cost_usd,
    );
  recordConnectionUsage({
    connectionId: selectedConnection?.id ?? provider.id,
    providerId: provider.id,
    modelId: model,
    timestamp: Date.now(),
    inputTokens: response.usage.input_tokens,
    cachedInputTokens: 0,
    outputTokens: response.usage.output_tokens,
    costUsd: response.usage.cost_usd,
  });

  return response;
}

async function runAgentDispatch(req: RunAgentRequest): Promise<LLMResponse> {
  if (req.signal?.aborted) {
    throw new DOMException('The request was aborted.', 'AbortError');
  }
  if (KERNEL_SMOKE_ENABLED && req.agent.model.provider === KERNEL_SMOKE_PROVIDER_ID) {
    return runKernelSmokeDispatch(req);
  }
  return dispatchThroughOpenCode(req);
}

export async function runAgent(req: RunAgentRequest): Promise<LLMResponse> {
  const activityId = req.connectionId ?? req.agent.model.provider;
  const completeActivity = providerActivityTracker.begin(activityId);
  try {
    return await runAgentDispatch(req);
  } finally {
    completeActivity();
  }
}
