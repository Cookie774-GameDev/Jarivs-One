import { motion, type Transition } from 'motion/react';
import { Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useThemeMotionTransition } from '@/features/appearance/themeMotion';
import { CURRENT_VERSION } from '@/features/whats-new/releases';

interface WelcomeProps {
  onNext: () => void;
}
const LEGACY_WELCOME_TRANSITION = Object.freeze({
  type: 'spring',
  stiffness: 220,
  damping: 28,
} as const) satisfies Transition;

export function Welcome({ onNext }: WelcomeProps) {
  const welcomeTransition = useThemeMotionTransition(LEGACY_WELCOME_TRANSITION);
  return (
    <div className="relative h-full w-full flex items-center justify-center bg-aurora-gradient overflow-hidden">
      {/* Soft aurora pulse */}
      <div className="absolute inset-0 pointer-events-none animate-aurora opacity-80 bg-aurora-gradient" />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={welcomeTransition}
        className="relative z-10 flex flex-col items-center text-center max-w-xl px-8 gap-6"
      >
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-elevated/60 backdrop-blur-sm px-3 py-1 text-metadata text-muted-foreground">
          <Sparkles className="h-3 w-3 text-accent-cyan" />
          VibeSpace v{CURRENT_VERSION}
        </span>

        <h1 className="text-hero leading-tight">
          Meet <span className="text-accent-gradient">Jarvis</span>
        </h1>

        <p className="text-body text-muted-foreground max-w-md">
          Your assistant inside VibeSpace — a keyboard-first council of agents. Local by default,
          cloud when you want it. Voice when your hands are full.
        </p>

        <Button variant="accent" size="lg" onClick={onNext} className="mt-4">
          Get started
          <ArrowRight className="h-4 w-4" />
        </Button>

        <p className="text-metadata text-muted-foreground">Five quick steps. Less than a minute.</p>
      </motion.div>
    </div>
  );
}
