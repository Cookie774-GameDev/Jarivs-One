import type { ProviderId } from '@/types';
import {
  estimateInputTokens,
  llmContentToText,
  type LLMProvider,
  type LLMRequest,
  type LLMResponse,
} from '../types';
import {
  KERNEL_SMOKE_SCENARIOS,
  type KernelSmokeScenario,
  type KernelSmokeSemanticEvent,
} from '@/lib/jarvis/smoke/scenarios';

export const KERNEL_SMOKE_PROVIDER_ID = 'vibespace-kernel-smoke' as ProviderId;
export const KERNEL_SMOKE_BINDING_EVENT = 'vibespace:kernel-smoke-binding-changed';

export type KernelSmokeBindingEvidence = Readonly<{
  nativePid: number;
  cdpPort: number;
  profileSha256: string;
  nonce: string;
}>;

let trustedBinding: KernelSmokeBindingEvidence | undefined;
let liveEvidenceInvocation = 0;
let dispatchPath: 'protected' | 'unprotected' | undefined;

function notifyBindingChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(KERNEL_SMOKE_BINDING_EVENT));
}

export function subscribeKernelSmokeBinding(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(KERNEL_SMOKE_BINDING_EVENT, listener);
  return () => window.removeEventListener(KERNEL_SMOKE_BINDING_EVENT, listener);
}

export function subscribeKernelSmokeDispatchPath(listener: () => void): () => void {
  return subscribeKernelSmokeBinding(listener);
}

export function getKernelSmokeDispatchPath(): 'protected' | 'unprotected' | undefined {
  return dispatchPath;
}

/** @internal Records only the trusted router boundary classification for smoke dispatches. */
export function recordKernelSmokeRouterDispatch(
  path: 'protected' | 'unprotected',
): void {
  if (!trustedBinding) throw new Error('kernel_smoke_binding_unavailable');
  dispatchPath = path;
  notifyBindingChanged();
}

function isBindingEvidence(value: KernelSmokeBindingEvidence): boolean {
  return (
    Number.isSafeInteger(value.nativePid) &&
    value.nativePid > 0 &&
    Number.isSafeInteger(value.cdpPort) &&
    value.cdpPort > 0 &&
    value.cdpPort <= 65_535 &&
    /^[a-f0-9]{64}$/.test(value.profileSha256) &&
    value.nonce.length === 64 &&
    /^[a-f0-9]+$/.test(value.nonce)
  );
}

/** @internal Called only by the native-attested development binding host. */
export function activateKernelSmokeBinding(evidence: KernelSmokeBindingEvidence): void {
  if (!isBindingEvidence(evidence)) {
    trustedBinding = undefined;
    throw new Error('kernel_smoke_binding_invalid');
  }
  trustedBinding = Object.freeze({ ...evidence });
  notifyBindingChanged();
}

/** @internal Drops in-memory smoke authority on host cleanup or account teardown. */
export function clearKernelSmokeBinding(): void {
  trustedBinding = undefined;
  liveEvidenceInvocation = 0;
  dispatchPath = undefined;
  notifyBindingChanged();
}

function exactScenario(req: LLMRequest): KernelSmokeScenario | undefined {
  const lastUser = [...req.messages].reverse().find((message) => message.role === 'user');
  if (!lastUser) return undefined;
  const text = llmContentToText(lastUser.content);
  return Object.values(KERNEL_SMOKE_SCENARIOS).find(
    (scenario) => scenario.safeTextFixture === text,
  );
}

function abortError(): DOMException {
  return new DOMException('The kernel smoke provider request was aborted.', 'AbortError');
}

async function waitForAbort(signal: AbortSignal | undefined): Promise<never> {
  if (!signal) throw new Error('kernel_smoke_abort_signal_required');
  if (signal.aborted) throw abortError();
  await new Promise<void>((resolve) =>
    signal.addEventListener('abort', () => resolve(), { once: true }),
  );
  throw abortError();
}

function failureFor(event: Extract<KernelSmokeSemanticEvent, { kind: 'run_failed' }>): Error {
  return event.boundary === 'provider_failure'
    ? new Error('kernel_smoke_provider_failure')
    : new Error('kernel_smoke_transport_failure_before_first_response_byte');
}

function actionBlock(
  event: Extract<KernelSmokeSemanticEvent, { kind: 'action_requested' }>,
): string {
  return [
    '```action',
    JSON.stringify({
      id: event.actionId,
      params: event.parameters,
      rationale: 'Execute the fixed development smoke fixture.',
    }),
    '```',
  ].join('\n');
}

async function runScenario(req: LLMRequest, scenario: KernelSmokeScenario): Promise<LLMResponse> {
  if (scenario.id === 'live_evidence_restart' && ++liveEvidenceInvocation > 1) {
    await waitForAbort(req.signal);
  }
  let events = scenario.streams.provider.semanticEvents;
  if (scenario.id === 'schedule_transport_retry') {
    const attemptNumber = req.protectedAttempt?.attemptNumber;
    if (attemptNumber === 1) throw new Error('kernel_smoke_scheduled_transport_failure');
    if (attemptNumber !== 2) throw new Error('kernel_smoke_attempt_binding_invalid');
    events = events.slice(2);
  }
  let text = '';
  let first = true;
  let finishReason = 'stop';

  for (const event of events) {
    if (req.signal?.aborted) throw abortError();
    if (event.kind === 'abort_wait_started') await waitForAbort(req.signal);
    if (event.kind === 'run_failed') throw failureFor(event);
    if (event.kind === 'run_partial') finishReason = 'length';
    const delta =
      event.kind === 'text_delta'
        ? event.text
        : event.kind === 'action_requested'
          ? actionBlock(event)
          : undefined;
    if (delta === undefined) continue;

    req.onResponseObservation?.({ kind: 'sdk_chunk', observedAt: Date.now() });
    text += delta;
    req.onChunk?.({ delta, first });
    first = false;
  }

  req.onChunk?.({ delta: '', done: true });
  return {
    text,
    usage: {
      input_tokens: estimateInputTokens(
        req.messages.map((message) => llmContentToText(message.content)).join('\n'),
      ),
      output_tokens: estimateInputTokens(text),
      cost_usd: 0,
    },
    provider: KERNEL_SMOKE_PROVIDER_ID,
    model: req.agent.model.model || 'kernel-smoke-v1',
    finish_reason: finishReason,
  };
}

export const kernelSmokeProvider: LLMProvider = Object.freeze({
  id: KERNEL_SMOKE_PROVIDER_ID,
  name: 'VibeSpace Kernel Smoke',
  isAvailable: () => trustedBinding !== undefined,
  async run(req: LLMRequest): Promise<LLMResponse> {
    if (!trustedBinding) throw new Error('kernel_smoke_binding_unavailable');
    const scenario = exactScenario(req);
    if (!scenario) throw new Error('kernel_smoke_scenario_unrecognized');
    return runScenario(req, scenario);
  },
});
