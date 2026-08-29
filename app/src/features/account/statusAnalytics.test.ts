import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { createJarvisDb, type JarvisDexie } from '@/lib/db';
import { recordStatusActivity } from '@/lib/db/statusAnalyticsRepository';
import { loadStatusSummary, runStatusAnalyticsHookOperation } from './statusAnalytics';

describe('status analytics summary', () => {
  let database: JarvisDexie;

  beforeEach(async () => {
    database = createJarvisDb(`status-summary-${crypto.randomUUID()}`, { indexedDB, IDBKeyRange });
    await database.open();
  });

  afterEach(async () => {
    database.close();
    await database.delete();
  });

  it('keeps human messages, repository edits, and AI-generated code distinct', async () => {
    const now = new Date('2026-08-28T18:00:00Z').getTime();
    await recordStatusActivity(
      {
        accountId: 'account-a',
        timestamp: now,
        category: 'chat',
        action: 'message_sent',
        characters: 42,
      },
      database,
    );
    await recordStatusActivity(
      {
        accountId: 'account-a',
        timestamp: now,
        category: 'chat',
        action: 'assistant_response_saved',
        generatedLines: 12,
      },
      database,
    );
    await recordStatusActivity(
      {
        accountId: 'account-a',
        timestamp: now,
        category: 'file',
        action: 'repository_change',
        linesAdded: 7,
        linesRemoved: 2,
      },
      database,
    );

    const summary = await loadStatusSummary('account-a', '24h', now + 1, database);
    expect(summary).toMatchObject({
      messagesWritten: 1,
      charactersTyped: 42,
      aiGeneratedLines: 12,
      linesAdded: 7,
      linesRemoved: 2,
    });
  });

  it('records hook analytics outside a parent transaction with a narrower table set', async () => {
    const now = new Date('2026-08-28T19:00:00Z').getTime();
    let analyticsWrite = Promise.resolve();

    await database.transaction('rw', database.messages, async () => {
      analyticsWrite = runStatusAnalyticsHookOperation(() =>
        recordStatusActivity(
          {
            accountId: 'account-a',
            timestamp: now,
            category: 'chat',
            action: 'message_sent',
            characters: 12,
          },
          database,
        ).then(() => undefined),
      );
    });
    await analyticsWrite;

    const summary = await loadStatusSummary('account-a', '24h', now + 1, database);
    expect(summary).toMatchObject({ messagesWritten: 1, charactersTyped: 12 });
  });
});
