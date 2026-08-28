// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WallpaperLibrary } from './WallpaperLibrary';

const { catalogWallpaper } = vi.hoisted(() => ({
  catalogWallpaper: {
    id: 'wallpaper-cosmic-haven',
    slug: 'cosmic-haven',
    name: 'Cosmic Haven',
    description: 'Test',
    category: 'space',
    tags: ['space'],
    version: '1.0.0',
    thumbnail_path: 'wallpapers/cosmic-haven/thumbnail.webp',
    fallback_path: 'wallpapers/cosmic-haven/fallback.webp',
    size_bytes: 1_000_000,
    width: 1920,
    height: 1080,
    format: 'mp4',
    engine_type: 'video',
    performance_tier: 'balanced',
    featured: true,
    sort_order: 1,
  },
}));

vi.mock('./catalogSeed.generated', () => ({ CATALOG_SEED: [catalogWallpaper] }));
vi.mock('./catalogClient', async () => {
  const actual = await vi.importActual<typeof import('./catalogClient')>('./catalogClient');
  return {
    ...actual,
    readCachedCatalog: () => null,
    loadWallpaperCatalog: () => new Promise(() => undefined),
  };
});
vi.mock('./localWallpaperStore', () => ({
  listWallpaperBlobIds: () => new Promise(() => undefined),
  deleteWallpaperBlob: vi.fn(),
  isFullQualityCached: vi.fn(async () => false),
  storeDownloadedWallpaper: vi.fn(),
  storeFullMasterPath: vi.fn(),
}));
vi.mock('./WallpaperPreviewThumb', () => ({
  WallpaperPreviewThumb: () => <div data-testid="wallpaper-preview" />,
}));
vi.mock('@/lib/admin', () => ({ useAppAdmin: () => false }));
vi.mock('@/stores/auth', () => ({
  useAuthStore: (selector: (state: object) => unknown) => selector({ plan: 'free' }),
}));
vi.mock('@/features/workbench/store', () => ({
  useWorkbenchStore: (selector: (state: object) => unknown) => selector({ setWallpaper: vi.fn() }),
}));

describe('WallpaperLibrary first paint', () => {
  it('renders the bundled catalog immediately while session and network refresh remain pending', () => {
    render(<WallpaperLibrary />);
    expect(screen.getByText('Cosmic Haven')).toBeTruthy();
    expect(screen.getByLabelText('Search wallpapers')).toBeTruthy();
  });
});
