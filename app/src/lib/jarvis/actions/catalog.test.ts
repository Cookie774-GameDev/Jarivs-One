import { describe, expect, it } from 'vitest';
import { getAllActions } from '@/lib/actions/runner';
import type { ActionDef } from '@/lib/actions/types';
import {
  DEFAULT_JARVIS_ACTION_REGISTRATIONS,
  buildJarvisActionCatalog,
  createJarvisActionCatalog,
  isJarvisAutoApprovableRegistration,
  isRegisteredPluginToolExecutor,
  validateJarvisActionCatalog,
  type JarvisRegisteredActionDefinition,
} from './catalog';

function registration(
  overrides: Partial<JarvisRegisteredActionDefinition> = {},
): JarvisRegisteredActionDefinition {
  return {
    id: 'files.inspect',
    version: 1,
    title: 'Inspect file',
    description: 'Inspect one app-owned file.',
    inputSchema: {
      type: 'object',
      properties: { resourceId: { type: 'string' } },
      required: ['resourceId'],
      additionalProperties: false,
    },
    outputSchema: { type: 'object', additionalProperties: false },
    requiredCapabilities: ['files.read'],
    requiredEntitlements: [],
    risk: 'read-only',
    approval: 'never',
    expectedEffect: 'Reads one app-owned file without changing it.',
    exposeToAI: true,
    executor: { kind: 'builtin', registryActionId: 'file.open' },
    credentialBindings: [],
    validateParameters: (input) => ({ resourceId: String(input.resourceId) }),
    deriveTarget: ({ params }) => ({
      kind: 'app_resource',
      namespace: 'file',
      resourceId: String(params.resourceId),
    }),
    ...overrides,
  };
}

describe('Jarvis action catalog', () => {
  it('permits auto approval only for literal read-only/never registrations', () => {
    expect(isJarvisAutoApprovableRegistration(registration())).toBe(true);
    expect(isJarvisAutoApprovableRegistration(registration({ risk: 'safe-write' }))).toBe(false);
    expect(isJarvisAutoApprovableRegistration(registration({ approval: 'always' }))).toBe(false);
  });

  it('keeps the literal native smoke actions on distinct safe, confirm, and dangerous risks', () => {
    expect(
      DEFAULT_JARVIS_ACTION_REGISTRATIONS.map(({ id, risk, approval }) => ({
        id,
        risk,
        approval,
      })),
    ).toEqual([
      { id: 'file.search', risk: 'read-only', approval: 'never' },
      { id: 'github.identity', risk: 'read-only', approval: 'never' },
      { id: 'github.repository.read', risk: 'read-only', approval: 'never' },
      { id: 'github.issue.read', risk: 'read-only', approval: 'never' },
      { id: 'github.pull_request.read', risk: 'read-only', approval: 'never' },
      { id: 'github.commits.recent', risk: 'read-only', approval: 'never' },
      { id: 'github.release.latest', risk: 'read-only', approval: 'never' },
      { id: 'github.workflows.list', risk: 'read-only', approval: 'never' },
      { id: 'chat.model.switch', risk: 'external-side-effect', approval: 'always' },
      { id: 'terminal.create', risk: 'safe-write', approval: 'always' },
      { id: 'terminal.run', risk: 'external-side-effect', approval: 'always' },
      { id: 'task.cancel', risk: 'destructive', approval: 'always' },
    ]);
  });

  it('publishes a closed model-safe model-switch registration', () => {
    const modelSwitch = createJarvisActionCatalog(DEFAULT_JARVIS_ACTION_REGISTRATIONS).resolve(
      'chat.model.switch',
    );

    expect(modelSwitch).toMatchObject({
      id: 'chat.model.switch',
      inputSchema: {
        type: 'object',
        required: ['request'],
        additionalProperties: false,
        properties: {
          request: { type: 'string' },
          needsImages: { type: 'boolean' },
          needsTools: { type: 'boolean' },
        },
      },
      requiredCapabilities: ['chat.actions'],
      risk: 'external-side-effect',
      approval: 'always',
      executor: { kind: 'builtin', registryActionId: 'chat.model.switch' },
      credentialBindings: [],
    });
    expect(
      modelSwitch?.validateParameters({
        request: '  Switch to Gemini.  ',
        needsImages: true,
        needsTools: false,
      }),
    ).toEqual({
      request: 'Switch to Gemini.',
      needsImages: true,
      needsTools: false,
    });
    expect(
      modelSwitch?.deriveTarget({
        accountId: 'account-model-switch',
        params: { request: 'Switch to Gemini.' },
      }),
    ).toEqual({
      kind: 'app_resource',
      namespace: 'chat-model',
      resourceId: 'active',
    });
    expect(() =>
      modelSwitch?.validateParameters({
        request: 'Switch to Gemini.',
        approvalId: 'must-not-be-model-controlled',
      }),
    ).toThrow(/unknown fields/i);
    expect(() =>
      modelSwitch?.validateParameters({ request: 'Switch to Gemini.', needsTools: 'yes' }),
    ).toThrow(/needsTools/i);
    expect(() => modelSwitch?.validateParameters({ request: ' '.repeat(2) })).toThrow(/request/i);
  });

  it('normalizes every executable action into a versioned typed definition', () => {
    const catalog = buildJarvisActionCatalog(getAllActions());

    expect(catalog.length).toBeGreaterThan(40);
    expect(validateJarvisActionCatalog(catalog)).toEqual([]);
    expect(catalog.every((action) => action.version === 1)).toBe(true);
    expect(catalog.every((action) => typeof action.handler === 'function')).toBe(true);

    expect(catalog.find((action) => action.id === 'terminal.bulkOpen')).toMatchObject({
      risk: 'external-side-effect',
      approval: 'always',
      inputSchema: {
        type: 'object',
        properties: expect.objectContaining({ count: expect.objectContaining({ type: 'number' }) }),
      },
    });
  });

  it('rejects credential-shaped fields from model-visible action schemas', () => {
    const invalid: ActionDef = {
      id: 'unsafe.secret',
      category: 'custom',
      label: 'Unsafe secret',
      description: 'Unsafe test action.',
      params: [{ key: 'apiKey', label: 'API key', type: 'string' }],
      run: async () => ({ ok: true }),
    };

    const errors = validateJarvisActionCatalog(buildJarvisActionCatalog([invalid]));

    expect(errors.join('\n')).toMatch(/credential field/i);
  });

  it('deep-freezes detached canonical registrations and keeps unregistered legacy actions unavailable', () => {
    const source = registration();
    const catalog = createJarvisActionCatalog([source]);
    const resolved = catalog.resolve(source.id)!;

    expect(resolved).not.toBe(source);
    expect(resolved.executor).not.toBe(source.executor);
    expect(resolved.inputSchema).not.toBe(source.inputSchema);
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.executor)).toBe(true);
    expect(Object.isFrozen(resolved.inputSchema)).toBe(true);
    expect(Object.isFrozen(resolved.inputSchema.properties)).toBe(true);
    expect(catalog.resolve('legacy.only')).toBeUndefined();
    expect(
      buildJarvisActionCatalog([
        {
          id: 'legacy.only',
          category: 'custom',
          label: 'Legacy',
          description: 'Legacy only.',
          params: [],
          run: async () => ({ ok: true }),
        },
      ]),
    ).toHaveLength(1);
  });

  it.each([
    [registration(), registration()],
    [registration(), registration({ version: 2 })],
  ])('rejects duplicate action ids regardless of version', (...registrations) => {
    expect(() => createJarvisActionCatalog(registrations)).toThrow(/duplicate action id/i);
  });

  it.each(['plugin.call', 'plugin.invoke'])('rejects generic plugin action id %s', (id) => {
    expect(() => createJarvisActionCatalog([registration({ id })])).toThrow(/generic plugin/i);
  });

  it('fixes plugin and tool identity outside model parameters and recognizes only canonical executor identity', () => {
    const source = registration({
      id: 'shopify.orders.list',
      executor: { kind: 'plugin_tool', pluginId: 'shopify', toolName: 'orders.list' },
      credentialBindings: [
        {
          field: 'shopifyCredential',
          locator: { pluginId: 'shopify', fieldId: 'access-token' },
        },
      ],
      inputSchema: { type: 'object', additionalProperties: false },
      validateParameters: () => ({}),
      deriveTarget: ({ accountId }) => ({
        kind: 'plugin_tool',
        accountId,
        pluginId: 'shopify',
        toolName: 'orders.list',
        resourceId: 'orders',
      }),
    });
    const executor = createJarvisActionCatalog([source]).resolve(source.id)!.executor;

    expect(isRegisteredPluginToolExecutor(source.executor)).toBe(false);
    expect(isRegisteredPluginToolExecutor({ ...executor })).toBe(false);
    expect(isRegisteredPluginToolExecutor(executor)).toBe(true);
    expect(() =>
      createJarvisActionCatalog([
        registration({
          id: 'shopify.unsafe',
          executor: source.executor,
          inputSchema: { type: 'object', properties: { pluginId: { type: 'string' } } },
          deriveTarget: source.deriveTarget,
        }),
      ]),
    ).toThrow(/model-visible|pluginId/i);
  });

  it('publishes only fixed model-safe GitHub plugin registrations with account-bound credentials', () => {
    const catalog = createJarvisActionCatalog(DEFAULT_JARVIS_ACTION_REGISTRATIONS);
    const identity = catalog.resolve('github.identity');
    const repository = catalog.resolve('github.repository.read');
    const issue = catalog.resolve('github.issue.read');
    const pullRequest = catalog.resolve('github.pull_request.read');
    const recentCommits = catalog.resolve('github.commits.recent');
    const latestRelease = catalog.resolve('github.release.latest');
    const workflows = catalog.resolve('github.workflows.list');

    expect(Object.isFrozen(DEFAULT_JARVIS_ACTION_REGISTRATIONS)).toBe(true);
    expect(
      catalog
        .listExposed()
        .filter((entry) => entry.executor.kind === 'plugin_tool')
        .map(({ id }) => id),
    ).toEqual([
      'github.identity',
      'github.repository.read',
      'github.issue.read',
      'github.pull_request.read',
      'github.commits.recent',
      'github.release.latest',
      'github.workflows.list',
    ]);
    expect(identity).toMatchObject({
      requiredCapabilities: ['plugin.github.identity'],
      risk: 'read-only',
      approval: 'never',
      executor: { kind: 'plugin_tool', pluginId: 'github', toolName: 'identity' },
      credentialBindings: [
        { field: 'githubCredential', locator: { pluginId: 'github', fieldId: 'token' } },
      ],
      inputSchema: { type: 'object', additionalProperties: false },
    });
    expect(identity?.validateParameters({})).toEqual({});
    expect(() => identity?.validateParameters({ token: 'model-controlled' })).toThrow(
      /unknown fields/i,
    );
    expect(repository).toMatchObject({
      requiredCapabilities: ['plugin.github.repository_context'],
      risk: 'read-only',
      approval: 'never',
      executor: {
        kind: 'plugin_tool',
        pluginId: 'github',
        toolName: 'repository_context',
      },
      credentialBindings: [
        { field: 'githubCredential', locator: { pluginId: 'github', fieldId: 'token' } },
      ],
      inputSchema: {
        type: 'object',
        required: ['owner', 'repository'],
        additionalProperties: false,
      },
    });
    expect(
      repository?.validateParameters({ owner: ' octocat ', repository: ' Hello-World ' }),
    ).toEqual({ owner: 'octocat', repository: 'Hello-World' });
    expect(
      repository?.deriveTarget({
        accountId: 'account-github',
        params: { owner: 'octocat', repository: 'Hello-World' },
      }),
    ).toEqual({
      kind: 'plugin_tool',
      accountId: 'account-github',
      pluginId: 'github',
      toolName: 'repository_context',
      resourceId: 'octocat/Hello-World',
    });
    expect(() =>
      repository?.validateParameters({ owner: 'octocat/escape', repository: 'Hello-World' }),
    ).toThrow(/owner/i);
    expect(() =>
      repository?.validateParameters({
        owner: 'octocat',
        repository: 'Hello-World',
        pluginId: 'github',
      }),
    ).toThrow(/unknown fields/i);
    expect(JSON.stringify(repository?.inputSchema)).not.toMatch(/token|credential|secret/i);
    for (const [registration, actionId, toolName, capability] of [
      [issue, 'github.issue.read', 'issue_context', 'plugin.github.issue_context'],
      [
        pullRequest,
        'github.pull_request.read',
        'pull_request_context',
        'plugin.github.pull_request_context',
      ],
    ] as const) {
      expect(registration).toMatchObject({
        id: actionId,
        requiredCapabilities: [capability],
        risk: 'read-only',
        approval: 'never',
        executor: { kind: 'plugin_tool', pluginId: 'github', toolName },
        credentialBindings: [
          { field: 'githubCredential', locator: { pluginId: 'github', fieldId: 'token' } },
        ],
        inputSchema: {
          type: 'object',
          required: ['owner', 'repository', 'number'],
          additionalProperties: false,
        },
      });
      expect(
        registration?.validateParameters({
          owner: ' octocat ',
          repository: ' Hello-World ',
          number: 42,
        }),
      ).toEqual({ owner: 'octocat', repository: 'Hello-World', number: 42 });
      expect(
        registration?.deriveTarget({
          accountId: 'account-github',
          params: { owner: 'octocat', repository: 'Hello-World', number: 42 },
        }),
      ).toEqual({
        kind: 'plugin_tool',
        accountId: 'account-github',
        pluginId: 'github',
        toolName,
        resourceId: 'octocat/Hello-World#42',
      });
      expect(() =>
        registration?.validateParameters({
          owner: 'octocat',
          repository: 'Hello-World',
          number: 0,
        }),
      ).toThrow(/number/i);
      expect(JSON.stringify(registration?.inputSchema)).not.toMatch(/token|credential|secret/i);
    }
    for (const [registration, actionId, toolName, capability] of [
      [recentCommits, 'github.commits.recent', 'recent_commits', 'plugin.github.recent_commits'],
      [latestRelease, 'github.release.latest', 'latest_release', 'plugin.github.latest_release'],
      [workflows, 'github.workflows.list', 'workflows', 'plugin.github.workflows'],
    ] as const) {
      expect(registration).toMatchObject({
        id: actionId,
        requiredCapabilities: [capability],
        risk: 'read-only',
        approval: 'never',
        executor: { kind: 'plugin_tool', pluginId: 'github', toolName },
        credentialBindings: [
          { field: 'githubCredential', locator: { pluginId: 'github', fieldId: 'token' } },
        ],
        inputSchema: {
          type: 'object',
          required: ['owner', 'repository'],
          additionalProperties: false,
        },
      });
      expect(
        registration?.validateParameters({
          owner: ' octocat ',
          repository: ' Hello-World ',
        }),
      ).toEqual({ owner: 'octocat', repository: 'Hello-World' });
      expect(
        registration?.deriveTarget({
          accountId: 'account-github',
          params: { owner: 'octocat', repository: 'Hello-World' },
        }),
      ).toEqual({
        kind: 'plugin_tool',
        accountId: 'account-github',
        pluginId: 'github',
        toolName,
        resourceId: 'octocat/Hello-World',
      });
      expect(() =>
        registration?.validateParameters({
          owner: 'octocat',
          repository: 'Hello-World',
          perPage: 100,
        }),
      ).toThrow(/unknown fields/i);
      expect(JSON.stringify(registration?.inputSchema)).not.toMatch(/token|credential|secret/i);
    }
  });
});
