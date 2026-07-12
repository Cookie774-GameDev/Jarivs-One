import { describe, expect, it } from 'vitest';
import {
  invoicePaymentFailedForcesFree,
  subscriptionKeepsPaidAccess,
  subscriptionRevokesToFree,
} from './subscriptionStatus';

describe('subscriptionStatus', () => {
  it('keeps paid access for active, trialing, and past_due', () => {
    expect(subscriptionKeepsPaidAccess('active')).toBe(true);
    expect(subscriptionKeepsPaidAccess('trialing')).toBe(true);
    expect(subscriptionKeepsPaidAccess('past_due')).toBe(true);
  });

  it('revokes on canceled, unpaid, incomplete_expired', () => {
    expect(subscriptionRevokesToFree('canceled')).toBe(true);
    expect(subscriptionRevokesToFree('unpaid')).toBe(true);
    expect(subscriptionRevokesToFree('incomplete_expired')).toBe(true);
    expect(subscriptionRevokesToFree('active')).toBe(false);
    expect(subscriptionRevokesToFree('past_due')).toBe(false);
  });

  it('never forces free on a single invoice.payment_failed', () => {
    expect(invoicePaymentFailedForcesFree()).toBe(false);
  });

  it('handles empty status', () => {
    expect(subscriptionKeepsPaidAccess(null)).toBe(false);
    expect(subscriptionRevokesToFree(undefined)).toBe(false);
  });
});
