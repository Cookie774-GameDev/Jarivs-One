import { describe, expect, it, vi } from 'vitest';
import * as credentialModule from './credentials';
import { createExistingPluginCredentialAdapter } from './credentials';

describe('existing plugin credential adapter', () => {
  it('exposes only the closed adapter and never exports raw credential helpers', () => {
    expect(Object.keys(credentialModule).sort()).toEqual(['createExistingPluginCredentialAdapter']);
    expect(credentialModule).not.toHaveProperty('credentialKey');
    expect(credentialModule).not.toHaveProperty('setPluginCredential');
    expect(credentialModule).not.toHaveProperty('getPluginCredential');
    expect(credentialModule).not.toHaveProperty('deletePluginCredential');
  });

  it('delegates exact manifest-owned locators through its narrow methods', async () => {
    const readRaw = vi.fn(async () => 'stored-value');
    const writeRaw = vi.fn(async () => undefined);
    const deleteRaw = vi.fn(async () => undefined);
    const adapter = createExistingPluginCredentialAdapter({ readRaw, writeRaw, deleteRaw });
    const locator = { pluginId: 'github', fieldId: 'token' };

    await expect(adapter.readExistingCredential(locator)).resolves.toBe('stored-value');
    await adapter.writeExistingCredential(locator, 'new-value');
    await adapter.deleteExistingCredential(locator);

    expect(readRaw).toHaveBeenCalledWith('github', 'token');
    expect(writeRaw).toHaveBeenCalledWith('github', 'token', 'new-value');
    expect(deleteRaw).toHaveBeenCalledWith('github', 'token');
  });

  it.each([
    { pluginId: '', fieldId: 'token' },
    { pluginId: ' github', fieldId: 'token' },
    { pluginId: 'github', fieldId: '' },
    { pluginId: 'github', fieldId: 'token ' },
  ])('rejects a non-exact locator before invoking a raw helper: %o', async (locator) => {
    const readRaw = vi.fn(async () => undefined);
    const adapter = createExistingPluginCredentialAdapter({ readRaw });

    await expect(adapter.readExistingCredential(locator)).rejects.toThrow('locator');
    expect(readRaw).not.toHaveBeenCalled();
  });
});
