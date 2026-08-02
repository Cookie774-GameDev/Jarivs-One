import { describe, expect, it } from 'vitest';
import {
  GITHUB_REFRESH_MODES,
  GITHUB_WEBHOOK_EVENT_KINDS,
  buildGitHubPrivateRepositoryPolicy,
  buildGitHubRefreshPolicy,
  planGitHubAccessRevocation,
  planGitHubRefresh,
} from './githubRefreshPrivacy';

const identity = {
  accountId: 'account-1',
  installationId: 'installation-1',
  owner: 'octo',
  repository: 'vibespace',
  resolvedCommitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
};

const accessAuthority = {
  getAccess: () => ({
    identity,
    state: 'active' as const,
    checkedAt: '2026-07-26T07:00:00.000Z',
  }),
};

describe('GitHub refresh, privacy, and revocation', () => {
  it('defines all refresh modes and trusted webhook event kinds', () => {
    expect(GITHUB_REFRESH_MODES).toEqual(['manual', 'on_app_open', 'interval', 'webhook_assisted']);
    expect(GITHUB_WEBHOOK_EVENT_KINDS).toEqual([
      'push',
      'repository_renamed',
      'branch_changed',
      'installation_removed',
      'repository_access_changed',
      'issue_or_pr_updated',
    ]);
  });

  it('builds bounded manual, app-open, interval, and webhook policies', () => {
    expect(buildGitHubRefreshPolicy({ mode: 'manual', intervalMinutes: null })).toEqual({
      mode: 'manual',
      intervalMinutes: null,
    });
    expect(buildGitHubRefreshPolicy({ mode: 'on_app_open', intervalMinutes: null }).mode).toBe(
      'on_app_open',
    );
    expect(buildGitHubRefreshPolicy({ mode: 'interval', intervalMinutes: 30 })).toEqual({
      mode: 'interval',
      intervalMinutes: 30,
    });
    expect(buildGitHubRefreshPolicy({ mode: 'webhook_assisted', intervalMinutes: null }).mode).toBe(
      'webhook_assisted',
    );
    expect(() => buildGitHubRefreshPolicy({ mode: 'interval', intervalMinutes: 0 })).toThrow(
      /interval/i,
    );
  });

  it('plans manual and local app indexing only from trusted active access', () => {
    expect(
      planGitHubRefresh(
        identity,
        buildGitHubRefreshPolicy({ mode: 'manual', intervalMinutes: null }),
        { kind: 'manual' },
        accessAuthority,
      ),
    ).toEqual({
      identity,
      trigger: 'manual',
      refreshAllowed: true,
      updateMetadata: true,
      markMapStale: true,
      localIndexingRequired: true,
      remoteReadsAllowed: true,
      webhookEvent: null,
      executable: false,
    });
  });

  it('resolves webhook deliveries through trusted authority and marks affected maps stale', () => {
    expect(
      planGitHubRefresh(
        identity,
        buildGitHubRefreshPolicy({ mode: 'webhook_assisted', intervalMinutes: null }),
        { kind: 'webhook', deliveryId: 'delivery-1' },
        {
          ...accessAuthority,
          getWebhookEvent: () => ({
            deliveryId: 'delivery-1',
            identity,
            kind: 'push' as const,
            occurredAt: '2026-07-26T07:05:00.000Z',
          }),
        },
      ),
    ).toEqual({
      identity,
      trigger: 'webhook',
      refreshAllowed: true,
      updateMetadata: true,
      markMapStale: true,
      localIndexingRequired: true,
      remoteReadsAllowed: true,
      webhookEvent: {
        deliveryId: 'delivery-1',
        kind: 'push',
        occurredAt: '2026-07-26T07:05:00.000Z',
      },
      executable: false,
    });
  });

  it('enforces private-repository badges, encrypted caches, URL safety, and explicit cloud consent', () => {
    const noConsent = buildGitHubPrivateRepositoryPolicy(
      {
        identity,
        visibility: 'private',
        retentionPolicy: 'purge_on_revocation',
        cloudApproval: null,
      },
      null,
    );
    expect(noConsent).toEqual({
      identity,
      visibility: 'private',
      privacyBadge: true,
      cloudRetention: 'minimized',
      cacheEncryptionRequired: true,
      publicCodeUrlsAllowed: false,
      cloudModelAllowed: false,
      approvedProviderId: null,
      approvedModelId: null,
      retentionPolicy: 'purge_on_revocation',
      executable: false,
    });

    const approval = {
      approvalId: 'approval-1',
      actor: 'direct_user' as const,
      identity,
      providerId: 'openai',
      modelId: 'gpt-5.6',
      purpose: 'private_repository_analysis' as const,
      approvedAt: '2026-07-26T07:10:00.000Z',
    };
    expect(
      buildGitHubPrivateRepositoryPolicy(
        {
          identity,
          visibility: 'private',
          retentionPolicy: 'keep_encrypted_after_revocation',
          cloudApproval: approval,
        },
        { isApproved: (candidate) => candidate.approvalId === 'approval-1' },
      ),
    ).toMatchObject({
      cloudModelAllowed: true,
      approvedProviderId: 'openai',
      approvedModelId: 'gpt-5.6',
      cacheEncryptionRequired: true,
      publicCodeUrlsAllowed: false,
    });
  });

  it('stops refresh and remote reads after trusted access removal with explicit keep/purge behavior', () => {
    const removedAuthority = {
      getAccess: () => ({
        identity,
        state: 'removed' as const,
        checkedAt: '2026-07-26T07:15:00.000Z',
      }),
    };
    expect(
      planGitHubAccessRevocation(identity, 'keep_encrypted_after_revocation', removedAuthority),
    ).toEqual({
      identity,
      sourcePermission: 'lost',
      refreshAllowed: false,
      remoteReadsAllowed: false,
      localSnapshotAction: 'keep_encrypted',
      cachedContentRemovalRequired: false,
      options: ['reconnect', 'remove_source'],
      checkedAt: '2026-07-26T07:15:00.000Z',
      executable: false,
    });
    expect(
      planGitHubAccessRevocation(identity, 'purge_on_revocation', removedAuthority),
    ).toMatchObject({
      localSnapshotAction: 'purge',
      cachedContentRemovalRequired: true,
    });
    expect(() =>
      planGitHubRefresh(
        identity,
        buildGitHubRefreshPolicy({ mode: 'manual', intervalMinutes: null }),
        { kind: 'manual' },
        removedAuthority,
      ),
    ).toThrow(/permission|access/i);
  });

  it('rejects forged webhook/approval identity and closed-boundary abuse', () => {
    expect(() =>
      planGitHubRefresh(
        identity,
        buildGitHubRefreshPolicy({ mode: 'webhook_assisted', intervalMinutes: null }),
        { kind: 'webhook', deliveryId: 'delivery-1' },
        {
          ...accessAuthority,
          getWebhookEvent: () => ({
            deliveryId: 'delivery-1',
            identity: { ...identity, repository: 'other' },
            kind: 'push' as const,
            occurredAt: '2026-07-26T07:05:00.000Z',
          }),
        },
      ),
    ).toThrow(/webhook/i);

    let calls = 0;
    const accessor = {
      mode: 'manual' as const,
      get intervalMinutes() {
        calls += 1;
        return null;
      },
    };
    expect(() => buildGitHubRefreshPolicy(accessor)).toThrow(/policy/i);
    expect(calls).toBe(0);
  });
});
