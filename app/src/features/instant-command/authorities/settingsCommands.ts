import type { InstantResult } from '../types';

export type SettingDescriptor = Readonly<{
  id: string;
  parse: (raw: string) => unknown;
}>;

export const SETTING_DESCRIPTORS: readonly SettingDescriptor[] = Object.freeze([
  Object.freeze({
    id: 'ambient.enabled',
    parse: (raw: string) => {
      if (/^(?:on|true|enabled)$/iu.test(raw.trim())) return true;
      if (/^(?:off|false|disabled)$/iu.test(raw.trim())) return false;
      throw new Error('Say on or off.');
    },
  }),
  Object.freeze({
    id: 'ambient.volume',
    parse: (raw: string) => {
      const value = Number(raw.trim().replace(/%$/u, ''));
      if (!Number.isFinite(value)) throw new Error('Volume must be a number.');
      return Math.max(0, Math.min(100, Math.round(value)));
    },
  }),
]);

export type SettingCommandPort = Readonly<{
  read: (id: string) => unknown | Promise<unknown>;
  set: (id: string, value: unknown) => unknown | Promise<unknown>;
}>;

export async function executeSettingCommand(
  request: Readonly<{ id: string; settingId: string; rawValue?: string }>,
  port: SettingCommandPort,
): Promise<InstantResult> {
  const descriptor = SETTING_DESCRIPTORS.find((entry) => entry.id === request.settingId);
  if (!descriptor)
    return { ok: false, code: 'queue_failed', message: 'That setting is not allowed.' };
  if (request.id === 'setting.read') {
    const observed = await port.read(descriptor.id);
    return { ok: true, code: 'opened', message: `${descriptor.id} is ${String(observed)}.` };
  }
  try {
    const parsed = descriptor.parse(request.rawValue ?? '');
    const observed = await port.set(descriptor.id, parsed);
    return { ok: true, code: 'opened', message: `${descriptor.id} is ${String(observed)}.` };
  } catch (error) {
    return {
      ok: false,
      code: 'queue_failed',
      message: error instanceof Error ? error.message : 'Invalid setting value.',
    };
  }
}
