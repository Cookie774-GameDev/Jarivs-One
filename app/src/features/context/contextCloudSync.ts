import { getActiveAccountIdentity } from '@/lib/accountIdentity';
import { db, openDb, type SettingsRow } from '@/lib/db';
import { runSignalBoundWrite } from '@/lib/db/signalBoundTransaction';
import { getPlan } from '@/lib/entitlements';
import { hasDetectedSecret } from '@/lib/security/secretDetector';
import { enqueueMutation, SyncMutationCommitRejectedError, type CloudSyncRecord } from '@/lib/sync';
import { useAuthStore } from '@/stores/auth';

export const CONTEXT_CLOUD_SYNC_TABLE = 'context_documents';
export const CONTEXT_CLOUD_SYNC_KINDS = Object.freeze([
  'note',
  'properties',
  'link',
  'view',
  'template',
  'workspace',
  'map_metadata',
  'derived_summary',
] as const);

export type ContextCloudSyncKind = (typeof CONTEXT_CLOUD_SYNC_KINDS)[number];
export type ContextCloudJson =
  | null
  | boolean
  | number
  | string
  | ContextCloudJson[]
  | { [key: string]: ContextCloudJson };

export interface ContextCloudDocumentV1 {
  version: 1;
  accountId: string;
  projectId: string | null;
  kind: ContextCloudSyncKind;
  id: string;
  revisionId: string;
  baseRevisionId: string | null;
  provenance: {
    origin: 'user_authored' | 'app_metadata' | 'derived';
    producer:
      | 'context_note_editor'
      | 'context_properties_editor'
      | 'context_link_editor'
      | 'context_view_editor'
      | 'context_template_editor'
      | 'context_workspace_editor'
      | 'context_map_persistence'
      | 'context_summary_generator';
  };
  updatedAt: number;
  deletedAt?: number;
  fields: Record<string, ContextCloudJson>;
}

export interface ContextCloudSyncPreferenceV1 {
  version: 1;
  accountId: string;
  enabled: boolean;
  derivedSummaries: boolean;
  updatedAt: number;
}

export interface StagedContextCloudRecordV1 {
  version: 1;
  accountId: string;
  rowId: string;
  status: 'pending_review';
  resolutionRequired: true;
  document: ContextCloudDocumentV1;
  receivedAt: number;
}

export type ContextCloudResolutionChoice = 'keep_local' | 'use_remote' | 'keep_both';

export interface ContextCloudResolutionAuthority {
  kind: 'direct_user_action';
  accountId: string;
  requestId: string;
  signal: AbortSignal;
}

export interface ContextCloudResolutionAdapter {
  lookupReceipt(input: {
    accountId: string;
    requestId: string;
    signal: AbortSignal;
  }): Promise<string | null>;
  apply(input: {
    accountId: string;
    requestId: string;
    documents: readonly ContextCloudDocumentV1[];
    signal: AbortSignal;
  }): Promise<{ receiptId: string }>;
}

export interface ContextCloudResolutionResult {
  status: 'completed';
  accountId: string;
  rowId: string;
  requestId: string;
  choice: ContextCloudResolutionChoice;
  appliedDocumentIds: readonly string[];
}

export type ContextCloudQueueResult =
  | Readonly<{ queued: true; queueId: string }>
  | Readonly<{
      queued: false;
      reason:
        | 'aborted'
        | 'cloud_authority_required'
        | 'disabled'
        | 'derived_summaries_disabled'
        | 'document_invalid'
        | 'protected_content';
    }>;

type MergeResolution =
  | Readonly<{
      visible: true;
      status: 'auto_merged';
      reason: 'same_revision' | 'field_merge' | 'tombstone_applied';
    }>
  | Readonly<{
      visible: true;
      status: 'requires_user';
      reason: 'overlapping_change' | 'delete_update_conflict' | 'revision_chain_invalid';
      options: readonly ['keep_local', 'use_remote', 'keep_both'];
    }>;

export type ContextCloudMergeResult =
  | Readonly<{
      kind: 'merged';
      document: ContextCloudDocumentV1;
      resolution: MergeResolution;
      capabilities: { realTimeCollaboration: false };
    }>
  | Readonly<{
      kind: 'conflict';
      preserved: ContextCloudDocumentV1;
      conflictCopy: ContextCloudDocumentV1;
      resolution: MergeResolution;
      capabilities: { realTimeCollaboration: false };
    }>;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u;
const SAFE_FIELD = /^[A-Za-z][A-Za-z0-9_.-]{0,99}$/u;
const MAX_FIELDS = 128;
const MAX_NODES = 20_000;
const MAX_DEPTH = 10;
const MAX_STRING_CHARS = 512 * 1024;
const MAX_TOTAL_STRING_CHARS = 1024 * 1024;
const PREFERENCE_PREFIX = 'context-cloud-sync:v1:preference:';
const STAGED_PREFIX = 'context-cloud-sync:v1:inbox:';
const RESOLUTION_PREFIX = 'context-cloud-sync:v1:resolution:';
const RESOLUTION_CLAIM_PREFIX = 'context-cloud-sync:v1:resolution-claim:';
const PROTECTED_FIELD =
  /(?:^|_)(?:api_key|auth|authorization|token|access_token|refresh_token|provider_token|bearer_token|session|session_token|cookie|jwt|secret|password|credential|embedding|vector|terminal_transcript|raw_(?:repository_|repo_)?code|source_code|private_repo|full_text_index)(?:$|_)/u;
const RAW_CODE_CONTENT =
  /(?:\b(?:export|import)\s+(?:const|let|var|class|function|\{|\*)|\bfunction\s+[A-Za-z_$][\w$]*\s*\(|\b(?:class|interface)\s+[A-Za-z_$][\w$]*\s*\{|\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=|\b(?:def|fn|pub\s+fn)\s+[A-Za-z_][A-Za-z0-9_]*\s*[\(:]|#include\s*[<"]|<\/?[A-Za-z][^>]{0,120}>)/u;
const CAPABILITIES = Object.freeze({ realTimeCollaboration: false as const });
const CONFLICT_OPTIONS = Object.freeze(['keep_local', 'use_remote', 'keep_both'] as const);

class InvalidContextCloudDocument extends Error {}
class ProtectedContextCloudContent extends Error {}

function securityKey(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/gu, '$1_$2')
    .replace(/[^A-Za-z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
    .toLowerCase();
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactDataRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (!plainRecord(value)) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const names = Object.keys(descriptors);
  if (
    Reflect.ownKeys(value).length !== names.length ||
    names.some(
      (name) =>
        !keys.includes(name) || !descriptors[name]?.enumerable || !('value' in descriptors[name]!),
    )
  ) {
    return false;
  }
  return true;
}

function stableId(value: unknown): string {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    throw new InvalidContextCloudDocument();
  }
  return value;
}

function protectedStableId(value: unknown): string {
  const id = stableId(value);
  if (hasDetectedSecret(id)) throw new ProtectedContextCloudContent();
  return id;
}

function timestamp(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new InvalidContextCloudDocument();
  }
  return value as number;
}

function cloneJson(
  value: unknown,
  state: { nodes: number; depth: number; stringChars: number; seen: Set<object> },
  fieldName?: string,
): ContextCloudJson {
  state.nodes += 1;
  if (state.nodes > MAX_NODES || state.depth > MAX_DEPTH) {
    throw new InvalidContextCloudDocument();
  }
  const normalizedFieldName = fieldName ? securityKey(fieldName) : undefined;
  if (normalizedFieldName && PROTECTED_FIELD.test(normalizedFieldName)) {
    throw new ProtectedContextCloudContent();
  }
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new InvalidContextCloudDocument();
    return value;
  }
  if (typeof value === 'string') {
    const secretDetected = hasDetectedSecret(value);
    if (
      value.length > MAX_STRING_CHARS ||
      secretDetected ||
      (normalizedFieldName !== 'markdown' &&
        normalizedFieldName !== 'body' &&
        RAW_CODE_CONTENT.test(value))
    ) {
      if (
        secretDetected ||
        (normalizedFieldName !== 'markdown' &&
          normalizedFieldName !== 'body' &&
          RAW_CODE_CONTENT.test(value))
      ) {
        throw new ProtectedContextCloudContent();
      }
      throw new InvalidContextCloudDocument();
    }
    state.stringChars += value.length;
    if (state.stringChars > MAX_TOTAL_STRING_CHARS) throw new InvalidContextCloudDocument();
    return value;
  }
  if (!value || typeof value !== 'object') throw new InvalidContextCloudDocument();
  if (state.seen.has(value)) throw new InvalidContextCloudDocument();
  state.seen.add(value);
  state.depth += 1;
  try {
    if (Array.isArray(value)) {
      if (value.length > MAX_NODES) throw new InvalidContextCloudDocument();
      const descriptors = Object.getOwnPropertyDescriptors(value);
      if (Reflect.ownKeys(value).some((key) => typeof key === 'symbol')) {
        throw new InvalidContextCloudDocument();
      }
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
          throw new InvalidContextCloudDocument();
        }
      }
      const unexpected = Object.keys(descriptors).some(
        (key) => key !== 'length' && !/^(?:0|[1-9][0-9]*)$/u.test(key),
      );
      if (unexpected) throw new InvalidContextCloudDocument();
      return Array.from({ length: value.length }, (_, index) =>
        cloneJson(descriptors[String(index)]!.value, state, fieldName),
      );
    }
    if (!plainRecord(value)) throw new InvalidContextCloudDocument();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (
      Reflect.ownKeys(value).length !== Object.keys(descriptors).length ||
      Object.keys(descriptors).length > MAX_FIELDS
    ) {
      throw new InvalidContextCloudDocument();
    }
    const output: Record<string, ContextCloudJson> = Object.create(null);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (
        !SAFE_FIELD.test(key) ||
        key === '__proto__' ||
        !descriptor.enumerable ||
        !('value' in descriptor)
      ) {
        throw new InvalidContextCloudDocument();
      }
      output[key] = cloneJson(descriptor.value, state, key);
    }
    return output;
  } finally {
    state.depth -= 1;
    state.seen.delete(value);
  }
}

function parseFields(value: unknown): Record<string, ContextCloudJson> {
  const cloned = cloneJson(value, {
    nodes: 0,
    depth: 0,
    stringChars: 0,
    seen: new Set(),
  });
  if (!plainRecord(cloned)) throw new InvalidContextCloudDocument();
  return cloned as Record<string, ContextCloudJson>;
}

const FIELD_SCHEMAS: Readonly<
  Record<
    ContextCloudSyncKind,
    Readonly<{
      allowed: readonly string[];
      required: readonly string[];
      origin: ContextCloudDocumentV1['provenance']['origin'];
      producer: ContextCloudDocumentV1['provenance']['producer'];
    }>
  >
> = Object.freeze({
  note: {
    allowed: ['title', 'markdown', 'status', 'tags', 'aliases', 'templateId'],
    required: ['title', 'markdown'],
    origin: 'user_authored',
    producer: 'context_note_editor',
  },
  properties: {
    allowed: ['noteId', 'properties'],
    required: ['noteId', 'properties'],
    origin: 'user_authored',
    producer: 'context_properties_editor',
  },
  link: {
    allowed: ['sourceNoteId', 'targetNoteId', 'relationType', 'context'],
    required: ['sourceNoteId', 'targetNoteId', 'relationType'],
    origin: 'user_authored',
    producer: 'context_link_editor',
  },
  view: {
    allowed: ['name', 'definition'],
    required: ['name', 'definition'],
    origin: 'user_authored',
    producer: 'context_view_editor',
  },
  template: {
    allowed: ['name', 'description', 'body', 'status'],
    required: ['name', 'body'],
    origin: 'user_authored',
    producer: 'context_template_editor',
  },
  workspace: {
    allowed: ['name', 'arrangement'],
    required: ['name', 'arrangement'],
    origin: 'user_authored',
    producer: 'context_workspace_editor',
  },
  map_metadata: {
    allowed: ['name', 'status', 'statistics', 'knowledgeRevision', 'lastIndexedAt'],
    required: ['name', 'status', 'statistics', 'knowledgeRevision'],
    origin: 'app_metadata',
    producer: 'context_map_persistence',
  },
  derived_summary: {
    allowed: ['summary', 'sourceRevision'],
    required: ['summary', 'sourceRevision'],
    origin: 'derived',
    producer: 'context_summary_generator',
  },
});

function parseProvenance(
  value: unknown,
  kind: ContextCloudSyncKind,
): ContextCloudDocumentV1['provenance'] {
  if (!exactDataRecord(value, ['origin', 'producer'])) {
    throw new InvalidContextCloudDocument();
  }
  const schema = FIELD_SCHEMAS[kind];
  if (value.origin !== schema.origin || value.producer !== schema.producer) {
    throw new InvalidContextCloudDocument();
  }
  return { origin: schema.origin, producer: schema.producer };
}

function assertFieldsMatchKind(
  kind: ContextCloudSyncKind,
  fields: Readonly<Record<string, ContextCloudJson>>,
  deleted: boolean,
): void {
  if (deleted) {
    if (Object.keys(fields).length !== 0) throw new InvalidContextCloudDocument();
    return;
  }
  const schema = FIELD_SCHEMAS[kind];
  const keys = Object.keys(fields);
  if (
    keys.some((key) => !schema.allowed.includes(key)) ||
    schema.required.some((key) => !Object.hasOwn(fields, key))
  ) {
    throw new InvalidContextCloudDocument();
  }
}

function fieldString(
  fields: Readonly<Record<string, ContextCloudJson>>,
  key: string,
  required = true,
): string | undefined {
  const value = fields[key];
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || value.length === 0) {
    throw new InvalidContextCloudDocument();
  }
  return value;
}

function assertStringList(value: ContextCloudJson | undefined): void {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || item.length === 0)
  ) {
    throw new InvalidContextCloudDocument();
  }
}

function assertContainerFields(
  kind: ContextCloudSyncKind,
  fields: Readonly<Record<string, ContextCloudJson>>,
  deleted: boolean,
): void {
  if (deleted) return;
  if (kind === 'note') {
    fieldString(fields, 'title');
    fieldString(fields, 'markdown');
    if (fields.status !== undefined && !['active', 'archived'].includes(String(fields.status))) {
      throw new InvalidContextCloudDocument();
    }
    if (fields.tags !== undefined) assertStringList(fields.tags);
    if (fields.aliases !== undefined) assertStringList(fields.aliases);
    if (fields.templateId !== undefined) stableId(fields.templateId);
    return;
  }
  if (kind === 'properties') {
    stableId(fields.noteId);
    if (!plainRecord(fields.properties)) throw new InvalidContextCloudDocument();
    for (const value of Object.values(fields.properties)) {
      if (
        !['string', 'number', 'boolean'].includes(typeof value) &&
        !(Array.isArray(value) && value.every((item) => typeof item === 'string'))
      ) {
        throw new InvalidContextCloudDocument();
      }
    }
    return;
  }
  if (kind === 'link') {
    stableId(fields.sourceNoteId);
    stableId(fields.targetNoteId);
    fieldString(fields, 'relationType');
    if (fields.context !== undefined) fieldString(fields, 'context');
    return;
  }
  if (kind === 'view') {
    fieldString(fields, 'name');
    if (!plainRecord(fields.definition)) throw new InvalidContextCloudDocument();
    return;
  }
  if (kind === 'template') {
    fieldString(fields, 'name');
    fieldString(fields, 'body');
    if (fields.description !== undefined) fieldString(fields, 'description', false);
    if (fields.status !== undefined && !['active', 'archived'].includes(String(fields.status))) {
      throw new InvalidContextCloudDocument();
    }
    return;
  }
  if (kind === 'workspace') {
    fieldString(fields, 'name');
    if (!plainRecord(fields.arrangement)) throw new InvalidContextCloudDocument();
    return;
  }
  if (kind === 'map_metadata') {
    fieldString(fields, 'name');
    if (!['active', 'archived'].includes(String(fields.status))) {
      throw new InvalidContextCloudDocument();
    }
    if (
      !Number.isSafeInteger(fields.knowledgeRevision) ||
      (fields.knowledgeRevision as number) < 1 ||
      (fields.lastIndexedAt !== undefined &&
        (!Number.isSafeInteger(fields.lastIndexedAt) || (fields.lastIndexedAt as number) < 0)) ||
      !exactDataRecord(fields.statistics, [
        'sourceCount',
        'entityCount',
        'edgeCount',
        'noteCount',
        'attachmentCount',
        'staleSourceCount',
      ]) ||
      Object.values(fields.statistics).some(
        (value) => !Number.isSafeInteger(value) || (value as number) < 0,
      )
    ) {
      throw new InvalidContextCloudDocument();
    }
    return;
  }
  fieldString(fields, 'summary');
  stableId(fields.sourceRevision);
}

export function parseContextCloudDocument(raw: unknown): ContextCloudDocumentV1 {
  const allowed = [
    'version',
    'accountId',
    'projectId',
    'kind',
    'id',
    'revisionId',
    'baseRevisionId',
    'provenance',
    'updatedAt',
    'deletedAt',
    'fields',
  ] as const;
  if (!exactDataRecord(raw, allowed) || raw.version !== 1) {
    throw new InvalidContextCloudDocument();
  }
  const kind = raw.kind;
  if (typeof kind !== 'string' || !(CONTEXT_CLOUD_SYNC_KINDS as readonly string[]).includes(kind)) {
    throw new InvalidContextCloudDocument();
  }
  const projectId = raw.projectId === null ? null : protectedStableId(raw.projectId);
  const baseRevisionId = raw.baseRevisionId === null ? null : protectedStableId(raw.baseRevisionId);
  const deletedAt = raw.deletedAt === undefined ? undefined : timestamp(raw.deletedAt);
  const fields = parseFields(raw.fields);
  assertFieldsMatchKind(kind as ContextCloudSyncKind, fields, deletedAt !== undefined);
  assertContainerFields(kind as ContextCloudSyncKind, fields, deletedAt !== undefined);
  return {
    version: 1,
    accountId: protectedStableId(raw.accountId),
    projectId,
    kind: kind as ContextCloudSyncKind,
    id: protectedStableId(raw.id),
    revisionId: protectedStableId(raw.revisionId),
    baseRevisionId,
    provenance: parseProvenance(raw.provenance, kind as ContextCloudSyncKind),
    updatedAt: timestamp(raw.updatedAt),
    ...(deletedAt === undefined ? {} : { deletedAt }),
    fields,
  };
}

function preferenceKey(accountId: string): string {
  return `${PREFERENCE_PREFIX}${encodeURIComponent(stableId(accountId))}`;
}

function stagedPrefix(accountId: string): string {
  return `${STAGED_PREFIX}${encodeURIComponent(stableId(accountId))}:`;
}

function stagedKey(accountId: string, rowId: string): string {
  return `${stagedPrefix(accountId)}${encodeURIComponent(rowId)}`;
}

function resolutionKey(accountId: string, requestId: string): string {
  return `${RESOLUTION_PREFIX}${encodeURIComponent(stableId(accountId))}:${encodeURIComponent(
    stableId(requestId),
  )}`;
}

function resolutionClaimKey(accountId: string, rowId: string): string {
  return `${RESOLUTION_CLAIM_PREFIX}${encodeURIComponent(
    stableId(accountId),
  )}:${encodeURIComponent(rowId)}`;
}

function publishReviewState(
  accountId: string,
  rowId: string,
  status: 'pending_review' | 'resolved',
): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('jarvis:context-cloud-review', {
      detail: { accountId, rowId, status },
    }),
  );
}

function exactCloudAuthority(accountId: string): boolean {
  const identity = getActiveAccountIdentity();
  return identity?.source === 'supabase' && identity.accountId === accountId;
}

function cloudSyncEntitled(): boolean {
  return getPlan(useAuthStore.getState().plan).cloudSync;
}

function parsePreference(
  value: unknown,
  accountId: string,
): ContextCloudSyncPreferenceV1 | undefined {
  if (
    !exactDataRecord(value, ['version', 'accountId', 'enabled', 'derivedSummaries', 'updatedAt']) ||
    value.version !== 1 ||
    value.accountId !== accountId ||
    typeof value.enabled !== 'boolean' ||
    typeof value.derivedSummaries !== 'boolean' ||
    !Number.isSafeInteger(value.updatedAt) ||
    (value.updatedAt as number) < 0
  ) {
    return undefined;
  }
  return {
    version: 1,
    accountId,
    enabled: value.enabled,
    derivedSummaries: value.derivedSummaries,
    updatedAt: value.updatedAt as number,
  };
}

async function loadPreference(accountId: string): Promise<ContextCloudSyncPreferenceV1> {
  await openDb();
  const parsed = parsePreference(
    (await db.settings.get(preferenceKey(accountId)))?.value,
    accountId,
  );
  return (
    parsed ?? {
      version: 1,
      accountId,
      enabled: false,
      derivedSummaries: false,
      updatedAt: 0,
    }
  );
}

export async function setContextCloudSyncPreference(
  accountId: string,
  preference: Readonly<{ enabled: boolean; derivedSummaries: boolean }>,
): Promise<ContextCloudSyncPreferenceV1> {
  stableId(accountId);
  if (typeof preference.enabled !== 'boolean' || typeof preference.derivedSummaries !== 'boolean') {
    throw new Error('context_cloud_sync_preference_invalid');
  }
  if (!exactCloudAuthority(accountId)) {
    throw new Error('context_cloud_sync_cloud_authority_required');
  }
  if (preference.enabled && !cloudSyncEntitled()) {
    throw new Error('context_cloud_sync_entitlement_required');
  }
  const value: ContextCloudSyncPreferenceV1 = {
    version: 1,
    accountId,
    enabled: preference.enabled,
    derivedSummaries: preference.enabled && preference.derivedSummaries,
    updatedAt: Date.now(),
  };
  await openDb();
  if (!exactCloudAuthority(accountId)) {
    throw new Error('context_cloud_sync_cloud_authority_changed');
  }
  await db.settings.put({
    key: preferenceKey(accountId),
    value,
    updated_at: value.updatedAt,
  });
  return value;
}

export function contextCloudSyncRowId(raw: ContextCloudDocumentV1): string {
  const document = parseContextCloudDocument(raw);
  const project = document.projectId === null ? '~' : encodeURIComponent(document.projectId);
  return [
    'v1',
    encodeURIComponent(document.accountId),
    project,
    document.kind,
    encodeURIComponent(document.id),
  ].join(':');
}

export async function queueContextCloudDocument(
  accountId: string,
  raw: unknown,
  signal: AbortSignal,
): Promise<ContextCloudQueueResult> {
  if (signal.aborted) return { queued: false, reason: 'aborted' };
  let document: ContextCloudDocumentV1;
  try {
    document = parseContextCloudDocument(raw);
  } catch (error) {
    return {
      queued: false,
      reason:
        error instanceof ProtectedContextCloudContent ? 'protected_content' : 'document_invalid',
    };
  }
  if (document.accountId !== accountId || !exactCloudAuthority(accountId) || !cloudSyncEntitled()) {
    return { queued: false, reason: 'cloud_authority_required' };
  }
  const preference = await loadPreference(accountId);
  if (signal.aborted) return { queued: false, reason: 'aborted' };
  if (!preference.enabled) return { queued: false, reason: 'disabled' };
  if (document.kind === 'derived_summary' && !preference.derivedSummaries) {
    return { queued: false, reason: 'derived_summaries_disabled' };
  }
  if (!exactCloudAuthority(accountId) || !cloudSyncEntitled()) {
    return { queued: false, reason: 'cloud_authority_required' };
  }
  try {
    const queueId = await enqueueMutation(
      document.deletedAt === undefined ? 'update' : 'delete',
      CONTEXT_CLOUD_SYNC_TABLE,
      contextCloudSyncRowId(document),
      document,
      {
        state: 'cloud',
        userId: accountId,
        capturedAt: Date.now(),
      },
      {
        signal,
        validate: async (settings) => {
          if (!exactCloudAuthority(accountId) || !cloudSyncEntitled()) return false;
          const current = parsePreference(
            (await settings.get(preferenceKey(accountId)))?.value,
            accountId,
          );
          return (
            current?.enabled === true &&
            (document.kind !== 'derived_summary' || current.derivedSummaries)
          );
        },
      },
    );
    return { queued: true, queueId };
  } catch (error) {
    if (error instanceof SyncMutationCommitRejectedError) {
      return {
        queued: false,
        reason: error.reason === 'cancelled' ? 'aborted' : 'cloud_authority_required',
      };
    }
    throw error;
  }
}

export async function assertContextCloudUploadAuthorized(
  raw: unknown,
  accountId: string,
  signal: AbortSignal,
): Promise<ContextCloudDocumentV1> {
  const document = parseContextCloudDocument(raw);
  if (
    signal.aborted ||
    document.accountId !== accountId ||
    !exactCloudAuthority(accountId) ||
    !cloudSyncEntitled()
  ) {
    throw new Error('context_cloud_sync_upload_authority_required');
  }
  const preference = await loadPreference(accountId);
  if (
    signal.aborted ||
    !exactCloudAuthority(accountId) ||
    !cloudSyncEntitled() ||
    !preference.enabled ||
    (document.kind === 'derived_summary' && !preference.derivedSummaries)
  ) {
    throw new Error('context_cloud_sync_upload_disabled');
  }
  return document;
}

function parseStaged(value: unknown, accountId: string): StagedContextCloudRecordV1 | undefined {
  if (
    !exactDataRecord(value, [
      'version',
      'accountId',
      'rowId',
      'status',
      'resolutionRequired',
      'document',
      'receivedAt',
    ]) ||
    value.version !== 1 ||
    value.accountId !== accountId ||
    value.status !== 'pending_review' ||
    value.resolutionRequired !== true ||
    typeof value.rowId !== 'string' ||
    !Number.isSafeInteger(value.receivedAt)
  ) {
    return undefined;
  }
  try {
    const document = parseContextCloudDocument(value.document);
    if (document.accountId !== accountId || contextCloudSyncRowId(document) !== value.rowId) {
      return undefined;
    }
    return {
      version: 1,
      accountId,
      rowId: value.rowId,
      status: 'pending_review',
      resolutionRequired: true,
      document,
      receivedAt: value.receivedAt as number,
    };
  } catch {
    return undefined;
  }
}

export async function stageContextCloudRecord(
  row: CloudSyncRecord,
  signal: AbortSignal,
): Promise<boolean> {
  if (
    signal.aborted ||
    row.table_name !== CONTEXT_CLOUD_SYNC_TABLE ||
    !exactCloudAuthority(row.user_id) ||
    !cloudSyncEntitled()
  ) {
    return false;
  }
  const preference = await loadPreference(row.user_id);
  if (signal.aborted || !preference.enabled || !exactCloudAuthority(row.user_id)) return false;
  let document: ContextCloudDocumentV1;
  try {
    document = parseContextCloudDocument(row.payload);
  } catch {
    return false;
  }
  if (
    document.accountId !== row.user_id ||
    contextCloudSyncRowId(document) !== row.row_id ||
    (row.op === 'delete') !== (document.deletedAt !== undefined) ||
    (document.kind === 'derived_summary' && !preference.derivedSummaries)
  ) {
    return false;
  }
  const value: StagedContextCloudRecordV1 = {
    version: 1,
    accountId: row.user_id,
    rowId: row.row_id,
    status: 'pending_review',
    resolutionRequired: true,
    document,
    receivedAt: Date.now(),
  };
  const write = await runSignalBoundWrite(db, signal, [db.settings], async (transaction) => {
    const settings = transaction.table<SettingsRow, string>('settings');
    const current = parsePreference(
      (await settings.get(preferenceKey(row.user_id)))?.value,
      row.user_id,
    );
    if (
      !exactCloudAuthority(row.user_id) ||
      !cloudSyncEntitled() ||
      current?.enabled !== true ||
      (document.kind === 'derived_summary' && !current.derivedSummaries)
    ) {
      return false;
    }
    await settings.put({
      key: stagedKey(row.user_id, row.row_id),
      value,
      updated_at: value.receivedAt,
    });
    return true;
  });
  const staged = write.kind === 'committed' && write.value;
  if (staged) publishReviewState(row.user_id, row.row_id, 'pending_review');
  return staged;
}

export async function listStagedContextCloudRecords(
  accountId: string,
): Promise<StagedContextCloudRecordV1[]> {
  if (!exactCloudAuthority(accountId)) {
    throw new Error('context_cloud_sync_cloud_authority_required');
  }
  await openDb();
  const prefix = stagedPrefix(accountId);
  const rows = await db.settings.where('key').startsWith(prefix).limit(500).toArray();
  if (!exactCloudAuthority(accountId)) {
    throw new Error('context_cloud_sync_cloud_authority_changed');
  }
  return rows
    .map((row) => parseStaged(row.value, accountId))
    .filter((row): row is StagedContextCloudRecordV1 => row !== undefined)
    .sort(
      (left, right) => left.receivedAt - right.receivedAt || left.rowId.localeCompare(right.rowId),
    );
}

function jsonEqual(
  left: ContextCloudJson | undefined,
  right: ContextCloudJson | undefined,
): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => jsonEqual(value, right[index]))
    );
  }
  if (!plainRecord(left) || !plainRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        jsonEqual(
          left[key] as ContextCloudJson | undefined,
          right[key] as ContextCloudJson | undefined,
        ),
    )
  );
}

type LineChange = Readonly<{ start: number; end: number; replacement: string[] }>;

function lineChange(base: string[], next: string[]): LineChange {
  let start = 0;
  while (start < base.length && start < next.length && base[start] === next[start]) start += 1;
  let baseEnd = base.length;
  let nextEnd = next.length;
  while (baseEnd > start && nextEnd > start && base[baseEnd - 1] === next[nextEnd - 1]) {
    baseEnd -= 1;
    nextEnd -= 1;
  }
  return { start, end: baseEnd, replacement: next.slice(start, nextEnd) };
}

function changesOverlap(left: LineChange, right: LineChange): boolean {
  if (left.start === left.end && right.start === right.end) return left.start === right.start;
  return left.start < right.end && right.start < left.end;
}

function mergeMarkdown(base: string, local: string, remote: string): string | undefined {
  if (local === remote) return local;
  if (local === base) return remote;
  if (remote === base) return local;
  const baseLines = base.split('\n');
  const localChange = lineChange(baseLines, local.split('\n'));
  const remoteChange = lineChange(baseLines, remote.split('\n'));
  if (changesOverlap(localChange, remoteChange)) return undefined;
  const merged = [...baseLines];
  for (const change of [localChange, remoteChange].sort((a, b) => b.start - a.start)) {
    merged.splice(change.start, change.end - change.start, ...change.replacement);
  }
  return merged.join('\n');
}

function canonicalJson(value: ContextCloudJson): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`)
    .join(',')}}`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function documentCanonical(document: ContextCloudDocumentV1): string {
  return canonicalJson(document as unknown as ContextCloudJson);
}

async function mergeRevisionId(
  local: ContextCloudDocumentV1,
  remote: ContextCloudDocumentV1,
  fields: Readonly<Record<string, ContextCloudJson>>,
): Promise<string> {
  const digest = await sha256Hex(
    canonicalJson({
      local: documentCanonical(local),
      remote: documentCanonical(remote),
      fields,
    }),
  );
  return `merge-${digest}`;
}

async function conflictCopyId(document: ContextCloudDocumentV1): Promise<string> {
  const suffix = (await sha256Hex(documentCanonical(document))).slice(0, 32);
  const stem = document.id.slice(0, Math.max(1, 180 - suffix.length));
  return `${stem}.conflict.${suffix}`;
}

function sameIdentity(left: ContextCloudDocumentV1, right: ContextCloudDocumentV1): boolean {
  return (
    left.accountId === right.accountId &&
    left.projectId === right.projectId &&
    left.kind === right.kind &&
    left.id === right.id
  );
}

async function conflict(
  preserved: ContextCloudDocumentV1,
  remote: ContextCloudDocumentV1,
  reason: 'overlapping_change' | 'delete_update_conflict' | 'revision_chain_invalid',
): Promise<ContextCloudMergeResult> {
  return {
    kind: 'conflict',
    preserved,
    conflictCopy: {
      ...remote,
      id: await conflictCopyId(remote),
    },
    resolution: {
      visible: true,
      status: 'requires_user',
      reason,
      options: CONFLICT_OPTIONS,
    },
    capabilities: CAPABILITIES,
  };
}

export async function mergeContextCloudDocuments(raw: {
  base: unknown;
  local: unknown;
  remote: unknown;
}): Promise<ContextCloudMergeResult> {
  const base = parseContextCloudDocument(raw.base);
  const local = parseContextCloudDocument(raw.local);
  const remote = parseContextCloudDocument(raw.remote);
  if (
    !sameIdentity(base, local) ||
    !sameIdentity(base, remote) ||
    local.baseRevisionId !== base.revisionId ||
    remote.baseRevisionId !== base.revisionId
  ) {
    return conflict(local, remote, 'revision_chain_invalid');
  }
  if (local.revisionId === remote.revisionId) {
    if (documentCanonical(local) !== documentCanonical(remote)) {
      return conflict(local, remote, 'revision_chain_invalid');
    }
    return {
      kind: 'merged',
      document: local,
      resolution: { visible: true, status: 'auto_merged', reason: 'same_revision' },
      capabilities: CAPABILITIES,
    };
  }

  const baseDeleted = base.deletedAt !== undefined;
  const localDeleted = local.deletedAt !== undefined;
  const remoteDeleted = remote.deletedAt !== undefined;
  if (baseDeleted && !localDeleted && !remoteDeleted) {
    return conflict(local, remote, 'delete_update_conflict');
  }
  if (localDeleted || remoteDeleted) {
    if (localDeleted && remoteDeleted) {
      const document = local.updatedAt >= remote.updatedAt ? local : remote;
      return {
        kind: 'merged',
        document,
        resolution: {
          visible: true,
          status: 'auto_merged',
          reason: 'tombstone_applied',
        },
        capabilities: CAPABILITIES,
      };
    }
    const changed = localDeleted ? remote : local;
    if (baseDeleted || !jsonEqual(changed.fields, base.fields)) {
      return conflict(local, remote, 'delete_update_conflict');
    }
    const document = localDeleted ? local : remote;
    return {
      kind: 'merged',
      document,
      resolution: {
        visible: true,
        status: 'auto_merged',
        reason: 'tombstone_applied',
      },
      capabilities: CAPABILITIES,
    };
  }

  const fields: Record<string, ContextCloudJson> = Object.create(null);
  for (const key of new Set([
    ...Object.keys(base.fields),
    ...Object.keys(local.fields),
    ...Object.keys(remote.fields),
  ])) {
    const baseValue = base.fields[key];
    const localValue = local.fields[key];
    const remoteValue = remote.fields[key];
    if (jsonEqual(localValue, remoteValue)) {
      if (localValue !== undefined) fields[key] = localValue;
    } else if (jsonEqual(localValue, baseValue)) {
      if (remoteValue !== undefined) fields[key] = remoteValue;
    } else if (jsonEqual(remoteValue, baseValue)) {
      if (localValue !== undefined) fields[key] = localValue;
    } else if (
      key === 'markdown' &&
      typeof baseValue === 'string' &&
      typeof localValue === 'string' &&
      typeof remoteValue === 'string'
    ) {
      const markdown = mergeMarkdown(baseValue, localValue, remoteValue);
      if (markdown === undefined) return conflict(local, remote, 'overlapping_change');
      fields[key] = markdown;
    } else {
      return conflict(local, remote, 'overlapping_change');
    }
  }
  return {
    kind: 'merged',
    document: {
      ...local,
      revisionId: await mergeRevisionId(local, remote, fields),
      baseRevisionId: base.revisionId,
      updatedAt: Math.max(local.updatedAt, remote.updatedAt),
      fields,
    },
    resolution: { visible: true, status: 'auto_merged', reason: 'field_merge' },
    capabilities: CAPABILITIES,
  };
}

const resolutionInFlight = new Map<
  string,
  {
    rowId: string;
    choice: ContextCloudResolutionChoice;
    promise: Promise<ContextCloudResolutionResult>;
  }
>();

function resolutionTupleMatches(
  value: Record<string, unknown>,
  authority: ContextCloudResolutionAuthority,
  rowId: string,
  choice: ContextCloudResolutionChoice,
): boolean {
  return (
    value.version === 1 &&
    value.accountId === authority.accountId &&
    value.requestId === authority.requestId &&
    value.rowId === rowId &&
    value.choice === choice
  );
}

function receiptId(value: unknown): string {
  return stableId(value);
}

async function resolveStagedContextCloudRecordOnce(
  authority: ContextCloudResolutionAuthority,
  rowId: string,
  choice: ContextCloudResolutionChoice,
  adapter?: ContextCloudResolutionAdapter,
): Promise<ContextCloudResolutionResult> {
  await openDb();
  const executionId = crypto.randomUUID();
  const recoveredAdapterReceipt = adapter
    ? await adapter.lookupReceipt({
        accountId: authority.accountId,
        requestId: authority.requestId,
        signal: authority.signal,
      })
    : null;
  const auditKey = resolutionKey(authority.accountId, authority.requestId);
  const claimKey = resolutionClaimKey(authority.accountId, rowId);
  const inboxKey = stagedKey(authority.accountId, rowId);
  const claimed = await runSignalBoundWrite(
    db,
    authority.signal,
    [db.settings],
    async (transaction) => {
      const settings = transaction.table<SettingsRow, string>('settings');
      const preference = parsePreference(
        (await settings.get(preferenceKey(authority.accountId)))?.value,
        authority.accountId,
      );
      if (
        !exactCloudAuthority(authority.accountId) ||
        !cloudSyncEntitled() ||
        preference?.enabled !== true
      ) {
        throw new Error('context_cloud_sync_resolution_authority_changed');
      }
      const existingAudit = (await settings.get(auditKey))?.value;
      if (plainRecord(existingAudit)) {
        if (!resolutionTupleMatches(existingAudit, authority, rowId, choice)) {
          throw new Error('context_cloud_sync_resolution_request_reused');
        }
        if (
          existingAudit.status === 'completed' &&
          Array.isArray(existingAudit.appliedDocumentIds)
        ) {
          return {
            kind: 'completed' as const,
            appliedDocumentIds: existingAudit.appliedDocumentIds.map(receiptId),
          };
        }
        if (existingAudit.status !== 'applying') {
          throw new Error('context_cloud_sync_resolution_audit_invalid');
        }
        if (
          existingAudit.receiptId === undefined &&
          !recoveredAdapterReceipt &&
          typeof existingAudit.leaseExpiresAt === 'number' &&
          existingAudit.leaseExpiresAt > Date.now() &&
          existingAudit.executionId !== executionId
        ) {
          throw new Error('context_cloud_sync_resolution_in_progress');
        }
      }
      const existingClaim = (await settings.get(claimKey))?.value;
      if (
        plainRecord(existingClaim) &&
        !resolutionTupleMatches(existingClaim, authority, rowId, choice)
      ) {
        throw new Error('context_cloud_sync_resolution_already_claimed');
      }
      const staged = parseStaged((await settings.get(inboxKey))?.value, authority.accountId);
      if (!staged || staged.rowId !== rowId) {
        throw new Error('context_cloud_sync_resolution_stage_missing');
      }
      const now = Date.now();
      const receipt =
        plainRecord(existingAudit) && typeof existingAudit.receiptId === 'string'
          ? receiptId(existingAudit.receiptId)
          : recoveredAdapterReceipt
            ? receiptId(recoveredAdapterReceipt)
            : undefined;
      const claim = {
        version: 1,
        accountId: authority.accountId,
        requestId: authority.requestId,
        rowId,
        choice,
        status: 'applying',
        executionId,
        leaseExpiresAt: now + 30_000,
        remoteRevisionId: staged.document.revisionId,
        ...(receipt ? { receiptId: receipt } : {}),
        updatedAt: now,
      };
      await settings.put({ key: claimKey, value: claim, updated_at: now });
      await settings.put({ key: auditKey, value: claim, updated_at: now });
      return { kind: 'claimed' as const, staged, receipt };
    },
  );
  if (claimed.kind === 'cancelled') {
    throw new Error('context_cloud_sync_resolution_cancelled');
  }
  if (claimed.value.kind === 'completed') {
    return {
      status: 'completed',
      accountId: authority.accountId,
      rowId,
      requestId: authority.requestId,
      choice,
      appliedDocumentIds: claimed.value.appliedDocumentIds,
    };
  }

  const remote = claimed.value.staged.document;
  const documents =
    choice === 'keep_local'
      ? []
      : choice === 'use_remote'
        ? [remote]
        : [{ ...remote, id: await conflictCopyId(remote) }];
  let durableReceipt = claimed.value.receipt;
  if (!durableReceipt && documents.length > 0) {
    if (!adapter) throw new Error('context_cloud_sync_resolution_adapter_required');
    durableReceipt = receiptId(
      (
        await adapter.apply({
          accountId: authority.accountId,
          requestId: authority.requestId,
          documents,
          signal: authority.signal,
        })
      ).receiptId,
    );
  }
  durableReceipt ??= `local-${authority.requestId}`;

  const checkpoint = await runSignalBoundWrite(
    db,
    authority.signal,
    [db.settings],
    async (transaction) => {
      const settings = transaction.table<SettingsRow, string>('settings');
      const currentClaim = (await settings.get(claimKey))?.value;
      if (
        !plainRecord(currentClaim) ||
        !resolutionTupleMatches(currentClaim, authority, rowId, choice) ||
        currentClaim.executionId !== executionId
      ) {
        throw new Error('context_cloud_sync_resolution_claim_lost');
      }
      const now = Date.now();
      const withReceipt = {
        ...currentClaim,
        receiptId: durableReceipt,
        leaseExpiresAt: now + 30_000,
        updatedAt: now,
      };
      await settings.put({ key: claimKey, value: withReceipt, updated_at: now });
      await settings.put({ key: auditKey, value: withReceipt, updated_at: now });
    },
  );
  if (checkpoint.kind === 'cancelled') {
    throw new Error('context_cloud_sync_resolution_cancelled');
  }

  const finalized = await runSignalBoundWrite(
    db,
    authority.signal,
    [db.settings],
    async (transaction) => {
      const settings = transaction.table<SettingsRow, string>('settings');
      const preference = parsePreference(
        (await settings.get(preferenceKey(authority.accountId)))?.value,
        authority.accountId,
      );
      const currentStage = parseStaged((await settings.get(inboxKey))?.value, authority.accountId);
      const currentClaim = (await settings.get(claimKey))?.value;
      if (
        !exactCloudAuthority(authority.accountId) ||
        !cloudSyncEntitled() ||
        preference?.enabled !== true ||
        !plainRecord(currentClaim) ||
        !resolutionTupleMatches(currentClaim, authority, rowId, choice) ||
        currentClaim.executionId !== executionId ||
        currentClaim.receiptId !== durableReceipt ||
        currentStage?.document.revisionId !== remote.revisionId ||
        (currentStage && documentCanonical(currentStage.document) !== documentCanonical(remote))
      ) {
        throw new Error('context_cloud_sync_resolution_authority_changed');
      }
      await settings.delete(inboxKey);
      await settings.delete(claimKey);
      const appliedDocumentIds = documents.map((document) => document.id);
      const now = Date.now();
      await settings.put({
        key: auditKey,
        value: {
          version: 1,
          accountId: authority.accountId,
          requestId: authority.requestId,
          rowId,
          choice,
          status: 'completed',
          remoteRevisionId: remote.revisionId,
          receiptId: durableReceipt,
          appliedDocumentIds,
          updatedAt: now,
        },
        updated_at: now,
      });
      return appliedDocumentIds;
    },
  );
  if (finalized.kind === 'cancelled') {
    throw new Error('context_cloud_sync_resolution_cancelled');
  }
  publishReviewState(authority.accountId, rowId, 'resolved');
  return {
    status: 'completed',
    accountId: authority.accountId,
    rowId,
    requestId: authority.requestId,
    choice,
    appliedDocumentIds: finalized.value,
  };
}

export function resolveStagedContextCloudRecord(
  authority: ContextCloudResolutionAuthority,
  rowId: string,
  choice: ContextCloudResolutionChoice,
  adapter?: ContextCloudResolutionAdapter,
): Promise<ContextCloudResolutionResult> {
  if (
    authority.kind !== 'direct_user_action' ||
    !SAFE_ID.test(authority.accountId) ||
    !SAFE_ID.test(authority.requestId) ||
    typeof rowId !== 'string' ||
    rowId.length === 0 ||
    rowId.length > 1_000 ||
    !['keep_local', 'use_remote', 'keep_both'].includes(choice) ||
    (choice !== 'keep_local' && !adapter)
  ) {
    return Promise.reject(new Error('context_cloud_sync_resolution_invalid'));
  }
  if (
    authority.signal.aborted ||
    !exactCloudAuthority(authority.accountId) ||
    !cloudSyncEntitled()
  ) {
    return Promise.reject(new Error('context_cloud_sync_resolution_authority_required'));
  }
  const key = `${authority.accountId}\u0000${authority.requestId}`;
  const active = resolutionInFlight.get(key);
  if (active) {
    return active.rowId === rowId && active.choice === choice
      ? active.promise
      : Promise.reject(new Error('context_cloud_sync_resolution_request_reused'));
  }
  const promise = resolveStagedContextCloudRecordOnce(authority, rowId, choice, adapter).finally(
    () => {
      if (resolutionInFlight.get(key)?.promise === promise) resolutionInFlight.delete(key);
    },
  );
  resolutionInFlight.set(key, { rowId, choice, promise });
  return promise;
}
