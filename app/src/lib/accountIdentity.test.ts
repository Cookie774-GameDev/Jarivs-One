import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/stores/auth';
import {
  AccountIdentityNotReadyError,
  getActiveAccountIdentity,
  requireAccountIdentity,
  resolveAccountIdentity,
} from './accountIdentity';

const originalAuth = {
  cloudSession: useAuthStore.getState().cloudSession,
  localUserId: useAuthStore.getState().localUserId,
};

const cloudSession = {
  user_id: 'supabase-user',
  email: 'user@example.com',
  expires_at: 4_102_444_800,
};

describe('canonical account identity', () => {
  beforeEach(() => {
    useAuthStore.setState({ cloudSession: null, localUserId: null });
  });

  afterEach(() => {
    useAuthStore.setState(originalAuth);
  });

  it('prefers the authenticated Supabase user over the stable local user', () => {
    expect(
      resolveAccountIdentity({
        cloudSession,
        localUserId: 'local-user',
      }),
    ).toEqual({
      accountId: 'supabase-user',
      source: 'supabase',
    });
  });

  it('fails closed when a present cloud session has no usable user id', () => {
    expect(
      resolveAccountIdentity({
        cloudSession: {
          ...cloudSession,
          user_id: '   ',
        },
        localUserId: 'local-user',
      }),
    ).toBeNull();
  });

  it('uses the stable local user while signed out', () => {
    expect(
      resolveAccountIdentity({
        cloudSession: null,
        localUserId: 'local-user',
      }),
    ).toEqual({
      accountId: 'local-user',
      source: 'local',
    });
  });

  it('returns null when boot has not produced a real identity', () => {
    expect(
      resolveAccountIdentity({
        cloudSession: null,
        localUserId: null,
      }),
    ).toBeNull();
  });

  it('switches active scope on sign-in and sign-out without rewriting the local user', () => {
    useAuthStore.setState({
      cloudSession: null,
      localUserId: 'stable-local-user',
    });

    expect(getActiveAccountIdentity()).toEqual({
      accountId: 'stable-local-user',
      source: 'local',
    });

    useAuthStore.setState({ cloudSession });

    expect(getActiveAccountIdentity()).toEqual({
      accountId: 'supabase-user',
      source: 'supabase',
    });
    expect(useAuthStore.getState().localUserId).toBe('stable-local-user');

    useAuthStore.setState({ cloudSession: null });

    expect(getActiveAccountIdentity()).toEqual({
      accountId: 'stable-local-user',
      source: 'local',
    });
    expect(useAuthStore.getState().localUserId).toBe('stable-local-user');
  });

  it('throws a typed boot-not-ready error when identity is required too early', () => {
    let thrown: unknown;

    try {
      requireAccountIdentity({
        cloudSession: null,
        localUserId: null,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AccountIdentityNotReadyError);
    expect(thrown).toMatchObject({
      name: 'AccountIdentityNotReadyError',
      code: 'ACCOUNT_IDENTITY_NOT_READY',
    });
  });
});
