import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../migrations/0005_trusted_news.sql', import.meta.url),
  'utf8',
);

describe('0005 trusted news migration', () => {
  it('is additive and preserves existing events and source history', () => {
    expect(migration).not.toMatch(/\b(?:DROP|TRUNCATE)\b/iu);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/iu);
  });

  it('stores separate repository trends and per-user idempotent creator alerts', () => {
    expect(migration).toContain('intelligence_repository_trends');
    expect(migration).toContain('intelligence_news_creator_subscriptions');
    expect(migration).toContain('intelligence_news_notifications');
    expect(migration).toContain('UNIQUE (user_id, event_id, source_id)');
    expect(migration).toContain('PRIMARY KEY (user_id, source_id)');
  });
});
