import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth';
import { APP_ADMIN_CAPABILITY } from './entitlements';

const supabase = vi.hoisted(() => ({
  getClient: vi.fn(),
  getSession: vi.fn(),
  invoke: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: supabase.getClient,
}));

import {
  clearCloudAdminCache,
  createJarvisEntitlementSnapshotProvider,
  fetchCloudAdminEntitlementSnapshot,
  fetchCloudAdminStatus,
  useAppAdmin,
  useAppEntitlementSnapshot,
} from './admin';

const NOW = 1_750_000_000_000;

afterEach(() => {
  vi.unstubAllEnvs();
});

function sessionFor(userId: string | undefined) {
  return {
    data: {
      session: userId ? { user: { id: userId } } : null,
    },
    error: null,
  };
}

function sessionErrorFor(userId: string) {
  return {
    data: { session: { user: { id: userId } } },
    error: { message: 'session_invalid' },
  };
}

function configureClient(userId = 'user-a') {
  supabase.getSession.mockResolvedValue(sessionFor(userId));
  supabase.getClient.mockReturnValue({
    auth: { getSession: supabase.getSession },
    functions: { invoke: supabase.invoke },
    rpc: supabase.rpc,
  });
}

async function flushPromises(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

describe('cloud entitlement snapshots', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    supabase.getClient.mockReset();
    supabase.getSession.mockReset();
    supabase.invoke.mockReset();
    supabase.rpc.mockReset();
    clearCloudAdminCache();
    configureClient();
  });

  it('maps a true authenticated Edge result to a verified admin snapshot', async () => {
    supabase.invoke.mockResolvedValue({
      data: { admin_unlimited: true, plan: 'ultra' },
      error: null,
    });

    const snapshot = await fetchCloudAdminEntitlementSnapshot('user-a');

    expect(snapshot).toEqual({
      source: 'server',
      planId: 'ultra',
      capabilities: [APP_ADMIN_CAPABILITY],
      verifiedAt: NOW,
      expiresAt: NOW + 5 * 60_000,
    });
    expect(supabase.invoke).toHaveBeenCalledWith('get-message-usage');
    expect(supabase.getSession).toHaveBeenCalledTimes(2);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('maps a false server result to verified evidence without admin capability', async () => {
    supabase.invoke.mockResolvedValue({
      data: { admin_unlimited: false, plan: 42 },
      error: null,
    });

    await expect(fetchCloudAdminEntitlementSnapshot('user-a')).resolves.toEqual({
      source: 'server',
      capabilities: [],
      verifiedAt: NOW,
      expiresAt: NOW + 5 * 60_000,
    });
  });

  it.each([
    ['missing user', undefined],
    ['blank user', '   '],
  ])('returns unavailable for a %s', async (_label, userId) => {
    await expect(fetchCloudAdminEntitlementSnapshot(userId)).resolves.toEqual({
      source: 'unavailable',
      capabilities: [],
    });
    expect(supabase.invoke).not.toHaveBeenCalled();
  });

  it('returns unavailable without a client', async () => {
    supabase.getClient.mockReturnValue(null);
    await expect(fetchCloudAdminEntitlementSnapshot('user-a')).resolves.toEqual({
      source: 'unavailable',
      capabilities: [],
    });
  });

  it('rejects a pre-request auth error even when session data contains the requested account', async () => {
    supabase.getSession.mockResolvedValue(sessionErrorFor('user-a'));

    await expect(fetchCloudAdminEntitlementSnapshot('user-a')).resolves.toEqual({
      source: 'unavailable',
      capabilities: [],
    });
    expect(supabase.invoke).not.toHaveBeenCalled();
  });

  it('rejects session evidence whose error field is missing', async () => {
    supabase.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-a' } } },
    });
    supabase.invoke.mockResolvedValue({ data: { admin_unlimited: true }, error: null });

    await expect(fetchCloudAdminEntitlementSnapshot('user-a')).resolves.toEqual({
      source: 'unavailable',
      capabilities: [],
    });
    expect(supabase.invoke).not.toHaveBeenCalled();
  });

  it.each([
    Object.assign([], { session: { user: { id: 'user-a' } } }),
    { session: Object.assign([], { user: { id: 'user-a' } }) },
    { session: { user: Object.assign([], { id: 'user-a' }) } },
  ])('rejects array-shaped session evidence %#', async (data) => {
    supabase.getSession.mockResolvedValue({ data, error: null });
    supabase.invoke.mockResolvedValue({ data: { admin_unlimited: true }, error: null });

    await expect(fetchCloudAdminEntitlementSnapshot('user-a')).resolves.toEqual({
      source: 'unavailable',
      capabilities: [],
    });
    expect(supabase.invoke).not.toHaveBeenCalled();
  });

  it('rejects a post-request auth error and never caches that authority', async () => {
    supabase.getSession
      .mockResolvedValueOnce(sessionFor('user-a'))
      .mockResolvedValueOnce(sessionErrorFor('user-a'));
    supabase.invoke.mockResolvedValueOnce({ data: { admin_unlimited: true }, error: null });

    await expect(fetchCloudAdminEntitlementSnapshot('user-a')).resolves.toEqual({
      source: 'unavailable',
      capabilities: [],
    });

    supabase.getSession.mockResolvedValue(sessionFor('user-a'));
    supabase.invoke.mockResolvedValueOnce({ data: { admin_unlimited: false }, error: null });
    await expect(fetchCloudAdminEntitlementSnapshot('user-a')).resolves.toEqual(
      expect.objectContaining({ source: 'server', capabilities: [] }),
    );
    expect(supabase.invoke).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['Edge error', { data: null, error: { message: 'denied' } }],
    ['malformed response', { data: { admin_unlimited: 'true' }, error: null }],
  ])('returns unavailable for an %s', async (_label, response) => {
    supabase.invoke.mockResolvedValue(response);
    await expect(fetchCloudAdminEntitlementSnapshot('user-a')).resolves.toEqual({
      source: 'unavailable',
      capabilities: [],
    });
  });

  it('returns unavailable when the Edge Function throws', async () => {
    supabase.invoke.mockRejectedValue(new Error('offline'));
    await expect(fetchCloudAdminEntitlementSnapshot('user-a')).resolves.toEqual({
      source: 'unavailable',
      capabilities: [],
    });
  });

  it('requires the exact signed-in account before and after the request', async () => {
    supabase.getSession
      .mockResolvedValueOnce(sessionFor('user-a'))
      .mockResolvedValueOnce(sessionFor('user-b'));
    supabase.invoke.mockResolvedValue({ data: { admin_unlimited: true }, error: null });

    await expect(fetchCloudAdminEntitlementSnapshot('user-a')).resolves.toEqual({
      source: 'unavailable',
      capabilities: [],
    });
  });

  it('scopes complete cache entries by user, expires them, and clears them explicitly', async () => {
    supabase.invoke.mockResolvedValue({ data: { admin_unlimited: true }, error: null });

    await fetchCloudAdminEntitlementSnapshot('user-a');
    await fetchCloudAdminEntitlementSnapshot('user-a');
    expect(supabase.invoke).toHaveBeenCalledTimes(1);

    configureClient('user-b');
    supabase.invoke.mockResolvedValueOnce({ data: { admin_unlimited: false }, error: null });
    await fetchCloudAdminEntitlementSnapshot('user-b');
    expect(supabase.invoke).toHaveBeenCalledTimes(2);

    configureClient('user-a');
    vi.advanceTimersByTime(5 * 60_000 + 1);
    await fetchCloudAdminEntitlementSnapshot('user-a');
    expect(supabase.invoke).toHaveBeenCalledTimes(3);

    clearCloudAdminCache();
    await fetchCloudAdminEntitlementSnapshot('user-a');
    expect(supabase.invoke).toHaveBeenCalledTimes(4);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('keeps the boolean compatibility wrapper derived from the typed snapshot', async () => {
    supabase.invoke.mockResolvedValue({ data: { admin_unlimited: true }, error: null });
    await expect(fetchCloudAdminStatus('user-a')).resolves.toBe(true);
  });
});

describe('React entitlement selectors', () => {
  beforeEach(() => {
    vi.useRealTimers();
    clearCloudAdminCache();
    supabase.getClient.mockReset();
    supabase.getSession.mockReset();
    supabase.invoke.mockReset();
    supabase.rpc.mockReset();
    supabase.getSession.mockImplementation(async () =>
      sessionFor(useAuthStore.getState().cloudSession?.user_id),
    );
    supabase.getClient.mockReturnValue({
      auth: { getSession: supabase.getSession },
      functions: { invoke: supabase.invoke },
      rpc: supabase.rpc,
    });
    useAuthStore.setState({
      email: undefined,
      localUserId: null,
      cloudSession: {
        user_id: 'user-a',
        email: 'a@example.com',
        expires_at: Date.now() + 60_000,
      },
    });
  });

  it('returns only a boolean, drops the old account, and lets authoritative false suppress development fallback', async () => {
    vi.stubEnv('VITE_JARVIS_ADMIN', 'true');
    supabase.invoke
      .mockResolvedValueOnce({ data: { admin_unlimited: true }, error: null })
      .mockResolvedValueOnce({ data: { admin_unlimited: false }, error: null });

    const adminHook = renderHook(() => useAppAdmin());
    await waitFor(() => expect(adminHook.result.current).toBe(true));
    expect(typeof adminHook.result.current).toBe('boolean');

    act(() => {
      useAuthStore.setState({
        cloudSession: {
          user_id: 'user-b',
          email: 'b@example.com',
          expires_at: Date.now() + 60_000,
        },
      });
    });

    expect(adminHook.result.current).toBe(false);
    await waitFor(() => expect(supabase.invoke).toHaveBeenCalledTimes(2));
    expect(adminHook.result.current).toBe(false);
    expect(supabase.rpc).not.toHaveBeenCalled();
    adminHook.unmount();
  });

  it('exposes the same typed snapshot used by the boolean selector', async () => {
    supabase.invoke.mockResolvedValue({ data: { admin_unlimited: true }, error: null });
    const { result } = renderHook(() => useAppEntitlementSnapshot());
    await waitFor(() => expect(result.current.source).toBe('server'));
    expect(result.current.capabilities).toContain(APP_ADMIN_CAPABILITY);
  });

  it('fails closed at expiry, refreshes the same account once, and clears its timer on unmount', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    useAuthStore.setState({
      cloudSession: {
        user_id: 'user-a',
        email: 'a@example.com',
        expires_at: NOW + 60_000,
      },
    });
    let resolveRefresh!: (result: { data: { admin_unlimited: boolean }; error: null }) => void;
    supabase.invoke
      .mockResolvedValueOnce({ data: { admin_unlimited: true }, error: null })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRefresh = resolve;
          }),
      );

    const { result, unmount } = renderHook(() => useAppEntitlementSnapshot());
    await act(async () => flushPromises());
    expect(result.current.capabilities).toContain(APP_ADMIN_CAPABILITY);

    act(() => {
      vi.advanceTimersByTime(5 * 60_000);
    });
    expect(result.current).toEqual({ source: 'unavailable', capabilities: [] });
    await act(async () => flushPromises());
    expect(supabase.invoke).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveRefresh({ data: { admin_unlimited: false }, error: null });
      await flushPromises();
    });
    expect(result.current.source).toBe('server');
    expect(result.current.capabilities).toEqual([]);

    unmount();
    act(() => {
      vi.advanceTimersByTime(10 * 60_000);
    });
    expect(supabase.invoke).toHaveBeenCalledTimes(2);
  });
});

describe('createJarvisEntitlementSnapshotProvider', () => {
  it('allows only the exact active account and rejects signed-out, cross-account, stale, and expired results', async () => {
    let activeAccountId: string | undefined = 'account-a';
    let now = NOW;
    let release!: (value: {
      source: 'server';
      capabilities: string[];
      verifiedAt: number;
      expiresAt: number;
    }) => void;
    const pending = new Promise<{
      source: 'server';
      capabilities: string[];
      verifiedAt: number;
      expiresAt: number;
    }>((resolve) => {
      release = resolve;
    });
    const load = vi.fn(() => pending);
    const provider = createJarvisEntitlementSnapshotProvider({
      getActiveAccountId: () => activeAccountId,
      loadForActiveAccount: load,
      now: () => now,
    });

    await expect(provider.getForAccount('account-b')).resolves.toEqual({
      source: 'unavailable',
      capabilities: [],
    });
    expect(load).not.toHaveBeenCalled();

    const inFlight = provider.getForAccount('account-a');
    activeAccountId = 'account-b';
    release({
      source: 'server',
      capabilities: [APP_ADMIN_CAPABILITY],
      verifiedAt: NOW,
      expiresAt: NOW + 1_000,
    });
    await expect(inFlight).resolves.toEqual({ source: 'unavailable', capabilities: [] });

    activeAccountId = undefined;
    await expect(provider.getForAccount('account-a')).resolves.toEqual({
      source: 'unavailable',
      capabilities: [],
    });

    activeAccountId = 'account-a';
    const expiredProvider = createJarvisEntitlementSnapshotProvider({
      getActiveAccountId: () => activeAccountId,
      loadForActiveAccount: async () => ({
        source: 'server',
        capabilities: [APP_ADMIN_CAPABILITY],
        verifiedAt: NOW,
        expiresAt: NOW,
      }),
      now: () => now,
    });
    await expect(expiredProvider.getForAccount('account-a')).resolves.toEqual({
      source: 'unavailable',
      capabilities: [],
    });

    const missingExpiryProvider = createJarvisEntitlementSnapshotProvider({
      getActiveAccountId: () => activeAccountId,
      loadForActiveAccount: async () => ({
        source: 'server',
        capabilities: [APP_ADMIN_CAPABILITY],
        verifiedAt: NOW,
      }),
      now: () => now,
    });
    await expect(missingExpiryProvider.getForAccount('account-a')).resolves.toEqual({
      source: 'unavailable',
      capabilities: [],
    });

    now = NOW - 1;
    const valid = await expiredProvider.getForAccount('account-a');
    expect(valid.source).toBe('server');
  });
});
