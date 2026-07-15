/**
 * Pure product-tutorial state machine.
 *
 * Persistence uses {@link ProductTutorialStatus}:
 * - `null` — legacy / never offered (do not force tour)
 * - `pending` — first-run offer should appear after workspace entry
 * - `skipped` | `completed` — do not re-offer on relaunch
 *
 * Runtime phase/step live in the tour host; these helpers stay unit-testable
 * without mounting React.
 */
import type { Route } from '@/stores/ui';

export type ProductTutorialStatus = 'pending' | 'skipped' | 'completed' | null;

export type TutorialStepId =
  | 'chat-actions'
  | 'schedule'
  | 'talk-respond'
  | 'context-map'
  | 'agents-skills-settings';

export interface TutorialStepDef {
  id: TutorialStepId;
  /** 1-based index for UI copy */
  number: number;
  title: string;
  body: string;
  /** Primary CTA label on the coach card */
  cta: string;
  /** Optional secondary action label (interactive steps) */
  actionLabel?: string;
  /** Workspace route to open when the step becomes active */
  route: Route;
  /** Optional overlay to open (settings modal, actions palette) */
  open?: 'settings' | 'actions';
  /** CSS selector for spotlight target (`[data-tour="…"]`) */
  target: string;
  /** Surfaces this step teaches (for tests + docs) */
  surfaces: readonly string[];
}

/** Exactly five guided steps covering the main product surfaces. */
export const TUTORIAL_STEPS: readonly TutorialStepDef[] = [
  {
    id: 'chat-actions',
    number: 1,
    title: 'Chat with Jarvis & take action',
    body: 'This is your home base. Type in the composer, use slash commands, and open Actions (⌘⇧A) for quick tools — schedule, files, terminals, and more.',
    cta: 'Next',
    actionLabel: 'Peek at Actions',
    route: 'chat',
    open: 'actions',
    target: '[data-tour="chat-composer"]',
    surfaces: ['chat', 'composer', 'actions'],
  },
  {
    id: 'schedule',
    number: 2,
    title: 'Schedule with Jarvis',
    body: 'Plan events, reminders, and Jarvis-run schedules. Keep your day in one place — Jarvis can fire tasks on time so you stay in flow.',
    cta: 'Next',
    route: 'schedule',
    target: '[data-tour="schedule"]',
    surfaces: ['schedule', 'reminders'],
  },
  {
    id: 'talk-respond',
    number: 3,
    title: 'Talk to Jarvis — he talks back',
    body: 'Send a message (or try a sample) and watch Jarvis reply. Voice works too — say “Hey Jarvis” once mic access is ready. No API key needed for this demo.',
    cta: 'Next',
    actionLabel: 'Send sample message',
    route: 'chat',
    target: '[data-tour="chat-thread"]',
    surfaces: ['chat', 'voice', 'response'],
  },
  {
    id: 'context-map',
    number: 4,
    title: 'Context map — your project brain',
    body: 'Pin folders, maps, and files so Jarvis always knows your workspace. Context keeps long projects coherent across chats and agents.',
    cta: 'Next',
    route: 'context',
    target: '[data-tour="context"]',
    surfaces: ['context', 'context-map', 'files'],
  },
  {
    id: 'agents-skills-settings',
    number: 5,
    title: 'Agents, skills & settings',
    body: 'Spin up custom agents, equip skills, and tune Settings (providers, voice, theme). This is where VibeSpace becomes *yours*.',
    cta: 'Finish tour',
    actionLabel: 'Open Settings',
    route: 'agents',
    open: 'settings',
    target: '[data-tour="agents"]',
    surfaces: ['agents', 'skills', 'settings'],
  },
] as const;

export const TUTORIAL_STEP_COUNT = TUTORIAL_STEPS.length;

export function shouldOfferTutorial(status: ProductTutorialStatus): boolean {
  return status === 'pending';
}

export function isTutorialFinished(status: ProductTutorialStatus): boolean {
  return status === 'skipped' || status === 'completed';
}

/** Status after the user declines the offer. */
export function skipTutorial(): ProductTutorialStatus {
  return 'skipped';
}

/** Status after the user finishes the last step. */
export function completeTutorial(): ProductTutorialStatus {
  return 'completed';
}

/**
 * Status when setup onboarding finishes for a brand-new user.
 * Preserves skip/complete if already set; only upgrades `null` → `pending`.
 */
export function markTutorialPending(
  current: ProductTutorialStatus,
): ProductTutorialStatus {
  if (current === 'skipped' || current === 'completed' || current === 'pending') {
    return current;
  }
  return 'pending';
}

export function getStep(index: number): TutorialStepDef | null {
  if (index < 0 || index >= TUTORIAL_STEPS.length) return null;
  return TUTORIAL_STEPS[index] ?? null;
}

export function isLastStep(index: number): boolean {
  return index >= TUTORIAL_STEPS.length - 1;
}

/** Advance step index; returns next index or `null` if tour should complete. */
export function advanceStep(index: number): number | null {
  if (isLastStep(index)) return null;
  return index + 1;
}

export function clampStepIndex(index: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, Math.floor(index)));
}

/** Surfaces covered by the full tour (union of all steps). */
export function allTutorialSurfaces(): string[] {
  const set = new Set<string>();
  for (const step of TUTORIAL_STEPS) {
    for (const s of step.surfaces) set.add(s);
  }
  return [...set].sort();
}

/**
 * Tailwind z-index class for the tour shell.
 *
 * Settings + Actions palette use Radix Dialog at `z-50`. The tour dim is
 * normally above the app (`z-[90]`), but must drop below those dialogs when
 * the user peeks Actions / opens Settings mid-tour so the modal is visible
 * and focus-trappable.
 */
export function tourShellZClass(opts: {
  settingsOpen: boolean;
  actionsOpen: boolean;
}): 'z-40' | 'z-[90]' {
  if (opts.settingsOpen || opts.actionsOpen) return 'z-40';
  return 'z-[90]';
}

/** True when a product modal opened from the tour should sit above the tour. */
export function tourYieldsToProductModal(opts: {
  settingsOpen: boolean;
  actionsOpen: boolean;
}): boolean {
  return opts.settingsOpen || opts.actionsOpen;
}
