import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, Check, Lock, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { HiveModelIcon } from '@/components/brand';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/stores/auth';
import { useAppAdmin } from '@/lib/admin';
import { effectivePlan } from '@/lib/entitlements';
import { selectionFromHive } from '@/lib/ai/modelSelection';
import { cn } from '@/lib/utils';

/** Plans that may use hosted Hive Balance. Free + BYOK users must supply their own keys. */
const HOSTED_HIVE_PLANS = new Set(['starter', 'pro', 'ultra', 'apex']);

/** The public Hive Balance pipeline — names + role only. No keys, no routing internals. */
const PIPELINE: ReadonlyArray<readonly [string, string]> = [
  ['Gemini 3.5 Flash High', 'Drafts a fast, accurate first answer'],
  ['MiniMax-M3', 'Cross-checks the reasoning'],
  ['GLM-5.2', 'Adds a diverse second perspective'],
  ['DeepSeek V4 Pro Max', 'Hardens logic and code'],
  ['GPT-5.4 mini', 'Polishes the final reply'],
];

const HIGHLIGHTS: ReadonlyArray<{ icon: React.ReactNode; label: string; detail: string }> = [
  {
    icon: <Zap className="h-4 w-4 text-accent-copper" />,
    label: 'Five models, one answer',
    detail: 'Each reply is drafted, reviewed, and polished by a different frontier model.',
  },
  {
    icon: <ShieldCheck className="h-4 w-4 text-accent-sage" />,
    label: 'Chat only',
    detail: 'Hive runs in Jarvis chat. Terminals and agents keep their own models.',
  },
  {
    icon: <Sparkles className="h-4 w-4 text-accent-copper" />,
    label: 'Balanced for quality',
    detail: 'Tuned for the best mix of accuracy, reasoning, and speed.',
  },
];

export function Hive() {
  const currentPlan = useAuthStore((s) => s.plan);
  const admin = useAppAdmin();
  const chatModelSelection = useAuthStore((s) => s.chatModelSelection);
  const setChatModelSelection = useAuthStore((s) => s.setChatModelSelection);

  const activePlan = effectivePlan(currentPlan, admin);
  const hasHostedHive = admin || HOSTED_HIVE_PLANS.has(activePlan);
  const isActive = chatModelSelection.mode === 'hive';

  const [burst, setBurst] = React.useState(false);

  const activate = () => {
    if (!hasHostedHive) {
      window.dispatchEvent(
        new CustomEvent('jarvis:settings:tab', { detail: { tab: 'plans' } }),
      );
      return;
    }
    if (!isActive) {
      setBurst(true);
      window.setTimeout(() => setBurst(false), 1100);
    }
    setChatModelSelection(selectionFromHive('balanced'));
  };

  return (
    <div className="relative -m-4 overflow-hidden rounded-[28px] bg-[radial-gradient(circle_at_top_left,rgba(217,119,87,0.22),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.16),transparent_40%),linear-gradient(180deg,rgba(15,23,42,0.45),transparent)] p-4">
      <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(115deg,transparent,rgba(255,255,255,0.04),transparent)]" />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <header className="relative overflow-hidden rounded-3xl border border-accent-copper/25 bg-slate-950 px-6 py-7 shadow-2xl">
        <div className="absolute inset-0 bg-[linear-gradient(115deg,transparent,rgba(217,119,87,0.14),transparent)] animate-[plan-border-flow_9s_linear_infinite] bg-[length:220%_auto]" />
        <motion.div
          aria-hidden
          className="absolute -right-24 -top-24 h-60 w-60 rounded-full bg-orange-400/20 blur-3xl"
          animate={{ scale: [1, 1.12, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          aria-hidden
          className="absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-blue-500/15 blur-3xl"
          animate={{ scale: [1.1, 1, 1.1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="relative z-10 flex flex-col gap-3">
          <Badge className="w-fit border-accent-copper/40 bg-accent-copper/10 text-accent-copper">
            <HiveModelIcon size={16} className="mr-1" /> Chat model
          </Badge>
          <div className="flex items-center gap-4">
            <motion.div
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
            >
              <HiveModelIcon size={64} />
            </motion.div>
            <div>
              <h2 className="font-display text-page-title text-white">Hive</h2>
              <p className="text-secondary text-slate-300">A five-model ensemble for your chats</p>
            </div>
          </div>
          <p className="max-w-2xl text-secondary leading-relaxed text-slate-300">
            Hive sends your message through five top models in sequence — one drafts, the next
            review and refine, and the last one polishes. You get a single, stronger answer than
            any one model alone. It runs only in Jarvis chat.
          </p>
        </div>
      </header>

      {/* ── Highlights ──────────────────────────────────────── */}
      <section className="relative z-10 mt-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
        {HIGHLIGHTS.map((h, i) => (
          <motion.div
            key={h.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i, type: 'spring', stiffness: 200, damping: 24 }}
            className="rounded-2xl border border-border bg-panel/80 p-4 shadow-soft"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background/70">
              {h.icon}
            </span>
            <p className="mt-2 font-display text-ui-strong text-foreground">{h.label}</p>
            <p className="mt-1 text-secondary text-muted-foreground">{h.detail}</p>
          </motion.div>
        ))}
      </section>

      {/* ── Activation card ─────────────────────────────────── */}
      <section className="relative z-10 mt-4">
        <motion.button
          type="button"
          onClick={activate}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.99 }}
          aria-label={
            isActive
              ? 'Hive is your active chat model'
              : hasHostedHive
                ? 'Use Hive for chat'
                : 'Upgrade to use Hive'
          }
          aria-pressed={isActive}
          className={cn(
            'group relative w-full overflow-hidden rounded-3xl border p-5 text-left shadow-soft transition-colors',
            isActive
              ? 'border-accent-copper/70 bg-accent-copper/[0.08] ring-2 ring-accent-copper/25'
              : 'border-border bg-panel/80 hover:border-accent-copper/50',
          )}
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-300 bg-[length:220%_auto] animate-[plan-border-flow_6s_linear_infinite]" />
          <div className="absolute inset-0 bg-gradient-to-br from-amber-400/10 to-orange-500/[0.06] opacity-70 transition-opacity group-hover:opacity-100" />

          <AnimatePresence>
            {burst ? (
              <motion.span
                key="burst"
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-3xl bg-accent-copper/15"
                initial={{ opacity: 0.85, scale: 0.96 }}
                animate={{ opacity: 0, scale: 1.06 }}
                transition={{ duration: 1 }}
              />
            ) : null}
          </AnimatePresence>

          <div className="relative flex items-center gap-4">
            <motion.div
              animate={burst ? { rotate: [0, -8, 8, 0], scale: [1, 1.15, 1] } : {}}
              transition={{ duration: 0.7 }}
            >
              <HiveModelIcon size={40} />
            </motion.div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-display text-ui-strong text-foreground">Hive Balance</span>
                <span className="rounded-full border border-border bg-background/70 px-2 py-0.5 font-mono text-[10px] text-accent-copper">
                  5 models
                </span>
              </div>
              <p className="mt-0.5 text-secondary text-muted-foreground">
                {isActive
                  ? 'Active in chat — pick another model anytime from the chat model menu.'
                  : hasHostedHive
                    ? 'Tap to make Hive your chat model.'
                    : 'Paid plan required — tap to upgrade.'}
              </p>
            </div>
            <span className="relative shrink-0">
              {isActive ? (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-copper/20 text-accent-copper"
                >
                  <Check className="h-4 w-4" />
                </motion.span>
              ) : hasHostedHive ? (
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/70 text-muted-foreground transition-colors group-hover:text-accent-copper">
                  <ArrowRight className="h-4 w-4" />
                </span>
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/70 text-muted-foreground">
                  <Lock className="h-4 w-4" />
                </span>
              )}
            </span>
          </div>
        </motion.button>
      </section>

      {/* ── How it works ────────────────────────────────────── */}
      <section className="relative z-10 mt-4 rounded-3xl border border-border bg-elevated/85 p-5 shadow-soft">
        <div className="mb-3 flex items-center gap-2">
          <HiveModelIcon size={26} />
          <h3 className="font-display text-ui-strong text-foreground">How a Hive reply is built</h3>
        </div>
        <ol className="space-y-2">
          {PIPELINE.map(([model, role], i) => (
            <motion.li
              key={model}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * i, type: 'spring', stiffness: 220, damping: 26 }}
              className="flex items-center gap-3 rounded-xl border border-border/60 bg-panel/60 px-3 py-2"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-copper/15 font-mono text-[11px] text-accent-copper">
                {i + 1}
              </span>
              <span className="min-w-0 font-medium text-foreground/90">{model}</span>
              <span className="ml-auto shrink-0 text-secondary text-muted-foreground">{role}</span>
            </motion.li>
          ))}
        </ol>
        <p className="mt-3 text-metadata text-muted-foreground">
          Each step refines the last. The final reply is the only thing you see in chat.
        </p>
      </section>
    </div>
  );
}

export default Hive;
