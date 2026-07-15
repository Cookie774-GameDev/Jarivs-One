import { describe, expect, it } from 'vitest';
import { OrbitSlotLedger } from './orbitSlotLedger';
import { ORBIT_SLOT_LIMIT } from './entitlementPolicy';

describe('OrbitSlotLedger concurrent redeem (race-safe model)', () => {
  it('serializes concurrent redeems and blocks a third slot', async () => {
    const ledger = new OrbitSlotLedger();
    const ids = ['wp-1', 'wp-2', 'wp-3', 'wp-4', 'wp-5'];

    // Fire all at once — without a mutex, naive code would allow >2.
    const results = await Promise.all(
      ids.map((wallpaperId) =>
        ledger.redeem({
          access: 'orbit_slots',
          wallpaperId,
          wallpaperActive: true,
        }),
      ),
    );

    const ok = results.filter((r) => r.ok);
    const rejected = results.filter((r) => !r.ok);
    expect(ok).toHaveLength(ORBIT_SLOT_LIMIT);
    expect(rejected.length).toBeGreaterThanOrEqual(3);
    expect(ledger.listAssigned()).toHaveLength(2);
    for (const r of rejected) {
      if (!r.ok) expect(r.reason).toBe('slots_full');
    }
  });

  it('rejects duplicate wallpaper under concurrent double-submit', async () => {
    const ledger = new OrbitSlotLedger();
    const [a, b] = await Promise.all([
      ledger.redeem({ access: 'orbit_slots', wallpaperId: 'same', wallpaperActive: true }),
      ledger.redeem({ access: 'orbit_slots', wallpaperId: 'same', wallpaperActive: true }),
    ]);
    const oks = [a, b].filter((r) => r.ok);
    const dups = [a, b].filter((r) => !r.ok && r.reason === 'duplicate');
    expect(oks).toHaveLength(1);
    expect(dups).toHaveLength(1);
    expect(ledger.listAssigned()).toEqual(['same']);
  });
});
