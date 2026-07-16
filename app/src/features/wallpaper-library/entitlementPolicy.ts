/**
 * Server-mirrored wallpaper entitlement policy.
 * Plan ids match existing `subscriptions.plan` / `profiles.tier` truth:
 *   starter = Orbit ($10) — two permanent wallpaper slots
 *   pro     = Nova ($50)  — full catalog
 *   ultra / apex          — full catalog (higher paid tiers)
 * Never trust frontend-only state; edge functions re-run this with DB plan.
 */

export type WallpaperPlanId = 'free' | 'starter' | 'pro' | 'ultra' | 'apex';

export type WallpaperAccessMode = 'none' | 'orbit_slots' | 'full_catalog';

export const ORBIT_SLOT_LIMIT = 2;

/** Grace after period_end (ms) before premium wallpapers lock. */
export const WALLPAPER_ENTITLEMENT_GRACE_MS = 72 * 60 * 60 * 1000;

export type SubscriptionAccessSnapshot = {
  plan: WallpaperPlanId | string | null | undefined;
  status: string | null | undefined;
  currentPeriodEnd: number | null | undefined; // unix ms or seconds
  isAdmin?: boolean;
  nowMs?: number;
};

export function normalizeWallpaperPlan(plan: string | null | undefined): WallpaperPlanId {
  const p = (plan ?? 'free').toLowerCase();
  if (p === 'starter' || p === 'orbit') return 'starter';
  if (p === 'pro' || p === 'nova') return 'pro';
  if (p === 'ultra' || p === 'singularity') return 'ultra';
  if (p === 'apex' || p === 'supernova') return 'apex';
  return 'free';
}

function periodEndMs(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  // Stripe-style seconds vs ms
  return value < 1e12 ? value * 1000 : value;
}

/**
 * Whether paid access is still valid (active/trialing or within grace after period end).
 */
export function subscriptionAllowsWallpaperAccess(snap: SubscriptionAccessSnapshot): boolean {
  if (snap.isAdmin) return true;
  const status = (snap.status ?? '').toLowerCase();
  const now = snap.nowMs ?? Date.now();
  const end = periodEndMs(snap.currentPeriodEnd);

  if (status === 'active' || status === 'trialing') return true;
  // cancel_at_period_end still active until end
  if (status === 'canceled' || status === 'cancelled' || status === 'past_due' || status === 'unpaid') {
    if (end != null && now <= end + WALLPAPER_ENTITLEMENT_GRACE_MS) return true;
    return false;
  }
  if (end != null && now <= end + WALLPAPER_ENTITLEMENT_GRACE_MS) return true;
  return false;
}

export function wallpaperAccessModeForPlan(
  plan: string | null | undefined,
  isAdmin = false,
): WallpaperAccessMode {
  if (isAdmin) return 'full_catalog';
  const p = normalizeWallpaperPlan(plan);
  if (p === 'starter') return 'orbit_slots';
  if (p === 'pro' || p === 'ultra' || p === 'apex') return 'full_catalog';
  return 'none';
}

export function resolveWallpaperAccess(snap: SubscriptionAccessSnapshot): WallpaperAccessMode {
  if (snap.isAdmin) return 'full_catalog';
  if (!subscriptionAllowsWallpaperAccess(snap)) return 'none';
  return wallpaperAccessModeForPlan(snap.plan, false);
}

export type OrbitRedeemDecision =
  | { ok: true; slotNumber: 1 | 2 }
  | {
      ok: false;
      reason:
        | 'not_orbit'
        | 'inactive'
        | 'slots_full'
        | 'duplicate'
        | 'invalid_wallpaper'
        | 'admin_uses_full_catalog';
    };

/**
 * Pure Orbit slot assignment decision given already-locked slot rows.
 * `assigned` is the list of currently assigned wallpaper ids (length 0–2).
 */
export function decideOrbitRedeem(input: {
  access: WallpaperAccessMode;
  assignedWallpaperIds: string[];
  requestedWallpaperId: string;
  wallpaperActive: boolean;
}): OrbitRedeemDecision {
  if (!input.wallpaperActive) return { ok: false, reason: 'invalid_wallpaper' };
  if (input.access === 'full_catalog') return { ok: false, reason: 'admin_uses_full_catalog' };
  if (input.access !== 'orbit_slots') {
    return input.access === 'none' ? { ok: false, reason: 'inactive' } : { ok: false, reason: 'not_orbit' };
  }
  if (input.assignedWallpaperIds.includes(input.requestedWallpaperId)) {
    return { ok: false, reason: 'duplicate' };
  }
  if (input.assignedWallpaperIds.length >= ORBIT_SLOT_LIMIT) {
    return { ok: false, reason: 'slots_full' };
  }
  const slotNumber = (input.assignedWallpaperIds.length + 1) as 1 | 2;
  return { ok: true, slotNumber };
}

export function canApplyWallpaper(input: {
  access: WallpaperAccessMode;
  wallpaperId: string;
  orbitSlotWallpaperIds: string[];
  isPremium: boolean;
}): boolean {
  if (!input.isPremium) return true; // free procedural / built-in
  if (input.access === 'full_catalog') return true;
  if (input.access === 'orbit_slots') {
    return input.orbitSlotWallpaperIds.includes(input.wallpaperId);
  }
  return false;
}

export function canRequestDownload(input: {
  access: WallpaperAccessMode;
  wallpaperId: string;
  orbitSlotWallpaperIds: string[];
}): boolean {
  return canApplyWallpaper({ ...input, isPremium: true });
}
