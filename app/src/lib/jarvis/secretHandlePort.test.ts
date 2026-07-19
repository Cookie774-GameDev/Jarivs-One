import { describe, expect, it, vi } from 'vitest';
import {
  createJarvisExistingCredentialAuthorization,
  createPluginCredentialAccountGrantRepository,
  withPluginCredentialLocatorLocks,
  type JarvisExistingCredentialAuthorizationAuthority,
  type PluginCredentialAccountGrantV1,
  type StrictPluginCredentialGrantStorage,
} from '@/features/plugins/credentialAuthorization';
import type { ExistingPluginCredentialAdapter } from '@/features/plugins/credentials';
import {
  JarvisSecretHandleError,
  createJarvisSecretHandleAuthority,
  type JarvisSecretHandleScope,
} from './secretHandlePort';

const locator = Object.freeze({ pluginId: 'github', fieldId: 'token' });

function grant(
  overrides: Partial<PluginCredentialAccountGrantV1> = {},
): PluginCredentialAccountGrantV1 {
  return {
    schemaVersion: 1,
    accountId: 'account-a',
    pluginId: locator.pluginId,
    fieldId: locator.fieldId,
    grantId: 'grant-a',
    revision: 1,
    grantedAt: 10,
    source: 'explicit_account_save',
    ...overrides,
  };
}

function memoryStorage(): StrictPluginCredentialGrantStorage {
  let raw: string | null = null;
  return {
    readRaw: () => raw,
    compareAndSetRaw: ({ expectedRaw, nextRaw }) => {
      if (raw !== expectedRaw) throw new Error('CAS conflict');
      raw = nextRaw;
    },
  };
}

async function authorizedFixture(
  options: {
    secret?: string;
    bootId?: string;
    read?: ExistingPluginCredentialAdapter['readExistingCredential'];
  } = {},
) {
  const grants = createPluginCredentialAccountGrantRepository({ storage: memoryStorage() });
  const current = grant();
  await withPluginCredentialLocatorLocks([locator], (locks) =>
    grants.replaceExact({ locks, expected: { state: 'absent' }, grant: current }),
  );
  let activeAccountId: string | undefined = 'account-a';
  const realCredentialAuthorization = createJarvisExistingCredentialAuthorization({
    grants,
    getActiveAccountId: () => activeAccountId,
  });
  const credentialAuthorization: JarvisExistingCredentialAuthorizationAuthority = {
    authorize: vi.fn(realCredentialAuthorization.authorize.bind(realCredentialAuthorization)),
    revalidate: vi.fn(realCredentialAuthorization.revalidate.bind(realCredentialAuthorization)),
    revalidateLocked: vi.fn(
      realCredentialAuthorization.revalidateLocked.bind(realCredentialAuthorization),
    ),
  };
  const readExistingCredential = vi.fn(
    options.read ?? (async () => options.secret ?? 'super-secret-value'),
  );
  const credentials: ExistingPluginCredentialAdapter = {
    readExistingCredential,
    writeExistingCredential: vi.fn(),
    deleteExistingCredential: vi.fn(),
  };
  const authority = createJarvisSecretHandleAuthority({
    credentials,
    credentialAuthorization,
    bootId: options.bootId ?? 'boot-a',
    randomUUID: () => 'uuid-a',
  });
  const binding = await authority.bindExistingCredential({
    accountId: 'account-a',
    actionId: 'github.issue.create',
    actionVersion: 1,
    field: 'credential',
    locator,
  });
  const scope: JarvisSecretHandleScope = {
    accountId: 'account-a',
    actionId: 'github.issue.create',
    actionVersion: 1,
    field: binding.field,
    handleId: binding.handleId,
  };
  return {
    authority,
    binding,
    scope,
    grants,
    current,
    credentialAuthorization,
    readExistingCredential,
    setActiveAccountId(value: string | undefined) {
      activeAccountId = value;
    },
  };
}

describe('Jarvis process-local secret handles', () => {
  it('authorizes before generating or retaining a handle and preserves the exact denial reason', async () => {
    const randomUUID = vi.fn(() => 'must-not-run');
    const credentials: ExistingPluginCredentialAdapter = {
      readExistingCredential: vi.fn(),
      writeExistingCredential: vi.fn(),
      deleteExistingCredential: vi.fn(),
    };
    const credentialAuthorization: JarvisExistingCredentialAuthorizationAuthority = {
      authorize: vi.fn(
        async () =>
          ({
            authorized: false,
            reason: 'credential_account_unbound',
          }) as const,
      ),
      revalidate: vi.fn(),
      revalidateLocked: vi.fn(),
    };
    const authority = createJarvisSecretHandleAuthority({
      credentials,
      credentialAuthorization,
      bootId: 'boot-a',
      randomUUID,
    });

    await expect(
      authority.bindExistingCredential({
        accountId: 'account-a',
        actionId: 'github.issue.create',
        actionVersion: 1,
        field: 'credential',
        locator,
      }),
    ).rejects.toMatchObject({ code: 'credential_account_unbound' });
    expect(randomUUID).not.toHaveBeenCalled();
    expect(credentials.readExistingCredential).not.toHaveBeenCalled();
  });

  it('validates grant authority without reading the credential', async () => {
    const fixture = await authorizedFixture();

    await expect(fixture.authority.port.validate(fixture.scope)).resolves.toEqual({ valid: true });
    expect(fixture.readExistingCredential).not.toHaveBeenCalled();
  });

  it.each([
    ['accountId', 'account-b', 'account_mismatch'],
    ['actionId', 'github.issue.delete', 'action_mismatch'],
    ['actionVersion', 2, 'version_mismatch'],
    ['field', 'other', 'field_mismatch'],
  ] as const)('rejects an exact %s scope mismatch', async (key, value, reason) => {
    const fixture = await authorizedFixture();
    const scope = { ...fixture.scope, [key]: value };

    await expect(fixture.authority.port.validate(scope)).resolves.toEqual({
      valid: false,
      reason,
    });
    expect(fixture.readExistingCredential).not.toHaveBeenCalled();
  });

  it('consumes synchronously before one locked credential read so concurrent replay fails', async () => {
    let releaseRead!: (value: string | undefined) => void;
    const pendingRead = new Promise<string | undefined>((resolve) => {
      releaseRead = resolve;
    });
    const fixture = await authorizedFixture({ read: async () => await pendingRead });

    const first = fixture.authority.port.resolveOnce(fixture.scope);
    await vi.waitFor(() => expect(fixture.readExistingCredential).toHaveBeenCalledTimes(1));
    await expect(fixture.authority.port.resolveOnce(fixture.scope)).rejects.toMatchObject({
      code: 'consumed',
    });
    releaseRead('one-time-secret');
    await expect(first).resolves.toBe('one-time-secret');
    await expect(fixture.authority.port.validate(fixture.scope)).resolves.toEqual({
      valid: false,
      reason: 'consumed',
    });
    expect(fixture.readExistingCredential).toHaveBeenCalledTimes(1);
  });

  it('revalidates immediately before and after the read and discards the value on stale proof', async () => {
    const safeSecret = 'must-never-appear-in-error';
    const fixture = await authorizedFixture({ secret: safeSecret });
    const revalidateLocked = vi.mocked(fixture.credentialAuthorization.revalidateLocked);
    const original = revalidateLocked.getMockImplementation()!;
    revalidateLocked
      .mockImplementationOnce(original)
      .mockResolvedValueOnce({ authorized: false, reason: 'credential_grant_stale' });

    const error = await fixture.authority.port.resolveOnce(fixture.scope).catch((value) => value);
    expect(error).toBeInstanceOf(JarvisSecretHandleError);
    expect(error).toMatchObject({ code: 'credential_grant_stale' });
    expect(String(error)).not.toContain(safeSecret);
    expect(String(error)).not.toContain('github');
    expect(revalidateLocked).toHaveBeenCalledTimes(2);
    expect(fixture.readExistingCredential).toHaveBeenCalledTimes(1);
  });

  it('treats a missing credential and adapter exception as safe unavailable errors', async () => {
    for (const read of [
      async () => undefined,
      async () => {
        throw new Error('raw-secret adapter detail');
      },
    ]) {
      const fixture = await authorizedFixture({ read });
      const error = await fixture.authority.port.resolveOnce(fixture.scope).catch((value) => value);
      expect(error).toMatchObject({ code: 'credential_grant_unavailable' });
      expect(String(error)).not.toContain('raw-secret');
    }
  });

  it('invalidates only the requested account or every handle on teardown', async () => {
    const one = await authorizedFixture();
    one.authority.invalidateAccount('account-a');
    await expect(one.authority.port.validate(one.scope)).resolves.toEqual({
      valid: false,
      reason: 'invalidated',
    });
    await expect(one.authority.port.resolveOnce(one.scope)).rejects.toMatchObject({
      code: 'invalidated',
    });

    const all = await authorizedFixture({ bootId: 'boot-b' });
    all.authority.invalidateAll();
    await expect(all.authority.port.validate(all.scope)).resolves.toEqual({
      valid: false,
      reason: 'invalidated',
    });
  });

  it('never reissues a consumed or invalidated handle ID when the UUID source repeats', async () => {
    const fixture = await authorizedFixture();
    fixture.authority.invalidateAccount('account-a');

    await expect(
      fixture.authority.bindExistingCredential({
        accountId: 'account-a',
        actionId: 'github.issue.create',
        actionVersion: 1,
        field: 'credential',
        locator,
      }),
    ).rejects.toBeInstanceOf(JarvisSecretHandleError);
    await expect(fixture.authority.port.validate(fixture.scope)).resolves.toEqual({
      valid: false,
      reason: 'invalidated',
    });
  });

  it('rejects a handle at a different boot authority without a credential read', async () => {
    const fixture = await authorizedFixture({ bootId: 'old-boot' });
    const restarted = createJarvisSecretHandleAuthority({
      credentials: {
        readExistingCredential: vi.fn(),
        writeExistingCredential: vi.fn(),
        deleteExistingCredential: vi.fn(),
      },
      credentialAuthorization: fixture.credentialAuthorization,
      bootId: 'new-boot',
      randomUUID: () => 'uuid-new',
    });

    await expect(restarted.port.validate(fixture.scope)).resolves.toEqual({
      valid: false,
      reason: 'boot_mismatch',
    });
  });

  it('fails a stale grant with the exact authorization reason before reading', async () => {
    const fixture = await authorizedFixture();
    const replacement = grant({ grantId: 'grant-new', revision: 1, grantedAt: 20 });
    await withPluginCredentialLocatorLocks([locator], async (locks) => {
      await fixture.grants.removeExact({
        locks,
        locator,
        expected: {
          accountId: fixture.current.accountId,
          pluginId: fixture.current.pluginId,
          fieldId: fixture.current.fieldId,
          grantId: fixture.current.grantId,
          revision: fixture.current.revision,
        },
      });
      await fixture.grants.replaceExact({
        locks,
        expected: { state: 'absent' },
        grant: replacement,
      });
    });

    await expect(fixture.authority.port.resolveOnce(fixture.scope)).rejects.toMatchObject({
      code: 'credential_grant_stale',
    });
    expect(fixture.readExistingCredential).not.toHaveBeenCalled();
  });
});
