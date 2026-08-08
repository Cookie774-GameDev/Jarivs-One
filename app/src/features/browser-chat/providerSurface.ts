import type { WebviewOptions } from '@tauri-apps/api/webview';

import { isTauri } from '@/lib/utils';
import { openExternal } from '@/lib/tauri';
import {
  BROWSER_CHAT_PROVIDERS,
  type BrowserChatProviderDefinition,
  type BrowserChatProviderId,
} from './providerRegistry';

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
  getSurface(label: string): Promise<ManagedProviderSurface | null>;
  createSurface(
    label: string,
    options: WebviewOptions,
  ): ManagedProviderSurface | Promise<ManagedProviderSurface>;
  openExternal(url: string): Promise<void>;
}

export interface ProviderSurfaceController {
  openManaged(
    provider: BrowserChatProviderDefinition,
    bounds: ProviderSurfaceBounds,
  ): Promise<
    | { kind: 'managed'; providerId: BrowserChatProviderId }
    | { kind: 'system_browser'; providerId: BrowserChatProviderId }
  >;
  openSystemBrowser(provider: BrowserChatProviderDefinition): Promise<void>;
  hideAll(): Promise<void>;
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
    async openManaged(provider, bounds) {
      assertBounds(bounds);
      if (!BROWSER_CHAT_PROVIDERS.includes(provider)) {
        throw new Error('Unsupported Browser Chat provider definition.');
      }
      if (!platform.desktop) {
        await platform.openExternal(provider.homeUrl);
        return { kind: 'system_browser', providerId: provider.id };
      }

      await hideExcept(provider.id);
      const relative = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      };
      let surface = await platform.getSurface(provider.windowLabel);
      if (!surface) {
        surface = await platform.createSurface(provider.windowLabel, {
          url: provider.homeUrl,
          dataDirectory: provider.profileKey,
          x: relative.x,
          y: relative.y,
          width: relative.width,
          height: relative.height,
          focus: false,
        });
      }
      await surface.setPosition({ x: relative.x, y: relative.y });
      await surface.setSize({ width: relative.width, height: relative.height });
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

    async hideAll() {
      await hideExcept();
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

  const [{ Webview }, { LogicalPosition, LogicalSize }, { getCurrentWindow }] = await Promise.all([
    import('@tauri-apps/api/webview'),
    import('@tauri-apps/api/dpi'),
    import('@tauri-apps/api/window'),
  ]);

  const wrap = (webview: InstanceType<typeof Webview>): ManagedProviderSurface => ({
    label: webview.label,
    show: () => webview.show(),
    hide: () => webview.hide(),
    setFocus: () => webview.setFocus(),
    setPosition: ({ x, y }) => webview.setPosition(new LogicalPosition(x, y)),
    setSize: ({ width, height }) => webview.setSize(new LogicalSize(width, height)),
  });

  return {
    desktop: true,
    async getSurface(label) {
      const webview = await Webview.getByLabel(label);
      return webview ? wrap(webview) : null;
    },
    async createSurface(label, options) {
      const webview = new Webview(getCurrentWindow(), label, options);
      await new Promise<void>((resolve, reject) => {
        void webview.once('tauri://created', () => resolve());
        void webview.once('tauri://error', (event) =>
          reject(new Error(`Could not create Browser Chat surface: ${String(event.payload)}`)),
        );
      });
      return wrap(webview);
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
  async openManaged(provider, bounds) {
    return (await controller()).openManaged(provider, bounds);
  },
  async openSystemBrowser(provider) {
    return (await controller()).openSystemBrowser(provider);
  },
  async hideAll() {
    return (await controller()).hideAll();
  },
};
