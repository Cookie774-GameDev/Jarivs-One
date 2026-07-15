import { beforeEach, describe, expect, it } from 'vitest';
import { countUnifiedDiffLines, useChatActivityStore } from './activityStore';
import {
  parseTokensFromSubtitle,
  selectActivityFeedEvents,
  summarizeChatActivity,
} from './ChatActivityTimeline';

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

describe('summarizeChatActivity', () => {
  it('aggregates tokens, line edits, files, and current step', () => {
    const now = 1_000_000;
    const summary = summarizeChatActivity(
      [
        {
          id: 'a1',
          chatId: 'c1',
          kind: 'agent',
          status: 'done',
          title: '@jarvis finished',
          ts: now - 5000,
          startedAt: now - 5000,
          endedAt: now - 1000,
          inputTokens: 100,
          outputTokens: 40,
          detail: 'Done',
        },
        {
          id: 'd1',
          chatId: 'c1',
          kind: 'diff',
          status: 'done',
          title: 'Wrote file',
          filePath: 'C:\\Users\\viper\\Downloads\\story.txt',
          addedLines: 12,
          removedLines: 0,
          ts: now - 2000,
        },
        {
          id: 'a2',
          chatId: 'c1',
          kind: 'agent',
          status: 'running',
          title: '@jarvis is working',
          detail: 'Writing story…',
          ts: now - 500,
          startedAt: now - 500,
        },
      ],
      now,
    );

    expect(summary.inputTokens).toBe(100);
    expect(summary.outputTokens).toBe(40);
    expect(summary.addedLines).toBe(12);
    expect(summary.editedFileCount).toBe(1);
    expect(summary.isLive).toBe(true);
    expect(summary.doingNow).toMatch(/Writing story/);
    expect(summary.durationMs).toBeGreaterThan(0);
  });

  it('parses legacy token subtitles into totals', () => {
    expect(parseTokensFromSubtitle('ollama/llama3.2:1b · 8730+26 tokens')).toEqual({
      inputTokens: 8730,
      outputTokens: 26,
    });

    const summary = summarizeChatActivity(
      [
        {
          id: 'legacy',
          chatId: 'c1',
          kind: 'agent',
          status: 'done',
          title: '@jarvis finished',
          subtitle: 'ollama/llama3.2:1b · 100+5 tokens',
          ts: 1000,
        },
        {
          id: 'legacy2',
          chatId: 'c1',
          kind: 'agent',
          status: 'done',
          title: '@jarvis finished',
          subtitle: 'ollama/llama3.2:1b · 50+2 tokens',
          ts: 2000,
        },
      ],
      3000,
    );
    expect(summary.inputTokens).toBe(150);
    expect(summary.outputTokens).toBe(7);
  });

  it('filters the expandable feed so finished agent spam is not listed', () => {
    const feed = selectActivityFeedEvents([
      {
        id: 'a1',
        chatId: 'c1',
        kind: 'agent',
        status: 'done',
        title: '@jarvis finished',
        ts: 1,
      },
      {
        id: 'a2',
        chatId: 'c1',
        kind: 'agent',
        status: 'done',
        title: '@jarvis finished',
        ts: 2,
      },
      {
        id: 'd1',
        chatId: 'c1',
        kind: 'diff',
        status: 'done',
        title: 'Wrote file',
        filePath: 'C:\\a\\b.txt',
        ts: 3,
      },
      {
        id: 'a3',
        chatId: 'c1',
        kind: 'agent',
        status: 'done',
        title: '@jarvis finished',
        ts: 4,
      },
    ]);
    expect(feed.map((e) => e.id)).toEqual(['d1', 'a3']);
  });
});

