import { describe, expect, it } from 'vitest';
import {
  ORBIT_SLOT_LIMIT,
  WALLPAPER_ENTITLEMENT_GRACE_MS,
  canApplyWallpaper,
  canRequestDownload,
  decideOrbitRedeem,
  normalizeWallpaperPlan,
  resolveWallpaperAccess,
  subscriptionAllowsWallpaperAccess,
  wallpaperAccessModeForPlan,
} from './entitlementPolicy';

describe('wallpaper entitlement policy (shipped)', () => {
  it('maps Orbit/Nova labels onto starter/pro plan ids', () => {
    expect(normalizeWallpaperPlan('orbit')).toBe('starter');
    expect(normalizeWallpaperPlan('starter')).toBe('starter');
    expect(normalizeWallpaperPlan('nova')).toBe('pro');
    expect(normalizeWallpaperPlan('pro')).toBe('pro');
  });

  it('Orbit is two-slot mode; Nova/ultra/apex are full catalog', () => {
    expect(wallpaperAccessModeForPlan('starter')).toBe('orbit_slots');
    expect(wallpaperAccessModeForPlan('pro')).toBe('full_catalog');
    expect(wallpaperAccessModeForPlan('ultra')).toBe('full_catalog');
    expect(wallpaperAccessModeForPlan('free')).toBe('none');
    expect(wallpaperAccessModeForPlan('free', true)).toBe('full_catalog');
  });

  it('rejects a third Orbit slot and duplicate assignment', () => {
    const first = decideOrbitRedeem({
      access: 'orbit_slots',
      assignedWallpaperIds: [],
      requestedWallpaperId: 'wp-a',
      wallpaperActive: true,
    });
    expect(first).toEqual({ ok: true, slotNumber: 1 });

    const second = decideOrbitRedeem({
      access: 'orbit_slots',
      assignedWallpaperIds: ['wp-a'],
      requestedWallpaperId: 'wp-b',
      wallpaperActive: true,
    });
    expect(second).toEqual({ ok: true, slotNumber: 2 });

    const third = decideOrbitRedeem({
      access: 'orbit_slots',
      assignedWallpaperIds: ['wp-a', 'wp-b'],
      requestedWallpaperId: 'wp-c',
      wallpaperActive: true,
    });
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.reason).toBe('slots_full');
    expect(ORBIT_SLOT_LIMIT).toBe(2);

    const dup = decideOrbitRedeem({
      access: 'orbit_slots',
      assignedWallpaperIds: ['wp-a'],
      requestedWallpaperId: 'wp-a',
      wallpaperActive: true,
    });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.reason).toBe('duplicate');
  });

  it('inactive plan after grace cannot download or apply premium wallpapers', () => {
    const now = Date.UTC(2026, 6, 14);
    const expired = now - WALLPAPER_ENTITLEMENT_GRACE_MS - 1000;
    const snap = {
      plan: 'starter',
      status: 'canceled',
      currentPeriodEnd: expired,
      nowMs: now,
    };
    expect(subscriptionAllowsWallpaperAccess(snap)).toBe(false);
    expect(resolveWallpaperAccess(snap)).toBe('none');
    expect(
      canRequestDownload({
        access: 'none',
        wallpaperId: 'wp-a',
        orbitSlotWallpaperIds: ['wp-a'],
      }),
    ).toBe(false);
    expect(
      canApplyWallpaper({
        access: 'none',
        wallpaperId: 'wp-a',
        orbitSlotWallpaperIds: ['wp-a'],
        isPremium: true,
      }),
    ).toBe(false);
  });

  it('Orbit apply only for assigned slots; Nova apply for any premium id', () => {
    expect(
      canApplyWallpaper({
        access: 'orbit_slots',
        wallpaperId: 'wp-a',
        orbitSlotWallpaperIds: ['wp-a'],
        isPremium: true,
      }),
    ).toBe(true);
    expect(
      canApplyWallpaper({
        access: 'orbit_slots',
        wallpaperId: 'wp-z',
        orbitSlotWallpaperIds: ['wp-a'],
        isPremium: true,
      }),
    ).toBe(false);
    expect(
      canApplyWallpaper({
        access: 'full_catalog',
        wallpaperId: 'wp-z',
        orbitSlotWallpaperIds: [],
        isPremium: true,
      }),
    ).toBe(true);
  });

  it('admin always full catalog even without paid status', () => {
    expect(
      resolveWallpaperAccess({
        plan: 'free',
        status: 'inactive',
        currentPeriodEnd: null,
        isAdmin: true,
      }),
    ).toBe('full_catalog');
  });
});
