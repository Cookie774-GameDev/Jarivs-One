export interface ExplicitResponseContract {
  maxWords: number;
  minimumWords: number;
  targetMinWords: number;
  targetMaxWords: number;
}

export type ExplicitResponseContractAssessment =
  | { ok: true; wordCount: number }
  | {
      ok: false;
      code:
        | 'word_limit_exceeded'
        | 'word_limit_below_target'
        | 'internal_marker'
        | 'duplicate_tail';
      wordCount: number;
    };

const MIN_WORD_BUDGET = 1;
const MAX_WORD_BUDGET = 5_000;
const REQUEST_PATTERNS = Object.freeze([
  {
    pattern: /\b(\d{1,4})[- ]word\s+(?:summary|answer|report|response|overview)\b/iu,
    requiresMinimum: true,
    exclusive: false,
  },
  {
    pattern: /\b(?:summary|answer|report|response|overview)\s+(?:in|of)\s+(\d{1,4})\s+words?\b/iu,
    requiresMinimum: true,
    exclusive: false,
  },
  {
    pattern:
      /\b(?:summary|answer|report|response|overview|output)\b[^.!?\n]{0,40}\b(?:no more than|at most|up to|maximum(?: of)?)\s+(\d{1,4})\s+words?\b/iu,
    requiresMinimum: false,
    exclusive: false,
  },
  {
    pattern:
      /\b(?:summary|answer|report|response|overview|output)\b[^.!?\n]{0,40}\bunder\s+(\d{1,4})\s+words?\b/iu,
    requiresMinimum: false,
    exclusive: true,
  },
  {
    pattern:
      /\b(?:no more than|at most|up to|maximum(?: of)?)\s+(\d{1,4})\s+words?\b[^.!?\n]{0,40}\b(?:summary|answer|report|response|overview|output)\b/iu,
    requiresMinimum: false,
    exclusive: false,
  },
]);
const INTERNAL_MARKER =
  /\[(?:unverified|verified)\s+(?:output\s+location|link)\s+omitted\]|\uE000JARVIS_REGION_\d+\uE001/iu;

function countWords(text: string): number {
  return text.trim().match(/\S+/gu)?.length ?? 0;
}

function hasSubstantialDuplicateRun(text: string): boolean {
  const words = text
    .trim()
    .split(/\s+/u)
    .slice(0, MAX_WORD_BUDGET)
    .map((word) => word.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''))
    .filter(Boolean);
  const shingleSize = 24;
  const minimumRun = 50;
  if (words.length < minimumRun * 2) return false;
  const positions = new Map<string, number[]>();
  for (let index = 0; index <= words.length - shingleSize; index += 1) {
    const key = words.slice(index, index + shingleSize).join('\u0001');
    const earlier = positions.get(key) ?? [];
    if (earlier.some((start) => index - start >= minimumRun)) {
      for (const start of earlier) {
        if (index - start < minimumRun) continue;
        let length = shingleSize;
        while (
          start + length < index &&
          index + length < words.length &&
          words[start + length] === words[index + length]
        ) {
          length += 1;
        }
        if (length >= minimumRun && length / words.length >= 0.25) return true;
      }
    }
    if (earlier.length < 4) earlier.push(index);
    positions.set(key, earlier);
  }
  return false;
}

export function parseExplicitResponseContract(userText: string): ExplicitResponseContract | null {
  if (userText.length > 8_192 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(userText)) {
    return null;
  }
  const requests = REQUEST_PATTERNS.flatMap(({ pattern, requiresMinimum, exclusive = false }) =>
    Array.from(userText.matchAll(new RegExp(pattern.source, 'giu')), (match) => ({
      limit: Number.parseInt(match[1]!, 10) - (exclusive ? 1 : 0),
      requiresMinimum,
    })),
  ).filter(
    ({ limit }) =>
      Number.isSafeInteger(limit) && limit >= MIN_WORD_BUDGET && limit <= MAX_WORD_BUDGET,
  );
  const maxWords =
    requests.length > 0 ? Math.min(...requests.map(({ limit }) => limit)) : Number.NaN;
  if (!Number.isSafeInteger(maxWords) || maxWords < MIN_WORD_BUDGET || maxWords > MAX_WORD_BUDGET) {
    return null;
  }
  const minimumWords = requests.some(({ requiresMinimum }) => requiresMinimum)
    ? Math.max(1, Math.floor(maxWords * 0.9))
    : 0;
  return Object.freeze({
    maxWords,
    minimumWords,
    targetMinWords: Math.max(1, minimumWords || Math.floor(maxWords * 0.8)),
    targetMaxWords: Math.max(1, Math.floor(maxWords * 0.96)),
  });
}

export function explicitResponseContractFallback(contract: ExplicitResponseContract): string {
  const normal =
    'I could not produce a clean, verified response within the requested format. Please retry.';
  return countWords(normal) <= contract.maxWords ? normal : 'Retry.';
}

export function formatExplicitResponseContract(contract: ExplicitResponseContract): string {
  const targetInstruction =
    contract.minimumWords > 0
      ? `Aim for ${contract.targetMinWords}-${contract.targetMaxWords} words and do not return fewer than ${contract.minimumWords} words.`
      : `Keep the answer concise and within the ${contract.maxWords}-word maximum.`;
  return [
    '## Explicit response contract',
    `The final answer must never exceed ${contract.maxWords} words. ${targetInstruction}`,
    'Count the complete final answer, including headings and list items. Finish cleanly; never truncate a sentence.',
    'Do not emit internal placeholders, output-location notices, hidden scaffolding, or duplicated sections.',
    'For factual requests, prefer concrete evidence and clearly distinguish observed facts, inference, and unavailable evidence.',
  ].join('\n');
}

export function assessExplicitResponseContract(
  prose: string,
  contract: ExplicitResponseContract,
): ExplicitResponseContractAssessment {
  const wordCount = countWords(prose);
  if (wordCount > contract.maxWords) {
    return Object.freeze({ ok: false, code: 'word_limit_exceeded', wordCount });
  }
  if (INTERNAL_MARKER.test(prose)) {
    return Object.freeze({ ok: false, code: 'internal_marker', wordCount });
  }
  if (hasSubstantialDuplicateRun(prose)) {
    return Object.freeze({ ok: false, code: 'duplicate_tail', wordCount });
  }
  if (wordCount < contract.minimumWords) {
    return Object.freeze({ ok: false, code: 'word_limit_below_target', wordCount });
  }
  return Object.freeze({ ok: true, wordCount });
}
