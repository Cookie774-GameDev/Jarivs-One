/**
 * Interactive 5-step product tour — spotlight + animated coach card.
 */
import * as React from 'react';
import { motion, type Transition } from 'motion/react';
import {
  ArrowRight,
  Bot,
  CalendarDays,
  Check,
  Map as MapIcon,
  MessageSquare,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useThemeMotionLayout, useThemeMotionTransition } from '@/features/appearance/themeMotion';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui';
import {
  TUTORIAL_STEP_COUNT,
  advanceStep,
  clampStepIndex,
  completeTutorial,
  getStep,
  isLastStep,
  tourShellZClass,
  tourYieldsToProductModal,
  type TutorialStepDef,
} from './tutorialState';

interface ProductTutorialTourProps {
  onDone: () => void;
  onSkip: () => void;
}

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 10;
const LEGACY_TUTORIAL_TRANSITION = Object.freeze({
  type: 'spring',
  stiffness: 380,
  damping: 32,
  mass: 0.75,
} as const) satisfies Transition;

const STEP_ICONS: Record<string, React.ReactNode> = {
  'chat-actions': <MessageSquare className="h-5 w-5" />,
  schedule: <CalendarDays className="h-5 w-5" />,
  'talk-respond': <Sparkles className="h-5 w-5" />,
  'context-map': <MapIcon className="h-5 w-5" />,
  'agents-skills-settings': <Bot className="h-5 w-5" />,
};

export function ProductTutorialTour({ onDone, onSkip }: ProductTutorialTourProps) {
  const tutorialTransition = useThemeMotionTransition(LEGACY_TUTORIAL_TRANSITION);
  const progressLayout = useThemeMotionLayout(true);
  const setRoute = useUIStore((s) => s.setRoute);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const setActionsPaletteOpen = useUIStore((s) => s.setActionsPaletteOpen);
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const actionsOpen = useUIStore((s) => s.actionsPaletteOpen);
  const yieldsToModal = tourYieldsToProductModal({
    settingsOpen,
    actionsOpen,
  });
  const shellZ = tourShellZClass({ settingsOpen, actionsOpen });

  const [stepIndex, setStepIndex] = React.useState(0);
  const [rect, setRect] = React.useState<SpotlightRect | null>(null);
  const [demoMessages, setDemoMessages] = React.useState<
    Array<{ role: 'user' | 'assistant'; text: string }>
  >([]);
  const [demoTyping, setDemoTyping] = React.useState(false);

  const step = getStep(stepIndex)!;

  // Navigate + optional overlays when step changes
  React.useEffect(() => {
    const s = getStep(stepIndex);
    if (!s) return;
    setRoute(s.route);
    // Close overlays when leaving steps that opened them
    if (s.open !== 'settings') setSettingsOpen(false);
    if (s.open !== 'actions') setActionsPaletteOpen(false);
    // Small delay so route content paints before we measure spotlight
    const t = window.setTimeout(() => measureTarget(s), 120);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  React.useEffect(() => {
    const onResize = () => {
      const s = getStep(stepIndex);
      if (s) measureTarget(s);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [stepIndex]);

  function measureTarget(s: TutorialStepDef) {
    try {
      const el = document.querySelector(s.target) as HTMLElement | null;
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) {
        setRect(null);
        return;
      }
      setRect({
        top: Math.max(8, r.top - PAD),
        left: Math.max(8, r.left - PAD),
        width: Math.min(window.innerWidth - 16, r.width + PAD * 2),
        height: Math.min(window.innerHeight - 16, r.height + PAD * 2),
      });
    } catch {
      setRect(null);
    }
  }

  function handleNext() {
    setActionsPaletteOpen(false);
    setSettingsOpen(false);
    if (isLastStep(stepIndex)) {
      useUIStore.getState().setProductTutorialStatus(completeTutorial());
      onDone();
      return;
    }
    const next = advanceStep(stepIndex);
    if (next == null) {
      useUIStore.getState().setProductTutorialStatus(completeTutorial());
      onDone();
      return;
    }
    setStepIndex(clampStepIndex(next));
  }

  function handleSkip() {
    setActionsPaletteOpen(false);
    setSettingsOpen(false);
    onSkip();
  }

  function handleStepAction() {
    const s = getStep(stepIndex);
    if (!s) return;
    if (s.id === 'chat-actions') {
      setActionsPaletteOpen(true);
      return;
    }
    if (s.id === 'agents-skills-settings') {
      setSettingsOpen(true);
      return;
    }
    if (s.id === 'talk-respond') {
      runTalkDemo();
    }
  }

  function runTalkDemo() {
    if (demoTyping) return;
    setDemoMessages([{ role: 'user', text: 'Hey Jarvis — what can you help me with today?' }]);
    setDemoTyping(true);
    window.setTimeout(() => {
      setDemoMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: "I'm right here. Chat, schedule, agents, context maps, skills — pick a vibe and I'll roll with you.",
        },
      ]);
      setDemoTyping(false);
    }, 900);
  }

  // Position coach card: prefer right of spotlight, else center-bottom
  const cardStyle = React.useMemo((): React.CSSProperties => {
    if (!rect) {
      return {
        left: '50%',
        top: 'auto',
        bottom: 48,
        transform: 'translateX(-50%)',
      };
    }
    const cardW = 400;
    const preferRight = rect.left + rect.width + 24 + cardW < window.innerWidth;
    if (preferRight) {
      return {
        left: rect.left + rect.width + 20,
        top: Math.min(rect.top, window.innerHeight - 360),
        transform: 'none',
      };
    }
    const preferLeft = rect.left - 24 - cardW > 0;
    if (preferLeft) {
      return {
        left: rect.left - cardW - 20,
        top: Math.min(rect.top, window.innerHeight - 360),
        transform: 'none',
      };
    }
    return {
      left: '50%',
      top: Math.min(rect.top + rect.height + 16, window.innerHeight - 320),
      transform: 'translateX(-50%)',
    };
  }, [rect]);

  return (
    <div
      className={cn('fixed inset-0', shellZ)}
      role="dialog"
      aria-modal={!yieldsToModal}
      aria-label={`VibeSpace tutorial step ${step.number} of ${TUTORIAL_STEP_COUNT}`}
      data-product-tutorial="tour"
      data-tutorial-yields-modal={yieldsToModal ? 'true' : 'false'}
      data-tutorial-z={shellZ}
    >
      {/* Dim + spotlight — pointer-events off while a product modal is on top */}
      <div
        className={cn(
          'absolute inset-0 bg-background/55 backdrop-blur-[2px]',
          yieldsToModal && 'pointer-events-none opacity-40',
        )}
        onClick={(e) => e.stopPropagation()}
        aria-hidden={yieldsToModal}
      />
      {rect && !yieldsToModal && (
        <motion.div
          key={`spot-${step.id}`}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={tutorialTransition}
          className="pointer-events-none absolute rounded-xl"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow:
              '0 0 0 9999px hsl(var(--background) / 0.62), 0 0 0 2px hsl(var(--accent-copper) / 0.85), 0 0 40px 4px hsl(var(--accent-copper) / 0.35)',
            zIndex: 1,
          }}
        />
      )}

      <motion.div
        key={step.id}
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={tutorialTransition}
        className={cn(
          'fixed w-[min(400px,calc(100vw-2rem))]',
          'rounded-2xl border border-accent-copper/30 bg-panel/95 backdrop-blur-md',
          'shadow-[0_24px_80px_-20px_hsl(var(--accent-copper)/0.45),0_8px_32px_-8px_rgba(0,0,0,0.5)]',
          'p-5 flex flex-col gap-4',
          // Keep coach card usable under the modal stack (z-40 shell; card relative)
          yieldsToModal && 'opacity-0 pointer-events-none',
        )}
        style={{ ...cardStyle, zIndex: 2 }}
        data-tutorial-step={step.id}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-xl',
                'bg-accent-gradient text-white shadow-[0_0_24px_-6px_hsl(var(--accent-copper)/0.7)]',
              )}
            >
              {STEP_ICONS[step.id] ?? <Sparkles className="h-5 w-5" />}
            </span>
            <div>
              <div className="text-metadata uppercase tracking-wider text-accent-copper">
                Step {step.number} of {TUTORIAL_STEP_COUNT}
              </div>
              <h2 className="text-page-title text-foreground leading-tight">{step.title}</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSkip}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Skip tutorial"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-body text-muted-foreground leading-relaxed">{step.body}</p>

        {/* Progress pills */}
        <div className="flex items-center gap-1.5" aria-hidden>
          {Array.from({ length: TUTORIAL_STEP_COUNT }, (_, i) => (
            <motion.span
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-colors',
                i === stepIndex
                  ? 'w-6 bg-accent-copper'
                  : i < stepIndex
                    ? 'w-3 bg-accent-copper/50'
                    : 'w-3 bg-muted',
              )}
              layout={progressLayout}
            />
          ))}
        </div>

        {/* Interactive talk demo */}
        {step.id === 'talk-respond' && (
          <div className="rounded-xl border border-border bg-background/60 p-3 flex flex-col gap-2 min-h-[100px]">
            {demoMessages.length === 0 && !demoTyping && (
              <p className="text-metadata text-muted-foreground text-center py-4">
                Hit <span className="text-accent-copper">Send sample message</span> to see Jarvis
                reply.
              </p>
            )}
            {demoMessages.map((m, i) => (
              <motion.div
                key={`${m.role}-${i}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  'rounded-lg px-3 py-2 text-secondary max-w-[92%]',
                  m.role === 'user'
                    ? 'self-end bg-accent-copper/15 text-foreground'
                    : 'self-start bg-muted text-foreground',
                )}
              >
                {m.role === 'assistant' && (
                  <span className="block text-metadata text-accent-copper mb-0.5">Jarvis</span>
                )}
                {m.text}
              </motion.div>
            ))}
            {demoTyping && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="self-start rounded-lg bg-muted px-3 py-2 text-metadata text-muted-foreground"
              >
                Jarvis is typing…
              </motion.div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {step.actionLabel && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleStepAction}
              disabled={step.id === 'talk-respond' && demoTyping}
            >
              {step.id === 'agents-skills-settings' ? (
                <Settings className="h-3.5 w-3.5" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {step.actionLabel}
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={handleSkip}>
            Skip tour
          </Button>
          <Button variant="accent" size="sm" onClick={handleNext} data-tutorial-next="true">
            {isLastStep(stepIndex) ? (
              <>
                <Check className="h-3.5 w-3.5" />
                {step.cta}
              </>
            ) : (
              <>
                {step.cta}
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
