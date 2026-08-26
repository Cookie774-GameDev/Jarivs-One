import type { SiyuanSafeIndexEntry } from './siyuanSafeIndex';

export interface SiyuanPreparedSummary {
  entry: SiyuanSafeIndexEntry;
  content: string;
  contentBytes: number;
}

export interface SiyuanSummaryBatchLimits {
  maxFiles: number;
  maxBytes: number;
  laneCount: number;
}

export interface SiyuanSummaryBatch {
  id: string;
  lane: number;
  files: readonly SiyuanPreparedSummary[];
  totalContentBytes: number;
  oversizedSingle?: true;
}

export const DEFAULT_SIYUAN_SUMMARY_BATCH_LIMITS = Object.freeze({
  maxFiles: 8,
  maxBytes: 96 * 1024,
  laneCount: 3,
}) satisfies SiyuanSummaryBatchLimits;

function boundedInteger(value: number, minimum: number, maximum: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`siyuan_summary_batch_${field}_invalid`);
  }
  return value;
}

function revisionKey(file: SiyuanPreparedSummary): string {
  return [
    file.entry.nodeId,
    file.entry.modifiedAt ?? 'none',
    file.entry.sizeBytes ?? 'none',
    file.contentBytes,
  ].join('\u0000');
}

function stableBatchId(files: readonly SiyuanPreparedSummary[]): string {
  let hash = 0x811c9dc5;
  for (const character of files.map(revisionKey).join('\u0001')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `siyuan-summary-${hash.toString(16).padStart(8, '0')}`;
}

export function planSiyuanSummaryBatches(
  files: readonly SiyuanPreparedSummary[],
  requested: Partial<SiyuanSummaryBatchLimits> = {},
): readonly SiyuanSummaryBatch[] {
  const limits = {
    maxFiles: boundedInteger(
      requested.maxFiles ?? DEFAULT_SIYUAN_SUMMARY_BATCH_LIMITS.maxFiles,
      1,
      32,
      'max_files',
    ),
    maxBytes: boundedInteger(
      requested.maxBytes ?? DEFAULT_SIYUAN_SUMMARY_BATCH_LIMITS.maxBytes,
      1,
      1024 * 1024,
      'max_bytes',
    ),
    laneCount: boundedInteger(
      requested.laneCount ?? DEFAULT_SIYUAN_SUMMARY_BATCH_LIMITS.laneCount,
      1,
      5,
      'lane_count',
    ),
  };
  const seen = new Set<string>();
  const groups: SiyuanPreparedSummary[][] = [];
  let current: SiyuanPreparedSummary[] = [];
  let currentBytes = 0;

  const flush = () => {
    if (current.length === 0) return;
    groups.push(current);
    current = [];
    currentBytes = 0;
  };

  for (const file of files) {
    if (!file.entry.nodeId || !Number.isSafeInteger(file.contentBytes) || file.contentBytes < 0) {
      throw new Error('siyuan_summary_batch_entry_invalid');
    }
    const key = revisionKey(file);
    if (seen.has(key)) throw new Error('siyuan_summary_batch_duplicate_entry');
    seen.add(key);
    if (file.contentBytes > limits.maxBytes) {
      flush();
      groups.push([file]);
      continue;
    }
    if (current.length >= limits.maxFiles || currentBytes + file.contentBytes > limits.maxBytes) {
      flush();
    }
    current.push(file);
    currentBytes += file.contentBytes;
  }
  flush();

  return Object.freeze(
    groups.map((group, index) => {
      const totalContentBytes = group.reduce((total, file) => total + file.contentBytes, 0);
      return Object.freeze({
        id: stableBatchId(group),
        lane: index % limits.laneCount,
        files: Object.freeze([...group]),
        totalContentBytes,
        ...(group.length === 1 && totalContentBytes > limits.maxBytes
          ? { oversizedSingle: true as const }
          : {}),
      });
    }),
  );
}
