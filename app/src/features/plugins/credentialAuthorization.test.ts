import { describe, expect, it, vi } from 'vitest';
import {
  PLUGIN_CREDENTIAL_ACCOUNT_GRANTS_KEY,
  PluginCredentialGrantStorageError,
  createJarvisExistingCredentialAuthorization,
  createPluginCredentialAccountGrantRepository,
  createStrictPluginCredentialGrantStorage,
  withPluginCredentialLocatorLocks,
  type ExistingPluginCredentialLocator,
  type PluginCredentialAccountGrantV1,
  type StrictPluginCredentialGrantStorage,
} from './credentialAuthorization';

const locator = Object.freeze({ pluginId: 'github', fieldId: 'token' });

function grant(
  overrides: Partial<PluginCredentialAccountGrantV1> = {},
): PluginCredentialAccountGrantV1 {
  return Object.freeze({
    schemaVersion: 1,
    accountId: 'account-a',
    pluginId: locator.pluginId,
    fieldId: locator.fieldId,
    grantId: 'grant-a',
    revision: 1,
    grantedAt: 100,
    source: 'explicit_account_save',
    ...overrides,
  });
}

function identity(value: PluginCredentialAccountGrantV1) {
  const { accountId, pluginId, fieldId, grantId, revision } = value;
  return { accountId, pluginId, fieldId, grantId, revision };
}

function memoryStorage(initial: string | null = null): {
  adapter: StrictPluginCredentialGrantStorage;
  raw(): string | null;
} {
  let raw = initial;
  return {
    raw: () => raw,
    adapter: {
      readRaw: () => raw,
      compareAndSetRaw: ({ expectedRaw, nextRaw }) => {
        if (raw !== expectedRaw) {
          throw new PluginCredentialGrantStorageError('credential_grant_storage_conflict');
        }
        raw = nextRaw;
      },
    },
  };
}

function fakeWebStorage(initial: string | null = null): Storage {
  let raw = initial;
  return {
    get length() {
      return raw === null ? 0 : 1;
    },
    clear: vi.fn(() => {
      raw = null;
    }),
    getItem: vi.fn((key: string) => (key === PLUGIN_CREDENTIAL_ACCOUNT_GRANTS_KEY ? raw : null)),
    key: vi.fn((index: number) =>
      index === 0 && raw !== null ? PLUGIN_CREDENTIAL_ACCOUNT_GRANTS_KEY : null,
    ),
    removeItem: vi.fn((key: string) => {
      if (key === PLUGIN_CREDENTIAL_ACCOUNT_GRANTS_KEY) raw = null;
    }),
    setItem: vi.fn((key: string, value: string) => {
      if (key === PLUGIN_CREDENTIAL_ACCOUNT_GRANTS_KEY) raw = value;
    }),
  };
}

describe('strict plugin credential grant storage', () => {
  it('performs exact raw CAS and verifies immediate readback', () => {
    const backing = fakeWebStorage();
    const storage = createStrictPluginCredentialGrantStorage(backing);

    storage.compareAndSetRaw({ expectedRaw: null, nextRaw: '{"ok":true}' });
    expect(storage.readRaw()).toBe('{"ok":true}');
    expect(() =>
      storage.compareAndSetRaw({ expectedRaw: null, nextRaw: '{"ok":false}' }),
    ).toThrowError(expect.objectContaining({ code: 'credential_grant_storage_conflict' }));
  });

  it.each(['set', 'remove'] as const)('rejects a swallowed/no-op %s operation', (operation) => {
    const initial = operation === 'remove' ? '{"old":true}' : null;
    const backing = fakeWebStorage(initial);
    if (operation === 'set') vi.mocked(backing.setItem).mockImplementation(() => undefined);
    else vi.mocked(backing.removeItem).mockImplementation(() => undefined);
    const storage = createStrictPluginCredentialGrantStorage(backing);

    expect(() =>
      storage.compareAndSetRaw({
        expectedRaw: initial,
        nextRaw: operation === 'remove' ? null : '{"next":true}',
      }),
    ).toThrowError(expect.objectContaining({ code: 'credential_grant_storage_failed' }));
  });

  it('turns backing-store exceptions into a safe typed failure', () => {
    const backing = fakeWebStorage();
    vi.mocked(backing.setItem).mockImplementation(() => {
      throw new Error('secret-bearing backing failure');
    });

    expect(() =>
      createStrictPluginCredentialGrantStorage(backing).compareAndSetRaw({
        expectedRaw: null,
        nextRaw: '{}',
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'credential_grant_storage_failed',
        message: expect.not.stringContaining('secret-bearing'),
      }),
    );
  });

  it('rolls back a physical write when its immediate readback fails', () => {
    let raw: string | null = null;
    let failNextRead = false;
    const backing: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
      getItem: () => {
        if (failNextRead) {
          failNextRead = false;
          throw new Error('readback unavailable');
        }
        return raw;
      },
      setItem: (_key, value) => {
        raw = value;
        failNextRead = true;
      },
      removeItem: () => {
        raw = null;
      },
    };

    expect(() =>
      createStrictPluginCredentialGrantStorage(backing).compareAndSetRaw({
        expectedRaw: null,
        nextRaw: '{"grant":"metadata-only"}',
      }),
    ).toThrowError(expect.objectContaining({ code: 'credential_grant_storage_failed' }));
    expect(raw).toBeNull();
  });
});

describe('plugin credential grant repository', () => {
  it('replaces and removes only the complete expected grant identity while locked', async () => {
    const memory = memoryStorage();
    const repository = createPluginCredentialAccountGrantRepository({ storage: memory.adapter });
    const first = grant();
    const second = grant({ grantId: 'grant-b', revision: 2, grantedAt: 200 });

    await withPluginCredentialLocatorLocks([locator], async (locks) => {
      await repository.replaceExact({ locks, expected: { state: 'absent' }, grant: first });
      await expect(repository.getLocked({ locks, locator })).resolves.toEqual(first);
      await repository.replaceExact({
        locks,
        expected: { state: 'present', grant: identity(first) },
        grant: second,
      });
      await expect(
        repository.removeExact({ locks, locator, expected: identity(first) }),
      ).rejects.toMatchObject({ code: 'credential_grant_storage_conflict' });
      await repository.removeExact({ locks, locator, expected: identity(second) });
    });

    await expect(repository.get(locator)).resolves.toBeUndefined();
  });

  it('rejects malformed grant maps without exposing their contents', async () => {
    const memory = memoryStorage('{"github\\u0000token":{"credential":"raw-secret"}}');
    const repository = createPluginCredentialAccountGrantRepository({ storage: memory.adapter });

    await expect(repository.get(locator)).rejects.toMatchObject({
      code: 'credential_grant_storage_failed',
      message: expect.not.stringContaining('raw-secret'),
    });
  });

  it('rejects empty, duplicate, out-of-set, and expired lock capabilities', async () => {
    const repository = createPluginCredentialAccountGrantRepository({
      storage: memoryStorage().adapter,
    });
    await expect(withPluginCredentialLocatorLocks([], async () => undefined)).rejects.toThrow();
    await expect(
      withPluginCredentialLocatorLocks([locator, { ...locator }], async () => undefined),
    ).rejects.toThrow();

    let captured: Parameters<typeof repository.getLocked>[0]['locks'] | undefined;
    await withPluginCredentialLocatorLocks([locator], async (locks) => {
      captured = locks;
      await expect(
        repository.getLocked({
          locks,
          locator: { pluginId: 'stripe', fieldId: 'secret_key' },
        }),
      ).rejects.toThrow();
    });
    await expect(repository.getLocked({ locks: captured!, locator })).rejects.toThrow();
  });

  it('serializes the same locator while allowing a different locator to proceed', async () => {
    const events: string[] = [];
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = withPluginCredentialLocatorLocks([locator], async () => {
      events.push('first-enter');
      await held;
      events.push('first-exit');
    });
    const second = withPluginCredentialLocatorLocks([{ ...locator }], async () => {
      events.push('second-enter');
    });
    const independent = withPluginCredentialLocatorLocks(
      [{ pluginId: 'stripe', fieldId: 'secret_key' }],
      async () => events.push('independent-enter'),
    );
    await independent;
    expect(events).toEqual(['first-enter', 'independent-enter']);
    release();
    await Promise.all([first, second]);
    expect(events).toEqual(['first-enter', 'independent-enter', 'first-exit', 'second-enter']);
  });
});

describe('existing plugin credential authorization authority', () => {
  it('denies unbound, foreign, and inactive-account grants', async () => {
    const memory = memoryStorage();
    const grants = createPluginCredentialAccountGrantRepository({ storage: memory.adapter });
    let activeAccountId: string | undefined = 'account-a';
    const authority = createJarvisExistingCredentialAuthorization({
      grants,
      getActiveAccountId: () => activeAccountId,
    });

    await expect(authority.authorize({ accountId: 'account-a', locator })).resolves.toEqual({
      authorized: false,
      reason: 'credential_account_unbound',
    });
    await withPluginCredentialLocatorLocks([locator], (locks) =>
      grants.replaceExact({
        locks,
        expected: { state: 'absent' },
        grant: grant({ accountId: 'account-b' }),
      }),
    );
    await expect(authority.authorize({ accountId: 'account-a', locator })).resolves.toEqual({
      authorized: false,
      reason: 'credential_account_mismatch',
    });
    activeAccountId = undefined;
    await expect(authority.authorize({ accountId: 'account-a', locator })).resolves.toEqual({
      authorized: false,
      reason: 'credential_account_mismatch',
    });
  });

  it('issues an exact proof and rejects revision, grant-id, account, and forged-proof replay', async () => {
    const memory = memoryStorage();
    const grants = createPluginCredentialAccountGrantRepository({ storage: memory.adapter });
    let activeAccountId: string | undefined = 'account-a';
    const authority = createJarvisExistingCredentialAuthorization({
      grants,
      getActiveAccountId: () => activeAccountId,
    });
    const first = grant();
    await withPluginCredentialLocatorLocks([locator], (locks) =>
      grants.replaceExact({ locks, expected: { state: 'absent' }, grant: first }),
    );
    const decision = await authority.authorize({ accountId: 'account-a', locator });
    expect(decision.authorized).toBe(true);
    if (!decision.authorized) throw new Error('expected authorization');
    await expect(authority.revalidate(decision.authorization)).resolves.toMatchObject({
      authorized: true,
    });

    const replacement = grant({ grantId: 'fresh-grant', revision: 1, grantedAt: 200 });
    await withPluginCredentialLocatorLocks([locator], (locks) =>
      grants.replaceExact({
        locks,
        expected: { state: 'present', grant: identity(first) },
        grant: replacement,
      }),
    );
    await expect(authority.revalidate(decision.authorization)).resolves.toEqual({
      authorized: false,
      reason: 'credential_grant_stale',
    });

    const forged = { ...decision.authorization };
    await expect(authority.revalidate(forged)).resolves.toEqual({
      authorized: false,
      reason: 'credential_grant_stale',
    });
    activeAccountId = 'account-b';
    await expect(authority.revalidate(decision.authorization)).resolves.toEqual({
      authorized: false,
      reason: 'credential_account_mismatch',
    });
  });

  it('maps storage failures to a non-throwing safe denial', async () => {
    const grants = createPluginCredentialAccountGrantRepository({
      storage: {
        readRaw: () => {
          throw new PluginCredentialGrantStorageError('credential_grant_storage_failed');
        },
        compareAndSetRaw: vi.fn(),
      },
    });
    const authority = createJarvisExistingCredentialAuthorization({
      grants,
      getActiveAccountId: () => 'account-a',
    });

    await expect(authority.authorize({ accountId: 'account-a', locator })).resolves.toEqual({
      authorized: false,
      reason: 'credential_grant_storage_failed',
    });
  });
});
