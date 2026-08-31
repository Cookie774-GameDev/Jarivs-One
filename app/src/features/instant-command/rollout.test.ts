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
      blocker: 'rollout_disabled',
      localComparison: { commandId: 'page.open', matched: true, agreement: 'catalog_only' },
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
      localComparison: { commandId: 'page.open', matched: true, agreement: 'catalog_only' },
    });
  });

  it.each([
    ['unmatched', {}, 'unmatched'],
    [
      'authority unavailable',
      { matchedCommandId: 'page.open', authorityAvailable: false },
      'unavailable',
    ],
    [
      'hard gates incomplete',
      { matchedCommandId: 'page.open', hardGatesPassed: false },
      'hard_gates',
    ],
  ])('fails closed for %s input', (_label, overrides, blocker) => {
    expect(
      decideInstantCommandRollout({
        featureEnabled: true,
        accountEnabled: true,
        ...overrides,
      }),
    ).toMatchObject({ mode: 'shadow', execute: false, blocker });
  });

  it.each([
    ['same', 'page.open', 'page.open'],
    ['different', 'page.open', 'settings.open'],
    ['catalog_only', 'page.open', undefined],
    ['legacy_only', undefined, 'page.open'],
    ['none', undefined, undefined],
  ] as const)(
    'compares catalog and legacy stable IDs as %s without content',
    (agreement, catalog, legacy) => {
      const decision = decideInstantCommandRollout({
        featureEnabled: true,
        accountEnabled: true,
        matchedCommandId: catalog,
        legacyMatchedCommandId: legacy,
      });
      expect(decision.localComparison.agreement).toBe(agreement);
      expect(JSON.stringify(decision)).not.toMatch(/source|raw|accountId|workspaceId/iu);
      expect(Object.isFrozen(decision)).toBe(true);
      expect(Object.isFrozen(decision.localComparison)).toBe(true);
    },
  );

  it('records no raw command content', () => {
    expect(
      Object.keys(decideInstantCommandRollout({ featureEnabled: false, accountEnabled: false })),
    ).not.toContain('source');
  });
});
