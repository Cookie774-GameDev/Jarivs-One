import type { InstantResult } from '../types';

const MAX_COMMAND_ID_LENGTH = 64;
const MAX_SETTING_ID_LENGTH = 128;
const MAX_SETTING_VALUE_LENGTH = 256;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

export type SettingDescriptor = Readonly<{
  id: string;
  kind: 'boolean' | 'percentage';
  sensitive: false;
  rollback: 'restore_previous';
  parse: (raw: string) => unknown;
}>;

export const SETTING_DESCRIPTORS: readonly SettingDescriptor[] = Object.freeze([
  Object.freeze({
    id: 'ambient.enabled',
    kind: 'boolean',
    sensitive: false,
    rollback: 'restore_previous',
    parse: (raw: string) => {
      if (typeof raw !== 'string') throw new Error('Invalid setting value.');
      if (/^(?:on|true|enabled)$/iu.test(raw.trim())) return true;
      if (/^(?:off|false|disabled)$/iu.test(raw.trim())) return false;
      throw new Error('Say on or off.');
    },
  }),
  Object.freeze({
    id: 'ambient.volume',
    kind: 'percentage',
    sensitive: false,
    rollback: 'restore_previous',
    parse: (raw: string) => {
      if (typeof raw !== 'string' || raw.trim().length === 0) {
        throw new Error('Invalid setting value.');
      }
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

function failure(message: string): InstantResult {
  return { ok: false, code: 'queue_failed', message };
}

function canonicalValue(descriptor: SettingDescriptor, observed: unknown): unknown {
  return descriptor.parse(String(observed));
}

function isBoundedField(value: unknown, maximumLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximumLength &&
    !CONTROL_CHARACTERS.test(value)
  );
}

async function writeWithRollback(
  descriptor: SettingDescriptor,
  previous: unknown,
  next: unknown,
  port: SettingCommandPort,
): Promise<InstantResult> {
  try {
    const observed = canonicalValue(descriptor, await port.set(descriptor.id, next));
    return { ok: true, code: 'opened', message: `${descriptor.id} is ${String(observed)}.` };
  } catch {
    try {
      await port.set(descriptor.id, previous);
      return failure('Setting update failed; the previous value was restored.');
    } catch {
      return failure('Setting update failed; the previous value could not be restored.');
    }
  }
}

export async function executeSettingCommand(
  request: Readonly<{ id: string; settingId: string; rawValue?: string }>,
  port: SettingCommandPort,
): Promise<InstantResult> {
  if (
    !isBoundedField(request.id, MAX_COMMAND_ID_LENGTH) ||
    !isBoundedField(request.settingId, MAX_SETTING_ID_LENGTH)
  ) {
    return failure('Invalid setting request.');
  }
  const descriptor = SETTING_DESCRIPTORS.find((entry) => entry.id === request.settingId);
  if (!descriptor) return failure('That setting is not allowed.');
  if (!['setting.read', 'setting.set', 'setting.toggle'].includes(request.id)) {
    return failure('Unknown setting command.');
  }
  if (request.id === 'setting.read') {
    try {
      const observed = canonicalValue(descriptor, await port.read(descriptor.id));
      return { ok: true, code: 'opened', message: `${descriptor.id} is ${String(observed)}.` };
    } catch {
      return failure('Setting value is unavailable.');
    }
  }
  if (request.id === 'setting.toggle') {
    if (descriptor.kind !== 'boolean') return failure('That setting cannot be toggled.');
    try {
      const previous = canonicalValue(descriptor, await port.read(descriptor.id));
      return writeWithRollback(descriptor, previous, !previous, port);
    } catch {
      return failure('Setting value is unavailable.');
    }
  }
  if (
    !isBoundedField(request.rawValue, MAX_SETTING_VALUE_LENGTH) ||
    request.rawValue.trim().length === 0
  ) {
    return failure('Invalid setting value.');
  }
  let parsed: unknown;
  try {
    parsed = descriptor.parse(request.rawValue);
  } catch {
    return failure('Invalid setting value.');
  }
  try {
    const previous = canonicalValue(descriptor, await port.read(descriptor.id));
    return writeWithRollback(descriptor, previous, parsed, port);
  } catch {
    return failure('Setting value is unavailable.');
  }
}
