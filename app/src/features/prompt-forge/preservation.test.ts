import { describe, expect, it } from 'vitest';
import { extractPromptPreservationContract, validatePromptPreservation } from './preservation';

describe('Prompt Forge preservation contract', () => {
  const original = [
    'Build VibeSpace v2.4.1 by 2026-08-15 with a $500 budget.',
    'You must keep "Paper Moon" exactly and do not edit app/src/App.tsx.',
    'Use https://platform.openai.com/docs and only return Markdown.',
    '',
    '```ts',
    'const exact = "quoted code";',
    '```',
  ].join('\n');

  it('extracts exact quotes, fences, paths, URLs, versions, dates, numbers, and directives', () => {
    const contract = extractPromptPreservationContract(original);
    expect(
      contract.elements.some(
        (element) => element.kind === 'quote' && element.value === '"Paper Moon"',
      ),
    ).toBe(true);
    expect(contract.elements.some((element) => element.kind === 'code_fence')).toBe(true);
    expect(
      contract.elements.some(
        (element) => element.kind === 'path' && element.value === 'app/src/App.tsx',
      ),
    ).toBe(true);
    expect(
      contract.elements.some(
        (element) => element.kind === 'url' && element.value === 'https://platform.openai.com/docs',
      ),
    ).toBe(true);
    expect(
      contract.elements.some((element) => element.kind === 'version' && element.value === 'v2.4.1'),
    ).toBe(true);
    expect(
      contract.elements.some(
        (element) => element.kind === 'date' && element.value === '2026-08-15',
      ),
    ).toBe(true);
    expect(
      contract.elements.some(
        (element) => element.kind === 'directive' && /must keep/i.test(element.value),
      ),
    ).toBe(true);
    expect(Object.isFrozen(contract.elements)).toBe(true);
  });

  it('passes only when every exact protected element survives', () => {
    const contract = extractPromptPreservationContract(original);
    const passed = validatePromptPreservation(contract, `Objective\n\n${original}\n\nVerification`);
    expect(passed.passed).toBe(true);
    expect(passed.missing).toEqual([]);

    const failed = validatePromptPreservation(
      contract,
      original
        .replace('"Paper Moon"', '"Different"')
        .replace('https://platform.openai.com/docs', 'https://example.invalid'),
    );
    expect(failed.passed).toBe(false);
    expect(failed.missing.some((element) => element.value === '"Paper Moon"')).toBe(true);
    expect(
      failed.missing.some((element) => element.value === 'https://platform.openai.com/docs'),
    ).toBe(true);
  });

  it('bounds adversarially large drafts without claiming successful preservation', () => {
    expect(() => extractPromptPreservationContract('x'.repeat(100_001))).toThrow(/draft/i);
    expect(() =>
      validatePromptPreservation(
        extractPromptPreservationContract('Keep this.'),
        'y'.repeat(200_001),
      ),
    ).toThrow(/upgraded prompt/i);
  });

  it('fails closed for malformed preservation elements', () => {
    const malformed = {
      schemaVersion: 1,
      originalLength: 10,
      elements: [{ kind: 'quote', value: 42 }],
    };
    expect(() =>
      validatePromptPreservation(
        malformed as unknown as ReturnType<typeof extractPromptPreservationContract>,
        'Anything',
      ),
    ).toThrow(/preservation contract/i);
  });
});
