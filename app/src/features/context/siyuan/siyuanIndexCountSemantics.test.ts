import { describe, expect, it } from 'vitest';
import { formatSiyuanIndexCountSummary } from './siyuanIndexCountSemantics';

describe('SiYuan index count semantics', () => {
  it('labels the durable aggregate as indexed items without inventing a file or folder split', () => {
    expect(formatSiyuanIndexCountSummary({ kind: 'indexed-items', count: 7_108 })).toBe(
      '7,108 indexed items',
    );
    expect(formatSiyuanIndexCountSummary({ kind: 'indexed-items', count: 1 })).toBe(
      '1 indexed item',
    );
  });

  it('labels the stored Context tree fallback as files only', () => {
    expect(formatSiyuanIndexCountSummary({ kind: 'files', count: 42 })).toBe('42 files');
    expect(formatSiyuanIndexCountSummary({ kind: 'files', count: 1 })).toBe('1 file');
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'fails closed for the non-authoritative count %s',
    (count) => {
      expect(formatSiyuanIndexCountSummary({ kind: 'indexed-items', count })).toBe(
        'Count unavailable',
      );
      expect(formatSiyuanIndexCountSummary({ kind: 'files', count })).toBe('Count unavailable');
    },
  );
});
