/**
 * Incremental TTS while the AI response is still streaming.
 */
import type { VoiceEngine, VoicePresetId } from '@/types/common';
import type { JarvisResponseEnvelope } from '@/lib/jarvis/contracts';
import { useAuthStore } from '@/stores/auth';
import { pullNewSpeechSegments, pullRemainingSpeech } from './textCleanup';
import {
  createKokoroStreamingPlayer,
  registerActiveStreamingVoiceSession,
  speakWithSettings,
  stopAllVoiceOutput,
  canVoiceModuleSpeak,
  getActiveVoiceSessionId,
  type KokoroStreamingPlayer,
} from './voiceRouter';
import {
  SPEECH_SYNTHESIS_END_EVENT,
  SPEECH_SYNTHESIS_START_EVENT,
  STREAMING_VOICE_END_EVENT,
  STREAMING_VOICE_START_EVENT,
} from './speechSynthesis';
import { validateSpeechChunk, type ValidatedSpeechChunk } from './speechGate';

export interface StreamingVoiceOptions {
  voiceEngine?: VoiceEngine;
  voicePreset?: VoicePresetId;
}

export class StreamingVoiceSession {
  private spokenCleanLength = 0;
  private queue: Promise<void> = Promise.resolve();
  private started = false;
  private stopped = false;
  private validatedSpokenText = '';
  private readonly playbackAbort = new AbortController();
  private readonly engine: VoiceEngine;
  private readonly voicePreset: VoicePresetId;
  private readonly kokoroStream: KokoroStreamingPlayer | null;
  private readonly sessionId: number;

  constructor(options: StreamingVoiceOptions = {}) {
    const state = useAuthStore.getState();
    this.engine = options.voiceEngine ?? state.voiceEngine ?? 'kokoro';
    this.voicePreset = options.voicePreset ?? state.voicePreset ?? 'jarvis-prime';
    this.sessionId = getActiveVoiceSessionId();
    this.kokoroStream =
      this.engine === 'kokoro' ? createKokoroStreamingPlayer(this.voicePreset) : null;
    registerActiveStreamingVoiceSession(this);
  }

  private isSessionLive(): boolean {
    return (
      !this.stopped &&
      this.sessionId > 0 &&
      this.sessionId === getActiveVoiceSessionId() &&
      canVoiceModuleSpeak()
    );
  }

  /** @deprecated Temporary raw compatibility boundary; Task 16B removes its final caller. */
  onDelta(accumulatedRaw: string): void {
    if (!this.isSessionLive() || !accumulatedRaw.trim()) return;
    const { segments, nextSpokenCleanLength } = pullNewSpeechSegments(
      accumulatedRaw,
      this.spokenCleanLength,
    );
    if (segments.length === 0) return;
    this.spokenCleanLength = nextSpokenCleanLength;
    const batch = segments.join(' ').trim();
    if (batch) this.enqueueSpeechText(batch);
  }

  async onComplete(finalRaw: string): Promise<void> {
    if (!this.isSessionLive()) return;
    const { remainder, nextSpokenCleanLength } = pullRemainingSpeech(
      finalRaw,
      this.spokenCleanLength,
    );
    this.spokenCleanLength = nextSpokenCleanLength;
    if (remainder.trim()) {
      this.enqueueSpeechText(remainder);
    }
    if (this.kokoroStream) {
      await this.kokoroStream.complete();
    } else {
      await this.queue;
    }
    if (!this.stopped) {
      window.dispatchEvent(new CustomEvent(STREAMING_VOICE_END_EVENT));
      window.dispatchEvent(new CustomEvent(SPEECH_SYNTHESIS_END_EVENT));
    }
  }

  enqueueValidatedChunk(chunk: ValidatedSpeechChunk): void {
    const text = chunk.trim();
    if (!text || !this.isSessionLive()) return;
    this.validatedSpokenText = [this.validatedSpokenText, text].filter(Boolean).join(' ');
    this.enqueueSpeechText(text);
  }

  async completeValidated(
    response: Readonly<Pick<JarvisResponseEnvelope, 'spokenText' | 'mode' | 'executionState'>>,
  ): Promise<void> {
    if (!this.isSessionLive()) return;
    const finalText = response.spokenText?.trim() ?? '';
    if (finalText) {
      const decision = validateSpeechChunk({
        text: finalText,
        completeSentence: true,
        insideFence: false,
        mode: response.mode,
        ...(response.executionState ? { executionState: response.executionState } : {}),
        lintViolations: [],
      });
      if (!decision.allowed) throw new Error(`validated_speech_rejected:${decision.reason}`);
      const prefix = this.validatedSpokenText;
      const remainder =
        prefix && finalText.startsWith(`${prefix} `)
          ? finalText.slice(prefix.length).trim()
          : finalText === prefix
            ? ''
            : finalText;
      if (remainder) this.enqueueValidatedChunk(remainder as ValidatedSpeechChunk);
    }
    if (this.kokoroStream) await this.kokoroStream.complete();
    else await this.queue;
    if (!this.stopped) {
      window.dispatchEvent(new CustomEvent(STREAMING_VOICE_END_EVENT));
      window.dispatchEvent(new CustomEvent(SPEECH_SYNTHESIS_END_EVENT));
    }
  }

  /** Stop playback without clearing the global streaming session registry. */
  haltPlayback(): void {
    const wasActive = this.started && !this.stopped;
    this.stopped = true;
    this.playbackAbort.abort();
    if (wasActive) {
      window.dispatchEvent(new CustomEvent(STREAMING_VOICE_END_EVENT));
      window.dispatchEvent(new CustomEvent(SPEECH_SYNTHESIS_END_EVENT));
    }
    this.kokoroStream?.stop();
  }

  stop(): void {
    registerActiveStreamingVoiceSession(null);
    this.haltPlayback();
    stopAllVoiceOutput();
  }

  private enqueueSpeechText(text: string): void {
    if (!this.isSessionLive()) return;
    if (this.kokoroStream) {
      if (!this.started) {
        this.started = true;
        window.dispatchEvent(new CustomEvent(STREAMING_VOICE_START_EVENT));
        window.dispatchEvent(new CustomEvent(SPEECH_SYNTHESIS_START_EVENT));
      }
      this.kokoroStream.enqueue(text);
      return;
    }

    this.queue = this.queue.then(async () => {
      if (!this.isSessionLive()) return;
      if (!this.started) {
        this.started = true;
        window.dispatchEvent(new CustomEvent(STREAMING_VOICE_START_EVENT));
        window.dispatchEvent(new CustomEvent(SPEECH_SYNTHESIS_START_EVENT));
      }
      try {
        await speakWithSettings(text, {
          voiceEngine: this.engine,
          voicePreset: this.voicePreset,
          signal: this.playbackAbort.signal,
        });
      } catch (error) {
        if (!this.stopped) throw error;
      }
    });
  }
}

export function createStreamingVoiceSession(
  options?: StreamingVoiceOptions,
): StreamingVoiceSession {
  return new StreamingVoiceSession(options);
}
