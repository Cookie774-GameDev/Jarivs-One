import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLOUD_SYNC_QUEUE_CLAIM_STALE_AFTER_MS,
  CLOUD_SYNC_QUEUE_QUARANTINE_ERROR,
  LOCAL_UNBOUND_SYNC_SCOPE_NAME,
  activateSyncQueueCloudAuthority,
  captureSyncQueueOwner,
  cloudSyncQueueAuthorityScopeName,
  cloudSyncQueueClaimKey,
  cloudSyncQueueOwnerKey,
  getCurrentSyncQueueAuthorityScope,
  isExactCloudOwner,
  legacyCloudSyncQueueAuthorityKey,
  materializeLegacyUnknownSyncQueueOwner,
  materializeSyncQueueClaim,
  materializeSyncQueueOwner,
  ownersMayCoalesce,
  parseSyncQueueClaim,
  parseSyncQueueOwner,
  releaseSyncQueueCloudAuthority,
  subscribeSyncQueueAuthorityScope,
  type SyncQueueCloudAuthorityLease,
  type SyncQueueOwnerSnapshot,
} from './cloudSyncQueueOwner';

const leases: SyncQueueCloudAuthorityLease[] = [];

function activate(userId: string): SyncQueueCloudAuthorityLease {
  const lease = activateSyncQueueCloudAuthority(userId);
  leases.push(lease);
  return lease;
}

afterEach(() => {
  for (const lease of leases.splice(0).reverse()) {
    releaseSyncQueueCloudAuthority(lease);
  }
});

describe('cloud sync queue ownership registry', () => {
  it('publishes synchronous exact-account scope changes without stale-release regressions', () => {
    const observed: string[] = [];
    const unsubscribe = subscribeSyncQueueAuthorityScope((scope) => {
      observed.push(scope.name);
    });

    expect(getCurrentSyncQueueAuthorityScope()).toEqual({
      state: 'unbound',
      name: LOCAL_UNBOUND_SYNC_SCOPE_NAME,
    });
    expect(cloudSyncQueueAuthorityScopeName('user-a')).toBe('cloud:user-a');

    const leaseA = activate('user-a');
    const leaseB = activate('user-b');
    releaseSyncQueueCloudAuthority(leaseA);

    expect(getCurrentSyncQueueAuthorityScope()).toEqual({
      state: 'cloud',
      name: 'cloud:user-b',
      userId: 'user-b',
    });
    expect(observed).toEqual(['cloud:user-a', 'cloud:user-b']);

    releaseSyncQueueCloudAuthority(leaseB);
    expect(observed).toEqual(['cloud:user-a', 'cloud:user-b', LOCAL_UNBOUND_SYNC_SCOPE_NAME]);
    unsubscribe();
  });

  it('captures an explicit unbound owner until verified cloud authority activates', () => {
    expect(captureSyncQueueOwner(10)).toEqual({
      state: 'unbound',
      capturedAt: 10,
    });

    const lease = activate('user-a');

    expect(captureSyncQueueOwner(20)).toEqual({
      state: 'cloud',
      userId: 'user-a',
      capturedAt: 20,
    });

    releaseSyncQueueCloudAuthority(lease);
    expect(captureSyncQueueOwner(30)).toEqual({
      state: 'unbound',
      capturedAt: 30,
    });
  });

  it('rejects blank or non-canonical authority identifiers', () => {
    for (const userId of ['', '   ', ' user-a', 'user-a ']) {
      expect(() => activateSyncQueueCloudAuthority(userId)).toThrow('exact normalized user ID');
    }
  });

  it('does not let a stale lease release a newer account authority', () => {
    const leaseA = activate('user-a');
    const leaseB = activate('user-b');

    releaseSyncQueueCloudAuthority(leaseA);
    expect(captureSyncQueueOwner(40)).toMatchObject({
      state: 'cloud',
      userId: 'user-b',
    });

    releaseSyncQueueCloudAuthority({ ...leaseB });
    expect(captureSyncQueueOwner(50)).toMatchObject({
      state: 'cloud',
      userId: 'user-b',
    });

    releaseSyncQueueCloudAuthority(leaseB);
    expect(captureSyncQueueOwner(60)).toEqual({
      state: 'unbound',
      capturedAt: 60,
    });
  });

  it('does not let one throwing scope subscriber strand later stores on an old account', () => {
    const observed: string[] = [];
    const report = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const unsubscribeThrowing = subscribeSyncQueueAuthorityScope(() => {
      throw new Error('broken feature-store subscriber');
    });
    const unsubscribeLater = subscribeSyncQueueAuthorityScope((scope) => {
      observed.push(scope.name);
    });
    let activationError: unknown;

    try {
      activate('user-a');
    } catch (error) {
      activationError = error;
      // The failed activation already published globally. Replace its otherwise
      // unreachable lease so afterEach can restore the unbound test scope.
      activate('user-a');
    } finally {
      unsubscribeThrowing();
      unsubscribeLater();
      report.mockRestore();
    }

    expect(activationError).toBeUndefined();
    expect(observed).toEqual(['cloud:user-a']);
    expect(getCurrentSyncQueueAuthorityScope()).toMatchObject({
      state: 'cloud',
      userId: 'user-a',
    });
  });

  it('materializes and parses immutable cloud, unbound, and legacy records', () => {
    const cloud = materializeSyncQueueOwner('syq_cloud', {
      state: 'cloud',
      userId: 'user-a',
      capturedAt: 11,
    });
    const unbound = materializeSyncQueueOwner('syq_unbound', {
      state: 'unbound',
      capturedAt: 12,
    });
    const legacy = materializeLegacyUnknownSyncQueueOwner('syq_legacy', 'v1_drain_claim_only', 13);

    expect(parseSyncQueueOwner('syq_cloud', cloud)).toEqual(cloud);
    expect(parseSyncQueueOwner('syq_unbound', unbound)).toEqual(unbound);
    expect(parseSyncQueueOwner('syq_legacy', legacy)).toEqual(legacy);
    expect(cloudSyncQueueOwnerKey('syq_cloud')).toBe('cloud_sync:queue_owner:v2:syq_cloud');
    expect(legacyCloudSyncQueueAuthorityKey('syq_cloud')).toBe(
      'cloud_sync:queue_authority:v1:syq_cloud',
    );
    expect(CLOUD_SYNC_QUEUE_QUARANTINE_ERROR).toBe('SYNC_QUEUE_QUARANTINED_LEGACY_OWNER_UNKNOWN');
  });

  it('materializes and strictly parses a row-bound exact-owner upload claim', () => {
    const owner = materializeSyncQueueOwner('syq_claimed', {
      state: 'cloud',
      userId: 'user-a',
      capturedAt: 11,
    });
    const claim = materializeSyncQueueClaim('syq_claimed', owner, 12, 'claim-opaque-a');

    expect(claim).toEqual({
      schemaVersion: 1,
      rowId: 'syq_claimed',
      userId: 'user-a',
      ownerCapturedAt: 11,
      claimedAt: 12,
      claimId: 'claim-opaque-a',
    });
    expect(parseSyncQueueClaim('syq_claimed', claim)).toEqual(claim);
    expect(cloudSyncQueueClaimKey('syq_claimed')).toBe('cloud_sync:queue_claim:v1:syq_claimed');
    expect(CLOUD_SYNC_QUEUE_CLAIM_STALE_AFTER_MS).toBe(5 * 60_000);

    for (const malformed of [
      { ...claim, schemaVersion: 2 },
      { ...claim, rowId: 'syq_other' },
      { ...claim, userId: ' user-a ' },
      { ...claim, ownerCapturedAt: Number.NaN },
      { ...claim, claimedAt: Number.NaN },
      { ...claim, claimId: '' },
    ]) {
      expect(parseSyncQueueClaim('syq_claimed', malformed)).toBeNull();
    }
  });

  it('rejects negative, fractional, and unsafe persisted ownership timestamps', () => {
    const owner = materializeSyncQueueOwner('syq_claimed', {
      state: 'cloud',
      userId: 'user-a',
      capturedAt: 0,
    });
    expect(materializeSyncQueueClaim('syq_claimed', owner, 0, 'claim-zero')).toMatchObject({
      ownerCapturedAt: 0,
      claimedAt: 0,
    });

    for (const invalidTimestamp of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => captureSyncQueueOwner(invalidTimestamp)).toThrow('timestamp');
      expect(() =>
        materializeSyncQueueOwner('syq_invalid', {
          state: 'unbound',
          capturedAt: invalidTimestamp,
        }),
      ).toThrow('timestamp');
      expect(() =>
        materializeLegacyUnknownSyncQueueOwner('syq_invalid', 'missing_v2_owner', invalidTimestamp),
      ).toThrow('timestamp');
      expect(() =>
        materializeSyncQueueClaim('syq_claimed', owner, invalidTimestamp, 'claim-invalid'),
      ).toThrow('timestamp');

      expect(
        parseSyncQueueOwner('syq_invalid', {
          schemaVersion: 2,
          rowId: 'syq_invalid',
          state: 'cloud',
          userId: 'user-a',
          capturedAt: invalidTimestamp,
        }),
      ).toBeNull();
      expect(
        parseSyncQueueOwner('syq_invalid', {
          schemaVersion: 2,
          rowId: 'syq_invalid',
          state: 'unbound',
          capturedAt: invalidTimestamp,
        }),
      ).toBeNull();
      expect(
        parseSyncQueueOwner('syq_invalid', {
          schemaVersion: 2,
          rowId: 'syq_invalid',
          state: 'legacy_unknown',
          reason: 'missing_v2_owner',
          quarantinedAt: invalidTimestamp,
        }),
      ).toBeNull();
      expect(
        parseSyncQueueClaim('syq_claimed', {
          schemaVersion: 1,
          rowId: 'syq_claimed',
          userId: 'user-a',
          ownerCapturedAt: invalidTimestamp,
          claimedAt: 0,
          claimId: 'claim-invalid-owner-time',
        }),
      ).toBeNull();
      expect(
        parseSyncQueueClaim('syq_claimed', {
          schemaVersion: 1,
          rowId: 'syq_claimed',
          userId: 'user-a',
          ownerCapturedAt: 0,
          claimedAt: invalidTimestamp,
          claimId: 'claim-invalid-time',
        }),
      ).toBeNull();
    }
  });

  it.each([
    [
      'row mismatch',
      'syq_other',
      { schemaVersion: 2, rowId: 'syq_row', state: 'unbound', capturedAt: 1 },
    ],
    ['missing row', 'syq_row', { schemaVersion: 2, state: 'unbound', capturedAt: 1 }],
    [
      'non-canonical user',
      'syq_row',
      {
        schemaVersion: 2,
        rowId: 'syq_row',
        state: 'cloud',
        userId: ' user-a ',
        capturedAt: 1,
      },
    ],
    [
      'unknown state',
      'syq_row',
      { schemaVersion: 2, rowId: 'syq_row', state: 'future', capturedAt: 1 },
    ],
    [
      'invalid timestamp',
      'syq_row',
      { schemaVersion: 2, rowId: 'syq_row', state: 'unbound', capturedAt: Number.NaN },
    ],
    [
      'invalid legacy reason',
      'syq_row',
      {
        schemaVersion: 2,
        rowId: 'syq_row',
        state: 'legacy_unknown',
        reason: 'guessed_owner',
        quarantinedAt: 1,
      },
    ],
  ])('rejects malformed owner records: %s', (_label, rowId, value) => {
    expect(parseSyncQueueOwner(rowId, value)).toBeNull();
  });

  it('coalesces only the same exact cloud owner or two explicit unbound owners', () => {
    const cloudA = materializeSyncQueueOwner('syq_a', {
      state: 'cloud',
      userId: 'user-a',
      capturedAt: 1,
    });
    const unbound = materializeSyncQueueOwner('syq_unbound', {
      state: 'unbound',
      capturedAt: 1,
    });
    const legacy = materializeLegacyUnknownSyncQueueOwner('syq_legacy', 'missing_v2_owner', 1);
    const sameA: SyncQueueOwnerSnapshot = {
      state: 'cloud',
      userId: 'user-a',
      capturedAt: 2,
    };
    const caseVariantA: SyncQueueOwnerSnapshot = {
      state: 'cloud',
      userId: 'User-A',
      capturedAt: 2,
    };

    expect(ownersMayCoalesce(cloudA, sameA)).toBe(true);
    expect(ownersMayCoalesce(cloudA, caseVariantA)).toBe(false);
    expect(ownersMayCoalesce(unbound, { state: 'unbound', capturedAt: 2 })).toBe(true);
    expect(ownersMayCoalesce(legacy, sameA)).toBe(false);
    expect(isExactCloudOwner(cloudA, 'user-a')).toBe(true);
    expect(isExactCloudOwner(cloudA, 'User-A')).toBe(false);
    expect(isExactCloudOwner(unbound, 'user-a')).toBe(false);
  });
});
