import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  installTerminalShellIntegration,
  installTerminalCli,
  readTerminalShellIntegrationStatus,
  readTerminalCliInstallStatus,
  uninstallTerminalShellIntegration,
  uninstallTerminalCli,
} from './terminalCliInstall';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('terminal CLI install controls', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it('uses the dedicated reversible native commands and validates their closed response', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      installed: false,
      binDir: 'C:\\Users\\Test\\.jarvis\\bin',
      commandNames: ['vibespace', 'vs', 'vibespace-context'],
    });
    await expect(readTerminalCliInstallStatus()).resolves.toEqual({
      installed: false,
      binDir: 'C:\\Users\\Test\\.jarvis\\bin',
      commandNames: ['vibespace', 'vs', 'vibespace-context'],
    });
    expect(invoke).toHaveBeenCalledWith('terminal_cli_install_status');

    vi.mocked(invoke).mockResolvedValueOnce({
      installed: true,
      binDir: 'C:\\Users\\Test\\.jarvis\\bin',
      commandNames: ['vibespace', 'vs', 'vibespace-context'],
    });
    await expect(installTerminalCli()).resolves.toMatchObject({ installed: true });
    expect(invoke).toHaveBeenCalledWith('terminal_cli_install');

    vi.mocked(invoke).mockResolvedValueOnce({
      installed: false,
      binDir: 'C:\\Users\\Test\\.jarvis\\bin',
      commandNames: ['vibespace', 'vs', 'vibespace-context'],
    });
    await expect(uninstallTerminalCli()).resolves.toMatchObject({ installed: false });
    expect(invoke).toHaveBeenCalledWith('terminal_cli_uninstall');
  });

  it('fails closed on malformed native data', async () => {
    vi.mocked(invoke).mockResolvedValue({
      installed: true,
      binDir: 'C:\\Users\\Test\\.jarvis\\bin',
      commandNames: ['vibespace', 'vs', 'vibespace-context'],
      token: 'must-not-cross-the-bridge',
    });
    await expect(readTerminalCliInstallStatus()).rejects.toThrow(/install status/i);
  });

  it('uses separate opt-in shell integration commands with a closed profile inventory', async () => {
    const installed = {
      available: true,
      installed: true,
      profiles: [
        {
          shell: 'powershell',
          path: 'C:\\Users\\Test\\Documents\\PowerShell\\Microsoft.PowerShell_profile.ps1',
          installed: true,
        },
      ],
    };
    const removed = {
      ...installed,
      installed: false,
      profiles: installed.profiles.map((profile) => ({ ...profile, installed: false })),
    };
    vi.mocked(invoke)
      .mockResolvedValueOnce(removed)
      .mockResolvedValueOnce(installed)
      .mockResolvedValueOnce(removed);

    await expect(readTerminalShellIntegrationStatus()).resolves.toMatchObject({
      available: true,
      installed: false,
    });
    expect(invoke).toHaveBeenLastCalledWith('terminal_shell_integration_status');
    await expect(installTerminalShellIntegration()).resolves.toEqual(installed);
    expect(invoke).toHaveBeenLastCalledWith('terminal_shell_integration_install');
    await expect(uninstallTerminalShellIntegration()).resolves.toMatchObject({
      installed: false,
    });
    expect(invoke).toHaveBeenLastCalledWith('terminal_shell_integration_uninstall');
  });

  it('rejects shell integration profile data containing hidden fields or unsafe paths', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      available: true,
      installed: true,
      profiles: [
        {
          shell: 'powershell',
          path: 'C:\\Users\\Test\\profile.ps1',
          installed: true,
          nonce: 'must-not-cross',
        },
      ],
    });
    await expect(readTerminalShellIntegrationStatus()).rejects.toThrow(/shell integration status/i);

    vi.mocked(invoke).mockResolvedValueOnce({
      available: true,
      installed: true,
      profiles: [{ shell: 'powershell', path: 'unsafe\npath', installed: true }],
    });
    await expect(readTerminalShellIntegrationStatus()).rejects.toThrow(/shell integration status/i);
  });
});
