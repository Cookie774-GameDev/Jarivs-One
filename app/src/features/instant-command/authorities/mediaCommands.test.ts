import { describe, expect, it, vi } from 'vitest';
import {
  createCanonicalMediaCommandPort,
  executeMediaCommand,
  resolveMediaTrack,
} from './mediaCommands';

describe('media command authority', () => {
  it('clamps volume and reports the canonical observed value', async () => {
    const setVolume = vi.fn(async (value: number) => value);
    await expect(
      executeMediaCommand({ id: 'music.volume', value: 130 }, { action: vi.fn(), setVolume }),
    ).resolves.toEqual({ ok: true, code: 'opened', message: 'Music volume is 100.' });
    expect(setVolume).toHaveBeenCalledWith(100);
  });

  it.each([
    ['music.play', 'play'],
    ['music.pause', 'pause'],
    ['music.resume', 'resume'],
    ['music.stop', 'stop'],
    ['music.next', 'next'],
    ['music.previous', 'previous'],
    ['music.mute', 'mute'],
    ['music.unmute', 'unmute'],
  ] as const)('routes %s through only the canonical %s action', async (id, expectedAction) => {
    const action = vi.fn(async () => undefined);
    await expect(
      executeMediaCommand({ id }, { action, setVolume: vi.fn() }),
    ).resolves.toMatchObject({ ok: true, code: 'opened' });
    expect(action).toHaveBeenCalledWith(expectedAction);
  });

  it('routes bounded track and ambient selections through explicit capabilities', async () => {
    const selectTrack = vi.fn(async () => ({ status: 'selected' as const, canonical: 'music-1' }));
    const setAmbient = vi.fn(async () => ({ status: 'selected' as const, canonical: 'music-2' }));
    const port = { action: vi.fn(), setVolume: vi.fn(), selectTrack, setAmbient };

    await expect(
      executeMediaCommand({ id: 'music.track', text: 'Northern Lights' }, port),
    ).resolves.toEqual({ ok: true, code: 'opened', message: 'Music track changed.' });
    expect(selectTrack).toHaveBeenCalledWith('Northern Lights');

    await expect(executeMediaCommand({ id: 'ambient.set', text: 'Rain' }, port)).resolves.toEqual({
      ok: true,
      code: 'opened',
      message: 'Ambient sound changed.',
    });
    expect(setAmbient).toHaveBeenCalledWith('Rain');
  });

  it('resolves a track by exact stable ID then unique normalized label', () => {
    const tracks = [
      { id: 'music-1', label: 'Northern Lights' },
      { id: 'music-2', label: 'Rain' },
    ] as const;
    expect(resolveMediaTrack(tracks, 'music-2')).toEqual({ status: 'resolved', id: 'music-2' });
    expect(resolveMediaTrack(tracks, ' northern   lights ')).toEqual({
      status: 'resolved',
      id: 'music-1',
    });
    expect(
      resolveMediaTrack([...tracks, { id: 'music-3', label: 'RAIN' }] as const, 'rain'),
    ).toEqual({ status: 'ambiguous', candidateIds: ['music-2', 'music-3'] });
    expect(resolveMediaTrack(tracks, 'missing')).toEqual({ status: 'missing' });
  });

  it('persists canonical track, volume, and play state and reconstructs unmute after reload', async () => {
    const state = {
      ambientTrack: 'music-1',
      ambientVolume: 55,
      ambientAlwaysPlay: false,
      setAmbientTrack(value: string) {
        this.ambientTrack = value;
      },
      setAmbientVolume(value: number) {
        this.ambientVolume = Math.max(0, Math.min(100, value));
      },
      setAmbientAlwaysPlay(value: boolean) {
        this.ambientAlwaysPlay = value;
      },
    };
    const engine = {
      play: vi.fn(),
      stop: vi.fn(),
      setTrack: vi.fn(),
      setVolume: vi.fn(),
    };
    const tracks = [
      { id: 'music-1', label: 'Northern Lights' },
      { id: 'music-2', label: 'Rain' },
    ] as const;
    const first = createCanonicalMediaCommandPort({ readState: () => state, engine, tracks });

    await first.setVolume(73);
    await first.selectTrack?.('Rain');
    await first.action('play');
    await first.action('mute');
    expect(state).toMatchObject({
      ambientTrack: 'music-2',
      ambientVolume: 73,
      ambientAlwaysPlay: true,
    });
    expect(engine.setVolume).toHaveBeenLastCalledWith(0);

    const reloadedEngine = {
      play: vi.fn(),
      stop: vi.fn(),
      setTrack: vi.fn(),
      setVolume: vi.fn(),
    };
    const reloaded = createCanonicalMediaCommandPort({
      readState: () => state,
      engine: reloadedEngine,
      tracks,
    });
    await reloaded.action('unmute');
    await reloaded.action('resume');
    expect(reloadedEngine.setVolume).toHaveBeenCalledWith(73);
    expect(reloadedEngine.play).toHaveBeenCalledWith('music-2', 73);
  });

  it('cycles tracks through the persisted canonical selection without inventing a playlist', async () => {
    const state = {
      ambientTrack: 'music-2',
      ambientVolume: 50,
      ambientAlwaysPlay: true,
      setAmbientTrack: vi.fn((value: string) => {
        state.ambientTrack = value;
      }),
      setAmbientVolume: vi.fn(),
      setAmbientAlwaysPlay: vi.fn(),
    };
    const engine = {
      play: vi.fn(),
      stop: vi.fn(),
      setTrack: vi.fn(),
      setVolume: vi.fn(),
    };
    const port = createCanonicalMediaCommandPort({
      readState: () => state,
      engine,
      tracks: [
        { id: 'music-1', label: 'One' },
        { id: 'music-2', label: 'Two' },
        { id: 'music-3', label: 'Three' },
      ],
    });

    await port.action('next');
    await port.action('previous');
    expect(state.setAmbientTrack.mock.calls).toEqual([['music-3'], ['music-2']]);
    expect(engine.setTrack.mock.calls).toEqual([['music-3'], ['music-2']]);
  });

  it('fails closed before dispatch and after a cancellation boundary', async () => {
    const action = vi.fn(async () => undefined);
    const port = { action, setVolume: vi.fn() };
    const before = new AbortController();
    before.abort();
    await expect(executeMediaCommand({ id: 'music.play' }, port, before.signal)).resolves.toEqual({
      ok: false,
      code: 'queue_failed',
      message: 'The instant command deadline elapsed.',
    });
    expect(action).not.toHaveBeenCalled();

    const after = new AbortController();
    action.mockImplementationOnce(async () => {
      after.abort();
    });
    await expect(executeMediaCommand({ id: 'music.play' }, port, after.signal)).resolves.toEqual({
      ok: false,
      code: 'queue_failed',
      message: 'The instant command deadline elapsed.',
    });
  });

  it.each([
    ['music.track', ''],
    ['music.track', 'line\nbreak'],
    ['ambient.set', 'x'.repeat(201)],
  ])('rejects unbounded selection text for %s before authority dispatch', async (id, text) => {
    const selectTrack = vi.fn();
    const setAmbient = vi.fn();

    await expect(
      executeMediaCommand(
        { id, text },
        { action: vi.fn(), setVolume: vi.fn(), selectTrack, setAmbient },
      ),
    ).resolves.toMatchObject({ ok: false, code: 'queue_failed' });
    expect(selectTrack).not.toHaveBeenCalled();
    expect(setAmbient).not.toHaveBeenCalled();
  });

  it('fails closed when a selection capability is unavailable', async () => {
    await expect(
      executeMediaCommand(
        { id: 'music.track', text: 'Northern Lights' },
        { action: vi.fn(), setVolume: vi.fn() },
      ),
    ).resolves.toEqual({
      ok: false,
      code: 'queue_failed',
      message: 'That media capability is unavailable.',
    });
  });

  it.each([
    [{ status: 'missing' as const }, 'target_missing', 'No media track matches.'],
    [
      { status: 'ambiguous' as const, candidateIds: ['music-1', 'music-2'] },
      'target_ambiguous',
      'More than one media track matches.',
    ],
  ])(
    'reports unresolved track selection truthfully without echoing the query',
    async (outcome, code, message) => {
      const result = await executeMediaCommand(
        { id: 'music.track', text: 'Private Query' },
        {
          action: vi.fn(),
          setVolume: vi.fn(),
          selectTrack: vi.fn(async () => outcome),
        },
      );
      expect(result).toEqual({ ok: false, code, message });
      expect(JSON.stringify(result)).not.toContain('Private Query');
    },
  );

  it('rejects out-of-range and non-numeric volume observations without inventing state', async () => {
    await expect(
      executeMediaCommand(
        { id: 'music.volume', value: 50 },
        { action: vi.fn(), setVolume: vi.fn(async () => 140) },
      ),
    ).resolves.toEqual({
      ok: false,
      code: 'queue_failed',
      message: 'Music volume is unavailable.',
    });

    await expect(
      executeMediaCommand(
        { id: 'music.volume', value: 50 },
        { action: vi.fn(), setVolume: vi.fn(async () => Number.NaN) },
      ),
    ).resolves.toEqual({
      ok: false,
      code: 'queue_failed',
      message: 'Music volume is unavailable.',
    });
  });

  it('redacts backend failures from receipts', async () => {
    const result = await executeMediaCommand(
      { id: 'music.play' },
      {
        action: vi.fn(async () => {
          throw new Error('private backend detail');
        }),
        setVolume: vi.fn(),
      },
    );

    expect(result).toEqual({ ok: false, code: 'queue_failed', message: 'Media command failed.' });
    expect(JSON.stringify(result)).not.toContain('private backend detail');
  });

  it.each(['toString', '__proto__', 'music.play\u0000', `music.${'x'.repeat(100)}`])(
    'rejects unknown or inherited command IDs before authority dispatch: %s',
    async (id) => {
      const action = vi.fn();
      const setVolume = vi.fn();
      await expect(executeMediaCommand({ id }, { action, setVolume })).resolves.toEqual({
        ok: false,
        code: 'queue_failed',
        message: 'Unknown media command.',
      });
      expect(action).not.toHaveBeenCalled();
      expect(setVolume).not.toHaveBeenCalled();
    },
  );

  it.each([
    { id: 'music.play', value: 50 },
    { id: 'music.volume', value: 50, text: 'secret-extra' },
    { id: 'music.track', text: 'Northern Lights', apiKey: 'must-not-enter-command' },
    { id: 'ambient.set', text: 'Rain', rawMessage: 'private conversation' },
  ])('rejects non-exact media request fields before authority dispatch: $id', async (request) => {
    const action = vi.fn();
    const setVolume = vi.fn();
    const selectTrack = vi.fn();
    const setAmbient = vi.fn();
    const result = await executeMediaCommand(request, {
      action,
      setVolume,
      selectTrack,
      setAmbient,
    });

    expect(result).toEqual({
      ok: false,
      code: 'queue_failed',
      message: 'Media command arguments are invalid.',
    });
    expect(JSON.stringify(result)).not.toContain('must-not-enter-command');
    expect(JSON.stringify(result)).not.toContain('private conversation');
    expect(action).not.toHaveBeenCalled();
    expect(setVolume).not.toHaveBeenCalled();
    expect(selectTrack).not.toHaveBeenCalled();
    expect(setAmbient).not.toHaveBeenCalled();
  });

  it.each([42, true, {}, []])(
    'classifies malformed selection text without leaking a runtime exception: %j',
    async (text) => {
      const selectTrack = vi.fn();
      await expect(
        executeMediaCommand(
          { id: 'music.track', text: text as never },
          { action: vi.fn(), setVolume: vi.fn(), selectTrack },
        ),
      ).resolves.toEqual({
        ok: false,
        code: 'queue_failed',
        message: 'Name a bounded track.',
      });
      expect(selectTrack).not.toHaveBeenCalled();
    },
  );
});
