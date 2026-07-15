/**
 * In-process model of race-safe Orbit redeem (mirrors SQL FOR UPDATE + unique).
 * Concurrent redeem calls serialize on a mutex; only two slots can ever commit.
 */

import {
  ORBIT_SLOT_LIMIT,
  decideOrbitRedeem,
  type OrbitRedeemDecision,
  type WallpaperAccessMode,
} from './entitlementPolicy';

export class OrbitSlotLedger {
  private assigned: string[] = [];
  private chain: Promise<unknown> = Promise.resolve();

  /** Snapshot of assigned wallpaper ids (slot order). */
  listAssigned(): string[] {
    return [...this.assigned];
  }

  /**
   * Serialize redeems like `SELECT … FOR UPDATE` on orbit_wallpaper_slots.
   * Concurrent callers cannot both observe count < 2 and insert a third.
   */
  redeem(input: {
    access: WallpaperAccessMode;
    wallpaperId: string;
    wallpaperActive: boolean;
  }): Promise<OrbitRedeemDecision> {
    const run = async (): Promise<OrbitRedeemDecision> => {
      const decision = decideOrbitRedeem({
        access: input.access,
        assignedWallpaperIds: this.assigned,
        requestedWallpaperId: input.wallpaperId,
        wallpaperActive: input.wallpaperActive,
      });
      if (decision.ok) {
        // Unique(user, wallpaper) + slot cap — reject if already present.
        if (this.assigned.includes(input.wallpaperId)) {
          return { ok: false, reason: 'duplicate' };
        }
        if (this.assigned.length >= ORBIT_SLOT_LIMIT) {
          return { ok: false, reason: 'slots_full' };
        }
        this.assigned.push(input.wallpaperId);
      }
      return decision;
    };

    const next = this.chain.then(run, run);
    // Keep chain alive even if redeem rejects (it shouldn't throw).
    this.chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}
