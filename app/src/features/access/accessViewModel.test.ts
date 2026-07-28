import { describe, expect, it } from 'vitest';
import { evaluateAppAccess } from './accessPolicy';
import type { AccessHostSnapshot } from './AccessHost';
import {
  ACCESS_UI_MAX_DAYS,
  ACCESS_UI_MAX_TIER_LENGTH,
  AccessViewModelError,
  DEFAULT_FEATURE_TIER,
  createAccessViewModel,
  type AccessViewModelErrorCode,
} from './accessViewModel';

const NOW = 1_750_000_000_000;
const DAY = 86_400_000;
const iso = (ms: number): string => new Date(ms).toISOString();

const enabledConfig = {
  enabled: true,
  minVersion: null,
  rollbackEnabled: false,
  trial: { enabled: true, days: 30 },
  payment: {
    graceDays: 3,
    checkoutUrl: 'https://checkout.example',
    portalUrl: 'https://portal.example',
  },
};

/** Produce an authoritative response through the accepted entitlement authority. */
const ev = (status: Record<string, unknown>, config: unknown = enabledConfig) =>
  evaluateAppAccess({ config, status: { serverTime: iso(NOW), ...status }, appVersion: '1.2.3' });

const responses = {
  prelaunch: ev({ state: 'active' }, { ...enabledConfig, enabled: false }),
  admin: ev({ state: 'admin' }),
  internal: ev({ state: 'internal' }),
  active: ev({ state: 'active' }),
  trialingFar: ev({ state: 'trialing', trialStartedAt: iso(NOW), verifiedAccount: true }),
  trialingNear: ev({
    state: 'trialing',
    trialStartedAt: iso(NOW - 25 * DAY),
    verifiedAccount: true,
  }),
  cancelNear: ev({ state: 'cancel_at_period_end', periodEndsAt: iso(NOW + 5 * DAY) }),
  cancelFar: ev({ state: 'cancel_at_period_end', periodEndsAt: iso(NOW + 20 * DAY) }),
  pastDueImmediate: ev({ state: 'past_due' }),
  pastDueGrace: ev({ state: 'past_due', graceStartedAt: iso(NOW - DAY) }),
  grace: ev({ state: 'grace', graceStartedAt: iso(NOW - DAY) }),
  locked: ev({ state: 'locked' }),
  lockedFromGrace: ev({ state: 'grace', graceStartedAt: iso(NOW - 10 * DAY) }),
  unknownNoTime: evaluateAppAccess({ config: enabledConfig, status: { state: 'active' } }),
  unknownBadState: ev({ state: 'bogus' }),
};

const dates = {
  trialEndsAt: '2026-08-01',
  paidThroughDate: '2026-09-01T00:00:00Z',
  graceEndsAt: '2026-07-30T12:00:00+00:00',
};

function expectCode(fn: () => unknown, code: AccessViewModelErrorCode): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AccessViewModelError);
    expect((error as AccessViewModelError).code).toBe(code);
    return;
  }
  throw new Error(`Expected AccessViewModelError with code "${code}" but no error was thrown.`);
}

describe('authority fixtures (guard against fixture drift)', () => {
  it('produces the expected authoritative decisions', () => {
    expect(responses.prelaunch.state).toBe('prelaunch');
    expect(responses.prelaunch.appAccessGranted).toBe(true);
    expect(responses.admin.state).toBe('admin');
    expect(responses.admin.appAccessGranted).toBe(true);
    expect(responses.internal.state).toBe('internal');
    expect(responses.active.state).toBe('active');
    expect(responses.trialingFar.warning).toBeNull();
    expect(responses.trialingFar.trialDaysRemaining).toBe(30);
    expect(responses.trialingNear.warning?.kind).toBe('trial_ending');
    expect(responses.trialingNear.trialDaysRemaining).toBe(5);
    expect(responses.cancelNear.warning?.kind).toBe('cancellation');
    expect(responses.cancelFar.warning).toBeNull();
    expect(responses.cancelFar.checkoutNeeded).toBe(true);
    expect(responses.pastDueImmediate.warning?.dedupeKey).toBe('payment:immediate');
    expect(responses.pastDueGrace.warning?.kind).toBe('payment');
    expect(responses.pastDueGrace.warning?.milestone).toBe(3);
    expect(responses.pastDueGrace.graceDaysRemaining).toBeNull();
    expect(responses.grace.warning?.kind).toBe('grace');
    expect(responses.grace.graceDaysRemaining).toBe(2);
    expect(responses.locked.state).toBe('locked');
    expect(responses.locked.appAccessGranted).toBe(false);
    expect(responses.locked.warning?.kind).toBe('locked');
    expect(responses.lockedFromGrace.state).toBe('locked');
    expect(responses.unknownNoTime.state).toBe('unknown');
    expect(responses.unknownNoTime.failClosed).toBe(true);
    expect(responses.unknownBadState.state).toBe('unknown');
  });
});

describe('state to display projection', () => {
  it('maps every usable state to its honest display and keeps usable true', () => {
    const usableCases: Array<[keyof typeof responses, string, string]> = [
      ['prelaunch', 'prelaunch', 'prelaunch'],
      ['trialingFar', 'trialing', 'trialing'],
      ['trialingNear', 'trialing', 'trialing'],
      ['active', 'active', 'active'],
      ['cancelNear', 'cancel-at-period-end', 'cancel_at_period_end'],
      ['cancelFar', 'cancel-at-period-end', 'cancel_at_period_end'],
      ['pastDueImmediate', 'past-due', 'past_due'],
      ['pastDueGrace', 'past-due', 'past_due'],
      ['grace', 'grace', 'grace'],
    ];
    for (const [key, display, state] of usableCases) {
      const vm = createAccessViewModel(responses[key]);
      expect(vm.displayState).toBe(display);
      expect(vm.state).toBe(state);
      expect(vm.usable).toBe(true);
      expect(vm.locked).toBe(false);
      expect(vm.failClosed).toBe(false);
    }
  });

  it('maps admin and internal to an honest usable active display', () => {
    for (const key of ['admin', 'internal'] as const) {
      const vm = createAccessViewModel(responses[key]);
      expect(vm.state).toBe(key);
      expect(vm.displayState).toBe('active');
      expect(vm.usable).toBe(true);
    }
  });

  it('fails closed for locked and unknown states', () => {
    const locked = createAccessViewModel(responses.locked);
    expect(locked.displayState).toBe('locked');
    expect(locked.usable).toBe(false);
    expect(locked.locked).toBe(true);
    const lockedFromGrace = createAccessViewModel(responses.lockedFromGrace);
    expect(lockedFromGrace.displayState).toBe('locked');
    expect(lockedFromGrace.usable).toBe(false);
    const unknown = createAccessViewModel(responses.unknownNoTime);
    expect(unknown.displayState).toBe('unknown');
    expect(unknown.usable).toBe(false);
    expect(unknown.failClosed).toBe(true);
    const unknownBadState = createAccessViewModel(responses.unknownBadState);
    expect(unknownBadState.displayState).toBe('unknown');
    expect(unknownBadState.usable).toBe(false);
  });
});

describe('host projection', () => {
  it('satisfies the AccessHostSnapshot contract', () => {
    const vm = createAccessViewModel(responses.active, { featureTier: 'pro', capturedAt: NOW });
    const snapshot: AccessHostSnapshot = vm.host;
    expect(snapshot).toEqual({
      displayState: 'active',
      featureTier: 'pro',
      usable: true,
      capturedAt: NOW,
    });
  });

  it('defaults featureTier to a non-empty sentinel and capturedAt to zero', () => {
    const vm = createAccessViewModel(responses.active);
    expect(vm.host.featureTier).toBe(DEFAULT_FEATURE_TIER);
    expect(vm.host.featureTier.length).toBeGreaterThan(0);
    expect(vm.host.capturedAt).toBe(0);
  });

  it('never emits the impossible grant the host blocks on', () => {
    for (const key of Object.keys(responses) as Array<keyof typeof responses>) {
      const snapshot = createAccessViewModel(responses[key]).host;
      const impossibleGrant =
        snapshot.usable &&
        (snapshot.displayState === 'locked' || snapshot.displayState === 'unknown');
      expect(impossibleGrant).toBe(false);
    }
  });
});

describe('immutability and purity', () => {
  it('deep-freezes every layer of the view model', () => {
    const vm = createAccessViewModel(responses.locked, { dates });
    expect(Object.isFrozen(vm)).toBe(true);
    expect(Object.isFrozen(vm.host)).toBe(true);
    expect(Object.isFrozen(vm.banner)).toBe(true);
    expect(Object.isFrozen(vm.paywall)).toBe(true);
    expect(Object.isFrozen(vm.capabilities)).toBe(true);
    expect(Object.isFrozen(vm.warning)).toBe(true);
    expect(Object.isFrozen(vm.featurePlan)).toBe(true);
    expect(() => {
      (vm as { usable?: boolean }).usable = true;
    }).toThrow(TypeError);
    expect(() => {
      (vm.host as { usable?: boolean }).usable = true;
    }).toThrow(TypeError);
    expect(() => {
      (vm.banner as { visible?: boolean }).visible = true;
    }).toThrow(TypeError);
  });

  it('is deterministic for identical input', () => {
    const options = { featureTier: 'pro', capturedAt: NOW, dates };
    const a = createAccessViewModel(responses.trialingNear, options);
    const b = createAccessViewModel(responses.trialingNear, options);
    expect(a).toEqual(b);
  });

  it('detaches output from caller-owned objects and ignores unknown nested properties', () => {
    const capabilities = {
      ...responses.locked.capabilities,
    } as Record<string, unknown>;
    capabilities.untrustedCycle = capabilities;
    const warning = {
      ...responses.locked.warning!,
      untrustedMetadata: { source: 'caller' },
    };
    const featurePlan = {
      ...responses.locked.featurePlan,
      untrustedMetadata: { source: 'caller' },
    };
    const input = {
      ...responses.locked,
      capabilities,
      warning,
      featurePlan,
    };

    const vm = createAccessViewModel(input);

    expect(vm.capabilities).not.toBe(capabilities);
    expect(vm.warning).not.toBe(warning);
    expect(vm.featurePlan).not.toBe(featurePlan);
    expect(vm.capabilities).not.toHaveProperty('untrustedCycle');
    expect(vm.warning).not.toHaveProperty('untrustedMetadata');
    expect(vm.featurePlan).not.toHaveProperty('untrustedMetadata');
    expect(Object.isFrozen(capabilities)).toBe(false);
    expect(Object.isFrozen(warning)).toBe(false);
    expect(Object.isFrozen(featurePlan)).toBe(false);
  });
});
describe('banner projection', () => {
  it('shows the trial banner only inside the whole-day warning window', () => {
    const far = createAccessViewModel(responses.trialingFar);
    expect(far.banner.visible).toBe(false);
    expect(far.banner).toEqual({ visible: false, displayState: 'trialing' });
    const near = createAccessViewModel(responses.trialingNear, { dates });
    expect(near.banner).toEqual({
      visible: true,
      displayState: 'trialing',
      trialDaysRemaining: 5,
      trialEndsAt: '2026-08-01',
    });
  });

  it('shows the cancel-at-period-end banner with the exact server paid-through date', () => {
    const vm = createAccessViewModel(responses.cancelFar, { dates });
    expect(vm.banner).toEqual({
      visible: true,
      displayState: 'cancel-at-period-end',
      paidThroughDate: '2026-09-01T00:00:00Z',
    });
  });

  it('shows the past-due banner without inventing dates', () => {
    const vm = createAccessViewModel(responses.pastDueImmediate, { dates });
    expect(vm.banner).toEqual({ visible: true, displayState: 'past-due' });
  });

  it('shows the grace banner with the exact server grace deadline', () => {
    const vm = createAccessViewModel(responses.grace, { dates });
    expect(vm.banner).toEqual({
      visible: true,
      displayState: 'grace',
      graceEndsAt: '2026-07-30T12:00:00+00:00',
    });
  });

  it('hides the banner for states the banner component never renders', () => {
    const hidden: Array<keyof typeof responses> = [
      'prelaunch',
      'admin',
      'internal',
      'active',
      'locked',
      'lockedFromGrace',
      'unknownNoTime',
      'unknownBadState',
    ];
    for (const key of hidden) {
      const vm = createAccessViewModel(responses[key], { dates });
      expect(vm.banner.visible).toBe(false);
    }
  });
});

describe('paywall projection', () => {
  it('is visible exactly when access is not usable', () => {
    for (const key of Object.keys(responses) as Array<keyof typeof responses>) {
      const vm = createAccessViewModel(responses[key]);
      expect(vm.paywall.visible).toBe(!vm.usable);
    }
  });

  it('projects per-state server metadata for the access screen', () => {
    const trialing = createAccessViewModel(responses.trialingNear, { dates });
    expect(trialing.paywall).toEqual({
      visible: false,
      displayState: 'trialing',
      featureTier: DEFAULT_FEATURE_TIER,
      trialDaysRemaining: 5,
      trialEndDate: '2026-08-01',
    });
    const active = createAccessViewModel(responses.active, { dates });
    expect(active.paywall).toEqual({
      visible: false,
      displayState: 'active',
      featureTier: DEFAULT_FEATURE_TIER,
      paidThroughDate: '2026-09-01T00:00:00Z',
    });
    const cancel = createAccessViewModel(responses.cancelNear, { dates });
    expect(cancel.paywall.paidThroughDate).toBe('2026-09-01T00:00:00Z');
    const grace = createAccessViewModel(responses.grace, { dates });
    expect(grace.paywall).toEqual({
      visible: false,
      displayState: 'grace',
      featureTier: DEFAULT_FEATURE_TIER,
      graceDaysRemaining: 2,
      graceEndDate: '2026-07-30T12:00:00+00:00',
    });
  });

  it('projects no server dates for states that have none', () => {
    const locked = createAccessViewModel(responses.locked, { dates });
    expect(locked.paywall).toEqual({
      visible: true,
      displayState: 'locked',
      featureTier: DEFAULT_FEATURE_TIER,
    });
    const prelaunch = createAccessViewModel(responses.prelaunch, { dates });
    expect(prelaunch.paywall).toEqual({
      visible: false,
      displayState: 'prelaunch',
      featureTier: DEFAULT_FEATURE_TIER,
    });
  });
});

describe('server-provided dates', () => {
  it('passes exact date-only and timestamp strings through unchanged', () => {
    const vm = createAccessViewModel(responses.trialingNear, { dates });
    expect(vm.trialEndsAt).toBe('2026-08-01');
    expect(vm.paidThroughDate).toBe('2026-09-01T00:00:00Z');
    expect(vm.graceEndsAt).toBe('2026-07-30T12:00:00+00:00');
  });

  it('defaults absent dates to null', () => {
    const vm = createAccessViewModel(responses.active);
    expect(vm.trialEndsAt).toBeNull();
    expect(vm.paidThroughDate).toBeNull();
    expect(vm.graceEndsAt).toBeNull();
  });

  it('filters dates that do not belong to the current state', () => {
    const active = createAccessViewModel(responses.active, { dates });
    expect(active.paywall.trialEndDate).toBeUndefined();
    expect(active.paywall.graceEndDate).toBeUndefined();
    expect(active.banner.trialEndsAt).toBeUndefined();
  });

  it('rejects malformed date metadata fail-closed', () => {
    const bad = ['not-a-date', '2026-13-45', '2026-02-30', 'http://x.example', 42, ' 2026-08-01'];
    for (const value of bad) {
      expectCode(
        () => createAccessViewModel(responses.trialingNear, { dates: { trialEndsAt: value } }),
        'invalid_date',
      );
    }
    expectCode(
      () => createAccessViewModel(responses.active, { dates: 'nope' as unknown as object }),
      'invalid_date',
    );
  });
});

describe('additive feature tier', () => {
  it('never lets a feature tier grant app access', () => {
    const locked = createAccessViewModel(responses.locked, { featureTier: 'apex' });
    expect(locked.usable).toBe(false);
    expect(locked.displayState).toBe('locked');
    expect(locked.host.featureTier).toBe('apex');
    expect(locked.paywall.featureTier).toBe('apex');
    const unknown = createAccessViewModel(responses.unknownNoTime, { featureTier: 'ultra' });
    expect(unknown.usable).toBe(false);
  });

  it('accepts bounded tier strings and defaults to the sentinel', () => {
    expect(createAccessViewModel(responses.active).featureTier).toBe(DEFAULT_FEATURE_TIER);
    expect(createAccessViewModel(responses.active, { featureTier: null }).featureTier).toBe(
      DEFAULT_FEATURE_TIER,
    );
    expect(createAccessViewModel(responses.active, { featureTier: 'starter' }).featureTier).toBe(
      'starter',
    );
  });

  it('rejects unbounded tier metadata', () => {
    expectCode(
      () => createAccessViewModel(responses.active, { featureTier: '' }),
      'invalid_feature_tier',
    );
    expectCode(
      () => createAccessViewModel(responses.active, { featureTier: '   ' }),
      'invalid_feature_tier',
    );
    expectCode(
      () => createAccessViewModel(responses.active, { featureTier: 7 }),
      'invalid_feature_tier',
    );
    expectCode(
      () =>
        createAccessViewModel(responses.active, {
          featureTier: 'x'.repeat(ACCESS_UI_MAX_TIER_LENGTH + 1),
        }),
      'invalid_feature_tier',
    );
  });
});

describe('capturedAt', () => {
  it('accepts trusted finite capture times and rejects malformed ones', () => {
    expect(createAccessViewModel(responses.active, { capturedAt: NOW }).capturedAt).toBe(NOW);
    expect(createAccessViewModel(responses.active, { capturedAt: 0 }).capturedAt).toBe(0);
    for (const value of [NaN, Infinity, -1, 1.5, 'now']) {
      expectCode(
        () => createAccessViewModel(responses.active, { capturedAt: value }),
        'invalid_captured_at',
      );
    }
  });
});
describe('warning pass-through and validation', () => {
  it('preserves every authoritative warning field exactly', () => {
    const vm = createAccessViewModel(responses.trialingNear);
    expect(vm.warning).toStrictEqual(responses.trialingNear.warning);
    expect(vm.warning?.routeChange).toBe(false);
    expect(vm.checkoutNeeded).toBe(true);
  });

  it('accepts every authoritative warning shape', () => {
    for (const key of Object.keys(responses) as Array<keyof typeof responses>) {
      expect(() => createAccessViewModel(responses[key])).not.toThrow();
    }
  });

  it('rejects malformed warning metadata', () => {
    const base = responses.trialingNear;
    const warning = base.warning;
    if (!warning) throw new Error('expected a trial warning fixture');
    const malformed: Array<Record<string, unknown>> = [
      { ...warning, kind: 'party_time' },
      { ...warning, milestone: 2 },
      { ...warning, daysRemaining: -1 },
      { ...warning, daysRemaining: 1.5 },
      { ...warning, message: '   ' },
      { ...warning, message: 'x'.repeat(501) },
      { ...warning, action: 'teleport' },
      { ...warning, actionUrl: 'http://insecure.example' },
      { ...warning, actionUrl: 'javascript:alert(1)' },
      { ...warning, routeChange: true },
      { ...warning, dedupeKey: '' },
    ];
    for (const value of malformed) {
      expectCode(() => createAccessViewModel({ ...base, warning: value }), 'invalid_warning');
    }
  });

  it('rejects warnings that are inconsistent with the authoritative state', () => {
    const trialWarning = responses.trialingNear.warning;
    if (!trialWarning) throw new Error('expected a trial warning fixture');
    expectCode(
      () => createAccessViewModel({ ...responses.locked, warning: trialWarning }),
      'inconsistent_warning',
    );
    expectCode(
      () => createAccessViewModel({ ...responses.active, warning: trialWarning }),
      'inconsistent_warning',
    );
    const wrongBand = { ...trialWarning, milestone: 7, daysRemaining: 1 };
    expectCode(
      () => createAccessViewModel({ ...responses.trialingNear, warning: wrongBand }),
      'inconsistent_warning',
    );
    const wrongKey = { ...trialWarning, dedupeKey: 'cancellation:7' };
    expectCode(
      () => createAccessViewModel({ ...responses.trialingNear, warning: wrongKey }),
      'inconsistent_warning',
    );
    const noneWithUrl = { ...trialWarning, action: 'none', actionUrl: 'https://checkout.example' };
    expectCode(
      () => createAccessViewModel({ ...responses.trialingNear, warning: noneWithUrl }),
      'inconsistent_warning',
    );
  });
});

describe('countdown validation', () => {
  it('rejects malformed countdown metadata', () => {
    for (const value of [-1, 1.5, NaN, Infinity, ACCESS_UI_MAX_DAYS + 1, '5']) {
      expectCode(
        () => createAccessViewModel({ ...responses.trialingNear, trialDaysRemaining: value }),
        'invalid_countdown',
      );
    }
  });

  it('rejects countdowns that cannot belong to the current state', () => {
    expectCode(
      () => createAccessViewModel({ ...responses.active, trialDaysRemaining: 5 }),
      'inconsistent_countdown',
    );
    expectCode(
      () => createAccessViewModel({ ...responses.grace, trialDaysRemaining: 5 }),
      'inconsistent_countdown',
    );
    expectCode(
      () => createAccessViewModel({ ...responses.active, graceDaysRemaining: 2 }),
      'inconsistent_countdown',
    );
    expectCode(
      () => createAccessViewModel({ ...responses.grace, graceDaysRemaining: null }),
      'inconsistent_countdown',
    );
    expectCode(
      () => createAccessViewModel({ ...responses.trialingNear, trialDaysRemaining: null }),
      'inconsistent_countdown',
    );
  });
});

describe('impossible and inconsistent grants', () => {
  it('rejects access granted while locked or unknown', () => {
    expectCode(
      () => createAccessViewModel({ ...responses.locked, appAccessGranted: true }),
      'impossible_grant',
    );
    expectCode(
      () => createAccessViewModel({ ...responses.unknownNoTime, appAccessGranted: true }),
      'impossible_grant',
    );
  });

  it('rejects decision flags that disagree with the state', () => {
    expectCode(
      () => createAccessViewModel({ ...responses.active, locked: true }),
      'inconsistent_flags',
    );
    expectCode(
      () => createAccessViewModel({ ...responses.locked, locked: false }),
      'inconsistent_flags',
    );
    expectCode(
      () => createAccessViewModel({ ...responses.active, failClosed: true }),
      'inconsistent_flags',
    );
    expectCode(
      () => createAccessViewModel({ ...responses.unknownNoTime, failClosed: false }),
      'inconsistent_flags',
    );
  });

  it('rejects capabilities that disagree with the accepted authority', () => {
    expectCode(
      () => createAccessViewModel({ ...responses.active, appAccessGranted: false }),
      'inconsistent_capabilities',
    );
    const lockedCaps = { ...responses.active.capabilities, use: false, mutation: false };
    expectCode(
      () => createAccessViewModel({ ...responses.active, capabilities: lockedCaps }),
      'inconsistent_capabilities',
    );
  });

  it('rejects checkout metadata that disagrees with the state', () => {
    expectCode(
      () => createAccessViewModel({ ...responses.active, checkoutNeeded: true }),
      'inconsistent_checkout',
    );
    expectCode(
      () => createAccessViewModel({ ...responses.cancelFar, checkoutNeeded: false }),
      'inconsistent_checkout',
    );
    expectCode(
      () => createAccessViewModel({ ...responses.trialingNear, checkoutNeeded: false }),
      'inconsistent_checkout',
    );
  });

  it('rejects a feature plan that is not manageable', () => {
    expectCode(
      () =>
        createAccessViewModel({
          ...responses.active,
          featurePlan: { active: true, manageable: false },
        }),
      'inconsistent_feature_plan',
    );
  });
});

describe('malformed response shapes', () => {
  it('rejects non-object and empty responses fail-closed', () => {
    for (const value of [undefined, null, 42, 'active', true, [], {}]) {
      expectCode(() => createAccessViewModel(value), 'invalid_response');
    }
  });

  it('rejects unknown states and missing decision fields', () => {
    expectCode(
      () => createAccessViewModel({ ...responses.active, state: 'bogus' }),
      'invalid_response',
    );
    expectCode(() => createAccessViewModel({ state: 'active' }), 'invalid_response');
    expectCode(
      () => createAccessViewModel({ ...responses.active, appAccessGranted: 'yes' }),
      'invalid_response',
    );
    expectCode(
      () => createAccessViewModel({ ...responses.active, capabilities: { use: true } }),
      'invalid_response',
    );
    expectCode(
      () => createAccessViewModel({ ...responses.active, featurePlan: { active: 'yes' } }),
      'invalid_response',
    );
    expectCode(
      () => createAccessViewModel({ ...responses.active, warning: 'soon' }),
      'invalid_response',
    );
  });
});
