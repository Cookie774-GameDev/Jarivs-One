import * as React from 'react';
import { ImagePlus, Pause, Play, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { WallpaperLibrary } from '@/features/wallpaper-library/WallpaperLibrary';
import { useWorkbenchStore } from './store';
import { BUILT_IN_WALLPAPERS } from './wallpapers';
import type { WallpaperId } from './types';

interface WallpaperPickerProps {
  open: boolean;
  onClose: () => void;
}

export function WallpaperPicker({ open, onClose }: WallpaperPickerProps) {
  const config = useWorkbenchStore((state) => state.wallpaper);
  const setWallpaper = useWorkbenchStore((state) => state.setWallpaper);
  const configure = useWorkbenchStore((state) => state.configureWallpaper);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const requestedMedia = React.useRef<'image' | 'video'>('image');

  if (!open) return null;

  const choose = (id: WallpaperId) => {
    if (id === 'custom-image' || id === 'custom-video') {
      requestedMedia.current = id === 'custom-video' ? 'video' : 'image';
      if (fileRef.current) {
        fileRef.current.accept = requestedMedia.current === 'video' ? 'video/*' : 'image/*';
        fileRef.current.click();
      }
      return;
    }
    setWallpaper(id);
  };

  const readAsset = (file: File) => {
    const expected = requestedMedia.current;
    if (!file.type.startsWith(`${expected}/`)) {
      toast.warning('Unsupported wallpaper file', `Choose a ${expected} file.`);
      return;
    }
    const supportedImages = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']);
    const supportedVideos = new Set(['video/mp4', 'video/webm', 'video/ogg']);
    if ((expected === 'image' ? !supportedImages.has(file.type) : !supportedVideos.has(file.type))) {
      toast.warning('Unsupported wallpaper format', 'Choose PNG, JPEG, WebP, GIF, AVIF, MP4, WebM, or OGG.');
      return;
    }
    const limit = expected === 'image' ? 2 * 1024 * 1024 : 18 * 1024 * 1024;
    if (file.size > limit) {
      toast.warning('Wallpaper file is too large', `Choose a ${expected} under ${Math.round(limit / 1024 / 1024)} MB.`);
      return;
    }
    if (expected === 'video') {
      setWallpaper('custom-video', URL.createObjectURL(file));
      toast.info('Video wallpaper loaded', 'Local videos remain available for this app session.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setWallpaper('custom-image', reader.result);
    };
    reader.onerror = () => toast.error('Could not read wallpaper', 'The selected file was not changed.');
    reader.readAsDataURL(file);
  };

  return (
    <div className="workbench-sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="workbench-sheet workbench-wallpaper-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workbench-wallpaper-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p>Environment</p>
            <h2 id="workbench-wallpaper-title">Interactive wallpapers</h2>
          </div>
          <Button type="button" size="icon" variant="ghost" aria-label="Close wallpapers" onClick={onClose}><X /></Button>
        </header>
        <div className="workbench-wallpaper-grid">
          {BUILT_IN_WALLPAPERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              data-selected={entry.id === config.id ? 'true' : 'false'}
              onClick={() => choose(entry.id)}
            >
              <span className={`workbench-wallpaper-preview workbench-wallpaper-preview--${entry.preview}`}>
                {(entry.id === 'custom-image' || entry.id === 'custom-video') && <ImagePlus />}
              </span>
              <strong>{entry.name}</strong>
              <small>{entry.description}</small>
              <em>{entry.animated ? 'Motion' : 'Still'}{entry.interactive ? ' · interactive' : ''}</em>
            </button>
          ))}
        </div>
        <div className="workbench-wallpaper-controls">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => configure({ paused: !config.paused })}
          >
            {config.paused ? <Play /> : <Pause />}{config.paused ? 'Resume motion' : 'Pause motion'}
          </Button>
          <label>
            Intensity
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={config.intensity}
              onChange={(event) => configure({ intensity: Number(event.target.value) })}
            />
          </label>
          <label>
            Quality
            <select value={config.quality} onChange={(event) => configure({ quality: event.target.value as 'low' | 'balanced' | 'high' })}>
              <option value="low">Low</option>
              <option value="balanced">Balanced</option>
              <option value="high">High</option>
            </select>
          </label>
          <label className="workbench-toggle">
            <input type="checkbox" checked={config.interactive} onChange={(event) => configure({ interactive: event.target.checked })} />
            Pointer response
          </label>
        </div>
        <WallpaperLibrary />
        <input
          ref={fileRef}
          className="sr-only"
          type="file"
          accept={requestedMedia.current === 'video' ? 'video/*' : 'image/*'}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) readAsset(file);
            event.target.value = '';
          }}
        />
      </section>
    </div>
  );
}
