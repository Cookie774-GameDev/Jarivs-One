import { invoke } from '@tauri-apps/api/core';

export type TerminalCliInstallStatus = Readonly<{
  installed: boolean;
  binDir: string;
  commandNames: readonly ['vibespace', 'vs', 'vibespace-context'];
}>;

export type TerminalShellKind = 'powershell' | 'bash' | 'zsh' | 'fish';

export type TerminalShellProfileStatus = Readonly<{
  shell: TerminalShellKind;
  path: string;
  installed: boolean;
}>;

export type TerminalShellIntegrationStatus = Readonly<{
  available: boolean;
  installed: boolean;
  profiles: readonly TerminalShellProfileStatus[];
}>;

const SHELL_KINDS = new Set<TerminalShellKind>(['powershell', 'bash', 'zsh', 'fish']);
const UNSAFE_NATIVE_TEXT =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u;

function isClosedDataObject(value: unknown, expectedKeys: readonly string[]): value is object {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  const keys = Reflect.ownKeys(value);
  return (
    (prototype === Object.prototype || prototype === null) &&
    keys.length === expectedKeys.length &&
    keys.every((key) => typeof key === 'string' && expectedKeys.includes(key)) &&
    expectedKeys.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor !== undefined && 'value' in descriptor;
    })
  );
}

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
    commandNames.value.length !== 3 ||
    commandNames.value[0] !== 'vibespace' ||
    commandNames.value[1] !== 'vs' ||
    commandNames.value[2] !== 'vibespace-context'
  ) {
    throw new Error('Invalid terminal CLI install status');
  }
  return Object.freeze({
    installed: installed.value,
    binDir: binDir.value,
    commandNames: Object.freeze(['vibespace', 'vs', 'vibespace-context'] as const),
  });
}

function parseShellIntegrationStatus(value: unknown): TerminalShellIntegrationStatus {
  if (!isClosedDataObject(value, ['available', 'installed', 'profiles'])) {
    throw new Error('Invalid terminal shell integration status');
  }
  const available = Reflect.get(value, 'available') as unknown;
  const installed = Reflect.get(value, 'installed') as unknown;
  const rawProfiles = Reflect.get(value, 'profiles') as unknown;
  if (
    typeof available !== 'boolean' ||
    typeof installed !== 'boolean' ||
    !Array.isArray(rawProfiles) ||
    rawProfiles.length > 8
  ) {
    throw new Error('Invalid terminal shell integration status');
  }

  const paths = new Set<string>();
  const profiles: TerminalShellProfileStatus[] = [];
  for (const rawProfile of rawProfiles) {
    if (!isClosedDataObject(rawProfile, ['shell', 'path', 'installed'])) {
      throw new Error('Invalid terminal shell integration status');
    }
    const shell = Reflect.get(rawProfile, 'shell') as unknown;
    const path = Reflect.get(rawProfile, 'path') as unknown;
    const profileInstalled = Reflect.get(rawProfile, 'installed') as unknown;
    if (
      typeof shell !== 'string' ||
      !SHELL_KINDS.has(shell as TerminalShellKind) ||
      typeof path !== 'string' ||
      path.length < 1 ||
      path.length > 2_048 ||
      UNSAFE_NATIVE_TEXT.test(path) ||
      typeof profileInstalled !== 'boolean' ||
      paths.has(path)
    ) {
      throw new Error('Invalid terminal shell integration status');
    }
    paths.add(path);
    profiles.push(
      Object.freeze({
        shell: shell as TerminalShellKind,
        path,
        installed: profileInstalled,
      }),
    );
  }

  const expectedAvailable = profiles.length > 0;
  const expectedInstalled = expectedAvailable && profiles.every((profile) => profile.installed);
  if (available !== expectedAvailable || installed !== expectedInstalled) {
    throw new Error('Invalid terminal shell integration status');
  }
  return Object.freeze({
    available,
    installed,
    profiles: Object.freeze(profiles),
  });
}

async function invokeStatus(command: string): Promise<TerminalCliInstallStatus> {
  return parseInstallStatus(await invoke(command));
}

async function invokeShellIntegrationStatus(
  command: string,
): Promise<TerminalShellIntegrationStatus> {
  return parseShellIntegrationStatus(await invoke(command));
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

export function readTerminalShellIntegrationStatus(): Promise<TerminalShellIntegrationStatus> {
  return invokeShellIntegrationStatus('terminal_shell_integration_status');
}

export function installTerminalShellIntegration(): Promise<TerminalShellIntegrationStatus> {
  return invokeShellIntegrationStatus('terminal_shell_integration_install');
}

export function uninstallTerminalShellIntegration(): Promise<TerminalShellIntegrationStatus> {
  return invokeShellIntegrationStatus('terminal_shell_integration_uninstall');
}
