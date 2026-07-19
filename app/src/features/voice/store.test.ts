import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceStore } from './store';
import { createVoiceSessionBinding } from './voiceSessionBinding';
import type { ChatId } from '@/types/common';

describe('useVoiceStore transcripts', () => {
  beforeEach(() => {
    useVoiceStore.getState().reset();
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('caps finalized captions so long hands-free sessions do not grow forever', () => {
    for (let i = 0; i < 80; i++) {
      vi.setSystemTime(1_000 + i);
      useVoiceStore.getState().pushFinalTranscript(`utterance ${i}`);
    }

    const finals = useVoiceStore.getState().finalTranscript;
    expect(finals).toHaveLength(24);
    expect(finals[0]?.text).toBe('utterance 56');
    expect(finals.at(-1)?.text).toBe('utterance 79');
  });

  it('owns exactly one immutable voice-session binding and its current run', () => {
    const first = createVoiceSessionBinding({
      sessionId: 'vsession-first',
      accountId: 'account-first',
      chatId: 'chat-first' as ChatId,
      startedAt: 10,
    });
    const replacement = createVoiceSessionBinding({
      sessionId: 'vsession-replacement',
      accountId: 'account-replacement',
      chatId: 'chat-replacement' as ChatId,
      startedAt: 11,
    });

    expect(useVoiceStore.getState().beginSession(first)).toBe(true);
    expect(useVoiceStore.getState().beginSession(replacement)).toBe(false);
    expect(useVoiceStore.getState().session).toBe(first);

    useVoiceStore.getState().setSessionRun('jrun-voice');
    expect(useVoiceStore.getState().session).toEqual({ ...first, activeRunId: 'jrun-voice' });
    expect(Object.isFrozen(useVoiceStore.getState().session)).toBe(true);

    useVoiceStore.getState().endSession();
    expect(useVoiceStore.getState().session).toBeNull();
  });

  it('ignores stale run mutations and teardown from an older immutable session id', () => {
    const first = createVoiceSessionBinding({
      sessionId: 'vsession-first',
      accountId: 'account-first',
      chatId: 'chat-first' as ChatId,
      startedAt: 10,
    });
    const replacement = createVoiceSessionBinding({
      sessionId: 'vsession-replacement',
      accountId: 'account-replacement',
      chatId: 'chat-replacement' as ChatId,
      startedAt: 11,
    });
    useVoiceStore.getState().beginSession(first);

    useVoiceStore.getState().setSessionRun('jrun-first', first.sessionId, null);
    useVoiceStore.getState().setSessionRun(undefined, 'vsession-stale', 'jrun-first');
    useVoiceStore.getState().endSession('vsession-stale');
    expect(useVoiceStore.getState().session).toMatchObject({
      sessionId: first.sessionId,
      activeRunId: 'jrun-first',
    });

    useVoiceStore.getState().endSession(first.sessionId);
    expect(useVoiceStore.getState().beginSession(replacement)).toBe(true);
    useVoiceStore.getState().setSessionRun(undefined, first.sessionId, 'jrun-first');
    expect(useVoiceStore.getState().session).toBe(replacement);
  });
});
