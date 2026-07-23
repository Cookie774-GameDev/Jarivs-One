import type {
  JarvisCapabilityRef,
  JarvisExecutionState,
  JarvisRequestEnvelope,
  JarvisResponseMode,
} from '@/lib/jarvis/contracts';
import type { JarvisHumorHistory } from './humor';
import { classifyJarvisSensitiveTopic } from './sensitive';

export interface JarvisVerifiedFacts {
  executionState?: JarvisExecutionState;
  modelState: 'available' | 'connected' | 'authenticated' | 'degraded' | 'unavailable';
  plugins: readonly JarvisCapabilityRef[];
  mcps: readonly JarvisCapabilityRef[];
  terminalState?: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timed_out';
  humorHistory?: Readonly<JarvisHumorHistory>;
}

export function hasProviderOnlyTerminalState(facts: Readonly<JarvisVerifiedFacts>): boolean {
  const executionState = facts.executionState;
  return (
    executionState?.verifiedBy === 'provider' &&
    (executionState.status === 'completed' ||
      executionState.status === 'partial' ||
      executionState.status === 'failed' ||
      executionState.status === 'cancelled' ||
      executionState.status === 'timed_out')
  );
}

export function classifyJarvisResponseMode(
  request: Readonly<Pick<JarvisRequestEnvelope, 'userText' | 'responseModeHint'>>,
  facts: Readonly<JarvisVerifiedFacts>,
): JarvisResponseMode {
  const status = facts.executionState?.status;
  if (hasProviderOnlyTerminalState(facts)) return 'warning';
  if (status === 'awaiting_approval') return 'approval_required';
  if (status === 'running' || status === 'compiling' || status === 'queued')
    return 'action_running';
  if (status === 'completed') return 'action_success';
  if (status === 'partial') return 'action_partial';
  if (status === 'failed') return 'action_failure';
  if (status === 'cancelled') return 'status';
  if (status === 'timed_out') return 'warning';
  if (facts.modelState === 'unavailable' || facts.modelState === 'degraded') return 'warning';
  if (facts.terminalState === 'failed' || facts.terminalState === 'timed_out')
    return 'action_failure';
  if (facts.terminalState === 'running' || facts.terminalState === 'queued')
    return 'action_running';
  if (facts.terminalState === 'completed') return 'action_success';
  if (facts.terminalState === 'cancelled') return 'status';
  const text = request.userText.trim();
  if (classifyJarvisSensitiveTopic(text)) return 'sensitive';
  if (/^(?:hi|hey|hello|howdy|yo)\b[!.?\s]*$/i.test(text)) return 'acknowledgement';
  if (/\b(recommend|which (?:option|approach)|what should i choose)\b/i.test(text)) {
    return 'recommendation';
  }
  if (/\b(detailed|report|essay|long[- ]form|with sections|comprehensive)\b/i.test(text)) {
    return 'long_form_delivery';
  }
  return request.responseModeHint ?? 'direct_answer';
}
