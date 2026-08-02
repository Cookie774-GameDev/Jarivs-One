/**
 * VibeSpace Access launch-policy and access-state domain (pure client module).
 *
 * This module models APP ACCESS - whether the VibeSpace app itself may be used
 * for production work - as a server-derived state machine that is deliberately
 * SEPARATE FROM, and ADDITIVE TO, the paid feature tier (`PlanId` /
 * `profiles.tier` in `@/lib/entitlements`). A feature plan never substitutes for
 * missing app access: an active feature plan does not bypass grace or lock.
 *
 * Design rules enforced here:
 *  - Server authority: access state and timestamps come from the server snapshot
 *    (`AppAccessStatusInput`). Admin/internal are honored ONLY when the server
 *    state says so; they are never inferred from local mutable state (feature
 *    tier, localStorage, build flags, etc.).
 *  - Disabled by default: `normalizeLaunchConfig` yields `enabled: false` unless
 *    the server explicitly sets `enabled: true`. A rollback switch and a strict
 *    semantic-version gate provide kill-switch / rollout controls.
 *  - Fail closed: malformed config/status/timestamps/version resolve to a safe
 *    posture (`unknown` or `prelaunch`) that blocks production work but always
 *    preserves local data and account/billing/legal/read/export/backup access.
 *  - Data preservation: this module only REPORTS capabilities. It never deletes,
 *    encrypts, or mutates local data.
 *  - Immutability & determinism: all inputs are runtime-validated and all outputs
 *    are deeply frozen; identical input always yields identical output.
 */

/** One full day in milliseconds; all countdowns use whole-day boundaries. */
export const APP_ACCESS_DAY_MS = 86_400_000;
/** Default verified-account trial length in whole days. */
export const DEFAULT_TRIAL_DAYS = 30;
/** Default number of full grace days before a lapse locks the app. */
export const DEFAULT_GRACE_DAYS = 3;
/** The only warning milestones the UI may surface (0 = final day). */
export const APP_ACCESS_WARNING_MILESTONES = [7, 3, 1, 0] as const;

/** Server-derived app-access state. Distinct from the paid feature tier. */
export type AppAccessState =
  | 'prelaunch'
  | 'trialing'
  | 'active'
  | 'cancel_at_period_end'
  | 'past_due'
  | 'grace'
  | 'locked'
  | 'admin'
  | 'internal'
  | 'unknown';

/** Warning milestone in whole days; 0 denotes the final day. */
export type WarningMilestone = 7 | 3 | 1 | 0;

export type AppAccessWarningKind = 'trial_ending' | 'cancellation' | 'payment' | 'grace' | 'locked';

export type AppAccessWarningAction = 'checkout' | 'portal' | 'none';

/** A single, de-duplicated warning. Never triggers a route change. */
export interface AppAccessWarning {
  readonly kind: AppAccessWarningKind;
  readonly milestone: WarningMilestone;
  readonly daysRemaining: number;
  readonly message: string;
  readonly action: AppAccessWarningAction;
  readonly actionUrl: string | null;
  /** Anti-spam policy: warnings are banners/toasts and never navigate. */
  readonly routeChange: false;
  /** Stable per (kind, milestone) so the UI can suppress repeats. */
  readonly dedupeKey: string;
}

/** Capability projection. Production caps gate work; data caps always remain. */
export interface AppAccessCapabilities {
  readonly use: boolean;
  readonly mutation: boolean;
  readonly ai: boolean;
  readonly terminals: boolean;
  readonly tools: boolean;
  readonly calls: boolean;
  readonly scheduling: boolean;
  readonly account: boolean;
  readonly billing: boolean;
  readonly legal: boolean;
  readonly localRead: boolean;
  readonly export: boolean;
  readonly backup: boolean;
}

export interface TrialPolicy {
  readonly enabled: boolean;
  readonly days: number;
}

export interface PaymentPolicy {
  readonly graceDays: number;
  readonly checkoutUrl: string | null;
  readonly portalUrl: string | null;
}

/** Authoritative, disabled-by-default server launch configuration. */
export interface AppAccessLaunchConfig {
  readonly enabled: boolean;
  readonly minVersion: string | null;
  readonly rollbackEnabled: boolean;
  readonly trial: TrialPolicy;
  readonly payment: PaymentPolicy;
}

export interface AppAccessFeaturePlanInput {
  readonly active?: boolean;
  readonly tier?: string | null;
}

export interface AppAccessFeaturePlanResult {
  readonly active: boolean;
  readonly manageable: boolean;
}

/** Raw, untrusted server status snapshot; everything is runtime-validated. */
export interface AppAccessStatusInput {
  readonly state?: unknown;
  readonly serverTime?: unknown;
  readonly trialStartedAt?: unknown;
  readonly periodEndsAt?: unknown;
  readonly graceStartedAt?: unknown;
  readonly verifiedAccount?: unknown;
  readonly featurePlan?: AppAccessFeaturePlanInput | null;
}

export interface AppAccessEvaluationInput {
  readonly config?: unknown;
  readonly status?: AppAccessStatusInput | null;
  readonly appVersion?: unknown;
}

/** Immutable access decision projected from validated server inputs. */
export interface AppAccessResponse {
  readonly state: AppAccessState;
  readonly appAccessGranted: boolean;
  readonly locked: boolean;
  readonly failClosed: boolean;
  readonly checkoutNeeded: boolean;
  readonly capabilities: AppAccessCapabilities;
  readonly warning: AppAccessWarning | null;
  readonly trialDaysRemaining: number | null;
  readonly graceDaysRemaining: number | null;
  readonly featurePlan: AppAccessFeaturePlanResult;
}

export interface ParsedSemver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: string | null;
}

/** Recursively freeze a value so consumers cannot mutate results. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return Object.freeze(value);
}

/**
 * Parse a timestamp to finite epoch milliseconds. Accepts finite numbers,
 * ISO-8601 strings, and pure-digit strings. Anything else is invalid (null),
 * which callers treat as fail-closed.
 */
export function parseTimestampMs(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    if (/^\d+$/.test(trimmed)) {
      const n = Number(trimmed);
      return Number.isSafeInteger(n) ? n : null;
    }
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(trimmed)
    ) {
      return null;
    }
    const parsed = Date.parse(trimmed);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-.]+))?$/;

/** Parse a strict semantic version (major.minor.patch[-prerelease]). */
export function parseSemver(value: unknown): ParsedSemver | null {
  if (typeof value !== 'string') return null;
  const match = SEMVER_RE.exec(value.trim());
  if (!match) return null;
  const core = [match[1], match[2], match[3]];
  if (core.some((identifier) => identifier.length > 1 && identifier.startsWith('0'))) {
    return null;
  }
  const [major, minor, patch] = core.map(Number);
  if (![major, minor, patch].every(Number.isSafeInteger)) return null;
  const prerelease = match[4] ?? null;
  if (prerelease !== null) {
    const identifiers = prerelease.split('.');
    if (
      identifiers.some(
        (identifier) =>
          identifier.length === 0 ||
          !/^[0-9A-Za-z-]+$/u.test(identifier) ||
          (/^\d+$/u.test(identifier) && identifier.length > 1 && identifier.startsWith('0')),
      )
    ) {
      return null;
    }
  }
  return {
    major,
    minor,
    patch,
    prerelease,
  };
}

function comparePrerelease(a: string, b: string): number {
  const aParts = a.split('.');
  const bParts = b.split('.');
  const count = Math.max(aParts.length, bParts.length);
  for (let index = 0; index < count; index += 1) {
    const aPart = aParts[index];
    const bPart = bParts[index];
    if (aPart === undefined) return -1;
    if (bPart === undefined) return 1;
    if (aPart === bPart) continue;
    const aNumeric = /^\d+$/u.test(aPart);
    const bNumeric = /^\d+$/u.test(bPart);
    if (aNumeric && bNumeric) {
      if (aPart.length !== bPart.length) return aPart.length - bPart.length;
      return aPart < bPart ? -1 : 1;
    }
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return aPart < bPart ? -1 : 1;
  }
  return 0;
}

/**
 * Numeric semantic-version comparison. Returns <0 / 0 / >0, or NaN when either
 * side is invalid. A prerelease sorts before its release. This is deliberately
 * numeric (not lexical) so 1.10.0 > 1.9.0.
 */
export function compareSemver(a: unknown, b: unknown): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return NaN;
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  if (pa.patch !== pb.patch) return pa.patch - pb.patch;
  if (pa.prerelease === null && pb.prerelease === null) return 0;
  if (pa.prerelease === null) return 1;
  if (pb.prerelease === null) return -1;
  return comparePrerelease(pa.prerelease, pb.prerelease);
}

/**
 * Whether `current` satisfies a minimum version gate. No minimum means eligible.
 * Fails closed (false) when either side is malformed.
 */
export function versionEligible(current: unknown, minVersion: unknown): boolean {
  if (minVersion === null || minVersion === undefined) return true;
  if (typeof minVersion === 'string' && minVersion.trim() === '') return true;
  const cmp = compareSemver(current, minVersion);
  if (Number.isNaN(cmp)) return false;
  return cmp >= 0;
}
/** Whole positive integer or fallback; rejects non-finite, <1, and fractions. */
function finitePositiveInt(value: unknown, fallback: number): number {
  if (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 1 &&
    Math.floor(value) === value
  ) {
    return value;
  }
  return fallback;
}

/** Non-empty string or null. */
function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** Only HTTPS billing destinations may cross this UI-facing policy boundary. */
function safeBillingUrl(value: unknown): string | null {
  const candidate = nullableString(value);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    if (
      parsed.protocol !== 'https:' ||
      parsed.hostname === '' ||
      parsed.username !== '' ||
      parsed.password !== ''
    ) {
      return null;
    }
    return candidate;
  } catch {
    return null;
  }
}

/**
 * Normalize an untrusted launch-config payload. Disabled by default: only an
 * explicit `enabled: true` enables the app. Trial is on by default unless
 * explicitly disabled. Invalid policy numbers clamp to safe defaults. The result
 * is deeply frozen.
 */
export function normalizeLaunchConfig(input?: unknown): AppAccessLaunchConfig {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const trialRaw = (raw.trial && typeof raw.trial === 'object' ? raw.trial : {}) as Record<
    string,
    unknown
  >;
  const paymentRaw = (raw.payment && typeof raw.payment === 'object' ? raw.payment : {}) as Record<
    string,
    unknown
  >;
  const config: AppAccessLaunchConfig = {
    enabled: raw.enabled === true,
    minVersion: nullableString(raw.minVersion),
    rollbackEnabled: raw.rollbackEnabled === true,
    trial: {
      enabled: trialRaw.enabled !== false,
      days: finitePositiveInt(trialRaw.days, DEFAULT_TRIAL_DAYS),
    },
    payment: {
      graceDays: finitePositiveInt(paymentRaw.graceDays, DEFAULT_GRACE_DAYS),
      checkoutUrl: safeBillingUrl(paymentRaw.checkoutUrl),
      portalUrl: safeBillingUrl(paymentRaw.portalUrl),
    },
  };
  return deepFreeze(config);
}

const APP_ACCESS_STATES: ReadonlySet<string> = new Set<AppAccessState>([
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
]);

/** Validated server status with parsed timestamps. */
export interface NormalizedAccessStatus {
  readonly state: AppAccessState;
  readonly serverTimeMs: number | null;
  readonly trialStartedMs: number | null;
  readonly periodEndsMs: number | null;
  readonly graceStartedMs: number | null;
  readonly verifiedAccount: boolean;
  readonly featurePlan: AppAccessFeaturePlanResult;
}

/**
 * Runtime-validate the server status snapshot. Unknown/missing states fail closed
 * to `unknown`. `verifiedAccount` must be a real boolean. The feature plan is
 * recorded additively and is always manageable; it never confers app access.
 */
export function normalizeAccessStatus(status: unknown): NormalizedAccessStatus {
  const raw = (status && typeof status === 'object' ? status : {}) as Record<string, unknown>;
  const stateRaw = typeof raw.state === 'string' ? raw.state : '';
  const state: AppAccessState = APP_ACCESS_STATES.has(stateRaw)
    ? (stateRaw as AppAccessState)
    : 'unknown';
  const fpRaw = (
    raw.featurePlan && typeof raw.featurePlan === 'object' ? raw.featurePlan : {}
  ) as Record<string, unknown>;
  const featurePlan: AppAccessFeaturePlanResult = {
    active: fpRaw.active === true,
    manageable: true,
  };
  return deepFreeze({
    state,
    serverTimeMs: parseTimestampMs(raw.serverTime),
    trialStartedMs: parseTimestampMs(raw.trialStartedAt),
    periodEndsMs: parseTimestampMs(raw.periodEndsAt),
    graceStartedMs: parseTimestampMs(raw.graceStartedAt),
    verifiedAccount: raw.verifiedAccount === true,
    featurePlan,
  });
}

/** States that grant production app access. */
const PRODUCTION_STATES: ReadonlySet<AppAccessState> = new Set<AppAccessState>([
  'prelaunch',
  'active',
  'trialing',
  'cancel_at_period_end',
  'past_due',
  'grace',
  'admin',
  'internal',
]);

/**
 * Project the capability matrix for a state. Production capabilities
 * (use/mutation/ai/terminals/tools/calls/scheduling) are granted only for access
 * states. Data-preserving capabilities (account/billing/legal/localRead/export/
 * backup) are ALWAYS granted so a locked user keeps their data and a way to
 * resolve the lapse; this module never deletes or encrypts local data.
 */
export function deriveCapabilities(state: AppAccessState): AppAccessCapabilities {
  const production = PRODUCTION_STATES.has(state);
  const capabilities: AppAccessCapabilities = {
    use: production,
    mutation: production,
    ai: production,
    terminals: production,
    tools: production,
    calls: production,
    scheduling: production,
    account: true,
    billing: true,
    legal: true,
    localRead: true,
    export: true,
    backup: true,
  };
  return deepFreeze(capabilities);
}

/**
 * Map remaining time to a warning milestone using whole-day boundaries:
 *   >= 8 days  -> null (outside the warning window)
 *   4..7 days  -> 7
 *   2..3 days  -> 3
 *   1 day      -> 1
 *   < 1 day    -> 0 (final day)
 *   <= 0 or invalid -> null (expired; the state machine handles lapse/lock)
 */
export function computeWarningMilestone(msRemaining: number): WarningMilestone | null {
  if (!Number.isFinite(msRemaining) || msRemaining <= 0) return null;
  const fullDays = Math.floor(msRemaining / APP_ACCESS_DAY_MS);
  if (fullDays >= 8) return null;
  if (fullDays >= 4) return 7;
  if (fullDays >= 2) return 3;
  if (fullDays >= 1) return 1;
  return 0;
}

function milestoneLabel(milestone: WarningMilestone): string {
  if (milestone === 7) return '7 days';
  if (milestone === 3) return '3 days';
  if (milestone === 1) return '1 day';
  return 'Final day';
}

/**
 * Build a countdown warning for a kind, or null when outside the warning window.
 * `routeChange` is always false (anti-spam) and `dedupeKey` is stable per
 * (kind, milestone).
 */
function countdownWarning(
  kind: AppAccessWarningKind,
  msRemaining: number,
  action: AppAccessWarningAction,
  actionUrl: string | null,
): AppAccessWarning | null {
  const milestone = computeWarningMilestone(msRemaining);
  if (milestone === null) return null;
  const daysRemaining = Math.max(0, Math.floor(msRemaining / APP_ACCESS_DAY_MS));
  const label = milestoneLabel(milestone);
  let message: string;
  switch (kind) {
    case 'trial_ending':
      message = milestone === 0 ? 'Trial ends today.' : `Trial ends in ${label}.`;
      break;
    case 'cancellation':
      message = milestone === 0 ? 'Access ends today.' : `Access ends in ${label}.`;
      break;
    case 'payment':
      message =
        milestone === 0
          ? 'Payment failed. Update billing today.'
          : `Payment failed. Update billing within ${label}.`;
      break;
    case 'grace':
      message = milestone === 0 ? 'VibeSpace locks today.' : `${label} left before lock.`;
      break;
    default:
      message = 'VibeSpace is locked. Restore access from Billing.';
      break;
  }
  const warning: AppAccessWarning = {
    kind,
    milestone,
    daysRemaining,
    message,
    action,
    actionUrl,
    routeChange: false,
    dedupeKey: `${kind}:${milestone}`,
  };
  return deepFreeze(warning);
}

/** Unconditional warning shown while locked. */
function lockedWarning(actionUrl: string | null): AppAccessWarning {
  const warning: AppAccessWarning = {
    kind: 'locked',
    milestone: 0,
    daysRemaining: 0,
    message: 'VibeSpace is locked. Restore access from Billing.',
    action: 'checkout',
    actionUrl,
    routeChange: false,
    dedupeKey: 'locked:0',
  };
  return deepFreeze(warning);
}

/** Immediate past-due warning when the server has not supplied a deadline. */
function immediatePaymentWarning(actionUrl: string | null): AppAccessWarning {
  return deepFreeze({
    kind: 'payment',
    milestone: 0,
    daysRemaining: 0,
    message: 'Payment failed. Update billing now to prevent an access interruption.',
    action: 'portal',
    actionUrl,
    routeChange: false,
    dedupeKey: 'payment:immediate',
  });
}
/**
 * Evaluate app access from untrusted server inputs. Pure, deterministic, and
 * fail-closed. Resolution order:
 *   1. Server-derived admin/internal bypass launch and version gating (and are
 *      never inferred from local state - only `status.state` can set them).
 *   2. Disabled-by-default launch gating + rollback kill switch -> prelaunch.
 *   3. Strict semantic-version eligibility (malformed -> prelaunch).
 *   4. Time-dependent states require a trustworthy server timestamp else unknown.
 *   5. State machine; lapses derive three full grace days then locked from
 *      server timestamps. This function never deletes or encrypts local data.
 */
export function evaluateAppAccess(input?: AppAccessEvaluationInput): AppAccessResponse {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const config = normalizeLaunchConfig(raw.config);
  const status = normalizeAccessStatus(raw.status);
  const appVersion = raw.appVersion;
  const featurePlan: AppAccessFeaturePlanResult = {
    active: status.featurePlan.active,
    manageable: true,
  };

  const respond = (
    state: AppAccessState,
    extra: {
      warning?: AppAccessWarning | null;
      trialDaysRemaining?: number | null;
      graceDaysRemaining?: number | null;
      checkoutNeeded?: boolean;
    } = {},
  ): AppAccessResponse => {
    const response: AppAccessResponse = {
      state,
      appAccessGranted: PRODUCTION_STATES.has(state),
      locked: state === 'locked',
      failClosed: state === 'unknown',
      checkoutNeeded: extra.checkoutNeeded ?? false,
      capabilities: deriveCapabilities(state),
      warning: extra.warning ?? null,
      trialDaysRemaining: extra.trialDaysRemaining ?? null,
      graceDaysRemaining: extra.graceDaysRemaining ?? null,
      featurePlan,
    };
    return deepFreeze(response);
  };

  // 1. Server-derived admin/internal bypass gating; never inferred locally.
  if (status.state === 'admin' || status.state === 'internal') {
    return respond(status.state);
  }

  // 2. Disabled-by-default launch gating + rollback kill switch.
  if (!config.enabled || config.rollbackEnabled) {
    return respond('prelaunch');
  }

  // 3. Strict semantic-version eligibility (fail closed on malformed version).
  if (!versionEligible(appVersion, config.minVersion)) {
    return respond('prelaunch');
  }

  // 4. Time-dependent decisions require a trustworthy server timestamp.
  if (status.serverTimeMs === null) {
    return respond('unknown');
  }
  const now = status.serverTimeMs;
  const checkoutUrl = config.payment.checkoutUrl;
  const portalUrl = config.payment.portalUrl;
  const graceSpanMs = config.payment.graceDays * APP_ACCESS_DAY_MS;

  // Resolve a lapse into three full grace days, then locked, from server time.
  const graceOrLocked = (lapseStartMs: number): AppAccessResponse => {
    const graceStart = status.graceStartedMs ?? lapseStartMs;
    const graceEnd = graceStart + graceSpanMs;
    if (now < graceEnd) {
      const graceDaysRemaining = Math.max(0, Math.ceil((graceEnd - now) / APP_ACCESS_DAY_MS));
      const warning = countdownWarning('grace', graceEnd - now, 'checkout', checkoutUrl);
      return respond('grace', { warning, graceDaysRemaining, checkoutNeeded: true });
    }
    return respond('locked', { warning: lockedWarning(checkoutUrl), checkoutNeeded: true });
  };

  switch (status.state) {
    case 'active':
      return respond('active');
    case 'trialing': {
      // A valid trial requires an enabled trial policy, a verified account, and a
      // parseable trial start; otherwise fail closed.
      if (!config.trial.enabled || !status.verifiedAccount || status.trialStartedMs === null) {
        return respond('unknown');
      }
      const trialEnd = status.trialStartedMs + config.trial.days * APP_ACCESS_DAY_MS;
      if (now < trialEnd) {
        const trialDaysRemaining = Math.max(0, Math.ceil((trialEnd - now) / APP_ACCESS_DAY_MS));
        const warning = countdownWarning('trial_ending', trialEnd - now, 'checkout', checkoutUrl);
        return respond('trialing', {
          warning,
          trialDaysRemaining,
          checkoutNeeded: warning !== null,
        });
      }
      return graceOrLocked(trialEnd);
    }
    case 'cancel_at_period_end': {
      if (status.periodEndsMs === null) return respond('unknown');
      if (now < status.periodEndsMs) {
        const warning = countdownWarning(
          'cancellation',
          status.periodEndsMs - now,
          'portal',
          portalUrl,
        );
        return respond('cancel_at_period_end', { warning, checkoutNeeded: true });
      }
      return graceOrLocked(status.periodEndsMs);
    }
    case 'past_due': {
      // Dunning keeps access (mirrors subscriptionStatus PAID_ACCESS_STATUSES) but
      // surfaces a payment warning. If a grace window is supplied and has already
      // elapsed, lapse to locked.
      if (status.graceStartedMs !== null) {
        const graceEnd = status.graceStartedMs + graceSpanMs;
        if (now >= graceEnd) {
          return respond('locked', { warning: lockedWarning(checkoutUrl), checkoutNeeded: true });
        }
        const warning = countdownWarning('payment', graceEnd - now, 'portal', portalUrl);
        return respond('past_due', {
          warning: warning ?? lockedWarning(checkoutUrl),
          checkoutNeeded: true,
        });
      }
      return respond('past_due', {
        warning: immediatePaymentWarning(portalUrl),
        checkoutNeeded: true,
      });
    }
    case 'grace': {
      if (status.graceStartedMs === null) return respond('unknown');
      return graceOrLocked(status.graceStartedMs);
    }
    case 'locked':
      return respond('locked', { warning: lockedWarning(checkoutUrl), checkoutNeeded: true });
    case 'prelaunch':
      return respond('prelaunch');
    default:
      return respond('unknown');
  }
}
