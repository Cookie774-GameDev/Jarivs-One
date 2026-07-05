import { beforeEach, describe, expect, it } from 'vitest';
import { countUnifiedDiffLines, useChatActivityStore } from './activityStore';

describe('chat activity store helpers', () => {
  beforeEach(() => {
    useChatActivityStore.setState({ eventsByChat: {} });
  });

  it('counts changed lines in unified diffs without counting headers', () => {
    const diff = [
      '--- a/src/App.tsx',
      '+++ b/src/App.tsx',
      '@@ -1,3 +1,4 @@',
      ' import React from "react";',
      '-const oldValue = 1;',
      '+const newValue = 2;',
      '+const extra = true;',
    ].join('\n');

    expect(countUnifiedDiffLines(diff)).toEqual({ addedLines: 2, removedLines: 1 });
  });

  it('caps stored detail and diff payloads', () => {
    useChatActivityStore.getState().record({
      id: 'event_large',
      chatId: 'chat_large',
      kind: 'diff',
      status: 'done',
      title: 'Large diff',
      detail: 'd'.repeat(5000),
      diff: '+line\n'.repeat(3000),
      ts: Date.now(),
    });

    const [event] = useChatActivityStore.getState().eventsByChat.chat_large ?? [];
    expect(event?.detail?.length).toBeLessThan(4200);
    expect(event?.detail).toContain('truncated by VibeSpace');
    expect(event?.diff?.length).toBeLessThan(12300);
    expect(event?.diff).toContain('truncated by VibeSpace');
  });
});

