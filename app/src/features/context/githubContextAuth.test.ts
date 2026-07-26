import { describe, expect, it } from 'vitest';
import {
  GITHUB_CONTEXT_FLOW_STEPS,
  GITHUB_CONTEXT_OPTIONAL_PERMISSIONS,
  GITHUB_CONTEXT_REQUIRED_PERMISSIONS,
  buildGitHubAppTokenPolicy,
  buildGitHubContextMapAuthorization,
  buildGitHubPatFallbackPolicy,
  filterAccessibleGitHubRepositories,
} from './githubContextAuth';

const installation = {
  accountId: 'account-1',
  installationId: 'installation-1',
  scope: 'selected' as const,
  accessibleRepositoryIds: ['repo-1', 'repo-2'],
  permissions: {
    contents: 'read' as const,
    metadata: 'read' as const,
    issues: 'read' as const,
    pull_requests: 'read' as const,
  },
};
const authority = { getInstallation: () => installation };

describe('GitHub Context authentication policy', () => {
  it('defines the complete ordered Context-page GitHub flow', () => {
    expect(GITHUB_CONTEXT_FLOW_STEPS).toEqual([
      'connect',
      'authenticate',
      'authorize_github_app',
      'list_accessible_repositories',
      'choose_repository',
      'choose_ref',
      'choose_metadata_scopes',
      'choose_analysis_location',
      'create_map',
    ]);
  });

  it('requires only read contents/metadata and exposes optional read-only metadata scopes', () => {
    expect(GITHUB_CONTEXT_REQUIRED_PERMISSIONS).toEqual({
      contents: 'read',
      metadata: 'read',
    });
    expect(GITHUB_CONTEXT_OPTIONAL_PERMISSIONS).toEqual([
      'issues',
      'pull_requests',
      'actions',
      'checks',
      'discussions',
      'releases',
    ]);
  });

  it('shows only repositories in the installation access list', () => {
    const repositories = [
      { id: 'repo-1', owner: 'octo', name: 'one' },
      { id: 'repo-2', owner: 'octo', name: 'two' },
      { id: 'repo-private', owner: 'other', name: 'secret' },
    ];
    expect(
      filterAccessibleGitHubRepositories(installation, repositories, authority).map(({ id }) => id),
    ).toEqual(['repo-1', 'repo-2']);
  });

  it('creates a GitHub App authorization only for an accessible repository and read scopes', () => {
    expect(
      buildGitHubContextMapAuthorization(
        installation,
        {
          repositoryId: 'repo-1',
          optionalPermissions: ['issues', 'pull_requests'],
          analysisLocation: 'local',
        },
        authority,
      ),
    ).toEqual({
      authMode: 'github_app',
      accountId: 'account-1',
      installationId: 'installation-1',
      repositoryId: 'repo-1',
      permissions: {
        contents: 'read',
        metadata: 'read',
        issues: 'read',
        pull_requests: 'read',
      },
      analysisLocation: 'local',
      writePermissionsRequested: false,
      executable: false,
    });
    expect(() =>
      buildGitHubContextMapAuthorization(
        installation,
        {
          repositoryId: 'repo-private',
          optionalPermissions: [],
          analysisLocation: 'cloud',
        },
        authority,
      ),
    ).toThrow(/accessible/i);
    expect(() =>
      buildGitHubContextMapAuthorization(
        installation,
        {
          repositoryId: 'repo-1',
          optionalPermissions: ['administration' as never],
          analysisLocation: 'local',
        },
        authority,
      ),
    ).toThrow(/permission/i);
  });

  it('enforces server-only short-lived narrowed rotating installation tokens', () => {
    expect(
      buildGitHubAppTokenPolicy(
        installation,
        'repo-1',
        {
          issuedAt: 1_000,
          expiresAt: 1_000 + 3_600_000,
        },
        authority,
      ),
    ).toEqual({
      installationId: 'installation-1',
      repositoryId: 'repo-1',
      generatedServerSide: true,
      installationScoped: true,
      repositoryNarrowed: true,
      sentToBrowser: false,
      writtenToTerminal: false,
      writtenToLogs: false,
      rotatesAutomatically: true,
      issuedAt: 1_000,
      expiresAt: 3_601_000,
      executable: false,
    });
    expect(() =>
      buildGitHubAppTokenPolicy(
        installation,
        'repo-1',
        {
          issuedAt: 1_000,
          expiresAt: 1_000 + 3_600_001,
        },
        authority,
      ),
    ).toThrow(/lifetime/i);
  });

  it('keeps a narrow warned and revocable fine-grained PAT fallback without exposing a token', () => {
    expect(buildGitHubPatFallbackPolicy('repo-1')).toEqual({
      authMode: 'fine_grained_pat',
      repositoryId: 'repo-1',
      contentsPermission: 'read',
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
  });

  it('rejects write permissions, foreign scope, duplicates, accessors, and oversized inputs', () => {
    expect(() =>
      buildGitHubContextMapAuthorization(
        {
          ...installation,
          permissions: { ...installation.permissions, contents: 'write' as never },
        },
        {
          repositoryId: 'repo-1',
          optionalPermissions: [],
          analysisLocation: 'local',
        },
        {
          getInstallation: () => ({
            ...installation,
            permissions: { ...installation.permissions, contents: 'write' as never },
          }),
        },
      ),
    ).toThrow(/write|permission/i);
    expect(() =>
      buildGitHubContextMapAuthorization(
        installation,
        {
          repositoryId: 'repo-1',
          optionalPermissions: ['issues', 'issues'],
          analysisLocation: 'local',
        },
        authority,
      ),
    ).toThrow(/duplicate/i);

    let calls = 0;
    const accessor = {
      ...installation,
      get accountId() {
        calls += 1;
        return 'account-1';
      },
    };
    expect(() => filterAccessibleGitHubRepositories(accessor, [], authority)).toThrow(
      /installation/i,
    );
    expect(calls).toBe(0);
    expect(() => buildGitHubPatFallbackPolicy('x'.repeat(100_000))).toThrow(/repository/i);
  });
});
