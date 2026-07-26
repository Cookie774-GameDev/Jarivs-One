import { describe, expect, it } from 'vitest';
import {
  createGitHubRepositorySelection,
  refreshGitHubRepositorySelection,
  searchGitHubRepositoryCatalog,
  type GitHubRepositoryAuthority,
  type GitHubRepositoryRef,
} from './githubRepositoryCatalog';

const repositories = [
  {
    id: 'repo-1',
    owner: 'octo',
    name: 'vibespace',
    visibility: 'private' as const,
    defaultBranch: 'main',
    archived: false,
    fork: false,
    pushedAt: '2026-07-25T20:30:00.000Z',
    permissionState: 'admin' as const,
  },
  {
    id: 'repo-2',
    owner: 'octo',
    name: 'docs',
    visibility: 'public' as const,
    defaultBranch: 'trunk',
    archived: true,
    fork: true,
    pushedAt: '2026-06-01T12:00:00.000Z',
    permissionState: 'read' as const,
  },
];

function authority(overrides: Partial<GitHubRepositoryAuthority> = {}): GitHubRepositoryAuthority {
  return {
    getRepositoryCatalog: () => ({
      accountId: 'account-1',
      installationId: 'installation-1',
      repositories,
    }),
    resolveRef: (_accountId, _installationId, repositoryId, selectedRef) => ({
      repositoryId,
      selectedRef,
      resolvedCommitSha:
        selectedRef.kind === 'commit'
          ? selectedRef.sha
          : '1111111111111111111111111111111111111111',
    }),
    ...overrides,
  };
}

const claim = {
  accountId: 'account-1',
  installationId: 'installation-1',
};

describe('GitHub repository catalog and ref selection', () => {
  it('shows all required metadata from the trusted accessible repository catalog', () => {
    expect(searchGitHubRepositoryCatalog(claim, '', authority())).toEqual([
      {
        id: 'repo-2',
        owner: 'octo',
        repository: 'docs',
        visibility: 'public',
        defaultBranch: 'trunk',
        archived: true,
        fork: true,
        lastPush: '2026-06-01T12:00:00.000Z',
        accountId: 'account-1',
        installationId: 'installation-1',
        permissionState: 'read',
      },
      {
        id: 'repo-1',
        owner: 'octo',
        repository: 'vibespace',
        visibility: 'private',
        defaultBranch: 'main',
        archived: false,
        fork: false,
        lastPush: '2026-07-25T20:30:00.000Z',
        accountId: 'account-1',
        installationId: 'installation-1',
        permissionState: 'admin',
      },
    ]);
  });

  it('searches only the authoritative accessible catalog', () => {
    expect(searchGitHubRepositoryCatalog(claim, 'OCTO/VIBE', authority())).toEqual([
      expect.objectContaining({ id: 'repo-1', owner: 'octo', repository: 'vibespace' }),
    ]);
    expect(searchGitHubRepositoryCatalog(claim, 'secret', authority())).toEqual([]);

    const callerClaim = {
      ...claim,
      repositories: [{ id: 'foreign', owner: 'other', name: 'secret' }],
    };
    expect(() =>
      searchGitHubRepositoryCatalog(callerClaim as never, 'secret', authority()),
    ).toThrow(/claim/i);
  });

  it.each([
    [{ kind: 'default_branch' }, { kind: 'default_branch', name: 'main' }],
    [
      { kind: 'branch', name: 'feature/context' },
      { kind: 'branch', name: 'feature/context' },
    ],
    [
      { kind: 'tag', name: 'v1.2.3' },
      { kind: 'tag', name: 'v1.2.3' },
    ],
    [
      { kind: 'commit', sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      { kind: 'commit', sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    ],
  ] as const)(
    'records the selected ref and authoritative resolved commit for %j',
    (requestedRef, selectedRef) => {
      const selection = createGitHubRepositorySelection(
        { ...claim, repositoryId: 'repo-1' },
        requestedRef,
        'on_open',
        authority({
          resolveRef: (_accountId, _installationId, repositoryId, ref) => ({
            repositoryId,
            selectedRef:
              ref.kind === 'default_branch'
                ? { kind: 'default_branch', name: 'main' }
                : (ref as Exclude<GitHubRepositoryRef, { kind: 'default_branch' }>),
            resolvedCommitSha:
              ref.kind === 'commit' ? ref.sha : 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          }),
        }),
      );

      expect(selection).toMatchObject({
        accountId: 'account-1',
        installationId: 'installation-1',
        repositoryId: 'repo-1',
        owner: 'octo',
        repository: 'vibespace',
        selectedRef,
        resolvedCommitSha:
          requestedRef.kind === 'commit'
            ? 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
            : 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        pinned: requestedRef.kind === 'tag' || requestedRef.kind === 'commit',
        executable: false,
      });
    },
  );

  it('refreshes moving branches to the latest SHA only when policy permits', () => {
    let resolvedSha = '1111111111111111111111111111111111111111';
    const trusted = authority({
      resolveRef: (_accountId, _installationId, repositoryId, selectedRef) => ({
        repositoryId,
        selectedRef:
          selectedRef.kind === 'default_branch'
            ? { kind: 'default_branch', name: 'main' }
            : selectedRef,
        resolvedCommitSha: resolvedSha,
      }),
    });
    const selection = createGitHubRepositorySelection(
      { ...claim, repositoryId: 'repo-1' },
      { kind: 'branch', name: 'feature/context' },
      'on_open',
      trusted,
    );
    resolvedSha = '2222222222222222222222222222222222222222';

    const deniedRefresh = refreshGitHubRepositorySelection(selection, 'scheduled', trusted);
    expect(deniedRefresh).toEqual(selection);
    expect(deniedRefresh).not.toBe(selection);
    expect(Object.isFrozen(deniedRefresh)).toBe(true);
    expect(refreshGitHubRepositorySelection(selection, 'on_open', trusted)).toMatchObject({
      selectedRef: { kind: 'branch', name: 'feature/context' },
      previousCommitSha: '1111111111111111111111111111111111111111',
      resolvedCommitSha: '2222222222222222222222222222222222222222',
      refreshed: true,
    });
  });

  it('keeps tags and exact SHAs pinned without asking the resolver again', () => {
    let calls = 0;
    const trusted = authority({
      resolveRef: (_accountId, _installationId, repositoryId, selectedRef) => {
        calls += 1;
        return {
          repositoryId,
          selectedRef,
          resolvedCommitSha:
            selectedRef.kind === 'commit'
              ? selectedRef.sha
              : '3333333333333333333333333333333333333333',
        };
      },
    });
    const tag = createGitHubRepositorySelection(
      { ...claim, repositoryId: 'repo-1' },
      { kind: 'tag', name: 'v1' },
      'scheduled',
      trusted,
    );
    const commit = createGitHubRepositorySelection(
      { ...claim, repositoryId: 'repo-1' },
      { kind: 'commit', sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      'scheduled',
      trusted,
    );

    expect(refreshGitHubRepositorySelection(tag, 'scheduled', trusted)).toEqual(tag);
    expect(refreshGitHubRepositorySelection(commit, 'scheduled', trusted)).toEqual(commit);
    expect(calls).toBe(2);
    expect(tag).toMatchObject({ refreshPolicy: 'pinned', pinned: true });
    expect(commit).toMatchObject({ refreshPolicy: 'pinned', pinned: true });
  });

  it('rejects inaccessible repositories and mismatched or malformed authority results', () => {
    expect(() =>
      createGitHubRepositorySelection(
        { ...claim, repositoryId: 'foreign' },
        { kind: 'default_branch' },
        'on_open',
        authority(),
      ),
    ).toThrow(/accessible/i);
    expect(() =>
      refreshGitHubRepositorySelection(
        {
          accountId: 'account-1',
          installationId: 'installation-1',
          repositoryId: 'foreign',
          owner: 'other',
          repository: 'secret',
          selectedRef: { kind: 'tag', name: 'v1' },
          resolvedCommitSha: '1111111111111111111111111111111111111111',
          previousCommitSha: null,
          refreshPolicy: 'pinned',
          pinned: true,
          refreshed: false,
          executable: false,
        },
        'scheduled',
        authority(),
      ),
    ).toThrow(/accessible/i);
    expect(() =>
      createGitHubRepositorySelection(
        { ...claim, repositoryId: 'repo-1' },
        { kind: 'branch', name: 'main' },
        'on_open',
        authority({
          resolveRef: () => ({
            repositoryId: 'repo-2',
            selectedRef: { kind: 'branch', name: 'main' },
            resolvedCommitSha: '1111111111111111111111111111111111111111',
          }),
        }),
      ),
    ).toThrow(/authoritative ref/i);
    expect(() =>
      createGitHubRepositorySelection(
        { ...claim, repositoryId: 'repo-1' },
        { kind: 'branch', name: 'main' },
        'on_open',
        authority({
          resolveRef: (_accountId, _installationId, repositoryId, selectedRef) => ({
            repositoryId,
            selectedRef,
            resolvedCommitSha: 'not-a-sha',
          }),
        }),
      ),
    ).toThrow(/commit SHA/i);
  });

  it('fails closed for accessors, invalid dates, duplicate repositories, and oversized queries', () => {
    let calls = 0;
    const accessor = {
      get accountId() {
        calls += 1;
        return 'account-1';
      },
      installationId: 'installation-1',
    };
    expect(() => searchGitHubRepositoryCatalog(accessor, '', authority())).toThrow(/claim/i);
    expect(calls).toBe(0);
    expect(() =>
      searchGitHubRepositoryCatalog(
        claim,
        '',
        authority({
          getRepositoryCatalog: () => ({
            accountId: 'account-1',
            installationId: 'installation-1',
            repositories: [{ ...repositories[0], pushedAt: 'yesterday' }],
          }),
        }),
      ),
    ).toThrow(/last push/i);
    expect(() =>
      searchGitHubRepositoryCatalog(
        claim,
        '',
        authority({
          getRepositoryCatalog: () => ({
            accountId: 'account-1',
            installationId: 'installation-1',
            repositories: [repositories[0], repositories[0]],
          }),
        }),
      ),
    ).toThrow(/duplicate/i);
    expect(() => searchGitHubRepositoryCatalog(claim, 'x'.repeat(10_000), authority())).toThrow(
      /query/i,
    );
  });
});
