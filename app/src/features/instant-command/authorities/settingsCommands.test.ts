import { describe, expect, it, vi } from 'vitest';
import { executeSettingCommand, SETTING_DESCRIPTORS } from './settingsCommands';

describe('setting command allowlist', () => {
  it('contains only bounded non-secret preferences', () => {
    expect(SETTING_DESCRIPTORS.map((descriptor) => descriptor.id)).toEqual([
      'ambient.enabled',
      'ambient.volume',
    ]);
    expect(
      SETTING_DESCRIPTORS.some((descriptor) =>
        /key|token|billing|credential/iu.test(descriptor.id),
      ),
    ).toBe(false);
    expect(
      SETTING_DESCRIPTORS.map(({ id, kind, sensitive, rollback }) => ({
        id,
        kind,
        sensitive,
        rollback,
      })),
    ).toEqual([
      {
        id: 'ambient.enabled',
        kind: 'boolean',
        sensitive: false,
        rollback: 'restore_previous',
      },
      {
        id: 'ambient.volume',
        kind: 'percentage',
        sensitive: false,
        rollback: 'restore_previous',
      },
    ]);
  });

  it('parses, clamps, writes, and reports the canonical observed value', async () => {
    const read = vi.fn(async () => 25);
    const set = vi.fn(async (_id: string, value: unknown) => value);
    await expect(
      executeSettingCommand(
        { id: 'setting.set', settingId: 'ambient.volume', rawValue: '140' },
        { read, set },
      ),
    ).resolves.toEqual({ ok: true, code: 'opened', message: 'ambient.volume is 100.' });
    expect(read).toHaveBeenCalledWith('ambient.volume');
    expect(set).toHaveBeenCalledWith('ambient.volume', 100);
  });

  it('rejects secrets and unknown storage paths', async () => {
    const read = vi.fn();
    const set = vi.fn();
    await expect(
      executeSettingCommand(
        { id: 'setting.set', settingId: 'api.key', rawValue: 'secret' },
        { read, set },
      ),
    ).resolves.toMatchObject({ ok: false, code: 'queue_failed' });
    expect(read).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it('toggles an allowlisted boolean from its canonical observed value', async () => {
    const read = vi.fn(async () => true);
    const set = vi.fn(async (_id: string, value: unknown) => value);
    await expect(
      executeSettingCommand({ id: 'setting.toggle', settingId: 'ambient.enabled' }, { read, set }),
    ).resolves.toEqual({ ok: true, code: 'opened', message: 'ambient.enabled is false.' });
    expect(read).toHaveBeenCalledWith('ambient.enabled');
    expect(set).toHaveBeenCalledWith('ambient.enabled', false);
  });

  it('restores the previous bounded value when a canonical setter fails', async () => {
    const read = vi.fn(async () => 25);
    const set = vi
      .fn()
      .mockRejectedValueOnce(new Error('private backend detail'))
      .mockResolvedValueOnce(25);

    await expect(
      executeSettingCommand(
        { id: 'setting.set', settingId: 'ambient.volume', rawValue: '80' },
        { read, set },
      ),
    ).resolves.toEqual({
      ok: false,
      code: 'queue_failed',
      message: 'Setting update failed; the previous value was restored.',
    });
    expect(set.mock.calls).toEqual([
      ['ambient.volume', 80],
      ['ambient.volume', 25],
    ]);
  });

  it.each([
    { id: 'setting.set', settingId: 'ambient.volume' },
    { id: 'setting.set', settingId: 'ambient.volume', rawValue: '' },
    { id: 'setting.set', settingId: 'ambient.volume', rawValue: '   ' },
    {
      id: 'setting.set',
      settingId: 'ambient.volume',
      rawValue: 42 as unknown as string,
    },
  ])(
    'rejects an absent or malformed set value before reading or writing: $rawValue',
    async (request) => {
      const read = vi.fn();
      const set = vi.fn();

      await expect(executeSettingCommand(request, { read, set })).resolves.toEqual({
        ok: false,
        code: 'queue_failed',
        message: 'Invalid setting value.',
      });
      expect(read).not.toHaveBeenCalled();
      expect(set).not.toHaveBeenCalled();
    },
  );

  it.each([
    { id: 'setting.set\u0000', settingId: 'ambient.volume', rawValue: '50' },
    { id: 'setting.set', settingId: `ambient.${'v'.repeat(256)}`, rawValue: '50' },
  ])('rejects invalid bounded request fields before accessing the port', async (request) => {
    const read = vi.fn();
    const set = vi.fn();

    await expect(executeSettingCommand(request, { read, set })).resolves.toEqual({
      ok: false,
      code: 'queue_failed',
      message: 'Invalid setting request.',
    });
    expect(read).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it('canonicalizes the previous value before using it for rollback', async () => {
    const read = vi.fn(async () => '25%');
    const set = vi
      .fn()
      .mockRejectedValueOnce(new Error('private backend detail'))
      .mockResolvedValueOnce(25);

    await expect(
      executeSettingCommand(
        { id: 'setting.set', settingId: 'ambient.volume', rawValue: '80' },
        { read, set },
      ),
    ).resolves.toEqual({
      ok: false,
      code: 'queue_failed',
      message: 'Setting update failed; the previous value was restored.',
    });
    expect(set.mock.calls).toEqual([
      ['ambient.volume', 80],
      ['ambient.volume', 25],
    ]);
  });
});
