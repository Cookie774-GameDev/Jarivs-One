import { describe, expect, it } from 'vitest';
import {
  assessExplicitResponseContract,
  explicitResponseContractFallback,
  formatExplicitResponseContract,
  parseExplicitResponseContract,
} from './explicitResponseContract';

describe('explicitResponseContract', () => {
  it('treats a requested N-word summary as a hard maximum with safe headroom', () => {
    const contract = parseExplicitResponseContract(
      'C:\\Users\\viper Hi, please read your context and make me a 750-word summary of it in total.',
    );
    expect(contract).toEqual({
      maxWords: 750,
      minimumWords: 675,
      targetMinWords: 675,
      targetMaxWords: 720,
    });
    expect(formatExplicitResponseContract(contract!)).toContain('never exceed 750 words');
    expect(formatExplicitResponseContract(contract!)).toContain('Aim for 675-720 words');
  });

  it('uses the strictest explicit limit and ignores incidental or unreasonable numbers', () => {
    expect(parseExplicitResponseContract('Summarize the 750-word source file.')).toBeNull();
    expect(parseExplicitResponseContract('Write a 0-word summary.')).toBeNull();
    expect(parseExplicitResponseContract('Write a 9001-word summary.')).toBeNull();
    expect(
      parseExplicitResponseContract('Write a 750-word summary, but keep it under 700 words.'),
    ).toMatchObject({ maxWords: 699, minimumWords: 629 });
    expect(parseExplicitResponseContract('Keep the answer at most 700 words.')).toMatchObject({
      maxWords: 700,
      minimumWords: 0,
    });
    expect(
      parseExplicitResponseContract(
        'The source says "keep it under 100 words." Summarize the source normally.',
      ),
    ).toBeNull();
    const oneWord = parseExplicitResponseContract('Give me a 1-word answer.')!;
    expect(oneWord).toEqual({
      maxWords: 1,
      minimumWords: 1,
      targetMinWords: 1,
      targetMaxWords: 1,
    });
    expect(explicitResponseContractFallback(oneWord)).toBe('Retry.');
    expect(
      assessExplicitResponseContract(explicitResponseContractFallback(oneWord), oneWord),
    ).toEqual({ ok: true, wordCount: 1 });
  });

  it('rejects excess words, internal notices, and substantial duplicate tails', () => {
    const contract = parseExplicitResponseContract('Keep the answer at most 100 words.')!;
    expect(assessExplicitResponseContract('A concise verified summary.', contract)).toEqual({
      ok: true,
      wordCount: 4,
    });
    const oversized = Array.from({ length: 101 }, (_, index) => `word${index}`).join(' ');
    expect(assessExplicitResponseContract(oversized, contract)).toMatchObject({
      ok: false,
      code: 'word_limit_exceeded',
      wordCount: 101,
    });
    for (const notice of ['[unverified output location omitted]', '[unverified link omitted]']) {
      expect(assessExplicitResponseContract(`Evidence ${notice}`, contract)).toMatchObject({
        ok: false,
        code: 'internal_marker',
      });
    }
    const repeated = Array.from({ length: 60 }, (_, index) => `evidence${index}`).join(' ');
    expect(
      assessExplicitResponseContract(`${repeated} ${repeated}`, {
        maxWords: 750,
        minimumWords: 675,
        targetMinWords: 675,
        targetMaxWords: 720,
      }),
    ).toMatchObject({ ok: false, code: 'duplicate_tail' });
    expect(
      assessExplicitResponseContract('Summary\nFact one.\nSummary\nFact two.', contract),
    ).toMatchObject({ ok: true });
    const nearby = Array.from({ length: 24 }, (_, index) => `common${index}`).join(' ');
    const tail = Array.from({ length: 60 }, (_, index) => `tail${index}`).join(' ');
    expect(
      assessExplicitResponseContract(`${nearby} ${nearby} bridge ${tail} ${tail}`, {
        maxWords: 750,
        minimumWords: 675,
        targetMinWords: 675,
        targetMaxWords: 720,
      }),
    ).toMatchObject({ ok: false, code: 'duplicate_tail' });
    const target = parseExplicitResponseContract('Give me a 750-word summary.')!;
    const short = Array.from({ length: 144 }, (_, index) => `fact${index}`).join(' ');
    expect(assessExplicitResponseContract(short, target)).toMatchObject({
      ok: false,
      code: 'word_limit_below_target',
      wordCount: 144,
    });
  });
});
