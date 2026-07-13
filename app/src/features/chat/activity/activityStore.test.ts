import { beforeEach, describe, expect, it } from 'vitest';
import {
  CHAT_ACTIVITY_METRICS_STORAGE_KEY,
  countUnifiedDiffLines,
  deserializeChatActivityMetrics,
  flushChatActivityMetrics,
  hydrateChatActivityMetrics,
  useChatActivityStore,
} from './activityStore';
import {
  parseTokensFromSubtitle,
  selectActivityFeedEvents,
  summarizeChatActivity,
} from './ChatActivityTimeline';

describe('chat activity store helpers', () => {
  beforeEach(() => {
    useChatActivityStore.setState({ eventsByChat: {} });
    localStorage.clear();
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

  it('persists only bounded numeric, timestamp, and status aggregates', () => {
    const store = useChatActivityStore.getState();
    store.record({
      id: 'agent_sensitive',
      chatId: 'chat_safe_1',
      kind: 'agent',
      status: 'done',
      title: 'Secret prompt title',
      subtitle: 'provider/model · 11+4 tokens',
      detail: 'Authorization: Bearer synthetic_secret_token',
      filePath: 'C:\\Users\\viper\\private-project\\prompt.txt',
      url: 'https://user:password@example.invalid/private',
      diff: '+synthetic secret diff',
      inputTokens: 11,
      outputTokens: 4,
      ts: 100,
      startedAt: 100,
      endedAt: 350,
    });
    store.record({
      id: 'diff_sensitive',
      chatId: 'chat_safe_1',
      kind: 'diff',
      status: 'done',
      title: 'Wrote private file',
      filePath: 'C:\\Users\\viper\\private-project\\secret.ts',
      diff: '+const token = "synthetic_secret";',
      addedLines: 3,
      removedLines: 1,
      ts: 300,
    });

    flushChatActivityMetrics();

    const raw = localStorage.getItem(CHAT_ACTIVITY_METRICS_STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(raw).not.toMatch(/Secret prompt|Authorization|synthetic_secret|private-project|example\.invalid|filePath|detail|diff|title|subtitle|url/i);
    const parsed = JSON.parse(raw!);
    expect(parsed).toMatchObject({ version: 1 });
    expect(parsed.records).toEqual([
      expect.objectContaining({
        chatId: 'chat_safe_1',
        status: 'done',
        inputTokens: 11,
        outputTokens: 4,
        addedLines: 3,
        removedLines: 1,
        editedFileCount: 1,
        startedAt: 100,
        endedAt: 350,
      }),
    ]);
  });

  it('rejects corrupt, old-schema, and secret-shaped persisted records', () => {
    const safeRecord = {
      chatId: 'chat_secret',
      status: 'done',
      startedAt: 1,
      endedAt: 2,
      inputTokens: 1,
      outputTokens: 1,
      addedLines: 0,
      removedLines: 0,
      editedFileCount: 0,
      agentTurns: 1,
      eventCount: 1,
      updatedAt: 2,
    };
    for (const raw of [
      '{not-json',
      JSON.stringify({ version: 0, records: [] }),
      ...['prompt', 'transcript', 'diff', 'filePath', 'secret'].map((field) => JSON.stringify({
        version: 1,
        records: [{ ...safeRecord, [field]: 'synthetic private payload' }],
      })),
    ]) {
      localStorage.setItem(CHAT_ACTIVITY_METRICS_STORAGE_KEY, raw);
      hydrateChatActivityMetrics();
      expect(useChatActivityStore.getState().eventsByChat).toEqual({});
      expect(localStorage.getItem(CHAT_ACTIVITY_METRICS_STORAGE_KEY)).toBeNull();
    }
  });

  it('deduplicates by chat and retains only the newest 100 persisted records', () => {
    const records = Array.from({ length: 105 }, (_, index) => ({
      chatId: `chat_${index}`,
      status: 'done',
      startedAt: index,
      endedAt: index + 1,
      inputTokens: index,
      outputTokens: index,
      addedLines: 0,
      removedLines: 0,
      editedFileCount: 0,
      agentTurns: 1,
      eventCount: 1,
      updatedAt: index + 1,
    }));
    records.push({ ...records[104]!, inputTokens: 999, updatedAt: 999 });

    const hydrated = deserializeChatActivityMetrics(JSON.stringify({ version: 1, records }));

    expect(Object.keys(hydrated)).toHaveLength(100);
    expect(hydrated.chat_0).toBeUndefined();
    expect(hydrated.chat_104?.[0]).toMatchObject({ inputTokens: 999 });
  });

  it('hydrates a restart-safe aggregate without restoring sensitive event content', () => {
    useChatActivityStore.getState().record({
      id: 'agent_restart',
      chatId: 'chat_restart',
      kind: 'agent',
      status: 'done',
      title: 'Private title',
      detail: 'synthetic_secret_transcript',
      inputTokens: 9,
      outputTokens: 2,
      ts: 1000,
      startedAt: 1000,
      endedAt: 1800,
    });
    useChatActivityStore.getState().record({
      id: 'diff_restart',
      chatId: 'chat_restart',
      kind: 'diff',
      status: 'done',
      title: 'Private file write',
      filePath: 'C:\\private\\restart.ts',
      addedLines: 4,
      removedLines: 2,
      ts: 1500,
    });
    flushChatActivityMetrics();
    useChatActivityStore.setState({ eventsByChat: {} });

    hydrateChatActivityMetrics();

    const restored = useChatActivityStore.getState().eventsByChat.chat_restart;
    expect(restored).toHaveLength(1);
    expect(restored?.[0]).toMatchObject({
      status: 'done',
      inputTokens: 9,
      outputTokens: 2,
      startedAt: 1000,
      endedAt: 1800,
      restoredAggregate: true,
    });
    expect(summarizeChatActivity(restored ?? [])).toMatchObject({
      addedLines: 4,
      removedLines: 2,
      editedFileCount: 1,
    });
    expect(JSON.stringify(restored)).not.toMatch(/Private title|synthetic_secret_transcript/);

    flushChatActivityMetrics();
    const reserialized = JSON.parse(localStorage.getItem(CHAT_ACTIVITY_METRICS_STORAGE_KEY)!);
    expect(reserialized.records[0]).toMatchObject({
      addedLines: 4,
      removedLines: 2,
      editedFileCount: 1,
    });
  });

  it('persists the latest agent lifecycle status instead of later context-row status', () => {
    useChatActivityStore.getState().record({
      id: 'agent_error_status',
      chatId: 'chat_error_status',
      kind: 'agent',
      status: 'error',
      title: 'Agent failed',
      ts: 100,
      startedAt: 100,
      endedAt: 200,
    });
    useChatActivityStore.getState().record({
      id: 'file_after_error',
      chatId: 'chat_error_status',
      kind: 'file',
      status: 'done',
      title: 'Read context',
      filePath: 'C:\\private\\context.ts',
      ts: 150,
    });

    flushChatActivityMetrics();

    const persisted = JSON.parse(localStorage.getItem(CHAT_ACTIVITY_METRICS_STORAGE_KEY)!);
    expect(persisted.records[0].status).toBe('error');
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

  it('retains structured provider usage once and reports unknown usage as unavailable', () => {
    const structured = summarizeChatActivity([
      {
        id: 'usage_structured',
        chatId: 'c1',
        kind: 'agent',
        status: 'done',
        title: 'Finished',
        subtitle: 'provider/model · 20+5 tokens',
        inputTokens: 20,
        outputTokens: 5,
        ts: 1,
      },
    ]);
    expect(structured.inputTokens).toBe(20);
    expect(structured.outputTokens).toBe(5);
    expect(structured.usageKnown).toBe(true);

    const unknown = summarizeChatActivity([
      {
        id: 'usage_unknown',
        chatId: 'c1',
        kind: 'agent',
        status: 'done',
        title: 'Finished without provider usage',
        ts: 1,
      },
    ]);
    expect(unknown.inputTokens).toBeNull();
    expect(unknown.outputTokens).toBeNull();
    expect(unknown.usageKnown).toBe(false);
  });

  it('deduplicates event ids and counts line/file metrics only from real tool or diff events', () => {
    const duplicateDiff = {
      id: 'diff_same',
      chatId: 'c1',
      kind: 'diff' as const,
      status: 'done' as const,
      title: 'Wrote file',
      filePath: 'src/App.tsx',
      addedLines: 2,
      removedLines: 1,
      ts: 2,
    };
    const summary = summarizeChatActivity([
      {
        id: 'file_read',
        chatId: 'c1',
        kind: 'file',
        status: 'done',
        title: 'Read file',
        filePath: 'src/App.tsx',
        addedLines: 99,
        removedLines: 99,
        ts: 1,
      },
      duplicateDiff,
      { ...duplicateDiff },
      {
        ...duplicateDiff,
        id: 'diff_second',
        addedLines: 3,
        removedLines: 0,
        ts: 3,
      },
    ]);

    expect(summary.addedLines).toBe(5);
    expect(summary.removedLines).toBe(1);
    expect(summary.editedFileCount).toBe(1);
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

