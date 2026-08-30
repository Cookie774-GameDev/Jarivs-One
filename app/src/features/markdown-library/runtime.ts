import { isPathInsideRoot, normalizePortableAbsolutePath } from '@/lib/actions/filePolicy';
import { sha256Text } from '@/lib/fs';
import {
  MARKDOWN_LIBRARY_MAX_BYTES,
  parseMarkdownDocumentMetadata,
  parseMarkdownRevision,
  type MarkdownDocumentMetadataV1,
  type MarkdownLibraryDocumentKind,
  type MarkdownLibraryScope,
  type MarkdownRevisionV1,
} from './contracts';

export type MarkdownPhysicalFile = Readonly<{
  path: string;
  content: string;
  modifiedAt: number;
}>;

export type MarkdownLibrarySnapshot = Readonly<{
  generation: number;
  documents: readonly MarkdownDocumentMetadataV1[];
  revisions: readonly MarkdownRevisionV1[];
}>;

export interface MarkdownLibraryFilePort {
  scanMarkdown(scope: MarkdownLibraryScope): Promise<readonly MarkdownPhysicalFile[]>;
  readText(input: { path: string; root: string }): Promise<string | null>;
  compareAndWrite(input: {
    path: string;
    root: string;
    expectedSha256: `sha256:${string}`;
    content: string;
  }): Promise<boolean>;
}

export interface MarkdownLibraryRepository {
  readProjectIndex(scope: MarkdownLibraryScope): Promise<MarkdownLibrarySnapshot>;
  replaceProjectIndex(input: {
    scope: MarkdownLibraryScope;
    expectedGeneration: number;
    next: MarkdownLibrarySnapshot;
  }): Promise<boolean>;
}

export type MarkdownHistoryProjection = Readonly<{
  revision: number;
  contentSha256: `sha256:${string}`;
  sizeBytes: number;
  createdAt: number;
}>;

const SCOPE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const KINDS: readonly Exclude<MarkdownLibraryDocumentKind, 'custom'>[] = [
  'goal',
  'agent',
  'skill',
  'prompt',
  'design',
  'test',
  'policy',
  'context',
];
const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 200;

function normalizeScope(input: MarkdownLibraryScope): MarkdownLibraryScope {
  const root = normalizePortableAbsolutePath(input.root);
  if (!SCOPE_ID.test(input.accountId) || !SCOPE_ID.test(input.projectId) || !root) {
    throw new Error('markdown_library_scope_invalid');
  }
  return Object.freeze({ accountId: input.accountId, projectId: input.projectId, root });
}

function pathKey(path: string, root: string): string {
  return /^[A-Za-z]:\\|^\\\\/u.test(root) ? path.toLocaleLowerCase('en-US') : path;
}

function byteLength(content: string): number {
  return new TextEncoder().encode(content).byteLength;
}

function inferKind(path: string): MarkdownLibraryDocumentKind {
  const filename =
    path.split(/[\\/]/u).at(-1)?.replace(/\.md$/iu, '').toLocaleLowerCase('en-US') ?? '';
  return (
    KINDS.find(
      (kind) =>
        filename === kind || filename.startsWith(`${kind}-`) || filename.startsWith(`${kind}_`),
    ) ?? 'custom'
  );
}

function inferTitle(path: string, content: string): string {
  const heading = /^#\s+([^\r\n]+)$/mu.exec(content)?.[1]?.trim();
  const fallback =
    path.split(/[\\/]/u).at(-1)?.replace(/\.md$/iu, '').replace(/[-_]+/gu, ' ').trim() ||
    'Untitled Markdown';
  const title = (heading || fallback).replace(/[\u0000-\u001f\u007f]/gu, ' ').trim();
  if (!title) throw new Error('markdown_library_inventory_invalid');
  return title.slice(0, 256);
}

async function documentId(path: string, root: string): Promise<`mdoc_${string}`> {
  const digest = await sha256Text(pathKey(path, root));
  return `mdoc_${digest.slice('sha256:'.length, 'sha256:'.length + 32)}`;
}

async function validSnapshot(
  input: MarkdownLibrarySnapshot,
  scope: MarkdownLibraryScope,
): Promise<MarkdownLibrarySnapshot> {
  if (!Number.isSafeInteger(input.generation) || input.generation < 0) {
    throw new Error('markdown_library_index_invalid');
  }
  const documents = input.documents.map(parseMarkdownDocumentMetadata);
  const revisions = input.revisions.map(parseMarkdownRevision);
  if (documents.some((value) => value === null) || revisions.some((value) => value === null)) {
    throw new Error('markdown_library_index_invalid');
  }
  const safeDocuments = documents as MarkdownDocumentMetadataV1[];
  const safeRevisions = revisions as MarkdownRevisionV1[];
  const documentIds = new Set<string>();
  const paths = new Set<string>();
  for (const document of safeDocuments) {
    const key = pathKey(document.path, scope.root);
    if (
      document.accountId !== scope.accountId ||
      document.projectId !== scope.projectId ||
      document.root !== scope.root ||
      documentIds.has(document.documentId) ||
      paths.has(key)
    ) {
      throw new Error('markdown_library_index_invalid');
    }
    documentIds.add(document.documentId);
    paths.add(key);
  }
  const revisionKeys = new Set<string>();
  for (const revision of safeRevisions) {
    const key = `${revision.documentId}:${revision.revision}`;
    if (revisionKeys.has(key) || (await sha256Text(revision.content)) !== revision.contentSha256) {
      throw new Error('markdown_library_index_invalid');
    }
    revisionKeys.add(key);
  }
  for (const document of safeDocuments) {
    if (
      !safeRevisions.some(
        (revision) =>
          revision.documentId === document.documentId &&
          revision.revision === document.revision &&
          revision.contentSha256 === document.contentSha256,
      )
    ) {
      throw new Error('markdown_library_index_invalid');
    }
  }
  return Object.freeze({
    generation: input.generation,
    documents: Object.freeze(safeDocuments),
    revisions: Object.freeze(safeRevisions),
  });
}

function publicHistory(revision: MarkdownRevisionV1): MarkdownHistoryProjection {
  return Object.freeze({
    revision: revision.revision,
    contentSha256: revision.contentSha256,
    sizeBytes: revision.sizeBytes,
    createdAt: revision.createdAt,
  });
}

export function createMarkdownLibraryAuthority(input: {
  filePort: MarkdownLibraryFilePort;
  repository: MarkdownLibraryRepository;
  now?: () => number;
}) {
  const now = input.now ?? Date.now;

  async function read(scopeInput: MarkdownLibraryScope) {
    const scope = normalizeScope(scopeInput);
    const snapshot = await validSnapshot(await input.repository.readProjectIndex(scope), scope);
    return { scope, snapshot };
  }

  return Object.freeze({
    async reindex(
      scopeInput: MarkdownLibraryScope,
    ): Promise<readonly MarkdownDocumentMetadataV1[]> {
      const { scope, snapshot } = await read(scopeInput);
      const inventory = await input.filePort.scanMarkdown(scope);
      const seen = new Set<string>();
      const nextDocuments: MarkdownDocumentMetadataV1[] = [];
      const nextRevisions = [...snapshot.revisions];
      const indexedAt = now();
      if (!Number.isSafeInteger(indexedAt) || indexedAt < 0) {
        throw new Error('markdown_library_clock_invalid');
      }
      for (const candidate of inventory) {
        const path = normalizePortableAbsolutePath(candidate.path);
        const sizeBytes = byteLength(candidate.content);
        if (
          !path ||
          !isPathInsideRoot(path, scope.root) ||
          !path.toLocaleLowerCase('en-US').endsWith('.md') ||
          seen.has(pathKey(path, scope.root)) ||
          sizeBytes > MARKDOWN_LIBRARY_MAX_BYTES
        ) {
          throw new Error('markdown_library_inventory_invalid');
        }
        seen.add(pathKey(path, scope.root));
        const id = await documentId(path, scope.root);
        const sha256 = await sha256Text(candidate.content);
        const prior = snapshot.documents.find(
          (document) => pathKey(document.path, scope.root) === pathKey(path, scope.root),
        );
        if (prior && prior.documentId !== id) throw new Error('markdown_library_index_invalid');
        const changed = prior?.contentSha256 !== sha256;
        const revision = prior ? (changed ? prior.revision + 1 : prior.revision) : 1;
        const document = parseMarkdownDocumentMetadata({
          schemaVersion: 1,
          documentId: id,
          accountId: scope.accountId,
          projectId: scope.projectId,
          root: scope.root,
          path,
          kind: inferKind(path),
          title: inferTitle(path, candidate.content),
          contentSha256: sha256,
          sizeBytes,
          revision,
          indexedAt,
        });
        if (!document) throw new Error('markdown_library_inventory_invalid');
        nextDocuments.push(document);
        if (!prior || changed) {
          const history = parseMarkdownRevision({
            schemaVersion: 1,
            documentId: id,
            revision,
            contentSha256: sha256,
            sizeBytes,
            createdAt: indexedAt,
            content: candidate.content,
          });
          if (!history) throw new Error('markdown_library_inventory_invalid');
          nextRevisions.push(history);
        }
      }
      nextDocuments.sort((left, right) => left.path.localeCompare(right.path, 'en-US'));
      const next = Object.freeze({
        generation: snapshot.generation + 1,
        documents: Object.freeze(nextDocuments),
        revisions: Object.freeze(nextRevisions),
      });
      if (
        !(await input.repository.replaceProjectIndex({
          scope,
          expectedGeneration: snapshot.generation,
          next,
        }))
      ) {
        throw new Error('markdown_library_index_conflict');
      }
      return next.documents;
    },

    async list(
      scopeInput: MarkdownLibraryScope,
      filter: Readonly<{
        query?: string;
        kind?: MarkdownLibraryDocumentKind;
        limit?: number;
      }> = {},
    ): Promise<readonly MarkdownDocumentMetadataV1[]> {
      const { snapshot } = await read(scopeInput);
      const query = filter.query?.trim().toLocaleLowerCase('en-US') ?? '';
      const limit = Number.isInteger(filter.limit)
        ? Math.min(MAX_LIST_LIMIT, Math.max(1, filter.limit!))
        : DEFAULT_LIST_LIMIT;
      return Object.freeze(
        snapshot.documents
          .filter(
            (document) =>
              (!filter.kind || document.kind === filter.kind) &&
              (!query ||
                [document.title, document.path, document.kind].some((value) =>
                  value.toLocaleLowerCase('en-US').includes(query),
                )),
          )
          .slice(0, limit),
      );
    },

    async history(
      scopeInput: MarkdownLibraryScope,
      id: string,
    ): Promise<readonly MarkdownHistoryProjection[]> {
      const { snapshot } = await read(scopeInput);
      if (!snapshot.documents.some((document) => document.documentId === id))
        return Object.freeze([]);
      return Object.freeze(
        snapshot.revisions
          .filter((revision) => revision.documentId === id)
          .sort((left, right) => left.revision - right.revision)
          .map(publicHistory),
      );
    },

    async rollback(
      scopeInput: MarkdownLibraryScope,
      id: string,
      targetRevision: number,
    ): Promise<MarkdownDocumentMetadataV1> {
      const { scope, snapshot } = await read(scopeInput);
      const document = snapshot.documents.find((candidate) => candidate.documentId === id);
      const target = snapshot.revisions.find(
        (revision) => revision.documentId === id && revision.revision === targetRevision,
      );
      if (!document || !target || target.revision === document.revision) {
        throw new Error('markdown_library_revision_unavailable');
      }
      const currentContent = await input.filePort.readText({
        path: document.path,
        root: scope.root,
      });
      if (
        currentContent === null ||
        (await sha256Text(currentContent)) !== document.contentSha256
      ) {
        throw new Error('markdown_library_file_stale');
      }
      if (target.contentSha256 === document.contentSha256) {
        throw new Error('markdown_library_revision_current');
      }
      if (
        !(await input.filePort.compareAndWrite({
          path: document.path,
          root: scope.root,
          expectedSha256: document.contentSha256,
          content: target.content,
        }))
      ) {
        throw new Error('markdown_library_file_stale');
      }
      const createdAt = now();
      const nextRevisionNumber = document.revision + 1;
      const rolledBack = parseMarkdownDocumentMetadata({
        ...document,
        contentSha256: target.contentSha256,
        sizeBytes: target.sizeBytes,
        revision: nextRevisionNumber,
        indexedAt: createdAt,
      });
      const revision = parseMarkdownRevision({
        schemaVersion: 1,
        documentId: document.documentId,
        revision: nextRevisionNumber,
        contentSha256: target.contentSha256,
        sizeBytes: target.sizeBytes,
        createdAt,
        content: target.content,
      });
      if (!rolledBack || !revision) throw new Error('markdown_library_rollback_invalid');
      const next = Object.freeze({
        generation: snapshot.generation + 1,
        documents: Object.freeze(
          snapshot.documents.map((candidate) =>
            candidate.documentId === document.documentId ? rolledBack : candidate,
          ),
        ),
        revisions: Object.freeze([...snapshot.revisions, revision]),
      });
      let replaced = false;
      try {
        replaced = await input.repository.replaceProjectIndex({
          scope,
          expectedGeneration: snapshot.generation,
          next,
        });
      } catch {
        replaced = false;
      }
      if (replaced) return rolledBack;
      let compensated = false;
      try {
        compensated = await input.filePort.compareAndWrite({
          path: document.path,
          root: scope.root,
          expectedSha256: target.contentSha256,
          content: currentContent,
        });
      } catch {
        compensated = false;
      }
      if (!compensated) throw new Error('markdown_library_rollback_compensation_failed');
      throw new Error('markdown_library_index_conflict');
    },
  });
}
