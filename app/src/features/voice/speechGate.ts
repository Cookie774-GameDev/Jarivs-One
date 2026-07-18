import type { JarvisExecutionState, JarvisResponseMode } from '@/lib/jarvis/contracts';
import { lintJarvisProse, type JarvisLintViolation } from '@/lib/jarvis/response/linter';

const validatedSpeechChunkBrand: unique symbol = Symbol('jarvis.validated-speech-chunk');

export type ValidatedSpeechChunk = string & {
  readonly [validatedSpeechChunkBrand]: true;
};

export interface SpeechGateInput {
  text: string;
  completeSentence: boolean;
  insideFence: boolean;
  mode: JarvisResponseMode;
  executionState?: JarvisExecutionState;
  lintViolations: readonly JarvisLintViolation[];
}

export type SpeechGateDecision =
  | { allowed: true; chunk: ValidatedSpeechChunk }
  | {
      allowed: false;
      reason:
        | 'incomplete_sentence'
        | 'inside_fence'
        | 'secret_signal'
        | 'prompt_leak_signal'
        | 'mode_mismatch'
        | 'execution_state_mismatch'
        | 'lint_failure';
    };

const SECRET_SIGNAL =
  /\b(?:password|passphrase|api[ _-]?key|access[ _-]?token|refresh[ _-]?token|credential|client[ _-]?secret|private[ _-]?key|bearer\s+\S+)\b/i;
const PROMPT_LEAK_SIGNAL =
  /\b(?:system prompt|hidden (?:prompt|instructions?)|developer message|chain of thought)\b/i;
const COMPLETE_SENTENCE = /[.!?\u3002\uFF01\uFF1F](?:["')\]]*)?\s*$/u;
const UNSPOKEN_STRUCTURE =
  /```|~~~|`[^`\r\n]+`|^\s*\{action\}|https?:\/\/|\[[^\]\r\n]+\]\(https?:\/\/|^\s*[[{][\s\S]*[\]}]\s*$|\{[^{}\r\n]*"[^"\r\n]+"\s*:[^{}\r\n]*\}|<(?:system|developer|assistant|tool|metadata)\b[^>]*>[\s\S]*?<\/(?:system|developer|assistant|tool|metadata)\s*>|\b[A-Za-z]:\\|(?:^|\s)\/(?:Users|home|etc|var|tmp|opt|workspace)\/|(?:^|[\s("'])\.?\.?\/(?:[^\s"')]+)|(?:^|[\s("'])(?:app|src|packages|services|server|client|docs|tests?|scripts?)\/[A-Za-z0-9_.@/-]+/im;

function modeMatchesText(mode: JarvisResponseMode, text: string): boolean {
  const claimsSuccess = /\b(?:done|completed|succeeded|successful)\b/i.test(text);
  const claimsFailure = /\b(?:failed|failure|timed out|cancelled)\b/i.test(text);
  const claimsRunning = /\b(?:running|in progress|underway)\b/i.test(text);
  if (mode === 'action_failure') return !claimsSuccess;
  if (mode === 'action_success') return !claimsFailure && !claimsRunning;
  if (mode === 'action_running') return !claimsSuccess && !claimsFailure;
  if (mode === 'action_partial') return !claimsSuccess;
  if (mode === 'approval_required') return !claimsSuccess && !claimsRunning;
  if (mode === 'warning') return !claimsSuccess;
  return true;
}

function modeMatchesExecution(
  mode: JarvisResponseMode,
  executionState: JarvisExecutionState | undefined,
): boolean {
  if (!executionState) {
    return ![
      'approval_required',
      'action_running',
      'action_success',
      'action_partial',
      'action_failure',
    ].includes(mode);
  }
  if (
    executionState.verifiedBy === 'provider' &&
    ['completed', 'partial', 'failed', 'cancelled', 'timed_out'].includes(executionState.status)
  ) {
    return mode === 'warning';
  }
  if (executionState.status === 'awaiting_approval') return mode === 'approval_required';
  if (['queued', 'compiling', 'running'].includes(executionState.status)) {
    return mode === 'action_running';
  }
  if (executionState.status === 'completed') return mode === 'action_success';
  if (executionState.status === 'partial') return mode === 'action_partial';
  if (executionState.status === 'failed') return mode === 'action_failure';
  if (executionState.status === 'cancelled') return mode === 'status' || mode === 'warning';
  return mode === 'warning' || mode === 'action_failure';
}

export function validateSpeechChunk(input: Readonly<SpeechGateInput>): SpeechGateDecision {
  const text = input.text.trim();
  if (!input.completeSentence || !COMPLETE_SENTENCE.test(text)) {
    return { allowed: false, reason: 'incomplete_sentence' };
  }
  if (input.insideFence) return { allowed: false, reason: 'inside_fence' };
  if (SECRET_SIGNAL.test(text)) return { allowed: false, reason: 'secret_signal' };
  if (PROMPT_LEAK_SIGNAL.test(text)) return { allowed: false, reason: 'prompt_leak_signal' };
  if (!modeMatchesText(input.mode, text)) return { allowed: false, reason: 'mode_mismatch' };
  if (!modeMatchesExecution(input.mode, input.executionState)) {
    return { allowed: false, reason: 'execution_state_mismatch' };
  }
  const violations = lintJarvisProse(text, input.mode, {
    ...(input.executionState ? { executionState: input.executionState } : {}),
    modelState: 'available',
    plugins: [],
    mcps: [],
  });
  if (
    !text ||
    UNSPOKEN_STRUCTURE.test(text) ||
    input.lintViolations.length > 0 ||
    violations.length > 0
  ) {
    return { allowed: false, reason: 'lint_failure' };
  }
  return { allowed: true, chunk: text as ValidatedSpeechChunk };
}
