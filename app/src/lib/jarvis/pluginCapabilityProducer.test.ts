import { describe, expect, it } from 'vitest';
import { PLUGIN_CATALOG } from '@/features/plugins/catalog';
import type { PluginConnection, PluginManifest } from '@/features/plugins/types';
import { createJarvisCapabilitySnapshot } from './capabilitySnapshot';
import {
  createJarvisPluginCapabilityProjection,
  type JarvisPluginCapabilityProducerInput,
} from './pluginCapabilityProducer';

function manifest(overrides: Partial<PluginManifest> & Pick<PluginManifest, 'id'>): PluginManifest {
  const { id, ...rest } = overrides;
  return {
    id,
    name: id,
    description: `${id} integration`,
    category: 'Testing',
    provider: 'Test',
    authType: 'api_key',
    fields: [
      {
        id: 'api_key',
        label: 'API key',
        secret: true,
        required: true,
      },
    ],
    status: 'implemented',
    help: 'Test integration.',
    tools: [{ name: 'search', description: 'Search records.', readOnly: true }],
    tags: [],
    setupSteps: [],
    supportedFeatures: ['search'],
    ...rest,
  };
}

function connection(
  overrides: Partial<PluginConnection> & Pick<PluginConnection, 'pluginId'>,
): PluginConnection {
  const { pluginId, ...rest } = overrides;
  return {
    accountId: 'account-1',
    pluginId,
    state: 'connected',
    enabled: true,
    enabledProjectIds: ['*'],
    configuredFields: ['api_key'],
    lastTestedAt: 90,
    updatedAt: 91,
    ...rest,
  };
}

function project(overrides: Partial<JarvisPluginCapabilityProducerInput> = {}) {
  return createJarvisPluginCapabilityProjection({
    accountId: 'account-1',
    capturedAt: 100,
    manifests: [
      manifest({ id: 'api-plugin' }),
      manifest({ id: 'oauth-plugin', authType: 'oauth' }),
    ],
    connections: {
      'api-plugin': connection({ pluginId: 'api-plugin' }),
      'oauth-plugin': connection({ pluginId: 'oauth-plugin', configuredFields: [] }),
    },
    ...overrides,
  });
}

describe('createJarvisPluginCapabilityProjection', () => {
  it('projects tested enabled API-key and OAuth plugins with exact verification evidence', () => {
    const projection = project();

    expect(projection.integrations.map(({ id, kind, state }) => ({ id, kind, state }))).toEqual([
      {
        id: 'api-plugin',
        kind: 'api_key_plugin',
        state: 'Connection verified',
      },
      {
        id: 'api-plugin:search',
        kind: 'api_key_plugin',
        state: 'Tool available',
      },
      {
        id: 'oauth-plugin',
        kind: 'oauth_plugin',
        state: 'Connection verified',
      },
      {
        id: 'oauth-plugin:search',
        kind: 'oauth_plugin',
        state: 'Tool available',
      },
    ]);
    expect(projection.refs).toEqual([
      {
        id: 'api-plugin',
        state: 'authenticated',
        operations: ['search'],
        evidenceRef: 'plugin-verification:account-1:api-plugin:90',
        lastVerifiedAt: 90,
      },
      {
        id: 'oauth-plugin',
        state: 'authenticated',
        operations: ['search'],
        evidenceRef: 'plugin-verification:account-1:oauth-plugin:90',
        lastVerifiedAt: 90,
      },
    ]);
  });

  it('represents a tested in-process connector as an available MCP-lite tool, not a server connection', () => {
    const projection = project({
      manifests: [
        manifest({
          id: 'local-tool',
          authType: 'none',
          fields: [],
        }),
      ],
      connections: {
        'local-tool': connection({
          pluginId: 'local-tool',
          configuredFields: [],
        }),
      },
    });

    expect(projection.integrations).toEqual([
      expect.objectContaining({
        id: 'local-tool:search',
        kind: 'mcp_lite_tool',
        state: 'Tool available',
        toolId: 'local-tool.search',
      }),
    ]);
    expect(projection.refs).toEqual([
      {
        id: 'local-tool',
        state: 'available',
        operations: ['search'],
        evidenceRef: 'plugin-verification:account-1:local-tool:90',
        lastVerifiedAt: 90,
      },
    ]);
  });

  it('keeps catalog, configuration, credential, connection, and tool truth distinct', () => {
    const manifests = [
      manifest({ id: 'planned', status: 'planned' }),
      manifest({ id: 'missing' }),
      manifest({ id: 'saved' }),
      manifest({ id: 'observed', authType: 'none', fields: [] }),
      manifest({ id: 'disabled' }),
    ];
    const projection = project({
      manifests,
      connections: {
        saved: connection({
          pluginId: 'saved',
          state: 'not_connected',
          lastTestedAt: undefined,
        }),
        observed: connection({
          pluginId: 'observed',
          configuredFields: [],
          lastTestedAt: undefined,
        }),
        disabled: connection({ pluginId: 'disabled', enabled: false }),
      },
    });

    expect(
      projection.integrations
        .filter(({ id }) => !id.includes(':'))
        .map(({ id, state }) => ({ id, state })),
    ).toEqual([
      { id: 'disabled', state: 'Connection verified' },
      { id: 'missing', state: 'Credentials missing' },
      { id: 'observed', state: 'Configuration available' },
      { id: 'planned', state: 'Catalog only' },
      { id: 'saved', state: 'Credentials saved' },
    ]);
    expect(projection.refs).toEqual([
      expect.objectContaining({ id: 'disabled', state: 'authenticated', operations: [] }),
      { id: 'missing', state: 'available', operations: [] },
      { id: 'observed', state: 'available', operations: [] },
      { id: 'planned', state: 'planned', operations: [] },
      { id: 'saved', state: 'available', operations: [] },
    ]);
    expect(projection.integrations).not.toContainEqual(
      expect.objectContaining({ id: 'disabled:search' }),
    );
  });

  it('does not promote an unverified connected row or expose its declared tools', () => {
    const projection = project({
      manifests: [manifest({ id: 'unverified' })],
      connections: {
        unverified: connection({ pluginId: 'unverified', lastTestedAt: undefined }),
      },
    });

    expect(projection.integrations).toEqual([
      expect.objectContaining({
        id: 'unverified',
        state: 'Credentials saved',
      }),
    ]);
    expect(projection.refs).toEqual([{ id: 'unverified', state: 'available', operations: [] }]);
  });

  it('omits foreign-account and unknown-plugin rows', () => {
    const projection = project({
      manifests: [manifest({ id: 'owned' })],
      connections: {
        owned: connection({ pluginId: 'owned', accountId: 'account-2' }),
        unknown: connection({ pluginId: 'unknown' }),
      },
    });

    expect(projection.integrations).toEqual([
      expect.objectContaining({ id: 'owned', state: 'Credentials missing' }),
    ]);
    expect(projection.refs).toEqual([{ id: 'owned', state: 'available', operations: [] }]);
  });

  it('reports failed connection tests as degraded without copying error or credential data', () => {
    const projection = project({
      manifests: [manifest({ id: 'failed' })],
      connections: {
        failed: {
          ...connection({ pluginId: 'failed', state: 'error' }),
          error: 'Bearer credential-material-must-not-leak',
          accountLabel: 'private@example.test',
        },
      },
    });
    const serialized = JSON.stringify(projection);

    expect(projection.refs).toEqual([
      {
        id: 'failed',
        state: 'degraded',
        operations: [],
        evidenceRef: 'plugin-test-failed:account-1:failed:90',
        lastVerifiedAt: 90,
      },
    ]);
    expect(serialized).not.toMatch(/credential-material|private@example/i);
  });

  it('bounds, canonicalizes, detaches, and deeply freezes declared operations', () => {
    const tools = Array.from({ length: 70 }, (_, index) => ({
      name: index === 69 ? 'tool-00' : `tool-${String(index).padStart(2, '0')}`,
      description: 'Tool.',
      readOnly: true,
    }));
    const input = {
      accountId: 'account-1',
      capturedAt: 100,
      manifests: [manifest({ id: 'bounded', tools })],
      connections: {
        bounded: connection({ pluginId: 'bounded' }),
      },
    };
    const projection = createJarvisPluginCapabilityProjection(input);

    expect(projection.refs[0]?.operations).toHaveLength(64);
    expect(projection.refs[0]?.operations[0]).toBe('tool-00');
    input.connections.bounded.enabled = false;
    input.manifests[0]!.tools.push({
      name: 'late-mutation',
      description: 'Must not appear.',
      readOnly: true,
    });
    expect(projection.refs[0]?.operations).not.toContain('late-mutation');
    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection.refs)).toBe(true);
    expect(Object.isFrozen(projection.refs[0])).toBe(true);
    expect(Object.isFrozen(projection.refs[0]?.operations)).toBe(true);
    expect(Object.isFrozen(projection.integrations)).toBe(true);
  });

  it('validates the complete shipping catalog without inventing live connections or tools', () => {
    const projection = createJarvisPluginCapabilityProjection({
      accountId: 'account-1',
      capturedAt: 100,
      manifests: PLUGIN_CATALOG,
      connections: {},
    });
    const snapshot = createJarvisCapabilitySnapshot({
      capturedAt: 100,
      tools: [],
      plugins: projection.refs,
      mcps: [],
      terminals: [],
      agents: [],
      entitlements: { source: 'unavailable', capabilities: [] },
    });

    expect(snapshot.plugins).toHaveLength(PLUGIN_CATALOG.length);
    expect(snapshot.plugins.every(({ state }) => state === 'available' || state === 'planned')).toBe(
      true,
    );
    expect(snapshot.plugins.every(({ operations }) => operations.length === 0)).toBe(true);
    expect(Object.isFrozen(snapshot.plugins)).toBe(true);
  });
});
