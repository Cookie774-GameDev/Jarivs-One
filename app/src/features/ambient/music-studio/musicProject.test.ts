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

  it('starts an untouched mix with every unique cloud song once in catalog order', () => {
    const defaults = createDefaultMusicMix();
    expect(defaults).toHaveLength(63);
    expect(new Set(defaults.map((clip) => musicClipUrl(clip))).size).toBe(63);
    expect(new Set(defaults.map((clip) => clip.id)).size).toBe(63);

    const restored = restoreMusicProjectSnapshot(
      { clips: [], savedAt: null },
      { name: 'My Vibe Mix', clips: defaults, loop: true, enabledForAmbient: false, savedAt: null },
    );
    expect(restored.clips).toHaveLength(63);
  });

  it('keeps the first edited clip while removing restored byte-identical cloud duplicates', () => {
    const copies = MUSIC_LIBRARY.filter((track) => track.name.startsWith('Play No Games'));
    const persisted = copies.map((track, index) => ({
      id: `copy-${index}`,
      source: 'cloud' as const,
      trackId: track.id,
      name: track.name,
      trimStart: index === 0 ? 7 : 0,
      trimEnd: null,
      speed: 1,
    }));

    const restored = restoreMusicProjectSnapshot(
      { clips: persisted, savedAt: 123 },
      { name: 'My Vibe Mix', clips: [], loop: true, enabledForAmbient: false, savedAt: null },
    );

    expect(restored.clips).toHaveLength(1);
    expect(restored.clips[0]).toMatchObject({ id: 'copy-0', trimStart: 7 });
  });

  it('does not append the same cloud recording twice, including alias object IDs', () => {
    const copies = MUSIC_LIBRARY.filter((track) => track.name.startsWith('Play No Games'));
    expect(useMusicProjectStore.getState().addCloudTrack(copies[0]!.id)).toBe(true);
    expect(useMusicProjectStore.getState().addCloudTrack(copies[0]!.id)).toBe(false);
    expect(useMusicProjectStore.getState().addCloudTrack(copies[1]!.id)).toBe(false);
    expect(useMusicProjectStore.getState().clips).toHaveLength(1);
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
