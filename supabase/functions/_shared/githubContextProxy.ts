export type GitHubContextProxyRequest =
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

export interface GitHubContextProxyIdentity {
  userId: string;
  githubUserId: string;
}

export interface GitHubContextProxyDependencies {
  now(): number;
  getInstallation(installationId: string): Promise<unknown>;
  createInstallationToken(input: {
    installationId: string;
    repositoryIds: string[] | undefined;
  }): Promise<unknown>;
  githubRequest(input: { token: string; path: string }): Promise<unknown>;
}

const NUMERIC_ID = /^[1-9]\d{0,15}$/u;
const SHA = /^[a-f0-9]{40,64}$/u;
const REPOSITORY_SEGMENT = /^[A-Za-z0-9_.-]{1,100}$/u;
const SAFE_REF =
  /^[^\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069\ufeff]{1,255}$/u;
const SAFE_TEXT =
  /^[^\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069\ufeff]+$/u;
const MAX_REPOSITORIES = 100;
const MAX_TREE_ENTRIES = 50_000;
const MAX_BLOB_BASE64_CHARS = 24 * 1024 * 1024;
const INSTALLATION_TOKEN = /^ghs_[A-Za-z0-9_]{20,}$/u;

function error(code: string): never {
  throw new Error(code);
}

function plainRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) error(code);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) error(code);
  return value as Record<string, unknown>;
}

function exact(
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
  code: string,
): void {
  const allowedKeys = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) error(code);
  if (required.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) error(code);
}

function numericId(value: unknown, code = 'github_context_request_invalid'): string {
  const normalized =
    typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof normalized !== 'string' || !NUMERIC_ID.test(normalized)) error(code);
  return normalized;
}

function boundedText(value: unknown, maximum: number, code: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximum ||
    value.trim() !== value ||
    !SAFE_TEXT.test(value)
  ) {
    error(code);
  }
  return value;
}

function parseRequest(raw: unknown): GitHubContextProxyRequest {
  const request = plainRecord(raw, 'github_context_request_invalid');
  const operation = request.operation;
  if (operation === 'list_repositories') {
    exact(
      request,
      ['operation', 'installationId', 'page'],
      ['operation', 'installationId'],
      'github_context_request_invalid',
    );
    const page = request.page ?? 1;
    if (!Number.isSafeInteger(page) || (page as number) < 1 || (page as number) > 10_000) {
      error('github_context_request_invalid');
    }
    return {
      operation,
      installationId: numericId(request.installationId),
      ...(request.page === undefined ? {} : { page: page as number }),
    };
  }
  if (operation === 'read_tree') {
    exact(
      request,
      ['operation', 'installationId', 'repositoryId', 'ref'],
      ['operation', 'installationId', 'repositoryId', 'ref'],
      'github_context_request_invalid',
    );
    if (
      typeof request.ref !== 'string' ||
      request.ref.trim() !== request.ref ||
      !SAFE_REF.test(request.ref)
    ) {
      error('github_context_request_invalid');
    }
    return {
      operation,
      installationId: numericId(request.installationId),
      repositoryId: numericId(request.repositoryId),
      ref: request.ref,
    };
  }
  if (operation === 'read_blob') {
    exact(
      request,
      ['operation', 'installationId', 'repositoryId', 'sha'],
      ['operation', 'installationId', 'repositoryId', 'sha'],
      'github_context_request_invalid',
    );
    if (typeof request.sha !== 'string' || !SHA.test(request.sha)) {
      error('github_context_request_invalid');
    }
    return {
      operation,
      installationId: numericId(request.installationId),
      repositoryId: numericId(request.repositoryId),
      sha: request.sha,
    };
  }
  return error('github_context_request_invalid');
}

function assertIdentity(raw: GitHubContextProxyIdentity): GitHubContextProxyIdentity {
  const identity = plainRecord(raw, 'github_context_identity_invalid');
  exact(
    identity,
    ['userId', 'githubUserId'],
    ['userId', 'githubUserId'],
    'github_context_identity_invalid',
  );
  return {
    userId: boundedText(identity.userId, 128, 'github_context_identity_invalid'),
    githubUserId: numericId(identity.githubUserId, 'github_context_identity_invalid'),
  };
}

function verifyInstallation(raw: unknown, installationId: string, githubUserId: string): void {
  const installation = plainRecord(raw, 'github_context_installation_invalid');
  const account = plainRecord(installation.account, 'github_context_installation_invalid');
  if (
    numericId(installation.id, 'github_context_installation_invalid') !== installationId ||
    account.type !== 'User' ||
    numericId(account.id, 'github_context_installation_invalid') !== githubUserId
  ) {
    error('github_context_installation_forbidden');
  }
  const permissions = plainRecord(installation.permissions, 'github_context_permissions_invalid');
  if (permissions.contents !== 'read' || permissions.metadata !== 'read') {
    error('github_context_permissions_invalid');
  }
  for (const access of Object.values(permissions)) {
    if (access !== 'read') error('github_context_permissions_invalid');
  }
}

function parseRepository(raw: unknown) {
  const repository = plainRecord(raw, 'github_context_response_invalid');
  const id = numericId(repository.id, 'github_context_response_invalid');
  const fullName = boundedText(repository.full_name, 201, 'github_context_response_invalid');
  const segments = fullName.split('/');
  if (
    segments.length !== 2 ||
    segments.some((segment) => !REPOSITORY_SEGMENT.test(segment)) ||
    typeof repository.private !== 'boolean'
  ) {
    error('github_context_response_invalid');
  }
  return {
    id,
    owner: segments[0]!,
    name: boundedText(repository.name, 100, 'github_context_response_invalid'),
    fullName,
    private: repository.private,
    defaultBranch: boundedText(repository.default_branch, 255, 'github_context_response_invalid'),
  };
}

function parseToken(
  raw: unknown,
  now: number,
  repositoryId?: string,
): { token: string; repositoryFullName?: string } {
  const grant = plainRecord(raw, 'github_context_token_invalid');
  const token = boundedText(grant.token, 2_000, 'github_context_token_invalid');
  if (!INSTALLATION_TOKEN.test(token)) error('github_context_token_invalid');
  const expiresAt =
    typeof grant.expires_at === 'string' ? Date.parse(grant.expires_at) : Number.NaN;
  if (
    !Number.isFinite(now) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= now ||
    expiresAt - now > 3_600_000
  ) {
    error('github_context_token_invalid');
  }
  if (!repositoryId) return { token };
  if (!Array.isArray(grant.repositories) || grant.repositories.length > MAX_REPOSITORIES) {
    error('github_context_repository_forbidden');
  }
  const matches = grant.repositories.filter((rawRepository) => {
    try {
      const repository = plainRecord(rawRepository, 'github_context_repository_forbidden');
      return numericId(repository.id, 'github_context_repository_forbidden') === repositoryId;
    } catch {
      return false;
    }
  });
  if (matches.length !== 1) error('github_context_repository_forbidden');
  const repository = plainRecord(matches[0], 'github_context_repository_forbidden');
  const fullName = boundedText(repository.full_name, 201, 'github_context_repository_forbidden');
  const segments = fullName.split('/');
  if (segments.length !== 2 || segments.some((segment) => !REPOSITORY_SEGMENT.test(segment))) {
    error('github_context_repository_forbidden');
  }
  return { token, repositoryFullName: fullName };
}

function parseRepositoryList(raw: unknown, page: number) {
  const response = plainRecord(raw, 'github_context_response_invalid');
  if (
    !Number.isSafeInteger(response.total_count) ||
    (response.total_count as number) < 0 ||
    !Array.isArray(response.repositories) ||
    response.repositories.length > MAX_REPOSITORIES
  ) {
    error('github_context_response_invalid');
  }
  const repositories = response.repositories.map(parseRepository);
  if (new Set(repositories.map(({ id }) => id)).size !== repositories.length) {
    error('github_context_response_invalid');
  }
  return Object.freeze({
    operation: 'list_repositories' as const,
    page,
    hasMore: page * MAX_REPOSITORIES < (response.total_count as number),
    repositories: Object.freeze(repositories.map((repository) => Object.freeze(repository))),
  });
}

function parseTree(raw: unknown, repositoryId: string) {
  const response = plainRecord(raw, 'github_context_response_invalid');
  if (
    typeof response.sha !== 'string' ||
    !SHA.test(response.sha) ||
    typeof response.truncated !== 'boolean' ||
    !Array.isArray(response.tree) ||
    response.tree.length > MAX_TREE_ENTRIES
  ) {
    error('github_context_response_invalid');
  }
  const entries = response.tree.map((rawEntry) => {
    const entry = plainRecord(rawEntry, 'github_context_response_invalid');
    const type = entry.type;
    if (type !== 'blob' && type !== 'tree' && type !== 'commit') {
      error('github_context_response_invalid');
    }
    if (
      typeof entry.sha !== 'string' ||
      !SHA.test(entry.sha) ||
      typeof entry.mode !== 'string' ||
      !/^[0-7]{6}$/u.test(entry.mode)
    ) {
      error('github_context_response_invalid');
    }
    const size = entry.size;
    if (
      size !== undefined &&
      (!Number.isSafeInteger(size) || (size as number) < 0 || (size as number) > 100_000_000)
    ) {
      error('github_context_response_invalid');
    }
    return Object.freeze({
      path: boundedText(entry.path, 4_096, 'github_context_response_invalid'),
      mode: entry.mode,
      type,
      sha: entry.sha,
      ...(size === undefined ? {} : { size: size as number }),
    });
  });
  return Object.freeze({
    operation: 'read_tree' as const,
    repositoryId,
    sha: response.sha,
    truncated: response.truncated,
    entries: Object.freeze(entries),
  });
}

function parseBlob(raw: unknown, repositoryId: string) {
  const response = plainRecord(raw, 'github_context_response_invalid');
  const compactContent =
    typeof response.content === 'string' ? response.content.replace(/\s/gu, '') : '';
  const padding = compactContent.endsWith('==') ? 2 : compactContent.endsWith('=') ? 1 : 0;
  const decodedBytes = (compactContent.length / 4) * 3 - padding;
  if (
    typeof response.sha !== 'string' ||
    !SHA.test(response.sha) ||
    response.encoding !== 'base64' ||
    typeof response.content !== 'string' ||
    response.content.length > MAX_BLOB_BASE64_CHARS ||
    !/^[A-Za-z0-9+/\r\n]*={0,2}$/u.test(response.content) ||
    compactContent.length % 4 !== 0 ||
    !Number.isSafeInteger(response.size) ||
    (response.size as number) < 0 ||
    (response.size as number) > 16 * 1024 * 1024 ||
    decodedBytes !== response.size
  ) {
    error('github_context_response_invalid');
  }
  return Object.freeze({
    operation: 'read_blob' as const,
    repositoryId,
    sha: response.sha,
    encoding: 'base64' as const,
    content: response.content,
    size: response.size as number,
  });
}

export function createGitHubContextProxy(dependencies: GitHubContextProxyDependencies) {
  if (
    !dependencies ||
    typeof dependencies.now !== 'function' ||
    typeof dependencies.getInstallation !== 'function' ||
    typeof dependencies.createInstallationToken !== 'function' ||
    typeof dependencies.githubRequest !== 'function'
  ) {
    error('github_context_dependencies_invalid');
  }

  return Object.freeze({
    async execute(identityInput: GitHubContextProxyIdentity, rawRequest: unknown) {
      const identity = assertIdentity(identityInput);
      const request = parseRequest(rawRequest);
      const installation = await dependencies.getInstallation(request.installationId);
      verifyInstallation(installation, request.installationId, identity.githubUserId);

      const repositoryIds =
        request.operation === 'list_repositories' ? undefined : [request.repositoryId];
      const rawGrant = await dependencies.createInstallationToken({
        installationId: request.installationId,
        repositoryIds,
      });
      const grant = parseToken(
        rawGrant,
        dependencies.now(),
        request.operation === 'list_repositories' ? undefined : request.repositoryId,
      );

      if (request.operation === 'list_repositories') {
        const page = request.page ?? 1;
        const rawRepositories = await dependencies.githubRequest({
          token: grant.token,
          path: `/installation/repositories?per_page=${MAX_REPOSITORIES}&page=${page}`,
        });
        return parseRepositoryList(rawRepositories, page);
      }

      const repositoryFullName = grant.repositoryFullName;
      if (!repositoryFullName) error('github_context_repository_forbidden');
      if (request.operation === 'read_tree') {
        const rawTree = await dependencies.githubRequest({
          token: grant.token,
          path: `/repos/${repositoryFullName}/git/trees/${encodeURIComponent(request.ref)}?recursive=1`,
        });
        return parseTree(rawTree, request.repositoryId);
      }
      const rawBlob = await dependencies.githubRequest({
        token: grant.token,
        path: `/repos/${repositoryFullName}/git/blobs/${request.sha}`,
      });
      return parseBlob(rawBlob, request.repositoryId);
    },
  });
}
