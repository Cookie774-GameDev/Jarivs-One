import { describe, expect, it } from 'vitest';
import { wallpaperFallbackSrc, wallpaperPreviewSrc } from './previewUrl';
import type { CatalogWallpaper } from './types';

const sample: CatalogWallpaper = {
  id: 'x',
  slug: 'demo-slug',
  name: 'Demo',
  description: '',
  category: 'abstract',
  tags: [],
  version: '1.0.0',
  thumbnail_path: 'wallpapers/demo-slug/thumbnail.webp',
  preview_path: 'wallpapers/demo-slug/preview.webm',
  fallback_path: 'wallpapers/demo-slug/fallback.webp',
  size_bytes: 1,
  width: 1920,
  height: 1080,
  format: 'mp4',
  engine_type: 'video',
  performance_tier: 'balanced',
  featured: false,
  sort_order: 1,
};

describe('wallpaper preview urls', () => {
  it('rewrites seed .webm preview paths to bundled .mp4 loops', () => {
    expect(wallpaperPreviewSrc(sample)).toBe('/wallpapers/demo-slug/preview.mp4');
  });

  it('falls back to slug path when preview_path missing', () => {
    expect(wallpaperPreviewSrc({ ...sample, preview_path: null })).toBe(
      '/wallpapers/demo-slug/preview.mp4',
    );
  });

  it('resolves fallback poster path', () => {
    expect(wallpaperFallbackSrc(sample)).toBe('/wallpapers/demo-slug/fallback.webp');
  });
});
