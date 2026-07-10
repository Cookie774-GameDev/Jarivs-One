/**
 * VibeSpace global dictation session — shared STT pipeline.
 *
 * The Ctrl+Space overlay transcribes through the SAME speech-to-text engines
 * and configuration as VibeSpace chat / composer STT. Resolution order:
 *
 *   1. Local faster-whisper — when it is the configured composer STT
 *      provider and the model is installed (same as the composer path).
 *   2. Web Speech — the built-in engine VibeSpace chat uses by default.
 *   3. Deepgram streaming — when a Deepgram voice key is configured.
 *   4. Groq Whisper — when a Groq key is configured.
 *
 * If none of those engines is available, the session fails with a clear
 * VibeSpace fix path. Global dictation NEVER routes through the OS default
 * dictation (Windows Win+H) — that is intentionally not a fallback here.
 *
 * Privacy: audio goes only to the engine listed above that the user's own
 * settings selected (local engines keep it on device). Nothing is stored.
 */

import { useAuthStore } from '@/stores/auth';
import { isTauri } from '@/lib/utils';
import { getDeepgramVoiceKey } from '@/lib/security/voiceKeys';
import { VoiceService } from '@/features/voice/VoiceService';
import {
  getComposerSttProvider,
  getFasterWhisperModel,
  startBatchAudioRecorder,
  transcribeFasterWhisper,
  transcribeGroq,
  type FasterWhisperRecorder,
} from '@/features/composer-stt/composerSttService';
import { FasterWhisperManager } from '@/features/composer-stt/fasterWhisperManager';
import { getAudioContextCtor } from '@/features/composer-stt/audio';
import { createDeepgramDictationSession, type DictationEvents } from './deepgramDictation';

export type DictationEngineId = 'faster-whisper' | 'web-speech' | 'deepgram' | 'groq';

export interface GlobalDictationSession {
  engine: DictationEngineId;
  engineLabel: string;
  /** Streaming engines emit partials live; batch engines transcribe on stop. */
  streaming: boolean;
  /** Finalize: batch engines transcribe here. Resolves when the final text is ready. */
  stop: () => Promise<void>;
  /** Discard everything without transcribing. */
  cancel: () => void;
  getFinalText: () => string;
}

export const NO_ENGINE_MESSAGE =
  'No speech-to-text engine is available. Download a local faster-whisper model or add a Deepgram/Groq key in Settings → Speech to Text. VibeSpace dictation never uses Windows Win+H.';

function micAvailable(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
}

async function fasterWhisperReady(): Promise<boolean> {
  if (!isTauri) return false;
  if (getComposerSttProvider() !== 'faster-whisper') return false;
  if (!micAvailable() || !getAudioContextCtor()) return false;
  try {
    return await FasterWhisperManager.checkInstalled(getFasterWhisperModel());
  } catch {
    return false;
  }
}

function createBatchSession(
  engine: DictationEngineId,
  engineLabel: string,
  transcribe: (blob: Blob) => Promise<string>,
  events: DictationEvents,
): Promise<GlobalDictationSession> {
  let finalText = '';
  let recorder: FasterWhisperRecorder | null = null;
  let done = false;

  return startBatchAudioRecorder(
    (level) => events.onLevel?.(level),
    () => events.onError?.('No speech detected for a while — press Retry to keep listening.'),
  ).then((started) => {
    recorder = started;
    events.onOpen?.();
    return {
      engine,
      engineLabel,
      streaming: false,
      stop: async () => {
        if (done) return;
        done = true;
        const wav = recorder?.captureWav() ?? null;
        recorder?.stop();
        recorder = null;
        if (!wav || wav.size === 0) {
          events.onClose?.();
          return;
        }
        try {
          finalText = (await transcribe(wav)).trim();
          if (finalText) events.onFinal?.(finalText);
        } catch (err) {
          events.onError?.(err instanceof Error ? err.message : `${engineLabel} transcription failed.`);
        }
        events.onClose?.();
      },
      cancel: () => {
        if (done) return;
        done = true;
        recorder?.stop();
        recorder = null;
        events.onClose?.();
      },
      getFinalText: () => finalText,
    };
  });
}

function createWebSpeechSession(events: DictationEvents): GlobalDictationSession {
  let finalText = '';
  let done = false;
  const offs = [
    VoiceService.on('voice:partial', (payload) => {
      const text = (payload as { text?: string })?.text ?? '';
      if (text) events.onPartial?.(text);
      events.onLevel?.(Math.min(1, text.length / 48));
    }),
    VoiceService.on('voice:final', (payload) => {
      const text = ((payload as { text?: string })?.text ?? '').trim();
      if (!text) return;
      finalText = `${finalText} ${text}`.trim();
      events.onFinal?.(finalText);
    }),
    VoiceService.on('voice:error', (payload) => {
      const message = (payload as { message?: string })?.message ?? 'Speech recognition error.';
      events.onError?.(message);
    }),
  ];

  const teardown = () => {
    if (done) return;
    done = true;
    offs.forEach((off) => off());
    VoiceService.stopListening();
    events.onClose?.();
  };

  VoiceService.setInactivityTimeoutMs(null);
  const started = VoiceService.startListening();
  if (!started) {
    offs.forEach((off) => off());
    throw new Error('Built-in speech recognition could not start in this window.');
  }
  events.onOpen?.();

  return {
    engine: 'web-speech',
    engineLabel: 'Built-in speech recognition',
    streaming: true,
    stop: async () => teardown(),
    cancel: () => {
      finalText = '';
      teardown();
    },
    getFinalText: () => finalText,
  };
}

/**
 * Open a dictation session on the first available shared-pipeline engine.
 * Throws with a clear fix path when nothing is available.
 */
export async function createGlobalDictationSession(
  events: DictationEvents = {},
): Promise<GlobalDictationSession> {
  // 1. Configured local model — identical to the composer's provider choice.
  if (await fasterWhisperReady()) {
    const model = getFasterWhisperModel();
    return createBatchSession(
      'faster-whisper',
      `Local faster-whisper (${model})`,
      (blob) => transcribeFasterWhisper(blob, model),
      events,
    );
  }

  // 2. Built-in Web Speech — the default VibeSpace chat STT engine.
  if (VoiceService.isSupported()) {
    try {
      return createWebSpeechSession(events);
    } catch {
      // Recognition constructor exists but refused to start - try cloud engines.
    }
  }

  // 3. Deepgram streaming — same key used by VibeSpace voice features.
  if (micAvailable() && (await getDeepgramVoiceKey())) {
    const session = await createDeepgramDictationSession(events);
    return {
      engine: 'deepgram',
      engineLabel: 'Deepgram (streaming)',
      streaming: true,
      stop: async () => session.stop(),
      cancel: () => session.stop(),
      getFinalText: () => session.getFinalText(),
    };
  }

  // 4. Groq Whisper — same key used by the composer's cloud fallback.
  const groqKey = useAuthStore.getState().apiKeys.groq;
  if (micAvailable() && groqKey && getAudioContextCtor()) {
    return createBatchSession(
      'groq',
      'Groq Whisper',
      (blob) => transcribeGroq(blob, groqKey),
      events,
    );
  }

  if (!micAvailable()) {
    throw new Error('Microphone capture is not available in this runtime. Check your microphone permission for VibeSpace.');
  }
  throw new Error(NO_ENGINE_MESSAGE);
}
