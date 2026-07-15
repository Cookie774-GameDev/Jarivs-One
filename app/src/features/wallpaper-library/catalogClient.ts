import type {
  CatalogWallpaper,
  WallpaperAccessState,
  WallpaperCatalogResponse,
} from './types';
import {
  WALLPAPER_CATALOG_CACHE_KEY,
  WALLPAPER_ENTITLEMENT_CACHE_KEY,
} from './types';
import {
  canApplyWallpaper,
  canRequestDownload,
  resolveWallpaperAccess,
  type SubscriptionAccessSnapshot,
} from './entitlementPolicy';

export type CatalogLoadResult = {
  wallpapers: CatalogWallpaper[];
  access: WallpaperAccessState;
  source: 'network' | 'cache' | 'bundled-seed';
  fetchedAt: string;
};

const EMPTY_ACCESS: WallpaperAccessState = {
  mode: 'none',
  plan: 'free',
  status: 'inactive',
  period_end: null,
  is_admin: false,
  orbit_wallpaper_ids: [],
};

export function readCachedCatalog(): CatalogLoadResult | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(WALLPAPER_CATALOG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CatalogLoadResult;
    if (!parsed || !Array.isArray(parsed.wallpapers)) return null;
    return { ...parsed, source: 'cache' };
  } catch {
    return null;
  }
}

export function writeCachedCatalog(result: CatalogLoadResult): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      WALLPAPER_CATALOG_CACHE_KEY,
      JSON.stringify({
        wallpapers: result.wallpapers,
        access: result.access,
        fetchedAt: result.fetchedAt,
        source: 'cache',
      }),
    );
    window.localStorage.setItem(
      WALLPAPER_ENTITLEMENT_CACHE_KEY,
      JSON.stringify({
        access: result.access,
        cachedAt: Date.now(),
      }),
    );
  } catch {
    // quota — ignore
  }
}

/**
 * Load catalog from Supabase edge when session present; fall back to cache.
 * Full wallpaper list is never hard-coded here — seed is only offline bootstrap metadata.
 */
export async function loadWallpaperCatalog(input: {
  accessToken: string | null;
  functionsBaseUrl: string | null;
  seedCatalog?: CatalogWallpaper[];
}): Promise<CatalogLoadResult> {
  const cached = readCachedCatalog();

  if (input.accessToken && input.functionsBaseUrl) {
    try {
      const res = await fetch(`${input.functionsBaseUrl.replace(/\/$/, '')}/wallpaper-catalog`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          Accept: 'application/json',
        },
      });
      if (res.ok) {
        const body = (await res.json()) as WallpaperCatalogResponse;
        if (body?.ok && Array.isArray(body.wallpapers)) {
          const result: CatalogLoadResult = {
            wallpapers: body.wallpapers,
            access: body.access ?? EMPTY_ACCESS,
            source: 'network',
            fetchedAt: body.fetched_at ?? new Date().toISOString(),
          };
          writeCachedCatalog(result);
          return result;
        }
      }
    } catch {
      // fall through to cache
    }
  }

  if (cached && cached.wallpapers.length > 0) return cached;

  if (input.seedCatalog && input.seedCatalog.length > 0) {
    return {
      wallpapers: input.seedCatalog,
      access: EMPTY_ACCESS,
      source: 'bundled-seed',
      fetchedAt: new Date().toISOString(),
    };
  }

  return {
    wallpapers: [],
    access: EMPTY_ACCESS,
    source: 'cache',
    fetchedAt: new Date().toISOString(),
  };
}

export async function redeemOrbitWallpaper(input: {
  accessToken: string;
  functionsBaseUrl: string;
  wallpaperId: string;
}): Promise<{ ok: boolean; reason?: string; slot_number?: number }> {
  const res = await fetch(`${input.functionsBaseUrl.replace(/\/$/, '')}/wallpaper-redeem-orbit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ wallpaper_id: input.wallpaperId }),
  });
  return (await res.json()) as { ok: boolean; reason?: string; slot_number?: number };
}

export async function requestWallpaperDownloadUrl(input: {
  accessToken: string;
  functionsBaseUrl: string;
  wallpaperId: string;
}): Promise<{
  ok: boolean;
  reason?: string;
  download_url?: string;
  expires_in_seconds?: number;
  sha256?: string;
  size_bytes?: number;
  slug?: string;
}> {
  const res = await fetch(`${input.functionsBaseUrl.replace(/\/$/, '')}/wallpaper-download-url`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ wallpaper_id: input.wallpaperId }),
  });
  return (await res.json()) as {
    ok: boolean;
    reason?: string;
    download_url?: string;
    expires_in_seconds?: number;
    sha256?: string;
    size_bytes?: number;
    slug?: string;
  };
}

/**
 * Re-resolve access at decision time from plan/status/period_end (not a stale mode string).
 * Offline apply after expiry must fail once grace ends.
 */
export function resolveAccessFromCachedState(
  access: WallpaperAccessState,
  nowMs: number = Date.now(),
): ReturnType<typeof resolveWallpaperAccess> {
  const periodEnd = access.period_end
    ? Date.parse(access.period_end) || Number(access.period_end) || null
    : null;
  return resolveWallpaperAccess({
    plan: access.plan,
    status: access.status,
    currentPeriodEnd: periodEnd,
    isAdmin: access.is_admin,
    nowMs,
  });
}

/** Client-side apply gate — always re-checks grace/period_end vs now. */
export function clientMayApplyPremiumWallpaper(input: {
  wallpaperId: string;
  access: WallpaperAccessState;
  subscription?: SubscriptionAccessSnapshot;
  nowMs?: number;
}): boolean {
  const now = input.nowMs ?? Date.now();
  const mode =
    input.subscription != null
      ? resolveWallpaperAccess({
          ...input.subscription,
          isAdmin: input.access.is_admin || input.subscription.isAdmin,
          nowMs: now,
        })
      : resolveAccessFromCachedState(input.access, now);
  return canApplyWallpaper({
    access: mode,
    wallpaperId: input.wallpaperId,
    orbitSlotWallpaperIds: input.access.orbit_wallpaper_ids ?? [],
    isPremium: true,
  });
}

export function clientMayDownloadWallpaper(input: {
  wallpaperId: string;
  access: WallpaperAccessState;
  nowMs?: number;
}): boolean {
  const mode = resolveAccessFromCachedState(input.access, input.nowMs ?? Date.now());
  return canRequestDownload({
    access: mode,
    wallpaperId: input.wallpaperId,
    orbitSlotWallpaperIds: input.access.orbit_wallpaper_ids ?? [],
  });
}
