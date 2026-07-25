import type { DeepReadonly } from './contracts';

export type ContextNoteSyntaxDiagnosticKind =
  | 'invalid_block_id'
  | 'invalid_wiki_target'
  | 'unsafe_markdown_target';

export interface ContextNoteSyntaxDiagnosticV1 {
  kind: ContextNoteSyntaxDiagnosticKind;
  line: number;
  column: number;
}

export interface ContextNoteHeadingV1 {
  text: string;
  slug: string;
  level: number;
  line: number;
}

export interface ContextNoteBlockV1 {
  id: string;
  line: number;
}

export interface ContextNoteWikiLinkV1 {
  raw: string;
  targetTitle: string;
  targetNoteId?: string;
  heading?: string;
  blockId?: string;
  alias?: string;
  embed: boolean;
  line: number;
  column: number;
}

export interface ContextNoteMarkdownLinkV1 {
  label: string;
  target: string;
  image: boolean;
  external: boolean;
  line: number;
  column: number;
}

export interface ContextNoteSyntaxV1 {
  version: 1;
  bodyStartLine: number;
  aliases: string[];
  tags: string[];
  headings: ContextNoteHeadingV1[];
  blocks: ContextNoteBlockV1[];
  wikiLinks: ContextNoteWikiLinkV1[];
  markdownLinks: ContextNoteMarkdownLinkV1[];
  diagnostics: ContextNoteSyntaxDiagnosticV1[];
}

export type ContextNoteSyntaxParseResult =
  | Readonly<{ ok: true; value: DeepReadonly<ContextNoteSyntaxV1> }>
  | Readonly<{
      ok: false;
      reason:
        | 'note_content_invalid'
        | 'note_content_too_large'
        | 'note_content_control_character'
        | 'frontmatter_unterminated'
        | 'duplicate_block_id';
      detail?: string;
    }>;

export interface ContextNoteReferenceDocumentV1 {
  noteId: string;
  title: string;
  syntax: DeepReadonly<ContextNoteSyntaxV1>;
}

export interface ContextNoteReferenceIndexV1 {
  version: 1;
  documents: ContextNoteReferenceDocumentV1[];
}

export type ContextNoteReferenceIndexResult =
  | Readonly<{ ok: true; value: DeepReadonly<ContextNoteReferenceIndexV1> }>
  | Readonly<{
      ok: false;
      reason: 'invalid_reference_document' | 'duplicate_block_id';
      detail?: string;
      noteIds?: readonly string[];
    }>;

export type ContextNoteReferenceResolutionV1 =
  | Readonly<{
      state: 'resolved';
      link: DeepReadonly<ContextNoteWikiLinkV1>;
      targetNoteId: string;
      targetHeadingSlug?: string;
      targetBlockId?: string;
    }>
  | Readonly<{
      state: 'missing_note';
      link: DeepReadonly<ContextNoteWikiLinkV1>;
    }>
  | Readonly<{
      state: 'ambiguous_note';
      link: DeepReadonly<ContextNoteWikiLinkV1>;
      candidateNoteIds: readonly string[];
    }>
  | Readonly<{
      state: 'missing_heading' | 'missing_block';
      link: DeepReadonly<ContextNoteWikiLinkV1>;
      targetNoteId: string;
    }>;

export interface ContextNoteReferenceCompletionV1 {
  kind: 'note' | 'alias' | 'heading' | 'block';
  noteId: string;
  label: string;
  insertText: string;
}

export interface ContextEmbedPlanEntryV1 {
  state: 'resolved' | 'cycle' | 'depth_limited' | 'unresolved';
  sourceNoteId: string;
  targetLabel: string;
  targetNoteId?: string;
  targetHeadingSlug?: string;
  targetBlockId?: string;
  depth: number;
  path: string[];
}

export interface ContextNoteUnlinkedMentionV1 {
  matchedText: string;
  label: string;
  matchKind: 'title' | 'alias';
  candidateNoteIds: string[];
  line: number;
  column: number;
  confidence: number;
}

const MAX_CONTENT_CHARACTERS = 1_048_576;
const MAX_FRONTMATTER_LINES = 200;
const MAX_ALIASES = 64;
const MAX_TAGS = 128;
const MAX_HEADINGS = 10_000;
const MAX_BLOCKS = 100_000;
const MAX_LINKS = 10_000;
const MAX_DOCUMENTS = 100_000;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const BLOCK_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const SAFE_EXTERNAL_SCHEMES = new Set(['http', 'https', 'mailto']);
const SAFE_INTERNAL_SCHEMES = new Set(['vibespace']);

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => deepFreeze(entry))) as DeepReadonly<T>;
  }
  if (value && typeof value === 'object') {
    const copy: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) copy[key] = deepFreeze(entry);
    return Object.freeze(copy) as DeepReadonly<T>;
  }
  return value as DeepReadonly<T>;
}

function safeText(value: string, maximum: number): string | null {
  const text = value.trim();
  return !text || text.length > maximum || CONTROL_CHARACTERS.test(text) ? null : text;
}

function folded(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
}

function uniqueText(values: readonly string[], maximum: number): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const text = safeText(value, 500);
    if (!text) continue;
    const key = folded(text);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= maximum) break;
  }
  return result;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function splitInlineList(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return [unquote(trimmed)];
  const inner = trimmed.slice(1, -1);
  const result: string[] = [];
  let buffer = '';
  let quote: '"' | "'" | null = null;
  for (const character of inner) {
    if ((character === '"' || character === "'") && (!quote || quote === character)) {
      quote = quote ? null : character;
      buffer += character;
    } else if (character === ',' && !quote) {
      result.push(unquote(buffer));
      buffer = '';
    } else {
      buffer += character;
    }
  }
  if (buffer.trim()) result.push(unquote(buffer));
  return result;
}

function parseFrontmatter(
  lines: readonly string[],
):
  | Readonly<{ ok: true; aliases: string[]; tags: string[]; bodyStart: number }>
  | Readonly<{ ok: false }> {
  if (lines[0]?.trim() !== '---') {
    return { ok: true, aliases: [], tags: [], bodyStart: 0 };
  }
  const searchEnd = Math.min(lines.length, MAX_FRONTMATTER_LINES);
  let close = -1;
  for (let index = 1; index < searchEnd; index += 1) {
    if (lines[index]?.trim() === '---') {
      close = index;
      break;
    }
  }
  if (close < 0) return { ok: false };

  const aliases: string[] = [];
  const tags: string[] = [];
  let collecting: 'aliases' | 'tags' | null = null;
  for (let index = 1; index < close; index += 1) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const property = /^(aliases|tags)\s*:\s*(.*)$/iu.exec(trimmed);
    if (property) {
      collecting = property[1]!.toLocaleLowerCase('en-US') as 'aliases' | 'tags';
      const rawValue = property[2] ?? '';
      if (rawValue) {
        const values = splitInlineList(rawValue);
        (collecting === 'aliases' ? aliases : tags).push(...values);
        collecting = null;
      }
      continue;
    }
    const item = collecting ? /^-\s+(.+?)\s*$/u.exec(trimmed) : null;
    if (item?.[1]) {
      (collecting === 'aliases' ? aliases : tags).push(unquote(item[1]));
      continue;
    }
    collecting = null;
  }
  return {
    ok: true,
    aliases: uniqueText(aliases, MAX_ALIASES),
    tags: uniqueText(
      tags.map((tag) => tag.replace(/^#/u, '')),
      MAX_TAGS,
    ),
    bodyStart: close + 1,
  };
}

function markdownHeadingText(value: string): string | null {
  const text = value
    .replace(/\s+#+\s*$/u, '')
    .replace(/[*_~]/gu, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, '$1')
    .replace(/\s+/gu, ' ');
  return safeText(text, 500);
}

function headingSlug(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/\p{Mark}+/gu, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 200);
  return normalized || 'section';
}

function maskInlineCode(line: string): string {
  const characters = line.split('');
  let index = 0;
  while (index < characters.length) {
    if (characters[index] !== '`') {
      index += 1;
      continue;
    }
    let run = 1;
    while (characters[index + run] === '`') run += 1;
    let close = index + run;
    while (close < characters.length) {
      if (characters[close] !== '`') {
        close += 1;
        continue;
      }
      let closeRun = 1;
      while (characters[close + closeRun] === '`') closeRun += 1;
      if (closeRun === run) break;
      close += closeRun;
    }
    if (close >= characters.length) {
      index += run;
      continue;
    }
    for (let offset = index; offset < close + run; offset += 1) characters[offset] = ' ';
    index = close + run;
  }
  return characters.join('');
}

function markdownFenceMarker(
  line: string,
  closing = false,
): Readonly<{ character: '`' | '~'; length: number }> | null {
  const match = (closing ? /^ {0,3}(`{3,}|~{3,})[ \t]*$/u : /^ {0,3}(`{3,}|~{3,})/u).exec(line);
  if (!match?.[1]) return null;
  return {
    character: match[1][0] as '`' | '~',
    length: match[1].length,
  };
}

interface MarkdownLinkCandidate {
  raw: string;
  label: string;
  target: string;
  image: boolean;
  index: number;
}

function markdownLinkCandidates(line: string): MarkdownLinkCandidate[] {
  const candidates: MarkdownLinkCandidate[] = [];
  let cursor = 0;
  while (cursor < line.length) {
    const image = line[cursor] === '!' && line[cursor + 1] === '[';
    const open = image ? cursor + 1 : cursor;
    if (line[open] !== '[' || escapedAt(line, cursor)) {
      cursor += 1;
      continue;
    }

    let labelDepth = 1;
    let labelClose = open + 1;
    for (; labelClose < line.length; labelClose += 1) {
      if (escapedAt(line, labelClose)) continue;
      if (line[labelClose] === '[') labelDepth += 1;
      if (line[labelClose] === ']') {
        labelDepth -= 1;
        if (labelDepth === 0) break;
      }
    }
    if (labelDepth !== 0 || line[labelClose + 1] !== '(') {
      cursor = open + 1;
      continue;
    }

    let targetDepth = 1;
    let targetClose = labelClose + 2;
    for (; targetClose < line.length; targetClose += 1) {
      if (escapedAt(line, targetClose)) continue;
      if (line[targetClose] === '(') targetDepth += 1;
      if (line[targetClose] === ')') {
        targetDepth -= 1;
        if (targetDepth === 0) break;
      }
    }
    if (targetDepth !== 0) {
      cursor = labelClose + 1;
      continue;
    }

    candidates.push({
      raw: line.slice(cursor, targetClose + 1),
      label: line.slice(open + 1, labelClose),
      target: line.slice(labelClose + 2, targetClose),
      image,
      index: cursor,
    });
    cursor = targetClose + 1;
  }
  return candidates;
}

function escapedAt(line: string, index: number): boolean {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && line[cursor] === '\\'; cursor -= 1) {
    slashes += 1;
  }
  return slashes % 2 === 1;
}

function parseWikiTarget(
  raw: string,
): Omit<ContextNoteWikiLinkV1, 'raw' | 'embed' | 'line' | 'column'> | null {
  const separator = raw.indexOf('|');
  const target = (separator >= 0 ? raw.slice(0, separator) : raw).trim();
  const alias = separator >= 0 ? safeText(raw.slice(separator + 1), 240) : undefined;
  if (!target || target.length > 400 || CONTROL_CHARACTERS.test(target)) return null;
  const hash = target.indexOf('#');
  const targetTitle = (hash >= 0 ? target.slice(0, hash) : target).trim();
  const fragment = hash >= 0 ? target.slice(hash + 1).trim() : '';
  if (!targetTitle && !fragment) return null;
  if (targetTitle.length > 240 || fragment.length > 240) return null;
  if (fragment.startsWith('^')) {
    const blockId = fragment.slice(1);
    if (!BLOCK_ID.test(blockId)) return null;
    return { targetTitle, blockId, ...(alias ? { alias } : {}) };
  }
  const heading = fragment ? safeText(fragment, 240) : undefined;
  if (fragment && !heading) return null;
  return { targetTitle, ...(heading ? { heading } : {}), ...(alias ? { alias } : {}) };
}

function safeMarkdownTarget(raw: string): Readonly<{ target: string; external: boolean }> | null {
  const target = raw.trim().replace(/^<|>$/gu, '');
  if (
    !target ||
    target.length > 400 ||
    CONTROL_CHARACTERS.test(target) ||
    target.startsWith('//')
  ) {
    return null;
  }
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/u.exec(target)?.[1]?.toLocaleLowerCase('en-US');
  if (!scheme) return { target, external: false };
  if (SAFE_EXTERNAL_SCHEMES.has(scheme)) return { target, external: true };
  if (SAFE_INTERNAL_SCHEMES.has(scheme)) return { target, external: false };
  return null;
}

function parseDocumentSyntax(
  lines: readonly string[],
  frontmatter: Extract<ReturnType<typeof parseFrontmatter>, { ok: true }>,
): Readonly<{ ok: true; syntax: ContextNoteSyntaxV1 }> | Readonly<{ ok: false; blockId: string }> {
  const headings: ContextNoteHeadingV1[] = [];
  const blocks: ContextNoteBlockV1[] = [];
  const wikiLinks: ContextNoteWikiLinkV1[] = [];
  const markdownLinks: ContextNoteMarkdownLinkV1[] = [];
  const diagnostics: ContextNoteSyntaxDiagnosticV1[] = [];
  const headingSlugs = new Map<string, number>();
  const blockIds = new Set<string>();
  let fence: Readonly<{ character: '`' | '~'; length: number }> | null = null;

  for (let index = frontmatter.bodyStart; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const lineNumber = index + 1;
    const fenceMarker = markdownFenceMarker(line);
    if (fence) {
      const closing = markdownFenceMarker(line, true);
      if (closing?.character === fence.character && closing.length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (fenceMarker) {
      fence = fenceMarker;
      continue;
    }
    if (/^(?: {4}|\t)/u.test(line)) continue;

    const visible = maskInlineCode(line);
    const heading = /^(#{1,6})[ \t]+(.+?)\s*$/u.exec(visible);
    if (heading?.[2] && headings.length < MAX_HEADINGS) {
      const text = markdownHeadingText(heading[2]);
      if (text) {
        const base = headingSlug(text);
        const offset = headingSlugs.get(base) ?? 0;
        headingSlugs.set(base, offset + 1);
        headings.push({
          text,
          slug: offset === 0 ? base : `${base}-${offset}`,
          level: heading[1]!.length,
          line: lineNumber,
        });
      }
    }

    const block = /(?:^|\s)\^(.+?)\s*$/u.exec(visible);
    if (block?.[1] && blocks.length < MAX_BLOCKS) {
      const id = block[1].trim();
      if (!BLOCK_ID.test(id)) {
        diagnostics.push({
          kind: 'invalid_block_id',
          line: lineNumber,
          column: Math.max(1, visible.lastIndexOf('^') + 1),
        });
      } else {
        const key = folded(id);
        if (blockIds.has(key)) return { ok: false, blockId: id };
        blockIds.add(key);
        blocks.push({ id, line: lineNumber });
      }
    }

    if (wikiLinks.length < MAX_LINKS) {
      for (const match of visible.matchAll(/(!)?\[\[([^\]\r\n]{1,500})\]\]/gu)) {
        const column = (match.index ?? 0) + 1;
        if (escapedAt(visible, match.index ?? 0)) continue;
        const target = parseWikiTarget(match[2] ?? '');
        if (!target) {
          diagnostics.push({ kind: 'invalid_wiki_target', line: lineNumber, column });
          continue;
        }
        wikiLinks.push({
          raw: match[0],
          ...target,
          embed: Boolean(match[1]),
          line: lineNumber,
          column,
        });
        if (wikiLinks.length >= MAX_LINKS) break;
      }
    }

    if (markdownLinks.length < MAX_LINKS) {
      for (const match of markdownLinkCandidates(visible)) {
        const column = match.index + 1;
        const label = safeText(match.label, 240);
        const target = safeMarkdownTarget(match.target);
        if (!label || !target) {
          diagnostics.push({ kind: 'unsafe_markdown_target', line: lineNumber, column });
          continue;
        }
        markdownLinks.push({
          label,
          ...target,
          image: match.image,
          line: lineNumber,
          column,
        });
        if (markdownLinks.length >= MAX_LINKS) break;
      }
    }
  }

  return {
    ok: true,
    syntax: {
      version: 1,
      bodyStartLine: frontmatter.bodyStart + 1,
      aliases: frontmatter.aliases,
      tags: frontmatter.tags,
      headings,
      blocks,
      wikiLinks,
      markdownLinks,
      diagnostics,
    },
  };
}

export function parseContextNoteSyntax(input: unknown): ContextNoteSyntaxParseResult {
  if (typeof input !== 'string')
    return Object.freeze({ ok: false, reason: 'note_content_invalid' });
  if (input.length > MAX_CONTENT_CHARACTERS) {
    return Object.freeze({ ok: false, reason: 'note_content_too_large' });
  }
  if (CONTROL_CHARACTERS.test(input)) {
    return Object.freeze({ ok: false, reason: 'note_content_control_character' });
  }
  const lines = input.replace(/\r\n?/gu, '\n').split('\n');
  const frontmatter = parseFrontmatter(lines);
  if (!frontmatter.ok) {
    return Object.freeze({ ok: false, reason: 'frontmatter_unterminated' });
  }
  const parsed = parseDocumentSyntax(lines, frontmatter);
  if (!parsed.ok) {
    return Object.freeze({
      ok: false,
      reason: 'duplicate_block_id',
      detail: parsed.blockId,
    });
  }
  return Object.freeze({ ok: true, value: deepFreeze(parsed.syntax) });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validLine(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function exactText(value: unknown, maximum: number, allowEmpty = false): value is string {
  if (typeof value !== 'string' || value.length > maximum || CONTROL_CHARACTERS.test(value)) {
    return false;
  }
  return allowEmpty ? value.trim() === value : safeText(value, maximum) === value;
}

function validReferenceSyntax(value: unknown): value is DeepReadonly<ContextNoteSyntaxV1> {
  if (!isRecord(value) || value.version !== 1 || !validLine(value.bodyStartLine)) return false;
  const aliases = value.aliases;
  const tags = value.tags;
  const headings = value.headings;
  const blocks = value.blocks;
  const wikiLinks = value.wikiLinks;
  const markdownLinks = value.markdownLinks;
  const diagnostics = value.diagnostics;
  if (
    !Array.isArray(aliases) ||
    aliases.length > MAX_ALIASES ||
    !aliases.every((entry) => exactText(entry, 500)) ||
    !Array.isArray(tags) ||
    tags.length > MAX_TAGS ||
    !tags.every((entry) => exactText(entry, 500)) ||
    !Array.isArray(headings) ||
    headings.length > MAX_HEADINGS ||
    !Array.isArray(blocks) ||
    blocks.length > MAX_BLOCKS ||
    !Array.isArray(wikiLinks) ||
    wikiLinks.length > MAX_LINKS ||
    !Array.isArray(markdownLinks) ||
    markdownLinks.length > MAX_LINKS ||
    !Array.isArray(diagnostics) ||
    diagnostics.length > MAX_BLOCKS + MAX_LINKS * 2
  ) {
    return false;
  }
  if (
    !headings.every(
      (entry) =>
        isRecord(entry) &&
        exactText(entry.text, 500) &&
        exactText(entry.slug, 200) &&
        Number.isSafeInteger(entry.level) &&
        (entry.level as number) >= 1 &&
        (entry.level as number) <= 6 &&
        validLine(entry.line),
    ) ||
    !blocks.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.id === 'string' &&
        BLOCK_ID.test(entry.id) &&
        validLine(entry.line),
    )
  ) {
    return false;
  }
  if (
    !wikiLinks.every(
      (entry) =>
        isRecord(entry) &&
        exactText(entry.raw, 1_000) &&
        exactText(entry.targetTitle, 240, true) &&
        (entry.targetNoteId === undefined ||
          (typeof entry.targetNoteId === 'string' && STABLE_ID.test(entry.targetNoteId))) &&
        (entry.heading === undefined || exactText(entry.heading, 240)) &&
        (entry.blockId === undefined ||
          (typeof entry.blockId === 'string' && BLOCK_ID.test(entry.blockId))) &&
        !(entry.heading !== undefined && entry.blockId !== undefined) &&
        (Boolean(entry.targetTitle) ||
          entry.heading !== undefined ||
          entry.blockId !== undefined) &&
        (entry.alias === undefined || exactText(entry.alias, 240)) &&
        typeof entry.embed === 'boolean' &&
        validLine(entry.line) &&
        validLine(entry.column),
    ) ||
    !markdownLinks.every((entry) => {
      if (
        !isRecord(entry) ||
        !exactText(entry.label, 240) ||
        !exactText(entry.target, 400) ||
        typeof entry.image !== 'boolean' ||
        typeof entry.external !== 'boolean' ||
        !validLine(entry.line) ||
        !validLine(entry.column)
      ) {
        return false;
      }
      const target = safeMarkdownTarget(entry.target);
      return Boolean(
        target && target.target === entry.target && target.external === entry.external,
      );
    })
  ) {
    return false;
  }
  const diagnosticKinds = new Set<ContextNoteSyntaxDiagnosticKind>([
    'invalid_block_id',
    'invalid_wiki_target',
    'unsafe_markdown_target',
  ]);
  return diagnostics.every(
    (entry) =>
      isRecord(entry) &&
      typeof entry.kind === 'string' &&
      diagnosticKinds.has(entry.kind as ContextNoteSyntaxDiagnosticKind) &&
      validLine(entry.line) &&
      validLine(entry.column),
  );
}

function validReferenceDocument(value: unknown): value is ContextNoteReferenceDocumentV1 {
  return (
    isRecord(value) &&
    typeof value.noteId === 'string' &&
    STABLE_ID.test(value.noteId) &&
    exactText(value.title, 500) &&
    validReferenceSyntax(value.syntax)
  );
}

function validReferenceIndex(value: unknown): value is DeepReadonly<ContextNoteReferenceIndexV1> {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.documents)) return false;
  if (value.documents.length > MAX_DOCUMENTS) return false;
  const noteIds = new Set<string>();
  for (const document of value.documents) {
    if (!validReferenceDocument(document) || noteIds.has(document.noteId)) return false;
    noteIds.add(document.noteId);
  }
  return true;
}

function labelMapForDocuments(
  documents: readonly ContextNoteReferenceDocumentV1[],
): Map<string, ContextNoteReferenceDocumentV1[]> {
  const result = new Map<string, ContextNoteReferenceDocumentV1[]>();
  const noteIdsByLabel = new Map<string, Set<string>>();
  for (const document of documents) {
    for (const label of [document.title, ...document.syntax.aliases]) {
      const key = folded(label);
      const entries = result.get(key) ?? [];
      const noteIds = noteIdsByLabel.get(key) ?? new Set<string>();
      if (!noteIds.has(document.noteId)) {
        noteIds.add(document.noteId);
        entries.push(document);
      }
      result.set(key, entries);
      noteIdsByLabel.set(key, noteIds);
    }
  }
  return result;
}

function bindStableNoteTargets(
  documents: readonly ContextNoteReferenceDocumentV1[],
  previousIndex?: DeepReadonly<ContextNoteReferenceIndexV1>,
): ContextNoteReferenceDocumentV1[] {
  const labels = labelMapForDocuments(documents);
  const currentIds = new Set(documents.map(({ noteId }) => noteId));
  return documents
    .map((document) => {
      const previous = previousIndex?.documents.find(({ noteId }) => noteId === document.noteId);
      const previousBindings = new Map<string, Array<string | undefined>>();
      for (const link of previous?.syntax.wikiLinks ?? []) {
        const bindings = previousBindings.get(link.raw) ?? [];
        bindings.push(link.targetNoteId);
        previousBindings.set(link.raw, bindings);
      }
      const wikiLinks = document.syntax.wikiLinks.map((link) => {
        const previousTarget = previousBindings.get(link.raw)?.shift();
        let targetNoteId = link.targetNoteId ?? previousTarget;
        if (!targetNoteId) {
          if (!link.targetTitle) {
            targetNoteId = document.noteId;
          } else {
            const candidates = labels.get(folded(link.targetTitle)) ?? [];
            if (candidates.length === 1) targetNoteId = candidates[0]!.noteId;
          }
        }
        return targetNoteId ? { ...link, targetNoteId } : { ...link };
      });
      return {
        noteId: document.noteId,
        title: document.title,
        syntax: { ...document.syntax, wikiLinks },
      };
    })
    .filter(({ noteId }) => currentIds.has(noteId));
}

export function buildContextNoteReferenceIndex(
  input: readonly ContextNoteReferenceDocumentV1[],
  previousIndex?: DeepReadonly<ContextNoteReferenceIndexV1>,
): ContextNoteReferenceIndexResult {
  if (previousIndex !== undefined && !validReferenceIndex(previousIndex)) {
    return Object.freeze({
      ok: false,
      reason: 'invalid_reference_document',
      detail: 'previous_index',
    });
  }
  if (!Array.isArray(input) || input.length > MAX_DOCUMENTS) {
    return Object.freeze({ ok: false, reason: 'invalid_reference_document' });
  }
  const noteIds = new Set<string>();
  const blockOwners = new Map<string, { id: string; noteIds: string[] }>();
  const documents: ContextNoteReferenceDocumentV1[] = [];
  for (const value of input) {
    const document: unknown = value;
    if (!validReferenceDocument(document) || noteIds.has(document.noteId)) {
      return Object.freeze({
        ok: false,
        reason: 'invalid_reference_document',
        detail:
          isRecord(document) && typeof document.noteId === 'string' ? document.noteId : undefined,
      });
    }
    noteIds.add(document.noteId);
    for (const block of document.syntax.blocks) {
      const key = folded(block.id);
      const owner = blockOwners.get(key);
      if (owner) {
        return Object.freeze({
          ok: false,
          reason: 'duplicate_block_id',
          detail: owner.id,
          noteIds: Object.freeze([...owner.noteIds, document.noteId].sort()),
        });
      }
      blockOwners.set(key, { id: block.id, noteIds: [document.noteId] });
    }
    documents.push({
      noteId: document.noteId,
      title: document.title,
      syntax: document.syntax,
    });
  }
  const boundDocuments = bindStableNoteTargets(documents, previousIndex);
  boundDocuments.sort((left, right) => left.noteId.localeCompare(right.noteId, 'en-US'));
  return Object.freeze({
    ok: true,
    value: deepFreeze({ version: 1 as const, documents: boundDocuments }),
  });
}

type ContextNoteLabelMap = ReadonlyMap<
  string,
  readonly DeepReadonly<ContextNoteReferenceDocumentV1>[]
>;

type ContextNoteResolutionLookup = Readonly<{
  documentsById: ReadonlyMap<string, DeepReadonly<ContextNoteReferenceDocumentV1>>;
  documentsByLabel: ContextNoteLabelMap;
  candidateNoteIdsByLabel: ReadonlyMap<string, readonly string[]>;
  headingsByNoteId: ReadonlyMap<string, ReadonlyMap<string, DeepReadonly<ContextNoteHeadingV1>>>;
  blocksByNoteId: ReadonlyMap<string, ReadonlyMap<string, DeepReadonly<ContextNoteBlockV1>>>;
}>;

const frozenIndexResolutionCache = new WeakMap<object, ContextNoteResolutionLookup>();

function frozenObjectArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    Object.isFrozen(value) &&
    value.every((entry) => Boolean(entry) && typeof entry === 'object' && Object.isFrozen(entry))
  );
}

function deeplyFrozenReferenceCollections(
  index: DeepReadonly<ContextNoteReferenceIndexV1>,
): boolean {
  return (
    Object.isFrozen(index) &&
    Object.isFrozen(index.documents) &&
    index.documents.every(
      (document) =>
        Object.isFrozen(document) &&
        Object.isFrozen(document.syntax) &&
        Array.isArray(document.syntax.aliases) &&
        Object.isFrozen(document.syntax.aliases) &&
        Array.isArray(document.syntax.tags) &&
        Object.isFrozen(document.syntax.tags) &&
        frozenObjectArray(document.syntax.headings) &&
        frozenObjectArray(document.syntax.blocks) &&
        frozenObjectArray(document.syntax.wikiLinks) &&
        frozenObjectArray(document.syntax.markdownLinks) &&
        frozenObjectArray(document.syntax.diagnostics),
    )
  );
}

export function isDeepFrozenContextNoteReferenceIndex(
  value: unknown,
): value is DeepReadonly<ContextNoteReferenceIndexV1> {
  return validReferenceIndex(value) && deeplyFrozenReferenceCollections(value);
}

function resolutionLookup(
  index: DeepReadonly<ContextNoteReferenceIndexV1>,
): ContextNoteResolutionLookup {
  const cached = frozenIndexResolutionCache.get(index as object);
  if (cached) return cached;

  const documentsById = new Map<string, DeepReadonly<ContextNoteReferenceDocumentV1>>();
  const documentsByLabel = new Map<string, DeepReadonly<ContextNoteReferenceDocumentV1>[]>();
  const noteIdsByLabel = new Map<string, Set<string>>();
  const headingsByNoteId = new Map<
    string,
    ReadonlyMap<string, DeepReadonly<ContextNoteHeadingV1>>
  >();
  const blocksByNoteId = new Map<string, ReadonlyMap<string, DeepReadonly<ContextNoteBlockV1>>>();
  const candidateNoteIdsByLabel = new Map<string, readonly string[]>();

  for (const document of index.documents) {
    documentsById.set(document.noteId, document);
    const headings = new Map<string, DeepReadonly<ContextNoteHeadingV1>>();
    for (const heading of document.syntax.headings) {
      for (const label of [heading.text, heading.slug]) {
        const key = folded(label);
        if (!headings.has(key)) headings.set(key, heading);
      }
    }
    headingsByNoteId.set(document.noteId, headings);
    const blocks = new Map<string, DeepReadonly<ContextNoteBlockV1>>();
    for (const block of document.syntax.blocks) {
      const key = folded(block.id);
      if (!blocks.has(key)) blocks.set(key, block);
    }
    blocksByNoteId.set(document.noteId, blocks);

    for (const label of [document.title, ...document.syntax.aliases]) {
      const key = folded(label);
      const entries = documentsByLabel.get(key) ?? [];
      const noteIds = noteIdsByLabel.get(key) ?? new Set<string>();
      if (!noteIds.has(document.noteId)) {
        noteIds.add(document.noteId);
        entries.push(document);
      }
      documentsByLabel.set(key, entries);
      noteIdsByLabel.set(key, noteIds);
    }
  }
  for (const entries of documentsByLabel.values()) {
    entries.sort((left, right) => left.noteId.localeCompare(right.noteId, 'en-US'));
  }
  for (const [label, entries] of documentsByLabel) {
    if (entries.length > 1) {
      candidateNoteIdsByLabel.set(label, Object.freeze(entries.map(({ noteId }) => noteId)));
    }
  }
  const result: ContextNoteResolutionLookup = {
    documentsById,
    documentsByLabel,
    candidateNoteIdsByLabel,
    headingsByNoteId,
    blocksByNoteId,
  };
  if (deeplyFrozenReferenceCollections(index)) {
    frozenIndexResolutionCache.set(index as object, result);
  }
  return result;
}

function resolveOne(
  lookup: ContextNoteResolutionLookup,
  sourceNoteId: string,
  link: DeepReadonly<ContextNoteWikiLinkV1>,
): ContextNoteReferenceResolutionV1 {
  let candidates: readonly DeepReadonly<ContextNoteReferenceDocumentV1>[];
  if (link.targetNoteId) {
    const target = lookup.documentsById.get(link.targetNoteId);
    candidates = target ? [target] : [];
  } else if (link.targetTitle) {
    candidates = lookup.documentsByLabel.get(folded(link.targetTitle)) ?? [];
  } else {
    const source = lookup.documentsById.get(sourceNoteId);
    candidates = source ? [source] : [];
  }
  if (candidates.length === 0) return deepFreeze({ state: 'missing_note' as const, link });
  if (candidates.length > 1) {
    const label = folded(link.targetTitle);
    return Object.freeze({
      state: 'ambiguous_note' as const,
      link: deepFreeze(link),
      candidateNoteIds:
        lookup.candidateNoteIdsByLabel.get(label) ??
        Object.freeze(candidates.map(({ noteId }) => noteId)),
    });
  }
  const target = candidates[0]!;
  if (link.heading) {
    const heading = lookup.headingsByNoteId.get(target.noteId)?.get(folded(link.heading));
    if (!heading) {
      return deepFreeze({
        state: 'missing_heading' as const,
        link,
        targetNoteId: target.noteId,
      });
    }
    return deepFreeze({
      state: 'resolved' as const,
      link,
      targetNoteId: target.noteId,
      targetHeadingSlug: heading.slug,
    });
  }
  if (link.blockId) {
    const block = lookup.blocksByNoteId.get(target.noteId)?.get(folded(link.blockId));
    if (!block) {
      return deepFreeze({
        state: 'missing_block' as const,
        link,
        targetNoteId: target.noteId,
      });
    }
    return deepFreeze({
      state: 'resolved' as const,
      link,
      targetNoteId: target.noteId,
      targetBlockId: block.id,
    });
  }
  return deepFreeze({
    state: 'resolved' as const,
    link,
    targetNoteId: target.noteId,
  });
}

export function resolveContextNoteReferences(
  index: DeepReadonly<ContextNoteReferenceIndexV1>,
  sourceNoteId: string,
): readonly ContextNoteReferenceResolutionV1[] {
  const lookup = resolutionLookup(index);
  const source = lookup.documentsById.get(sourceNoteId);
  if (!source) return Object.freeze([]);
  return Object.freeze(
    source.syntax.wikiLinks.map((link) => resolveOne(lookup, sourceNoteId, link)),
  );
}

export function contextNoteReferenceCompletions(
  index: DeepReadonly<ContextNoteReferenceIndexV1>,
  query: string,
  maximum = 20,
): readonly DeepReadonly<ContextNoteReferenceCompletionV1>[] {
  const term = folded(query);
  if (!term) return Object.freeze([]);
  const records: ContextNoteReferenceCompletionV1[] = [];
  for (const document of index.documents) {
    records.push({
      kind: 'note',
      noteId: document.noteId,
      label: document.title,
      insertText: `[[${document.title}]]`,
    });
    for (const alias of document.syntax.aliases) {
      records.push({
        kind: 'alias',
        noteId: document.noteId,
        label: alias,
        insertText: `[[${alias}]]`,
      });
    }
    for (const heading of document.syntax.headings) {
      records.push({
        kind: 'heading',
        noteId: document.noteId,
        label: heading.text,
        insertText: `[[${document.title}#${heading.text}]]`,
      });
    }
    for (const block of document.syntax.blocks) {
      records.push({
        kind: 'block',
        noteId: document.noteId,
        label: block.id,
        insertText: `[[${document.title}#^${block.id}]]`,
      });
    }
  }
  const limit = Number.isSafeInteger(maximum) ? Math.max(1, Math.min(100, maximum)) : 20;
  const seen = new Set<string>();
  return Object.freeze(
    records
      .filter((record) => folded(`${record.label} ${record.noteId}`).includes(term))
      .sort(
        (left, right) =>
          left.label.localeCompare(right.label, 'en-US', { sensitivity: 'base' }) ||
          left.kind.localeCompare(right.kind) ||
          left.noteId.localeCompare(right.noteId),
      )
      .filter((record) => {
        const key = `${record.kind}\0${record.noteId}\0${folded(record.label)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit)
      .map((record) => deepFreeze(record)),
  );
}

function maskReferenceSyntax(line: string): string {
  const characters = maskInlineCode(line).split('');
  const mask = (start: number, length: number) => {
    for (let offset = start; offset < start + length; offset += 1) characters[offset] = ' ';
  };
  const visible = characters.join('');
  for (const match of visible.matchAll(/(!)?\[\[[^\]\r\n]{1,500}\]\]/gu)) {
    mask(match.index ?? 0, match[0].length);
  }
  for (const link of markdownLinkCandidates(characters.join(''))) {
    mask(link.index, link.raw.length);
  }
  return characters.join('');
}

function mentionLabels(
  index: DeepReadonly<ContextNoteReferenceIndexV1>,
  sourceNoteId: string,
): Array<{
  label: string;
  matchKind: 'title' | 'alias';
  candidateNoteIds: string[];
}> {
  const labels = new Map<string, { label: string; title: boolean; noteIds: Set<string> }>();
  for (const document of index.documents) {
    if (document.noteId === sourceNoteId) continue;
    for (const [label, title] of [
      [document.title, true],
      ...document.syntax.aliases.map((alias) => [alias, false] as const),
    ] as const) {
      if (label.length < 2) continue;
      const key = folded(label);
      const entry = labels.get(key) ?? { label, title: false, noteIds: new Set<string>() };
      if (title) {
        entry.title = true;
        entry.label = label;
      }
      entry.noteIds.add(document.noteId);
      labels.set(key, entry);
    }
  }
  return [...labels.values()]
    .map((entry) => ({
      label: entry.label,
      matchKind: entry.title ? ('title' as const) : ('alias' as const),
      candidateNoteIds: [...entry.noteIds].sort(),
    }))
    .sort(
      (left, right) =>
        right.label.length - left.label.length ||
        left.label.localeCompare(right.label, 'en-US', { sensitivity: 'base' }),
    );
}

function regexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function wordCharacter(value: string | undefined): boolean {
  return Boolean(value && /[\p{Letter}\p{Number}_]/u.test(value));
}

function compareMentions(
  left: ContextNoteUnlinkedMentionV1,
  right: ContextNoteUnlinkedMentionV1,
): number {
  return (
    right.confidence - left.confidence ||
    left.line - right.line ||
    left.column - right.column ||
    left.label.localeCompare(right.label, 'en-US')
  );
}

export function findContextNoteUnlinkedMentions(
  index: DeepReadonly<ContextNoteReferenceIndexV1>,
  sourceNoteId: string,
  markdown: unknown,
  maximum = 100,
): readonly DeepReadonly<ContextNoteUnlinkedMentionV1>[] {
  if (!index.documents.some(({ noteId }) => noteId === sourceNoteId)) return Object.freeze([]);
  const parsed = parseContextNoteSyntax(markdown);
  if (!parsed.ok || typeof markdown !== 'string') return Object.freeze([]);
  const limit = Number.isSafeInteger(maximum) ? Math.max(1, Math.min(500, maximum)) : 100;
  const labels = mentionLabels(index, sourceNoteId);
  const lines = markdown.replace(/\r\n?/gu, '\n').split('\n');
  const mentions: ContextNoteUnlinkedMentionV1[] = [];
  let fence: Readonly<{ character: '`' | '~'; length: number }> | null = null;

  for (let indexLine = parsed.value.bodyStartLine - 1; indexLine < lines.length; indexLine += 1) {
    const line = lines[indexLine] ?? '';
    const fenceMarker = markdownFenceMarker(line);
    if (fence) {
      const closing = markdownFenceMarker(line, true);
      if (closing?.character === fence.character && closing.length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (fenceMarker) {
      fence = fenceMarker;
      continue;
    }
    if (/^(?: {4}|\t)/u.test(line)) continue;

    const visible = maskReferenceSyntax(line);
    const occupied: Array<readonly [number, number]> = [];
    for (const candidate of labels) {
      const expression = new RegExp(regexLiteral(candidate.label), 'giu');
      for (const match of visible.matchAll(expression)) {
        const start = match.index ?? 0;
        const end = start + match[0].length;
        const first = [...match[0]][0];
        const last = [...match[0]].at(-1);
        if (
          (wordCharacter(first) && wordCharacter(visible.slice(0, start).match(/.$/u)?.[0])) ||
          (wordCharacter(last) && wordCharacter(visible.slice(end).match(/^./u)?.[0])) ||
          occupied.some(([rangeStart, rangeEnd]) => start < rangeEnd && end > rangeStart)
        ) {
          continue;
        }
        occupied.push([start, end]);
        const ambiguous = candidate.candidateNoteIds.length > 1;
        mentions.push({
          matchedText: line.slice(start, end),
          label: candidate.label,
          matchKind: candidate.matchKind,
          candidateNoteIds: [...candidate.candidateNoteIds],
          line: indexLine + 1,
          column: start + 1,
          confidence: (candidate.matchKind === 'title' ? 1 : 0.9) - (ambiguous ? 0.25 : 0),
        });
        if (mentions.length > limit) {
          mentions.sort(compareMentions);
          mentions.length = limit;
        }
      }
    }
  }

  return Object.freeze(mentions.sort(compareMentions).map((mention) => deepFreeze(mention)));
}

export function buildContextEmbedPlan(
  index: DeepReadonly<ContextNoteReferenceIndexV1>,
  startNoteId: string,
  options: Readonly<{ maxDepth?: number; maxEntries?: number }> = {},
): readonly DeepReadonly<ContextEmbedPlanEntryV1>[] {
  const lookup = resolutionLookup(index);
  if (!lookup.documentsById.has(startNoteId)) return Object.freeze([]);
  const maxDepth = Number.isSafeInteger(options.maxDepth)
    ? Math.max(1, Math.min(32, options.maxDepth!))
    : 8;
  const maxEntries = Number.isSafeInteger(options.maxEntries)
    ? Math.max(1, Math.min(1_000, options.maxEntries!))
    : 256;
  const entries: ContextEmbedPlanEntryV1[] = [];

  const visit = (
    sourceNoteId: string,
    path: string[],
    scope: Readonly<{ headingSlug?: string; blockId?: string }> = {},
  ) => {
    if (entries.length >= maxEntries) return;
    const source = lookup.documentsById.get(sourceNoteId);
    if (!source) return;
    let embeds = source.syntax.wikiLinks.filter(({ embed }) => embed);
    if (scope.headingSlug) {
      const heading = source.syntax.headings.find(({ slug }) => slug === scope.headingSlug);
      if (!heading) return;
      const next = source.syntax.headings.find(
        (candidate) => candidate.line > heading.line && candidate.level <= heading.level,
      );
      embeds = embeds.filter(({ line }) => line >= heading.line && (!next || line < next.line));
    } else if (scope.blockId) {
      const block = source.syntax.blocks.find(({ id }) => folded(id) === folded(scope.blockId!));
      if (!block) return;
      embeds = embeds.filter(({ line }) => line === block.line);
    }
    for (const link of embeds) {
      if (entries.length >= maxEntries) return;
      const resolution = resolveOne(lookup, sourceNoteId, link);
      const depth = path.length;
      if (resolution.state !== 'resolved') {
        entries.push({
          state: 'unresolved',
          sourceNoteId,
          targetLabel: link.targetTitle,
          depth,
          path: [...path],
        });
        continue;
      }
      const nextPath = [...path, resolution.targetNoteId];
      if (path.includes(resolution.targetNoteId)) {
        entries.push({
          state: 'cycle',
          sourceNoteId,
          targetLabel: link.targetTitle,
          targetNoteId: resolution.targetNoteId,
          ...(resolution.targetHeadingSlug
            ? { targetHeadingSlug: resolution.targetHeadingSlug }
            : {}),
          ...(resolution.targetBlockId ? { targetBlockId: resolution.targetBlockId } : {}),
          depth,
          path: nextPath,
        });
        continue;
      }
      if (depth > maxDepth) {
        entries.push({
          state: 'depth_limited',
          sourceNoteId,
          targetLabel: link.targetTitle,
          targetNoteId: resolution.targetNoteId,
          ...(resolution.targetHeadingSlug
            ? { targetHeadingSlug: resolution.targetHeadingSlug }
            : {}),
          ...(resolution.targetBlockId ? { targetBlockId: resolution.targetBlockId } : {}),
          depth,
          path: nextPath,
        });
        continue;
      }
      entries.push({
        state: 'resolved',
        sourceNoteId,
        targetLabel: link.targetTitle,
        targetNoteId: resolution.targetNoteId,
        ...(resolution.targetHeadingSlug
          ? { targetHeadingSlug: resolution.targetHeadingSlug }
          : {}),
        ...(resolution.targetBlockId ? { targetBlockId: resolution.targetBlockId } : {}),
        depth,
        path: nextPath,
      });
      visit(resolution.targetNoteId, nextPath, {
        ...(resolution.targetHeadingSlug ? { headingSlug: resolution.targetHeadingSlug } : {}),
        ...(resolution.targetBlockId ? { blockId: resolution.targetBlockId } : {}),
      });
    }
  };
  visit(startNoteId, [startNoteId]);
  return Object.freeze(entries.map((entry) => deepFreeze(entry)));
}
