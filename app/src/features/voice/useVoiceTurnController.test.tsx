import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';
import { useVoiceStore } from './store';

type VoiceHandler = (payload?: any) => void;

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Set<VoiceHandler>>(),
  supported: true,
  listening: false,
  startListening: vi.fn(() => true),
  stopListening: vi.fn(),
  setInactivityTimeoutMs: vi.fn(),
  createMessage: vi.fn(async () => ({})),
  resolveTarget: vi.fn(async (text: string) => ({
    chatId: 'chat_main',
    messageText: text,
    agentId: 'agent_jarvis',
    mentionedAgentIds: [],
  })),
  focusChat: vi.fn(),
  ensureChat: vi.fn(async () => 'chat_main'),
  modelAllowed: true,
  stopCurrentVoiceResponse: vi.fn(),
  handleVoiceModuleClosed: vi.fn(),
  tauriHandlers: new Map<string, (event: { payload: unknown }) => void>(),
  emitTo: vi.fn(async () => undefined),
}));

vi.mock('./VoiceService', () => ({
  VoiceService: {
    isSupported: () => mocks.supported,
    isListening: () => mocks.listening,
    wantsListening: () => false,
    setInactivityTimeoutMs: mocks.setInactivityTimeoutMs,
    startListening: () => {
      const started = mocks.startListening();
      mocks.listening = started;
      return started;
    },
    stopListening: () => {
      mocks.listening = false;
      mocks.stopListening();
    },
    on: (event: string, handler: VoiceHandler) => {
      let handlers = mocks.handlers.get(event);
      if (!handlers) {
        handlers = new Set();
        mocks.handlers.set(event, handlers);
      }
      handlers.add(handler);
      return () => handlers!.delete(handler);
    },
  },
}));

vi.mock('@/lib/db', () => ({
  messageRepo: { create: mocks.createMessage },
}));

vi.mock('./voiceChatRouting', () => ({
  ensureJarvisChatForVoice: mocks.ensureChat,
  focusVoiceChat: mocks.focusChat,
  resolveVoiceChatTarget: mocks.resolveTarget,
}));

vi.mock('@/lib/ai/modelSelection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/modelSelection')>();
  return {
    ...actual,
    modelSelectionContextFromAuth: () => ({}),
    validateSendModelAccess: () =>
      mocks.modelAllowed ? { ok: true } : { ok: false, message: 'Model unavailable' },
  };
});

vi.mock('./voiceRouter', () => ({
  handleVoiceModuleClosed: mocks.handleVoiceModuleClosed,
  stopCurrentVoiceResponse: mocks.stopCurrentVoiceResponse,
  stopAllVoiceOutput: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  emitTo: mocks.emitTo,
  listen: vi.fn(async (event: string, handler: (event: { payload: unknown }) => void) => {
    mocks.tauriHandlers.set(event, handler);
    return () => mocks.tauriHandlers.delete(event);
  }),
}));

import {
  installPetVoiceRuntimeBridge,
  PET_VOICE_CANCEL_REQUEST_EVENT,
  PET_VOICE_RUNTIME_STATE_EVENT,
  PET_VOICE_SEND_REQUEST_EVENT,
  useVoiceTurnController,
  validatePetVoiceSendRequest,
} from './useVoiceTurnController';
import { resetVoiceSessionLeaseForTests } from './voiceSessionLease';

function emitVoice(event: string, payload?: unknown) {
  mocks.handlers.get(event)?.forEach((handler) => handler(payload));
}

function renderPet(options?: { autoSend?: boolean; muted?: boolean; chatId?: string }) {
  return renderHook(() =>
    useVoiceTurnController({
      owner: 'pet',
      enabled: true,
      targetChatId: options?.chatId ?? 'chat_pet',
      autoSend: options?.autoSend ?? false,
      muted: options?.muted ?? false,
    }),
  );
}

describe('useVoiceTurnController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handlers.clear();
    mocks.supported = true;
    mocks.listening = false;
    mocks.modelAllowed = true;
    mocks.tauriHandlers.clear();
    mocks.startListening.mockReturnValue(true);
    mocks.resolveTarget.mockImplementation(async (text: string) => ({
      chatId: 'chat_main',
      messageText: text,
      agentId: 'agent_jarvis',
      mentionedAgentIds: [],
    }));
    useUIStore.setState({ voiceModalOpen: false, voiceListening: false });
    useAuthStore.setState({
      voiceAutoListenOnOpen: false,
      voiceEndTrigger: 'phrase',
      voiceCommitPhrase: 'send it',
      voiceCancelPhrase: 'cancel',
      voiceSilenceDelayMs: 100,
      voiceAutoApproveActions: true,
    });
    useVoiceStore.getState().reset();
    resetVoiceSessionLeaseForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
  });

  it('reports unsupported Web Speech without opening the microphone', () => {
    mocks.supported = false;
    const { result } = renderPet();
    act(() => expect(result.current.startListening()).toBe(false));
    expect(mocks.startListening).not.toHaveBeenCalled();
    expect(useVoiceStore.getState().state).toBe('error');
    expect(useVoiceStore.getState().errorMessage).toMatch(/unavailable/i);
  });

  it('surfaces terminal microphone permission failures and does not restart', () => {
    const { result } = renderPet();
    act(() => result.current.startListening());
    act(() => emitVoice('voice:error', { kind: 'permission_denied', message: 'Microphone denied' }));
    expect(useVoiceStore.getState().state).toBe('error');
    expect(useVoiceStore.getState().errorMessage).toBe('Microphone denied');
    expect(mocks.startListening).toHaveBeenCalledTimes(1);
  });

  it('stores interim speech and inserts a final Pet draft into the exact shared chat by default', async () => {
    const insert = vi.fn();
    window.addEventListener('jarvis:composer:insert-text', insert as EventListener);
    const { result } = renderPet({ chatId: 'chat_shared' });
    act(() => result.current.startListening());
    act(() => emitVoice('voice:partial', { text: 'hello' }));
    expect(useVoiceStore.getState().partialTranscript).toBe('hello');
    await act(async () => {
      emitVoice('voice:final', { text: 'hello shared chat' });
      vi.advanceTimersByTime(100);
      await Promise.resolve();
    });
    expect(insert).toHaveBeenCalledTimes(1);
    expect((insert.mock.calls[0]![0] as CustomEvent).detail).toEqual({
      chatId: 'chat_shared',
      text: 'hello shared chat',
    });
    expect(mocks.createMessage).not.toHaveBeenCalled();
    window.removeEventListener('jarvis:composer:insert-text', insert as EventListener);
  });

  it('suppresses duplicate finalized recognition results', async () => {
    const insert = vi.fn();
    window.addEventListener('jarvis:composer:insert-text', insert as EventListener);
    const { result } = renderPet();
    act(() => result.current.startListening());
    await act(async () => {
      emitVoice('voice:final', { text: 'same phrase' });
      emitVoice('voice:final', { text: 'same phrase' });
      vi.advanceTimersByTime(100);
      await Promise.resolve();
    });
    expect(insert).toHaveBeenCalledTimes(1);
    expect((insert.mock.calls[0]![0] as CustomEvent).detail.text).toBe('same phrase');
    window.removeEventListener('jarvis:composer:insert-text', insert as EventListener);
  });

  it('uses the explicit commit phrase to send exactly once through the shared runtime path', async () => {
    const send = vi.fn();
    window.addEventListener('jarvis:send', send as EventListener);
    const { result } = renderPet({ chatId: 'chat_shared' });
    act(() => result.current.startListening());
    await act(async () => {
      emitVoice('voice:final', { text: 'make a plan' });
      emitVoice('voice:final', { text: 'send it' });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.createMessage).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect((send.mock.calls[0]![0] as CustomEvent).detail).toMatchObject({
      chatId: 'chat_shared',
      text: 'make a plan',
      speakReply: true,
    });
    window.removeEventListener('jarvis:send', send as EventListener);
  });

  it('auto-send is opt-in and mute disables TTS without changing the shared chat path', async () => {
    const send = vi.fn();
    window.addEventListener('jarvis:send', send as EventListener);
    const { result } = renderPet({ autoSend: true, muted: true });
    act(() => result.current.startListening());
    await act(async () => {
      emitVoice('voice:final', { text: 'send automatically' });
      vi.advanceTimersByTime(100);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect((send.mock.calls[0]![0] as CustomEvent).detail).toMatchObject({
      chatId: 'chat_pet',
      text: 'send automatically',
      speakReply: false,
    });
    window.removeEventListener('jarvis:send', send as EventListener);
  });

  it('blocks the send when model access fails', async () => {
    mocks.modelAllowed = false;
    const send = vi.fn();
    window.addEventListener('jarvis:send', send as EventListener);
    const { result } = renderPet({ autoSend: true });
    act(() => result.current.startListening());
    await act(async () => {
      emitVoice('voice:final', { text: 'blocked request' });
      vi.advanceTimersByTime(100);
      await Promise.resolve();
    });
    expect(send).not.toHaveBeenCalled();
    expect(mocks.createMessage).not.toHaveBeenCalled();
    expect(useVoiceStore.getState().errorMessage).toBe('Model unavailable');
    window.removeEventListener('jarvis:send', send as EventListener);
  });

  it('cancels timers and closes the microphone on unmount', async () => {
    const insert = vi.fn();
    window.addEventListener('jarvis:composer:insert-text', insert as EventListener);
    const { result, unmount } = renderPet();
    act(() => result.current.startListening());
    act(() => emitVoice('voice:final', { text: 'do not leak' }));
    unmount();
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });
    expect(mocks.stopListening).toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    window.removeEventListener('jarvis:composer:insert-text', insert as EventListener);
  });

  it('cancels an already-dispatched request by correlation id on unmount', async () => {
    const send = vi.fn();
    const cancel = vi.fn();
    window.addEventListener('jarvis:send', send as EventListener);
    window.addEventListener('jarvis:cancel', cancel as EventListener);
    const { result, unmount } = renderPet();
    act(() => result.current.startListening());
    await act(async () => {
      emitVoice('voice:final', { text: 'keep this request scoped send it' });
      await Promise.resolve();
      await Promise.resolve();
    });
    const requestId = (send.mock.calls[0]![0] as CustomEvent).detail.voiceRequestId;

    unmount();
    await Promise.resolve();

    expect((cancel.mock.calls[0]![0] as CustomEvent).detail).toEqual({ voiceRequestId: requestId });
    window.removeEventListener('jarvis:send', send as EventListener);
    window.removeEventListener('jarvis:cancel', cancel as EventListener);
  });

  it('strictly validates the bounded Pet-to-main voice envelope', () => {
    const valid = {
      requestId: 'voice_123',
      chatId: 'chat_123',
      text: 'hello',
      speakReply: true,
      autoApproveActions: false,
    };
    expect(validatePetVoiceSendRequest(valid)).toEqual(valid);
    expect(validatePetVoiceSendRequest({ ...valid, text: 'x'.repeat(8_001) })).toBeNull();
    expect(validatePetVoiceSendRequest({ ...valid, chatId: '../other' })).toBeNull();
    expect(validatePetVoiceSendRequest({ ...valid, terminalOutput: 'private' })).toBeNull();
  });

  it('bridges a validated Pet request into the existing runtime and cancels only its id', async () => {
    vi.useRealTimers();
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} });
    const send = vi.fn();
    const cancel = vi.fn();
    window.addEventListener('jarvis:send', send as EventListener);
    window.addEventListener('jarvis:cancel', cancel as EventListener);
    const cleanup = installPetVoiceRuntimeBridge();
    await vi.waitFor(() => expect(mocks.tauriHandlers.has(PET_VOICE_SEND_REQUEST_EVENT)).toBe(true));
    const request = {
      requestId: 'voice_bridge_1',
      chatId: 'chat_shared',
      text: 'use the real runtime',
      speakReply: true,
      autoApproveActions: false,
    };

    mocks.tauriHandlers.get(PET_VOICE_SEND_REQUEST_EVENT)?.({ payload: request });
    expect(send).toHaveBeenCalledTimes(1);
    expect((send.mock.calls[0]![0] as CustomEvent).detail).toMatchObject({
      chatId: 'chat_shared',
      voiceRequestId: 'voice_bridge_1',
      allowBackgroundVoice: true,
    });
    mocks.tauriHandlers.get(PET_VOICE_SEND_REQUEST_EVENT)?.({ payload: request });
    expect(send).toHaveBeenCalledTimes(1);

    mocks.tauriHandlers.get(PET_VOICE_SEND_REQUEST_EVENT)?.({
      payload: { ...request, requestId: 'voice_bridge_2', text: 'replacement turn' },
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect((cancel.mock.calls[0]![0] as CustomEvent).detail).toEqual({
      voiceRequestId: 'voice_bridge_1',
    });

    window.dispatchEvent(new CustomEvent('jarvis:run-state', {
      detail: { chatId: 'chat_shared', status: 'running', voiceRequestId: 'voice_bridge_2' },
    }));
    await vi.waitFor(() =>
      expect(mocks.emitTo).toHaveBeenCalledWith(
        'pet-mini-panel',
        PET_VOICE_RUNTIME_STATE_EVENT,
        expect.objectContaining({ requestId: 'voice_bridge_2', state: 'thinking' }),
      ),
    );

    mocks.tauriHandlers.get(PET_VOICE_CANCEL_REQUEST_EVENT)?.({
      payload: { requestId: 'voice_bridge_2' },
    });
    expect((cancel.mock.calls[1]![0] as CustomEvent).detail).toEqual({
      voiceRequestId: 'voice_bridge_2',
    });

    cleanup();
    window.removeEventListener('jarvis:send', send as EventListener);
    window.removeEventListener('jarvis:cancel', cancel as EventListener);
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
  });
});
