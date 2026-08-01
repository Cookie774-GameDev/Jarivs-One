import * as React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useThemeMotionLayout, useThemeMotionTransition } from '@/features/appearance/themeMotion';
import { useVoiceStore } from './store';
import { useAppForeground } from './useAppForeground';
import './voice.sakura.css';

const SPRING = 'spring' as const;
const CAPTION_TRANSITION = { type: SPRING, stiffness: 360, damping: 32, mass: 0.7 };

/**
 * Translucent caption bar that overlays the bottom of the screen during
 * voice sessions. Per docs/05 sec 5: "a translucent transcript caption
 * at the bottom of the screen showing what Jarvis heard. Drops away when
 * the session ends."
 *
 * Behaviour:
 *  - shows the live partial transcript while it has content
 *  - falls back to the most recent finalised utterance otherwise
 *  - hides entirely when there's nothing to display
 *
 * Mount at App root, NOT inside the modal - the caption is for sessions
 * that happen with the modal closed (ambient-mode dictation, future PTT).
 */
export function VoiceCaption() {
  const partial = useVoiceStore((s) => s.partialTranscript);
  const finals = useVoiceStore((s) => s.finalTranscript);
  const appForeground = useAppForeground();
  const captionLayout = useThemeMotionLayout(true);
  const captionTransition = useThemeMotionTransition(CAPTION_TRANSITION);
  const [reducedMotion, setReducedMotion] = React.useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const last = finals[finals.length - 1];

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  // Prefer live partial, then last final (briefly, for continuity).
  const text = partial.trim() || last?.text || '';
  const visible = !!text;
  const motionEnabled = appForeground && !reducedMotion;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[55] flex justify-center px-6"
      aria-label="Live voice caption"
      aria-live="off"
      data-motion-enabled={String(motionEnabled)}
      data-vibespace-owned-chrome="voice"
      data-voice-surface="caption"
    >
      <AnimatePresence>
        {visible && (
          <motion.div
            key="caption"
            layout={motionEnabled ? captionLayout : false}
            initial={motionEnabled ? { opacity: 0, y: 12 } : false}
            animate={motionEnabled ? { opacity: 1, y: 0 } : undefined}
            exit={motionEnabled ? { opacity: 0, y: 12 } : undefined}
            transition={motionEnabled ? captionTransition : undefined}
            className="pointer-events-auto max-h-[min(40vh,16rem)] w-full max-w-3xl min-w-0 overflow-y-auto rounded-2xl border border-border/60 bg-elevated/80 px-5 py-2.5 text-body text-foreground shadow-lg backdrop-blur-md"
          >
            <span className="block whitespace-pre-wrap break-words">{text}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
