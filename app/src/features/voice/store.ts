import { create } from 'zustand';
import type { PersonaPreset } from '@/types/common';
import type { VoiceSessionBinding } from './voiceSessionBinding';

/**
 * Voice-feature local state. Distinct from the global `useUIStore`:
 * - `useUIStore` owns BOOLEANS that other features need to know about
 *   (`voiceModalOpen`, `voiceListening` for the GlowBorder).
 * - `useVoiceStore` (this) owns the rich voice-only state - transcripts,
 *   semantic state machine, persona selection.
 *
 * We keep them split so a feature can subscribe to `voiceListening` without
 * pulling in transcript history.
 */

export type VoiceState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  /** Listening stopped after silence/timeout — click the orb to resume. */
  | 'paused'
  | 'error';

export interface FinalTranscript {
  text: string;
  ts: number;
}

const MAX_FINAL_TRANSCRIPTS = 24;

interface VoiceStore {
  /** Current voice state machine position - drives the orb visual. */
  state: VoiceState;
  /** Last error message if `state === 'error'`. */
  errorMessage: string | null;
  /** Live partial transcript while the user is speaking. Gets replaced. */
  partialTranscript: string;
  /** History of finalized utterances during the current session. */
  finalTranscript: FinalTranscript[];
  /** Active persona preset (mirrored from auth store but cached locally). */
  persona: PersonaPreset;
  /** Immutable account/chat identity captured when this voice session opened. */
  session: Readonly<VoiceSessionBinding> | null;

  // Actions
  setState: (s: VoiceState, errorMessage?: string) => void;
  setPartialTranscript: (text: string) => void;
  pushFinalTranscript: (text: string) => void;
  clearTranscripts: () => void;
  setPersona: (p: PersonaPreset) => void;
  beginSession: (binding: Readonly<VoiceSessionBinding>) => boolean;
  setSessionRun: (
    runId: string | undefined,
    expectedSessionId?: string,
    expectedActiveRunId?: string | null,
  ) => boolean;
  endSession: (expectedSessionId?: string) => boolean;
  reset: () => void;
}

const defaults = {
  state: 'idle' as VoiceState,
  errorMessage: null,
  partialTranscript: '',
  finalTranscript: [] as FinalTranscript[],
  persona: 'jarvis' as PersonaPreset,
  session: null as Readonly<VoiceSessionBinding> | null,
};

export const useVoiceStore = create<VoiceStore>((set) => ({
  ...defaults,

  setState: (s, errorMessage) =>
    set({
      state: s,
      errorMessage: s === 'error' ? (errorMessage ?? 'Voice error') : null,
    }),

  setPartialTranscript: (text) => set({ partialTranscript: text }),

  pushFinalTranscript: (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    set((s) => ({
      finalTranscript: [...s.finalTranscript, { text: trimmed, ts: Date.now() }].slice(
        -MAX_FINAL_TRANSCRIPTS,
      ),
      partialTranscript: '',
    }));
  },

  clearTranscripts: () => set({ partialTranscript: '', finalTranscript: [] }),

  setPersona: (p) => set({ persona: p }),

  beginSession: (binding) => {
    if (!Object.isFrozen(binding)) throw new Error('voice_session_binding_invalid');
    let accepted = false;
    set((state) => {
      if (state.session) return state;
      accepted = true;
      return { session: binding };
    });
    return accepted;
  },

  setSessionRun: (runId, expectedSessionId, expectedActiveRunId) => {
    let applied = false;
    set((state) => {
      if (!state.session) return state;
      if (expectedSessionId !== undefined && state.session.sessionId !== expectedSessionId) {
        return state;
      }
      if (
        expectedActiveRunId !== undefined &&
        (expectedActiveRunId === null
          ? state.session.activeRunId !== undefined
          : state.session.activeRunId !== expectedActiveRunId)
      ) {
        return state;
      }
      if (runId !== undefined && (!runId || runId.trim() !== runId)) {
        throw new Error('voice_session_run_invalid');
      }
      applied = true;
      const { activeRunId: _activeRunId, ...binding } = state.session;
      return {
        session: Object.freeze({
          ...binding,
          ...(runId === undefined ? {} : { activeRunId: runId }),
        }),
      };
    });
    return applied;
  },

  endSession: (expectedSessionId) => {
    let applied = false;
    set((state) => {
      if (!state.session) return state;
      if (expectedSessionId !== undefined && state.session.sessionId !== expectedSessionId) {
        return state;
      }
      applied = true;
      return { session: null };
    });
    return applied;
  },

  reset: () => set(defaults),
}));
