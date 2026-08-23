import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MUSIC_LIBRARY } from './catalog';
import {
  createDefaultMusicMix,
  musicClipUrl,
  normalizeMusicClip,
  restoreMusicProjectSnapshot,
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

  it('starts an untouched mix with all 64 cloud songs in catalog order', () => {
    const defaults = createDefaultMusicMix();
    expect(defaults).toHaveLength(64);
    expect(defaults.map((clip) => clip.trackId)).toEqual(MUSIC_LIBRARY.map((track) => track.id));
    expect(new Set(defaults.map((clip) => clip.id)).size).toBe(64);

    const restored = restoreMusicProjectSnapshot(
      { clips: [], savedAt: null },
      { name: 'My Vibe Mix', clips: defaults, loop: true, enabledForAmbient: false, savedAt: null },
    );
    expect(restored.clips).toHaveLength(64);
  });

  it('preserves an intentional saved clear instead of recreating the default mix', () => {
    const restored = restoreMusicProjectSnapshot(
      { clips: [], savedAt: 123 },
      {
        name: 'My Vibe Mix',
        clips: createDefaultMusicMix(),
        loop: true,
        enabledForAmbient: false,
        savedAt: null,
      },
    );
    expect(restored.clips).toEqual([]);
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

  it('moves a clip directly to a timeline drop index', () => {
    const defaults = createDefaultMusicMix().slice(0, 3);
    useMusicProjectStore.setState({ clips: defaults });
    useMusicProjectStore.getState().moveClipTo(defaults[0]!.id, 2);
    expect(useMusicProjectStore.getState().clips.map((clip) => clip.id)).toEqual([
      defaults[1]!.id,
      defaults[2]!.id,
      defaults[0]!.id,
    ]);
  });
});
