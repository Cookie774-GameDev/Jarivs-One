import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const sql = readFileSync(
  new URL('./0047_remote_jarvis_service_access.sql', import.meta.url),
  'utf8',
);

describe('0047 remote Jarvis service access', () => {
  it('exposes app access only to service role for one explicit user', () => {
    assert.match(
      sql,
      /get_remote_jarvis_app_access\(\s*p_user_id uuid,\s*p_app_version text default null\s*\)/i,
    );
    assert.match(sql, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/i);
    assert.match(sql, /public\.app_access_compute\(p_user_id, true, p_app_version\)/i);
    assert.match(
      sql,
      /revoke all on function public\.get_remote_jarvis_app_access\(uuid, text\)[^;]+public, anon, authenticated/is,
    );
    assert.match(
      sql,
      /grant execute on function public\.get_remote_jarvis_app_access\(uuid, text\) to service_role/i,
    );
  });
});
