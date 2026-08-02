import type { JarvisResponseMode } from '@/lib/jarvis/contracts';

export type JarvisCadenceMoment =
  | 'new_task_acknowledgement'
  | 'significant_completion'
  | 'important_warning'
  | 'deliberate_correction'
  | 'dry_humor'
  | 'routine_status';

export interface JarvisCadenceState {
  readonly previousReplyUsedSir: boolean;
  readonly previousReplyWasShort: boolean;
}

export interface JarvisCadenceContext {
  readonly mode: JarvisResponseMode;
  readonly moment?: JarvisCadenceMoment;
  readonly repeatedToolStream?: boolean;
  readonly errorBurst?: boolean;
}

export interface JarvisCadenceResult {
  readonly text: string;
  readonly usedSir: boolean;
  readonly state: Readonly<JarvisCadenceState>;
}

export const EMPTY_JARVIS_CADENCE_STATE: Readonly<JarvisCadenceState> = Object.freeze({
  previousReplyUsedSir: false,
  previousReplyWasShort: false,
});

const SHORT_REPLY_WORD_LIMIT = 12;

function wordCount(text: string): number {
  return text.trim().match(/\S+/gu)?.length ?? 0;
}

function withoutSir(text: string): string {
  return text
    .replace(/\s*,?\s*\bsir\b\s*,?/gi, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function insertSirOnce(text: string): string {
  const terminalIndex = text.search(/[.!?]/u);
  if (terminalIndex < 0) return `${text.replace(/[,\s]+$/u, '')}, sir.`;
  const clause = text.slice(0, terminalIndex).replace(/[,\s]+$/u, '');
  return `${clause}, sir${text.slice(terminalIndex)}`;
}

function shouldUseSir(
  context: Readonly<JarvisCadenceContext>,
  state: Readonly<JarvisCadenceState>,
  currentReplyIsShort: boolean,
): boolean {
  if (
    context.mode === 'long_form_delivery' ||
    context.mode === 'sensitive' ||
    context.moment === 'routine_status' ||
    context.repeatedToolStream ||
    context.errorBurst
  ) {
    return false;
  }

  const majorMoment =
    context.moment === 'significant_completion' || context.moment === 'important_warning';
  const preferredMoment =
    majorMoment ||
    context.moment === 'new_task_acknowledgement' ||
    context.moment === 'deliberate_correction' ||
    context.moment === 'dry_humor';
  if (!preferredMoment) return false;

  const consecutiveShortAddress =
    state.previousReplyUsedSir && state.previousReplyWasShort && currentReplyIsShort;
  return !consecutiveShortAddress || majorMoment;
}

export function applyJarvisAddressCadence(
  text: string,
  context: Readonly<JarvisCadenceContext>,
  state: Readonly<JarvisCadenceState> = EMPTY_JARVIS_CADENCE_STATE,
): Readonly<JarvisCadenceResult> {
  const normalized = withoutSir(text);
  const currentReplyIsShort = wordCount(normalized) <= SHORT_REPLY_WORD_LIMIT;
  const useSir = shouldUseSir(context, state, currentReplyIsShort);
  const nextState = Object.freeze({
    previousReplyUsedSir: useSir,
    previousReplyWasShort: currentReplyIsShort,
  });

  return Object.freeze({
    text: useSir ? insertSirOnce(normalized) : normalized,
    usedSir: useSir,
    state: nextState,
  });
}
