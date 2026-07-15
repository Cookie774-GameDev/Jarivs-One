import { describe, expect, it } from 'vitest';
import { terminalRestartDecision } from './terminalRestartPolicy';

describe('terminalRestartDecision', () => {
  it.each([
    undefined,
    null,
    'powershell.exe',
    'pwsh',
    'cmd.exe',
    'bash',
    '/bin/zsh',
    'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
    'fish',
    'nu.exe',
  ])('automatically restores the safe shell %s', (command) => {
    expect(terminalRestartDecision(command)).toEqual({
      kind: 'safe-shell',
      spawnCommand: command ?? undefined,
    });
  });

  it.each([
    'opencode',
    'claude',
    'npm run dev',
    'python worker.py',
    'deploy.ps1',
    'pwsh -NoProfile',
    'unknown-tool',
  ])('defers the side-effecting or unknown command %s', (command) => {
    expect(terminalRestartDecision(command)).toEqual({
      kind: 'confirm',
      spawnCommand: undefined,
      deferredCommand: command,
    });
  });

  it('always defers startup commands even when the pane command is a safe shell', () => {
    expect(terminalRestartDecision('pwsh.exe', 'npm run dev')).toEqual({
      kind: 'confirm',
      spawnCommand: 'pwsh.exe',
      deferredCommand: 'npm run dev',
    });
  });

  it('keeps only the first printable line of a deferred command', () => {
    expect(terminalRestartDecision('pwsh', 'echo safe\rremove-item dangerous')).toEqual({
      kind: 'confirm',
      spawnCommand: 'pwsh',
      deferredCommand: 'echo safe',
    });
  });
});
