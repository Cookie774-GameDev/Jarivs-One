import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../migrations/0037_profiles_display_name_security.sql',
  import.meta.url,
);

async function migrationSql() {
  return readFile(migrationUrl, 'utf8');
}

test('profile migration exposes only owner-scoped select and update policies', async () => {
  const sql = await migrationSql();

  assert.match(
    sql,
    /create policy profiles_owner_select[\s\S]*?for select\s+to authenticated[\s\S]*?auth\.uid\(\)\) is not null[\s\S]*?auth\.uid\(\)\) = id/iu,
  );
  assert.match(
    sql,
    /create policy profiles_owner_update[\s\S]*?for update\s+to authenticated[\s\S]*?using[\s\S]*?auth\.uid\(\)\) = id[\s\S]*?with check[\s\S]*?auth\.uid\(\)\) = id/iu,
  );
  assert.doesNotMatch(sql, /create policy[\s\S]*?for all/iu);
});

test('profile migration grants authenticated clients read access and display-name-only updates', async () => {
  const sql = await migrationSql();

  assert.match(sql, /revoke all on table public\.profiles from anon, authenticated/iu);
  assert.match(sql, /grant select on table public\.profiles to authenticated/iu);
  assert.match(
    sql,
    /grant update\s*\(\s*display_name\s*\)\s*on table public\.profiles to authenticated/iu,
  );
  assert.doesNotMatch(sql, /grant (?:all|insert|delete).*authenticated/iu);
});

test('profile migration preserves trusted server access and RLS', async () => {
  const sql = await migrationSql();

  assert.match(sql, /alter table public\.profiles enable row level security/iu);
  assert.match(sql, /grant all on table public\.profiles to service_role/iu);
});
