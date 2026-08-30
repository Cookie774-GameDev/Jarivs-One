export type InstantCommandRolloutDecision = Readonly<{
  mode: 'shadow' | 'enabled';
  execute: boolean;
  localComparison: Readonly<{ commandId?: string; matched: boolean }>;
}>;

export function decideInstantCommandRollout(input: {
  featureEnabled: boolean;
  accountEnabled: boolean;
  matchedCommandId?: string;
}): InstantCommandRolloutDecision {
  const enabled = input.featureEnabled && input.accountEnabled;
  return {
    mode: enabled ? 'enabled' : 'shadow',
    execute: enabled,
    localComparison: {
      ...(input.matchedCommandId ? { commandId: input.matchedCommandId } : {}),
      matched: Boolean(input.matchedCommandId),
    },
  };
}
