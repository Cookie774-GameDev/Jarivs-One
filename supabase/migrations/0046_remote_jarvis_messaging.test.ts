// Run: node --test supabase/migrations/0046_remote_jarvis_messaging.test.ts

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const sql = readFileSync(new URL('./0046_remote_jarvis_messaging.sql', import.meta.url), 'utf8');

describe('0046 remote Jarvis messaging security contract', () => {
  it('keeps all durable remote-message tables behind owner RLS', () => {
    for (const table of [
      'remote_messaging_identities',
      'remote_messaging_pairings',
      'remote_messaging_events',
      'remote_messaging_turns',
    ]) {
      assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
      assert.match(sql, new RegExp(`revoke all on table public\\.${table} from anon`, 'i'));
    }
    assert.match(sql, /user_id\s*=\s*\(select auth\.uid\(\)\)/i);
  });

  it('issues short-lived hashed pairing codes and never stores plaintext codes', () => {
    assert.match(sql, /code_digest\s+bytea\s+not null/i);
    assert.match(sql, /digest\([^;]+sha256/i);
    assert.match(sql, /interval '10 minutes'/i);
    assert.doesNotMatch(sql, /pairing_code\s+text\s+not null/i);
  });

  it('permits only the implemented channels and explicitly excludes iMessage', () => {
    for (const platform of ['sms', 'whatsapp', 'telegram', 'discord']) {
      assert.match(sql, new RegExp(`'${platform}'`, 'i'));
    }
    assert.doesNotMatch(sql, /'imessage'/i);
  });

  it('grants authenticated users only owner reads, revocation, and pairing creation', () => {
    assert.match(
      sql,
      /grant select, delete on table public\.remote_messaging_identities to authenticated/i,
    );
    assert.match(
      sql,
      /grant execute on function public\.create_remote_messaging_pairing\(text\) to authenticated/i,
    );
    assert.match(
      sql,
      /revoke all on function public\.create_remote_messaging_pairing\(text\) from public, anon/i,
    );
    assert.doesNotMatch(
      sql,
      /grant\s+(insert|update)[^;]+remote_messaging_events[^;]+authenticated/i,
    );
  });
});
