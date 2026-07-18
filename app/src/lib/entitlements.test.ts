import { describe, expect, it } from 'vitest';
import type { JarvisEntitlementSnapshot } from '@/lib/jarvis/contracts';
import {
  APP_ADMIN_CAPABILITY,
  effectivePlan,
  entitlementSnapshotAllowsAdmin,
  planAllowsJarvisCall,
  planAllowsVoiceWithAdmin,
  resolveLocalDevelopmentEntitlementSnapshot,
  type LocalDevelopmentEntitlementConfig,
} from './entitlements';

const NOW = 1_750_000_000_000;

const EMPTY_CONFIG: LocalDevelopmentEntitlementConfig = {
  blanketAdmin: false,
  adminEmails: [],
  adminLocalIds: [],
};

describe('resolveLocalDevelopmentEntitlementSnapshot', () => {
  it.each(['vipersel2@gmail.com', 'VIPERSEL2@GMAIL.COM', 'vipersel2+owner@gmail.com'])(
    'does not grant implicit owner access to %s',
    (email) => {
      expect(
        resolveLocalDevelopmentEntitlementSnapshot(
          { email },
          { context: { production: false, now: NOW }, config: EMPTY_CONFIG },
        ),
      ).toEqual({ source: 'unavailable', capabilities: [] });
    },
  );

  it.each([
    [{ email: 'DEV@example.com' }, { ...EMPTY_CONFIG, adminEmails: ['dev@example.com'] }],
    [{ localUserId: 'LOCAL-1' }, { ...EMPTY_CONFIG, adminLocalIds: ['local-1'] }],
  ] as const)('grants an explicitly configured development identity', (identity, config) => {
    expect(
      resolveLocalDevelopmentEntitlementSnapshot(identity, {
        context: { production: false, now: NOW },
        config,
      }),
    ).toEqual({
      source: 'local_development',
      planId: 'ultra',
      capabilities: [APP_ADMIN_CAPABILITY],
      verifiedAt: NOW,
      expiresAt: NOW + 5 * 60_000,
    });
  });

  it('fails closed in production even for explicit development configuration', () => {
    expect(
      resolveLocalDevelopmentEntitlementSnapshot(
        { email: 'dev@example.com' },
        {
          context: { production: true, now: NOW },
          config: { ...EMPTY_CONFIG, adminEmails: ['dev@example.com'] },
        },
      ),
    ).toEqual({ source: 'unavailable', capabilities: [] });
  });
});

describe('entitlementSnapshotAllowsAdmin', () => {
  const evaluate = (snapshot: JarvisEntitlementSnapshot, production = false) =>
    entitlementSnapshotAllowsAdmin(snapshot, { production, now: NOW });

  it('accepts an unexpired verified server capability', () => {
    expect(
      evaluate({
        source: 'server',
        capabilities: [APP_ADMIN_CAPABILITY],
        verifiedAt: NOW - 1,
        expiresAt: NOW + 1,
      }),
    ).toBe(true);
  });

  it('rejects local-development authority in production', () => {
    expect(
      evaluate(
        {
          source: 'local_development',
          capabilities: [APP_ADMIN_CAPABILITY],
          verifiedAt: NOW - 1,
          expiresAt: NOW + 1,
        },
        true,
      ),
    ).toBe(false);
  });

  it.each([
    ['missing verification', { source: 'server', capabilities: [APP_ADMIN_CAPABILITY] }],
    [
      'expired evidence',
      {
        source: 'server',
        capabilities: [APP_ADMIN_CAPABILITY],
        verifiedAt: NOW - 2,
        expiresAt: NOW,
      },
    ],
    [
      'unavailable source',
      {
        source: 'unavailable',
        capabilities: [APP_ADMIN_CAPABILITY],
        verifiedAt: NOW - 1,
        expiresAt: NOW + 1,
      },
    ],
    [
      'empty capabilities',
      { source: 'server', capabilities: [], verifiedAt: NOW - 1, expiresAt: NOW + 1 },
    ],
    [
      'plan without capability',
      {
        source: 'server',
        planId: 'ultra',
        capabilities: [],
        verifiedAt: NOW - 1,
        expiresAt: NOW + 1,
      },
    ],
  ] satisfies Array<[string, JarvisEntitlementSnapshot]>)('rejects %s', (_name, snapshot) => {
    expect(evaluate(snapshot)).toBe(false);
  });
});

describe('boolean compatibility helpers', () => {
  it('preserves plan behavior for a derived verified-admin boolean', () => {
    const admin = entitlementSnapshotAllowsAdmin(
      {
        source: 'server',
        capabilities: [APP_ADMIN_CAPABILITY],
        verifiedAt: NOW,
        expiresAt: NOW + 1,
      },
      { production: true, now: NOW },
    );

    expect(effectivePlan('free', admin)).toBe('ultra');
    expect(planAllowsJarvisCall('free', admin)).toBe(true);
    expect(planAllowsVoiceWithAdmin('free', admin)).toBe(true);
    expect(effectivePlan('pro', false)).toBe('pro');
    expect(planAllowsJarvisCall('free', false)).toBe(false);
    expect(planAllowsVoiceWithAdmin('free', false)).toBe(false);
  });
});
