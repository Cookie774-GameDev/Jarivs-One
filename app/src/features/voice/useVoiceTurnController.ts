import * as React from 'react';
import { toast } from '@/components/ui/toast';
import { messageRepo } from '@/lib/db';
import {
  modelSelectionContextFromAuth,
  validateSendModelAccess,
} from '@/lib/ai/modelSelection';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';
import type { AgentId, ChatId } from '@/types';
import { VoiceService } from './VoiceService';
import { useVoiceStore, type VoiceState } from './store';
import {
  ensureJarvisChatForVoice,
  focusVoiceChat,
  resolveVoiceChatTarget,
  type VoiceChatTarget,
} from './voiceChatRouting';
import { resolveVoiceListenTimeoutMs } from './voiceConversation';
import {
  detectCancelPhrase,
  detectCommitPhrase,
  processVoiceFinalEvent,
  shouldAutoSendOnSilence,
  VOICE_REPLY_COOLDOWN_MS,
} from './voiceTurnCommit';
import {
  SPEECH_SYNTHESIS_END_EVENT,
  SPEECH_SYNTHESIS_START_EVENT,
  STREAMING_VOICE_END_EVENT,
  STREAMING_VOICE_START_EVENT,
} from './speechSynthesis';
import {
  handleVoiceModuleClosed,
  stopAllVoiceOutput,
  stopCurrentVoiceResponse,
} from './voiceRouter';
import {
  acquireVoiceSession,
  revokeActiveVoiceSession,
  type VoiceSessionLease,
  type VoiceSessionOwner,
} from './voiceSessionLease';

export const PET_VOICE_SEND_REQUEST_EVENT = 'jarvis:pet-voice:send-request';
export const PET_VOICE_CANCEL_REQUEST_EVENT = 'jarvis:pet-voice:cancel-request';
export const PET_VOICE_RUNTIME_STATE_EVENT = 'jarvis:pet-voice:runtime-state';
export const PET_VOICE_LEASE_CLAIM_EVENT = 'jarvis:pet-voice:lease-claim';

const MAX_VOICE_TEXT = 8_000;
const MAX_ID_LENGTH = 160;
const DUPLICATE_FINAL_WINDOW_MS = 1_500;
const WINDOW_INSTANCE_ID = crypto.randomUUID();

type RuntimeVoiceState = 'thinking' | 'speaking' | 'idle' | 'error';

export interface VoiceSendRequest {
  requestId: string;
  chatId: string;
  text: string;
  agentId?: string;
  mentionedAgentIds?: string[];
  speakReply: boolean;
  autoApproveActions: boolean;
}

interface VoiceRuntimeStatePayload {
  requestId: string;
  state: RuntimeVoiceState;
  message?: string;
}

interface VoiceLeaseClaimPayload {
  owner: VoiceSessionOwner;
  instanceId: string;
}

function boundedId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_ID_LENGTH) return null;
  return /^[A-Za-z0-9._:-]+$/.test(trimmed) ? trimmed : null;
}

function boundedText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_VOICE_TEXT) return null;
  return trimmed;
}

export function validatePetVoiceSendRequest(raw: unknown): VoiceSendRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const allowedKeys = new Set([
    'requestId',
    'chatId',
    'text',
    'agentId',
    'mentionedAgentIds',
    'speakReply',
    'autoApproveActions',
  ]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) return null;
  const requestId = boundedId(value.requestId);
  const chatId = boundedId(value.chatId);
  const text = boundedText(value.text);
  if (!requestId || !chatId || !text) return null;
  if (typeof value.speakReply !== 'boolean' || typeof value.autoApproveActions !== 'boolean') {
    return null;
  }
  const agentId = value.agentId == null ? undefined : boundedId(value.agentId) ?? undefined;
  if (value.agentId != null && !agentId) return null;
  let mentionedAgentIds: string[] | undefined;
  if (value.mentionedAgentIds != null) {
    if (!Array.isArray(value.mentionedAgentIds) || value.mentionedAgentIds.length > 16) return null;
    mentionedAgentIds = value.mentionedAgentIds.map(boundedId).filter((id): id is string => !!id);
    if (mentionedAgentIds.length !== value.mentionedAgentIds.length) return null;
  }
  return {
    requestId,
    chatId,
    text,
    agentId,
    mentionedAgentIds,
    speakReply: value.speakReply,
    autoApproveActions: value.autoApproveActions,
  };
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function isDedicatedPetWindow(): boolean {
  return new URLSearchParams(window.location.search).get('view') === 'pet-mini-panel';
}

async function emitToWindow(target: string, event: string, payload: unknown): Promise<void> {
  if (!isTauriRuntime()) throw new Error('Native window bridge is unavailable.');
  const { emitTo } = await import('@tauri-apps/api/event');
  await emitTo(target, event, payload);
}

async function announceLease(owner: VoiceSessionOwner): Promise<void> {
  if (!isTauriRuntime()) return;
  const target = owner === 'pet' ? 'main' : 'pet-mini-panel';
  try {
    await emitToWindow(target, PET_VOICE_LEASE_CLAIM_EVENT, {
      owner,
      instanceId: WINDOW_INSTANCE_ID,
    } satisfies VoiceLeaseClaimPayload);
  } catch {
    // The other window may not exist; the local lease remains authoritative.
  }
}

async function dispatchVoiceSend(request: VoiceSendRequest): Promise<void> {
  if (isDedicatedPetWindow() && isTauriRuntime()) {
    await emitToWindow('main', PET_VOICE_SEND_REQUEST_EVENT, request);
    return;
  }
  window.dispatchEvent(
    new CustomEvent('jarvis:send', {
      detail: {
        chatId: request.chatId,
        text: request.text,
        agentId: request.agentId,
        mentionedAgentIds: request.mentionedAgentIds,
        speakReply: request.speakReply,
        autoApproveActions: request.autoApproveActions,
        voiceRequestId: request.requestId,
      },
    }),
  );
}

async function dispatchVoiceCancel(requestId: string): Promise<void> {
  if (isDedicatedPetWindow() && isTauriRuntime()) {
    try {
      await emitToWindow('main', PET_VOICE_CANCEL_REQUEST_EVENT, { requestId });
    } catch {
      // Main may already be closed; local cleanup still closes capture/output.
    }
    return;
  }
  window.dispatchEvent(new CustomEvent('jarvis:cancel', { detail: { voiceRequestId: requestId } }));
}

function runtimeStatePayload(raw: unknown): VoiceRuntimeStatePayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const requestId = boundedId(value.requestId);
  const state = value.state;
  if (
    !requestId ||
    (state !== 'thinking' && state !== 'speaking' && state !== 'idle' && state !== 'error')
  ) {
    return null;
  }
  return {
    requestId,
    state,
    message: typeof value.message === 'string' ? value.message.slice(0, 240) : undefined,
  };
}

/**
 * Main-window endpoint for Pet voice turns. It validates and forwards only a
 * bounded turn envelope into the existing local runtime; no provider or
 * message backend is duplicated in the Pet WebView.
 */
export function installPetVoiceRuntimeBridge(): () => void {
  let disposed = false;
  const unlistens: Array<() => void> = [];
  const active = new Map<string, VoiceSendRequest>();

  const sendState = (request: VoiceSendRequest, state: RuntimeVoiceState, message?: string) => {
    void emitToWindow('pet-mini-panel', PET_VOICE_RUNTIME_STATE_EVENT, {
      requestId: request.requestId,
      state,
      message,
    } satisfies VoiceRuntimeStatePayload).catch(() => undefined);
  };

  const onRunState = (event: Event) => {
    const detail = (event as CustomEvent<{
      chatId?: string;
      status?: string;
      voiceRequestId?: string;
    }>).detail;
    const requestId = boundedId(detail?.voiceRequestId);
    if (!requestId) return;
    const request = active.get(requestId);
    if (!request || detail.chatId !== request.chatId) return;
    if (detail.status === 'running') sendState(request, 'thinking');
    if (detail.status === 'error' || detail.status === 'cancelled') {
      sendState(request, 'error', 'Voice request stopped.');
      active.delete(requestId);
    } else if (detail.status === 'done' && !request.speakReply) {
      sendState(request, 'idle');
      active.delete(requestId);
    }
  };

  const onStreamingStart = () => {
    const request = [...active.values()].find((candidate) => candidate.speakReply);
    if (request) sendState(request, 'speaking');
  };
  const onStreamingEnd = () => {
    const request = [...active.values()].find((candidate) => candidate.speakReply);
    if (!request) return;
    queueMicrotask(() => {
      if (!active.has(request.requestId)) return;
      sendState(request, 'idle');
      active.delete(request.requestId);
    });
  };

  window.addEventListener('jarvis:run-state', onRunState as EventListener);
  window.addEventListener(STREAMING_VOICE_START_EVENT, onStreamingStart);
  window.addEventListener(STREAMING_VOICE_END_EVENT, onStreamingEnd);

  if (isTauriRuntime()) {
    void import('@tauri-apps/api/event')
      .then(async ({ listen }) => {
        const sendUnlisten = await listen<unknown>(PET_VOICE_SEND_REQUEST_EVENT, (event) => {
          const request = validatePetVoiceSendRequest(event.payload);
          if (!request) return;
          if (active.has(request.requestId)) return;
          for (const previous of active.values()) {
            window.dispatchEvent(
              new CustomEvent('jarvis:cancel', {
                detail: { voiceRequestId: previous.requestId },
              }),
            );
          }
          active.clear();
          active.set(request.requestId, request);
          window.dispatchEvent(
            new CustomEvent('jarvis:send', {
              detail: {
                chatId: request.chatId,
                text: request.text,
                agentId: request.agentId as AgentId | undefined,
                mentionedAgentIds: request.mentionedAgentIds as AgentId[] | undefined,
                speakReply: request.speakReply,
                autoApproveActions: request.autoApproveActions,
                voiceRequestId: request.requestId,
                allowBackgroundVoice: request.speakReply,
              },
            }),
          );
        });
        const cancelUnlisten = await listen<unknown>(PET_VOICE_CANCEL_REQUEST_EVENT, (event) => {
          const payload = event.payload as { requestId?: unknown } | null;
          const requestId = boundedId(payload?.requestId);
          if (!requestId || !active.has(requestId)) return;
          window.dispatchEvent(
            new CustomEvent('jarvis:cancel', { detail: { voiceRequestId: requestId } }),
          );
          active.delete(requestId);
        });
        if (disposed) {
          sendUnlisten();
          cancelUnlisten();
        } else {
          unlistens.push(sendUnlisten, cancelUnlisten);
        }
      })
      .catch(() => undefined);
  }

  return () => {
    disposed = true;
    unlistens.splice(0).forEach((unlisten) => unlisten());
    active.clear();
    window.removeEventListener('jarvis:run-state', onRunState as EventListener);
    window.removeEventListener(STREAMING_VOICE_START_EVENT, onStreamingStart);
    window.removeEventListener(STREAMING_VOICE_END_EVENT, onStreamingEnd);
  };
}

export interface UseVoiceTurnControllerOptions {
  owner: VoiceSessionOwner;
  enabled: boolean;
  targetChatId?: string | null;
  autoSend?: boolean;
  muted?: boolean;
  levelRef?: React.MutableRefObject<number>;
}

export interface VoiceTurnController {
  startListening: () => boolean;
  stopListening: (nextState?: VoiceState) => void;
  stopSpeaking: () => void;
  toggleListening: () => void;
}

export function useVoiceTurnController(
  options: UseVoiceTurnControllerOptions,
): VoiceTurnController {
  const voiceState = useVoiceStore((state) => state.state);
  const optionsRef = React.useRef(options);
  optionsRef.current = options;
  const leaseRef = React.useRef<VoiceSessionLease | null>(null);
  const draftRef = React.useRef('');
  const flushTimerRef = React.useRef<number | null>(null);
  const restartTimerRef = React.useRef<number | null>(null);
  const cooldownTimerRef = React.useRef<number | null>(null);
  const turnBusyRef = React.useRef(false);
  const speakingRef = React.useRef(false);
  const streamingRef = React.useRef(false);
  const armedRef = React.useRef(false);
  const resumeAfterSpeechRef = React.useRef(false);
  const disposedRef = React.useRef(false);
  const generationRef = React.useRef(0);
  const activeRequestRef = React.useRef<{ requestId: string; speakReply: boolean } | null>(null);
  const recentFinalRef = React.useRef<{ text: string; at: number } | null>(null);
  const startRef = React.useRef<() => boolean>(() => false);

  const clearFlushTimer = React.useCallback(() => {
    if (flushTimerRef.current !== null) window.clearTimeout(flushTimerRef.current);
    flushTimerRef.current = null;
  }, []);

  const clearLifecycleTimers = React.useCallback(() => {
    clearFlushTimer();
    if (restartTimerRef.current !== null) window.clearTimeout(restartTimerRef.current);
    if (cooldownTimerRef.current !== null) window.clearTimeout(cooldownTimerRef.current);
    restartTimerRef.current = null;
    cooldownTimerRef.current = null;
  }, [clearFlushTimer]);

  const stopCapture = React.useCallback(() => {
    VoiceService.stopListening();
    useUIStore.getState().setVoiceListening(false);
  }, []);

  const releasePetLease = React.useCallback(() => {
    if (optionsRef.current.owner !== 'pet') return;
    leaseRef.current?.release();
    leaseRef.current = null;
  }, []);

  const acquireLease = React.useCallback(() => {
    if (leaseRef.current?.isActive()) return leaseRef.current;
    const owner = optionsRef.current.owner;
    const lease = acquireVoiceSession(owner, () => {
      generationRef.current += 1;
      clearLifecycleTimers();
      draftRef.current = '';
      turnBusyRef.current = false;
      speakingRef.current = false;
      streamingRef.current = false;
      armedRef.current = false;
      const request = activeRequestRef.current;
      activeRequestRef.current = null;
      if (request) void dispatchVoiceCancel(request.requestId);
      stopCapture();
      if (owner === 'main') stopCurrentVoiceResponse();
      useVoiceStore.getState().setPartialTranscript('');
      useVoiceStore.getState().clearTranscripts();
      useVoiceStore.getState().setState('idle');
      leaseRef.current = null;
    });
    leaseRef.current = lease;
    void announceLease(owner);
    return lease;
  }, [clearLifecycleTimers, stopCapture]);

  const restartListening = React.useCallback((delay = 180) => {
    if (restartTimerRef.current !== null) window.clearTimeout(restartTimerRef.current);
    restartTimerRef.current = window.setTimeout(() => {
      restartTimerRef.current = null;
      if (disposedRef.current || turnBusyRef.current || speakingRef.current || !armedRef.current) {
        return;
      }
      if (VoiceService.isListening() || VoiceService.wantsListening()) return;
      startRef.current();
    }, delay);
  }, []);

  const releaseTurn = React.useCallback((afterReply = false) => {
    turnBusyRef.current = false;
    activeRequestRef.current = null;
    const current = optionsRef.current;
    if (current.owner === 'main' && useAuthStore.getState().voiceAutoListenOnOpen) {
      armedRef.current = true;
      restartListening(afterReply ? VOICE_REPLY_COOLDOWN_MS : 180);
      return;
    }
    useVoiceStore.getState().setState('idle');
    if (current.owner === 'pet') releasePetLease();
  }, [releasePetLease, restartListening]);

  const startListening = React.useCallback((): boolean => {
    if (!optionsRef.current.enabled) return false;
    const lease = acquireLease();
    if (!VoiceService.isSupported()) {
      armedRef.current = false;
      useUIStore.getState().setVoiceListening(false);
      useVoiceStore
        .getState()
        .setState('error', 'Speech recognition is unavailable in this runtime.');
      if (optionsRef.current.owner === 'pet') {
        lease.release();
        leaseRef.current = null;
      }
      return false;
    }
    armedRef.current = true;
    recentFinalRef.current = null;
    const auth = useAuthStore.getState();
    VoiceService.setInactivityTimeoutMs(
      resolveVoiceListenTimeoutMs(auth.voiceAutoListenOnOpen, auth.voiceListenTimeoutMs),
    );
    const started = VoiceService.startListening();
    useUIStore.getState().setVoiceListening(started);
    if (started) useVoiceStore.getState().setState('listening');
    else {
      armedRef.current = false;
      useVoiceStore.getState().setState('error', 'Could not start microphone.');
      if (optionsRef.current.owner === 'pet') releasePetLease();
    }
    return started;
  }, [acquireLease, releasePetLease]);
  startRef.current = startListening;

  const stopListening = React.useCallback((nextState: VoiceState = 'idle') => {
    armedRef.current = false;
    clearFlushTimer();
    draftRef.current = '';
    stopCapture();
    useVoiceStore.getState().setPartialTranscript('');
    recentFinalRef.current = null;
    useVoiceStore.getState().setState(nextState);
    releasePetLease();
  }, [clearFlushTimer, releasePetLease, stopCapture]);

  const failTurn = React.useCallback((message: string) => {
    turnBusyRef.current = false;
    activeRequestRef.current = null;
    useVoiceStore.getState().setState('error', message);
    if (optionsRef.current.owner === 'pet') releasePetLease();
    else if (useAuthStore.getState().voiceAutoListenOnOpen) restartListening();
  }, [releasePetLease, restartListening]);

  const sendTurn = React.useCallback(async (rawText: string) => {
    clearFlushTimer();
    if (turnBusyRef.current) return;
    const text = boundedText(rawText);
    if (!text) return;
    turnBusyRef.current = true;
    draftRef.current = '';
    stopCapture();
    useVoiceStore.getState().setPartialTranscript('');
    useVoiceStore.getState().setState('thinking');
    const generation = generationRef.current;
    const current = optionsRef.current;

    let target: VoiceChatTarget | null;
    if (current.owner === 'pet') {
      const chatId = boundedId(current.targetChatId);
      target = chatId ? { chatId: chatId as ChatId, messageText: text } : null;
    } else {
      target = await resolveVoiceChatTarget(text);
    }
    if (disposedRef.current || generation !== generationRef.current) return;
    if (!target) {
      failTurn(current.owner === 'pet' ? 'Open a shared chat before using voice.' : 'Could not open a Jarvis chat.');
      return;
    }

    const messageText = boundedText(target.messageText);
    if (!messageText) {
      failTurn('Say something for Jarvis to send.');
      return;
    }
    if (current.owner === 'main') focusVoiceChat(target.chatId);

    const auth = useAuthStore.getState();
    const modelCheck = validateSendModelAccess(
      messageText,
      auth.chatModelSelection,
      modelSelectionContextFromAuth(auth),
      auth.stackCustomSteps,
      { voice: true },
    );
    if (!modelCheck.ok) {
      failTurn(modelCheck.message);
      return;
    }

    try {
      await messageRepo.create({
        chat_id: target.chatId,
        role: 'user',
        parts: [{ kind: 'text', text: messageText }],
      });
      if (disposedRef.current || generation !== generationRef.current) return;
      const request: VoiceSendRequest = {
        requestId: crypto.randomUUID(),
        chatId: String(target.chatId),
        text: messageText,
        agentId: target.agentId,
        mentionedAgentIds: target.mentionedAgentIds,
        speakReply: current.owner === 'main' || !current.muted,
        autoApproveActions: auth.voiceAutoApproveActions,
      };
      activeRequestRef.current = {
        requestId: request.requestId,
        speakReply: request.speakReply,
      };
      await dispatchVoiceSend(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not send.';
      toast.error('Voice message failed', message);
      failTurn('Could not send the voice message.');
    }
  }, [clearFlushTimer, failTurn, stopCapture]);

  const insertPetDraft = React.useCallback(() => {
    clearFlushTimer();
    if (turnBusyRef.current || disposedRef.current) return;
    const text = boundedText(draftRef.current);
    draftRef.current = '';
    if (!text) return;
    const chatId = boundedId(optionsRef.current.targetChatId);
    if (!chatId) {
      failTurn('Open a shared chat before using voice.');
      return;
    }
    stopCapture();
    useVoiceStore.getState().setPartialTranscript('');
    window.dispatchEvent(
      new CustomEvent('jarvis:composer:insert-text', { detail: { chatId, text } }),
    );
    useVoiceStore.getState().setState('idle');
    releasePetLease();
  }, [clearFlushTimer, failTurn, releasePetLease, stopCapture]);

  const schedulePetDraft = React.useCallback(() => {
    clearFlushTimer();
    const delay = useAuthStore.getState().voiceSilenceDelayMs;
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;
      if (optionsRef.current.autoSend) void sendTurn(draftRef.current);
      else insertPetDraft();
    }, delay);
  }, [clearFlushTimer, insertPetDraft, sendTurn]);

  const scheduleMainDraft = React.useCallback(() => {
    clearFlushTimer();
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;
      void sendTurn(draftRef.current);
    }, useAuthStore.getState().voiceSilenceDelayMs);
  }, [clearFlushTimer, sendTurn]);

  const stopSpeaking = React.useCallback(() => {
    stopCurrentVoiceResponse();
    stopAllVoiceOutput();
    const request = activeRequestRef.current;
    if (request) void dispatchVoiceCancel(request.requestId);
    speakingRef.current = false;
    streamingRef.current = false;
    turnBusyRef.current = false;
    resumeAfterSpeechRef.current = false;
    if (optionsRef.current.owner === 'main' && useAuthStore.getState().voiceAutoListenOnOpen) {
      armedRef.current = true;
      startListening();
    } else {
      useVoiceStore.getState().setState('idle');
      releasePetLease();
    }
  }, [releasePetLease, startListening]);

  const toggleListening = React.useCallback(() => {
    const state = useVoiceStore.getState().state;
    if (state === 'speaking' || speakingRef.current) {
      stopSpeaking();
      return;
    }
    if (state === 'listening' || VoiceService.isListening()) {
      stopListening('idle');
      return;
    }
    startListening();
  }, [startListening, stopListening, stopSpeaking]);

  React.useEffect(() => {
    if (!options.enabled) return;
    disposedRef.current = false;
    const owner = options.owner;
    if (owner === 'main') {
      acquireLease();
      void ensureJarvisChatForVoice().then((chatId) => {
        if (!disposedRef.current && chatId) focusVoiceChat(chatId);
      });
      armedRef.current = useAuthStore.getState().voiceAutoListenOnOpen;
      if (armedRef.current) startRef.current();
      else useVoiceStore.getState().setState('idle');
    }

    const activeOwner = () => leaseRef.current?.isActive() === true;
    const isDuplicateFinal = (text: string) => {
      const now = Date.now();
      const recent = recentFinalRef.current;
      recentFinalRef.current = { text, at: now };
      return !!recent && recent.text === text && now - recent.at <= DUPLICATE_FINAL_WINDOW_MS;
    };

    const offs = [
      VoiceService.on('voice:start', () => {
        if (!activeOwner()) return;
        useUIStore.getState().setVoiceListening(true);
        useVoiceStore.getState().setState('listening');
      }),
      VoiceService.on('voice:partial', ({ text }) => {
        if (!activeOwner() || turnBusyRef.current) return;
        const partial = String(text).slice(0, MAX_VOICE_TEXT);
        if (optionsRef.current.levelRef) {
          optionsRef.current.levelRef.current = Math.min(1, 0.25 + partial.length / 48);
        }
        useVoiceStore.getState().setPartialTranscript(partial);
      }),
      VoiceService.on('voice:final', ({ text }) => {
        if (!activeOwner() || turnBusyRef.current) return;
        const finalText = boundedText(text);
        if (!finalText || isDuplicateFinal(finalText)) return;
        useVoiceStore.getState().pushFinalTranscript(finalText);
        const auth = useAuthStore.getState();

        if (owner === 'pet') {
          const draft = `${draftRef.current} ${finalText}`.trim();
          if (detectCancelPhrase(draft, auth.voiceCancelPhrase)) {
            draftRef.current = '';
            clearFlushTimer();
            useVoiceStore.getState().setPartialTranscript('');
            return;
          }
          const commit = detectCommitPhrase(draft, auth.voiceCommitPhrase);
          if (commit.committed) {
            draftRef.current = '';
            void sendTurn(commit.messageText);
            return;
          }
          draftRef.current = draft;
          useVoiceStore.getState().setPartialTranscript(draft);
          schedulePetDraft();
          return;
        }

        const action = processVoiceFinalEvent({
          finalText,
          currentDraft: draftRef.current,
          turnBusy: turnBusyRef.current,
          handsFree: auth.voiceAutoListenOnOpen,
          endTrigger: auth.voiceEndTrigger,
          commitPhrase: auth.voiceCommitPhrase,
          cancelPhrase: auth.voiceCancelPhrase,
        });
        if (action.type === 'ignore') return;
        if (action.type === 'cancel') {
          draftRef.current = '';
          clearFlushTimer();
          useVoiceStore.getState().setPartialTranscript('');
          return;
        }
        if (action.type === 'accumulate') {
          draftRef.current = action.draft;
          useVoiceStore.getState().setPartialTranscript(action.draft);
          return;
        }
        if (action.type === 'commit') {
          draftRef.current = '';
          void sendTurn(action.messageText);
          return;
        }
        draftRef.current = action.draft;
        if (shouldAutoSendOnSilence(auth.voiceAutoListenOnOpen, auth.voiceEndTrigger)) {
          scheduleMainDraft();
        }
      }),
      VoiceService.on('voice:error', ({ kind, message }) => {
        if (!activeOwner()) return;
        if (kind === 'no_speech' || kind === 'aborted') {
          if (owner === 'main' && armedRef.current) restartListening();
          return;
        }
        if (kind === 'permission_denied' || kind === 'service_not_allowed' || kind === 'audio_capture') {
          armedRef.current = false;
          useUIStore.getState().setVoiceListening(false);
          stopCapture();
          if (owner === 'pet') releasePetLease();
        }
        useVoiceStore.getState().setState('error', message);
      }),
      VoiceService.on('voice:timeout', () => {
        if (!activeOwner()) return;
        if (owner === 'pet') {
          if (draftRef.current.trim()) {
            if (optionsRef.current.autoSend) void sendTurn(draftRef.current);
            else insertPetDraft();
          } else {
            stopListening('paused');
          }
          return;
        }
        const auth = useAuthStore.getState();
        if (
          shouldAutoSendOnSilence(auth.voiceAutoListenOnOpen, auth.voiceEndTrigger) &&
          draftRef.current.trim()
        ) {
          void sendTurn(draftRef.current);
          return;
        }
        draftRef.current = '';
        stopListening('paused');
      }),
    ];

    const onStreamingStart = () => {
      if (!activeOwner() || !activeRequestRef.current) return;
      streamingRef.current = true;
      speakingRef.current = true;
      turnBusyRef.current = true;
      stopCapture();
      useVoiceStore.getState().setState('speaking');
    };
    const onStreamingEnd = () => {
      if (!activeOwner() || !activeRequestRef.current) return;
      streamingRef.current = false;
      speakingRef.current = false;
      releaseTurn(true);
    };
    const onSpeechStart = () => {
      if (!activeOwner() || streamingRef.current) return;
      resumeAfterSpeechRef.current =
        !turnBusyRef.current && owner === 'main' && VoiceService.isListening();
      turnBusyRef.current = true;
      speakingRef.current = true;
      stopCapture();
      useVoiceStore.getState().setState('speaking');
    };
    const onSpeechEnd = () => {
      if (!activeOwner() || streamingRef.current) return;
      speakingRef.current = false;
      if (resumeAfterSpeechRef.current) {
        resumeAfterSpeechRef.current = false;
        turnBusyRef.current = false;
        armedRef.current = true;
        restartListening(VOICE_REPLY_COOLDOWN_MS);
        return;
      }
      resumeAfterSpeechRef.current = false;
      releaseTurn(true);
    };
    const onRunState = (event: Event) => {
      const detail = (event as CustomEvent<{
        voiceRequestId?: string;
        status?: string;
      }>).detail;
      const request = activeRequestRef.current;
      if (!request || detail?.voiceRequestId !== request.requestId) return;
      if (detail.status === 'running') useVoiceStore.getState().setState('thinking');
      if (detail.status === 'error' || detail.status === 'cancelled') {
        useVoiceStore.getState().setState('error', 'Voice request stopped.');
        releaseTurn();
      } else if (detail.status === 'done' && !request.speakReply) {
        releaseTurn();
      }
    };
    window.addEventListener(STREAMING_VOICE_START_EVENT, onStreamingStart);
    window.addEventListener(STREAMING_VOICE_END_EVENT, onStreamingEnd);
    window.addEventListener(SPEECH_SYNTHESIS_START_EVENT, onSpeechStart);
    window.addEventListener(SPEECH_SYNTHESIS_END_EVENT, onSpeechEnd);
    window.addEventListener('jarvis:run-state', onRunState as EventListener);

    let disposedNative = false;
    const nativeUnlistens: Array<() => void> = [];
    if (isTauriRuntime()) {
      void import('@tauri-apps/api/event')
        .then(async ({ listen }) => {
          const leaseUnlisten = await listen<unknown>(PET_VOICE_LEASE_CLAIM_EVENT, (event) => {
            const payload = event.payload as Partial<VoiceLeaseClaimPayload> | null;
            if (
              payload?.instanceId &&
              payload.instanceId !== WINDOW_INSTANCE_ID &&
              (payload.owner === 'main' || payload.owner === 'pet')
            ) {
              revokeActiveVoiceSession('handoff');
            }
          });
          nativeUnlistens.push(leaseUnlisten);
          if (owner === 'pet') {
            const stateUnlisten = await listen<unknown>(PET_VOICE_RUNTIME_STATE_EVENT, (event) => {
              const payload = runtimeStatePayload(event.payload);
              const request = activeRequestRef.current;
              if (!payload || !request || payload.requestId !== request.requestId) return;
              if (payload.state === 'thinking') useVoiceStore.getState().setState('thinking');
              else if (payload.state === 'speaking') useVoiceStore.getState().setState('speaking');
              else if (payload.state === 'error') {
                useVoiceStore.getState().setState('error', payload.message ?? 'Voice request failed.');
                releaseTurn();
              } else releaseTurn(true);
            });
            nativeUnlistens.push(stateUnlisten);
          }
          if (disposedNative) nativeUnlistens.splice(0).forEach((unlisten) => unlisten());
        })
        .catch(() => undefined);
    }

    return () => {
      disposedNative = true;
      disposedRef.current = true;
      generationRef.current += 1;
      offs.forEach((off) => off());
      nativeUnlistens.splice(0).forEach((unlisten) => unlisten());
      window.removeEventListener(STREAMING_VOICE_START_EVENT, onStreamingStart);
      window.removeEventListener(STREAMING_VOICE_END_EVENT, onStreamingEnd);
      window.removeEventListener(SPEECH_SYNTHESIS_START_EVENT, onSpeechStart);
      window.removeEventListener(SPEECH_SYNTHESIS_END_EVENT, onSpeechEnd);
      window.removeEventListener('jarvis:run-state', onRunState as EventListener);
      clearLifecycleTimers();
      draftRef.current = '';
      recentFinalRef.current = null;
      const request = activeRequestRef.current;
      if (request) void dispatchVoiceCancel(request.requestId);
      activeRequestRef.current = null;
      const owned = leaseRef.current?.isActive() === true;
      if (owned) stopCapture();
      leaseRef.current?.release();
      leaseRef.current = null;
      turnBusyRef.current = false;
      speakingRef.current = false;
      streamingRef.current = false;
      armedRef.current = false;
      if (owner === 'main' || owned) useVoiceStore.getState().clearTranscripts();
      if (owner === 'main' && owned) handleVoiceModuleClosed();
    };
  }, [
    acquireLease,
    clearFlushTimer,
    clearLifecycleTimers,
    insertPetDraft,
    options.enabled,
    options.owner,
    releaseTurn,
    releasePetLease,
    restartListening,
    scheduleMainDraft,
    schedulePetDraft,
    sendTurn,
    stopCapture,
    stopListening,
  ]);

  void voiceState;
  return { startListening, stopListening, stopSpeaking, toggleListening };
}
