import { detectSecrets } from '@/lib/security/secretDetector';
import { getSupabaseClient } from '@/lib/supabase';

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

export function buildGitHubAppTokenPolicy() {
  return Object.freeze({
    executionBoundary: 'authenticated_edge_function' as const,
    functionName: 'github-context' as const,
    githubAppPrivateKeyLocation: 'server_only' as const,
    generatedServerSide: true,
    installationScoped: true,
    repositoryNarrowed: true,
    maximumLifetimeMs: 3_600_000,
    sentToBrowser: false,
    writtenToContext: false,
    writtenToTerminal: false,
    writtenToLogs: false,
    writtenToCrashReports: false,
    rotatesAutomatically: true,
    clientSuppliedAuthorityAccepted: false,
    executable: true,
  });
}

export function buildGitHubPatFallbackPolicy(rawRepositoryId: string) {
  const repositoryId = stableId(rawRepositoryId, 'repository ID');
  return Object.freeze({
    authMode: 'fine_grained_pat' as const,
    repositoryId,
    contentsPermission: 'read' as const,
    repositorySelectionRequired: true,
    credentialStorage: 'os_keyring_or_session_only' as const,
    persistentBrowserStorageAllowed: false,
    warningRequired: true,
    revokeInstructionsRequired: true,
    revokeUrl: 'https://github.com/settings/tokens?type=beta',
    tokenInContext: false,
    tokenInLogs: false,
    tokenInTerminal: false,
    tokenInCrashReports: false,
    classicRepoScopeAllowed: false,
    executable: false,
  });
}

export type GitHubContextServerRequest =
  | {
      operation: 'list_repositories';
      installationId: string;
      page?: number;
    }
  | {
      operation: 'read_tree';
      installationId: string;
      repositoryId: string;
      ref: string;
    }
  | {
      operation: 'read_blob';
      installationId: string;
      repositoryId: string;
      sha: string;
    };

export interface GitHubContextServerRepository {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
}

export type GitHubContextServerResult =
  | {
      operation: 'list_repositories';
      page: number;
      hasMore: boolean;
      repositories: readonly GitHubContextServerRepository[];
    }
  | {
      operation: 'read_tree';
      repositoryId: string;
      sha: string;
      truncated: boolean;
      entries: ReadonlyArray<{
        path: string;
        mode: string;
        type: 'blob' | 'tree' | 'commit';
        sha: string;
        size?: number;
      }>;
    }
  | {
      operation: 'read_blob';
      repositoryId: string;
      sha: string;
      encoding: 'base64';
      content: string;
      size: number;
    };

export interface GitHubContextFunctionInvoker {
  invoke(
    functionName: 'github-context',
    options: { body: GitHubContextServerRequest },
  ): Promise<{ data: unknown; error: unknown }>;
}

export interface GitHubContextServerExecutor {
  execute(
    accountId: string,
    request: GitHubContextServerRequest,
  ): Promise<GitHubContextServerResult>;
}

const GITHUB_NUMERIC_ID = /^[1-9]\d{0,15}$/u;
const GITHUB_SHA = /^[a-f0-9]{40,64}$/u;
const GITHUB_SAFE_REF =
  /^[^\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069\ufeff]{1,255}$/u;
const GITHUB_REPOSITORY_SEGMENT = /^[A-Za-z0-9_.-]{1,100}$/u;

function githubNumericId(value: unknown): string {
  if (typeof value !== 'string' || !GITHUB_NUMERIC_ID.test(value)) {
    throw new Error('github_context_request_invalid');
  }
  return value;
}

function normalizeServerRequest(raw: GitHubContextServerRequest): GitHubContextServerRequest {
  const request = record(clone(raw, 'server request'), 'server request');
  if (request.operation === 'list_repositories') {
    exact(
      request,
      ['operation', 'installationId', 'page'],
      ['operation', 'installationId'],
      'server request',
    );
    if (
      request.page !== undefined &&
      (!Number.isSafeInteger(request.page) ||
        (request.page as number) < 1 ||
        (request.page as number) > 10_000)
    ) {
      throw new Error('github_context_request_invalid');
    }
    return {
      operation: request.operation,
      installationId: githubNumericId(request.installationId),
      ...(request.page === undefined ? {} : { page: request.page as number }),
    };
  }
  if (request.operation === 'read_tree') {
    exact(
      request,
      ['operation', 'installationId', 'repositoryId', 'ref'],
      ['operation', 'installationId', 'repositoryId', 'ref'],
      'server request',
    );
    if (
      typeof request.ref !== 'string' ||
      request.ref.trim() !== request.ref ||
      !GITHUB_SAFE_REF.test(request.ref)
    ) {
      throw new Error('github_context_request_invalid');
    }
    return {
      operation: request.operation,
      installationId: githubNumericId(request.installationId),
      repositoryId: githubNumericId(request.repositoryId),
      ref: request.ref,
    };
  }
  if (request.operation === 'read_blob') {
    exact(
      request,
      ['operation', 'installationId', 'repositoryId', 'sha'],
      ['operation', 'installationId', 'repositoryId', 'sha'],
      'server request',
    );
    if (typeof request.sha !== 'string' || !GITHUB_SHA.test(request.sha)) {
      throw new Error('github_context_request_invalid');
    }
    return {
      operation: request.operation,
      installationId: githubNumericId(request.installationId),
      repositoryId: githubNumericId(request.repositoryId),
      sha: request.sha,
    };
  }
  throw new Error('github_context_request_invalid');
}

function responseText(value: unknown, maximum: number): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximum ||
    value.trim() !== value ||
    FORBIDDEN.test(value) ||
    detectSecrets(value).length > 0
  ) {
    throw new Error('github_context_response_invalid');
  }
  return value;
}

function responseSha(value: unknown): string {
  if (typeof value !== 'string' || !GITHUB_SHA.test(value)) {
    throw new Error('github_context_response_invalid');
  }
  return value;
}

function responseInteger(value: unknown, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > maximum) {
    throw new Error('github_context_response_invalid');
  }
  return value as number;
}

function normalizeServerResult(raw: unknown): GitHubContextServerResult {
  const response = record(clone(raw, 'server response'), 'server response');
  if (response.operation === 'list_repositories') {
    exact(
      response,
      ['operation', 'page', 'hasMore', 'repositories'],
      ['operation', 'page', 'hasMore', 'repositories'],
      'server response',
    );
    if (
      !Number.isSafeInteger(response.page) ||
      (response.page as number) < 1 ||
      (response.page as number) > 10_000 ||
      typeof response.hasMore !== 'boolean' ||
      !Array.isArray(response.repositories) ||
      response.repositories.length > 100
    ) {
      throw new Error('github_context_response_invalid');
    }
    const repositories = response.repositories.map((rawRepository) => {
      const repository = record(rawRepository, 'server repository');
      exact(
        repository,
        ['id', 'owner', 'name', 'fullName', 'private', 'defaultBranch'],
        ['id', 'owner', 'name', 'fullName', 'private', 'defaultBranch'],
        'server repository',
      );
      const owner = responseText(repository.owner, 100);
      const name = responseText(repository.name, 100);
      const fullName = responseText(repository.fullName, 201);
      if (
        !GITHUB_REPOSITORY_SEGMENT.test(owner) ||
        !GITHUB_REPOSITORY_SEGMENT.test(name) ||
        fullName !== `${owner}/${name}` ||
        typeof repository.private !== 'boolean'
      ) {
        throw new Error('github_context_response_invalid');
      }
      return Object.freeze({
        id: githubNumericId(repository.id),
        owner,
        name,
        fullName,
        private: repository.private,
        defaultBranch: responseText(repository.defaultBranch, 255),
      });
    });
    if (new Set(repositories.map(({ id }) => id)).size !== repositories.length) {
      throw new Error('github_context_response_invalid');
    }
    return Object.freeze({
      operation: response.operation,
      page: response.page as number,
      hasMore: response.hasMore,
      repositories: Object.freeze(repositories),
    });
  }
  if (response.operation === 'read_tree') {
    exact(
      response,
      ['operation', 'repositoryId', 'sha', 'truncated', 'entries'],
      ['operation', 'repositoryId', 'sha', 'truncated', 'entries'],
      'server response',
    );
    if (
      typeof response.truncated !== 'boolean' ||
      !Array.isArray(response.entries) ||
      response.entries.length > 50_000
    ) {
      throw new Error('github_context_response_invalid');
    }
    const entries = response.entries.map((rawEntry) => {
      const entry = record(rawEntry, 'server tree entry');
      exact(
        entry,
        ['path', 'mode', 'type', 'sha', 'size'],
        ['path', 'mode', 'type', 'sha'],
        'server tree entry',
      );
      if (
        typeof entry.mode !== 'string' ||
        !/^[0-7]{6}$/u.test(entry.mode) ||
        (entry.type !== 'blob' && entry.type !== 'tree' && entry.type !== 'commit')
      ) {
        throw new Error('github_context_response_invalid');
      }
      return Object.freeze({
        path: responseText(entry.path, 4_096),
        mode: entry.mode,
        type: entry.type,
        sha: responseSha(entry.sha),
        ...(entry.size === undefined ? {} : { size: responseInteger(entry.size, 100_000_000) }),
      });
    });
    return Object.freeze({
      operation: response.operation,
      repositoryId: githubNumericId(response.repositoryId),
      sha: responseSha(response.sha),
      truncated: response.truncated,
      entries: Object.freeze(entries),
    });
  }
  if (response.operation === 'read_blob') {
    exact(
      response,
      ['operation', 'repositoryId', 'sha', 'encoding', 'content', 'size'],
      ['operation', 'repositoryId', 'sha', 'encoding', 'content', 'size'],
      'server response',
    );
    if (
      response.encoding !== 'base64' ||
      typeof response.content !== 'string' ||
      response.content.length > 24 * 1024 * 1024 ||
      !/^[A-Za-z0-9+/\r\n]*={0,2}$/u.test(response.content)
    ) {
      throw new Error('github_context_response_invalid');
    }
    let decoded: string;
    try {
      const binary = atob(response.content.replace(/\s/gu, ''));
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new Error('github_context_response_invalid');
    }
    if (detectSecrets(decoded).length > 0) {
      throw new Error('github_context_response_invalid');
    }
    const size = responseInteger(response.size, 16 * 1024 * 1024);
    if (new TextEncoder().encode(decoded).length !== size) {
      throw new Error('github_context_response_invalid');
    }
    return Object.freeze({
      operation: response.operation,
      repositoryId: githubNumericId(response.repositoryId),
      sha: responseSha(response.sha),
      encoding: response.encoding,
      content: response.content,
      size,
    });
  }
  throw new Error('github_context_response_invalid');
}

export function createGitHubContextServerExecutor(input: {
  invoke: GitHubContextFunctionInvoker['invoke'];
  getActiveAccountId(): string | null;
}): GitHubContextServerExecutor {
  if (
    !input ||
    typeof input.invoke !== 'function' ||
    typeof input.getActiveAccountId !== 'function'
  ) {
    throw new Error('github_context_executor_invalid');
  }
  return Object.freeze({
    async execute(accountId: string, rawRequest: GitHubContextServerRequest) {
      const expectedAccountId = stableId(accountId, 'account ID');
      if (input.getActiveAccountId() !== expectedAccountId) {
        throw new Error('github_context_account_changed');
      }
      const request = normalizeServerRequest(rawRequest);
      let response: { data: unknown; error: unknown };
      try {
        response = await input.invoke('github-context', { body: request });
      } catch {
        throw new Error('github_context_request_failed');
      }
      if (input.getActiveAccountId() !== expectedAccountId) {
        throw new Error('github_context_account_changed');
      }
      if (!response || response.error || response.data === undefined || response.data === null) {
        throw new Error('github_context_request_failed');
      }
      try {
        return normalizeServerResult(response.data);
      } catch {
        throw new Error('github_context_response_invalid');
      }
    },
  });
}

export function createSupabaseGitHubContextServerExecutor(
  getActiveAccountId: () => string | null,
): GitHubContextServerExecutor {
  return createGitHubContextServerExecutor({
    getActiveAccountId,
    invoke: async (functionName, options) => {
      const client = getSupabaseClient();
      if (!client) return { data: null, error: new Error('cloud_unavailable') };
      return client.functions.invoke(functionName, options);
    },
  });
}
