import * as React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '@/stores/ui';
import { useAuthStore } from '@/stores/auth';
import { useAgentStore } from '@/stores/agents';
import { SPEECH_SYNTHESIS_START_EVENT, STREAMING_VOICE_END_EVENT } from './speechSynthesis';

type VoiceHandler = (payload?: unknown) => void;
type MockVoiceChatTarget = {
  chatId: string;
  messageText: string;
  agentId?: string;
  mentionedAgentIds: string[];
};

const voiceListeners = vi.hoisted(() => ({
  handlers: new Map<string, Set<VoiceHandler>>(),
}));

const routerMocks = vi.hoisted(() => ({
  handleVoiceModuleClosed: vi.fn(),
  stopCurrentVoiceResponse: vi.fn(),
}));

const chatHookMocks = vi.hoisted(() => ({
  useChatMessages: vi.fn(() => []),
}));

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
}));

const chatRoutingMocks = vi.hoisted(() => ({
  ensureJarvisChatForVoice: vi.fn(async (): Promise<string | null> => 'chat_voice'),
  focusVoiceChat: vi.fn(),
  resolveVoiceChatTarget: vi.fn(
    async (text: string): Promise<MockVoiceChatTarget> => ({
      chatId: 'chat_voice',
      messageText: text,
      agentId: undefined,
      mentionedAgentIds: [],
    }),
  ),
}));

vi.mock('./VoiceService', () => ({
  VoiceService: {
    isSupported: () => true,
    isListening: () => false,
    wantsListening: () => false,
    setInactivityTimeoutMs: vi.fn(),
    startListening: vi.fn(() => true),
    stopListening: vi.fn(),
    on: (event: string, fn: VoiceHandler) => {
      let set = voiceListeners.handlers.get(event);
      if (!set) {
        set = new Set();
        voiceListeners.handlers.set(event, set);
      }
      set.add(fn);
      return () => set!.delete(fn);
    },
  },
}));

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    aside: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
      <aside {...props}>{children}</aside>
    ),
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
  useMotionValue: () => ({ get: () => 0, set: vi.fn() }),
}));

vi.mock('@/features/chat/hooks', () => ({
  useChatMessages: chatHookMocks.useChatMessages,
}));

vi.mock('@/components/ui/toast', () => ({
  toast: {
    error: toastMocks.error,
  },
}));

vi.mock('@/lib/db', () => ({
  messageRepo: {
    create: vi.fn(async () => ({})),
  },
}));

vi.mock('./voiceChatRouting', () => chatRoutingMocks);

vi.mock('./voiceRouter', () => routerMocks);

import { VoiceModal } from './VoiceModal';
import { messageRepo } from '@/lib/db';
import { useVoiceStore } from './store';
import { selectionFromOption } from '@/lib/ai/modelSelection';
import { DEFAULT_CUSTOM_STEPS } from '@/lib/ai/stacks/presets';

function emitVoice(event: string, payload?: unknown) {
  voiceListeners.handlers.get(event)?.forEach((fn) => fn(payload));
}

describe('VoiceModal hands-free turn-taking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatRoutingMocks.ensureJarvisChatForVoice.mockReset().mockResolvedValue('chat_voice');
    chatRoutingMocks.focusVoiceChat.mockReset();
    chatRoutingMocks.resolveVoiceChatTarget.mockReset().mockImplementation(
      async (text: string): Promise<MockVoiceChatTarget> => ({
        chatId: 'chat_voice',
        messageText: text,
        agentId: undefined,
        mentionedAgentIds: [],
      }),
    );
    voiceListeners.handlers.clear();
    useUIStore.setState({
      voiceModalOpen: true,
      voiceListening: false,
      activeChatId: 'chat_voice',
    });
    useAuthStore.setState({
      localUserId: 'account-a',
      cloudSession: null,
      voiceAutoListenOnOpen: true,
      voiceEndTrigger: 'phrase',
      voiceCommitPhrase: 'send it',
      voiceCancelPhrase: 'cancel',
      voiceSilenceDelayMs: 2000,
      voiceAutoApproveActions: true,
      apiKeys: { groq: 'gsk_test' },
      stackCustomSteps: DEFAULT_CUSTOM_STEPS,
      chatModelSelection: selectionFromOption('groq', 'llama-3.3-70b-versatile'),
    });
    useAgentStore.setState({ agents: {} });
    useVoiceStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('captures one immutable account/chat binding and keeps transcript and default sends pinned to it', async () => {
    const send = vi.fn();
    window.addEventListener('jarvis:send', send as EventListener);
    chatRoutingMocks.resolveVoiceChatTarget.mockResolvedValueOnce({
      chatId: 'chat_changed_after_open',
      messageText: 'bound message',
      agentId: undefined,
      mentionedAgentIds: [],
    });

    render(<VoiceModal />);

    await waitFor(() => expect(useVoiceStore.getState().session).not.toBeNull());
    expect(document.querySelector('[data-sik-evidence="voice.transcript"]')).toBeNull();
    expect(document.querySelector('[data-sik-evidence="voice.stt-fixture"]')).toBeNull();
    const binding = useVoiceStore.getState().session!;
    expect(binding).toMatchObject({ accountId: 'account-a', chatId: 'chat_voice' });
    expect(binding.sessionId).toMatch(/^vsession_/);
    expect(Object.isFrozen(binding)).toBe(true);

    act(() => useUIStore.setState({ activeChatId: 'chat_changed_after_open' }));
    fireEvent.click(screen.getByRole('button', { name: /Transcript/i }));
    await waitFor(() => expect(chatHookMocks.useChatMessages).toHaveBeenCalledWith('chat_voice'));
    expect(useVoiceStore.getState().session).toBe(binding);

    act(() => {
      emitVoice('voice:final', { text: 'bound message' });
      emitVoice('voice:final', { text: 'send it' });
    });

    await waitFor(() => expect(messageRepo.create).toHaveBeenCalledOnce());
    expect(messageRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ chat_id: 'chat_voice' }),
    );
    expect((send.mock.calls[0]?.[0] as CustomEvent).detail).toMatchObject({
      accountId: 'account-a',
      chatId: 'chat_voice',
      voiceSessionId: binding.sessionId,
    });
    expect(chatRoutingMocks.focusVoiceChat).toHaveBeenLastCalledWith('chat_voice');
    window.removeEventListener('jarvis:send', send as EventListener);
  });

  it('retries voice-session binding when the agent roster hydrates after the modal opens', async () => {
    chatRoutingMocks.ensureJarvisChatForVoice
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('chat_voice');

    render(<VoiceModal />);
    await waitFor(() => expect(chatRoutingMocks.ensureJarvisChatForVoice).toHaveBeenCalledOnce());
    expect(useVoiceStore.getState().session).toBeNull();

    act(() => useAgentStore.setState({ agents: {} }));

    await waitFor(() => expect(useVoiceStore.getState().session?.chatId).toBe('chat_voice'));
    expect(chatRoutingMocks.ensureJarvisChatForVoice).toHaveBeenCalledTimes(2);
  });

  it('does not attach protected account scope to an explicit non-Jarvis voice target', async () => {
    const send = vi.fn();
    window.addEventListener('jarvis:send', send as EventListener);
    chatRoutingMocks.resolveVoiceChatTarget.mockResolvedValueOnce({
      chatId: 'chat_explicit_agent',
      messageText: 'ask the builder',
      agentId: 'agent_builder',
      mentionedAgentIds: [],
    });

    render(<VoiceModal />);
    await waitFor(() => expect(useVoiceStore.getState().session).not.toBeNull());

    act(() => {
      emitVoice('voice:final', { text: 'ask the builder' });
      emitVoice('voice:final', { text: 'send it' });
    });

    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    const detail = (send.mock.calls[0]?.[0] as CustomEvent).detail;
    expect(detail).toMatchObject({ chatId: 'chat_explicit_agent', agentId: 'agent_builder' });
    expect(detail).not.toHaveProperty('accountId');
    window.removeEventListener('jarvis:send', send as EventListener);
  });

  it('ends the old binding before starting a replacement when account identity changes', async () => {
    let releaseStop!: () => void;
    routerMocks.stopCurrentVoiceResponse.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        releaseStop = resolve;
      }),
    );
    const observedAccounts: Array<string | null> = [];
    const unsubscribe = useVoiceStore.subscribe((voice) => {
      observedAccounts.push(voice.session?.accountId ?? null);
    });

    render(<VoiceModal />);
    await waitFor(() => expect(useVoiceStore.getState().session?.accountId).toBe('account-a'));
    const firstSessionId = useVoiceStore.getState().session!.sessionId;
    observedAccounts.length = 0;

    act(() => useAuthStore.setState({ localUserId: 'account-b' }));

    await waitFor(() => expect(routerMocks.stopCurrentVoiceResponse).toHaveBeenCalledOnce());
    act(() => {
      useVoiceStore.getState().setSessionRun('jrun-late-old-account');
      releaseStop();
    });

    await waitFor(() => expect(useVoiceStore.getState().session?.accountId).toBe('account-b'));
    expect(useVoiceStore.getState().session?.sessionId).not.toBe(firstSessionId);
    expect(routerMocks.stopCurrentVoiceResponse).toHaveBeenCalledOnce();
    expect(observedAccounts.indexOf(null)).toBeGreaterThanOrEqual(0);
    expect(observedAccounts.indexOf(null)).toBeLessThan(observedAccounts.indexOf('account-b'));
    unsubscribe();
  });

  it('cancels and clears the old binding when account identity becomes unavailable', async () => {
    render(<VoiceModal />);
    await waitFor(() => expect(useVoiceStore.getState().session?.accountId).toBe('account-a'));

    act(() => useAuthStore.setState({ localUserId: null, cloudSession: null }));

    await waitFor(() => expect(useVoiceStore.getState().session).toBeNull());
    expect(routerMocks.stopCurrentVoiceResponse).toHaveBeenCalledOnce();
  });

  it('starts no bound session or chat resolution without canonical account identity', async () => {
    useAuthStore.setState({ localUserId: null, cloudSession: null });

    render(<VoiceModal />);
    await act(async () => Promise.resolve());

    expect(useVoiceStore.getState().session).toBeNull();
    expect(chatRoutingMocks.ensureJarvisChatForVoice).not.toHaveBeenCalled();
  });

  it('does not send on silence without the commit phrase', async () => {
    vi.useFakeTimers();
    const send = vi.fn();
    window.addEventListener('jarvis:send', send as EventListener);

    render(<VoiceModal />);

    act(() => {
      emitVoice('voice:final', { text: 'So the idea is' });
      vi.advanceTimersByTime(5000);
    });

    expect(send).not.toHaveBeenCalled();
    expect(messageRepo.create).not.toHaveBeenCalled();

    window.removeEventListener('jarvis:send', send as EventListener);
  });

  it('sends exactly once when the commit phrase is spoken', async () => {
    const send = vi.fn();
    window.addEventListener('jarvis:send', send as EventListener);

    render(<VoiceModal />);

    act(() => {
      emitVoice('voice:final', { text: 'help me plan' });
      emitVoice('voice:final', { text: 'send it' });
    });

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(messageRepo.create).toHaveBeenCalledTimes(1);
    const event = send.mock.calls[0]?.[0] as CustomEvent<{ text: string; speakReply: boolean }>;
    expect(event.detail.text).toBe('help me plan');
    expect(event.detail.speakReply).toBe(true);

    window.removeEventListener('jarvis:send', send as EventListener);
  });

  it('reports a precise templated save failure without sending or exposing the thrown detail', async () => {
    vi.useFakeTimers();
    const send = vi.fn();
    window.addEventListener('jarvis:send', send as EventListener);
    vi.mocked(messageRepo.create).mockRejectedValueOnce(
      new Error('synthetic storage implementation detail'),
    );

    render(<VoiceModal />);

    act(() => {
      emitVoice('voice:final', { text: 'failed message send it' });
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const expectedFailure =
      'The action failed, sir. Action: Voice message. Cause: The local message could not be saved, so nothing was sent.';
    expect(messageRepo.create).toHaveBeenCalledOnce();
    expect(toastMocks.error).toHaveBeenCalledWith('Voice message failed', expectedFailure);
    expect(useVoiceStore.getState()).toMatchObject({
      state: 'error',
      errorMessage: expectedFailure,
    });
    expect(useVoiceStore.getState().errorMessage).not.toContain(
      'synthetic storage implementation detail',
    );
    expect(send).not.toHaveBeenCalled();
    expect(JSON.stringify(toastMocks.error.mock.calls)).not.toContain(
      'synthetic storage implementation detail',
    );

    window.removeEventListener('jarvis:send', send as EventListener);
  });

  it('blocks a second send until Jarvis finishes the current turn', async () => {
    vi.useFakeTimers();
    const send = vi.fn();
    window.addEventListener('jarvis:send', send as EventListener);

    render(<VoiceModal />);

    await act(async () => {
      emitVoice('voice:final', { text: 'first message send it' });
      await Promise.resolve();
    });
    expect(send).toHaveBeenCalledTimes(1);

    act(() => {
      emitVoice('voice:final', { text: 'interrupt send it' });
    });
    expect(send).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new CustomEvent(STREAMING_VOICE_END_EVENT));
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });

    await act(async () => {
      emitVoice('voice:final', { text: 'second message send it' });
      await Promise.resolve();
    });
    expect(send).toHaveBeenCalledTimes(2);

    window.removeEventListener('jarvis:send', send as EventListener);
  });

  it('clears the draft on cancel phrase without sending', async () => {
    const send = vi.fn();
    window.addEventListener('jarvis:send', send as EventListener);

    render(<VoiceModal />);

    act(() => {
      emitVoice('voice:final', { text: 'never mind' });
      emitVoice('voice:final', { text: 'cancel' });
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(send).not.toHaveBeenCalled();
    expect(messageRepo.create).not.toHaveBeenCalled();
    expect(useVoiceStore.getState().partialTranscript).toBe('');

    window.removeEventListener('jarvis:send', send as EventListener);
  });

  it('releases the active turn immediately after the user stops speech', async () => {
    const send = vi.fn();
    window.addEventListener('jarvis:send', send as EventListener);
    render(<VoiceModal />);

    act(() => window.dispatchEvent(new CustomEvent(SPEECH_SYNTHESIS_START_EVENT)));
    fireEvent.click(screen.getByRole('button', { name: /Stop response/i }));
    act(() => emitVoice('voice:final', { text: 'new request send it' }));

    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(routerMocks.stopCurrentVoiceResponse).toHaveBeenCalledOnce();
    window.removeEventListener('jarvis:send', send as EventListener);
  });
});
