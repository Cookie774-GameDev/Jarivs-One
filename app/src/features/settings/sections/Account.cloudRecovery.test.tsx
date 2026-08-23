import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth';
import { Account } from './Account';

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  restore: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
}));

vi.mock('@/features/auth/SignInDialog', () => ({ SignInDialog: () => null }));
vi.mock('@/lib/cloudRecovery', () => ({
  previewCloudRecovery: mocks.preview,
  restoreCloudRecovery: mocks.restore,
}));
vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }),
    }),
    auth: { updateUser: vi.fn(), signOut: vi.fn() },
  }),
}));
vi.mock('@/components/ui/toast', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
    info: vi.fn(),
  },
}));

describe('Account cloud recovery', () => {
  beforeEach(() => {
    mocks.preview.mockReset();
    mocks.restore.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
    mocks.maybeSingle.mockClear();
    useAuthStore.setState({
      displayName: 'Viper',
      localUserId: 'local-user',
      cloudSession: {
        user_id: 'cloud-user',
        email: 'viper@example.test',
        expires_at: Date.now() / 1000 + 3600,
      },
      plan: 'pro',
    });
  });

  afterEach(cleanup);

  it('requires a preview and explicit confirmation before a non-destructive restore', async () => {
    const preview = {
      userId: 'cloud-user',
      createdAt: 1,
      totalCloudRecords: 8,
      recoverable: 3,
      cloudNewer: 1,
      preservedLocal: 2,
      skippedDeleted: 2,
      rejected: 0,
      byTable: { chats: 2, messages: 4 },
      candidates: [],
    };
    mocks.preview.mockResolvedValue(preview);
    mocks.restore.mockResolvedValue({ restored: 4, preservedLocal: 2, skippedDeleted: 2 });

    render(<Account profileOnly />);

    expect(
      screen.getByText(/API keys, credentials, settings blobs, terminal transcripts/i),
    ).toBeTruthy();
    expect(screen.queryByTestId('cloud-recovery-preview')).toBeNull();

    fireEvent.click(screen.getByTestId('cloud-recovery-scan'));
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledWith('cloud-user'));
    expect(await screen.findByTestId('cloud-recovery-preview')).toBeTruthy();

    const apply = screen.getByTestId('cloud-recovery-apply') as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    fireEvent.click(screen.getByTestId('cloud-recovery-confirm'));
    expect(apply.disabled).toBe(false);

    fireEvent.click(apply);
    await waitFor(() => expect(mocks.restore).toHaveBeenCalledWith(preview));
    await waitFor(() =>
      expect(screen.getByTestId('cloud-recovery-status').textContent).toMatch(
        /4 records recovered/i,
      ),
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'Cloud recovery complete',
      'Your newer local data was preserved.',
    );
  });

  it('does not expose a usable recovery action without a signed-in cloud account', () => {
    useAuthStore.setState({ cloudSession: null, plan: 'free' });
    render(<Account profileOnly />);

    expect((screen.getByTestId('cloud-recovery-scan') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('cloud-recovery-status').textContent).toMatch(/Sign in/i);
    expect(mocks.preview).not.toHaveBeenCalled();
  });
});
