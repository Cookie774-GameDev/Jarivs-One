import { isTauri } from '@/lib/utils';
import type { ExistingPluginCredentialLocator } from './credentialAuthorization';

export type { ExistingPluginCredentialLocator } from './credentialAuthorization';

export interface ExistingPluginCredentialAdapter {
  readExistingCredential(locator: ExistingPluginCredentialLocator): Promise<string | undefined>;
  writeExistingCredential(locator: ExistingPluginCredentialLocator, value: string): Promise<void>;
  deleteExistingCredential(locator: ExistingPluginCredentialLocator): Promise<void>;
}

type RawCredentialReader = (pluginId: string, fieldId: string) => Promise<string | undefined>;
type RawCredentialWriter = (pluginId: string, fieldId: string, value: string) => Promise<void>;
type RawCredentialDeleter = (pluginId: string, fieldId: string) => Promise<void>;

const browserSessionVault = new Map<string, string>();

function credentialKey(pluginId: string, fieldId: string): string {
  const clean = `${pluginId}-${fieldId}`.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  return `plugin-${clean}`;
}

async function invoke<T>(command: string, args: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke<T>(command, args);
}

async function writeRaw(pluginId: string, fieldId: string, value: string): Promise<void> {
  const key = credentialKey(pluginId, fieldId);
  const trimmed = value.trim();
  if (isTauri) {
    await invoke('credential_set', { provider: key, key: trimmed });
  } else if (trimmed) {
    browserSessionVault.set(key, trimmed);
  } else {
    browserSessionVault.delete(key);
  }
}

async function readRaw(pluginId: string, fieldId: string): Promise<string | undefined> {
  const key = credentialKey(pluginId, fieldId);
  if (isTauri) {
    const value = await invoke<string | null>('credential_get', { provider: key });
    return value?.trim() || undefined;
  }
  return browserSessionVault.get(key);
}

async function deleteRaw(pluginId: string, fieldId: string): Promise<void> {
  const key = credentialKey(pluginId, fieldId);
  if (isTauri) {
    await invoke('credential_delete', { provider: key });
  } else {
    browserSessionVault.delete(key);
  }
}

function assertLocator(locator: ExistingPluginCredentialLocator): void {
  if (
    !locator.pluginId ||
    locator.pluginId.trim() !== locator.pluginId ||
    !locator.fieldId ||
    locator.fieldId.trim() !== locator.fieldId
  ) {
    throw new Error('Credential locator must contain exact nonblank IDs.');
  }
}

/** @internal Imported only by trusted security composition and focused tests. */
export function createExistingPluginCredentialAdapter(
  input: {
    readRaw?: RawCredentialReader;
    writeRaw?: RawCredentialWriter;
    deleteRaw?: RawCredentialDeleter;
  } = {},
): ExistingPluginCredentialAdapter {
  const read = input.readRaw ?? readRaw;
  const write = input.writeRaw ?? writeRaw;
  const remove = input.deleteRaw ?? deleteRaw;
  return Object.freeze({
    async readExistingCredential(locator: ExistingPluginCredentialLocator) {
      assertLocator(locator);
      return await read(locator.pluginId, locator.fieldId);
    },
    async writeExistingCredential(locator: ExistingPluginCredentialLocator, value: string) {
      assertLocator(locator);
      await write(locator.pluginId, locator.fieldId, value);
    },
    async deleteExistingCredential(locator: ExistingPluginCredentialLocator) {
      assertLocator(locator);
      await remove(locator.pluginId, locator.fieldId);
    },
  });
}
