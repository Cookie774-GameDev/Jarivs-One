import { useAuthStore } from '@/stores/auth';

type AuthState = ReturnType<typeof useAuthStore.getState>;

export type AccountIdentity = {
  accountId: string;
  source: 'supabase' | 'local';
};

export class AccountIdentityNotReadyError extends Error {
  readonly code = 'ACCOUNT_IDENTITY_NOT_READY' as const;

  constructor() {
    super('Account identity is unavailable until boot completes.');
    this.name = 'AccountIdentityNotReadyError';
  }
}

export function resolveAccountIdentity(
  auth: Pick<AuthState, 'cloudSession' | 'localUserId'>,
): AccountIdentity | null {
  const supabaseAccountId = auth.cloudSession?.user_id.trim();
  if (supabaseAccountId) {
    return {
      accountId: supabaseAccountId,
      source: 'supabase',
    };
  }

  const localAccountId = auth.localUserId?.trim();
  if (localAccountId) {
    return {
      accountId: localAccountId,
      source: 'local',
    };
  }

  return null;
}

export function requireAccountIdentity(
  auth: Pick<AuthState, 'cloudSession' | 'localUserId'>,
): AccountIdentity {
  const identity = resolveAccountIdentity(auth);
  if (!identity) throw new AccountIdentityNotReadyError();
  return identity;
}

export function getActiveAccountIdentity(): AccountIdentity | null {
  return resolveAccountIdentity(useAuthStore.getState());
}
