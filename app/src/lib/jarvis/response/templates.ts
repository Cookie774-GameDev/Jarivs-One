import type {
  JarvisCapabilityRef,
  JarvisModelSnapshot,
  JarvisResponseMode,
} from '@/lib/jarvis/contracts';
import {
  applyJarvisAddressCadence,
  EMPTY_JARVIS_CADENCE_STATE,
  type JarvisCadenceMoment,
  type JarvisCadenceState,
} from './cadence';
import { hasProviderOnlyTerminalState, type JarvisVerifiedFacts } from './modeClassifier';

const MAX_NARRATED_INTEGRATION_OPERATIONS = 8;

function integrationLine(ref: JarvisCapabilityRef): string {
  const stateLine =
    ref.state === 'authenticated'
      ? `${ref.id} is authenticated.`
      : ref.state === 'connected'
        ? `${ref.id} is connected.`
        : ref.state === 'available'
          ? `${ref.id} is available.`
          : ref.state === 'degraded'
            ? `${ref.id} is degraded.`
            : ref.state === 'unavailable'
              ? `${ref.id} is unavailable.`
              : `${ref.id} is planned.`;
  if ((ref.state !== 'connected' && ref.state !== 'authenticated') || ref.operations.length === 0) {
    return stateLine;
  }
  const operations = ref.operations.slice(0, MAX_NARRATED_INTEGRATION_OPERATIONS);
  const label =
    ref.operations.length > operations.length
      ? 'Available operations include'
      : 'Available operations';
  return `${stateLine} ${label}: ${operations.join(', ')}.`;
}

export type JarvisVerifiedNarrationInput =
  | Readonly<{ kind: 'approval_required'; actionLabel: string }>
  | Readonly<{ kind: 'queued'; actionLabel: string }>
  | Readonly<{ kind: 'running'; actionLabel: string }>
  | Readonly<{ kind: 'verifying'; actionLabel: string }>
  | Readonly<{ kind: 'success'; summary: string }>
  | Readonly<{ kind: 'partial'; completedSummary: string; remainingSummary: string }>
  | Readonly<{ kind: 'failure'; actionLabel: string; reason: string }>
  | Readonly<{ kind: 'cancelled'; actionLabel: string }>
  | Readonly<{ kind: 'unavailable_connector'; connectorName: string; nextAction: string }>
  | Readonly<{ kind: 'missing_permission'; actionLabel: string; permissionLabel: string }>
  | Readonly<{ kind: 'stale_terminal'; terminalLabel: string; lastObservedAt: string }>
  | Readonly<{
      kind: 'current_model';
      providerId: string;
      modelId: string;
      connectionMode: JarvisModelSnapshot['connectionMode'];
      state: JarvisVerifiedFacts['modelState'];
    }>
  | Readonly<{ kind: 'model_switched'; modelName: string }>
  | Readonly<{ kind: 'model_switch_proposed'; modelName: string; reason: string }>
  | Readonly<{ kind: 'agent_delegated'; agentName: string; objective: string }>
  | Readonly<{ kind: 'agent_blocked'; agentName: string; reason: string }>
  | Readonly<{ kind: 'artifact_created'; artifactLabel: string }>
  | Readonly<{ kind: 'artifact_link_returned'; artifactLabel: string; url: string }>
  | Readonly<{ kind: 'no_result_returned'; operationLabel: string; nextAction: string }>;

export interface JarvisVerifiedNarrationResult {
  readonly mode: JarvisResponseMode;
  readonly text: string;
  readonly cadenceState: Readonly<JarvisCadenceState>;
}

interface JarvisNarrationDefinition {
  readonly mode: JarvisResponseMode;
  readonly moment: JarvisCadenceMoment;
  readonly lead: string;
  readonly details: readonly string[];
}

function verifiedDetail(label: string, value: string): string {
  return `${label}: ${value}${/[.!?]$/u.test(value) ? '' : '.'}`;
}

function narrationDefinition(
  input: Readonly<JarvisVerifiedNarrationInput>,
): JarvisNarrationDefinition {
  switch (input.kind) {
    case 'approval_required':
      return {
        mode: 'approval_required',
        moment: 'new_task_acknowledgement',
        lead: 'Approval is required before this action can run.',
        details: [verifiedDetail('Action', input.actionLabel)],
      };
    case 'queued':
      return {
        mode: 'action_running',
        moment: 'routine_status',
        lead: 'The action is queued and not running.',
        details: [verifiedDetail('Action', input.actionLabel)],
      };
    case 'running':
      return {
        mode: 'action_running',
        moment: 'routine_status',
        lead: 'The action is running and not completed.',
        details: [verifiedDetail('Action', input.actionLabel)],
      };
    case 'verifying':
      return {
        mode: 'action_running',
        moment: 'routine_status',
        lead: 'The action result is being verified.',
        details: [verifiedDetail('Action', input.actionLabel)],
      };
    case 'success':
      return {
        mode: 'action_success',
        moment: 'significant_completion',
        lead: 'Completed.',
        details: [input.summary],
      };
    case 'partial':
      return {
        mode: 'action_partial',
        moment: 'routine_status',
        lead: 'Partially completed.',
        details: [input.completedSummary, input.remainingSummary],
      };
    case 'failure':
      return {
        mode: 'action_failure',
        moment: 'important_warning',
        lead: 'The action failed.',
        details: [
          verifiedDetail('Action', input.actionLabel),
          verifiedDetail('Cause', input.reason),
        ],
      };
    case 'cancelled':
      return {
        mode: 'status',
        moment: 'routine_status',
        lead: 'The action was cancelled before completion.',
        details: [verifiedDetail('Action', input.actionLabel)],
      };
    case 'unavailable_connector':
      return {
        mode: 'warning',
        moment: 'important_warning',
        lead: 'The connector is unavailable.',
        details: [
          verifiedDetail('Connector', input.connectorName),
          verifiedDetail('Next action', input.nextAction),
        ],
      };
    case 'missing_permission':
      return {
        mode: 'approval_required',
        moment: 'important_warning',
        lead: 'A permission is required before this action can run.',
        details: [
          verifiedDetail('Action', input.actionLabel),
          verifiedDetail('Permission', input.permissionLabel),
        ],
      };
    case 'stale_terminal':
      return {
        mode: 'warning',
        moment: 'important_warning',
        lead: 'The terminal state is stale and its latest result is unverified.',
        details: [
          verifiedDetail('Terminal', input.terminalLabel),
          verifiedDetail('Last observed', input.lastObservedAt),
        ],
      };
    case 'current_model':
      return {
        mode: 'direct_answer',
        moment: 'routine_status',
        lead: `Current model: ${input.providerId} / ${input.modelId} (${input.connectionMode}, ${input.state}).`,
        details: [],
      };
    case 'model_switched':
      return {
        mode: 'status',
        moment: 'deliberate_correction',
        lead: 'Model switched.',
        details: [verifiedDetail('Model', input.modelName)],
      };
    case 'model_switch_proposed':
      return {
        mode: 'recommendation',
        moment: 'deliberate_correction',
        lead: 'Model switch proposed.',
        details: [verifiedDetail('Model', input.modelName), verifiedDetail('Reason', input.reason)],
      };
    case 'agent_delegated':
      return {
        mode: 'status',
        moment: 'new_task_acknowledgement',
        lead: 'Delegated.',
        details: [
          verifiedDetail('Agent', input.agentName),
          verifiedDetail('Objective', input.objective),
        ],
      };
    case 'agent_blocked':
      return {
        mode: 'warning',
        moment: 'important_warning',
        lead: 'The specialist agent is blocked.',
        details: [verifiedDetail('Agent', input.agentName), verifiedDetail('Cause', input.reason)],
      };
    case 'artifact_created':
      return {
        mode: 'action_success',
        moment: 'significant_completion',
        lead: 'Artifact created.',
        details: [verifiedDetail('Artifact', input.artifactLabel)],
      };
    case 'artifact_link_returned':
      return {
        mode: 'action_success',
        moment: 'significant_completion',
        lead: 'Artifact link ready.',
        details: [
          verifiedDetail('Artifact', input.artifactLabel),
          verifiedDetail('Link', input.url),
        ],
      };
    case 'no_result_returned':
      return {
        mode: 'action_partial',
        moment: 'important_warning',
        lead: 'No result was returned.',
        details: [
          verifiedDetail('Operation', input.operationLabel),
          verifiedDetail('Next action', input.nextAction),
        ],
      };
  }
}

export function formatJarvisVerifiedNarration(
  input: Readonly<JarvisVerifiedNarrationInput>,
  cadenceState: Readonly<JarvisCadenceState> = EMPTY_JARVIS_CADENCE_STATE,
): Readonly<JarvisVerifiedNarrationResult> {
  const definition = narrationDefinition(input);
  const addressed = applyJarvisAddressCadence(
    definition.lead,
    { mode: definition.mode, moment: definition.moment },
    cadenceState,
  );
  return Object.freeze({
    mode: definition.mode,
    text: [addressed.text, ...definition.details].filter(Boolean).join(' '),
    cadenceState: addressed.state,
  });
}

function cadenceContext(facts: Readonly<JarvisVerifiedFacts>): Readonly<{
  mode: JarvisResponseMode;
  moment: JarvisCadenceMoment;
}> {
  const status = facts.executionState?.status;
  if (hasProviderOnlyTerminalState(facts)) {
    return { mode: 'warning', moment: 'important_warning' };
  }
  if (status === 'awaiting_approval') {
    return { mode: 'approval_required', moment: 'new_task_acknowledgement' };
  }
  if (status === 'completed') {
    return { mode: 'action_success', moment: 'significant_completion' };
  }
  if (status === 'failed' || status === 'timed_out') {
    return {
      mode: status === 'failed' ? 'action_failure' : 'warning',
      moment: 'important_warning',
    };
  }
  if (status === 'queued' || status === 'compiling' || status === 'running') {
    return { mode: 'action_running', moment: 'routine_status' };
  }
  if (facts.modelState === 'unavailable' || facts.modelState === 'degraded') {
    return { mode: 'warning', moment: 'important_warning' };
  }
  if (facts.terminalState === 'completed') {
    return { mode: 'action_success', moment: 'significant_completion' };
  }
  if (facts.terminalState === 'failed' || facts.terminalState === 'timed_out') {
    return {
      mode: facts.terminalState === 'failed' ? 'action_failure' : 'warning',
      moment: 'important_warning',
    };
  }
  return { mode: 'status', moment: 'routine_status' };
}

function narrationForFacts(
  facts: Readonly<JarvisVerifiedFacts>,
  cadenceState: Readonly<JarvisCadenceState>,
): Readonly<JarvisVerifiedNarrationResult> | undefined {
  const status = facts.executionState?.status;
  if (hasProviderOnlyTerminalState(facts)) return undefined;
  if (status === 'awaiting_approval') {
    return formatJarvisVerifiedNarration(
      { kind: 'approval_required', actionLabel: 'Current action' },
      cadenceState,
    );
  }
  if (status === 'queued') {
    return formatJarvisVerifiedNarration(
      { kind: 'queued', actionLabel: 'Current action' },
      cadenceState,
    );
  }
  if (status === 'running') {
    return formatJarvisVerifiedNarration(
      { kind: 'running', actionLabel: 'Current action' },
      cadenceState,
    );
  }
  if (status === 'completed') {
    return formatJarvisVerifiedNarration(
      { kind: 'success', summary: 'The action completed successfully.' },
      cadenceState,
    );
  }
  if (status === 'partial') {
    return formatJarvisVerifiedNarration(
      {
        kind: 'partial',
        completedSummary: 'Some work completed.',
        remainingSummary: 'Some work remains unfinished.',
      },
      cadenceState,
    );
  }
  if (status === 'failed') {
    return formatJarvisVerifiedNarration(
      {
        kind: 'failure',
        actionLabel: 'Current action',
        reason: 'No verified success result was produced',
      },
      cadenceState,
    );
  }
  if (status === 'cancelled') {
    return formatJarvisVerifiedNarration(
      { kind: 'cancelled', actionLabel: 'Current action' },
      cadenceState,
    );
  }
  if (status === 'timed_out') {
    return formatJarvisVerifiedNarration(
      {
        kind: 'failure',
        actionLabel: 'Current action',
        reason: 'The execution timed out',
      },
      cadenceState,
    );
  }
  if (facts.terminalState === 'queued') {
    return formatJarvisVerifiedNarration(
      { kind: 'queued', actionLabel: 'Terminal operation' },
      cadenceState,
    );
  }
  if (facts.terminalState === 'running') {
    return formatJarvisVerifiedNarration(
      { kind: 'running', actionLabel: 'Terminal operation' },
      cadenceState,
    );
  }
  if (facts.terminalState === 'completed') {
    return formatJarvisVerifiedNarration(
      { kind: 'success', summary: 'The terminal operation completed with executor verification.' },
      cadenceState,
    );
  }
  if (facts.terminalState === 'failed') {
    return formatJarvisVerifiedNarration(
      {
        kind: 'failure',
        actionLabel: 'Terminal operation',
        reason: 'The terminal executor reported failure',
      },
      cadenceState,
    );
  }
  if (facts.terminalState === 'cancelled') {
    return formatJarvisVerifiedNarration(
      { kind: 'cancelled', actionLabel: 'Terminal operation' },
      cadenceState,
    );
  }
  if (facts.terminalState === 'timed_out') {
    return formatJarvisVerifiedNarration(
      {
        kind: 'failure',
        actionLabel: 'Terminal operation',
        reason: 'The terminal execution timed out',
      },
      cadenceState,
    );
  }
  return undefined;
}

export function verifiedResponseTemplate(
  facts: Readonly<JarvisVerifiedFacts>,
  cadenceState: Readonly<JarvisCadenceState> = EMPTY_JARVIS_CADENCE_STATE,
): string {
  const narration = narrationForFacts(facts, cadenceState);
  const status = facts.executionState?.status;
  const primary =
    narration?.text ??
    (hasProviderOnlyTerminalState(facts)
      ? `The provider reported ${status?.replace('_', ' ')}, but executor or journal verification is still required.`
      : status === 'compiling'
        ? 'The action is being prepared and has not completed.'
        : facts.modelState === 'unavailable'
          ? 'The selected model is unavailable. No model switch was made.'
          : facts.modelState === 'degraded'
            ? 'The selected model connection is degraded.'
            : '');
  const narratedPrimary =
    primary && !narration
      ? applyJarvisAddressCadence(primary, cadenceContext(facts), cadenceState).text
      : primary;
  return [
    narratedPrimary,
    ...facts.plugins.map(integrationLine),
    ...facts.mcps.map(integrationLine),
  ]
    .filter(Boolean)
    .join(' ');
}

export const QUARANTINED_RESPONSE_TEMPLATE =
  'I hit an invalid model reply and quarantined it. Please retry the request.';
export const INVALID_STRUCTURED_REGION_TEMPLATE =
  'Structured output could not be validated and was not made executable.';
