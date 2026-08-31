import { describe, expect, it, vi } from 'vitest';

import type { ChatModelSelection } from '@/lib/ai/modelSelection';
import type { Chat, Message } from '@/types/chat';
import type { ChatId, MessageId, ProjectId, WorkspaceId } from '@/types/common';

import type { ChatHandoffProjectionV1 } from './chatHandoffProjection';
import {
  dispatchChatToChat,
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
  olderDigest: 'Older visible history: none.',
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

const CANONICAL_PROMPT = [
  'Review the latest progress and provide guidance.',
  'Chat handoff from “Source chat” (source)',
  'Snapshot at: 0 (1970-01-01T00:00:00.000Z)',
  'Three-day boundary at: 0 (1970-01-01T00:00:00.000Z)',
  'Boundary message: none',
  'Status: idle',
  'Complete visible transcript from the most recent three calendar days:',
  '(No visible recent messages.)',
  'Older visible history: none.',
].join('\n\n');

type HarnessOptions = Readonly<{
  sourceReads?: readonly (Chat | undefined)[];
  targetReads?: readonly (Chat | undefined)[];
  messages?: readonly Message[];
  persistenceError?: Error;
  canAccess?: (source: Chat, target: Chat) => boolean;
}>;

function persistedMessage(
  id: string,
  dispatchKey: string = INPUT.dispatchKey,
  sourceChatId: string = INPUT.sourceChatId,
): Message {
  return {
    id: id as MessageId,
    chat_id: TARGET_CHAT.id,
    role: 'user',
    parts: [
      { kind: 'text', text: CANONICAL_PROMPT },
      {
        kind: 'chat_handoff',
        handoff: {
          version: 1,
          sourceChatId,
          sourceTitle: PROJECTION.source.title,
          snapshotAt: PROJECTION.snapshotAt,
          boundaryMessageId: PROJECTION.boundaryMessageId,
          instruction: INPUT.instruction,
          projection: PROJECTION,
          dispatchKey,
        },
      },
    ],
    created_at: 30,
    updated_at: 30,
  };
}

function createHarness(options: HarnessOptions = {}) {
  const calls: string[] = [];
  const persistedInputs: Array<Parameters<ChatToChatDispatchDeps['persistMessage']>[0]> = [];
  const dispatchedDetails: Array<Parameters<ChatToChatDispatchDeps['dispatchKernel']>[0]> = [];
  const sourceReads = [...(options.sourceReads ?? [SOURCE_CHAT, SOURCE_CHAT])];
  const targetReads = [...(options.targetReads ?? [TARGET_CHAT, TARGET_CHAT])];
  const modelSelection: ChatModelSelection = {
    mode: 'single',
    providerId: 'openai',
    modelId: 'gpt-5.5',
  };
  const getChat = vi.fn(async (id: string) => {
    calls.push(`get-${id}`);
    return id === INPUT.sourceChatId ? sourceReads.shift() : targetReads.shift();
  });
  const listMessages = vi.fn(async (chatId: string) => {
    calls.push(`list-${chatId}`);
    return options.messages ?? [];
  });
  const persistMessage = vi.fn(async (message) => {
    calls.push('persist-message');
    persistedInputs.push(message);
    if (options.persistenceError) throw options.persistenceError;
    return {
      ...message,
      id: 'message-1' as MessageId,
      created_at: 30,
      updated_at: 30,
    } satisfies Message;
  });
  const readModelSelection = vi.fn(() => {
    calls.push('read-model-selection');
    return modelSelection;
  });
  const readReasoningPreference = vi.fn(() => {
    calls.push('read-reasoning');
    return { mode: 'normal' as const, effortOverride: 'high' as const };
  });
  const readRuntimePolicy = vi.fn(() => {
    calls.push('read-runtime-policy');
    return {
      settings: {
        effort: 'high' as const,
        fastMode: 'off' as const,
        performance: 'quality' as const,
        rlmEnabled: true,
      },
      access: 'write' as const,
      approveAllForRun: true,
    };
  });
  const dispatchKernel = vi.fn((detail) => {
    calls.push('dispatch-kernel');
    dispatchedDetails.push(detail);
  });
  const deps = {
    getChat,
    listMessages,
    persistMessage,
    canAccess: options.canAccess ?? ((source, target) => !source.archived && !target.archived),
    readModelSelection,
    readReasoningPreference,
    readRuntimePolicy,
    dispatchKernel,
  } satisfies ChatToChatDispatchDeps;
  return {
    calls,
    deps,
    dispatchedDetails,
    getChat,
    listMessages,
    persistMessage,
    persistedInputs,
    readModelSelection,
    readReasoningPreference,
    readRuntimePolicy,
  };
}

describe('dispatchChatToChat', () => {
  it('persists one visible canonical user handoff before dispatching the exact target turn', async () => {
    const harness = createHarness();

    const receipt = await dispatchChatToChat(INPUT, harness.deps);

    expect(harness.calls).toEqual([
      'get-source',
      'get-supervisor',
      'list-supervisor',
      'get-source',
      'get-supervisor',
      'read-model-selection',
      'read-reasoning',
      'read-runtime-policy',
      'persist-message',
      'dispatch-kernel',
    ]);
    expect(receipt).toEqual({
      status: 'dispatched',
      dispatchKey: 'schedule-42:occurrence-7',
      targetChatId: 'supervisor',
      messageId: 'message-1',
    });
    expect(harness.persistedInputs).toEqual([
      {
        chat_id: 'supervisor',
        role: 'user',
        parts: [
          { kind: 'text', text: CANONICAL_PROMPT },
          {
            kind: 'chat_handoff',
            handoff: {
              version: 1,
              sourceChatId: 'source',
              sourceTitle: 'Source chat',
              snapshotAt: 0,
              boundaryMessageId: null,
              instruction: 'Review the latest progress and provide guidance.',
              projection: PROJECTION,
              dispatchKey: 'schedule-42:occurrence-7',
            },
          },
        ],
      },
    ]);
    expect(harness.dispatchedDetails).toEqual([
      {
        chatId: 'supervisor',
        cancellationKey: 'message-1',
        text: CANONICAL_PROMPT,
        modelSelectionOverride: {
          mode: 'single',
          providerId: 'openai',
          modelId: 'gpt-5.5',
        },
        reasoningPreference: { mode: 'normal', effortOverride: 'high' },
        runtimeSettings: {
          effort: 'high',
          fastMode: 'off',
          performance: 'quality',
          rlmEnabled: true,
        },
        accessLevel: 'write',
        automaticModelRoutingEligible: false,
      },
    ]);
    expect(harness.dispatchedDetails[0]).not.toHaveProperty('approveAllForRun');
    expect(harness.dispatchedDetails[0]).not.toHaveProperty('autoApproveActions');
  });

  it('returns the persisted receipt for the same dispatch key without a second write or event', async () => {
    const existing = persistedMessage('message-existing');
    const harness = createHarness({ messages: [existing] });

    await expect(dispatchChatToChat(INPUT, harness.deps)).resolves.toEqual({
      status: 'dispatched',
      dispatchKey: 'schedule-42:occurrence-7',
      targetChatId: 'supervisor',
      messageId: 'message-existing',
    });

    expect(harness.getChat).toHaveBeenCalledTimes(4);
    expect(harness.listMessages).toHaveBeenCalledWith('supervisor');
    expect(harness.persistMessage).not.toHaveBeenCalled();
    expect(harness.dispatchedDetails).toEqual([]);
    expect(harness.readModelSelection).not.toHaveBeenCalled();
    expect(harness.readReasoningPreference).not.toHaveBeenCalled();
    expect(harness.readRuntimePolicy).not.toHaveBeenCalled();
  });

  it('emits no event when persistence fails', async () => {
    const persistenceError = new Error('disk unavailable');
    const harness = createHarness({ persistenceError });

    await expect(dispatchChatToChat(INPUT, harness.deps)).rejects.toBe(persistenceError);

    expect(harness.persistMessage).toHaveBeenCalledOnce();
    expect(harness.dispatchedDetails).toEqual([]);
  });

  it('sanitizes the scheduled instruction before it enters the visible message or event', async () => {
    const harness = createHarness();

    await dispatchChatToChat(
      { ...INPUT, instruction: 'Use api_key=raw-secret and continue.' },
      harness.deps,
    );

    const persisted = JSON.stringify(harness.persistedInputs);
    const dispatched = JSON.stringify(harness.dispatchedDetails);
    expect(persisted).not.toContain('raw-secret');
    expect(dispatched).not.toContain('raw-secret');
    expect(harness.persistedInputs[0]?.parts[1]).toMatchObject({
      kind: 'chat_handoff',
      handoff: { instruction: 'Use [REDACTED] and continue.' },
    });
    expect(harness.dispatchedDetails[0]?.text).toContain('Use [REDACTED] and continue.');
  });

  it.each([
    ['missing source', [undefined, undefined], [TARGET_CHAT, TARGET_CHAT]],
    ['missing target', [SOURCE_CHAT, SOURCE_CHAT], [undefined, undefined]],
  ] as const)('fails closed for a %s chat', async (_label, sourceReads, targetReads) => {
    const harness = createHarness({ sourceReads, targetReads });

    await expect(dispatchChatToChat(INPUT, harness.deps)).resolves.toEqual({
      status: 'rejected',
      reason: 'chat_unavailable',
      dispatchKey: 'schedule-42:occurrence-7',
      targetChatId: 'supervisor',
    });

    expect(harness.listMessages).not.toHaveBeenCalled();
    expect(harness.persistMessage).not.toHaveBeenCalled();
    expect(harness.dispatchedDetails).toEqual([]);
  });

  it('fails closed when current access is denied', async () => {
    const harness = createHarness({ canAccess: () => false });

    await expect(dispatchChatToChat(INPUT, harness.deps)).resolves.toEqual({
      status: 'rejected',
      reason: 'access_denied',
      dispatchKey: 'schedule-42:occurrence-7',
      targetChatId: 'supervisor',
    });

    expect(harness.listMessages).not.toHaveBeenCalled();
    expect(harness.persistMessage).not.toHaveBeenCalled();
    expect(harness.dispatchedDetails).toEqual([]);
  });

  it('revalidates source and target after the marker read and fails closed on revoked access', async () => {
    const revokedTarget = { ...TARGET_CHAT, archived: true } satisfies Chat;
    const harness = createHarness({ targetReads: [TARGET_CHAT, revokedTarget] });

    await expect(dispatchChatToChat(INPUT, harness.deps)).resolves.toEqual({
      status: 'rejected',
      reason: 'access_denied',
      dispatchKey: 'schedule-42:occurrence-7',
      targetChatId: 'supervisor',
    });

    expect(harness.listMessages).toHaveBeenCalledOnce();
    expect(harness.persistMessage).not.toHaveBeenCalled();
    expect(harness.dispatchedDetails).toEqual([]);
  });

  it('rejects a repository result whose canonical target ID is not the requested target', async () => {
    const wrongTarget = { ...TARGET_CHAT, id: 'different-target' as ChatId } satisfies Chat;
    const harness = createHarness({ targetReads: [wrongTarget, wrongTarget] });

    await expect(dispatchChatToChat(INPUT, harness.deps)).resolves.toEqual({
      status: 'rejected',
      reason: 'chat_unavailable',
      dispatchKey: 'schedule-42:occurrence-7',
      targetChatId: 'supervisor',
    });

    expect(harness.listMessages).not.toHaveBeenCalled();
    expect(harness.persistMessage).not.toHaveBeenCalled();
    expect(harness.dispatchedDetails).toEqual([]);
  });

  it('rejects a projection whose canonical source scope no longer matches the source chat', async () => {
    const movedSource = {
      ...SOURCE_CHAT,
      workspace_id: 'workspace-2' as WorkspaceId,
    } satisfies Chat;
    const harness = createHarness({ sourceReads: [movedSource, movedSource] });

    await expect(dispatchChatToChat(INPUT, harness.deps)).resolves.toEqual({
      status: 'rejected',
      reason: 'projection_mismatch',
      dispatchKey: 'schedule-42:occurrence-7',
      targetChatId: 'supervisor',
    });

    expect(harness.listMessages).not.toHaveBeenCalled();
    expect(harness.persistMessage).not.toHaveBeenCalled();
    expect(harness.dispatchedDetails).toEqual([]);
  });

  it('fails closed when a persisted dispatch key belongs to another source chat', async () => {
    const harness = createHarness({
      messages: [persistedMessage('message-collision', INPUT.dispatchKey, 'another-source')],
    });

    await expect(dispatchChatToChat(INPUT, harness.deps)).resolves.toEqual({
      status: 'rejected',
      reason: 'dispatch_key_conflict',
      dispatchKey: 'schedule-42:occurrence-7',
      targetChatId: 'supervisor',
    });

    expect(harness.persistMessage).not.toHaveBeenCalled();
    expect(harness.dispatchedDetails).toEqual([]);
  });
});
