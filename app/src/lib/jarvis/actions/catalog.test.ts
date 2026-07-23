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
      { id: 'terminal.create', risk: 'safe-write', approval: 'always' },
      { id: 'terminal.run', risk: 'external-side-effect', approval: 'always' },
      { id: 'task.cancel', risk: 'destructive', approval: 'always' },
    ]);
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

  it('publishes a literal immutable default catalog with zero plugin-tool registrations', () => {
    expect(Object.isFrozen(DEFAULT_JARVIS_ACTION_REGISTRATIONS)).toBe(true);
    expect(DEFAULT_JARVIS_ACTION_REGISTRATIONS.length).toBeGreaterThan(0);
    expect(
      (DEFAULT_JARVIS_ACTION_REGISTRATIONS as readonly JarvisRegisteredActionDefinition[]).filter(
        (entry) => entry.executor.kind === 'plugin_tool',
      ),
    ).toEqual([]);
  });
});
