import { describe, expect, it, vi } from 'vitest';
import { executeMediaCommand } from './mediaCommands';

describe('media command authority', () => {
  it('clamps volume and reports the canonical observed value', async () => {
    const setVolume = vi.fn(async (value: number) => value);
    await expect(
      executeMediaCommand({ id: 'music.volume', value: 130 }, { action: vi.fn(), setVolume }),
    ).resolves.toEqual({ ok: true, code: 'opened', message: 'Music volume is 100.' });
    expect(setVolume).toHaveBeenCalledWith(100);
  });

  it('routes only enumerated playback actions', async () => {
    const action = vi.fn(async () => undefined);
    await expect(
      executeMediaCommand({ id: 'music.next' }, { action, setVolume: vi.fn() }),
    ).resolves.toMatchObject({ ok: true, code: 'opened' });
    expect(action).toHaveBeenCalledWith('next');
  });

  it('routes bounded track and ambient selections through explicit capabilities', async () => {
    const selectTrack = vi.fn(async () => undefined);
    const setAmbient = vi.fn(async () => undefined);
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

  it('bounds the observed volume and rejects a non-numeric observation', async () => {
    await expect(
      executeMediaCommand(
        { id: 'music.volume', value: 50 },
        { action: vi.fn(), setVolume: vi.fn(async () => 140) },
      ),
    ).resolves.toEqual({ ok: true, code: 'opened', message: 'Music volume is 100.' });

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
});
