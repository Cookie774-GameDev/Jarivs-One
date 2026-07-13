import { describe, expect, it } from 'vitest';
import { formatAuthError, isLikelyExistingAccountSignUp } from './authErrors';

describe('formatAuthError', () => {
  it('maps common Supabase auth failures', () => {
    expect(formatAuthError({ message: 'Invalid login credentials' })).toMatch(/incorrect email or password/i);
    expect(formatAuthError({ message: 'Email not confirmed' })).toMatch(/confirm your email/i);
    expect(formatAuthError({ message: 'User already registered' })).toMatch(/already has an account/i);
    expect(formatAuthError({ message: 'Token has expired or is invalid' })).toMatch(/invalid or expired|expired/i);
    expect(formatAuthError({ message: 'over_email_send_rate_limit' })).toMatch(/too many emails/i);
  });

  it('falls back for empty errors', () => {
    expect(formatAuthError(null)).toMatch(/try again/i);
  });
});

describe('isLikelyExistingAccountSignUp', () => {
  it('detects empty identities without a session', () => {
    expect(isLikelyExistingAccountSignUp({ user: { identities: [] }, session: null })).toBe(true);
    expect(
      isLikelyExistingAccountSignUp({
        user: { identities: [{ id: '1' }] },
        session: null,
      }),
    ).toBe(false);
    expect(
      isLikelyExistingAccountSignUp({
        user: { identities: [] },
        session: { access_token: 'x' },
      }),
    ).toBe(false);
  });
});
