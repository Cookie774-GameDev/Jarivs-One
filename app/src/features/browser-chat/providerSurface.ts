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

export interface ManagedProviderWindow {
  readonly label: string;
  show(): Promise<void>;
  hide(): Promise<void>;
  setFocus(): Promise<void>;
  setPosition(position: { x: number; y: number }): Promise<void>;
  setSize(size: { width: number; height: number }): Promise<void>;
}

export interface ProviderSurfacePlatform {
  readonly desktop: boolean;
  currentMainBounds(): Promise<{ x: number; y: number; scaleFactor: number }>;
  getWindow(label: string): Promise<ManagedProviderWindow | null>;
  createWindow(
    label: string,
    options: Record<string, unknown>,
  ): ManagedProviderWindow | Promise<ManagedProviderWindow>;
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
          const window = await platform.getWindow(provider.windowLabel);
          if (window) await window.hide();
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
      const main = await platform.currentMainBounds();
      const absolute = {
        x: main.x + bounds.x,
        y: main.y + bounds.y,
        width: bounds.width,
        height: bounds.height,
      };
      let window = await platform.getWindow(provider.windowLabel);
      if (!window) {
        window = await platform.createWindow(provider.windowLabel, {
          url: provider.homeUrl,
          title: `${provider.label} · VibeSpace Browser Chat`,
          dataDirectory: provider.profileKey,
          x: absolute.x,
          y: absolute.y,
          width: absolute.width,
          height: absolute.height,
          decorations: false,
          resizable: false,
          maximizable: false,
          minimizable: false,
          closable: false,
          skipTaskbar: true,
          alwaysOnTop: false,
          visible: false,
          focus: false,
        });
      }
      await window.setPosition({ x: absolute.x, y: absolute.y });
      await window.setSize({ width: absolute.width, height: absolute.height });
      await window.show();
      await window.setFocus();
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
      currentMainBounds: async () => ({ x: 0, y: 0, scaleFactor: 1 }),
      getWindow: async () => null,
      createWindow: () => {
        throw new Error('Managed provider windows require the VibeSpace desktop app.');
      },
      openExternal: async (url) => {
        window.open(url, '_blank', 'noopener,noreferrer');
      },
    };
  }

  const [{ WebviewWindow }, { LogicalPosition, LogicalSize }, { getCurrentWindow }] =
    await Promise.all([
      import('@tauri-apps/api/webviewWindow'),
      import('@tauri-apps/api/dpi'),
      import('@tauri-apps/api/window'),
    ]);

  const wrap = (window: InstanceType<typeof WebviewWindow>): ManagedProviderWindow => ({
    label: window.label,
    show: () => window.show(),
    hide: () => window.hide(),
    setFocus: () => window.setFocus(),
    setPosition: ({ x, y }) => window.setPosition(new LogicalPosition(x, y)),
    setSize: ({ width, height }) => window.setSize(new LogicalSize(width, height)),
  });

  return {
    desktop: true,
    async currentMainBounds() {
      const main = getCurrentWindow();
      const [position, scaleFactor] = await Promise.all([main.innerPosition(), main.scaleFactor()]);
      return {
        x: position.x / scaleFactor,
        y: position.y / scaleFactor,
        scaleFactor,
      };
    },
    async getWindow(label) {
      const window = await WebviewWindow.getByLabel(label);
      return window ? wrap(window) : null;
    },
    async createWindow(label, options) {
      const window = new WebviewWindow(label, options);
      await new Promise<void>((resolve, reject) => {
        void window.once('tauri://created', () => resolve());
        void window.once('tauri://error', (event) =>
          reject(new Error(`Could not create Browser Chat surface: ${String(event.payload)}`)),
        );
      });
      return wrap(window);
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
