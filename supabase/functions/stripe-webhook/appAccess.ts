// appAccess.ts - pure, dependency-free reconciliation boundary for Stripe
// app-access (VibeSpace Access) webhooks.
//
// Scope (ACCESS-195..206, 213, 216-228, 337, 341-350, 362-363):
//   * Accept ONLY already-signature-verified, bounded event projections. The
//     existing stripe-webhook/index.ts handler verifies signatures and extracts
//     these fields; this module never sees a raw Stripe payload or a secret.
//   * Classify app access EXCLUSIVELY by configured known app-access price ids.
//     Unknown/feature-tier prices yield an explicit ignored result and NEVER
//     mutate profiles.tier or any feature-plan state.
//   * Produce deterministic, SEPARATE app_access_entitlements upsert commands
//     and minimal app_access_events audit commands (provider event id dedupe,
//     no raw payloads, no secrets).
//   * Safe for duplicate and out-of-order delivery via provider created time vs
//     the current entitlement's provider_status_updated_at; stale events are
//     ignored without rolling state backward, while newer recovery restores.
//   * Fail closed on invalid ids/statuses/timestamps; preserve account
//     isolation; immutable inputs/outputs.
//
// Integration-ready pure module: it returns commands only and performs no I/O,
// no network, and no Git/coordination mutation. A later coordinator change wires
// it into index.ts (read the current entitlement, pre-check provider_event_id
// dedupe, then apply the returned commands with the service role).

// --- constants --------------------------------------------------------------
const SUPPORTED_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'customer.subscription.trial_will_end',
];
const PROVIDER_STATUSES = [
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'incomplete',
  'incomplete_expired',
  'paused',
];
const APP_ACCESS_STATUSES = [
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
const ENDED_STATUSES = ['canceled', 'unpaid', 'incomplete_expired'];
const RECOVERY_STATUSES = ['past_due', 'grace', 'locked'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_SECONDS = 86400;
const MAX_UNIX_SECONDS = 253402300799;
const MAX_GRACE_DAYS = 365;
const MAX_PRICE_IDS = 100;
const ACCESS_PRODUCT = 'vibespace_access';

// --- small pure helpers -----------------------------------------------------
function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}
function isUnixSeconds(n: unknown): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= MAX_UNIX_SECONDS;
}
function isBoundedText(s: unknown, max: number): s is string {
  return typeof s === 'string' && s.length >= 1 && s.length <= max;
}
function isBoundedProviderId(value: unknown): value is string {
  return isBoundedText(value, 255) && /^[\x21-\x7e]+$/.test(value);
}
function isoFromUnix(unix: number): string {
  return new Date(unix * 1000).toISOString();
}
function unixFromIso(iso: unknown): number | null {
  if (typeof iso !== 'string' || iso === '') return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}
function deepFreeze(value: any): any {
  if (Array.isArray(value)) {
    value.forEach(deepFreeze);
    return Object.freeze(value);
  }
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k]);
    return Object.freeze(value);
  }
  return value;
}
function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null;
}

function validateConfig(config: any): boolean {
  if (!config || typeof config !== 'object') return false;
  if (
    !Number.isSafeInteger(config.graceDays) ||
    config.graceDays < 0 ||
    config.graceDays > MAX_GRACE_DAYS
  ) {
    return false;
  }
  if (
    !Array.isArray(config.knownPriceIds) ||
    config.knownPriceIds.length < 1 ||
    config.knownPriceIds.length > MAX_PRICE_IDS
  ) {
    return false;
  }
  return config.knownPriceIds.every(isBoundedProviderId);
}

function validatePriceIds(priceIds: any): boolean {
  return (
    Array.isArray(priceIds) &&
    priceIds.length >= 1 &&
    priceIds.length <= MAX_PRICE_IDS &&
    priceIds.every(isBoundedProviderId)
  );
}

// Classify the app-access price exclusively by configured known price ids.
function classifyPrice(priceIds: string[], knownPriceIds: string[]): string | false | null {
  const known = new Set(knownPriceIds);
  let matched = null;
  for (const p of priceIds) {
    if (!known.has(p)) continue;
    if (matched !== null && matched !== p) return false;
    matched = p;
  }
  return matched;
}

// Derive the authoritative AppAccessStatus from provider state.
function deriveStatus(
  providerStatus: string,
  cancelAtPeriodEnd: boolean,
  endedUnix: number,
  graceDays: number,
  eventCreated: number,
): string {
  if (providerStatus === 'trialing') return 'trialing';
  if (providerStatus === 'active') return cancelAtPeriodEnd ? 'cancel_at_period_end' : 'active';
  if (providerStatus === 'past_due') return 'past_due';
  if (providerStatus === 'paused' || providerStatus === 'incomplete') return 'past_due';
  if (ENDED_STATUSES.indexOf(providerStatus) !== -1) {
    if (graceDays > 0 && eventCreated < endedUnix + graceDays * DAY_SECONDS) return 'grace';
    return 'locked';
  }
  return 'active';
}

// Validate the bounded subscription projection; returns an invalid reason or null.
function validateSubscription(sub: any): string | null {
  if (!sub || typeof sub !== 'object') return 'no_subscription';
  if (typeof sub.status !== 'string' || PROVIDER_STATUSES.indexOf(sub.status) === -1)
    return 'bad_subscription_status';
  if (typeof sub.cancelAtPeriodEnd !== 'boolean') return 'bad_cancel_at_period_end';
  const ps = sub.currentPeriodStart;
  const pe = sub.currentPeriodEnd;
  if ((ps != null && !isUnixSeconds(ps)) || (pe != null && !isUnixSeconds(pe)))
    return 'bad_period_bounds';
  if (ps != null && pe != null && ps > pe) return 'bad_period_bounds';
  const ts = sub.trialStart;
  const te = sub.trialEnd;
  if ((ts != null && !isUnixSeconds(ts)) || (te != null && !isUnixSeconds(te)))
    return 'bad_trial_bounds';
  if (ts != null && te != null && ts > te) return 'bad_trial_bounds';
  if (sub.endedAt != null && !isUnixSeconds(sub.endedAt)) return 'bad_ended_at';
  return null;
}

function validateGraceBounds(sub: any, eventCreated: number, graceDays: number): string | null {
  if (ENDED_STATUSES.indexOf(sub.status) === -1) return null;
  const endedUnix = sub.endedAt != null ? sub.endedAt : eventCreated;
  if (endedUnix > MAX_UNIX_SECONDS - graceDays * DAY_SECONDS) return 'bad_grace_bounds';
  return null;
}

function validateInvoice(invoice: any, failed: boolean): string | null {
  if (!invoice || typeof invoice !== 'object') return 'no_invoice';
  if (typeof invoice.paid !== 'boolean' || !isBoundedText(invoice.status, 64)) return 'bad_invoice';
  if ((failed && invoice.paid) || (!failed && !invoice.paid)) return 'invoice_event_mismatch';
  return null;
}

function validateCurrent(current: any): boolean {
  if (!current || typeof current !== 'object' || !UUID_RE.test(current.userId)) return false;
  if (APP_ACCESS_STATUSES.indexOf(current.status) === -1) return false;
  if (current.providerStatus != null && PROVIDER_STATUSES.indexOf(current.providerStatus) === -1) {
    return false;
  }
  if ((current.providerStatus == null) !== (current.providerStatusUpdatedAt == null)) {
    return false;
  }
  if (
    current.providerStatusUpdatedAt != null &&
    unixFromIso(current.providerStatusUpdatedAt) === null
  ) {
    return false;
  }
  if (!Number.isSafeInteger(current.revision) || current.revision < 0) {
    return false;
  }
  for (const value of [
    current.stripeCustomerId,
    current.stripeSubscriptionId,
    current.stripePriceId,
  ]) {
    if (value != null && !isBoundedProviderId(value)) return false;
  }
  return true;
}

function makeAudit(
  userId: string,
  eventType: string,
  providerEventId: string | null,
  subscriptionId: string | null,
  status: string,
  reason: string,
  occurredAt: string,
) {
  return {
    table: 'app_access_events',
    op: 'insert',
    set: {
      user_id: userId,
      event_type: eventType,
      provider_event_id: providerEventId,
      stripe_subscription_id: subscriptionId,
      status,
      reason,
      occurred_at: occurredAt,
    },
  };
}

function appendEndStateAudits(
  events: any[],
  ctx: any,
  subscriptionId: string,
  status: string,
  endedUnix: number,
): void {
  if (status !== 'grace' && status !== 'locked') return;
  events.push(
    makeAudit(
      ctx.userId,
      'grace_started',
      null,
      subscriptionId,
      status,
      'provider_access_ended',
      isoFromUnix(endedUnix),
    ),
  );
  if (status !== 'locked') return;
  const graceEndsUnix = endedUnix + ctx.graceDays * DAY_SECONDS;
  events.push(
    makeAudit(
      ctx.userId,
      'grace_ended',
      null,
      subscriptionId,
      'locked',
      'grace_expired',
      isoFromUnix(graceEndsUnix),
    ),
    makeAudit(
      ctx.userId,
      'lock_applied',
      null,
      subscriptionId,
      'locked',
      'grace_ended',
      isoFromUnix(Math.max(graceEndsUnix, ctx.eventCreated)),
    ),
  );
}

function entitlementCommand(userId: string, set: Record<string, unknown>, current: any) {
  const command: {
    table: string;
    op: string;
    key: { user_id: string };
    set: Record<string, unknown>;
    expected_revision?: number;
    expected_provider_status_updated_at?: string | null;
  } = {
    table: 'app_access_entitlements',
    op: 'upsert',
    key: { user_id: userId },
    set,
  };
  if (current) {
    command.expected_revision = current.revision;
    command.expected_provider_status_updated_at = current.providerStatusUpdatedAt;
  }
  return command;
}

// Shared subscription-driven entitlement set builder (checkout / created / updated / deleted).
function subscriptionSet(ctx: any): Record<string, unknown> {
  const sub = ctx.sub;
  const current = ctx.current;
  const appStatus = ctx.appStatus;
  const ended = ENDED_STATUSES.indexOf(sub.status) !== -1;
  const endedUnix =
    sub.endedAt != null && isFiniteNumber(sub.endedAt) ? sub.endedAt : ctx.eventCreated;
  const isTrialing = sub.status === 'trialing';
  let lastPayment;
  if (appStatus === 'past_due') lastPayment = 'failed';
  else if (isTrialing) lastPayment = (current && current.lastPaymentStatus) || null;
  else if (ended)
    lastPayment =
      sub.status === 'unpaid' ? 'failed' : (current && current.lastPaymentStatus) || null;
  else lastPayment = 'succeeded';

  let trialStartedAt = null;
  let trialEndsAt = null;
  if (isTrialing) {
    const te = sub.trialEnd != null ? sub.trialEnd : null;
    const tsRaw =
      sub.trialStart != null
        ? sub.trialStart
        : te != null
          ? Math.min(ctx.eventCreated, te)
          : ctx.eventCreated;
    trialStartedAt = isoFromUnix(tsRaw);
    trialEndsAt = te != null ? isoFromUnix(te) : null;
  } else if (current) {
    trialStartedAt = current.trialStartedAt || null;
    trialEndsAt = current.trialEndsAt || null;
  }

  const set = {
    status: appStatus,
    provider_status: sub.status,
    provider_status_updated_at: ctx.providerUpdatedAt,
    stripe_customer_id:
      strOrNull(ctx.projection.customerId) || (current && current.stripeCustomerId) || null,
    stripe_subscription_id: ctx.subscriptionId,
    stripe_price_id: ctx.matchedPrice || (current && current.stripePriceId) || null,
    current_period_start:
      sub.currentPeriodStart != null
        ? isoFromUnix(sub.currentPeriodStart)
        : (current && current.currentPeriodStart) || null,
    current_period_end:
      sub.currentPeriodEnd != null
        ? isoFromUnix(sub.currentPeriodEnd)
        : (current && current.currentPeriodEnd) || null,
    cancel_at_period_end: sub.cancelAtPeriodEnd === true,
    last_payment_status: lastPayment,
    access_ended_at: ended ? isoFromUnix(endedUnix) : null,
    trial_started_at: trialStartedAt,
    trial_ends_at: trialEndsAt,
    grace_started_at:
      appStatus === 'grace' || appStatus === 'locked' ? isoFromUnix(endedUnix) : null,
    grace_ends_at:
      appStatus === 'grace' || appStatus === 'locked'
        ? isoFromUnix(endedUnix + ctx.graceDays * DAY_SECONDS)
        : null,
    locked_at:
      appStatus === 'locked'
        ? isoFromUnix(Math.max(endedUnix + ctx.graceDays * DAY_SECONDS, ctx.eventCreated))
        : null,
  };
  return set;
}

// --- per-event builders (return { status, entitlement, events } or { invalid }) ---
function buildSubscriptionApply(ctx: any, auditType: string, reason: string): any {
  const sub = ctx.projection.subscription;
  const v = validateSubscription(sub);
  if (v) return { invalid: v };
  const graceError = validateGraceBounds(sub, ctx.eventCreated, ctx.graceDays);
  if (graceError) return { invalid: graceError };
  const subscriptionId = strOrNull(ctx.projection.subscriptionId);
  if (!subscriptionId) return { invalid: 'no_subscription' };
  const appStatus = deriveStatus(
    sub.status,
    sub.cancelAtPeriodEnd === true,
    sub.endedAt != null ? sub.endedAt : ctx.eventCreated,
    ctx.graceDays,
    ctx.eventCreated,
  );
  const set = subscriptionSet({
    sub,
    current: ctx.current,
    appStatus,
    eventCreated: ctx.eventCreated,
    providerUpdatedAt: ctx.providerUpdatedAt,
    projection: ctx.projection,
    subscriptionId,
    matchedPrice: ctx.matchedPrice,
    graceDays: ctx.graceDays,
  });
  const events = [
    makeAudit(
      ctx.userId,
      auditType,
      ctx.eventId,
      subscriptionId,
      appStatus,
      reason,
      ctx.occurredAt,
    ),
  ];
  const endedUnix = sub.endedAt != null ? sub.endedAt : ctx.eventCreated;
  appendEndStateAudits(events, ctx, subscriptionId, appStatus, endedUnix);
  return {
    status: appStatus,
    entitlement: entitlementCommand(ctx.userId, set, ctx.current),
    events,
  };
}

function buildSubscriptionUpdated(ctx: any): any {
  const sub = ctx.projection.subscription;
  const v = validateSubscription(sub);
  if (v) return { invalid: v };
  const graceError = validateGraceBounds(sub, ctx.eventCreated, ctx.graceDays);
  if (graceError) return { invalid: graceError };
  const subscriptionId =
    strOrNull(ctx.projection.subscriptionId) ||
    (ctx.current && ctx.current.stripeSubscriptionId) ||
    null;
  if (!subscriptionId) return { invalid: 'no_subscription' };
  const current = ctx.current;
  const ended = ENDED_STATUSES.indexOf(sub.status) !== -1;
  const endedUnix =
    sub.endedAt != null && isFiniteNumber(sub.endedAt) ? sub.endedAt : ctx.eventCreated;
  const appStatus = deriveStatus(
    sub.status,
    sub.cancelAtPeriodEnd === true,
    endedUnix,
    ctx.graceDays,
    ctx.eventCreated,
  );
  let auditType;
  let reason;
  if (ended) {
    auditType = 'subscription_cancelled';
    reason = 'subscription_ended';
  } else if (sub.status === 'past_due') {
    auditType = 'payment_failed';
    reason = 'subscription_past_due';
  } else if (sub.status === 'trialing') {
    auditType = 'trial_started';
    reason = 'subscription_updated';
  } else if (sub.status === 'active' && sub.cancelAtPeriodEnd === true) {
    auditType = 'subscription_cancelled';
    reason = 'cancel_at_period_end';
  } else if (
    sub.status === 'active' &&
    current &&
    RECOVERY_STATUSES.indexOf(current.status) !== -1
  ) {
    auditType = 'access_restored';
    reason = 'payment_recovered';
  } else {
    auditType = 'payment_succeeded';
    reason = 'subscription_updated';
  }
  const set = subscriptionSet({
    sub,
    current,
    appStatus,
    eventCreated: ctx.eventCreated,
    providerUpdatedAt: ctx.providerUpdatedAt,
    projection: ctx.projection,
    subscriptionId,
    matchedPrice: ctx.matchedPrice,
    graceDays: ctx.graceDays,
  });
  const events = [
    makeAudit(
      ctx.userId,
      auditType,
      ctx.eventId,
      subscriptionId,
      appStatus,
      reason,
      ctx.occurredAt,
    ),
  ];
  appendEndStateAudits(events, ctx, subscriptionId, appStatus, endedUnix);
  return {
    status: appStatus,
    entitlement: entitlementCommand(ctx.userId, set, ctx.current),
    events,
  };
}

function buildSubscriptionDeleted(ctx: any): any {
  const sub = ctx.projection.subscription;
  const v = validateSubscription(sub);
  if (v) return { invalid: v };
  if (ENDED_STATUSES.indexOf(sub.status) === -1)
    return { invalid: 'deleted_subscription_not_terminal' };
  const graceError = validateGraceBounds(sub, ctx.eventCreated, ctx.graceDays);
  if (graceError) return { invalid: graceError };
  const subscriptionId =
    strOrNull(ctx.projection.subscriptionId) ||
    (ctx.current && ctx.current.stripeSubscriptionId) ||
    null;
  if (!subscriptionId) return { invalid: 'no_subscription' };
  const endedUnix =
    sub.endedAt != null && isFiniteNumber(sub.endedAt) ? sub.endedAt : ctx.eventCreated;
  const appStatus = deriveStatus(sub.status, false, endedUnix, ctx.graceDays, ctx.eventCreated);
  const set = subscriptionSet({
    sub,
    current: ctx.current,
    appStatus,
    eventCreated: ctx.eventCreated,
    providerUpdatedAt: ctx.providerUpdatedAt,
    projection: ctx.projection,
    subscriptionId,
    matchedPrice: ctx.matchedPrice,
    graceDays: ctx.graceDays,
  });
  set.cancel_at_period_end = false;
  const events = [
    makeAudit(
      ctx.userId,
      'subscription_cancelled',
      ctx.eventId,
      subscriptionId,
      appStatus,
      'subscription_deleted',
      ctx.occurredAt,
    ),
  ];
  appendEndStateAudits(events, ctx, subscriptionId, appStatus, endedUnix);
  return {
    status: appStatus,
    entitlement: entitlementCommand(ctx.userId, set, ctx.current),
    events,
  };
}

function buildInvoiceApply(ctx: any, failed: boolean): any {
  const invoice = ctx.projection.invoice;
  const invoiceError = validateInvoice(invoice, failed);
  if (invoiceError) return { invalid: invoiceError };
  const current = ctx.current;
  const subscriptionId =
    strOrNull(ctx.projection.subscriptionId) || (current && current.stripeSubscriptionId) || null;
  if (!subscriptionId) return { invalid: 'no_subscription' };
  const recovery = !failed && current && RECOVERY_STATUSES.indexOf(current.status) !== -1;
  let appStatus;
  let providerStatus;
  let lastPayment;
  let auditType;
  let reason;
  if (failed) {
    appStatus = 'past_due';
    providerStatus = 'past_due';
    lastPayment = 'failed';
    auditType = 'payment_failed';
    reason = 'invoice_payment_failed';
  } else if (recovery) {
    appStatus = 'active';
    providerStatus = 'active';
    lastPayment = 'succeeded';
    auditType = 'access_restored';
    reason = 'payment_recovered';
  } else {
    appStatus =
      current && current.status === 'cancel_at_period_end' ? 'cancel_at_period_end' : 'active';
    providerStatus =
      current && PROVIDER_STATUSES.indexOf(current.providerStatus) !== -1
        ? current.providerStatus
        : 'active';
    lastPayment = 'succeeded';
    auditType = 'payment_succeeded';
    reason = 'invoice_paid';
  }
  const sub = ctx.projection.subscription;
  const set = {
    status: appStatus,
    provider_status: providerStatus,
    provider_status_updated_at: ctx.providerUpdatedAt,
    stripe_customer_id:
      strOrNull(ctx.projection.customerId) || (current && current.stripeCustomerId) || null,
    stripe_subscription_id: subscriptionId,
    stripe_price_id: (current && current.stripePriceId) || ctx.matchedPrice || null,
    current_period_start:
      sub && sub.currentPeriodStart != null
        ? isoFromUnix(sub.currentPeriodStart)
        : (current && current.currentPeriodStart) || null,
    current_period_end:
      sub && sub.currentPeriodEnd != null
        ? isoFromUnix(sub.currentPeriodEnd)
        : (current && current.currentPeriodEnd) || null,
    cancel_at_period_end: current ? current.cancelAtPeriodEnd === true : false,
    last_payment_status: lastPayment,
    access_ended_at: failed || recovery ? null : (current && current.accessEndedAt) || null,
    trial_started_at: (current && current.trialStartedAt) || null,
    trial_ends_at: (current && current.trialEndsAt) || null,
    grace_started_at: recovery ? null : (current && current.graceStartedAt) || null,
    grace_ends_at: recovery ? null : (current && current.graceEndsAt) || null,
    locked_at: recovery ? null : (current && current.lockedAt) || null,
  };
  const events = [
    makeAudit(
      ctx.userId,
      auditType,
      ctx.eventId,
      subscriptionId,
      appStatus,
      reason,
      ctx.occurredAt,
    ),
  ];
  return {
    status: appStatus,
    entitlement: entitlementCommand(ctx.userId, set, ctx.current),
    events,
  };
}

// --- public reconciliation boundary -----------------------------------------
export function reconcileAppAccessEvent(input: any): any {
  const projection = (input && input.projection) || {};
  const current = (input && input.current) || null;
  const config = (input && input.config) || {};
  const eventAlreadyProcessed = input && input.eventAlreadyProcessed === true;

  const rawEventId = projection.eventId;
  const eventType = projection.eventType;
  const eventCreated = projection.eventCreated;
  const safeEventId = typeof rawEventId === 'string' ? rawEventId : null;

  // Validate the immutable event envelope and server-owned configuration before
  // classification. Malformed projections must never be mistaken for unrelated
  // feature-tier events.
  if (SUPPORTED_EVENTS.indexOf(eventType) === -1)
    return deepFreeze({ kind: 'invalid', reason: 'unsupported_event', eventId: safeEventId });
  if (!validateConfig(config))
    return deepFreeze({ kind: 'invalid', reason: 'bad_config', eventId: safeEventId });
  if (!isBoundedProviderId(rawEventId))
    return deepFreeze({ kind: 'invalid', reason: 'bad_event_id', eventId: null });
  if (!isUnixSeconds(eventCreated))
    return deepFreeze({ kind: 'invalid', reason: 'bad_event_created', eventId: rawEventId });
  if (!validatePriceIds(projection.priceIds))
    return deepFreeze({ kind: 'invalid', reason: 'bad_price_ids', eventId: rawEventId });

  if (
    projection.metadata != null &&
    (typeof projection.metadata !== 'object' || Array.isArray(projection.metadata))
  ) {
    return deepFreeze({ kind: 'invalid', reason: 'bad_metadata', eventId: rawEventId });
  }
  const metadata =
    projection.metadata && typeof projection.metadata === 'object' ? projection.metadata : null;
  if (metadata && metadata.access_product != null && !isBoundedText(metadata.access_product, 64)) {
    return deepFreeze({ kind: 'invalid', reason: 'bad_metadata', eventId: rawEventId });
  }
  if (
    metadata &&
    metadata.supabase_user_id != null &&
    !isBoundedText(metadata.supabase_user_id, 64)
  ) {
    return deepFreeze({ kind: 'invalid', reason: 'bad_metadata', eventId: rawEventId });
  }
  if (
    metadata &&
    typeof metadata.access_product === 'string' &&
    metadata.access_product !== ACCESS_PRODUCT
  ) {
    return deepFreeze({ kind: 'ignored', reason: 'not_app_access', eventId: safeEventId });
  }

  const matchedPrice = classifyPrice(projection.priceIds, config.knownPriceIds);
  if (matchedPrice === false)
    return deepFreeze({
      kind: 'invalid',
      reason: 'ambiguous_app_access_prices',
      eventId: safeEventId,
    });
  if (!matchedPrice)
    return deepFreeze({ kind: 'ignored', reason: 'unknown_price', eventId: safeEventId });

  if (eventAlreadyProcessed) return deepFreeze({ kind: 'duplicate', eventId: rawEventId });

  const isCheckout = eventType === 'checkout.session.completed';

  if (!isCheckout && !current)
    return deepFreeze({ kind: 'invalid', reason: 'no_entitlement', eventId: rawEventId });
  if (current && !validateCurrent(current))
    return deepFreeze({ kind: 'invalid', reason: 'bad_current', eventId: rawEventId });

  const metaUser =
    metadata && typeof metadata.supabase_user_id === 'string' ? metadata.supabase_user_id : null;
  const projUser =
    typeof projection.userId === 'string' && projection.userId !== '' ? projection.userId : null;
  let userId;
  if (current) {
    userId = current.userId;
    if (metaUser && metaUser !== current.userId)
      return deepFreeze({ kind: 'invalid', reason: 'cross_user_metadata', eventId: rawEventId });
    if (projUser && projUser !== current.userId)
      return deepFreeze({ kind: 'invalid', reason: 'cross_user_metadata', eventId: rawEventId });
  } else {
    userId = metaUser || projUser;
  }
  if (!userId) return deepFreeze({ kind: 'invalid', reason: 'no_user', eventId: rawEventId });
  if (typeof userId !== 'string' || !UUID_RE.test(userId))
    return deepFreeze({ kind: 'invalid', reason: 'bad_user', eventId: rawEventId });

  if (projection.subscriptionId != null && !isBoundedProviderId(projection.subscriptionId)) {
    return deepFreeze({ kind: 'invalid', reason: 'bad_subscription_id', eventId: rawEventId });
  }
  if (projection.customerId != null && !isBoundedProviderId(projection.customerId)) {
    return deepFreeze({ kind: 'invalid', reason: 'bad_customer_id', eventId: rawEventId });
  }
  const projSubId = strOrNull(projection.subscriptionId);
  const projCusId = strOrNull(projection.customerId);
  if (current) {
    if (projSubId && current.stripeSubscriptionId && projSubId !== current.stripeSubscriptionId) {
      return deepFreeze({ kind: 'invalid', reason: 'subscription_mismatch', eventId: rawEventId });
    }
    if (projCusId && current.stripeCustomerId && projCusId !== current.stripeCustomerId) {
      return deepFreeze({ kind: 'invalid', reason: 'customer_mismatch', eventId: rawEventId });
    }
  }

  if (
    current &&
    typeof current.providerStatusUpdatedAt === 'string' &&
    current.providerStatusUpdatedAt !== ''
  ) {
    const currentUnix = unixFromIso(current.providerStatusUpdatedAt);
    if (currentUnix !== null && eventCreated < currentUnix) {
      return deepFreeze({ kind: 'stale', reason: 'out_of_order', eventId: rawEventId });
    }
  }

  const isInvoice =
    eventType === 'invoice.payment_succeeded' || eventType === 'invoice.payment_failed';
  if (
    isInvoice &&
    current &&
    (ENDED_STATUSES.indexOf(current.providerStatus) !== -1 ||
      current.status === 'grace' ||
      current.status === 'locked')
  ) {
    return deepFreeze({
      kind: 'stale',
      reason: 'terminal_subscription',
      eventId: rawEventId,
    });
  }

  if (eventType === 'customer.subscription.trial_will_end') {
    const subscriptionError = validateSubscription(projection.subscription);
    if (subscriptionError) {
      return deepFreeze({
        kind: 'invalid',
        reason: subscriptionError,
        eventId: rawEventId,
      });
    }
    return deepFreeze({
      kind: 'noop',
      reason: 'informational_no_mutation',
      eventId: rawEventId,
    });
  }

  const ctx = {
    projection,
    current,
    userId,
    matchedPrice,
    eventId: rawEventId,
    eventCreated,
    occurredAt: isoFromUnix(eventCreated),
    providerUpdatedAt: isoFromUnix(eventCreated),
    graceDays: config.graceDays,
  };
  let built: any;
  if (eventType === 'checkout.session.completed')
    built = buildSubscriptionApply(ctx, 'payment_succeeded', 'checkout_completed');
  else if (eventType === 'customer.subscription.created')
    built = buildSubscriptionApply(ctx, 'payment_succeeded', 'subscription_created');
  else if (eventType === 'customer.subscription.updated') built = buildSubscriptionUpdated(ctx);
  else if (eventType === 'customer.subscription.deleted') built = buildSubscriptionDeleted(ctx);
  else if (eventType === 'invoice.payment_succeeded') built = buildInvoiceApply(ctx, false);
  else if (eventType === 'invoice.payment_failed') built = buildInvoiceApply(ctx, true);
  else return deepFreeze({ kind: 'invalid', reason: 'unsupported_event', eventId: rawEventId });

  if (!built)
    return deepFreeze({ kind: 'invalid', reason: 'unsupported_event', eventId: rawEventId });
  if (built.invalid)
    return deepFreeze({ kind: 'invalid', reason: built.invalid, eventId: rawEventId });

  // checkout/created audit type depends on the resulting status (trial vs paid).
  if (eventType === 'checkout.session.completed' || eventType === 'customer.subscription.created') {
    if (built.status === 'trialing') built.events[0].set.event_type = 'trial_started';
    else if (built.status === 'past_due') built.events[0].set.event_type = 'payment_failed';
    else if (ENDED_STATUSES.indexOf(built.entitlement.set.provider_status) !== -1)
      built.events[0].set.event_type = 'subscription_cancelled';
  }

  return deepFreeze({
    kind: 'apply',
    eventId: rawEventId,
    status: built.status,
    entitlement: built.entitlement,
    events: built.events,
  });
}
