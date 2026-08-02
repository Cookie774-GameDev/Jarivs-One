export type GitHubRepositoryVisibility = 'private' | 'public' | 'internal';
export type GitHubRepositoryPermissionState = 'read' | 'triage' | 'write' | 'maintain' | 'admin';
export type GitHubRepositoryRefreshPolicy = 'manual' | 'on_open' | 'scheduled';
export type GitHubRepositoryRefreshTrigger = GitHubRepositoryRefreshPolicy;

export type GitHubRepositoryRef =
  | { kind: 'default_branch'; name?: string }
  | { kind: 'branch'; name: string }
  | { kind: 'tag'; name: string }
  | { kind: 'commit'; sha: string };

export type GitHubSelectedRepositoryRef =
  | { kind: 'default_branch'; name: string }
  | { kind: 'branch'; name: string }
  | { kind: 'tag'; name: string }
  | { kind: 'commit'; sha: string };

export interface GitHubRepositoryAuthorityRecord {
  id: string;
  owner: string;
  name: string;
  visibility: GitHubRepositoryVisibility;
  defaultBranch: string;
  archived: boolean;
  fork: boolean;
  pushedAt: string;
  permissionState: GitHubRepositoryPermissionState;
}

export interface GitHubRepositoryCatalogSnapshot {
  accountId: string;
  installationId: string;
  repositories: readonly GitHubRepositoryAuthorityRecord[];
}

export interface GitHubResolvedRepositoryRef {
  repositoryId: string;
  selectedRef: GitHubRepositoryRef;
  resolvedCommitSha: string;
}

/** Trusted server adapter. Its results must be derived from the GitHub installation token. */
export interface GitHubRepositoryAuthority {
  getRepositoryCatalog(
    accountId: string,
    installationId: string,
  ): GitHubRepositoryCatalogSnapshot | undefined;
  resolveRef(
    accountId: string,
    installationId: string,
    repositoryId: string,
    selectedRef: GitHubRepositoryRef,
  ): GitHubResolvedRepositoryRef | undefined;
}

export interface GitHubRepositoryCatalogClaim {
  accountId: string;
  installationId: string;
}

export interface GitHubRepositoryCatalogItem {
  id: string;
  owner: string;
  repository: string;
  visibility: GitHubRepositoryVisibility;
  defaultBranch: string;
  archived: boolean;
  fork: boolean;
  lastPush: string;
  accountId: string;
  installationId: string;
  permissionState: GitHubRepositoryPermissionState;
}

export interface GitHubRepositorySelectionClaim extends GitHubRepositoryCatalogClaim {
  repositoryId: string;
}

export interface GitHubRepositorySelection {
  accountId: string;
  installationId: string;
  repositoryId: string;
  owner: string;
  repository: string;
  selectedRef: GitHubSelectedRepositoryRef;
  resolvedCommitSha: string;
  previousCommitSha: string | null;
  refreshPolicy: GitHubRepositoryRefreshPolicy | 'pinned';
  pinned: boolean;
  refreshed: boolean;
  executable: false;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,299}$/u;
const SAFE_OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,98}[A-Za-z0-9])?$/u;
const SAFE_REPOSITORY = /^[A-Za-z0-9_.-]{1,100}$/u;
const COMMIT_SHA = /^[a-fA-F0-9]{40}$/u;
const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u;
const MAX_REPOSITORIES = 10_000;
const MAX_NODES = 120_000;
const MAX_STRING_CHARS = 5_000_000;

function fail(reason: string): never {
  throw new Error(`Invalid GitHub repository ${reason}.`);
}

function safeText(value: unknown, reason: string, maximum = 300): string {
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

function stableId(value: unknown, reason: string): string {
  const id = safeText(value, reason);
  if (!SAFE_ID.test(id)) fail(reason);
  return id;
}

function repositoryOwner(value: unknown): string {
  const owner = safeText(value, 'owner', 100);
  if (!SAFE_OWNER.test(owner)) fail('owner');
  return owner;
}

function repositoryName(value: unknown): string {
  const name = safeText(value, 'name', 100);
  if (!SAFE_REPOSITORY.test(name) || name === '.' || name === '..') fail('name');
  return name;
}

function refName(value: unknown, reason: string): string {
  const name = safeText(value, reason, 255);
  if (
    name.startsWith('.') ||
    name.startsWith('/') ||
    name.endsWith('.') ||
    name.endsWith('/') ||
    name.endsWith('.lock') ||
    name.includes('..') ||
    name.includes('//') ||
    name.includes('@{') ||
    /[ ~^:?*[\]\\]/u.test(name)
  ) {
    fail(reason);
  }
  return name;
}

function commitSha(value: unknown): string {
  const sha = safeText(value, 'commit SHA', 40);
  if (!COMMIT_SHA.test(sha)) fail('commit SHA');
  return sha.toLowerCase();
}

function isoTimestamp(value: unknown): string {
  const timestamp = safeText(value, 'last push', 40);
  const milliseconds = Date.parse(timestamp);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== timestamp) {
    fail('last push');
  }
  return timestamp;
}

function assertClosed(
  value: unknown,
  reason: string,
  depth = 0,
  budget = { nodes: 0, chars: 0 },
): void {
  budget.nodes += 1;
  if (budget.nodes > MAX_NODES || depth > 7) fail(reason);
  if (typeof value === 'string') {
    if (value.length > 500) fail(reason);
    budget.chars += value.length;
    if (budget.chars > MAX_STRING_CHARS) fail(reason);
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
    if (prototype !== Array.prototype || value.length > MAX_REPOSITORIES) fail(reason);
    if (keys.length !== value.length + 1 || !keys.includes('length')) fail(reason);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) fail(reason);
      assertClosed(descriptor.value, reason, depth + 1, budget);
    }
    return;
  }
  if ((prototype !== Object.prototype && prototype !== null) || keys.length > 14) fail(reason);
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
  allowed: readonly string[],
  required: readonly string[],
  reason: string,
): void {
  const allowedKeys = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) fail(reason);
  if (required.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) fail(reason);
}

function validateClaim(rawClaim: GitHubRepositoryCatalogClaim): GitHubRepositoryCatalogClaim {
  const claim = record(clone(rawClaim, 'claim'), 'claim');
  exact(claim, ['accountId', 'installationId'], ['accountId', 'installationId'], 'claim');
  return Object.freeze({
    accountId: stableId(claim.accountId, 'account ID'),
    installationId: stableId(claim.installationId, 'installation ID'),
  });
}

function validateRepository(
  rawRepository: GitHubRepositoryAuthorityRecord,
): Readonly<GitHubRepositoryAuthorityRecord> {
  const repository = record(rawRepository, 'catalog entry');
  exact(
    repository,
    [
      'id',
      'owner',
      'name',
      'visibility',
      'defaultBranch',
      'archived',
      'fork',
      'pushedAt',
      'permissionState',
    ],
    [
      'id',
      'owner',
      'name',
      'visibility',
      'defaultBranch',
      'archived',
      'fork',
      'pushedAt',
      'permissionState',
    ],
    'catalog entry',
  );
  if (!['private', 'public', 'internal'].includes(repository.visibility as string)) {
    fail('visibility');
  }
  if (
    !['read', 'triage', 'write', 'maintain', 'admin'].includes(repository.permissionState as string)
  ) {
    fail('permission state');
  }
  if (typeof repository.archived !== 'boolean') fail('archived state');
  if (typeof repository.fork !== 'boolean') fail('fork state');
  return Object.freeze({
    id: stableId(repository.id, 'repository ID'),
    owner: repositoryOwner(repository.owner),
    name: repositoryName(repository.name),
    visibility: repository.visibility as GitHubRepositoryVisibility,
    defaultBranch: refName(repository.defaultBranch, 'default branch'),
    archived: repository.archived,
    fork: repository.fork,
    pushedAt: isoTimestamp(repository.pushedAt),
    permissionState: repository.permissionState as GitHubRepositoryPermissionState,
  });
}

function trustedCatalog(
  rawClaim: GitHubRepositoryCatalogClaim,
  authority: GitHubRepositoryAuthority,
): {
  claim: GitHubRepositoryCatalogClaim;
  repositories: ReadonlyArray<Readonly<GitHubRepositoryAuthorityRecord>>;
} {
  const claim = validateClaim(rawClaim);
  if (!authority || typeof authority.getRepositoryCatalog !== 'function') {
    fail('catalog authority');
  }
  const rawSnapshot = authority.getRepositoryCatalog(claim.accountId, claim.installationId);
  if (!rawSnapshot) fail('accessible catalog');
  const snapshot = record(clone(rawSnapshot, 'catalog'), 'catalog');
  exact(
    snapshot,
    ['accountId', 'installationId', 'repositories'],
    ['accountId', 'installationId', 'repositories'],
    'catalog',
  );
  if (
    stableId(snapshot.accountId, 'account ID') !== claim.accountId ||
    stableId(snapshot.installationId, 'installation ID') !== claim.installationId
  ) {
    fail('authoritative catalog');
  }
  if (!Array.isArray(snapshot.repositories)) fail('catalog');
  const repositories = snapshot.repositories.map((repository) =>
    validateRepository(repository as GitHubRepositoryAuthorityRecord),
  );
  const ids = new Set<string>();
  const coordinates = new Set<string>();
  for (const repository of repositories) {
    const coordinate = `${repository.owner}/${repository.name}`.toLowerCase();
    if (ids.has(repository.id) || coordinates.has(coordinate)) fail('duplicate repository');
    ids.add(repository.id);
    coordinates.add(coordinate);
  }
  return { claim, repositories: Object.freeze(repositories) };
}

function validateRequestedRef(rawRef: GitHubRepositoryRef): GitHubRepositoryRef {
  const ref = record(clone(rawRef, 'ref'), 'ref');
  if (ref.kind === 'default_branch') {
    exact(ref, ['kind'], ['kind'], 'ref');
    return Object.freeze({ kind: 'default_branch' });
  }
  if (ref.kind === 'branch' || ref.kind === 'tag') {
    exact(ref, ['kind', 'name'], ['kind', 'name'], 'ref');
    return Object.freeze({ kind: ref.kind, name: refName(ref.name, `${ref.kind} name`) });
  }
  if (ref.kind === 'commit') {
    exact(ref, ['kind', 'sha'], ['kind', 'sha'], 'ref');
    return Object.freeze({ kind: 'commit', sha: commitSha(ref.sha) });
  }
  return fail('ref');
}

function validateResolvedRef(
  rawResolution: GitHubResolvedRepositoryRef | undefined,
  repository: Readonly<GitHubRepositoryAuthorityRecord>,
  requestedRef: GitHubRepositoryRef,
): { selectedRef: GitHubSelectedRepositoryRef; resolvedCommitSha: string } {
  if (!rawResolution) fail('authoritative ref');
  const resolution = record(clone(rawResolution, 'authoritative ref'), 'authoritative ref');
  exact(
    resolution,
    ['repositoryId', 'selectedRef', 'resolvedCommitSha'],
    ['repositoryId', 'selectedRef', 'resolvedCommitSha'],
    'authoritative ref',
  );
  if (stableId(resolution.repositoryId, 'repository ID') !== repository.id) {
    fail('authoritative ref');
  }
  const selected = record(resolution.selectedRef, 'authoritative ref');
  let selectedRef: GitHubSelectedRepositoryRef;
  if (requestedRef.kind === 'default_branch') {
    exact(selected, ['kind', 'name'], ['kind'], 'authoritative ref');
    if (selected.kind !== 'default_branch') fail('authoritative ref');
    const name =
      selected.name === undefined
        ? repository.defaultBranch
        : refName(selected.name, 'default branch');
    if (name !== repository.defaultBranch) fail('authoritative ref');
    selectedRef = Object.freeze({ kind: 'default_branch', name });
  } else if (requestedRef.kind === 'branch' || requestedRef.kind === 'tag') {
    exact(selected, ['kind', 'name'], ['kind', 'name'], 'authoritative ref');
    if (selected.kind !== requestedRef.kind) fail('authoritative ref');
    const name = refName(selected.name, `${requestedRef.kind} name`);
    if (name !== requestedRef.name) fail('authoritative ref');
    selectedRef = Object.freeze({ kind: requestedRef.kind, name });
  } else {
    exact(selected, ['kind', 'sha'], ['kind', 'sha'], 'authoritative ref');
    if (selected.kind !== 'commit') fail('authoritative ref');
    const sha = commitSha(selected.sha);
    if (sha !== requestedRef.sha) fail('authoritative ref');
    selectedRef = Object.freeze({ kind: 'commit', sha });
  }
  const resolvedCommitSha = commitSha(resolution.resolvedCommitSha);
  if (selectedRef.kind === 'commit' && selectedRef.sha !== resolvedCommitSha) {
    fail('authoritative ref');
  }
  return { selectedRef, resolvedCommitSha };
}

function resolveTrustedRef(
  claim: GitHubRepositoryCatalogClaim,
  repository: Readonly<GitHubRepositoryAuthorityRecord>,
  requestedRef: GitHubRepositoryRef,
  authority: GitHubRepositoryAuthority,
): { selectedRef: GitHubSelectedRepositoryRef; resolvedCommitSha: string } {
  if (!authority || typeof authority.resolveRef !== 'function') fail('ref authority');
  return validateResolvedRef(
    authority.resolveRef(claim.accountId, claim.installationId, repository.id, requestedRef),
    repository,
    requestedRef,
  );
}

function findAccessibleRepository(
  rawClaim: GitHubRepositorySelectionClaim,
  authority: GitHubRepositoryAuthority,
): {
  claim: GitHubRepositoryCatalogClaim;
  repository: Readonly<GitHubRepositoryAuthorityRecord>;
} {
  const selectionClaim = record(clone(rawClaim, 'selection claim'), 'selection claim');
  exact(
    selectionClaim,
    ['accountId', 'installationId', 'repositoryId'],
    ['accountId', 'installationId', 'repositoryId'],
    'selection claim',
  );
  const { claim, repositories } = trustedCatalog(
    {
      accountId: stableId(selectionClaim.accountId, 'account ID'),
      installationId: stableId(selectionClaim.installationId, 'installation ID'),
    },
    authority,
  );
  const repositoryId = stableId(selectionClaim.repositoryId, 'repository ID');
  const repository = repositories.find((candidate) => candidate.id === repositoryId);
  if (!repository) fail('accessible repository');
  return { claim, repository };
}

function selectedToRequestedRef(selectedRef: GitHubSelectedRepositoryRef): GitHubRepositoryRef {
  if (selectedRef.kind === 'default_branch') {
    return Object.freeze({ kind: 'default_branch' });
  }
  return selectedRef;
}

function validateSelection(rawSelection: GitHubRepositorySelection): GitHubRepositorySelection {
  const selection = record(clone(rawSelection, 'selection'), 'selection');
  exact(
    selection,
    [
      'accountId',
      'installationId',
      'repositoryId',
      'owner',
      'repository',
      'selectedRef',
      'resolvedCommitSha',
      'previousCommitSha',
      'refreshPolicy',
      'pinned',
      'refreshed',
      'executable',
    ],
    [
      'accountId',
      'installationId',
      'repositoryId',
      'owner',
      'repository',
      'selectedRef',
      'resolvedCommitSha',
      'previousCommitSha',
      'refreshPolicy',
      'pinned',
      'refreshed',
      'executable',
    ],
    'selection',
  );
  const selected = record(selection.selectedRef, 'selection ref');
  let selectedRef: GitHubSelectedRepositoryRef;
  if (selected.kind === 'default_branch' || selected.kind === 'branch' || selected.kind === 'tag') {
    exact(selected, ['kind', 'name'], ['kind', 'name'], 'selection ref');
    selectedRef = Object.freeze({
      kind: selected.kind,
      name: refName(selected.name, 'selection ref'),
    });
  } else if (selected.kind === 'commit') {
    exact(selected, ['kind', 'sha'], ['kind', 'sha'], 'selection ref');
    selectedRef = Object.freeze({ kind: 'commit', sha: commitSha(selected.sha) });
  } else {
    return fail('selection ref');
  }
  const pinned = selectedRef.kind === 'tag' || selectedRef.kind === 'commit';
  const refreshPolicy = selection.refreshPolicy;
  if (
    (pinned && refreshPolicy !== 'pinned') ||
    (!pinned && !['manual', 'on_open', 'scheduled'].includes(refreshPolicy as string))
  ) {
    fail('refresh policy');
  }
  if (selection.pinned !== pinned || typeof selection.refreshed !== 'boolean') {
    fail('selection state');
  }
  if (selection.executable !== false) fail('selection authority');
  const resolvedCommitSha = commitSha(selection.resolvedCommitSha);
  if (selectedRef.kind === 'commit' && selectedRef.sha !== resolvedCommitSha) {
    fail('selection commit SHA');
  }
  const previousCommitSha =
    selection.previousCommitSha === null ? null : commitSha(selection.previousCommitSha);
  return Object.freeze({
    accountId: stableId(selection.accountId, 'account ID'),
    installationId: stableId(selection.installationId, 'installation ID'),
    repositoryId: stableId(selection.repositoryId, 'repository ID'),
    owner: repositoryOwner(selection.owner),
    repository: repositoryName(selection.repository),
    selectedRef,
    resolvedCommitSha,
    previousCommitSha,
    refreshPolicy: refreshPolicy as GitHubRepositoryRefreshPolicy | 'pinned',
    pinned,
    refreshed: selection.refreshed,
    executable: false,
  });
}

export function searchGitHubRepositoryCatalog(
  rawClaim: GitHubRepositoryCatalogClaim,
  rawQuery: string,
  authority: GitHubRepositoryAuthority,
): ReadonlyArray<Readonly<GitHubRepositoryCatalogItem>> {
  if (typeof rawQuery !== 'string' || rawQuery.length > 200 || FORBIDDEN.test(rawQuery)) {
    fail('query');
  }
  const query = rawQuery.trim().toLowerCase();
  const { claim, repositories } = trustedCatalog(rawClaim, authority);
  return Object.freeze(
    repositories
      .filter((repository) => {
        const searchable = `${repository.owner}/${repository.name}`.toLowerCase();
        return query.length === 0 || searchable.includes(query);
      })
      .sort((left, right) => {
        const leftKey = `${left.owner}/${left.name}`.toLowerCase();
        const rightKey = `${right.owner}/${right.name}`.toLowerCase();
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      })
      .map((repository) =>
        Object.freeze({
          id: repository.id,
          owner: repository.owner,
          repository: repository.name,
          visibility: repository.visibility,
          defaultBranch: repository.defaultBranch,
          archived: repository.archived,
          fork: repository.fork,
          lastPush: repository.pushedAt,
          accountId: claim.accountId,
          installationId: claim.installationId,
          permissionState: repository.permissionState,
        }),
      ),
  );
}

export function createGitHubRepositorySelection(
  rawClaim: GitHubRepositorySelectionClaim,
  rawRef: GitHubRepositoryRef,
  rawRefreshPolicy: GitHubRepositoryRefreshPolicy,
  authority: GitHubRepositoryAuthority,
): Readonly<GitHubRepositorySelection> {
  if (!['manual', 'on_open', 'scheduled'].includes(rawRefreshPolicy)) {
    fail('refresh policy');
  }
  const { claim, repository } = findAccessibleRepository(rawClaim, authority);
  const requestedRef = validateRequestedRef(rawRef);
  const { selectedRef, resolvedCommitSha } = resolveTrustedRef(
    claim,
    repository,
    requestedRef,
    authority,
  );
  const pinned = selectedRef.kind === 'tag' || selectedRef.kind === 'commit';
  return Object.freeze({
    accountId: claim.accountId,
    installationId: claim.installationId,
    repositoryId: repository.id,
    owner: repository.owner,
    repository: repository.name,
    selectedRef,
    resolvedCommitSha,
    previousCommitSha: null,
    refreshPolicy: pinned ? 'pinned' : rawRefreshPolicy,
    pinned,
    refreshed: false,
    executable: false,
  });
}

export function refreshGitHubRepositorySelection(
  rawSelection: GitHubRepositorySelection,
  rawTrigger: GitHubRepositoryRefreshTrigger,
  authority: GitHubRepositoryAuthority,
): Readonly<GitHubRepositorySelection> {
  if (!['manual', 'on_open', 'scheduled'].includes(rawTrigger)) fail('refresh trigger');
  const selection = validateSelection(rawSelection);
  const { claim, repository } = findAccessibleRepository(
    {
      accountId: selection.accountId,
      installationId: selection.installationId,
      repositoryId: selection.repositoryId,
    },
    authority,
  );
  if (selection.owner !== repository.owner || selection.repository !== repository.name) {
    fail('authoritative selection');
  }
  if (selection.pinned || selection.refreshPolicy !== rawTrigger) {
    return selection;
  }
  const requestedRef = selectedToRequestedRef(selection.selectedRef);
  const { selectedRef, resolvedCommitSha } = resolveTrustedRef(
    claim,
    repository,
    requestedRef,
    authority,
  );
  return Object.freeze({
    accountId: claim.accountId,
    installationId: claim.installationId,
    repositoryId: repository.id,
    owner: repository.owner,
    repository: repository.name,
    selectedRef,
    resolvedCommitSha,
    previousCommitSha: selection.resolvedCommitSha,
    refreshPolicy: selection.refreshPolicy,
    pinned: false,
    refreshed: resolvedCommitSha !== selection.resolvedCommitSha,
    executable: false,
  });
}
