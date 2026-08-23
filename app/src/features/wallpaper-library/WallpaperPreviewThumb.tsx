import * as React from 'react';
import { Lock, Wallpaper } from 'lucide-react';
import type { CatalogWallpaper } from './types';
import { wallpaperFallbackSrc, wallpaperPreviewSrc } from './previewUrl';

interface WallpaperPreviewThumbProps {
  wallpaper: CatalogWallpaper;
  locked: boolean;
}

/**
 * 1-second looping muted preview for every catalog tile (locked or not).
 * Clips are short public assets — not the full downloadable master.
 */
export function WallpaperPreviewThumb({ wallpaper, locked }: WallpaperPreviewThumbProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = React.useState(false);
  const preview = wallpaperPreviewSrc(wallpaper);
  const poster = wallpaperFallbackSrc(wallpaper);

  React.useEffect(() => {
    setFailed(false);
  }, [preview]);

  // Hard-cap playback to ~1s even if a longer asset is served. Catalog grids can
  // contain dozens of videos, so only the tile under the pointer may decode/play.
  React.useEffect(() => {
    const el = videoRef.current;
    if (!el || failed) return;

    const onTimeUpdate = () => {
      if (el.currentTime >= 0.98) {
        el.currentTime = 0;
        void el.play().catch(() => undefined);
      }
    };
    el.addEventListener('timeupdate', onTimeUpdate);
    return () => el.removeEventListener('timeupdate', onTimeUpdate);
  }, [preview, failed]);

  const playPreview = () => {
    const el = videoRef.current;
    if (!el || failed || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    void el.play().catch(() => undefined);
  };

  const stopPreview = () => {
    const el = videoRef.current;
    if (!el) return;
    el.pause();
    el.currentTime = 0;
  };

  return (
    <div
      className="wallpaper-library-thumb"
      aria-hidden="true"
      onPointerEnter={playPreview}
      onPointerLeave={stopPreview}
    >
      {!failed ? (
        <video
          ref={videoRef}
          className="wallpaper-library-thumb-video"
          src={preview}
          poster={poster}
          muted
          playsInline
          loop
          preload="metadata"
          onError={() => setFailed(true)}
        />
      ) : (
        <img
          className="wallpaper-library-thumb-video"
          src={poster}
          alt=""
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      )}
      {failed ? <Wallpaper className="wallpaper-library-thumb-fallback-icon" /> : null}
      {locked ? (
        <span className="wallpaper-library-lock" title="Locked">
          <Lock />
        </span>
      ) : null}
    </div>
  );
}
