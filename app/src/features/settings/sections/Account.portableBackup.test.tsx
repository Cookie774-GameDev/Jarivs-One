import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth';
import { Account } from './Account';

const mocks = vi.hoisted(() => ({
  backup: vi.fn(),
  preview: vi.fn(),
  restore: vi.fn(),
  readHistory: vi.fn(),
  recordHistory: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/features/auth/SignInDialog', () => ({ SignInDialog: () => null }));
vi.mock('@/features/access/workspaceBackup', () => ({
  backupCurrentAccountWorkspace: mocks.backup,
}));
vi.mock('@/features/access/workspaceRestore', () => ({
  previewWorkspaceRestore: mocks.preview,
  restoreWorkspaceBackup: mocks.restore,
  readPortableBackupHistory: mocks.readHistory,
  recordPortableBackupHistory: mocks.recordHistory,
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

describe('Account portable backup', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.readHistory.mockReturnValue({});
    mocks.recordHistory.mockImplementation((_accountId, update) =>
      update === 'export' ? { lastExportAt: 10 } : { lastRestoreAt: 20 },
    );
    useAuthStore.setState({
      displayName: 'Viper',
      localUserId: 'local-user',
      cloudSession: null,
      plan: 'free',
    });
  });

  afterEach(cleanup);

  it('exports locally without requiring a cloud plan and records success', async () => {
    mocks.backup.mockResolvedValue({
      filename: 'vibespace-backup-v1.json',
      byteSize: 100,
      counts: { workspaces: 1, projects: 1, chats: 2, messages: 3, canvasDocuments: 1 },
    });
    render(<Account profileOnly />);

    fireEvent.click(screen.getByTestId('portable-backup-export'));
    await waitFor(() => expect(mocks.backup).toHaveBeenCalledTimes(1));
    expect(mocks.recordHistory).toHaveBeenCalledWith('local-user', 'export');
    expect(screen.getByTestId('portable-backup-status').textContent).toMatch(
      /1 workspace, 2 chats, and 1 canvas/i,
    );
  });

  it('previews a selected file and requires confirmation before additive restore', async () => {
    const preview = {
      accountId: 'local-user',
      artifactFingerprint: 'a'.repeat(64),
      createdAt: 1,
      restorable: 3,
      preservedLocal: 2,
      counts: { workspaces: 1, projects: 1, chats: 1, messages: 2, canvasDocuments: 0 },
      rows: {},
    };
    mocks.preview.mockResolvedValue(preview);
    mocks.restore.mockResolvedValue({ restored: 3, preservedLocal: 2 });
    render(<Account profileOnly />);

    const file = new File(['{}'], 'vibespace-backup-v1.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => '{}' });
    fireEvent.change(screen.getByTestId('portable-backup-file'), { target: { files: [file] } });

    await waitFor(() => expect(mocks.preview).toHaveBeenCalledWith('{}'));
    expect(await screen.findByTestId('portable-backup-preview')).toBeTruthy();
    const apply = screen.getByTestId('portable-backup-apply') as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    fireEvent.click(screen.getByTestId('portable-backup-confirm'));
    expect(apply.disabled).toBe(false);

    fireEvent.click(apply);
    await waitFor(() => expect(mocks.restore).toHaveBeenCalledWith(preview));
    expect(mocks.recordHistory).toHaveBeenCalledWith('local-user', 'restore');
    expect(screen.getByTestId('portable-backup-status').textContent).toMatch(
      /3 records restored.*2 existing local records preserved/i,
    );
  });

  it('surfaces a bounded restore error and does not expose an apply action', async () => {
    mocks.preview.mockRejectedValue(new Error('This backup belongs to a different account.'));
    mocks.recordHistory.mockReturnValue({
      lastErrorAt: 30,
      lastError: 'This backup belongs to a different account.',
    });
    render(<Account profileOnly />);

    const file = new File(['{}'], 'wrong.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => '{}' });
    fireEvent.change(screen.getByTestId('portable-backup-file'), { target: { files: [file] } });

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(screen.queryByTestId('portable-backup-apply')).toBeNull();
    expect(screen.getByTestId('portable-backup-status').textContent).toMatch(/different account/i);
  });

  it('does not report a completed export as failed when optional history storage is unavailable', async () => {
    mocks.backup.mockResolvedValue({
      filename: 'vibespace-backup-v1.json',
      byteSize: 100,
      counts: { workspaces: 1, projects: 0, chats: 0, messages: 0, canvasDocuments: 0 },
    });
    mocks.recordHistory.mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    render(<Account profileOnly />);

    fireEvent.click(screen.getByTestId('portable-backup-export'));
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(screen.getByTestId('portable-backup-status').textContent).toMatch(/Saved 1 workspace/i);
  });
});
