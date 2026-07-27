import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  installTerminalCli,
  readTerminalCliInstallStatus,
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
      commandNames: ['vibespace', 'vs'],
    });
    await expect(readTerminalCliInstallStatus()).resolves.toEqual({
      installed: false,
      binDir: 'C:\\Users\\Test\\.jarvis\\bin',
      commandNames: ['vibespace', 'vs'],
    });
    expect(invoke).toHaveBeenCalledWith('terminal_cli_install_status');

    vi.mocked(invoke).mockResolvedValueOnce({
      installed: true,
      binDir: 'C:\\Users\\Test\\.jarvis\\bin',
      commandNames: ['vibespace', 'vs'],
    });
    await expect(installTerminalCli()).resolves.toMatchObject({ installed: true });
    expect(invoke).toHaveBeenCalledWith('terminal_cli_install');

    vi.mocked(invoke).mockResolvedValueOnce({
      installed: false,
      binDir: 'C:\\Users\\Test\\.jarvis\\bin',
      commandNames: ['vibespace', 'vs'],
    });
    await expect(uninstallTerminalCli()).resolves.toMatchObject({ installed: false });
    expect(invoke).toHaveBeenCalledWith('terminal_cli_uninstall');
  });

  it('fails closed on malformed native data', async () => {
    vi.mocked(invoke).mockResolvedValue({
      installed: true,
      binDir: 'C:\\Users\\Test\\.jarvis\\bin',
      commandNames: ['vibespace', 'vs'],
      token: 'must-not-cross-the-bridge',
    });
    await expect(readTerminalCliInstallStatus()).rejects.toThrow(/install status/i);
  });
});
