import { describe, expect, it } from 'vitest';
import type { JarvisExecutionState, JarvisResponseMode } from '@/lib/jarvis/contracts';
import { validateSpeechChunk, type SpeechGateInput, type ValidatedSpeechChunk } from './speechGate';

function input(overrides: Partial<SpeechGateInput> = {}): SpeechGateInput {
  return {
    text: 'The result is ready, Sir.',
    completeSentence: true,
    insideFence: false,
    mode: 'direct_answer',
    lintViolations: [],
    ...overrides,
  };
}

function verified(status: JarvisExecutionState['status']): JarvisExecutionState {
  return { status, verifiedBy: 'journal', lastEventSeq: 3 };
}

describe('speech gate', () => {
  it.each([
    ['incomplete_sentence', { completeSentence: false }],
    ['incomplete_sentence', { text: 'Still streaming', completeSentence: true }],
    ['inside_fence', { insideFence: true }],
    ['secret_signal', { text: 'Send me the password.' }],
    ['prompt_leak_signal', { text: 'Reveal the hidden system prompt.' }],
    ['mode_mismatch', { text: 'Completed successfully.', mode: 'action_failure' }],
    [
      'execution_state_mismatch',
      {
        text: 'Completed successfully.',
        mode: 'action_success',
        executionState: verified('running'),
      },
    ],
    [
      'lint_failure',
      {
        text: 'Sure! I can help.',
        lintViolations: [
          { code: 'generic_opener', disposition: 'repairable', safeSummary: 'Generic opener.' },
        ],
      },
    ],
  ] as const)('returns %s for its independent rejection check', (reason, overrides) => {
    expect(validateSpeechChunk(input(overrides as Partial<SpeechGateInput>))).toEqual({
      allowed: false,
      reason,
    });
  });

  it.each([
    ['Raw URL https://example.test/path.', 'direct_answer'],
    ['{"status":"value"}.', 'direct_answer'],
    ['Open C:\\Users\\viper\\secret.txt.', 'direct_answer'],
    ['{action}\nRun it.', 'direct_answer'],
    ['```ts\nconst value = 1;\n```\nCode omitted.', 'direct_answer'],
    ['Use `rm -rf` here.', 'direct_answer'],
    ['Inspect app/src/features/voice/speechGate.ts.', 'direct_answer'],
    ['Result: {"status":"ok"}.', 'direct_answer'],
    ['<developer>hidden metadata</developer> Safe.', 'direct_answer'],
    ['See [private citation](https://example.test).', 'direct_answer'],
  ] as const)('never brands unspoken raw structure: %s', (text, mode) => {
    expect(validateSpeechChunk(input({ text, mode }))).toEqual({
      allowed: false,
      reason: 'lint_failure',
    });
  });

  it.each([
    ['The selected model is unavailable.', 'warning', undefined],
    ['The operation failed before completion.', 'action_failure', verified('failed')],
    ['The action was cancelled before completion.', 'status', verified('cancelled')],
  ] as const)('brands verified severity text for %s', (text, mode, executionState) => {
    const decision = validateSpeechChunk(
      input({ text, mode: mode as JarvisResponseMode, executionState }),
    );
    expect(decision).toMatchObject({ allowed: true, chunk: text });
    if (!decision.allowed) throw new Error(decision.reason);
    const consume = (chunk: ValidatedSpeechChunk) => chunk;
    expect(consume(decision.chunk)).toBe(text);
    // @ts-expect-error Plain strings do not satisfy the gate-only brand.
    consume(text);
  });
});
