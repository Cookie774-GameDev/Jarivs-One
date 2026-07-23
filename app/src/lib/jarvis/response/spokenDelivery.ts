import type { JarvisResponseMode } from '@/lib/jarvis/contracts';
import type { JarvisVerifiedFacts } from './modeClassifier';
import type { JarvisStructuredRegion } from './tokenizer';

export interface JarvisSpokenDeliveryInput {
  proseWithPlaceholders: string;
  mode: JarvisResponseMode;
  structuredRegions?: readonly Pick<JarvisStructuredRegion, 'index' | 'kind' | 'valid'>[];
  verifiedFacts?: Readonly<
    Pick<JarvisVerifiedFacts, 'executionState' | 'terminalState' | 'modelState'>
  >;
}

const STRUCTURED_REGION_PLACEHOLDER = /\uE000JARVIS_REGION_\d+\uE001/g;
const STRUCTURED_DATA_PLACEHOLDER = 'the structured data shown on screen';
const FENCED_BLOCK = /(^|\r?\n)[ \t]*(```|~~~)[^\r\n]*\r?\n[\s\S]*?\r?\n[ \t]*\2[ \t]*(?=\r?\n|$)/g;
const MARKDOWN_LINK = /\[([^\]\r\n]+)\]\(https?:\/\/[^)\s]+(?:\s+"[^"]*")?\)/gi;
const INLINE_CODE = /`([^`\r\n]+)`/g;
const COMPLETE_SENTENCE = /[.!?\u3002\uFF01\uFF1F](?:["')\]]*)?$/u;
const SUMMARY_CHAR_THRESHOLD = 480;
const MAX_REFERENCE_LENGTH = 2048;
const KNOWN_PATH_EXTENSION =
  /\.(?:md|txt|json|ya?ml|toml|tsx?|jsx?|rs|py|sh|ps1|html?|css|sql|log|pdf|docx?|xlsx?|png|jpe?g|webp|gif|svg|zip|tar|gz|exe|msi)\b/gi;
const NON_HIERARCHICAL_URI_SCHEME =
  /^(?:blob|data|file|git|javascript|magnet|mailto|ms-appx|ms-settings|sftp|sms|ssh|tel|urn|vscode|vscode-insiders|vscode-remote)$/i;

const SEVERITY_PREFIX: Partial<Record<JarvisResponseMode, string>> = Object.freeze({
  warning: 'Warning.',
  action_failure: 'The action failed.',
  action_partial: 'The action is only partially complete.',
});

const TRUTH_SIGNAL: Partial<Record<JarvisResponseMode, RegExp>> = Object.freeze({
  action_success: /\b(?:completed|succeeded|successful|done)\b/i,
  action_running: /\b(?:queued|compiling|running|in progress|underway)\b/i,
  approval_required: /\b(?:approval|authorisation|authorization|permission)\b/i,
  warning:
    /\b(?:warning|caution|risk|unavailable|degraded|unverified|uncertain|failed|failure|timed out|cancelled|blocked)\b/i,
  action_failure: /\b(?:failed|failure|timed out|cancelled|could not|unable to)\b/i,
  action_partial: /\b(?:partial|partially|incomplete|remaining|unfinished)\b/i,
  status: /\b(?:cancelled|canceled|timed out|stopped before completion)\b/i,
});
const UNCERTAINTY_SIGNAL =
  /\b(?:uncertain(?:ty)?|unverified|not (?:yet )?verified|verification (?:is |remains )?(?:incomplete|pending)|unknown|cannot (?:confirm|verify|determine)|can't (?:confirm|verify|determine)|estimate(?:d)? only|(?:may|might)\s+(?:be|have|not|indicate|suggest|reflect|depend))\b/i;
const PATH_PROSE_BOUNDARY =
  /^(?:is|are|was|were|remain(?:s|ed)?|appear(?:s|ed)?|seem(?:s|ed)?|cannot|can't|couldn't|fail(?:s|ed)?|succeed(?:s|ed)?|complete(?:s|d)?|retry|try|open|use|check|contact|restart|reopen|review|please|warning)\b/i;

type UnsafeSpeechReferenceKind = 'link' | 'location';

interface UnsafeSpeechReference {
  start: number;
  end: number;
  kind: UnsafeSpeechReferenceKind;
}

function isReferenceBoundary(character: string | undefined): boolean {
  return character === undefined || /[\s([{"'`]/.test(character);
}

function isDrivePathStart(text: string, start: number): boolean {
  return (
    /[A-Za-z]/.test(text[start] ?? '') &&
    text[start + 1] === ':' &&
    (text[start + 2] === '\\' || text[start + 2] === '/')
  );
}

function isUncPathStart(text: string, start: number): boolean {
  return (
    (text[start] === '\\' && text[start + 1] === '\\') ||
    (text[start] === '/' && text[start + 1] === '/')
  );
}

function isUnixPathStart(text: string, start: number): boolean {
  if (text[start] !== '/' || text[start + 1] === '/' || !isReferenceBoundary(text[start - 1])) {
    return false;
  }
  const bounded = text.slice(start + 1, start + 1 + MAX_REFERENCE_LENGTH);
  return /^[A-Za-z0-9._-]+\/[^\s]/.test(bounded);
}

function schemeColon(text: string, start: number): number {
  if (!/[A-Za-z]/.test(text[start] ?? '') || !isReferenceBoundary(text[start - 1])) return -1;
  let cursor = start + 1;
  while (cursor - start <= 32 && /[A-Za-z0-9+.-]/.test(text[cursor] ?? '')) {
    cursor += 1;
  }
  if (cursor - start < 2 || text[cursor] !== ':' || /\s/.test(text[cursor + 1] ?? '')) {
    return -1;
  }
  const scheme = text.slice(start, cursor);
  const hierarchical = text[cursor + 1] === '/' && text[cursor + 2] === '/';
  if (!hierarchical && !NON_HIERARCHICAL_URI_SCHEME.test(scheme)) return -1;
  return cursor;
}

function trimReferencePunctuation(text: string, start: number, end: number): number {
  let trimmedEnd = end;
  while (
    trimmedEnd > start &&
    /[.,;:!?]/.test(text[trimmedEnd - 1] ?? '') &&
    !(text[trimmedEnd - 1] === '.' && /\.[A-Za-z0-9]{1,8}$/.test(text.slice(start, trimmedEnd)))
  ) {
    trimmedEnd -= 1;
  }
  return trimmedEnd;
}

function scanLinkEnd(text: string, start: number): number {
  let cursor = start;
  const delimiters: string[] = [];
  while (cursor < text.length) {
    const character = text[cursor]!;
    if (/[\s<>"'`]/.test(character)) break;
    const closing = { '(': ')', '[': ']', '{': '}' }[character];
    if (closing) {
      delimiters.push(closing);
      cursor += 1;
      continue;
    }
    if (character === ')' || character === ']' || character === '}') {
      if (delimiters.at(-1) !== character) break;
      delimiters.pop();
    }
    cursor += 1;
  }
  return trimReferencePunctuation(text, start, cursor);
}

function hasPathContinuationAhead(text: string, start: number): boolean {
  const limit = Math.min(text.length, start + MAX_REFERENCE_LENGTH);
  for (let cursor = start; cursor < limit; cursor += 1) {
    const character = text[cursor]!;
    if (character === '\\' || character === '/') return true;
    if (
      /[\r\n,;!?<>"'`]/.test(character) ||
      (character === '.' && !/[\p{L}\p{N}]/u.test(text[cursor + 1] ?? ''))
    ) {
      return false;
    }
  }
  return limit < text.length;
}

function scanPathEnd(text: string, start: number): number {
  let cursor = start;
  const delimiters: string[] = [];
  while (cursor < text.length) {
    const character = text[cursor]!;
    if (/[\r\n<>"'`]/.test(character)) break;
    if (/\s/.test(character) && delimiters.length === 0) {
      let nextTokenStart = cursor;
      while (/[ \t]/.test(text[nextTokenStart] ?? '')) nextTokenStart += 1;
      let nextTokenEnd = nextTokenStart;
      while (nextTokenEnd < text.length && !/[\s,;!?<>"'`]/.test(text[nextTokenEnd] ?? '')) {
        nextTokenEnd += 1;
      }
      const token = text.slice(nextTokenStart, nextTokenEnd);
      const proseCandidate = token.replace(/^[([{]+/, '').replace(/[)\]},.;:!?]+$/, '');
      const continuationAhead = hasPathContinuationAhead(text, nextTokenStart);
      if (
        !token ||
        (!/[\\/]/.test(token) &&
          !continuationAhead &&
          (PATH_PROSE_BOUNDARY.test(proseCandidate) || !/^[\p{L}\p{N}_.@+$%~()/-]+$/u.test(token)))
      ) {
        break;
      }
      cursor = nextTokenStart;
      continue;
    }
    const closing = { '(': ')', '[': ']', '{': '}' }[character];
    if (closing) {
      delimiters.push(closing);
      cursor += 1;
      continue;
    }
    if (character === ')' || character === ']' || character === '}') {
      if (delimiters.at(-1) !== character) break;
      delimiters.pop();
      cursor += 1;
      continue;
    }
    if (
      /[,;!?]/.test(character) ||
      (character === '.' && !/[\p{L}\p{N}]/u.test(text[cursor + 1] ?? ''))
    ) {
      break;
    }
    cursor += 1;
  }
  if (cursor - start > MAX_REFERENCE_LENGTH) {
    return trimReferencePunctuation(text, start, cursor);
  }
  const candidate = text.slice(start, cursor);
  let extensionEnd = -1;
  KNOWN_PATH_EXTENSION.lastIndex = 0;
  for (const match of candidate.matchAll(KNOWN_PATH_EXTENSION)) {
    extensionEnd = (match.index ?? 0) + match[0].length;
  }
  if (extensionEnd > 0) return start + extensionEnd;
  return trimReferencePunctuation(text, start, cursor);
}

function quotedPathReference(text: string, start: number): UnsafeSpeechReference | undefined {
  const quote = text[start];
  if (quote !== '"' && quote !== "'") return undefined;
  const pathStart = start + 1;
  if (
    !isDrivePathStart(text, pathStart) &&
    !isUncPathStart(text, pathStart) &&
    !isUnixPathStart(text, pathStart)
  ) {
    return undefined;
  }
  const closing = text.indexOf(quote, pathStart);
  if (closing < 0) return undefined;
  return { start, end: closing + 1, kind: 'location' };
}

export function findUnsafeSpeechReferences(text: string): readonly UnsafeSpeechReference[] {
  const references: UnsafeSpeechReference[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const quoted = quotedPathReference(text, index);
    if (quoted) {
      references.push(quoted);
      index = quoted.end - 1;
      continue;
    }
    const colon = schemeColon(text, index);
    if (colon >= 0) {
      const end = scanLinkEnd(text, index);
      if (end > colon + 1) {
        references.push({ start: index, end, kind: 'link' });
        index = end - 1;
        continue;
      }
    }
    if (
      isReferenceBoundary(text[index - 1]) &&
      text.slice(index, index + 4).toLowerCase() === 'www.'
    ) {
      const end = scanLinkEnd(text, index);
      references.push({ start: index, end, kind: 'link' });
      index = end - 1;
      continue;
    }
    if (
      isReferenceBoundary(text[index - 1]) &&
      (isDrivePathStart(text, index) || isUncPathStart(text, index) || isUnixPathStart(text, index))
    ) {
      const end = scanPathEnd(text, index);
      if (end > index) {
        references.push({ start: index, end, kind: 'location' });
        index = end - 1;
      }
    }
  }
  return Object.freeze(references.map((reference) => Object.freeze(reference)));
}

export function containsUnsafeSpeechReference(text: string): boolean {
  return findUnsafeSpeechReferences(text).length > 0;
}

function replaceUnsafeSpeechReferences(text: string): string {
  const references = findUnsafeSpeechReferences(text);
  if (references.length === 0) return text;
  let result = '';
  let cursor = 0;
  for (const reference of references) {
    result += text.slice(cursor, reference.start);
    result += reference.kind === 'link' ? 'the referenced link' : 'the referenced location';
    cursor = reference.end;
  }
  return result + text.slice(cursor);
}

function looksLikeUnspokenInlineCode(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (
    /[\\/]/.test(trimmed) ||
    /^[A-Za-z]:/.test(trimmed) ||
    /^\.\.?[/\\]/.test(trimmed) ||
    /\.(?:md|txt|json|ya?ml|toml|tsx?|jsx?|rs|py|sh|ps1|html?|css|sql)$/i.test(trimmed)
  ) {
    return true;
  }
  try {
    const parsed = JSON.parse(trimmed);
    return Boolean(parsed) && typeof parsed === 'object';
  } catch {
    return /[{};=]|\b(?:const|let|var|function|class|return)\b/.test(trimmed);
  }
}

function looksLikeJsonStart(text: string, start: number): boolean {
  let cursor = start + 1;
  while (cursor < text.length && /\s/.test(text[cursor]!)) cursor += 1;
  const next = text[cursor];
  if (text[start] === '{') return next === '"' || next === '}';
  return (
    next === undefined ||
    next === ']' ||
    next === '"' ||
    next === '{' ||
    next === '[' ||
    next === '-' ||
    /\d/.test(next) ||
    text.startsWith('true', cursor) ||
    text.startsWith('false', cursor) ||
    text.startsWith('null', cursor)
  );
}

function replaceJsonStructures(text: string): string {
  let result = '';
  let copyStart = 0;
  let candidateStart = -1;
  const stack: string[] = [];
  let insideString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (candidateStart < 0) {
      if ((character === '{' || character === '[') && looksLikeJsonStart(text, index)) {
        candidateStart = index;
        stack.push(character);
      }
      continue;
    }

    if (insideString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        insideString = false;
      }
      continue;
    }

    if (character === '"') {
      insideString = true;
      continue;
    }
    if (character === '{' || character === '[') {
      stack.push(character);
      continue;
    }
    if (character !== '}' && character !== ']') continue;

    const opener = stack.pop();
    const matches = (opener === '{' && character === '}') || (opener === '[' && character === ']');
    if (!matches) {
      result += text.slice(copyStart, candidateStart);
      result += STRUCTURED_DATA_PLACEHOLDER;
      copyStart = index + 1;
      candidateStart = -1;
      stack.length = 0;
      insideString = false;
      escaped = false;
      continue;
    }
    if (stack.length === 0) {
      result += text.slice(copyStart, candidateStart);
      result += STRUCTURED_DATA_PLACEHOLDER;
      copyStart = index + 1;
      candidateStart = -1;
    }
  }
  if (candidateStart >= 0) {
    result += text.slice(copyStart, candidateStart);
    result += STRUCTURED_DATA_PLACEHOLDER;
    copyStart = text.length;
  }
  return result + text.slice(copyStart);
}

export function containsUnsafeSpeechJsonStructure(text: string): boolean {
  return replaceJsonStructures(text) !== text;
}

function speechSafeStructuredRegions(
  input: string,
  regions: JarvisSpokenDeliveryInput['structuredRegions'],
): string {
  const byIndex = new Map(regions?.map((region) => [region.index, region]) ?? []);
  return input.replace(STRUCTURED_REGION_PLACEHOLDER, (placeholder) => {
    const index = Number(/\d+/.exec(placeholder)?.[0]);
    const region = byIndex.get(index);
    if (!region?.valid) return '';
    return region.kind === 'url' || region.kind === 'citation' ? 'the referenced link' : '';
  });
}

function stripUnsafeSpeechStructures(
  input: string,
  regions: JarvisSpokenDeliveryInput['structuredRegions'],
): string {
  let text = speechSafeStructuredRegions(input.replace(FENCED_BLOCK, '$1'), regions).replace(
    MARKDOWN_LINK,
    '$1',
  );
  text = text.replace(INLINE_CODE, (_match, value: string) =>
    looksLikeUnspokenInlineCode(value) ? 'the referenced location' : value,
  );
  text = replaceJsonStructures(text);
  text = replaceUnsafeSpeechReferences(text);
  return text
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([.!?]){2,}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function sentenceList(text: string): string[] {
  const sentences: string[] = [];
  let sentenceStart = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (!'.!?\u3002\uFF01\uFF1F'.includes(character)) continue;
    if (character === '.' && /\d/.test(text[index - 1] ?? '') && /\d/.test(text[index + 1] ?? '')) {
      continue;
    }
    if (
      character === '.' &&
      /\b(?:e\.g|i\.e|mr|mrs|ms|dr|prof|sr|jr|vs|etc)\.$/i.test(
        text.slice(Math.max(0, index - 8), index + 1),
      )
    ) {
      continue;
    }
    let end = index + 1;
    while (/["')\]]/.test(text[end] ?? '')) end += 1;
    if (end < text.length && !/\s/.test(text[end]!)) continue;
    const sentence = text.slice(sentenceStart, end).trim();
    if (sentence) sentences.push(sentence);
    sentenceStart = end;
    while (/\s/.test(text[sentenceStart] ?? '')) sentenceStart += 1;
    index = sentenceStart - 1;
  }
  const remainder = text.slice(sentenceStart).trim();
  if (remainder) sentences.push(`${remainder}.`);
  return sentences.map((sentence) => sentence.trim()).filter(Boolean);
}

function verifiedTruthAnchor(
  mode: JarvisResponseMode,
  facts: JarvisSpokenDeliveryInput['verifiedFacts'],
): string | undefined {
  const executionState = facts?.executionState;
  if (
    mode === 'warning' &&
    executionState?.verifiedBy === 'provider' &&
    ['completed', 'partial', 'failed', 'cancelled', 'timed_out'].includes(executionState.status)
  ) {
    return `The provider reported ${executionState.status.replace('_', ' ')}, but verification is still required.`;
  }
  const executionAnchor = executionState
    ? {
        queued: 'The action is queued.',
        compiling: 'The action is being prepared.',
        running: 'The action is running.',
        awaiting_approval: 'Approval is required before execution.',
        partial: 'The action is only partially complete.',
        completed: 'The action completed.',
        failed: 'The action failed.',
        cancelled: 'The action was cancelled before completion.',
        timed_out: 'The action timed out before completion.',
      }[executionState.status]
    : undefined;
  if (executionAnchor) return executionAnchor;
  const terminalState = facts?.terminalState;
  const terminalAnchor = terminalState
    ? {
        queued: 'The terminal action is queued.',
        running: 'The terminal action is running.',
        completed: 'The terminal action completed.',
        failed: 'The terminal action failed.',
        cancelled: 'The terminal action was cancelled before completion.',
        timed_out: 'The terminal action timed out before completion.',
      }[terminalState]
    : undefined;
  if (terminalAnchor) return terminalAnchor;
  if (mode === 'warning' && facts?.modelState === 'unavailable') {
    return 'Warning: the selected model is unavailable.';
  }
  if (mode === 'warning' && facts?.modelState === 'degraded') {
    return 'Warning: the selected model is degraded.';
  }
  return undefined;
}

function summarizeSpeech(
  text: string,
  mode: JarvisResponseMode,
  facts: JarvisSpokenDeliveryInput['verifiedFacts'],
): string {
  const sentences = sentenceList(text);
  if (sentences.length <= 2) return text;
  const truthSignal = TRUTH_SIGNAL[mode];
  const truthSentence = truthSignal
    ? sentences.find((sentence) => truthSignal.test(sentence))
    : undefined;
  const uncertaintySentence = sentences.find((sentence) => UNCERTAINTY_SIGNAL.test(sentence));
  const truthAnchor = verifiedTruthAnchor(mode, facts);
  const severityPrefix = SEVERITY_PREFIX[mode];
  const prioritized = [
    ...(truthSentence
      ? [truthSentence]
      : truthAnchor
        ? [truthAnchor]
        : severityPrefix
          ? [severityPrefix]
          : []),
    ...(uncertaintySentence ? [uncertaintySentence] : []),
  ].filter((sentence, index, values) => values.indexOf(sentence) === index);
  for (const sentence of sentences) {
    if (prioritized.length >= 2) break;
    if (!prioritized.includes(sentence)) prioritized.push(sentence);
  }
  return prioritized.slice(0, 2).join(' ');
}

function pronounceModelName(
  prefix: string,
  major: string,
  minor: string | undefined,
  suffix: string | undefined,
): string {
  return [prefix, major, minor ? `point ${minor}` : '', suffix ? suffix.toLowerCase() : '']
    .filter(Boolean)
    .join(' ');
}

function pronounceTechnicalNames(text: string): string {
  return text
    .replace(/\bopenai\b/gi, 'Open A I')
    .replace(/\bxai\b/gi, 'x A I')
    .replace(/\bdeepseek\b/gi, 'Deep Seek')
    .replace(/\bgroq\b/gi, 'Grok')
    .replace(/\bollama\b/gi, 'Ollama')
    .replace(/\banthropic\b/gi, 'Anthropic')
    .replace(/\bgpt[-\s]?4o\b/gi, 'G P T 4 o')
    .replace(
      /\bgpt[-\s]?oss(?::?[-\s]?(\d+)([a-z]))?\b/gi,
      (_match, size: string | undefined, unit: string | undefined) =>
        ['G P T O S S', size, unit?.toUpperCase()].filter(Boolean).join(' '),
    )
    .replace(
      /\bclaude[-\s]+(sonnet|opus|haiku)[-\s]+(\d+)(?:([.-])(\d+))?\b/gi,
      (
        _match,
        variant: string,
        major: string,
        separator: string | undefined,
        minor: string | undefined,
      ) =>
        [
          'Claude',
          variant[0]!.toUpperCase() + variant.slice(1).toLowerCase(),
          major,
          minor ? (separator === '.' ? `point ${minor}` : minor) : '',
        ]
          .filter(Boolean)
          .join(' '),
    )
    .replace(
      /\bgpt[-\s]?(\d+)(?:\.(\d+))?(?:[-\s]?(mini|nano|turbo|pro|codex))?\b/gi,
      (_match, major: string, minor: string | undefined, suffix: string | undefined) =>
        pronounceModelName('G P T', major, minor, suffix),
    )
    .replace(
      /\b(llama|claude|gemini|qwen|mistral)[-\s]?(\d+)(?:\.(\d+))?\b/gi,
      (_match, family: string, major: string, minor: string | undefined) =>
        pronounceModelName(
          family[0]!.toUpperCase() + family.slice(1).toLowerCase(),
          major,
          minor,
          undefined,
        ),
    )
    .replace(/\bo(\d+)(?:[-\s]?(mini|pro))?\b/gi, (_match, version: string, suffix?: string) =>
      ['o', version, suffix?.toLowerCase()].filter(Boolean).join(' '),
    )
    .replace(/\bnative[-\s]?api\b/gi, 'native A P I')
    .replace(/\bapi\b/gi, 'A P I')
    .replace(/\s+\/\s+/g, ', ');
}

export function deriveJarvisSpokenText(input: Readonly<JarvisSpokenDeliveryInput>): string {
  const safeSpeech = stripUnsafeSpeechStructures(
    input.proseWithPlaceholders,
    input.structuredRegions,
  );
  if (!safeSpeech) return '';
  const sentences = sentenceList(safeSpeech);
  const truthAnchor = verifiedTruthAnchor(input.mode, input.verifiedFacts);
  const shouldSummarize =
    input.mode === 'long_form_delivery' ||
    (input.mode !== 'sensitive' && safeSpeech.length > SUMMARY_CHAR_THRESHOLD) ||
    ((Boolean(SEVERITY_PREFIX[input.mode]) ||
      Boolean(TRUTH_SIGNAL[input.mode]) ||
      Boolean(truthAnchor)) &&
      sentences.length > 2);
  const summarized = shouldSummarize
    ? summarizeSpeech(safeSpeech, input.mode, input.verifiedFacts)
    : safeSpeech;
  const pronounced = pronounceTechnicalNames(summarized).trim();
  if (!pronounced) return '';
  return COMPLETE_SENTENCE.test(pronounced) ? pronounced : `${pronounced}.`;
}
