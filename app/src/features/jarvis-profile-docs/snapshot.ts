import type { SnapshotItem, TokenBoundedSnapshot } from './types';

export function createTokenBoundedSnapshot(
  items: readonly SnapshotItem[],
  budgetTokens: number,
): TokenBoundedSnapshot {
  if (!Number.isSafeInteger(budgetTokens) || budgetTokens < 0) {
    throw new Error('Token budget must be a non-negative integer');
  }
  const included: SnapshotItem[] = [];
  const omitted: TokenBoundedSnapshot['omitted'] = [];
  let usedTokens = 0;

  for (const item of items) {
    if (!item.id.trim() || !Number.isSafeInteger(item.tokens) || item.tokens < 0) {
      throw new Error('Snapshot items require an id and a non-negative integer token count');
    }
    if (usedTokens + item.tokens <= budgetTokens) {
      included.push({ ...item });
      usedTokens += item.tokens;
    } else {
      omitted.push({ id: item.id, tokens: item.tokens, reason: 'token_budget' });
    }
  }

  return {
    budgetTokens,
    usedTokens,
    included,
    omitted,
    complete: omitted.length === 0,
  };
}
