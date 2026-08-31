import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  cloudSyncQueueOwnerKey,
  parseSyncQueueOwner,
  type SyncQueueOwnerSnapshot,
} from '@/lib/cloudSyncQueueOwner';
import { TEST_INDEXED_DB, uniqueTestDbName } from '@/test/indexedDb';
import type { ChatId, MessageId, WorkspaceId } from '@/types/common';
import type { Chat, Message, Part } from '@/types/chat';
import { createJarvisDb, type JarvisDexie } from './index';

const NOW = 1_786_200_300_000;
const OWNER_A = Object.freeze({
  state: 'cloud' as const,
  userId: 'account-a',
  capturedAt: NOW,
}) satisfies SyncQueueOwnerSnapshot;

const CHAT_ID = 'chat_dispatch_target' as ChatId;
const MESSAGE_ID = 'msg_handoff_exact' as MessageId;
const PENDING_PARTS: Part[] = [
  { kind: 'text', text: 'Continue the reviewed work.' },
  {
    kind: 'chat_handoff',
    handoff: {
      version: 1,
      sourceChatId: 'chat_source',
      sourceTitle: 'Source',
      snapshotAt: NOW,
      boundaryMessageId: null,
      instruction: 'Continue.',
      projection: {} as never,
      dispatchKey: 'dispatch-1',
      dispatch: {
        version: 1,
        accountId: 'account-a',
        sourceChatId: 'chat_source',
        targetChatId: CHAT_ID,
        dispatchKey: 'dispatch-1',
        messageId: MESSAGE_ID,
        projectionDigest: 'projection-digest',
        promptDigest: 'prompt-digest',
        state: 'pending',
      },
    } as never,
  },
];
const ACCEPTED_PARTS = structuredClone(PENDING_PARTS);
(
  ACCEPTED_PARTS[1] as unknown as {
    handoff: { dispatch: { state: string } };
  }
).handoff.dispatch.state = 'accepted';

type DispatchRepository = {
  claimChatDispatch(
    input: {
      message: {
        id: MessageId;
        chat_id: ChatId;
        role: 'user';
        parts: Part[];
      };
      target: { chatId: ChatId; workspaceId: WorkspaceId; projectId: null };
      matchesExisting: (message: Message) => boolean;
    },
    owner: SyncQueueOwnerSnapshot,
    authorize: () => boolean,
  ): Promise<{
    status: 'created' | 'existing' | 'conflict' | 'authority_revoked';
    message?: Message;
  }>;
  transitionChatDispatch(
    input: {
      id: MessageId;
      target: { chatId: ChatId; workspaceId: WorkspaceId; projectId: null };
      expectedParts: Part[];
      nextParts: Part[];
    },
    owner: SyncQueueOwnerSnapshot,
    authorize: () => boolean,
  ): Promise<{
    status: 'transitioned' | 'conflict' | 'missing' | 'authority_revoked';
    message?: Message;
  }>;
};

describe('chat dispatch repository authority', () => {
  let first: JarvisDexie;
  let second: JarvisDexie;
  let repository: DispatchRepository;

  beforeEach(async () => {
    const name = uniqueTestDbName('chat-dispatch-repository');
    first = createJarvisDb(name, TEST_INDEXED_DB);
    second = createJarvisDb(name, TEST_INDEXED_DB);
    await Promise.all([first.open(), second.open()]);
    const chat: Chat = {
      id: CHAT_ID,
      workspace_id: 'workspace-1' as WorkspaceId,
      project_id: undefined,
      title: 'Target',
      mode: 'chat',
      active_agent_ids: [],
      created_at: NOW - 1,
      updated_at: NOW - 1,
    } as Chat;
    await first.chats.put(chat);
    const module = (await import('./repositories')) as unknown as {
      createChatDispatchRepository?: (
        database: JarvisDexie,
        clock?: () => number,
      ) => DispatchRepository;
    };
    expect(module.createChatDispatchRepository).toBeTypeOf('function');
    repository = module.createChatDispatchRepository!(first, () => NOW);
  });

  afterEach(async () => {
    second.close();
    await first.delete();
  });

  const claimInput = () => ({
    message: {
      id: MESSAGE_ID,
      chat_id: CHAT_ID,
      role: 'user' as const,
      parts: structuredClone(PENDING_PARTS),
    },
    target: {
      chatId: CHAT_ID,
      workspaceId: 'workspace-1' as WorkspaceId,
      projectId: null,
    },
    matchesExisting: (message: Message) =>
      message.id === MESSAGE_ID && message.chat_id === CHAT_ID && message.role === 'user',
  });

  it('rolls back claim when account authority changes and emits no cross-owner payload', async () => {
    let checks = 0;
    const result = await repository.claimChatDispatch(claimInput(), OWNER_A, () => ++checks === 1);

    expect(result.status).toBe('authority_revoked');
    await expect(first.messages.get(MESSAGE_ID)).resolves.toBeUndefined();
    expect(await first.sync_queue.count()).toBe(0);
    await expect(first.chats.get(CHAT_ID)).resolves.toMatchObject({ updated_at: NOW - 1 });
  });

  it('uses the original owner for atomic claim and terminal transition queues', async () => {
    await expect(
      repository.claimChatDispatch(claimInput(), OWNER_A, () => true),
    ).resolves.toMatchObject({
      status: 'created',
    });
    await expect(
      repository.transitionChatDispatch(
        {
          id: MESSAGE_ID,
          target: claimInput().target,
          expectedParts: structuredClone(PENDING_PARTS),
          nextParts: structuredClone(ACCEPTED_PARTS),
        },
        OWNER_A,
        () => true,
      ),
    ).resolves.toMatchObject({ status: 'transitioned' });

    const rows = await first.sync_queue.toArray();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(
        parseSyncQueueOwner(
          row.id,
          (await first.settings.get(cloudSyncQueueOwnerKey(row.id)))?.value,
        ),
      ).toMatchObject({ state: 'cloud', userId: 'account-a' });
    }
    await expect(first.messages.get(MESSAGE_ID)).resolves.toMatchObject({
      parts: ACCEPTED_PARTS,
    });
  });

  it('rejects second-connection pending-envelope drift without dispatch persistence', async () => {
    await repository.claimChatDispatch(claimInput(), OWNER_A, () => true);
    const queueBefore = structuredClone(await first.sync_queue.toArray());
    await second.messages.update(MESSAGE_ID, {
      parts: [{ kind: 'text', text: 'Concurrent mutation.' }],
      updated_at: NOW + 1,
    });

    await expect(
      repository.transitionChatDispatch(
        {
          id: MESSAGE_ID,
          target: claimInput().target,
          expectedParts: structuredClone(PENDING_PARTS),
          nextParts: structuredClone(ACCEPTED_PARTS),
        },
        OWNER_A,
        () => true,
      ),
    ).resolves.toEqual({ status: 'conflict' });
    expect(await first.sync_queue.toArray()).toEqual(queueBefore);
    await expect(first.messages.get(MESSAGE_ID)).resolves.toMatchObject({
      parts: [{ kind: 'text', text: 'Concurrent mutation.' }],
    });
  });

  it('rolls back a terminal transition when authority changes during the transaction', async () => {
    await repository.claimChatDispatch(claimInput(), OWNER_A, () => true);
    const queueBefore = structuredClone(await first.sync_queue.toArray());
    let checks = 0;
    const result = await repository.transitionChatDispatch(
      {
        id: MESSAGE_ID,
        target: claimInput().target,
        expectedParts: structuredClone(PENDING_PARTS),
        nextParts: structuredClone(ACCEPTED_PARTS),
      },
      OWNER_A,
      () => ++checks === 1,
    );

    expect(result).toEqual({ status: 'authority_revoked' });
    expect(await first.sync_queue.toArray()).toEqual(queueBefore);
    await expect(first.messages.get(MESSAGE_ID)).resolves.toMatchObject({ parts: PENDING_PARTS });
  });
});
