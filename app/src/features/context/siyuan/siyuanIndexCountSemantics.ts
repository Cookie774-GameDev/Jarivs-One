export type SiyuanIndexCountKind = 'indexed-items' | 'files';

export interface SiyuanIndexCountSummaryInput {
  readonly kind: SiyuanIndexCountKind;
  readonly count: number;
}

export function formatSiyuanIndexCountSummary({
  kind,
  count,
}: SiyuanIndexCountSummaryInput): string {
  if (!Number.isSafeInteger(count) || count < 0) {
    return 'Count unavailable';
  }

  const formattedCount = count.toLocaleString();
  if (kind === 'indexed-items') {
    return `${formattedCount} indexed ${count === 1 ? 'item' : 'items'}`;
  }

  return `${formattedCount} ${count === 1 ? 'file' : 'files'}`;
}
