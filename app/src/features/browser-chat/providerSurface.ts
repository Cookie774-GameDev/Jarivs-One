import type { WebviewOptions } from '@tauri-apps/api/webview';

import { isTauri } from '@/lib/utils';
import { openExternal } from '@/lib/tauri';
import {
  BROWSER_CHAT_PROVIDERS,
  type BrowserChatProviderDefinition,
  type BrowserChatProviderId,
} from './providerRegistry';
import { CHATGPT_PLUGINS_URL } from './mcpConnection';

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
  setFocus(): Promise<void>;
  setPosition(position: { x: number; y: number }): Promise<void>;
  setSize(size: { width: number; height: number }): Promise<void>;
}

export interface ProviderSurfacePlatform {
  readonly desktop: boolean;
  getSurface(label: string, profileKey?: string): Promise<ManagedProviderSurface | null>;
  createSurface(
    label: string,
    options: WebviewOptions,
    profileKey?: string,
  ): ManagedProviderSurface | Promise<ManagedProviderSurface>;
  openExternal(url: string): Promise<void>;
  subscribeHostGeometry?(listener: () => void): Promise<() => void>;
}

export interface ProviderSurfaceController {
  openManaged(
    provider: BrowserChatProviderDefinition,
    bounds: ProviderSurfaceBounds,
    profileKey?: string,
  ): Promise<
    | { kind: 'managed'; providerId: BrowserChatProviderId }
    | { kind: 'system_browser'; providerId: BrowserChatProviderId }
  >;
  openSystemBrowser(provider: BrowserChatProviderDefinition): Promise<void>;
  openChatGptPlugins(): Promise<void>;
  hideAll(): Promise<void>;
  subscribeHostGeometry?(listener: () => void): Promise<() => void>;
}

export type NativeBrowserChatInvoke = (
  command: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

const DEFAULT_PROVIDER_PROFILE_KEY = 'vibespace-account:local-default';

function normalizedProfileKey(profileKey: string | undefined): string {
  const value = (profileKey ?? DEFAULT_PROVIDER_PROFILE_KEY).trim();
  if (!value || value.length > 256 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error('Browser Chat provider profile key is invalid.');
  }
  return value;
}

export function createNativeManagedProviderSurface(
  label: string,
  invoke: NativeBrowserChatInvoke,
  profileKey: string = DEFAULT_PROVIDER_PROFILE_KEY,
): ManagedProviderSurface {
  const provider = BROWSER_CHAT_PROVIDERS.find((candidate) => candidate.windowLabel === label);
  if (!provider) {
    throw new Error('Unsupported Browser Chat provider window label.');
  }
  const providerProfileKey = normalizedProfileKey(profileKey);
  let bounds: ProviderSurfaceBounds = {
    x: Number.NaN,
    y: Number.NaN,
    width: Number.NaN,
    height: Number.NaN,
  };

  return {
    label,
    async show() {
      assertBounds(bounds);
      await invoke('browser_chat_surface_open', {
        providerId: provider.id,
        providerProfileKey,
        bounds,
      });
    },
    async hide() {
      await invoke('browser_chat_surface_hide', {
        providerId: provider.id,
      });
    },
    async setFocus() {
      // The guarded native open command focuses only on creation/activation.
      // Geometry-only updates never steal focus from the VibeSpace shell.
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
  let operationTail: Promise<void> = Promise.resolve();

  const serialized = <T,>(operation: () => Promise<T>): Promise<T> => {
    const result = operationTail.then(operation, operation);
    operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const hideExcept = async (selected?: BrowserChatProviderId) => {
    await Promise.all(
      BROWSER_CHAT_PROVIDERS.filter((provider) => provider.id !== selected).map(
        async (provider) => {
          const surface = await platform.getSurface(provider.windowLabel);
          if (surface) await surface.hide();
        },
      ),
    );
  };

  return {
    async openManaged(provider, bounds, requestedProfileKey) {
      return serialized(async () => {
        assertBounds(bounds);
        if (!BROWSER_CHAT_PROVIDERS.includes(provider)) {
          throw new Error('Unsupported Browser Chat provider definition.');
        }
        const profileKey = normalizedProfileKey(requestedProfileKey ?? provider.profileKey);
        if (!platform.desktop) {
          await platform.openExternal(provider.homeUrl);
          return { kind: 'system_browser' as const, providerId: provider.id };
        }

        await hideExcept(provider.id);
        const relative = {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        };
        const surfaceKey = `${provider.windowLabel}:${profileKey}`;
        let surface = await platform.getSurface(provider.windowLabel, profileKey);
        if (!surface) {
          let pending = pendingCreations.get(surfaceKey);
          if (!pending) {
            pending = Promise.resolve(
              platform.createSurface(
                provider.windowLabel,
                {
                  url: provider.homeUrl,
                  dataDirectory: provider.profileKey,
                  x: relative.x,
                  y: relative.y,
                  width: relative.width,
                  height: relative.height,
                  focus: false,
                },
                profileKey,
              ),
            );
            pendingCreations.set(surfaceKey, pending);
          }
          try {
            surface = await pending;
          } finally {
            if (pendingCreations.get(surfaceKey) === pending) {
              pendingCreations.delete(surfaceKey);
            }
          }
        }
        await surface.setPosition({ x: relative.x, y: relative.y });
        await surface.setSize({ width: relative.width, height: relative.height });
        await surface.show();
        await surface.setFocus();
        return { kind: 'managed' as const, providerId: provider.id };
      });
    },

    async openSystemBrowser(provider) {
      if (!BROWSER_CHAT_PROVIDERS.includes(provider)) {
        throw new Error('Unsupported Browser Chat provider definition.');
      }
      await platform.openExternal(provider.homeUrl);
    },

    async openChatGptPlugins() {
      await platform.openExternal(CHATGPT_PLUGINS_URL);
    },

    async hideAll() {
      await serialized(() => hideExcept());
    },

    async subscribeHostGeometry(listener) {
      return platform.subscribeHostGeometry?.(listener) ?? (() => undefined);
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

  const { invoke } = await import('@tauri-apps/api/core');
  const nativeInvoke: NativeBrowserChatInvoke = (command, args) => invoke(command, args);

  return {
    desktop: true,
    async getSurface(label, profileKey) {
      return createNativeManagedProviderSurface(
        label,
        nativeInvoke,
        normalizedProfileKey(profileKey),
      );
    },
    async createSurface(label, options, profileKey) {
      const surface = createNativeManagedProviderSurface(
        label,
        nativeInvoke,
        normalizedProfileKey(profileKey),
      );
      await surface.setPosition({ x: options.x, y: options.y });
      await surface.setSize({ width: options.width, height: options.height });
      return surface;
    },
    openExternal,
  };
}

let defaultController: Promise<ProviderSurfaceController> | null = null;

async function controller(): Promise<ProviderSurfaceController> {
  defaultController ??= defaultPlatform().then(createProviderSurfaceController);
  return defaultController;
}

export const browserChatSurface: ProviderSurfaceController = {
  async openManaged(provider, bounds, profileKey) {
    return (await controller()).openManaged(provider, bounds, profileKey);
  },
  async openSystemBrowser(provider) {
    return (await controller()).openSystemBrowser(provider);
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
};
