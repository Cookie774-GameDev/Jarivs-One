import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TEST_INDEXED_DB, uniqueTestDbName } from '@/test/indexedDb';
import type { Message } from '@/types/chat';
import { createJarvisDb, type JarvisDexie } from './index';
import {
  KernelTurnTransactionConfigurationError,
  createKernelTurnTransactionAuthority,
  enqueueLocalSyncInTransaction,
} from './kernelTurnTransactionAuthority';

describe('createKernelTurnTransactionAuthority', () => {
  let db: JarvisDexie;

  beforeEach(async () => {
    db = createJarvisDb(uniqueTestDbName('kernel-turn-transaction'), TEST_INDEXED_DB);
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('opens the exact seven-table transaction and supplies only the frozen real tables', async () => {
    const authority = createKernelTurnTransactionAuthority(db);
    const signal = new AbortController().signal;

    const result = await authority.transaction(
      [
        'messages',
        'chats',
        'sync_queue',
        'settings',
        'jarvis_runs',
        'jarvis_events',
        'jarvis_artifacts',
      ],
      signal,
      (context) => {
        expect(Object.isFrozen(context)).toBe(true);
        expect(context).toEqual({
          messages: db.messages,
          chats: db.chats,
          sync_queue: db.sync_queue,
          settings: db.settings,
          jarvis_runs: db.jarvis_runs,
          jarvis_events: db.jarvis_events,
          jarvis_artifacts: db.jarvis_artifacts,
        });
        return 'committed-value';
      },
    );

    expect(result).toEqual({ kind: 'committed', value: 'committed-value' });
  });

  it('enqueues a canonical message update without widening the sync payload union', async () => {
    const authority = createKernelTurnTransactionAuthority(db);
    const message = {
      id: 'msg_kernel_update',
      chat_id: 'chat_kernel_update',
      role: 'assistant',
      parts: [{ kind: 'text', text: 'approval settled' }],
      created_at: 1,
      updated_at: 2,
    } as Message;
    const ownerSnapshot = Object.freeze({ state: 'unbound' as const, capturedAt: 2 });

    await authority.transaction(
      [
        'messages',
        'chats',
        'sync_queue',
        'settings',
        'jarvis_runs',
        'jarvis_events',
        'jarvis_artifacts',
      ],
      new AbortController().signal,
      (context) =>
        enqueueLocalSyncInTransaction(context, {
          op: 'update',
          table: 'messages',
          row: message,
          createdAt: 2,
          ownerSnapshot,
        }),
    );

    await expect(db.sync_queue.toArray()).resolves.toEqual([
      expect.objectContaining({
        op: 'update',
        table: 'messages',
        row_id: message.id,
        payload: message,
      }),
    ]);
  });

  it.each([
    {
      method: 'transaction' as const,
      tables: ['messages', 'chats'] as never,
      code: 'kernel_table_set_mismatch',
    },
    {
      method: 'lifecycleTransaction' as const,
      tables: ['jarvis_events', 'jarvis_runs'] as never,
      code: 'kernel_lifecycle_table_set_mismatch',
    },
    {
      method: 'approvalTransaction' as const,
      tables: ['jarvis_runs', 'jarvis_events'] as never,
      code: 'kernel_approval_table_set_mismatch',
    },
  ] as const)('rejects an alternate $method tuple before invoking its body', async (example) => {
    const authority = createKernelTurnTransactionAuthority(db);
    const body = vi.fn();

    await expect(
      authority[example.method](example.tables, new AbortController().signal, body as never),
    ).rejects.toEqual(
      expect.objectContaining<Partial<KernelTurnTransactionConfigurationError>>({
        name: 'KernelTurnTransactionConfigurationError',
        code: example.code,
      }),
    );
    expect(body).not.toHaveBeenCalled();
  });

  it('uses distinct frozen two-table and three-table contexts', async () => {
    const authority = createKernelTurnTransactionAuthority(db);
    const signal = new AbortController().signal;

    await expect(
      authority.lifecycleTransaction(['jarvis_runs', 'jarvis_events'], signal, (context) => {
        expect(Object.isFrozen(context)).toBe(true);
        expect(Object.keys(context)).toEqual(['jarvis_runs', 'jarvis_events']);
        expect(context.jarvis_runs).toBe(db.jarvis_runs);
        expect(context.jarvis_events).toBe(db.jarvis_events);
        return 'lifecycle';
      }),
    ).resolves.toEqual({ kind: 'committed', value: 'lifecycle' });

    await expect(
      authority.approvalTransaction(
        ['jarvis_runs', 'jarvis_events', 'jarvis_approvals'],
        signal,
        (context) => {
          expect(Object.isFrozen(context)).toBe(true);
          expect(Object.keys(context)).toEqual([
            'jarvis_runs',
            'jarvis_events',
            'jarvis_approvals',
          ]);
          expect(context.jarvis_approvals).toBe(db.jarvis_approvals);
          return 'approval';
        },
      ),
    ).resolves.toEqual({ kind: 'committed', value: 'approval' });
  });

  it('rolls back every selected table when the body rejects', async () => {
    const authority = createKernelTurnTransactionAuthority(db);
    const message = {
      id: 'msg_kernel_rollback',
      chat_id: 'chat_kernel_rollback',
      role: 'assistant',
      parts: [{ kind: 'text', text: 'must roll back' }],
      created_at: 1,
      updated_at: 1,
    } as Message;

    await expect(
      authority.transaction(
        [
          'messages',
          'chats',
          'sync_queue',
          'settings',
          'jarvis_runs',
          'jarvis_events',
          'jarvis_artifacts',
        ],
        new AbortController().signal,
        async (context) => {
          await context.messages.add(message);
          await context.settings.add({ key: 'kernel-rollback', value: true, updated_at: 1 });
          throw new Error('injected kernel commit failure');
        },
      ),
    ).rejects.toThrow('injected kernel commit failure');

    await expect(db.messages.get(message.id)).resolves.toBeUndefined();
    await expect(db.settings.get('kernel-rollback')).resolves.toBeUndefined();
  });
});
