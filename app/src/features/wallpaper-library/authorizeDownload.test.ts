import { describe, expect, it } from 'vitest';
import {
  SIGNED_DOWNLOAD_TTL_SECONDS,
  authorizeWallpaperDownload,
} from './authorizeDownload';

const wallpaper = {
  id: 'aaaaaaaa-bbbb-4ccc-addd-eeeeeeeeeeee',
  slug: 'cosmic-haven',
  active: true,
  storage_path: 'wallpapers/cosmic-haven/wallpaper.mp4',
  sha256: 'abc123',
  size_bytes: 12_345_678,
};

describe('authorizeWallpaperDownload (shipped core)', () => {
  it('rejects when not entitled — no permanent URL', () => {
    const result = authorizeWallpaperDownload({
      accessMode: 'none',
      isAdmin: false,
      orbitWallpaperIds: [],
      wallpaper,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('not_entitled');
      expect(result.access_mode).toBe('none');
    }
    expect(JSON.stringify(result)).not.toContain('download_url');
    expect(JSON.stringify(result)).not.toMatch(/https?:\/\//);
  });

  it('rejects Orbit user for a wallpaper not in their slots', () => {
    const result = authorizeWallpaperDownload({
      accessMode: 'orbit_slots',
      isAdmin: false,
      orbitWallpaperIds: ['other-id'],
      wallpaper,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not_entitled');
  });

  it('returns short-lived grant shape for entitled Nova user', () => {
    const result = authorizeWallpaperDownload({
      accessMode: 'full_catalog',
      isAdmin: false,
      orbitWallpaperIds: [],
      wallpaper,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.storage_path).toBe(wallpaper.storage_path);
      expect(result.expires_in_seconds).toBe(SIGNED_DOWNLOAD_TTL_SECONDS);
      expect(result.expires_in_seconds).toBeLessThanOrEqual(120);
      expect(result.entitlement_source).toBe('nova_subscription');
      expect(result.slug).toBe('cosmic-haven');
    }
  });

  it('returns orbit_slot source for assigned Orbit wallpaper', () => {
    const result = authorizeWallpaperDownload({
      accessMode: 'orbit_slots',
      isAdmin: false,
      orbitWallpaperIds: [wallpaper.id],
      wallpaper,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entitlement_source).toBe('orbit_slot');
      expect(result.expires_in_seconds).toBe(120);
    }
  });

  it('rejects inactive catalog rows', () => {
    const result = authorizeWallpaperDownload({
      accessMode: 'full_catalog',
      isAdmin: true,
      orbitWallpaperIds: [],
      wallpaper: { ...wallpaper, active: false },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_wallpaper');
  });
});
