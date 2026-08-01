import { describe, expect, it } from 'vitest';
import { MONOCHROME_VISUAL_FIXTURES } from '../../../../tests/visual/monochrome/fixtures';
import { MONOCHROME_CHAT_FIXTURE, MONOCHROME_CHAT_FIXTURE_SOURCE } from './monochromeFixture';

describe('MonoChrome chat fixture replay', () => {
  it('consumes the exact frozen fixture serialization', () => {
    expect(MONOCHROME_CHAT_FIXTURE_SOURCE).toEqual(MONOCHROME_VISUAL_FIXTURES.chat);
  });

  it('maps the frozen fixture to stable product message records', () => {
    expect(MONOCHROME_CHAT_FIXTURE.activeConversationId).toBe('fixture-chat-001');
    expect(MONOCHROME_CHAT_FIXTURE.messages).toHaveLength(2);
    expect(MONOCHROME_CHAT_FIXTURE.messages.map((message) => message.id)).toEqual([
      'fixture-message-001',
      'fixture-message-002',
    ]);
    expect(MONOCHROME_CHAT_FIXTURE.messages.map((message) => message.created_at)).toEqual([
      Date.parse('2026-07-16T11:59:59.000Z'),
      Date.parse('2026-07-16T12:00:00.000Z'),
    ]);
    expect(
      Math.max(...MONOCHROME_CHAT_FIXTURE.messages.map((message) => message.updated_at)),
    ).toBeLessThanOrEqual(Date.parse(MONOCHROME_CHAT_FIXTURE_SOURCE.clock));
  });
});
