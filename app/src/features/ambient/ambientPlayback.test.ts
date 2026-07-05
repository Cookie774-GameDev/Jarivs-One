import { describe, expect, it } from 'vitest';
import { shouldAmbientMusicPlay } from './ambientPlayback';

describe('shouldAmbientMusicPlay', () => {
  it('plays when 24/7 is enabled', () => {
    expect(shouldAmbientMusicPlay(false, false, false, true)).toBe(true);
    expect(shouldAmbientMusicPlay(true, false, false, true)).toBe(true);
  });

  it('plays only during ambient idle when 24/7 is off', () => {
    expect(shouldAmbientMusicPlay(true, true, true, false)).toBe(true);
    expect(shouldAmbientMusicPlay(true, false, true, false)).toBe(false);
    expect(shouldAmbientMusicPlay(true, true, false, false)).toBe(false);
  });

  it('does not play when everything is off', () => {
    expect(shouldAmbientMusicPlay(false, false, false, false)).toBe(false);
    expect(shouldAmbientMusicPlay(true, false, false, false)).toBe(false);
    expect(shouldAmbientMusicPlay(false, true, true, false)).toBe(false);
  });
});
