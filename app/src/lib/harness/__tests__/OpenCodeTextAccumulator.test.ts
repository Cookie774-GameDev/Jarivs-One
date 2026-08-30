import { describe, expect, it } from 'vitest';
import { extractOpenCodeTextPartUpdate, OpenCodeTextAccumulator } from '../OpenCodeTextAccumulator';

describe('OpenCodeTextAccumulator', () => {
  it('recovers full text when OpenCode omits delta', () => {
    const accumulator = new OpenCodeTextAccumulator();
    expect(accumulator.ingest({ channel: 'text', partId: 'p', text: 'Hello' })).toMatchObject({
      kind: 'delta',
      text: 'Hello',
      fullText: 'Hello',
    });
    expect(accumulator.ingest({ channel: 'text', partId: 'p', text: 'Hello world' })).toMatchObject(
      {
        kind: 'delta',
        text: ' world',
        fullText: 'Hello world',
      },
    );
    expect(accumulator.fullText()).toBe('Hello world');
  });

  it('supports delta-only streams and ignores duplicate/stale snapshots', () => {
    const accumulator = new OpenCodeTextAccumulator();
    accumulator.ingest({ channel: 'text', partId: 'p', eventId: '1', delta: 'Hello' });
    expect(
      accumulator.ingest({ channel: 'text', partId: 'p', eventId: '1', delta: 'Hello' }).kind,
    ).toBe('noop');
    expect(accumulator.ingest({ channel: 'text', partId: 'p', text: 'Hel' }).kind).toBe('noop');
    expect(accumulator.fullText()).toBe('Hello');
  });

  it('reports an explicit replacement for an upstream correction', () => {
    const accumulator = new OpenCodeTextAccumulator();
    accumulator.ingest({ channel: 'text', partId: 'p', text: 'draft' });
    expect(accumulator.ingest({ channel: 'text', partId: 'p', text: 'final' })).toEqual({
      kind: 'replace',
      channel: 'text',
      partKey: '["","","p"]',
      text: 'final',
      fullText: 'final',
    });
  });

  it('extracts message.part.updated snapshots and deltas', () => {
    expect(
      extractOpenCodeTextPartUpdate({
        type: 'message.part.updated',
        properties: {
          delta: '!',
          part: { id: 'p1', messageID: 'm1', sessionID: 's1', type: 'text', text: 'Hello!' },
        },
      }),
    ).toEqual({
      eventId: undefined,
      sessionId: 's1',
      messageId: 'm1',
      partId: 'p1',
      channel: 'text',
      delta: '!',
      text: 'Hello!',
    });
  });

  it('extracts message.part.delta text fields without requiring a part snapshot', () => {
    expect(
      extractOpenCodeTextPartUpdate({
        type: 'message.part.delta',
        properties: {
          eventID: 'evt-delta-1',
          sessionID: 'ses-native-secret',
          messageID: 'msg-native-secret',
          partID: 'prt-native-secret',
          field: 'text',
          delta: 'Hello',
        },
      }),
    ).toEqual({
      eventId: 'evt-delta-1',
      sessionId: 'ses-native-secret',
      messageId: 'msg-native-secret',
      partId: 'prt-native-secret',
      delta: 'Hello',
    });
  });

  it('buffers an unknown text-field delta until a public text snapshot establishes its kind', () => {
    const accumulator = new OpenCodeTextAccumulator();
    const delta = extractOpenCodeTextPartUpdate({
      type: 'message.part.delta',
      properties: {
        eventID: 'delta-before-text',
        sessionID: 'session',
        messageID: 'message',
        partID: 'part',
        field: 'text',
        delta: 'Public checkpoint',
      },
    });
    expect(delta).not.toBeNull();
    expect(accumulator.ingest(delta!).kind).toBe('noop');
    expect(accumulator.fullText()).toBe('');
    expect(
      accumulator.ingest({
        sessionId: 'session',
        messageId: 'message',
        partId: 'part',
        channel: 'text',
        text: 'Public checkpoint',
      }),
    ).toMatchObject({ kind: 'delta', channel: 'text', text: 'Public checkpoint' });
    expect(accumulator.fullText()).toBe('Public checkpoint');
  });

  it('lets an authoritative empty snapshot discard a buffered live delta', () => {
    const accumulator = new OpenCodeTextAccumulator();
    expect(accumulator.ingest({ partId: 'part', delta: 'stale live text' }).kind).toBe('noop');

    expect(
      accumulator.ingest({
        partId: 'part',
        channel: 'text',
        text: '',
        authoritativeSnapshot: true,
      }),
    ).toMatchObject({ kind: 'noop', channel: 'text', fullText: '' });
    expect(accumulator.fullText()).toBe('');
  });

  it('buffers an unknown text-field delta without leaking a later reasoning part', () => {
    const accumulator = new OpenCodeTextAccumulator();
    const delta = extractOpenCodeTextPartUpdate({
      type: 'message.part.delta',
      properties: {
        eventID: 'delta-before-reasoning',
        sessionID: 'session',
        messageID: 'message',
        partID: 'part',
        field: 'text',
        delta: 'Private chain of thought',
      },
    });
    expect(delta).not.toBeNull();
    expect(accumulator.ingest(delta!).kind).toBe('noop');
    expect(
      accumulator.ingest({
        sessionId: 'session',
        messageId: 'message',
        partId: 'part',
        channel: 'reasoning',
        text: 'Private chain of thought',
      }),
    ).toMatchObject({ kind: 'delta', channel: 'reasoning', text: 'Private chain of thought' });
    expect(accumulator.fullText('text')).toBe('');
    expect(accumulator.fullText('reasoning')).toBe('Private chain of thought');
  });

  it('bounds unknown pending identities and characters', () => {
    const byIdentity = new OpenCodeTextAccumulator({ maxPendingParts: 1 });
    expect(byIdentity.ingest({ partId: 'one', delta: 'A' }).kind).toBe('noop');
    expect(() => byIdentity.ingest({ partId: 'two', delta: 'B' })).toThrow(
      'HARNESS_PENDING_PART_LIMIT_EXCEEDED',
    );

    const byCharacters = new OpenCodeTextAccumulator({ maxPendingChars: 2 });
    expect(() => byCharacters.ingest({ partId: 'one', delta: 'ABC' })).toThrow(
      'HARNESS_PENDING_TEXT_LIMIT_EXCEEDED',
    );
  });

  it('reconciles updated-empty, deltas, and a final snapshot without duplication', () => {
    const accumulator = new OpenCodeTextAccumulator();
    expect(accumulator.ingest({ channel: 'text', partId: 'p', text: '' }).kind).toBe('noop');
    expect(
      accumulator.ingest({ channel: 'text', partId: 'p', eventId: 'd1', delta: 'Hello' }),
    ).toMatchObject({ kind: 'delta', text: 'Hello' });
    expect(
      accumulator.ingest({ channel: 'text', partId: 'p', eventId: 'd2', delta: ' world' }),
    ).toMatchObject({ kind: 'delta', text: ' world' });
    expect(accumulator.ingest({ channel: 'text', partId: 'p', text: 'Hello world' }).kind).toBe(
      'noop',
    );
    expect(accumulator.fullText()).toBe('Hello world');
  });

  it('lets persisted history replace a duplicated live delta with its authoritative snapshot', () => {
    const accumulator = new OpenCodeTextAccumulator();
    accumulator.ingest({ channel: 'text', partId: 'p', text: 'Checkpoint' });
    accumulator.ingest({ channel: 'text', partId: 'p', delta: 'Checkpoint' });

    expect(accumulator.fullText()).toBe('CheckpointCheckpoint');
    expect(
      accumulator.ingest({
        channel: 'text',
        partId: 'p',
        text: 'Checkpoint',
        authoritativeSnapshot: true,
      }),
    ).toEqual({
      kind: 'replace',
      channel: 'text',
      partKey: '["","","p"]',
      text: 'Checkpoint',
      fullText: 'Checkpoint',
    });
    expect(accumulator.fullText()).toBe('Checkpoint');
  });

  it('reconciles deltas before the first updated snapshot and rejects stale replay', () => {
    const accumulator = new OpenCodeTextAccumulator();
    accumulator.ingest({ channel: 'text', partId: 'p', eventId: 'd1', delta: 'Alpha' });
    accumulator.ingest({ channel: 'text', partId: 'p', eventId: 'd2', delta: ' beta' });
    expect(
      accumulator.ingest({ channel: 'text', partId: 'p', eventId: 'd1', delta: 'Alpha' }).kind,
    ).toBe('noop');
    expect(accumulator.ingest({ channel: 'text', partId: 'p', text: 'Alpha' }).kind).toBe('noop');
    expect(accumulator.ingest({ channel: 'text', partId: 'p', text: 'Alpha beta' }).kind).toBe(
      'noop',
    );
    expect(accumulator.fullText()).toBe('Alpha beta');
  });

  it('keeps distinct native parts independent and bounded', () => {
    const accumulator = new OpenCodeTextAccumulator({ maxParts: 2 });
    accumulator.ingest({ channel: 'text', partId: 'one', delta: 'A' });
    accumulator.ingest({ channel: 'text', partId: 'two', delta: 'B' });
    expect(accumulator.fullText()).toBe('AB');
    expect(() => accumulator.ingest({ channel: 'text', partId: 'three', delta: 'C' })).toThrow(
      'HARNESS_TEXT_PART_LIMIT_EXCEEDED',
    );
  });

  it('fails closed on invalid delta identities', () => {
    const accumulator = new OpenCodeTextAccumulator();
    expect(() =>
      accumulator.ingest({ channel: 'text', partId: `private\npart`, delta: 'secret' }),
    ).toThrow('HARNESS_EVENT_INVALID_IDENTITY');
  });

  it('fails closed on unbounded output', () => {
    const accumulator = new OpenCodeTextAccumulator({ maxTotalChars: 5 });
    expect(() => accumulator.ingest({ channel: 'text', text: '123456' })).toThrow(
      'HARNESS_TEXT_LIMIT_EXCEEDED',
    );
  });
});
