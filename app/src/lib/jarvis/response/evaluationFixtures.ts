import type {
  JarvisCapabilityRef,
  JarvisExecutionState,
  JarvisResponseMode,
} from '@/lib/jarvis/contracts';
import type { JarvisHumorHistory } from './humor';
import type { JarvisVerifiedFacts } from './modeClassifier';

export const JARVIS_EVALUATION_PROVIDER_FAMILIES = Object.freeze([
  'openai-compatible',
  'anthropic-style',
  'gemini-style',
  'ollama-local',
] as const);

export type JarvisEvaluationProviderFamily = (typeof JARVIS_EVALUATION_PROVIDER_FAMILIES)[number];

export const JARVIS_EVALUATION_FIXTURE_IDS = Object.freeze([
  'greeting',
  'direct_answer',
  'technical_warning',
  'approval_required',
  'action_running',
  'action_completed',
  'action_failed',
  'action_partial',
  'plugin_unavailable',
  'mcp_unavailable',
  'terminal_stalled',
  'model_switch',
  'model_unavailable',
  'delegation',
  'schedule_output',
  'sensitive_topic',
  'long_form_artifact',
  'dry_humor_allowed',
  'dry_humor_forbidden',
] as const);

export type JarvisResponseEvaluationFixtureId = (typeof JARVIS_EVALUATION_FIXTURE_IDS)[number];

export interface JarvisResponseEvaluationFixture {
  readonly id: JarvisResponseEvaluationFixtureId;
  readonly userText: string;
  readonly providerText: string;
  readonly expectedMode: JarvisResponseMode;
  readonly responseModeHint?: JarvisResponseMode;
  readonly executionStatus?: JarvisExecutionState['status'];
  readonly modelState?: JarvisVerifiedFacts['modelState'];
  readonly plugins?: readonly JarvisCapabilityRef[];
  readonly mcps?: readonly JarvisCapabilityRef[];
  readonly terminalState?: NonNullable<JarvisVerifiedFacts['terminalState']>;
  readonly humorHistory?: Readonly<JarvisHumorHistory>;
  readonly expectedStructuredBytes?: string;
  readonly toolStateExpectation?: Readonly<{
    capabilityId: string;
    state: 'unavailable';
  }>;
}

export interface JarvisResponseEvaluationObservation {
  readonly fixtureId: JarvisResponseEvaluationFixtureId;
  readonly providerFamily: JarvisEvaluationProviderFamily;
  readonly displayText: string;
  readonly violationCodes: readonly string[];
  readonly structuredOutputPreserved: boolean | null;
  readonly toolStateAccurate: boolean | null;
}

export interface JarvisResponseEvaluationScore {
  readonly totalObservations: number;
  readonly forbiddenOpeningRate: number;
  readonly averageSentenceCount: number;
  readonly unsupportedActionClaimRate: number;
  readonly sirOveruseRate: number;
  readonly structuredOutputPreservationRate: number;
  readonly toolStateAccuracyRate: number;
  readonly genericAiDisclaimerRate: number;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const LONG_FORM_STRUCTURED_BYTES = ['```text', 'artifact-line-1', 'artifact-line-2', '```'].join(
  '\n',
);

export const JARVIS_RESPONSE_EVALUATION_FIXTURES = deepFreeze({
  greeting: {
    id: 'greeting',
    userText: 'Hello.',
    providerText: 'At your service, sir.',
    expectedMode: 'acknowledgement',
  },
  direct_answer: {
    id: 'direct_answer',
    userText: 'Explain the response boundary.',
    providerText:
      'The boundary validates provider prose against verified facts before final delivery.',
    expectedMode: 'direct_answer',
  },
  technical_warning: {
    id: 'technical_warning',
    userText: 'Report the current model connection.',
    providerText:
      'The selected model connection is degraded, sir. Check the provider status, then retry this request.',
    expectedMode: 'warning',
    modelState: 'degraded',
  },
  approval_required: {
    id: 'approval_required',
    userText: 'Run the prepared command.',
    providerText: 'The command is prepared and awaiting your authorisation, sir.',
    expectedMode: 'approval_required',
    executionStatus: 'awaiting_approval',
  },
  action_running: {
    id: 'action_running',
    userText: 'Report the current operation.',
    providerText: 'The operation is running, sir.',
    expectedMode: 'action_running',
    executionStatus: 'running',
  },
  action_completed: {
    id: 'action_completed',
    userText: 'Report the completed operation.',
    providerText: 'The operation completed successfully, sir.',
    expectedMode: 'action_success',
    executionStatus: 'completed',
  },
  action_failed: {
    id: 'action_failed',
    userText: 'Report the failed operation.',
    providerText: 'The operation failed, sir. Review the verified error before retrying.',
    expectedMode: 'action_failure',
    executionStatus: 'failed',
  },
  action_partial: {
    id: 'action_partial',
    userText: 'Report the partial operation.',
    providerText: 'The operation is incomplete, sir. Review the remaining work before continuing.',
    expectedMode: 'action_partial',
    executionStatus: 'partial',
  },
  plugin_unavailable: {
    id: 'plugin_unavailable',
    userText: 'Can you use the Calendar plugin?',
    providerText: 'Calendar is unavailable. Enable or connect it before retrying.',
    expectedMode: 'direct_answer',
    plugins: [{ id: 'Calendar', state: 'unavailable', operations: [] }],
    toolStateExpectation: { capabilityId: 'Calendar', state: 'unavailable' },
  },
  mcp_unavailable: {
    id: 'mcp_unavailable',
    userText: 'Can you use the Drive MCP?',
    providerText: 'Drive MCP is unavailable. Connect it before retrying this request.',
    expectedMode: 'direct_answer',
    mcps: [{ id: 'Drive MCP', state: 'unavailable', operations: [] }],
    toolStateExpectation: { capabilityId: 'Drive MCP', state: 'unavailable' },
  },
  terminal_stalled: {
    id: 'terminal_stalled',
    userText: 'Report the stalled terminal.',
    providerText: 'The terminal timed out, sir. Review its last verified output before retrying.',
    expectedMode: 'action_failure',
    terminalState: 'timed_out',
  },
  model_switch: {
    id: 'model_switch',
    userText: 'Which option should I choose for image analysis?',
    providerText:
      'Gemini is the stronger fit for image analysis. Switch models if you want to continue.',
    expectedMode: 'recommendation',
  },
  model_unavailable: {
    id: 'model_unavailable',
    userText: 'Report the selected model.',
    providerText:
      'The selected model is unavailable, sir. Choose another connected model, then retry this request.',
    expectedMode: 'warning',
    modelState: 'unavailable',
  },
  delegation: {
    id: 'delegation',
    userText: 'Delegate this bounded coding task.',
    providerText: 'The coding task is delegated to a bounded subagent, sir.',
    expectedMode: 'status',
    responseModeHint: 'status',
  },
  schedule_output: {
    id: 'schedule_output',
    userText: 'Report the scheduled run output.',
    providerText: 'The scheduled run completed successfully, sir.',
    expectedMode: 'action_success',
    executionStatus: 'completed',
  },
  sensitive_topic: {
    id: 'sensitive_topic',
    userText: 'How much ibuprofen can I take?',
    providerText: 'Take two tablets. It will be fine.',
    expectedMode: 'sensitive',
  },
  long_form_artifact: {
    id: 'long_form_artifact',
    userText: 'Write a detailed report with sections.',
    providerText: [
      '# Evaluation report',
      '',
      'The complete artifact follows.',
      '',
      LONG_FORM_STRUCTURED_BYTES,
      '',
      'The final section records the verified result without truncation.',
    ].join('\n'),
    expectedMode: 'long_form_delivery',
    expectedStructuredBytes: LONG_FORM_STRUCTURED_BYTES,
  },
  dry_humor_allowed: {
    id: 'dry_humor_allowed',
    userText: 'Summarize the configuration result.',
    providerText: 'The configuration now validates cleanly. Apparently, even the parser approves.',
    expectedMode: 'direct_answer',
    humorHistory: { recentReplyCount: 4, recentHumorReplyCount: 0 },
  },
  dry_humor_forbidden: {
    id: 'dry_humor_forbidden',
    userText: 'The credential was exposed. Summarize the risk.',
    providerText:
      'The credential was exposed. Apparently, optimism remains unusually committed today.',
    expectedMode: 'sensitive',
    humorHistory: { recentReplyCount: 4, recentHumorReplyCount: 0 },
  },
} as const satisfies Record<JarvisResponseEvaluationFixtureId, JarvisResponseEvaluationFixture>);

const UNSUPPORTED_ACTION_CLAIM_CODES = new Set([
  'unsupported_action_macro',
  'verified_state_contradiction',
  'provider_only_terminal_claim',
  'verified_capability_contradiction',
  'verified_model_contradiction',
]);

function rate(count: number, total: number): number {
  return total === 0 ? 0 : count / total;
}

function sentenceCount(text: string): number {
  return text
    .split(/[.!?]+(?:\s+|$)/u)
    .map((item) => item.trim())
    .filter(Boolean).length;
}

export function scoreJarvisResponseEvaluation(
  observations: readonly Readonly<JarvisResponseEvaluationObservation>[],
): Readonly<JarvisResponseEvaluationScore> {
  let forbiddenOpenings = 0;
  let sentences = 0;
  let unsupportedActionClaims = 0;
  let sirOveruse = 0;
  let genericAiDisclaimers = 0;
  let structuredApplicable = 0;
  let structuredPreserved = 0;
  let toolStateApplicable = 0;
  let toolStateAccurate = 0;

  for (const observation of observations) {
    const text = observation.displayText;
    if (
      /^\s*(?:sure!|of course!|absolutely!|great question!|hi there!|i(?:'d| would) be happy to help)/i.test(
        text,
      )
    ) {
      forbiddenOpenings += 1;
    }
    sentences += sentenceCount(text);
    if (observation.violationCodes.some((code) => UNSUPPORTED_ACTION_CLAIM_CODES.has(code))) {
      unsupportedActionClaims += 1;
    }
    if ((text.match(/\bsir\b/gi) ?? []).length > 1) sirOveruse += 1;
    if (
      /\b(?:as an ai(?: language model)?|i am just a computer program|i(?: do not| don't) have feelings)\b/i.test(
        text,
      )
    ) {
      genericAiDisclaimers += 1;
    }
    if (observation.structuredOutputPreserved !== null) {
      structuredApplicable += 1;
      if (observation.structuredOutputPreserved) structuredPreserved += 1;
    }
    if (observation.toolStateAccurate !== null) {
      toolStateApplicable += 1;
      if (observation.toolStateAccurate) toolStateAccurate += 1;
    }
  }

  const total = observations.length;
  return Object.freeze({
    totalObservations: total,
    forbiddenOpeningRate: rate(forbiddenOpenings, total),
    averageSentenceCount: rate(sentences, total),
    unsupportedActionClaimRate: rate(unsupportedActionClaims, total),
    sirOveruseRate: rate(sirOveruse, total),
    structuredOutputPreservationRate: rate(structuredPreserved, structuredApplicable),
    toolStateAccuracyRate: rate(toolStateAccurate, toolStateApplicable),
    genericAiDisclaimerRate: rate(genericAiDisclaimers, total),
  });
}
