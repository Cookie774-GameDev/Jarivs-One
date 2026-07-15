/**
 * Pure core of authorize_wallpaper_download (mirrors SQL RPC).
 * Edge function calls the DB RPC; tests drive this shipped decision path.
 */

import {
  type WallpaperAccessMode,
  canRequestDownload,
} from './entitlementPolicy';

export const SIGNED_DOWNLOAD_TTL_SECONDS = 120;

export type AuthorizeWallpaperDownloadInput = {
  accessMode: WallpaperAccessMode;
  isAdmin: boolean;
  orbitWallpaperIds: string[];
  wallpaper: {
    id: string;
    slug: string;
    active: boolean;
    storage_path: string;
    sha256: string;
    size_bytes: number;
  } | null;
};

export type AuthorizeWallpaperDownloadResult =
  | {
      ok: true;
      wallpaper_id: string;
      slug: string;
      storage_path: string;
      sha256: string;
      size_bytes: number;
      entitlement_source: 'admin' | 'nova_subscription' | 'orbit_slot';
      expires_in_seconds: number;
    }
  | {
      ok: false;
      reason: 'invalid_wallpaper' | 'not_entitled';
      access_mode?: WallpaperAccessMode;
    };

export function authorizeWallpaperDownload(
  input: AuthorizeWallpaperDownloadInput,
): AuthorizeWallpaperDownloadResult {
  const wp = input.wallpaper;
  if (!wp || !wp.active || !wp.storage_path) {
    return { ok: false, reason: 'invalid_wallpaper' };
  }

  const entitled = canRequestDownload({
    access: input.accessMode,
    wallpaperId: wp.id,
    orbitSlotWallpaperIds: input.orbitWallpaperIds,
  });

  if (!entitled) {
    return {
      ok: false,
      reason: 'not_entitled',
      access_mode: input.accessMode,
    };
  }

  let source: 'admin' | 'nova_subscription' | 'orbit_slot';
  if (input.accessMode === 'full_catalog') {
    source = input.isAdmin ? 'admin' : 'nova_subscription';
  } else {
    source = 'orbit_slot';
  }

  return {
    ok: true,
    wallpaper_id: wp.id,
    slug: wp.slug,
    storage_path: wp.storage_path,
    sha256: wp.sha256,
    size_bytes: wp.size_bytes,
    entitlement_source: source,
    expires_in_seconds: SIGNED_DOWNLOAD_TTL_SECONDS,
  };
}
