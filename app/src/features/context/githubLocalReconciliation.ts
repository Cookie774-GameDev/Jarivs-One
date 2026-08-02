import type { GitHubRepositoryIdentity } from './githubRepositoryRetrieval';

export type GitHubLocalChangeStatus = 'modified' | 'added' | 'deleted' | 'renamed';

export interface GitHubLocalChange {
  path: string;
  status: GitHubLocalChangeStatus;
  staged: boolean;
}

export interface GitHubLocalRepositorySnapshot {
  projectId: string;
  remoteOrigin: {
    host: 'github.com';
    owner: string;
    repository: string;
  } | null;
  headCommitSha: string;
  changedFiles: readonly GitHubLocalChange[];
  detectedAt: string;
}

export interface GitHubLocalRepositoryAuthority {
  getLocalRepository(projectId: string): GitHubLocalRepositorySnapshot | undefined;
}

export interface GitHubLocalReconciliationClaim {
  projectId: string;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,499}$/u;
const SAFE_OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,98}[A-Za-z0-9])?$/u;
const SAFE_REPOSITORY = /^[A-Za-z0-9_.-]{1,100}$/u;
const SHA = /^[a-fA-F0-9]{40}$/u;
const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u;
const MAX_CHANGES = 100_000;
const MAX_NODES = 500_000;
const MAX_CHARS = 10_000_000;

function fail(reason: string): never {
  throw new Error(`Invalid GitHub local reconciliation ${reason}.`);
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

function stableId(value: unknown, reason: string): string {
  const id = text(value, reason);
  if (!SAFE_ID.test(id)) fail(reason);
  return id;
}

function owner(value: unknown): string {
  const result = text(value, 'owner', 100);
  if (!SAFE_OWNER.test(result)) fail('owner');
  return result;
}

function repository(value: unknown): string {
  const result = text(value, 'repository', 100);
  if (!SAFE_REPOSITORY.test(result) || result === '.' || result === '..') fail('repository');
  return result;
}

function sha(value: unknown, reason: string): string {
  const result = text(value, reason, 40);
  if (!SHA.test(result)) fail(reason);
  return result.toLowerCase();
}

function path(value: unknown): string {
  const result = text(value, 'file path', 1_024).replaceAll('\\', '/');
  if (
    result.startsWith('/') ||
    result.endsWith('/') ||
    result.includes('//') ||
    result.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    fail('file path');
  }
  return result;
}

function timestamp(value: unknown): string {
  const result = text(value, 'detection timestamp', 40);
  const milliseconds = Date.parse(result);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== result) {
    fail('detection timestamp');
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
  if (budget.nodes > MAX_NODES || depth > 7) fail(reason);
  if (typeof value === 'string') {
    if (value.length > 10_000) fail(reason);
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
    if (prototype !== Array.prototype || value.length > MAX_CHANGES) fail(reason);
    if (keys.length !== value.length + 1 || !keys.includes('length')) fail(reason);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) fail(reason);
      assertClosed(descriptor.value, reason, depth + 1, budget);
    }
    return;
  }
  if ((prototype !== Object.prototype && prototype !== null) || keys.length > 8) fail(reason);
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
  const keys = new Set(allowed);
  if (Object.keys(value).some((key) => !keys.has(key))) fail(reason);
  if (required.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) fail(reason);
}

function validateIdentity(rawIdentity: GitHubRepositoryIdentity): GitHubRepositoryIdentity {
  const identity = record(rawIdentity, 'identity');
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

export function planGitHubLocalReconciliation(
  rawIdentity: GitHubRepositoryIdentity,
  rawClaim: GitHubLocalReconciliationClaim,
  authority: GitHubLocalRepositoryAuthority,
) {
  const identity = validateIdentity(clone(rawIdentity, 'identity'));
  const claim = record(clone(rawClaim, 'claim'), 'claim');
  exact(claim, ['projectId'], ['projectId'], 'claim');
  const projectId = stableId(claim.projectId, 'project ID');
  if (!authority || typeof authority.getLocalRepository !== 'function') {
    fail('local repository authority');
  }
  const rawSnapshot = authority.getLocalRepository(projectId);
  if (!rawSnapshot) fail('local repository');
  const snapshot = record(clone(rawSnapshot, 'local repository'), 'local repository');
  exact(
    snapshot,
    ['projectId', 'remoteOrigin', 'headCommitSha', 'changedFiles', 'detectedAt'],
    ['projectId', 'remoteOrigin', 'headCommitSha', 'changedFiles', 'detectedAt'],
    'local repository',
  );
  if (stableId(snapshot.projectId, 'project ID') !== projectId) fail('project identity');
  let remoteOrigin: { host: 'github.com'; owner: string; repository: string } | null = null;
  if (snapshot.remoteOrigin !== null) {
    const rawOrigin = record(snapshot.remoteOrigin, 'remote origin');
    exact(
      rawOrigin,
      ['host', 'owner', 'repository'],
      ['host', 'owner', 'repository'],
      'remote origin',
    );
    if (rawOrigin.host !== 'github.com') fail('remote origin host');
    remoteOrigin = Object.freeze({
      host: 'github.com',
      owner: owner(rawOrigin.owner),
      repository: repository(rawOrigin.repository),
    });
  }
  if (!Array.isArray(snapshot.changedFiles)) fail('working tree changes');
  const changedFiles = snapshot.changedFiles.map((rawChange) => {
    const change = record(rawChange, 'working tree change');
    exact(
      change,
      ['path', 'status', 'staged'],
      ['path', 'status', 'staged'],
      'working tree change',
    );
    if (!['modified', 'added', 'deleted', 'renamed'].includes(change.status as string)) {
      fail('working tree status');
    }
    if (typeof change.staged !== 'boolean') fail('working tree staged state');
    return Object.freeze({
      path: path(change.path),
      status: change.status as GitHubLocalChangeStatus,
      staged: change.staged,
    });
  });
  if (new Set(changedFiles.map((change) => change.path)).size !== changedFiles.length) {
    fail('duplicate working tree path');
  }
  const repositoryIdentityMatches =
    remoteOrigin !== null &&
    remoteOrigin.owner.toLowerCase() === identity.owner.toLowerCase() &&
    remoteOrigin.repository.toLowerCase() === identity.repository.toLowerCase();
  const remoteProvenanceCommitSha = identity.resolvedCommitSha;
  return Object.freeze({
    identity,
    projectId,
    remoteOrigin,
    remoteOriginDetected: remoteOrigin !== null,
    repositoryIdentityMatches,
    offerLinkSources: repositoryIdentityMatches,
    linkStrategy: repositoryIdentityMatches
      ? ('merge_by_repository_commit_path' as const)
      : ('separate_sources' as const),
    avoidDuplicateNodes: repositoryIdentityMatches,
    localHeadCommitSha: sha(snapshot.headCommitSha, 'local HEAD commit SHA'),
    remoteProvenanceCommitSha,
    workingTreeChanges: Object.freeze(
      repositoryIdentityMatches
        ? changedFiles.map((change) =>
            Object.freeze({
              ...change,
              contextSource: 'local_working_tree' as const,
              remoteProvenanceCommitSha,
              uploadToGitHub: false as const,
            }),
          )
        : [],
    ),
    preferLocalFilesForUncommittedContext: repositoryIdentityMatches,
    preserveRemoteCommitProvenance: true as const,
    uploadLocalUncommittedFilesToGitHub: false as const,
    detectedAt: timestamp(snapshot.detectedAt),
    executable: false as const,
  });
}
