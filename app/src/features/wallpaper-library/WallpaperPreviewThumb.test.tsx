// @vitest-environment jsdom

import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WallpaperPreviewThumb } from './WallpaperPreviewThumb';
import type { CatalogWallpaper } from './types';

const wallpaper: CatalogWallpaper = {
  id: 'wallpaper-id',
  slug: 'misty-temple',
  name: 'Misty Temple',
  description: 'Test wallpaper',
  category: 'fantasy',
  tags: [],
  version: '1.0.0',
  author: 'VibeSpace',
  thumbnail_path: 'wallpapers/misty-temple/thumbnail.webp',
  preview_path: 'wallpapers/misty-temple/preview.mp4',
  fallback_path: 'wallpapers/misty-temple/fallback.webp',
  size_bytes: 1_000_000,
  width: 1920,
  height: 1080,
  format: 'mp4',
  engine_type: 'video',
  performance_tier: 'balanced',
  featured: false,
  active: true,
  sort_order: 1,
};

describe('WallpaperPreviewThumb', () => {
  const play = vi.fn().mockResolvedValue(undefined);
  const pause = vi.fn();

  beforeEach(() => {
    play.mockClear();
    pause.mockClear();
    Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: play });
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
      configurable: true,
      value: pause,
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'load', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
  });

  it('keeps public preview media idle until hover and resets it on leave', async () => {
    const { container } = render(<WallpaperPreviewThumb wallpaper={wallpaper} locked />);
    const thumb = container.querySelector('.wallpaper-library-thumb')!;
    const video = container.querySelector('video') as HTMLVideoElement;

    expect(video.autoplay).toBe(false);
    expect(video.getAttribute('src')).toBeNull();
    expect(video.preload).toBe('none');
    expect(play).not.toHaveBeenCalled();

    fireEvent.pointerEnter(thumb);
    expect(video.getAttribute('src')).toContain('preview.mp4');
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));

    video.currentTime = 0.6;
    fireEvent.pointerLeave(thumb);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(video.currentTime).toBe(0);
  });

  it('does not animate previews when reduced motion is requested', () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
    const { container } = render(<WallpaperPreviewThumb wallpaper={wallpaper} locked={false} />);
    fireEvent.pointerEnter(container.querySelector('.wallpaper-library-thumb')!);
    expect(play).not.toHaveBeenCalled();
  });
});
