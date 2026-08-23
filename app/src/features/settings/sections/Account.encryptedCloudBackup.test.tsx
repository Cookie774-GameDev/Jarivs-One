import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth';
import { Account } from './Account';

const TEST_PASSPHRASE = 'unit-test-only';

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  download: vi.fn(),
  previewRestore: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/features/auth/SignInDialog', () => ({ SignInDialog: () => null }));
vi.mock('@/features/access/workspaceBackup', () => ({
  backupCurrentAccountWorkspace: vi.fn(),
}));
vi.mock('@/features/access/workspaceRestore', () => ({
  previewWorkspaceRestore: mocks.previewRestore,
  restoreWorkspaceBackup: vi.fn(),
  readPortableBackupHistory: () => ({}),
  recordPortableBackupHistory: () => ({}),
}));
vi.mock('@/lib/encryptedCloudBackup', () => ({
  uploadEncryptedCloudBackup: mocks.upload,
  downloadEncryptedCloudBackup: mocks.download,
}));
vi.mock('@/lib/cloudRecovery', () => ({
  previewCloudRecovery: vi.fn(),
  restoreCloudRecovery: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
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

describe('Account encrypted cloud backup', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
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

  it('requires explicit consent and clears the passphrase after encrypted upload', async () => {
    mocks.upload.mockResolvedValue({ createdAt: 42, encryptedBytes: 100 });
    render(<Account profileOnly />);

    const passphrase = screen.getByTestId('encrypted-backup-passphrase') as HTMLInputElement;
    const upload = screen.getByTestId('encrypted-backup-upload') as HTMLButtonElement;
    fireEvent.change(passphrase, { target: { value: TEST_PASSPHRASE } });
    expect(upload.disabled).toBe(true);
    fireEvent.click(screen.getByTestId('encrypted-backup-consent'));
    expect(upload.disabled).toBe(false);

    fireEvent.click(upload);
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledWith(TEST_PASSPHRASE));
    expect(passphrase.value).toBe('');
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'Encrypted cloud backup saved',
      'Only ciphertext was uploaded.',
    );
  });

  it('decrypts locally into the existing restore preview without applying it', async () => {
    mocks.download.mockResolvedValue('{"format":"vibespace-workspace-backup"}');
    mocks.previewRestore.mockResolvedValue({
      accountId: 'cloud-user',
      artifactFingerprint: 'a'.repeat(64),
      createdAt: 1,
      restorable: 2,
      preservedLocal: 3,
      counts: { workspaces: 1, projects: 1, chats: 1, messages: 1, canvasDocuments: 0 },
      rows: {},
    });
    render(<Account profileOnly />);

    const passphrase = screen.getByTestId('encrypted-backup-passphrase') as HTMLInputElement;
    fireEvent.change(passphrase, { target: { value: TEST_PASSPHRASE } });
    fireEvent.click(screen.getByTestId('encrypted-backup-download'));

    await waitFor(() => expect(mocks.download).toHaveBeenCalledWith(TEST_PASSPHRASE));
    expect(mocks.previewRestore).toHaveBeenCalledWith('{"format":"vibespace-workspace-backup"}');
    expect(await screen.findByTestId('portable-backup-preview')).toBeTruthy();
    expect((screen.getByTestId('portable-backup-apply') as HTMLButtonElement).disabled).toBe(true);
    expect(passphrase.value).toBe('');
  });

  it('is unavailable without the cloud-sync plan and never calls cloud operations', async () => {
    useAuthStore.setState({ plan: 'free' });
    render(<Account profileOnly />);

    await waitFor(() =>
      expect((screen.getByTestId('encrypted-backup-passphrase') as HTMLInputElement).disabled).toBe(
        true,
      ),
    );
    expect((screen.getByTestId('encrypted-backup-upload') as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByTestId('encrypted-backup-download') as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
