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

const MAX_COMMAND_ID_LENGTH = 128;

function canonicalCommandId(value: unknown): string | undefined {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_COMMAND_ID_LENGTH &&
    /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u.test(value)
    ? value
    : undefined;
}

export function decideInstantCommandRollout(input: {
  featureEnabled: boolean;
  accountEnabled: boolean;
  matchedCommandId?: string;
  legacyMatchedCommandId?: string;
  authorityAvailable: boolean;
  hardGatesPassed: boolean;
}): InstantCommandRolloutDecision {
  const matchedCommandId = canonicalCommandId(input.matchedCommandId);
  const legacyMatchedCommandId = canonicalCommandId(input.legacyMatchedCommandId);
  const catalogMatched = matchedCommandId !== undefined;
  const legacyMatched = legacyMatchedCommandId !== undefined;
  const agreement =
    catalogMatched && legacyMatched
      ? matchedCommandId === legacyMatchedCommandId
        ? 'same'
        : 'different'
      : catalogMatched
        ? 'catalog_only'
        : legacyMatched
          ? 'legacy_only'
          : 'none';
  const blocker = !catalogMatched
    ? 'unmatched'
    : input.featureEnabled !== true || input.accountEnabled !== true
      ? 'rollout_disabled'
      : input.authorityAvailable !== true
        ? 'unavailable'
        : input.hardGatesPassed !== true
          ? 'hard_gates'
          : undefined;
  const execute = blocker === undefined;
  const localComparison = Object.freeze({
    ...(matchedCommandId ? { commandId: matchedCommandId } : {}),
    ...(legacyMatchedCommandId ? { legacyCommandId: legacyMatchedCommandId } : {}),
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
