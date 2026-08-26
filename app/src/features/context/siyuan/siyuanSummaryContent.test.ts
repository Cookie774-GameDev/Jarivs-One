import { describe, expect, it } from 'vitest';
import {
  prepareSiyuanSummaryContent,
  SIYUAN_SUMMARY_LARGE_FILE_SEND_BYTES,
  SIYUAN_SUMMARY_READ_BYTES,
} from './siyuanSummaryContent';

describe('SiYuan summary content preparation', () => {
  it('keeps complete small files without inventing truncation', () => {
    expect(prepareSiyuanSummaryContent('hello', 5)).toEqual({
      content: 'hello',
      sampledBytes: 5,
      sourceBytes: 5,
      truncated: false,
      strategy: 'complete',
    });
  });

  it('labels a native prefix as truncated when source metadata is larger', () => {
    expect(prepareSiyuanSummaryContent('hello', 50)).toMatchObject({
      sourceBytes: 50,
      sampledBytes: 5,
      truncated: true,
    });
  });

  it('compacts large samples into bounded representative sections', () => {
    const source = `${'A'.repeat(80_000)}${'M'.repeat(80_000)}${'Z'.repeat(80_000)}`;
    const prepared = prepareSiyuanSummaryContent(source, 500_000, 24 * 1024);
    expect(new TextEncoder().encode(prepared.content).byteLength).toBeLessThanOrEqual(24 * 1024);
    expect(prepared).toMatchObject({
      sourceBytes: 500_000,
      sampledBytes: 240_000,
      truncated: true,
      strategy: 'bounded_sections',
    });
    expect(prepared.content).toContain('BEGINNING');
    expect(prepared.content).toContain('MIDDLE OF SAMPLE');
    expect(prepared.content).toContain('END OF SAMPLE');
    expect(prepared.content).toContain('A');
    expect(prepared.content).toContain('M');
    expect(prepared.content).toContain('Z');
  });

  it('uses a materially larger safe read cap than the legacy 48 KiB sample', () => {
    expect(SIYUAN_SUMMARY_READ_BYTES).toBe(256 * 1024);
    expect(SIYUAN_SUMMARY_LARGE_FILE_SEND_BYTES).toBe(96 * 1024);
  });
});
