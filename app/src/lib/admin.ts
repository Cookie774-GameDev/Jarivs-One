import { useEffect, useState } from 'react';
import type { JarvisEntitlementSnapshot } from '@/lib/jarvis/contracts';
import {
  APP_ADMIN_CAPABILITY,
  entitlementSnapshotAllowsAdmin,
  resolveLocalDevelopmentEntitlementSnapshot,
} from '@/lib/entitlements';
import { getSupabaseClient } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth';

const SERVER_ENTITLEMENT_TTL_MS = 5 * 60_000;

function unavailableSnapshot(): JarvisEntitlementSnapshot {
  return { source: 'unavailable', capabilities: [] };
}

function copySnapshot(snapshot: JarvisEntitlementSnapshot): JarvisEntitlementSnapshot {
  return { ...snapshot, capabilities: [...snapshot.capabilities] };
}

const cloudAdminCache = new Map<string, JarvisEntitlementSnapshot>();
const SERVER_PLAN_IDS = new Set(['free', 'starter', 'pro', 'ultra', 'apex']);

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sessionAccountId(result: unknown): string | undefined {
  if (!isRecordObject(result)) return undefined;
  if (!Object.prototype.hasOwnProperty.call(result, 'error') || result.error !== null) {
    return undefined;
  }
  const data = result.data;
  if (!isRecordObject(data)) return undefined;
  const session = data.session;
  if (!isRecordObject(session)) return undefined;
  const user = session.user;
  if (!isRecordObject(user)) return undefined;
  const id = user.id;
  return typeof id === 'string' && id.trim() ? id.trim() : undefined;
}

function serverEntitlementResult(data: unknown): { admin: boolean; planId?: string } | undefined {
  if (!isRecordObject(data)) return undefined;
  if (typeof data.admin_unlimited !== 'boolean') return undefined;
  const candidatePlanId =
    typeof data.plan === 'string' ? data.plan.trim().toLowerCase() : undefined;
  return {
    admin: data.admin_unlimited,
    ...(candidatePlanId && SERVER_PLAN_IDS.has(candidatePlanId) ? { planId: candidatePlanId } : {}),
  };
}

/** Fetch server-authoritative admin evidence for exactly the active cloud account. */
export async function fetchCloudAdminEntitlementSnapshot(
  userId: string | undefined,
): Promise<JarvisEntitlementSnapshot> {
  const accountId = userId?.trim();
  if (!accountId) return unavailableSnapshot();

  const client = getSupabaseClient();
  if (!client) return unavailableSnapshot();

  try {
    const before = await client.auth.getSession();
    if (sessionAccountId(before) !== accountId) return unavailableSnapshot();

    const now = Date.now();
    const cached = cloudAdminCache.get(accountId);
    if (cached?.expiresAt !== undefined && cached.expiresAt > now) {
      return copySnapshot(cached);
    }
    if (cached) cloudAdminCache.delete(accountId);

    const { data, error } = await client.functions.invoke<unknown>('get-message-usage');
    const result = error ? undefined : serverEntitlementResult(data);
    if (!result) return unavailableSnapshot();

    const after = await client.auth.getSession();
    if (sessionAccountId(after) !== accountId) return unavailableSnapshot();

    const verifiedAt = Date.now();
    const snapshot: JarvisEntitlementSnapshot = {
      source: 'server',
      ...(result.planId ? { planId: result.planId } : {}),
      capabilities: result.admin ? [APP_ADMIN_CAPABILITY] : [],
      verifiedAt,
      expiresAt: verifiedAt + SERVER_ENTITLEMENT_TTL_MS,
    };
    cloudAdminCache.set(accountId, snapshot);
    return copySnapshot(snapshot);
  } catch {
    return unavailableSnapshot();
  }
}

export async function fetchCloudAdminStatus(userId: string | undefined): Promise<boolean> {
  return entitlementSnapshotAllowsAdmin(await fetchCloudAdminEntitlementSnapshot(userId));
}

export function clearCloudAdminCache(): void {
  cloudAdminCache.clear();
}

type HookSnapshotState = {
  accountId: string;
  state: 'pending' | 'resolved';
  snapshot: JarvisEntitlementSnapshot;
};

export function useAppEntitlementSnapshot(): JarvisEntitlementSnapshot {
  const email = useAuthStore((state) => state.email);
  const cloudEmail = useAuthStore((state) => state.cloudSession?.email);
  const cloudUserId = useAuthStore((state) => state.cloudSession?.user_id);
  const localUserId = useAuthStore((state) => state.localUserId);
  const accountId = cloudUserId?.trim() ?? '';
  const localSnapshot = resolveLocalDevelopmentEntitlementSnapshot({
    email,
    cloudEmail,
    localUserId,
  });
  const [loaded, setLoaded] = useState<HookSnapshotState>(() => ({
    accountId,
    state: accountId ? 'pending' : 'resolved',
    snapshot: accountId ? unavailableSnapshot() : localSnapshot,
  }));
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    if (!accountId) {
      setLoaded({ accountId: '', state: 'resolved', snapshot: localSnapshot });
      return;
    }

    let cancelled = false;
    setLoaded({ accountId, state: 'pending', snapshot: unavailableSnapshot() });
    void fetchCloudAdminEntitlementSnapshot(accountId).then((serverSnapshot) => {
      if (cancelled || useAuthStore.getState().cloudSession?.user_id.trim() !== accountId) return;
      setLoaded({
        accountId,
        state: 'resolved',
        snapshot: serverSnapshot.source === 'server' ? serverSnapshot : localSnapshot,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [accountId, email, cloudEmail, localUserId, refreshVersion]);

  useEffect(() => {
    if (!accountId || loaded.accountId !== accountId || loaded.state !== 'resolved') return;
    const expiresAt = loaded.snapshot.expiresAt;
    if (expiresAt === undefined) return;

    const timer = window.setTimeout(
      () => {
        if (useAuthStore.getState().cloudSession?.user_id.trim() !== accountId) return;
        setLoaded((current) => {
          if (current.accountId !== accountId || current.state !== 'resolved') return current;
          return { accountId, state: 'pending', snapshot: unavailableSnapshot() };
        });
        setRefreshVersion((version) => version + 1);
      },
      Math.max(0, expiresAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [accountId, loaded.accountId, loaded.snapshot.expiresAt, loaded.state]);

  if (!accountId) return localSnapshot;
  if (loaded.accountId !== accountId || loaded.state === 'pending') return unavailableSnapshot();
  return loaded.snapshot;
}

export interface JarvisEntitlementSnapshotProvider {
  getForAccount(accountId: string): Promise<Readonly<JarvisEntitlementSnapshot>>;
}

function snapshotIsCurrent(snapshot: JarvisEntitlementSnapshot, now: number): boolean {
  if (snapshot.source === 'unavailable' || !Number.isFinite(snapshot.verifiedAt)) return false;
  return Number.isFinite(snapshot.expiresAt) && snapshot.expiresAt! > now;
}

export function createJarvisEntitlementSnapshotProvider(input: {
  getActiveAccountId(): string | undefined;
  loadForActiveAccount(accountId: string): Promise<JarvisEntitlementSnapshot>;
  now: () => number;
}): JarvisEntitlementSnapshotProvider {
  return {
    async getForAccount(accountId) {
      const canonicalAccountId = accountId.trim();
      if (!canonicalAccountId || input.getActiveAccountId() !== canonicalAccountId) {
        return unavailableSnapshot();
      }

      try {
        const snapshot = await input.loadForActiveAccount(canonicalAccountId);
        if (input.getActiveAccountId() !== canonicalAccountId) return unavailableSnapshot();
        if (!snapshotIsCurrent(snapshot, input.now())) return unavailableSnapshot();
        return copySnapshot(snapshot);
      } catch {
        return unavailableSnapshot();
      }
    },
  };
}

/** Boolean UI compatibility selector; never a second authority source. */
export function useAppAdmin(): boolean {
  return entitlementSnapshotAllowsAdmin(useAppEntitlementSnapshot());
}
