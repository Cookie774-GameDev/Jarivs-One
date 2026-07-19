import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseSyncQueueOwner } from '@/lib/cloudSyncQueueOwner';
import { createJarvisDb, type JarvisDexie } from '@/lib/db';
import {
  fromJarvisRunRow,
  toJarvisEventRow,
  toJarvisRunRow,
} from '@/lib/db/jarvisMappers';
import { createKernelTurnTransactionAuthority } from '@/lib/db/kernelTurnTransactionAuthority';
import { cloudSyncQueueOwnerKey } from '@/lib/cloudSyncQueueOwner';
import { TEST_INDEXED_DB, uniqueTestDbName } from '@/test/indexedDb';
import type { Chat, ChatId, Message, MessageId, WorkspaceId } from '@/types';
import type {
  JarvisArtifactV1,
  JarvisEvent,
  JarvisRun,
  JarvisTransportAttemptV1,
} from './contracts';
import type { JarvisKernelAccountBinding } from './kernelRuntime';
import { createKernelTurnCommit, type KernelTurnCommitInput } from './kernelTurnCommit';

const NOW = 1_786_300_000_000;

function attempt(
  overrides: Partial<JarvisTransportAttemptV1> = {},
): JarvisTransportAttemptV1 {
  return {
    schemaVersion: 1,
    attemptNumber: 1,
    kind: 'initial',
    requestId: 'request-kernel',
    state: 'provider_in_flight',
    startedEventSeq: 1,
    effectBarrier: { state: 'open', version: 0, updatedAt: NOW },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function run(overrides: Partial<JarvisRun> = {}): JarvisRun {
  return {
    id: 'run-kernel',
    accountId: 'account-kernel',
    workspaceId: 'workspace-kernel',
    chatId: 'chat-kernel',
    source: 'schedule',
    status: 'running',
    agentId: 'agent-jarvis',
    identityVersion: 1,
    profileRevisionId: 'profile-kernel',
    model: {
      connectionId: 'connection-kernel',
      providerId: 'provider-kernel',
      modelId: 'model-kernel',
      connectionMode: 'native-api',
      capabilities: { tools: true, vision: false },
      effectiveTemperature: 0.2,
      capturedAt: NOW - 10,
    },
    createdAt: NOW - 20,
    updatedAt: NOW,
    transportAttempts: [attempt()],
    ...overrides,
  };
}

function chat(): Chat {
  return {
    id: 'chat-kernel' as ChatId,
    workspace_id: 'workspace-kernel' as WorkspaceId,
    title: 'Kernel turn',
    mode: 'chat',
    active_agent_ids: [],
    connection: {
      id: 'connection-kernel',
      adapterId: 'openai-native',
      providerId: 'openai',
      displayName: 'OpenAI',
      mode: 'native-api',
      authSource: 'api-key',
      capabilities: {
        text: true,
        images: false,
        files: false,
        tools: true,
        modelSelection: true,
        structuredOutput: true,
        streaming: true,
        cancellation: true,
        resumeSession: false,
        systemPrompt: true,
        workingDirectory: false,
        usage: true,
        subscriptionQuota: false,
        localOnly: false,
      },
      promptTransport: 'native-system',
      enabled: true,
    },
    created_at: NOW - 20,
    updated_at: NOW,
  };
}

function assistantMessage(): Message {
  return {
    id: 'message-kernel' as MessageId,
    chat_id: 'chat-kernel' as ChatId,
    role: 'assistant',
    parts: [{ kind: 'text', text: 'Kernel committed.' }],
    created_at: NOW + 10,
    updated_at: NOW + 10,
  };
}

function artifact(overrides: Partial<JarvisArtifactV1> = {}): JarvisArtifactV1 {
  const value: JarvisArtifactV1 = {
    schemaVersion: 1,
    id: 'artifact-kernel',
    runId: 'run-kernel',
    requestId: 'request-kernel',
    attemptNumber: 1,
    state: 'ready',
    kind: 'text',
    title: 'Kernel result',
    safeSummary: 'Verified kernel result.',
    localReference: { kind: 'message_part', value: 'message-kernel' },
    sourceRefs: [],
    createdAt: NOW + 5,
    ...overrides,
  };
  return Object.freeze(value);
}

function terminalEvent(artifacts: readonly JarvisArtifactV1[]): KernelTurnCommitInput['terminal'] {
  return {
    status: 'completed',
    event: {
      idempotencyKey: 'kernel-terminal:request-kernel:1',
      title: 'Kernel turn completed',
      safeSummary: 'The protected turn completed.',
      sourceRefs: [],
      artifactIds: artifacts.map((value) => value.id),
      createdAt: NOW + 10,
    },
  };
}

function binding(controller = new AbortController()) {
  const assertCurrent = vi.fn(() => {
    if (controller.signal.aborted) throw new Error('account authority revoked');
  });
  const value = Object.freeze({
    identity: Object.freeze({ accountId: 'account-kernel', source: 'local' as const }),
    syncOwnerSnapshot: Object.freeze({ state: 'unbound' as const, capturedAt: NOW }),
    revocationSignal: controller.signal,
    assertCurrent,
    dispose: vi.fn(),
  }) as unknown as JarvisKernelAccountBinding;
  return { value, controller, assertCurrent };
}

describe('createKernelTurnCommit', () => {
  let db: JarvisDexie;

  beforeEach(async () => {
    db = createJarvisDb(uniqueTestDbName('kernel-turn-commit'), TEST_INDEXED_DB);
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  async function seed(overrides: Partial<JarvisRun> = {}) {
    const current = run(overrides);
    await db.jarvis_runs.add(toJarvisRunRow(current));
    await db.chats.add(chat());
    const startEvent: JarvisEvent = {
      runId: current.id,
      seq: 1,
      idempotencyKey: 'kernel-provider-start',
      type: 'model',
      status: 'started',
      title: 'Provider started',
      safeSummary: 'Provider dispatch started.',
      sourceRefs: [],
      artifactIds: [],
      createdAt: NOW,
    };
    await db.jarvis_events.add(toJarvisEventRow(startEvent));
    return current;
  }

  function harness(authorityBinding = binding()) {
    const assertIssuedAccountBinding = vi.fn((candidate: JarvisKernelAccountBinding) => {
      if (candidate !== authorityBinding.value) throw new Error('foreign binding');
    });
    const consumeArtifactsForCommit = vi.fn();
    const commit = createKernelTurnCommit({
      transactionAuthority: createKernelTurnTransactionAuthority(db),
      assertIssuedAccountBinding,
      consumeArtifactsForCommit,
    });
    return {
      ...authorityBinding,
      assertIssuedAccountBinding,
      consumeArtifactsForCommit,
      commit,
    };
  }

  function input(
    accountBinding: JarvisKernelAccountBinding,
    overrides: Partial<KernelTurnCommitInput> = {},
  ): KernelTurnCommitInput {
    const artifacts = [artifact()];
    return {
      accountId: 'account-kernel',
      runId: 'run-kernel',
      requestId: 'request-kernel',
      attemptNumber: 1,
      expectedStatus: 'running',
      accountBinding,
      terminal: terminalEvent(artifacts),
      assistantMessage: assistantMessage(),
      artifacts,
      transportAttemptCompletion: { requestId: 'request-kernel', attemptNumber: 1 },
      ...overrides,
    };
  }

  it('atomically commits the terminal run, event, message, chat sync, and artifacts', async () => {
    await seed();
    const state = harness();

    const result = await state.commit.commitKernelTurn(input(state.value));

    expect(result).toMatchObject({ committed: true });
    expect(state.assertIssuedAccountBinding).toHaveBeenCalledTimes(3);
    expect(state.assertCurrent).toHaveBeenCalledTimes(3);
    expect(state.consumeArtifactsForCommit).toHaveBeenCalledOnce();
    expect(state.consumeArtifactsForCommit).toHaveBeenCalledWith({
      accountId: 'account-kernel',
      runId: 'run-kernel',
      requestId: 'request-kernel',
      attemptNumber: 1,
      artifacts: [expect.objectContaining({ id: 'artifact-kernel' })],
    });

    const storedRun = fromJarvisRunRow((await db.jarvis_runs.get('run-kernel'))!);
    expect(storedRun).toMatchObject({
      status: 'completed',
      updatedAt: NOW + 10,
      completedAt: NOW + 10,
      transportAttempts: [{ state: 'completed', updatedAt: NOW + 10 }],
    });
    expect(await db.jarvis_events.count()).toBe(2);
    expect(await db.messages.get('message-kernel' as MessageId)).toEqual(assistantMessage());
    expect(await db.jarvis_artifacts.get('artifact-kernel')).toBeDefined();
    expect((await db.chats.get('chat-kernel' as ChatId))?.updated_at).toBe(NOW + 10);

    const queue = await db.sync_queue.toArray();
    expect(queue).toHaveLength(2);
    expect(queue.map((row) => [row.table, row.op]).sort()).toEqual([
      ['chats', 'update'],
      ['messages', 'insert'],
    ]);
    const chatPayload = queue.find((row) => row.table === 'chats')?.payload;
    expect(chatPayload).not.toHaveProperty('connection');
    for (const row of queue) {
      const ownerRow = await db.settings.get(cloudSyncQueueOwnerKey(row.id));
      expect(parseSyncQueueOwner(row.id, ownerRow?.value)).toMatchObject({ state: 'unbound' });
    }
  });

  it('commits an artifact-free terminal turn without invoking the pending-artifact consumer', async () => {
    await seed({ source: 'typed_chat', transportAttempts: [] });
    const state = harness();

    const result = await state.commit.commitKernelTurn(
      input(state.value, {
        artifacts: [],
        terminal: terminalEvent([]),
        transportAttemptCompletion: undefined,
      }),
    );

    expect(result).toMatchObject({ committed: true, artifacts: [] });
    expect(state.consumeArtifactsForCommit).not.toHaveBeenCalled();
    expect(await db.messages.get('message-kernel' as MessageId)).toEqual(assistantMessage());
    expect(await db.jarvis_artifacts.count()).toBe(0);
    expect(await db.sync_queue.count()).toBe(2);
  });

  it('rejects an unsettled scheduled provider attempt when completion metadata is omitted', async () => {
    await seed();
    const state = harness();

    await expect(
      state.commit.commitKernelTurn(
        input(state.value, { transportAttemptCompletion: undefined }),
      ),
    ).resolves.toEqual({
      committed: false,
      reason: 'attempt_conflict',
      actualStatus: 'running',
    });

    expect(state.consumeArtifactsForCommit).not.toHaveBeenCalled();
    expect(await db.jarvis_events.count()).toBe(1);
    expect(await db.messages.count()).toBe(0);
    expect(await db.sync_queue.count()).toBe(0);
    expect(await db.jarvis_artifacts.count()).toBe(0);
  });

  it.each([
    {
      name: 'status conflict',
      runOverrides: { status: 'awaiting_approval' as const },
      inputOverrides: {},
      expected: { committed: false, reason: 'status_conflict', actualStatus: 'awaiting_approval' },
    },
    {
      name: 'attempt conflict',
      runOverrides: {
        transportAttempts: [attempt({ requestId: 'request-other' })],
      },
      inputOverrides: {},
      expected: { committed: false, reason: 'attempt_conflict', actualStatus: 'running' },
    },
  ])('returns $name with no writes or artifact consumption', async (example) => {
    await seed(example.runOverrides);
    const state = harness();

    await expect(
      state.commit.commitKernelTurn(input(state.value, example.inputOverrides)),
    ).resolves.toEqual(example.expected);

    expect(state.consumeArtifactsForCommit).not.toHaveBeenCalled();
    expect(await db.jarvis_events.count()).toBe(1);
    expect(await db.messages.count()).toBe(0);
    expect(await db.sync_queue.count()).toBe(0);
    expect(await db.jarvis_artifacts.count()).toBe(0);
  });

  it('maps a revoked binding before the transaction to an authority result with no reads or writes', async () => {
    await seed();
    const authorityBinding = binding();
    const state = harness(authorityBinding);
    authorityBinding.controller.abort('account switched');
    const runGet = vi.spyOn(db.jarvis_runs, 'get');

    await expect(state.commit.commitKernelTurn(input(state.value))).resolves.toEqual({
      committed: false,
      reason: 'account_authority_revoked',
    });

    expect(runGet).not.toHaveBeenCalled();
    expect(state.consumeArtifactsForCommit).not.toHaveBeenCalled();
    expect(await db.messages.count()).toBe(0);
  });

  it('rechecks authority after every awaited guard immediately before artifact consumption', async () => {
    await seed();
    const state = harness();
    state.assertCurrent
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error('revoked after guards');
      });

    await expect(state.commit.commitKernelTurn(input(state.value))).resolves.toEqual({
      committed: false,
      reason: 'account_authority_revoked',
    });

    expect(state.assertCurrent).toHaveBeenCalledTimes(3);
    expect(state.consumeArtifactsForCommit).not.toHaveBeenCalled();
    expect(await db.jarvis_events.count()).toBe(1);
    expect(await db.messages.count()).toBe(0);
    expect(await db.sync_queue.count()).toBe(0);
    expect(await db.jarvis_artifacts.count()).toBe(0);
  });

  it('maps revocation during settlement only after all database writes roll back', async () => {
    const originalRun = await seed();
    const authorityBinding = binding();
    const state = harness(authorityBinding);
    const bulkAdd = db.jarvis_artifacts.bulkAdd.bind(db.jarvis_artifacts);
    vi.spyOn(db.jarvis_artifacts, 'bulkAdd').mockImplementationOnce((rows) =>
      bulkAdd(rows).then((result) => {
        authorityBinding.controller.abort('account switched during settlement');
        return result;
      }),
    );

    await expect(state.commit.commitKernelTurn(input(state.value))).resolves.toEqual({
      committed: false,
      reason: 'account_authority_revoked',
    });

    expect(state.consumeArtifactsForCommit).toHaveBeenCalledOnce();
    expect(fromJarvisRunRow((await db.jarvis_runs.get('run-kernel'))!)).toEqual(originalRun);
    expect(await db.jarvis_events.count()).toBe(1);
    expect(await db.messages.count()).toBe(0);
    expect(await db.sync_queue.count()).toBe(0);
    expect(await db.settings.count()).toBe(0);
    expect(await db.jarvis_artifacts.count()).toBe(0);
  });

  it('rolls back all seven tables when the final artifact write fails', async () => {
    const originalRun = await seed();
    const state = harness();
    vi.spyOn(db.jarvis_artifacts, 'bulkAdd').mockRejectedValueOnce(
      new Error('injected artifact write failure'),
    );

    await expect(state.commit.commitKernelTurn(input(state.value))).rejects.toThrow(
      'injected artifact write failure',
    );

    expect(fromJarvisRunRow((await db.jarvis_runs.get('run-kernel'))!)).toEqual(originalRun);
    expect(await db.jarvis_events.count()).toBe(1);
    expect(await db.messages.count()).toBe(0);
    expect(await db.sync_queue.count()).toBe(0);
    expect(await db.settings.count()).toBe(0);
    expect(await db.jarvis_artifacts.count()).toBe(0);
  });
});
