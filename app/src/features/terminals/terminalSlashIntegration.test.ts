import { describe, expect, it } from 'vitest';
import {
  createTerminalSlashIntegration,
  isSshSessionCommand,
  isSupportedLocalShellCommand,
  openTerminalVibespacePalette,
  terminalPaletteRequestTargetsPane,
  TERMINAL_VIBESPACE_PALETTE_EVENT,
} from './terminalSlashIntegration';

const safeRuntime = {
  draftEmpty: true,
  interactiveProgram: false,
  passwordPrompt: false,
  sshSession: false,
} as const;

describe('terminal safe slash integration', () => {
  it('recognizes only closed, local shell executables', () => {
    expect(isSupportedLocalShellCommand('powershell.exe')).toBe(true);
    expect(
      isSupportedLocalShellCommand('"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -NoLogo'),
    ).toBe(true);
    expect(isSupportedLocalShellCommand('/bin/bash -l')).toBe(true);
    expect(isSupportedLocalShellCommand('wsl.exe --distribution Ubuntu')).toBe(true);
    expect(isSupportedLocalShellCommand('ssh user@example.com')).toBe(false);
    expect(isSupportedLocalShellCommand('claude')).toBe(false);
    expect(isSupportedLocalShellCommand('powershell.exe && ssh host')).toBe(false);
  });

  it('recognizes direct SSH session launches without treating arbitrary text as remote state', () => {
    expect(isSshSessionCommand('ssh user@example.com')).toBe(true);
    expect(isSshSessionCommand('SSH.EXE -p 22 user@example.com')).toBe(true);
    expect(isSshSessionCommand('"C:\\Windows\\System32\\OpenSSH\\ssh.exe" user@example.com')).toBe(
      true,
    );
    expect(isSshSessionCommand('echo ssh user@example.com')).toBe(false);
    expect(isSshSessionCommand('ssh-keygen')).toBe(false);
  });

  it('forwards input unchanged until a complete verified prompt marker arrives', () => {
    const integration = createTerminalSlashIntegration({ command: 'powershell.exe' });

    expect(integration.pushInput('/vibespace\r', safeRuntime)).toMatchObject({
      forwardData: '/vibespace\r',
      openPalette: false,
    });
    integration.observeOutput('\u001b]133;');
    expect(integration.pushInput('/', safeRuntime).forwardData).toBe('/');
  });

  it('opens only for the exact command at a verified empty local prompt', () => {
    const integration = createTerminalSlashIntegration({ command: 'pwsh.exe -NoLogo' });
    integration.observeOutput('\u001b]133;B\u0007');

    for (const character of '/vibespace') {
      expect(integration.pushInput(character, safeRuntime).forwardData).toBe('');
    }
    expect(integration.pushInput('\r', safeRuntime)).toMatchObject({
      forwardData: '',
      openPalette: true,
    });
  });

  it('does not intercept after existing draft text or inside guarded sessions', () => {
    const withDraft = createTerminalSlashIntegration({ command: 'bash' });
    withDraft.observeOutput('\u001b]133;B\u0007');
    expect(
      withDraft.pushInput('/', {
        ...safeRuntime,
        draftEmpty: false,
      }).forwardData,
    ).toBe('/');

    for (const guard of ['interactiveProgram', 'passwordPrompt', 'sshSession'] as const) {
      const guarded = createTerminalSlashIntegration({ command: 'zsh' });
      guarded.observeOutput('\u001b]133;B\u0007');
      expect(
        guarded.pushInput('/', {
          ...safeRuntime,
          [guard]: true,
        }).forwardData,
      ).toBe('/');
    }
  });

  it('flushes held bytes unchanged if the terminal becomes unsafe mid-trigger', () => {
    const integration = createTerminalSlashIntegration({ command: 'fish' });
    integration.observeOutput('\u001b]133;B\u0007');
    expect(integration.pushInput('/', safeRuntime).forwardData).toBe('');
    expect(
      integration.pushInput('v', {
        ...safeRuntime,
        interactiveProgram: true,
      }),
    ).toMatchObject({
      forwardData: '/v',
      openPalette: false,
      heldText: '',
    });
  });

  it('never opens for an unknown command even when it emits OSC 133', () => {
    const integration = createTerminalSlashIntegration({ command: 'custom-shell-wrapper' });
    integration.observeOutput('\u001b]133;B\u0007');

    expect(integration.pushInput('/vibespace\r', safeRuntime)).toMatchObject({
      forwardData: '/vibespace\r',
      openPalette: false,
    });
    expect(integration.snapshot().localShell).toBe(false);
  });

  it('latches explicit SSH state before later remote prompt markers arrive', () => {
    const integration = createTerminalSlashIntegration({ command: 'bash' });
    integration.observeOutput('\u001b]133;B\u0007');
    expect(
      integration.updateRuntime({
        ...safeRuntime,
        sshSession: true,
      }),
    ).toMatchObject({
      atPrompt: false,
      sshSession: true,
    });
    expect(integration.observeOutput('\u001b]133;B\u0007')).toMatchObject({
      atPrompt: false,
      sshSession: true,
    });
  });

  it('routes the toolbar fallback to one exact pane without PTY data', () => {
    const received: unknown[] = [];
    const listener = (event: Event) => received.push((event as CustomEvent).detail);
    window.addEventListener(TERMINAL_VIBESPACE_PALETTE_EVENT, listener);
    try {
      expect(openTerminalVibespacePalette()).toBe(false);
      expect(received).toEqual([]);
      expect(openTerminalVibespacePalette('pane-1')).toBe(true);
      expect(received).toEqual([{ paneId: 'pane-1' }]);
    } finally {
      window.removeEventListener(TERMINAL_VIBESPACE_PALETTE_EVENT, listener);
    }
  });

  it('rejects unscoped, malformed, and cross-pane palette requests', () => {
    expect(
      terminalPaletteRequestTargetsPane(
        new CustomEvent(TERMINAL_VIBESPACE_PALETTE_EVENT),
        'pane-1',
      ),
    ).toBe(false);
    expect(
      terminalPaletteRequestTargetsPane(
        new CustomEvent(TERMINAL_VIBESPACE_PALETTE_EVENT, {
          detail: { paneId: 1 },
        }),
        'pane-1',
      ),
    ).toBe(false);
    expect(
      terminalPaletteRequestTargetsPane(
        new CustomEvent(TERMINAL_VIBESPACE_PALETTE_EVENT, {
          detail: { paneId: 'pane-2' },
        }),
        'pane-1',
      ),
    ).toBe(false);
    expect(
      terminalPaletteRequestTargetsPane(
        new CustomEvent(TERMINAL_VIBESPACE_PALETTE_EVENT, {
          detail: { paneId: 'pane-1' },
        }),
        'pane-1',
      ),
    ).toBe(true);
  });
});
