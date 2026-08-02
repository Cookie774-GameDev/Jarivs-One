/**
 * Canvas linked VibeSpace content and linked document domain slice.
 *
 * Framework-agnostic, deterministic, side-effect-free contracts for linking
 * canvas objects to other VibeSpace resources (chat, message, agent, skill,
 * context map, project file, terminal pane, task, schedule item, custom tool,
 * plugin, MCP server, model, or another canvas) and for live linked document
 * cards (product requirements, release checklist, security plan, user
 * feedback, technical architecture). This module never reads from or writes
 * to any external system: it validates bounded reference metadata, projects
 * type-specific icon and status, tracks refresh/version/stale state, and
 * emits explicit user-gesture open, snapshot, and same-source edit
 * descriptors. Every factory and transition fails closed with a
 * CanvasLinkedContentError and returns deeply frozen values. Full external
 * records are never copied by default; snapshots capture only bounded
 * metadata when explicitly requested.
 */
import {
  CANVAS_ID_PATTERN,
  CANVAS_MAX_TIMESTAMP,
  CANVAS_MAX_TITLE_LENGTH,
  type CanvasOwnerId,
  type CanvasProjectId,
  type CanvasTimestamp,
} from './contracts';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type CanvasLinkedContentErrorCode =
  | 'invalid-type'
  | 'invalid-id'
  | 'invalid-timestamp'
  | 'invalid-number'
  | 'unsupported-value'
  | 'scope-violation'
  | 'permission-denied'
  | 'duplicate-reference';

export class CanvasLinkedContentError extends Error {
  readonly code: CanvasLinkedContentErrorCode;
  readonly path: string;

  constructor(code: CanvasLinkedContentErrorCode, path: string, message: string) {
    super('Canvas linked content check failed (' + code + ') at ' + path + ': ' + message);
    this.name = 'CanvasLinkedContentError';
    this.code = code;
    this.path = path;
  }
}

function fail(code: CanvasLinkedContentErrorCode, path: string, message: string): never {
  throw new CanvasLinkedContentError(code, path, message);
}

// ---------------------------------------------------------------------------
// Constants and branded identifiers
// ---------------------------------------------------------------------------

export const CANVAS_LINKED_SOURCE_KINDS = Object.freeze([
  'chat',
  'message',
  'agent',
  'skill',
  'context-map',
  'project-file',
  'terminal-pane',
  'task',
  'schedule-item',
  'custom-tool',
  'plugin',
  'mcp-server',
  'model',
  'canvas',
] as const);
export type CanvasLinkedSourceKind = (typeof CANVAS_LINKED_SOURCE_KINDS)[number];

export const CANVAS_LINKED_DOCUMENT_KINDS = Object.freeze([
  'product-requirements',
  'release-checklist',
  'security-plan',
  'user-feedback',
  'technical-architecture',
] as const);
export type CanvasLinkedDocumentKind = (typeof CANVAS_LINKED_DOCUMENT_KINDS)[number];

export const CANVAS_LINKED_STATUSES = Object.freeze([
  'active',
  'idle',
  'stale',
  'unavailable',
  'snapshot',
] as const);
export type CanvasLinkedStatus = (typeof CANVAS_LINKED_STATUSES)[number];

export const CANVAS_LINKED_SOURCE_ICONS: Readonly<Record<CanvasLinkedSourceKind, string>> =
  Object.freeze({
    chat: 'messages-square',
    message: 'message',
    agent: 'bot',
    skill: 'sparkles',
    'context-map': 'map',
    'project-file': 'file',
    'terminal-pane': 'terminal',
    task: 'check-square',
    'schedule-item': 'calendar-clock',
    'custom-tool': 'wrench',
    plugin: 'puzzle',
    'mcp-server': 'server',
    model: 'cpu',
    canvas: 'layout-dashboard',
  });

export const CANVAS_LINKED_SOURCE_DEFAULT_STATUS: Readonly<
  Record<CanvasLinkedSourceKind, CanvasLinkedStatus>
> = Object.freeze({
  chat: 'active',
  message: 'active',
  agent: 'idle',
  skill: 'active',
  'context-map': 'active',
  'project-file': 'active',
  'terminal-pane': 'idle',
  task: 'active',
  'schedule-item': 'idle',
  'custom-tool': 'active',
  plugin: 'active',
  'mcp-server': 'idle',
  model: 'active',
  canvas: 'active',
});

export const CANVAS_LINKED_MAX_SUMMARY_LENGTH = 500;
export const CANVAS_LINKED_MAX_EXCERPT_LENGTH = 2000;
export const CANVAS_LINKED_MAX_INTENT_LENGTH = 2000;
export const CANVAS_LINKED_MAX_PERMISSION_EVIDENCE_LENGTH = 1000;
export const CANVAS_LINKED_MAX_SOURCE_ID_LENGTH = 128;
export const CANVAS_LINKED_MAX_CAPTURED_FIELDS = 32;
export const CANVAS_LINKED_MAX_CAPTURED_FIELD_NAME_LENGTH = 64;
export const CANVAS_LINKED_MAX_ICON_LENGTH = 48;

const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/;

declare const linkedContentBrand: unique symbol;
declare const linkedDocumentBrand: unique symbol;
declare const linkedSnapshotBrand: unique symbol;

export type CanvasLinkedContentId = string & { [linkedContentBrand]: 'CanvasLinkedContentId' };
export type CanvasLinkedDocumentId = string & { [linkedDocumentBrand]: 'CanvasLinkedDocumentId' };
export type CanvasLinkedSnapshotId = string & { [linkedSnapshotBrand]: 'CanvasLinkedSnapshotId' };

// ---------------------------------------------------------------------------
// Data contracts
// ---------------------------------------------------------------------------

export interface CanvasLinkedScope {
  readonly projectId: string;
  readonly ownerId: string;
}

export interface CanvasLinkedPreview {
  readonly summary: string;
  readonly excerpt: string;
  readonly capturedAt: CanvasTimestamp;
}

export interface CanvasLinkedSnapshot {
  readonly id: CanvasLinkedSnapshotId;
  readonly title: string;
  readonly summary: string;
  readonly capturedFields: readonly string[];
  readonly capturedAt: CanvasTimestamp;
}

export interface CanvasLinkedOpenAction {
  readonly kind: 'vibespace-resource';
  readonly resourceKind: CanvasLinkedSourceKind;
  readonly resourceId: string;
  readonly requiresUserGesture: true;
}

export interface CanvasLinkedDocumentOpenAction {
  readonly kind: 'vibespace-document';
  readonly documentKind: CanvasLinkedDocumentKind;
  readonly resourceId: string;
  readonly requiresUserGesture: true;
}
export interface CanvasLinkedContent {
  readonly id: CanvasLinkedContentId;
  readonly kind: CanvasLinkedSourceKind;
  readonly projectId: CanvasProjectId;
  readonly ownerId: CanvasOwnerId;
  readonly sourceId: string;
  readonly title: string;
  readonly icon: string;
  readonly status: CanvasLinkedStatus;
  readonly available: boolean;
  readonly preview: CanvasLinkedPreview | null;
  readonly snapshot: CanvasLinkedSnapshot | null;
  readonly openAction: CanvasLinkedOpenAction;
  readonly createdAt: CanvasTimestamp;
  readonly updatedAt: CanvasTimestamp;
}

export interface CanvasLinkedDocument {
  readonly id: CanvasLinkedDocumentId;
  readonly documentKind: CanvasLinkedDocumentKind;
  readonly projectId: CanvasProjectId;
  readonly ownerId: CanvasOwnerId;
  readonly sourceId: string;
  readonly sourceVersion: number;
  readonly title: string;
  readonly summary: string;
  readonly excerpt: string;
  readonly editable: boolean;
  readonly permissionEvidence: string | null;
  readonly status: CanvasLinkedStatus;
  readonly stale: boolean;
  readonly snapshot: CanvasLinkedSnapshot | null;
  readonly openAction: CanvasLinkedDocumentOpenAction;
  readonly lastRefreshedAt: CanvasTimestamp;
  readonly createdAt: CanvasTimestamp;
  readonly updatedAt: CanvasTimestamp;
}

export interface CanvasLinkedDocumentRefreshResult {
  readonly document: CanvasLinkedDocument;
  readonly changed: boolean;
  readonly previousVersion: number;
  readonly nextVersion: number;
}

export interface CanvasLinkedDocumentEditRequest {
  readonly kind: 'source-edit';
  readonly documentId: CanvasLinkedDocumentId;
  readonly documentKind: CanvasLinkedDocumentKind;
  readonly sourceId: string;
  readonly intent: string;
  readonly permissionEvidence: string;
  readonly updatesSameSource: true;
  readonly requestedAt: CanvasTimestamp;
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
      fail('unsupported-value', path + '.' + key, 'unexpected field "' + key + '"');
    }
  }
}

function assertLinkedId(value: unknown, path: string): string {
  if (typeof value !== 'string' || !CANVAS_ID_PATTERN.test(value)) {
    fail('invalid-id', path, 'expected a stable id matching /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/');
  }
  return value;
}

function assertTimestamp(value: unknown, path: string): CanvasTimestamp {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    fail('invalid-timestamp', path, 'expected an integer timestamp');
  }
  if (value < 0 || value > CANVAS_MAX_TIMESTAMP) {
    fail('invalid-timestamp', path, 'timestamp out of range [0, ' + CANVAS_MAX_TIMESTAMP + ']');
  }
  return value;
}
function assertBoundedText(value: unknown, path: string, max: number): string {
  if (typeof value !== 'string') fail('invalid-type', path, 'expected a string');
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max || CONTROL_CHAR_PATTERN.test(trimmed)) {
    fail('unsupported-value', path, 'expected non-empty printable text up to ' + max + ' chars');
  }
  return trimmed;
}

function assertOptionalBoundedText(value: unknown, path: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') fail('invalid-type', path, 'expected a string');
  const trimmed = value.trim();
  if (trimmed.length > max || CONTROL_CHAR_PATTERN.test(trimmed)) {
    fail('unsupported-value', path, 'expected printable text up to ' + max + ' chars');
  }
  return trimmed;
}

function assertSourceId(value: unknown, path: string): string {
  if (typeof value !== 'string') fail('invalid-type', path, 'expected a string');
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > CANVAS_LINKED_MAX_SOURCE_ID_LENGTH ||
    CONTROL_CHAR_PATTERN.test(trimmed)
  ) {
    fail(
      'unsupported-value',
      path,
      'expected a non-empty source id up to ' + CANVAS_LINKED_MAX_SOURCE_ID_LENGTH + ' chars',
    );
  }
  return trimmed;
}

function assertScopeId(value: unknown, path: string): string {
  if (typeof value !== 'string' || !CANVAS_ID_PATTERN.test(value)) {
    fail('invalid-id', path, 'expected a stable scope id');
  }
  return value;
}
function assertSourceKind(value: unknown, path: string): CanvasLinkedSourceKind {
  if (
    typeof value !== 'string' ||
    !CANVAS_LINKED_SOURCE_KINDS.includes(value as CanvasLinkedSourceKind)
  ) {
    fail('unsupported-value', path, 'unsupported source kind');
  }
  return value as CanvasLinkedSourceKind;
}

function assertDocumentKind(value: unknown, path: string): CanvasLinkedDocumentKind {
  if (
    typeof value !== 'string' ||
    !CANVAS_LINKED_DOCUMENT_KINDS.includes(value as CanvasLinkedDocumentKind)
  ) {
    fail('unsupported-value', path, 'unsupported document kind');
  }
  return value as CanvasLinkedDocumentKind;
}

function assertStatus(value: unknown, path: string): CanvasLinkedStatus {
  if (typeof value !== 'string' || !CANVAS_LINKED_STATUSES.includes(value as CanvasLinkedStatus)) {
    fail('unsupported-value', path, 'unsupported status');
  }
  return value as CanvasLinkedStatus;
}

function assertVersion(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    fail('invalid-number', path, 'expected an integer version');
  }
  if (value < 0) fail('invalid-number', path, 'version must be non-negative');
  return value;
}

function assertOptionalPreview(value: unknown, path: string): CanvasLinkedPreview | null {
  if (value === undefined || value === null) return null;
  if (!isPlainObject(value)) fail('invalid-type', path, 'expected a preview object');
  assertExactKeys(value, new Set(['summary', 'excerpt', 'capturedAt']), path);
  return deepFreeze({
    summary: assertBoundedText(value.summary, path + '.summary', CANVAS_LINKED_MAX_SUMMARY_LENGTH),
    excerpt:
      assertOptionalBoundedText(
        value.excerpt,
        path + '.excerpt',
        CANVAS_LINKED_MAX_EXCERPT_LENGTH,
      ) ?? '',
    capturedAt: assertTimestamp(value.capturedAt, path + '.capturedAt'),
  });
}

function assertSnapshot(value: unknown, path: string): CanvasLinkedSnapshot {
  if (!isPlainObject(value)) fail('invalid-type', path, 'expected a snapshot object');
  assertExactKeys(value, new Set(['id', 'title', 'summary', 'capturedFields', 'capturedAt']), path);
  if (
    !Array.isArray(value.capturedFields) ||
    value.capturedFields.length > CANVAS_LINKED_MAX_CAPTURED_FIELDS
  ) {
    fail('unsupported-value', path + '.capturedFields', 'expected a bounded field list');
  }
  const capturedFields = value.capturedFields.map((field, index) =>
    assertBoundedText(
      field,
      path + '.capturedFields[' + index + ']',
      CANVAS_LINKED_MAX_CAPTURED_FIELD_NAME_LENGTH,
    ),
  );
  if (new Set(capturedFields).size !== capturedFields.length) {
    fail('duplicate-reference', path + '.capturedFields', 'field names must be unique');
  }
  return deepFreeze({
    id: assertLinkedId(value.id, path + '.id') as CanvasLinkedSnapshotId,
    title: assertBoundedText(value.title, path + '.title', CANVAS_MAX_TITLE_LENGTH),
    summary: assertBoundedText(value.summary, path + '.summary', CANVAS_LINKED_MAX_SUMMARY_LENGTH),
    capturedFields,
    capturedAt: assertTimestamp(value.capturedAt, path + '.capturedAt'),
  });
}

function statusFor(
  snapshot: CanvasLinkedSnapshot | null,
  available: boolean,
  stale: boolean,
  fallback: CanvasLinkedStatus,
): CanvasLinkedStatus {
  if (snapshot !== null) return 'snapshot';
  if (!available) return 'unavailable';
  if (stale) return 'stale';
  return fallback;
}

export function linkedSourceIcon(kind: CanvasLinkedSourceKind): string {
  return CANVAS_LINKED_SOURCE_ICONS[assertSourceKind(kind, 'linked.kind')];
}

export function linkedSourceDefaultStatus(kind: CanvasLinkedSourceKind): CanvasLinkedStatus {
  return CANVAS_LINKED_SOURCE_DEFAULT_STATUS[assertSourceKind(kind, 'linked.kind')];
}

export function createLinkedContent(input: unknown): CanvasLinkedContent {
  if (!isPlainObject(input)) fail('invalid-type', 'linkedContent', 'expected an object');
  assertExactKeys(
    input,
    new Set(['id', 'kind', 'projectId', 'ownerId', 'sourceId', 'title', 'preview', 'createdAt']),
    'linkedContent',
  );
  const kind = assertSourceKind(input.kind, 'linkedContent.kind');
  const createdAt = assertTimestamp(input.createdAt, 'linkedContent.createdAt');
  const snapshot = null;
  return deepFreeze({
    id: assertLinkedId(input.id, 'linkedContent.id') as CanvasLinkedContentId,
    kind,
    projectId: assertScopeId(input.projectId, 'linkedContent.projectId') as CanvasProjectId,
    ownerId: assertScopeId(input.ownerId, 'linkedContent.ownerId') as CanvasOwnerId,
    sourceId: assertSourceId(input.sourceId, 'linkedContent.sourceId'),
    title: assertBoundedText(input.title, 'linkedContent.title', CANVAS_MAX_TITLE_LENGTH),
    icon: linkedSourceIcon(kind),
    status: linkedSourceDefaultStatus(kind),
    available: true,
    preview: assertOptionalPreview(input.preview, 'linkedContent.preview'),
    snapshot,
    openAction: {
      kind: 'vibespace-resource' as const,
      resourceKind: kind,
      resourceId: assertSourceId(input.sourceId, 'linkedContent.sourceId'),
      requiresUserGesture: true as const,
    },
    createdAt,
    updatedAt: createdAt,
  });
}

export function validateLinkedContent(input: unknown): CanvasLinkedContent {
  if (!isPlainObject(input) || !Object.prototype.hasOwnProperty.call(input, 'icon')) {
    return createLinkedContent(input);
  }
  assertExactKeys(
    input,
    new Set([
      'id',
      'kind',
      'projectId',
      'ownerId',
      'sourceId',
      'title',
      'icon',
      'status',
      'available',
      'preview',
      'snapshot',
      'openAction',
      'createdAt',
      'updatedAt',
    ]),
    'linkedContent',
  );
  const created = createLinkedContent({
    id: input.id,
    kind: input.kind,
    projectId: input.projectId,
    ownerId: input.ownerId,
    sourceId: input.sourceId,
    title: input.title,
    preview: input.preview,
    createdAt: input.createdAt,
  });
  const snapshot =
    input.snapshot === null ? null : assertSnapshot(input.snapshot, 'linkedContent.snapshot');
  const available =
    typeof input.available === 'boolean'
      ? input.available
      : fail('invalid-type', 'linkedContent.available', 'expected a boolean');
  const updatedAt = assertTimestamp(input.updatedAt, 'linkedContent.updatedAt');
  const status = assertStatus(input.status, 'linkedContent.status');
  const expectedStatus = statusFor(
    snapshot,
    available,
    false,
    linkedSourceDefaultStatus(created.kind),
  );
  if (
    input.icon !== linkedSourceIcon(created.kind) ||
    status !== expectedStatus ||
    updatedAt < created.createdAt
  ) {
    fail(
      'unsupported-value',
      'linkedContent',
      'derived fields do not match the linked source state',
    );
  }
  if (
    !isPlainObject(input.openAction) ||
    input.openAction.kind !== 'vibespace-resource' ||
    input.openAction.resourceKind !== created.kind ||
    input.openAction.resourceId !== created.sourceId ||
    input.openAction.requiresUserGesture !== true
  ) {
    fail(
      'unsupported-value',
      'linkedContent.openAction',
      'open action must target the same linked source',
    );
  }
  return deepFreeze({ ...created, available, status, snapshot, updatedAt });
}

export function isLinkedContent(value: unknown): value is CanvasLinkedContent {
  try {
    if (!isPlainObject(value) || !Object.prototype.hasOwnProperty.call(value, 'icon')) return false;
    assertSourceKind(value.kind, 'linkedContent.kind');
    assertScopeId(value.projectId, 'linkedContent.projectId');
    assertScopeId(value.ownerId, 'linkedContent.ownerId');
    assertLinkedId(value.id, 'linkedContent.id');
    assertSourceId(value.sourceId, 'linkedContent.sourceId');
    assertBoundedText(value.title, 'linkedContent.title', CANVAS_MAX_TITLE_LENGTH);
    const action = value.openAction;
    return (
      value.icon === linkedSourceIcon(value.kind as CanvasLinkedSourceKind) &&
      typeof value.available === 'boolean' &&
      CANVAS_LINKED_STATUSES.includes(value.status as CanvasLinkedStatus) &&
      isPlainObject(action) &&
      action.kind === 'vibespace-resource' &&
      action.resourceKind === value.kind &&
      action.resourceId === value.sourceId &&
      action.requiresUserGesture === true
    );
  } catch (error) {
    if (error instanceof CanvasLinkedContentError) return false;
    throw error;
  }
}

export function assertLinkedScope(
  value: CanvasLinkedContent | CanvasLinkedDocument,
  scope: CanvasLinkedScope,
): void {
  if (
    value.projectId !== assertScopeId(scope.projectId, 'scope.projectId') ||
    value.ownerId !== assertScopeId(scope.ownerId, 'scope.ownerId')
  ) {
    fail('scope-violation', 'scope', 'linked content belongs to a different project or owner');
  }
}

export function isLinkedInScope(
  value: CanvasLinkedContent | CanvasLinkedDocument,
  scope: CanvasLinkedScope,
): boolean {
  try {
    assertLinkedScope(value, scope);
    return true;
  } catch (error) {
    if (error instanceof CanvasLinkedContentError) return false;
    throw error;
  }
}

export function projectLinkedStatus(value: CanvasLinkedContent): CanvasLinkedStatus {
  return value.status;
}

function contentTransition(
  value: CanvasLinkedContent,
  change: Partial<CanvasLinkedContent>,
  now: unknown,
): CanvasLinkedContent {
  const updatedAt = assertTimestamp(now, 'linkedContent.updatedAt');
  if (updatedAt < value.updatedAt)
    fail('invalid-timestamp', 'linkedContent.updatedAt', 'must not move backwards');
  return deepFreeze({ ...value, ...change, updatedAt });
}

export function withLinkedPreview(
  value: CanvasLinkedContent,
  preview: unknown,
  now: unknown,
): CanvasLinkedContent {
  return contentTransition(
    value,
    { preview: assertOptionalPreview(preview, 'linkedContent.preview') },
    now,
  );
}
export function markLinkedUnavailable(
  value: CanvasLinkedContent,
  now: unknown,
): CanvasLinkedContent {
  return contentTransition(value, { available: false, status: 'unavailable' }, now);
}
export function markLinkedAvailable(value: CanvasLinkedContent, now: unknown): CanvasLinkedContent {
  return contentTransition(
    value,
    {
      available: true,
      status: statusFor(value.snapshot, true, false, linkedSourceDefaultStatus(value.kind)),
    },
    now,
  );
}
export function createLinkedSnapshot(
  value: CanvasLinkedContent,
  capture: unknown,
  now: unknown,
): CanvasLinkedContent {
  const snapshot = assertSnapshot(capture, 'linkedContent.snapshot');
  return contentTransition(value, { snapshot, status: 'snapshot' }, now);
}
export function removeLinkedSnapshot(
  value: CanvasLinkedContent,
  now: unknown,
): CanvasLinkedContent {
  return contentTransition(
    value,
    {
      snapshot: null,
      status: statusFor(null, value.available, false, linkedSourceDefaultStatus(value.kind)),
    },
    now,
  );
}

export function createLinkedDocument(input: unknown): CanvasLinkedDocument {
  if (!isPlainObject(input)) fail('invalid-type', 'linkedDocument', 'expected an object');
  assertExactKeys(
    input,
    new Set([
      'id',
      'documentKind',
      'projectId',
      'ownerId',
      'sourceId',
      'sourceVersion',
      'title',
      'summary',
      'excerpt',
      'editable',
      'permissionEvidence',
      'createdAt',
    ]),
    'linkedDocument',
  );
  const createdAt = assertTimestamp(input.createdAt, 'linkedDocument.createdAt');
  const documentKind = assertDocumentKind(input.documentKind, 'linkedDocument.documentKind');
  const sourceId = assertSourceId(input.sourceId, 'linkedDocument.sourceId');
  return deepFreeze({
    id: assertLinkedId(input.id, 'linkedDocument.id') as CanvasLinkedDocumentId,
    documentKind,
    projectId: assertScopeId(input.projectId, 'linkedDocument.projectId') as CanvasProjectId,
    ownerId: assertScopeId(input.ownerId, 'linkedDocument.ownerId') as CanvasOwnerId,
    sourceId,
    sourceVersion: assertVersion(input.sourceVersion, 'linkedDocument.sourceVersion'),
    title: assertBoundedText(input.title, 'linkedDocument.title', CANVAS_MAX_TITLE_LENGTH),
    summary: assertBoundedText(
      input.summary,
      'linkedDocument.summary',
      CANVAS_LINKED_MAX_SUMMARY_LENGTH,
    ),
    excerpt:
      assertOptionalBoundedText(
        input.excerpt,
        'linkedDocument.excerpt',
        CANVAS_LINKED_MAX_EXCERPT_LENGTH,
      ) ?? '',
    editable:
      typeof input.editable === 'boolean'
        ? input.editable
        : fail('invalid-type', 'linkedDocument.editable', 'expected a boolean'),
    permissionEvidence: assertOptionalBoundedText(
      input.permissionEvidence,
      'linkedDocument.permissionEvidence',
      CANVAS_LINKED_MAX_PERMISSION_EVIDENCE_LENGTH,
    ),
    status: 'active',
    stale: false,
    snapshot: null,
    openAction: {
      kind: 'vibespace-document' as const,
      documentKind,
      resourceId: sourceId,
      requiresUserGesture: true as const,
    },
    lastRefreshedAt: createdAt,
    createdAt,
    updatedAt: createdAt,
  });
}

export function validateLinkedDocument(input: unknown): CanvasLinkedDocument {
  if (!isPlainObject(input) || !Object.prototype.hasOwnProperty.call(input, 'status')) {
    return createLinkedDocument(input);
  }
  assertExactKeys(
    input,
    new Set([
      'id',
      'documentKind',
      'projectId',
      'ownerId',
      'sourceId',
      'sourceVersion',
      'title',
      'summary',
      'excerpt',
      'editable',
      'permissionEvidence',
      'status',
      'stale',
      'snapshot',
      'openAction',
      'lastRefreshedAt',
      'createdAt',
      'updatedAt',
    ]),
    'linkedDocument',
  );
  const created = createLinkedDocument({
    id: input.id,
    documentKind: input.documentKind,
    projectId: input.projectId,
    ownerId: input.ownerId,
    sourceId: input.sourceId,
    sourceVersion: input.sourceVersion,
    title: input.title,
    summary: input.summary,
    excerpt: input.excerpt,
    editable: input.editable,
    permissionEvidence: input.permissionEvidence,
    createdAt: input.createdAt,
  });
  const snapshot =
    input.snapshot === null ? null : assertSnapshot(input.snapshot, 'linkedDocument.snapshot');
  const stale =
    typeof input.stale === 'boolean'
      ? input.stale
      : fail('invalid-type', 'linkedDocument.stale', 'expected a boolean');
  const status = assertStatus(input.status, 'linkedDocument.status');
  const lastRefreshedAt = assertTimestamp(input.lastRefreshedAt, 'linkedDocument.lastRefreshedAt');
  const updatedAt = assertTimestamp(input.updatedAt, 'linkedDocument.updatedAt');
  if (
    status !== statusFor(snapshot, true, stale, 'active') ||
    lastRefreshedAt < created.createdAt ||
    updatedAt < created.createdAt
  ) {
    fail('unsupported-value', 'linkedDocument', 'derived document state is inconsistent');
  }
  if (
    !isPlainObject(input.openAction) ||
    input.openAction.kind !== 'vibespace-document' ||
    input.openAction.documentKind !== created.documentKind ||
    input.openAction.resourceId !== created.sourceId ||
    input.openAction.requiresUserGesture !== true
  ) {
    fail(
      'unsupported-value',
      'linkedDocument.openAction',
      'open action must target the same document',
    );
  }
  return deepFreeze({ ...created, stale, status, snapshot, lastRefreshedAt, updatedAt });
}
export function isLinkedDocument(value: unknown): value is CanvasLinkedDocument {
  try {
    if (!isPlainObject(value) || !Object.prototype.hasOwnProperty.call(value, 'status'))
      return false;
    assertLinkedId(value.id, 'linkedDocument.id');
    assertDocumentKind(value.documentKind, 'linkedDocument.documentKind');
    assertScopeId(value.projectId, 'linkedDocument.projectId');
    assertScopeId(value.ownerId, 'linkedDocument.ownerId');
    assertSourceId(value.sourceId, 'linkedDocument.sourceId');
    assertVersion(value.sourceVersion, 'linkedDocument.sourceVersion');
    const action = value.openAction;
    return (
      typeof value.stale === 'boolean' &&
      CANVAS_LINKED_STATUSES.includes(value.status as CanvasLinkedStatus) &&
      isPlainObject(action) &&
      action.kind === 'vibespace-document' &&
      action.documentKind === value.documentKind &&
      action.resourceId === value.sourceId &&
      action.requiresUserGesture === true
    );
  } catch (error) {
    if (error instanceof CanvasLinkedContentError) return false;
    throw error;
  }
}
export function isLinkedDocumentStale(value: CanvasLinkedDocument): boolean {
  return value.stale;
}

function documentTransition(
  value: CanvasLinkedDocument,
  change: Partial<CanvasLinkedDocument>,
  now: unknown,
): CanvasLinkedDocument {
  const updatedAt = assertTimestamp(now, 'linkedDocument.updatedAt');
  if (updatedAt < value.updatedAt)
    fail('invalid-timestamp', 'linkedDocument.updatedAt', 'must not move backwards');
  return deepFreeze({
    ...value,
    ...change,
    updatedAt,
    lastRefreshedAt: change.lastRefreshedAt ?? value.lastRefreshedAt,
  });
}

export function markLinkedDocumentStale(
  value: CanvasLinkedDocument,
  now: unknown,
): CanvasLinkedDocument {
  if (value.stale) return value;
  return documentTransition(
    value,
    { stale: true, status: statusFor(value.snapshot, true, true, 'active') },
    now,
  );
}

export function refreshLinkedDocument(
  value: CanvasLinkedDocument,
  result: unknown,
  now: unknown,
): CanvasLinkedDocumentRefreshResult {
  if (!isPlainObject(result)) fail('invalid-type', 'linkedDocument.refresh', 'expected an object');
  assertExactKeys(
    result,
    new Set(['sourceVersion', 'available', 'summary', 'excerpt']),
    'linkedDocument.refresh',
  );
  const sourceVersion = assertVersion(result.sourceVersion, 'linkedDocument.refresh.sourceVersion');
  if (typeof result.available !== 'boolean')
    fail('invalid-type', 'linkedDocument.refresh.available', 'expected a boolean');
  const lastRefreshedAt = assertTimestamp(now, 'linkedDocument.lastRefreshedAt');
  const available = result.available;
  const changed = available && sourceVersion > value.sourceVersion;
  const summary =
    result.summary === undefined
      ? value.summary
      : assertBoundedText(
          result.summary,
          'linkedDocument.refresh.summary',
          CANVAS_LINKED_MAX_SUMMARY_LENGTH,
        );
  const excerpt =
    result.excerpt === undefined
      ? value.excerpt
      : (assertOptionalBoundedText(
          result.excerpt,
          'linkedDocument.refresh.excerpt',
          CANVAS_LINKED_MAX_EXCERPT_LENGTH,
        ) ?? '');
  const document = documentTransition(
    value,
    {
      sourceVersion: changed ? sourceVersion : value.sourceVersion,
      summary,
      excerpt,
      stale: false,
      status: statusFor(value.snapshot, available, false, 'active'),
      lastRefreshedAt,
    },
    lastRefreshedAt,
  );
  return deepFreeze({
    document,
    changed,
    previousVersion: value.sourceVersion,
    nextVersion: document.sourceVersion,
  });
}

export function createDocumentSnapshot(
  value: CanvasLinkedDocument,
  capture: unknown,
  now: unknown,
): CanvasLinkedDocument {
  const snapshot = assertSnapshot(capture, 'linkedDocument.snapshot');
  return documentTransition(value, { snapshot, status: 'snapshot' }, now);
}
export function removeDocumentSnapshot(
  value: CanvasLinkedDocument,
  now: unknown,
): CanvasLinkedDocument {
  return documentTransition(
    value,
    { snapshot: null, status: statusFor(null, true, value.stale, 'active') },
    now,
  );
}

export function requestDocumentEdit(
  value: CanvasLinkedDocument,
  input: unknown,
  now: unknown,
): CanvasLinkedDocumentEditRequest {
  if (!value.editable) fail('permission-denied', 'linkedDocument.edit', 'document is not editable');
  if (!isPlainObject(input)) fail('invalid-type', 'linkedDocument.edit', 'expected an edit object');
  assertExactKeys(input, new Set(['intent', 'permissionEvidence']), 'linkedDocument.edit');
  const permissionEvidence =
    assertOptionalBoundedText(
      input.permissionEvidence,
      'linkedDocument.edit.permissionEvidence',
      CANVAS_LINKED_MAX_PERMISSION_EVIDENCE_LENGTH,
    ) ?? value.permissionEvidence;
  if (permissionEvidence === null)
    fail(
      'permission-denied',
      'linkedDocument.edit.permissionEvidence',
      'permission evidence is required',
    );
  return deepFreeze({
    kind: 'source-edit',
    documentId: value.id,
    documentKind: value.documentKind,
    sourceId: value.sourceId,
    intent: assertBoundedText(
      input.intent,
      'linkedDocument.edit.intent',
      CANVAS_LINKED_MAX_INTENT_LENGTH,
    ),
    permissionEvidence,
    updatesSameSource: true,
    requestedAt: assertTimestamp(now, 'linkedDocument.edit.requestedAt'),
  });
}
