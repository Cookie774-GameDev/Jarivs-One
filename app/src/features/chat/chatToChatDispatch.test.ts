import { afterEach, describe, expect, it, vi } from 'vitest';

import { createJarvisDb, type JarvisDexie } from '@/lib/db';
import type { Project, Workspace } from '@/lib/db/schema';
import { TEST_INDEXED_DB, uniqueTestDbName } from '@/test/indexedDb';
import type { Chat, Message, Part } from '@/types/chat';
import type { ChatId, MessageId, ProjectId, WorkspaceId } from '@/types/common';

import type { ChatHandoffProjectionV1 } from './chatHandoffProjection';
import {
  dispatchChatToChat,
  dispatchJarvisSendWithAcceptance,
  type ActiveDispatchScope,
  type ChatToChatDispatchDeps,
  type ChatToChatDispatchInput,
} from './chatToChatDispatch';

const SOURCE_CHAT = Object.freeze({
  id: 'source' as ChatId,
  workspace_id: 'workspace-1' as WorkspaceId,
  project_id: 'project-1' as ProjectId,
  title: 'Source chat',
  mode: 'chat',
  active_agent_ids: [],
  created_at: 10,
  updated_at: 20,
}) satisfies Chat;

const TARGET_CHAT = Object.freeze({
  id: 'supervisor' as ChatId,
  workspace_id: 'workspace-1' as WorkspaceId,
  project_id: 'project-1' as ProjectId,
  title: 'Supervisor chat',
  mode: 'chat',
  active_agent_ids: [],
  created_at: 11,
  updated_at: 21,
}) satisfies Chat;

const WORKSPACE = Object.freeze({
  id: 'workspace-1' as WorkspaceId,
  name: 'Workspace',
  owner_id: 'account-a',
  created_at: 1,
  updated_at: 1,
}) satisfies Workspace;

const PROJECT = Object.freeze({
  id: 'project-1' as ProjectId,
  workspace_id: WORKSPACE.id,
  name: 'Project',
  created_at: 1,
  updated_at: 1,
}) satisfies Project;

const PROJECTION = Object.freeze({
  version: 1,
  policyVersion: 1,
  source: Object.freeze({
    chatId: 'source',
    title: 'Source chat',
    workspaceId: 'workspace-1',
    projectId: 'project-1',
  }),
  snapshotAt: 0,
  boundaryAt: 0,
  boundaryMessageId: null,
  goal: null,
  status: 'idle',
  lastMeaningfulActivity: null,
  recentSections: Object.freeze([]),
  olderDigest: 'No older visible history.',
  summaries: Object.freeze({
    files: Object.freeze([]),
    tools: Object.freeze([]),
    actions: Object.freeze([]),
    decisions: Object.freeze([]),
    blockers: Object.freeze([]),
    results: Object.freeze([]),
  }),
}) satisfies ChatHandoffProjectionV1;

const INPUT = Object.freeze({
  sourceChatId: 'source',
  targetChatId: 'supervisor',
  projection: PROJECTION,
  instruction: 'Review the latest progress and provide guidance.',
  dispatchKey: 'schedule-42:occurrence-7',
}) satisfies ChatToChatDispatchInput;

type HarnessOptions = Readonly<{
  persistenceError?: Error;
  runtimeError?: Error;
  updateError?: Error;
}>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function createHarness(options: HarnessOptions = {}) {
  const chats = new Map<string, Chat>([
    [String(SOURCE_CHAT.id), clone(SOURCE_CHAT)],
    [String(TARGET_CHAT.id), clone(TARGET_CHAT)],
  ]);
  const workspaces = new Map<string, Workspace>([[String(WORKSPACE.id), clone(WORKSPACE)]]);
  const projects = new Map<string, Project>([[String(PROJECT.id), clone(PROJECT)]]);
  const messages = new Map<string, Message>();
  const dispatches: Parameters<ChatToChatDispatchDeps['dispatchKernel']>[0][] = [];
  let scope: ActiveDispatchScope = {
    accountId: 'account-a',
    identitySource: 'local',
    workspaceId: 'workspace-1',
    projectId: 'project-1',
    epoch: 0,
  };
  const persistMessage = vi.fn(
    async (input: Parameters<ChatToChatDispatchDeps['persistMessage']>[0]) => {
      if (options.persistenceError) throw options.persistenceError;
      if (messages.has(String(input.id))) throw new Error('ConstraintError');
      await Promise.resolve();
      const row: Message = { ...clone(input), created_at: 30, updated_at: 30 };
      if (messages.has(String(row.id))) throw new Error('ConstraintError');
      messages.set(String(row.id), row);
      return clone(row);
    },
  );
  const updateMessageParts = vi.fn(async (id: string, parts: Part[]) => {
    if (options.updateError) throw options.updateError;
    const current = messages.get(id);
    if (!current) throw new Error('missing');
    const updated = { ...current, parts: clone(parts), updated_at: current.updated_at + 1 };
    messages.set(id, updated);
    return clone(updated);
  });
  const dispatchKernel = vi.fn(async (detail) => {
    dispatches.push(detail);
    if (options.runtimeError) throw options.runtimeError;
  });
  const deps: ChatToChatDispatchDeps = {
    getChat: async (id) => clone(chats.get(id)),
    getWorkspace: async (id) => clone(workspaces.get(id)),
    getProject: async (id) => clone(projects.get(id)),
    getMessage: async (id) => clone(messages.get(id)),
    persistMessage,
    updateMessageParts,
    readActiveScope: () => clone(scope),
    readModelSelection: () => ({ mode: 'single', providerId: 'openai', modelId: 'gpt-5.5' }),
    readReasoningPreference: () => ({ mode: 'normal', effortOverride: 'high' }),
    readRuntimePolicy: () => ({
      settings: { effort: 'high', fastMode: 'off', performance: 'quality', rlmEnabled: true },
      access: 'write',
      approveAllForRun: true,
    }),
    dispatchKernel,
    now: () => 0,
  };
  return {
    chats,
    workspaces,
    projects,
    messages,
    dispatches,
    persistMessage,
    updateMessageParts,
    dispatchKernel,
    deps,
    setScope(next: ActiveDispatchScope) {
      scope = next;
    },
    scope: () => scope,
  };
}

function durablePart(message: Message) {
  const part = message.parts.find((candidate) => candidate.kind === 'chat_handoff');
  expect(part?.kind).toBe('chat_handoff');
  return part?.kind === 'chat_handoff'
    ? (part.handoff as typeof part.handoff & {
        dispatch: { state: string; failure?: string; targetChatId: string; messageId: string };
      })
    : undefined;
}

describe('dispatchChatToChat', () => {
  it('persists the exact two-part user envelope before exact-target runtime acceptance', async () => {
    const harness = createHarness();
    const receipt = await dispatchChatToChat(INPUT, harness.deps);

    expect(receipt.status).toBe('dispatched');
    expect(harness.persistMessage).toHaveBeenCalledOnce();
    expect(harness.dispatchKernel).toHaveBeenCalledOnce();
    const message = [...harness.messages.values()][0]!;
    expect(message.role).toBe('user');
    expect(message.chat_id).toBe(TARGET_CHAT.id);
    expect(message.parts.map((part) => part.kind)).toEqual(['text', 'chat_handoff']);
    const handoff = durablePart(message)!;
    expect(handoff.dispatch).toMatchObject({
      state: 'accepted',
      targetChatId: 'supervisor',
      messageId: String(message.id),
    });
    expect(harness.dispatches[0]).toMatchObject({
      chatId: 'supervisor',
      cancellationKey: String(message.id),
      automaticModelRoutingEligible: false,
    });
    expect(harness.dispatches[0]).not.toHaveProperty('approveAllForRun');
  });

  it('returns the durable accepted receipt for the same key without a second write or event', async () => {
    const harness = createHarness();
    const first = await dispatchChatToChat(INPUT, harness.deps);
    const second = await dispatchChatToChat(INPUT, harness.deps);
    expect(second).toEqual(first);
    expect(harness.persistMessage).toHaveBeenCalledOnce();
    expect(harness.dispatchKernel).toHaveBeenCalledOnce();
  });

  it('emits nothing when persistence fails', async () => {
    const failure = new Error('disk unavailable');
    const harness = createHarness({ persistenceError: failure });
    await expect(dispatchChatToChat(INPUT, harness.deps)).rejects.toBe(failure);
    expect(harness.dispatchKernel).not.toHaveBeenCalled();
  });

  it('fails closed for wrong-account ownership, project deletion/move, and cross-workspace targets', async () => {
    const wrongOwner = createHarness();
    wrongOwner.workspaces.set('workspace-1', { ...WORKSPACE, owner_id: 'account-b' });
    await expect(dispatchChatToChat(INPUT, wrongOwner.deps)).resolves.toMatchObject({
      status: 'rejected',
      reason: 'access_denied',
    });

    const deletedProject = createHarness();
    deletedProject.projects.clear();
    await expect(dispatchChatToChat(INPUT, deletedProject.deps)).resolves.toMatchObject({
      status: 'rejected',
      reason: 'access_denied',
    });

    const movedProject = createHarness();
    movedProject.projects.set('project-1', {
      ...PROJECT,
      workspace_id: 'workspace-2' as WorkspaceId,
    });
    await expect(dispatchChatToChat(INPUT, movedProject.deps)).resolves.toMatchObject({
      status: 'rejected',
      reason: 'access_denied',
    });

    const crossWorkspace = createHarness();
    crossWorkspace.chats.set('supervisor', {
      ...TARGET_CHAT,
      workspace_id: 'workspace-2' as WorkspaceId,
    });
    await expect(dispatchChatToChat(INPUT, crossWorkspace.deps)).resolves.toMatchObject({
      status: 'rejected',
      reason: 'access_denied',
    });
  });

  it('detects account A to B to A epoch changes and emits nothing after persistence', async () => {
    const harness = createHarness();
    harness.deps.persistMessage = vi.fn(async (input) => {
      const row: Message = { ...clone(input), created_at: 30, updated_at: 30 };
      harness.messages.set(String(row.id), row);
      harness.setScope({ ...harness.scope(), accountId: 'account-b', epoch: 1 });
      harness.setScope({ ...harness.scope(), accountId: 'account-a', epoch: 2 });
      return clone(row);
    });

    await expect(dispatchChatToChat(INPUT, harness.deps)).resolves.toMatchObject({
      status: 'rejected',
      reason: 'access_denied',
    });
    expect(harness.dispatchKernel).not.toHaveBeenCalled();
    expect(durablePart([...harness.messages.values()][0]!)?.dispatch).toMatchObject({
      state: 'failed',
      failure: 'authority_revoked',
    });
  });

  it('revalidates archive and project membership immediately after persistence', async () => {
    const archived = createHarness();
    archived.deps.persistMessage = vi.fn(async (input) => {
      const row: Message = { ...clone(input), created_at: 30, updated_at: 30 };
      archived.messages.set(String(row.id), row);
      archived.chats.set('supervisor', { ...TARGET_CHAT, archived: true });
      return clone(row);
    });
    await expect(dispatchChatToChat(INPUT, archived.deps)).resolves.toMatchObject({
      status: 'rejected',
      reason: 'access_denied',
    });
    expect(archived.dispatchKernel).not.toHaveBeenCalled();

    const moved = createHarness();
    moved.deps.persistMessage = vi.fn(async (input) => {
      const row: Message = { ...clone(input), created_at: 30, updated_at: 30 };
      moved.messages.set(String(row.id), row);
      moved.projects.set('project-1', { ...PROJECT, workspace_id: 'workspace-2' as WorkspaceId });
      return clone(row);
    });
    await expect(dispatchChatToChat(INPUT, moved.deps)).resolves.toMatchObject({
      status: 'rejected',
      reason: 'access_denied',
    });
    expect(moved.dispatchKernel).not.toHaveBeenCalled();
  });

  it('treats forged extra parts, prompt changes, marker changes, and cross-target key reuse as conflicts', async () => {
    for (const mutate of [
      (message: Message) => message.parts.push({ kind: 'text', text: 'extra' }),
      (message: Message) => message.parts.push(clone(message.parts[1]!)),
      (message: Message) => ((message.parts[0] as { kind: 'text'; text: string }).text = 'forged'),
      (message: Message) => {
        (durablePart(message)! as { version: number }).version = 2;
      },
      (message: Message) => {
        (durablePart(message)! as { instruction: string }).instruction = 'forged';
      },
      (message: Message) => {
        (durablePart(message)!.projection as { status: string }).status = 'forged';
      },
      (message: Message) => {
        durablePart(message)!.dispatch.targetChatId = 'other';
      },
    ]) {
      const harness = createHarness();
      await dispatchChatToChat(INPUT, harness.deps);
      mutate([...harness.messages.values()][0]!);
      await expect(dispatchChatToChat(INPUT, harness.deps)).resolves.toMatchObject({
        status: 'rejected',
        reason: 'dispatch_key_conflict',
      });
      expect(harness.dispatchKernel).toHaveBeenCalledOnce();
    }

    const crossTarget = createHarness();
    await dispatchChatToChat(INPUT, crossTarget.deps);
    crossTarget.chats.set('supervisor-2', { ...TARGET_CHAT, id: 'supervisor-2' as ChatId });
    await expect(
      dispatchChatToChat({ ...INPUT, targetChatId: 'supervisor-2' }, crossTarget.deps),
    ).resolves.toMatchObject({ status: 'rejected', reason: 'dispatch_key_conflict' });
  });

  it('deep-copies and sanitizes nested projection strings without persisting caller bytes', async () => {
    const harness = createHarness();
    const unsafe = {
      ...PROJECTION,
      summaries: { ...PROJECTION.summaries, tools: ['result api_key=raw-nested-secret'] },
    } satisfies ChatHandoffProjectionV1;
    await dispatchChatToChat({ ...INPUT, projection: unsafe }, harness.deps);
    const serialized = JSON.stringify([...harness.messages.values()]);
    expect(serialized).not.toContain('raw-nested-secret');
    expect(serialized).toContain('[REDACTED]');
  });

  it.each([
    ['unknown nested reasoning', { ...PROJECTION, reasoning: 'hidden' }],
    [
      'binary data URL',
      { ...PROJECTION, olderDigest: 'data:application/octet-stream;base64,AAAA' },
    ],
    [
      'oversized collection',
      { ...PROJECTION, recentSections: Array.from({ length: 257 }, () => ({})) },
    ],
    ['invalid timestamp', { ...PROJECTION, snapshotAt: Number.NaN }],
  ])('rejects unsafe projection shape: %s', async (_label, projection) => {
    const harness = createHarness();
    await expect(
      dispatchChatToChat(
        { ...INPUT, projection: projection as ChatHandoffProjectionV1 },
        harness.deps,
      ),
    ).resolves.toMatchObject({ status: 'rejected', reason: 'projection_unsafe' });
    expect(harness.persistMessage).not.toHaveBeenCalled();
  });

  it('persists failed runtime truth and never re-emits it after retry/reload', async () => {
    const harness = createHarness({ runtimeError: new Error('runtime rejected') });
    const first = await dispatchChatToChat(INPUT, harness.deps);
    expect(first).toMatchObject({ status: 'failed', reason: 'runtime_rejected' });
    expect(durablePart([...harness.messages.values()][0]!)?.dispatch).toMatchObject({
      state: 'failed',
      failure: 'runtime_rejected',
    });
    expect(await dispatchChatToChat(INPUT, harness.deps)).toEqual(first);
    expect(harness.dispatchKernel).toHaveBeenCalledOnce();
  });

  it('leaves durable pending truth when final state persistence fails and does not re-emit', async () => {
    const harness = createHarness({ updateError: new Error('disk unavailable') });
    const first = await dispatchChatToChat(INPUT, harness.deps);
    expect(first.status).toBe('pending');
    expect(durablePart([...harness.messages.values()][0]!)?.dispatch.state).toBe('pending');
    expect((await dispatchChatToChat(INPUT, harness.deps)).status).toBe('pending');
    expect(harness.dispatchKernel).toHaveBeenCalledOnce();
  });

  it('uses durable uniqueness for simultaneous claims without an in-memory mutex', async () => {
    const harness = createHarness();
    const receipts = await Promise.all([
      dispatchChatToChat(INPUT, harness.deps),
      dispatchChatToChat(INPUT, harness.deps),
    ]);
    expect(harness.messages).toHaveLength(1);
    expect(harness.dispatchKernel).toHaveBeenCalledOnce();
    expect(receipts.every((receipt) => ['dispatched', 'pending'].includes(receipt.status))).toBe(
      true,
    );
  });
});

describe('dispatchJarvisSendWithAcceptance', () => {
  afterEach(() => vi.useRealTimers());

  it('accepts only the exact chat ID and cancellation key and rejects exact cancellation', async () => {
    const send = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<{ chatId: string; cancellationKey: string }>).detail;
      window.dispatchEvent(
        new CustomEvent('jarvis:run-state', {
          detail: { ...detail, chatId: 'wrong', status: 'running' },
        }),
      );
      window.dispatchEvent(
        new CustomEvent('jarvis:run-state', {
          detail: { ...detail, cancellationKey: 'wrong', status: 'running' },
        }),
      );
      window.dispatchEvent(
        new CustomEvent('jarvis:run-state', { detail: { ...detail, status: 'running' } }),
      );
    });
    window.addEventListener('jarvis:send', send);
    await expect(
      dispatchJarvisSendWithAcceptance(
        { chatId: 'supervisor', cancellationKey: 'message-1' as MessageId, text: 'hello' },
        50,
      ),
    ).resolves.toBeUndefined();
    window.removeEventListener('jarvis:send', send);

    const cancel = (event: Event) => {
      const detail = (event as CustomEvent<{ chatId: string; cancellationKey: string }>).detail;
      window.dispatchEvent(
        new CustomEvent('jarvis:run-state', { detail: { ...detail, status: 'cancelled' } }),
      );
    };
    window.addEventListener('jarvis:send', cancel);
    await expect(
      dispatchJarvisSendWithAcceptance(
        { chatId: 'supervisor', cancellationKey: 'message-2' as MessageId, text: 'hello' },
        50,
      ),
    ).rejects.toThrow('CANCELLED');
    window.removeEventListener('jarvis:send', cancel);
  });

  it('rejects when the exact runtime acceptance times out', async () => {
    vi.useFakeTimers();
    const acceptance = dispatchJarvisSendWithAcceptance(
      {
        chatId: 'supervisor',
        cancellationKey: 'message-timeout' as MessageId,
        text: 'hello',
      },
      10,
    );
    const rejection = expect(acceptance).rejects.toThrow('TIMEOUT');
    await vi.advanceTimersByTimeAsync(11);
    await rejection;
  });
});

describe('durable IndexedDB claim integration', () => {
  let opened: JarvisDexie[] = [];
  afterEach(async () => {
    const databases = opened.splice(0);
    for (const database of databases.slice(1)) database.close();
    if (databases[0]) await databases[0].delete();
  });

  function databaseDeps(
    database: JarvisDexie,
    dispatchKernel: ChatToChatDispatchDeps['dispatchKernel'],
  ): ChatToChatDispatchDeps {
    return {
      getChat: (id) => database.chats.get(id as ChatId),
      getWorkspace: (id) => database.workspaces.get(id as WorkspaceId),
      getProject: (id) => database.projects.get(id as ProjectId),
      getMessage: (id) => database.messages.get(id as MessageId),
      persistMessage: async (input) => {
        const row: Message = { ...clone(input), created_at: 30, updated_at: 30 };
        await database.messages.add(row);
        return row;
      },
      updateMessageParts: async (id, parts) => {
        await database.messages.update(id as MessageId, { parts: clone(parts), updated_at: 31 });
        const row = await database.messages.get(id as MessageId);
        if (!row) throw new Error('missing');
        return row;
      },
      readActiveScope: () => ({
        accountId: 'account-a',
        identitySource: 'local',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        epoch: 0,
      }),
      readModelSelection: () => undefined,
      readReasoningPreference: () => ({ mode: 'normal', effortOverride: 'high' }),
      readRuntimePolicy: () => ({
        settings: { effort: 'high', fastMode: 'off', performance: 'balanced', rlmEnabled: false },
        access: 'write',
        approveAllForRun: false,
      }),
      dispatchKernel,
      now: () => 0,
    };
  }

  it('admits one concurrent claimant and remains idempotent after database reopen', async () => {
    const name = uniqueTestDbName('chat-dispatch-claim');
    const first = createJarvisDb(name, TEST_INDEXED_DB);
    const second = createJarvisDb(name, TEST_INDEXED_DB);
    opened = [first, second];
    await Promise.all([first.open(), second.open()]);
    await first.workspaces.put(WORKSPACE);
    await first.projects.put(PROJECT);
    await first.chats.bulkPut([SOURCE_CHAT, TARGET_CHAT]);
    const sends: string[] = [];
    const dispatchKernel = vi.fn(async (detail) => {
      sends.push(String(detail.cancellationKey));
    });
    const receipts = await Promise.all([
      dispatchChatToChat(INPUT, databaseDeps(first, dispatchKernel)),
      dispatchChatToChat(INPUT, databaseDeps(second, dispatchKernel)),
    ]);
    expect(await first.messages.count()).toBe(1);
    expect(dispatchKernel).toHaveBeenCalledOnce();
    expect(receipts.map((receipt) => receipt.status).sort()).toEqual(['dispatched', 'pending']);

    first.close();
    second.close();
    const reopened = createJarvisDb(name, TEST_INDEXED_DB);
    opened.push(reopened);
    await reopened.open();
    const replay = await dispatchChatToChat(INPUT, databaseDeps(reopened, dispatchKernel));
    expect(replay.status).toBe('dispatched');
    expect(await reopened.messages.count()).toBe(1);
    expect(sends).toHaveLength(1);
  });
});
