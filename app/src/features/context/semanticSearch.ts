import type { DeepReadonly } from './contracts';

const MAX_VECTOR_DIMENSIONS = 4_096;
const MAX_VECTOR_VALUE = 1_000_000;
const MAX_ITEMS = 10_000;
const MAX_RESULTS = 100;
const MAX_TEXT_BYTES = 16 * 1024;
const MAX_TIMESTAMP = 8_640_000_000_000_000;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,239}$/;
const HASH = /^[a-f0-9]{64}$/;

export type ContextEmbeddingProviderKind = 'local' | 'cloud';

export interface ContextEmbeddingPermissionV1 {
  version: 1;
  id: string;
  accountId: string;
  mapId: string;
  providerId: string;
  purpose: 'context_embedding';
  status: 'granted' | 'revoked';
  grantedAt: number;
  expiresAt: number;
}

export interface ContextEmbeddingProviderAvailabilityV1 {
  kind: ContextEmbeddingProviderKind;
  providerId: string;
  modelId: string;
  embeddingVersion: string;
  available: boolean;
  permission?: ContextEmbeddingPermissionV1;
}

export interface ContextEmbeddingProviderSelectionV1 {
  version: 1;
  kind: ContextEmbeddingProviderKind;
  providerId: string;
  modelId: string;
  embeddingVersion: string;
  permissionId?: string;
}

export interface ContextChunkProvenanceV1 {
  path: string;
  lineStart?: number;
  lineEnd?: number;
  page?: number;
  blockId?: string;
}

export interface ContextEmbeddingChunkV1 {
  version: 1;
  id: string;
  accountId: string;
  mapId: string;
  documentId: string;
  sourceId: string;
  chunkOrdinal: number;
  contentHash: string;
  textHash: string;
  text: string;
  provenance: ContextChunkProvenanceV1;
}

export interface ContextEmbeddingRecordV1 {
  version: 1;
  id: string;
  accountId: string;
  mapId: string;
  documentId: string;
  sourceId: string;
  chunkOrdinal: number;
  contentHash: string;
  textHash: string;
  providerKind: ContextEmbeddingProviderKind;
  providerId: string;
  modelId: string;
  embeddingVersion: string;
  dimensions: number;
  vector: number[];
  provenance: ContextChunkProvenanceV1;
  createdAt: number;
  updatedAt: number;
}

export type ContextEmbeddingParseResult =
  | { ok: true; value: DeepReadonly<ContextEmbeddingRecordV1> }
  | { ok: false; reason: string };

export type ContextSemanticSearchErrorCode =
  | 'invalid_input'
  | 'cloud_permission_required'
  | 'invalid_vector'
  | 'scope_mismatch'
  | 'duplicate_id'
  | 'too_many_items';

export class ContextSemanticSearchError extends Error {
  constructor(
    readonly code: ContextSemanticSearchErrorCode,
    readonly detail?: string,
  ) {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'ContextSemanticSearchError';
  }
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  try {
    const keys = Object.keys(value);
    return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
  } catch {
    return false;
  }
}

export function isContextEmbeddingId(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value) && !/[\u0000-\u001f\u007f]/.test(value);
}

export function compareContextEmbeddingIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function id(value: unknown): value is string {
  return isContextEmbeddingId(value);
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
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 400 ||
    value.includes('\\') ||
    value.includes('%') ||
    value.startsWith('/') ||
    /^[A-Za-z]:/.test(value) ||
    /^[a-z][a-z0-9+.-]*:/i.test(value) ||
    /[\u0000-\u001f\u007f]/.test(value)
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

function provenance(value: unknown): DeepReadonly<ContextChunkProvenanceV1> | null {
  const record = objectRecord(value);
  if (
    !record ||
    Object.keys(record).some(
      (key) => !['path', 'lineStart', 'lineEnd', 'page', 'blockId'].includes(key),
    ) ||
    !portablePath(record.path)
  ) {
    return null;
  }
  if (
    (record.lineStart !== undefined && !positiveInteger(record.lineStart)) ||
    (record.lineEnd !== undefined && !positiveInteger(record.lineEnd)) ||
    (record.lineStart === undefined) !== (record.lineEnd === undefined) ||
    (typeof record.lineStart === 'number' &&
      typeof record.lineEnd === 'number' &&
      (record.lineEnd < record.lineStart || record.lineEnd - record.lineStart > 10_000)) ||
    (record.page !== undefined && !positiveInteger(record.page, 1_000_000)) ||
    (record.blockId !== undefined && (!id(record.blockId) || record.blockId.length > 120))
  ) {
    return null;
  }
  return Object.freeze({
    path: record.path,
    ...(typeof record.lineStart === 'number'
      ? { lineStart: record.lineStart, lineEnd: record.lineEnd as number }
      : {}),
    ...(typeof record.page === 'number' ? { page: record.page } : {}),
    ...(typeof record.blockId === 'string' ? { blockId: record.blockId } : {}),
  });
}

function vector(value: unknown, dimensions: unknown): readonly number[] | null {
  if (
    !Array.isArray(value) ||
    !positiveInteger(dimensions, MAX_VECTOR_DIMENSIONS) ||
    value.length !== dimensions
  ) {
    return null;
  }
  let norm = 0;
  const copy: number[] = [];
  for (const component of value) {
    if (
      typeof component !== 'number' ||
      !Number.isFinite(component) ||
      Math.abs(component) > MAX_VECTOR_VALUE
    ) {
      return null;
    }
    norm += component * component;
    if (!Number.isFinite(norm)) return null;
    copy.push(component);
  }
  return norm > 0 ? Object.freeze(copy) : null;
}

export function parseContextEmbeddingRecordV1(value: unknown): ContextEmbeddingParseResult {
  try {
    const record = objectRecord(value);
    const keys = [
      'version',
      'id',
      'accountId',
      'mapId',
      'documentId',
      'sourceId',
      'chunkOrdinal',
      'contentHash',
      'textHash',
      'providerKind',
      'providerId',
      'modelId',
      'embeddingVersion',
      'dimensions',
      'vector',
      'provenance',
      'createdAt',
      'updatedAt',
    ];
    if (!record || !onlyKeys(record, keys)) return { ok: false, reason: 'record_shape_invalid' };
    const parsedVector = vector(record.vector, record.dimensions);
    const parsedProvenance = provenance(record.provenance);
    if (
      record.version !== 1 ||
      !id(record.id) ||
      !id(record.accountId) ||
      !id(record.mapId) ||
      !id(record.documentId) ||
      !id(record.sourceId) ||
      !Number.isSafeInteger(record.chunkOrdinal) ||
      (record.chunkOrdinal as number) < 0 ||
      typeof record.contentHash !== 'string' ||
      !HASH.test(record.contentHash) ||
      typeof record.textHash !== 'string' ||
      !HASH.test(record.textHash) ||
      (record.providerKind !== 'local' && record.providerKind !== 'cloud') ||
      !id(record.providerId) ||
      !id(record.modelId) ||
      !id(record.embeddingVersion) ||
      !parsedVector ||
      !parsedProvenance ||
      !timestamp(record.createdAt) ||
      !timestamp(record.updatedAt) ||
      record.updatedAt < record.createdAt
    ) {
      return { ok: false, reason: 'record_value_invalid' };
    }
    const parsed: ContextEmbeddingRecordV1 = {
      version: 1,
      id: record.id,
      accountId: record.accountId,
      mapId: record.mapId,
      documentId: record.documentId,
      sourceId: record.sourceId,
      chunkOrdinal: record.chunkOrdinal as number,
      contentHash: record.contentHash,
      textHash: record.textHash,
      providerKind: record.providerKind,
      providerId: record.providerId,
      modelId: record.modelId,
      embeddingVersion: record.embeddingVersion,
      dimensions: record.dimensions as number,
      vector: [...parsedVector],
      provenance: { ...parsedProvenance },
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
    Object.freeze(parsed.vector);
    Object.freeze(parsed.provenance);
    return { ok: true, value: Object.freeze(parsed) as DeepReadonly<ContextEmbeddingRecordV1> };
  } catch {
    return { ok: false, reason: 'record_unreadable' };
  }
}

function provider(
  value: unknown,
  kind: ContextEmbeddingProviderKind,
): ContextEmbeddingProviderAvailabilityV1 | null {
  const record = objectRecord(value);
  if (
    !record ||
    Object.keys(record).some(
      (key) =>
        !['kind', 'providerId', 'modelId', 'embeddingVersion', 'available', 'permission'].includes(
          key,
        ),
    ) ||
    record.kind !== kind ||
    !id(record.providerId) ||
    !id(record.modelId) ||
    !id(record.embeddingVersion) ||
    typeof record.available !== 'boolean'
  ) {
    return null;
  }
  return {
    kind,
    providerId: record.providerId,
    modelId: record.modelId,
    embeddingVersion: record.embeddingVersion,
    available: record.available,
    ...(record.permission !== undefined
      ? { permission: record.permission as ContextEmbeddingPermissionV1 }
      : {}),
  };
}

function permission(
  value: unknown,
  accountId: string,
  mapId: string,
  providerId: string,
  now: number,
): ContextEmbeddingPermissionV1 | null {
  const record = objectRecord(value);
  if (
    !record ||
    !onlyKeys(record, [
      'version',
      'id',
      'accountId',
      'mapId',
      'providerId',
      'purpose',
      'status',
      'grantedAt',
      'expiresAt',
    ]) ||
    record.version !== 1 ||
    !id(record.id) ||
    record.accountId !== accountId ||
    record.mapId !== mapId ||
    record.providerId !== providerId ||
    record.purpose !== 'context_embedding' ||
    record.status !== 'granted' ||
    !timestamp(record.grantedAt) ||
    !timestamp(record.expiresAt) ||
    record.grantedAt > now ||
    record.expiresAt <= now
  ) {
    return null;
  }
  return {
    version: 1,
    id: record.id,
    accountId,
    mapId,
    providerId,
    purpose: 'context_embedding',
    status: 'granted',
    grantedAt: record.grantedAt,
    expiresAt: record.expiresAt,
  };
}

export function resolveContextEmbeddingProvider(input: {
  accountId: string;
  mapId: string;
  now: number;
  local?: ContextEmbeddingProviderAvailabilityV1;
  selectedCloud?: ContextEmbeddingProviderAvailabilityV1;
}): DeepReadonly<ContextEmbeddingProviderSelectionV1> | null {
  const root = objectRecord(input);
  if (
    !root ||
    Object.keys(root).some(
      (key) => !['accountId', 'mapId', 'now', 'local', 'selectedCloud'].includes(key),
    ) ||
    !id(root.accountId) ||
    !id(root.mapId) ||
    !timestamp(root.now)
  ) {
    throw new ContextSemanticSearchError('invalid_input', 'provider_selection');
  }
  if (root.selectedCloud !== undefined) {
    const selected = provider(root.selectedCloud, 'cloud');
    if (!selected?.available) {
      throw new ContextSemanticSearchError('invalid_input', 'selected_cloud_unavailable');
    }
    const receipt = permission(
      selected.permission,
      root.accountId,
      root.mapId,
      selected.providerId,
      root.now,
    );
    if (!receipt) throw new ContextSemanticSearchError('cloud_permission_required');
    return Object.freeze({
      version: 1,
      kind: 'cloud',
      providerId: selected.providerId,
      modelId: selected.modelId,
      embeddingVersion: selected.embeddingVersion,
      permissionId: receipt.id,
    });
  }
  if (root.local === undefined) return null;
  const local = provider(root.local, 'local');
  if (!local) throw new ContextSemanticSearchError('invalid_input', 'local_provider');
  return local.available
    ? Object.freeze({
        version: 1,
        kind: 'local',
        providerId: local.providerId,
        modelId: local.modelId,
        embeddingVersion: local.embeddingVersion,
      })
    : null;
}

function chunk(value: unknown): DeepReadonly<ContextEmbeddingChunkV1> {
  const record = objectRecord(value);
  const parsedProvenance = record ? provenance(record.provenance) : null;
  if (
    !record ||
    !onlyKeys(record, [
      'version',
      'id',
      'accountId',
      'mapId',
      'documentId',
      'sourceId',
      'chunkOrdinal',
      'contentHash',
      'textHash',
      'text',
      'provenance',
    ]) ||
    record.version !== 1 ||
    !id(record.id) ||
    !id(record.accountId) ||
    !id(record.mapId) ||
    !id(record.documentId) ||
    !id(record.sourceId) ||
    !Number.isSafeInteger(record.chunkOrdinal) ||
    (record.chunkOrdinal as number) < 0 ||
    typeof record.contentHash !== 'string' ||
    !HASH.test(record.contentHash) ||
    typeof record.textHash !== 'string' ||
    !HASH.test(record.textHash) ||
    typeof record.text !== 'string' ||
    record.text.length === 0 ||
    new TextEncoder().encode(record.text).byteLength > MAX_TEXT_BYTES ||
    /[\u0000\u007f]/.test(record.text) ||
    !parsedProvenance
  ) {
    throw new ContextSemanticSearchError('invalid_input', 'chunk');
  }
  return Object.freeze({
    version: 1,
    id: record.id,
    accountId: record.accountId,
    mapId: record.mapId,
    documentId: record.documentId,
    sourceId: record.sourceId,
    chunkOrdinal: record.chunkOrdinal as number,
    contentHash: record.contentHash,
    textHash: record.textHash,
    text: record.text,
    provenance: parsedProvenance,
  });
}

function selectedProvider(
  value: unknown,
  accountId: string,
  mapId: string,
  now: number,
  cloudPermission: unknown,
): ContextEmbeddingProviderSelectionV1 {
  const record = objectRecord(value);
  if (
    !record ||
    Object.keys(record).some(
      (key) =>
        !['version', 'kind', 'providerId', 'modelId', 'embeddingVersion', 'permissionId'].includes(
          key,
        ),
    ) ||
    record.version !== 1 ||
    (record.kind !== 'local' && record.kind !== 'cloud') ||
    !id(record.providerId) ||
    !id(record.modelId) ||
    !id(record.embeddingVersion) ||
    (record.kind === 'cloud' && !id(record.permissionId)) ||
    (record.kind === 'local' && record.permissionId !== undefined)
  ) {
    throw new ContextSemanticSearchError('invalid_input', 'provider');
  }
  if (record.kind === 'cloud') {
    const receipt = permission(cloudPermission, accountId, mapId, record.providerId, now);
    if (!receipt || receipt.id !== record.permissionId) {
      throw new ContextSemanticSearchError('cloud_permission_required');
    }
  } else if (cloudPermission !== undefined) {
    throw new ContextSemanticSearchError('invalid_input', 'unexpected_cloud_permission');
  }
  return {
    version: 1,
    kind: record.kind,
    providerId: record.providerId,
    modelId: record.modelId,
    embeddingVersion: record.embeddingVersion,
    ...(typeof record.permissionId === 'string' ? { permissionId: record.permissionId } : {}),
  };
}

export function planContextEmbeddingUpdates(input: {
  accountId: string;
  mapId: string;
  now: number;
  provider: ContextEmbeddingProviderSelectionV1;
  cloudPermission?: ContextEmbeddingPermissionV1;
  chunks: readonly ContextEmbeddingChunkV1[];
  existing: readonly ContextEmbeddingRecordV1[];
}): DeepReadonly<{
  upsertChunks: DeepReadonly<ContextEmbeddingChunkV1>[];
  deleteIds: string[];
  unchangedIds: string[];
}> {
  const root = objectRecord(input);
  if (
    !root ||
    Object.keys(root).some(
      (key) =>
        ![
          'accountId',
          'mapId',
          'now',
          'provider',
          'cloudPermission',
          'chunks',
          'existing',
        ].includes(key),
    ) ||
    !id(root.accountId) ||
    !id(root.mapId) ||
    !timestamp(root.now) ||
    !Array.isArray(root.chunks) ||
    !Array.isArray(root.existing)
  ) {
    throw new ContextSemanticSearchError('invalid_input', 'update_plan');
  }
  if (root.chunks.length > MAX_ITEMS || root.existing.length > MAX_ITEMS) {
    throw new ContextSemanticSearchError('too_many_items');
  }
  const selection = selectedProvider(
    root.provider,
    root.accountId,
    root.mapId,
    root.now,
    root.cloudPermission,
  );
  const chunks = root.chunks.map(chunk);
  const existing = root.existing.map((entry) => {
    const parsed = parseContextEmbeddingRecordV1(entry);
    if (!parsed.ok) throw new ContextSemanticSearchError('invalid_input', parsed.reason);
    return parsed.value;
  });
  if (
    chunks.some(({ accountId, mapId }) => accountId !== root.accountId || mapId !== root.mapId) ||
    existing.some(({ accountId, mapId }) => accountId !== root.accountId || mapId !== root.mapId)
  ) {
    throw new ContextSemanticSearchError('scope_mismatch');
  }
  if (
    new Set(chunks.map(({ id: value }) => value)).size !== chunks.length ||
    new Set(existing.map(({ id: value }) => value)).size !== existing.length
  ) {
    throw new ContextSemanticSearchError('duplicate_id');
  }
  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  const currentIds = new Set(chunks.map(({ id: value }) => value));
  const deleteIds = existing
    .filter(
      (entry) =>
        !currentIds.has(entry.id) ||
        entry.providerKind !== selection.kind ||
        entry.providerId !== selection.providerId ||
        entry.modelId !== selection.modelId ||
        entry.embeddingVersion !== selection.embeddingVersion,
    )
    .map(({ id: value }) => value);
  const upsertChunks: DeepReadonly<ContextEmbeddingChunkV1>[] = [];
  const unchangedIds: string[] = [];
  for (const entry of chunks) {
    const prior = byId.get(entry.id);
    if (
      prior &&
      prior.providerKind === selection.kind &&
      prior.providerId === selection.providerId &&
      prior.modelId === selection.modelId &&
      prior.embeddingVersion === selection.embeddingVersion &&
      prior.documentId === entry.documentId &&
      prior.sourceId === entry.sourceId &&
      prior.chunkOrdinal === entry.chunkOrdinal &&
      prior.contentHash === entry.contentHash &&
      prior.textHash === entry.textHash &&
      JSON.stringify(prior.provenance) === JSON.stringify(entry.provenance)
    ) {
      unchangedIds.push(entry.id);
    } else {
      upsertChunks.push(entry);
    }
  }
  const compare = compareContextEmbeddingIds;
  upsertChunks.sort((left, right) => compare(left.id, right.id));
  deleteIds.sort(compare);
  unchangedIds.sort(compare);
  Object.freeze(upsertChunks);
  Object.freeze(deleteIds);
  Object.freeze(unchangedIds);
  return Object.freeze({ upsertChunks, deleteIds, unchangedIds });
}

function queryVector(value: unknown): readonly number[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_VECTOR_DIMENSIONS) {
    throw new ContextSemanticSearchError('invalid_vector');
  }
  let norm = 0;
  const copy: number[] = [];
  for (const component of value) {
    if (
      typeof component !== 'number' ||
      !Number.isFinite(component) ||
      Math.abs(component) > MAX_VECTOR_VALUE
    ) {
      throw new ContextSemanticSearchError('invalid_vector');
    }
    norm += component * component;
    copy.push(component);
  }
  if (!Number.isFinite(norm) || norm <= 0) throw new ContextSemanticSearchError('invalid_vector');
  return copy;
}

export function scoreContextEmbeddings(input: {
  accountId: string;
  mapId: string;
  providerKind: ContextEmbeddingProviderKind;
  providerId: string;
  modelId: string;
  embeddingVersion: string;
  queryVector: readonly number[];
  records: readonly ContextEmbeddingRecordV1[];
  limit: number;
}): readonly Readonly<{ id: string; score: number }>[] {
  const root = objectRecord(input);
  if (
    !root ||
    !onlyKeys(root, [
      'accountId',
      'mapId',
      'providerKind',
      'providerId',
      'modelId',
      'embeddingVersion',
      'queryVector',
      'records',
      'limit',
    ]) ||
    !id(root.accountId) ||
    !id(root.mapId) ||
    (root.providerKind !== 'local' && root.providerKind !== 'cloud') ||
    !id(root.providerId) ||
    !id(root.modelId) ||
    !id(root.embeddingVersion) ||
    !Array.isArray(root.records) ||
    root.records.length > MAX_ITEMS ||
    !positiveInteger(root.limit, MAX_RESULTS)
  ) {
    throw new ContextSemanticSearchError('invalid_input', 'score');
  }
  const query = queryVector(root.queryVector);
  const queryNorm = Math.sqrt(query.reduce((sum, component) => sum + component * component, 0));
  const scores: Array<{ id: string; score: number }> = [];
  for (const raw of root.records) {
    const parsed = parseContextEmbeddingRecordV1(raw);
    if (!parsed.ok) throw new ContextSemanticSearchError('invalid_input', parsed.reason);
    const entry = parsed.value;
    if (
      entry.accountId !== root.accountId ||
      entry.mapId !== root.mapId ||
      entry.providerKind !== root.providerKind ||
      entry.providerId !== root.providerId ||
      entry.modelId !== root.modelId ||
      entry.embeddingVersion !== root.embeddingVersion ||
      entry.dimensions !== query.length
    ) {
      continue;
    }
    let dot = 0;
    let norm = 0;
    for (let index = 0; index < query.length; index += 1) {
      dot += query[index]! * entry.vector[index]!;
      norm += entry.vector[index]! * entry.vector[index]!;
    }
    const score = dot / (queryNorm * Math.sqrt(norm));
    if (Number.isFinite(score)) scores.push({ id: entry.id, score });
  }
  scores.sort(
    (left, right) => right.score - left.score || compareContextEmbeddingIds(left.id, right.id),
  );
  return Object.freeze(scores.slice(0, root.limit as number).map((entry) => Object.freeze(entry)));
}

interface RankedInput {
  id: string;
  score: number;
}

function ranks(value: unknown, label: string): RankedInput[] {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) {
    throw new ContextSemanticSearchError('invalid_input', label);
  }
  const seen = new Set<string>();
  const output = value.map((item) => {
    const record = objectRecord(item);
    if (
      !record ||
      !onlyKeys(record, ['id', 'score']) ||
      !id(record.id) ||
      typeof record.score !== 'number' ||
      !Number.isFinite(record.score) ||
      seen.has(record.id)
    ) {
      throw new ContextSemanticSearchError(
        seen.has(String(record?.id)) ? 'duplicate_id' : 'invalid_input',
        label,
      );
    }
    seen.add(record.id);
    return { id: record.id, score: record.score };
  });
  return output.sort(
    (left, right) => right.score - left.score || compareContextEmbeddingIds(left.id, right.id),
  );
}

export function rankContextHybrid(input: {
  lexical: readonly RankedInput[];
  semantic: readonly RankedInput[];
  limit?: number;
}): readonly Readonly<{
  id: string;
  score: number;
  lexicalRank?: number;
  semanticRank?: number;
}>[] {
  const root = objectRecord(input);
  if (
    !root ||
    Object.keys(root).some((key) => !['lexical', 'semantic', 'limit'].includes(key)) ||
    (root.limit !== undefined && !positiveInteger(root.limit, MAX_RESULTS))
  ) {
    throw new ContextSemanticSearchError('invalid_input', 'hybrid');
  }
  const lexical = ranks(root.lexical, 'lexical');
  const semantic = ranks(root.semantic, 'semantic');
  if (lexical.length === 0) return Object.freeze([]);
  const lexicalRanks = new Map(lexical.map((entry, index) => [entry.id, index + 1]));
  const semanticRanks = new Map(semantic.map((entry, index) => [entry.id, index + 1]));
  const ranked = [...new Set([...lexicalRanks.keys(), ...semanticRanks.keys()])].map((itemId) => {
    const lexicalRank = lexicalRanks.get(itemId);
    const semanticRank = semanticRanks.get(itemId);
    return {
      id: itemId,
      score:
        (lexicalRank ? 0.5 / (60 + lexicalRank) : 0) +
        (semanticRank ? 0.5 / (60 + semanticRank) : 0),
      ...(lexicalRank ? { lexicalRank } : {}),
      ...(semanticRank ? { semanticRank } : {}),
    };
  });
  const compare = (left: (typeof ranked)[number], right: (typeof ranked)[number]): number =>
    right.score - left.score ||
    (left.lexicalRank ?? Number.MAX_SAFE_INTEGER) -
      (right.lexicalRank ?? Number.MAX_SAFE_INTEGER) ||
    compareContextEmbeddingIds(left.id, right.id);
  ranked.sort(compare);
  const selected = ranked.slice(0, (root.limit as number | undefined) ?? 20);
  const topLexicalId = lexical[0]!.id;
  if (!selected.some(({ id: value }) => value === topLexicalId)) {
    selected[selected.length - 1] = ranked.find(({ id: value }) => value === topLexicalId)!;
    selected.sort(compare);
  }
  return Object.freeze(selected.map((entry) => Object.freeze(entry)));
}
