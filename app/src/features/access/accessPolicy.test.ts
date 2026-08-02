import { describe, expect, it } from 'vitest';
import {
  APP_ACCESS_DAY_MS as DAY,
  DEFAULT_GRACE_DAYS,
  DEFAULT_TRIAL_DAYS,
  compareSemver,
  computeWarningMilestone,
  deriveCapabilities,
  evaluateAppAccess,
  normalizeAccessStatus,
  normalizeLaunchConfig,
  parseSemver,
  parseTimestampMs,
  versionEligible,
} from './accessPolicy';

const NOW = 1_750_000_000_000;
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

describe('parseTimestampMs', () => {
  it('accepts finite numbers, ISO strings, and numeric strings', () => {
    expect(parseTimestampMs(NOW)).toBe(NOW);
    expect(parseTimestampMs(iso(NOW))).toBe(NOW);
    expect(parseTimestampMs('1750000000000')).toBe(NOW);
  });
  it('rejects invalid timestamps deterministically', () => {
    expect(parseTimestampMs('not-a-date')).toBeNull();
    expect(parseTimestampMs('')).toBeNull();
    expect(parseTimestampMs(NaN)).toBeNull();
    expect(parseTimestampMs(Infinity)).toBeNull();
    expect(parseTimestampMs(null)).toBeNull();
    expect(parseTimestampMs(undefined)).toBeNull();
    expect(parseTimestampMs({})).toBeNull();
    expect(parseTimestampMs([])).toBeNull();
    expect(parseTimestampMs(-1)).toBeNull();
    expect(parseTimestampMs(Number.MAX_SAFE_INTEGER + 1)).toBeNull();
    expect(parseTimestampMs('999999999999999999999999')).toBeNull();
    expect(parseTimestampMs('06/15/2025')).toBeNull();
  });
});

describe('parseSemver', () => {
  it('parses major.minor.patch', () => {
    expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: null });
  });
  it('parses a prerelease suffix', () => {
    expect(parseSemver('1.2.3-beta.1')).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: 'beta.1',
    });
  });
  it('rejects malformed versions', () => {
    expect(parseSemver('1.2')).toBeNull();
    expect(parseSemver('v1.2.3')).toBeNull();
    expect(parseSemver('1.2.3.4')).toBeNull();
    expect(parseSemver('a.b.c')).toBeNull();
    expect(parseSemver('')).toBeNull();
    expect(parseSemver(null)).toBeNull();
    expect(parseSemver(undefined)).toBeNull();
    expect(parseSemver(1.2)).toBeNull();
    expect(parseSemver('01.2.3')).toBeNull();
    expect(parseSemver('1.02.3')).toBeNull();
    expect(parseSemver('1.2.03')).toBeNull();
    expect(parseSemver('1.2.3-01')).toBeNull();
    expect(parseSemver('1.2.3-alpha..1')).toBeNull();
    expect(parseSemver(`1.${'9'.repeat(400)}.0`)).toBeNull();
  });
});

describe('compareSemver', () => {
  it('orders numerically, not lexically', () => {
    expect(compareSemver('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareSemver('1.9.0', '1.10.0')).toBeLessThan(0);
    expect(compareSemver('2.0.0', '1.99.99')).toBeGreaterThan(0);
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
    expect(compareSemver('1.2.3', '1.2.4')).toBeLessThan(0);
  });
  it('treats a prerelease as older than the release', () => {
    expect(compareSemver('1.2.3-beta.1', '1.2.3')).toBeLessThan(0);
    expect(compareSemver('1.2.3', '1.2.3-beta.1')).toBeGreaterThan(0);
  });
  it('orders prerelease identifiers using SemVer numeric and lexical rules', () => {
    expect(compareSemver('1.2.3-beta.10', '1.2.3-beta.2')).toBeGreaterThan(0);
    expect(compareSemver('1.2.3-beta.2', '1.2.3-beta.alpha')).toBeLessThan(0);
    expect(compareSemver('1.2.3-beta', '1.2.3-beta.1')).toBeLessThan(0);
  });
  it('returns NaN when either side is invalid', () => {
    expect(Number.isNaN(compareSemver('1.2', '1.2.3'))).toBe(true);
    expect(Number.isNaN(compareSemver('1.2.3', 'nope'))).toBe(true);
  });
});

describe('versionEligible', () => {
  it('is true when no minimum is set', () => {
    expect(versionEligible('0.0.1', null)).toBe(true);
    expect(versionEligible('0.0.1', '')).toBe(true);
    expect(versionEligible('0.0.1', undefined)).toBe(true);
  });
  it('is true at or above the minimum', () => {
    expect(versionEligible('1.10.0', '1.9.0')).toBe(true);
    expect(versionEligible('1.9.0', '1.9.0')).toBe(true);
    expect(versionEligible('2.0.0', '1.9.0')).toBe(true);
  });
  it('is false below the minimum (numeric, not lexical)', () => {
    expect(versionEligible('1.9.0', '1.10.0')).toBe(false);
    expect(versionEligible('1.99.99', '2.0.0')).toBe(false);
  });
  it('fails closed on malformed current or minimum', () => {
    expect(versionEligible('not-a-version', '1.0.0')).toBe(false);
    expect(versionEligible('1.0.0', 'bad')).toBe(false);
    expect(versionEligible(null, '1.0.0')).toBe(false);
  });
});

describe('normalizeLaunchConfig', () => {
  it('is disabled by default with safe policy defaults', () => {
    const cfg = normalizeLaunchConfig(undefined);
    expect(cfg.enabled).toBe(false);
    expect(cfg.minVersion).toBeNull();
    expect(cfg.rollbackEnabled).toBe(false);
    expect(cfg.trial).toEqual({ enabled: true, days: DEFAULT_TRIAL_DAYS });
    expect(cfg.payment.graceDays).toBe(DEFAULT_GRACE_DAYS);
    expect(cfg.payment.checkoutUrl).toBeNull();
    expect(cfg.payment.portalUrl).toBeNull();
  });
  it('does not enable unless explicitly true', () => {
    expect(normalizeLaunchConfig({}).enabled).toBe(false);
    expect(normalizeLaunchConfig({ enabled: 'true' }).enabled).toBe(false);
    expect(normalizeLaunchConfig({ enabled: 1 }).enabled).toBe(false);
    expect(normalizeLaunchConfig({ enabled: true }).enabled).toBe(true);
    expect(normalizeLaunchConfig(null).enabled).toBe(false);
    expect(normalizeLaunchConfig('garbage').enabled).toBe(false);
  });
  it('honors configurable trial and payment policy', () => {
    const cfg = normalizeLaunchConfig({
      enabled: true,
      minVersion: '1.2.0',
      rollbackEnabled: true,
      trial: { enabled: false, days: 14 },
      payment: { graceDays: 5, checkoutUrl: 'https://c', portalUrl: 'https://p' },
    });
    expect(cfg.enabled).toBe(true);
    expect(cfg.minVersion).toBe('1.2.0');
    expect(cfg.rollbackEnabled).toBe(true);
    expect(cfg.trial).toEqual({ enabled: false, days: 14 });
    expect(cfg.payment).toEqual({ graceDays: 5, checkoutUrl: 'https://c', portalUrl: 'https://p' });
  });
  it('rejects non-HTTPS billing action URLs', () => {
    const cfg = normalizeLaunchConfig({
      enabled: true,
      payment: {
        checkoutUrl: 'javascript:alert(1)',
        portalUrl: 'http://billing.example',
      },
    });
    expect(cfg.payment.checkoutUrl).toBeNull();
    expect(cfg.payment.portalUrl).toBeNull();
  });
  it('clamps invalid policy numbers to safe defaults', () => {
    const cfg = normalizeLaunchConfig({
      enabled: true,
      trial: { enabled: true, days: -5 },
      payment: { graceDays: 0 },
    });
    expect(cfg.trial.days).toBe(DEFAULT_TRIAL_DAYS);
    expect(cfg.payment.graceDays).toBe(DEFAULT_GRACE_DAYS);
  });
  it('returns a deeply frozen config', () => {
    const cfg = normalizeLaunchConfig({ enabled: true });
    expect(Object.isFrozen(cfg)).toBe(true);
    expect(Object.isFrozen(cfg.trial)).toBe(true);
    expect(Object.isFrozen(cfg.payment)).toBe(true);
  });
});

describe('normalizeAccessStatus', () => {
  it('maps known states and parses timestamps', () => {
    const s = normalizeAccessStatus({
      state: 'trialing',
      serverTime: iso(NOW),
      trialStartedAt: iso(NOW - 5 * DAY),
      verifiedAccount: true,
    });
    expect(s.state).toBe('trialing');
    expect(s.serverTimeMs).toBe(NOW);
    expect(s.trialStartedMs).toBe(NOW - 5 * DAY);
    expect(s.verifiedAccount).toBe(true);
  });
  it('fails closed to unknown for unrecognized or missing state', () => {
    expect(normalizeAccessStatus({ state: 'bogus', serverTime: NOW }).state).toBe('unknown');
    expect(normalizeAccessStatus({ serverTime: NOW }).state).toBe('unknown');
    expect(normalizeAccessStatus(null).state).toBe('unknown');
    expect(normalizeAccessStatus(undefined).state).toBe('unknown');
    expect(normalizeAccessStatus('active').state).toBe('unknown');
  });
  it('never treats non-boolean verifiedAccount as verified', () => {
    expect(
      normalizeAccessStatus({ state: 'active', serverTime: NOW, verifiedAccount: 'yes' })
        .verifiedAccount,
    ).toBe(false);
    expect(
      normalizeAccessStatus({ state: 'active', serverTime: NOW, verifiedAccount: 1 })
        .verifiedAccount,
    ).toBe(false);
  });
  it('normalizes feature plan additively without granting access', () => {
    const s = normalizeAccessStatus({
      state: 'locked',
      serverTime: NOW,
      featurePlan: { active: true, tier: 'pro' },
    });
    expect(s.featurePlan).toEqual({ active: true, manageable: true });
  });
});

describe('deriveCapabilities', () => {
  const PRODUCTION_STATES = [
    'prelaunch',
    'active',
    'trialing',
    'cancel_at_period_end',
    'past_due',
    'grace',
    'admin',
    'internal',
  ] as const;
  const BLOCKED_STATES = ['locked', 'unknown'] as const;
  const DATA_CAPS = ['account', 'billing', 'legal', 'localRead', 'export', 'backup'] as const;
  const PROD_CAPS = ['use', 'mutation', 'ai', 'terminals', 'tools', 'calls', 'scheduling'] as const;

  it('always preserves data/account/billing/legal/read/export/backup in every state', () => {
    for (const state of [...PRODUCTION_STATES, ...BLOCKED_STATES]) {
      const caps = deriveCapabilities(state);
      for (const key of DATA_CAPS) expect(caps[key]).toBe(true);
    }
  });
  it('grants production capabilities for access states', () => {
    for (const state of PRODUCTION_STATES) {
      const caps = deriveCapabilities(state);
      for (const key of PROD_CAPS) expect(caps[key]).toBe(true);
    }
  });
  it('blocks production capabilities when locked or unknown', () => {
    for (const state of BLOCKED_STATES) {
      const caps = deriveCapabilities(state);
      for (const key of PROD_CAPS) expect(caps[key]).toBe(false);
    }
  });
  it('returns a frozen capability set', () => {
    expect(Object.isFrozen(deriveCapabilities('locked'))).toBe(true);
  });
});

describe('computeWarningMilestone', () => {
  it('returns null outside the 7-day window and when expired or invalid', () => {
    expect(computeWarningMilestone(8 * DAY)).toBeNull();
    expect(computeWarningMilestone(30 * DAY)).toBeNull();
    expect(computeWarningMilestone(0)).toBeNull();
    expect(computeWarningMilestone(-DAY)).toBeNull();
    expect(computeWarningMilestone(NaN)).toBeNull();
  });
  it('maps the 7/3/1/final-day milestones at exact clock boundaries', () => {
    expect(computeWarningMilestone(7 * DAY)).toBe(7);
    expect(computeWarningMilestone(7 * DAY + 1)).toBe(7);
    expect(computeWarningMilestone(4 * DAY)).toBe(7);
    expect(computeWarningMilestone(4 * DAY - 1)).toBe(3);
    expect(computeWarningMilestone(3 * DAY)).toBe(3);
    expect(computeWarningMilestone(2 * DAY)).toBe(3);
    expect(computeWarningMilestone(2 * DAY - 1)).toBe(1);
    expect(computeWarningMilestone(1 * DAY)).toBe(1);
    expect(computeWarningMilestone(1 * DAY - 1)).toBe(0);
    expect(computeWarningMilestone(1)).toBe(0);
  });
});
describe('evaluateAppAccess - launch gating', () => {
  const activeStatus = { state: 'active', serverTime: NOW };
  it('keeps current development and beta builds usable before launch activation', () => {
    const r = evaluateAppAccess({ config: undefined, status: activeStatus, appVersion: '1.0.0' });
    expect(r.state).toBe('prelaunch');
    expect(r.appAccessGranted).toBe(true);
    expect(r.capabilities.mutation).toBe(true);
    expect(r.checkoutNeeded).toBe(false);
  });
  it('keeps the app usable when the server rollback switch disables the gate', () => {
    const r = evaluateAppAccess({
      config: { ...enabledConfig, rollbackEnabled: true },
      status: activeStatus,
      appVersion: '1.0.0',
    });
    expect(r.state).toBe('prelaunch');
    expect(r.appAccessGranted).toBe(true);
  });
  it('leaves builds below the activation version outside the gate', () => {
    const r = evaluateAppAccess({
      config: { ...enabledConfig, minVersion: '1.10.0' },
      status: activeStatus,
      appVersion: '1.9.0',
    });
    expect(r.state).toBe('prelaunch');
    expect(r.appAccessGranted).toBe(true);
  });
  it('admits builds at or above the minimum version (numeric compare)', () => {
    const r = evaluateAppAccess({
      config: { ...enabledConfig, minVersion: '1.9.0' },
      status: activeStatus,
      appVersion: '1.10.0',
    });
    expect(r.state).toBe('active');
    expect(r.appAccessGranted).toBe(true);
  });
  it('leaves malformed-version builds outside the gate instead of locking them', () => {
    const r = evaluateAppAccess({
      config: { ...enabledConfig, minVersion: '1.0.0' },
      status: activeStatus,
      appVersion: 'garbage',
    });
    expect(r.state).toBe('prelaunch');
    expect(r.appAccessGranted).toBe(true);
  });
  it('lets server-derived admin/internal bypass launch and version gating', () => {
    const admin = evaluateAppAccess({
      config: { ...enabledConfig, enabled: false },
      status: { state: 'admin', serverTime: NOW },
      appVersion: '0.0.1',
    });
    expect(admin.state).toBe('admin');
    expect(admin.appAccessGranted).toBe(true);
    expect(admin.capabilities.ai).toBe(true);
    const internal = evaluateAppAccess({
      config: { ...enabledConfig, rollbackEnabled: true, minVersion: '9.9.9' },
      status: { state: 'internal', serverTime: NOW },
      appVersion: '0.0.1',
    });
    expect(internal.state).toBe('internal');
    expect(internal.appAccessGranted).toBe(true);
  });
});

describe('evaluateAppAccess - state machine', () => {
  it('active grants full access with no warning', () => {
    const r = evaluateAppAccess({
      config: enabledConfig,
      status: { state: 'active', serverTime: NOW },
      appVersion: '1.0.0',
    });
    expect(r.state).toBe('active');
    expect(r.appAccessGranted).toBe(true);
    expect(r.locked).toBe(false);
    expect(r.warning).toBeNull();
    expect(r.checkoutNeeded).toBe(false);
  });
  it('trialing within the 30-day window grants access with a remaining count', () => {
    const r = evaluateAppAccess({
      config: enabledConfig,
      status: {
        state: 'trialing',
        serverTime: NOW,
        trialStartedAt: NOW - 10 * DAY,
        verifiedAccount: true,
      },
      appVersion: '1.0.0',
    });
    expect(r.state).toBe('trialing');
    expect(r.appAccessGranted).toBe(true);
    expect(r.trialDaysRemaining).toBe(20);
  });
  it('requires a verified account for trial eligibility (fail closed)', () => {
    const r = evaluateAppAccess({
      config: enabledConfig,
      status: {
        state: 'trialing',
        serverTime: NOW,
        trialStartedAt: NOW - 1 * DAY,
        verifiedAccount: false,
      },
      appVersion: '1.0.0',
    });
    expect(r.state).toBe('unknown');
    expect(r.appAccessGranted).toBe(false);
  });
  it('treats a long-expired trial as a lapse into locked', () => {
    const r = evaluateAppAccess({
      config: enabledConfig,
      status: {
        state: 'trialing',
        serverTime: NOW,
        trialStartedAt: NOW - 40 * DAY,
        verifiedAccount: true,
      },
      appVersion: '1.0.0',
    });
    expect(r.state).toBe('locked');
    expect(r.appAccessGranted).toBe(false);
    expect(r.checkoutNeeded).toBe(true);
  });
  it('expired trial within three full grace days resolves to grace', () => {
    const trialStart = NOW - 31 * DAY; // trialEnd = NOW - 1 day
    const r = evaluateAppAccess({
      config: enabledConfig,
      status: {
        state: 'trialing',
        serverTime: NOW,
        trialStartedAt: trialStart,
        verifiedAccount: true,
      },
      appVersion: '1.0.0',
    });
    expect(r.state).toBe('grace');
    expect(r.graceDaysRemaining).toBe(2);
    expect(r.appAccessGranted).toBe(true);
    expect(r.checkoutNeeded).toBe(true);
  });
  it('cancel_at_period_end keeps access until period end with a cancellation warning', () => {
    const r = evaluateAppAccess({
      config: enabledConfig,
      status: { state: 'cancel_at_period_end', serverTime: NOW, periodEndsAt: NOW + 5 * DAY },
      appVersion: '1.0.0',
    });
    expect(r.state).toBe('cancel_at_period_end');
    expect(r.appAccessGranted).toBe(true);
    expect(r.checkoutNeeded).toBe(true);
    expect(r.warning?.kind).toBe('cancellation');
    expect(r.warning?.milestone).toBe(7);
    expect(r.warning?.action).toBe('portal');
    expect(r.warning?.actionUrl).toBe('https://portal.example');
    expect(r.warning?.routeChange).toBe(false);
  });
  it('cancel_at_period_end after period end lapses into locked', () => {
    const r = evaluateAppAccess({
      config: enabledConfig,
      status: { state: 'cancel_at_period_end', serverTime: NOW, periodEndsAt: NOW - 5 * DAY },
      appVersion: '1.0.0',
    });
    expect(r.state).toBe('locked');
    expect(r.appAccessGranted).toBe(false);
  });
  it('past_due keeps access with a payment warning', () => {
    const r = evaluateAppAccess({
      config: enabledConfig,
      status: { state: 'past_due', serverTime: NOW },
      appVersion: '1.0.0',
    });
    expect(r.state).toBe('past_due');
    expect(r.appAccessGranted).toBe(true);
    expect(r.warning?.kind).toBe('payment');
    expect(r.warning?.message).not.toMatch(/\bday\b/i);
    expect(r.checkoutNeeded).toBe(true);
  });
  it('locked blocks production but preserves data access', () => {
    const r = evaluateAppAccess({
      config: enabledConfig,
      status: { state: 'locked', serverTime: NOW },
      appVersion: '1.0.0',
    });
    expect(r.state).toBe('locked');
    expect(r.locked).toBe(true);
    expect(r.appAccessGranted).toBe(false);
    expect(r.capabilities.mutation).toBe(false);
    expect(r.capabilities.ai).toBe(false);
    expect(r.capabilities.terminals).toBe(false);
    expect(r.capabilities.tools).toBe(false);
    expect(r.capabilities.calls).toBe(false);
    expect(r.capabilities.scheduling).toBe(false);
    expect(r.capabilities.account).toBe(true);
    expect(r.capabilities.billing).toBe(true);
    expect(r.capabilities.legal).toBe(true);
    expect(r.capabilities.localRead).toBe(true);
    expect(r.capabilities.export).toBe(true);
    expect(r.capabilities.backup).toBe(true);
    expect(r.checkoutNeeded).toBe(true);
    expect(r.warning?.kind).toBe('locked');
  });
  it('unknown state fails closed without assuming a payment cause', () => {
    const r = evaluateAppAccess({
      config: enabledConfig,
      status: { state: 'whatever', serverTime: NOW },
      appVersion: '1.0.0',
    });
    expect(r.state).toBe('unknown');
    expect(r.failClosed).toBe(true);
    expect(r.appAccessGranted).toBe(false);
    expect(r.capabilities.mutation).toBe(false);
    expect(r.checkoutNeeded).toBe(false);
  });
  it('fails closed when serverTime is missing or malformed', () => {
    const r = evaluateAppAccess({
      config: enabledConfig,
      status: { state: 'active', serverTime: 'nope' },
      appVersion: '1.0.0',
    });
    expect(r.state).toBe('unknown');
    expect(r.failClosed).toBe(true);
  });
});

describe('evaluateAppAccess - three full grace days', () => {
  const graceStart = NOW - 30 * DAY;
  function at(elapsedMs: number) {
    return evaluateAppAccess({
      config: enabledConfig,
      status: { state: 'grace', serverTime: graceStart + elapsedMs, graceStartedAt: graceStart },
      appVersion: '1.0.0',
    });
  }
  it('stays in grace for exactly three full days', () => {
    expect(at(0).state).toBe('grace');
    expect(at(0).graceDaysRemaining).toBe(3);
    expect(at(1 * DAY).state).toBe('grace');
    expect(at(1 * DAY).graceDaysRemaining).toBe(2);
    expect(at(2 * DAY).state).toBe('grace');
    expect(at(2 * DAY).graceDaysRemaining).toBe(1);
    expect(at(3 * DAY - 1).state).toBe('grace');
  });
  it('locks exactly when the third grace day completes', () => {
    expect(at(3 * DAY).state).toBe('locked');
    expect(at(3 * DAY).appAccessGranted).toBe(false);
    expect(at(4 * DAY).state).toBe('locked');
  });
  it('emits a grace warning with a checkout action and no route change', () => {
    const r = at(0);
    expect(r.warning?.kind).toBe('grace');
    expect(r.warning?.action).toBe('checkout');
    expect(r.warning?.actionUrl).toBe('https://checkout.example');
    expect(r.warning?.routeChange).toBe(false);
  });
  it('fails closed instead of resetting grace when its authoritative start is absent', () => {
    const r = evaluateAppAccess({
      config: enabledConfig,
      status: { state: 'grace', serverTime: NOW },
      appVersion: '1.0.0',
    });
    expect(r.state).toBe('unknown');
    expect(r.appAccessGranted).toBe(false);
    expect(r.failClosed).toBe(true);
  });
});

describe('evaluateAppAccess - trial warning milestones', () => {
  function trialWith(remainingMs: number) {
    const trialEnd = NOW + remainingMs;
    const trialStartedAt = trialEnd - DEFAULT_TRIAL_DAYS * DAY;
    return evaluateAppAccess({
      config: enabledConfig,
      status: { state: 'trialing', serverTime: NOW, trialStartedAt, verifiedAccount: true },
      appVersion: '1.0.0',
    });
  }
  it('shows no warning before the 7-day window', () => {
    expect(trialWith(8 * DAY).warning).toBeNull();
    expect(trialWith(8 * DAY).checkoutNeeded).toBe(false);
  });
  it.each([
    [7 * DAY, 7],
    [4 * DAY, 7],
    [3 * DAY, 3],
    [2 * DAY, 3],
    [1 * DAY, 1],
    [DAY - 1, 0],
  ] as const)('maps %i ms remaining to milestone %i', (remainingMs, milestone) => {
    const r = trialWith(remainingMs);
    expect(r.warning?.kind).toBe('trial_ending');
    expect(r.warning?.milestone).toBe(milestone);
    expect(r.warning?.routeChange).toBe(false);
    expect(r.checkoutNeeded).toBe(true);
  });
  it('uses a stable dedupe key per milestone and never routes', () => {
    const a = trialWith(7 * DAY);
    const b = trialWith(7 * DAY + 12345);
    expect(a.warning?.dedupeKey).toBe('trial_ending:7');
    expect(b.warning?.dedupeKey).toBe('trial_ending:7');
    expect(a.warning?.routeChange).toBe(false);
  });
});

describe('evaluateAppAccess - additive feature plan', () => {
  it('an active feature plan never bypasses locked app access', () => {
    const r = evaluateAppAccess({
      config: enabledConfig,
      status: { state: 'locked', serverTime: NOW, featurePlan: { active: true, tier: 'ultra' } },
      appVersion: '1.0.0',
    });
    expect(r.state).toBe('locked');
    expect(r.appAccessGranted).toBe(false);
    expect(r.capabilities.mutation).toBe(false);
    expect(r.capabilities.ai).toBe(false);
    expect(r.featurePlan.active).toBe(true);
    expect(r.featurePlan.manageable).toBe(true);
  });
  it('an active feature plan never bypasses grace', () => {
    const trialStart = NOW - 31 * DAY;
    const r = evaluateAppAccess({
      config: enabledConfig,
      status: {
        state: 'trialing',
        serverTime: NOW,
        trialStartedAt: trialStart,
        verifiedAccount: true,
        featurePlan: { active: true },
      },
      appVersion: '1.0.0',
    });
    expect(r.state).toBe('grace');
    expect(r.featurePlan.active).toBe(true);
  });
  it('never infers admin or internal from local feature tier', () => {
    const r = evaluateAppAccess({
      config: enabledConfig,
      status: { state: 'active', serverTime: NOW, featurePlan: { active: true, tier: 'ultra' } },
      appVersion: '1.0.0',
    });
    expect(r.state).toBe('active');
    expect(['admin', 'internal']).not.toContain(r.state);
  });
  it('feature plan stays manageable in every state', () => {
    for (const state of ['active', 'locked', 'grace', 'prelaunch', 'unknown'] as const) {
      const r = evaluateAppAccess({
        config: enabledConfig,
        status: { state, serverTime: NOW, featurePlan: { active: true } },
        appVersion: '1.0.0',
      });
      expect(r.featurePlan.manageable).toBe(true);
    }
  });
  it('a missing feature plan is reported inactive but manageable', () => {
    const r = evaluateAppAccess({
      config: enabledConfig,
      status: { state: 'active', serverTime: NOW },
      appVersion: '1.0.0',
    });
    expect(r.featurePlan).toEqual({ active: false, manageable: true });
  });
});

describe('evaluateAppAccess - immutability and determinism', () => {
  it('returns deeply frozen responses', () => {
    const r = evaluateAppAccess({
      config: enabledConfig,
      status: { state: 'active', serverTime: NOW },
      appVersion: '1.0.0',
    });
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.capabilities)).toBe(true);
    expect(Object.isFrozen(r.featurePlan)).toBe(true);
  });
  it('does not mutate caller inputs', () => {
    const config = {
      enabled: true,
      minVersion: null,
      rollbackEnabled: false,
      trial: { enabled: true, days: 30 },
      payment: { graceDays: 3, checkoutUrl: 'x', portalUrl: 'y' },
    };
    const status = { state: 'active', serverTime: NOW };
    const configSnapshot = JSON.stringify(config);
    const statusSnapshot = JSON.stringify(status);
    evaluateAppAccess({ config, status, appVersion: '1.0.0' });
    expect(JSON.stringify(config)).toBe(configSnapshot);
    expect(JSON.stringify(status)).toBe(statusSnapshot);
  });
  it('is deterministic for identical input', () => {
    const input = {
      config: enabledConfig,
      status: { state: 'cancel_at_period_end', serverTime: NOW, periodEndsAt: NOW + 2 * DAY },
      appVersion: '1.0.0',
    };
    const a = evaluateAppAccess(input);
    const b = evaluateAppAccess(input);
    expect(a).toEqual(b);
  });
  it('rejects mutation of a frozen response field', () => {
    const r = evaluateAppAccess({
      config: enabledConfig,
      status: { state: 'active', serverTime: NOW },
      appVersion: '1.0.0',
    });
    expect(() => {
      (r as unknown as { state: string }).state = 'locked';
    }).toThrow();
  });
});
