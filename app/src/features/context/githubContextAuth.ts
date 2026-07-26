export const GITHUB_CONTEXT_FLOW_STEPS = Object.freeze([
  'connect',
  'authenticate',
  'authorize_github_app',
  'list_accessible_repositories',
  'choose_repository',
  'choose_ref',
  'choose_metadata_scopes',
  'choose_analysis_location',
  'create_map',
] as const);

export const GITHUB_CONTEXT_REQUIRED_PERMISSIONS = Object.freeze({
  contents: 'read',
  metadata: 'read',
} as const);

export const GITHUB_CONTEXT_OPTIONAL_PERMISSIONS = Object.freeze([
  'issues',
  'pull_requests',
  'actions',
  'checks',
  'discussions',
  'releases',
] as const);

export type GitHubContextOptionalPermission = (typeof GITHUB_CONTEXT_OPTIONAL_PERMISSIONS)[number];
export type GitHubContextPermissionName =
  | keyof typeof GITHUB_CONTEXT_REQUIRED_PERMISSIONS
  | GitHubContextOptionalPermission;
export type GitHubContextPermissions = Partial<Record<GitHubContextPermissionName, 'read'>>;

export interface GitHubContextInstallation {
  accountId: string;
  installationId: string;
  scope: 'selected' | 'all';
  accessibleRepositoryIds: readonly string[];
  permissions: GitHubContextPermissions;
}

/** Trusted server adapter; installation snapshots must come from GitHub installation state. */
export interface GitHubContextInstallationAuthority {
  getInstallation(accountId: string, installationId: string): GitHubContextInstallation | undefined;
}

export interface GitHubContextRepositorySummary {
  id: string;
  owner: string;
  name: string;
}

export interface GitHubContextMapAuthorizationRequest {
  repositoryId: string;
  optionalPermissions: readonly GitHubContextOptionalPermission[];
  analysisLocation: 'local' | 'cloud';
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,299}$/u;
const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u;
const MAX_REPOSITORIES = 10_000;
const MAX_NODES = 50_000;
const MAX_STRING_CHARS = 5_000_000;

function fail(reason: string): never {
  throw new Error(`Invalid GitHub Context ${reason}.`);
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

function assertClosed(
  value: unknown,
  reason: string,
  depth = 0,
  budget = { nodes: 0, chars: 0 },
): void {
  budget.nodes += 1;
  if (budget.nodes > MAX_NODES || depth > 6) fail(reason);
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
  allowed: readonly string[],
  required: readonly string[],
  reason: string,
): void {
  const keys = new Set(allowed);
  if (Object.keys(value).some((key) => !keys.has(key))) fail(reason);
  if (required.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) fail(reason);
}

function validateInstallation(raw: GitHubContextInstallation): GitHubContextInstallation {
  const installation = record(clone(raw, 'installation'), 'installation');
  exact(
    installation,
    ['accountId', 'installationId', 'scope', 'accessibleRepositoryIds', 'permissions'],
    ['accountId', 'installationId', 'scope', 'accessibleRepositoryIds', 'permissions'],
    'installation',
  );
  if (installation.scope !== 'selected' && installation.scope !== 'all') {
    fail('installation scope');
  }
  if (!Array.isArray(installation.accessibleRepositoryIds)) fail('accessible repositories');
  const accessibleRepositoryIds = installation.accessibleRepositoryIds.map((id) =>
    stableId(id, 'repository ID'),
  );
  if (new Set(accessibleRepositoryIds).size !== accessibleRepositoryIds.length) {
    fail('duplicate accessible repository');
  }
  const permissions = record(installation.permissions, 'permissions');
  const permissionNames = [
    ...Object.keys(GITHUB_CONTEXT_REQUIRED_PERMISSIONS),
    ...GITHUB_CONTEXT_OPTIONAL_PERMISSIONS,
  ];
  exact(permissions, permissionNames, ['contents', 'metadata'], 'permissions');
  for (const [name, access] of Object.entries(permissions)) {
    if (access !== 'read') fail(`${name} permission`);
  }
  return Object.freeze({
    accountId: stableId(installation.accountId, 'account ID'),
    installationId: stableId(installation.installationId, 'installation ID'),
    scope: installation.scope,
    accessibleRepositoryIds: Object.freeze(accessibleRepositoryIds),
    permissions: Object.freeze({ ...permissions }) as GitHubContextPermissions,
  });
}

function resolveInstallation(
  rawClaim: GitHubContextInstallation,
  authority: GitHubContextInstallationAuthority,
): GitHubContextInstallation {
  const claim = record(clone(rawClaim, 'installation claim'), 'installation claim');
  const accountId = stableId(claim.accountId, 'account ID');
  const installationId = stableId(claim.installationId, 'installation ID');
  if (!authority || typeof authority.getInstallation !== 'function') {
    fail('installation authority');
  }
  const authoritative = authority.getInstallation(accountId, installationId);
  if (!authoritative) fail('authoritative installation');
  const installation = validateInstallation(authoritative);
  if (installation.accountId !== accountId || installation.installationId !== installationId) {
    fail('authoritative installation');
  }
  return installation;
}

function assertAccessible(
  installation: GitHubContextInstallation,
  rawRepositoryId: unknown,
): string {
  const repositoryId = stableId(rawRepositoryId, 'repository ID');
  if (!installation.accessibleRepositoryIds.includes(repositoryId)) {
    fail('accessible repository');
  }
  return repositoryId;
}

export function filterAccessibleGitHubRepositories(
  rawInstallation: GitHubContextInstallation,
  rawRepositories: readonly GitHubContextRepositorySummary[],
  authority: GitHubContextInstallationAuthority,
): ReadonlyArray<Readonly<GitHubContextRepositorySummary>> {
  const installation = resolveInstallation(rawInstallation, authority);
  const repositories = clone(rawRepositories, 'repositories');
  if (!Array.isArray(repositories)) fail('repositories');
  const allowed = new Set(installation.accessibleRepositoryIds);
  const seen = new Set<string>();
  const output: Readonly<GitHubContextRepositorySummary>[] = [];
  for (const rawRepository of repositories) {
    const repository = record(rawRepository, 'repository');
    exact(repository, ['id', 'owner', 'name'], ['id', 'owner', 'name'], 'repository');
    const id = stableId(repository.id, 'repository ID');
    if (seen.has(id)) fail('duplicate repository');
    seen.add(id);
    if (!allowed.has(id)) continue;
    output.push(
      Object.freeze({
        id,
        owner: safeText(repository.owner, 'repository owner', 100),
        name: safeText(repository.name, 'repository name', 100),
      }),
    );
  }
  return Object.freeze(output);
}

export function buildGitHubContextMapAuthorization(
  rawInstallation: GitHubContextInstallation,
  rawRequest: GitHubContextMapAuthorizationRequest,
  authority: GitHubContextInstallationAuthority,
) {
  const installation = resolveInstallation(rawInstallation, authority);
  const request = record(clone(rawRequest, 'authorization request'), 'authorization request');
  exact(
    request,
    ['repositoryId', 'optionalPermissions', 'analysisLocation'],
    ['repositoryId', 'optionalPermissions', 'analysisLocation'],
    'authorization request',
  );
  const repositoryId = assertAccessible(installation, request.repositoryId);
  if (request.analysisLocation !== 'local' && request.analysisLocation !== 'cloud') {
    fail('analysis location');
  }
  if (!Array.isArray(request.optionalPermissions)) fail('optional permissions');
  const optionalPermissions = request.optionalPermissions.map((permission) => {
    if (!(GITHUB_CONTEXT_OPTIONAL_PERMISSIONS as readonly unknown[]).includes(permission)) {
      fail('optional permission');
    }
    return permission as GitHubContextOptionalPermission;
  });
  if (new Set(optionalPermissions).size !== optionalPermissions.length) {
    fail('duplicate optional permission');
  }
  const permissions: GitHubContextPermissions = { ...GITHUB_CONTEXT_REQUIRED_PERMISSIONS };
  for (const permission of optionalPermissions) {
    if (installation.permissions[permission] !== 'read') fail('installation permission');
    permissions[permission] = 'read';
  }
  return Object.freeze({
    authMode: 'github_app' as const,
    accountId: installation.accountId,
    installationId: installation.installationId,
    repositoryId,
    permissions: Object.freeze(permissions),
    analysisLocation: request.analysisLocation,
    writePermissionsRequested: false as const,
    executable: false as const,
  });
}

export function buildGitHubAppTokenPolicy(
  rawInstallation: GitHubContextInstallation,
  rawRepositoryId: string,
  rawWindow: { issuedAt: number; expiresAt: number },
  authority: GitHubContextInstallationAuthority,
) {
  const installation = resolveInstallation(rawInstallation, authority);
  const repositoryId = assertAccessible(installation, rawRepositoryId);
  const window = record(clone(rawWindow, 'token lifetime'), 'token lifetime');
  exact(window, ['issuedAt', 'expiresAt'], ['issuedAt', 'expiresAt'], 'token lifetime');
  if (
    !Number.isSafeInteger(window.issuedAt) ||
    !Number.isSafeInteger(window.expiresAt) ||
    (window.issuedAt as number) < 0 ||
    (window.expiresAt as number) <= (window.issuedAt as number) ||
    (window.expiresAt as number) - (window.issuedAt as number) > 3_600_000
  ) {
    fail('token lifetime');
  }
  return Object.freeze({
    installationId: installation.installationId,
    repositoryId,
    generatedServerSide: true,
    installationScoped: true,
    repositoryNarrowed: true,
    sentToBrowser: false,
    writtenToTerminal: false,
    writtenToLogs: false,
    rotatesAutomatically: true,
    issuedAt: window.issuedAt as number,
    expiresAt: window.expiresAt as number,
    executable: false,
  });
}

export function buildGitHubPatFallbackPolicy(rawRepositoryId: string) {
  const repositoryId = stableId(rawRepositoryId, 'repository ID');
  return Object.freeze({
    authMode: 'fine_grained_pat' as const,
    repositoryId,
    contentsPermission: 'read' as const,
    repositorySelectionRequired: true,
    secureLocalStorageRequired: true,
    warningRequired: true,
    revokeInstructionsRequired: true,
    revokeUrl: 'https://github.com/settings/tokens?type=beta',
    tokenInLogs: false,
    tokenInTerminal: false,
    classicRepoScopeAllowed: false,
    tokenValue: null,
    executable: false,
  });
}
