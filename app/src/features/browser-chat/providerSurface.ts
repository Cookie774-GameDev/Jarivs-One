import type { WebviewOptions } from '@tauri-apps/api/webview';

import { isTauri } from '@/lib/utils';
import { openExternal } from '@/lib/tauri';
import {
  BROWSER_CHAT_PROVIDERS,
  isBrowserChatProviderId,
  type BrowserChatProviderDefinition,
  type BrowserChatProviderId,
} from './providerRegistry';
import { CHATGPT_APPS_URL } from './mcpConnection';
import { normalizeProviderNavigation, type ProviderNavigationKind } from './providerNavigation';
import {
  isBrowserChatAccountProfileKey,
  type BrowserChatAccountProfileKey,
} from './providerProfileScope';

export interface ProviderSurfaceBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ManagedProviderSurface {
  readonly label: string;
  show(): Promise<void>;
  hide(): Promise<void>;
  navigate(url: string): Promise<void>;
  setFocus(): Promise<void>;
  setPosition(position: { x: number; y: number }): Promise<void>;
  setSize(size: { width: number; height: number }): Promise<void>;
}

export interface NativeProviderSurfaceNavigation {
  readonly providerId: string;
  readonly surfaceId: string;
  readonly accountProfileKey: string;
  readonly url: string;
  readonly timestamp: number;
  readonly kind: string;
}

export interface ProviderSurfaceNavigation {
  readonly providerId: BrowserChatProviderId;
  readonly surfaceId: string;
  readonly accountProfileKey: BrowserChatAccountProfileKey;
  readonly url: string;
  readonly timestamp: number;
  readonly kind: ProviderNavigationKind;
  readonly providerConversationKey?: string;
  readonly providerProjectKey?: string;
}

export interface ProviderSurfacePlatform {
  readonly desktop: boolean;
  getSurface(label: string): Promise<ManagedProviderSurface | null>;
  createSurface(
    label: string,
    options: WebviewOptions,
  ): ManagedProviderSurface | Promise<ManagedProviderSurface>;
  hideAllSurfaces?(): Promise<void>;
  openExternal(url: string): Promise<void>;
  subscribeHostGeometry?(listener: () => void): Promise<() => void>;
  subscribeNavigation?(
    listener: (navigation: NativeProviderSurfaceNavigation) => void,
  ): Promise<() => void>;
}

export interface ProviderSurfaceController {
  openManaged(
    provider: BrowserChatProviderDefinition,
    bounds: ProviderSurfaceBounds,
    navigationUrl?: string,
    accountProfileKey?: BrowserChatAccountProfileKey,
  ): Promise<
    | { kind: 'managed'; providerId: BrowserChatProviderId }
    | { kind: 'system_browser'; providerId: BrowserChatProviderId }
  >;
  openSystemBrowser(provider: BrowserChatProviderDefinition): Promise<void>;
  openExternalNavigation(provider: BrowserChatProviderDefinition, url: string): Promise<void>;
  openChatGptPlugins(): Promise<void>;
  hideAll(): Promise<void>;
  subscribeHostGeometry?(listener: () => void): Promise<() => void>;
  subscribeNavigation?(
    listener: (navigation: ProviderSurfaceNavigation) => void,
  ): Promise<() => void>;
}

export type NativeBrowserChatInvoke = (
  command: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

export function createNativeManagedProviderSurface(
  surfaceKey: string,
  invoke: NativeBrowserChatInvoke,
): ManagedProviderSurface {
  const separator = surfaceKey.lastIndexOf(':');
  const label = separator >= 0 ? surfaceKey.slice(0, separator) : '';
  const accountProfileKey = separator >= 0 ? surfaceKey.slice(separator + 1) : '';
  const provider = BROWSER_CHAT_PROVIDERS.find((candidate) => candidate.windowLabel === label);
  if (!provider || !isBrowserChatAccountProfileKey(accountProfileKey)) {
    throw new Error('Unsupported Browser Chat provider window label.');
  }
  let bounds: ProviderSurfaceBounds = {
    x: Number.NaN,
    y: Number.NaN,
    width: Number.NaN,
    height: Number.NaN,
  };
  let navigationUrl: string | undefined;

  return {
    label,
    async show() {
      assertBounds(bounds);
      await invoke('browser_chat_surface_open', {
        providerId: provider.id,
        bounds,
        accountProfileKey,
        ...(navigationUrl ? { navigationUrl } : {}),
      });
      navigationUrl = undefined;
    },
    async hide() {
      await invoke('browser_chat_surface_hide', {
        providerId: provider.id,
        accountProfileKey,
      });
    },
    async navigate(url) {
      navigationUrl = url;
    },
    async setFocus() {
      // The guarded native open command focuses the provider after applying
      // its final bounds, avoiding the broken JavaScript window dispatcher.
    },
    async setPosition(position) {
      bounds = { ...bounds, ...position };
    },
    async setSize(size) {
      bounds = { ...bounds, ...size };
    },
  };
}

function assertBounds(bounds: ProviderSurfaceBounds): void {
  if (
    !Number.isFinite(bounds.x) ||
    !Number.isFinite(bounds.y) ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height) ||
    bounds.width < 1 ||
    bounds.height < 1
  ) {
    throw new Error('Browser Chat bounds must be finite and non-zero.');
  }
}

export function createProviderSurfaceController(
  platform: ProviderSurfacePlatform,
): ProviderSurfaceController {
  const pendingCreations = new Map<string, Promise<ManagedProviderSurface>>();
  const lastRequestedNavigation = new Map<string, string>();
  const knownSurfaceKeys = new Set<string>();
  let visibilityRevision = 0;
  const hideExcept = async (selectedSurfaceKey?: string) => {
    await Promise.all(
      [...knownSurfaceKeys]
        .filter((surfaceKey) => surfaceKey !== selectedSurfaceKey)
        .map(async (surfaceKey) => {
          const surface = await platform.getSurface(surfaceKey);
          if (surface) await surface.hide();
        }),
    );
  };

  return {
    async openManaged(provider, bounds, navigationUrl = provider.homeUrl, accountProfileKey) {
      assertBounds(bounds);
      if (!BROWSER_CHAT_PROVIDERS.includes(provider)) {
        throw new Error('Unsupported Browser Chat provider definition.');
      }
      if (!isBrowserChatAccountProfileKey(accountProfileKey)) {
        throw new Error('Browser Chat account profile is unavailable.');
      }
      const normalized = normalizeProviderNavigation(provider.id, navigationUrl);
      if (!normalized) {
        throw new Error('Unsupported Browser Chat provider location.');
      }
      const targetUrl = normalized.normalizedUrl;
      if (!platform.desktop) {
        await platform.openExternal(targetUrl);
        return { kind: 'system_browser', providerId: provider.id };
      }

      const requestedVisibilityRevision = visibilityRevision;
      const surfaceKey = `${provider.windowLabel}:${accountProfileKey}`;
      await hideExcept(surfaceKey);
      const relative = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      };
      let surface = await platform.getSurface(surfaceKey);
      let created = false;
      if (!surface) {
        let pending = pendingCreations.get(surfaceKey);
        if (!pending) {
          pending = Promise.resolve(
            platform.createSurface(surfaceKey, {
              url: targetUrl,
              dataDirectory: accountProfileKey,
              x: relative.x,
              y: relative.y,
              width: relative.width,
              height: relative.height,
              focus: false,
            }),
          );
          pendingCreations.set(surfaceKey, pending);
        }
        try {
          surface = await pending;
          created = true;
        } finally {
          if (pendingCreations.get(surfaceKey) === pending) {
            pendingCreations.delete(surfaceKey);
          }
        }
      }
      knownSurfaceKeys.add(surfaceKey);
      if (lastRequestedNavigation.get(surfaceKey) !== targetUrl) {
        if (!created) {
          await surface.navigate(targetUrl);
        }
        lastRequestedNavigation.set(surfaceKey, targetUrl);
      }
      await surface.setPosition({ x: relative.x, y: relative.y });
      await surface.setSize({ width: relative.width, height: relative.height });
      if (requestedVisibilityRevision !== visibilityRevision) {
        await surface.hide();
        return { kind: 'managed', providerId: provider.id };
      }
      await surface.show();
      await surface.setFocus();
      return { kind: 'managed', providerId: provider.id };
    },

    async openSystemBrowser(provider) {
      if (!BROWSER_CHAT_PROVIDERS.includes(provider)) {
        throw new Error('Unsupported Browser Chat provider definition.');
      }
      await platform.openExternal(provider.homeUrl);
    },

    async openExternalNavigation(provider, url) {
      if (!BROWSER_CHAT_PROVIDERS.includes(provider)) {
        throw new Error('Unsupported Browser Chat provider definition.');
      }
      const normalized = normalizeProviderNavigation(provider.id, url);
      if (!normalized) {
        throw new Error('Unsupported Browser Chat provider location.');
      }
      await platform.openExternal(normalized.normalizedUrl);
    },

    async openChatGptPlugins() {
      await platform.openExternal(CHATGPT_APPS_URL);
    },

    async hideAll() {
      visibilityRevision += 1;
      if (platform.hideAllSurfaces) {
        await platform.hideAllSurfaces();
      } else {
        await hideExcept();
      }
    },

    async subscribeHostGeometry(listener) {
      return platform.subscribeHostGeometry?.(listener) ?? (() => undefined);
    },

    async subscribeNavigation(listener) {
      return (
        (await platform.subscribeNavigation?.((event) => {
          if (
            !isBrowserChatProviderId(event.providerId) ||
            !isBrowserChatAccountProfileKey(event.accountProfileKey) ||
            !Number.isFinite(event.timestamp) ||
            event.timestamp < 0
          ) {
            return;
          }
          const provider = BROWSER_CHAT_PROVIDERS.find(
            (candidate) => candidate.id === event.providerId,
          );
          if (!provider || event.surfaceId !== provider.windowLabel) return;
          const normalized = normalizeProviderNavigation(event.providerId, event.url);
          if (!normalized || normalized.kind !== event.kind) return;
          lastRequestedNavigation.set(
            `${provider.windowLabel}:${event.accountProfileKey}`,
            normalized.normalizedUrl,
          );
          listener({
            providerId: event.providerId,
            surfaceId: event.surfaceId,
            accountProfileKey: event.accountProfileKey,
            url: normalized.normalizedUrl,
            timestamp: event.timestamp,
            kind: normalized.kind,
            providerConversationKey: normalized.conversationKey,
            providerProjectKey: normalized.projectKey,
          });
        })) ?? (() => undefined)
      );
    },
  };
}

async function defaultPlatform(): Promise<ProviderSurfacePlatform> {
  if (!isTauri) {
    return {
      desktop: false,
      getSurface: async () => null,
      createSurface: () => {
        throw new Error('Managed provider surfaces require the VibeSpace desktop app.');
      },
      openExternal: async (url) => {
        window.open(url, '_blank', 'noopener,noreferrer');
      },
    };
  }

  const [{ invoke }, { getCurrentWindow }, { listen }] = await Promise.all([
    import('@tauri-apps/api/core'),
    import('@tauri-apps/api/window'),
    import('@tauri-apps/api/event'),
  ]);
  const currentWindow = getCurrentWindow();
  const nativeInvoke: NativeBrowserChatInvoke = (command, args) => invoke(command, args);
  const managedSurfaces = new Map<string, ManagedProviderSurface>();

  return {
    desktop: true,
    async getSurface(label) {
      let surface = managedSurfaces.get(label);
      if (!surface) {
        surface = createNativeManagedProviderSurface(label, nativeInvoke);
        managedSurfaces.set(label, surface);
      }
      return surface;
    },
    async createSurface(label, options) {
      const surface = createNativeManagedProviderSurface(label, nativeInvoke);
      await surface.setPosition({ x: options.x, y: options.y });
      await surface.setSize({ width: options.width, height: options.height });
      if (typeof options.url === 'string') {
        await surface.navigate(options.url);
      }
      managedSurfaces.set(label, surface);
      return surface;
    },
    async hideAllSurfaces() {
      await nativeInvoke('browser_chat_surface_hide_all');
    },
    openExternal,
    async subscribeHostGeometry(listener) {
      const [unlistenMoved, unlistenScale] = await Promise.all([
        currentWindow.onMoved(listener),
        currentWindow.onScaleChanged(listener),
      ]);
      return () => {
        unlistenMoved();
        unlistenScale();
      };
    },
    async subscribeNavigation(listener) {
      return listen<NativeProviderSurfaceNavigation>('browser-chat://navigation', (event) => {
        listener(event.payload);
      });
    },
  };
}

let defaultController: Promise<ProviderSurfaceController> | null = null;

async function controller(): Promise<ProviderSurfaceController> {
  defaultController ??= defaultPlatform().then(createProviderSurfaceController);
  return defaultController;
}

export const browserChatSurface: ProviderSurfaceController = {
  async openManaged(provider, bounds, navigationUrl, accountProfileKey) {
    return (await controller()).openManaged(provider, bounds, navigationUrl, accountProfileKey);
  },
  async openSystemBrowser(provider) {
    return (await controller()).openSystemBrowser(provider);
  },
  async openExternalNavigation(provider, url) {
    return (await controller()).openExternalNavigation(provider, url);
  },
  async openChatGptPlugins() {
    return (await controller()).openChatGptPlugins();
  },
  async hideAll() {
    return (await controller()).hideAll();
  },
  async subscribeHostGeometry(listener) {
    return (await controller()).subscribeHostGeometry?.(listener) ?? (() => undefined);
  },
  async subscribeNavigation(listener) {
    return (await controller()).subscribeNavigation?.(listener) ?? (() => undefined);
  },
};
