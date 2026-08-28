import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../migrations/0050_opt_in_public_profile_status.sql', import.meta.url);

test('public status is explicit opt-in, owner-writable, and RLS protected', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /visible boolean not null default false/iu);
  assert.match(sql, /alter table public\.public_profile_status enable row level security/iu);
  assert.match(sql, /public_profile_status_owner_insert[\s\S]*?auth\.uid\(\)\) = user_id/iu);
  assert.match(sql, /public_profile_status_owner_update[\s\S]*?auth\.uid\(\)\) = user_id/iu);
  assert.match(sql, /public_profile_status_owner_delete[\s\S]*?auth\.uid\(\)\) = user_id/iu);
  assert.doesNotMatch(sql, /grant (?:insert|update|delete|all).*? to anon/iu);
});

test('public view omits account identity and only exposes visible snapshots', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /with \(security_invoker = true\)/iu);
  assert.match(sql, /select slug, display_name, headline, avatar_seed, selected_metrics, updated_at/iu);
  assert.match(sql, /from public\.public_profile_status[\s\S]*?where visible/iu);
  assert.doesNotMatch(
    sql.match(/create or replace view public\.public_profile_status_cards[\s\S]*?;/iu)?.[0] ?? '',
    /user_id/iu,
  );
});

test('snapshot JSON is bounded and allowlisted with no raw content fields', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /octet_length\(selected_metrics::text\) <= 4096/iu);
  for (const metric of ['activeTimeMs', 'totalTokens', 'topModel', 'topProvider', 'topSurface']) {
    assert.match(sql, new RegExp(`'${metric}'`, 'u'));
  }
  assert.doesNotMatch(
    sql,
    /\b(?:raw_prompt|prompt_body|response_body|terminal_output|file_content|keystrokes|api_key|secret)\b/iu,
  );
});
