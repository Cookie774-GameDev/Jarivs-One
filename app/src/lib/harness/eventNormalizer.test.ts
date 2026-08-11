import { describe, expect, it } from 'vitest';
import { normalizeOpenCodeEvent } from './eventNormalizer';

describe('normalizeOpenCodeEvent', () => {
  it('normalizes an assistant text delta for the expected session', () => {
    expect(
      normalizeOpenCodeEvent(
        {
          type: 'message.part.updated',
          properties: {
            sessionID: 'session-1',
            delta: 'Hello',
            part: { type: 'text' },
          },
        },
        'session-1',
      ),
    ).toEqual([{ type: 'assistant.delta', text: 'Hello' }]);
  });

  it('ignores cross-session and malformed events', () => {
    expect(
      normalizeOpenCodeEvent(
        {
          type: 'message.part.updated',
          properties: {
            sessionID: 'session-2',
            delta: 'not ours',
            part: { type: 'text' },
          },
        },
        'session-1',
      ),
    ).toEqual([]);
    expect(normalizeOpenCodeEvent({ type: 'message.part.updated' }, 'session-1')).toEqual([]);
    expect(normalizeOpenCodeEvent(null, 'session-1')).toEqual([]);
  });

  it('bounds reasoning deltas before exposing them to the UI', () => {
    const text = 'r'.repeat(40_000);

    expect(
      normalizeOpenCodeEvent(
        {
          type: 'message.part.updated',
          properties: {
            sessionID: 'session-1',
            delta: text,
            part: { type: 'reasoning' },
          },
        },
        'session-1',
      ),
    ).toEqual([{ type: 'reasoning.delta', text: 'r'.repeat(32_768) }]);
  });

  it('normalizes lifecycle events and sanitizes session error text', () => {
    expect(
      normalizeOpenCodeEvent(
        {
          type: 'session.compacted',
          properties: { sessionID: 'session-1' },
        },
        'session-1',
      ),
    ).toEqual([{ type: 'context.compacted' }]);
    expect(
      normalizeOpenCodeEvent(
        {
          type: 'session.idle',
          properties: { sessionID: 'session-1' },
        },
        'session-1',
      ),
    ).toEqual([{ type: 'done', finishReason: 'idle' }]);
    expect(
      normalizeOpenCodeEvent(
        {
          type: 'session.error',
          properties: {
            sessionID: 'session-1',
            error: { message: 'Bearer highly-sensitive-token' },
          },
        },
        'session-1',
      ),
    ).toEqual([{ type: 'error', message: 'Bearer [REDACTED]' }]);
  });

  it('normalizes file edits without leaking unbounded paths', () => {
    expect(
      normalizeOpenCodeEvent(
        {
          type: 'file.edited',
          properties: {
            sessionID: 'session-1',
            file: 'a'.repeat(5_000),
          },
        },
        'session-1',
      ),
    ).toEqual([
      {
        type: 'file.changed',
        path: 'a'.repeat(2_048),
        operation: 'edited',
      },
    ]);
  });
});
