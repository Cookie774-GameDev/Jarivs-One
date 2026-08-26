import { MUSIC_LIBRARY_TRACKS, MUSIC_LIBRARY_TOTAL_BYTES } from './catalog.generated';

export const MUSIC_DELIVERY_BASE =
  'https://vibespace-music-delivery.vibespace-viper.workers.dev/v1/tracks';

export interface MusicLibraryTrack {
  id: string;
  name: string;
  objectKey: string;
  bytes: number;
  sha256: string;
  contentType: 'audio/mpeg';
  url: string;
}

export const MUSIC_LIBRARY: readonly MusicLibraryTrack[] = MUSIC_LIBRARY_TRACKS.map((track) => ({
  ...track,
  url: `${MUSIC_DELIVERY_BASE}/${encodeURIComponent(track.objectKey.split('/').at(-1)!)}`,
}));

export const MUSIC_STUDIO_LIBRARY: readonly MusicLibraryTrack[] = MUSIC_LIBRARY.filter(
  (track, index, tracks) =>
    tracks.findIndex((candidate) => candidate.sha256 === track.sha256) === index,
);

export const MUSIC_STUDIO_TOTAL_BYTES = MUSIC_STUDIO_LIBRARY.reduce(
  (total, track) => total + track.bytes,
  0,
);

export { MUSIC_LIBRARY_TOTAL_BYTES };

export function findMusicTrack(id: string): MusicLibraryTrack | undefined {
  return MUSIC_LIBRARY.find((track) => track.id === id);
}
