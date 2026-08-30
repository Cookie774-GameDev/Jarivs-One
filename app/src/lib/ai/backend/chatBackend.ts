export const CHAT_BACKEND_AFFINITY_VERSION = 1 as const;

export type ChatBackend = 'opencode' | 'codex';

export interface ChatBackendAffinityV1 {
  version: typeof CHAT_BACKEND_AFFINITY_VERSION;
  backend: ChatBackend;
  locked: boolean;
  selectedAt: number;
  lockedAt?: number;
}

export interface ResolveChatBackendAffinityOptions {
  hasCommittedUserMessage: boolean;
  chatCreatedAt: number;
}

export class ChatBackendLockedError extends Error {
  readonly code = 'chat_backend_locked';

  constructor(
    readonly currentBackend: ChatBackend,
    readonly requestedBackend: ChatBackend,
  ) {
    super(`Chat backend is locked to ${currentBackend}; cannot switch to ${requestedBackend}.`);
    this.name = 'ChatBackendLockedError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isChatBackend(value: unknown): value is ChatBackend {
  return value === 'opencode' || value === 'codex';
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function isChatBackendAffinity(value: unknown): value is ChatBackendAffinityV1 {
  if (
    !isRecord(value) ||
    value.version !== CHAT_BACKEND_AFFINITY_VERSION ||
    !isChatBackend(value.backend) ||
    typeof value.locked !== 'boolean' ||
    !isTimestamp(value.selectedAt)
  ) {
    return false;
  }

  if (value.locked) {
    return isTimestamp(value.lockedAt) && value.lockedAt >= value.selectedAt;
  }

  return value.lockedAt === undefined;
}

function legacyAffinity(options: ResolveChatBackendAffinityOptions): ChatBackendAffinityV1 {
  const selectedAt = isTimestamp(options.chatCreatedAt) ? options.chatCreatedAt : 0;
  if (options.hasCommittedUserMessage) {
    return {
      version: CHAT_BACKEND_AFFINITY_VERSION,
      backend: 'opencode',
      locked: true,
      selectedAt,
      lockedAt: selectedAt,
    };
  }

  return {
    version: CHAT_BACKEND_AFFINITY_VERSION,
    backend: 'opencode',
    locked: false,
    selectedAt,
  };
}

/**
 * Resolve durable chat backend metadata without consulting model, connection,
 * process, or localStorage state. Unsupported metadata fails closed to the
 * legacy OpenCode migration contract.
 */
export function resolveChatBackendAffinity(
  value: unknown,
  options: ResolveChatBackendAffinityOptions,
): ChatBackendAffinityV1 {
  if (!isChatBackendAffinity(value)) {
    return legacyAffinity(options);
  }

  if (options.hasCommittedUserMessage && !value.locked) {
    return { ...value, locked: true, lockedAt: value.selectedAt };
  }

  return value;
}

/** Select a backend while the chat is still empty. Locked selections are immutable. */
export function selectChatBackend(
  affinity: ChatBackendAffinityV1,
  requestedBackend: ChatBackend,
  selectedAt: number,
): ChatBackendAffinityV1 {
  if (affinity.backend === requestedBackend) {
    return affinity;
  }

  if (affinity.locked) {
    throw new ChatBackendLockedError(affinity.backend, requestedBackend);
  }

  return {
    version: CHAT_BACKEND_AFFINITY_VERSION,
    backend: requestedBackend,
    locked: false,
    selectedAt: isTimestamp(selectedAt) ? selectedAt : affinity.selectedAt,
  };
}

/** Lock the current selection after, and only after, the first user message commits. */
export function lockChatBackendOnFirstMessage(
  affinity: ChatBackendAffinityV1,
  committedAt: number,
): ChatBackendAffinityV1 {
  if (affinity.locked) {
    return affinity;
  }

  return {
    ...affinity,
    locked: true,
    lockedAt: isTimestamp(committedAt) ? committedAt : affinity.selectedAt,
  };
}
