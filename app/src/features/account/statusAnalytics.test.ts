import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { createJarvisDb, type JarvisDexie } from '@/lib/db';
import { recordStatusActivity } from '@/lib/db/statusAnalyticsRepository';
import { loadStatusSummary } from './statusAnalytics';

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
});
