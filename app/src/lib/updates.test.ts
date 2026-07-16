import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  flush: vi.fn(),
  relaunch: vi.fn(),
}));

vi.mock('@/lib/utils', () => ({ isTauri: true }));
vi.mock('@/lib/persistence/workspaceFlush', () => ({
  flushWorkspacePersistence: mocks.flush,
}));
vi.mock('@tauri-apps/plugin-updater', () => ({ check: mocks.check }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: mocks.relaunch }));

import { checkForAppUpdate } from './updates';

describe('checkForAppUpdate persistence gates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.relaunch.mockResolvedValue(undefined);
  });

  it('awaits persistence before install and again before relaunch', async () => {
    let releaseInstallFlush: (() => void) | undefined;
    let releaseRelaunchFlush: (() => void) | undefined;
    const downloadAndInstall = vi.fn(async (onEvent: (event: { event: string }) => void) => {
      onEvent({ event: 'Finished' });
    });
    mocks.check.mockResolvedValue({
      version: '9.9.9',
      body: 'synthetic update',
      downloadAndInstall,
    });
    mocks.flush
      .mockImplementationOnce(
        () => new Promise((resolve) => {
          releaseInstallFlush = () => resolve({ completed: 1, failed: 0, timedOut: false });
        }),
      )
      .mockImplementationOnce(
        () => new Promise((resolve) => {
          releaseRelaunchFlush = () => resolve({ completed: 1, failed: 0, timedOut: false });
        }),
      );

    const pending = checkForAppUpdate({ install: true });
    await vi.waitFor(() => expect(mocks.flush).toHaveBeenCalledWith('pre-update-install'));
    expect(downloadAndInstall).not.toHaveBeenCalled();

    releaseInstallFlush?.();
    await vi.waitFor(() => expect(downloadAndInstall).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(mocks.flush).toHaveBeenCalledWith('pre-update-relaunch'));
    expect(mocks.relaunch).not.toHaveBeenCalled();

    releaseRelaunchFlush?.();
    await expect(pending).resolves.toMatchObject({ available: true, installed: true });
    expect(mocks.relaunch).toHaveBeenCalledOnce();
  });
});
