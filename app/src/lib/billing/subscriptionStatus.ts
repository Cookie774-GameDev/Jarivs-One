/**
 * Subscription status → access rules shared with Stripe webhook semantics.
 *
 * Server source of truth for granting/revoking paid access is still
 * `profiles.tier` written by the Stripe webhook (service role). This module
 * documents and unit-tests the dunning rules so client UI and webhook stay
 * aligned without trusting the client for security.
 */

/** Stripe subscription statuses that keep paid entitlements. */
export const PAID_ACCESS_STATUSES = [
  'active',
  'trialing',
  /** Card failed; Stripe dunning in progress — keep access until canceled. */
  'past_due',
] as const;

export type PaidAccessStatus = (typeof PAID_ACCESS_STATUSES)[number];

/** Statuses that should revoke company-paid benefits to free. */
export const REVOKE_TO_FREE_STATUSES = [
  'canceled',
  'unpaid',
  'incomplete_expired',
] as const;

export type RevokeToFreeStatus = (typeof REVOKE_TO_FREE_STATUSES)[number];

export function subscriptionKeepsPaidAccess(status: string | null | undefined): boolean {
  if (!status) return false;
  return (PAID_ACCESS_STATUSES as readonly string[]).includes(status);
}

export function subscriptionRevokesToFree(status: string | null | undefined): boolean {
  if (!status) return false;
  return (REVOKE_TO_FREE_STATUSES as readonly string[]).includes(status);
}

/**
 * Whether an `invoice.payment_failed` event should immediately force free.
 * Always false — temporary failures must not thrash tier during dunning.
 * Revocation happens on subscription.updated/deleted when Stripe ends access.
 */
export function invoicePaymentFailedForcesFree(): boolean {
  return false;
}
