import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MusicClip } from '@/features/ambient/music-studio/musicProject';

const mocks = vi.hoisted(() => {
  const clips = Array.from({ length: 64 }, (_, index) => ({
    id: `clip-${index}`,
    source: 'cloud' as const,
    trackId: `track-${index}`,
    name: `Song ${index + 1}`,
    trimStart: index === 0 ? 4 : 0,
    trimEnd: index === 0 ? 18 : null,
    speed: index === 0 ? 1.25 : 1,
  }));
  const projectState = {
    clips,
    enabledForAmbient: false,
    loop: false,
    save: vi.fn(),
    setEnabledForAmbient: vi.fn((enabled: boolean) => {
      projectState.enabledForAmbient = enabled;
    }),
  };
  const uiState = {
    ambient: true,
    ambientActive: false,
    ambientAlwaysPlay: true,
    ambientDrone: false,
    ambientThresholdMs: 300_000,
    ambientTrack: 'music-1',
    ambientVolume: 37,
    clockFormat: 'local',
    setAmbient: vi.fn(),
    setAmbientActive: vi.fn(),
    setAmbientAlwaysPlay: vi.fn(),
    setAmbientDrone: vi.fn(),
    setAmbientThresholdMs: vi.fn(),
    setAmbientTrack: vi.fn(),
    setAmbientVolume: vi.fn(),
    setClockFormat: vi.fn(),
    setSettingsOpen: vi.fn(),
  };
  return {
    audio: {
      play: vi.fn(),
      playProject: vi.fn(),
      resume: vi.fn(),
      setTrack: vi.fn(),
      setVolume: vi.fn(),
      stop: vi.fn(),
      subscribeStatus: vi.fn(() => vi.fn()),
    },
    projectState,
    uiState,
  };
});

vi.mock('@/stores/ui', () => ({
  useUIStore: Object.assign(
    (selector: (state: typeof mocks.uiState) => unknown) => selector(mocks.uiState),
    { getState: () => mocks.uiState },
  ),
}));

vi.mock('@/stores/auth', () => ({
  useAuthStore: (selector: (state: { plan: string }) => unknown) => selector({ plan: 'free' }),
}));

vi.mock('@/lib/admin', () => ({ useAppAdmin: () => false }));
vi.mock('@/lib/entitlements', () => ({ effectivePlan: (plan: string) => plan }));
vi.mock('@/features/ambient/ambientAudio', () => ({
  AmbientAudioEngine: { getInstance: () => mocks.audio },
}));
vi.mock('@/features/ambient/tracks', () => ({
  AMBIENT_PREVIEW_DURATION_MS: 15_000,
  AMBIENT_TRACKS: [
    { id: 'music-1', label: 'Catalog Track', desc: 'A normal hosted track', url: '/track.mp3' },
  ],
  FREE_AMBIENT_TRACK: 'music-1',
  getAmbientTrackDef: () => ({ label: 'Catalog Track' }),
  planAllowsAmbientTrack: () => true,
}));
vi.mock('@/features/ambient/music-studio/musicProject', () => ({
  useMusicProjectStore: Object.assign(
    (selector: (state: typeof mocks.projectState) => unknown) => selector(mocks.projectState),
    { getState: () => mocks.projectState },
  ),
}));
vi.mock('@/features/ambient/music-studio/MusicStudio', () => ({ MusicStudio: () => null }));

import { Ambient } from './Ambient';

describe('Ambient Music Studio integration', () => {
  beforeEach(() => {
    mocks.projectState.enabledForAmbient = false;
    mocks.projectState.loop = false;
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it('offers the complete saved mix as an explicit 24/7 source', () => {
    render(<Ambient />);
    fireEvent.click(screen.getByRole('button', { name: /VibeSpace Mix.*64 songs/i }));

    expect(mocks.projectState.setEnabledForAmbient).toHaveBeenCalledWith(true);
    expect(mocks.projectState.save).toHaveBeenCalled();
    expect(screen.getByText(/all 64 songs once in catalog order/i)).toBeTruthy();
  });

  it('previews the selected mix with its edits, loop setting, and live volume', () => {
    mocks.projectState.enabledForAmbient = true;
    render(<Ambient />);

    fireEvent.click(screen.getByRole('button', { name: /Preview music/i }));
    expect(mocks.audio.playProject).toHaveBeenCalledWith(
      mocks.projectState.clips as MusicClip[],
      false,
      37,
    );
    expect(mocks.audio.play).not.toHaveBeenCalled();
    expect(mocks.audio.resume).toHaveBeenCalled();
  });

  it('switches cleanly from the mix back to a catalog track', () => {
    mocks.projectState.enabledForAmbient = true;
    render(<Ambient />);

    fireEvent.click(screen.getByRole('button', { name: /Catalog Track/i }));
    expect(mocks.projectState.setEnabledForAmbient).toHaveBeenCalledWith(false);
    expect(mocks.projectState.save).toHaveBeenCalled();
    expect(mocks.uiState.setAmbientTrack).toHaveBeenCalledWith('music-1');
    expect(mocks.audio.setTrack).toHaveBeenCalledWith('music-1');
  });
});
