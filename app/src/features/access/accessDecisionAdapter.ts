/**
 * Pure server-decision-to-UI adapter for VibeSpace Access.
 *
 * This module converts a validated server access decision
 * (`AccessServerSnapshot` from `./accessGateway`) into one immutable
 * `AppAccessResponse` plus `AccessViewModel` for UI consumers. It is a thin
 * projection boundary: it never re-evaluates billing, deadlines, launch gates,
 * versions, or local entitlement state. The server's authoritative `status`
 * drives the decision; the accepted capability contract (`deriveCapabilities`)
 * and the consumer projection (`createAccessViewModel`) are used only to project
 * and verify that decision, never to recompute it.
 *
 * Design rules enforced here:
 *  - Server authority preserved exactly: `appAccessGranted`/`canEdit`/`export`/
 *    `checkout` and `state` are honored from the snapshot and never broadened.
 *    The snapshot's explicit authority booleans must agree with the accepted
 *    deterministic projection for the stated state; any disagreement is an
 *    inconsistent decision and fails closed.
 *  - `locked` and `unknown` remain unusable; data-preserving capabilities
 *    (account/billing/legal/localRead/export/backup) always remain available.
 *  - Trial/grace countdowns and server dates pass through only for their owning
 *    states. `serverTime` is trusted `capturedAt` metadata only.
 *  - The additive feature plan/tier is projected as typed metadata and can never
 *    grant app access or change the state.
 *  - No synthesis: warnings, checkout success, URLs, navigation, and time
 *    remaining are never invented.
 *  - Fail closed: malformed or inconsistent input throws
 *    `AccessDecisionAdapterError`.
 *  - Immutability and determinism: outputs are deeply frozen; caller inputs are
 *    never mutated or frozen; unknown properties are ignored; identical input
 *    always yields identical output (no clocks, no randomness).
 */

import type { AccessServerSnapshot } from './accessGateway';
import {
  deriveCapabilities,
  type AppAccessCapabilities,
  type AppAccessFeaturePlanInput,
  type AppAccessFeaturePlanResult,
  type AppAccessResponse,
  type AppAccessState,
} from './accessPolicy';
import {
  ACCESS_UI_MAX_DAYS,
  ACCESS_UI_MAX_TIER_LENGTH,
  createAccessViewModel,
  type AccessViewModel,
  type AccessViewModelOptions,
} from './accessViewModel';

/** Recognized server-derived app-access states. */
const ACCESS_STATES: ReadonlySet<string> = new Set<string>([
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

/** Recognized server checkout reasons. */
const CHECKOUT_REASONS: ReadonlySet<string> = new Set<string>([
  'trial_will_convert',
  'payment_failed',
  'grace_period',
  'access_locked',
  'account_verification_required',
]);

/** States that own the paid-through (current period end) server date. */
const PAID_DATE_OWNERS: ReadonlySet<AppAccessState> = new Set<AppAccessState>([
  'active',
  'cancel_at_period_end',
  'past_due',
]);

const MAX_TIMESTAMP_LENGTH = 64;
const ISO_TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u;

export type AccessDecisionAdapterErrorCode =
  | 'malformed_snapshot'
  | 'inconsistent_authority'
  | 'inconsistent_countdown'
  | 'inconsistent_date'
  | 'invalid_feature_plan';

/** Fail-closed rejection of a malformed or inconsistent server access decision. */
export class AccessDecisionAdapterError extends Error {
  readonly code: AccessDecisionAdapterErrorCode;

  constructor(code: AccessDecisionAdapterErrorCode, message: string) {
    super(`accessDecisionAdapter: ${message}`);
    this.name = 'AccessDecisionAdapterError';
    this.code = code;
  }
}

/** One immutable server-decision projection: the decision plus its UI view model. */
export interface AccessDecision {
  readonly response: AppAccessResponse;
  readonly viewModel: AccessViewModel;
}

function fail(code: AccessDecisionAdapterErrorCode, message: string): never {
  throw new AccessDecisionAdapterError(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Recursively freeze an output value; never applied to caller inputs. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return Object.freeze(value);
}

/** Parse a trimmed ISO-8601 timestamp to non-negative Unix milliseconds, or null. */
function parseIsoTimestampMs(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  if (value.length === 0 || value.length > MAX_TIMESTAMP_LENGTH || value.trim() !== value) {
    return null;
  }
  if (!ISO_TIMESTAMP_RE.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isSafeInteger(ms) && ms >= 0 ? ms : null;
}

function requireBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  if (typeof value !== 'boolean') {
    return fail('malformed_snapshot', `"${key}" must be a boolean.`);
  }
  return value;
}

/** Validate an optional server timestamp field; returns the trimmed string or null. */
function nullableTimestamp(value: unknown, key: string): string | null {
  if (value === null || value === undefined) return null;
  if (parseIsoTimestampMs(value) === null) {
    return fail('inconsistent_date', `"${key}" must be null or a trimmed ISO-8601 timestamp.`);
  }
  return value as string;
}

/** Validate the optional whole-day countdown bound accepted by the consumer. */
function validateDaysRemaining(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > ACCESS_UI_MAX_DAYS
  ) {
    return fail(
      'malformed_snapshot',
      `"daysRemaining" must be null or a whole number between 0 and ${ACCESS_UI_MAX_DAYS}.`,
    );
  }
  return value;
}

/** Verify the exact checkout decision pairs emitted by the authoritative RPC. */
function validateCheckoutDecision(
  state: AppAccessState,
  requiresCheckout: boolean,
  checkoutReason: string | null,
): void {
  let valid = false;
  switch (state) {
    case 'trialing':
      valid = requiresCheckout && checkoutReason === 'trial_will_convert';
      break;
    case 'past_due':
      valid = requiresCheckout && checkoutReason === 'payment_failed';
      break;
    case 'grace':
      valid = requiresCheckout && checkoutReason === 'grace_period';
      break;
    case 'locked':
      valid =
        (requiresCheckout && checkoutReason === 'access_locked') ||
        (!requiresCheckout && checkoutReason === 'account_verification_required');
      break;
    default:
      valid = !requiresCheckout && checkoutReason === null;
      break;
  }
  if (!valid) {
    return fail(
      'inconsistent_authority',
      `checkout metadata disagrees with the "${state}" server decision.`,
    );
  }
}

interface ResolvedFeaturePlan {
  readonly result: AppAccessFeaturePlanResult;
  readonly tier: string | undefined;
}

/** Project the additive feature plan; metadata only, never grants app access. */
function resolveFeaturePlan(
  input: AppAccessFeaturePlanInput | null | undefined,
): ResolvedFeaturePlan {
  if (input === null || input === undefined) {
    return { result: { active: false, manageable: true }, tier: undefined };
  }
  const plan: unknown = input;
  if (!isRecord(plan)) {
    return fail('invalid_feature_plan', 'featurePlan must be an object when provided.');
  }
  const active = plan.active;
  if (active !== undefined && typeof active !== 'boolean') {
    return fail('invalid_feature_plan', '"featurePlan.active" must be a boolean when provided.');
  }
  const tier = plan.tier;
  if (tier !== undefined && tier !== null) {
    if (
      typeof tier !== 'string' ||
      tier.trim() !== tier ||
      tier.length === 0 ||
      tier.length > ACCESS_UI_MAX_TIER_LENGTH
    ) {
      return fail(
        'invalid_feature_plan',
        `"featurePlan.tier" must be a trimmed string of 1 to ${ACCESS_UI_MAX_TIER_LENGTH} characters.`,
      );
    }
    return { result: { active: active === true, manageable: true }, tier };
  }
  return { result: { active: active === true, manageable: true }, tier: undefined };
}

/**
 * Convert a validated server access decision into an immutable AppAccessResponse
 * plus AccessViewModel. Pure, deterministic, and fail-closed. The optional
 * feature plan is additive metadata only and can never grant app access.
 */
export function adaptAccessDecision(
  snapshot: AccessServerSnapshot,
  featurePlan?: AppAccessFeaturePlanInput | null,
): AccessDecision {
  // Structural well-formedness (defense in depth; fail closed).
  const input: unknown = snapshot;
  if (!isRecord(input)) {
    return fail('malformed_snapshot', 'snapshot must be an AccessServerSnapshot object.');
  }
  const status = input.status;
  if (typeof status !== 'string' || !ACCESS_STATES.has(status)) {
    return fail('malformed_snapshot', '"status" is not a recognized app-access state.');
  }
  const state = status as AppAccessState;

  // Launch gating is server-decided and not re-evaluated here; require well-formedness only.
  requireBoolean(input, 'enabled');
  const canUseApp = requireBoolean(input, 'canUseApp');
  const canEdit = requireBoolean(input, 'canEdit');
  const canExport = requireBoolean(input, 'canExport');
  const requiresCheckout = requireBoolean(input, 'requiresCheckout');

  const capturedAt = parseIsoTimestampMs(input.serverTime);
  if (capturedAt === null) {
    return fail('malformed_snapshot', '"serverTime" must be a trimmed ISO-8601 timestamp.');
  }

  const checkoutReason = input.checkoutReason;
  if (
    checkoutReason !== null &&
    (typeof checkoutReason !== 'string' || !CHECKOUT_REASONS.has(checkoutReason))
  ) {
    return fail('malformed_snapshot', '"checkoutReason" must be null or a recognized reason.');
  }

  const daysRemaining = validateDaysRemaining(input.daysRemaining);
  const trialEndsAt = nullableTimestamp(input.trialEndsAt, 'trialEndsAt');
  const currentPeriodEndsAt = nullableTimestamp(input.currentPeriodEndsAt, 'currentPeriodEndsAt');
  const graceEndsAt = nullableTimestamp(input.graceEndsAt, 'graceEndsAt');

  // Accepted capability contract for the authoritative state.
  const capabilities: AppAccessCapabilities = deriveCapabilities(state);
  const locked = state === 'locked';
  const failClosed = state === 'unknown';

  // Preserve server authority exactly; never broaden; fail closed on mismatch.
  if (canUseApp !== capabilities.use) {
    return fail('inconsistent_authority', `"canUseApp" disagrees with the "${state}" decision.`);
  }
  if (canEdit !== capabilities.mutation) {
    return fail('inconsistent_authority', `"canEdit" disagrees with the "${state}" decision.`);
  }
  if (canExport !== capabilities.export) {
    return fail('inconsistent_authority', `"canExport" disagrees with the "${state}" decision.`);
  }
  validateCheckoutDecision(state, requiresCheckout, checkoutReason as string | null);

  // The server also returns period countdowns for active/cancellation. Validate
  // the shared field, but expose only the trial/grace countdowns represented by
  // AppAccessResponse.
  if (state === 'trialing' && daysRemaining === null) {
    return fail('inconsistent_countdown', 'the "trialing" state requires "daysRemaining".');
  }
  if (state === 'grace' && daysRemaining === null) {
    return fail('inconsistent_countdown', 'the "grace" state requires "daysRemaining".');
  }
  const trialDaysRemaining = state === 'trialing' ? daysRemaining : null;
  const graceDaysRemaining = state === 'grace' ? daysRemaining : null;

  // Historical timestamps can coexist on an entitlement row. Validate every
  // supplied value, require the current state's primary deadline, and project
  // only dates that belong to the current state.
  if (state === 'trialing' && trialEndsAt === null) {
    return fail('inconsistent_date', 'the "trialing" state requires "trialEndsAt".');
  }
  if (PAID_DATE_OWNERS.has(state) && currentPeriodEndsAt === null) {
    return fail('inconsistent_date', `the "${state}" state requires "currentPeriodEndsAt".`);
  }
  if (state === 'grace' && graceEndsAt === null) {
    return fail('inconsistent_date', 'the "grace" state requires "graceEndsAt".');
  }

  // Additive feature plan/tier (never grants app access).
  const feature = resolveFeaturePlan(featurePlan);

  const response: AppAccessResponse = {
    state,
    appAccessGranted: canUseApp,
    locked,
    failClosed,
    checkoutNeeded: requiresCheckout,
    capabilities,
    warning: null,
    trialDaysRemaining,
    graceDaysRemaining,
    featurePlan: feature.result,
  };
  deepFreeze(response);

  const options: AccessViewModelOptions = {
    featureTier: feature.tier,
    capturedAt,
    dates: {
      trialEndsAt: state === 'trialing' ? trialEndsAt : null,
      paidThroughDate: PAID_DATE_OWNERS.has(state) ? currentPeriodEndsAt : null,
      graceEndsAt: state === 'grace' ? graceEndsAt : null,
    },
  };

  const viewModel = createAccessViewModel(response, options);
  return deepFreeze({ response, viewModel });
}
