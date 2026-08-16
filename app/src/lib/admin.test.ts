import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchMyEntitlements } = vi.hoisted(() => ({ fetchMyEntitlements: vi.fn() }));

vi.mock('@/lib/supabase/entitlements', () => ({ fetchMyEntitlements }));

import { clearCloudAdminCache, fetchCloudAdminStatus } from './admin';

describe('fetchCloudAdminStatus', () => {
  beforeEach(() => {
    fetchMyEntitlements.mockReset();
    clearCloudAdminCache();
  });

  it('uses the own-user entitlement result as the cloud authority', async () => {
    fetchMyEntitlements.mockResolvedValue({ userId: 'user-a', isAdmin: true });

    await expect(fetchCloudAdminStatus('user-a')).resolves.toBe(true);
    expect(fetchMyEntitlements).toHaveBeenCalledWith('user-a');
  });

  it('fails closed when entitlements are unavailable', async () => {
    fetchMyEntitlements.mockResolvedValue(null);
    await expect(fetchCloudAdminStatus('user-a')).resolves.toBe(false);
  });
});
