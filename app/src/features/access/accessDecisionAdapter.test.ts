import { describe, expect, it } from 'vitest';
import { deriveCapabilities } from './accessPolicy';
import type { AppAccessState } from './accessPolicy';
import type {
  AccessServerSnapshot,
  AppAccessCheckoutReason,
  AppAccessServerStatus,
} from './accessGateway';
import {
  AccessDecisionAdapterError,
  adaptAccessDecision,
  type AccessDecisionAdapterErrorCode,
} from './accessDecisionAdapter';

const SERVER_TIME = '2026-07-28T12:00:00.000Z';
const CAPTURED_AT = Date.parse(SERVER_TIME);
const TRIAL_ENDS = '2026-08-09T12:00:00.000Z';
const PERIOD_ENDS = '2026-08-27T12:00:00.000Z';
const GRACE_ENDS = '2026-07-31T12:00:00.000Z';
const TRIAL_DAYS = 12;
const GRACE_DAYS = 2;

const ALL_STATES: AppAccessServerStatus[] = [
  'prelaunch',
  'trialing',
  'active',
  'cancel_at_period_end',
  'past_due',
  'grace',
  'locked',
  'admin',
  'internal',
  'unknown',
];

const CHECKOUT_STATES: ReadonlySet<AppAccessServerStatus> = new Set([
  'trialing',
  'past_due',
  'grace',
  'locked',
]);

const CHECKOUT_REASON_BY_STATE: Partial<Record<AppAccessServerStatus, AppAccessCheckoutReason>> = {
  trialing: 'trial_will_convert',
  past_due: 'payment_failed',
  grace: 'grace_period',
  locked: 'access_locked',
};

const DISPLAY_BY_STATE: Record<AppAccessServerStatus, string> = {
  prelaunch: 'prelaunch',
  trialing: 'trialing',
  active: 'active',
  cancel_at_period_end: 'cancel-at-period-end',
  past_due: 'past-due',
  grace: 'grace',
  locked: 'locked',
  admin: 'active',
  internal: 'active',
  unknown: 'unknown',
};

const DATA_CAP_KEYS = ['account', 'billing', 'legal', 'localRead', 'export', 'backup'] as const;

/** Build a server snapshot whose explicit authority booleans agree with its state. */
function consistentSnapshot(
  state: AppAccessServerStatus,
  overrides: Partial<AccessServerSnapshot> = {},
): AccessServerSnapshot {
  const caps = deriveCapabilities(state as AppAccessState);
  const checkout = CHECKOUT_STATES.has(state);
  return {
    status: state,
    enabled: true,
    serverTime: SERVER_TIME,
    trialEndsAt: state === 'trialing' ? TRIAL_ENDS : null,
    currentPeriodEndsAt:
      state === 'active' || state === 'cancel_at_period_end' || state === 'past_due'
        ? PERIOD_ENDS
        : null,
    graceEndsAt: state === 'grace' ? GRACE_ENDS : null,
    daysRemaining:
      state === 'trialing'
        ? TRIAL_DAYS
        : state === 'grace'
          ? GRACE_DAYS
          : state === 'active' || state === 'cancel_at_period_end'
            ? 31
            : null,
    canUseApp: caps.use,
    canEdit: caps.mutation,
    canExport: caps.export,
    requiresCheckout: checkout,
    checkoutReason: checkout ? (CHECKOUT_REASON_BY_STATE[state] ?? null) : null,
    ...overrides,
  };
}

function expectCode(fn: () => unknown, code: AccessDecisionAdapterErrorCode): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AccessDecisionAdapterError);
    expect((error as AccessDecisionAdapterError).code).toBe(code);
    return;
  }
  throw new Error(
    `Expected AccessDecisionAdapterError with code "${code}" but no error was thrown.`,
  );
}

describe('adaptAccessDecision', () => {
  describe('all ten access states project the accepted decision', () => {
    it.each(ALL_STATES)('projects "%s" without re-evaluating policy', (state) => {
      const decision = adaptAccessDecision(consistentSnapshot(state));
      const caps = deriveCapabilities(state as AppAccessState);
      const checkout = CHECKOUT_STATES.has(state);

      expect(decision.response).toEqual({
        state,
        appAccessGranted: caps.use,
        locked: state === 'locked',
        failClosed: state === 'unknown',
        checkoutNeeded: checkout,
        capabilities: caps,
        warning: null,
        trialDaysRemaining: state === 'trialing' ? TRIAL_DAYS : null,
        graceDaysRemaining: state === 'grace' ? GRACE_DAYS : null,
        featurePlan: { active: false, manageable: true },
      });

      expect(decision.viewModel.state).toBe(state);
      expect(decision.viewModel.displayState).toBe(DISPLAY_BY_STATE[state]);
      expect(decision.viewModel.usable).toBe(caps.use);
      expect(decision.viewModel.locked).toBe(state === 'locked');
      expect(decision.viewModel.failClosed).toBe(state === 'unknown');
      expect(decision.viewModel.checkoutNeeded).toBe(checkout);
      expect(decision.viewModel.capabilities).toEqual(caps);
      expect(decision.viewModel.warning).toBeNull();
      expect(decision.viewModel.featurePlan).toEqual({ active: false, manageable: true });
      expect(decision.viewModel.featureTier).toBe('unknown');
      expect(decision.viewModel.capturedAt).toBe(CAPTURED_AT);
      expect(decision.viewModel.trialDaysRemaining).toBe(state === 'trialing' ? TRIAL_DAYS : null);
      expect(decision.viewModel.graceDaysRemaining).toBe(state === 'grace' ? GRACE_DAYS : null);
      expect(decision.viewModel.trialEndsAt).toBe(state === 'trialing' ? TRIAL_ENDS : null);
      expect(decision.viewModel.paidThroughDate).toBe(
        state === 'active' || state === 'cancel_at_period_end' || state === 'past_due'
          ? PERIOD_ENDS
          : null,
      );
      expect(decision.viewModel.graceEndsAt).toBe(state === 'grace' ? GRACE_ENDS : null);
    });
  });

  describe('server authority is preserved exactly and never broadened', () => {
    it('keeps locked and unknown unusable', () => {
      for (const state of ['locked', 'unknown'] as const) {
        const decision = adaptAccessDecision(consistentSnapshot(state));
        expect(decision.response.appAccessGranted).toBe(false);
        expect(decision.response.capabilities.use).toBe(false);
        expect(decision.viewModel.usable).toBe(false);
      }
      expect(adaptAccessDecision(consistentSnapshot('locked')).response.locked).toBe(true);
      expect(adaptAccessDecision(consistentSnapshot('unknown')).response.failClosed).toBe(true);
    });

    it('keeps data-preserving capabilities available in every state', () => {
      for (const state of ALL_STATES) {
        const { capabilities } = adaptAccessDecision(consistentSnapshot(state)).response;
        for (const key of DATA_CAP_KEYS) {
          expect(capabilities[key], `${state}.${key}`).toBe(true);
        }
      }
    });

    it('fails closed when canUseApp would broaden the state decision', () => {
      expectCode(
        () => adaptAccessDecision(consistentSnapshot('active', { canUseApp: false })),
        'inconsistent_authority',
      );
      expectCode(
        () => adaptAccessDecision(consistentSnapshot('locked', { canUseApp: true })),
        'inconsistent_authority',
      );
    });

    it('fails closed when canEdit disagrees with the state decision', () => {
      expectCode(
        () => adaptAccessDecision(consistentSnapshot('active', { canEdit: false })),
        'inconsistent_authority',
      );
      expectCode(
        () => adaptAccessDecision(consistentSnapshot('locked', { canEdit: true })),
        'inconsistent_authority',
      );
    });

    it('fails closed when canExport disagrees with the data-preserving contract', () => {
      expectCode(
        () => adaptAccessDecision(consistentSnapshot('locked', { canExport: false })),
        'inconsistent_authority',
      );
    });

    it('fails closed when requiresCheckout disagrees with the state', () => {
      expectCode(
        () => adaptAccessDecision(consistentSnapshot('grace', { requiresCheckout: false })),
        'inconsistent_authority',
      );
      expectCode(
        () =>
          adaptAccessDecision(
            consistentSnapshot('cancel_at_period_end', {
              requiresCheckout: true,
              checkoutReason: 'grace_period',
            }),
          ),
        'inconsistent_authority',
      );
    });

    it('fails closed when checkoutReason presence disagrees with checkout', () => {
      expectCode(
        () => adaptAccessDecision(consistentSnapshot('locked', { checkoutReason: null })),
        'inconsistent_authority',
      );
      expectCode(
        () =>
          adaptAccessDecision(consistentSnapshot('active', { checkoutReason: 'payment_failed' })),
        'inconsistent_authority',
      );
    });

    it('preserves the account-verification lock without inventing checkout', () => {
      const decision = adaptAccessDecision(
        consistentSnapshot('locked', {
          requiresCheckout: false,
          checkoutReason: 'account_verification_required',
        }),
      );

      expect(decision.response.checkoutNeeded).toBe(false);
      expect(decision.response.appAccessGranted).toBe(false);
      expect(decision.viewModel.checkoutNeeded).toBe(false);
      expect(decision.viewModel.usable).toBe(false);
    });
  });

  describe('countdowns and server dates pass through only for their owning states', () => {
    it('passes the trial countdown and trial-end date only for trialing', () => {
      const decision = adaptAccessDecision(consistentSnapshot('trialing'));
      expect(decision.response.trialDaysRemaining).toBe(TRIAL_DAYS);
      expect(decision.response.graceDaysRemaining).toBeNull();
      expect(decision.viewModel.trialDaysRemaining).toBe(TRIAL_DAYS);
      expect(decision.viewModel.trialEndsAt).toBe(TRIAL_ENDS);
      expect(decision.viewModel.graceEndsAt).toBeNull();
      expect(decision.viewModel.paidThroughDate).toBeNull();
    });

    it('passes the grace countdown and grace-end date only for grace', () => {
      const decision = adaptAccessDecision(consistentSnapshot('grace'));
      expect(decision.response.graceDaysRemaining).toBe(GRACE_DAYS);
      expect(decision.response.trialDaysRemaining).toBeNull();
      expect(decision.viewModel.graceDaysRemaining).toBe(GRACE_DAYS);
      expect(decision.viewModel.graceEndsAt).toBe(GRACE_ENDS);
      expect(decision.viewModel.trialEndsAt).toBeNull();
    });

    it('passes the paid-through date for active, cancel_at_period_end, and past_due', () => {
      expect(adaptAccessDecision(consistentSnapshot('active')).viewModel.paidThroughDate).toBe(
        PERIOD_ENDS,
      );
      expect(
        adaptAccessDecision(consistentSnapshot('cancel_at_period_end')).viewModel.paidThroughDate,
      ).toBe(PERIOD_ENDS);
      expect(adaptAccessDecision(consistentSnapshot('past_due')).viewModel.paidThroughDate).toBe(
        PERIOD_ENDS,
      );
    });

    it('uses serverTime only as trusted capturedAt metadata', () => {
      const decision = adaptAccessDecision(consistentSnapshot('active'));
      expect(decision.viewModel.capturedAt).toBe(CAPTURED_AT);
      expect(decision.viewModel.host.capturedAt).toBe(CAPTURED_AT);
    });

    it('validates but does not reinterpret the server period countdown', () => {
      const active = adaptAccessDecision(consistentSnapshot('active', { daysRemaining: 5 }));
      const cancellation = adaptAccessDecision(
        consistentSnapshot('cancel_at_period_end', { daysRemaining: 4 }),
      );

      expect(active.response.trialDaysRemaining).toBeNull();
      expect(active.response.graceDaysRemaining).toBeNull();
      expect(cancellation.response.trialDaysRemaining).toBeNull();
      expect(cancellation.response.graceDaysRemaining).toBeNull();
    });

    it('fails closed when trialing or grace lacks its countdown', () => {
      expectCode(
        () => adaptAccessDecision(consistentSnapshot('trialing', { daysRemaining: null })),
        'inconsistent_countdown',
      );
      expectCode(
        () => adaptAccessDecision(consistentSnapshot('grace', { daysRemaining: null })),
        'inconsistent_countdown',
      );
    });

    it('validates then ignores historical dates that do not belong to the current state', () => {
      const snapshot = consistentSnapshot('active', {
        trialEndsAt: TRIAL_ENDS,
        graceEndsAt: GRACE_ENDS,
      });
      const decision = adaptAccessDecision(snapshot);

      expect(decision.viewModel.paidThroughDate).toBe(PERIOD_ENDS);
      expect(decision.viewModel.trialEndsAt).toBeNull();
      expect(decision.viewModel.graceEndsAt).toBeNull();
      expect(snapshot.trialEndsAt).toBe(TRIAL_ENDS);
      expect(snapshot.graceEndsAt).toBe(GRACE_ENDS);
    });
  });

  describe('additive feature plan and tier never grant app access', () => {
    it('defaults to an inactive plan and unknown tier', () => {
      const decision = adaptAccessDecision(consistentSnapshot('active'));
      expect(decision.response.featurePlan).toEqual({ active: false, manageable: true });
      expect(decision.viewModel.featurePlan).toEqual({ active: false, manageable: true });
      expect(decision.viewModel.featureTier).toBe('unknown');
    });

    it('projects an active plan and custom tier as metadata', () => {
      const decision = adaptAccessDecision(consistentSnapshot('active'), {
        active: true,
        tier: 'studio',
      });
      expect(decision.response.featurePlan).toEqual({ active: true, manageable: true });
      expect(decision.viewModel.featureTier).toBe('studio');
    });

    it('never lets an active feature plan grant access while locked', () => {
      const decision = adaptAccessDecision(consistentSnapshot('locked'), {
        active: true,
        tier: 'studio',
      });
      expect(decision.response.appAccessGranted).toBe(false);
      expect(decision.response.locked).toBe(true);
      expect(decision.viewModel.usable).toBe(false);
      expect(decision.response.featurePlan.active).toBe(true);
      expect(decision.viewModel.featureTier).toBe('studio');
    });

    it('fails closed on a malformed feature plan', () => {
      expectCode(
        () => adaptAccessDecision(consistentSnapshot('active'), 'nope' as never),
        'invalid_feature_plan',
      );
      expectCode(
        () => adaptAccessDecision(consistentSnapshot('active'), { active: 'yes' } as never),
        'invalid_feature_plan',
      );
      expectCode(
        () => adaptAccessDecision(consistentSnapshot('active'), { tier: '  padded  ' } as never),
        'invalid_feature_plan',
      );
      expectCode(
        () => adaptAccessDecision(consistentSnapshot('active'), { tier: 'x'.repeat(65) } as never),
        'invalid_feature_plan',
      );
    });
  });

  describe('fail closed on malformed snapshots', () => {
    it('rejects non-object snapshots', () => {
      expectCode(() => adaptAccessDecision(null as never), 'malformed_snapshot');
      expectCode(() => adaptAccessDecision([] as never), 'malformed_snapshot');
      expectCode(() => adaptAccessDecision('active' as never), 'malformed_snapshot');
    });

    it('rejects an unrecognized status', () => {
      expectCode(
        () => adaptAccessDecision(consistentSnapshot('active', { status: 'bogus' as never })),
        'malformed_snapshot',
      );
    });

    it('rejects non-boolean authority flags', () => {
      expectCode(
        () => adaptAccessDecision(consistentSnapshot('active', { canUseApp: 'yes' as never })),
        'malformed_snapshot',
      );
      expectCode(
        () => adaptAccessDecision(consistentSnapshot('active', { enabled: 1 as never })),
        'malformed_snapshot',
      );
    });

    it('rejects an invalid serverTime', () => {
      expectCode(
        () => adaptAccessDecision(consistentSnapshot('active', { serverTime: 'not-a-time' })),
        'malformed_snapshot',
      );
    });

    it('rejects an unrecognized checkoutReason', () => {
      expectCode(
        () =>
          adaptAccessDecision(consistentSnapshot('locked', { checkoutReason: 'bogus' as never })),
        'malformed_snapshot',
      );
    });

    it('rejects a malformed countdown', () => {
      expectCode(
        () => adaptAccessDecision(consistentSnapshot('trialing', { daysRemaining: 1.5 })),
        'malformed_snapshot',
      );
      expectCode(
        () => adaptAccessDecision(consistentSnapshot('trialing', { daysRemaining: -1 })),
        'malformed_snapshot',
      );
      expectCode(
        () => adaptAccessDecision(consistentSnapshot('trialing', { daysRemaining: 3651 })),
        'malformed_snapshot',
      );
    });

    it('rejects a malformed server date', () => {
      expectCode(
        () => adaptAccessDecision(consistentSnapshot('trialing', { trialEndsAt: 'someday' })),
        'inconsistent_date',
      );
    });
  });

  describe('purity, immutability, and caller non-mutation', () => {
    it('is deterministic for identical input', () => {
      const snapshot = consistentSnapshot('trialing');
      expect(adaptAccessDecision(snapshot)).toEqual(adaptAccessDecision(snapshot));
    });

    it('returns deeply frozen outputs', () => {
      const decision = adaptAccessDecision(consistentSnapshot('active'));
      expect(Object.isFrozen(decision)).toBe(true);
      expect(Object.isFrozen(decision.response)).toBe(true);
      expect(Object.isFrozen(decision.response.capabilities)).toBe(true);
      expect(Object.isFrozen(decision.response.featurePlan)).toBe(true);
      expect(Object.isFrozen(decision.viewModel)).toBe(true);
      expect(() => {
        (decision as unknown as { response: unknown }).response = null;
      }).toThrow(TypeError);
    });

    it('does not mutate or freeze the caller snapshot', () => {
      const extra = { nested: true };
      const snapshot = { ...consistentSnapshot('active'), extra } as AccessServerSnapshot & {
        extra: { nested: boolean };
      };
      const before = JSON.stringify(snapshot);
      adaptAccessDecision(snapshot);
      expect(Object.isFrozen(snapshot)).toBe(false);
      expect(Object.isFrozen(extra)).toBe(false);
      expect(JSON.stringify(snapshot)).toBe(before);
    });

    it('ignores unknown properties without re-evaluating policy', () => {
      const snapshot = {
        ...consistentSnapshot('active'),
        launchConfig: { enabled: false, minVersion: '9.9.9' },
        appVersion: '0.0.1',
      } as AccessServerSnapshot;
      const decision = adaptAccessDecision(snapshot);
      expect(decision.response.state).toBe('active');
      expect(decision.response.appAccessGranted).toBe(true);
    });
  });
});
