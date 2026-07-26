import {
  CONTEXT_SOURCE_KINDS,
  CONTEXT_SOURCE_STATUSES,
  type ContextSourceKind,
  type ContextSourceStatus,
  type DeepReadonly,
} from './contracts';

const MAX_RESULTS = 100;
const MAX_ID_CHARS = 200;
const MAX_TITLE_CHARS = 500;
const MAX_PATH_CHARS = 1_000;
const MAX_EXCERPT_BYTES = 8 * 1_024;
const MAX_DETAIL_CHARS = 1_000;
const MAX_PROPERTY_PREVIEW_CHARS = 2_000;
const MAX_TIMESTAMP = 8_640_000_000_000_000;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,199}$/;
const SAFE_PROPERTY = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

const MATCH_REASONS = [
  'title',
  'path',
  'content',
  'property',
  'tag',
  'symbol',
  'semantic',
  'hybrid',
] as const;

const FRESHNESS_STATUSES = [
  'current',
  'stale',
  'offline',
  'permission_required',
  'indexing',
  'error',
  'removed',
] as const;

export type ContextSearchMatchReason = (typeof MATCH_REASONS)[number];
export type ContextSearchFreshnessStatus = (typeof FRESHNESS_STATUSES)[number];
export type ContextSearchSourceActionKind =
  | 'open_local_source'
  | 'open_github_source'
  | 'open_vibespace_source';

export interface ContextSearchResultLocationV1 {
  lineStart?: number;
  lineEnd?: number;
  page?: number;
  blockId?: string;
}

export interface ContextSearchResultCandidateV1 {
  version: 1;
  id: string;
  accountId: string;
  mapId: string;
  entityId: string;
  sourceId: string;
  title: string;
  path: string;
  sourceType: ContextSourceKind;
  excerpt: string;
  matchReason: {
    kind: ContextSearchMatchReason;
    detail: string;
  };
  relevantProperty: {
    name: string;
    valuePreview: string;
  } | null;
  location: ContextSearchResultLocationV1;
  freshnessEvidence: {
    sourceStatus: ContextSourceStatus;
    indexedAt: number;
    sourceUpdatedAt: number;
    indexedRevision: string;
    sourceRevision: string;
  };
  score: number;
}

export interface ContextSearchResultV1 {
  version: 1;
  id: string;
  accountId: string;
  mapId: string;
  entityId: string;
  sourceId: string;
  title: string;
  path: string;
  sourceType: ContextSourceKind;
  excerpt: string;
  matchReason: {
    kind: ContextSearchMatchReason;
    detail: string;
  };
  relevantProperty: {
    name: string;
    valuePreview: string;
  } | null;
  location: ContextSearchResultLocationV1;
  freshness: {
    status: ContextSearchFreshnessStatus;
    indexedAt: number;
    sourceUpdatedAt: number;
    sourceRevision: string;
  };
  sourceAction: {
    kind: ContextSearchSourceActionKind;
    sourceId: string;
    path: string;
    location: ContextSearchResultLocationV1;
  };
  score: number;
}

export type ContextSearchResultErrorCode =
  | 'invalid_input'
  | 'invalid_result'
  | 'scope_mismatch'
  | 'duplicate_id'
  | 'too_many_results';

export class ContextSearchResultError extends Error {
  constructor(
    readonly code: ContextSearchResultErrorCode,
    readonly detail?: string,
  ) {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'ContextSearchResultError';
  }
}

function dataRecord(value: unknown): Record<string, unknown> | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const record: Record<string, unknown> = Object.create(null);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) return null;
      record[key] = descriptor.value;
    }
    return record;
  } catch {
    return null;
  }
}

function onlyKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(record);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function oneOf<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
): value is Values[number] {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function id(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_ID_CHARS && SAFE_ID.test(value);
}

function safeText(value: unknown, maximum: number, allowNewlines = false): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximum &&
    !CONTROLS.test(value) &&
    (allowNewlines || !/[\r\n]/.test(value))
  );
}

function timestamp(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= MAX_TIMESTAMP
  );
}

function positiveInteger(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= maximum;
}

function portablePath(value: unknown): value is string {
  if (
    !safeText(value, MAX_PATH_CHARS) ||
    value.includes('\\') ||
    value.includes('%') ||
    value.startsWith('/') ||
    /^[A-Za-z]:/.test(value) ||
    /^[a-z][a-z0-9+.-]*:/i.test(value)
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
        !segment.endsWith('.') &&
        !segment.endsWith(' '),
    );
}

function location(value: unknown): Readonly<ContextSearchResultLocationV1> | null {
  const record = dataRecord(value);
  if (
    !record ||
    Object.keys(record).some((key) => !['lineStart', 'lineEnd', 'page', 'blockId'].includes(key)) ||
    Object.keys(record).length === 0 ||
    (record.lineStart === undefined) !== (record.lineEnd === undefined) ||
    (record.lineStart !== undefined && !positiveInteger(record.lineStart, 100_000_000)) ||
    (record.lineEnd !== undefined && !positiveInteger(record.lineEnd, 100_000_000)) ||
    (typeof record.lineStart === 'number' &&
      typeof record.lineEnd === 'number' &&
      (record.lineEnd < record.lineStart || record.lineEnd - record.lineStart > 100_000)) ||
    (record.page !== undefined && !positiveInteger(record.page, 10_000_000)) ||
    (record.blockId !== undefined && !id(record.blockId))
  ) {
    return null;
  }
  return Object.freeze({
    ...(typeof record.lineStart === 'number'
      ? { lineStart: record.lineStart, lineEnd: record.lineEnd as number }
      : {}),
    ...(typeof record.page === 'number' ? { page: record.page } : {}),
    ...(typeof record.blockId === 'string' ? { blockId: record.blockId } : {}),
  });
}

function matchReason(
  value: unknown,
): Readonly<ContextSearchResultCandidateV1['matchReason']> | null {
  const record = dataRecord(value);
  if (
    !record ||
    !onlyKeys(record, ['kind', 'detail']) ||
    !oneOf(record.kind, MATCH_REASONS) ||
    !safeText(record.detail, MAX_DETAIL_CHARS, true)
  ) {
    return null;
  }
  return Object.freeze({ kind: record.kind, detail: record.detail });
}

function relevantProperty(
  value: unknown,
): Readonly<NonNullable<ContextSearchResultCandidateV1['relevantProperty']>> | null | undefined {
  if (value === null) return null;
  const record = dataRecord(value);
  if (
    !record ||
    !onlyKeys(record, ['name', 'valuePreview']) ||
    typeof record.name !== 'string' ||
    !SAFE_PROPERTY.test(record.name) ||
    !safeText(record.valuePreview, MAX_PROPERTY_PREVIEW_CHARS, true)
  ) {
    return undefined;
  }
  return Object.freeze({ name: record.name, valuePreview: record.valuePreview });
}

interface ParsedFreshnessEvidence {
  sourceStatus: ContextSourceStatus;
  indexedAt: number;
  sourceUpdatedAt: number;
  indexedRevision: string;
  sourceRevision: string;
}

function freshnessEvidence(value: unknown): ParsedFreshnessEvidence | null {
  const record = dataRecord(value);
  if (
    !record ||
    !onlyKeys(record, [
      'sourceStatus',
      'indexedAt',
      'sourceUpdatedAt',
      'indexedRevision',
      'sourceRevision',
    ]) ||
    !oneOf(record.sourceStatus, CONTEXT_SOURCE_STATUSES) ||
    !timestamp(record.indexedAt) ||
    !timestamp(record.sourceUpdatedAt) ||
    !id(record.indexedRevision) ||
    !id(record.sourceRevision)
  ) {
    return null;
  }
  return {
    sourceStatus: record.sourceStatus,
    indexedAt: record.indexedAt,
    sourceUpdatedAt: record.sourceUpdatedAt,
    indexedRevision: record.indexedRevision,
    sourceRevision: record.sourceRevision,
  };
}

function freshnessStatus(evidence: ParsedFreshnessEvidence): ContextSearchFreshnessStatus {
  switch (evidence.sourceStatus) {
    case 'ready':
      return evidence.indexedRevision === evidence.sourceRevision &&
        evidence.indexedAt >= evidence.sourceUpdatedAt
        ? 'current'
        : 'stale';
    case 'pending':
    case 'indexing':
      return 'indexing';
    case 'stale':
      return 'stale';
    case 'offline':
    case 'permission_required':
    case 'error':
    case 'removed':
      return evidence.sourceStatus;
  }
}

function actionKind(sourceType: ContextSourceKind): ContextSearchSourceActionKind {
  if (sourceType === 'github_repository') return 'open_github_source';
  if (sourceType === 'linked_vibespace_content') return 'open_vibespace_source';
  return 'open_local_source';
}

function freezeAction(
  sourceType: ContextSourceKind,
  sourceId: string,
  path: string,
  resultLocation: Readonly<ContextSearchResultLocationV1>,
): DeepReadonly<ContextSearchResultV1['sourceAction']> {
  const actionLocation = Object.freeze({ ...resultLocation });
  return Object.freeze({
    kind: actionKind(sourceType),
    sourceId,
    path,
    location: actionLocation,
  });
}

function parseCandidate(value: unknown): DeepReadonly<ContextSearchResultV1> {
  const record = dataRecord(value);
  if (
    !record ||
    !onlyKeys(record, [
      'version',
      'id',
      'accountId',
      'mapId',
      'entityId',
      'sourceId',
      'title',
      'path',
      'sourceType',
      'excerpt',
      'matchReason',
      'relevantProperty',
      'location',
      'freshnessEvidence',
      'score',
    ]) ||
    record.version !== 1 ||
    !id(record.id) ||
    !id(record.accountId) ||
    !id(record.mapId) ||
    !id(record.entityId) ||
    !id(record.sourceId) ||
    !safeText(record.title, MAX_TITLE_CHARS) ||
    !portablePath(record.path) ||
    !oneOf(record.sourceType, CONTEXT_SOURCE_KINDS) ||
    !safeText(record.excerpt, MAX_DETAIL_CHARS * 8, true) ||
    new TextEncoder().encode(record.excerpt as string).byteLength > MAX_EXCERPT_BYTES ||
    typeof record.score !== 'number' ||
    !Number.isFinite(record.score) ||
    Math.abs(record.score) > 1_000_000
  ) {
    throw new ContextSearchResultError('invalid_result');
  }
  const parsedReason = matchReason(record.matchReason);
  const parsedProperty = relevantProperty(record.relevantProperty);
  const parsedLocation = location(record.location);
  const evidence = freshnessEvidence(record.freshnessEvidence);
  if (!parsedReason || parsedProperty === undefined || !parsedLocation || !evidence) {
    throw new ContextSearchResultError('invalid_result');
  }
  const freshness = Object.freeze({
    status: freshnessStatus(evidence),
    indexedAt: evidence.indexedAt,
    sourceUpdatedAt: evidence.sourceUpdatedAt,
    sourceRevision: evidence.sourceRevision,
  });
  const sourceAction = freezeAction(
    record.sourceType,
    record.sourceId,
    record.path,
    parsedLocation,
  );
  return Object.freeze({
    version: 1,
    id: record.id,
    accountId: record.accountId,
    mapId: record.mapId,
    entityId: record.entityId,
    sourceId: record.sourceId,
    title: record.title,
    path: record.path,
    sourceType: record.sourceType,
    excerpt: record.excerpt,
    matchReason: parsedReason,
    relevantProperty: parsedProperty,
    location: parsedLocation,
    freshness,
    sourceAction,
    score: record.score,
  });
}

function sameLocation(
  left: Readonly<ContextSearchResultLocationV1>,
  right: Readonly<ContextSearchResultLocationV1>,
): boolean {
  return (
    left.lineStart === right.lineStart &&
    left.lineEnd === right.lineEnd &&
    left.page === right.page &&
    left.blockId === right.blockId
  );
}

function parseBuiltResult(value: unknown): DeepReadonly<ContextSearchResultV1> {
  const record = dataRecord(value);
  if (
    !record ||
    !onlyKeys(record, [
      'version',
      'id',
      'accountId',
      'mapId',
      'entityId',
      'sourceId',
      'title',
      'path',
      'sourceType',
      'excerpt',
      'matchReason',
      'relevantProperty',
      'location',
      'freshness',
      'sourceAction',
      'score',
    ]) ||
    record.version !== 1 ||
    !id(record.id) ||
    !id(record.accountId) ||
    !id(record.mapId) ||
    !id(record.entityId) ||
    !id(record.sourceId) ||
    !safeText(record.title, MAX_TITLE_CHARS) ||
    !portablePath(record.path) ||
    !oneOf(record.sourceType, CONTEXT_SOURCE_KINDS) ||
    !safeText(record.excerpt, MAX_DETAIL_CHARS * 8, true) ||
    new TextEncoder().encode(record.excerpt as string).byteLength > MAX_EXCERPT_BYTES ||
    typeof record.score !== 'number' ||
    !Number.isFinite(record.score) ||
    Math.abs(record.score) > 1_000_000
  ) {
    throw new ContextSearchResultError('invalid_result');
  }
  const parsedReason = matchReason(record.matchReason);
  const parsedProperty = relevantProperty(record.relevantProperty);
  const parsedLocation = location(record.location);
  const freshnessRecord = dataRecord(record.freshness);
  const actionRecord = dataRecord(record.sourceAction);
  if (
    !parsedReason ||
    parsedProperty === undefined ||
    !parsedLocation ||
    !freshnessRecord ||
    !onlyKeys(freshnessRecord, ['status', 'indexedAt', 'sourceUpdatedAt', 'sourceRevision']) ||
    !oneOf(freshnessRecord.status, FRESHNESS_STATUSES) ||
    !timestamp(freshnessRecord.indexedAt) ||
    !timestamp(freshnessRecord.sourceUpdatedAt) ||
    !id(freshnessRecord.sourceRevision) ||
    !actionRecord ||
    !onlyKeys(actionRecord, ['kind', 'sourceId', 'path', 'location']) ||
    actionRecord.kind !== actionKind(record.sourceType) ||
    actionRecord.sourceId !== record.sourceId ||
    actionRecord.path !== record.path
  ) {
    throw new ContextSearchResultError('invalid_result');
  }
  const actionLocation = location(actionRecord.location);
  if (!actionLocation || !sameLocation(actionLocation, parsedLocation)) {
    throw new ContextSearchResultError('invalid_result');
  }
  const freshness = Object.freeze({
    status: freshnessRecord.status,
    indexedAt: freshnessRecord.indexedAt,
    sourceUpdatedAt: freshnessRecord.sourceUpdatedAt,
    sourceRevision: freshnessRecord.sourceRevision,
  });
  const sourceAction = freezeAction(
    record.sourceType,
    record.sourceId,
    record.path,
    parsedLocation,
  );
  return Object.freeze({
    version: 1,
    id: record.id,
    accountId: record.accountId,
    mapId: record.mapId,
    entityId: record.entityId,
    sourceId: record.sourceId,
    title: record.title,
    path: record.path,
    sourceType: record.sourceType,
    excerpt: record.excerpt,
    matchReason: parsedReason,
    relevantProperty: parsedProperty,
    location: parsedLocation,
    freshness,
    sourceAction,
    score: record.score,
  });
}

export function buildContextSearchResults(input: {
  accountId: string;
  mapId: string;
  candidates: readonly ContextSearchResultCandidateV1[];
  limit: number;
}): readonly DeepReadonly<ContextSearchResultV1>[] {
  const root = dataRecord(input);
  if (
    !root ||
    !onlyKeys(root, ['accountId', 'mapId', 'candidates', 'limit']) ||
    !id(root.accountId) ||
    !id(root.mapId) ||
    !Array.isArray(root.candidates) ||
    !positiveInteger(root.limit, MAX_RESULTS)
  ) {
    throw new ContextSearchResultError('invalid_input');
  }
  if (root.candidates.length > MAX_RESULTS) {
    throw new ContextSearchResultError('too_many_results');
  }
  const results = root.candidates.map(parseCandidate);
  if (
    results.some((result) => result.accountId !== root.accountId || result.mapId !== root.mapId)
  ) {
    throw new ContextSearchResultError('scope_mismatch');
  }
  if (new Set(results.map(({ id: resultId }) => resultId)).size !== results.length) {
    throw new ContextSearchResultError('duplicate_id');
  }
  return Object.freeze(results.slice(0, root.limit as number));
}

export function selectContextSearchResult(input: {
  accountId: string;
  mapId: string;
  result: ContextSearchResultV1;
}): DeepReadonly<{
  version: 1;
  accountId: string;
  mapId: string;
  nodeId: string;
  sourceId: string;
  highlight: 'context_map_node';
  focus: {
    path: string;
    lineStart?: number;
    lineEnd?: number;
    page?: number;
    blockId?: string;
  };
  sourceAction: ContextSearchResultV1['sourceAction'];
}> {
  const root = dataRecord(input);
  if (
    !root ||
    !onlyKeys(root, ['accountId', 'mapId', 'result']) ||
    !id(root.accountId) ||
    !id(root.mapId)
  ) {
    throw new ContextSearchResultError('invalid_input');
  }
  const result = parseBuiltResult(root.result);
  if (result.accountId !== root.accountId || result.mapId !== root.mapId) {
    throw new ContextSearchResultError('scope_mismatch');
  }
  const focus = Object.freeze({ path: result.path, ...result.location });
  return Object.freeze({
    version: 1,
    accountId: result.accountId,
    mapId: result.mapId,
    nodeId: result.entityId,
    sourceId: result.sourceId,
    highlight: 'context_map_node',
    focus,
    sourceAction: result.sourceAction,
  });
}
