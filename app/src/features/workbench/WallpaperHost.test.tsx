// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WallpaperHost } from './WallpaperHost';

const { rehydrateWallpaperObjectUrl } = vi.hoisted(() => ({
  rehydrateWallpaperObjectUrl: vi.fn(async () => 'blob:rehydrated-full-master'),
}));

vi.mock('@/features/wallpaper-library/localWallpaperStore', () => ({
  rehydrateWallpaperObjectUrl,
}));

describe('WallpaperHost durable catalog playback', () => {
  it('rehydrates the selected catalog master after the Workbench remounts', async () => {
    render(
      <WallpaperHost
        config={{
          id: 'custom-video',
          paused: true,
          interactive: false,
          intensity: 0.72,
          brightness: 0.5,
          quality: 'balanced',
          catalogWallpaperId: 'wallpaper-cosmic-haven',
        }}
      />,
    );

    await waitFor(() =>
      expect(rehydrateWallpaperObjectUrl).toHaveBeenCalledWith('wallpaper-cosmic-haven'),
    );
    expect(screen.getByTestId('workbench-wallpaper').querySelector('video')?.src).toContain(
      'blob:rehydrated-full-master',
    );
  });
});
