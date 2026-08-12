import { describe, expect, it, vi } from 'vitest';
import type { WebviewOptions } from '@tauri-apps/api/webview';

import { browserChatProvider } from './providerRegistry';
import {
  createNativeManagedProviderSurface,
  createProviderSurfaceController,
  type ManagedProviderSurface,
  type ProviderSurfacePlatform,
} from './providerSurface';

const ACCOUNT_PROFILE_KEY = `profile_${'a'.repeat(64)}` as const;
const OTHER_ACCOUNT_PROFILE_KEY = `profile_${'b'.repeat(64)}` as const;

function fakeWindow(label: string): ManagedProviderSurface {
  return {
    label,
    show: vi.fn(async () => undefined),
    hide: vi.fn(async () => undefined),
    navigate: vi.fn(async () => undefined),
    setFocus: vi.fn(async () => undefined),
    setPosition: vi.fn(async () => undefined),
    setSize: vi.fn(async () => undefined),
  };
}

function platform(desktop = true) {
  const windows = new Map<string, ManagedProviderSurface>();
  const created: Array<{ label: string; options: WebviewOptions }> = [];
  const opened: string[] = [];
  const implementation: ProviderSurfacePlatform = {
    desktop,
    async getSurface(label) {
      return windows.get(label) ?? null;
    },
    createSurface(label, options) {
      const window = fakeWindow(label);
      windows.set(label, window);
      created.push({ label, options });
      return window;
    },
    async openExternal(url) {
      opened.push(url);
    },
  };
  return { implementation, windows, created, opened };
}

describe('Browser Chat managed provider surface', () => {
  it('routes native provider geometry through the guarded Browser Chat command', async () => {
    const invoke = vi.fn(async () => undefined);
    const surface = createNativeManagedProviderSurface(
      `browser-chat-chatgpt:${ACCOUNT_PROFILE_KEY}`,
      invoke,
    );

    await surface.setPosition({ x: 120, y: 90 });
    await surface.setSize({ width: 880, height: 620 });
    await surface.show();

    expect(invoke).toHaveBeenCalledWith('browser_chat_surface_open', {
      providerId: 'chatgpt',
      accountProfileKey: ACCOUNT_PROFILE_KEY,
      bounds: { x: 120, y: 90, width: 880, height: 620 },
    });
    await surface.hide();
    expect(invoke).toHaveBeenLastCalledWith('browser_chat_surface_hide', {
      providerId: 'chatgpt',
      accountProfileKey: ACCOUNT_PROFILE_KEY,
    });
  });

  it('propagates a completed native open failure to the managed surface caller', async () => {
    const invoke = vi.fn(async () => {
      throw new Error('browser_chat_create_failed:native');
    });
    const surface = createNativeManagedProviderSurface(
      `browser-chat-chatgpt:${ACCOUNT_PROFILE_KEY}`,
      invoke,
    );
    await surface.setPosition({ x: 10, y: 20 });
    await surface.setSize({ width: 800, height: 600 });

    await expect(surface.show()).rejects.toThrow('browser_chat_create_failed:native');
  });

  it('sends a saved navigation only once and retains geometry-only surface updates', async () => {
    const invoke = vi.fn(async () => undefined);
    const surface = createNativeManagedProviderSurface(
      `browser-chat-chatgpt:${ACCOUNT_PROFILE_KEY}`,
      invoke,
    );
    await surface.setPosition({ x: 120, y: 90 });
    await surface.setSize({ width: 880, height: 620 });
    await surface.navigate('https://chatgpt.com/c/conversation-1');

    await surface.show();
    await surface.setSize({ width: 900, height: 640 });
    await surface.show();

    expect(invoke).toHaveBeenNthCalledWith(1, 'browser_chat_surface_open', {
      providerId: 'chatgpt',
      accountProfileKey: ACCOUNT_PROFILE_KEY,
      bounds: { x: 120, y: 90, width: 880, height: 620 },
      navigationUrl: 'https://chatgpt.com/c/conversation-1',
    });
    expect(invoke).toHaveBeenNthCalledWith(2, 'browser_chat_surface_open', {
      providerId: 'chatgpt',
      accountProfileKey: ACCOUNT_PROFILE_KEY,
      bounds: { x: 120, y: 90, width: 900, height: 640 },
    });
  });

  it('creates a child surface with registry-owned HTTPS and main-relative bounds', async () => {
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
      undefined,
      ACCOUNT_PROFILE_KEY,
    );

    expect(result.kind).toBe('managed');
    expect(fake.created).toHaveLength(1);
    expect(fake.created[0]).toMatchObject({
      label: `browser-chat-chatgpt:${ACCOUNT_PROFILE_KEY}`,
      options: {
        url: 'https://chatgpt.com/',
        dataDirectory: ACCOUNT_PROFILE_KEY,
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
    const controller = createProviderSurfaceController(fake.implementation);

    await controller.openManaged(
      browserChatProvider('chatgpt'),
      { x: 0, y: 0, width: 600, height: 400 },
      undefined,
      ACCOUNT_PROFILE_KEY,
    );
    const chatgpt = fake.windows.get(`browser-chat-chatgpt:${ACCOUNT_PROFILE_KEY}`)!;
    await controller.openManaged(
      browserChatProvider('claude'),
      { x: 0, y: 0, width: 600, height: 400 },
      undefined,
      ACCOUNT_PROFILE_KEY,
    );
    const claude = fake.windows.get(`browser-chat-claude:${ACCOUNT_PROFILE_KEY}`)!;

    expect(chatgpt.hide).toHaveBeenCalledOnce();
    expect(claude.show).toHaveBeenCalledOnce();
    expect(claude.setFocus).toHaveBeenCalledOnce();
  });

  it('coalesces concurrent opens so only one child surface is created per provider', async () => {
    const fake = platform();
    const originalCreate = fake.implementation.createSurface;
    fake.implementation.createSurface = async (label, options) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return originalCreate(label, options);
    };
    const controller = createProviderSurfaceController(fake.implementation);
    const bounds = { x: 20, y: 30, width: 800, height: 600 };

    const [first, second] = await Promise.all([
      controller.openManaged(
        browserChatProvider('chatgpt'),
        bounds,
        undefined,
        ACCOUNT_PROFILE_KEY,
      ),
      controller.openManaged(
        browserChatProvider('chatgpt'),
        bounds,
        undefined,
        ACCOUNT_PROFILE_KEY,
      ),
    ]);

    expect(first).toEqual({ kind: 'managed', providerId: 'chatgpt' });
    expect(second).toEqual(first);
    expect(fake.created).toHaveLength(1);
  });

  it('does not show an in-flight child surface after the host hides all surfaces', async () => {
    const fake = platform();
    const originalCreate = fake.implementation.createSurface;
    let releaseCreation: (() => void) | undefined;
    const creationGate = new Promise<void>((resolve) => {
      releaseCreation = resolve;
    });
    fake.implementation.createSurface = async (label, options) => {
      await creationGate;
      return originalCreate(label, options);
    };
    const controller = createProviderSurfaceController(fake.implementation);
    const opening = controller.openManaged(
      browserChatProvider('chatgpt'),
      { x: 20, y: 30, width: 800, height: 600 },
      undefined,
      ACCOUNT_PROFILE_KEY,
    );
    await Promise.resolve();

    await controller.hideAll();
    releaseCreation?.();
    await opening;

    const surface = fake.windows.get(`browser-chat-chatgpt:${ACCOUNT_PROFILE_KEY}`)!;
    expect(surface.show).not.toHaveBeenCalled();
    expect(surface.hide).toHaveBeenCalledOnce();
  });

  it('uses distinct child surfaces and hides the former surface across account profiles', async () => {
    const fake = platform();
    const controller = createProviderSurfaceController(fake.implementation);
    const bounds = { x: 20, y: 30, width: 800, height: 600 };

    await controller.openManaged(
      browserChatProvider('chatgpt'),
      bounds,
      undefined,
      ACCOUNT_PROFILE_KEY,
    );
    const first = fake.windows.get(`browser-chat-chatgpt:${ACCOUNT_PROFILE_KEY}`)!;
    await controller.openManaged(
      browserChatProvider('chatgpt'),
      bounds,
      undefined,
      OTHER_ACCOUNT_PROFILE_KEY,
    );

    expect(fake.created.map(({ label }) => label)).toEqual([
      `browser-chat-chatgpt:${ACCOUNT_PROFILE_KEY}`,
      `browser-chat-chatgpt:${OTHER_ACCOUNT_PROFILE_KEY}`,
    ]);
    expect(first.hide).toHaveBeenCalledOnce();
  });

  it('reopens an existing child at a normalized saved location without reloading on geometry only', async () => {
    const fake = platform();
    const surface = fakeWindow(`browser-chat-chatgpt:${ACCOUNT_PROFILE_KEY}`);
    fake.windows.set(surface.label, surface);
    const controller = createProviderSurfaceController(fake.implementation);
    const bounds = { x: 20, y: 30, width: 800, height: 600 };

    await controller.openManaged(
      browserChatProvider('chatgpt'),
      bounds,
      'https://chatgpt.com/c/conversation-1?temporary=true#private',
      ACCOUNT_PROFILE_KEY,
    );
    await controller.openManaged(
      browserChatProvider('chatgpt'),
      { ...bounds, width: 900 },
      'https://chatgpt.com/c/conversation-1',
      ACCOUNT_PROFILE_KEY,
    );

    expect(surface.navigate).toHaveBeenCalledOnce();
    expect(surface.navigate).toHaveBeenCalledWith('https://chatgpt.com/c/conversation-1');
    expect(surface.setSize).toHaveBeenCalledTimes(2);
  });

  it('forwards only normalized registry-owned top-level navigation metadata', async () => {
    const fake = platform();
    let nativeListener:
      | ((event: {
          providerId: string;
          surfaceId: string;
          accountProfileKey: string;
          url: string;
          timestamp: number;
          kind: string;
        }) => void)
      | undefined;
    fake.implementation.subscribeNavigation = async (listener) => {
      nativeListener = listener;
      return () => undefined;
    };
    const controller = createProviderSurfaceController(fake.implementation);
    const received: unknown[] = [];
    await controller.subscribeNavigation?.((navigation) => received.push(navigation));

    nativeListener?.({
      providerId: 'chatgpt',
      surfaceId: 'browser-chat-chatgpt',
      accountProfileKey: ACCOUNT_PROFILE_KEY,
      url: 'https://chatgpt.com/c/conversation-1?temporary=true#fragment',
      timestamp: 123,
      kind: 'conversation',
    });
    nativeListener?.({
      providerId: 'chatgpt',
      surfaceId: 'browser-chat-chatgpt',
      accountProfileKey: ACCOUNT_PROFILE_KEY,
      url: 'https://chatgpt.com.evil.example/c/stolen',
      timestamp: 124,
      kind: 'conversation',
    });

    expect(received).toEqual([
      {
        providerId: 'chatgpt',
        surfaceId: 'browser-chat-chatgpt',
        accountProfileKey: ACCOUNT_PROFILE_KEY,
        url: 'https://chatgpt.com/c/conversation-1',
        timestamp: 123,
        kind: 'conversation',
        providerConversationKey: 'conversation-1',
      },
    ]);
  });

  it('uses a truthful system-browser fallback outside the desktop shell', async () => {
    const fake = platform(false);
    const controller = createProviderSurfaceController(fake.implementation);

    const result = await controller.openManaged(
      browserChatProvider('gemini'),
      { x: 0, y: 0, width: 600, height: 400 },
      undefined,
      ACCOUNT_PROFILE_KEY,
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

  it('opens only normalized provider-owned resume locations externally', async () => {
    const fake = platform();
    const controller = createProviderSurfaceController(fake.implementation);

    await controller.openExternalNavigation(
      browserChatProvider('chatgpt'),
      'https://chatgpt.com/c/conversation-1?temporary=true#private',
    );

    expect(fake.opened).toEqual(['https://chatgpt.com/c/conversation-1']);
    await expect(
      controller.openExternalNavigation(
        browserChatProvider('chatgpt'),
        'https://chatgpt.com.evil.example/c/stolen',
      ),
    ).rejects.toThrow('Unsupported Browser Chat provider location.');
    expect(fake.opened).toHaveLength(1);
  });

  it('opens ChatGPT Apps setup in the OS default browser', async () => {
    const fake = platform();
    const controller = createProviderSurfaceController(fake.implementation);

    await controller.openChatGptPlugins();

    expect(fake.opened).toEqual(['https://chatgpt.com/']);
  });

  it('rejects zero-sized or non-finite overlay bounds', async () => {
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
        undefined,
        ACCOUNT_PROFILE_KEY,
      ),
    ).rejects.toThrow(/browser chat bounds/i);
    expect(fake.created).toHaveLength(0);
  });
});
