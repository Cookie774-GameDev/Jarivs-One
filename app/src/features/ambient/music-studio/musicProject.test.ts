import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MUSIC_LIBRARY } from './catalog';
import {
  musicClipUrl,
  normalizeMusicClip,
  revokeLocalMusicClip,
  useMusicProjectStore,
} from './musicProject';

describe('music project', () => {
  beforeEach(() =>
    useMusicProjectStore.setState({
      clips: [],
      loop: true,
      enabledForAmbient: false,
      savedAt: null,
    }),
  );

  it('adds, reorders, trims, speeds, and saves cloud clips', () => {
    const [first, second] = MUSIC_LIBRARY;
    expect(useMusicProjectStore.getState().addCloudTrack(first!.id)).toBe(true);
    expect(useMusicProjectStore.getState().addCloudTrack(second!.id)).toBe(true);
    const clips = useMusicProjectStore.getState().clips;
    useMusicProjectStore.getState().moveClip(clips[1]!.id, -1);
    useMusicProjectStore
      .getState()
      .updateClip(clips[0]!.id, { trimStart: 12, trimEnd: 24, speed: 1.5 });
    expect(useMusicProjectStore.getState().clips.map((clip) => clip.trackId)).toEqual([
      second!.id,
      first!.id,
    ]);
    expect(useMusicProjectStore.getState().clips[1]).toMatchObject({
      trimStart: 12,
      trimEnd: 24,
      speed: 1.5,
    });
    useMusicProjectStore.getState().save();
    expect(useMusicProjectStore.getState().savedAt).toEqual(expect.any(Number));
  });

  it('fails closed on unknown cloud tracks and invalid clip values', () => {
    expect(useMusicProjectStore.getState().addCloudTrack('unknown')).toBe(false);
    expect(
      normalizeMusicClip({ id: 'x', source: 'cloud', trackId: 'unknown', name: 'x' }),
    ).toBeNull();
  });

  it('keeps local audio device-only and revokes its object URL', () => {
    const revoke = vi.fn();
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    const file = new File(['audio'], 'mine.mp3', { type: 'audio/mpeg' });
    expect(useMusicProjectStore.getState().addLocalFile(file, 'blob:mine')).toBe(true);
    const clip = useMusicProjectStore.getState().clips[0]!;
    expect(musicClipUrl(clip)).toBe('blob:mine');
    revokeLocalMusicClip(clip);
    expect(revoke).toHaveBeenCalledWith('blob:mine');
  });
});
