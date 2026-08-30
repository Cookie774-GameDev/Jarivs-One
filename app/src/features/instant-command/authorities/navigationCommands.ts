import { useFullscreenStore } from '@/features/fullscreen/fullscreenStore';
import { APP_ROUTES, type Route } from '@/features/navigation/routeSchema';
import { isSettingsTab, type SettingsTab } from '@/features/settings/settingsPrefetch';
import { rememberSettingsTab } from '@/features/settings/settingsTabMemory';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';
import type { InstantResult } from '../types';

export type NavigationCommandRequest = Readonly<{
  id: string;
  slots: Readonly<Record<string, unknown>>;
}>;

export type NavigationAuthorityPort = Readonly<{
  openRoute: (route: Route) => void;
  hasSelectedAgent: () => boolean;
  hasSelectedProject: () => boolean;
  goBack: () => void;
  goForward: () => void;
  openSettings: (section?: SettingsTab) => void;
  closeSettings: () => void;
  openPalette: () => void;
  openLauncher: () => void;
  setFullscreen: (enabled: boolean) => Promise<boolean>;
}>;

const ROUTES = new Set<string>(APP_ROUTES);

const defaultPort: NavigationAuthorityPort = {
  openRoute: (route) => useUIStore.getState().setRoute(route),
  hasSelectedAgent: () => Boolean(useUIStore.getState().activeAgentId),
  hasSelectedProject: () => Boolean(useAuthStore.getState().projectId),
  goBack: () => window.history.back(),
  goForward: () => window.history.forward(),
  openSettings: (section) => {
    const state = useUIStore.getState();
    const wasOpen = state.settingsOpen;
    if (section) rememberSettingsTab(section);
    state.setSettingsOpen(true);
    if (section && wasOpen) {
      window.dispatchEvent(new CustomEvent('jarvis:settings:tab', { detail: { tab: section } }));
    }
  },
  closeSettings: () => useUIStore.getState().setSettingsOpen(false),
  openPalette: () => useUIStore.getState().setPaletteOpen(true),
  openLauncher: () => useUIStore.getState().setLauncherOpen(true),
  setFullscreen: (enabled) => useFullscreenStore.getState().requestSystemActive(enabled),
};

function success(message: string): InstantResult {
  return { ok: true, code: 'opened', message };
}

function invalid(message: string, code: 'target_missing' | 'queue_failed' = 'queue_failed') {
  return { ok: false as const, code, message };
}

export async function executeNavigationCommand(
  request: NavigationCommandRequest,
  port: NavigationAuthorityPort = defaultPort,
  signal?: AbortSignal,
): Promise<InstantResult> {
  if (signal?.aborted) return invalid('The instant command deadline elapsed.');

  if (request.id === 'page.open') {
    const route = request.slots.route;
    if (typeof route !== 'string' || !ROUTES.has(route)) return invalid('Unknown page target.');
    if (route === 'agent-detail' && !port.hasSelectedAgent()) {
      return invalid('Select one agent before opening agent details.', 'target_missing');
    }
    if (route === 'project-detail' && !port.hasSelectedProject()) {
      return invalid('Select one project before opening project details.', 'target_missing');
    }
    port.openRoute(route as Route);
    return success(`Opened ${route}.`);
  }
  if (request.id === 'page.back') {
    port.goBack();
    return success('Went back.');
  }
  if (request.id === 'page.forward') {
    port.goForward();
    return success('Went forward.');
  }
  if (request.id === 'page.home') {
    port.openRoute('chat');
    return success('Opened home.');
  }
  if (request.id === 'settings.open') {
    port.openSettings();
    return success('Opened Settings.');
  }
  if (request.id === 'settings.close') {
    port.closeSettings();
    return success('Closed Settings.');
  }
  if (request.id === 'settings.section.open') {
    const section = request.slots.section;
    if (typeof section !== 'string' || !isSettingsTab(section)) {
      return invalid('Unknown Settings section.');
    }
    port.openSettings(section);
    return success(`Opened Settings → ${section}.`);
  }
  if (request.id === 'connections.open') {
    port.openSettings('providers');
    return success('Opened provider connections.');
  }
  if (request.id === 'palette.open') {
    port.openPalette();
    return success('Opened command palette.');
  }
  if (request.id === 'launcher.open') {
    port.openLauncher();
    return success('Opened quick launcher.');
  }
  if (request.id === 'fullscreen.set') {
    const enabled = request.slots.enabled;
    if (typeof enabled !== 'boolean') return invalid('Say fullscreen on or off.');
    const observed = await port.setFullscreen(enabled);
    if (signal?.aborted) return invalid('The instant command deadline elapsed.');
    if (observed !== enabled) {
      return invalid(`Fullscreen remained ${observed ? 'on' : 'off'}.`);
    }
    return success(`Fullscreen ${observed ? 'on' : 'off'}.`);
  }
  return invalid('That navigation command is not implemented.');
}
