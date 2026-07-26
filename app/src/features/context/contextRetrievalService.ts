import {
  CONTEXT_ENTITY_KINDS,
  CONTEXT_SOURCE_KINDS,
  type ContextReferenceV2,
  type ContextSourceKind,
  type DeepReadonly,
} from './contracts';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,199}$/u;
const MAX_TEXT_CHARS = 32_768;
const MAX_REQUEST_IDS = 200;
const MAX_CANDIDATES = 200;
const MAX_TOKENS = 32_768;
const MAX_TIMESTAMP = 8_640_000_000_000_000;
const TASK_TOKEN_CAPS = {
  answer: 1_200,
  code: 2_400,
  debug: 2_400,
  plan: 1_800,
  research: 3_200,
  terminal: 1_600,
  agent: 1_600,
} as const;

export const CONTEXT_RETRIEVAL_RANKING_SIGNALS = [
  'explicit_attachment',
  'active_file',
  'task_intent',
  'lexical_match',
  'semantic_match',
  'graph_distance',
  'source_trust',
  'recency',
  'freshness',
  'active_terminal',
  'selected_agent',
  'selected_skill',
  'user_pinned_importance',
] as const;

const RANKING_WEIGHTS: Readonly<
  Record<(typeof CONTEXT_RETRIEVAL_RANKING_SIGNALS)[number], number>
> = Object.freeze({
  explicit_attachment: 0.2,
  active_file: 0.1,
  task_intent: 0.09,
  lexical_match: 0.09,
  semantic_match: 0.1,
  graph_distance: 0.07,
  source_trust: 0.08,
  recency: 0.05,
  freshness: 0.06,
  active_terminal: 0.04,
  selected_agent: 0.03,
  selected_skill: 0.03,
  user_pinned_importance: 0.06,
});

export type ContextRetrievalTaskKind = keyof typeof TASK_TOKEN_CAPS;
export type ContextRetrievalFreshness = 'current' | 'stale' | 'unknown';
export type ContextRetrievalSourceTrust = 'user_direct' | 'app_verified' | 'external_untrusted';

export interface ContextRetrievalRequest {
  projectId: string | null;
  chatId?: string;
  terminalSessionId?: string;
  agentSlug?: string;
  userText: string;
  explicitMapIds?: string[];
  explicitEntityIds?: string[];
  selectedSkillIds?: string[];
  preferredSourceKinds?: ContextSourceKind[];
  maxTokens: number;
  requireFresh?: boolean;
}

export interface ContextRetrievalTask {
  kind: ContextRetrievalTaskKind;
  terms: readonly string[];
}

export interface ContextRetrievalMap {
  id: string;
  knowledgeRevision: number;
}

export interface ContextRetrievalProvenance {
  sourceRevision: string;
  indexedAt: number;
  githubRef?: string;
  githubSha?: string;
  terminalSessionId?: string;
}

export interface ContextRetrievalRelatedEntity {
  reference: ContextReferenceV2;
  provenance: ContextRetrievalProvenance;
}

export interface ContextRetrievalCandidate {
  id: string;
  mapId: string;
  mapRevision: number;
  sourceId: string;
  sourceKind: ContextSourceKind;
  entity: ContextReferenceV2;
  exactExcerpt: string;
  summary: string;
  taskIntents: readonly ContextRetrievalTaskKind[];
  activeFile: boolean;
  lexicalMatch: number;
  semanticMatch: number;
  graphDistance: number | null;
  sourceTrust: ContextRetrievalSourceTrust;
  observedAt: number;
  freshness: ContextRetrievalFreshness;
  terminalSessionId: string | null;
  agentSlug: string | null;
  skillIds: readonly string[];
  userPinnedImportance: number;
  relatedEntities: readonly ContextRetrievalRelatedEntity[];
  provenance: ContextRetrievalProvenance;
}

export interface RetrievedContextCitation {
  label: string;
  action: {
    kind: 'open_source' | 'highlight_entity';
    sourceKind: ContextSourceKind;
    mapId: string;
    entityId: string;
    path?: string;
    lineStart?: number;
    lineEnd?: number;
  };
}

export interface RetrievedContextItem {
  id: string;
  mapId: string;
  sourceId: string;
  sourceKind: ContextSourceKind;
  entity: ContextReferenceV2;
  exactExcerpt: string;
  summary: string;
  freshness: ContextRetrievalFreshness;
  ranking: {
    score: number;
    reasons: readonly (typeof CONTEXT_RETRIEVAL_RANKING_SIGNALS)[number][];
  };
  citation: RetrievedContextCitation;
  provenance: ContextRetrievalProvenance;
}

export interface RetrievedContextReference extends ContextReferenceV2 {
  mapId: string;
  mapRevision: number;
  admittedByItemIds: string[];
  provenance: ContextRetrievalProvenance;
}

export interface ContextRetrievalResult {
  queryId: string;
  mapRevisions: Record<string, number>;
  items: RetrievedContextItem[];
  relatedEntities: RetrievedContextReference[];
  omittedCount: number;
  staleItems: string[];
  warnings: string[];
  builtAt: number;
}

export interface ContextCandidateRetrievalInput {
  projectId: string;
  mapIds: readonly string[];
  task: ContextRetrievalTask;
  request: Readonly<ContextRetrievalRequest>;
  limit: number;
}

export interface ContextRetrievalDependencies {
  resolveActiveProject(requestedProjectId: string | null): Promise<string | null>;
  listActiveMaps(projectId: string): Promise<readonly ContextRetrievalMap[]>;
  retrieveCandidates(
    input: ContextCandidateRetrievalInput,
  ): Promise<readonly ContextRetrievalCandidate[]>;
  now(): number;
  createQueryId(): string;
}

export type ContextRetrievalErrorCode =
  | 'invalid_request'
  | 'invalid_dependency_result'
  | 'invalid_candidate';

export class ContextRetrievalError extends Error {
  constructor(
    readonly code: ContextRetrievalErrorCode,
    readonly detail?: string,
  ) {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'ContextRetrievalError';
  }
}

function safeId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ID.test(value);
}

function safeTimestamp(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= MAX_TIMESTAMP
  );
}

function safeText(value: unknown, allowEmpty = false): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_TEXT_CHARS &&
    (allowEmpty || value.trim().length > 0) &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value)
  );
}

function safeSingleLineText(value: unknown): value is string {
  return safeText(value) && !/[\r\n\u2028\u2029]/u.test(value);
}

function portablePath(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 4_096 ||
    /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u206f\ufeff]/u.test(value) ||
    value.includes('\\') ||
    value.includes('%') ||
    value.startsWith('/') ||
    /^[A-Za-z]:/u.test(value) ||
    /^[a-z][a-z0-9+.-]*:/iu.test(value)
  ) {
    return false;
  }
  return value
    .split('/')
    .every(
      (segment) =>
        segment.length > 0 &&
        segment !== '.' &&
        segment !== '..' &&
        !segment.includes(':') &&
        !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(segment) &&
        !segment.endsWith('.') &&
        !segment.endsWith(' '),
    );
}

function safeUnit(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

const REQUEST_KEYS = new Set([
  'projectId',
  'chatId',
  'terminalSessionId',
  'agentSlug',
  'userText',
  'explicitMapIds',
  'explicitEntityIds',
  'selectedSkillIds',
  'preferredSourceKinds',
  'maxTokens',
  'requireFresh',
]);

function requestRecord(value: unknown): Record<string, unknown> | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    if (Reflect.ownKeys(value).some((key) => typeof key !== 'string')) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const output: Record<string, unknown> = Object.create(null);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!REQUEST_KEYS.has(key) || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        return null;
      }
      output[key] = descriptor.value;
    }
    return output;
  } catch {
    return null;
  }
}

function normalizedIds(value: unknown, detail: string): string[] | undefined {
  if (value === undefined) return undefined;
  try {
    if (!Array.isArray(value)) throw new Error(detail);
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<
      string,
      PropertyDescriptor
    >;
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (
      !lengthDescriptor ||
      !Object.hasOwn(lengthDescriptor, 'value') ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0 ||
      lengthDescriptor.value > MAX_REQUEST_IDS ||
      Reflect.ownKeys(value).length !== lengthDescriptor.value + 1
    ) {
      throw new Error(detail);
    }
    const ids: string[] = [];
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const descriptor = descriptors[String(index)];
      if (
        !descriptor?.enumerable ||
        !Object.hasOwn(descriptor, 'value') ||
        !safeId(descriptor.value)
      ) {
        throw new Error(detail);
      }
      ids.push(descriptor.value);
    }
    if (new Set(ids).size !== ids.length) throw new Error(detail);
    return Object.freeze(ids) as string[];
  } catch {
    throw new ContextRetrievalError('invalid_request', detail);
  }
}

function normalizedSourceKinds(value: unknown): ContextSourceKind[] | undefined {
  const values = normalizedIds(value, 'preferred_source_kinds');
  if (values === undefined) return undefined;
  if (
    values.length > CONTEXT_SOURCE_KINDS.length ||
    values.some((kind) => !(CONTEXT_SOURCE_KINDS as readonly string[]).includes(kind))
  ) {
    throw new ContextRetrievalError('invalid_request', 'preferred_source_kinds');
  }
  return values as ContextSourceKind[];
}

function normalizeRequest(value: unknown): Readonly<ContextRetrievalRequest> {
  const request = requestRecord(value);
  if (
    !request ||
    !Object.hasOwn(request, 'projectId') ||
    !Object.hasOwn(request, 'userText') ||
    !Object.hasOwn(request, 'maxTokens') ||
    (request.projectId !== null && !safeId(request.projectId)) ||
    !safeText(request.userText) ||
    !Number.isSafeInteger(request.maxTokens) ||
    (request.maxTokens as number) < 1 ||
    (request.maxTokens as number) > MAX_TOKENS ||
    (request.requireFresh !== undefined && typeof request.requireFresh !== 'boolean')
  ) {
    throw new ContextRetrievalError('invalid_request', 'root');
  }
  for (const [value, detail] of [
    [request.chatId, 'chat_id'],
    [request.terminalSessionId, 'terminal_session_id'],
    [request.agentSlug, 'agent_slug'],
  ] as const) {
    if (value !== undefined && !safeId(value)) {
      throw new ContextRetrievalError('invalid_request', detail);
    }
  }
  const explicitMapIds = normalizedIds(request.explicitMapIds, 'explicit_map_ids');
  const explicitEntityIds = normalizedIds(request.explicitEntityIds, 'explicit_entity_ids');
  const selectedSkillIds = normalizedIds(request.selectedSkillIds, 'selected_skill_ids');
  const preferredSourceKinds = normalizedSourceKinds(request.preferredSourceKinds);
  return Object.freeze({
    projectId: request.projectId as string | null,
    ...(request.chatId === undefined ? {} : { chatId: request.chatId as string }),
    ...(request.terminalSessionId === undefined
      ? {}
      : { terminalSessionId: request.terminalSessionId as string }),
    ...(request.agentSlug === undefined ? {} : { agentSlug: request.agentSlug as string }),
    userText: request.userText as string,
    ...(explicitMapIds === undefined ? {} : { explicitMapIds }),
    ...(explicitEntityIds === undefined ? {} : { explicitEntityIds }),
    ...(selectedSkillIds === undefined ? {} : { selectedSkillIds }),
    ...(preferredSourceKinds === undefined ? {} : { preferredSourceKinds }),
    maxTokens: request.maxTokens as number,
    ...(request.requireFresh === undefined
      ? {}
      : { requireFresh: request.requireFresh as boolean }),
  });
}

const TASK_PATTERNS: readonly [ContextRetrievalTaskKind, RegExp][] = [
  ['debug', /\b(?:bug|debug|error|fail|fix|issue|regression|test)\b/iu],
  ['terminal', /\b(?:command|shell|terminal|powershell|bash)\b/iu],
  ['agent', /\b(?:agent|delegate|subagent|handoff)\b/iu],
  ['code', /\b(?:code|implement|refactor|function|class|module|compile)\b/iu],
  ['plan', /\b(?:plan|design|architecture|milestone)\b/iu],
  ['research', /\b(?:research|compare|investigate|analyze|analyse)\b/iu],
];

function classifyTask(userText: string): ContextRetrievalTask {
  const kind = TASK_PATTERNS.find(([, pattern]) => pattern.test(userText))?.[0] ?? 'answer';
  const terms = Array.from(
    new Set(userText.toLocaleLowerCase('en-US').match(/[\p{L}\p{N}_-]{2,}/gu) ?? []),
  ).slice(0, 64);
  return Object.freeze({ kind, terms: Object.freeze(terms) });
}

function validateMap(map: ContextRetrievalMap): void {
  if (
    !safeId(map.id) ||
    !Number.isSafeInteger(map.knowledgeRevision) ||
    map.knowledgeRevision < 0
  ) {
    throw new ContextRetrievalError('invalid_dependency_result', 'active_map');
  }
}

function validReference(reference: ContextReferenceV2): boolean {
  return (
    safeId(reference.entityId) &&
    (CONTEXT_ENTITY_KINDS as readonly string[]).includes(reference.kind) &&
    safeSingleLineText(reference.label) &&
    safeId(reference.sourceId) &&
    (reference.path === undefined || portablePath(reference.path)) &&
    (reference.lineStart === undefined || reference.path !== undefined) &&
    (reference.lineEnd === undefined || reference.path !== undefined) &&
    (reference.lineStart === undefined ||
      (Number.isSafeInteger(reference.lineStart) && reference.lineStart >= 1)) &&
    (reference.lineEnd === undefined ||
      (Number.isSafeInteger(reference.lineEnd) && reference.lineEnd >= (reference.lineStart ?? 1)))
  );
}

function validProvenance(provenance: ContextRetrievalProvenance): boolean {
  return (
    safeSingleLineText(provenance.sourceRevision) &&
    safeTimestamp(provenance.indexedAt) &&
    (provenance.githubRef === undefined || safeSingleLineText(provenance.githubRef)) &&
    (provenance.githubSha === undefined || /^[a-f0-9]{40,64}$/u.test(provenance.githubSha)) &&
    (provenance.terminalSessionId === undefined || safeId(provenance.terminalSessionId))
  );
}

function validateCandidate(
  candidate: ContextRetrievalCandidate,
  mapRevisions: ReadonlyMap<string, number>,
): void {
  if (
    !safeId(candidate.id) ||
    !safeId(candidate.mapId) ||
    !mapRevisions.has(candidate.mapId) ||
    !Number.isSafeInteger(candidate.mapRevision) ||
    candidate.mapRevision < 0 ||
    candidate.mapRevision !== mapRevisions.get(candidate.mapId) ||
    !safeId(candidate.sourceId) ||
    !(CONTEXT_SOURCE_KINDS as readonly string[]).includes(candidate.sourceKind) ||
    !validReference(candidate.entity) ||
    candidate.entity.sourceId !== candidate.sourceId ||
    !safeText(candidate.exactExcerpt) ||
    !safeText(candidate.summary) ||
    !Array.isArray(candidate.taskIntents) ||
    candidate.taskIntents.some((intent) => !Object.hasOwn(TASK_TOKEN_CAPS, intent)) ||
    typeof candidate.activeFile !== 'boolean' ||
    !safeUnit(candidate.lexicalMatch) ||
    !safeUnit(candidate.semanticMatch) ||
    (candidate.graphDistance !== null &&
      (!Number.isSafeInteger(candidate.graphDistance) || candidate.graphDistance < 0)) ||
    !['user_direct', 'app_verified', 'external_untrusted'].includes(candidate.sourceTrust) ||
    !safeTimestamp(candidate.observedAt) ||
    !['current', 'stale', 'unknown'].includes(candidate.freshness) ||
    (candidate.terminalSessionId !== null && !safeId(candidate.terminalSessionId)) ||
    (candidate.agentSlug !== null && !safeId(candidate.agentSlug)) ||
    !Array.isArray(candidate.skillIds) ||
    candidate.skillIds.length > MAX_REQUEST_IDS ||
    candidate.skillIds.some((skillId) => !safeId(skillId)) ||
    !safeUnit(candidate.userPinnedImportance) ||
    !Array.isArray(candidate.relatedEntities) ||
    candidate.relatedEntities.length > MAX_REQUEST_IDS ||
    candidate.relatedEntities.some(
      (related) =>
        !related ||
        typeof related !== 'object' ||
        !validReference(related.reference) ||
        !validProvenance(related.provenance),
    ) ||
    !validProvenance(candidate.provenance)
  ) {
    throw new ContextRetrievalError('invalid_candidate', candidate.id);
  }
}

function trustScore(trust: ContextRetrievalSourceTrust): number {
  if (trust === 'user_direct') return 1;
  if (trust === 'app_verified') return 0.8;
  return 0.2;
}

function freshnessScore(freshness: ContextRetrievalFreshness): number {
  if (freshness === 'current') return 1;
  if (freshness === 'unknown') return 0.35;
  return 0;
}

function recencyScore(observedAt: number, now: number): number {
  const age = Math.max(0, now - observedAt);
  if (age <= 60_000) return 1;
  return Math.max(0, 1 - age / (30 * 24 * 60 * 60 * 1_000));
}

function rankCandidate(
  candidate: ContextRetrievalCandidate,
  request: ContextRetrievalRequest,
  task: ContextRetrievalTask,
  now: number,
): RetrievedContextItem['ranking'] {
  const explicit =
    (request.explicitEntityIds?.includes(candidate.entity.entityId) ?? false) ||
    (request.explicitMapIds?.includes(candidate.mapId) ?? false);
  const selectedSkills = new Set(request.selectedSkillIds ?? []);
  const values: Record<(typeof CONTEXT_RETRIEVAL_RANKING_SIGNALS)[number], number> = {
    explicit_attachment: explicit ? 1 : 0,
    active_file: candidate.activeFile ? 1 : 0,
    task_intent: candidate.taskIntents.includes(task.kind) ? 1 : 0,
    lexical_match: candidate.lexicalMatch,
    semantic_match: candidate.semanticMatch,
    graph_distance: candidate.graphDistance === null ? 0 : 1 / (1 + candidate.graphDistance),
    source_trust: trustScore(candidate.sourceTrust),
    recency: recencyScore(candidate.observedAt, now),
    freshness: freshnessScore(candidate.freshness),
    active_terminal:
      request.terminalSessionId !== undefined &&
      candidate.terminalSessionId === request.terminalSessionId
        ? 1
        : 0,
    selected_agent:
      request.agentSlug !== undefined && candidate.agentSlug === request.agentSlug ? 1 : 0,
    selected_skill: candidate.skillIds.some((skillId) => selectedSkills.has(skillId)) ? 1 : 0,
    user_pinned_importance: candidate.userPinnedImportance,
  };
  const score = CONTEXT_RETRIEVAL_RANKING_SIGNALS.reduce(
    (total, signal) => total + values[signal] * RANKING_WEIGHTS[signal],
    0,
  );
  return {
    score: Number(score.toFixed(6)),
    reasons: CONTEXT_RETRIEVAL_RANKING_SIGNALS.filter((signal) => values[signal] > 0),
  };
}

function compareRanked(
  left: { candidate: ContextRetrievalCandidate; ranking: RetrievedContextItem['ranking'] },
  right: { candidate: ContextRetrievalCandidate; ranking: RetrievedContextItem['ranking'] },
): number {
  return (
    right.ranking.score - left.ranking.score ||
    right.candidate.observedAt - left.candidate.observedAt ||
    left.candidate.id.localeCompare(right.candidate.id, 'en-US')
  );
}

function citation(candidate: ContextRetrievalCandidate): RetrievedContextCitation {
  const { entity } = candidate;
  const lineLabel =
    entity.lineStart === undefined
      ? ''
      : entity.lineEnd === undefined || entity.lineEnd === entity.lineStart
        ? ` line ${entity.lineStart}`
        : ` lines ${entity.lineStart}–${entity.lineEnd}`;
  return {
    label: `${entity.label}${lineLabel}`,
    action: {
      kind: candidate.sourceKind === 'github_repository' ? 'open_source' : 'highlight_entity',
      sourceKind: candidate.sourceKind,
      mapId: candidate.mapId,
      entityId: entity.entityId,
      ...(entity.path === undefined ? {} : { path: entity.path }),
      ...(entity.lineStart === undefined ? {} : { lineStart: entity.lineStart }),
      ...(entity.lineEnd === undefined ? {} : { lineEnd: entity.lineEnd }),
    },
  };
}

function retrievedItem(
  candidate: ContextRetrievalCandidate,
  ranking: RetrievedContextItem['ranking'],
): RetrievedContextItem {
  return {
    id: candidate.id,
    mapId: candidate.mapId,
    sourceId: candidate.sourceId,
    sourceKind: candidate.sourceKind,
    entity: { ...candidate.entity },
    exactExcerpt: candidate.exactExcerpt,
    summary: candidate.summary,
    freshness: candidate.freshness,
    ranking,
    citation: citation(candidate),
    provenance: { ...candidate.provenance },
  };
}

function retrievedRelated(
  candidate: ContextRetrievalCandidate,
  related: ContextRetrievalRelatedEntity,
): RetrievedContextReference {
  return {
    mapId: candidate.mapId,
    mapRevision: candidate.mapRevision,
    ...related.reference,
    admittedByItemIds: [candidate.id],
    provenance: { ...related.provenance },
  };
}

function relatedKey(reference: RetrievedContextReference): string {
  return `${reference.mapId}\0${reference.sourceId}\0${reference.entityId}`;
}

function relatedEvidence(reference: RetrievedContextReference): string {
  const { admittedByItemIds: _admittedByItemIds, ...evidence } = reference;
  return JSON.stringify(evidence);
}

function mergeRelated(
  target: Map<string, RetrievedContextReference>,
  reference: RetrievedContextReference,
): void {
  const key = relatedKey(reference);
  const current = target.get(key);
  if (!current) {
    target.set(key, reference);
    return;
  }
  if (relatedEvidence(current) !== relatedEvidence(reference)) {
    throw new ContextRetrievalError('invalid_candidate', 'related_reference_conflict');
  }
  current.admittedByItemIds = Array.from(
    new Set([...current.admittedByItemIds, ...reference.admittedByItemIds]),
  ).sort((left, right) => left.localeCompare(right, 'en-US'));
}

function contextPackTokenUpperBound(
  items: readonly RetrievedContextItem[],
  relatedEntities: readonly RetrievedContextReference[],
): number {
  // UTF-8 bytes are a conservative upper bound for byte-level model tokenizers:
  // no encoded token can represent less than one source byte.
  return new TextEncoder().encode(JSON.stringify({ items, relatedEntities })).byteLength;
}

function detachedFreeze<T>(value: T): DeepReadonly<T> {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => detachedFreeze(entry))) as DeepReadonly<T>;
  }
  if (value && typeof value === 'object') {
    const copy: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      copy[key] = detachedFreeze(entry);
    }
    return Object.freeze(copy) as DeepReadonly<T>;
  }
  return value as DeepReadonly<T>;
}

function emptyResult(
  dependencies: ContextRetrievalDependencies,
  warning: string,
): DeepReadonly<ContextRetrievalResult> {
  const queryId = dependencies.createQueryId();
  const builtAt = dependencies.now();
  if (!safeId(queryId) || !safeTimestamp(builtAt)) {
    throw new ContextRetrievalError('invalid_dependency_result', 'identity_or_time');
  }
  return detachedFreeze({
    queryId,
    mapRevisions: {},
    items: [],
    relatedEntities: [],
    omittedCount: 0,
    staleItems: [],
    warnings: [warning],
    builtAt,
  });
}

export function createContextRetrievalService(dependencies: ContextRetrievalDependencies): {
  retrieve(request: ContextRetrievalRequest): Promise<DeepReadonly<ContextRetrievalResult>>;
} {
  return Object.freeze({
    async retrieve(input: ContextRetrievalRequest): Promise<DeepReadonly<ContextRetrievalResult>> {
      const request = normalizeRequest(input);
      const projectId = await dependencies.resolveActiveProject(request.projectId);
      if (projectId === null) return emptyResult(dependencies, 'active_project_not_found');
      if (!safeId(projectId)) {
        throw new ContextRetrievalError('invalid_dependency_result', 'project_id');
      }

      const activeMaps = [...(await dependencies.listActiveMaps(projectId))];
      if (activeMaps.length > MAX_REQUEST_IDS) {
        throw new ContextRetrievalError('invalid_dependency_result', 'too_many_active_maps');
      }
      activeMaps.forEach(validateMap);
      if (new Set(activeMaps.map(({ id }) => id)).size !== activeMaps.length) {
        throw new ContextRetrievalError('invalid_dependency_result', 'duplicate_map');
      }
      const explicitMapIds = request.explicitMapIds ? new Set(request.explicitMapIds) : null;
      const selectedMaps = explicitMapIds
        ? activeMaps.filter(({ id }) => explicitMapIds.has(id))
        : activeMaps;
      if (selectedMaps.length === 0) {
        return emptyResult(dependencies, 'active_context_map_not_found');
      }

      const task = classifyTask(request.userText);
      const queryId = dependencies.createQueryId();
      const builtAt = dependencies.now();
      if (!safeId(queryId) || !safeTimestamp(builtAt)) {
        throw new ContextRetrievalError('invalid_dependency_result', 'identity_or_time');
      }
      const candidates = [
        ...(await dependencies.retrieveCandidates({
          projectId,
          mapIds: selectedMaps.map(({ id }) => id),
          task,
          request,
          limit: MAX_CANDIDATES,
        })),
      ];
      if (candidates.length > MAX_CANDIDATES) {
        throw new ContextRetrievalError('invalid_dependency_result', 'too_many_candidates');
      }
      const mapRevisions = new Map(
        selectedMaps.map(({ id, knowledgeRevision }) => [id, knowledgeRevision] as const),
      );
      candidates.forEach((candidate) => validateCandidate(candidate, mapRevisions));
      if (new Set(candidates.map(({ id }) => id)).size !== candidates.length) {
        throw new ContextRetrievalError('invalid_dependency_result', 'duplicate_candidate');
      }
      const relatedEvidenceByKey = new Map<string, string>();
      for (const candidate of candidates) {
        for (const related of candidate.relatedEntities) {
          const reference = retrievedRelated(candidate, related);
          const key = relatedKey(reference);
          const evidence = relatedEvidence(reference);
          const existing = relatedEvidenceByKey.get(key);
          if (existing !== undefined && existing !== evidence) {
            throw new ContextRetrievalError('invalid_candidate', 'related_reference_conflict');
          }
          relatedEvidenceByKey.set(key, evidence);
        }
      }

      const preferredKinds = request.preferredSourceKinds
        ? new Set(request.preferredSourceKinds)
        : null;
      const eligible = candidates.filter(
        (candidate) => !preferredKinds || preferredKinds.has(candidate.sourceKind),
      );
      const ranked = eligible
        .map((candidate) => ({
          candidate,
          ranking: rankCandidate(candidate, request, task, builtAt),
        }))
        .sort(compareRanked);
      const budget = Math.min(request.maxTokens, TASK_TOKEN_CAPS[task.kind]);
      const items: RetrievedContextItem[] = [];
      const relatedByKey = new Map<string, RetrievedContextReference>();
      const staleItems: string[] = [];
      let omittedForBudget = false;
      let omittedCount = candidates.length - eligible.length;

      for (const { candidate, ranking } of ranked) {
        if (request.requireFresh && candidate.freshness !== 'current') {
          staleItems.push(candidate.id);
          omittedCount += 1;
          continue;
        }
        const item = retrievedItem(candidate, ranking);
        const projectedRelated = new Map(
          [...relatedByKey].map(([key, value]) => [
            key,
            { ...value, admittedByItemIds: [...value.admittedByItemIds] },
          ]),
        );
        for (const related of candidate.relatedEntities) {
          mergeRelated(projectedRelated, retrievedRelated(candidate, related));
        }
        if (contextPackTokenUpperBound([...items, item], [...projectedRelated.values()]) > budget) {
          omittedForBudget = true;
          omittedCount += 1;
          continue;
        }
        items.push(item);
        relatedByKey.clear();
        for (const [key, value] of projectedRelated) relatedByKey.set(key, value);
      }

      const warnings: string[] = [];
      if (staleItems.length > 0) warnings.push('stale_items_omitted');
      if (omittedForBudget) warnings.push('context_budget_exhausted');

      return detachedFreeze({
        queryId,
        mapRevisions: Object.fromEntries(
          selectedMaps
            .map(({ id, knowledgeRevision }) => [id, knowledgeRevision] as const)
            .sort(([left], [right]) => left.localeCompare(right, 'en-US')),
        ),
        items,
        relatedEntities: [...relatedByKey.values()].sort(
          (left, right) =>
            left.mapId.localeCompare(right.mapId, 'en-US') ||
            left.sourceId.localeCompare(right.sourceId, 'en-US') ||
            left.entityId.localeCompare(right.entityId, 'en-US'),
        ),
        omittedCount,
        staleItems: staleItems.sort((left, right) => left.localeCompare(right, 'en-US')),
        warnings,
        builtAt,
      });
    },
  });
}
