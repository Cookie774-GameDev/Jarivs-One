import type { FullscreenAvailability } from './contracts';

export interface NativeFullscreenWindow {
  setFullscreen(enabled: boolean): Promise<void>;
  isFullscreen(): Promise<boolean>;
  onResized(listener: () => void): Promise<() => void>;
  onFocusChanged(listener: () => void): Promise<() => void>;
}

export interface NativeFullscreenAdapter {
  availability(): FullscreenAvailability;
  read(): Promise<boolean>;
  write(enabled: boolean): Promise<boolean>;
  subscribe(listener: (enabled: boolean) => void): Promise<() => void>;
}

const isInstalledTauriRuntime = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function loadCurrentWindow(): Promise<NativeFullscreenWindow> {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const current = getCurrentWindow();
  return {
    setFullscreen: (enabled) => current.setFullscreen(enabled),
    isFullscreen: () => current.isFullscreen(),
    onResized: async (listener) => current.onResized(() => listener()),
    onFocusChanged: async (listener) => current.onFocusChanged(() => listener()),
  };
}

export function createNativeFullscreenAdapter(options?: {
  isTauriRuntime?: () => boolean;
  loadWindow?: () => Promise<NativeFullscreenWindow>;
}): NativeFullscreenAdapter {
  const isTauriRuntime = options?.isTauriRuntime ?? isInstalledTauriRuntime;
  const loadWindow = options?.loadWindow ?? loadCurrentWindow;

  const requireWindow = async (): Promise<NativeFullscreenWindow> => {
    if (!isTauriRuntime()) {
      throw new Error('System fullscreen requires the installed VibeSpace desktop app.');
    }
    return loadWindow();
  };

  return {
    availability: () => (isTauriRuntime() ? 'available' : 'web-preview'),

    async read() {
      return (await requireWindow()).isFullscreen();
    },

    async write(enabled) {
      const current = await requireWindow();
      await current.setFullscreen(enabled);
      const observed = await current.isFullscreen();
      if (observed !== enabled) {
        throw new Error('Native fullscreen did not reach the requested state.');
      }
      return observed;
    },

    async subscribe(listener) {
      const current = await requireWindow();
      let queued = false;
      let disposed = false;

      const publishObservedState = () => {
        if (queued || disposed) return;
        queued = true;
        queueMicrotask(() => {
          queued = false;
          if (disposed) return;
          void current
            .isFullscreen()
            .then((enabled) => {
              if (!disposed) listener(enabled);
            })
            .catch(() => {
              // A transient native query must not break the application shell.
            });
        });
      };

      const stopResize = await current.onResized(publishObservedState);
      let stopFocus: (() => void) | null = null;
      try {
        stopFocus = await current.onFocusChanged(publishObservedState);
      } catch (error) {
        stopResize();
        throw error;
      }

      return () => {
        if (disposed) return;
        disposed = true;
        stopResize();
        stopFocus?.();
      };
    },
  };
}
