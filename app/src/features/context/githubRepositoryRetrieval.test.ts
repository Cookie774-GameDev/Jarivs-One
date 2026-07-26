import { describe, expect, it } from 'vitest';
import {
  GITHUB_REPOSITORY_SCOPE_MODES,
  buildGitHubMonorepoPlan,
  buildGitHubRepositoryScope,
  parseGitHubLfsPointer,
  planGitHubContentRetrieval,
  planGitHubLfsObject,
  planGitHubSubmodule,
  planGitHubTreeRetrieval,
} from './githubRepositoryRetrieval';

const identity = {
  accountId: 'account-1',
  installationId: 'installation-1',
  owner: 'octo',
  repository: 'vibespace',
  resolvedCommitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
};

describe('GitHub repository retrieval and scope contracts', () => {
  it('uses a complete recursive Git Trees response without inventing omissions', () => {
    expect(
      planGitHubTreeRetrieval({
        identity,
        rootTreeSha: '1111111111111111111111111111111111111111',
        recursiveResponse: {
          treeSha: '1111111111111111111111111111111111111111',
          recursive: true,
          truncated: false,
          etag: '"root-v1"',
          entries: [
            {
              path: 'src',
              type: 'tree',
              sha: '2222222222222222222222222222222222222222',
            },
            {
              path: 'README.md',
              type: 'blob',
              sha: '3333333333333333333333333333333333333333',
              size: 120,
            },
          ],
        },
        recoveredTrees: [],
        cachedEtags: [],
        rateLimit: { remaining: 100, resetAt: '2026-07-26T07:00:00.000Z' },
      }),
    ).toMatchObject({
      api: 'git_trees',
      complete: true,
      recursiveTruncationDetected: false,
      silentOmission: false,
      entries: [
        {
          path: 'src',
          type: 'tree',
          sha: '2222222222222222222222222222222222222222',
        },
        {
          path: 'README.md',
          type: 'blob',
          sha: '3333333333333333333333333333333333333333',
          size: 120,
        },
      ],
      requestBatches: [],
      deferredRequests: [],
    });
  });

  it('detects recursive truncation and walks every subtree non-recursively', () => {
    const plan = planGitHubTreeRetrieval({
      identity,
      rootTreeSha: '1111111111111111111111111111111111111111',
      recursiveResponse: {
        treeSha: '1111111111111111111111111111111111111111',
        recursive: true,
        truncated: true,
        etag: '"recursive-root"',
        entries: [],
      },
      recoveredTrees: [
        {
          treeSha: '1111111111111111111111111111111111111111',
          recursive: false,
          truncated: false,
          etag: '"root"',
          entries: [
            {
              path: 'src',
              type: 'tree',
              sha: '2222222222222222222222222222222222222222',
            },
          ],
        },
      ],
      cachedEtags: [
        {
          treeSha: '2222222222222222222222222222222222222222',
          etag: '"src-v1"',
        },
      ],
      rateLimit: { remaining: 5, resetAt: '2026-07-26T07:00:00.000Z' },
    });

    expect(plan).toMatchObject({
      complete: false,
      recursiveTruncationDetected: true,
      silentOmission: false,
      unresolvedPaths: ['src'],
      requestBatches: [
        [
          {
            api: 'git_trees',
            treeSha: '2222222222222222222222222222222222222222',
            path: 'src',
            recursive: false,
            ifNoneMatch: '"src-v1"',
          },
        ],
      ],
      usesConditionalRequests: true,
    });
  });

  it('batches traversal, respects rate limits, and surfaces all deferred work', () => {
    const entries = Array.from({ length: 25 }, (_, index) => ({
      path: `pkg-${index}`,
      type: 'tree' as const,
      sha: index.toString(16).padStart(40, '0'),
    }));
    const plan = planGitHubTreeRetrieval({
      identity,
      rootTreeSha: '1111111111111111111111111111111111111111',
      recursiveResponse: {
        treeSha: '1111111111111111111111111111111111111111',
        recursive: true,
        truncated: true,
        etag: '"recursive-root"',
        entries: [],
      },
      recoveredTrees: [
        {
          treeSha: '1111111111111111111111111111111111111111',
          recursive: false,
          truncated: false,
          etag: '"root"',
          entries,
        },
      ],
      cachedEtags: [],
      rateLimit: { remaining: 3, resetAt: '2026-07-26T07:00:00.000Z' },
    });

    expect(plan.requestBatches.flat()).toHaveLength(3);
    expect(plan.deferredRequests).toHaveLength(22);
    expect(plan).toMatchObject({
      complete: false,
      rateLimitPaused: true,
      totalPendingRequests: 25,
      silentOmission: false,
    });
  });

  it('falls back to paginated directory retrieval when a non-recursive tree is truncated', () => {
    const plan = planGitHubTreeRetrieval({
      identity,
      rootTreeSha: '1111111111111111111111111111111111111111',
      recursiveResponse: {
        treeSha: '1111111111111111111111111111111111111111',
        recursive: true,
        truncated: true,
        etag: '"recursive-root"',
        entries: [],
      },
      recoveredTrees: [
        {
          treeSha: '1111111111111111111111111111111111111111',
          recursive: false,
          truncated: true,
          etag: '"root"',
          entries: [],
        },
      ],
      recoveredDirectories: [
        {
          treeSha: '1111111111111111111111111111111111111111',
          path: '',
          page: 1,
          hasNext: true,
          etag: '"root-page-1"',
          entries: [
            {
              path: 'README.md',
              type: 'blob',
              sha: '3333333333333333333333333333333333333333',
              size: 120,
            },
          ],
        },
      ],
      cachedEtags: [],
      rateLimit: { remaining: 1, resetAt: '2026-07-26T07:00:00.000Z' },
    });

    expect(plan).toMatchObject({
      complete: false,
      silentOmission: false,
      unresolvedPaths: [''],
      entries: [
        {
          path: 'README.md',
          type: 'blob',
          sha: '3333333333333333333333333333333333333333',
          size: 120,
        },
      ],
      requestBatches: [
        [
          {
            api: 'repository_contents',
            path: '',
            page: 2,
            pageSize: 100,
          },
        ],
      ],
    });
  });

  it('selects approved content APIs and keeps durable identity URL-free', () => {
    expect(
      planGitHubContentRetrieval({
        identity,
        path: 'src/main.ts',
        blobSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        purpose: 'single_blob',
        estimatedFileCount: 1,
        archiveJustified: false,
      }),
    ).toEqual({
      source: 'git_blob',
      durableIdentity: {
        owner: 'octo',
        repository: 'vibespace',
        resolvedCommitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        path: 'src/main.ts',
        blobSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      },
      expiringUrlStored: false,
      executable: false,
    });
    expect(
      planGitHubContentRetrieval({
        identity,
        path: 'assets/demo.mp4',
        blobSha: 'cccccccccccccccccccccccccccccccccccccccc',
        purpose: 'raw_media',
        estimatedFileCount: 1,
        archiveJustified: false,
      }).source,
    ).toBe('raw_media');
    expect(
      planGitHubContentRetrieval({
        identity,
        path: '',
        blobSha: null,
        purpose: 'bulk_snapshot',
        estimatedFileCount: 5_000,
        archiveJustified: true,
      }).source,
    ).toBe('archive');
    expect(() =>
      planGitHubContentRetrieval({
        identity,
        path: '',
        blobSha: null,
        purpose: 'bulk_snapshot',
        estimatedFileCount: 10,
        archiveJustified: true,
      }),
    ).toThrow(/archive/i);
  });

  it('supports all seven bounded large-repository scope modes', () => {
    expect(GITHUB_REPOSITORY_SCOPE_MODES).toEqual([
      'entire_repository',
      'selected_folders',
      'selected_files',
      'source_code_only',
      'docs_only',
      'active_package',
      'custom',
    ]);
    expect(
      buildGitHubRepositoryScope({
        mode: 'custom',
        selectedPaths: [],
        activePackageRoot: null,
        include: ['apps/**', 'packages/shared/**'],
        exclude: ['**/dist/**'],
      }),
    ).toEqual({
      mode: 'custom',
      selectedPaths: [],
      activePackageRoot: null,
      include: ['apps/**', 'packages/shared/**'],
      exclude: ['**/dist/**'],
    });
    expect(() =>
      buildGitHubRepositoryScope({
        mode: 'selected_folders',
        selectedPaths: [],
        activePackageRoot: null,
        include: [],
        exclude: [],
      }),
    ).toThrow(/selected path/i);
  });

  it('detects monorepos and creates package-specific maps with cross-package edges', () => {
    expect(
      buildGitHubMonorepoPlan({
        workspaceManifestPaths: ['package.json', 'pnpm-workspace.yaml'],
        packageRoots: ['apps/desktop', 'packages/shared'],
        selectedPackageRoot: 'apps/desktop',
      }),
    ).toEqual({
      detected: true,
      workspaceManifestPaths: ['package.json', 'pnpm-workspace.yaml'],
      packageRoots: ['apps/desktop', 'packages/shared'],
      mapScope: { mode: 'active_package', root: 'apps/desktop' },
      crossPackageEdges: true,
    });
  });

  it('represents submodules but fetches content only after all three trust gates', () => {
    const approval = {
      approvalId: 'approval-1',
      actor: 'direct_user' as const,
      parentAccountId: identity.accountId,
      parentInstallationId: identity.installationId,
      parentOwner: identity.owner,
      parentRepository: identity.repository,
      parentResolvedCommitSha: identity.resolvedCommitSha,
      path: 'vendor/shared',
      linkedOwner: 'octo',
      linkedRepository: 'shared',
      linkedCommitSha: 'dddddddddddddddddddddddddddddddddddddddd',
      approvedAt: '2026-07-26T07:00:00.000Z',
    };
    const trusted = {
      getSubmoduleAccess: () => ({ userHasAccess: true, appInstalled: false }),
      isDirectUserApprovalValid: (candidate: typeof approval) =>
        candidate.approvalId === 'approval-1',
    };
    expect(
      planGitHubSubmodule(
        {
          identity,
          path: 'vendor/shared',
          linkedOwner: 'octo',
          linkedRepository: 'shared',
          commitSha: 'dddddddddddddddddddddddddddddddddddddddd',
          approval,
        },
        trusted,
      ),
    ).toEqual({
      entityType: 'linked_repository',
      path: 'vendor/shared',
      linkedRepository: {
        owner: 'octo',
        repository: 'shared',
        commitSha: 'dddddddddddddddddddddddddddddddddddddddd',
      },
      authorization: {
        approvalId: 'approval-1',
        parentIdentity: identity,
      },
      fetchAllowed: false,
      missingGates: ['app_installation'],
      executable: false,
    });
    expect(() =>
      planGitHubSubmodule(
        {
          identity: { ...identity, repository: 'vibespace-fork' },
          path: 'vendor/shared',
          linkedOwner: 'octo',
          linkedRepository: 'shared',
          commitSha: 'dddddddddddddddddddddddddddddddddddddddd',
          approval,
        },
        trusted,
      ),
    ).toThrow(/binding/i);
  });

  it('represents LFS pointers and downloads objects only when needed and permitted', () => {
    const pointer = parseGitHubLfsPointer(
      'version https://git-lfs.github.com/spec/v1\n' +
        'oid sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee\n' +
        'size 12345\n',
    );
    expect(pointer).toEqual({
      version: 'https://git-lfs.github.com/spec/v1',
      oid: 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      size: 12345,
    });
    expect(
      planGitHubLfsObject(identity, 'assets/model.bin', pointer, {
        getLfsPermission: () => ({ needed: true, permitted: false }),
      }),
    ).toEqual({
      pointer,
      represented: true,
      downloadAllowed: false,
      reason: 'permission_required',
      executable: false,
    });
    expect(
      planGitHubLfsObject(identity, 'assets/model.bin', pointer, {
        getLfsPermission: () => ({ needed: true, permitted: true }),
      }).downloadAllowed,
    ).toBe(true);
  });

  it('fails closed for traversal, path, response, and pointer abuse', () => {
    let calls = 0;
    const accessor = {
      ...identity,
      get owner() {
        calls += 1;
        return 'octo';
      },
    };
    expect(() =>
      planGitHubContentRetrieval({
        identity: accessor,
        path: 'README.md',
        blobSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        purpose: 'single_blob',
        estimatedFileCount: 1,
        archiveJustified: false,
      }),
    ).toThrow(/input|identity/i);
    expect(calls).toBe(0);
    expect(() =>
      buildGitHubRepositoryScope({
        mode: 'selected_files',
        selectedPaths: ['../secret'],
        activePackageRoot: null,
        include: [],
        exclude: [],
      }),
    ).toThrow(/path/i);
    expect(() =>
      planGitHubTreeRetrieval({
        identity,
        rootTreeSha: '1111111111111111111111111111111111111111',
        recursiveResponse: {
          treeSha: '1111111111111111111111111111111111111111',
          recursive: true,
          truncated: true,
          etag: '"recursive-root"',
          entries: [],
        },
        recoveredTrees: [
          {
            treeSha: '1111111111111111111111111111111111111111',
            recursive: false,
            truncated: false,
            etag: '"root"',
            entries: [
              {
                path: 'cycle',
                type: 'tree',
                sha: '1111111111111111111111111111111111111111',
              },
            ],
          },
        ],
        cachedEtags: [],
        rateLimit: { remaining: 1, resetAt: '2026-07-26T07:00:00.000Z' },
      }),
    ).toThrow(/cycle/i);
    expect(() => parseGitHubLfsPointer('x'.repeat(100_000))).toThrow(/pointer/i);
  });
});
