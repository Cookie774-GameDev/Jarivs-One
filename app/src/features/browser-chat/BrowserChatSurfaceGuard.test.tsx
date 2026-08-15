import * as React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUIStore } from '@/stores/ui';
import { browserChatStore } from './browserChatStore';
import {
  BrowserChatSurfaceGuard,
  shouldShowBrowserChatSurface,
} from './BrowserChatSurfaceGuard';

describe('BrowserChatSurfaceGuard', () => {
  beforeEach(() => {
    useUIStore.setState({ route: 'chat', activeChatId: null });
    browserChatStore.setState({ engine: 'browser', chatPreferences: {} });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('derives visibility from the immediate route and selected chat engine', () => {
    expect(shouldShowBrowserChatSurface({ route: 'chat', engine: 'browser' })).toBe(true);
    expect(shouldShowBrowserChatSurface({ route: 'files', engine: 'browser' })).toBe(false);
    expect(shouldShowBrowserChatSurface({ route: 'chat', engine: 'native' })).toBe(false);
  });

  it('hides native provider children immediately when the route leaves Browser Chat', async () => {
    const runtime = { hideAll: vi.fn(async () => undefined) };
    render(<BrowserChatSurfaceGuard runtime={runtime} />);

    expect(runtime.hideAll).not.toHaveBeenCalled();

    act(() => useUIStore.setState({ route: 'terminal' }));
    await waitFor(() => expect(runtime.hideAll).toHaveBeenCalledOnce());
  });

  it('hides when the active chat switches back to the native engine', async () => {
    const runtime = { hideAll: vi.fn(async () => undefined) };
    render(<BrowserChatSurfaceGuard runtime={runtime} />);

    act(() => browserChatStore.setState({ engine: 'native' }));
    await waitFor(() => expect(runtime.hideAll).toHaveBeenCalledOnce());
  });
});
