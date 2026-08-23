import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { createJarvisDb, type JarvisDexie } from '@/lib/db';
import type { AccountIdentity } from '@/lib/accountIdentity';
import {
  previewWorkspaceRestore,
  readPortableBackupHistory,
  recordPortableBackupHistory,
  restoreWorkspaceBackup,
} from './workspaceRestore';

const TEST_INDEXED_DB = { indexedDB, IDBKeyRange };
const identity: AccountIdentity = { accountId: 'account-a', source: 'supabase' };

function artifact(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    format: 'vibespace-workspace-backup',
    version: 1,
    account: { id: 'account-a', source: 'supabase' },
    data: {
      workspaces: [
        {
          id: 'workspace-1',
          name: 'Restored',
          owner_id: 'account-a',
          created_at: 1,
          updated_at: 2,
        },
      ],
      projects: [
        {
          id: 'project-1',
          workspace_id: 'workspace-1',
          name: 'Project',
          created_at: 1,
          updated_at: 2,
        },
      ],
      chats: [
        {
          id: 'chat-1',
          workspace_id: 'workspace-1',
          project_id: 'project-1',
          title: 'Chat',
          mode: 'chat',
          active_agent_ids: [],
          created_at: 1,
          updated_at: 2,
        },
      ],
      messages: [
        {
          id: 'message-1',
          chat_id: 'chat-1',
          role: 'user',
          parts: [],
          created_at: 1,
          updated_at: 2,
        },
      ],
      canvas: {
        documents: [],
        pages: [],
        objects: [],
        spatial: [],
        cameras: [],
      },
    },
    ...overrides,
  });
}

describe('portable workspace restore', () => {
  let database: JarvisDexie;
  let currentIdentity: AccountIdentity | null;

  beforeEach(async () => {
    database = createJarvisDb(`workspace-restore-${crypto.randomUUID()}`, TEST_INDEXED_DB);
    await database.open();
    currentIdentity = identity;
  });

  afterEach(async () => {
    database.close();
    await database.delete();
  });

  it('previews and restores only missing rows after explicit caller confirmation', async () => {
    const options = { database, getAccountIdentity: () => currentIdentity, now: () => 42 };
    const preview = await previewWorkspaceRestore(artifact(), options);

    expect(preview).toMatchObject({ restorable: 4, preservedLocal: 0, createdAt: 42 });
    expect(await database.workspaces.count()).toBe(0);

    const result = await restoreWorkspaceBackup(preview, options);
    expect(result).toEqual({ restored: 4, preservedLocal: 0 });
    expect(await database.messages.get('message-1' as never)).toMatchObject({ chat_id: 'chat-1' });
  });

  it('never overwrites a local row created or changed after preview', async () => {
    const options = { database, getAccountIdentity: () => currentIdentity };
    const preview = await previewWorkspaceRestore(artifact(), options);
    await database.workspaces.add({
      id: 'workspace-1' as never,
      name: 'Newer local name',
      owner_id: 'account-a',
      created_at: 10,
      updated_at: 20,
    });

    const result = await restoreWorkspaceBackup(preview, options);
    expect(result).toEqual({ restored: 3, preservedLocal: 1 });
    expect((await database.workspaces.get('workspace-1' as never))?.name).toBe('Newer local name');
  });

  it('rejects another account and rolls back if the active account changes', async () => {
    await expect(
      previewWorkspaceRestore(artifact({ account: { id: 'account-b' } }), {
        database,
        getAccountIdentity: () => currentIdentity,
      }),
    ).rejects.toMatchObject({ code: 'artifact_account_mismatch' });

    const preview = await previewWorkspaceRestore(artifact(), {
      database,
      getAccountIdentity: () => currentIdentity,
    });
    currentIdentity = { accountId: 'account-b', source: 'supabase' };
    await expect(
      restoreWorkspaceBackup(preview, { database, getAccountIdentity: () => currentIdentity }),
    ).rejects.toMatchObject({ code: 'account_changed' });
    expect(await database.workspaces.count()).toBe(0);
  });

  it('rejects malformed, orphaned, duplicate, and oversized artifacts', async () => {
    const options = { database, getAccountIdentity: () => currentIdentity };
    await expect(previewWorkspaceRestore('not-json', options)).rejects.toMatchObject({
      code: 'artifact_invalid',
    });
    const parsed = JSON.parse(artifact()) as Record<string, any>;
    parsed.data.messages[0].chat_id = 'missing';
    await expect(previewWorkspaceRestore(JSON.stringify(parsed), options)).rejects.toMatchObject({
      code: 'artifact_invalid',
    });
    parsed.data.messages = [];
    parsed.data.workspaces.push(parsed.data.workspaces[0]);
    await expect(previewWorkspaceRestore(JSON.stringify(parsed), options)).rejects.toMatchObject({
      code: 'artifact_invalid',
    });
    await expect(
      previewWorkspaceRestore(' '.repeat(32 * 1024 * 1024 + 1), options),
    ).rejects.toMatchObject({ code: 'artifact_too_large' });
  });

  it('keeps account-scoped last success and bounded error history locally', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    recordPortableBackupHistory('account-a', 'export', storage, 10);
    recordPortableBackupHistory('account-a', { error: 'x'.repeat(500) }, storage, 20);
    expect(readPortableBackupHistory('account-a', storage)).toMatchObject({
      lastExportAt: 10,
      lastErrorAt: 20,
    });
    expect(readPortableBackupHistory('account-a', storage).lastError).toHaveLength(240);
    expect(readPortableBackupHistory('account-b', storage)).toEqual({});

    recordPortableBackupHistory('account-a', 'restore', storage, 30);
    expect(readPortableBackupHistory('account-a', storage)).toEqual({
      lastExportAt: 10,
      lastRestoreAt: 30,
    });
  });
});
