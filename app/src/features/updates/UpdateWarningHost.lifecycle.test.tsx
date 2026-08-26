import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdateWarningHost } from './UpdateWarningHost';

const mocks = vi.hoisted(() => ({
  autoUpdate: true,
  check: vi.fn(),
  prepare: vi.fn(),
  installPrepared: vi.fn(),
  playUiSound: vi.fn(),
  listeners: new Map<string, () => void>(),
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/lib/updates', () => ({
  checkForAppUpdate: mocks.check,
  getAutoUpdateEnabled: () => mocks.autoUpdate,
  prepareAppUpdate: mocks.prepare,
  installPreparedAppUpdate: mocks.installPrepared,
  normalizeUpdateNotes: (notes: string | undefined, version: string) =>
    notes?.trim() || `Release notes for VibeSpace v${version} are available on the release page.`,
}));

vi.mock('@/lib/sfx/playUiSound', () => ({ playUiSound: mocks.playUiSound }));
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }));
vi.mock('@/lib/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/utils')>()),
  isTauri: true,
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (event: string, callback: () => void) => {
    mocks.listeners.set(event, callback);
    return () => mocks.listeners.delete(event);
  }),
}));

describe('UpdateWarningHost deferred lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('DEV', false);
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.listeners.clear();
    mocks.autoUpdate = true;
    mocks.check.mockResolvedValue({
      available: true,
      installed: false,
      version: '2.4.0',
      notes: 'New terminal recovery.\nSecurity hardening.',
      notesUrl: 'https://example.test/releases/2.4.0',
    });
    mocks.prepare.mockResolvedValue({
      available: true,
      prepared: true,
      installed: false,
      version: '2.4.0',
    });
    mocks.installPrepared.mockResolvedValue({
      available: true,
      prepared: true,
      installed: true,
      version: '2.4.0',
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  async function detectUpdate() {
    render(<UpdateWarningHost />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
  }

  it('shows every user the version and release notes and plays one notification sound', async () => {
    mocks.autoUpdate = false;
    await detectUpdate();

    expect(mocks.check).toHaveBeenCalledWith({ install: false });
    expect(screen.getByText('VibeSpace v2.4.0 is available')).not.toBeNull();
    expect(screen.getByText(/New terminal recovery/)).not.toBeNull();
    expect(mocks.playUiSound).toHaveBeenCalledWith('notification_complete');
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it('stages automatic updates once and installs only after the next main-window close event', async () => {
    await detectUpdate();
    await act(async () => undefined);

    expect(mocks.prepare).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: '2.4.0' }),
    );
    expect(mocks.installPrepared).not.toHaveBeenCalled();

    await act(async () => {
      mocks.listeners.get('jarvis:before-hide')?.();
      await Promise.resolve();
    });
    expect(mocks.installPrepared).toHaveBeenCalledWith({ relaunch: false });
  });

  it('uses the already-requested persistence flush when the tray exits the app', async () => {
    await detectUpdate();
    await act(async () => undefined);

    await act(async () => {
      mocks.listeners.get('jarvis:persist-now')?.();
      await Promise.resolve();
    });
    expect(mocks.installPrepared).toHaveBeenCalledWith({
      relaunch: false,
      persistenceAlreadyRequested: true,
    });
  });

  it('does not replay the notification sound for the same persisted version', async () => {
    window.localStorage.setItem('jarvis-update-notified-version', '2.4.0');
    await detectUpdate();
    expect(mocks.playUiSound).not.toHaveBeenCalled();
  });
});
