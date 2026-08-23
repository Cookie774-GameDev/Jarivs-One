import { describe, expect, it, vi } from 'vitest';
import {
  CLOUD_RECOVERY_TABLES,
  CloudRecoveryAuthorityChangedError,
  createCloudRecoveryService,
  type CloudRecoveryRecord,
} from './cloudRecovery';

function record(
  tableName: string,
  rowId: string,
  payload: Record<string, unknown> | null,
  options: Partial<CloudRecoveryRecord> = {},
): CloudRecoveryRecord {
  return {
    user_id: 'user-a',
    table_name: tableName,
    row_id: rowId,
    op: payload ? 'update' : 'delete',
    payload,
    updated_at: '2026-08-22T12:00:00.000Z',
    ...options,
  };
}

describe('explicit cloud recovery', () => {
  it('keeps the allowlist limited to core user data and excludes private surfaces', () => {
    expect(CLOUD_RECOVERY_TABLES).toEqual([
      'workspaces',
      'projects',
      'agents',
      'chats',
      'messages',
      'tasks',
      'memory_items',
      'events',
      'quick_link_groups',
      'quick_links',
    ]);
    expect(CLOUD_RECOVERY_TABLES).not.toContain('settings');
    expect(CLOUD_RECOVERY_TABLES).not.toContain('terminal_sessions');
    expect(CLOUD_RECOVERY_TABLES).not.toContain('terminal_scrollback');
    expect(CLOUD_RECOVERY_TABLES).not.toContain('integrations');
    expect(CLOUD_RECOVERY_TABLES.some((table) => table.startsWith('context_'))).toBe(false);
  });

  it('previews only exact-account, exact-identity, supported records', async () => {
    const service = createCloudRecoveryService({
      currentUserId: vi.fn(async () => 'user-a'),
      listRecords: vi.fn(async () => [
        record('chats', 'chat-new', { id: 'chat-new', updated_at: 20 }),
        record('chats', 'chat-conflict', { id: 'different-id', updated_at: 20 }),
        record('settings', 'secret-looking-setting', { key: 'secret-looking-setting' }),
        record('messages', 'msg-other', { id: 'msg-other' }, { user_id: 'user-b' }),
        record('messages', 'msg-deleted', null),
      ]),
      readLocal: vi.fn(async () => undefined),
      putMany: vi.fn(async () => undefined),
    });

    const preview = await service.preview('user-a');

    expect(preview).toMatchObject({
      userId: 'user-a',
      recoverable: 1,
      cloudNewer: 0,
      preservedLocal: 0,
      skippedDeleted: 1,
      rejected: 3,
      totalCloudRecords: 5,
    });
    expect(preview.byTable).toEqual({ chats: 1 });
  });

  it('restores new and cloud-newer rows without deleting or replacing newer local data', async () => {
    const local = new Map<string, Record<string, unknown>>([
      ['chats:cloud-newer', { id: 'cloud-newer', updated_at: 10 }],
      ['chats:local-newer', { id: 'local-newer', updated_at: 50 }],
      ['chats:same', { id: 'same', updated_at: 20 }],
      ['chats:ambiguous', { id: 'ambiguous' }],
      ['messages:deleted', { id: 'deleted', created_at: 1 }],
    ]);
    const putMany = vi.fn(async (rows: readonly { tableName: string; payload: object }[]) => {
      for (const row of rows) {
        const payload = row.payload as Record<string, unknown>;
        local.set(`${row.tableName}:${String(payload.id)}`, payload);
      }
    });
    const service = createCloudRecoveryService({
      currentUserId: vi.fn(async () => 'user-a'),
      listRecords: vi.fn(async () => [
        record('chats', 'new', { id: 'new', updated_at: 20 }),
        record('chats', 'cloud-newer', { id: 'cloud-newer', updated_at: 20 }),
        record('chats', 'local-newer', { id: 'local-newer', updated_at: 20 }),
        record('chats', 'same', { id: 'same', updated_at: 20 }),
        record('chats', 'ambiguous', { id: 'ambiguous' }),
        record('messages', 'deleted', null),
      ]),
      readLocal: vi.fn(async (tableName, rowId) => local.get(`${tableName}:${rowId}`)),
      putMany,
    });

    const preview = await service.preview('user-a');
    expect(preview).toMatchObject({
      recoverable: 1,
      cloudNewer: 1,
      preservedLocal: 3,
      skippedDeleted: 1,
      rejected: 0,
    });

    const result = await service.restore(preview);

    expect(result).toEqual({ restored: 2, preservedLocal: 3, skippedDeleted: 1 });
    expect(putMany).toHaveBeenCalledTimes(1);
    expect(
      putMany.mock.calls[0]?.[0].map((row) => {
        const payload = row.payload as { id?: unknown };
        return `${row.tableName}:${String(payload.id)}`;
      }),
    ).toEqual(['chats:new', 'chats:cloud-newer']);
    expect(local.get('chats:local-newer')).toEqual({ id: 'local-newer', updated_at: 50 });
    expect(local.get('messages:deleted')).toEqual({ id: 'deleted', created_at: 1 });
  });

  it('fails closed when the authenticated account changes after preview', async () => {
    const currentUserId = vi
      .fn()
      .mockResolvedValueOnce('user-a')
      .mockResolvedValueOnce('user-a')
      .mockResolvedValueOnce('user-b');
    const putMany = vi.fn(async () => undefined);
    const service = createCloudRecoveryService({
      currentUserId,
      listRecords: vi.fn(async () => [record('chats', 'chat-1', { id: 'chat-1' })]),
      readLocal: vi.fn(async () => undefined),
      putMany,
    });

    const preview = await service.preview('user-a');
    await expect(service.restore(preview)).rejects.toBeInstanceOf(
      CloudRecoveryAuthorityChangedError,
    );
    expect(putMany).not.toHaveBeenCalled();
  });
});
