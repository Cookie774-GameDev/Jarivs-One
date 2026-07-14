import { describe, expect, it, vi } from 'vitest';

import {
  disconnectPlugin,
  getPluginRuntimeContract,
  validatePluginRuntimeContract,
} from './contract';
import type { PluginManifest } from './types';

const manifest: PluginManifest = {
  id: 'example',
  name: 'Example',
  description: 'Example connector',
  category: 'developer',
  provider: 'Example Inc.',
  authType: 'token',
  fields: [{ id: 'token', label: 'Token', secret: true, required: true }],
  status: 'implemented',
  help: 'Create a scoped token.',
  tools: [{ name: 'repo.read', description: 'Read repo', readOnly: true }],
  tags: ['code'],
  setupSteps: ['Create token', 'Test connection'],
  supportedFeatures: ['repositories'],
};

describe('plugin runtime contract', () => {
  it('normalizes manifest lifecycle, health, permissions, and actions', () => {
    const contract = getPluginRuntimeContract(manifest, {
      pluginId: 'example',
      state: 'connected',
      enabled: true,
      enabledProjectIds: ['*'],
      configuredFields: ['token'],
      updatedAt: 1,
    });

    expect(validatePluginRuntimeContract(contract)).toEqual([]);
    expect(contract).toMatchObject({
      id: 'example',
      version: 1,
      auth: { type: 'token', secretStorage: 'os-keychain' },
      health: { state: 'healthy' },
      actions: ['connect', 'test', 'invoke', 'disconnect'],
      permissions: [{ capability: 'repo.read', access: 'read' }],
    });
  });

  it('disconnects metadata and every credential field', async () => {
    const deleteCredential = vi.fn(async () => undefined);
    const removeConnection = vi.fn();

    await disconnectPlugin(manifest, { deleteCredential, removeConnection });

    expect(deleteCredential).toHaveBeenCalledWith('example', 'token');
    expect(removeConnection).toHaveBeenCalledWith('example');
  });
});
