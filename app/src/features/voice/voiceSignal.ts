import type * as React from 'react';

interface SignalTrack {
  stop(): void;
}

interface SignalStream {
  getTracks(): SignalTrack[];
}

interface SignalSource {
  connect(node: SignalAnalyser): void;
  disconnect(): void;
}

interface SignalAnalyser {
  fftSize: number;
  smoothingTimeConstant: number;
  frequencyBinCount: number;
  getByteTimeDomainData(samples: Uint8Array): void;
  disconnect(): void;
}

interface SignalAudioContext {
  state: string;
  createMediaStreamSource(stream: SignalStream): SignalSource;
  createAnalyser(): SignalAnalyser;
  close(): Promise<void>;
}

export interface VoiceSignalDependencies {
  getUserMedia(constraints: MediaStreamConstraints): Promise<SignalStream>;
  createAudioContext(): SignalAudioContext | null;
  requestFrame(callback: FrameRequestCallback): number;
  cancelFrame(frame: number): void;
}

export interface VoiceSignalController {
  startListening(): Promise<void>;
  startSpeaking(): void;
  stop(): void;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

function browserDependencies(): VoiceSignalDependencies {
  return {
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    createAudioContext: () => {
      const AudioContextCtor = window.AudioContext;
      return AudioContextCtor ? (new AudioContextCtor() as unknown as SignalAudioContext) : null;
    },
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    cancelFrame: (frame) => window.cancelAnimationFrame(frame),
  };
}

/**
 * Owns only the visualization signal. Speech recognition remains the authority
 * for transcription; this controller samples a parallel mic stream and always
 * releases it on mode changes.
 */
export function createVoiceSignalController(
  levelRef: React.MutableRefObject<number>,
  dependencies: VoiceSignalDependencies = browserDependencies(),
): VoiceSignalController {
  let generation = 0;
  let frame: number | null = null;
  let stream: SignalStream | null = null;
  let source: SignalSource | null = null;
  let analyser: SignalAnalyser | null = null;
  let audioContext: SignalAudioContext | null = null;

  const cancelAnimation = () => {
    if (frame !== null) dependencies.cancelFrame(frame);
    frame = null;
  };

  const releaseAudio = () => {
    source?.disconnect();
    analyser?.disconnect();
    for (const track of stream?.getTracks() ?? []) track.stop();
    void audioContext?.close().catch(() => undefined);
    source = null;
    analyser = null;
    stream = null;
    audioContext = null;
  };

  const reset = () => {
    generation += 1;
    cancelAnimation();
    releaseAudio();
    levelRef.current = 0;
  };

  const startListening = async () => {
    reset();
    const activeGeneration = generation;
    let acquiredStream: SignalStream | null = null;
    try {
      acquiredStream = await dependencies.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      if (generation !== activeGeneration) {
        for (const track of acquiredStream.getTracks()) track.stop();
        return;
      }
      const context = dependencies.createAudioContext();
      if (!context) {
        for (const track of acquiredStream.getTracks()) track.stop();
        return;
      }
      stream = acquiredStream;
      audioContext = context;
      source = context.createMediaStreamSource(acquiredStream);
      analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.15;
      source.connect(analyser);
      const samples = new Uint8Array(analyser.frequencyBinCount);

      const sample = () => {
        if (generation !== activeGeneration || !analyser) return;
        analyser.getByteTimeDomainData(samples);
        let squareSum = 0;
        for (const value of samples) {
          const centered = (value - 128) / 128;
          squareSum += centered * centered;
        }
        const rms = Math.sqrt(squareSum / Math.max(1, samples.length));
        const normalized = clamp((rms - 0.012) / 0.22);
        const smoothing = normalized > levelRef.current ? 0.5 : 0.16;
        levelRef.current = clamp(levelRef.current + (normalized - levelRef.current) * smoothing);
        frame = dependencies.requestFrame(sample);
      };
      frame = dependencies.requestFrame(sample);
    } catch {
      if (generation === activeGeneration) {
        if (stream) releaseAudio();
        else for (const track of acquiredStream?.getTracks() ?? []) track.stop();
        levelRef.current = 0;
      }
    }
  };

  const startSpeaking = () => {
    reset();
    const activeGeneration = generation;
    const sample = (time: number) => {
      if (generation !== activeGeneration) return;
      const target = clamp(
        0.24 +
          Math.abs(Math.sin(time * 0.011)) * 0.38 +
          Math.abs(Math.sin(time * 0.019 + 1.1)) * 0.22,
      );
      levelRef.current += (target - levelRef.current) * 0.42;
      frame = dependencies.requestFrame(sample);
    };
    frame = dependencies.requestFrame(sample);
  };

  return { startListening, startSpeaking, stop: reset };
}
