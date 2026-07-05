/**
 * @file Tests for the deprecated static Stripe checkout URL resolver.
 *
 * Live billing uses the signed-in Supabase Edge Function checkout flow.
 * Static `buy.stripe.com` URLs are disabled because they can create
 * subscriptions that do not map back to the Supabase user.
 *
 * `import.meta.env` is a build-time constant in production but Vitest
 * exposes it as a plain object we can mutate. We `delete` keys in
 * `beforeEach` rather than assigning `undefined`, because Vite's
 * `define`-style env coercion turns `undefined` into the literal
 * string "undefined" — which would defeat the very emptiness check
 * we're trying to test.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getCheckoutUrl, isStripeConfigured } from '@/lib/billing/stripe';

const ENV_KEYS = [
  'VITE_STRIPE_CHECKOUT_URL',
  'VITE_STRIPE_CHECKOUT_STARTER',
  'VITE_STRIPE_CHECKOUT_PRO',
  'VITE_STRIPE_CHECKOUT_ULTRA',
  'VITE_STRIPE_CHECKOUT_APEX',
] as const;

function clearEnv() {
  const env = import.meta.env as Record<string, unknown>;
  for (const key of ENV_KEYS) {
    delete env[key];
  }
}

function setEnv(key: string, value: string) {
  (import.meta.env as Record<string, unknown>)[key] = value;
}

beforeEach(() => {
  clearEnv();
});

describe('getCheckoutUrl', () => {
  it('returns undefined for the free tier no matter what is configured', () => {
    setEnv('VITE_STRIPE_CHECKOUT_URL', 'https://buy.stripe.com/legacy');
    expect(getCheckoutUrl('free')).toBeUndefined();
  });

  it('ignores per-tier static checkout URLs', () => {
    setEnv('VITE_STRIPE_CHECKOUT_PRO', 'https://buy.stripe.com/pro-link');
    expect(getCheckoutUrl('pro')).toBeUndefined();
  });

  it('ignores Apex/Supernova static checkout URLs', () => {
    setEnv('VITE_STRIPE_CHECKOUT_APEX', 'https://buy.stripe.com/apex-link');
    expect(getCheckoutUrl('apex')).toBeUndefined();
  });

  it('does not fall back to VITE_STRIPE_CHECKOUT_URL', () => {
    setEnv('VITE_STRIPE_CHECKOUT_URL', 'https://buy.stripe.com/legacy');
    expect(getCheckoutUrl('starter')).toBeUndefined();
    expect(getCheckoutUrl('ultra')).toBeUndefined();
  });

  it('ignores mixed legacy and per-tier static checkout URLs', () => {
    setEnv('VITE_STRIPE_CHECKOUT_URL', 'https://buy.stripe.com/legacy');
    setEnv('VITE_STRIPE_CHECKOUT_PRO', 'https://buy.stripe.com/pro');
    expect(getCheckoutUrl('pro')).toBeUndefined();
    expect(getCheckoutUrl('starter')).toBeUndefined();
  });

  it('treats whitespace-only env values as unset', () => {
    setEnv('VITE_STRIPE_CHECKOUT_PRO', '   ');
    expect(getCheckoutUrl('pro')).toBeUndefined();
  });

  it('trims surrounding whitespace from a configured URL', () => {
    setEnv('VITE_STRIPE_CHECKOUT_PRO', '  https://buy.stripe.com/pro  ');
    expect(getCheckoutUrl('pro')).toBeUndefined();
  });
});

describe('isStripeConfigured', () => {
  it('reports false when the legacy var is set', () => {
    setEnv('VITE_STRIPE_CHECKOUT_URL', 'https://buy.stripe.com/legacy');
    expect(isStripeConfigured()).toBe(false);
  });

  it('reports false when any per-tier var is set', () => {
    setEnv('VITE_STRIPE_CHECKOUT_ULTRA', 'https://buy.stripe.com/ultra');
    expect(isStripeConfigured()).toBe(false);
  });

  it('reports false when nothing is configured', () => {
    expect(isStripeConfigured()).toBe(false);
  });
});
