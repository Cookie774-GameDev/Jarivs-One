export type WallpaperPerformanceTier = 'low' | 'balanced' | 'high';

export interface CatalogWallpaper {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  version: string;
  author?: string;
  thumbnail_path: string;
  preview_path?: string | null;
  fallback_path: string;
  size_bytes: number;
  width: number;
  height: number;
  format: string;
  engine_type: string;
  performance_tier: WallpaperPerformanceTier;
  featured: boolean;
  sort_order: number;
  updated_at?: string;
  minimum_app_version?: string;
  sha256?: string;
  active?: boolean;
}

export interface WallpaperAccessState {
  mode: 'none' | 'orbit_slots' | 'full_catalog';
  plan: string;
  status: string;
  period_end: string | null;
  is_admin: boolean;
  orbit_wallpaper_ids: string[];
}

export interface WallpaperCatalogResponse {
  ok: boolean;
  access: WallpaperAccessState;
  wallpapers: CatalogWallpaper[];
  fetched_at: string;
}

export interface LocalWallpaperCacheEntry {
  wallpaperId: string;
  slug: string;
  version: string;
  sha256: string;
  localPathOrBlobUrl: string;
  downloadedAt: number;
  sizeBytes: number;
}

export const WALLPAPER_CATALOG_CACHE_KEY = 'vibespace-wallpaper-catalog:v3';
export const WALLPAPER_LOCAL_CACHE_KEY = 'vibespace-wallpaper-local:v1';
export const WALLPAPER_ENTITLEMENT_CACHE_KEY = 'vibespace-wallpaper-entitlement:v1';
