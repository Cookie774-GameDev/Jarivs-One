/**
 * First-run choice: take the 5-step product tour or skip it.
 */
import { motion } from 'motion/react';
import {
  Bot,
  CalendarDays,
import { useThemeMotionTransition } from '@/features/appearance/themeMotion';
  Map as MapIcon,
  MessageSquare,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ProductTutorialOfferProps {
  onStart: () => void;
  onSkip: () => void;
}

const spring = { type: 'spring' as const, stiffness: 320, damping: 28, mass: 0.8 };

const HIGHLIGHTS = [
  { icon: MessageSquare, label: 'Chat & actions' },
  const reducedMotion = useReducedMotion();
  const themeMotionTransition = useThemeMotionTransition(spring);

  { icon: CalendarDays, label: 'Scheduling' },
  { icon: Sparkles, label: 'Talk & replies' },
  { icon: MapIcon, label: 'Context map' },
  { icon: Bot, label: 'Agents & skills' },
] as const;

export function ProductTutorialOffer({ onStart, onSkip }: ProductTutorialOfferProps) {
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-6 bg-background/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-tutorial-offer-title"
      data-product-tutorial="offer"
    >
      {/* Soft copper aurora behind the card */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% 40%, hsl(var(--accent-copper) / 0.18), transparent 70%), radial-gradient(ellipse 40% 30% at 70% 60%, hsl(var(--accent-cyan) / 0.1), transparent 70%)',
        }}
      />

      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: 28, scale: 0.94 }}
        animate={reducedMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
        transition={themeMotionTransition}
        className={cn(
          'relative w-full max-w-lg rounded-2xl border border-accent-copper/25',
          'bg-panel/95 backdrop-blur-md p-7 sm:p-8',
          'shadow-[0_32px_100px_-24px_hsl(var(--accent-copper)/0.4),0_12px_40px_-12px_rgba(0,0,0,0.55)]',
        )}
      >
        <motion.div
          initial={reducedMotion ? false : { scale: 0.6, opacity: 0 }}
          animate={reducedMotion ? undefined : { scale: 1, opacity: 1 }}
          transition={
            reducedMotion ? themeMotionTransition : { ...themeMotionTransition, delay: 0.08 }
          }
          className={cn(
            'mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl',
            'bg-accent-gradient text-white',
            'shadow-[0_0_40px_-8px_hsl(var(--accent-copper)/0.75)]',
            'animate-breathe',
          )}
        >
          <Wand2 className="h-8 w-8" strokeWidth={1.5} />
        </motion.div>

        <h1
          id="product-tutorial-offer-title"
          className="text-center font-display text-3xl font-semibold text-foreground leading-tight"
        >
          Quick tour?
        </h1>
        <p className="mt-3 text-center text-body text-muted-foreground max-w-md mx-auto">
          Five easy steps. Chat with Jarvis, schedule, hear him reply, explore
          the context map, and set up agents, skills, and settings.
        </p>

        <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {HIGHLIGHTS.map((h, i) => (
            <motion.li
              key={h.label}
              initial={reducedMotion ? false : { opacity: 0, x: -8 }}
              animate={reducedMotion ? undefined : { opacity: 1, x: 0 }}
              transition={
                reducedMotion
                  ? themeMotionTransition
                  : { ...themeMotionTransition, delay: 0.12 + i * 0.05 }
              }
              className="flex items-center gap-2.5 rounded-lg border border-border/80 bg-background/50 px-3 py-2 text-secondary text-foreground"
            >
              <h.icon className="h-4 w-4 text-accent-copper shrink-0" />
              {h.label}
            </motion.li>
          ))}
        </ul>

        <div className="mt-7 flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 sm:justify-end">
          <Button variant="ghost" size="lg" onClick={onSkip} data-tutorial-skip="true">
            No thanks — skip
          </Button>
          <Button variant="accent" size="lg" onClick={onStart} data-tutorial-start="true">
            <Sparkles className="h-4 w-4" />
            Do the tutorial
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
