import { invoke } from '@tauri-apps/api/core';

export type TerminalCliInstallStatus = Readonly<{
  installed: boolean;
  binDir: string;
  commandNames: readonly ['vibespace', 'vs'];
}>;

function parseInstallStatus(value: unknown): TerminalCliInstallStatus {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid terminal CLI install status');
  }
  const prototype = Object.getPrototypeOf(value);
  const keys = Reflect.ownKeys(value);
  if (
    (prototype !== Object.prototype && prototype !== null) ||
    keys.length !== 3 ||
    keys.some(
      (key) => typeof key !== 'string' || !['installed', 'binDir', 'commandNames'].includes(key),
    )
  ) {
    throw new Error('Invalid terminal CLI install status');
  }
  const installed = Object.getOwnPropertyDescriptor(value, 'installed');
  const binDir = Object.getOwnPropertyDescriptor(value, 'binDir');
  const commandNames = Object.getOwnPropertyDescriptor(value, 'commandNames');
  if (
    !installed ||
    !('value' in installed) ||
    typeof installed.value !== 'boolean' ||
    !binDir ||
    !('value' in binDir) ||
    typeof binDir.value !== 'string' ||
    binDir.value.length < 1 ||
    binDir.value.length > 2_048 ||
    /[\u0000-\u001f\u007f]/u.test(binDir.value) ||
    !commandNames ||
    !('value' in commandNames) ||
    !Array.isArray(commandNames.value) ||
    commandNames.value.length !== 2 ||
    commandNames.value[0] !== 'vibespace' ||
    commandNames.value[1] !== 'vs'
  ) {
    throw new Error('Invalid terminal CLI install status');
  }
  return Object.freeze({
    installed: installed.value,
    binDir: binDir.value,
    commandNames: Object.freeze(['vibespace', 'vs'] as const),
  });
}

async function invokeStatus(command: string): Promise<TerminalCliInstallStatus> {
  return parseInstallStatus(await invoke(command));
}

export function readTerminalCliInstallStatus(): Promise<TerminalCliInstallStatus> {
  return invokeStatus('terminal_cli_install_status');
}

export function installTerminalCli(): Promise<TerminalCliInstallStatus> {
  return invokeStatus('terminal_cli_install');
}

export function uninstallTerminalCli(): Promise<TerminalCliInstallStatus> {
  return invokeStatus('terminal_cli_uninstall');
}
