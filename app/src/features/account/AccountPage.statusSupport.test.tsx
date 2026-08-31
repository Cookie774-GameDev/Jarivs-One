import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCombinedUsage: vi.fn(),
  openExternal: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock('@/features/settings/sections/Account', () => ({
  Account: () => <div>Account profile</div>,
}));

vi.mock('@/features/pets/PetAccountPanel', () => ({
  PetAccountPanel: () => <div>Pet account</div>,
}));

vi.mock('./AccountSecurityPanel', () => ({
  AccountSecurityPanel: () => <div>Account security</div>,
}));

vi.mock('@/lib/admin', () => ({
  useAppAdmin: () => false,
}));

vi.mock('@/lib/billing/checkout', () => ({
  callCheckoutSession: vi.fn(),
  callCustomerPortal: vi.fn(),
  isBackendBillingConfigured: () => true,
}));

vi.mock('@/features/billing/planLimits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/billing/planLimits')>();
  return { ...actual, getCombinedUsage: mocks.getCombinedUsage };
});

vi.mock('@/lib/tauri', () => ({
  openExternal: mocks.openExternal,
}));

vi.mock('@/components/ui/toast', () => ({
  toast: {
    error: mocks.toastError,
    info: mocks.toastInfo,
    success: mocks.toastSuccess,
  },
}));

import { AccountPage } from './AccountPage';
import { useAuthStore } from '@/stores/auth';

describe('AccountPage status support', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/?tab=support');
    mocks.getCombinedUsage.mockReset();
    mocks.openExternal.mockReset();
    mocks.openExternal.mockResolvedValue(undefined);
    mocks.toastError.mockReset();
    mocks.toastInfo.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.writeText.mockReset();
    mocks.writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: mocks.writeText },
    });
    useAuthStore.setState({ cloudSession: null, plan: 'free' });
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState({}, '', '/');
  });

  it('offers explicit keyboard buttons for each support email copy action', async () => {
    render(<AccountPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy support email address' }));
    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith('support@vibespaceos.com'));

    fireEvent.click(screen.getByRole('button', { name: 'Copy security email address' }));
    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith('security@vibespaceos.com'));
  });

  it.each([
    ['Open documentation', 'https://github.com/Cookie774-GameDev/VibeSpace#readme'],
    ['Download VibeSpace', 'https://github.com/Cookie774-GameDev/VibeSpace/blob/main/DOWNLOAD.md'],
    [
      'Read open-source license',
      'https://github.com/Cookie774-GameDev/VibeSpace/blob/main/LICENSE',
    ],
  ])('opens the canonical destination from %s', async (label, destination) => {
    render(<AccountPage />);

    fireEvent.click(screen.getByRole('button', { name: label }));

    await waitFor(() => expect(mocks.openExternal).toHaveBeenCalledWith(destination));
  });

  it('reports a failed external support handoff instead of silently dropping it', async () => {
    mocks.openExternal.mockRejectedValueOnce(new Error('native open failed'));
    render(<AccountPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Open documentation' }));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        'Could not open documentation',
        'native open failed',
      ),
    );
  });

  it('associates the readable Support heading with its icon-led contained layout', () => {
    render(<AccountPage />);

    const heading = screen.getByRole('heading', { level: 2, name: 'Support' });
    const panel = heading.closest('section');
    expect(panel?.querySelector('[data-account-heading-icon]')).toBeTruthy();
    expect(panel?.querySelector('.account-support-grid')).toBeTruthy();
  });
});
