import { motion, type Transition } from 'motion/react';
import { Mic, Sparkles } from 'lucide-react';
import { useThemeMotionTransition } from '@/features/appearance/themeMotion';
import { useUIStore } from '@/stores/ui';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DemoProps {
  onFinish: () => void;
}
const LEGACY_HEADER_TRANSITION = Object.freeze({
  type: 'spring',
  stiffness: 220,
  damping: 28,
} as const) satisfies Transition;
const LEGACY_VOICE_BUTTON_TRANSITION = Object.freeze({
  type: 'spring',
  stiffness: 400,
  damping: 26,
} as const) satisfies Transition;

/**
 * Final onboarding step. Encourages the user to try voice once before landing
 * in the workspace. The "Try saying" button toggles the voice modal so the user
 * sees it for the first time.
 */
export function Demo({ onFinish }: DemoProps) {
  const headerTransition = useThemeMotionTransition(LEGACY_HEADER_TRANSITION);
  const voiceButtonTransition = useThemeMotionTransition(LEGACY_VOICE_BUTTON_TRANSITION);
  const setVoiceModalOpen = useUIStore((s) => s.setVoiceModalOpen);

  return (
    <div className="h-full w-full flex flex-col items-center justify-center px-8 py-10 gap-8 overflow-y-auto bg-aurora-gradient">
      <motion.header
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={headerTransition}
        className="text-center max-w-xl"
      >
        <h2 className="text-hero leading-tight">You're all set</h2>
        <p className="text-body text-muted-foreground mt-3">
          Try saying <span className="text-accent-gradient font-medium">"Hey Jarvis"</span> to wake
          him up, or click the orb to start a turn.
        </p>
      </motion.header>

      <motion.button
        type="button"
        onClick={() => setVoiceModalOpen(true)}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.98 }}
        transition={voiceButtonTransition}
        aria-label="Open voice modal"
        className={cn(
          'relative h-32 w-32 rounded-full bg-accent-gradient text-white',
          'shadow-[0_0_60px_-12px_hsl(var(--accent-cyan)/0.6),0_0_120px_-40px_hsl(var(--accent-violet)/0.7)]',
          'animate-breathe focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan',
        )}
      >
        <span className="absolute inset-0 flex items-center justify-center">
          <Mic className="h-10 w-10" strokeWidth={1.5} />
        </span>
        <span className="sr-only">Try voice</span>
      </motion.button>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl w-full">
        <Hint label='"What can you do?"' />
        <Hint label='"Add a todo: ship the demo by Friday"' />
        <Hint label='"Summarize this page"' />
        <Hint label='"Open settings"' />
      </ul>

      <Button variant="accent" size="lg" onClick={onFinish}>
        <Sparkles className="h-4 w-4" />
        Open Jarvis
      </Button>
    </div>
  );
}

function Hint({ label }: { label: string }) {
  return (
    <li className="rounded-md border border-border bg-panel/60 backdrop-blur-sm px-3 py-2 text-secondary text-muted-foreground">
      {label}
    </li>
  );
}
