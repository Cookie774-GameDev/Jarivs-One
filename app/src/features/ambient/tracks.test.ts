import { describe, expect, it } from 'vitest';
import type { AmbientTrack } from '@/stores/ui';
import {
  AMBIENT_MUSIC_CDN_BASE,
  AMBIENT_MUSIC_OBJECT_KEYS,
  AMBIENT_TRACKS,
  FREE_AMBIENT_TRACK,
  buildAmbientTrackUrl,
  getAmbientTrackIndex,
  getAmbientTrackPrimaryUrl,
  getPlayableAmbientTrack,
  planAllowsAmbientTrack,
} from './tracks';

describe('ambient hosted playlist', () => {
  it('contains five R2-hosted tracks with exact Cloudflare object keys', () => {
    expect(AMBIENT_TRACKS).toHaveLength(5);
    expect(AMBIENT_MUSIC_OBJECT_KEYS).toEqual([
      '40173586-arabian-dunes-at-night-experience-492898.mp3',
      'armonicamente-genres-hiphop-lofi-141320.mp3',
      'kyoto-drift-hlfmn-main-version-24609-03-32.mp3',
      'u_1hjvnzqz68-tokyo-glow-285247.mp3',
      'artmanzh-chill-lofi-hip-hop-background-music-in-d-minor-262654.mp3',
    ]);
    expect(AMBIENT_TRACKS.map((track) => track.id)).toEqual([
      'music-1',
      'music-2',
      'music-3',
      'music-4',
      'music-5',
    ]);
    expect(AMBIENT_TRACKS.every((track) => track.url.startsWith(AMBIENT_MUSIC_CDN_BASE))).toBe(true);
    expect(getAmbientTrackPrimaryUrl('music-1')).toBe(
      `${AMBIENT_MUSIC_CDN_BASE}/40173586-arabian-dunes-at-night-experience-492898.mp3`,
    );
    expect(getAmbientTrackPrimaryUrl('music-4')).toBe(
      `${AMBIENT_MUSIC_CDN_BASE}/u_1hjvnzqz68-tokyo-glow-285247.mp3`,
    );
  });

  it('encodes spaced filenames in CDN URLs', () => {
    expect(buildAmbientTrackUrl('Warm Hearth.mp3')).toBe(
      `${AMBIENT_MUSIC_CDN_BASE}/Warm%20Hearth.mp3`,
    );
  });

  it('allows every playlist track on every plan', () => {
    for (const track of AMBIENT_TRACKS) {
      expect(planAllowsAmbientTrack(track.id, 'free')).toBe(true);
    }
  });

  it('resolves unknown persisted track ids to the first playlist entry', () => {
    const oldTrack = 'music-99' as AmbientTrack;
    expect(getPlayableAmbientTrack(oldTrack, 'free')).toBe(FREE_AMBIENT_TRACK);
    expect(getAmbientTrackIndex(oldTrack)).toBe(0);
  });
});
