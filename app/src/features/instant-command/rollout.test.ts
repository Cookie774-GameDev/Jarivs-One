import { describe, expect, it } from 'vitest';
import { decideInstantCommandRollout } from './rollout';

describe('instantCommandCatalogV2 rollout', () => {
  it('shadow-classifies without execution until the account is enabled', () => {
    expect(
      decideInstantCommandRollout({
        featureEnabled: false,
        accountEnabled: false,
        matchedCommandId: 'page.open',
        authorityAvailable: false,
        hardGatesPassed: false,
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
        authorityAvailable: true,
        hardGatesPassed: true,
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
      { matchedCommandId: 'page.open', authorityAvailable: true, hardGatesPassed: false },
      'hard_gates',
    ],
  ])('fails closed for %s input', (_label, overrides, blocker) => {
    expect(
      decideInstantCommandRollout({
        featureEnabled: true,
        accountEnabled: true,
        authorityAvailable: false,
        hardGatesPassed: false,
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
        authorityAvailable: false,
        hardGatesPassed: false,
      });
      expect(decision.localComparison.agreement).toBe(agreement);
      expect(JSON.stringify(decision)).not.toMatch(/source|raw|accountId|workspaceId/iu);
      expect(Object.isFrozen(decision)).toBe(true);
      expect(Object.isFrozen(decision.localComparison)).toBe(true);
    },
  );

  it('records no raw command content', () => {
    expect(
      Object.keys(
        decideInstantCommandRollout({
          featureEnabled: false,
          accountEnabled: false,
          authorityAvailable: false,
          hardGatesPassed: false,
        }),
      ),
    ).not.toContain('source');
  });

  it('requires explicit authority and hard-gate truth before execution', () => {
    expect(
      decideInstantCommandRollout({
        featureEnabled: true,
        accountEnabled: true,
        matchedCommandId: 'page.open',
        hardGatesPassed: true,
      } as unknown as Parameters<typeof decideInstantCommandRollout>[0]),
    ).toMatchObject({ mode: 'shadow', execute: false, blocker: 'unavailable' });
    expect(
      decideInstantCommandRollout({
        featureEnabled: true,
        accountEnabled: true,
        matchedCommandId: 'page.open',
        authorityAvailable: true,
      } as unknown as Parameters<typeof decideInstantCommandRollout>[0]),
    ).toMatchObject({ mode: 'shadow', execute: false, blocker: 'hard_gates' });
  });

  it('does not coerce malformed runtime feature gates into enablement', () => {
    expect(
      decideInstantCommandRollout({
        featureEnabled: 'true',
        accountEnabled: true,
        matchedCommandId: 'page.open',
        authorityAvailable: true,
        hardGatesPassed: true,
      } as unknown as Parameters<typeof decideInstantCommandRollout>[0]),
    ).toMatchObject({ mode: 'shadow', execute: false, blocker: 'rollout_disabled' });
  });

  it.each([' page.open', 'page.open\nprivate', `page.${'x'.repeat(128)}`])(
    'rejects non-canonical command IDs without retaining them: %j',
    (matchedCommandId) => {
      const decision = decideInstantCommandRollout({
        featureEnabled: true,
        accountEnabled: true,
        matchedCommandId,
        legacyMatchedCommandId: ' legacy.open',
        authorityAvailable: true,
        hardGatesPassed: true,
      });

      expect(decision).toEqual({
        mode: 'shadow',
        execute: false,
        blocker: 'unmatched',
        localComparison: { matched: false, agreement: 'none' },
      });
      expect(JSON.stringify(decision)).not.toContain(matchedCommandId);
    },
  );
});
