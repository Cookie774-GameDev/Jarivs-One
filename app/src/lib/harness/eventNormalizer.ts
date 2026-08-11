import { redactHarnessText } from './errors';
import type { HarnessEvent } from './types';

const MAX_DELTA_LENGTH = 32_768;
const MAX_PATH_LENGTH = 2_048;
const MAX_ERROR_LENGTH = 2_048;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return typeof value === 'object' && value !== null ? (value as UnknownRecord) : undefined;
}

function asBoundedString(value: unknown, maximumLength: number): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, maximumLength) : undefined;
}

function readSessionId(properties: UnknownRecord): string | undefined {
  const direct = asBoundedString(properties.sessionID, 512);
  if (direct) return direct;

  const part = asRecord(properties.part);
  const fromPart = part ? asBoundedString(part.sessionID, 512) : undefined;
  if (fromPart) return fromPart;

  const info = asRecord(properties.info);
  return info ? asBoundedString(info.sessionID, 512) : undefined;
}

function readErrorMessage(properties: UnknownRecord): string {
  const error = asRecord(properties.error);
  const message =
    (error && asBoundedString(error.message, MAX_ERROR_LENGTH)) ??
    asBoundedString(properties.message, MAX_ERROR_LENGTH) ??
    'OpenCode session failed.';

  return redactHarnessText(message).slice(0, MAX_ERROR_LENGTH);
}

export function normalizeOpenCodeEvent(
  value: unknown,
  expectedSessionId: string,
): readonly HarnessEvent[] {
  const event = asRecord(value);
  const eventType = event ? asBoundedString(event.type, 256) : undefined;
  const properties = event ? asRecord(event.properties) : undefined;

  if (!eventType || !properties || readSessionId(properties) !== expectedSessionId) return [];

  if (eventType === 'message.part.updated') {
    const part = asRecord(properties.part);
    const partType = part ? asBoundedString(part.type, 128) : undefined;
    const delta = asBoundedString(properties.delta, MAX_DELTA_LENGTH);
    if (!delta) return [];

    if (partType === 'text') return [{ type: 'assistant.delta', text: delta }];
    if (partType === 'reasoning') return [{ type: 'reasoning.delta', text: delta }];
    return [];
  }

  if (eventType === 'file.edited') {
    const path = asBoundedString(properties.file, MAX_PATH_LENGTH);
    return path ? [{ type: 'file.changed', path, operation: 'edited' }] : [];
  }

  if (eventType === 'session.compacted') return [{ type: 'context.compacted' }];
  if (eventType === 'session.updated')
    return [{ type: 'session.updated', sessionId: expectedSessionId }];
  if (eventType === 'session.idle') return [{ type: 'done', finishReason: 'idle' }];
  if (eventType === 'session.error')
    return [{ type: 'error', message: readErrorMessage(properties) }];

  return [];
}
