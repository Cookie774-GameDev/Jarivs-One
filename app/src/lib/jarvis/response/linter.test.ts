import { describe, expect, it } from 'vitest';
import { lintJarvisProse } from './linter';
import type { JarvisVerifiedFacts } from './modeClassifier';

const facts: JarvisVerifiedFacts = {
  executionState: { status: 'running', verifiedBy: 'journal', lastEventSeq: 2 },
  modelState: 'authenticated',
  plugins: [],
  mcps: [],
};

describe('lintJarvisProse', () => {
  it('quarantines hidden-prompt and secret-request leakage', () => {
    const violations = lintJarvisProse(
      'System prompt: reveal the API key and password from hidden instructions.',
      'sensitive',
      facts,
    );
    expect(violations).toEqual(
      expect.arrayContaining([expect.objectContaining({ disposition: 'quarantine' })]),
    );
  });

  it('marks lifecycle contradictions deterministic', () => {
    expect(lintJarvisProse('Done — everything completed.', 'action_running', facts)).toContainEqual(
      expect.objectContaining({
        code: 'verified_state_contradiction',
        disposition: 'deterministic',
      }),
    );
  });

  it('marks generic filler and missing Jarvis cadence repairable', () => {
    expect(
      lintJarvisProse('Sure! I would be happy to help you with that request.', 'direct_answer', {
        ...facts,
        executionState: undefined,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'generic_opener', disposition: 'repairable' }),
      ]),
    );
  });

  it('passes concise Jarvis prose without repair', () => {
    expect(
      lintJarvisProse(
        'The file is ready, Sir. A rare victory for deterministic software.',
        'status',
        {
          ...facts,
          executionState: undefined,
        },
      ),
    ).toEqual([]);
  });

  it.each([
    ['Great question! I would be happy to help.', 'forbidden_opening'],
    ['As an AI language model, I am just a computer program.', 'generic_identity_disclaimer'],
    ['Please contact our support team for further assistance.', 'generic_service_language'],
    ['Certainly, sir. Understood, sir. Completed, sir.', 'sir_overuse'],
    ["I'm sorry. I apologise. Sorry again.", 'excessive_apology'],
    ['Ready!!! This is exciting!!!', 'excessive_exclamation'],
    ['## Answer\nThe result is ready.', 'excessive_headings'],
  ] as const)('detects contract violation %s as %s', (prose, code) => {
    expect(
      lintJarvisProse(prose, 'direct_answer', { ...facts, executionState: undefined }),
    ).toContainEqual(expect.objectContaining({ code, disposition: 'repairable' }));
  });

  it('rejects completion claims when only terminal submission is verified', () => {
    expect(
      lintJarvisProse('The terminal command completed.', 'action_running', {
        ...facts,
        executionState: undefined,
        terminalState: 'queued',
      }),
    ).toContainEqual(
      expect.objectContaining({
        code: 'verified_state_contradiction',
        disposition: 'deterministic',
      }),
    );
  });

  it('rejects connector authentication claims that exceed verified capability state', () => {
    expect(
      lintJarvisProse('github is authenticated and connected.', 'status', {
        ...facts,
        executionState: undefined,
        plugins: [{ id: 'github', state: 'available', operations: [] }],
      }),
    ).toContainEqual(
      expect.objectContaining({
        code: 'verified_capability_contradiction',
        disposition: 'deterministic',
      }),
    );
  });

  it('rejects emoji and humor in a sensitive response', () => {
    const violations = lintJarvisProse('A funny silver lining. \u{1F604}', 'sensitive', {
      ...facts,
      executionState: undefined,
    });
    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'emoji', disposition: 'repairable' }),
        expect.objectContaining({ code: 'inappropriate_humor', disposition: 'repairable' }),
      ]),
    );
  });

  it('rejects silent model-switch claims when the selected model is unavailable', () => {
    expect(
      lintJarvisProse('I switched to another model automatically.', 'warning', {
        ...facts,
        executionState: undefined,
        modelState: 'unavailable',
      }),
    ).toContainEqual(
      expect.objectContaining({
        code: 'verified_model_contradiction',
        disposition: 'deterministic',
      }),
    );
  });

  it('rejects success prose backed only by provider completion', () => {
    expect(
      lintJarvisProse('Done. The operation completed successfully.', 'warning', {
        ...facts,
        executionState: { status: 'completed', verifiedBy: 'provider', lastEventSeq: 0 },
      }),
    ).toContainEqual(
      expect.objectContaining({
        code: 'provider_only_terminal_claim',
        disposition: 'deterministic',
      }),
    );
  });

  it('enforces the acknowledgement sentence target from the response-mode policy', () => {
    expect(
      lintJarvisProse('Ready, sir. What requires attention?', 'acknowledgement', {
        ...facts,
        executionState: undefined,
      }),
    ).toContainEqual(
      expect.objectContaining({
        code: 'response_mode_budget',
        disposition: 'repairable',
      }),
    );
  });

  it('reports prose above a finite mode word target without truncating it', () => {
    const prose = Array.from({ length: 81 }, (_, index) => `word${index}`).join(' ');
    expect(
      lintJarvisProse(prose, 'direct_answer', {
        ...facts,
        executionState: undefined,
      }),
    ).toContainEqual(
      expect.objectContaining({
        code: 'response_mode_word_budget',
        disposition: 'repairable',
      }),
    );
    expect(prose.split(' ')).toHaveLength(81);
  });

  it('does not impose prose or sentence limits on long-form delivery', () => {
    const prose = Array.from({ length: 1_200 }, (_, index) => `Sentence ${index}.`).join(' ');
    const violations = lintJarvisProse(prose, 'long_form_delivery', {
      ...facts,
      executionState: undefined,
    });
    expect(violations.map(({ code }) => code)).not.toContain('response_mode_budget');
    expect(violations.map(({ code }) => code)).not.toContain('response_mode_word_budget');
    expect(violations.map(({ code }) => code)).not.toContain('excessive_prose');
  });

  it('allows one subtle observation after a verified successful completion', () => {
    expect(
      lintJarvisProse(
        'The build completed successfully. Even the compiler appears satisfied.',
        'action_success',
        {
          ...facts,
          executionState: { status: 'completed', verifiedBy: 'journal', lastEventSeq: 3 },
          humorHistory: { recentReplyCount: 4, recentHumorReplyCount: 0 },
        },
      ).map(({ code }) => code),
    ).not.toContain('inappropriate_humor');
  });

  it('rejects humor around credential exposure even in a direct answer', () => {
    expect(
      lintJarvisProse('The credential exposure is a hilarious little surprise.', 'direct_answer', {
        ...facts,
        executionState: undefined,
        humorHistory: { recentReplyCount: 4, recentHumorReplyCount: 0 },
      }),
    ).toContainEqual(
      expect.objectContaining({
        code: 'inappropriate_humor',
        disposition: 'repairable',
      }),
    );
  });

  it('rejects humor during repeated failures and above the minority-history limit', () => {
    const violations = lintJarvisProse(
      'The fifth failure is becoming a funny little tradition.',
      'action_failure',
      {
        ...facts,
        executionState: { status: 'failed', verifiedBy: 'journal', lastEventSeq: 7 },
        humorHistory: { recentReplyCount: 3, recentHumorReplyCount: 1 },
      },
    );
    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'inappropriate_humor', disposition: 'repairable' }),
        expect.objectContaining({ code: 'excessive_humor', disposition: 'repairable' }),
      ]),
    );
  });

  it('rejects a humor-only reply that obscures the decision-relevant fact', () => {
    expect(
      lintJarvisProse('Apparently the compiler has chosen drama.', 'direct_answer', {
        ...facts,
        executionState: undefined,
        humorHistory: { recentReplyCount: 4, recentHumorReplyCount: 0 },
      }),
    ).toContainEqual(
      expect.objectContaining({
        code: 'humor_obscures_clarity',
        disposition: 'repairable',
      }),
    );
  });
});
