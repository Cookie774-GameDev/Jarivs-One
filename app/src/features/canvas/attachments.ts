/**
 * Canvas files and attachments domain slice.
 *
 * Framework-agnostic, deterministic, side-effect-free contracts for stable,
 * account/project-scoped references to local project files and arbitrary
 * user-selected files. An attachment reference carries safe metadata only: a
 * validated source (relative project path or opaque external bookmark),
 * filename, MIME type, byte size, checksum, an optional bounded provenance
 * URL, and an optional bounded UTF-8 text preview. File bytes and base64
 * payloads are never embedded in ordinary Canvas JSON; only stable
 * references, metadata, and bounded text previews are carried. Derived
 * descriptors cover user-initiated open-in-files/open-external actions, chat
 * attachments, and Prompt Forge references. Moved and missing files are
 * recovered gracefully through stable identity plus missing and relocation
 * transitions. Every validator fails closed through the shared canvas
 * security primitives and a local `CanvasAttachmentError`.
 */
import {
  CANVAS_ID_PATTERN,
  CANVAS_MAX_TIMESTAMP,
  type CanvasOwnerId,
  type CanvasProjectId,
  type CanvasTimestamp,
} from './contracts';
import { assertSafeCanvasImportPath, sanitizeCanvasUrl } from './security';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type CanvasAttachmentErrorCode =
  | 'invalid-type'
  | 'invalid-id'
  | 'invalid-timestamp'
  | 'invalid-number'
  | 'unsupported-value'
  | 'scope-violation'
  | 'missing-attachment'
  | 'content-not-allowed';

export class CanvasAttachmentError extends Error {
  readonly code: CanvasAttachmentErrorCode;
  readonly path: string;

  constructor(code: CanvasAttachmentErrorCode, path: string, message: string) {
    super('Canvas attachment check failed (' + code + ') at ' + path + ': ' + message);
    this.name = 'CanvasAttachmentError';
    this.code = code;
    this.path = path;
  }
}

function failAttachment(code: CanvasAttachmentErrorCode, path: string, message: string): never {
  throw new CanvasAttachmentError(code, path, message);
}

// ---------------------------------------------------------------------------
// Constants and branded identifiers
// ---------------------------------------------------------------------------

export const CANVAS_ATTACHMENT_KINDS = ['project', 'external'] as const;
export type CanvasAttachmentKind = (typeof CANVAS_ATTACHMENT_KINDS)[number];

export const CANVAS_ATTACHMENT_OPEN_KINDS = ['in-files', 'external'] as const;
export type CanvasAttachmentOpenKind = (typeof CANVAS_ATTACHMENT_OPEN_KINDS)[number];

/** MIME types eligible for a bounded UTF-8 text preview. */
export const CANVAS_ATTACHMENT_TEXT_MIME_TYPES = Object.freeze([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
]);

/**
 * Project file extensions treated as safe to attach. Scriptable and
 * executable types (svg, html, exe, bat, ps1, sh, dll, and similar) are
 * excluded so the allowlist fails closed.
 */
export const CANVAS_ATTACHMENT_PROJECT_EXTENSIONS = Object.freeze([
  '.md',
  '.markdown',
  '.txt',
  '.json',
  '.csv',
  '.tsv',
  '.yml',
  '.yaml',
  '.toml',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.rs',
  '.go',
  '.java',
  '.c',
  '.h',
  '.cpp',
  '.hpp',
  '.cs',
  '.rb',
  '.php',
  '.swift',
  '.kt',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.pdf',
]);

export const CANVAS_ATTACHMENT_MAX_BYTES = 100_000_000;
export const CANVAS_ATTACHMENT_MAX_FILENAME_LENGTH = 255;
export const CANVAS_ATTACHMENT_MAX_BOOKMARK_LENGTH = 4096;
export const CANVAS_ATTACHMENT_MAX_PREVIEW_LENGTH = 4096;
export const CANVAS_ATTACHMENT_MAX_PREVIEW_LINES = 100;

const CHECKSUM_DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const MIME_TYPE_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,127}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,127}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;
const BINARY_CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const WINDOWS_RESERVED_NAME_PATTERN = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

declare const canvasAttachmentBrand: unique symbol;
export type CanvasAttachmentId = string & { [canvasAttachmentBrand]: 'CanvasAttachmentId' };

// ---------------------------------------------------------------------------
// Data contracts
// ---------------------------------------------------------------------------

export interface CanvasAttachmentChecksum {
  readonly algorithm: 'sha-256';
  readonly digest: string;
}

export interface CanvasAttachmentSource {
  readonly kind: CanvasAttachmentKind;
  readonly reference: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly checksum: CanvasAttachmentChecksum;
  readonly originUrl: string | null;
}

export interface CanvasAttachmentPreview {
  readonly text: string;
  readonly truncated: boolean;
  readonly lineCount: number;
  readonly encoding: 'utf-8';
}

export interface CanvasAttachmentReference {
  readonly id: CanvasAttachmentId;
  readonly projectId: CanvasProjectId;
  readonly ownerId: CanvasOwnerId;
  readonly source: CanvasAttachmentSource;
  readonly preview: CanvasAttachmentPreview | null;
  readonly missing: boolean;
  readonly createdAt: CanvasTimestamp;
  readonly updatedAt: CanvasTimestamp;
}

export interface CanvasAttachmentScope {
  readonly projectId: string;
  readonly ownerId: string;
}

export interface CanvasAttachmentOpenDescriptor {
  readonly attachmentId: CanvasAttachmentId;
  readonly kind: CanvasAttachmentOpenKind;
  readonly target: string;
  readonly label: string;
  readonly userInitiated: true;
}

export interface CanvasChatAttachmentDescriptor {
  readonly attachmentId: CanvasAttachmentId;
  readonly kind: CanvasAttachmentKind;
  readonly filename: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly missing: boolean;
  readonly summary: string;
  readonly preview: CanvasAttachmentPreview | null;
}

export interface CanvasPromptForgeReferenceDescriptor {
  readonly attachmentId: CanvasAttachmentId;
  readonly token: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly preview: CanvasAttachmentPreview | null;
}

export interface CanvasAttachmentRelocation {
  readonly kind?: unknown;
  readonly reference: unknown;
  readonly filename?: unknown;
}

// ---------------------------------------------------------------------------
// Local validation helpers
// ---------------------------------------------------------------------------

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
    Object.freeze(value);
  } else if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      failAttachment('unsupported-value', path + '.' + key, 'unexpected field "' + key + '"');
    }
  }
}

function assertAttachmentId(value: unknown, path: string): string {
  if (typeof value !== 'string' || !CANVAS_ID_PATTERN.test(value)) {
    failAttachment(
      'invalid-id',
      path,
      'expected a stable id matching /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/',
    );
  }
  return value;
}

function assertAttachmentTimestamp(value: unknown, path: string): CanvasTimestamp {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    failAttachment('invalid-timestamp', path, 'expected an integer timestamp');
  }
  if (value < 0 || value > CANVAS_MAX_TIMESTAMP) {
    failAttachment(
      'invalid-timestamp',
      path,
      'timestamp out of range [0, ' + CANVAS_MAX_TIMESTAMP + ']',
    );
  }
  return value;
}

function assertByteSize(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    failAttachment('invalid-number', path, 'expected a safe integer byte size');
  }
  if (value <= 0 || value > CANVAS_ATTACHMENT_MAX_BYTES) {
    failAttachment(
      'invalid-number',
      path,
      'byte size out of range [1, ' + CANVAS_ATTACHMENT_MAX_BYTES + ']',
    );
  }
  return value;
}

function normalizeAttachmentFilename(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    failAttachment('invalid-type', path, 'expected a string filename');
  }
  if (value.length === 0) failAttachment('unsupported-value', path, 'filename is empty');
  if (value.length > CANVAS_ATTACHMENT_MAX_FILENAME_LENGTH) {
    failAttachment('unsupported-value', path, 'filename exceeds the length limit');
  }
  if (CONTROL_CHARACTER_PATTERN.test(value)) {
    failAttachment('unsupported-value', path, 'filename contains a control character');
  }
  if (value.includes('/') || value.includes(String.fromCharCode(92))) {
    failAttachment('unsupported-value', path, 'filename must not contain a path separator');
  }
  if (value === '..' || value === '.') {
    failAttachment('unsupported-value', path, 'filename must not be a traversal segment');
  }
  if (WINDOWS_RESERVED_NAME_PATTERN.test(value)) {
    failAttachment('unsupported-value', path, 'filename is a reserved device name');
  }
  if (value.endsWith(' ') || value.endsWith('.')) {
    failAttachment('unsupported-value', path, 'filename has a trailing space or dot');
  }
  return value;
}

function normalizeChecksum(input: unknown, path: string): CanvasAttachmentChecksum {
  if (!isPlainObject(input)) failAttachment('invalid-type', path, 'expected a checksum object');
  assertExactKeys(input, new Set(['algorithm', 'digest']), path);
  if (input.algorithm !== 'sha-256') {
    failAttachment('unsupported-value', path + '.algorithm', 'unsupported checksum algorithm');
  }
  if (typeof input.digest !== 'string' || !CHECKSUM_DIGEST_PATTERN.test(input.digest)) {
    failAttachment(
      'unsupported-value',
      path + '.digest',
      'expected a 64-character lowercase sha-256 hex digest',
    );
  }
  return { algorithm: 'sha-256', digest: input.digest };
}

function normalizeMimeType(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    failAttachment('invalid-type', path, 'expected a string MIME type');
  }
  const normalized = value.trim().toLowerCase();
  if (!MIME_TYPE_PATTERN.test(normalized)) {
    failAttachment('unsupported-value', path, 'unsupported MIME type: ' + normalized);
  }
  return normalized;
}

function normalizeBookmark(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    failAttachment('invalid-type', path, 'expected a string bookmark');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) failAttachment('unsupported-value', path, 'bookmark is empty');
  if (trimmed.length > CANVAS_ATTACHMENT_MAX_BOOKMARK_LENGTH) {
    failAttachment('unsupported-value', path, 'bookmark exceeds the length limit');
  }
  if (CONTROL_CHARACTER_PATTERN.test(trimmed)) {
    failAttachment('unsupported-value', path, 'bookmark contains a control character');
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Source descriptor
// ---------------------------------------------------------------------------

const SOURCE_KEYS = new Set([
  'kind',
  'reference',
  'filename',
  'mimeType',
  'byteSize',
  'checksum',
  'originUrl',
]);

function normalizeSource(input: unknown, path: string): CanvasAttachmentSource {
  if (!isPlainObject(input)) failAttachment('invalid-type', path, 'expected a source object');
  assertExactKeys(input, SOURCE_KEYS, path);

  const kind = input.kind;
  if (typeof kind !== 'string' || !CANVAS_ATTACHMENT_KINDS.includes(kind as CanvasAttachmentKind)) {
    failAttachment('unsupported-value', path + '.kind', 'unsupported attachment kind');
  }
  const attachmentKind = kind as CanvasAttachmentKind;

  const reference =
    attachmentKind === 'project'
      ? assertSafeCanvasImportPath(
          input.reference,
          { allowedExtensions: CANVAS_ATTACHMENT_PROJECT_EXTENSIONS },
          path + '.reference',
        )
      : normalizeBookmark(input.reference, path + '.reference');

  const filename = normalizeAttachmentFilename(input.filename, path + '.filename');
  const mimeType = normalizeMimeType(input.mimeType, path + '.mimeType');
  const byteSize = assertByteSize(input.byteSize, path + '.byteSize');
  const checksum = normalizeChecksum(input.checksum, path + '.checksum');

  const originUrl =
    input.originUrl === null || input.originUrl === undefined
      ? null
      : sanitizeCanvasUrl(input.originUrl, path + '.originUrl');

  return { kind: attachmentKind, reference, filename, mimeType, byteSize, checksum, originUrl };
}

// ---------------------------------------------------------------------------
// Bounded text previews
// ---------------------------------------------------------------------------

const PREVIEW_KEYS = new Set(['text', 'truncated', 'lineCount', 'encoding']);

function assertTextPreviewEligible(mimeType: string, path: string): void {
  if (!CANVAS_ATTACHMENT_TEXT_MIME_TYPES.includes(mimeType)) {
    failAttachment('content-not-allowed', path, 'text previews require a text MIME type');
  }
}

function normalizePreview(input: unknown, mimeType: string, path: string): CanvasAttachmentPreview {
  assertTextPreviewEligible(mimeType, path);
  if (!isPlainObject(input)) failAttachment('invalid-type', path, 'expected a preview object');
  assertExactKeys(input, PREVIEW_KEYS, path);
  if (typeof input.text !== 'string') {
    failAttachment('invalid-type', path + '.text', 'expected a string');
  }
  if (input.text.length > CANVAS_ATTACHMENT_MAX_PREVIEW_LENGTH) {
    failAttachment('unsupported-value', path + '.text', 'preview exceeds the length limit');
  }
  if (BINARY_CONTROL_PATTERN.test(input.text)) {
    failAttachment(
      'content-not-allowed',
      path + '.text',
      'preview contains binary control characters',
    );
  }
  if (typeof input.truncated !== 'boolean') {
    failAttachment('invalid-type', path + '.truncated', 'expected a boolean');
  }
  if (typeof input.lineCount !== 'number' || !Number.isSafeInteger(input.lineCount)) {
    failAttachment('invalid-number', path + '.lineCount', 'expected a safe integer');
  }
  if (input.lineCount < 0 || input.lineCount > CANVAS_ATTACHMENT_MAX_PREVIEW_LINES) {
    failAttachment('invalid-number', path + '.lineCount', 'line count out of range');
  }
  if (input.encoding !== 'utf-8') {
    failAttachment('unsupported-value', path + '.encoding', 'expected utf-8 encoding');
  }
  const preview: CanvasAttachmentPreview = {
    text: input.text,
    truncated: input.truncated,
    lineCount: input.lineCount,
    encoding: 'utf-8',
  };
  return deepFreeze(preview);
}

export function createAttachmentPreview(
  rawText: unknown,
  mimeType: unknown,
  path = 'preview',
): CanvasAttachmentPreview {
  const mime = normalizeMimeType(mimeType, path + '.mimeType');
  assertTextPreviewEligible(mime, path);
  if (typeof rawText !== 'string') {
    failAttachment('invalid-type', path + '.text', 'expected a string');
  }
  if (BINARY_CONTROL_PATTERN.test(rawText)) {
    failAttachment(
      'content-not-allowed',
      path + '.text',
      'preview contains binary control characters',
    );
  }
  const newline = String.fromCharCode(10);
  const lengthTruncated = rawText.length > CANVAS_ATTACHMENT_MAX_PREVIEW_LENGTH;
  const boundedText = lengthTruncated
    ? rawText.slice(0, CANVAS_ATTACHMENT_MAX_PREVIEW_LENGTH)
    : rawText;
  const allLines = boundedText.split(newline);
  const lineTruncated = allLines.length > CANVAS_ATTACHMENT_MAX_PREVIEW_LINES;
  const keptLines = lineTruncated
    ? allLines.slice(0, CANVAS_ATTACHMENT_MAX_PREVIEW_LINES)
    : allLines;
  const preview: CanvasAttachmentPreview = {
    text: keptLines.join(newline),
    truncated: lengthTruncated || lineTruncated,
    lineCount: boundedText.length === 0 ? 0 : keptLines.length,
    encoding: 'utf-8',
  };
  return deepFreeze(preview);
}

// ---------------------------------------------------------------------------
// Reference validation
// ---------------------------------------------------------------------------

const REFERENCE_KEYS = new Set([
  'id',
  'projectId',
  'ownerId',
  'source',
  'preview',
  'missing',
  'createdAt',
  'updatedAt',
]);

export function validateCanvasAttachment(input: unknown): CanvasAttachmentReference {
  if (!isPlainObject(input)) failAttachment('invalid-type', 'attachment', 'expected an object');
  assertExactKeys(input, REFERENCE_KEYS, 'attachment');

  const id = assertAttachmentId(input.id, 'attachment.id') as CanvasAttachmentId;
  const projectId = assertAttachmentId(input.projectId, 'attachment.projectId') as CanvasProjectId;
  const ownerId = assertAttachmentId(input.ownerId, 'attachment.ownerId') as CanvasOwnerId;
  const source = normalizeSource(input.source, 'attachment.source');

  const preview =
    input.preview === null || input.preview === undefined
      ? null
      : normalizePreview(input.preview, source.mimeType, 'attachment.preview');

  if (typeof input.missing !== 'boolean') {
    failAttachment('invalid-type', 'attachment.missing', 'expected a boolean');
  }
  const missing = input.missing;
  const createdAt = assertAttachmentTimestamp(input.createdAt, 'attachment.createdAt');
  const updatedAt = assertAttachmentTimestamp(input.updatedAt, 'attachment.updatedAt');
  if (updatedAt < createdAt) {
    failAttachment('invalid-timestamp', 'attachment.updatedAt', 'updatedAt precedes createdAt');
  }

  const reference: CanvasAttachmentReference = {
    id,
    projectId,
    ownerId,
    source,
    preview,
    missing,
    createdAt,
    updatedAt,
  };
  return deepFreeze(reference);
}

export function isCanvasAttachment(value: unknown): value is CanvasAttachmentReference {
  try {
    validateCanvasAttachment(value);
    return true;
  } catch (error) {
    if (error instanceof CanvasAttachmentError) return false;
    if (error instanceof Error && error.name === 'CanvasSecurityError') return false;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Missing state, moved recovery, and scope isolation
// ---------------------------------------------------------------------------

export function markAttachmentMissing(
  reference: CanvasAttachmentReference,
): CanvasAttachmentReference {
  if (reference.missing) return reference;
  const next: CanvasAttachmentReference = { ...reference, missing: true };
  return deepFreeze(next);
}

export function restoreAttachment(reference: CanvasAttachmentReference): CanvasAttachmentReference {
  if (!reference.missing) return reference;
  const next: CanvasAttachmentReference = { ...reference, missing: false };
  return deepFreeze(next);
}

export function relocateAttachment(
  reference: CanvasAttachmentReference,
  relocation: CanvasAttachmentRelocation,
  now: unknown,
): CanvasAttachmentReference {
  if (!isPlainObject(reference)) {
    failAttachment('invalid-type', 'attachment', 'expected an attachment reference');
  }
  if (!isPlainObject(relocation)) {
    failAttachment('invalid-type', 'relocation', 'expected a relocation object');
  }
  const kind = relocation.kind === undefined ? reference.source.kind : relocation.kind;
  if (typeof kind !== 'string' || !CANVAS_ATTACHMENT_KINDS.includes(kind as CanvasAttachmentKind)) {
    failAttachment('unsupported-value', 'relocation.kind', 'unsupported attachment kind');
  }
  const nextKind = kind as CanvasAttachmentKind;
  const nextReference =
    nextKind === 'project'
      ? assertSafeCanvasImportPath(
          relocation.reference,
          { allowedExtensions: CANVAS_ATTACHMENT_PROJECT_EXTENSIONS },
          'relocation.reference',
        )
      : normalizeBookmark(relocation.reference, 'relocation.reference');
  const nextFilename =
    relocation.filename === undefined
      ? reference.source.filename
      : normalizeAttachmentFilename(relocation.filename, 'relocation.filename');
  const updatedAt = assertAttachmentTimestamp(now, 'relocation.now');
  if (updatedAt < reference.createdAt) {
    failAttachment('invalid-timestamp', 'relocation.now', 'relocation precedes createdAt');
  }
  const source: CanvasAttachmentSource = {
    ...reference.source,
    kind: nextKind,
    reference: nextReference,
    filename: nextFilename,
  };
  const next: CanvasAttachmentReference = { ...reference, source, missing: false, updatedAt };
  return deepFreeze(next);
}

export function assertAttachmentScope(
  reference: CanvasAttachmentReference,
  scope: CanvasAttachmentScope,
): CanvasAttachmentReference {
  assertAttachmentId(scope.projectId, 'scope.projectId');
  assertAttachmentId(scope.ownerId, 'scope.ownerId');
  if (reference.projectId !== scope.projectId || reference.ownerId !== scope.ownerId) {
    failAttachment(
      'scope-violation',
      'attachment',
      'reference is outside the requested project/owner scope',
    );
  }
  return reference;
}

export function isAttachmentInScope(
  reference: CanvasAttachmentReference,
  scope: CanvasAttachmentScope,
): boolean {
  try {
    assertAttachmentScope(reference, scope);
    return true;
  } catch (error) {
    if (error instanceof CanvasAttachmentError) return false;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Derived descriptors (open actions, chat, Prompt Forge)
// ---------------------------------------------------------------------------

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  const kb = bytes / 1024;
  if (kb < 1024) return Math.round(kb * 10) / 10 + ' KB';
  const mb = kb / 1024;
  return Math.round(mb * 10) / 10 + ' MB';
}

function buildChatSummary(reference: CanvasAttachmentReference): string {
  const base =
    reference.source.filename +
    ' - ' +
    reference.source.mimeType +
    ' - ' +
    formatByteSize(reference.source.byteSize);
  return reference.missing ? base + ' - missing' : base;
}

export function describeOpenAction(
  reference: CanvasAttachmentReference,
  kind: unknown,
): CanvasAttachmentOpenDescriptor {
  if (!isPlainObject(reference)) {
    failAttachment('invalid-type', 'attachment', 'expected an attachment reference');
  }
  if (
    typeof kind !== 'string' ||
    !CANVAS_ATTACHMENT_OPEN_KINDS.includes(kind as CanvasAttachmentOpenKind)
  ) {
    failAttachment('unsupported-value', 'kind', 'unsupported open action kind');
  }
  if (reference.missing) {
    failAttachment('missing-attachment', 'attachment', 'cannot open a missing attachment');
  }
  const descriptor: CanvasAttachmentOpenDescriptor = {
    attachmentId: reference.id,
    kind: kind as CanvasAttachmentOpenKind,
    target: reference.source.reference,
    label: reference.source.filename,
    userInitiated: true,
  };
  return deepFreeze(descriptor);
}

export function describeChatAttachment(
  reference: CanvasAttachmentReference,
): CanvasChatAttachmentDescriptor {
  if (!isPlainObject(reference)) {
    failAttachment('invalid-type', 'attachment', 'expected an attachment reference');
  }
  const descriptor: CanvasChatAttachmentDescriptor = {
    attachmentId: reference.id,
    kind: reference.source.kind,
    filename: reference.source.filename,
    mimeType: reference.source.mimeType,
    byteSize: reference.source.byteSize,
    missing: reference.missing,
    summary: buildChatSummary(reference),
    preview: reference.preview,
  };
  return deepFreeze(descriptor);
}

export function describePromptForgeReference(
  reference: CanvasAttachmentReference,
): CanvasPromptForgeReferenceDescriptor {
  if (!isPlainObject(reference)) {
    failAttachment('invalid-type', 'attachment', 'expected an attachment reference');
  }
  if (reference.missing) {
    failAttachment('missing-attachment', 'attachment', 'cannot reference a missing attachment');
  }
  const descriptor: CanvasPromptForgeReferenceDescriptor = {
    attachmentId: reference.id,
    token: '@attachment:' + reference.id,
    filename: reference.source.filename,
    mimeType: reference.source.mimeType,
    preview: reference.preview,
  };
  return deepFreeze(descriptor);
}
