import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { createJarvisDb, type JarvisDexie } from '@/lib/db';
import {
  clearStatusAnalytics,
  normalizeStatusActivity,
  readStatusRollups,
  recordStatusActivity,
} from './statusAnalyticsRepository';

const TEST_INDEXED_DB = { indexedDB, IDBKeyRange };

describe('status analytics repository', () => {
  let database: JarvisDexie;

  beforeEach(async () => {
    database = createJarvisDb(`status-${crypto.randomUUID()}`, TEST_INDEXED_DB);
    await database.open();
  });

  afterEach(async () => {
    database.close();
    await database.delete();
  });

  it('stores content-free events and precomputes exact account-scoped rollups', async () => {
    const timestamp = new Date('2026-08-28T12:15:00Z').getTime();
    await recordStatusActivity(
      {
        accountId: 'account-a',
        timestamp,
        category: 'ai',
        action: 'ai_response_finished',
        providerId: 'openai',
        modelId: 'gpt-5.6-sol',
        projectId: 'project-a',
        inputTokens: 100,
        outputTokens: 25,
        cachedTokens: 10,
        costUsd: 0.012,
        costType: 'actual',
        latencyMs: 850,
        outcome: 'completed',
      },
      database,
    );

    const rollups = await readStatusRollups('account-a', 'hour', timestamp - 1, database);
    const total = rollups.find((row) => row.dimension === 'all');
    const model = rollups.find((row) => row.dimension === 'model');
    expect(total).toMatchObject({
      inputTokens: 100,
      outputTokens: 25,
      cachedTokens: 10,
      costUsd: 0.012,
      actualCostUsd: 0.012,
      requests: 1,
      completed: 1,
      latencySamples: 1,
    });
    expect(model?.dimensionId).toBe('openai::gpt-5.6-sol');
    expect(await readStatusRollups('account-b', 'hour', timestamp - 1, database)).toEqual([]);
  });

  it('rejects identifiers outside the allowlist and never accepts arbitrary metadata', () => {
    expect(
      normalizeStatusActivity({
        accountId: 'account-a',
        category: 'chat',
        action: 'message_sent',
        characters: 12,
        // Runtime callers cannot smuggle content through untyped objects.
        ...({ prompt: 'secret prompt', terminalOutput: 'secret output' } as Record<
          string,
          unknown
        >),
      }),
    ).not.toHaveProperty('prompt');
    expect(
      normalizeStatusActivity({
        accountId: '../bad-account',
        category: 'chat',
        action: 'message_sent',
      }),
    ).toBeNull();
  });

  it('clears only the selected account history', async () => {
    for (const accountId of ['account-a', 'account-b']) {
      await recordStatusActivity(
        { accountId, category: 'chat', action: 'message_sent', characters: 5 },
        database,
      );
    }
    await clearStatusAnalytics('account-a', database);
    expect(
      await database.status_activity_events.where('accountId').equals('account-a').count(),
    ).toBe(0);
    expect(
      await database.status_activity_events.where('accountId').equals('account-b').count(),
    ).toBe(1);
  });
});
