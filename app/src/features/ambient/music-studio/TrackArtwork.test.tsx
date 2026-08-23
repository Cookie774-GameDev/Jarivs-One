import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MUSIC_LIBRARY } from './catalog';
import { TrackArtwork, trackArtworkRecipe } from './TrackArtwork';

describe('TrackArtwork', () => {
  it('creates a distinct deterministic artwork recipe for every cloud song', () => {
    const recipes = MUSIC_LIBRARY.map((track) => trackArtworkRecipe(track.id));
    expect(new Set(recipes.map((recipe) => recipe.signature)).size).toBe(64);
    expect(trackArtworkRecipe(MUSIC_LIBRARY[0]!.id)).toEqual(
      trackArtworkRecipe(MUSIC_LIBRARY[0]!.id),
    );
  });

  it('exposes the song name while keeping decorative geometry hidden', () => {
    render(<TrackArtwork seed="track-1" name="Example Song" />);
    expect(screen.getByRole('img', { name: 'Artwork for Example Song' })).toBeTruthy();
  });
});
