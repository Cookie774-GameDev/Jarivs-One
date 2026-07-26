export const GITHUB_REPOSITORY_SCOPE_MODES = Object.freeze([
  'entire_repository',
  'selected_folders',
  'selected_files',
  'source_code_only',
  'docs_only',
  'active_package',
  'custom',
] as const);

export type GitHubRepositoryScopeMode = (typeof GITHUB_REPOSITORY_SCOPE_MODES)[number];
export type GitHubTreeEntryType = 'blob' | 'tree' | 'commit';
export type GitHubContentPurpose =
  | 'single_blob'
  | 'directory_metadata'
  | 'raw_media'
  | 'bulk_snapshot';

export interface GitHubRepositoryIdentity {
  accountId: string;
  installationId: string;
  owner: string;
  repository: string;
  resolvedCommitSha: string;
}

export interface GitHubTreeEntry {
  path: string;
  type: GitHubTreeEntryType;
  sha: string;
  size?: number;
}

export interface GitHubTreeResponse {
  treeSha: string;
  recursive: boolean;
  truncated: boolean;
  etag: string;
  entries: readonly GitHubTreeEntry[];
}

export interface GitHubTreeCacheEntry {
  treeSha: string;
  etag: string;
}

export interface GitHubDirectoryPage {
  treeSha: string;
  path: string;
  page: number;
  hasNext: boolean;
  etag: string;
  entries: readonly GitHubTreeEntry[];
}

export interface GitHubTreeRetrievalInput {
  identity: GitHubRepositoryIdentity;
  rootTreeSha: string;
  recursiveResponse: GitHubTreeResponse;
  recoveredTrees: readonly GitHubTreeResponse[];
  recoveredDirectories?: readonly GitHubDirectoryPage[];
  cachedEtags: readonly GitHubTreeCacheEntry[];
  rateLimit: { remaining: number; resetAt: string };
}

export type GitHubTreeRetrievalRequest =
  | {
      api: 'git_trees';
      treeSha: string;
      path: string;
      recursive: false;
      ifNoneMatch: string | null;
    }
  | {
      api: 'repository_contents';
      treeSha: string;
      path: string;
      page: number;
      pageSize: 100;
      ifNoneMatch: string | null;
    };

export interface GitHubContentRetrievalInput {
  identity: GitHubRepositoryIdentity;
  path: string;
  blobSha: string | null;
  purpose: GitHubContentPurpose;
  estimatedFileCount: number;
  archiveJustified: boolean;
}

export interface GitHubRepositoryScopeInput {
  mode: GitHubRepositoryScopeMode;
  selectedPaths: readonly string[];
  activePackageRoot: string | null;
  include: readonly string[];
  exclude: readonly string[];
}

export interface GitHubMonorepoInput {
  workspaceManifestPaths: readonly string[];
  packageRoots: readonly string[];
  selectedPackageRoot: string | null;
}

export interface GitHubSubmoduleInput {
  identity: GitHubRepositoryIdentity;
  path: string;
  linkedOwner: string;
  linkedRepository: string;
  commitSha: string;
  approval: GitHubSubmoduleApproval;
}

export interface GitHubSubmoduleApproval {
  approvalId: string;
  actor: 'direct_user';
  parentAccountId: string;
  parentInstallationId: string;
  parentOwner: string;
  parentRepository: string;
  parentResolvedCommitSha: string;
  path: string;
  linkedOwner: string;
  linkedRepository: string;
  linkedCommitSha: string;
  approvedAt: string;
}

export interface GitHubSubmoduleAuthority {
  getSubmoduleAccess(
    parent: Readonly<GitHubRepositoryIdentity>,
    path: string,
    linkedRepository: Readonly<{
      owner: string;
      repository: string;
      commitSha: string;
    }>,
  ): { userHasAccess: boolean; appInstalled: boolean } | undefined;
  isDirectUserApprovalValid(approval: Readonly<GitHubSubmoduleApproval>): boolean;
}

export interface GitHubLfsAuthority {
  getLfsPermission(
    identity: Readonly<GitHubRepositoryIdentity>,
    path: string,
    pointer: Readonly<GitHubLfsPointer>,
  ): { needed: boolean; permitted: boolean } | undefined;
}

export interface GitHubLfsPointer {
  version: 'https://git-lfs.github.com/spec/v1';
  oid: `sha256:${string}`;
  size: number;
}

const SHA = /^[a-fA-F0-9]{40}$/u;
const SHA256 = /^[a-fA-F0-9]{64}$/u;
const SAFE_APPROVAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,299}$/u;
const SAFE_OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,98}[A-Za-z0-9])?$/u;
const SAFE_REPOSITORY = /^[A-Za-z0-9_.-]{1,100}$/u;
const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u;
const MAX_ENTRIES = 100_000;
const MAX_NODES = 500_000;
const MAX_CHARS = 15_000_000;
const MAX_BATCH = 20;
const MAX_TRAVERSAL_ITEMS = 500_000;

function fail(reason: string): never {
  throw new Error(`Invalid GitHub retrieval ${reason}.`);
}

function text(value: unknown, reason: string, maximum = 500): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximum ||
    value.trim() !== value ||
    FORBIDDEN.test(value)
  ) {
    fail(reason);
  }
  return value;
}

function owner(value: unknown): string {
  const result = text(value, 'identity owner', 100);
  if (!SAFE_OWNER.test(result)) fail('identity owner');
  return result;
}

function stableId(value: unknown, reason: string): string {
  const result = text(value, reason, 300);
  if (!SAFE_APPROVAL_ID.test(result)) fail(reason);
  return result;
}

function repository(value: unknown): string {
  const result = text(value, 'identity repository', 100);
  if (!SAFE_REPOSITORY.test(result) || result === '.' || result === '..') {
    fail('identity repository');
  }
  return result;
}

function sha(value: unknown, reason = 'SHA'): string {
  const result = text(value, reason, 40);
  if (!SHA.test(result)) fail(reason);
  return result.toLowerCase();
}

function timestamp(value: unknown, reason: string): string {
  const result = text(value, reason, 40);
  const milliseconds = Date.parse(result);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== result) {
    fail(reason);
  }
  return result;
}

function path(value: unknown, reason = 'path', allowEmpty = false): string {
  if (allowEmpty && value === '') return '';
  const result = text(value, reason, 1_024).replaceAll('\\', '/');
  if (
    result.startsWith('/') ||
    result.endsWith('/') ||
    result.includes('//') ||
    result.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    fail(reason);
  }
  return result;
}

function glob(value: unknown, reason: string): string {
  const result = text(value, reason, 1_024).replaceAll('\\', '/');
  if (
    result.startsWith('/') ||
    result.includes('//') ||
    result.split('/').some((part) => part === '..')
  ) {
    fail(reason);
  }
  return result;
}

function assertClosed(
  value: unknown,
  reason: string,
  depth = 0,
  budget = { nodes: 0, chars: 0 },
): void {
  budget.nodes += 1;
  if (budget.nodes > MAX_NODES || depth > 8) fail(reason);
  if (typeof value === 'string') {
    if (value.length > 100_000) fail(reason);
    budget.chars += value.length;
    if (budget.chars > MAX_CHARS) fail(reason);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  let prototype: object | null;
  let keys: PropertyKey[];
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value);
    keys = Reflect.ownKeys(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return fail(reason);
  }
  if (keys.some((key) => typeof key !== 'string')) fail(reason);
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype || value.length > MAX_ENTRIES) fail(reason);
    if (keys.length !== value.length + 1 || !keys.includes('length')) fail(reason);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) fail(reason);
      assertClosed(descriptor.value, reason, depth + 1, budget);
    }
    return;
  }
  if ((prototype !== Object.prototype && prototype !== null) || keys.length > 12) fail(reason);
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) fail(reason);
    assertClosed(descriptor.value, reason, depth + 1, budget);
  }
}

function clone<T>(value: T, reason: string): T {
  try {
    assertClosed(value, reason);
    return structuredClone(value);
  } catch {
    return fail(reason);
  }
}

function record(value: unknown, reason: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(reason);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(reason);
  return value as Record<string, unknown>;
}

function exact(
  value: Record<string, unknown>,
  keys: readonly string[],
  required: readonly string[],
  reason: string,
): void {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) fail(reason);
  if (required.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) fail(reason);
}

function unique<T>(items: readonly T[], key: (item: T) => string, reason: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    const value = key(item);
    if (seen.has(value)) fail(reason);
    seen.add(value);
  }
}

function validateIdentity(rawIdentity: GitHubRepositoryIdentity): GitHubRepositoryIdentity {
  const identity = record(clone(rawIdentity, 'identity'), 'identity');
  exact(
    identity,
    ['accountId', 'installationId', 'owner', 'repository', 'resolvedCommitSha'],
    ['accountId', 'installationId', 'owner', 'repository', 'resolvedCommitSha'],
    'identity',
  );
  return Object.freeze({
    accountId: stableId(identity.accountId, 'account ID'),
    installationId: stableId(identity.installationId, 'installation ID'),
    owner: owner(identity.owner),
    repository: repository(identity.repository),
    resolvedCommitSha: sha(identity.resolvedCommitSha, 'resolved commit SHA'),
  });
}

function validateTreeEntry(rawEntry: GitHubTreeEntry): Readonly<GitHubTreeEntry> {
  const entry = record(rawEntry, 'tree entry');
  exact(entry, ['path', 'type', 'sha', 'size'], ['path', 'type', 'sha'], 'tree entry');
  if (!['blob', 'tree', 'commit'].includes(entry.type as string)) fail('tree entry type');
  if (
    entry.size !== undefined &&
    (!Number.isSafeInteger(entry.size) || (entry.size as number) < 0)
  ) {
    fail('tree entry size');
  }
  if (entry.type !== 'blob' && entry.size !== undefined) fail('tree entry size');
  const result: GitHubTreeEntry = {
    path: path(entry.path, 'tree entry path'),
    type: entry.type as GitHubTreeEntryType,
    sha: sha(entry.sha, 'tree entry SHA'),
  };
  if (entry.size !== undefined) result.size = entry.size as number;
  return Object.freeze(result);
}

function validateTreeResponse(rawResponse: GitHubTreeResponse): Readonly<GitHubTreeResponse> {
  const response = record(rawResponse, 'tree response');
  exact(
    response,
    ['treeSha', 'recursive', 'truncated', 'etag', 'entries'],
    ['treeSha', 'recursive', 'truncated', 'etag', 'entries'],
    'tree response',
  );
  if (typeof response.recursive !== 'boolean' || typeof response.truncated !== 'boolean') {
    fail('tree response state');
  }
  if (!Array.isArray(response.entries)) fail('tree response entries');
  const entries = response.entries.map((entry) => validateTreeEntry(entry as GitHubTreeEntry));
  unique(entries, (entry) => entry.path, 'duplicate tree path');
  return Object.freeze({
    treeSha: sha(response.treeSha, 'tree SHA'),
    recursive: response.recursive,
    truncated: response.truncated,
    etag: text(response.etag, 'ETag', 500),
    entries: Object.freeze(entries),
  });
}

function validateDirectoryPage(rawPage: GitHubDirectoryPage): Readonly<GitHubDirectoryPage> {
  const page = record(rawPage, 'directory page');
  exact(
    page,
    ['treeSha', 'path', 'page', 'hasNext', 'etag', 'entries'],
    ['treeSha', 'path', 'page', 'hasNext', 'etag', 'entries'],
    'directory page',
  );
  if (
    !Number.isSafeInteger(page.page) ||
    (page.page as number) < 1 ||
    (page.page as number) > 10_000 ||
    typeof page.hasNext !== 'boolean' ||
    !Array.isArray(page.entries)
  ) {
    fail('directory page');
  }
  const entries = page.entries.map((entry) => validateTreeEntry(entry as GitHubTreeEntry));
  unique(entries, (entry) => entry.path, 'duplicate directory path');
  return Object.freeze({
    treeSha: sha(page.treeSha, 'directory tree SHA'),
    path: path(page.path, 'directory path', true),
    page: page.page as number,
    hasNext: page.hasNext,
    etag: text(page.etag, 'ETag', 500),
    entries: Object.freeze(entries),
  });
}

function joinPath(prefix: string, child: string): string {
  return prefix.length === 0 ? child : `${prefix}/${child}`;
}

function freezeRequest(request: GitHubTreeRetrievalRequest): GitHubTreeRetrievalRequest {
  return Object.freeze(request);
}

export function planGitHubTreeRetrieval(rawInput: GitHubTreeRetrievalInput) {
  const input = record(clone(rawInput, 'tree input'), 'tree input');
  exact(
    input,
    [
      'identity',
      'rootTreeSha',
      'recursiveResponse',
      'recoveredTrees',
      'recoveredDirectories',
      'cachedEtags',
      'rateLimit',
    ],
    ['identity', 'rootTreeSha', 'recursiveResponse', 'recoveredTrees', 'cachedEtags', 'rateLimit'],
    'tree input',
  );
  const identity = validateIdentity(input.identity as GitHubRepositoryIdentity);
  const rootTreeSha = sha(input.rootTreeSha, 'root tree SHA');
  const recursiveResponse = validateTreeResponse(input.recursiveResponse as GitHubTreeResponse);
  if (!recursiveResponse.recursive || recursiveResponse.treeSha !== rootTreeSha) {
    fail('recursive root response');
  }
  if (!Array.isArray(input.recoveredTrees) || !Array.isArray(input.cachedEtags)) {
    fail('tree recovery');
  }
  const recoveredTrees = (input.recoveredTrees as GitHubTreeResponse[]).map((response) => {
    const validated = validateTreeResponse(response);
    if (validated.recursive) fail('recovered tree mode');
    return validated;
  });
  unique(recoveredTrees, (response) => response.treeSha, 'duplicate recovered tree');
  if (input.recoveredDirectories !== undefined && !Array.isArray(input.recoveredDirectories)) {
    fail('directory recovery');
  }
  const recoveredDirectories = ((input.recoveredDirectories ?? []) as GitHubDirectoryPage[]).map(
    validateDirectoryPage,
  );
  unique(
    recoveredDirectories,
    (page) => `${page.treeSha}\0${page.path}\0${page.page}`,
    'duplicate directory page',
  );
  const directoryPages = new Map(
    recoveredDirectories.map((page) => [`${page.treeSha}\0${page.path}\0${page.page}`, page]),
  );
  const cache = new Map<string, string>();
  for (const rawCacheEntry of input.cachedEtags as GitHubTreeCacheEntry[]) {
    const entry = record(rawCacheEntry, 'ETag cache');
    exact(entry, ['treeSha', 'etag'], ['treeSha', 'etag'], 'ETag cache');
    const treeSha = sha(entry.treeSha, 'ETag tree SHA');
    if (cache.has(treeSha)) fail('duplicate ETag');
    cache.set(treeSha, text(entry.etag, 'ETag', 500));
  }
  const rawRateLimit = record(input.rateLimit, 'rate limit');
  exact(rawRateLimit, ['remaining', 'resetAt'], ['remaining', 'resetAt'], 'rate limit');
  if (
    !Number.isSafeInteger(rawRateLimit.remaining) ||
    (rawRateLimit.remaining as number) < 0 ||
    (rawRateLimit.remaining as number) > 100_000
  ) {
    fail('rate limit');
  }
  const rateLimit = Object.freeze({
    remaining: rawRateLimit.remaining as number,
    resetAt: timestamp(rawRateLimit.resetAt, 'rate limit reset'),
  });

  if (!recursiveResponse.truncated) {
    return Object.freeze({
      api: 'git_trees' as const,
      identity,
      rootTreeSha,
      complete: true,
      recursiveTruncationDetected: false,
      silentOmission: false,
      entries: recursiveResponse.entries,
      unresolvedPaths: Object.freeze([] as string[]),
      requestBatches: Object.freeze([] as GitHubTreeRetrievalRequest[][]),
      deferredRequests: Object.freeze([] as GitHubTreeRetrievalRequest[]),
      totalPendingRequests: 0,
      rateLimit,
      rateLimitPaused: false,
      usesConditionalRequests: false,
      executable: false as const,
    });
  }

  const recovered = new Map(recoveredTrees.map((response) => [response.treeSha, response]));
  const pending: GitHubTreeRetrievalRequest[] = [];
  const entries: Readonly<GitHubTreeEntry>[] = [];
  const unresolvedPaths: string[] = [];
  const visited = new Set<string>();
  const queue: Array<{ treeSha: string; prefix: string; ancestors: readonly string[] }> = [
    { treeSha: rootTreeSha, prefix: '', ancestors: [] },
  ];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.ancestors.includes(current.treeSha)) fail('tree cycle');
    const visitKey = `${current.treeSha}\0${current.prefix}`;
    if (visited.has(visitKey)) fail('tree cycle');
    visited.add(visitKey);
    const response = recovered.get(current.treeSha);
    if (!response) {
      unresolvedPaths.push(current.prefix);
      pending.push(
        freezeRequest({
          api: 'git_trees',
          treeSha: current.treeSha,
          path: current.prefix,
          recursive: false,
          ifNoneMatch: cache.get(current.treeSha) ?? null,
        }),
      );
      continue;
    }
    if (response.truncated) {
      let pageNumber = 1;
      while (pageNumber <= 10_000) {
        const page = directoryPages.get(`${current.treeSha}\0${current.prefix}\0${pageNumber}`);
        if (!page) {
          unresolvedPaths.push(current.prefix);
          pending.push(
            freezeRequest({
              api: 'repository_contents',
              treeSha: current.treeSha,
              path: current.prefix,
              page: pageNumber,
              pageSize: 100,
              ifNoneMatch: cache.get(current.treeSha) ?? null,
            }),
          );
          break;
        }
        for (const entry of page.entries) {
          const fullPath = joinPath(current.prefix, entry.path);
          entries.push(Object.freeze({ ...entry, path: fullPath }));
          if (entry.type === 'tree') {
            queue.push({
              treeSha: entry.sha,
              prefix: fullPath,
              ancestors: [...current.ancestors, current.treeSha],
            });
          }
        }
        if (!page.hasNext) break;
        pageNumber += 1;
        if (pageNumber > 10_000) fail('directory pagination');
      }
      continue;
    }
    for (const entry of response.entries) {
      const fullPath = joinPath(current.prefix, entry.path);
      const fullEntry = Object.freeze({ ...entry, path: fullPath });
      entries.push(fullEntry);
      if (entry.type === 'tree') {
        queue.push({
          treeSha: entry.sha,
          prefix: fullPath,
          ancestors: [...current.ancestors, current.treeSha],
        });
      }
    }
    if (entries.length + pending.length + queue.length > MAX_TRAVERSAL_ITEMS) {
      fail('traversal budget');
    }
  }
  unique(entries, (entry) => entry.path, 'duplicate recovered path');
  unique(
    pending,
    (request) =>
      `${request.api}:${request.treeSha}:${request.path}:${
        request.api === 'repository_contents' ? request.page : 0
      }`,
    'duplicate request',
  );
  const permittedCount = Math.min(rateLimit.remaining, pending.length);
  const permitted = pending.slice(0, permittedCount);
  const requestBatches: ReadonlyArray<ReadonlyArray<GitHubTreeRetrievalRequest>> = Object.freeze(
    Array.from({ length: Math.ceil(permitted.length / MAX_BATCH) }, (_, index) =>
      Object.freeze(permitted.slice(index * MAX_BATCH, (index + 1) * MAX_BATCH)),
    ),
  );
  const deferredRequests = Object.freeze(pending.slice(permittedCount));
  return Object.freeze({
    api: 'git_trees' as const,
    identity,
    rootTreeSha,
    complete: pending.length === 0,
    recursiveTruncationDetected: true,
    silentOmission: false,
    entries: Object.freeze(entries),
    unresolvedPaths: Object.freeze(unresolvedPaths),
    requestBatches,
    deferredRequests,
    totalPendingRequests: pending.length,
    rateLimit,
    rateLimitPaused: deferredRequests.length > 0,
    usesConditionalRequests: pending.some((request) => request.ifNoneMatch !== null),
    executable: false as const,
  });
}

export function planGitHubContentRetrieval(rawInput: GitHubContentRetrievalInput) {
  const input = record(clone(rawInput, 'content input'), 'content input');
  exact(
    input,
    ['identity', 'path', 'blobSha', 'purpose', 'estimatedFileCount', 'archiveJustified'],
    ['identity', 'path', 'blobSha', 'purpose', 'estimatedFileCount', 'archiveJustified'],
    'content input',
  );
  const identity = validateIdentity(input.identity as GitHubRepositoryIdentity);
  if (
    !['single_blob', 'directory_metadata', 'raw_media', 'bulk_snapshot'].includes(
      input.purpose as string,
    )
  ) {
    fail('content purpose');
  }
  if (
    !Number.isSafeInteger(input.estimatedFileCount) ||
    (input.estimatedFileCount as number) < 0 ||
    (input.estimatedFileCount as number) > 10_000_000
  ) {
    fail('file count');
  }
  if (typeof input.archiveJustified !== 'boolean') fail('archive justification');
  const purpose = input.purpose as GitHubContentPurpose;
  const contentPath = path(input.path, 'content path', purpose === 'bulk_snapshot');
  const blobSha = input.blobSha === null ? null : sha(input.blobSha, 'blob SHA');
  if (purpose !== 'bulk_snapshot' && blobSha === null) fail('blob SHA');
  let source: 'git_blob' | 'repository_contents' | 'raw_media' | 'archive';
  if (purpose === 'bulk_snapshot') {
    if (
      input.archiveJustified !== true ||
      (input.estimatedFileCount as number) < 1_000 ||
      contentPath !== '' ||
      blobSha !== null
    ) {
      fail('archive justification');
    }
    source = 'archive';
  } else if (purpose === 'directory_metadata') {
    source = 'repository_contents';
  } else if (purpose === 'raw_media') {
    source = 'raw_media';
  } else {
    source = 'git_blob';
  }
  return Object.freeze({
    source,
    durableIdentity: Object.freeze({
      owner: identity.owner,
      repository: identity.repository,
      resolvedCommitSha: identity.resolvedCommitSha,
      path: contentPath,
      blobSha,
    }),
    expiringUrlStored: false as const,
    executable: false as const,
  });
}

function validateStringList(
  rawItems: unknown,
  reason: string,
  validate: (value: unknown, reason: string) => string,
): readonly string[] {
  if (!Array.isArray(rawItems) || rawItems.length > 10_000) fail(reason);
  const items = rawItems.map((item) => validate(item, reason));
  unique(items, (item) => item, `duplicate ${reason}`);
  return Object.freeze(items);
}

export function buildGitHubRepositoryScope(rawInput: GitHubRepositoryScopeInput) {
  const input = record(clone(rawInput, 'scope'), 'scope');
  exact(
    input,
    ['mode', 'selectedPaths', 'activePackageRoot', 'include', 'exclude'],
    ['mode', 'selectedPaths', 'activePackageRoot', 'include', 'exclude'],
    'scope',
  );
  if (!(GITHUB_REPOSITORY_SCOPE_MODES as readonly unknown[]).includes(input.mode)) {
    fail('scope mode');
  }
  const mode = input.mode as GitHubRepositoryScopeMode;
  const selectedPaths = validateStringList(input.selectedPaths, 'selected path', path);
  const activePackageRoot =
    input.activePackageRoot === null ? null : path(input.activePackageRoot, 'package root');
  const include = validateStringList(input.include, 'include pattern', glob);
  const exclude = validateStringList(input.exclude, 'exclude pattern', glob);
  if ((mode === 'selected_folders' || mode === 'selected_files') && selectedPaths.length === 0) {
    fail('selected path');
  }
  if (mode === 'active_package' && activePackageRoot === null) fail('package root');
  if (mode === 'custom' && include.length === 0) fail('include pattern');
  if (mode !== 'custom' && (include.length > 0 || exclude.length > 0)) {
    fail('scope pattern');
  }
  if (mode !== 'active_package' && activePackageRoot !== null) fail('package root');
  if (mode !== 'selected_folders' && mode !== 'selected_files' && selectedPaths.length > 0) {
    fail('selected path');
  }
  return Object.freeze({ mode, selectedPaths, activePackageRoot, include, exclude });
}

export function buildGitHubMonorepoPlan(rawInput: GitHubMonorepoInput) {
  const input = record(clone(rawInput, 'monorepo'), 'monorepo');
  exact(
    input,
    ['workspaceManifestPaths', 'packageRoots', 'selectedPackageRoot'],
    ['workspaceManifestPaths', 'packageRoots', 'selectedPackageRoot'],
    'monorepo',
  );
  const workspaceManifestPaths = validateStringList(
    input.workspaceManifestPaths,
    'workspace manifest path',
    path,
  );
  const packageRoots = validateStringList(input.packageRoots, 'package root', path);
  const selectedPackageRoot =
    input.selectedPackageRoot === null
      ? null
      : path(input.selectedPackageRoot, 'selected package root');
  const recognized = new Set([
    'package.json',
    'pnpm-workspace.yaml',
    'lerna.json',
    'rush.json',
    'Cargo.toml',
    'go.work',
  ]);
  const detected =
    packageRoots.length > 1 &&
    workspaceManifestPaths.some((manifestPath) =>
      recognized.has(manifestPath.split('/').at(-1) ?? ''),
    );
  if (selectedPackageRoot !== null && !packageRoots.includes(selectedPackageRoot)) {
    fail('selected package root');
  }
  if (selectedPackageRoot !== null && !detected) fail('monorepo detection');
  return Object.freeze({
    detected,
    workspaceManifestPaths,
    packageRoots,
    mapScope:
      selectedPackageRoot === null
        ? Object.freeze({ mode: 'entire_repository' as const, root: null })
        : Object.freeze({ mode: 'active_package' as const, root: selectedPackageRoot }),
    crossPackageEdges: detected,
  });
}

function validateSubmoduleApproval(
  rawApproval: GitHubSubmoduleApproval,
): Readonly<GitHubSubmoduleApproval> {
  const approval = record(rawApproval, 'submodule approval');
  exact(
    approval,
    [
      'approvalId',
      'actor',
      'parentAccountId',
      'parentInstallationId',
      'parentOwner',
      'parentRepository',
      'parentResolvedCommitSha',
      'path',
      'linkedOwner',
      'linkedRepository',
      'linkedCommitSha',
      'approvedAt',
    ],
    [
      'approvalId',
      'actor',
      'parentAccountId',
      'parentInstallationId',
      'parentOwner',
      'parentRepository',
      'parentResolvedCommitSha',
      'path',
      'linkedOwner',
      'linkedRepository',
      'linkedCommitSha',
      'approvedAt',
    ],
    'submodule approval',
  );
  const approvalId = stableId(approval.approvalId, 'approval ID');
  if (approval.actor !== 'direct_user') {
    fail('submodule approval');
  }
  return Object.freeze({
    approvalId,
    actor: 'direct_user',
    parentAccountId: stableId(approval.parentAccountId, 'approval account ID'),
    parentInstallationId: stableId(approval.parentInstallationId, 'approval installation ID'),
    parentOwner: owner(approval.parentOwner),
    parentRepository: repository(approval.parentRepository),
    parentResolvedCommitSha: sha(approval.parentResolvedCommitSha, 'approval parent commit SHA'),
    path: path(approval.path, 'approval submodule path'),
    linkedOwner: owner(approval.linkedOwner),
    linkedRepository: repository(approval.linkedRepository),
    linkedCommitSha: sha(approval.linkedCommitSha, 'approval linked commit SHA'),
    approvedAt: timestamp(approval.approvedAt, 'approval timestamp'),
  });
}

export function planGitHubSubmodule(
  rawInput: GitHubSubmoduleInput,
  authority: GitHubSubmoduleAuthority,
) {
  const input = record(clone(rawInput, 'submodule'), 'submodule');
  exact(
    input,
    ['identity', 'path', 'linkedOwner', 'linkedRepository', 'commitSha', 'approval'],
    ['identity', 'path', 'linkedOwner', 'linkedRepository', 'commitSha', 'approval'],
    'submodule',
  );
  const parent = validateIdentity(input.identity as GitHubRepositoryIdentity);
  const submodulePath = path(input.path, 'submodule path');
  const linkedRepository = Object.freeze({
    owner: owner(input.linkedOwner),
    repository: repository(input.linkedRepository),
    commitSha: sha(input.commitSha, 'submodule commit SHA'),
  });
  const approval = validateSubmoduleApproval(input.approval as GitHubSubmoduleApproval);
  if (
    approval.parentAccountId !== parent.accountId ||
    approval.parentInstallationId !== parent.installationId ||
    approval.parentOwner !== parent.owner ||
    approval.parentRepository !== parent.repository ||
    approval.parentResolvedCommitSha !== parent.resolvedCommitSha ||
    approval.path !== submodulePath ||
    approval.linkedOwner !== linkedRepository.owner ||
    approval.linkedRepository !== linkedRepository.repository ||
    approval.linkedCommitSha !== linkedRepository.commitSha
  ) {
    fail('approval binding');
  }
  if (
    !authority ||
    typeof authority.getSubmoduleAccess !== 'function' ||
    typeof authority.isDirectUserApprovalValid !== 'function'
  ) {
    fail('submodule authority');
  }
  const rawAccess = authority.getSubmoduleAccess(parent, submodulePath, linkedRepository);
  if (!rawAccess) fail('submodule access authority');
  const access = record(clone(rawAccess, 'submodule access'), 'submodule access');
  exact(
    access,
    ['userHasAccess', 'appInstalled'],
    ['userHasAccess', 'appInstalled'],
    'submodule access',
  );
  if (typeof access.userHasAccess !== 'boolean' || typeof access.appInstalled !== 'boolean') {
    fail('submodule access');
  }
  const approvalValid = authority.isDirectUserApprovalValid(approval) === true;
  const missingGates: string[] = [];
  if (!access.userHasAccess) missingGates.push('user_access');
  if (!access.appInstalled) missingGates.push('app_installation');
  if (!approvalValid) missingGates.push('user_approval');
  return Object.freeze({
    entityType: 'linked_repository' as const,
    path: submodulePath,
    linkedRepository,
    authorization: Object.freeze({
      approvalId: approval.approvalId,
      parentIdentity: parent,
    }),
    fetchAllowed: missingGates.length === 0,
    missingGates: Object.freeze(missingGates),
    executable: false as const,
  });
}

function validateLfsPointer(rawPointer: GitHubLfsPointer): Readonly<GitHubLfsPointer> {
  const pointer = record(clone(rawPointer, 'LFS pointer'), 'LFS pointer');
  exact(pointer, ['version', 'oid', 'size'], ['version', 'oid', 'size'], 'LFS pointer');
  if (pointer.version !== 'https://git-lfs.github.com/spec/v1') fail('LFS pointer version');
  const oid = text(pointer.oid, 'LFS pointer OID', 71);
  if (!oid.startsWith('sha256:') || !SHA256.test(oid.slice(7))) fail('LFS pointer OID');
  if (
    !Number.isSafeInteger(pointer.size) ||
    (pointer.size as number) < 0 ||
    (pointer.size as number) > 9_007_199_254_740_991
  ) {
    fail('LFS pointer size');
  }
  return Object.freeze({
    version: 'https://git-lfs.github.com/spec/v1',
    oid: `sha256:${oid.slice(7).toLowerCase()}`,
    size: pointer.size as number,
  });
}

export function parseGitHubLfsPointer(rawText: string): Readonly<GitHubLfsPointer> {
  if (
    typeof rawText !== 'string' ||
    rawText.length === 0 ||
    rawText.length > 1_024 ||
    FORBIDDEN.test(rawText.replaceAll('\n', ''))
  ) {
    fail('LFS pointer');
  }
  const match =
    /^version https:\/\/git-lfs\.github\.com\/spec\/v1\r?\noid sha256:([a-fA-F0-9]{64})\r?\nsize ([0-9]{1,16})\r?\n?$/u.exec(
      rawText,
    );
  if (!match) fail('LFS pointer');
  const size = Number(match[2]);
  return validateLfsPointer({
    version: 'https://git-lfs.github.com/spec/v1',
    oid: `sha256:${match[1]}`,
    size,
  });
}

export function planGitHubLfsObject(
  rawIdentity: GitHubRepositoryIdentity,
  rawPath: string,
  rawPointer: GitHubLfsPointer,
  authority: GitHubLfsAuthority,
) {
  const identity = validateIdentity(rawIdentity);
  const lfsPath = path(rawPath, 'LFS path');
  const pointer = validateLfsPointer(rawPointer);
  if (!authority || typeof authority.getLfsPermission !== 'function') {
    fail('LFS authority');
  }
  const rawPermission = authority.getLfsPermission(identity, lfsPath, pointer);
  if (!rawPermission) fail('LFS permission authority');
  const permission = record(clone(rawPermission, 'LFS permission'), 'LFS permission');
  exact(permission, ['needed', 'permitted'], ['needed', 'permitted'], 'LFS permission');
  if (typeof permission.needed !== 'boolean' || typeof permission.permitted !== 'boolean') {
    fail('LFS permission');
  }
  const downloadAllowed = permission.needed && permission.permitted;
  return Object.freeze({
    pointer,
    represented: true as const,
    downloadAllowed,
    reason: downloadAllowed
      ? ('needed_and_permitted' as const)
      : permission.needed
        ? ('permission_required' as const)
        : ('not_needed' as const),
    executable: false as const,
  });
}
