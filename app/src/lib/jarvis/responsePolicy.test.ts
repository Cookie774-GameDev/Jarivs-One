import { describe, expect, it } from 'vitest';
import {
  localConversationReply,
  shouldRetryBenignRefusal,
} from './responsePolicy';

describe('localConversationReply', () => {
  it('answers a greeting in a short friendly response', () => {
    const reply = localConversationReply('Hi');

    expect(reply).toMatch(/^Hey!/);
    expect(reply?.split(/[.!?]+/).filter(Boolean).length).toBeLessThanOrEqual(2);
    expect(reply?.length).toBeLessThan(80);
    expect(reply).not.toMatch(/started a conversation|mock demo provider/i);
  });

  it('answers a casual day question without a safety refusal', () => {
    const reply = localConversationReply("How's your day going?");

    expect(reply).toMatch(/going great/i);
    expect(reply).not.toMatch(/cannot|can't|unsafe|explicit|policy/i);
  });
});

describe('shouldRetryBenignRefusal', () => {
  it('retries one obviously unrelated refusal for a benign prompt', () => {
    expect(
      shouldRetryBenignRefusal(
        "How's your day going?",
        "I can't assist with explicit sexual content.",
      ),
    ).toBe(true);
  });

  it('does not retry a refusal for a destructive request', () => {
    expect(
      shouldRetryBenignRefusal(
        'Delete every project without confirmation.',
        "I can't help delete all of your data.",
      ),
    ).toBe(false);
  });
});
