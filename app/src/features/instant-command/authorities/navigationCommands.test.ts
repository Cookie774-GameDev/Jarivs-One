import { describe, expect, it, vi } from 'vitest';
import { executeNavigationCommand, type NavigationAuthorityPort } from './navigationCommands';

function authority() {
  const port: NavigationAuthorityPort = {
    openRoute: vi.fn(),
    hasSelectedAgent: vi.fn(() => true),
    hasSelectedProject: vi.fn(() => true),
    goBack: vi.fn(),
    goForward: vi.fn(),
    openSettings: vi.fn(),
    closeSettings: vi.fn(),
    openPalette: vi.fn(),
    openLauncher: vi.fn(),
    setFullscreen: vi.fn(async (enabled: boolean) => enabled),
  };
  return port;
}

describe('executeNavigationCommand', () => {
  it('acknowledges a route before any lazy page chunk renders', async () => {
    const port = authority();
    await expect(
      executeNavigationCommand({ id: 'page.open', slots: { route: 'terminal' } }, port),
    ).resolves.toEqual({ ok: true, code: 'opened', message: 'Opened terminal.' });
    expect(port.openRoute).toHaveBeenCalledWith('terminal');
  });

  it('fails closed when a detail page has no unique selected entity', async () => {
    const port = authority();
    vi.mocked(port.hasSelectedAgent).mockReturnValue(false);
    await expect(
      executeNavigationCommand({ id: 'page.open', slots: { route: 'agent-detail' } }, port),
    ).resolves.toEqual({
      ok: false,
      code: 'target_missing',
      message: 'Select one agent before opening agent details.',
    });
    expect(port.openRoute).not.toHaveBeenCalled();
  });

  it('uses the typed settings section and shell overlay authorities', async () => {
    const port = authority();
    await expect(
      executeNavigationCommand({ id: 'settings.section.open', slots: { section: 'voice' } }, port),
    ).resolves.toMatchObject({ ok: true, code: 'opened' });
    expect(port.openSettings).toHaveBeenCalledWith('voice');

    await executeNavigationCommand({ id: 'palette.open', slots: {} }, port);
    await executeNavigationCommand({ id: 'launcher.open', slots: {} }, port);
    expect(port.openPalette).toHaveBeenCalledOnce();
    expect(port.openLauncher).toHaveBeenCalledOnce();
  });

  it('reports the canonical fullscreen state rather than the requested state', async () => {
    const port = authority();
    vi.mocked(port.setFullscreen).mockResolvedValue(false);
    await expect(
      executeNavigationCommand({ id: 'fullscreen.set', slots: { enabled: true } }, port),
    ).resolves.toEqual({
      ok: false,
      code: 'queue_failed',
      message: 'Fullscreen remained off.',
    });
  });

  it('routes /connect to the existing Providers UI without accepting credential text', async () => {
    const port = authority();
    await expect(
      executeNavigationCommand({ id: 'connections.open', slots: { section: 'providers' } }, port),
    ).resolves.toEqual({ ok: true, code: 'opened', message: 'Opened provider connections.' });
    expect(port.openSettings).toHaveBeenCalledWith('providers');
  });
});
