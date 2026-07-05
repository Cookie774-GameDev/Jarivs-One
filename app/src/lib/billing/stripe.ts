/**
 * Deprecated static Stripe checkout helpers.
 *
 * Live billing must use `create-checkout-session`, which authenticates the
 * Supabase user and creates the Stripe Checkout Session server-side. Static
 * `buy.stripe.com` URLs cannot reliably map a purchase back to the signed-in
 * user, so this module intentionally returns "not configured" for every tier.
 *
 * Kept only so older imports compile while callers migrate to
 * `@/lib/billing/checkout`.
 */

import type { PlanId } from '@/lib/entitlements';

/**
 * Resolve the Stripe checkout URL for a given tier.
 *
 * Always returns `undefined`. Use `callCheckoutSession()` for live checkout.
 */
export function getCheckoutUrl(_tier: PlanId): string | undefined {
  return undefined;
}

/**
 * Static checkout is disabled for publish builds. Backend readiness is checked
 * by `isBackendBillingConfigured()` and the Edge Function response.
 */
export function isStripeConfigured(): boolean {
  return false;
}
