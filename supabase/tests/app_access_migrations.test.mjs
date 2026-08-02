import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

function read(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

const migrationPaths = [
  'supabase/migrations/0032_app_access.sql',
  'supabase/migrations/0033_app_access_event_reconcile.sql',
  'supabase/migrations/0034_app_access_lease_freshness.sql',
  'supabase/migrations/0035_app_access_checkout_attempts.sql',
];

test('Access audit events are append-only for service-role callers', () => {
  const migration = read(migrationPaths[0]);
  const behavior = read('supabase/tests/app_access_behavior.sql');

  assert.match(
    migration,
    /create policy app_access_events_service_select[\s\S]*?for select to service_role[\s\S]*?create policy app_access_events_service_insert[\s\S]*?for insert to service_role/iu,
  );
  assert.match(
    migration,
    /grant select, insert\s+on table public\.app_access_events to service_role/iu,
  );
  assert.doesNotMatch(
    migration,
    /grant[\s\S]{0,80}\bupdate\b[\s\S]{0,40}public\.app_access_events to service_role/iu,
  );
  assert.doesNotMatch(
    migration,
    /grant[\s\S]{0,80}\bdelete\b[\s\S]{0,40}public\.app_access_events to service_role/iu,
  );
  assert.match(
    behavior,
    /service_role must not have update\/delete on append-only public\.app_access_events/iu,
  );
});

test('Access migrations bound lock time and document data-preserving operational rollback', () => {
  for (const relativePath of migrationPaths) {
    const migration = read(relativePath);
    assert.match(migration, /set lock_timeout = '5s';/iu, `${relativePath} lock timeout`);
    assert.match(
      migration,
      /set statement_timeout = '60s';/iu,
      `${relativePath} statement timeout`,
    );
    assert.match(
      migration,
      /data-preserving operational rollback/iu,
      `${relativePath} rollback contract`,
    );
    assert.doesNotMatch(migration, /\bar_\w+/iu, `${relativePath} AccessRevamp isolation`);
  }
});

test('all new authenticated Access functions explicitly retain gateway JWT verification', () => {
  const config = read('supabase/config.toml');

  for (const functionName of ['create-access-checkout', 'create-access-portal', 'access-lease']) {
    assert.match(
      config,
      new RegExp(`\\[functions\\.${functionName}\\]\\s*verify_jwt\\s*=\\s*true`, 'u'),
      functionName,
    );
  }
});
