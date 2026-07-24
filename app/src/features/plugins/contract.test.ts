import { describe, expect, it } from 'vitest';
import { getPluginRuntimeContract, validatePluginRuntimeContract } from './contract';
import type { PluginManifest } from './types';
import { usePluginStore } from './store';

const manifest: PluginManifest = {
  id: 'example',
  name: 'Example',
  description: 'Example connector',
  category: 'developer',
  provider: 'Example Inc.',
  authType: 'token',
  fields: [{ id: 'token', label: 'Token', secret: true, required: true }],
  requiredScopes: ['repository:read'],
  status: 'implemented',
  help: 'Create a scoped token.',
  tools: [{ name: 'repo.read', description: 'Read repo', readOnly: true }],
  tags: ['code'],
  setupSteps: ['Create token', 'Test connection'],
  supportedFeatures: ['repositories'],
};

describe('plugin runtime contract', () => {
  it('requires an exact account-owned connection and exposes only human management actions', () => {
    const connection = {
      accountId: 'account-a',
      pluginId: 'example',
      state: 'connected' as const,
      enabled: true,
      enabledProjectIds: ['*'],
      configuredFields: ['token'],
      updatedAt: 1,
    };
    usePluginStore.setState({
      connectionsByAccount: { 'account-a': { example: connection } },
    });
    const contract = getPluginRuntimeContract('account-a', manifest);

    expect(validatePluginRuntimeContract(contract)).toEqual([]);
    expect(contract).toMatchObject({
      health: { state: 'healthy' },
      actions: ['connect', 'test', 'disconnect'],
      auth: { requiredScopes: ['repository:read'] },
      permissions: [{ capability: 'repo.read', access: 'read' }],
    });
    expect(getPluginRuntimeContract('account-b', manifest).health.state).toBe('not-connected');
    expect(getPluginRuntimeContract('', manifest).health.state).toBe('not-connected');
  });
});
