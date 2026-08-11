import * as React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { browserChatProvider } from './providerRegistry';
import { BrowserProviderSurface } from './BrowserProviderSurface';
import { browserChatStore } from './browserChatStore';

describe('BrowserProviderSurface', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  beforeEach(() => {
    browserChatStore.setState({ providerRuntime: {} });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 20,
      y: 30,
      top: 30,
      right: 920,
      bottom: 670,
      left: 20,
      width: 900,
      height: 640,
      toJSON: () => ({}),
    });
  });

  it('opens the selected managed provider and hides all surfaces on unmount', async () => {
    let hostGeometryListener: (() => void) | undefined;
    const unsubscribeHostGeometry = vi.fn();
    const runtime = {
      openManaged: vi.fn(async () => ({
        kind: 'managed' as const,
        providerId: 'chatgpt' as const,
      })),
      hideAll: vi.fn(async () => undefined),
      openSystemBrowser: vi.fn(async () => undefined),
      openExternalNavigation: vi.fn(async () => undefined),
      openChatGptPlugins: vi.fn(async () => undefined),
      subscribeHostGeometry: vi.fn(async (listener: () => void) => {
        hostGeometryListener = listener;
        return unsubscribeHostGeometry;
      }),
    };
    const rendered = render(
      <BrowserProviderSurface provider={browserChatProvider('chatgpt')} runtime={runtime} />,
    );

    expect(screen.getByLabelText('ChatGPT provider surface')).toBeTruthy();
    await waitFor(() => expect(runtime.openManaged).toHaveBeenCalledOnce());
    await waitFor(() => expect(runtime.subscribeHostGeometry).toHaveBeenCalledOnce());

    hostGeometryListener?.();
    await waitFor(() => expect(runtime.openManaged).toHaveBeenCalledTimes(2));

    rendered.unmount();
    await waitFor(() => expect(runtime.hideAll).toHaveBeenCalledOnce());
    expect(unsubscribeHostGeometry).toHaveBeenCalledOnce();
  });

  it('coalesces geometry bursts while one native surface update is in flight', async () => {
    let hostGeometryListener: (() => void) | undefined;
    let releaseFirstOpen: (() => void) | undefined;
    const firstOpen = new Promise<void>((resolve) => {
      releaseFirstOpen = resolve;
    });
    const runtime = {
      openManaged: vi
        .fn()
        .mockImplementationOnce(async () => {
          await firstOpen;
          return { kind: 'managed' as const, providerId: 'chatgpt' as const };
        })
        .mockResolvedValue({
          kind: 'managed' as const,
          providerId: 'chatgpt' as const,
        }),
      hideAll: vi.fn(async () => undefined),
      openSystemBrowser: vi.fn(async () => undefined),
      openExternalNavigation: vi.fn(async () => undefined),
      openChatGptPlugins: vi.fn(async () => undefined),
      subscribeHostGeometry: vi.fn(async (listener: () => void) => {
        hostGeometryListener = listener;
        return () => undefined;
      }),
    };

    render(<BrowserProviderSurface provider={browserChatProvider('chatgpt')} runtime={runtime} />);
    await waitFor(() => expect(runtime.openManaged).toHaveBeenCalledOnce());

    hostGeometryListener?.();
    hostGeometryListener?.();
    hostGeometryListener?.();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(runtime.openManaged).toHaveBeenCalledOnce();

    releaseFirstOpen?.();
    await waitFor(() => expect(runtime.openManaged).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(runtime.openManaged).toHaveBeenCalledTimes(2);
  });

  it('passes the saved resume location into the managed open lifecycle', async () => {
    const runtime = {
      openManaged: vi.fn(async () => ({
        kind: 'managed' as const,
        providerId: 'chatgpt' as const,
      })),
      hideAll: vi.fn(async () => undefined),
      openSystemBrowser: vi.fn(async () => undefined),
      openExternalNavigation: vi.fn(async () => undefined),
      openChatGptPlugins: vi.fn(async () => undefined),
    };

    const rendered = render(
      <BrowserProviderSurface
        provider={browserChatProvider('chatgpt')}
        navigationUrl="https://chatgpt.com/c/saved-conversation"
        runtime={runtime}
      />,
    );

    await waitFor(() =>
      expect(runtime.openManaged).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'chatgpt' }),
        expect.objectContaining({ width: 900, height: 640 }),
        'https://chatgpt.com/c/saved-conversation',
      ),
    );

    runtime.openManaged.mockClear();
    rendered.rerender(
      <BrowserProviderSurface
        provider={browserChatProvider('chatgpt')}
        navigationUrl="https://chatgpt.com/c/other-conversation"
        runtime={runtime}
      />,
    );

    await waitFor(() =>
      expect(runtime.openManaged).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'chatgpt' }),
        expect.objectContaining({ width: 900, height: 640 }),
        'https://chatgpt.com/c/other-conversation',
      ),
    );
    expect(runtime.hideAll).not.toHaveBeenCalled();
  });

  it('shows a truthful fallback action when managed opening fails', async () => {
    const runtime = {
      openManaged: vi.fn(async () => {
        throw new Error('managed unavailable');
      }),
      hideAll: vi.fn(async () => undefined),
      openSystemBrowser: vi.fn(async () => undefined),
      openExternalNavigation: vi.fn(async () => undefined),
      openChatGptPlugins: vi.fn(async () => undefined),
    };
    render(<BrowserProviderSurface provider={browserChatProvider('claude')} runtime={runtime} />);

    expect(await screen.findByText(/managed provider surface is unavailable/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /open claude in system browser/i })).toBeTruthy();
  });

  it('forwards navigation metadata only for the mounted provider', async () => {
    let navigationListener:
      | ((navigation: {
          providerId: 'chatgpt' | 'claude';
          surfaceId: string;
          url: string;
          timestamp: number;
          kind: 'conversation';
          providerConversationKey: string;
        }) => void)
      | undefined;
    const onNavigation = vi.fn();
    const runtime = {
      openManaged: vi.fn(async () => ({
        kind: 'managed' as const,
        providerId: 'chatgpt' as const,
      })),
      hideAll: vi.fn(async () => undefined),
      openSystemBrowser: vi.fn(async () => undefined),
      openExternalNavigation: vi.fn(async () => undefined),
      openChatGptPlugins: vi.fn(async () => undefined),
      subscribeNavigation: vi.fn(async (listener: typeof navigationListener) => {
        navigationListener = listener;
        return () => undefined;
      }),
    };
    render(
      <BrowserProviderSurface
        provider={browserChatProvider('chatgpt')}
        runtime={runtime}
        onNavigation={onNavigation}
      />,
    );
    await waitFor(() => expect(runtime.subscribeNavigation).toHaveBeenCalledOnce());

    navigationListener?.({
      providerId: 'claude',
      surfaceId: 'browser-chat-claude',
      url: 'https://claude.ai/chat/other',
      timestamp: 1,
      kind: 'conversation',
      providerConversationKey: 'other',
    });
    navigationListener?.({
      providerId: 'chatgpt',
      surfaceId: 'browser-chat-chatgpt',
      url: 'https://chatgpt.com/c/current',
      timestamp: 2,
      kind: 'conversation',
      providerConversationKey: 'current',
    });

    expect(onNavigation).toHaveBeenCalledOnce();
    expect(onNavigation).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'chatgpt', providerConversationKey: 'current' }),
    );
  });

  it('does not report a managed surface ready before native navigation evidence', async () => {
    let hostGeometryListener: (() => void) | undefined;
    let navigationListener:
      | ((navigation: {
          providerId: 'chatgpt';
          surfaceId: string;
          url: string;
          timestamp: number;
          kind: 'conversation';
          providerConversationKey: string;
        }) => void)
      | undefined;
    const runtime = {
      openManaged: vi.fn(async () => ({
        kind: 'managed' as const,
        providerId: 'chatgpt' as const,
      })),
      hideAll: vi.fn(async () => undefined),
      openSystemBrowser: vi.fn(async () => undefined),
      openExternalNavigation: vi.fn(async () => undefined),
      openChatGptPlugins: vi.fn(async () => undefined),
      subscribeHostGeometry: vi.fn(async (listener: () => void) => {
        hostGeometryListener = listener;
        return () => undefined;
      }),
      subscribeNavigation: vi.fn(async (listener: typeof navigationListener) => {
        navigationListener = listener;
        return () => undefined;
      }),
    };

    render(
      <BrowserProviderSurface
        provider={browserChatProvider('chatgpt')}
        navigationUrl="https://chatgpt.com/c/current"
        runtime={runtime}
      />,
    );

    await waitFor(() => expect(runtime.openManaged).toHaveBeenCalledOnce());
    expect(browserChatStore.getState().providerRuntime.chatgpt?.pageStatus).toBe('opening');

    navigationListener?.({
      providerId: 'chatgpt',
      surfaceId: 'browser-chat-chatgpt',
      url: 'https://chatgpt.com/c/current',
      timestamp: 2,
      kind: 'conversation',
      providerConversationKey: 'current',
    });

    await waitFor(() =>
      expect(browserChatStore.getState().providerRuntime.chatgpt?.pageStatus).toBe('ready'),
    );

    hostGeometryListener?.();
    await waitFor(() => expect(runtime.openManaged).toHaveBeenCalledTimes(2));
    expect(browserChatStore.getState().providerRuntime.chatgpt?.pageStatus).toBe('ready');
  });
});
