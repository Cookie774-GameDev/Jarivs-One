import * as React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.hoisted(() => ({
  authListener: null as ((event: string, session: unknown) => void) | null,
  createRuntime: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: authMock.getSession,
      onAuthStateChange: authMock.onAuthStateChange,
    },
  }),
}));

vi.mock('@/features/auth/SignInDialog', () => ({
  SignInDialog: ({ open, initialMode }: { open: boolean; initialMode?: string }) =>
    open ? (
      <div role="dialog" aria-label="Cloud authentication" data-mode={initialMode}>
        Authentication dialog
      </div>
    ) : null,
}));

vi.mock('./installedAccessRuntime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./installedAccessRuntime')>();
  return {
    ...actual,
    createInstalledAccessRuntime: authMock.createRuntime,
  };
});

import { InstalledAccessAppHost } from './AccessAppHost';
import { useAuthStore } from '@/stores/auth';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function session(userId: string) {
  return {
    user: { id: userId, email: `${userId}@example.test` },
    expires_at: 2_000_000_000,
  };
}

function activeViewModel() {
  return {
    host: {
      displayState: 'active',
      featureTier: 'free',
      usable: true,
      capturedAt: 1_785_000_000_000,
    },
  };
}

describe('InstalledAccessAppHost signed-out production boot', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_ACCESS_GATE_ENABLED', 'true');
    authMock.getSession.mockReset();
    authMock.onAuthStateChange.mockReset();
    authMock.unsubscribe.mockReset();
    authMock.createRuntime.mockReset();
    authMock.authListener = null;
    authMock.createRuntime.mockImplementation(() => ({
      loadViewModel: vi.fn(async () => activeViewModel()),
    }));
    authMock.getSession.mockResolvedValue({ data: { session: null }, error: null });
    authMock.onAuthStateChange.mockImplementation((listener) => {
      authMock.authListener = listener;
      return {
        data: { subscription: { unsubscribe: authMock.unsubscribe } },
      };
    });
    useAuthStore.setState({ cloudSession: null, plan: 'free' });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it('keeps sign-in and account creation reachable before Access checks the workspace', async () => {
    render(
      <InstalledAccessAppHost>
        <p>Protected workspace</p>
      </InstalledAccessAppHost>,
    );

    expect(await screen.findByRole('heading', { name: 'Sign in to VibeSpace' })).toBeTruthy();
    expect(screen.queryByText('Protected workspace')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(
      screen.getByRole('dialog', { name: 'Cloud authentication' }).getAttribute('data-mode'),
    ).toBe('signin');

    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(
      screen.getByRole('dialog', { name: 'Cloud authentication' }).getAttribute('data-mode'),
    ).toBe('signup');
  });

  it('fails closed and reloads Access when two accounts share the same feature tier', async () => {
    authMock.getSession.mockResolvedValue({ data: { session: session('account-a') }, error: null });
    const accountB = deferred<ReturnType<typeof activeViewModel>>();
    authMock.createRuntime.mockImplementation(() => ({
      loadViewModel: vi.fn(() =>
        useAuthStore.getState().cloudSession?.user_id === 'account-b'
          ? accountB.promise
          : Promise.resolve(activeViewModel()),
      ),
    }));

    render(
      <InstalledAccessAppHost>
        <p>Protected workspace</p>
      </InstalledAccessAppHost>,
    );
    expect(await screen.findByText('Protected workspace')).toBeTruthy();

    act(() => authMock.authListener?.('SIGNED_IN', session('account-b')));
    expect(screen.queryByText('Protected workspace')).toBeNull();
    expect(screen.getByRole('status').textContent).toMatch(/Checking your access status/i);

    await act(async () => accountB.resolve(activeViewModel()));
    expect(await screen.findByText('Protected workspace')).toBeTruthy();
  });

  it('ignores a delayed bootstrap session after a newer auth event', async () => {
    const initial = deferred<{ data: { session: ReturnType<typeof session> }; error: null }>();
    authMock.getSession.mockReturnValue(initial.promise);

    render(
      <InstalledAccessAppHost>
        <p>Protected workspace</p>
      </InstalledAccessAppHost>,
    );
    await waitFor(() => expect(authMock.authListener).not.toBeNull());

    act(() => authMock.authListener?.('SIGNED_IN', session('account-b')));
    await waitFor(() => expect(useAuthStore.getState().cloudSession?.user_id).toBe('account-b'));

    await act(async () =>
      initial.resolve({ data: { session: session('account-a') }, error: null }),
    );
    expect(useAuthStore.getState().cloudSession?.user_id).toBe('account-b');
  });
});
