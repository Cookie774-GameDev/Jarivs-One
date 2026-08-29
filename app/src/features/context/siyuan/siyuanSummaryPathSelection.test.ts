import { describe, expect, it } from 'vitest';
import { mergeSiyuanSummaryPaths, parseSiyuanSummaryPathDraft } from './siyuanSummaryPathSelection';

describe('SiYuan summary path selection', () => {
  it('accepts one or many pasted file locations without changing their exact path text', () => {
    expect(
      parseSiyuanSummaryPathDraft(' C:\\repo\\one.ts\r\n\r\nC:\\repo\\two.ts\nC:\\repo\\ONE.ts '),
    ).toEqual(['C:\\repo\\one.ts', 'C:\\repo\\two.ts']);
  });

  it('merges explorer selections and pasted locations deterministically and case-insensitively', () => {
    expect(
      mergeSiyuanSummaryPaths(
        ['C:\\repo\\one.ts', 'C:\\repo\\folder\\three.md'],
        ['c:\\repo\\ONE.ts', ' C:\\repo\\two.ts ', '', 'C:\\repo\\folder\\three.md'],
      ),
    ).toEqual(['C:\\repo\\one.ts', 'C:\\repo\\folder\\three.md', 'C:\\repo\\two.ts']);
  });
});
