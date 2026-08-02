import type { ChatId } from '@/types/common';

export interface VoiceSessionBinding {
  sessionId: string;
  accountId: string;
  chatId: ChatId;
  startedAt: number;
  activeRunId?: string;
}

function stableIdentifier(value: string): boolean {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

export function newVoiceSessionId(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID !== 'function') throw new Error('voice_session_crypto_unavailable');
  return `vsession_${randomUUID.call(globalThis.crypto)}`;
}

export function createVoiceSessionBinding(input: {
  sessionId: string;
  accountId: string;
  chatId: ChatId;
  startedAt: number;
}): Readonly<VoiceSessionBinding> {
  if (
    !stableIdentifier(input.sessionId) ||
    !stableIdentifier(input.accountId) ||
    !stableIdentifier(String(input.chatId)) ||
    !Number.isFinite(input.startedAt) ||
    input.startedAt < 0
  ) {
    throw new Error('voice_session_binding_invalid');
  }
  return Object.freeze({
    sessionId: input.sessionId,
    accountId: input.accountId,
    chatId: input.chatId,
    startedAt: input.startedAt,
  });
}
