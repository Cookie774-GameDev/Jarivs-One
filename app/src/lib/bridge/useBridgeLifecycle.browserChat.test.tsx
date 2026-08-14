import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useBridgeLifecycle } from './useBridgeLifecycle';

const lifecycleMocks = vi.hoisted(() => ({
  authState: {
    cloudSession: { user_id: 'account-a' },
    projectId: 'project-a',
  },
  useBrowserChatRelay: vi.fn(() => 'connected'),
  resetBridgeClient: vi.fn(),
}));

vi.mock('@/stores/auth', () => ({
  useAuthStore: (selector: (state: typeof lifecycleMocks.authState) => unknown) =>
    selector(lifecycleMocks.authState),
}));

vi.mock('@/lib/supabase/env', () => ({
  isSupabaseConfigured: () => false,
}));

vi.mock('./useBrowserChatRelay', () => ({
  useBrowserChatRelay: lifecycleMocks.useBrowserChatRelay,
}));

vi.mock('./BridgeClient', () => ({
  getBridgeClient: vi.fn(),
  resetBridgeClient: lifecycleMocks.resetBridgeClient,
}));

describe('global bridge lifecycle host', () => {
  afterEach(() => {
    lifecycleMocks.useBrowserChatRelay.mockClear();
    lifecycleMocks.resetBridgeClient.mockClear();
    vi.unstubAllEnvs();
  });

  it('mounts the Browser Chat relay without mounting BrowserChatHub', () => {
    vi.stubEnv('VITE_PHONE_JARVIS_CLOUD_URL', '');
    const rendered = renderHook(() => useBridgeLifecycle());

    expect(lifecycleMocks.useBrowserChatRelay).toHaveBeenCalledWith(true, {
      accountId: 'account-a',
      projectId: 'project-a',
    });

    rendered.unmount();
  });
});
