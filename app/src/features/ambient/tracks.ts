import type { PlanId } from '@/lib/entitlements';
import type { AmbientTrack } from '@/stores/ui';

/** Public Cloudflare R2 bucket for hosted ambient music (no trailing slash). */
export const AMBIENT_MUSIC_CDN_BASE =
  'https://pub-faf22cd0f7f5404cb3364caa61c6f992.r2.dev';

export interface AmbientTrackDef {
  id: AmbientTrack;
  /** Short display name in Settings. */
  label: string;
  desc: string;
  /** Exact R2 object key at bucket root — must match Cloudflare. */
  filename: string;
  /** Fully resolved CDN URL with path encoding for special characters. */
  url: string;
  premium: false;
}

/** Build a CDN URL for an R2 object key, encoding each path segment. */
export function buildAmbientTrackUrl(filename: string): string {
  const encoded = filename.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  return `${AMBIENT_MUSIC_CDN_BASE}/${encoded}`;
}

/** Exact object keys from Cloudflare R2 (user bucket). */
const R2_AMBIENT_FILES = [
  {
    id: 'music-1' as const,
    filename: '40173586-arabian-dunes-at-night-experience-492898.mp3',
    label: 'Arabian Dunes at Night',
    desc: 'Desert night ambience',
  },
  {
    id: 'music-2' as const,
    filename: 'armonicamente-genres-hiphop-lofi-141320.mp3',
    label: 'Hip Hop Lofi',
    desc: 'Lo-fi hip hop groove',
  },
  {
    id: 'music-3' as const,
    filename: 'kyoto-drift-hlfmn-main-version-24609-03-32.mp3',
    label: 'Kyoto Drift',
    desc: 'Kyoto drift main mix',
  },
  {
    id: 'music-4' as const,
    // Pixabay key uses digit 1 (u_1hjvnzqz68), not letter l (u_lhjvnzqz68).
    filename: 'u_1hjvnzqz68-tokyo-glow-285247.mp3',
    label: 'Tokyo Glow',
    desc: 'Tokyo night glow',
  },
  {
    id: 'music-5' as const,
    filename: 'artmanzh-chill-lofi-hip-hop-background-music-in-d-minor-262654.mp3',
    label: 'Chill Lofi Hip Hop',
    desc: 'Chill lo-fi hip hop in D minor',
  },
] as const;

/** Exact R2 object keys the app loads from bucket root. */
export const AMBIENT_MUSIC_OBJECT_KEYS: readonly string[] = R2_AMBIENT_FILES.map((t) => t.filename);

/** Hosted playlist — selected track loops. */
export const AMBIENT_TRACKS: readonly AmbientTrackDef[] = R2_AMBIENT_FILES.map((track) => ({
  id: track.id,
  label: track.label,
  desc: track.desc,
  filename: track.filename,
  url: buildAmbientTrackUrl(track.filename),
  premium: false as const,
}));

export const FREE_AMBIENT_TRACK: AmbientTrack = 'music-1';

export const AMBIENT_PREVIEW_DURATION_MS = 15_000;

export function getAmbientTrackDef(track: AmbientTrack): AmbientTrackDef {
  return AMBIENT_TRACKS.find((item) => item.id === track) ?? AMBIENT_TRACKS[0];
}

export function getAmbientTrackIndex(track: AmbientTrack): number {
  const index = AMBIENT_TRACKS.findIndex((item) => item.id === track);
  return index >= 0 ? index : 0;
}

export function getAmbientTrackPrimaryUrl(track: AmbientTrack): string {
  return getAmbientTrackDef(track).url;
}

export function planAllowsAmbientTrack(_track: AmbientTrack, _plan: PlanId, _admin = false): boolean {
  return true;
}

export function getPlayableAmbientTrack(track: AmbientTrack, _plan: PlanId, _admin = false): AmbientTrack {
  return getAmbientTrackDef(track).id;
}
