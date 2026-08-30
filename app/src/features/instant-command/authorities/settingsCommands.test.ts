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
  });

  it('parses, clamps, writes, and reports the canonical observed value', async () => {
    const set = vi.fn(async (_id: string, value: unknown) => value);
    await expect(
      executeSettingCommand(
        { id: 'setting.set', settingId: 'ambient.volume', rawValue: '140' },
        { read: vi.fn(), set },
      ),
    ).resolves.toEqual({ ok: true, code: 'opened', message: 'ambient.volume is 100.' });
    expect(set).toHaveBeenCalledWith('ambient.volume', 100);
  });

  it('rejects secrets and unknown storage paths', async () => {
    await expect(
      executeSettingCommand(
        { id: 'setting.set', settingId: 'api.key', rawValue: 'secret' },
        { read: vi.fn(), set: vi.fn() },
      ),
    ).resolves.toMatchObject({ ok: false, code: 'queue_failed' });
  });
});
