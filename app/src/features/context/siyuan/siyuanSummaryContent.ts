const encoder = new TextEncoder();

export const SIYUAN_SUMMARY_READ_BYTES = 256 * 1024;
export const SIYUAN_SUMMARY_LARGE_FILE_SEND_BYTES = 96 * 1024;

export interface SiyuanPreparedSummaryContent {
  content: string;
  sampledBytes: number;
  sourceBytes: number;
  truncated: boolean;
  strategy: 'complete' | 'bounded_sections';
}

/**
 * Native samples are decoded lossily for broad file-viewing compatibility.
 * Summary prompts must be stricter: replacement characters and non-text
 * controls indicate binary or corrupt content and must remain metadata-only.
 */
export function isSafeSiyuanSummaryText(value: string): boolean {
  return (
    value.trim().length > 0 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufffd]/u.test(value)
  );
}

function byteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

function takeUtf8Prefix(value: string, maximumBytes: number): string {
  if (maximumBytes <= 0) return '';
  const bytes = encoder.encode(value);
  if (bytes.byteLength <= maximumBytes) return value;
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, maximumBytes));
}

/**
 * Keep complete small files. For a larger bounded native sample, retain several
 * evenly spaced sections instead of only the first few lines. The disclosure
 * header makes partial evidence explicit to the model and to audit receipts.
 */
export function prepareSiyuanSummaryContent(
  sampledText: string,
  declaredSourceBytes: number | null,
  maximumSendBytes = SIYUAN_SUMMARY_LARGE_FILE_SEND_BYTES,
): SiyuanPreparedSummaryContent {
  if (!Number.isSafeInteger(maximumSendBytes) || maximumSendBytes < 4 * 1024) {
    throw new Error('siyuan_summary_send_budget_invalid');
  }
  const sampledBytes = byteLength(sampledText);
  const sourceBytes = Math.max(sampledBytes, declaredSourceBytes ?? sampledBytes);
  const truncated = sourceBytes > sampledBytes;
  if (sampledBytes <= maximumSendBytes) {
    return Object.freeze({
      content: sampledText,
      sampledBytes,
      sourceBytes,
      truncated,
      strategy: 'complete' as const,
    });
  }

  const markerBudget = 1024;
  const bodyBudget = maximumSendBytes - markerBudget;
  const sectionBudget = Math.floor(bodyBudget / 3);
  const charactersPerSection = Math.max(1, Math.floor(sectionBudget / 2));
  const middleStart = Math.max(0, Math.floor(sampledText.length / 2 - charactersPerSection / 2));
  const endStart = Math.max(0, sampledText.length - charactersPerSection);
  const sections = [
    sampledText.slice(0, charactersPerSection),
    sampledText.slice(middleStart, middleStart + charactersPerSection),
    sampledText.slice(endStart),
  ];
  const header = `[Bounded source sample: ${sampledBytes} of ${sourceBytes} bytes read; representative beginning, middle, and end sections follow.]`;
  const joined = `${header}\n\n--- BEGINNING ---\n${sections[0]}\n\n--- MIDDLE OF SAMPLE ---\n${sections[1]}\n\n--- END OF SAMPLE ---\n${sections[2]}`;
  const content = takeUtf8Prefix(joined, maximumSendBytes);
  return Object.freeze({
    content,
    sampledBytes,
    sourceBytes,
    truncated: true,
    strategy: 'bounded_sections' as const,
  });
}
