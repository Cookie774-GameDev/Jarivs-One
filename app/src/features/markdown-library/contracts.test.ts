import { describe, expect, it } from 'vitest';
import {
  parseMarkdownDocumentMetadata,
  parseMarkdownRevision,
  type MarkdownDocumentMetadataV1,
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

describe('Markdown Library V1 contracts', () => {
  it('accepts exact typed/versioned document and immutable revision records', () => {
    expect(parseMarkdownDocumentMetadata(document)).toEqual(document);
    expect(parseMarkdownRevision(revision)).toEqual(revision);
    expect(Object.isFrozen(parseMarkdownDocumentMetadata(document))).toBe(true);
    expect(Object.isFrozen(parseMarkdownRevision(revision))).toBe(true);
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
