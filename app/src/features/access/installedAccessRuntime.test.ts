import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { AccessServerSnapshot } from './accessGateway';
import type { OfflineLeaseClock } from './offlineLease';
import type { OfflineLeaseFreshnessStore } from './offlineLeaseFreshness';
import {
  createInstalledAccessRuntime,
  InstalledAccessTransportUnavailableError,
  type InstalledLeaseStore,
} from './installedAccessRuntime';

const USER_ID = 'user-installed-1';
const KEY_ID = 'lease-key-2026-08';
const T0 = 1_785_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

let privateKey: CryptoKey;
let publicKeyConfiguration: string;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/gu, '');
}

function textToBase64Url(value: string): string {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

async function signedLease(
  overrides: Partial<{
    sub: string;
    status: 'active' | 'trialing' | 'past_due' | 'grace' | 'none';
    iat: number;
    exp: number;
    lst: number;
    revision: number;
    kid: string;
  }> = {},
): Promise<{
  exp: number;
  iat: number;
  kid: string;
  lease: string;
  revision: number;
  status: string;
}> {
  const kid = overrides.kid ?? KEY_ID;
  const claims = {
    sub: overrides.sub ?? USER_ID,
    status: overrides.status ?? 'active',
    iat: overrides.iat ?? T0,
    exp: overrides.exp ?? T0 + DAY,
    lst: overrides.lst ?? T0,
    revision: overrides.revision ?? 7,
  };
  const header = textToBase64Url(JSON.stringify({ v: 1, alg: 'ES256', kid }));
  const payload = textToBase64Url(JSON.stringify(claims));
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      privateKey,
      new TextEncoder().encode(`${header}.${payload}`),
    ),
  );
  return {
    lease: `${header}.${payload}.${bytesToBase64Url(signature)}`,
    status: claims.status,
    iat: claims.iat,
    exp: claims.exp,
    revision: claims.revision,
    kid,
  };
}

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  privateKey = pair.privateKey;
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  publicKeyConfiguration = JSON.stringify([
    {
      kid: KEY_ID,
      jwk: {
        kty: jwk.kty,
        crv: jwk.crv,
        x: jwk.x,
        y: jwk.y,
        key_ops: ['verify'],
        ext: true,
      },
    },
  ]);
});

function snapshot(status: 'active' | 'locked' = 'active'): AccessServerSnapshot {
  const active = status === 'active';
  return {
    status,
    enabled: true,
    serverTime: new Date(T0).toISOString(),
    trialEndsAt: null,
    currentPeriodEndsAt: active ? new Date(T0 + DAY).toISOString() : null,
    graceEndsAt: null,
    daysRemaining: active ? 1 : null,
    canUseApp: active,
    canEdit: active,
    canExport: true,
    requiresCheckout: !active,
    checkoutReason: active ? null : 'access_locked',
  };
}

function leaseStore(initial?: string): InstalledLeaseStore & { value: () => string | null } {
  let value = initial ?? null;
  return {
    async read() {
      return value;
    },
    async write(_accountId, lease) {
      value = lease;
    },
    async remove() {
      value = null;
    },
    value: () => value,
  };
}

function freshnessStore(): OfflineLeaseFreshnessStore {
  let value: string | null = null;
  return {
    durability: 'restart_safe',
    async read() {
      return value;
    },
    async write(_accountId, next) {
      value = next;
    },
  };
}

function clock(now = T0 + 1_000): OfflineLeaseClock {
  return { now: () => now, monotonicNow: () => 1_000 };
}

function runtime(overrides: Partial<Parameters<typeof createInstalledAccessRuntime>[0]> = {}) {
  return createInstalledAccessRuntime({
    getAccountId: vi.fn(async () => USER_ID),
    checkOnline: vi.fn(async () => snapshot()),
    requestLease: vi.fn(async () => signedLease()),
    publicKeyConfiguration,
    leaseStore: leaseStore(),
    freshnessStore: freshnessStore(),
    clock: clock(),
    featurePlan: { active: true, tier: 'apex' },
    ...overrides,
  });
}

describe('installed Access runtime', () => {
  it('keeps the authoritative online decision primary and caches only a verified lease', async () => {
    const store = leaseStore();
    const checkOnline = vi.fn(async () => snapshot());
    const requestLease = vi.fn(async () => signedLease());
    const installed = runtime({ checkOnline, requestLease, leaseStore: store });

    const model = await installed.loadViewModel(new AbortController().signal);

    expect(model.state).toBe('active');
    expect(model.usable).toBe(true);
    expect(model.featureTier).toBe('apex');
    expect(checkOnline).toHaveBeenCalledTimes(1);
    expect(requestLease).toHaveBeenCalledTimes(1);
    expect(store.value()).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);
  });

  it('uses a current account-bound signed lease only for explicit transport unavailability', async () => {
    const token = await signedLease();
    const store = leaseStore(token.lease);
    const installed = runtime({
      checkOnline: vi.fn(async () => {
        throw new InstalledAccessTransportUnavailableError();
      }),
      requestLease: vi.fn(async () => {
        throw new Error('must not issue while offline');
      }),
      leaseStore: store,
    });

    const model = await installed.loadViewModel(new AbortController().signal);

    expect(model.state).toBe('active');
    expect(model.usable).toBe(true);
    expect(model.capturedAt).toBe(T0);
    expect(Object.isFrozen(model)).toBe(true);
  });

  it('preserves a valid lease across restart and fails closed after wall-clock rollback', async () => {
    const token = await signedLease({ revision: 9 });
    const store = leaseStore(token.lease);
    const freshness = freshnessStore();
    const offline = vi.fn(async () => {
      throw new InstalledAccessTransportUnavailableError();
    });
    const firstLaunch = runtime({
      checkOnline: offline,
      leaseStore: store,
      freshnessStore: freshness,
      clock: clock(T0 + 1_000),
    });
    expect((await firstLaunch.loadViewModel(new AbortController().signal)).usable).toBe(true);

    const restarted = runtime({
      checkOnline: offline,
      leaseStore: store,
      freshnessStore: freshness,
      clock: clock(T0 + 2_000),
    });
    expect((await restarted.loadViewModel(new AbortController().signal)).usable).toBe(true);

    const rolledBack = runtime({
      checkOnline: offline,
      leaseStore: store,
      freshnessStore: freshness,
      clock: clock(T0 - 10 * 60_000),
    });
    await expect(rolledBack.loadViewModel(new AbortController().signal)).rejects.toThrowError(
      /could not be verified/i,
    );
  });

  it('fails offline closed at the exact lease expiry boundary', async () => {
    const token = await signedLease({ exp: T0 + 10_000 });
    const installed = runtime({
      checkOnline: vi.fn(async () => {
        throw new InstalledAccessTransportUnavailableError();
      }),
      leaseStore: leaseStore(token.lease),
      clock: clock(T0 + 10_000),
    });

    await expect(installed.loadViewModel(new AbortController().signal)).rejects.toThrowError(
      /could not be verified/i,
    );
  });

  it('never falls back for missing auth, cancellation, or a non-transport online failure', async () => {
    const token = await signedLease();
    const stored = leaseStore(token.lease);
    const checkOnline = vi.fn(async () => {
      throw new Error('authoritative service rejected the request');
    });
    const missingAuth = runtime({
      getAccountId: vi.fn(async () => null),
      checkOnline,
      leaseStore: stored,
    });
    await expect(missingAuth.loadViewModel(new AbortController().signal)).rejects.toThrowError(
      /could not be verified/i,
    );
    expect(checkOnline).not.toHaveBeenCalled();

    const ordinaryFailure = runtime({ checkOnline, leaseStore: stored });
    await expect(ordinaryFailure.loadViewModel(new AbortController().signal)).rejects.toThrowError(
      /could not be verified/i,
    );

    const controller = new AbortController();
    controller.abort();
    await expect(
      runtime({ leaseStore: stored }).loadViewModel(controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('honors online denial, clears an older grant, and never lets feature tier grant base access', async () => {
    const oldGrant = await signedLease({ revision: 3 });
    const signedDenial = await signedLease({ status: 'none', revision: 4, exp: T0 + 60_000 });
    const store = leaseStore(oldGrant.lease);
    const installed = runtime({
      checkOnline: vi.fn(async () => snapshot('locked')),
      requestLease: vi.fn(async () => signedDenial),
      leaseStore: store,
    });

    const model = await installed.loadViewModel(new AbortController().signal);

    expect(model.state).toBe('locked');
    expect(model.usable).toBe(false);
    expect(model.featurePlan.active).toBe(true);
    expect(store.value()).toBe(signedDenial.lease);
  });

  it('keeps a signed authoritative denial fail-closed after restart', async () => {
    const oldGrant = await signedLease({ revision: 3 });
    const signedDenial = await signedLease({ status: 'none', revision: 4, exp: T0 + 60_000 });
    const store = leaseStore(oldGrant.lease);
    const freshness = freshnessStore();
    const online = runtime({
      checkOnline: vi.fn(async () => snapshot('locked')),
      requestLease: vi.fn(async () => signedDenial),
      leaseStore: store,
      freshnessStore: freshness,
    });
    expect((await online.loadViewModel(new AbortController().signal)).usable).toBe(false);

    const restartedOffline = runtime({
      checkOnline: vi.fn(async () => {
        throw new InstalledAccessTransportUnavailableError();
      }),
      leaseStore: store,
      freshnessStore: freshness,
    });
    await expect(restartedOffline.loadViewModel(new AbortController().signal)).rejects.toThrowError(
      /could not be verified/i,
    );
  });

  it('keeps an online denial fail-closed in memory when persisted lease invalidation is unavailable', async () => {
    const oldGrant = await signedLease({ revision: 3 });
    let online = true;
    const store: InstalledLeaseStore = {
      async read() {
        return oldGrant.lease;
      },
      async write() {
        throw new Error('storage unavailable');
      },
      async remove() {
        throw new Error('storage unavailable');
      },
    };
    const installed = runtime({
      checkOnline: vi.fn(async () => {
        if (online) return snapshot('locked');
        throw new InstalledAccessTransportUnavailableError();
      }),
      requestLease: vi.fn(async () => {
        throw new Error('issuer unavailable');
      }),
      leaseStore: store,
    });

    expect((await installed.loadViewModel(new AbortController().signal)).usable).toBe(false);
    online = false;
    await expect(installed.loadViewModel(new AbortController().signal)).rejects.toThrowError(
      /could not be verified/i,
    );
  });

  it('preserves cancellation errors instead of converting them into offline failure', async () => {
    const installed = runtime({
      checkOnline: vi.fn(async () => {
        throw new DOMException('Aborted', 'AbortError');
      }),
    });

    await expect(installed.loadViewModel(new AbortController().signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('fails offline closed for invalid key configuration and invalid lease authority', async () => {
    const valid = await signedLease();
    const wrongUser = await signedLease({ sub: 'different-user' });
    const unknownKey = await signedLease({ kid: 'unconfigured-key' });
    const denial = await signedLease({ status: 'none', revision: 8, exp: T0 + 60_000 });
    const unsupported = JSON.stringify([
      {
        ...JSON.parse(publicKeyConfiguration)[0],
        jwk: { ...JSON.parse(publicKeyConfiguration)[0].jwk, crv: 'P-384' },
      },
    ]);
    const offline = vi.fn(async () => {
      throw new InstalledAccessTransportUnavailableError();
    });
    const cases = [
      { config: undefined, lease: valid.lease },
      { config: '{bad', lease: valid.lease },
      {
        config: JSON.stringify([
          JSON.parse(publicKeyConfiguration)[0],
          JSON.parse(publicKeyConfiguration)[0],
        ]),
        lease: valid.lease,
      },
      { config: unsupported, lease: valid.lease },
      { config: publicKeyConfiguration, lease: unknownKey.lease },
      { config: publicKeyConfiguration, lease: wrongUser.lease },
      { config: publicKeyConfiguration, lease: denial.lease },
    ];

    for (const current of cases) {
      const installed = runtime({
        checkOnline: offline,
        publicKeyConfiguration: current.config,
        leaseStore: leaseStore(current.lease),
        freshnessStore: freshnessStore(),
      });
      await expect(installed.loadViewModel(new AbortController().signal)).rejects.toThrowError(
        /could not be verified/i,
      );
    }
  });

  it('does not cache malformed or authority-inconsistent issuer responses', async () => {
    const oldGrant = await signedLease({ revision: 2 });
    const newer = await signedLease({ revision: 3 });
    const store = leaseStore(oldGrant.lease);
    const installed = runtime({
      requestLease: vi.fn(async () => ({ ...newer, revision: 99 })),
      leaseStore: store,
    });

    const model = await installed.loadViewModel(new AbortController().signal);

    expect(model.usable).toBe(true);
    expect(store.value()).toBe(oldGrant.lease);
  });
});
