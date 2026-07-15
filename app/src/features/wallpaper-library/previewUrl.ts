import type { CatalogWallpaper } from './types';

/**
 * Resolve a publicly served 1s loop preview for a catalog wallpaper.
 * Previews live under Vite `public/wallpapers/<slug>/preview.mp4`.
 */
export function wallpaperPreviewSrc(wallpaper: CatalogWallpaper): string {
  if (wallpaper.preview_path) {
    const p = wallpaper.preview_path.replace(/^\//, '');
    // Prefer bundled mp4 previews even when seed still lists .webm
    if (p.endsWith('.webm')) {
      return `/${p.replace(/\.webm$/i, '.mp4')}`;
    }
    return `/${p}`;
  }
  return `/wallpapers/${wallpaper.slug}/preview.mp4`;
}

export function wallpaperFallbackSrc(wallpaper: CatalogWallpaper): string {
  if (wallpaper.fallback_path) {
    return `/${wallpaper.fallback_path.replace(/^\//, '')}`;
  }
  if (wallpaper.thumbnail_path) {
    return `/${wallpaper.thumbnail_path.replace(/^\//, '')}`;
  }
  return `/wallpapers/${wallpaper.slug}/fallback.webp`;
}
