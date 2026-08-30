import * as React from 'react';
import { useAppForeground } from './useAppForeground';
import { waveformBarWeight } from './voiceSignal';

interface VoiceActivityWaveformProps {
  levelRef: React.RefObject<number>;
  active: boolean;
}

const BAR_COUNT = 18;
const ACTIVE_FRAME_MS = 48;
const DEFAULT_WAVEFORM_COLORS = {
  high: 'rgba(255, 227, 163, 0.92)',
  mid: 'rgba(217, 138, 78, 1)',
  low: 'rgba(143, 83, 56, 0.86)',
} as const;

function waveformColor(canvas: HTMLCanvasElement, property: string, fallback: string): string {
  return window.getComputedStyle(canvas).getPropertyValue(property).trim() || fallback;
}

function drawStaticWaveform(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * scale));
  const height = Math.max(1, Math.round(rect.height * scale));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  context.clearRect(0, 0, width, height);
  const gap = 1.15 * scale;
  const barWidth = Math.max(1 * scale, (width - gap * (BAR_COUNT - 1)) / BAR_COUNT);
  const centerY = height / 2;
  context.fillStyle = waveformColor(canvas, '--jarvis-waveform-mid', DEFAULT_WAVEFORM_COLORS.mid);

  for (let index = 0; index < BAR_COUNT; index += 1) {
    const envelope = waveformBarWeight(index, BAR_COUNT);
    const amplitude = Math.max(1.2 * scale, envelope * height * 0.78);
    const x = index * (barWidth + gap);
    const y = centerY - amplitude / 2;
    context.beginPath();
    context.roundRect(x, y, barWidth, amplitude, barWidth / 2);
    context.fill();
  }
}

export const VoiceActivityWaveform = React.memo(function VoiceActivityWaveform({
  levelRef,
  active,
}: VoiceActivityWaveformProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const appForeground = useAppForeground();
  const [reducedMotion, setReducedMotion] = React.useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
  );

  React.useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    if (!active || !appForeground || reducedMotion) {
      drawStaticWaveform(context, canvas);
      const observer =
        typeof ResizeObserver === 'function'
          ? new ResizeObserver(() => drawStaticWaveform(context, canvas))
          : null;
      observer?.observe(canvas);
      return () => observer?.disconnect();
    }

    let frame = 0;
    let disposed = false;
    let smoothedLevel = 0;
    let peakLevel = 0;
    let lastDraw = 0;
    let gradient: CanvasGradient | null = null;
    let gradientHeight = 0;

    const draw = (time: number) => {
      if (disposed || document.visibilityState !== 'visible') return;
      if (time - lastDraw < ACTIVE_FRAME_MS) {
        frame = window.requestAnimationFrame(draw);
        return;
      }
      lastDraw = time;

      const rect = canvas.getBoundingClientRect();
      const scale = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(rect.width * scale));
      const height = Math.max(1, Math.round(rect.height * scale));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gradient = null;
      }

      context.clearRect(0, 0, width, height);
      const target = Math.min(1, Math.max(0, levelRef.current ?? 0));
      smoothedLevel += (target - smoothedLevel) * (target > smoothedLevel ? 0.62 : 0.22);
      if (target > peakLevel) peakLevel = target;
      else peakLevel += (target - peakLevel) * 0.12;

      const gap = 1.15 * scale;
      const barWidth = Math.max(1 * scale, (width - gap * (BAR_COUNT - 1)) / BAR_COUNT);
      const centerY = height / 2;
      const live = 0.08 + Math.max(smoothedLevel, peakLevel * 0.72) * 0.9;

      if (!gradient || gradientHeight !== height) {
        gradient = context.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(
          0,
          waveformColor(canvas, '--jarvis-waveform-high', DEFAULT_WAVEFORM_COLORS.high),
        );
        gradient.addColorStop(
          0.5,
          waveformColor(canvas, '--jarvis-waveform-mid', DEFAULT_WAVEFORM_COLORS.mid),
        );
        gradient.addColorStop(
          1,
          waveformColor(canvas, '--jarvis-waveform-low', DEFAULT_WAVEFORM_COLORS.low),
        );
        gradientHeight = height;
      }
      context.fillStyle = gradient;
      context.globalAlpha = 0.42 + live * 0.58;

      for (let index = 0; index < BAR_COUNT; index += 1) {
        const envelope = waveformBarWeight(index, BAR_COUNT);
        const neighbor = waveformBarWeight(
          (index + Math.round(smoothedLevel * 11)) % BAR_COUNT,
          BAR_COUNT,
        );
        const spread = 0.52 + neighbor * 0.48 * Math.max(0.18, smoothedLevel);
        const amplitude = Math.max(1.2 * scale, envelope * height * live * spread);
        const x = index * (barWidth + gap);
        const y = centerY - amplitude / 2;
        context.beginPath();
        context.roundRect(x, y, barWidth, amplitude, barWidth / 2);
        context.fill();
      }
      context.globalAlpha = 1;

      frame = window.requestAnimationFrame(draw);
    };

    frame = window.requestAnimationFrame(draw);
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
    };
  }, [active, appForeground, levelRef, reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      className="jarvis-voice-waveform h-8 w-full"
      data-waveform-active={active ? 'true' : 'false'}
      aria-hidden="true"
    />
  );
});
