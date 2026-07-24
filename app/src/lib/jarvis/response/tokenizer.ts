import { findJarvisDisplayLinks } from './referenceParser';

export type JarvisStructuredRegionKind =
  | 'code_fence'
  | 'action'
  | 'plan'
  | 'question'
  | 'permission'
  | 'table'
  | 'diff'
  | 'citation'
  | 'url'
  | 'quoted_text';

export interface JarvisStructuredRegion {
  index: number;
  kind: JarvisStructuredRegionKind;
  bytes: string;
  valid: boolean;
  referenceTarget?: string;
  errorCode?: 'unclosed_fence' | 'invalid_json' | 'invalid_shape';
}

export interface TokenizedJarvisResponse {
  proseWithPlaceholders: string;
  regions: readonly JarvisStructuredRegion[];
}

type Span = Omit<JarvisStructuredRegion, 'index'> & { start: number; end: number };

export function jarvisRegionPlaceholder(index: number): string {
  return `\uE000JARVIS_REGION_${index}\uE001`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

function isValidQuestion(value: unknown): boolean {
  return isRecord(value) && isNonEmptyString(value.prompt);
}

function validateStructuredJson(kind: JarvisStructuredRegionKind, body: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.trim());
  } catch {
    return { valid: false as const, errorCode: 'invalid_json' as const };
  }
  if (!isRecord(parsed)) return { valid: false as const, errorCode: 'invalid_shape' as const };
  const valid =
    kind === 'action'
      ? isNonEmptyString(parsed.id) &&
        /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_.-]*$/i.test(parsed.id.trim()) &&
        (parsed.params === undefined || isRecord(parsed.params)) &&
        (parsed.rationale === undefined || typeof parsed.rationale === 'string')
      : kind === 'plan'
        ? isNonEmptyString(parsed.summary) || isNonEmptyStringArray(parsed.steps)
        : kind === 'question'
          ? Array.isArray(parsed.questions) &&
            parsed.questions.length > 0 &&
            parsed.questions.length <= 3 &&
            parsed.questions.every(isValidQuestion)
          : kind === 'permission'
            ? isNonEmptyString(parsed.title) && isNonEmptyString(parsed.description)
            : true;
  return valid
    ? { valid: true as const }
    : { valid: false as const, errorCode: 'invalid_shape' as const };
}

function fenceKind(tag: string): JarvisStructuredRegionKind {
  const normalized = tag.trim().toLowerCase().split(/\s+/)[0] ?? '';
  if (normalized === 'action') return 'action';
  if (normalized === 'jarvis_plan') return 'plan';
  if (normalized === 'jarvis_question') return 'question';
  if (normalized === 'jarvis_permission') return 'permission';
  if (normalized === 'diff' || normalized === 'patch') return 'diff';
  return 'code_fence';
}

function overlaps(spans: readonly Span[], start: number, end: number): boolean {
  return spans.some((span) => start < span.end && end > span.start);
}

function lineEndWithoutBreak(text: string, start: number): number {
  const newline = text.indexOf('\n', start);
  const end = newline === -1 ? text.length : newline;
  return end > start && text[end - 1] === '\r' ? end - 1 : end;
}

function addLineBlocks(text: string, spans: Span[]): void {
  const lines = [...text.matchAll(/^.*(?:\r?\n|$)/gm)].filter((match) => match[0].length > 0);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index]!;
    const start = match.index ?? 0;
    const line = match[0].replace(/\r?\n$/, '');
    if (overlaps(spans, start, start + match[0].length)) continue;

    if (/^\s*>/.test(line)) {
      let endIndex = index;
      while (endIndex + 1 < lines.length) {
        const next = lines[endIndex + 1]!;
        if (!/^\s*>/.test(next[0].replace(/\r?\n$/, ''))) break;
        if (overlaps(spans, next.index ?? 0, (next.index ?? 0) + next[0].length)) break;
        endIndex += 1;
      }
      const endLine = lines[endIndex]!;
      const end = lineEndWithoutBreak(text, endLine.index ?? 0);
      spans.push({ start, end, kind: 'quoted_text', bytes: text.slice(start, end), valid: true });
      index = endIndex;
      continue;
    }

    const separator = lines[index + 1]?.[0].replace(/\r?\n$/, '') ?? '';
    if (line.includes('|') && /^\s*\|?\s*:?-{3,}/.test(separator) && separator.includes('|')) {
      let endIndex = index + 1;
      while (endIndex + 1 < lines.length) {
        const next = lines[endIndex + 1]!;
        const nextLine = next[0].replace(/\r?\n$/, '');
        if (!nextLine.includes('|') || !nextLine.trim()) break;
        if (overlaps(spans, next.index ?? 0, (next.index ?? 0) + next[0].length)) break;
        endIndex += 1;
      }
      const endLine = lines[endIndex]!;
      const end = lineEndWithoutBreak(text, endLine.index ?? 0);
      spans.push({ start, end, kind: 'table', bytes: text.slice(start, end), valid: true });
      index = endIndex;
    }
  }
}

export function tokenizeJarvisResponse(text: string): Readonly<TokenizedJarvisResponse> {
  const spans: Span[] = [];
  const opener = /^[ \t]*```([^\r\n]*)\r?\n/gm;
  for (const match of text.matchAll(opener)) {
    const start = match.index ?? 0;
    if (overlaps(spans, start, start + match[0].length)) continue;
    const bodyStart = start + match[0].length;
    const closer = /^[ \t]*```[ \t]*(?:\r?\n|$)/gm;
    closer.lastIndex = bodyStart;
    const close = closer.exec(text);
    const kind = fenceKind(match[1] ?? '');
    if (!close) {
      spans.push({
        start,
        end: text.length,
        kind,
        bytes: text.slice(start),
        valid: false,
        errorCode: 'unclosed_fence',
      });
      break;
    }
    const closingBytes = close[0].replace(/\r?\n$/, '');
    const end = (close.index ?? bodyStart) + closingBytes.length;
    const bytes = text.slice(start, end);
    const jsonValidation =
      kind === 'action' || kind === 'plan' || kind === 'question' || kind === 'permission'
        ? validateStructuredJson(kind, text.slice(bodyStart, close.index))
        : { valid: true as const };
    spans.push({ start, end, kind, bytes, ...jsonValidation });
  }

  addLineBlocks(text, spans);

  for (const link of findJarvisDisplayLinks(text)) {
    const { start, end } = link;
    if (!overlaps(spans, start, end)) {
      spans.push({
        start,
        end,
        kind: link.syntax === 'markdown' ? 'citation' : 'url',
        bytes: text.slice(start, end),
        valid: true,
        referenceTarget: link.target,
      });
    }
  }

  spans.sort((left, right) => left.start - right.start || left.end - right.end);
  const regions = spans.map(
    (span, index): JarvisStructuredRegion =>
      Object.freeze({
        index,
        kind: span.kind,
        bytes: span.bytes,
        valid: span.valid,
        ...(span.referenceTarget ? { referenceTarget: span.referenceTarget } : {}),
        ...(span.errorCode ? { errorCode: span.errorCode } : {}),
      }),
  );
  let cursor = 0;
  let proseWithPlaceholders = '';
  for (const [index, span] of spans.entries()) {
    proseWithPlaceholders += text.slice(cursor, span.start) + jarvisRegionPlaceholder(index);
    cursor = span.end;
  }
  proseWithPlaceholders += text.slice(cursor);
  return Object.freeze({ proseWithPlaceholders, regions: Object.freeze(regions) });
}

export function restoreJarvisStructuredRegions(
  proseWithPlaceholders: string,
  regions: readonly JarvisStructuredRegion[],
): string {
  let restored = proseWithPlaceholders;
  for (const region of regions) {
    restored = restored.replace(jarvisRegionPlaceholder(region.index), region.bytes);
  }
  return restored;
}
