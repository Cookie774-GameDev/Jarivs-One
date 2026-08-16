import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncQueueRow } from './db';

const { fetchMyEntitlements } = vi.hoisted(() => ({ fetchMyEntitlements: vi.fn() }));

vi.mock('@/lib/supabase/entitlements', () => ({ fetchMyEntitlements }));

import {
  buildCloudSyncRecord,
  canUseCloudSync,
  customToolFromCloudRecord,
  isExpectedSyncUser,
  primaryKeyForSyncTable,
  syncRowBelongsToUser,
} from './sync';

describe('cloud sync server authority', () => {
  beforeEach(() => fetchMyEntitlements.mockReset());

  it('allows paid or admin accounts only when the server says so', async () => {
    fetchMyEntitlements.mockResolvedValue({ cloudSyncAllowed: true });
    await expect(canUseCloudSync('user-a')).resolves.toBe(true);
  });

  it('fails closed when entitlement lookup fails or denies access', async () => {
    fetchMyEntitlements.mockResolvedValue(null);
    await expect(canUseCloudSync('user-a')).resolves.toBe(false);
    fetchMyEntitlements.mockResolvedValue({ cloudSyncAllowed: false });
    await expect(canUseCloudSync('user-a')).resolves.toBe(false);
  });
});

describe('sync table metadata', () => {
  it('uses id for normal app-sync tables', () => {
    expect(primaryKeyForSyncTable('projects')).toBe('id');
    expect(primaryKeyForSyncTable('messages')).toBe('id');
  });

  it('uses table-specific primary keys for non-id tables', () => {
    expect(primaryKeyForSyncTable('settings')).toBe('key');
    expect(primaryKeyForSyncTable('terminal_layouts')).toBe('project_id');
  });
});

describe('cloud sync records', () => {
  const baseRow: SyncQueueRow = {
    id: 'syq_123',
    op: 'update',
    table: 'workspaces',
    row_id: 'wsp_1',
    payload: {
      id: 'wsp_1',
      owner_id: 'usr_local',
      name: 'Personal',
      created_at: 1,
      updated_at: 2,
    },
    owner_user_id: 'auth_user_1',
    status: 'pending',
    created_at: Date.parse('2026-06-04T12:00:00.000Z'),
  };

  it('wraps local mutations as per-user Supabase documents', () => {
    expect(buildCloudSyncRecord(baseRow, 'auth_user_1')).toEqual({
      user_id: 'auth_user_1',
      table_name: 'workspaces',
      row_id: 'wsp_1',
      op: 'update',
      payload: baseRow.payload,
      deleted_at: null,
      updated_at: '2026-06-04T12:00:00.000Z',
    });
  });

  it('stores deletes as tombstones instead of dropping the cloud record', () => {
    expect(
      buildCloudSyncRecord(
        { ...baseRow, op: 'delete', payload: null },
        'auth_user_1',
        '2026-06-04T12:05:00.000Z',
      ),
    ).toEqual({
      user_id: 'auth_user_1',
      table_name: 'workspaces',
      row_id: 'wsp_1',
      op: 'delete',
      payload: null,
      deleted_at: '2026-06-04T12:05:00.000Z',
      updated_at: '2026-06-04T12:00:00.000Z',
    });
  });

  it('never binds another account or a legacy unowned row to the active user', () => {
    expect(syncRowBelongsToUser(baseRow, 'auth_user_1')).toBe(true);
    expect(syncRowBelongsToUser(baseRow, 'auth_user_2')).toBe(false);
    expect(syncRowBelongsToUser({ ...baseRow, owner_user_id: undefined }, 'auth_user_1'))
      .toBe(false);
    expect(() => buildCloudSyncRecord(baseRow, 'auth_user_2'))
      .toThrow('sync_account_mismatch');
  });

  it('revalidates the authenticated account after asynchronous work', async () => {
    const sessionClient = (userId: string | null) => ({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: userId ? { user: { id: userId } } : null },
          error: null,
        }),
      },
    });
    await expect(isExpectedSyncUser(sessionClient('auth_user_1'), 'auth_user_1'))
      .resolves.toBe(true);
    await expect(isExpectedSyncUser(sessionClient('auth_user_2'), 'auth_user_1'))
      .resolves.toBe(false);
    await expect(isExpectedSyncUser(sessionClient(null), 'auth_user_1'))
      .resolves.toBe(false);
  });

  it('normalizes custom tool payloads from cloud records', () => {
    expect(
      customToolFromCloudRecord({
        user_id: 'auth_user_1',
        table_name: 'custom_tools',
        row_id: 'ship-check',
        op: 'update',
        payload: {
          slug: 'different-local-slug',
          name: 'Ship check',
          description: 'Run release checks',
          baseAction: 'workflow.run',
          params: {},
          steps: [{ action: 'clock.timer', params: { durationMinutes: 1 }, label: 'Timer' }],
          createdAt: 10,
          updatedAt: 20,
          published: null,
        },
        deleted_at: null,
        updated_at: '2026-06-04T12:00:00.000Z',
      }),
    ).toEqual({
      slug: 'ship-check',
      name: 'Ship check',
      description: 'Run release checks',
      baseAction: 'workflow.run',
      params: {},
      steps: [{ action: 'clock.timer', params: { durationMinutes: 1 }, label: 'Timer' }],
      emoji: undefined,
      createdAt: 10,
      updatedAt: 20,
      published: null,
    });
  });

  it('rejects malformed custom tool cloud records', () => {
    expect(
      customToolFromCloudRecord({
        user_id: 'auth_user_1',
        table_name: 'custom_tools',
        row_id: 'bad',
        op: 'update',
        payload: { description: 'missing name and action' },
        deleted_at: null,
        updated_at: '2026-06-04T12:00:00.000Z',
      }),
    ).toBeNull();
  });
});
