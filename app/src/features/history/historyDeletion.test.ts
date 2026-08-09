import { describe, expect, it, vi } from 'vitest';
import { deleteHistoryChats, historyDeletionFeedback } from './historyDeletion';

describe('history deletion', () => {
  it('deletes each scoped chat once in deterministic order', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);

    await expect(
      deleteHistoryChats(['chat-b', 'chat-a', 'chat-b'], {
        expectedWorkspaceId: 'workspace-a',
        getActiveWorkspaceId: () => 'workspace-a',
        read: async (id) => ({ id, workspace_id: 'workspace-a' }),
        remove,
      }),
    ).resolves.toEqual({ deletedIds: ['chat-b', 'chat-a'] });

    expect(remove.mock.calls).toEqual([['chat-b'], ['chat-a']]);
  });

  it('bounds bulk clear work to the visible history limit', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const ids = Array.from({ length: 205 }, (_, index) => `chat-${index}`);

    await expect(
      deleteHistoryChats(ids, {
        expectedWorkspaceId: 'workspace-a',
        getActiveWorkspaceId: () => 'workspace-a',
        read: async (id) => ({ id, workspace_id: 'workspace-a' }),
        remove,
      }),
    ).rejects.toThrow(/too many/i);
    expect(remove).not.toHaveBeenCalled();
  });

  it('rereads ownership and stops before deleting after an active workspace switch', async () => {
    let activeWorkspace = 'workspace-a';
    const remove = vi.fn(async () => {
      activeWorkspace = 'workspace-b';
    });

    await expect(
      deleteHistoryChats(['chat-a', 'chat-b'], {
        expectedWorkspaceId: 'workspace-a',
        getActiveWorkspaceId: () => activeWorkspace,
        read: async (id) => ({ id, workspace_id: 'workspace-a' }),
        remove,
      }),
    ).resolves.toMatchObject({
      deletedIds: ['chat-a'],
      failedId: 'chat-b',
      error: expect.stringMatching(/workspace changed/i),
    });
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('fails closed when a reread chat belongs to another workspace', async () => {
    const remove = vi.fn();
    await expect(
      deleteHistoryChats(['chat-a'], {
        expectedWorkspaceId: 'workspace-a',
        getActiveWorkspaceId: () => 'workspace-a',
        read: async (id) => ({ id, workspace_id: 'workspace-b' }),
        remove,
      }),
    ).resolves.toMatchObject({
      deletedIds: [],
      failedId: 'chat-a',
      error: expect.stringMatching(/does not belong/i),
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it('truthfully reconciles selection and messaging after a partial delete', () => {
    expect(
      historyDeletionFeedback(
        {
          deletedIds: ['chat-a'],
          failedId: 'chat-b',
          error: 'The active workspace changed.',
        },
        'chat-a',
      ),
    ).toEqual({
      clearSelection: true,
      tone: 'error',
      title: 'History partially cleared',
      message: '1 deleted before stopping safely. The active workspace changed.',
    });
    expect(
      historyDeletionFeedback(
        { deletedIds: [], failedId: 'chat-a', error: 'Delete failed.' },
        'chat-a',
      ).clearSelection,
    ).toBe(false);
  });
});
