import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.hoisted(() => ({
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

import { InstalledAccessAppHost } from './AccessAppHost';
import { useAuthStore } from '@/stores/auth';

describe('InstalledAccessAppHost signed-out production boot', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_ACCESS_GATE_ENABLED', 'true');
    authMock.getSession.mockReset();
    authMock.onAuthStateChange.mockReset();
    authMock.unsubscribe.mockReset();
    authMock.getSession.mockResolvedValue({ data: { session: null }, error: null });
    authMock.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: authMock.unsubscribe } },
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

    expect(
      await screen.findByRole('heading', { name: 'Sign in to VibeSpace' }),
    ).toBeTruthy();
    expect(screen.queryByText('Protected workspace')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('dialog', { name: 'Cloud authentication' }).getAttribute('data-mode')).toBe('signin');

    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('dialog', { name: 'Cloud authentication' }).getAttribute('data-mode')).toBe('signup');
  });
});
