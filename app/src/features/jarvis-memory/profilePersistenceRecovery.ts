import type { LearningFileResult } from './learningFile';

const EMPTY_LEARNING = '# Jarvis Learning\n\nNo saved learning yet.\n';

export async function reconcileDurableProfile(input: {
  load: () => Promise<string | LearningFileResult | null>;
  isCurrent: () => boolean;
  apply: (markdown: string) => boolean;
}): Promise<'reconciled' | 'stale'> {
  const loaded = await input.load();
  if (!input.isCurrent()) return 'stale';
  const markdown = (typeof loaded === 'string' ? loaded : loaded?.markdown) ?? EMPTY_LEARNING;
  if (!markdown.startsWith('# Jarvis Learning\n') || markdown.length > 512 * 1024) {
    throw new Error('memory_profile_recovery_invalid');
  }
  if (!input.apply(markdown)) throw new Error('memory_profile_recovery_rejected');
  return 'reconciled';
}
