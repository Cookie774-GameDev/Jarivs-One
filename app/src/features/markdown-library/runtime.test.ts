import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256Text } from '@/lib/fs';
import {
  createMarkdownLibraryAuthority,
  type MarkdownLibraryFilePort,
  type MarkdownLibraryRepository,
  type MarkdownLibrarySnapshot,
} from './runtime';

const scope = {
  accountId: 'account-alpha',
  projectId: 'project-alpha',
  root: 'C:\\repo',
} as const;

function emptySnapshot(): MarkdownLibrarySnapshot {
  return { generation: 0, documents: [], revisions: [] };
}

describe('Markdown Library authority', () => {
  let snapshot: MarkdownLibrarySnapshot;
  let files: Map<string, string>;
  let scan: ReturnType<typeof vi.fn<MarkdownLibraryFilePort['scanMarkdown']>>;
  let replace: ReturnType<typeof vi.fn<MarkdownLibraryRepository['replaceProjectIndex']>>;
  let compareAndWrite: ReturnType<typeof vi.fn<MarkdownLibraryFilePort['compareAndWrite']>>;
  let filePort: MarkdownLibraryFilePort;
  let repository: MarkdownLibraryRepository;

  beforeEach(() => {
    snapshot = emptySnapshot();
    files = new Map([
      ['C:\\repo\\docs\\generated\\goal-release.md', '# Release goal\nFirst'],
      ['C:\\repo\\docs\\generated\\policy-security.md', '# Security policy\nRules'],
    ]);
    scan = vi.fn(async () =>
      Array.from(files, ([path, content], index) => ({ path, content, modifiedAt: 100 + index })),
    );
    replace = vi.fn(async ({ expectedGeneration, next }) => {
      if (snapshot.generation !== expectedGeneration) return false;
      snapshot = next;
      return true;
    });
    compareAndWrite = vi.fn(async ({ path, expectedSha256, content }) => {
      const current = files.get(path);
      if (current === undefined || (await sha256Text(current)) !== expectedSha256) return false;
      files.set(path, content);
      return true;
    });
    filePort = {
      scanMarkdown: scan,
      readText: vi.fn(async ({ path }) => files.get(path) ?? null),
      compareAndWrite,
    };
    repository = {
      readProjectIndex: vi.fn(async () => snapshot),
      replaceProjectIndex: replace,
    };
  });

  it('reindexes physical Markdown deterministically and fails closed for unsafe inventory', async () => {
    const authority = createMarkdownLibraryAuthority({ filePort, repository, now: () => 500 });
    const indexed = await authority.reindex(scope);

    expect(indexed.map(({ kind, title, revision }) => ({ kind, title, revision }))).toEqual([
      { kind: 'goal', title: 'Release goal', revision: 1 },
      { kind: 'policy', title: 'Security policy', revision: 1 },
    ]);
    expect(indexed.map(({ path }) => path)).toEqual([...indexed.map(({ path }) => path)].sort());
    expect(snapshot.generation).toBe(1);
    expect(snapshot.revisions).toHaveLength(2);

    scan.mockResolvedValueOnce([
      { path: 'C:\\repo\\docs\\ok.md', content: '# Safe', modifiedAt: 1 },
      { path: 'C:\\outside\\escape.md', content: '# Unsafe', modifiedAt: 1 },
    ]);
    await expect(authority.reindex(scope)).rejects.toThrow('markdown_library_inventory_invalid');
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('adds immutable history only when physical content changes', async () => {
    const authority = createMarkdownLibraryAuthority({ filePort, repository, now: () => 500 });
    await authority.reindex(scope);
    await authority.reindex(scope);
    expect(snapshot.revisions).toHaveLength(2);

    files.set('C:\\repo\\docs\\generated\\goal-release.md', '# Release goal\nSecond');
    await authority.reindex(scope);
    const goal = snapshot.documents.find(({ kind }) => kind === 'goal');
    expect(goal?.revision).toBe(2);
    expect(
      snapshot.revisions.filter(({ documentId }) => documentId === goal?.documentId),
    ).toHaveLength(2);
  });

  it('lists and filters only bounded account/project metadata without revision content', async () => {
    const authority = createMarkdownLibraryAuthority({ filePort, repository, now: () => 500 });
    await authority.reindex(scope);

    expect(await authority.list(scope, { query: 'security', kind: 'policy' })).toEqual([
      expect.objectContaining({ title: 'Security policy', kind: 'policy' }),
    ]);
    expect(await authority.list(scope, { limit: 1 })).toHaveLength(1);
    const goal = snapshot.documents.find(({ kind }) => kind === 'goal')!;
    expect(await authority.history(scope, goal.documentId)).toEqual([
      {
        revision: 1,
        contentSha256: goal.contentSha256,
        sizeBytes: goal.sizeBytes,
        createdAt: 500,
      },
    ]);
    expect(JSON.stringify(await authority.list(scope))).not.toContain('First');
    expect(JSON.stringify(await authority.history(scope, goal.documentId))).not.toContain('First');
  });

  it('rolls back through exact file and index authority while appending a new revision', async () => {
    let now = 500;
    const authority = createMarkdownLibraryAuthority({ filePort, repository, now: () => now });
    await authority.reindex(scope);
    const path = 'C:\\repo\\docs\\generated\\goal-release.md';
    files.set(path, '# Release goal\nSecond');
    now = 600;
    await authority.reindex(scope);
    const before = snapshot.documents.find(({ path: candidate }) => candidate === path)!;

    now = 700;
    const rolledBack = await authority.rollback(scope, before.documentId, 1);

    expect(files.get(path)).toBe('# Release goal\nFirst');
    expect(rolledBack.revision).toBe(3);
    expect(
      snapshot.revisions.map(({ revision }) => revision).filter((revision) => revision === 3),
    ).toEqual([3]);
    expect(compareAndWrite).toHaveBeenCalledWith(
      expect.objectContaining({ path, expectedSha256: before.contentSha256 }),
    );
  });

  it('rejects stale files and compensates a physical rollback when index CAS loses', async () => {
    const authority = createMarkdownLibraryAuthority({ filePort, repository, now: () => 500 });
    await authority.reindex(scope);
    const first = snapshot.documents[0]!;
    const secondContent = '# Release goal\nSecond';
    files.set(first.path, secondContent);
    await authority.reindex(scope);
    const document = snapshot.documents.find(({ documentId }) => documentId === first.documentId)!;
    files.set(document.path, '# Changed outside authority');
    await expect(authority.rollback(scope, document.documentId, 1)).rejects.toThrow(
      'markdown_library_file_stale',
    );
    expect(replace).toHaveBeenCalledTimes(2);

    files.set(document.path, secondContent);
    replace.mockResolvedValueOnce(false);

    await expect(authority.rollback(scope, document.documentId, 1)).rejects.toThrow(
      'markdown_library_index_conflict',
    );
    expect(files.get(document.path)).toBe(secondContent);
    expect(compareAndWrite).toHaveBeenCalledTimes(2);
  });

  it('compensates repository rejection and reports a terminal compensation failure exactly', async () => {
    const authority = createMarkdownLibraryAuthority({ filePort, repository, now: () => 500 });
    await authority.reindex(scope);
    const first = snapshot.documents[0]!;
    const secondContent = '# Release goal\nSecond';
    files.set(first.path, secondContent);
    await authority.reindex(scope);
    const document = snapshot.documents.find(({ documentId }) => documentId === first.documentId)!;

    replace.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(authority.rollback(scope, document.documentId, 1)).rejects.toThrow(
      'markdown_library_index_conflict',
    );
    expect(files.get(document.path)).toBe(secondContent);

    replace.mockResolvedValueOnce(false);
    compareAndWrite
      .mockImplementationOnce(async ({ path, content }) => {
        files.set(path, content);
        return true;
      })
      .mockResolvedValueOnce(false);
    await expect(authority.rollback(scope, document.documentId, 1)).rejects.toThrow(
      'markdown_library_rollback_compensation_failed',
    );
  });
});
