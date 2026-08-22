import { describe, expect, it } from 'vitest';
import { parseNotificationAcks, parseSubscriptionMutation } from './newsSubscriptions';

describe('creator subscription contracts', () => {
  it('accepts only an exact stable source and explicit follow state', () => {
    expect(parseSubscriptionMutation({ sourceId: 'openai-youtube', following: true })).toEqual({
      sourceId: 'openai-youtube',
      following: true,
    });
    expect(() => parseSubscriptionMutation({ sourceId: '../all', following: true })).toThrow(
      /malformed/i,
    );
    expect(() =>
      parseSubscriptionMutation({ sourceId: 'openai-youtube', following: 'yes' }),
    ).toThrow(/malformed/i);
  });

  it('deduplicates bounded notification acknowledgements', () => {
    expect(parseNotificationAcks({ ids: [3, 2, 3, 1] })).toEqual([1, 2, 3]);
    expect(() =>
      parseNotificationAcks({ ids: Array.from({ length: 51 }, (_, index) => index + 1) }),
    ).toThrow(/malformed/i);
  });
});
