import { describe, expect, it } from 'vitest';
import { MUSIC_DELIVERY_BASE, MUSIC_LIBRARY, MUSIC_LIBRARY_TOTAL_BYTES } from './catalog';

describe('VibeSpace cloud music catalog', () => {
  it('contains all 64 exact private-bucket objects with unique delivery URLs', () => {
    expect(MUSIC_LIBRARY).toHaveLength(64);
    expect(MUSIC_LIBRARY_TOTAL_BYTES).toBe(335_678_213);
    expect(new Set(MUSIC_LIBRARY.map((track) => track.id)).size).toBe(64);
    expect(new Set(MUSIC_LIBRARY.map((track) => track.url)).size).toBe(64);
    expect(MUSIC_LIBRARY.every((track) => track.url.startsWith(MUSIC_DELIVERY_BASE))).toBe(true);
    expect(MUSIC_LIBRARY.every((track) => /^[0-9a-f]{64}$/.test(track.sha256))).toBe(true);
  });

  it('keeps identical source files as distinct stable catalog entries', () => {
    const copies = MUSIC_LIBRARY.filter((track) => track.name.startsWith('Play No Games'));
    expect(copies).toHaveLength(2);
    expect(copies[0]!.sha256).toBe(copies[1]!.sha256);
    expect(copies[0]!.id).not.toBe(copies[1]!.id);
  });
});
