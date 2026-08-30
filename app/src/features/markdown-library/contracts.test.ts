import { describe, expect, it } from 'vitest';
import {
  parseMarkdownHistoryCursor,
  parseMarkdownDocumentMetadata,
  parseMarkdownRollbackPreparation,
  parseMarkdownRevision,
  type MarkdownDocumentMetadataV1,
  type MarkdownHistoryCursorV1,
  type MarkdownRollbackPreparationV1,
  type MarkdownRevisionV1,
} from './contracts';

const document: MarkdownDocumentMetadataV1 = {
  schemaVersion: 1,
  documentId: 'mdoc_0123456789abcdef0123456789abcdef',
  accountId: 'account-alpha',
  projectId: 'project-alpha',
  root: 'C:\\repo',
  path: 'C:\\repo\\docs\\generated\\goal-release.md',
  kind: 'goal',
  title: 'Release goal',
  contentSha256: `sha256:${'a'.repeat(64)}`,
  sizeBytes: 128,
  revision: 2,
  indexedAt: 200,
};

const revision: MarkdownRevisionV1 = {
  schemaVersion: 1,
  documentId: document.documentId,
  revision: 2,
  contentSha256: document.contentSha256,
  sizeBytes: 15,
  createdAt: 200,
  content: '# Release goal\n',
};

const historyCursor: MarkdownHistoryCursorV1 = {
  schemaVersion: 1,
  documentId: document.documentId,
  beforeRevision: 2,
};

const rollbackPreparation: MarkdownRollbackPreparationV1 = {
  schemaVersion: 1,
  documentId: document.documentId,
  fromRevision: 2,
  targetRevision: 1,
  createdAt: 300,
};

describe('Markdown Library V1 contracts', () => {
  it('accepts exact typed/versioned document and immutable revision records', () => {
    expect(parseMarkdownDocumentMetadata(document)).toEqual(document);
    expect(parseMarkdownRevision(revision)).toEqual(revision);
    expect(Object.isFrozen(parseMarkdownDocumentMetadata(document))).toBe(true);
    expect(Object.isFrozen(parseMarkdownRevision(revision))).toBe(true);
  });

  it('accepts only exact document-bound history cursors', () => {
    expect(parseMarkdownHistoryCursor(historyCursor)).toEqual(historyCursor);
    expect(Object.isFrozen(parseMarkdownHistoryCursor(historyCursor))).toBe(true);
    expect(parseMarkdownHistoryCursor({ ...historyCursor, beforeRevision: 0 })).toBeNull();
    expect(parseMarkdownHistoryCursor({ ...historyCursor, projectId: 'project-alpha' })).toBeNull();
  });

  it('accepts only exact durable rollback preparations', () => {
    expect(parseMarkdownRollbackPreparation(rollbackPreparation)).toEqual(rollbackPreparation);
    expect(Object.isFrozen(parseMarkdownRollbackPreparation(rollbackPreparation))).toBe(true);
    expect(
      parseMarkdownRollbackPreparation({ ...rollbackPreparation, targetRevision: 2 }),
    ).toBeNull();
    expect(
      parseMarkdownRollbackPreparation({ ...rollbackPreparation, originalContent: '# hidden' }),
    ).toBeNull();
  });

  it.each([
    ['wrong schema', { ...document, schemaVersion: 2 }],
    ['invalid id', { ...document, documentId: 'document 1' }],
    ['relative path', { ...document, path: 'docs/release.md' }],
    ['wrong extension', { ...document, path: 'C:\\repo\\release.txt' }],
    ['invalid digest', { ...document, contentSha256: 'sha256:not-a-digest' }],
    ['zero revision', { ...document, revision: 0 }],
    ['control title', { ...document, title: 'Release\nsecret' }],
    ['extra backing data', { ...document, content: '# hidden body' }],
  ])('rejects document metadata with %s', (_label, candidate) => {
    expect(parseMarkdownDocumentMetadata(candidate)).toBeNull();
  });

  it.each([
    ['wrong schema', { ...revision, schemaVersion: 2 }],
    ['mismatched size', { ...revision, sizeBytes: 1 }],
    ['invalid digest', { ...revision, contentSha256: 'sha256:bad' }],
    ['oversized content', { ...revision, content: 'x'.repeat(1_000_001) }],
    ['extra field', { ...revision, sourcePath: document.path }],
  ])('rejects revision records with %s', (_label, candidate) => {
    expect(parseMarkdownRevision(candidate)).toBeNull();
  });
});
