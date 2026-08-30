import { describe, expect, it } from 'vitest';
import { decideInstantCommandRollout } from './rollout';

describe('instantCommandCatalogV2 rollout', () => {
  it('shadow-classifies without execution until the account is enabled', () => {
    expect(
      decideInstantCommandRollout({
        featureEnabled: false,
        accountEnabled: false,
        matchedCommandId: 'page.open',
      }),
    ).toEqual({
      mode: 'shadow',
      execute: false,
      localComparison: { commandId: 'page.open', matched: true },
    });
    expect(
      decideInstantCommandRollout({
        featureEnabled: true,
        accountEnabled: true,
        matchedCommandId: 'page.open',
      }),
    ).toEqual({
      mode: 'enabled',
      execute: true,
      localComparison: { commandId: 'page.open', matched: true },
    });
  });

  it('records no raw command content', () => {
    expect(
      Object.keys(decideInstantCommandRollout({ featureEnabled: false, accountEnabled: false })),
    ).not.toContain('source');
  });
});
