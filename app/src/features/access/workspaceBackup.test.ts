import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { createJarvisDb, type JarvisDexie } from '@/lib/db';
import type { Chat, Message } from '@/types/chat';
import type { ChatId, MessageId, ProjectId, WorkspaceId } from '@/types/common';
import type { CanvasBlockId, CanvasDocumentId } from '@/features/canvas/contracts';
import {
  createWorkspaceBackup,
  downloadWorkspaceBackupArtifact,
  WorkspaceBackupError,
  type WorkspaceBackupArtifact,
} from './workspaceBackup';

const TEST_INDEXED_DB = { indexedDB, IDBKeyRange };

function id<T extends string>(value: string): T {
  return value as T;
}

function successfulFlush() {
  return {
    completed: 0,
    failed: 0,
    timedOut: false,
    canvas: { completed: 0, failed: 0, timedOut: false },
  };
}

function chatFixture(chatId: string, workspaceId: string, projectId: string, title: string): Chat {
  return {
    id: id<ChatId>(chatId),
    workspace_id: id<WorkspaceId>(workspaceId),
    project_id: id<ProjectId>(projectId),
    title,
    mode: 'chat',
    active_agent_ids: [],
    connection: {
      provider: 'openai',
      auth: { apiKey: 'provider-secret' },
    } as unknown as Chat['connection'],
    created_at: 100,
    updated_at: 200,
  };
}

function messageFixture(messageId: string, chatId: string, text: string): Message {
  return {
    id: id<MessageId>(messageId),
    chat_id: id<ChatId>(chatId),
    role: 'user',
    parts: [
      { kind: 'text', text },
      {
        kind: 'tool_call',
        tool: 'example',
        call_id: 'call-1',
        args: {
          authorization: 'Bearer raw-auth',
          safe: 'kept',
        },
      },
    ],
    created_at: 300,
    updated_at: 400,
  };
}

describe('workspace backup', () => {
  let database: JarvisDexie;

  beforeEach(async () => {
    database = createJarvisDb(`workspace-backup-${crypto.randomUUID()}`, TEST_INDEXED_DB);
    await database.open();
  });

  afterEach(async () => {
    database.close();
    await database.delete();
  });

  it('flushes before snapshot and writes only the active account data to a real artifact', async () => {
    await database.workspaces.bulkAdd([
      {
        id: id<WorkspaceId>('workspace-owned'),
        name: 'Owned workspace',
        owner_id: 'account-owned',
        created_at: 1,
        updated_at: 2,
      },
      {
        id: id<WorkspaceId>('workspace-foreign'),
        name: 'Foreign workspace',
        owner_id: 'account-foreign',
        created_at: 1,
        updated_at: 2,
      },
    ]);
    await database.projects.bulkAdd([
      {
        id: id<ProjectId>('project-owned'),
        workspace_id: id<WorkspaceId>('workspace-owned'),
        name: 'Owned project',
        created_at: 10,
        updated_at: 20,
      },
      {
        id: id<ProjectId>('project-foreign'),
        workspace_id: id<WorkspaceId>('workspace-foreign'),
        name: 'Foreign project',
        created_at: 10,
        updated_at: 20,
      },
    ]);
    await database.chats.bulkAdd([
      chatFixture('chat-owned', 'workspace-owned', 'project-owned', 'Owned chat'),
      chatFixture('chat-foreign', 'workspace-foreign', 'project-foreign', 'Foreign chat'),
    ]);
    await database.messages.bulkAdd([
      messageFixture('message-owned', 'chat-owned', 'Owned message'),
      messageFixture('message-foreign', 'chat-foreign', 'Foreign message'),
    ]);
    await database.canvas_documents.bulkAdd([
      {
        id: id<CanvasDocumentId>('canvas-owned'),
        accountId: 'account-owned',
        ownerId: id('owner-owned'),
        projectId: id('project-owned'),
        schemaVersion: 1,
        title: 'Owned canvas',
        icon: null,
        thumbnail: null,
        layoutMode: 'page',
        background: { kind: 'plain', color: '#ffffff' },
        localRevision: 1,
        syncRevision: 0,
        createdAt: 100,
        updatedAt: 200,
        archivedAt: null,
        deletedAt: null,
      },
      {
        id: id<CanvasDocumentId>('canvas-foreign'),
        accountId: 'account-foreign',
        ownerId: id('owner-foreign'),
        projectId: id('project-foreign'),
        schemaVersion: 1,
        title: 'Foreign canvas',
        icon: null,
        thumbnail: null,
        layoutMode: 'page',
        background: { kind: 'plain', color: '#ffffff' },
        localRevision: 1,
        syncRevision: 0,
        createdAt: 100,
        updatedAt: 200,
        archivedAt: null,
        deletedAt: null,
      },
    ]);
    await database.canvas_objects.bulkAdd([
      {
        id: id<CanvasBlockId>('block-owned'),
        accountId: 'account-owned',
        documentId: id<CanvasDocumentId>('canvas-owned'),
        kind: 'text',
        content: { kind: 'text', text: 'Owned canvas text' },
        createdAt: 100,
        updatedAt: 200,
      },
      {
        id: id<CanvasBlockId>('block-adversarial-foreign'),
        accountId: 'account-foreign',
        documentId: id<CanvasDocumentId>('canvas-owned'),
        kind: 'text',
        content: { kind: 'text', text: 'Foreign row targeting owned document' },
        createdAt: 100,
        updatedAt: 200,
      },
    ]);

    const artifacts: WorkspaceBackupArtifact[] = [];
    const flush = vi.fn(async () => {
      await database.messages.add(messageFixture('message-flushed', 'chat-owned', 'Flushed first'));
      return successfulFlush();
    });
    const saveArtifact = vi.fn(async (artifact: WorkspaceBackupArtifact) => {
      artifacts.push(artifact);
    });
    const backup = createWorkspaceBackup({
      database,
      getAccountIdentity: () => ({ accountId: 'account-owned', source: 'supabase' }),
      flush,
      saveArtifact,
    });

    const result = await backup();

    expect(flush).toHaveBeenCalledWith('access-backup');
    expect(saveArtifact).toHaveBeenCalledTimes(1);
    expect(result.filename).toBe('vibespace-backup-v1.json');
    expect(result.counts).toEqual({
      workspaces: 1,
      projects: 1,
      chats: 1,
      messages: 2,
      canvasDocuments: 1,
    });

    const artifact = artifacts[0];
    expect(artifact?.mimeType).toBe('application/json;charset=utf-8');
    expect(artifact?.content).toContain('Flushed first');
    expect(artifact?.content).not.toContain('Foreign');
    expect(artifact?.content).not.toContain('provider-secret');
    expect(artifact?.content).not.toContain('raw-auth');

    const payload = JSON.parse(artifact?.content ?? '{}') as {
      format: string;
      version: number;
      account: { id: string };
      data: {
        chats: Array<Record<string, unknown>>;
        messages: Array<{ parts: Array<Record<string, unknown>> }>;
        canvas: { objects: Array<{ id: string }> };
      };
    };
    expect(payload).toMatchObject({
      format: 'vibespace-workspace-backup',
      version: 1,
      account: { id: 'account-owned' },
    });
    expect(payload.data.chats[0]).not.toHaveProperty('connection');
    expect(payload.data.messages[0]?.parts[1]).toMatchObject({
      args: { authorization: '[REDACTED]', safe: 'kept' },
    });
    expect(payload.data.canvas.objects).toEqual([expect.objectContaining({ id: 'block-owned' })]);
  });

  it('produces identical versioned JSON for unchanged account data', async () => {
    await database.workspaces.add({
      id: id<WorkspaceId>('workspace-owned'),
      name: 'Owned workspace',
      owner_id: 'account-owned',
      created_at: 1,
      updated_at: 2,
    });
    const artifacts: WorkspaceBackupArtifact[] = [];
    const backup = createWorkspaceBackup({
      database,
      getAccountIdentity: () => ({ accountId: 'account-owned', source: 'local' }),
      flush: async () => successfulFlush(),
      saveArtifact: async (artifact) => {
        artifacts.push(artifact);
      },
    });

    await backup();
    await backup();

    expect(artifacts).toHaveLength(2);
    expect(artifacts[0]?.content).toBe(artifacts[1]?.content);
  });

  it('fails without creating an artifact when persistence flush is incomplete', async () => {
    const saveArtifact = vi.fn(async () => undefined);
    const backup = createWorkspaceBackup({
      database,
      getAccountIdentity: () => ({ accountId: 'account-owned', source: 'local' }),
      flush: async () => ({
        ...successfulFlush(),
        failed: 1,
      }),
      saveArtifact,
    });

    await expect(backup()).rejects.toMatchObject({ code: 'flush_failed' });
    expect(saveArtifact).not.toHaveBeenCalled();
  });

  it('rejects unsupported stored values instead of reporting a fake successful backup', async () => {
    await database.workspaces.add({
      id: id<WorkspaceId>('workspace-owned'),
      name: 'Owned workspace',
      owner_id: 'account-owned',
      created_at: 1,
      updated_at: 2,
    });
    await database.projects.add({
      id: id<ProjectId>('project-owned'),
      workspace_id: id<WorkspaceId>('workspace-owned'),
      name: 'Owned project',
      system_prompt_context: { unsupported: 1n } as unknown as string,
      created_at: 10,
      updated_at: 20,
    });
    const saveArtifact = vi.fn(async () => undefined);
    const backup = createWorkspaceBackup({
      database,
      getAccountIdentity: () => ({ accountId: 'account-owned', source: 'local' }),
      flush: async () => successfulFlush(),
      saveArtifact,
    });

    await expect(backup()).rejects.toBeInstanceOf(WorkspaceBackupError);
    await expect(backup()).rejects.toMatchObject({ code: 'serialization_failed' });
    expect(saveArtifact).not.toHaveBeenCalled();
  });

  it('surfaces artifact writer failure instead of returning success', async () => {
    const backup = createWorkspaceBackup({
      database,
      getAccountIdentity: () => ({ accountId: 'account-owned', source: 'local' }),
      flush: async () => successfulFlush(),
      saveArtifact: async () => {
        throw new Error('download unavailable');
      },
    });

    await expect(backup()).rejects.toMatchObject({ code: 'artifact_save_failed' });
  });

  it('enforces the configured serialized artifact byte limit', async () => {
    await database.workspaces.add({
      id: id<WorkspaceId>('workspace-owned'),
      name: 'Owned workspace with enough content to exceed a tiny cap',
      owner_id: 'account-owned',
      created_at: 1,
      updated_at: 2,
    });
    const saveArtifact = vi.fn(async () => undefined);
    const backup = createWorkspaceBackup({
      database,
      getAccountIdentity: () => ({ accountId: 'account-owned', source: 'local' }),
      flush: async () => successfulFlush(),
      saveArtifact,
      limits: { maxArtifactBytes: 32 },
    });

    await expect(backup()).rejects.toMatchObject({ code: 'size_limit_exceeded' });
    expect(saveArtifact).not.toHaveBeenCalled();
  });

  it('materializes the default artifact as a browser download and cleans up its object URL', async () => {
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    let createdBlob: Blob | null = null;
    const createObjectUrl = vi.fn((blob: Blob) => {
      createdBlob = blob;
      return 'blob:vibespace-backup';
    });
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectUrl,
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    try {
      await downloadWorkspaceBackupArtifact({
        filename: 'vibespace-backup-v1.json',
        mimeType: 'application/json;charset=utf-8',
        content: '{"format":"vibespace-workspace-backup","version":1}',
      });

      expect(createdBlob).toBeInstanceOf(Blob);
      expect((createdBlob as Blob | null)?.size).toBeGreaterThan(0);
      expect(createObjectUrl).toHaveBeenCalledTimes(1);
      expect(click).toHaveBeenCalledTimes(1);
      expect(revokeObjectUrl).toHaveBeenCalledWith('blob:vibespace-backup');
      expect(document.querySelector('a[download="vibespace-backup-v1.json"]')).toBeNull();
    } finally {
      click.mockRestore();
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: originalCreateObjectUrl,
      });
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: originalRevokeObjectUrl,
      });
    }
  });
});
