import { describe, expect, it, vi } from 'vitest';
import {
  createOfflineLeaseFreshnessGuard,
  createOfflineLeaseFreshnessStore,
  type OfflineLeaseFreshnessStore,
} from './offlineLeaseFreshness';

const ACCOUNT = 'account-1';
const OTHER_ACCOUNT = 'account-2';
const T0 = 1_700_000_000_000;

function memoryStore(
  options: {
    durability?: OfflineLeaseFreshnessStore['durability'];
    initial?: string | null;
    readError?: boolean;
    writeError?: boolean;
  } = {},
): OfflineLeaseFreshnessStore & { raw(): string | null } {
  let raw = options.initial ?? null;
  return {
    durability: options.durability ?? 'restart_safe',
    async read() {
      if (options.readError) throw new Error('read failed');
      return raw;
    },
    async write(_accountId, next) {
      if (options.writeError) throw new Error('write failed');
      raw = next;
    },
    raw: () => raw,
  };
}

function observation(overrides: Partial<{
  revision: number;
  lastTrustedServerTime: number;
  wallClock: number;
}> = {}) {
  return {
    revision: 7,
    lastTrustedServerTime: T0,
    wallClock: T0,
    rollbackToleranceMs: 5_000,
    ...overrides,
  };
}

describe('offline lease durable freshness guard', () => {
  it('persists a high-water revision across guard recreation and rejects an older replay', async () => {
    const store = memoryStore();
    const first = createOfflineLeaseFreshnessGuard({ accountId: ACCOUNT, store });
    expect(await first.observe(observation())).toMatchObject({ ok: true, effectiveNow: T0 });

    const afterLocked = createOfflineLeaseFreshnessGuard({ accountId: ACCOUNT, store });
    expect(
      await afterLocked.observe(
        observation({ revision: 8, lastTrustedServerTime: T0 + 1_000, wallClock: T0 + 1_000 }),
      ),
    ).toMatchObject({ ok: true });

    const replay = createOfflineLeaseFreshnessGuard({ accountId: ACCOUNT, store });
    expect(
      await replay.observe(
        observation({ revision: 7, lastTrustedServerTime: T0, wallClock: T0 + 2_000 }),
      ),
    ).toEqual({ ok: false, reason: 'stale_revision' });
  });

  it('rejects trusted server-time rollback even when the revision increases', async () => {
    const store = memoryStore();
    expect(
      await createOfflineLeaseFreshnessGuard({ accountId: ACCOUNT, store }).observe(
        observation({ revision: 7, lastTrustedServerTime: T0 + 10_000 }),
      ),
    ).toMatchObject({ ok: true });
    expect(
      await createOfflineLeaseFreshnessGuard({ accountId: ACCOUNT, store }).observe(
        observation({ revision: 8, lastTrustedServerTime: T0 + 9_999, wallClock: T0 + 20_000 }),
      ),
    ).toEqual({ ok: false, reason: 'trusted_time_rollback' });
  });

  it('rejects wall-clock rollback across guard recreation', async () => {
    const store = memoryStore();
    expect(
      await createOfflineLeaseFreshnessGuard({ accountId: ACCOUNT, store }).observe(
        observation({ wallClock: T0 + 60_000 }),
      ),
    ).toMatchObject({ ok: true });
    expect(
      await createOfflineLeaseFreshnessGuard({ accountId: ACCOUNT, store }).observe(
        observation({ wallClock: T0 }),
      ),
    ).toEqual({ ok: false, reason: 'rollback_detected' });
  });

  it('does not let repeated recreation with a frozen clock extend a lease lifetime', async () => {
    const store = memoryStore();
    expect(
      await createOfflineLeaseFreshnessGuard({ accountId: ACCOUNT, store }).observe(observation()),
    ).toMatchObject({ ok: true });
    expect(
      await createOfflineLeaseFreshnessGuard({ accountId: ACCOUNT, store }).observe(
        observation({ wallClock: T0 + 9_000 }),
      ),
    ).toMatchObject({ ok: true, effectiveNow: T0 + 9_000 });
    expect(
      await createOfflineLeaseFreshnessGuard({ accountId: ACCOUNT, store }).observe(
        observation({ wallClock: T0 + 9_000 }),
      ),
    ).toEqual({ ok: false, reason: 'rollback_detected' });
  });

  it('serializes concurrent observations so an older write cannot erase a newer revision', async () => {
    const store = memoryStore();
    const older = createOfflineLeaseFreshnessGuard({ accountId: ACCOUNT, store });
    const newer = createOfflineLeaseFreshnessGuard({ accountId: ACCOUNT, store });
    const [olderResult, newerResult] = await Promise.all([
      older.observe(observation({ revision: 7, wallClock: T0 })),
      newer.observe(
        observation({
          revision: 8,
          lastTrustedServerTime: T0 + 1,
          wallClock: T0 + 1,
        }),
      ),
    ]);
    expect(olderResult).toMatchObject({ ok: true });
    expect(newerResult).toMatchObject({ ok: true });
    expect(
      await createOfflineLeaseFreshnessGuard({ accountId: ACCOUNT, store }).observe(
        observation({ revision: 7, wallClock: T0 + 2 }),
      ),
    ).toEqual({ ok: false, reason: 'stale_revision' });
  });

  it('fails closed for corrupt and cross-account durable state', async () => {
    const corrupt = memoryStore({ initial: '{not json' });
    expect(
      await createOfflineLeaseFreshnessGuard({ accountId: ACCOUNT, store: corrupt }).observe(
        observation(),
      ),
    ).toEqual({ ok: false, reason: 'freshness_corrupt' });

    const mismatched = memoryStore({
      initial: JSON.stringify({
        schemaVersion: 1,
        accountId: OTHER_ACCOUNT,
        revision: 7,
        lastTrustedServerTime: T0,
        wallClock: T0,
      }),
    });
    expect(
      await createOfflineLeaseFreshnessGuard({ accountId: ACCOUNT, store: mismatched }).observe(
        observation(),
      ),
    ).toEqual({ ok: false, reason: 'freshness_corrupt' });
  });

  it('fails closed when keychain read, write, or readback is unavailable', async () => {
    for (const store of [
      memoryStore({ readError: true }),
      memoryStore({ writeError: true }),
      {
        durability: 'restart_safe' as const,
        read: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null),
        write: vi.fn().mockResolvedValue(undefined),
      },
    ]) {
      expect(
        await createOfflineLeaseFreshnessGuard({ accountId: ACCOUNT, store }).observe(observation()),
      ).toEqual({ ok: false, reason: 'freshness_unavailable' });
    }
  });
});

describe('offline lease freshness storage backends', () => {
  it('uses credential_get/set with an account-derived bounded provider in Tauri', async () => {
    const values = new Map<string, string>();
    const invoke = vi.fn(async (command: string, args: Record<string, unknown>) => {
      const provider = String(args.provider);
      if (command === 'credential_get') return values.get(provider) ?? null;
      if (command === 'credential_set') {
        values.set(provider, String(args.key));
        return null;
      }
      throw new Error('unexpected command');
    });
    const store = createOfflineLeaseFreshnessStore({ isTauri: true, invoke });
    expect(store.durability).toBe('restart_safe');
    await store.write(ACCOUNT, '{"safe":true}');
    expect(await store.read(ACCOUNT)).toBe('{"safe":true}');
    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      'credential_set',
      'credential_get',
    ]);
    const provider = String(invoke.mock.calls[0]?.[1]?.provider);
    expect(provider).toMatch(/^access-lease-freshness-[a-f0-9]{64}$/);
    expect(provider).not.toContain(ACCOUNT);
  });

  it('makes browser session-only durability explicit and rejects restart-safe claims by default', async () => {
    const store = createOfflineLeaseFreshnessStore({ isTauri: false });
    expect(store.durability).toBe('session_only');
    const strict = createOfflineLeaseFreshnessGuard({ accountId: ACCOUNT, store });
    expect(await strict.observe(observation())).toEqual({
      ok: false,
      reason: 'freshness_not_restart_safe',
    });

    const preview = createOfflineLeaseFreshnessGuard({
      accountId: ACCOUNT,
      store,
      requireRestartSafe: false,
    });
    expect(await preview.observe(observation())).toMatchObject({
      ok: true,
      durability: 'session_only',
    });
    expect(
      await createOfflineLeaseFreshnessGuard({
        accountId: ACCOUNT,
        store: createOfflineLeaseFreshnessStore({ isTauri: false }),
        requireRestartSafe: false,
      }).observe(observation({ wallClock: T0 + 1 })),
    ).toMatchObject({ ok: true });
  });
});
