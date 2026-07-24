import { afterEach, describe, expect, it, vi } from 'vitest';
import * as runtimeModule from './runtime';
import {
  createAccountScopedPluginRuntime,
  createCanonicalPluginEvidenceAuthority,
} from './runtime';
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
import { getPluginManifest } from './catalog';
import {
  DEFAULT_JARVIS_ACTION_REGISTRATIONS,
  createJarvisActionCatalog,
  type JarvisRegisteredActionDefinition,
} from '@/lib/jarvis/actions/catalog';
import type { CanonicalPluginEvidence } from '@/lib/jarvis/artifactProducerAdapters';
import { createJarvisPluginCapabilityProjection } from '@/lib/jarvis/pluginCapabilityProducer';

afterEach(() => {
  vi.restoreAllMocks();
});

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
  const connectionRows = new Map<string, PluginConnection>();
  const removals: Array<[string, string]> = [];
  const randomIds = [...(options.randomIds ?? ['grant-1', 'grant-2', 'grant-3'])];
  const times = [...(options.times ?? [100, 200, 300])];
  const runtime = createAccountScopedPluginRuntime({
    activeAccountId: () => activeAccountId,
    grants,
    credentialAuthorization,
    credentialAdapter,
    connections: {
      upsertConnection: (connection) => {
        connections.push(connection);
        connectionRows.set(`${connection.accountId}\u0000${connection.pluginId}`, connection);
      },
      removeConnection: (accountId, pluginId) => {
        removals.push([accountId, pluginId]);
        connectionRows.delete(`${accountId}\u0000${pluginId}`);
      },
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
    connectionRows,
    removals,
    values,
    activeAccountId: () => activeAccountId,
    setActiveAccountId(value: string | undefined) {
      activeAccountId = value;
    },
  };
}

describe('account-scoped plugin runtime', () => {
  it('exports the closed factory without legacy generic plugin call APIs', () => {
    expect(Object.keys(runtimeModule).sort()).toEqual([
      'createAccountScopedPluginRuntime',
      'createCanonicalPluginEvidenceAuthority',
    ]);
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

  it('removes verified executable capabilities before replacing a credential', async () => {
    const test = fixture({ randomIds: ['grant-1', 'grant-2'], times: [10, 20, 30, 40] });
    const credential = {
      accountId: 'account-a',
      pluginId: 'github',
      fieldId: 'token',
    };
    await test.runtime.management.saveCredential({ ...credential, value: 'first-value' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ login: 'octocat' }), { status: 200 }),
    );
    await test.runtime.management.testConnection({
      accountId: credential.accountId,
      pluginId: credential.pluginId,
    });
    const manifest = getPluginManifest('github');
    if (!manifest) throw new Error('expected GitHub manifest');
    const verified = createJarvisPluginCapabilityProjection({
      accountId: credential.accountId,
      capturedAt: 35,
      manifests: [manifest],
      connections: {
        github: test.connectionRows.get('account-a\u0000github')!,
      },
    });
    expect(verified.refs.map(({ id }) => id)).toEqual([
      'github',
      'plugin.github.identity',
      'plugin.github.repository_context',
    ]);

    test.removals.length = 0;
    await test.runtime.management.saveCredential({ ...credential, value: 'replacement-value' });

    expect(test.removals).toEqual([['account-a', 'github']]);
    expect(test.connectionRows.has('account-a\u0000github')).toBe(false);
    const unverified = createJarvisPluginCapabilityProjection({
      accountId: credential.accountId,
      capturedAt: 40,
      manifests: [manifest],
      connections: {},
    });
    expect(unverified.refs.map(({ id }) => id)).toEqual(['github']);
    expect(unverified.refs[0]).toMatchObject({ state: 'available', operations: [] });
  });

  it('removes the previous account verification when another account overwrites its grant', async () => {
    const test = fixture({ randomIds: ['grant-a', 'grant-b'], times: [10, 20, 30, 40] });
    const locator = { pluginId: 'github', fieldId: 'token' };
    await test.runtime.management.saveCredential({
      accountId: 'account-a',
      ...locator,
      value: 'account-a-value',
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ login: 'octocat' }), { status: 200 }),
    );
    await test.runtime.management.testConnection({
      accountId: 'account-a',
      pluginId: 'github',
    });
    expect(test.connectionRows.get('account-a\u0000github')).toMatchObject({
      state: 'connected',
      enabled: true,
    });

    test.removals.length = 0;
    test.setActiveAccountId('account-b');
    await test.runtime.management.saveCredential({
      accountId: 'account-b',
      ...locator,
      value: 'account-b-value',
    });

    expect(test.removals).toEqual([
      ['account-b', 'github'],
      ['account-a', 'github'],
    ]);
    expect(test.connectionRows.has('account-a\u0000github')).toBe(false);
    const manifest = getPluginManifest('github');
    if (!manifest) throw new Error('expected GitHub manifest');
    const oldAccountProjection = createJarvisPluginCapabilityProjection({
      accountId: 'account-a',
      capturedAt: 40,
      manifests: [manifest],
      connections: {},
    });
    expect(oldAccountProjection.refs.map(({ id }) => id)).toEqual(['github']);
    expect(oldAccountProjection.refs[0]).toMatchObject({
      state: 'available',
      operations: [],
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
    expect(test.credentialAuthorization.revalidateLocked).toHaveBeenCalledTimes(3);
    expect(test.credentialAdapter.readExistingCredential).toHaveBeenCalledTimes(1);
    expect(test.connections.at(-1)).toMatchObject({
      accountId: 'account-a',
      pluginId: 'github',
      state: 'connected',
      configuredFields: ['token'],
    });
  });

  it('cannot certify a replacement credential with an in-flight old-credential probe', async () => {
    const test = fixture({ randomIds: ['grant-1', 'grant-2'], times: [10, 20, 30, 40] });
    const credential = {
      accountId: 'account-a',
      pluginId: 'github',
      fieldId: 'token',
    };
    await test.runtime.management.saveCredential({ ...credential, value: 'first-value' });
    let providerStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      providerStarted = resolve;
    });
    let releaseProvider!: () => void;
    const providerHeld = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => {
      providerStarted();
      await providerHeld;
      return new Response(JSON.stringify({ login: 'octocat' }), { status: 200 });
    });

    const oldCredentialTest = test.runtime.management.testConnection({
      accountId: credential.accountId,
      pluginId: credential.pluginId,
    });
    await started;
    await test.runtime.management.saveCredential({ ...credential, value: 'replacement-value' });
    releaseProvider();

    await expect(oldCredentialTest).resolves.toMatchObject({ ok: false });
    expect(test.connectionRows.has('account-a\u0000github')).toBe(false);
    const manifest = getPluginManifest('github');
    if (!manifest) throw new Error('expected GitHub manifest');
    const projection = createJarvisPluginCapabilityProjection({
      accountId: credential.accountId,
      capturedAt: 40,
      manifests: [manifest],
      connections: {},
    });
    expect(projection.refs.map(({ id }) => id)).toEqual(['github']);
    expect(projection.refs[0]).toMatchObject({ state: 'available', operations: [] });
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
    expect(test.removals).toEqual([
      ['account-a', 'twilio'],
      ['account-a', 'twilio'],
      ['account-a', 'twilio'],
    ]);
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
    expect(test.removals).toEqual([['account-a', 'twilio']]);
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
    expect(test.removals).toEqual([
      ['account-a', 'twilio'],
      ['account-a', 'twilio'],
    ]);
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
    expect(test.removals).toEqual([
      ['account-a', 'github'],
      ['account-b', 'github'],
    ]);
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

  it('executes fixed GitHub reads against exact endpoints and returns only bounded normalized data', async () => {
    const test = fixture();
    await test.runtime.management.saveCredential({
      accountId: 'account-a',
      pluginId: 'github',
      fieldId: 'token',
      value: 'test-credential-value',
    });
    const catalog = createJarvisActionCatalog(DEFAULT_JARVIS_ACTION_REGISTRATIONS);
    const identity = catalog.resolve('github.identity')?.executor;
    const repository = catalog.resolve('github.repository.read')?.executor;
    if (identity?.kind !== 'plugin_tool' || repository?.kind !== 'plugin_tool') {
      throw new Error('expected fixed GitHub plugin registrations');
    }
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            login: 'octocat',
            name: 'UNTRUSTED_IDENTITY_BODY_SENTINEL',
            html_url: 'https://attacker.invalid/profile',
            public_repos: 8,
            total_private_repos: 3,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            full_name: 'octocat/Hello-World',
            description: 'UNTRUSTED_REPOSITORY_BODY_SENTINEL',
            html_url: 'https://attacker.invalid/repository',
            visibility: 'public',
            private: false,
            default_branch: 'main',
            stargazers_count: 80,
            forks_count: 9,
            open_issues_count: 3,
            archived: false,
            updated_at: '2026-07-20T12:34:56Z',
          }),
          { status: 200 },
        ),
      );
    const context = {
      source: 'ai' as const,
      accountId: 'account-a',
      runId: 'run-github',
      approvalId: 'approval-github',
      requestId: 'request-github',
      attemptNumber: 1,
      signal: new AbortController().signal,
    };

    await expect(
      test.runtime.registeredTools.execute({
        accountId: 'account-a',
        registration: identity,
        params: {},
        context,
      }),
    ).resolves.toEqual({
      ok: true,
      summary: 'GitHub account octocat verified.',
      data: {
        login: 'octocat',
        profileUrl: 'https://github.com/octocat',
        publicRepositories: 8,
        privateRepositories: 3,
      },
    });
    const repositoryResult = await test.runtime.registeredTools.execute({
      accountId: 'account-a',
      registration: repository,
      params: { owner: 'octocat', repository: 'Hello-World' },
      context,
    });
    expect(repositoryResult).toEqual({
      ok: true,
      summary: 'GitHub repository octocat/Hello-World retrieved.',
      data: {
        fullName: 'octocat/Hello-World',
        repositoryUrl: 'https://github.com/octocat/Hello-World',
        visibility: 'public',
        defaultBranch: 'main',
        stars: 80,
        forks: 9,
        openIssuesAndPullRequests: 3,
        archived: false,
        updatedAt: '2026-07-20T12:34:56Z',
      },
    });
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      'https://api.github.com/user',
      expect.objectContaining({
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: 'Bearer test-credential-value',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      'https://api.github.com/repos/octocat/Hello-World',
      expect.objectContaining({
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: 'Bearer test-credential-value',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(JSON.stringify(repositoryResult)).not.toMatch(
      /test-credential|UNTRUSTED_|attacker\.invalid/i,
    );
    await expect(
      test.runtime.registeredTools.execute({
        accountId: 'account-a',
        registration: repository,
        params: { owner: 'octocat/escape', repository: 'Hello-World' },
        context,
      }),
    ).rejects.toThrow(/repository_target_invalid/i);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    fetchSpy.mockResolvedValueOnce(
      new Response('test-credential-value provider body must stay private', { status: 401 }),
    );
    const rejected = await test.runtime.registeredTools
      .execute({
        accountId: 'account-a',
        registration: identity,
        params: {},
        context,
      })
      .catch((error) => error);
    expect(String(rejected)).toMatch(/connection_rejected_401/i);
    expect(String(rejected)).not.toMatch(/test-credential|provider body/i);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});

describe('canonical plugin artifact evidence authority', () => {
  const evidence = Object.freeze({
    producerId: 'plugin_result',
    accountId: 'account-a',
    runId: 'jrun_plugin',
    requestId: 'jrequest_plugin',
    attemptNumber: 1,
    resultRef: 'jplugin_result_invocation-1',
    state: 'succeeded',
    verifiedAt: 1_786_202_400_000,
    pluginId: 'mock-connector',
    invocationId: 'invocation-1',
  }) satisfies CanonicalPluginEvidence;

  function registration() {
    const source: JarvisRegisteredActionDefinition = {
      id: 'mock.artifact-ping',
      version: 1,
      title: 'Ping mock connector for artifact evidence',
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
    const resolved = createJarvisActionCatalog([source]).resolve(source.id)!.executor;
    if (resolved.kind !== 'plugin_tool') throw new Error('expected plugin tool');
    return resolved;
  }

  it('requires the private registered executor, active account, grant revalidation, and literal registration', async () => {
    const test = fixture();
    const literalRegistration = registration();
    const readCanonicalPluginResult = vi.fn(async () =>
      Object.freeze({
        evidence,
        registration: literalRegistration,
        executor: test.runtime.registeredTools,
      }),
    );
    const revalidateCanonicalPluginGrant = vi.fn(async () => true);
    const authority = createCanonicalPluginEvidenceAuthority({
      executor: test.runtime.registeredTools,
      activeAccountId: test.activeAccountId,
      results: { readCanonicalPluginResult },
      grants: { revalidateCanonicalPluginGrant },
    });

    await expect(authority.verify(evidence)).resolves.toBe(evidence);
    expect(revalidateCanonicalPluginGrant).toHaveBeenCalledWith({
      evidence,
      registration: literalRegistration,
    });

    test.setActiveAccountId('account-b');
    await expect(authority.verify(evidence)).resolves.toBeNull();
    test.setActiveAccountId('account-a');
    revalidateCanonicalPluginGrant.mockResolvedValueOnce(false);
    await expect(authority.verify(evidence)).resolves.toBeNull();
    readCanonicalPluginResult.mockResolvedValueOnce(
      Object.freeze({
        evidence,
        registration: Object.freeze({ ...literalRegistration }),
        executor: test.runtime.registeredTools,
      }),
    );
    await expect(authority.verify(evidence)).resolves.toBeNull();
  });

  it('rejects a non-runtime executor and cross-result evidence', async () => {
    const test = fixture();
    const literalRegistration = registration();
    const readCanonicalPluginResult = vi.fn(async () =>
      Object.freeze({
        evidence,
        registration: literalRegistration,
        executor: test.runtime.registeredTools,
      }),
    );
    expect(() =>
      createCanonicalPluginEvidenceAuthority({
        executor: Object.freeze({ execute: vi.fn() }),
        activeAccountId: test.activeAccountId,
        results: { readCanonicalPluginResult },
        grants: { revalidateCanonicalPluginGrant: vi.fn(async () => true) },
      }),
    ).toThrow('canonical_plugin_executor_invalid');

    const authority = createCanonicalPluginEvidenceAuthority({
      executor: test.runtime.registeredTools,
      activeAccountId: test.activeAccountId,
      results: { readCanonicalPluginResult },
      grants: { revalidateCanonicalPluginGrant: vi.fn(async () => true) },
    });
    await expect(
      authority.verify(Object.freeze({ ...evidence, invocationId: 'invocation-other' })),
    ).resolves.toBeNull();
    expect(runtimeModule).not.toHaveProperty('callPluginTool');
  });
});
