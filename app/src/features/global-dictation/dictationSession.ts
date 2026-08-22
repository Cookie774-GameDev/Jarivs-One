/**
 * VibeSpace global dictation session — shared STT pipeline.
 *
 * The Ctrl+Space overlay uses the saved speech-to-text provider and the same
 * Deepgram option as composer settings. It opens exactly one of local
 * faster-whisper, built-in system speech, or Deepgram streaming; it never
 * substitutes another available provider or invokes Windows Win+H.
 *
 * Privacy: audio goes only to the engine listed above that the user's own
 * settings selected (local engines keep it on device). Nothing is stored.
 */

import { isTauri } from '@/lib/utils';
import { getDeepgramVoiceKey } from '@/lib/security/voiceKeys';
import { getDeepgramSttOption, readDeepgramSttOption } from '@/lib/deepgram';
import { VoiceService } from '@/features/voice/VoiceService';
import {
  getComposerSttProvider,
  getFasterWhisperModel,
  startBatchAudioRecorder,
  transcribeFasterWhisper,
  type FasterWhisperRecorder,
} from '@/features/composer-stt/composerSttService';
import { FasterWhisperManager } from '@/features/composer-stt/fasterWhisperManager';
import { getAudioContextCtor } from '@/features/composer-stt/audio';
import { createDeepgramDictationSession, type DictationEvents } from './deepgramDictation';
import {
  formatGlobalDictationSessionFailure,
  formatGlobalDictationTranscriptionFailure,
  NO_DICTATION_ENGINE_REASON,
} from './dictationFailures';

export type DictationEngineId = 'faster-whisper' | 'web-speech' | 'deepgram';

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

export const NO_ENGINE_MESSAGE = NO_DICTATION_ENGINE_REASON;

let activeSessionToken: symbol | null = null;

function micAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

async function fasterWhisperReady(): Promise<boolean> {
  if (!isTauri || !getAudioContextCtor()) return false;
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
        } catch {
          events.onError?.(formatGlobalDictationTranscriptionFailure(engine));
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
    VoiceService.on('voice:error', ({ message }) => {
      events.onError?.(formatGlobalDictationSessionFailure(message));
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
 * Open exactly the engine selected in Settings. A process-wide token prevents
 * two destinations from opening competing microphone sessions.
 */
export async function createSelectedSttSession(
  events: DictationEvents = {},
): Promise<GlobalDictationSession> {
  if (!micAvailable()) {
    throw new Error(
      'Microphone capture is not available in this runtime. Check your microphone permission for VibeSpace.',
    );
  }
  if (activeSessionToken) {
    throw new Error(
      'Another VibeSpace dictation session is already using the microphone. Stop it, then try again.',
    );
  }

  const token = Symbol('selected-stt-session');
  activeSessionToken = token;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    if (activeSessionToken === token) activeSessionToken = null;
  };
  const scopedEvents: DictationEvents = {
    ...events,
    onClose: () => {
      release();
      events.onClose?.();
    },
  };
  const withRelease = (session: GlobalDictationSession): GlobalDictationSession => ({
    ...session,
    stop: async () => {
      try {
        await session.stop();
      } finally {
        release();
      }
    },
    cancel: () => {
      try {
        session.cancel();
      } finally {
        release();
      }
    },
  });

  try {
    const provider = getComposerSttProvider();
    if (provider === 'faster-whisper') {
      const model = getFasterWhisperModel();
      if (!(await fasterWhisperReady())) {
        throw new Error(
          `The selected local faster-whisper model (${model}) is not ready. Install or repair it in Settings → Speech to Text, then retry.`,
        );
      }
      return withRelease(
        await createBatchSession(
          'faster-whisper',
          `Local faster-whisper (${model})`,
          (blob) => transcribeFasterWhisper(blob, model),
          scopedEvents,
        ),
      );
    }

    if (provider === 'deepgram') {
      const optionId = readDeepgramSttOption();
      const option = getDeepgramSttOption(optionId);
      if (!(await getDeepgramVoiceKey())) {
        throw new Error(
          `The selected Deepgram model ${option.label} (${option.runtimeModel}, ${option.endpointVersion}/listen) needs a connected Deepgram key. Connect it in Settings → Speech to Text, then retry.`,
        );
      }
      const session = await createDeepgramDictationSession(scopedEvents, optionId);
      return withRelease({
        engine: 'deepgram',
        engineLabel: `Deepgram · ${option.label} (${option.runtimeModel}, ${option.endpointVersion}/listen)`,
        streaming: true,
        stop: async () => session.stop(),
        cancel: () => session.stop(),
        getFinalText: () => session.getFinalText(),
      });
    }

    if (!VoiceService.isSupported()) {
      throw new Error(
        `The selected built-in system speech engine is unavailable in this window. ${NO_ENGINE_MESSAGE}`,
      );
    }
    return withRelease(createWebSpeechSession(scopedEvents));
  } catch (error) {
    release();
    throw error;
  }
}

/** Backwards-compatible name for the Ctrl+Space mini-module. */
export const createGlobalDictationSession = createSelectedSttSession;
