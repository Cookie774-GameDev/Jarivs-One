import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clientMayApplyPremiumWallpaper,
  clientMayDownloadWallpaper,
  loadWallpaperCatalog,
  readCachedCatalog,
  writeCachedCatalog,
} from './catalogClient';
import { WALLPAPER_CATALOG_CACHE_KEY } from './types';
import type { CatalogWallpaper } from './types';

const sample: CatalogWallpaper = {
  id: '11111111-1111-1111-1111-111111111111',
  slug: 'cosmic-haven',
  name: 'Cosmic Haven',
  description: 'Test',
  category: 'space',
  tags: ['space'],
  version: '1.0.0',
  thumbnail_path: 'wallpapers/cosmic-haven/thumbnail.webp',
  fallback_path: 'wallpapers/cosmic-haven/fallback.webp',
  size_bytes: 1000,
  width: 1920,
  height: 1080,
  format: 'mp4',
  engine_type: 'video',
  performance_tier: 'balanced',
  featured: true,
  sort_order: 1,
};

describe('wallpaper catalog client', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('loads catalog from network and caches metadata (not a hard-coded full list)', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        access: {
          mode: 'orbit_slots',
          plan: 'starter',
          status: 'active',
          period_end: null,
          is_admin: false,
          orbit_wallpaper_ids: [],
        },
        wallpapers: [sample],
        fetched_at: '2026-07-14T00:00:00.000Z',
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadWallpaperCatalog({
      accessToken: 'tok',
      functionsBaseUrl: 'https://example.functions.supabase.co',
    });

    expect(fetchMock).toHaveBeenCalled();
    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit?];
    const url = String(firstCall?.[0] ?? '');
    expect(url).toContain('wallpaper-catalog');
    expect(result.source).toBe('network');
    expect(result.wallpapers).toHaveLength(1);
    expect(result.wallpapers[0]?.slug).toBe('cosmic-haven');
    expect(readCachedCatalog()?.wallpapers[0]?.id).toBe(sample.id);
  });

  it('falls back to cache when network fails', async () => {
    writeCachedCatalog({
      wallpapers: [sample],
      access: {
        mode: 'full_catalog',
        plan: 'pro',
        status: 'active',
        period_end: null,
        is_admin: false,
        orbit_wallpaper_ids: [],
      },
      source: 'cache',
      fetchedAt: '2026-07-13T00:00:00.000Z',
    });
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));

    const result = await loadWallpaperCatalog({
      accessToken: 'tok',
      functionsBaseUrl: 'https://example.functions.supabase.co',
    });
    expect(result.source).toBe('cache');
    expect(result.wallpapers[0]?.slug).toBe('cosmic-haven');
    expect(window.localStorage.getItem(WALLPAPER_CATALOG_CACHE_KEY)).toBeTruthy();
  });

  it('gates download/apply using shipped entitlement helpers', () => {
    const orbitAccess = {
      mode: 'orbit_slots' as const,
      plan: 'starter',
      status: 'active',
      period_end: null,
      is_admin: false,
      orbit_wallpaper_ids: [sample.id],
    };
    expect(
      clientMayDownloadWallpaper({ wallpaperId: sample.id, access: orbitAccess }),
    ).toBe(true);
    expect(
      clientMayDownloadWallpaper({
        wallpaperId: '22222222-2222-2222-2222-222222222222',
        access: orbitAccess,
      }),
    ).toBe(false);
    expect(
      clientMayApplyPremiumWallpaper({
        wallpaperId: sample.id,
        access: orbitAccess,
      }),
    ).toBe(true);
  });

  it('re-resolves period_end grace at apply time so expired offline cache cannot apply', () => {
    const expiredAccess = {
      // Stale mode left as orbit_slots from last online fetch — must still re-check.
      mode: 'orbit_slots' as const,
      plan: 'starter',
      status: 'canceled',
      period_end: new Date(Date.UTC(2020, 0, 1)).toISOString(),
      is_admin: false,
      orbit_wallpaper_ids: [sample.id],
    };
    expect(
      clientMayApplyPremiumWallpaper({
        wallpaperId: sample.id,
        access: expiredAccess,
        nowMs: Date.UTC(2026, 6, 14),
      }),
    ).toBe(false);
    expect(
      clientMayDownloadWallpaper({
        wallpaperId: sample.id,
        access: expiredAccess,
        nowMs: Date.UTC(2026, 6, 14),
      }),
    ).toBe(false);
  });
});

