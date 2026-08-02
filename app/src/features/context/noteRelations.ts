import type { DeepReadonly } from './contracts';
import {
  findContextNoteUnlinkedMentions,
  isDeepFrozenContextNoteReferenceIndex,
  parseContextNoteSyntax,
  resolveContextNoteReferences,
  type ContextNoteReferenceIndexV1,
  type ContextNoteSyntaxV1,
  type ContextNoteUnlinkedMentionV1,
} from './noteSyntax';

export interface ContextNoteRelationSourceV1 {
  noteId: string;
  title: string;
  relativePath: string;
  modifiedAt: number;
  markdown: string;
  syntax: DeepReadonly<ContextNoteSyntaxV1>;
}

export interface ContextGeneratedRelationshipV1 {
  id: string;
  sourceNoteId: string;
  targetNoteId: string;
  relationType: string;
  context: string;
  confidence: number;
  observedAt: number;
}

export type ContextNoteRelationType =
  | 'wiki_link'
  | 'embed'
  | 'external_url'
  | 'local_file'
  | 'code_reference'
  | string;

export interface ContextNoteRelationRecordV1 {
  state:
    | 'resolved'
    | 'missing_note'
    | 'ambiguous_note'
    | 'missing_heading'
    | 'missing_block'
    | 'external'
    | 'deleted'
    | 'generated';
  relationType: ContextNoteRelationType;
  sourceNoteId: string;
  sourcePath: string;
  target: string;
  targetNoteId?: string;
  candidateNoteIds?: readonly string[];
  targetHeadingSlug?: string;
  targetBlockId?: string;
  context: string;
  heading?: string;
  blockId?: string;
  line: number;
  column: number;
  lastModifiedAt: number;
  confidence?: number;
  observedAt?: number;
}

export interface ContextNoteRepairDiagnosticV1 {
  kind:
    | 'missing_target'
    | 'renamed_target_candidate'
    | 'ambiguous_title'
    | 'inaccessible_github_source'
    | 'deleted_file'
    | 'stale_block_id';
  sourceNoteId: string;
  target: string;
  line: number;
  column: number;
  targetNoteId?: string;
  candidateNoteIds?: readonly string[];
}

export type ContextMentionActionV1 =
  | 'convert_one'
  | 'convert_selected'
  | 'ignore'
  | 'add_alias'
  | 'create_note';

export type ContextUnlinkedMentionReportV1 = ContextNoteUnlinkedMentionV1 & {
  availableActions: ContextMentionActionV1[];
};

export interface ContextNoteRelationReportV1 {
  version: 1;
  focusNoteId: string;
  backlinks: ContextNoteRelationRecordV1[];
  outgoing: ContextNoteRelationRecordV1[];
  unlinkedMentions: ContextUnlinkedMentionReportV1[];
  repairs: ContextNoteRepairDiagnosticV1[];
}

export type ContextNoteRelationReportResult =
  | Readonly<{ ok: true; value: DeepReadonly<ContextNoteRelationReportV1> }>
  | Readonly<{
      ok: false;
      reason:
        | 'focus_note_missing'
        | 'invalid_relation_source'
        | 'invalid_generated_relationship'
        | 'relation_input_too_large';
      detail?: string;
    }>;

export interface ContextMentionLinkEditV1 {
  start: number;
  end: number;
  replacement: string;
}

export interface ContextMentionLinkEditPlanV1 {
  version: 1;
  requiresExplicitApply: true;
  edits: ContextMentionLinkEditV1[];
  previewMarkdown: string;
}

export type ContextMentionLinkEditPlanResult =
  | Readonly<{ ok: true; value: DeepReadonly<ContextMentionLinkEditPlanV1> }>
  | Readonly<{
      ok: false;
      reason:
        | 'source_code_auto_edit_forbidden'
        | 'mention_input_invalid'
        | 'mention_ambiguous'
        | 'mention_target_missing'
        | 'mention_target_invalid'
        | 'mention_stale'
        | 'mention_overlap';
    }>;

const MAX_SOURCES = 10_000;
const MAX_TOTAL_MARKDOWN_CHARACTERS = 64 * 1024 * 1024;
const MAX_GENERATED_RELATIONSHIPS = 20_000;
const MAX_RELATIONS = 20_000;
const MAX_AMBIGUOUS_CANDIDATE_REFERENCES = 20_000;
const MAX_FUZZY_REPAIR_SCANS = 3;
const MAX_MENTION_SCAN_BUDGET = 25_000_000;
const MAX_CONTEXT_CHARACTERS = 500;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const MENTION_ACTIONS: readonly ContextMentionActionV1[] = Object.freeze([
  'convert_one',
  'convert_selected',
  'ignore',
  'add_alias',
  'create_note',
]);

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

function exactText(value: unknown, maximum: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximum &&
    value.trim() === value &&
    !CONTROL_CHARACTERS.test(value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validRuntimeIndex(value: unknown): value is DeepReadonly<ContextNoteReferenceIndexV1> {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !Object.isFrozen(value) ||
    !Array.isArray(value.documents) ||
    !Object.isFrozen(value.documents) ||
    value.documents.length > MAX_SOURCES ||
    !isDeepFrozenContextNoteReferenceIndex(value)
  ) {
    return false;
  }
  return true;
}

function portableRelativePath(value: unknown): value is string {
  if (
    !exactText(value, 400) ||
    value.includes('\\') ||
    value.startsWith('/') ||
    /^[A-Za-z]:/u.test(value) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value)
  ) {
    return false;
  }
  const segments = value.split('/');
  return segments.every((segment) => {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return false;
    }
    return (
      Boolean(segment) &&
      segment !== '.' &&
      segment !== '..' &&
      decoded !== '.' &&
      decoded !== '..' &&
      !decoded.includes('/') &&
      !decoded.includes('\\') &&
      !/[<>:"|?*]/u.test(decoded) &&
      !/[ .]$/u.test(decoded)
    );
  });
}

function validTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function syntaxEquals(
  left: DeepReadonly<ContextNoteSyntaxV1>,
  right: DeepReadonly<ContextNoteSyntaxV1>,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function syntaxEqualsIgnoringBindings(
  left: DeepReadonly<ContextNoteSyntaxV1>,
  right: DeepReadonly<ContextNoteSyntaxV1>,
): boolean {
  const withoutBindings = (key: string, value: unknown) =>
    key === 'targetNoteId' ? undefined : value;
  return JSON.stringify(left, withoutBindings) === JSON.stringify(right, withoutBindings);
}

function validateSources(
  index: DeepReadonly<ContextNoteReferenceIndexV1>,
  sources: readonly ContextNoteRelationSourceV1[],
): Readonly<
  | { ok: true; value: Map<string, ContextNoteRelationSourceV1> }
  | { ok: false; detail?: string; tooLarge?: boolean }
> {
  if (!Array.isArray(sources) || sources.length > MAX_SOURCES) {
    return { ok: false, tooLarge: true };
  }
  const result = new Map<string, ContextNoteRelationSourceV1>();
  const indexedById = new Map(index.documents.map((document) => [document.noteId, document]));
  let totalCharacters = 0;
  for (const source of sources) {
    totalCharacters += typeof source?.markdown === 'string' ? source.markdown.length : 0;
    if (totalCharacters > MAX_TOTAL_MARKDOWN_CHARACTERS) {
      return { ok: false, tooLarge: true };
    }
    const indexed = indexedById.get(source?.noteId);
    const parsed = parseContextNoteSyntax(source?.markdown);
    if (
      !source ||
      !indexed ||
      !STABLE_ID.test(source.noteId) ||
      source.title !== indexed.title ||
      !portableRelativePath(source.relativePath) ||
      !validTimestamp(source.modifiedAt) ||
      !parsed.ok ||
      !syntaxEquals(parsed.value, source.syntax) ||
      !syntaxEqualsIgnoringBindings(parsed.value, indexed.syntax) ||
      result.has(source.noteId)
    ) {
      return { ok: false, detail: source?.noteId };
    }
    result.set(source.noteId, source);
  }
  if (result.size !== index.documents.length) return { ok: false };
  return { ok: true, value: result };
}

function lineText(lines: readonly string[], line: number): string {
  const value = lines[line - 1]?.trim() ?? '';
  return value.slice(0, MAX_CONTEXT_CHARACTERS);
}

function lastHeadingAt(headings: DeepReadonly<ContextNoteSyntaxV1>['headings'], line: number) {
  let low = 0;
  let high = headings.length - 1;
  let result: (typeof headings)[number] | undefined;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const candidate = headings[middle]!;
    if (candidate.line <= line) {
      result = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return result;
}

function blockAt(blocks: DeepReadonly<ContextNoteSyntaxV1>['blocks'], line: number) {
  let low = 0;
  let high = blocks.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const candidate = blocks[middle]!;
    if (candidate.line === line) {
      let first = middle;
      while (first > 0 && blocks[first - 1]!.line === line) first -= 1;
      return blocks[first];
    }
    if (candidate.line < line) low = middle + 1;
    else high = middle - 1;
  }
  return undefined;
}

function sourceLocation(
  source: ContextNoteRelationSourceV1,
  line: number,
): Readonly<{ heading?: string; blockId?: string }> {
  const heading = lastHeadingAt(source.syntax.headings, line);
  const block = blockAt(source.syntax.blocks, line);
  return {
    ...(heading ? { heading: heading.text } : {}),
    ...(block ? { blockId: block.id } : {}),
  };
}

function wikiTarget(
  targetTitle: string,
  heading: string | undefined,
  blockId: string | undefined,
): string {
  return `${targetTitle}${heading ? `#${heading}` : blockId ? `#^${blockId}` : ''}`;
}

function folded(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Mark}+/gu, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '');
}

function referenceLabelKey(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
}

function ambiguousCandidateFanoutTooLarge(
  index: DeepReadonly<ContextNoteReferenceIndexV1>,
  sources: ReadonlyMap<string, ContextNoteRelationSourceV1>,
): boolean {
  const noteIdsByLabel = new Map<string, Set<string>>();
  for (const document of index.documents) {
    for (const label of [document.title, ...document.syntax.aliases]) {
      const key = referenceLabelKey(label);
      const noteIds = noteIdsByLabel.get(key) ?? new Set<string>();
      noteIds.add(document.noteId);
      noteIdsByLabel.set(key, noteIds);
    }
  }
  let total = 0;
  for (const source of sources.values()) {
    for (const link of source.syntax.wikiLinks) {
      if (link.targetNoteId || !link.targetTitle) continue;
      const candidates = noteIdsByLabel.get(referenceLabelKey(link.targetTitle))?.size ?? 0;
      if (candidates > 1) {
        total += candidates;
        if (total > MAX_AMBIGUOUS_CANDIDATE_REFERENCES) return true;
      }
    }
  }
  return false;
}

function bigrams(value: string): Set<string> {
  if (value.length < 2) return new Set([value]);
  return new Set(
    Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2)),
  );
}

function labelSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  if (Math.abs(left.length - right.length) > Math.max(4, Math.ceil(left.length * 0.25))) {
    return 0;
  }
  const leftPairs = bigrams(left);
  const rightPairs = bigrams(right);
  let overlap = 0;
  for (const pair of leftPairs) if (rightPairs.has(pair)) overlap += 1;
  return (2 * overlap) / Math.max(1, leftPairs.size + rightPairs.size);
}

function resolvedLocalTarget(sourcePath: string, target: string): string | null {
  const withoutSuffix = target.replace(/[#?].*$/u, '');
  if (!withoutSuffix) return sourcePath;
  if (
    withoutSuffix.includes('\\') ||
    withoutSuffix.startsWith('/') ||
    /^[A-Za-z]:/u.test(withoutSuffix) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(withoutSuffix) ||
    CONTROL_CHARACTERS.test(withoutSuffix)
  ) {
    return null;
  }
  const resolved = sourcePath.split('/').slice(0, -1);
  for (const segment of withoutSuffix.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (resolved.length === 0) return null;
      resolved.pop();
      continue;
    }
    if (!portableRelativePath(segment)) return null;
    resolved.push(segment);
  }
  const value = resolved.join('/');
  return portableRelativePath(value) ? value : null;
}

function renameCandidates(
  index: DeepReadonly<ContextNoteReferenceIndexV1>,
  target: string,
): string[] {
  const needle = folded(target);
  if (!needle || needle.length > 240) return [];
  const scored = new Map<string, number>();
  for (const document of index.documents) {
    for (const label of [document.title, ...document.syntax.aliases]) {
      const candidate = folded(label);
      const score = labelSimilarity(needle, candidate);
      if (score >= 0.72) {
        scored.set(document.noteId, Math.max(scored.get(document.noteId) ?? 0, score));
      }
    }
  }
  return [...scored]
    .sort(
      ([leftId, leftScore], [rightId, rightScore]) =>
        rightScore - leftScore || leftId.localeCompare(rightId, 'en-US'),
    )
    .slice(0, 5)
    .map(([noteId]) => noteId);
}

function validateGeneratedRelationship(
  relationship: ContextGeneratedRelationshipV1,
  noteIds: ReadonlySet<string>,
): boolean {
  return (
    Boolean(relationship) &&
    STABLE_ID.test(relationship.id) &&
    noteIds.has(relationship.sourceNoteId) &&
    noteIds.has(relationship.targetNoteId) &&
    relationship.sourceNoteId !== relationship.targetNoteId &&
    exactText(relationship.relationType, 120) &&
    exactText(relationship.context, MAX_CONTEXT_CHARACTERS) &&
    Number.isFinite(relationship.confidence) &&
    relationship.confidence >= 0 &&
    relationship.confidence <= 1 &&
    validTimestamp(relationship.observedAt)
  );
}

function compareRelations(
  left: ContextNoteRelationRecordV1,
  right: ContextNoteRelationRecordV1,
): number {
  return (
    left.sourcePath.localeCompare(right.sourcePath, 'en-US') ||
    left.line - right.line ||
    left.column - right.column ||
    left.relationType.localeCompare(right.relationType, 'en-US') ||
    left.target.localeCompare(right.target, 'en-US')
  );
}

export function buildContextNoteRelationReport(input: {
  index: DeepReadonly<ContextNoteReferenceIndexV1>;
  sources: readonly ContextNoteRelationSourceV1[];
  focusNoteId: string;
  generatedRelationships?: readonly ContextGeneratedRelationshipV1[];
  inaccessibleGithubTargets?: readonly string[];
  deletedLocalTargets?: readonly string[];
}): ContextNoteRelationReportResult {
  if (!isRecord(input) || !validRuntimeIndex(input.index)) {
    return Object.freeze({
      ok: false,
      reason: 'invalid_relation_source',
      detail: 'index',
    });
  }
  const focus = input.index.documents.find(({ noteId }) => noteId === input.focusNoteId);
  if (!focus) return Object.freeze({ ok: false, reason: 'focus_note_missing' });
  const validated = validateSources(input.index, input.sources);
  if (!validated.ok) {
    if (validated.tooLarge) {
      return Object.freeze({ ok: false, reason: 'relation_input_too_large' });
    }
    return Object.freeze({
      ok: false,
      reason: 'invalid_relation_source',
      ...(validated.detail ? { detail: validated.detail } : {}),
    });
  }
  const sources = validated.value;
  const focusSource = sources.get(input.focusNoteId);
  if (!focusSource) {
    return Object.freeze({
      ok: false,
      reason: 'invalid_relation_source',
      detail: input.focusNoteId,
    });
  }
  const generated = input.generatedRelationships ?? [];
  const noteIds = new Set(input.index.documents.map(({ noteId }) => noteId));
  if (Array.isArray(generated) && generated.length > MAX_GENERATED_RELATIONSHIPS) {
    return Object.freeze({ ok: false, reason: 'relation_input_too_large' });
  }
  if (
    !Array.isArray(generated) ||
    !generated.every((relationship) => validateGeneratedRelationship(relationship, noteIds))
  ) {
    return Object.freeze({ ok: false, reason: 'invalid_generated_relationship' });
  }
  const inaccessibleInput = input.inaccessibleGithubTargets ?? [];
  const deletedInput = input.deletedLocalTargets ?? [];
  if (
    !Array.isArray(inaccessibleInput) ||
    !Array.isArray(deletedInput) ||
    inaccessibleInput.length > MAX_RELATIONS ||
    deletedInput.length > MAX_RELATIONS ||
    inaccessibleInput.some(
      (target) =>
        !exactText(target, 400) ||
        !/^https:\/\/github\.com\/[^/?#]+\/[^/?#]+(?:[/?#].*)?$/u.test(target),
    ) ||
    deletedInput.some((target) => !portableRelativePath(target))
  ) {
    return Object.freeze({ ok: false, reason: 'invalid_relation_source' });
  }
  const inaccessible = new Set(inaccessibleInput);
  const deleted = new Set(deletedInput);
  const relationCount =
    [...sources.values()].reduce((count, source) => count + source.syntax.wikiLinks.length, 0) +
    focusSource.syntax.markdownLinks.filter(({ image }) => !image).length +
    generated.length;
  if (relationCount > MAX_RELATIONS) {
    return Object.freeze({ ok: false, reason: 'relation_input_too_large' });
  }
  if (ambiguousCandidateFanoutTooLarge(input.index, sources)) {
    return Object.freeze({ ok: false, reason: 'relation_input_too_large' });
  }

  const backlinks: ContextNoteRelationRecordV1[] = [];
  const outgoing: ContextNoteRelationRecordV1[] = [];
  const repairs: ContextNoteRepairDiagnosticV1[] = [];
  const renameCache = new Map<string, string[]>();
  let fuzzyRepairScans = 0;

  for (const source of sources.values()) {
    const sourceLines = source.markdown.replace(/\r\n?/gu, '\n').split('\n');
    const resolutions = resolveContextNoteReferences(input.index, source.noteId);
    for (const resolution of resolutions) {
      const link = resolution.link;
      const target = wikiTarget(link.targetTitle, link.heading, link.blockId);
      const base = {
        relationType: link.embed ? ('embed' as const) : ('wiki_link' as const),
        sourceNoteId: source.noteId,
        sourcePath: source.relativePath,
        target,
        context: lineText(sourceLines, link.line),
        ...sourceLocation(source, link.line),
        line: link.line,
        column: link.column,
        lastModifiedAt: source.modifiedAt,
      };
      const relation: ContextNoteRelationRecordV1 =
        resolution.state === 'resolved'
          ? {
              ...base,
              state: 'resolved',
              targetNoteId: resolution.targetNoteId,
              ...(resolution.targetHeadingSlug
                ? { targetHeadingSlug: resolution.targetHeadingSlug }
                : {}),
              ...(resolution.targetBlockId ? { targetBlockId: resolution.targetBlockId } : {}),
            }
          : resolution.state === 'ambiguous_note'
            ? {
                ...base,
                state: 'ambiguous_note',
                candidateNoteIds: resolution.candidateNoteIds,
              }
            : {
                ...base,
                state: resolution.state,
                ...('targetNoteId' in resolution ? { targetNoteId: resolution.targetNoteId } : {}),
              };

      if (source.noteId === input.focusNoteId) {
        outgoing.push(relation);
        if (resolution.state === 'missing_note') {
          let candidates = renameCache.get(link.targetTitle);
          if (!candidates) {
            candidates =
              fuzzyRepairScans < MAX_FUZZY_REPAIR_SCANS
                ? renameCandidates(input.index, link.targetTitle)
                : [];
            fuzzyRepairScans += 1;
            renameCache.set(link.targetTitle, candidates);
          }
          repairs.push({
            kind: candidates.length > 0 ? 'renamed_target_candidate' : 'missing_target',
            sourceNoteId: source.noteId,
            target,
            line: link.line,
            column: link.column,
            ...(candidates.length > 0 ? { candidateNoteIds: candidates } : {}),
          });
        } else if (resolution.state === 'ambiguous_note') {
          repairs.push({
            kind: 'ambiguous_title',
            sourceNoteId: source.noteId,
            target,
            line: link.line,
            column: link.column,
            candidateNoteIds: resolution.candidateNoteIds,
          });
        } else if (resolution.state === 'missing_block') {
          repairs.push({
            kind: 'stale_block_id',
            sourceNoteId: source.noteId,
            target,
            targetNoteId: resolution.targetNoteId,
            line: link.line,
            column: link.column,
          });
        } else if (resolution.state === 'missing_heading') {
          repairs.push({
            kind: 'missing_target',
            sourceNoteId: source.noteId,
            target,
            targetNoteId: resolution.targetNoteId,
            line: link.line,
            column: link.column,
          });
        }
      }
      if (resolution.state === 'resolved' && resolution.targetNoteId === input.focusNoteId) {
        backlinks.push(relation);
      }
    }

    if (source.noteId === input.focusNoteId) {
      for (const link of source.syntax.markdownLinks.filter(({ image }) => !image)) {
        const codeReference = link.target.startsWith('vibespace:symbol/');
        const internalReference = link.target.startsWith('vibespace:');
        const localTarget =
          !link.external && !internalReference
            ? resolvedLocalTarget(source.relativePath, link.target)
            : null;
        const invalidLocal = !link.external && !internalReference && !localTarget;
        const isDeleted =
          !link.external &&
          !internalReference &&
          (deleted.has(link.target) || Boolean(localTarget && deleted.has(localTarget)));
        outgoing.push({
          state: invalidLocal
            ? 'missing_note'
            : isDeleted
              ? 'deleted'
              : link.external
                ? 'external'
                : 'resolved',
          relationType: codeReference
            ? 'code_reference'
            : internalReference
              ? 'internal_entity'
              : link.external
                ? 'external_url'
                : 'local_file',
          sourceNoteId: source.noteId,
          sourcePath: source.relativePath,
          target: link.target,
          context: lineText(sourceLines, link.line),
          ...sourceLocation(source, link.line),
          line: link.line,
          column: link.column,
          lastModifiedAt: source.modifiedAt,
        });
        if (inaccessible.has(link.target)) {
          repairs.push({
            kind: 'inaccessible_github_source',
            sourceNoteId: source.noteId,
            target: link.target,
            line: link.line,
            column: link.column,
          });
        }
        if (isDeleted) {
          repairs.push({
            kind: 'deleted_file',
            sourceNoteId: source.noteId,
            target: link.target,
            line: link.line,
            column: link.column,
          });
        }
        if (invalidLocal) {
          repairs.push({
            kind: 'missing_target',
            sourceNoteId: source.noteId,
            target: link.target,
            line: link.line,
            column: link.column,
          });
        }
      }
    }
  }

  for (const relationship of generated) {
    const source = sources.get(relationship.sourceNoteId);
    if (!source) continue;
    const relation: ContextNoteRelationRecordV1 = {
      state: 'generated',
      relationType: relationship.relationType,
      sourceNoteId: source.noteId,
      sourcePath: source.relativePath,
      target: relationship.targetNoteId,
      targetNoteId: relationship.targetNoteId,
      context: relationship.context,
      line: 1,
      column: 1,
      lastModifiedAt: source.modifiedAt,
      confidence: relationship.confidence,
      observedAt: relationship.observedAt,
    };
    if (relationship.sourceNoteId === input.focusNoteId) outgoing.push(relation);
    if (relationship.targetNoteId === input.focusNoteId) backlinks.push(relation);
  }

  if (
    backlinks.length > MAX_RELATIONS ||
    outgoing.length > MAX_RELATIONS ||
    repairs.length > MAX_RELATIONS
  ) {
    return Object.freeze({ ok: false, reason: 'relation_input_too_large' });
  }
  const mentionLabels = input.index.documents.reduce(
    (count, document) => count + 1 + document.syntax.aliases.length,
    0,
  );
  if (mentionLabels * focusSource.markdown.length > MAX_MENTION_SCAN_BUDGET) {
    return Object.freeze({ ok: false, reason: 'relation_input_too_large' });
  }
  const unlinkedMentions = findContextNoteUnlinkedMentions(
    input.index,
    input.focusNoteId,
    focusSource.markdown,
    500,
  ).map((mention) => ({
    ...mention,
    candidateNoteIds: [...mention.candidateNoteIds],
    availableActions: [...MENTION_ACTIONS],
  }));
  const value: ContextNoteRelationReportV1 = {
    version: 1,
    focusNoteId: input.focusNoteId,
    backlinks: backlinks.sort(compareRelations),
    outgoing: outgoing.sort(compareRelations),
    unlinkedMentions,
    repairs,
  };
  return Object.freeze({ ok: true, value: deepFreeze(value) });
}

function lineColumnOffset(markdown: string, line: number, column: number): number | null {
  if (!Number.isSafeInteger(line) || !Number.isSafeInteger(column) || line < 1 || column < 1) {
    return null;
  }
  let offset = 0;
  for (let currentLine = 1; currentLine < line; currentLine += 1) {
    const newline = markdown.indexOf('\n', offset);
    if (newline < 0) return null;
    offset = newline + 1;
  }
  const newline = markdown.indexOf('\n', offset);
  const rawLine = markdown.slice(offset, newline < 0 ? markdown.length : newline);
  const lineLength = rawLine.endsWith('\r') ? rawLine.length - 1 : rawLine.length;
  if (column > lineLength + 1) return null;
  return offset + column - 1;
}

export function planContextMentionLinkEdits(input: {
  index: DeepReadonly<ContextNoteReferenceIndexV1>;
  sourceNoteId: string;
  markdown: unknown;
  sourceKind: 'note' | 'source_code';
  mentions: readonly DeepReadonly<ContextUnlinkedMentionReportV1>[];
}): ContextMentionLinkEditPlanResult {
  if (
    !isRecord(input) ||
    !validRuntimeIndex(input.index) ||
    (input.sourceKind !== 'note' && input.sourceKind !== 'source_code')
  ) {
    return Object.freeze({ ok: false, reason: 'mention_input_invalid' });
  }
  if (input.sourceKind === 'source_code') {
    return Object.freeze({ ok: false, reason: 'source_code_auto_edit_forbidden' });
  }
  const parsed = parseContextNoteSyntax(input.markdown);
  if (
    !parsed.ok ||
    typeof input.markdown !== 'string' ||
    !Array.isArray(input.mentions) ||
    input.mentions.length === 0 ||
    input.mentions.length > 500
  ) {
    return Object.freeze({ ok: false, reason: 'mention_input_invalid' });
  }
  const freshMentions = findContextNoteUnlinkedMentions(
    input.index,
    input.sourceNoteId,
    input.markdown,
    500,
  );
  const edits: ContextMentionLinkEditV1[] = [];
  for (const mention of input.mentions) {
    const fresh = freshMentions.find(
      (candidate) =>
        candidate.line === mention.line &&
        candidate.column === mention.column &&
        candidate.matchedText === mention.matchedText &&
        candidate.label === mention.label &&
        candidate.matchKind === mention.matchKind &&
        candidate.candidateNoteIds.length === mention.candidateNoteIds.length &&
        candidate.candidateNoteIds.every(
          (noteId, index) => noteId === mention.candidateNoteIds[index],
        ),
    );
    if (!fresh) return Object.freeze({ ok: false, reason: 'mention_stale' });
    if (mention.candidateNoteIds.length !== 1) {
      return Object.freeze({ ok: false, reason: 'mention_ambiguous' });
    }
    const target = input.index.documents.find(
      ({ noteId }) => noteId === mention.candidateNoteIds[0],
    );
    if (!target) return Object.freeze({ ok: false, reason: 'mention_target_missing' });
    if (/[\[\]|#\r\n]/u.test(target.title) || /[\[\]|\r\n]/u.test(mention.matchedText)) {
      return Object.freeze({ ok: false, reason: 'mention_target_invalid' });
    }
    const start = lineColumnOffset(input.markdown, mention.line, mention.column);
    if (
      start === null ||
      input.markdown.slice(start, start + mention.matchedText.length) !== mention.matchedText
    ) {
      return Object.freeze({ ok: false, reason: 'mention_stale' });
    }
    const replacement =
      folded(mention.matchedText) === folded(target.title)
        ? `[[${target.title}]]`
        : `[[${target.title}|${mention.matchedText}]]`;
    edits.push({
      start,
      end: start + mention.matchedText.length,
      replacement,
    });
  }
  edits.sort((left, right) => left.start - right.start || left.end - right.end);
  for (let index = 1; index < edits.length; index += 1) {
    if (edits[index]!.start < edits[index - 1]!.end) {
      return Object.freeze({ ok: false, reason: 'mention_overlap' });
    }
  }
  let previewMarkdown = input.markdown;
  for (const edit of [...edits].reverse()) {
    previewMarkdown =
      previewMarkdown.slice(0, edit.start) + edit.replacement + previewMarkdown.slice(edit.end);
  }
  return Object.freeze({
    ok: true,
    value: deepFreeze({
      version: 1 as const,
      requiresExplicitApply: true as const,
      edits,
      previewMarkdown,
    }),
  });
}
