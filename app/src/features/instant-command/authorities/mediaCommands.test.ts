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
});
