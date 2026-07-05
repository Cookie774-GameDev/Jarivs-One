import { describe, expect, it } from 'vitest';
import { compactComposerSendHint } from './composerSendHint';

describe('compactComposerSendHint', () => {
  it('uses the short Ctrl+Enter text for the right-hand inspector composer', () => {
    expect(compactComposerSendHint()).toBe('Ctrl+Enter');
  });
});
