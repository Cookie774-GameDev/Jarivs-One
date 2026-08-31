import { readChatRuntimePolicyState } from '@/features/chat/runtime/chatRuntimeSettingsStore';
import type { ChatRuntimePolicyState } from '@/features/chat/runtime/chatRuntimeSettingsStore';
import type { SendDetail } from '@/lib/ai/runtime';
import { selectionFromOption, type ChatModelSelection } from '@/lib/ai/modelSelection';
import type { ReasoningPreference } from '@/lib/ai/reasoningControls';
import { chatRepo, messageRepo } from '@/lib/db/repositories';
import { useAuthStore } from '@/stores/auth';
import type { Chat, Message, Part } from '@/types/chat';
import type { ChatId, MessageId, ProviderId } from '@/types/common';

import {
  renderChatHandoffPrompt,
  sanitizeChatHandoffText,
  type ChatHandoffMessagePartV1,
  type ChatHandoffProjectionV1,
} from './chatHandoffProjection';
import { readChatReasoningPreference } from './reasoningSlashStore';

export type ChatToChatDispatchInput = Readonly<{
  sourceChatId: string;
  targetChatId: string;
  projection: ChatHandoffProjectionV1;
  instruction: string;
  dispatchKey: string;
}>;

export type ChatToChatDispatchReceipt =
  | Readonly<{
      status: 'dispatched';
      dispatchKey: string;
      targetChatId: string;
      messageId: string;
    }>
  | Readonly<{
      status: 'rejected';
      reason:
        | 'invalid_input'
        | 'same_chat'
        | 'chat_unavailable'
        | 'access_denied'
        | 'projection_mismatch'
        | 'dispatch_key_conflict';
      dispatchKey: string;
      targetChatId: string;
    }>;

type PersistedUserMessageInput = Readonly<{
  chat_id: ChatId;
  role: 'user';
  parts: Part[];
}>;

export type ChatToChatDispatchDeps = Readonly<{
  getChat: (id: string) => Promise<Chat | undefined>;
  listMessages: (chatId: string) => Promise<readonly Message[]>;
  persistMessage: (input: PersistedUserMessageInput) => Promise<Message>;
  canAccess: (source: Chat, target: Chat) => boolean;
  readModelSelection: (target: Chat) => ChatModelSelection | undefined;
  readReasoningPreference: (chatId: string) => ReasoningPreference;
  readRuntimePolicy: (chatId: string) => ChatRuntimePolicyState;
  dispatchKernel: (detail: SendDetail) => void;
}>;

type AccessResult =
  | Readonly<{ ok: true; source: Chat; target: Chat }>
  | Readonly<{ ok: false; reason: 'chat_unavailable' | 'access_denied' }>;

type DispatchMarkerResult =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'existing'; messageId: string }>
  | Readonly<{ kind: 'conflict' }>;

function stableValue(value: string, maximumLength: number): boolean {
  const clean = value.trim();
  return (
    clean.length > 0 &&
    clean === value &&
    clean.length <= maximumLength &&
    !/[\u0000-\u001f\u007f]/u.test(clean)
  );
}

function projectId(chat: Chat): string | null {
  return chat.project_id ? String(chat.project_id) : null;
}

function projectionMatchesSource(input: ChatToChatDispatchInput, source: Chat): boolean {
  return (
    input.projection.version === 1 &&
    input.projection.policyVersion === 1 &&
    input.projection.source.chatId === input.sourceChatId &&
    String(source.id) === input.sourceChatId &&
    input.projection.source.workspaceId === String(source.workspace_id) &&
    input.projection.source.projectId === projectId(source)
  );
}

function rejected(
  input: ChatToChatDispatchInput,
  reason: Extract<ChatToChatDispatchReceipt, { status: 'rejected' }>['reason'],
): ChatToChatDispatchReceipt {
  return Object.freeze({
    status: 'rejected' as const,
    reason,
    dispatchKey: input.dispatchKey,
    targetChatId: input.targetChatId,
  });
}

async function resolveAccess(
  input: ChatToChatDispatchInput,
  deps: ChatToChatDispatchDeps,
): Promise<AccessResult> {
  let source: Chat | undefined;
  let target: Chat | undefined;
  try {
    [source, target] = await Promise.all([
      deps.getChat(input.sourceChatId),
      deps.getChat(input.targetChatId),
    ]);
  } catch {
    return { ok: false, reason: 'chat_unavailable' };
  }
  if (!source || !target) return { ok: false, reason: 'chat_unavailable' };
  if (String(source.id) !== input.sourceChatId || String(target.id) !== input.targetChatId) {
    return { ok: false, reason: 'chat_unavailable' };
  }
  try {
    if (!deps.canAccess(source, target)) return { ok: false, reason: 'access_denied' };
  } catch {
    return { ok: false, reason: 'access_denied' };
  }
  return { ok: true, source, target };
}

function dispatchMarker(
  messages: readonly Message[],
  input: ChatToChatDispatchInput,
): DispatchMarkerResult {
  let existingMessageId: string | null = null;
  for (const message of messages) {
    if (String(message.chat_id) !== input.targetChatId || message.role !== 'user') continue;
    for (const part of message.parts) {
      if (part.kind !== 'chat_handoff' || part.handoff.dispatchKey !== input.dispatchKey) continue;
      if (part.handoff.sourceChatId !== input.sourceChatId) return { kind: 'conflict' };
      existingMessageId ??= String(message.id);
    }
  }
  return existingMessageId ? { kind: 'existing', messageId: existingMessageId } : { kind: 'none' };
}

function defaultModelSelection(target: Chat): ChatModelSelection | undefined {
  const current = useAuthStore.getState().chatModelSelection;
  const connection = target.connection;
  if (!connection) return current.mode === 'none' ? undefined : current;
  const modelId =
    connection.modelId ??
    (current.mode === 'single' && current.providerId === connection.providerId
      ? current.modelId
      : undefined);
  return modelId
    ? selectionFromOption(connection.providerId as ProviderId, modelId, connection)
    : undefined;
}

const browserChatToChatDispatchDeps: ChatToChatDispatchDeps = Object.freeze({
  getChat: (id) => chatRepo.getById(id as ChatId),
  listMessages: (chatId) => messageRepo.listByChat(chatId as ChatId),
  persistMessage: (input) => messageRepo.create(input),
  canAccess: (source, target) => !source.archived && !target.archived,
  readModelSelection: defaultModelSelection,
  readReasoningPreference: (chatId) => readChatReasoningPreference(chatId),
  readRuntimePolicy: (chatId) => readChatRuntimePolicyState(chatId),
  dispatchKernel: (detail) => window.dispatchEvent(new CustomEvent('jarvis:send', { detail })),
});

export async function dispatchChatToChat(
  input: ChatToChatDispatchInput,
  deps: ChatToChatDispatchDeps = browserChatToChatDispatchDeps,
): Promise<ChatToChatDispatchReceipt> {
  if (
    !stableValue(input.sourceChatId, 512) ||
    !stableValue(input.targetChatId, 512) ||
    !stableValue(input.dispatchKey, 1_024) ||
    !input.instruction.trim()
  ) {
    return rejected(input, 'invalid_input');
  }
  if (input.sourceChatId === input.targetChatId) return rejected(input, 'same_chat');

  const initialAccess = await resolveAccess(input, deps);
  if (!initialAccess.ok) return rejected(input, initialAccess.reason);
  if (!projectionMatchesSource(input, initialAccess.source)) {
    return rejected(input, 'projection_mismatch');
  }

  let messages: readonly Message[];
  try {
    messages = await deps.listMessages(input.targetChatId);
  } catch {
    return rejected(input, 'chat_unavailable');
  }
  const marker = dispatchMarker(messages, input);

  const currentAccess = await resolveAccess(input, deps);
  if (!currentAccess.ok) return rejected(input, currentAccess.reason);
  if (!projectionMatchesSource(input, currentAccess.source)) {
    return rejected(input, 'projection_mismatch');
  }
  if (marker.kind === 'conflict') return rejected(input, 'dispatch_key_conflict');
  if (marker.kind === 'existing') {
    return Object.freeze({
      status: 'dispatched' as const,
      dispatchKey: input.dispatchKey,
      targetChatId: input.targetChatId,
      messageId: marker.messageId,
    });
  }

  const instruction = sanitizeChatHandoffText(input.instruction.trim());
  const text = renderChatHandoffPrompt(input.projection, instruction);
  const handoff: ChatHandoffMessagePartV1 = Object.freeze({
    version: 1,
    sourceChatId: input.sourceChatId,
    sourceTitle: input.projection.source.title,
    snapshotAt: input.projection.snapshotAt,
    boundaryMessageId: input.projection.boundaryMessageId,
    instruction,
    projection: input.projection,
    dispatchKey: input.dispatchKey,
  });
  const modelSelection = deps.readModelSelection(currentAccess.target);
  const reasoningPreference = deps.readReasoningPreference(input.targetChatId);
  const runtimePolicy = deps.readRuntimePolicy(input.targetChatId);
  const persisted = await deps.persistMessage({
    chat_id: currentAccess.target.id,
    role: 'user',
    parts: [
      { kind: 'text', text },
      { kind: 'chat_handoff', handoff },
    ],
  });
  const detail: SendDetail = {
    chatId: input.targetChatId,
    cancellationKey: persisted.id as MessageId,
    text,
    ...(modelSelection ? { modelSelectionOverride: modelSelection } : {}),
    reasoningPreference,
    runtimeSettings: runtimePolicy.settings,
    accessLevel: runtimePolicy.access,
    automaticModelRoutingEligible: false,
  };
  deps.dispatchKernel(detail);
  return Object.freeze({
    status: 'dispatched' as const,
    dispatchKey: input.dispatchKey,
    targetChatId: input.targetChatId,
    messageId: String(persisted.id),
  });
}
