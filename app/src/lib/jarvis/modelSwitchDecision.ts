import type { ChatModelSelection } from '@/lib/ai/modelSelection';
import type { ProviderId } from '@/types';
import { deepFreezeJarvisCopy } from './requestEnvelope';

type SingleModelSelection = Extract<ChatModelSelection, { mode: 'single' }>;

export type JarvisModelCostClass = 'free' | 'low' | 'standard' | 'premium' | 'unknown';

export type JarvisModelSwitchIntent =
  | Readonly<{ kind: 'provider'; providerId: ProviderId }>
  | Readonly<{ kind: 'local' }>
  | Readonly<{ kind: 'strongest_coding' }>
  | Readonly<{ kind: 'cheapest_capable' }>
  | Readonly<{ kind: 'switch_back' }>;

export interface JarvisModelSwitchCandidate {
  selection: SingleModelSelection;
  preferred?: boolean;
  connected: boolean;
  available: boolean;
  supportsImages: boolean;
  supportsTools: boolean;
  codingRank: number;
  costClass: JarvisModelCostClass;
}

export interface JarvisModelSwitchDecisionInput {
  intent: JarvisModelSwitchIntent;
  current: ChatModelSelection;
  previous?: ChatModelSelection;
  candidates: readonly JarvisModelSwitchCandidate[];
  offlineMode: boolean;
  requirements: Readonly<{ images?: boolean; tools?: boolean }>;
  policyRequiresApproval: boolean;
}

type JarvisModelSwitchFailureReason =
  | 'target_not_configured'
  | 'no_previous_selection'
  | 'provider_not_connected'
  | 'model_unavailable'
  | 'required_capability_unavailable'
  | 'offline_mode';

export type JarvisModelSwitchApprovalReason =
  | 'local_to_cloud'
  | 'cost_increase'
  | 'cost_unknown'
  | 'policy';

export type JarvisModelSwitchDecision =
  | Readonly<{
      status: 'not_configured' | 'not_connected' | 'unavailable';
      reason: JarvisModelSwitchFailureReason;
    }>
  | Readonly<{ status: 'already_selected'; target: SingleModelSelection }>
  | Readonly<{
      status: 'approval_required';
      target: SingleModelSelection;
      reasons: readonly JarvisModelSwitchApprovalReason[];
    }>
  | Readonly<{ status: 'ready'; target: SingleModelSelection }>;

const COST_RANK: Readonly<Record<JarvisModelCostClass, number>> = Object.freeze({
  free: 0,
  low: 1,
  standard: 2,
  premium: 3,
  unknown: 4,
});

function frozenIntent(intent: JarvisModelSwitchIntent): Readonly<JarvisModelSwitchIntent> {
  return deepFreezeJarvisCopy(intent);
}

export function parseJarvisModelSwitchIntent(
  raw: string,
): Readonly<JarvisModelSwitchIntent> | null {
  const text = raw
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[.!?]+\s*$/u, '')
    .trim();
  if (/^(?:switch(?: me)? to|use)\s+gemini(?:\s+for\s+this)?$/i.test(text)) {
    return frozenIntent({ kind: 'provider', providerId: 'google' });
  }
  if (/^(?:switch(?: me)? to|use)\s+grok(?:\s+for\s+this)?$/i.test(text)) {
    return frozenIntent({ kind: 'provider', providerId: 'xai' });
  }
  if (/^(?:switch(?: me)? to|use)\s+(?:a\s+)?local model$/i.test(text)) {
    return frozenIntent({ kind: 'local' });
  }
  if (/^(?:switch(?: me)? to|use)\s+the strongest coding model$/i.test(text)) {
    return frozenIntent({ kind: 'strongest_coding' });
  }
  if (
    /^(?:switch(?: me)? to|use)\s+the cheapest model(?:\s+that\s+can\s+handle\s+this)?$/i.test(text)
  ) {
    return frozenIntent({ kind: 'cheapest_capable' });
  }
  if (/^switch back$/i.test(text)) return frozenIntent({ kind: 'switch_back' });
  return null;
}

function isLocalProvider(providerId: ProviderId): boolean {
  return providerId === 'ollama' || providerId === 'local';
}

function copySelection(selection: SingleModelSelection): SingleModelSelection {
  const base = {
    mode: 'single' as const,
    providerId: selection.providerId,
    modelId: selection.modelId.trim(),
  };
  if (!selection.connectionId) return base;
  return {
    ...base,
    connectionId: selection.connectionId,
    connectionMode: selection.connectionMode,
    authSource: selection.authSource,
    capabilities: { ...selection.capabilities },
  };
}

function stableCandidateKey(candidate: JarvisModelSwitchCandidate): string {
  const selection = candidate.selection;
  return `${selection.providerId}\u0000${selection.modelId}\u0000${selection.connectionId ?? ''}`;
}

function safeCandidates(
  candidates: readonly JarvisModelSwitchCandidate[],
): JarvisModelSwitchCandidate[] {
  return candidates.filter(
    (candidate) =>
      candidate?.selection?.mode === 'single' &&
      candidate.selection.modelId.trim().length > 0 &&
      Number.isFinite(candidate.codingRank) &&
      Object.hasOwn(COST_RANK, candidate.costClass),
  );
}

function candidatesForIntent(
  input: JarvisModelSwitchDecisionInput,
  candidates: readonly JarvisModelSwitchCandidate[],
): readonly JarvisModelSwitchCandidate[] | null {
  switch (input.intent.kind) {
    case 'provider': {
      const providerId = input.intent.providerId;
      return candidates.filter((candidate) => candidate.selection.providerId === providerId);
    }
    case 'local':
      return candidates.filter((candidate) => isLocalProvider(candidate.selection.providerId));
    case 'strongest_coding':
    case 'cheapest_capable':
      return candidates;
    case 'switch_back': {
      const previous = input.previous;
      if (previous?.mode !== 'single') return null;
      return candidates.filter(
        (candidate) =>
          candidate.selection.providerId === previous.providerId &&
          candidate.selection.modelId === previous.modelId,
      );
    }
  }
}

function supportsRequirements(
  candidate: JarvisModelSwitchCandidate,
  requirements: JarvisModelSwitchDecisionInput['requirements'],
): boolean {
  return (
    (!requirements.images || candidate.supportsImages) &&
    (!requirements.tools || candidate.supportsTools)
  );
}

function orderedCandidates(
  candidates: readonly JarvisModelSwitchCandidate[],
  intent: JarvisModelSwitchIntent,
): JarvisModelSwitchCandidate[] {
  return [...candidates].sort((left, right) => {
    if (intent.kind === 'provider' || intent.kind === 'local') {
      const preferenceDifference =
        Number(right.preferred === true) - Number(left.preferred === true);
      if (preferenceDifference !== 0) return preferenceDifference;
    }
    const costDifference = COST_RANK[left.costClass] - COST_RANK[right.costClass];
    const codingDifference = right.codingRank - left.codingRank;
    if (intent.kind === 'cheapest_capable') {
      if (costDifference !== 0) return costDifference;
      if (codingDifference !== 0) return codingDifference;
    } else {
      if (codingDifference !== 0) return codingDifference;
      if (costDifference !== 0) return costDifference;
    }
    const leftKey = stableCandidateKey(left);
    const rightKey = stableCandidateKey(right);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

function sameSelection(left: ChatModelSelection, right: SingleModelSelection): boolean {
  return (
    left.mode === 'single' && left.providerId === right.providerId && left.modelId === right.modelId
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
        candidate.selection.modelId === selection.modelId,
    )
    .sort((left, right) => Number(right.preferred === true) - Number(left.preferred === true))[0];
}

function approvalReasons(
  input: JarvisModelSwitchDecisionInput,
  candidates: readonly JarvisModelSwitchCandidate[],
  targetCandidate: JarvisModelSwitchCandidate,
): JarvisModelSwitchApprovalReason[] {
  const reasons: JarvisModelSwitchApprovalReason[] = [];
  if (
    input.current.mode === 'single' &&
    isLocalProvider(input.current.providerId) &&
    !isLocalProvider(targetCandidate.selection.providerId)
  ) {
    reasons.push('local_to_cloud');
  }

  const currentCandidate = candidateForSelection(candidates, input.current);
  if (targetCandidate.costClass === 'unknown') {
    reasons.push('cost_unknown');
  } else if (
    currentCandidate &&
    currentCandidate.costClass !== 'unknown' &&
    COST_RANK[targetCandidate.costClass] > COST_RANK[currentCandidate.costClass]
  ) {
    reasons.push('cost_increase');
  }
  if (input.policyRequiresApproval) reasons.push('policy');
  return reasons;
}

function frozenDecision(decision: JarvisModelSwitchDecision): JarvisModelSwitchDecision {
  return deepFreezeJarvisCopy(decision);
}

export function planJarvisModelSwitch(
  input: JarvisModelSwitchDecisionInput,
): Readonly<JarvisModelSwitchDecision> {
  const candidates = safeCandidates(input.candidates);
  const configured = candidatesForIntent(input, candidates);
  if (configured === null) {
    return frozenDecision({ status: 'not_configured', reason: 'no_previous_selection' });
  }
  if (configured.length === 0) {
    return frozenDecision({ status: 'not_configured', reason: 'target_not_configured' });
  }
  if (
    input.offlineMode &&
    configured.every((candidate) => !isLocalProvider(candidate.selection.providerId))
  ) {
    return frozenDecision({ status: 'unavailable', reason: 'offline_mode' });
  }

  const capable = configured.filter((candidate) =>
    supportsRequirements(candidate, input.requirements),
  );
  if (capable.length === 0) {
    return frozenDecision({
      status: 'unavailable',
      reason: 'required_capability_unavailable',
    });
  }
  const connected = capable.filter((candidate) => candidate.connected);
  if (connected.length === 0) {
    return frozenDecision({ status: 'not_connected', reason: 'provider_not_connected' });
  }
  const available = connected.filter((candidate) => candidate.available);
  if (available.length === 0) {
    return frozenDecision({ status: 'unavailable', reason: 'model_unavailable' });
  }

  const targetCandidate = orderedCandidates(available, input.intent)[0]!;
  const target = copySelection(targetCandidate.selection);
  if (sameSelection(input.current, target)) {
    return frozenDecision({ status: 'already_selected', target });
  }
  const reasons = approvalReasons(input, candidates, targetCandidate);
  return reasons.length > 0
    ? frozenDecision({ status: 'approval_required', target, reasons })
    : frozenDecision({ status: 'ready', target });
}
