// Pure Stripe subscription status helpers for edge functions.
// Keep semantics aligned with app/src/lib/billing/subscriptionStatus.ts.

export const PAID_ACCESS_STATUSES = ['active', 'trialing', 'past_due'] as const;
export const REVOKE_TO_FREE_STATUSES = [
  'canceled',
  'unpaid',
  'incomplete',
  'incomplete_expired',
  'paused',
] as const;
export const CHECKOUT_TERMINAL_STATUSES = ['canceled', 'incomplete_expired'] as const;

export function subscriptionKeepsPaidAccess(status: string | null | undefined): boolean {
  if (!status) return false;
  return (PAID_ACCESS_STATUSES as readonly string[]).includes(status);
}

export function subscriptionRevokesToFree(status: string | null | undefined): boolean {
  if (!status) return false;
  return (REVOKE_TO_FREE_STATUSES as readonly string[]).includes(status);
}

export function subscriptionBlocksCheckout(status: string | null | undefined): boolean {
  if (!status) return true;
  return !(CHECKOUT_TERMINAL_STATUSES as readonly string[]).includes(status);
}

/** invoice.payment_failed must not immediately free the account (dunning). */
export function invoicePaymentFailedForcesFree(): boolean {
  return false;
}
