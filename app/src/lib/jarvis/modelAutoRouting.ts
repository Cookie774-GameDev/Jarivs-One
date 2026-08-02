import type { ChatModelSelection } from '@/lib/ai/modelSelection';
import type { LLMMessage } from '@/lib/ai/types';
import { type JarvisModelCostClass, type JarvisModelSwitchCandidate } from './modelSwitchDecision';
import { deepFreezeJarvisCopy } from './requestEnvelope';

type SingleSelection = Extract<ChatModelSelection, { mode: 'single' }>;

export type JarvisAutomaticRoutingReason =
  | 'images'
  | 'tools'
  | 'context'
  | 'offline'
  | 'cost'
  | 'speed'
  | 'local'
  | 'balanced';

export type JarvisAutomaticRoutingDecision =
  | Readonly<{ status: 'disabled' }>
  | Readonly<{
      status: 'unchanged';
      reason: 'user_selection' | 'no_eligible_candidate' | 'already_optimal';
    }>
  | Readonly<{
      status: 'selected';
      target: SingleSelection;
      reason: JarvisAutomaticRoutingReason;
      message: string;
    }>;

export interface JarvisAutomaticRoutingInput {
  enabled: boolean;
  current: ChatModelSelection;
  candidates: readonly JarvisModelSwitchCandidate[];
  offlineMode: boolean;
  requirements: Readonly<{
    images?: boolean;
    tools?: boolean;
    estimatedContextTokens?: number;
  }>;
}

const COST_RANK: Readonly<Record<JarvisModelCostClass, number>> = Object.freeze({
  free: 0,
  low: 1,
  standard: 2,
  premium: 3,
  unknown: 4,
});
const MAX_ROUTING_CANDIDATES = 512;
const SAFE_PROVIDER_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SAFE_MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$/;
const SAFE_CONNECTION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const COST_METADATA_SOURCES = Object.freeze(
  new Set(['exact_rate_table', 'embedded_snapshot', 'local']),
);

function providerBoundTextLength(content: LLMMessage['content']): number {
  if (typeof content === 'string') return content.length;
  return content.reduce((total, part) => total + (part.type === 'text' ? part.text.length : 0), 0);
}

/**
 * A deliberately conservative context estimate: one token per text character,
 * plus one token of message framing. Image payload bytes are excluded because
 * vision eligibility is routed separately and providers tokenize images
 * differently.
 */
export function estimateAutomaticRoutingContextTokens(
  systemPrompt: string,
  messages: readonly LLMMessage[],
): number {
  return (
    systemPrompt.length +
    messages.reduce((total, message) => total + 1 + providerBoundTextLength(message.content), 0)
  );
}

function isLocal(selection: SingleSelection): boolean {
  return selection.providerId === 'ollama' || selection.providerId === 'local';
}

function sameSelection(left: SingleSelection, right: SingleSelection): boolean {
  return (
    left.providerId === right.providerId &&
    left.modelId === right.modelId &&
    left.connectionId === right.connectionId
  );
}

function candidateForSelection(
  candidates: readonly JarvisModelSwitchCandidate[],
  selection: ChatModelSelection,
): JarvisModelSwitchCandidate | undefined {
  if (selection.mode !== 'single') return undefined;
  return candidates
    .filter(
      (candidate) =>
        candidate.selection.providerId === selection.providerId &&
        candidate.selection.modelId === selection.modelId &&
        (!selection.connectionId || candidate.selection.connectionId === selection.connectionId),
    )
    .sort((left, right) => Number(right.preferred === true) - Number(left.preferred === true))[0];
}

function safeFinite(value: number | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function safeCandidates(
  candidates: readonly JarvisModelSwitchCandidate[],
): JarvisModelSwitchCandidate[] {
  return candidates
    .slice(0, MAX_ROUTING_CANDIDATES)
    .filter(
      (candidate) =>
        candidate?.selection?.mode === 'single' &&
        SAFE_PROVIDER_ID.test(candidate.selection.providerId) &&
        SAFE_MODEL_ID.test(candidate.selection.modelId) &&
        (candidate.selection.connectionId === undefined ||
          SAFE_CONNECTION_ID.test(candidate.selection.connectionId)) &&
        candidate.connected &&
        candidate.available &&
        Number.isFinite(candidate.codingRank) &&
        (candidate.speedRank === undefined || Number.isFinite(candidate.speedRank)) &&
        (candidate.contextWindowTokens === undefined ||
          (Number.isFinite(candidate.contextWindowTokens) && candidate.contextWindowTokens > 0)) &&
        (candidate.toolReliabilityRank === undefined ||
          (Number.isFinite(candidate.toolReliabilityRank) &&
            candidate.toolReliabilityRank >= 0 &&
            candidate.toolReliabilityRank <= 100)) &&
        ((candidate.maximumCostPerMillionUsd === undefined &&
          candidate.costMetadataSource === undefined) ||
          (typeof candidate.maximumCostPerMillionUsd === 'number' &&
            Number.isFinite(candidate.maximumCostPerMillionUsd) &&
            candidate.maximumCostPerMillionUsd >= 0 &&
            typeof candidate.costMetadataSource === 'string' &&
            COST_METADATA_SOURCES.has(candidate.costMetadataSource))) &&
        Object.hasOwn(COST_RANK, candidate.costClass),
    );
}

function stableCandidateKey(candidate: JarvisModelSwitchCandidate): string {
  const selection = candidate.selection;
  return `${selection.providerId}\u0000${selection.modelId}\u0000${selection.connectionId ?? ''}`;
}

function scoreCandidate(
  candidate: JarvisModelSwitchCandidate,
  current: ChatModelSelection,
  requirements: JarvisAutomaticRoutingInput['requirements'],
): number {
  const speed = Math.max(0, Math.min(100, safeFinite(candidate.speedRank, 50)));
  const cost = (4 - COST_RANK[candidate.costClass]) * 25;
  const tools = requirements.tools
    ? safeFinite(candidate.toolReliabilityRank, candidate.supportsTools ? 50 : 0) * 2
    : safeFinite(candidate.toolReliabilityRank) * 0.05;
  const context =
    requirements.estimatedContextTokens && candidate.contextWindowTokens
      ? Math.min(50, (candidate.contextWindowTokens / requirements.estimatedContextTokens) * 20)
      : 0;
  const stability =
    current.mode === 'single' && sameSelection(candidate.selection, current) ? 15 : 0;
  const preference = candidate.preferred ? 5 : 0;
  const local = isLocal(candidate.selection) ? 5 : 0;
  return speed + cost + tools + context + stability + preference + local;
}

function visibleReason(reason: JarvisAutomaticRoutingReason, modelId: string): string {
  switch (reason) {
    case 'images':
      return `Auto-selected ${modelId} because this request includes images.`;
    case 'tools':
      return `Auto-selected ${modelId} because this request needs reliable tool use.`;
    case 'context':
      return `Auto-selected ${modelId} because this request needs a larger context window.`;
    case 'offline':
      return `Auto-selected ${modelId} because offline mode requires a local model.`;
    case 'cost':
      return `Auto-selected ${modelId} to reduce the cost of this request.`;
    case 'speed':
      return `Auto-selected ${modelId} because it is the fastest eligible connected model.`;
    case 'local':
      return `Auto-selected ${modelId} to honor the local-model preference.`;
    case 'balanced':
      return `Auto-selected ${modelId} for the best eligible balance of speed, cost, context, and reliability.`;
  }
}

function selectionReason(
  input: JarvisAutomaticRoutingInput,
  currentCandidate: JarvisModelSwitchCandidate | undefined,
  target: JarvisModelSwitchCandidate,
): JarvisAutomaticRoutingReason {
  if (input.requirements.images && !currentCandidate?.supportsImages) return 'images';
  if (
    input.requirements.tools &&
    (!currentCandidate?.supportsTools ||
      safeFinite(target.toolReliabilityRank) > safeFinite(currentCandidate.toolReliabilityRank))
  ) {
    return 'tools';
  }
  const requiredContext = input.requirements.estimatedContextTokens;
  if (
    requiredContext &&
    target.contextWindowTokens &&
    (!currentCandidate?.contextWindowTokens ||
      currentCandidate.contextWindowTokens < requiredContext)
  ) {
    return 'context';
  }
  if (input.offlineMode && input.current.mode === 'single' && !isLocal(input.current)) {
    return 'offline';
  }
  if (
    currentCandidate?.maximumCostPerMillionUsd !== undefined &&
    target.maximumCostPerMillionUsd !== undefined &&
    target.maximumCostPerMillionUsd < currentCandidate.maximumCostPerMillionUsd
  ) {
    return 'cost';
  }
  if (currentCandidate && COST_RANK[target.costClass] < COST_RANK[currentCandidate.costClass]) {
    return 'cost';
  }
  if (currentCandidate && safeFinite(target.speedRank) > safeFinite(currentCandidate.speedRank)) {
    return 'speed';
  }
  if (isLocal(target.selection) && (input.current.mode !== 'single' || !isLocal(input.current))) {
    return 'local';
  }
  return 'balanced';
}

export function routeJarvisModelAutomatically(
  input: JarvisAutomaticRoutingInput,
): Readonly<JarvisAutomaticRoutingDecision> {
  if (!input.enabled) return Object.freeze({ status: 'disabled' });
  if (input.current.mode === 'hive') {
    return Object.freeze({ status: 'unchanged', reason: 'user_selection' });
  }

  const candidates = safeCandidates(input.candidates);
  const currentCandidate = candidateForSelection(candidates, input.current);
  const currentIsLocal = input.current.mode === 'single' && isLocal(input.current);
  const requiredContext =
    typeof input.requirements.estimatedContextTokens === 'number' &&
    Number.isFinite(input.requirements.estimatedContextTokens) &&
    input.requirements.estimatedContextTokens > 0
      ? input.requirements.estimatedContextTokens
      : undefined;
  const maximumCostClass =
    currentCandidate && currentCandidate.costClass !== 'unknown'
      ? COST_RANK[currentCandidate.costClass]
      : input.current.mode === 'none'
        ? COST_RANK.free
        : undefined;
  const maximumExactCost = currentCandidate?.maximumCostPerMillionUsd;

  const eligible = candidates.filter((candidate) => {
    if ((input.offlineMode || currentIsLocal) && !isLocal(candidate.selection)) {
      return false;
    }
    if (input.requirements.images && !candidate.supportsImages) return false;
    if (input.requirements.tools && !candidate.supportsTools) return false;
    if (
      requiredContext &&
      (!candidate.contextWindowTokens || candidate.contextWindowTokens < requiredContext)
    ) {
      return false;
    }
    if (
      maximumExactCost !== undefined &&
      (candidate.maximumCostPerMillionUsd === undefined ||
        candidate.maximumCostPerMillionUsd > maximumExactCost)
    ) {
      return false;
    }
    if (
      maximumExactCost === undefined &&
      maximumCostClass !== undefined &&
      COST_RANK[candidate.costClass] > maximumCostClass
    ) {
      return false;
    }
    if (maximumExactCost === undefined && maximumCostClass === undefined) {
      const isCurrent =
        input.current.mode === 'single' && sameSelection(candidate.selection, input.current);
      if (!isCurrent && candidate.costClass !== 'free') return false;
    }
    return true;
  });

  if (eligible.length === 0) {
    return Object.freeze({ status: 'unchanged', reason: 'no_eligible_candidate' });
  }

  const target = [...eligible].sort((left, right) => {
    const scoreDifference =
      scoreCandidate(right, input.current, input.requirements) -
      scoreCandidate(left, input.current, input.requirements);
    if (scoreDifference !== 0) return scoreDifference;
    const leftKey = stableCandidateKey(left);
    const rightKey = stableCandidateKey(right);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  })[0]!;

  if (input.current.mode === 'single' && sameSelection(target.selection, input.current)) {
    return Object.freeze({ status: 'unchanged', reason: 'already_optimal' });
  }

  const reason = selectionReason(input, currentCandidate, target);
  const modelId = target.selection.modelId.trim();
  return deepFreezeJarvisCopy({
    status: 'selected',
    target: target.selection,
    reason,
    message: visibleReason(reason, modelId),
  });
}
