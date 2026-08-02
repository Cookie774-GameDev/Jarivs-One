import { CONTEXT_SCHEMA_VERSION, type ContextParseResult, type DeepReadonly } from './contracts';

export const CONTEXT_NOTE_KINDS = ['standard', 'daily', 'generated_overview'] as const;
export const CONTEXT_NOTE_STATUSES = ['active', 'deleted'] as const;
export const CONTEXT_CONTENT_STORAGE_MODES = [
  'app_managed',
  'portable_markdown',
  'project_local',
] as const;
export const CONTEXT_NOTE_CHANGE_KINDS = [
  'created',
  'edited',
  'renamed',
  'deleted',
  'restored',
] as const;
export const CONTEXT_NOTE_AUTHOR_SOURCES = [
  'user',
  'jarvis_approved',
  'migration',
  'recovery',
] as const;
export const CONTEXT_ASSET_KINDS = [
  'markdown',
  'image',
  'audio',
  'video',
  'pdf',
  'text',
  'source_file',
  'archive',
  'other',
] as const;
export const CONTEXT_ASSET_STATUSES = ['ready', 'missing', 'quarantined'] as const;
export const CONTEXT_ASSET_EXTRACTION_MODES = [
  'none',
  'direct_text',
  'pdf_text',
  'explicit_transcription',
  'explicit_vision',
] as const;
export const CONTEXT_ASSET_EXTRACTION_STATUSES = [
  'not_requested',
  'pending',
  'ready',
  'failed',
  'blocked',
] as const;

export type ContextNoteKind = (typeof CONTEXT_NOTE_KINDS)[number];
export type ContextNoteStatus = (typeof CONTEXT_NOTE_STATUSES)[number];
export type ContextContentStorageMode = (typeof CONTEXT_CONTENT_STORAGE_MODES)[number];
export type ContextNoteChangeKind = (typeof CONTEXT_NOTE_CHANGE_KINDS)[number];
export type ContextNoteAuthorSource = (typeof CONTEXT_NOTE_AUTHOR_SOURCES)[number];
export type ContextAssetKind = (typeof CONTEXT_ASSET_KINDS)[number];
export type ContextAssetStatus = (typeof CONTEXT_ASSET_STATUSES)[number];
export type ContextAssetExtractionMode = (typeof CONTEXT_ASSET_EXTRACTION_MODES)[number];
export type ContextAssetExtractionStatus = (typeof CONTEXT_ASSET_EXTRACTION_STATUSES)[number];

export interface ContextNoteV2 {
  version: 2;
  id: string;
  accountId: string;
  mapId: string;
  entityId: string;
  sourceId: string;
  kind: ContextNoteKind;
  title: string;
  status: ContextNoteStatus;
  storageMode: ContextContentStorageMode;
  storageRootId: string;
  relativePath: string;
  writeConsentId?: string;
  contentAssetId: string;
  contentHash: string;
  currentRevisionId: string;
  templateId?: string;
  aliases: string[];
  tags: string[];
  blockIds: string[];
  dailyDate?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface ContextNoteRevisionV2 {
  version: 2;
  id: string;
  accountId: string;
  mapId: string;
  noteId: string;
  sequence: number;
  changeKind: ContextNoteChangeKind;
  authorSource: ContextNoteAuthorSource;
  approvalId?: string;
  beforeHash: string | null;
  afterHash: string;
  diffAssetId: string;
  recoveryMode: 'reverse_diff' | 'snapshot';
  recoveryAssetId: string;
  restoredFromRevisionId?: string;
  createdAt: number;
}

export interface ContextAssetExtractionProviderV2 {
  providerId: string;
  modelId: string;
  authorization: 'explicit_user' | 'approved_setting';
}

export interface ContextAssetExtractionV2 {
  mode: ContextAssetExtractionMode;
  status: ContextAssetExtractionStatus;
  provider?: ContextAssetExtractionProviderV2;
}

export interface ContextAssetV2 {
  version: 2;
  id: string;
  accountId: string;
  mapId: string;
  entityId: string;
  sourceId: string;
  kind: ContextAssetKind;
  status: ContextAssetStatus;
  storageMode: ContextContentStorageMode;
  storageRootId: string;
  relativePath: string;
  writeConsentId?: string;
  fileName: string;
  mimeType: string;
  checksumSha256: string;
  sizeBytes: number;
  executable: false;
  extraction: ContextAssetExtractionV2;
  thumbnailAssetId?: string;
  extractedTextAssetId?: string;
  createdAt: number;
  updatedAt: number;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const OPAQUE_STORAGE_ROOT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const BLOCK_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
const MIME_TYPE = /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const WINDOWS_INVALID_PATH_CHARACTERS = /[<>:"|?*]/u;
const WINDOWS_RESERVED_PATH_SEGMENT =
  /^(?:con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu;
const MAX_PATH_CHARS = 4_096;

class ContextContentContractFailure extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'ContextContentContractFailure';
  }
}

function fail(reason: string): never {
  throw new ContextContentContractFailure(reason);
}

function plainRecord(value: unknown, reason: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(reason);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(reason);
  return value as Record<string, unknown>;
}

function exactKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  reason: string,
): void {
  const allowed = new Set(keys);
  if (Object.keys(record).some((key) => !allowed.has(key))) fail(reason);
}

function isOneOf<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
): value is Values[number] {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function safeText(value: unknown, reason: string, maximum: number): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximum ||
    value.trim() !== value ||
    CONTROL_CHARACTERS.test(value)
  ) {
    fail(reason);
  }
  return value;
}

function stableId(value: unknown, reason: string): string {
  const id = safeText(value, reason, 200);
  if (!SAFE_ID.test(id)) fail(reason);
  return id;
}

function optionalStableId(value: unknown, reason: string): string | undefined {
  return value === undefined ? undefined : stableId(value, reason);
}

function storageRootId(value: unknown, reason: string): string {
  const id = safeText(value, reason, 200);
  if (!OPAQUE_STORAGE_ROOT_ID.test(id)) fail(reason);
  return id;
}

function safeInteger(value: unknown, reason: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) fail(reason);
  return value as number;
}

function optionalSafeInteger(value: unknown, reason: string): number | undefined {
  return value === undefined ? undefined : safeInteger(value, reason);
}

function checksum(value: unknown, reason: string): string {
  const digest = safeText(value, reason, 64);
  if (!SHA256.test(digest)) fail(reason);
  return digest;
}

function portableRelativePath(value: unknown, reason: string): string {
  const path = safeText(value, reason, MAX_PATH_CHARS);
  if (
    path.includes('\\') ||
    path.startsWith('/') ||
    /^[A-Za-z]:/.test(path) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(path)
  ) {
    fail(reason);
  }
  const segments = path.split('/');
  if (
    segments.some(
      (segment) =>
        segment === '' ||
        segment === '.' ||
        segment === '..' ||
        WINDOWS_INVALID_PATH_CHARACTERS.test(segment) ||
        /[. ]$/u.test(segment) ||
        WINDOWS_RESERVED_PATH_SEGMENT.test(segment),
    )
  ) {
    fail(reason);
  }
  return path;
}

function uniqueTextList(
  value: unknown,
  reason: string,
  duplicateReason: string,
  options: Readonly<{
    maximumItems: number;
    maximumCharacters: number;
    validate?: (entry: string) => boolean;
  }>,
): string[] {
  if (!Array.isArray(value) || value.length > options.maximumItems) fail(reason);
  const entries = value.map((entry) => {
    const text = safeText(entry, reason, options.maximumCharacters);
    if (options.validate && !options.validate(text)) fail(reason);
    return text;
  });
  const folded = entries.map((entry) => entry.toLocaleLowerCase('en-US'));
  if (new Set(folded).size !== folded.length) fail(duplicateReason);
  return entries;
}

function validCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parseStorage(
  record: Readonly<Record<string, unknown>>,
  prefix: 'note' | 'asset',
): Readonly<{
  storageMode: ContextContentStorageMode;
  storageRootId: string;
  relativePath: string;
  writeConsentId?: string;
}> {
  if (!isOneOf(record.storageMode, CONTEXT_CONTENT_STORAGE_MODES)) {
    fail(`${prefix}_storage_mode_invalid`);
  }
  const rootId = storageRootId(record.storageRootId, `${prefix}_storage_root_invalid`);
  const path = portableRelativePath(record.relativePath, `${prefix}_relative_path_invalid`);
  const consentId = optionalStableId(record.writeConsentId, `${prefix}_write_consent_invalid`);
  if (
    (record.storageMode === 'project_local' && !consentId) ||
    (record.storageMode !== 'project_local' && consentId !== undefined)
  ) {
    fail(`${prefix}_write_consent_invalid`);
  }
  return {
    storageMode: record.storageMode,
    storageRootId: rootId,
    relativePath: path,
    ...(consentId ? { writeConsentId: consentId } : {}),
  };
}

function parseContextNoteUnsafe(value: unknown): ContextNoteV2 {
  const record = plainRecord(value, 'note_invalid');
  exactKeys(
    record,
    [
      'version',
      'id',
      'accountId',
      'mapId',
      'entityId',
      'sourceId',
      'kind',
      'title',
      'status',
      'storageMode',
      'storageRootId',
      'relativePath',
      'writeConsentId',
      'contentAssetId',
      'contentHash',
      'currentRevisionId',
      'templateId',
      'aliases',
      'tags',
      'blockIds',
      'dailyDate',
      'createdAt',
      'updatedAt',
      'deletedAt',
    ],
    'note_keys_invalid',
  );
  if (record.version !== CONTEXT_SCHEMA_VERSION) fail('note_version_invalid');
  if (!isOneOf(record.kind, CONTEXT_NOTE_KINDS)) fail('note_kind_invalid');
  if (!isOneOf(record.status, CONTEXT_NOTE_STATUSES)) fail('note_status_invalid');
  const storage = parseStorage(record, 'note');
  if (!storage.relativePath.toLocaleLowerCase('en-US').endsWith('.md')) {
    fail('note_relative_path_invalid');
  }
  const createdAt = safeInteger(record.createdAt, 'note_created_at_invalid');
  const updatedAt = safeInteger(record.updatedAt, 'note_updated_at_invalid');
  if (updatedAt < createdAt) fail('note_time_order_invalid');
  const deletedAt = optionalSafeInteger(record.deletedAt, 'note_deleted_at_invalid');
  if (
    (record.status === 'deleted' && (deletedAt === undefined || deletedAt < updatedAt)) ||
    (record.status !== 'deleted' && deletedAt !== undefined)
  ) {
    fail('note_deleted_at_invalid');
  }
  const dailyDate =
    record.dailyDate === undefined
      ? undefined
      : validCalendarDate(record.dailyDate)
        ? record.dailyDate
        : fail('note_daily_date_invalid');
  if (
    (record.kind === 'daily' && dailyDate === undefined) ||
    (record.kind !== 'daily' && dailyDate !== undefined)
  ) {
    fail('note_daily_date_invalid');
  }
  const aliases = uniqueTextList(record.aliases, 'note_alias_invalid', 'note_alias_duplicate', {
    maximumItems: 1_000,
    maximumCharacters: 500,
  });
  const tags = uniqueTextList(record.tags, 'note_tag_invalid', 'note_tag_duplicate', {
    maximumItems: 1_000,
    maximumCharacters: 200,
  });
  const blockIds = uniqueTextList(
    record.blockIds,
    'note_block_id_invalid',
    'note_block_id_duplicate',
    {
      maximumItems: 100_000,
      maximumCharacters: 100,
      validate: (entry) => BLOCK_ID.test(entry),
    },
  );
  return {
    version: CONTEXT_SCHEMA_VERSION,
    id: stableId(record.id, 'note_id_invalid'),
    accountId: stableId(record.accountId, 'note_account_id_invalid'),
    mapId: stableId(record.mapId, 'note_map_id_invalid'),
    entityId: stableId(record.entityId, 'note_entity_id_invalid'),
    sourceId: stableId(record.sourceId, 'note_source_id_invalid'),
    kind: record.kind,
    title: safeText(record.title, 'note_title_invalid', 500),
    status: record.status,
    ...storage,
    contentAssetId: stableId(record.contentAssetId, 'note_content_asset_id_invalid'),
    contentHash: checksum(record.contentHash, 'note_content_hash_invalid'),
    currentRevisionId: stableId(record.currentRevisionId, 'note_revision_id_invalid'),
    ...(record.templateId === undefined
      ? {}
      : { templateId: stableId(record.templateId, 'note_template_id_invalid') }),
    aliases,
    tags,
    blockIds,
    ...(dailyDate ? { dailyDate } : {}),
    createdAt,
    updatedAt,
    ...(deletedAt === undefined ? {} : { deletedAt }),
  };
}

function parseContextNoteRevisionUnsafe(value: unknown): ContextNoteRevisionV2 {
  const record = plainRecord(value, 'note_revision_invalid');
  exactKeys(
    record,
    [
      'version',
      'id',
      'accountId',
      'mapId',
      'noteId',
      'sequence',
      'changeKind',
      'authorSource',
      'approvalId',
      'beforeHash',
      'afterHash',
      'diffAssetId',
      'recoveryMode',
      'recoveryAssetId',
      'restoredFromRevisionId',
      'createdAt',
    ],
    'note_revision_keys_invalid',
  );
  if (record.version !== CONTEXT_SCHEMA_VERSION) fail('note_revision_version_invalid');
  if (!isOneOf(record.changeKind, CONTEXT_NOTE_CHANGE_KINDS)) {
    fail('note_revision_change_kind_invalid');
  }
  if (!isOneOf(record.authorSource, CONTEXT_NOTE_AUTHOR_SOURCES)) {
    fail('note_revision_author_source_invalid');
  }
  const sequence = safeInteger(record.sequence, 'note_revision_sequence_invalid', 1);
  const beforeHash =
    record.beforeHash === null
      ? null
      : checksum(record.beforeHash, 'note_revision_before_hash_invalid');
  if (
    (sequence === 1 && (record.changeKind !== 'created' || beforeHash !== null)) ||
    (sequence > 1 && (record.changeKind === 'created' || beforeHash === null))
  ) {
    fail('note_revision_before_hash_invalid');
  }
  const approvalId = optionalStableId(record.approvalId, 'note_revision_approval_id_invalid');
  if (
    (record.authorSource === 'jarvis_approved' && !approvalId) ||
    (record.authorSource !== 'jarvis_approved' && approvalId !== undefined)
  ) {
    fail('note_revision_approval_id_invalid');
  }
  const restoredFromRevisionId = optionalStableId(
    record.restoredFromRevisionId,
    'note_revision_restore_target_invalid',
  );
  if (
    (record.changeKind === 'restored' && !restoredFromRevisionId) ||
    (record.changeKind !== 'restored' && restoredFromRevisionId !== undefined)
  ) {
    fail('note_revision_restore_target_invalid');
  }
  const id = stableId(record.id, 'note_revision_id_invalid');
  if (restoredFromRevisionId === id) fail('note_revision_restore_target_invalid');
  if (record.recoveryMode !== 'reverse_diff' && record.recoveryMode !== 'snapshot') {
    fail('note_revision_recovery_mode_invalid');
  }
  return {
    version: CONTEXT_SCHEMA_VERSION,
    id,
    accountId: stableId(record.accountId, 'note_revision_account_id_invalid'),
    mapId: stableId(record.mapId, 'note_revision_map_id_invalid'),
    noteId: stableId(record.noteId, 'note_revision_note_id_invalid'),
    sequence,
    changeKind: record.changeKind,
    authorSource: record.authorSource,
    ...(approvalId ? { approvalId } : {}),
    beforeHash,
    afterHash: checksum(record.afterHash, 'note_revision_after_hash_invalid'),
    diffAssetId: stableId(record.diffAssetId, 'note_revision_diff_asset_id_invalid'),
    recoveryMode: record.recoveryMode,
    recoveryAssetId: stableId(record.recoveryAssetId, 'note_revision_recovery_asset_id_invalid'),
    ...(restoredFromRevisionId ? { restoredFromRevisionId } : {}),
    createdAt: safeInteger(record.createdAt, 'note_revision_created_at_invalid'),
  };
}

function parseExtractionProvider(value: unknown): ContextAssetExtractionProviderV2 {
  const record = plainRecord(value, 'asset_extraction_provider_invalid');
  exactKeys(
    record,
    ['providerId', 'modelId', 'authorization'],
    'asset_extraction_provider_keys_invalid',
  );
  if (record.authorization !== 'explicit_user' && record.authorization !== 'approved_setting') {
    fail('asset_extraction_provider_authorization_invalid');
  }
  return {
    providerId: safeText(record.providerId, 'asset_extraction_provider_id_invalid', 200),
    modelId: safeText(record.modelId, 'asset_extraction_model_id_invalid', 500),
    authorization: record.authorization,
  };
}

function parseExtraction(
  value: unknown,
  kind: ContextAssetKind,
  assetStatus: ContextAssetStatus,
): ContextAssetExtractionV2 {
  const record = plainRecord(value, 'asset_extraction_invalid');
  exactKeys(record, ['mode', 'status', 'provider'], 'asset_extraction_keys_invalid');
  if (!isOneOf(record.mode, CONTEXT_ASSET_EXTRACTION_MODES)) {
    fail('asset_extraction_mode_invalid');
  }
  if (!isOneOf(record.status, CONTEXT_ASSET_EXTRACTION_STATUSES)) {
    fail('asset_extraction_status_invalid');
  }
  if (
    (record.mode === 'none' && record.status !== 'not_requested' && record.status !== 'blocked') ||
    (record.mode !== 'none' && record.status === 'not_requested') ||
    (assetStatus === 'missing' && (record.status === 'pending' || record.status === 'ready')) ||
    (assetStatus === 'quarantined' && record.status !== 'blocked')
  ) {
    fail('asset_extraction_status_invalid');
  }
  if (
    kind === 'archive' &&
    (record.mode !== 'none' || record.status !== 'blocked' || record.provider !== undefined)
  ) {
    fail('asset_archive_extraction_invalid');
  }
  const needsProvider =
    record.mode === 'explicit_transcription' || record.mode === 'explicit_vision';
  const provider =
    record.provider === undefined ? undefined : parseExtractionProvider(record.provider);
  if ((needsProvider && !provider) || (!needsProvider && provider !== undefined)) {
    fail('asset_extraction_provider_invalid');
  }
  if (
    (record.mode === 'direct_text' &&
      !(['markdown', 'text', 'source_file'] as ContextAssetKind[]).includes(kind)) ||
    (record.mode === 'pdf_text' && kind !== 'pdf') ||
    (record.mode === 'explicit_transcription' && kind !== 'audio' && kind !== 'video') ||
    (record.mode === 'explicit_vision' && kind !== 'image')
  ) {
    fail('asset_extraction_kind_invalid');
  }
  return {
    mode: record.mode,
    status: record.status,
    ...(provider ? { provider } : {}),
  };
}

function parseContextAssetUnsafe(value: unknown): ContextAssetV2 {
  const record = plainRecord(value, 'asset_invalid');
  exactKeys(
    record,
    [
      'version',
      'id',
      'accountId',
      'mapId',
      'entityId',
      'sourceId',
      'kind',
      'status',
      'storageMode',
      'storageRootId',
      'relativePath',
      'writeConsentId',
      'fileName',
      'mimeType',
      'checksumSha256',
      'sizeBytes',
      'executable',
      'extraction',
      'thumbnailAssetId',
      'extractedTextAssetId',
      'createdAt',
      'updatedAt',
    ],
    'asset_keys_invalid',
  );
  if (record.version !== CONTEXT_SCHEMA_VERSION) fail('asset_version_invalid');
  if (!isOneOf(record.kind, CONTEXT_ASSET_KINDS)) fail('asset_kind_invalid');
  if (!isOneOf(record.status, CONTEXT_ASSET_STATUSES)) fail('asset_status_invalid');
  if (record.executable !== false) fail('asset_executable_invalid');
  const storage = parseStorage(record, 'asset');
  const fileName = safeText(record.fileName, 'asset_file_name_invalid', 500);
  if (
    fileName.includes('/') ||
    fileName.includes('\\') ||
    storage.relativePath.split('/').at(-1) !== fileName
  ) {
    fail('asset_file_name_invalid');
  }
  const mimeType = safeText(record.mimeType, 'asset_mime_type_invalid', 200);
  if (!MIME_TYPE.test(mimeType)) fail('asset_mime_type_invalid');
  if (
    (record.kind === 'markdown' && mimeType !== 'text/markdown') ||
    (record.kind === 'image' && !mimeType.startsWith('image/')) ||
    (record.kind === 'audio' && !mimeType.startsWith('audio/')) ||
    (record.kind === 'video' && !mimeType.startsWith('video/')) ||
    (record.kind === 'pdf' && mimeType !== 'application/pdf')
  ) {
    fail('asset_mime_type_invalid');
  }
  const createdAt = safeInteger(record.createdAt, 'asset_created_at_invalid');
  const updatedAt = safeInteger(record.updatedAt, 'asset_updated_at_invalid');
  if (updatedAt < createdAt) fail('asset_time_order_invalid');
  return {
    version: CONTEXT_SCHEMA_VERSION,
    id: stableId(record.id, 'asset_id_invalid'),
    accountId: stableId(record.accountId, 'asset_account_id_invalid'),
    mapId: stableId(record.mapId, 'asset_map_id_invalid'),
    entityId: stableId(record.entityId, 'asset_entity_id_invalid'),
    sourceId: stableId(record.sourceId, 'asset_source_id_invalid'),
    kind: record.kind,
    status: record.status,
    ...storage,
    fileName,
    mimeType,
    checksumSha256: checksum(record.checksumSha256, 'asset_checksum_invalid'),
    sizeBytes: safeInteger(record.sizeBytes, 'asset_size_invalid'),
    executable: false,
    extraction: parseExtraction(record.extraction, record.kind, record.status),
    ...(record.thumbnailAssetId === undefined
      ? {}
      : {
          thumbnailAssetId: stableId(record.thumbnailAssetId, 'asset_thumbnail_asset_id_invalid'),
        }),
    ...(record.extractedTextAssetId === undefined
      ? {}
      : {
          extractedTextAssetId: stableId(
            record.extractedTextAssetId,
            'asset_extracted_text_asset_id_invalid',
          ),
        }),
    createdAt,
    updatedAt,
  };
}

function detachedDeepFreeze<T>(value: T): DeepReadonly<T> {
  if (Array.isArray(value)) {
    return Object.freeze(
      value.map((entry) => detachedDeepFreeze(entry)),
    ) as unknown as DeepReadonly<T>;
  }
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const copy: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(source)) copy[key] = detachedDeepFreeze(entry);
    return Object.freeze(copy) as DeepReadonly<T>;
  }
  return value as DeepReadonly<T>;
}

function parseResult<T>(operation: () => T): ContextParseResult<T> {
  try {
    return Object.freeze({ ok: true as const, value: detachedDeepFreeze(operation()) });
  } catch (error) {
    if (error instanceof ContextContentContractFailure) {
      return Object.freeze({ ok: false as const, reason: error.reason });
    }
    return Object.freeze({ ok: false as const, reason: 'context_content_contract_invalid' });
  }
}

export function parseContextNoteV2(value: unknown): ContextParseResult<ContextNoteV2> {
  return parseResult(() => parseContextNoteUnsafe(value));
}

export function parseContextNoteRevisionV2(
  value: unknown,
): ContextParseResult<ContextNoteRevisionV2> {
  return parseResult(() => parseContextNoteRevisionUnsafe(value));
}

export function parseContextAssetV2(value: unknown): ContextParseResult<ContextAssetV2> {
  return parseResult(() => parseContextAssetUnsafe(value));
}
