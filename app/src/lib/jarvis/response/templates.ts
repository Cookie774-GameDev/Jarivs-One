import type { JarvisCapabilityRef } from '@/lib/jarvis/contracts';
import { hasProviderOnlyTerminalState, type JarvisVerifiedFacts } from './modeClassifier';

function integrationLine(ref: JarvisCapabilityRef): string {
  if (ref.state === 'authenticated') return `${ref.id} is authenticated.`;
  if (ref.state === 'connected') return `${ref.id} is connected.`;
  if (ref.state === 'available') return `${ref.id} is available.`;
  if (ref.state === 'degraded') return `${ref.id} is degraded.`;
  if (ref.state === 'unavailable') return `${ref.id} is unavailable.`;
  return `${ref.id} is planned.`;
}

export function verifiedResponseTemplate(facts: Readonly<JarvisVerifiedFacts>): string {
  const status = facts.executionState?.status;
  const primary = hasProviderOnlyTerminalState(facts)
    ? `The provider reported ${status?.replace('_', ' ')}, but executor or journal verification is still required.`
    : status === 'awaiting_approval'
      ? 'Approval is required before this action can run.'
      : status === 'queued'
        ? 'The action is queued and has not started running.'
        : status === 'compiling'
          ? 'The action is being prepared and has not completed.'
          : status === 'running'
            ? 'The action is running. It has not completed yet.'
            : status === 'completed'
              ? 'The action completed successfully.'
              : status === 'partial'
                ? 'The action is only partially complete; some work remains unfinished.'
                : status === 'failed'
                  ? 'The action failed before completion.'
                  : status === 'cancelled'
                    ? 'The action was cancelled before completion.'
                    : status === 'timed_out'
                      ? 'The action timed out before completion.'
                      : facts.modelState === 'unavailable'
                        ? 'The selected model is unavailable. No model switch was made.'
                        : facts.modelState === 'degraded'
                          ? 'The selected model connection is degraded.'
                          : facts.terminalState === 'queued'
                            ? 'The terminal operation is queued and not running.'
                            : facts.terminalState === 'running'
                              ? 'The terminal operation is running and not completed.'
                              : facts.terminalState === 'completed'
                                ? 'The terminal operation completed with executor verification.'
                                : facts.terminalState === 'failed'
                                  ? 'The terminal operation failed.'
                                  : facts.terminalState === 'cancelled'
                                    ? 'The terminal operation was cancelled before completion.'
                                    : facts.terminalState === 'timed_out'
                                      ? 'The terminal operation timed out.'
                                      : '';
  return [primary, ...facts.plugins.map(integrationLine), ...facts.mcps.map(integrationLine)]
    .filter(Boolean)
    .join(' ');
}

export const QUARANTINED_RESPONSE_TEMPLATE =
  'I hit an invalid model reply and quarantined it. Please retry the request, Sir.';
export const INVALID_STRUCTURED_REGION_TEMPLATE =
  'Structured output could not be validated and was not made executable.';
