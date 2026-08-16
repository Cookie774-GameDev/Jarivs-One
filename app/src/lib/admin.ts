import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth';
import { isAdminIdentity } from '@/lib/entitlements';
import { fetchMyEntitlements } from '@/lib/supabase/entitlements';

let cloudAdminCache: { userId: string; value: boolean } | null = null;

/** Supabase `app_admins` row for the signed-in user (server-side list). */
export async function fetchCloudAdminStatus(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  if (cloudAdminCache?.userId === userId) return cloudAdminCache.value;

  try {
    const entitlements = await fetchMyEntitlements(userId);
    const value = entitlements?.isAdmin === true;
    cloudAdminCache = { userId, value };
    return value;
  } catch {
    return false;
  }
}

export function clearCloudAdminCache(): void {
  cloudAdminCache = null;
}

export function useAppAdmin(): boolean {
  const email = useAuthStore((s) => s.email);
  const cloudEmail = useAuthStore((s) => s.cloudSession?.email);
  const cloudUserId = useAuthStore((s) => s.cloudSession?.user_id);
  const localUserId = useAuthStore((s) => s.localUserId);
  const localAdmin = isAdminIdentity({ email, cloudEmail, localUserId });
  const [cloudAdmin, setCloudAdmin] = useState(false);

  useEffect(() => {
    if (localAdmin || !cloudUserId) {
      setCloudAdmin((prev) => (prev ? false : prev));
      return;
    }
    let cancelled = false;
    void fetchCloudAdminStatus(cloudUserId).then((value) => {
      if (!cancelled) setCloudAdmin(value);
    });
    return () => {
      cancelled = true;
    };
  }, [localAdmin, cloudUserId]);

  return localAdmin || cloudAdmin;
}
