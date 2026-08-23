import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMusicProjectStore } from './musicProject';

const playProject = vi.fn();
vi.mock('../ambientAudio', () => ({
  AmbientAudioEngine: { getInstance: () => ({ playProject, resume: vi.fn(), stop: vi.fn() }) },
}));
import { MusicStudio } from './MusicStudio';

describe('MusicStudio', () => {
  beforeEach(() =>
    useMusicProjectStore.setState({
      clips: [],
      loop: true,
      enabledForAmbient: false,
      savedAt: null,
    }),
  );
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
    fireEvent.change(screen.getByLabelText('Start (s)'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Speed'), { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(useMusicProjectStore.getState().clips[0]).toMatchObject({ trimStart: 5, speed: 1.5 });
    expect(useMusicProjectStore.getState().savedAt).toEqual(expect.any(Number));
  });
});
