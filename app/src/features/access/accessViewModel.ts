/**
 * VibeSpace Access UI/view-model adapter (pure client module).
 *
 * This module projects the accepted, authoritative `AppAccessResponse`
 * (produced by `evaluateAppAccess` in `./accessPolicy`) into one immutable
 * `AccessViewModel` consumed by `AccessHost`, `AccessBanner`, and
 * `AccessPaywall`.
 *
 * Design rules enforced here:
 *  - No entitlement recomputation: this module never inspects launch config,
 *    server status snapshots, timestamps, or versions. The response's
 *    `appAccessGranted`/`locked`/`failClosed` decisions are final. The only
 *    authority helper used is `deriveCapabilities`, applied solely to verify
 *    that the decision artifact is internally consistent with its own state.
 *  - Honest display: `prelaunch` maps to the prelaunch display, `admin` and
 *    `internal` map to an honest usable `active` display while the raw state
 *    is preserved, `cancel_at_period_end` maps to `cancel-at-period-end`, and
 *    `locked`/`unknown` fail closed (never usable).
 *  - Additive feature tier: the feature tier is display metadata only; it can
 *    never grant app access or change the display state.
 *  - Exact server data: countdowns come from the response and server dates are
 *    optional pass-through metadata. This module never computes deadlines,
 *    navigation, callbacks, checkout success, or billing authority.
 *  - Fail closed: malformed or internally inconsistent responses (including
 *    impossible grants such as usable+locked) throw `AccessViewModelError`.
 *  - Immutability and determinism: outputs are deeply frozen and identical
 *    input always yields identical output (no clocks, no randomness).
 */

import { deriveCapabilities } from './accessPolicy';
import type {
  AppAccessCapabilities,
  AppAccessFeaturePlanResult,
  AppAccessState,
  AppAccessWarning,
  AppAccessWarningAction,
  AppAccessWarningKind,
  WarningMilestone,
} from './accessPolicy';
import type { AccessBannerProps } from './AccessBanner';
import type { AccessHostSnapshot } from './AccessHost';
import type { AccessDisplayState, AccessPaywallProps } from './AccessPaywall';

/** Largest whole-day countdown the UI will ever display. */
export const ACCESS_UI_MAX_DAYS = 3650;
/** Longest feature-tier label the UI accepts. */
export const ACCESS_UI_MAX_TIER_LENGTH = 64;
/** Longest warning message the UI accepts. */
export const ACCESS_UI_MAX_MESSAGE_LENGTH = 500;
/** Non-empty sentinel tier used when no additive feature tier is supplied. */
export const DEFAULT_FEATURE_TIER = 'unknown';

export type AccessViewModelErrorCode =
  | 'invalid_response'
  | 'invalid_warning'
  | 'invalid_countdown'
  | 'invalid_feature_tier'
  | 'invalid_captured_at'
  | 'invalid_date'
  | 'impossible_grant'
  | 'inconsistent_flags'
  | 'inconsistent_capabilities'
  | 'inconsistent_warning'
  | 'inconsistent_countdown'
  | 'inconsistent_checkout'
  | 'inconsistent_feature_plan';

/** Fail-closed rejection of a malformed or inconsistent access decision. */
export class AccessViewModelError extends Error {
  readonly code: AccessViewModelErrorCode;

  constructor(code: AccessViewModelErrorCode, message: string) {
    super(`accessViewModel: ${message}`);
    this.name = 'AccessViewModelError';
    this.code = code;
  }
}

/** Display metadata for AccessBanner, excluding callbacks and runtime state. */
export type AccessBannerProjection = Pick<
  AccessBannerProps,
  'displayState' | 'trialDaysRemaining' | 'trialEndsAt' | 'paidThroughDate' | 'graceEndsAt'
> & {
  /** Whether the banner renders anything for this state. */
  readonly visible: boolean;
};

/** Display metadata for AccessPaywall, excluding callbacks and runtime state. */
export type AccessPaywallProjection = Pick<
  AccessPaywallProps,
  | 'displayState'
  | 'featureTier'
  | 'trialDaysRemaining'
  | 'trialEndDate'
  | 'graceDaysRemaining'
  | 'graceEndDate'
  | 'paidThroughDate'
> & {
  /** The paywall/access screen is the gate shown when access is not usable. */
  readonly visible: boolean;
};

/** One immutable projection serving all three access consumers. */
export interface AccessViewModel {
  readonly state: AppAccessState;
  readonly displayState: AccessDisplayState;
  readonly usable: boolean;
  readonly locked: boolean;
  readonly failClosed: boolean;
  readonly checkoutNeeded: boolean;
  readonly capabilities: AppAccessCapabilities;
  readonly warning: AppAccessWarning | null;
  readonly featurePlan: AppAccessFeaturePlanResult;
  readonly featureTier: string;
  readonly capturedAt: number;
  readonly trialDaysRemaining: number | null;
  readonly graceDaysRemaining: number | null;
  readonly trialEndsAt: string | null;
  readonly paidThroughDate: string | null;
  readonly graceEndsAt: string | null;
  readonly host: AccessHostSnapshot;
  readonly banner: AccessBannerProjection;
  readonly paywall: AccessPaywallProjection;
}

/** Optional server-provided dates. Never computed locally. */
export interface AccessViewModelDates {
  readonly trialEndsAt?: unknown;
  readonly paidThroughDate?: unknown;
  readonly graceEndsAt?: unknown;
}

export interface AccessViewModelOptions {
  readonly featureTier?: unknown;
  readonly capturedAt?: unknown;
  readonly dates?: AccessViewModelDates | null;
}

const APP_ACCESS_STATES: readonly AppAccessState[] = [
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

const STATE_TO_DISPLAY: Record<AppAccessState, AccessDisplayState> = {
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

const WARNING_KINDS: readonly AppAccessWarningKind[] = [
  'trial_ending',
  'cancellation',
  'payment',
  'grace',
  'locked',
];

const WARNING_ACTIONS: readonly AppAccessWarningAction[] = ['checkout', 'portal', 'none'];

/** Warning kinds the accepted authority can emit for each state. */
const WARNING_KINDS_BY_STATE: Record<AppAccessState, readonly AppAccessWarningKind[]> = {
  prelaunch: [],
  trialing: ['trial_ending'],
  active: [],
  cancel_at_period_end: ['cancellation'],
  past_due: ['payment'],
  grace: ['grace'],
  locked: ['locked'],
  admin: [],
  internal: [],
  unknown: [],
};

/** Whole-day bands the authority's milestone computation can produce. */
const MILESTONE_DAY_BANDS: Record<WarningMilestone, readonly [number, number]> = {
  7: [4, 7],
  3: [2, 3],
  1: [1, 1],
  0: [0, 0],
};

const CAPABILITY_KEYS: readonly (keyof AppAccessCapabilities)[] = [
  'use',
  'mutation',
  'ai',
  'terminals',
  'tools',
  'calls',
  'scheduling',
  'account',
  'billing',
  'legal',
  'localRead',
  'export',
  'backup',
];

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u;

/** Recursively freeze a value so consumers cannot mutate results. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return Object.freeze(value);
}

function fail(code: AccessViewModelErrorCode, message: string): never {
  throw new AccessViewModelError(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  if (typeof value !== 'boolean') {
    return fail('invalid_response', `"${key}" must be a boolean.`);
  }
  return value;
}

/** Only credential-free HTTPS URLs may cross this UI-facing boundary. */
function isSafeHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() === '') return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname !== '' &&
      parsed.username === '' &&
      parsed.password === ''
    );
  } catch {
    return false;
  }
}

function validateCapabilities(value: unknown): AppAccessCapabilities {
  if (!isRecord(value)) {
    return fail('invalid_response', '"capabilities" must be an object.');
  }
  for (const key of CAPABILITY_KEYS) {
    if (typeof value[key] !== 'boolean') {
      return fail('invalid_response', `"capabilities.${key}" must be a boolean.`);
    }
  }
  return {
    use: value.use as boolean,
    mutation: value.mutation as boolean,
    ai: value.ai as boolean,
    terminals: value.terminals as boolean,
    tools: value.tools as boolean,
    calls: value.calls as boolean,
    scheduling: value.scheduling as boolean,
    account: value.account as boolean,
    billing: value.billing as boolean,
    legal: value.legal as boolean,
    localRead: value.localRead as boolean,
    export: value.export as boolean,
    backup: value.backup as boolean,
  };
}

function validateCountdown(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > ACCESS_UI_MAX_DAYS
  ) {
    return fail(
      'invalid_countdown',
      `"${label}" must be null or a whole number between 0 and ${ACCESS_UI_MAX_DAYS}.`,
    );
  }
  return value;
}

function validateFeaturePlan(value: unknown): AppAccessFeaturePlanResult {
  if (!isRecord(value)) {
    return fail('invalid_response', '"featurePlan" must be an object.');
  }
  if (typeof value.active !== 'boolean') {
    return fail('invalid_response', '"featurePlan.active" must be a boolean.');
  }
  if (typeof value.manageable !== 'boolean') {
    return fail('invalid_response', '"featurePlan.manageable" must be a boolean.');
  }
  return {
    active: value.active,
    manageable: value.manageable,
  };
}

function validateWarning(value: unknown, state: AppAccessState): AppAccessWarning {
  if (!isRecord(value)) {
    return fail('invalid_response', '"warning" must be an object or null.');
  }
  const kind = value.kind;
  if (typeof kind !== 'string' || !WARNING_KINDS.includes(kind as AppAccessWarningKind)) {
    return fail('invalid_warning', '"warning.kind" is not a recognized warning kind.');
  }
  const typedKind = kind as AppAccessWarningKind;
  const milestone = value.milestone;
  if (milestone !== 0 && milestone !== 1 && milestone !== 3 && milestone !== 7) {
    return fail('invalid_warning', '"warning.milestone" must be one of 0, 1, 3, or 7.');
  }
  const typedMilestone = milestone as WarningMilestone;
  const daysRemaining = value.daysRemaining;
  if (
    typeof daysRemaining !== 'number' ||
    !Number.isSafeInteger(daysRemaining) ||
    daysRemaining < 0 ||
    daysRemaining > 7
  ) {
    return fail(
      'invalid_warning',
      '"warning.daysRemaining" must be a whole number between 0 and 7.',
    );
  }
  const message = value.message;
  if (
    typeof message !== 'string' ||
    message.trim() === '' ||
    message.length > ACCESS_UI_MAX_MESSAGE_LENGTH
  ) {
    return fail(
      'invalid_warning',
      `"warning.message" must be a non-empty string of at most ${ACCESS_UI_MAX_MESSAGE_LENGTH} characters.`,
    );
  }
  const action = value.action;
  if (typeof action !== 'string' || !WARNING_ACTIONS.includes(action as AppAccessWarningAction)) {
    return fail('invalid_warning', '"warning.action" is not a recognized warning action.');
  }
  const actionUrl = value.actionUrl;
  if (actionUrl !== null && !isSafeHttpsUrl(actionUrl)) {
    return fail(
      'invalid_warning',
      '"warning.actionUrl" must be null or a credential-free HTTPS URL.',
    );
  }
  if (value.routeChange !== false) {
    return fail('invalid_warning', '"warning.routeChange" must be false; warnings never navigate.');
  }
  const dedupeKey = value.dedupeKey;
  if (typeof dedupeKey !== 'string' || dedupeKey === '') {
    return fail('invalid_warning', '"warning.dedupeKey" must be a non-empty string.');
  }
  // Consistency with the accepted authority's deterministic warning shape.
  if (!WARNING_KINDS_BY_STATE[state].includes(typedKind)) {
    return fail(
      'inconsistent_warning',
      `A "${typedKind}" warning cannot belong to the "${state}" state.`,
    );
  }
  const [minDays, maxDays] = MILESTONE_DAY_BANDS[typedMilestone];
  if (daysRemaining < minDays || daysRemaining > maxDays) {
    return fail(
      'inconsistent_warning',
      `"warning.daysRemaining" ${daysRemaining} is impossible for milestone ${typedMilestone}.`,
    );
  }
  const expectedKey = `${typedKind}:${typedMilestone}`;
  const immediateAllowed =
    typedKind === 'payment' && typedMilestone === 0 && dedupeKey === 'payment:immediate';
  if (dedupeKey !== expectedKey && !immediateAllowed) {
    return fail(
      'inconsistent_warning',
      `"warning.dedupeKey" "${dedupeKey}" does not match "${expectedKey}".`,
    );
  }
  if (action === 'none' && actionUrl !== null) {
    return fail('inconsistent_warning', 'A warning with action "none" cannot carry an action URL.');
  }
  return {
    kind: typedKind,
    milestone: typedMilestone,
    daysRemaining,
    message,
    action: action as AppAccessWarningAction,
    actionUrl,
    routeChange: false,
    dedupeKey,
  };
}

function validateServerDate(value: unknown, label: string): string {
  if (typeof value !== 'string' || value === '' || value.trim() !== value) {
    return fail('invalid_date', `"${label}" must be a trimmed ISO date or timestamp string.`);
  }
  const dateOnly = DATE_ONLY_RE.exec(value);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const utc = new Date(Date.UTC(year, month - 1, day));
    if (
      utc.getUTCFullYear() !== year ||
      utc.getUTCMonth() !== month - 1 ||
      utc.getUTCDate() !== day
    ) {
      return fail('invalid_date', `"${label}" is not a valid calendar date.`);
    }
    return value;
  }
  if (TIMESTAMP_RE.test(value)) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed >= 0) return value;
  }
  return fail('invalid_date', `"${label}" must be an ISO-8601 date (YYYY-MM-DD) or timestamp.`);
}

interface ResolvedOptions {
  readonly featureTier: string;
  readonly capturedAt: number;
  readonly trialEndsAt: string | null;
  readonly paidThroughDate: string | null;
  readonly graceEndsAt: string | null;
}

function resolveOptions(options: AccessViewModelOptions | undefined): ResolvedOptions {
  const opts = options ?? {};
  let featureTier = DEFAULT_FEATURE_TIER;
  if (opts.featureTier !== undefined && opts.featureTier !== null) {
    if (
      typeof opts.featureTier !== 'string' ||
      opts.featureTier.trim() !== opts.featureTier ||
      opts.featureTier.length === 0 ||
      opts.featureTier.length > ACCESS_UI_MAX_TIER_LENGTH
    ) {
      return fail(
        'invalid_feature_tier',
        `featureTier must be a trimmed string of 1 to ${ACCESS_UI_MAX_TIER_LENGTH} characters.`,
      );
    }
    featureTier = opts.featureTier;
  }
  let capturedAt = 0;
  if (opts.capturedAt !== undefined && opts.capturedAt !== null) {
    if (
      typeof opts.capturedAt !== 'number' ||
      !Number.isSafeInteger(opts.capturedAt) ||
      opts.capturedAt < 0
    ) {
      return fail(
        'invalid_captured_at',
        'capturedAt must be a non-negative safe integer of Unix milliseconds.',
      );
    }
    capturedAt = opts.capturedAt;
  }
  let trialEndsAt: string | null = null;
  let paidThroughDate: string | null = null;
  let graceEndsAt: string | null = null;
  if (opts.dates !== undefined && opts.dates !== null) {
    if (!isRecord(opts.dates)) {
      return fail('invalid_date', 'dates must be an object of server-provided date strings.');
    }
    const dates = opts.dates;
    if (dates.trialEndsAt !== undefined && dates.trialEndsAt !== null) {
      trialEndsAt = validateServerDate(dates.trialEndsAt, 'dates.trialEndsAt');
    }
    if (dates.paidThroughDate !== undefined && dates.paidThroughDate !== null) {
      paidThroughDate = validateServerDate(dates.paidThroughDate, 'dates.paidThroughDate');
    }
    if (dates.graceEndsAt !== undefined && dates.graceEndsAt !== null) {
      graceEndsAt = validateServerDate(dates.graceEndsAt, 'dates.graceEndsAt');
    }
  }
  return { featureTier, capturedAt, trialEndsAt, paidThroughDate, graceEndsAt };
}

interface ValidatedResponse {
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

function validateResponse(response: unknown): ValidatedResponse {
  if (!isRecord(response)) {
    return fail('invalid_response', 'response must be an AppAccessResponse object.');
  }
  const state = response.state;
  if (typeof state !== 'string' || !APP_ACCESS_STATES.includes(state as AppAccessState)) {
    return fail('invalid_response', '"state" is not a recognized app-access state.');
  }
  const typedState = state as AppAccessState;
  const appAccessGranted = requireBoolean(response, 'appAccessGranted');
  const locked = requireBoolean(response, 'locked');
  const failClosed = requireBoolean(response, 'failClosed');
  const checkoutNeeded = requireBoolean(response, 'checkoutNeeded');
  const capabilities = validateCapabilities(response.capabilities);
  const featurePlan = validateFeaturePlan(response.featurePlan);
  const trialDaysRemaining = validateCountdown(response.trialDaysRemaining, 'trialDaysRemaining');
  const graceDaysRemaining = validateCountdown(response.graceDaysRemaining, 'graceDaysRemaining');
  const warning = response.warning === null ? null : validateWarning(response.warning, typedState);

  // Impossible grants: access can never be usable while locked or unknown.
  if (appAccessGranted && (typedState === 'locked' || typedState === 'unknown')) {
    return fail('impossible_grant', `access cannot be granted while the state is "${typedState}".`);
  }
  // Decision flags must agree with the authoritative state.
  if (locked !== (typedState === 'locked')) {
    return fail('inconsistent_flags', '"locked" must be true exactly when the state is "locked".');
  }
  if (failClosed !== (typedState === 'unknown')) {
    return fail(
      'inconsistent_flags',
      '"failClosed" must be true exactly when the state is "unknown".',
    );
  }
  // Capabilities must match the accepted authority's deterministic projection,
  // and the grant must match the capability matrix. This compares the artifact
  // against the authority's own pure projection; it never re-evaluates inputs.
  const expected = deriveCapabilities(typedState);
  for (const key of CAPABILITY_KEYS) {
    if (capabilities[key] !== expected[key]) {
      return fail(
        'inconsistent_capabilities',
        `"capabilities.${key}" disagrees with the "${typedState}" state.`,
      );
    }
  }
  if (appAccessGranted !== capabilities.use) {
    return fail(
      'inconsistent_capabilities',
      '"appAccessGranted" disagrees with "capabilities.use".',
    );
  }
  // Each countdown belongs to exactly one state.
  if (trialDaysRemaining !== null && typedState !== 'trialing') {
    return fail(
      'inconsistent_countdown',
      '"trialDaysRemaining" is only valid for the "trialing" state.',
    );
  }
  if (trialDaysRemaining === null && typedState === 'trialing') {
    return fail(
      'inconsistent_countdown',
      'the "trialing" state always carries "trialDaysRemaining".',
    );
  }
  if (graceDaysRemaining !== null && typedState !== 'grace') {
    return fail(
      'inconsistent_countdown',
      '"graceDaysRemaining" is only valid for the "grace" state.',
    );
  }
  if (graceDaysRemaining === null && typedState === 'grace') {
    return fail('inconsistent_countdown', 'the "grace" state always carries "graceDaysRemaining".');
  }
  // Checkout metadata is deterministic per state in the accepted authority.
  const expectedCheckout =
    typedState === 'trialing'
      ? warning !== null
      : typedState === 'cancel_at_period_end' ||
        typedState === 'past_due' ||
        typedState === 'grace' ||
        typedState === 'locked';
  if (checkoutNeeded !== expectedCheckout) {
    return fail(
      'inconsistent_checkout',
      `"checkoutNeeded" must be ${String(expectedCheckout)} for the "${typedState}" state.`,
    );
  }
  if (featurePlan.manageable !== true) {
    return fail('inconsistent_feature_plan', '"featurePlan.manageable" must always be true.');
  }
  return {
    state: typedState,
    appAccessGranted,
    locked,
    failClosed,
    checkoutNeeded,
    capabilities,
    warning,
    trialDaysRemaining,
    graceDaysRemaining,
    featurePlan,
  };
}

function buildBanner(
  displayState: AccessDisplayState,
  trialDaysRemaining: number | null,
  resolved: ResolvedOptions,
): AccessBannerProjection {
  switch (displayState) {
    case 'trialing': {
      if (trialDaysRemaining === null || trialDaysRemaining > 7) {
        return { visible: false, displayState };
      }
      return {
        visible: true,
        displayState,
        trialDaysRemaining,
        ...(resolved.trialEndsAt !== null ? { trialEndsAt: resolved.trialEndsAt } : {}),
      };
    }
    case 'cancel-at-period-end':
      return {
        visible: true,
        displayState,
        ...(resolved.paidThroughDate !== null ? { paidThroughDate: resolved.paidThroughDate } : {}),
      };
    case 'past-due':
      return { visible: true, displayState };
    case 'grace':
      return {
        visible: true,
        displayState,
        ...(resolved.graceEndsAt !== null ? { graceEndsAt: resolved.graceEndsAt } : {}),
      };
    default:
      return { visible: false, displayState };
  }
}

function buildPaywall(
  displayState: AccessDisplayState,
  usable: boolean,
  featureTier: string,
  trialDaysRemaining: number | null,
  graceDaysRemaining: number | null,
  resolved: ResolvedOptions,
): AccessPaywallProjection {
  const visible = !usable;
  switch (displayState) {
    case 'trialing':
      return {
        visible,
        displayState,
        featureTier,
        ...(trialDaysRemaining !== null ? { trialDaysRemaining } : {}),
        ...(resolved.trialEndsAt !== null ? { trialEndDate: resolved.trialEndsAt } : {}),
      };
    case 'active':
      return {
        visible,
        displayState,
        featureTier,
        ...(resolved.paidThroughDate !== null ? { paidThroughDate: resolved.paidThroughDate } : {}),
      };
    case 'cancel-at-period-end':
      return {
        visible,
        displayState,
        featureTier,
        ...(resolved.paidThroughDate !== null ? { paidThroughDate: resolved.paidThroughDate } : {}),
      };
    case 'grace':
      return {
        visible,
        displayState,
        featureTier,
        ...(graceDaysRemaining !== null ? { graceDaysRemaining } : {}),
        ...(resolved.graceEndsAt !== null ? { graceEndDate: resolved.graceEndsAt } : {}),
      };
    default:
      return { visible, displayState, featureTier };
  }
}

/**
 * Project one immutable AccessViewModel from an authoritative access decision.
 * Pure, deterministic, and fail-closed. Throws `AccessViewModelError` for
 * malformed or internally inconsistent input; never recomputes entitlement.
 */
export function createAccessViewModel(
  response: unknown,
  options?: AccessViewModelOptions,
): AccessViewModel {
  const validated = validateResponse(response);
  const resolved = resolveOptions(options);
  const displayState = STATE_TO_DISPLAY[validated.state];
  const usable = validated.appAccessGranted;

  const host: AccessHostSnapshot = {
    displayState,
    featureTier: resolved.featureTier,
    usable,
    capturedAt: resolved.capturedAt,
  };
  const banner = buildBanner(displayState, validated.trialDaysRemaining, resolved);
  const paywall = buildPaywall(
    displayState,
    usable,
    resolved.featureTier,
    validated.trialDaysRemaining,
    validated.graceDaysRemaining,
    resolved,
  );

  const viewModel: AccessViewModel = {
    state: validated.state,
    displayState,
    usable,
    locked: validated.locked,
    failClosed: validated.failClosed,
    checkoutNeeded: validated.checkoutNeeded,
    capabilities: validated.capabilities,
    warning: validated.warning,
    featurePlan: validated.featurePlan,
    featureTier: resolved.featureTier,
    capturedAt: resolved.capturedAt,
    trialDaysRemaining: validated.trialDaysRemaining,
    graceDaysRemaining: validated.graceDaysRemaining,
    trialEndsAt: resolved.trialEndsAt,
    paidThroughDate: resolved.paidThroughDate,
    graceEndsAt: resolved.graceEndsAt,
    host,
    banner,
    paywall,
  };
  return deepFreeze(viewModel);
}
