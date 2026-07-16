import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_WALLPAPERS,
  isSafeWallpaperAssetUrl,
  validateWallpaperDefinition,
} from './wallpapers';

describe('Workbench wallpaper registry', () => {
  it('ships the complete declarative wallpaper set independently of Pets', () => {
    expect(BUILT_IN_WALLPAPERS).toHaveLength(13);
    expect(BUILT_IN_WALLPAPERS.map((entry) => entry.id)).toEqual([
      'none',
      'warm-gradient',
      'space-clouds',
      'starfield',
      'orbital-lights',
      'particles',
      'fluid-gradient',
      'aurora',
      'cozy-night-window',
      'grid-pulse',
      'custom-image',
      'custom-video',
      'user-pack',
    ]);
    expect(JSON.stringify(BUILT_IN_WALLPAPERS).toLowerCase()).not.toContain('pet');
    expect(BUILT_IN_WALLPAPERS.every((entry) => validateWallpaperDefinition(entry).ok)).toBe(
      true,
    );
  });

  it('accepts image/video assets but blocks executable and privileged URLs', () => {
    expect(isSafeWallpaperAssetUrl('blob:https://localhost/asset-id', 'image')).toBe(true);
    expect(isSafeWallpaperAssetUrl('data:image/png;base64,abc', 'image')).toBe(true);
    expect(isSafeWallpaperAssetUrl('https://cdn.example.test/clouds.webp', 'image')).toBe(true);
    expect(isSafeWallpaperAssetUrl('data:text/html,<script>bad()</script>', 'image')).toBe(false);
    expect(isSafeWallpaperAssetUrl('data:image/svg+xml,<svg onload="bad()"/>', 'image')).toBe(false);
    expect(isSafeWallpaperAssetUrl('javascript:bad()', 'video')).toBe(false);
    expect(isSafeWallpaperAssetUrl('file:///secret.mov', 'video')).toBe(false);
  });
});
