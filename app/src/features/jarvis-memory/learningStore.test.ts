import { beforeEach, describe, expect, it } from 'vitest';

import { useJarvisLearningStore } from './learningStore';

describe('Jarvis learning memory', () => {
  beforeEach(() => {
    localStorage.clear();
    useJarvisLearningStore.getState().clearForTests();
    useJarvisLearningStore.getState().setAccount('account-a');
  });

  it('records explicit remember requests immediately without retaining raw chat', () => {
    const result = useJarvisLearningStore.getState().recordUserMessage({
      text: 'Remember that I prefer no emojis in responses.',
      chatId: 'chat-1',
      messageId: 'message-1',
    });

    expect(result.explicitMemoryId).toBeTruthy();
    expect(useJarvisLearningStore.getState().currentProfile().items[0]).toMatchObject({
      value: 'I prefer no emojis in responses.',
      confidence: 1,
      source: { kind: 'explicit', chatId: 'chat-1', messageId: 'message-1' },
      scope: { kind: 'account', id: 'account-a' },
    });
    expect(JSON.stringify(useJarvisLearningStore.getState().profiles)).not.toContain('Remember that');
  });

  it('evaluates after ten meaningful messages and excludes progress/system noise', () => {
    const store = useJarvisLearningStore.getState();
    expect(store.recordUserMessage({ text: '2/5 steps completed' }).qualifies).toBe(false);
    expect(store.recordUserMessage({ text: '[system retry] provider failed' }).qualifies).toBe(false);
    for (let index = 1; index <= 9; index += 1) {
      expect(store.recordUserMessage({ text: `Meaningful preference statement number ${index}` }).evaluateNow).toBe(false);
    }
    expect(store.recordUserMessage({ text: 'The tenth meaningful preference statement' }).evaluateNow).toBe(true);
  });

  it('separates accounts and supports edit, remove, clear, and undo', () => {
    const first = useJarvisLearningStore.getState().remember({
      value: 'Use concise answers.',
      category: 'response-style',
      source: { kind: 'explicit' },
    });
    expect(first).toBeTruthy();
    useJarvisLearningStore.getState().setAccount('account-b');
    expect(useJarvisLearningStore.getState().currentProfile().items).toEqual([]);

    useJarvisLearningStore.getState().setAccount('account-a');
    useJarvisLearningStore.getState().edit(first!, { value: 'Use very concise answers.' });
    expect(useJarvisLearningStore.getState().currentProfile().items[0]?.value).toBe('Use very concise answers.');
    useJarvisLearningStore.getState().remove(first!);
    expect(useJarvisLearningStore.getState().currentProfile().items).toEqual([]);
    expect(useJarvisLearningStore.getState().undo()).toBe(true);
    expect(useJarvisLearningStore.getState().currentProfile().items[0]?.value).toBe('Use very concise answers.');
  });

  it('rejects credential-shaped content', () => {
    expect(useJarvisLearningStore.getState().remember({
      value: `My API token is ghp_${'synthetic'.repeat(4)}`,
      category: 'personal',
      source: { kind: 'explicit' },
    })).toBeNull();
    expect(useJarvisLearningStore.getState().remember({
      value: 'My password is hunter2',
      category: 'personal',
      source: { kind: 'explicit' },
    })).toBeNull();
    expect(useJarvisLearningStore.getState().currentProfile().items).toEqual([]);
  });

  it('round-trips the physical learning.md payload for recovery', () => {
    useJarvisLearningStore.getState().remember({
      value: 'Use direct answers.',
      category: 'response-style',
      source: { kind: 'explicit' },
    });
    const markdown = useJarvisLearningStore.getState().exportMarkdown();
    useJarvisLearningStore.getState().clear();

    expect(useJarvisLearningStore.getState().importMarkdown(markdown)).toBe(true);
    expect(useJarvisLearningStore.getState().currentProfile().items[0]?.value).toBe('Use direct answers.');
  });

  it('does not duplicate account profiles or learned values into localStorage', async () => {
    useJarvisLearningStore.getState().remember({
      value: 'Use concise release summaries.',
      category: 'response-style',
      source: { kind: 'explicit' },
    });

    await Promise.resolve();
    expect(JSON.stringify(localStorage)).not.toContain('account-a');
    expect(JSON.stringify(localStorage)).not.toContain('concise release summaries');
  });
});
