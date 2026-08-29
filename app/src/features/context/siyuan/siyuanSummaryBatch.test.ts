import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SIYUAN_SUMMARY_BATCH_LIMITS,
  planSiyuanSummaryBatches,
  siyuanSummaryLaneCount,
  type SiyuanPreparedSummary,
} from './siyuanSummaryBatch';

function prepared(index: number, bytes = 12_000): SiyuanPreparedSummary {
  return {
    entry: {
      nodeId: `node-${index}`,
      parentNodeId: null,
      title: `file-${index}.ts`,
      kind: 'file',
      relativePath: `src/file-${index}.ts`,
      sourcePointer: `C:/repo/src/file-${index}.ts`,
      summary: null,
      sizeBytes: bytes,
      modifiedAt: index,
    },
    content: 'x'.repeat(bytes),
    contentBytes: bytes,
  };
}

describe('SiYuan summary batch planner', () => {
  it('scales selected-model OpenCode work from two through five bounded lanes', () => {
    expect([1, 16, 17, 25, 33, 500].map(siyuanSummaryLaneCount)).toEqual([2, 2, 3, 4, 5, 5]);
    expect(siyuanSummaryLaneCount(0)).toBe(1);
  });

  it('creates deterministic isolated batches with no duplicate file assignment', () => {
    const source = Array.from({ length: 19 }, (_, index) => prepared(index));
    const first = planSiyuanSummaryBatches(source);
    const second = planSiyuanSummaryBatches(source);

    expect(second).toEqual(first);
    expect(first.every((batch) => batch.files.length <= 8)).toBe(true);
    expect(
      first.every(
        (batch) => batch.totalContentBytes <= DEFAULT_SIYUAN_SUMMARY_BATCH_LIMITS.maxBytes,
      ),
    ).toBe(true);
    const assigned = first.flatMap((batch) => batch.files.map((file) => file.entry.nodeId));
    expect(assigned).toHaveLength(source.length);
    expect(new Set(assigned).size).toBe(source.length);
  });

  it('puts an oversized single-file slice in its own bounded batch', () => {
    const batches = planSiyuanSummaryBatches([prepared(1, 120_000), prepared(2, 10_000)]);

    expect(batches[0]).toMatchObject({ oversizedSingle: true, totalContentBytes: 120_000 });
    expect(batches[0]?.files.map((file) => file.entry.nodeId)).toEqual(['node-1']);
    expect(batches[1]?.files.map((file) => file.entry.nodeId)).toEqual(['node-2']);
  });

  it('assigns batches across three lanes without exceeding the configured maximum', () => {
    const batches = planSiyuanSummaryBatches(
      Array.from({ length: 32 }, (_, index) => prepared(index, 20_000)),
      { maxFiles: 4, maxBytes: 80_000, laneCount: 3 },
    );

    expect(new Set(batches.map((batch) => batch.lane))).toEqual(new Set([0, 1, 2]));
    expect(batches.every((batch) => batch.lane >= 0 && batch.lane < 3)).toBe(true);
  });

  it('rejects duplicate node revisions before provider dispatch', () => {
    expect(() => planSiyuanSummaryBatches([prepared(1), prepared(1)])).toThrow(
      'siyuan_summary_batch_duplicate_entry',
    );
  });
});
