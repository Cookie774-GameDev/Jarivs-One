import { describe, expect, it } from 'vitest';
import { parseChatSupervisionBinding, type ChatSupervisionBindingV1 } from './chatSupervision';

const validBinding: ChatSupervisionBindingV1 = {
  version: 1,
  sourceChatId: 'chat-source',
  supervisingChatId: 'chat-supervisor',
  originatingMessageId: 'message-origin',
  originatingCardMessageId: 'message-card',
  handoffPolicyVersion: 1,
  instruction: 'Review current progress and report blockers.',
  allowReplyToSource: false,
};

describe('chat supervision binding', () => {
  it('parses the exact version-one binding and preserves explicit reply authorization', () => {
    expect(parseChatSupervisionBinding(validBinding)).toEqual(validBinding);
    expect(
      parseChatSupervisionBinding({
        ...validBinding,
        allowReplyToSource: true,
        endsAt: 1_788_200_000_000,
      }),
    ).toEqual({
      ...validBinding,
      allowReplyToSource: true,
      endsAt: 1_788_200_000_000,
    });
  });

  it.each([
    { ...validBinding, version: 2 },
    { ...validBinding, handoffPolicyVersion: 2 },
    { ...validBinding, allowReplyToSource: 'true' },
    { ...validBinding, instruction: '   ' },
    { ...validBinding, sourceChatId: ' leading-space' },
    { ...validBinding, supervisingChatId: 'chat/source' },
    { ...validBinding, originatingMessageId: '' },
    { ...validBinding, originatingCardMessageId: 'x'.repeat(129) },
    { ...validBinding, endsAt: Number.NaN },
    { ...validBinding, endsAt: 1.5 },
    { ...validBinding, extra: true },
    { version: 1 },
    null,
  ])('fails closed for malformed, partial, or extended bindings %#', (value) => {
    expect(parseChatSupervisionBinding(value)).toBeNull();
  });
});
