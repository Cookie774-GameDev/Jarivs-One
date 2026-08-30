import { isPathInsideRoot, normalizePortableAbsolutePath } from '@/lib/actions/filePolicy';

export type MarkdownLibraryDocumentKind =
  'goal' | 'agent' | 'skill' | 'prompt' | 'design' | 'test' | 'policy' | 'context' | 'custom';

export type MarkdownLibraryScope = Readonly<{
  accountId: string;
  projectId: string;
  root: string;
}>;

export type MarkdownDocumentMetadataV1 = Readonly<{
  schemaVersion: 1;
  documentId: `mdoc_${string}`;
  accountId: string;
  projectId: string;
  root: string;
  path: string;
  kind: MarkdownLibraryDocumentKind;
  title: string;
  contentSha256: `sha256:${string}`;
  sizeBytes: number;
  revision: number;
  indexedAt: number;
}>;

export type MarkdownRevisionV1 = Readonly<{
  schemaVersion: 1;
  documentId: `mdoc_${string}`;
  revision: number;
  contentSha256: `sha256:${string}`;
  sizeBytes: number;
  createdAt: number;
  content: string;
}>;

const DOCUMENT_KEYS = new Set([
  'schemaVersion',
  'documentId',
  'accountId',
  'projectId',
  'root',
  'path',
  'kind',
  'title',
  'contentSha256',
  'sizeBytes',
  'revision',
  'indexedAt',
]);
const REVISION_KEYS = new Set([
  'schemaVersion',
  'documentId',
  'revision',
  'contentSha256',
  'sizeBytes',
  'createdAt',
  'content',
]);
const DOCUMENT_ID = /^mdoc_[a-f0-9]{32}$/u;
const SCOPE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const TITLE = /^[^\u0000-\u001f\u007f]{1,256}$/u;
const KINDS = new Set<MarkdownLibraryDocumentKind>([
  'goal',
  'agent',
  'skill',
  'prompt',
  'design',
  'test',
  'policy',
  'context',
  'custom',
]);
export const MARKDOWN_LIBRARY_MAX_BYTES = 1_000_000;

function recordOf(input: unknown): Record<string, unknown> | null {
  return input !== null && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null;
}

function exactKeys(record: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return (
    Object.keys(record).length === allowed.size &&
    Object.keys(record).every((key) => allowed.has(key))
  );
}

function safeInteger(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

function exactScopeId(value: unknown): value is string {
  return typeof value === 'string' && SCOPE_ID.test(value);
}

function exactDocumentId(value: unknown): value is `mdoc_${string}` {
  return typeof value === 'string' && DOCUMENT_ID.test(value);
}

function exactSha256(value: unknown): value is `sha256:${string}` {
  return typeof value === 'string' && SHA256.test(value);
}

export function parseMarkdownDocumentMetadata(input: unknown): MarkdownDocumentMetadataV1 | null {
  const record = recordOf(input);
  if (!record || !exactKeys(record, DOCUMENT_KEYS)) return null;
  const root = typeof record.root === 'string' ? normalizePortableAbsolutePath(record.root) : null;
  const path = typeof record.path === 'string' ? normalizePortableAbsolutePath(record.path) : null;
  if (
    record.schemaVersion !== 1 ||
    !exactDocumentId(record.documentId) ||
    !exactScopeId(record.accountId) ||
    !exactScopeId(record.projectId) ||
    !root ||
    !path ||
    !isPathInsideRoot(path, root) ||
    !path.toLocaleLowerCase('en-US').endsWith('.md') ||
    typeof record.kind !== 'string' ||
    !KINDS.has(record.kind as MarkdownLibraryDocumentKind) ||
    typeof record.title !== 'string' ||
    record.title.trim() !== record.title ||
    !TITLE.test(record.title) ||
    !exactSha256(record.contentSha256) ||
    !safeInteger(record.sizeBytes, 0) ||
    record.sizeBytes > MARKDOWN_LIBRARY_MAX_BYTES ||
    !safeInteger(record.revision, 1) ||
    !safeInteger(record.indexedAt, 0)
  ) {
    return null;
  }
  return Object.freeze({
    schemaVersion: 1,
    documentId: record.documentId,
    accountId: record.accountId,
    projectId: record.projectId,
    root,
    path,
    kind: record.kind as MarkdownLibraryDocumentKind,
    title: record.title,
    contentSha256: record.contentSha256,
    sizeBytes: record.sizeBytes,
    revision: record.revision,
    indexedAt: record.indexedAt,
  });
}

export function parseMarkdownRevision(input: unknown): MarkdownRevisionV1 | null {
  const record = recordOf(input);
  if (
    !record ||
    !exactKeys(record, REVISION_KEYS) ||
    record.schemaVersion !== 1 ||
    !exactDocumentId(record.documentId) ||
    !safeInteger(record.revision, 1) ||
    !exactSha256(record.contentSha256) ||
    !safeInteger(record.sizeBytes, 0) ||
    record.sizeBytes > MARKDOWN_LIBRARY_MAX_BYTES ||
    !safeInteger(record.createdAt, 0) ||
    typeof record.content !== 'string' ||
    new TextEncoder().encode(record.content).byteLength !== record.sizeBytes
  ) {
    return null;
  }
  return Object.freeze({
    schemaVersion: 1,
    documentId: record.documentId,
    revision: record.revision,
    contentSha256: record.contentSha256,
    sizeBytes: record.sizeBytes,
    createdAt: record.createdAt,
    content: record.content,
  });
}
