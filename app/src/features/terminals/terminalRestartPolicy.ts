import { sanitizePersistedDraft } from './terminalContentSanitizer';

export type TerminalRestartDecision =
  | { kind: 'safe-shell'; spawnCommand: string | undefined }
  | {
      kind: 'confirm';
      spawnCommand: string | undefined;
      deferredCommand: string;
    };

const SAFE_SHELLS = new Set([
  'powershell',
  'powershell.exe',
  'pwsh',
  'pwsh.exe',
  'cmd',
  'cmd.exe',
  'bash',
  'bash.exe',
  'sh',
  'sh.exe',
  'zsh',
  'zsh.exe',
  'fish',
  'fish.exe',
  'nu',
  'nu.exe',
]);

function firstPrintableLine(command: string | null | undefined): string {
  if (!command) return '';
  const [firstLine = ''] = command.split(/[\r\n]/, 1);
  return sanitizePersistedDraft(firstLine).trim();
}

function shellCommand(command: string | null | undefined): string | undefined {
  const printable = firstPrintableLine(command);
  if (!printable) return undefined;
  const unquoted = printable.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  const basename = unquoted.split(/[\\/]/).at(-1)?.toLowerCase() ?? '';
  return SAFE_SHELLS.has(basename) ? printable : undefined;
}

export function terminalRestartDecision(
  command?: string | null,
  startupCommand?: string | null,
): TerminalRestartDecision {
  const safeShell = shellCommand(command);
  const deferredStartup = firstPrintableLine(startupCommand);
  if (deferredStartup) {
    return {
      kind: 'confirm',
      spawnCommand: safeShell,
      deferredCommand: deferredStartup,
    };
  }

  if (command == null || command.trim() === '') {
    return { kind: 'safe-shell', spawnCommand: undefined };
  }
  if (safeShell) {
    return { kind: 'safe-shell', spawnCommand: command };
  }

  return {
    kind: 'confirm',
    spawnCommand: undefined,
    deferredCommand: firstPrintableLine(command),
  };
}
