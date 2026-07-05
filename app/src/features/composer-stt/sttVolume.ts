import type { MutableRefObject } from 'react';
import { getAudioContextCtor } from './audio';

/** Shared mic level (0–1) for toolbar + composer waveform indicators. */
export const sttVolumeRef: MutableRefObject<number> = { current: 0 };

type MicVolumeMeter = {
  stop: () => void;
};

let activeMeter: MicVolumeMeter | null = null;

export function resetSttVolume(): void {
  sttVolumeRef.current = 0;
}

export function setSttVolumeLevel(level: number): void {
  sttVolumeRef.current = Math.min(1, Math.max(0, level));
}

export function stopSttVolumeMeter(): void {
  activeMeter?.stop();
  activeMeter = null;
  resetSttVolume();
}

/** Live mic level from getUserMedia — idle stays low, speech pushes bars up. */
export async function startSttVolumeMeter(): Promise<void> {
  stopSttVolumeMeter();

  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const AudioCtor = getAudioContextCtor();
    if (!AudioCtor) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    const context = new AudioCtor();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let rafId: number | null = null;
    let alive = true;

    const tick = () => {
      if (!alive) return;
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i += 1) {
        sum += dataArray[i] ?? 0;
      }
      const avg = sum / Math.max(1, dataArray.length);
      // Quiet room ≈ 0.05–0.15, normal speech ≈ 0.35–0.65, loud ≈ 0.8+
      setSttVolumeLevel(avg / 48);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    const stop = () => {
      alive = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      source.disconnect();
      void context.close().catch(() => {});
      stream.getTracks().forEach((track) => track.stop());
      if (activeMeter?.stop === stop) activeMeter = null;
      resetSttVolume();
    };

    activeMeter = { stop };
  } catch {
    resetSttVolume();
  }
}
