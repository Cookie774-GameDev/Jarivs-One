export const CODE_ENTRY_POINT_SIGNAL_KINDS = Object.freeze([
  'package_manifest',
  'application_entry',
  'route_root',
  'exported_library',
  'readme_guidance',
  'build_script',
  'centrality',
  'framework_convention',
] as const);

export type CodeEntryPointSignalKind = (typeof CODE_ENTRY_POINT_SIGNAL_KINDS)[number];

export interface CodeEntryPointSignal {
  kind: CodeEntryPointSignalKind;
  evidenceRef: string;
  confidence: number;
}

export interface CodeEntryPointCandidate {
  path: string;
  signals: readonly CodeEntryPointSignal[];
}

export interface CodeSummarySourceRevision {
  sourceId: string;
  revision: string;
}

export interface CodeIntelligenceSummaryInput {
  summaryId: string;
  targetId: string;
  text: string;
  providerId: string;
  modelId: string;
  promptVersion: string;
  sourceRevisions: readonly CodeSummarySourceRevision[];
  generatedAt: string;
  confidence: number;
}

export interface CodeIntelligenceSummary extends CodeIntelligenceSummaryInput {
  derived: true;
  executable: false;
}

export interface CodeSummaryRevisionAuthority {
  getCurrentRevision(sourceId: string): string | undefined;
}

const SIGNAL_WEIGHTS: Readonly<Record<CodeEntryPointSignalKind, number>> = Object.freeze({
  package_manifest: 1,
  application_entry: 0.9,
  route_root: 0.8,
  exported_library: 0.7,
  readme_guidance: 0.6,
  build_script: 0.5,
  centrality: 0.85,
  framework_convention: 0.75,
});

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,999}$/u;
const SHA = /^[a-fA-F0-9]{40}$/u;
const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u;
const MAX_ITEMS = 100_000;
const MAX_NODES = 500_000;
const MAX_CHARS = 20_000_000;

function fail(reason: string): never {
  throw new Error(`Invalid code-intelligence artifact ${reason}.`);
}

function text(value: unknown, reason: string, maximum = 2_000): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximum ||
    value.trim() !== value ||
    FORBIDDEN.test(value)
  ) {
    fail(reason);
  }
  return value;
}

function stableId(value: unknown, reason: string): string {
  const id = text(value, reason, 1_000);
  if (!SAFE_ID.test(id)) fail(reason);
  return id;
}

function filePath(value: unknown): string {
  const result = text(value, 'path', 2_048).replaceAll('\\', '/');
  const first = result.split('/', 1)[0];
  if (
    result.startsWith('/') ||
    result.endsWith('/') ||
    result.includes('//') ||
    first.includes(':') ||
    result.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    fail('path');
  }
  return result;
}

function revision(value: unknown): string {
  const result = text(value, 'source revision', 40);
  if (!SHA.test(result)) fail('source revision');
  return result.toLowerCase();
}

function confidence(value: unknown, reason = 'confidence'): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1) {
    fail(reason);
  }
  return value;
}

function timestamp(value: unknown): string {
  const result = text(value, 'generation time', 40);
  const milliseconds = Date.parse(result);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== result) {
    fail('generation time');
  }
  return result;
}

function assertClosed(
  value: unknown,
  reason: string,
  depth = 0,
  budget = { nodes: 0, chars: 0 },
): void {
  budget.nodes += 1;
  if (budget.nodes > MAX_NODES || depth > 7) fail(reason);
  if (typeof value === 'string') {
    if (value.length > 100_000) fail(reason);
    budget.chars += value.length;
    if (budget.chars > MAX_CHARS) fail(reason);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  let prototype: object | null;
  let keys: PropertyKey[];
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value);
    keys = Reflect.ownKeys(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return fail(reason);
  }
  if (keys.some((key) => typeof key !== 'string')) fail(reason);
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype || value.length > MAX_ITEMS) fail(reason);
    if (keys.length !== value.length + 1 || !keys.includes('length')) fail(reason);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) fail(reason);
      assertClosed(descriptor.value, reason, depth + 1, budget);
    }
    return;
  }
  if ((prototype !== Object.prototype && prototype !== null) || keys.length > 12) fail(reason);
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) fail(reason);
    assertClosed(descriptor.value, reason, depth + 1, budget);
  }
}

function clone<T>(value: T, reason: string): T {
  try {
    assertClosed(value, reason);
    return structuredClone(value);
  } catch {
    return fail(reason);
  }
}

function record(value: unknown, reason: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(reason);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(reason);
  return value as Record<string, unknown>;
}

function exact(
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
  reason: string,
): void {
  const keys = new Set(allowed);
  if (Object.keys(value).some((key) => !keys.has(key))) fail(reason);
  if (required.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) fail(reason);
}

function validateSourceRevision(
  rawSource: CodeSummarySourceRevision,
): Readonly<CodeSummarySourceRevision> {
  const source = record(rawSource, 'summary source');
  exact(source, ['sourceId', 'revision'], ['sourceId', 'revision'], 'summary source');
  return Object.freeze({
    sourceId: filePath(source.sourceId),
    revision: revision(source.revision),
  });
}

function validateSummaryInput(
  rawInput: CodeIntelligenceSummaryInput,
): Readonly<CodeIntelligenceSummaryInput> {
  const input = record(rawInput, 'summary');
  exact(
    input,
    [
      'summaryId',
      'targetId',
      'text',
      'providerId',
      'modelId',
      'promptVersion',
      'sourceRevisions',
      'generatedAt',
      'confidence',
    ],
    [
      'summaryId',
      'targetId',
      'text',
      'providerId',
      'modelId',
      'promptVersion',
      'sourceRevisions',
      'generatedAt',
      'confidence',
    ],
    'summary',
  );
  if (!Array.isArray(input.sourceRevisions) || input.sourceRevisions.length === 0) {
    fail('summary source');
  }
  const sourceRevisions = input.sourceRevisions.map((source) =>
    validateSourceRevision(source as CodeSummarySourceRevision),
  );
  if (new Set(sourceRevisions.map((source) => source.sourceId)).size !== sourceRevisions.length) {
    fail('duplicate summary source');
  }
  return Object.freeze({
    summaryId: stableId(input.summaryId, 'summary ID'),
    targetId: stableId(input.targetId, 'target ID'),
    text: text(input.text, 'summary text', 20_000),
    providerId: stableId(input.providerId, 'provider ID'),
    modelId: stableId(input.modelId, 'model ID'),
    promptVersion: stableId(input.promptVersion, 'prompt version'),
    sourceRevisions: Object.freeze(sourceRevisions),
    generatedAt: timestamp(input.generatedAt),
    confidence: confidence(input.confidence),
  });
}

function validateStoredSummary(rawSummary: CodeIntelligenceSummary): CodeIntelligenceSummary {
  const summary = record(clone(rawSummary, 'stored summary'), 'stored summary');
  exact(
    summary,
    [
      'summaryId',
      'targetId',
      'text',
      'providerId',
      'modelId',
      'promptVersion',
      'sourceRevisions',
      'generatedAt',
      'confidence',
      'derived',
      'executable',
    ],
    [
      'summaryId',
      'targetId',
      'text',
      'providerId',
      'modelId',
      'promptVersion',
      'sourceRevisions',
      'generatedAt',
      'confidence',
      'derived',
      'executable',
    ],
    'stored summary',
  );
  if (summary.derived !== true || summary.executable !== false) fail('summary authority');
  const input = validateSummaryInput({
    summaryId: summary.summaryId as string,
    targetId: summary.targetId as string,
    text: summary.text as string,
    providerId: summary.providerId as string,
    modelId: summary.modelId as string,
    promptVersion: summary.promptVersion as string,
    sourceRevisions: summary.sourceRevisions as CodeSummarySourceRevision[],
    generatedAt: summary.generatedAt as string,
    confidence: summary.confidence as number,
  });
  return Object.freeze({ ...input, derived: true, executable: false });
}

export function rankCodeEntryPoints(rawCandidates: readonly CodeEntryPointCandidate[]) {
  const candidates = clone(rawCandidates, 'entry points');
  if (!Array.isArray(candidates)) fail('entry points');
  const paths = new Set<string>();
  const ranked = candidates.map((rawCandidate) => {
    const candidate = record(rawCandidate, 'entry point');
    exact(candidate, ['path', 'signals'], ['path', 'signals'], 'entry point');
    const candidatePath = filePath(candidate.path);
    if (paths.has(candidatePath)) fail('duplicate entry point');
    paths.add(candidatePath);
    if (!Array.isArray(candidate.signals) || candidate.signals.length === 0) {
      fail('entry point signal');
    }
    const kinds = new Set<CodeEntryPointSignalKind>();
    const reasons = candidate.signals.map((rawSignal) => {
      const signal = record(rawSignal, 'entry point signal');
      exact(
        signal,
        ['kind', 'evidenceRef', 'confidence'],
        ['kind', 'evidenceRef', 'confidence'],
        'entry point signal',
      );
      if (!(CODE_ENTRY_POINT_SIGNAL_KINDS as readonly unknown[]).includes(signal.kind)) {
        fail('entry point signal');
      }
      const kind = signal.kind as CodeEntryPointSignalKind;
      if (kinds.has(kind)) fail('duplicate entry point signal');
      kinds.add(kind);
      return Object.freeze({
        signal: kind,
        evidenceRef: stableId(signal.evidenceRef, 'entry point evidence'),
        confidence: confidence(signal.confidence),
      });
    });
    const score = reasons.reduce(
      (total, reason) => total + SIGNAL_WEIGHTS[reason.signal] * reason.confidence,
      0,
    );
    return { path: candidatePath, score, reasons: Object.freeze(reasons) };
  });
  ranked.sort((left, right) => {
    const scoreOrder = right.score - left.score;
    if (scoreOrder !== 0) return scoreOrder;
    return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
  });
  return Object.freeze(
    ranked.map((entry, index) =>
      Object.freeze({
        path: entry.path,
        rank: index + 1,
        score: Number(entry.score.toFixed(6)),
        reasons: entry.reasons,
      }),
    ),
  );
}

export function buildCodeIntelligenceSummary(
  rawInput: CodeIntelligenceSummaryInput,
  authority: CodeSummaryRevisionAuthority,
): Readonly<CodeIntelligenceSummary> {
  const input = validateSummaryInput(clone(rawInput, 'summary'));
  if (!authority || typeof authority.getCurrentRevision !== 'function') {
    fail('revision authority');
  }
  for (const source of input.sourceRevisions) {
    const current = authority.getCurrentRevision(source.sourceId);
    if (current === undefined || revision(current) !== source.revision) {
      fail('source revision');
    }
  }
  return Object.freeze({ ...input, derived: true, executable: false });
}

export function planAffectedCodeSummaryRegeneration(
  rawSummaries: readonly CodeIntelligenceSummary[],
  authority: CodeSummaryRevisionAuthority,
) {
  const summaries = clone(rawSummaries, 'summaries');
  if (!Array.isArray(summaries)) fail('summaries');
  if (!authority || typeof authority.getCurrentRevision !== 'function') {
    fail('revision authority');
  }
  const validated = summaries.map(validateStoredSummary);
  if (new Set(validated.map((summary) => summary.summaryId)).size !== validated.length) {
    fail('duplicate summary');
  }
  const regenerateSummaryIds: string[] = [];
  const unchangedSummaryIds: string[] = [];
  for (const summary of validated) {
    const affected = summary.sourceRevisions.some((source) => {
      const current = authority.getCurrentRevision(source.sourceId);
      return current === undefined || revision(current) !== source.revision;
    });
    (affected ? regenerateSummaryIds : unchangedSummaryIds).push(summary.summaryId);
  }
  return Object.freeze({
    regenerateSummaryIds: Object.freeze(regenerateSummaryIds),
    unchangedSummaryIds: Object.freeze(unchangedSummaryIds),
    affectedOnly: true as const,
    executable: false as const,
  });
}
