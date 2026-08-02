import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChatId } from '@/types/common';
import { createVoiceSessionBinding, newVoiceSessionId } from './voiceSessionBinding';

describe('voiceSessionBinding', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('allocates a cryptographically unique voice-session id', () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '11111111-2222-4333-8444-555555555555',
    );

    expect(newVoiceSessionId()).toBe('vsession_11111111-2222-4333-8444-555555555555');
  });

  it('fails closed when Web Crypto random UUID support is unavailable', () => {
    vi.stubGlobal('crypto', {});

    expect(() => newVoiceSessionId()).toThrow('voice_session_crypto_unavailable');
  });

  it('returns one frozen canonical account/chat binding', () => {
    const binding = createVoiceSessionBinding({
      sessionId: 'vsession_11111111-2222-4333-8444-555555555555',
      accountId: 'account-voice',
      chatId: 'chat-voice' as ChatId,
      startedAt: 1_786_301_000_000,
    });

    expect(binding).toEqual({
      sessionId: 'vsession_11111111-2222-4333-8444-555555555555',
      accountId: 'account-voice',
      chatId: 'chat-voice',
      startedAt: 1_786_301_000_000,
    });
    expect(Object.isFrozen(binding)).toBe(true);
    expect(Object.keys(binding).sort()).toEqual(['accountId', 'chatId', 'sessionId', 'startedAt']);
    expect(binding).not.toHaveProperty('audioBase64');
    expect(binding).not.toHaveProperty('transcript');
    expect(binding).not.toHaveProperty('engine');
  });

  it.each([
    { sessionId: '', accountId: 'account', chatId: 'chat', startedAt: 1 },
    { sessionId: 'vsession-id', accountId: ' account ', chatId: 'chat', startedAt: 1 },
    { sessionId: 'vsession-id', accountId: 'account', chatId: '', startedAt: 1 },
    { sessionId: 'vsession-id', accountId: 'account', chatId: 'chat', startedAt: Number.NaN },
  ])('rejects malformed binding input %#', (input) => {
    expect(() =>
      createVoiceSessionBinding({
        ...input,
        chatId: input.chatId as ChatId,
      }),
    ).toThrow('voice_session_binding_invalid');
  });
});
