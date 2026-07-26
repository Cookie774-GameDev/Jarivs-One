import { describe, expect, it, vi } from 'vitest';
import {
  GITHUB_REPOSITORY_SCOPE_MODES,
  buildGitHubMonorepoPlan,
  buildGitHubRepositoryScope,
  createGitHubIndexCheckpoint,
  executeGitHubIndexCheckpoint,
  parseGitHubLfsPointer,
  parseGitHubIndexCheckpoint,
  planGitHubContentRetrieval,
  planGitHubLfsObject,
  planGitHubSubmodule,
  planGitHubTreeRetrieval,
  serializeGitHubIndexCheckpoint,
  type GitHubTreeRetrievalRequest,
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

describe('executable GitHub indexing checkpoints', () => {
  const requests: GitHubTreeRetrievalRequest[] = Array.from({ length: 25 }, (_, index) => ({
    api: 'git_trees',
    treeSha: index.toString(16).padStart(40, '0'),
    path: `src-${index}`,
    recursive: false,
    ifNoneMatch: `"etag-${index}"`,
  }));
  const responseFor = (request: GitHubTreeRetrievalRequest) => ({
    treeSha: request.treeSha,
    recursive: false,
    truncated: false,
    etag: request.ifNoneMatch ?? '"fresh"',
    entries: [],
  });
  const applier = {
    async inspectCommitted() {
      return [];
    },
    async applyOnce(
      _requestKey: string,
      _identity: typeof identity,
      _request: GitHubTreeRetrievalRequest,
      response: { status: 200 | 304 },
    ) {
      return response.status === 304 ? ('unchanged' as const) : ('committed' as const);
    },
  };

  it('sends conditional headers and enforces the actual worker concurrency cap', async () => {
    let active = 0;
    let maximumActive = 0;
    const headers: Readonly<Record<string, string>>[] = [];
    const identities: (typeof identity)[] = [];
    const result = await executeGitHubIndexCheckpoint({
      checkpoint: createGitHubIndexCheckpoint(identity, requests),
      expectedIdentity: identity,
      trustedRequests: requests,
      concurrency: 8,
      now: () => Date.parse('2026-07-26T09:00:00.000Z'),
      applier,
      transport: {
        async execute(boundIdentity, request, requestHeaders) {
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          identities.push(boundIdentity as typeof identity);
          headers.push(requestHeaders);
          await Promise.resolve();
          active -= 1;
          const status = request.path === 'src-0' ? 304 : 200;
          return {
            status,
            etag: request.ifNoneMatch,
            retryAfter: null,
            body: status === 304 ? null : responseFor(request),
          };
        },
      },
    });
    expect(maximumActive).toBe(8);
    expect(headers).toHaveLength(25);
    expect(headers.every((value) => value['If-None-Match']?.startsWith('"etag-'))).toBe(true);
    expect(identities.every((value) => value.accountId === identity.accountId)).toBe(true);
    expect(result.error).toBeNull();
    expect(result.results).toHaveLength(25);
    expect(result.results.find(({ status }) => status === 304)).toBeDefined();
    expect(result.results.every((entry) => !('body' in entry))).toBe(true);
    expect(result.checkpoint.pending).toEqual([]);
  });

  it('honors Retry-After without executing early and preserves pending work', async () => {
    const execute = vi.fn(async () => ({
      status: 429 as const,
      etag: null,
      retryAfter: '120',
      body: null,
    }));
    const first = await executeGitHubIndexCheckpoint({
      checkpoint: createGitHubIndexCheckpoint(identity, requests.slice(0, 3)),
      expectedIdentity: identity,
      trustedRequests: requests.slice(0, 3),
      concurrency: 1,
      now: () => Date.parse('2026-07-26T09:00:00.000Z'),
      applier,
      transport: { execute },
    });
    expect(first.checkpoint.retryAt).toBe('2026-07-26T09:02:00.000Z');
    expect(first.checkpoint.pending).toHaveLength(3);
    const earlyExecute = vi.fn();
    const early = await executeGitHubIndexCheckpoint({
      checkpoint: first.checkpoint,
      expectedIdentity: identity,
      trustedRequests: requests.slice(0, 3),
      concurrency: 1,
      now: () => Date.parse('2026-07-26T09:01:00.000Z'),
      applier,
      transport: { execute: earlyExecute as never },
    });
    expect(earlyExecute).not.toHaveBeenCalled();
    expect(early.checkpoint).toEqual(first.checkpoint);
  });

  it('serializes a closed versioned checkpoint and resumes after restart', async () => {
    const checkpoint = createGitHubIndexCheckpoint(identity, requests.slice(0, 2));
    const restored = parseGitHubIndexCheckpoint(serializeGitHubIndexCheckpoint(checkpoint));
    const completed = await executeGitHubIndexCheckpoint({
      checkpoint: restored,
      expectedIdentity: identity,
      trustedRequests: requests.slice(0, 2),
      concurrency: 2,
      now: () => Date.parse('2026-07-26T09:00:00.000Z'),
      applier,
      transport: {
        async execute(_identity, request) {
          return {
            status: 200,
            etag: request.ifNoneMatch,
            retryAfter: null,
            body: responseFor(request),
          };
        },
      },
    });
    expect(completed.checkpoint).toMatchObject({
      version: 1,
      revision: 1,
      retryAt: null,
      pending: [],
    });
    expect(
      parseGitHubIndexCheckpoint(serializeGitHubIndexCheckpoint(completed.checkpoint)),
    ).toEqual(completed.checkpoint);
  });

  it('persists a validated response before completing its request', async () => {
    const applyOnce = vi.fn(
      async (
        _requestKey: string,
        _identity: typeof identity,
        _request: GitHubTreeRetrievalRequest,
        _response: { status: 200 | 304; etag: string; body: unknown },
      ) => 'missing_cache' as const,
    );
    const result = await executeGitHubIndexCheckpoint({
      checkpoint: createGitHubIndexCheckpoint(identity, requests.slice(0, 1)),
      expectedIdentity: identity,
      trustedRequests: requests.slice(0, 1),
      concurrency: 1,
      now: () => Date.parse('2026-07-26T09:00:00.000Z'),
      applier: { ...applier, applyOnce },
      transport: {
        async execute(_identity, request) {
          return {
            status: 200,
            etag: request.ifNoneMatch,
            retryAfter: null,
            body: responseFor(request),
          };
        },
      },
    });
    expect(applyOnce).toHaveBeenCalledOnce();
    expect(applyOnce.mock.calls[0]?.[3]).toMatchObject({
      status: 200,
      etag: '"etag-0"',
      body: { treeSha: requests[0]?.treeSha },
    });
    expect(result.error).toBe('apply_failed');
    expect(result.checkpoint.pending).toHaveLength(1);
    expect(result.checkpoint.completedRequestKeys).toEqual([]);
  });

  it('rejects authority changes before transport and poisoned checkpoint overlap', async () => {
    const execute = vi.fn();
    await expect(
      executeGitHubIndexCheckpoint({
        checkpoint: createGitHubIndexCheckpoint(identity, requests.slice(0, 1)),
        expectedIdentity: { ...identity, accountId: 'different-account' },
        trustedRequests: requests.slice(0, 1),
        concurrency: 1,
        now: () => Date.parse('2026-07-26T09:00:00.000Z'),
        applier,
        transport: { execute: execute as never },
      }),
    ).rejects.toThrow(/execution input/i);
    expect(execute).not.toHaveBeenCalled();

    const checkpoint = createGitHubIndexCheckpoint(identity, requests.slice(0, 1));
    expect(() =>
      parseGitHubIndexCheckpoint(
        JSON.stringify({
          ...checkpoint,
          completedRequestKeys: [
            JSON.stringify([
              'git_trees',
              requests[0]?.treeSha,
              requests[0]?.path,
              0,
              requests[0]?.ifNoneMatch,
            ]),
          ],
        }),
      ),
    ).toThrow(/duplicates/i);
  });

  it('keeps the latest concurrent Retry-After deadline using response receipt time', async () => {
    type RateResponse = {
      status: 429;
      etag: null;
      retryAfter: string;
      body: null;
    };
    let resolveShort!: (response: RateResponse) => void;
    let resolveLong!: (response: RateResponse) => void;
    let started = 0;
    let resolveStarted!: () => void;
    const bothStarted = new Promise<void>((resolve) => {
      resolveStarted = resolve;
    });
    const short = new Promise<RateResponse>((resolve) => {
      resolveShort = resolve;
    });
    const long = new Promise<RateResponse>((resolve) => {
      resolveLong = resolve;
    });
    const times = [
      Date.parse('2026-07-26T09:00:00.000Z'),
      Date.parse('2026-07-26T09:00:01.000Z'),
      Date.parse('2026-07-26T09:00:05.000Z'),
    ];
    const execution = executeGitHubIndexCheckpoint({
      checkpoint: createGitHubIndexCheckpoint(identity, requests.slice(0, 2)),
      expectedIdentity: identity,
      trustedRequests: requests.slice(0, 2),
      concurrency: 2,
      now: () => times.shift() ?? Date.parse('2026-07-26T09:00:05.000Z'),
      applier,
      transport: {
        execute(_identity, request) {
          started += 1;
          if (started === 2) resolveStarted();
          return request.path === 'src-0' ? short : long;
        },
      },
    });
    await bothStarted;
    resolveShort({ status: 429, etag: null, retryAfter: '10', body: null });
    resolveLong({ status: 429, etag: null, retryAfter: '20', body: null });
    const result = await execution;
    expect(result.checkpoint.retryAt).toBe('2026-07-26T09:00:25.000Z');
    expect(result.checkpoint.pending).toHaveLength(2);
  });

  it('returns a resumable checkpoint after a transport failure', async () => {
    let call = 0;
    const result = await executeGitHubIndexCheckpoint({
      checkpoint: createGitHubIndexCheckpoint(identity, requests.slice(0, 2)),
      expectedIdentity: identity,
      trustedRequests: requests.slice(0, 2),
      concurrency: 1,
      now: () => Date.parse('2026-07-26T09:00:00.000Z'),
      applier,
      transport: {
        async execute(_identity, request) {
          call += 1;
          if (call === 2) throw new Error('offline');
          return {
            status: 200,
            etag: request.ifNoneMatch,
            retryAfter: null,
            body: responseFor(request),
          };
        },
      },
    });
    expect(result.error).toBe('transport_failed');
    expect(result.results).toHaveLength(1);
    expect(result.checkpoint.pending).toHaveLength(1);
    expect(result.checkpoint.completedRequestKeys).toHaveLength(1);
    expect(parseGitHubIndexCheckpoint(serializeGitHubIndexCheckpoint(result.checkpoint))).toEqual(
      result.checkpoint,
    );
  });

  it('cancels promptly even when an in-flight transport ignores AbortSignal', async () => {
    const controller = new AbortController();
    const never = new Promise<never>(() => undefined);
    const execution = executeGitHubIndexCheckpoint({
      checkpoint: createGitHubIndexCheckpoint(identity, requests.slice(0, 1)),
      expectedIdentity: identity,
      trustedRequests: requests.slice(0, 1),
      concurrency: 1,
      now: () => Date.parse('2026-07-26T09:00:00.000Z'),
      signal: controller.signal,
      applier,
      transport: { execute: () => never },
    });
    controller.abort('test cancellation');
    await expect(execution).resolves.toMatchObject({
      error: 'aborted',
      checkpoint: { pending: [requests[0]] },
    });
  });

  it('binds validated tree and directory response coordinates to the request', async () => {
    const treeRequest = requests[0]!;
    const directoryRequest: GitHubTreeRetrievalRequest = {
      api: 'repository_contents',
      treeSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      path: 'packages/app',
      page: 2,
      pageSize: 100,
      ifNoneMatch: '"directory"',
    };
    for (const testCase of [
      {
        request: treeRequest,
        body: { ...responseFor(treeRequest), treeSha: 'cccccccccccccccccccccccccccccccccccccccc' },
      },
      {
        request: treeRequest,
        body: { ...responseFor(treeRequest), recursive: true },
      },
      {
        request: directoryRequest,
        body: {
          treeSha: directoryRequest.treeSha,
          path: 'packages/other',
          page: directoryRequest.page,
          hasNext: false,
          etag: directoryRequest.ifNoneMatch!,
          entries: [],
        },
      },
      {
        request: directoryRequest,
        body: {
          treeSha: directoryRequest.treeSha,
          path: directoryRequest.path,
          page: 3,
          hasNext: false,
          etag: directoryRequest.ifNoneMatch!,
          entries: [],
        },
      },
    ]) {
      const result = await executeGitHubIndexCheckpoint({
        checkpoint: createGitHubIndexCheckpoint(identity, [testCase.request]),
        expectedIdentity: identity,
        trustedRequests: [testCase.request],
        concurrency: 1,
        now: () => Date.parse('2026-07-26T09:00:00.000Z'),
        applier,
        transport: {
          async execute() {
            return {
              status: 200,
              etag: testCase.request.ifNoneMatch,
              retryAfter: null,
              body: testCase.body,
            };
          },
        },
      });
      expect(result.error).toBe('invalid_response');
      expect(result.checkpoint.pending).toEqual([testCase.request]);
    }
  });

  it('rejects checkpoint requests that are absent from or altered from the trusted plan', async () => {
    const injected = {
      ...requests[0]!,
      treeSha: 'dddddddddddddddddddddddddddddddddddddddd',
      path: 'forged',
    };
    await expect(
      executeGitHubIndexCheckpoint({
        checkpoint: createGitHubIndexCheckpoint(identity, [injected]),
        expectedIdentity: identity,
        trustedRequests: requests.slice(0, 1),
        concurrency: 1,
        now: () => Date.parse('2026-07-26T09:00:00.000Z'),
        applier,
        transport: { execute: vi.fn() as never },
      }),
    ).rejects.toThrow(/execution input/i);
  });

  it('returns a rate checkpoint when a peer ignores cancellation forever', async () => {
    const result = await executeGitHubIndexCheckpoint({
      checkpoint: createGitHubIndexCheckpoint(identity, requests.slice(0, 2)),
      expectedIdentity: identity,
      trustedRequests: requests.slice(0, 2),
      concurrency: 2,
      now: () => Date.parse('2026-07-26T09:00:00.000Z'),
      applier,
      transport: {
        execute(_identity, request) {
          return request.path === 'src-0'
            ? Promise.resolve({
                status: 429 as const,
                etag: null,
                retryAfter: '30',
                body: null,
              })
            : new Promise<never>(() => undefined);
        },
      },
    });
    expect(result.error).toBeNull();
    expect(result.checkpoint.retryAt).toBe('2026-07-26T09:00:30.000Z');
    expect(result.checkpoint.pending).toHaveLength(2);
  });

  it('resumes idempotently after an applier commits but loses acknowledgement', async () => {
    const controller = new AbortController();
    const committed = new Set<string>();
    let resolveApplyStarted!: () => void;
    const applyStarted = new Promise<void>((resolve) => {
      resolveApplyStarted = resolve;
    });
    const checkpoint = createGitHubIndexCheckpoint(identity, requests.slice(0, 1));
    const transport = {
      async execute(_identity: typeof identity, request: GitHubTreeRetrievalRequest) {
        return {
          status: 200 as const,
          etag: request.ifNoneMatch,
          retryAfter: null,
          body: responseFor(request),
        };
      },
    };
    const interrupted = executeGitHubIndexCheckpoint({
      checkpoint,
      expectedIdentity: identity,
      trustedRequests: requests.slice(0, 1),
      concurrency: 1,
      now: () => Date.parse('2026-07-26T09:00:00.000Z'),
      signal: controller.signal,
      transport,
      applier: {
        async inspectCommitted() {
          return [];
        },
        applyOnce(requestKey) {
          committed.add(requestKey);
          resolveApplyStarted();
          return new Promise<never>(() => undefined);
        },
      },
    });
    await applyStarted;
    controller.abort('lost acknowledgement');
    const resumable = await interrupted;
    expect(resumable.error).toBe('aborted');
    expect(resumable.checkpoint.pending).toHaveLength(1);

    const resumed = await executeGitHubIndexCheckpoint({
      checkpoint: resumable.checkpoint,
      expectedIdentity: identity,
      trustedRequests: requests.slice(0, 1),
      concurrency: 1,
      now: () => Date.parse('2026-07-26T09:00:01.000Z'),
      transport,
      applier: {
        async inspectCommitted(_identity, requestKeys) {
          return requestKeys
            .filter((requestKey) => committed.has(requestKey))
            .map((requestKey) => ({ requestKey, requiresReplan: false }));
        },
        async applyOnce(requestKey) {
          return committed.has(requestKey) ? ('already_committed' as const) : ('conflict' as const);
        },
      },
    });
    expect(resumed.error).toBeNull();
    expect(resumed.checkpoint.pending).toEqual([]);
  });

  it('reconciles forged completion against authoritative committed state', async () => {
    const request = requests[0]!;
    const requestKey = JSON.stringify([
      request.api,
      request.treeSha,
      request.path,
      0,
      request.ifNoneMatch,
    ]);
    const initial = createGitHubIndexCheckpoint(identity, [request]);
    const forged = parseGitHubIndexCheckpoint(
      JSON.stringify({
        ...initial,
        pending: [],
        completedRequestKeys: [requestKey],
      }),
    );
    const execute = vi.fn(async (_identity, current: GitHubTreeRetrievalRequest) => ({
      status: 200 as const,
      etag: current.ifNoneMatch,
      retryAfter: null,
      body: responseFor(current),
    }));
    const result = await executeGitHubIndexCheckpoint({
      checkpoint: forged,
      expectedIdentity: identity,
      trustedRequests: [request],
      concurrency: 1,
      now: () => Date.parse('2026-07-26T09:00:00.000Z'),
      applier,
      transport: { execute },
    });
    expect(execute).toHaveBeenCalledOnce();
    expect(result.error).toBeNull();
    expect(result.checkpoint.completedRequestKeys).toEqual([requestKey]);
  });

  it('rejects a restored retry deadline beyond the bounded window', async () => {
    const checkpoint = createGitHubIndexCheckpoint(identity, requests.slice(0, 1));
    const poisoned = parseGitHubIndexCheckpoint(
      JSON.stringify({
        ...checkpoint,
        retryAt: '2026-07-28T09:00:00.000Z',
      }),
    );
    await expect(
      executeGitHubIndexCheckpoint({
        checkpoint: poisoned,
        expectedIdentity: identity,
        trustedRequests: requests.slice(0, 1),
        concurrency: 1,
        now: () => Date.parse('2026-07-26T09:00:00.000Z'),
        applier,
        transport: { execute: vi.fn() as never },
      }),
    ).rejects.toThrow(/checkpoint retry/i);
  });

  it('persists replan-required state for truncated trees and paginated directories', async () => {
    const directoryRequest: GitHubTreeRetrievalRequest = {
      api: 'repository_contents',
      treeSha: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      path: 'packages/app',
      page: 1,
      pageSize: 100,
      ifNoneMatch: '"directory-page-1"',
    };
    const cases = [
      {
        request: requests[0]!,
        body: { ...responseFor(requests[0]!), truncated: true },
      },
      {
        request: directoryRequest,
        body: {
          treeSha: directoryRequest.treeSha,
          path: directoryRequest.path,
          page: directoryRequest.page,
          hasNext: true,
          etag: directoryRequest.ifNoneMatch!,
          entries: [],
        },
      },
    ];
    for (const testCase of cases) {
      const states = new Map<string, boolean>();
      const durableApplier = {
        async inspectCommitted(_identity: typeof identity, requestKeys: readonly string[]) {
          return requestKeys
            .filter((requestKey) => states.has(requestKey))
            .map((requestKey) => ({
              requestKey,
              requiresReplan: states.get(requestKey) === true,
            }));
        },
        async applyOnce(
          requestKey: string,
          _identity: typeof identity,
          _request: GitHubTreeRetrievalRequest,
          response: { body: { truncated?: boolean; hasNext?: boolean } | null },
        ) {
          states.set(
            requestKey,
            response.body?.truncated === true || response.body?.hasNext === true,
          );
          return 'committed' as const;
        },
      };
      const first = await executeGitHubIndexCheckpoint({
        checkpoint: createGitHubIndexCheckpoint(identity, [testCase.request]),
        expectedIdentity: identity,
        trustedRequests: [testCase.request],
        concurrency: 1,
        now: () => Date.parse('2026-07-26T09:00:00.000Z'),
        applier: durableApplier,
        transport: {
          async execute() {
            return {
              status: 200 as const,
              etag: testCase.request.ifNoneMatch,
              retryAfter: null,
              body: testCase.body,
            };
          },
        },
      });
      expect(first.error).toBe('replan_required');
      expect(first.checkpoint.pending).toEqual([]);
      expect(first.checkpoint.replanRequiredRequestKeys).toHaveLength(1);

      const execute = vi.fn();
      const restarted = await executeGitHubIndexCheckpoint({
        checkpoint: parseGitHubIndexCheckpoint(serializeGitHubIndexCheckpoint(first.checkpoint)),
        expectedIdentity: identity,
        trustedRequests: [testCase.request],
        concurrency: 1,
        now: () => Date.parse('2026-07-26T09:00:01.000Z'),
        applier: durableApplier,
        transport: { execute: execute as never },
      });
      expect(execute).not.toHaveBeenCalled();
      expect(restarted.error).toBe('replan_required');
      expect(restarted.checkpoint.replanRequiredRequestKeys).toEqual(
        first.checkpoint.replanRequiredRequestKeys,
      );
    }
  });
});
