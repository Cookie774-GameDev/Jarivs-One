import { describe, expect, it, vi } from 'vitest';
import type { WebviewOptions } from '@tauri-apps/api/webview';

import { browserChatProvider } from './providerRegistry';
import {
  createNativeManagedProviderSurface,
  createProviderSurfaceController,
  type ManagedProviderSurface,
  type ProviderSurfacePlatform,
} from './providerSurface';

function fakeWindow(label: string): ManagedProviderSurface {
  return {
    label,
    show: vi.fn(async () => undefined),
    hide: vi.fn(async () => undefined),
    setFocus: vi.fn(async () => undefined),
    setPosition: vi.fn(async () => undefined),
    setSize: vi.fn(async () => undefined),
  };
}

function platform(desktop = true) {
  const windows = new Map<string, ManagedProviderSurface>();
  const created: Array<{ label: string; options: WebviewOptions; profileKey?: string }> = [];
  const opened: string[] = [];
  const implementation: ProviderSurfacePlatform = {
    desktop,
    async getSurface(label) {
      return windows.get(label) ?? null;
    },
    createSurface(label, options, profileKey) {
      const window = fakeWindow(label);
      windows.set(label, window);
      created.push({ label, options, profileKey });
      return window;
    },
    async openExternal(url) {
      opened.push(url);
    },
  };
  return { implementation, windows, created, opened };
}

describe('Browser Chat managed provider surface', () => {
  it('routes native provider geometry and the account profile through the guarded command', async () => {
    const invoke = vi.fn(async () => undefined);
    const surface = createNativeManagedProviderSurface(
      'browser-chat-chatgpt',
      invoke,
      'vibespace-account:account-a',
    );

    await surface.setPosition({ x: 120, y: 90 });
    await surface.setSize({ width: 880, height: 620 });
    await surface.show();

    expect(invoke).toHaveBeenCalledWith('browser_chat_surface_open', {
      providerId: 'chatgpt',
      providerProfileKey: 'vibespace-account:account-a',
      bounds: { x: 120, y: 90, width: 880, height: 620 },
    });
    await surface.hide();
    expect(invoke).toHaveBeenLastCalledWith('browser_chat_surface_hide', {
      providerId: 'chatgpt',
    });
  });

  it('creates a child surface with registry-owned HTTPS, main-relative bounds, and account scope', async () => {
    const fake = platform();
    const controller = createProviderSurfaceController(fake.implementation);

    const result = await controller.openManaged(
      browserChatProvider('chatgpt'),
      {
        x: 100,
        y: 80,
        width: 900,
        height: 640,
      },
      'vibespace-account:account-a',
    );

    expect(result.kind).toBe('managed');
    expect(fake.created).toHaveLength(1);
    expect(fake.created[0]).toMatchObject({
      label: 'browser-chat-chatgpt',
      profileKey: 'vibespace-account:account-a',
      options: {
        url: 'https://chatgpt.com/',
        dataDirectory: 'browser-chat/chatgpt',
        x: 100,
        y: 80,
        width: 900,
        height: 640,
        focus: false,
      },
    });
    expect(fake.created[0]?.options).not.toHaveProperty('decorations');
    expect(fake.created[0]?.options).not.toHaveProperty('skipTaskbar');
    expect(fake.created[0]?.options).not.toHaveProperty('alwaysOnTop');
    expect(fake.created[0]?.options).not.toHaveProperty('focused');
    expect(fake.created[0]?.options).not.toHaveProperty('initializationScript');
  });

  it('hides other provider surfaces before showing the selected provider', async () => {
    const fake = platform();
    const chatgpt = fakeWindow('browser-chat-chatgpt');
    const claude = fakeWindow('browser-chat-claude');
    fake.windows.set(chatgpt.label, chatgpt);
    fake.windows.set(claude.label, claude);
    const controller = createProviderSurfaceController(fake.implementation);

    await controller.openManaged(
      browserChatProvider('claude'),
      {
        x: 0,
        y: 0,
        width: 600,
        height: 400,
      },
      'vibespace-account:account-a',
    );

    expect(chatgpt.hide).toHaveBeenCalledOnce();
    expect(claude.show).toHaveBeenCalledOnce();
    expect(claude.setFocus).toHaveBeenCalledOnce();
  });

  it('serializes concurrent opens so only one child surface is created per provider profile', async () => {
    const fake = platform();
    const originalCreate = fake.implementation.createSurface;
    fake.implementation.createSurface = async (label, options, profileKey) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return originalCreate(label, options, profileKey);
    };
    const controller = createProviderSurfaceController(fake.implementation);
    const bounds = { x: 20, y: 30, width: 800, height: 600 };

    const [first, second] = await Promise.all([
      controller.openManaged(
        browserChatProvider('chatgpt'),
        bounds,
        'vibespace-account:account-a',
      ),
      controller.openManaged(
        browserChatProvider('chatgpt'),
        bounds,
        'vibespace-account:account-a',
      ),
    ]);

    expect(first).toEqual({ kind: 'managed', providerId: 'chatgpt' });
    expect(second).toEqual(first);
    expect(fake.created).toHaveLength(1);
  });

  it('serializes hide behind an in-flight open instead of overlapping native operations', async () => {
    const fake = platform();
    let releaseCreate: (() => void) | undefined;
    const pendingCreate = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });
    const originalCreate = fake.implementation.createSurface;
    fake.implementation.createSurface = async (label, options, profileKey) => {
      await pendingCreate;
      return originalCreate(label, options, profileKey);
    };
    const controller = createProviderSurfaceController(fake.implementation);

    const opening = controller.openManaged(
      browserChatProvider('chatgpt'),
      { x: 20, y: 30, width: 800, height: 600 },
      'vibespace-account:account-a',
    );
    const hiding = controller.hideAll();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fake.created).toHaveLength(0);
    releaseCreate?.();
    await opening;
    await hiding;

    expect(fake.created).toHaveLength(1);
    expect(fake.windows.get('browser-chat-chatgpt')?.hide).toHaveBeenCalled();
  });

  it('uses a truthful system-browser fallback outside the desktop shell', async () => {
    const fake = platform(false);
    const controller = createProviderSurfaceController(fake.implementation);

    const result = await controller.openManaged(
      browserChatProvider('gemini'),
      {
        x: 0,
        y: 0,
        width: 600,
        height: 400,
      },
      'vibespace-account:account-a',
    );

    expect(result).toEqual({ kind: 'system_browser', providerId: 'gemini' });
    expect(fake.created).toHaveLength(0);
    expect(fake.opened).toEqual(['https://gemini.google.com/']);
  });

  it('delegates ChatGPT sign-in to the OS default browser without a Chrome-specific launcher', async () => {
    const fake = platform();
    const controller = createProviderSurfaceController(fake.implementation);

    await controller.openSystemBrowser(browserChatProvider('chatgpt'));

    expect(fake.opened).toEqual(['https://chatgpt.com/']);
  });

  it('opens the exact ChatGPT Plugins page in the OS default browser', async () => {
    const fake = platform();
    const controller = createProviderSurfaceController(fake.implementation);

    await controller.openChatGptPlugins();

    expect(fake.opened).toEqual(['https://chatgpt.com/plugins']);
  });

  it('rejects zero-sized bounds and malformed profile keys', async () => {
    const fake = platform();
    const controller = createProviderSurfaceController(fake.implementation);

    await expect(
      controller.openManaged(
        browserChatProvider('chatgpt'),
        {
          x: Number.NaN,
          y: 0,
          width: 0,
          height: 400,
        },
        'vibespace-account:account-a',
      ),
    ).rejects.toThrow(/browser chat bounds/i);
    await expect(
      controller.openManaged(
        browserChatProvider('chatgpt'),
        { x: 0, y: 0, width: 600, height: 400 },
        'bad\nprofile',
      ),
    ).rejects.toThrow(/profile key/i);
    expect(fake.created).toHaveLength(0);
  });
});
