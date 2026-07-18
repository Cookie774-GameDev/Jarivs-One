import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '@/stores/ui';
import { useAuthStore } from '@/stores/auth';
import {
  SPEECH_SYNTHESIS_END_EVENT,
  SPEECH_SYNTHESIS_START_EVENT,
  STREAMING_VOICE_END_EVENT,
} from './speechSynthesis';

type VoiceHandler = (payload?: unknown) => void;

const voiceMockState = vi.hoisted(() => ({
  handlers: new Map<string, Set<VoiceHandler>>(),
  listening: false,
}));

const routerMocks = vi.hoisted(() => ({
  handleVoiceModuleClosed: vi.fn(),
  stopCurrentVoiceResponse: vi.fn(),
}));

vi.mock('./VoiceService', () => ({
  VoiceService: {
    isSupported: () => true,
    isListening: () => voiceMockState.listening,
    wantsListening: () => false,
    setInactivityTimeoutMs: vi.fn(),
    startListening: vi.fn(() => {
      voiceMockState.listening = true;
      return true;
    }),
    stopListening: vi.fn(() => {
      voiceMockState.listening = false;
    }),
    on: (event: string, fn: VoiceHandler) => {
      let set = voiceMockState.handlers.get(event);
      if (!set) {
        set = new Set();
        voiceMockState.handlers.set(event, set);
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
  useChatMessages: () => [],
}));

vi.mock('@/lib/db', () => ({
  messageRepo: {
    create: vi.fn(async () => ({})),
  },
}));

vi.mock('./voiceChatRouting', () => ({
  ensureJarvisChatForVoice: vi.fn(async () => 'chat_voice'),
  focusVoiceChat: vi.fn(),
  resolveVoiceChatTarget: vi.fn(async (text: string) => ({
    chatId: 'chat_voice',
    messageText: text,
    agentId: 'agent_jarvis',
    mentionedAgentIds: [],
  })),
}));

vi.mock('./voiceRouter', () => routerMocks);

import { VoiceModal } from './VoiceModal';
import { VoiceService } from './VoiceService';
import { useVoiceStore } from './store';
import { selectionFromOption } from '@/lib/ai/modelSelection';
import { DEFAULT_CUSTOM_STEPS } from '@/lib/ai/stacks/presets';

function emitVoice(event: string, payload?: unknown) {
  voiceMockState.handlers.get(event)?.forEach((fn) => fn(payload));
}

function setupAuth(handsFree: boolean) {
  useAuthStore.setState({
    voiceAutoListenOnOpen: handsFree,
    voiceEndTrigger: 'phrase',
    voiceCommitPhrase: 'send it',
    voiceCancelPhrase: 'cancel',
    voiceSilenceDelayMs: 2000,
    voiceAutoApproveActions: true,
    apiKeys: { groq: 'gsk_test' },
    stackCustomSteps: DEFAULT_CUSTOM_STEPS,
    chatModelSelection: selectionFromOption('groq', 'llama-3.3-70b-versatile'),
  });
}

describe('VoiceModal stop control and mic recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    voiceMockState.handlers.clear();
    voiceMockState.listening = false;
    useUIStore.setState({
      voiceModalOpen: true,
      voiceListening: false,
      activeChatId: 'chat_voice',
    });
    useVoiceStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('clicking the orb while Jarvis speaks stops the response and resumes listening (hands-free)', async () => {
    setupAuth(true);
    render(<VoiceModal />);

    act(() => {
      window.dispatchEvent(new CustomEvent(SPEECH_SYNTHESIS_START_EVENT));
    });
    expect(useVoiceStore.getState().state).toBe('speaking');

    fireEvent.click(screen.getByRole('button', { name: /Stop response/i }));

    expect(routerMocks.stopCurrentVoiceResponse).toHaveBeenCalledTimes(1);
    expect(useVoiceStore.getState().state).toBe('listening');
  });

  it('clicking the orb while Jarvis speaks stops the response and goes idle (push-to-talk)', async () => {
    setupAuth(false);
    render(<VoiceModal />);

    act(() => {
      window.dispatchEvent(new CustomEvent(SPEECH_SYNTHESIS_START_EVENT));
    });
    expect(useVoiceStore.getState().state).toBe('speaking');

    fireEvent.click(screen.getByRole('button', { name: /Stop response/i }));

    expect(routerMocks.stopCurrentVoiceResponse).toHaveBeenCalledTimes(1);
    expect(useVoiceStore.getState().state).toBe('idle');
  });

  it('hands-free listen timeout shows a visible paused state instead of a silent shutoff', async () => {
    setupAuth(true);
    render(<VoiceModal />);
    expect(useVoiceStore.getState().state).toBe('listening');

    act(() => {
      emitVoice('voice:timeout');
    });

    expect(useVoiceStore.getState().state).toBe('paused');
    expect(screen.getByText(/Paused — click the orb to resume/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Resume listening/i })).toBeTruthy();
  });

  it('clicking the paused orb resumes listening', async () => {
    setupAuth(true);
    render(<VoiceModal />);
    act(() => {
      emitVoice('voice:timeout');
    });
    expect(useVoiceStore.getState().state).toBe('paused');

    fireEvent.click(screen.getByRole('button', { name: /Resume listening/i }));

    expect(useVoiceStore.getState().state).toBe('listening');
  });

  it('re-arms the push-to-talk mic after an external voice preview interrupts it', async () => {
    vi.useFakeTimers();
    setupAuth(false);
    render(<VoiceModal />);

    // User clicks to talk (push-to-talk).
    fireEvent.click(screen.getByRole('button', { name: /Click to talk/i }));
    expect(useVoiceStore.getState().state).toBe('listening');
    expect(VoiceService.startListening).toHaveBeenCalledTimes(1);

    // A Settings voice preview starts speaking - the modal parks the mic.
    act(() => {
      window.dispatchEvent(new CustomEvent(SPEECH_SYNTHESIS_START_EVENT));
    });
    expect(useVoiceStore.getState().state).toBe('speaking');

    // Preview ends - after the cooldown, the mic must come back on its own.
    act(() => {
      window.dispatchEvent(new CustomEvent(SPEECH_SYNTHESIS_END_EVENT));
      vi.advanceTimersByTime(2000);
    });

    expect(VoiceService.startListening).toHaveBeenCalledTimes(2);
    expect(useVoiceStore.getState().state).toBe('listening');
  });

  it('ignores late completion events after an explicit hands-free stop', async () => {
    vi.useFakeTimers();
    setupAuth(true);
    render(<VoiceModal />);
    act(() => window.dispatchEvent(new CustomEvent(SPEECH_SYNTHESIS_START_EVENT)));
    fireEvent.click(screen.getByRole('button', { name: /Stop response/i }));
    expect(VoiceService.startListening).toHaveBeenCalledTimes(2);

    voiceMockState.listening = false;
    act(() => {
      window.dispatchEvent(new CustomEvent(STREAMING_VOICE_END_EVENT));
      window.dispatchEvent(new CustomEvent(SPEECH_SYNTHESIS_END_EVENT));
      vi.advanceTimersByTime(2000);
    });

    expect(VoiceService.startListening).toHaveBeenCalledTimes(2);
    expect(useVoiceStore.getState().state).toBe('listening');
  });
});
