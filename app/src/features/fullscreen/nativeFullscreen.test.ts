import { describe, expect, it, vi } from 'vitest';
import { createNativeFullscreenAdapter, type NativeFullscreenWindow } from './nativeFullscreen';

function createWindow(initial = false) {
  let fullscreen = initial;
  let resized: (() => void) | null = null;
  let focused: (() => void) | null = null;
  const stopResize = vi.fn();
  const stopFocus = vi.fn();

  const windowApi: NativeFullscreenWindow = {
    async setFullscreen(enabled) {
      fullscreen = enabled;
    },
    async isFullscreen() {
      return fullscreen;
    },
    async onResized(listener) {
      resized = listener;
      return stopResize;
    },
    async onFocusChanged(listener) {
      focused = listener;
      return stopFocus;
    },
  };

  return {
    windowApi,
    setObserved: (enabled: boolean) => {
      fullscreen = enabled;
    },
    emitResize: () => resized?.(),
    emitFocus: () => focused?.(),
    stopResize,
    stopFocus,
  };
}

describe('native fullscreen adapter', () => {
  it('sets native fullscreen and returns verified native truth', async () => {
    const fake = createWindow();
    const adapter = createNativeFullscreenAdapter({
      isTauriRuntime: () => true,
      loadWindow: async () => fake.windowApi,
    });

    expect(adapter.availability()).toBe('available');
    await expect(adapter.write(true)).resolves.toBe(true);
    await expect(adapter.read()).resolves.toBe(true);
  });

  it('rejects a native transition whose observed truth does not match the request', async () => {
    const fake = createWindow();
    const windowApi: NativeFullscreenWindow = {
      ...fake.windowApi,
      async setFullscreen() {
        fake.setObserved(false);
      },
    };
    const adapter = createNativeFullscreenAdapter({
      isTauriRuntime: () => true,
      loadWindow: async () => windowApi,
    });

    await expect(adapter.write(true)).rejects.toThrow(
      'Native fullscreen did not reach the requested state.',
    );
  });

  it('fails safely in web preview without invoking a native loader', async () => {
    const loadWindow = vi.fn(async () => createWindow().windowApi);
    const adapter = createNativeFullscreenAdapter({
      isTauriRuntime: () => false,
      loadWindow,
    });

    expect(adapter.availability()).toBe('web-preview');
    await expect(adapter.write(true)).rejects.toThrow(
      'System fullscreen requires the installed VibeSpace desktop app.',
    );
    expect(loadWindow).not.toHaveBeenCalled();
  });

  it('coalesces native resize and focus signals and releases both listeners', async () => {
    const fake = createWindow();
    const observed: boolean[] = [];
    const adapter = createNativeFullscreenAdapter({
      isTauriRuntime: () => true,
      loadWindow: async () => fake.windowApi,
    });
    const unsubscribe = await adapter.subscribe((enabled) => observed.push(enabled));

    fake.setObserved(true);
    fake.emitResize();
    fake.emitFocus();
    await Promise.resolve();
    await Promise.resolve();

    expect(observed).toEqual([true]);
    unsubscribe();
    expect(fake.stopResize).toHaveBeenCalledOnce();
    expect(fake.stopFocus).toHaveBeenCalledOnce();
  });
});
