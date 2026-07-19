import { describe, expect, it, vi } from 'vitest';
import * as runtimeModule from './runtime';
import { createAccountScopedPluginRuntime } from './runtime';
import {
  createJarvisExistingCredentialAuthorization,
  createPluginCredentialAccountGrantRepository,
  withPluginCredentialLocatorLocks,
  type JarvisExistingCredentialAuthorizationAuthority,
  type PluginCredentialAccountGrantRepository,
  type PluginCredentialAccountGrantV1,
  type StrictPluginCredentialGrantStorage,
} from './credentialAuthorization';
import type { ExistingPluginCredentialAdapter } from './credentials';
import type { PluginConnection } from './types';
import {
  createJarvisActionCatalog,
  type JarvisRegisteredActionDefinition,
} from '@/lib/jarvis/actions/catalog';

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

function identity(value: PluginCredentialAccountGrantV1) {
  const { accountId, pluginId, fieldId, grantId, revision } = value;
  return { accountId, pluginId, fieldId, grantId, revision };
}

function fixture(
  options: {
    grants?: PluginCredentialAccountGrantRepository;
    credentialAuthorization?: JarvisExistingCredentialAuthorizationAuthority;
    credentialAdapter?: ExistingPluginCredentialAdapter;
    randomIds?: string[];
    times?: number[];
  } = {},
) {
  let activeAccountId: string | undefined = 'account-a';
  const grants =
    options.grants ??
    createPluginCredentialAccountGrantRepository({
      storage: memoryStorage(),
    });
  const realAuthorization = createJarvisExistingCredentialAuthorization({
    grants,
    getActiveAccountId: () => activeAccountId,
  });
  const credentialAuthorization = options.credentialAuthorization ?? {
    authorize: vi.fn(realAuthorization.authorize.bind(realAuthorization)),
    revalidate: vi.fn(realAuthorization.revalidate.bind(realAuthorization)),
    revalidateLocked: vi.fn(realAuthorization.revalidateLocked.bind(realAuthorization)),
  };
  const values = new Map<string, string>();
  const credentialAdapter =
    options.credentialAdapter ??
    ({
      readExistingCredential: vi.fn(async ({ pluginId, fieldId }) =>
        values.get(`${pluginId}\u0000${fieldId}`),
      ),
      writeExistingCredential: vi.fn(async ({ pluginId, fieldId }, value) => {
        values.set(`${pluginId}\u0000${fieldId}`, value);
      }),
      deleteExistingCredential: vi.fn(async ({ pluginId, fieldId }) => {
        values.delete(`${pluginId}\u0000${fieldId}`);
      }),
    } satisfies ExistingPluginCredentialAdapter);
  const connections: PluginConnection[] = [];
  const removals: Array<[string, string]> = [];
  const randomIds = [...(options.randomIds ?? ['grant-1', 'grant-2', 'grant-3'])];
  const times = [...(options.times ?? [100, 200, 300])];
  const runtime = createAccountScopedPluginRuntime({
    activeAccountId: () => activeAccountId,
    grants,
    credentialAuthorization,
    credentialAdapter,
    connections: {
      upsertConnection: (connection) => connections.push(connection),
      removeConnection: (accountId, pluginId) => removals.push([accountId, pluginId]),
    },
    randomUUID: () => randomIds.shift() ?? 'fallback-grant',
    now: () => times.shift() ?? 999,
  });
  return {
    runtime,
    grants,
    credentialAuthorization,
    credentialAdapter,
    connections,
    removals,
    values,
    setActiveAccountId(value: string | undefined) {
      activeAccountId = value;
    },
  };
}

describe('account-scoped plugin runtime', () => {
  it('exports the closed factory without legacy generic plugin call APIs', () => {
    expect(Object.keys(runtimeModule).sort()).toEqual(['createAccountScopedPluginRuntime']);
    expect(runtimeModule).not.toHaveProperty('testPluginConnection');
    expect(runtimeModule).not.toHaveProperty('callPluginTool');
  });

  it('mints a grant only through explicit save without a pre-existing authorization', async () => {
    const test = fixture({ randomIds: ['fresh-grant'], times: [123] });
    const locator = { pluginId: 'github', fieldId: 'token' };

    await test.runtime.management.saveCredential({
      accountId: 'account-a',
      ...locator,
      value: 'github-secret',
    });

    expect(test.credentialAuthorization.authorize).not.toHaveBeenCalled();
    expect(test.credentialAdapter.writeExistingCredential).toHaveBeenCalledWith(
      locator,
      'github-secret',
    );
    await expect(test.grants.get(locator)).resolves.toEqual({
      schemaVersion: 1,
      accountId: 'account-a',
      ...locator,
      grantId: 'fresh-grant',
      revision: 1,
      grantedAt: 123,
      source: 'explicit_account_save',
    });
  });

  it('increments same-account revisions but starts a foreign overwrite at one with a fresh id', async () => {
    const test = fixture({ randomIds: ['a-1', 'a-2', 'b-1'], times: [10, 20, 30] });
    const input = { pluginId: 'github', fieldId: 'token', value: 'value' };
    await test.runtime.management.saveCredential({ accountId: 'account-a', ...input });
    await test.runtime.management.saveCredential({ accountId: 'account-a', ...input });
    await expect(test.grants.get(input)).resolves.toMatchObject({
      accountId: 'account-a',
      grantId: 'a-2',
      revision: 2,
    });

    test.setActiveAccountId('account-b');
    await test.runtime.management.saveCredential({ accountId: 'account-b', ...input });
    await expect(test.grants.get(input)).resolves.toMatchObject({
      accountId: 'account-b',
      grantId: 'b-1',
      revision: 1,
    });
  });

  it.each([
    { accountId: 'account-b', pluginId: 'github', fieldId: 'token', value: 'x' },
    { accountId: 'account-a', pluginId: 'unknown', fieldId: 'token', value: 'x' },
    { accountId: 'account-a', pluginId: 'github', fieldId: 'undeclared', value: 'x' },
  ])('rejects wrong-account or undeclared save input before a write: %o', async (input) => {
    const test = fixture();
    await expect(test.runtime.management.saveCredential(input)).rejects.toThrow();
    expect(test.credentialAdapter.writeExistingCredential).not.toHaveBeenCalled();
  });

  it('leaves a written value unbound when the account changes during the keychain write', async () => {
    const test = fixture();
    vi.mocked(test.credentialAdapter.writeExistingCredential).mockImplementationOnce(async () => {
      test.setActiveAccountId('account-b');
    });

    await expect(
      test.runtime.management.saveCredential({
        accountId: 'account-a',
        pluginId: 'github',
        fieldId: 'token',
        value: 'secret',
      }),
    ).rejects.toThrow();
    await expect(
      test.grants.get({ pluginId: 'github', fieldId: 'token' }),
    ).resolves.toBeUndefined();
  });

  it('removes the old grant before a failed write and never retains stale authority', async () => {
    const test = fixture();
    const input = {
      accountId: 'account-a',
      pluginId: 'github',
      fieldId: 'token',
      value: 'secret',
    };
    await test.runtime.management.saveCredential(input);
    vi.mocked(test.credentialAdapter.writeExistingCredential).mockRejectedValueOnce(
      new Error('keychain failure with secret detail'),
    );

    const error = await test.runtime.management.saveCredential(input).catch((value) => value);
    expect(String(error)).not.toContain('secret detail');
    await expect(test.grants.get(input)).resolves.toBeUndefined();
  });

  it('compensates a grant put that lands before storage reports failure', async () => {
    const base = createPluginCredentialAccountGrantRepository({ storage: memoryStorage() });
    const grants: PluginCredentialAccountGrantRepository = {
      get: base.get.bind(base),
      getLocked: base.getLocked.bind(base),
      removeExact: base.removeExact.bind(base),
      replaceExact: async (input) => {
        await base.replaceExact(input);
        throw new Error('reported failure after physical put');
      },
    };
    const test = fixture({ grants });
    const locator = { pluginId: 'github', fieldId: 'token' };

    await expect(
      test.runtime.management.saveCredential({
        accountId: 'account-a',
        ...locator,
        value: 'secret',
      }),
    ).rejects.toThrow();
    await expect(base.get(locator)).resolves.toBeUndefined();
  });

  it('authorizes and locked-revalidates before and after a connection-test read', async () => {
    const test = fixture();
    await test.runtime.management.saveCredential({
      accountId: 'account-a',
      pluginId: 'github',
      fieldId: 'token',
      value: 'github-secret',
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ login: 'octocat' }), { status: 200 }),
    );

    await expect(
      test.runtime.management.testConnection({ accountId: 'account-a', pluginId: 'github' }),
    ).resolves.toEqual({ ok: true, accountLabel: 'octocat' });
    expect(test.credentialAuthorization.authorize).toHaveBeenCalledTimes(1);
    expect(test.credentialAuthorization.revalidateLocked).toHaveBeenCalledTimes(2);
    expect(test.credentialAdapter.readExistingCredential).toHaveBeenCalledTimes(1);
    expect(test.connections.at(-1)).toMatchObject({
      accountId: 'account-a',
      pluginId: 'github',
      state: 'connected',
      configuredFields: ['token'],
    });
  });

  it('preflights every exact grant before disconnecting and removes grant before keychain data', async () => {
    const events: string[] = [];
    const base = createPluginCredentialAccountGrantRepository({ storage: memoryStorage() });
    const grants: PluginCredentialAccountGrantRepository = {
      get: base.get.bind(base),
      getLocked: base.getLocked.bind(base),
      replaceExact: base.replaceExact.bind(base),
      removeExact: async (input) => {
        events.push(`grant:${input.locator.fieldId}`);
        await base.removeExact(input);
      },
    };
    const adapter: ExistingPluginCredentialAdapter = {
      readExistingCredential: vi.fn(async () => 'value'),
      writeExistingCredential: vi.fn(async () => undefined),
      deleteExistingCredential: vi.fn(async ({ fieldId }) => {
        events.push(`keychain:${fieldId}`);
      }),
    };
    const test = fixture({ grants, credentialAdapter: adapter, randomIds: ['sid', 'token'] });
    await test.runtime.management.saveCredential({
      accountId: 'account-a',
      pluginId: 'twilio',
      fieldId: 'account_sid',
      value: 'AC1',
    });
    await test.runtime.management.saveCredential({
      accountId: 'account-a',
      pluginId: 'twilio',
      fieldId: 'auth_token',
      value: 'token',
    });

    await test.runtime.management.disconnect({ accountId: 'account-a', pluginId: 'twilio' });

    expect(events).toEqual([
      'grant:account_sid',
      'keychain:account_sid',
      'grant:auth_token',
      'keychain:auth_token',
    ]);
    expect(test.removals).toEqual([['account-a', 'twilio']]);
  });

  it('does no grant or keychain work for a credentialless disconnect', async () => {
    const base = createPluginCredentialAccountGrantRepository({ storage: memoryStorage() });
    const get = vi.fn(base.get.bind(base));
    const test = fixture({
      grants: {
        get,
        getLocked: base.getLocked.bind(base),
        replaceExact: base.replaceExact.bind(base),
        removeExact: base.removeExact.bind(base),
      },
    });

    await test.runtime.management.disconnect({
      accountId: 'account-a',
      pluginId: 'mock-connector',
    });

    expect(get).not.toHaveBeenCalled();
    expect(test.credentialAuthorization.authorize).not.toHaveBeenCalled();
    expect(test.credentialAdapter.deleteExistingCredential).not.toHaveBeenCalled();
    expect(test.removals).toEqual([['account-a', 'mock-connector']]);
  });

  it('fails disconnect preflight without deleting any value when one proof is unavailable', async () => {
    const test = fixture();
    await test.runtime.management.saveCredential({
      accountId: 'account-a',
      pluginId: 'twilio',
      fieldId: 'account_sid',
      value: 'AC1',
    });

    await expect(
      test.runtime.management.disconnect({ accountId: 'account-a', pluginId: 'twilio' }),
    ).rejects.toThrow();
    expect(test.credentialAdapter.deleteExistingCredential).not.toHaveBeenCalled();
    expect(test.removals).toEqual([]);
  });

  it('rechecks an account switch after locked proof validation and before the first delete', async () => {
    const test = fixture({ randomIds: ['sid', 'token'] });
    await test.runtime.management.saveCredential({
      accountId: 'account-a',
      pluginId: 'twilio',
      fieldId: 'account_sid',
      value: 'AC1',
    });
    await test.runtime.management.saveCredential({
      accountId: 'account-a',
      pluginId: 'twilio',
      fieldId: 'auth_token',
      value: 'token',
    });
    const revalidateLocked = vi.mocked(test.credentialAuthorization.revalidateLocked);
    const original = revalidateLocked.getMockImplementation()!;
    revalidateLocked.mockImplementationOnce(original).mockImplementationOnce(async (input) => {
      const decision = await original(input);
      test.setActiveAccountId('account-b');
      return decision;
    });

    await expect(
      test.runtime.management.disconnect({ accountId: 'account-a', pluginId: 'twilio' }),
    ).rejects.toThrow();
    expect(test.credentialAdapter.deleteExistingCredential).not.toHaveBeenCalled();
    expect(test.removals).toEqual([]);
  });

  it('serializes an account-B save behind an in-flight account-A disconnect', async () => {
    const test = fixture({ randomIds: ['a-grant', 'b-grant'] });
    const locator = { pluginId: 'github', fieldId: 'token' };
    await test.runtime.management.saveCredential({
      accountId: 'account-a',
      ...locator,
      value: 'account-a-value',
    });
    let notifyDelete!: () => void;
    const deleteStarted = new Promise<void>((resolve) => {
      notifyDelete = resolve;
    });
    let releaseDelete!: () => void;
    const deleteHeld = new Promise<void>((resolve) => {
      releaseDelete = resolve;
    });
    vi.mocked(test.credentialAdapter.deleteExistingCredential).mockImplementationOnce(
      async ({ pluginId, fieldId }) => {
        notifyDelete();
        await deleteHeld;
        test.values.delete(`${pluginId}\u0000${fieldId}`);
      },
    );

    const disconnect = test.runtime.management.disconnect({
      accountId: 'account-a',
      pluginId: 'github',
    });
    await deleteStarted;
    test.setActiveAccountId('account-b');
    const saveB = test.runtime.management.saveCredential({
      accountId: 'account-b',
      ...locator,
      value: 'account-b-value',
    });
    await Promise.resolve();
    expect(test.credentialAdapter.writeExistingCredential).toHaveBeenCalledTimes(1);
    releaseDelete();
    await expect(disconnect).rejects.toThrow();
    await saveB;

    expect(test.values.get('github\u0000token')).toBe('account-b-value');
    expect(test.removals).toEqual([]);
    await expect(test.grants.get(locator)).resolves.toMatchObject({
      accountId: 'account-b',
      grantId: 'b-grant',
    });
  });

  it('executes only a canonical fixed plugin-tool executor identity with no model target fields', async () => {
    const source: JarvisRegisteredActionDefinition = {
      id: 'mock.ping',
      version: 1,
      title: 'Ping mock connector',
      description: 'Runs one fixed deterministic connector ping.',
      inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
      outputSchema: { type: 'object', additionalProperties: true },
      requiredCapabilities: ['plugin.mock.ping'],
      requiredEntitlements: [],
      risk: 'read-only',
      approval: 'never',
      expectedEffect: 'Read one deterministic local connector response.',
      exposeToAI: true,
      executor: { kind: 'plugin_tool', pluginId: 'mock-connector', toolName: 'ping' },
      credentialBindings: [],
      validateParameters: () => ({}),
      deriveTarget: ({ accountId }) => ({
        kind: 'plugin_tool',
        accountId,
        pluginId: 'mock-connector',
        toolName: 'ping',
        resourceId: 'mock-connector',
      }),
    };
    const catalog = createJarvisActionCatalog([source]);
    const registration = catalog.resolve('mock.ping')!.executor;
    if (registration.kind !== 'plugin_tool') throw new Error('expected plugin tool');
    const test = fixture();
    const context = {
      source: 'ai' as const,
      accountId: 'account-a',
      runId: 'run-1',
      approvalId: 'approval-1',
      requestId: 'request-1',
      attemptNumber: 1,
    };

    await expect(
      test.runtime.registeredTools.execute({
        accountId: 'account-a',
        registration,
        params: {},
        context,
      }),
    ).resolves.toMatchObject({ ok: true, data: { message: 'pong' } });
    await expect(
      test.runtime.registeredTools.execute({
        accountId: 'account-a',
        registration: { ...registration },
        params: {},
        context,
      }),
    ).rejects.toThrow();
    await expect(
      test.runtime.registeredTools.execute({
        accountId: 'account-a',
        registration,
        params: { pluginId: 'github' },
        context,
      }),
    ).rejects.toThrow();
  });
});
