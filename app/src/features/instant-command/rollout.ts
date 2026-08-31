export type InstantCommandRolloutDecision = Readonly<{
  mode: 'shadow' | 'enabled';
  execute: boolean;
  blocker?: 'rollout_disabled' | 'unmatched' | 'unavailable' | 'hard_gates';
  localComparison: Readonly<{
    commandId?: string;
    legacyCommandId?: string;
    matched: boolean;
    agreement: 'same' | 'different' | 'catalog_only' | 'legacy_only' | 'none';
  }>;
}>;

export function decideInstantCommandRollout(input: {
  featureEnabled: boolean;
  accountEnabled: boolean;
  matchedCommandId?: string;
  legacyMatchedCommandId?: string;
  authorityAvailable?: boolean;
  hardGatesPassed?: boolean;
}): InstantCommandRolloutDecision {
  const catalogMatched = Boolean(input.matchedCommandId);
  const legacyMatched = Boolean(input.legacyMatchedCommandId);
  const agreement =
    catalogMatched && legacyMatched
      ? input.matchedCommandId === input.legacyMatchedCommandId
        ? 'same'
        : 'different'
      : catalogMatched
        ? 'catalog_only'
        : legacyMatched
          ? 'legacy_only'
          : 'none';
  const blocker = !catalogMatched
    ? 'unmatched'
    : !input.featureEnabled || !input.accountEnabled
      ? 'rollout_disabled'
      : input.authorityAvailable === false
        ? 'unavailable'
        : input.hardGatesPassed === false
          ? 'hard_gates'
          : undefined;
  const execute = blocker === undefined;
  const localComparison = Object.freeze({
    ...(input.matchedCommandId ? { commandId: input.matchedCommandId } : {}),
    ...(input.legacyMatchedCommandId ? { legacyCommandId: input.legacyMatchedCommandId } : {}),
    matched: catalogMatched,
    agreement,
  });
  return Object.freeze({
    mode: execute ? 'enabled' : 'shadow',
    execute,
    ...(blocker ? { blocker } : {}),
    localComparison,
  });
}
