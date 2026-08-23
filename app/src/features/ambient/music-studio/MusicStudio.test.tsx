import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultMusicMix, useMusicProjectStore } from './musicProject';

const playProject = vi.fn();
vi.mock('../ambientAudio', () => ({
  AmbientAudioEngine: { getInstance: () => ({ playProject, resume: vi.fn(), stop: vi.fn() }) },
}));
import { MusicStudio } from './MusicStudio';

describe('MusicStudio', () => {
  beforeEach(() => {
    playProject.mockReset();
    useMusicProjectStore.setState({
      clips: [],
      loop: true,
      enabledForAmbient: false,
      savedAt: null,
    });
  });
  afterEach(cleanup);

  it('searches, previews, adds, edits, reorders, and saves a cloud track', () => {
    render(<MusicStudio open onOpenChange={vi.fn()} />);
    expect(screen.getByText('64 cloud songs')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search cloud music'), {
      target: { value: "Ain't No Time" },
    });
    const preview = screen.getByRole('button', { name: /Preview Ain't No Time Like Now/ });
    fireEvent.click(preview);
    expect(playProject).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Add Ain't No Time Like Now.*to mix/ }));
    expect(screen.getByText('1 clip in one continuous track')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Selected clip start (seconds)'), {
      target: { value: '5' },
    });
    fireEvent.change(screen.getByLabelText('Selected clip speed'), {
      target: { value: '1.5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(useMusicProjectStore.getState().clips[0]).toMatchObject({ trimStart: 5, speed: 1.5 });
    expect(useMusicProjectStore.getState().savedAt).toEqual(expect.any(Number));
  });

  it('renders the complete prebuilt mix as a clickable horizontal timeline and edits one selected clip', () => {
    useMusicProjectStore.setState({ clips: createDefaultMusicMix(), savedAt: null });
    render(<MusicStudio open onOpenChange={vi.fn()} />);

    expect(screen.getByText('64 clips in one continuous track')).toBeTruthy();
    const first = screen.getByRole('button', { name: /Edit Ain't No Time Like Now/ });
    fireEvent.click(first);
    expect(playProject).toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: "Ain't No Time Like Now - BLAEKER" })).toBeTruthy();
    expect(screen.getByLabelText('Selected clip start (seconds)')).toBeTruthy();
    const timeline = screen.getAllByTestId('music-timeline-clip');
    expect(timeline).toHaveLength(64);
    expect(within(timeline[0]!).getByText('Selected')).toBeTruthy();
    expect(first.getAttribute('aria-pressed')).toBe('true');

    const originalIds = useMusicProjectStore.getState().clips.map((clip) => clip.id);
    fireEvent.dragStart(timeline[0]!);
    fireEvent.dragOver(timeline[2]!);
    fireEvent.drop(timeline[2]!);
    expect(
      useMusicProjectStore
        .getState()
        .clips.slice(0, 3)
        .map((clip) => clip.id),
    ).toEqual([originalIds[1], originalIds[2], originalIds[0]]);
  });
});
