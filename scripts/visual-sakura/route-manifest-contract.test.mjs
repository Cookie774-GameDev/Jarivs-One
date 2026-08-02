import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIRECTORY, '..', '..');
const MANIFEST_DIRECTORY = path.join(SCRIPT_DIRECTORY, 'manifests');
const SOURCE_PATH = path.join(REPO_ROOT, 'tests', 'visual', 'monochrome', 'route-manifest.ts');

const OWNER_MAP = Object.freeze({
  MC4: 'SK4',
  MC5: 'SK5',
  MC7A: 'SK7A',
  MC7B: 'SK7B',
  MC7C: 'SK7C',
  MC7D: 'SK7D',
  MC7E: 'SK7E',
  MC7F: 'SK7F',
  MC7G: 'SK7G',
  MC9: 'SK9',
});

const ENTRY_OWNER_OVERRIDES = Object.freeze({
  'route:history': 'SK7C',
});

async function readJson(name) {
  return JSON.parse(await readFile(path.join(MANIFEST_DIRECTORY, name), 'utf8'));
}

async function loadAuthority() {
  return (await import(pathToFileURL(SOURCE_PATH).href)).MONOCHROME_ROUTE_COVERAGE_MANIFEST;
}

test('Sakura manifests form a complete, deterministic partition of the source authority', async () => {
  const [routes, windowsOverlays, source] = await Promise.all([
    readJson('routes.json'),
    readJson('windows-overlays.json'),
    loadAuthority(),
  ]);

  assert.equal(routes.schemaVersion, 1);
  assert.equal(routes.manifestKind, 'routes');
  assert.equal(windowsOverlays.schemaVersion, 1);
  assert.equal(windowsOverlays.manifestKind, 'windows-overlays');
  assert.match(routes.predecessorCommit, /^[0-9a-f]{7,40}$/);
  assert.equal(windowsOverlays.predecessorCommit, routes.predecessorCommit);

  const entries = [...routes.entries, ...windowsOverlays.entries];
  const ids = entries.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, 'coverage IDs must be globally unique');
  assert.deepEqual(
    [...ids].sort(),
    source.entries.map((entry) => entry.id).sort(),
    'every source-authority surface must appear exactly once',
  );
  assert.deepEqual(routes.finalRouteIds, source.finalRouteIds);
  assert.deepEqual(routes.settingsTabIds, source.settingsTabIds);
});

test('every row preserves literal source evidence and maps to one Sakura owner', async () => {
  const [routes, windowsOverlays, source] = await Promise.all([
    readJson('routes.json'),
    readJson('windows-overlays.json'),
    loadAuthority(),
  ]);
  const sourceById = new Map(source.entries.map((entry) => [entry.id, entry]));
  const writerOwners = new Map();

  for (const entry of [...routes.entries, ...windowsOverlays.entries]) {
    const authority = sourceById.get(entry.id);
    assert.ok(authority, `missing source row for ${entry.id}`);
    assert.equal(
      entry.owner,
      ENTRY_OWNER_OVERRIDES[entry.id] ?? OWNER_MAP[authority.owner],
      `wrong owner for ${entry.id}`,
    );
    assert.deepEqual(entry.sourcePaths, authority.sourcePaths, `source drift for ${entry.id}`);
    assert.deepEqual(entry.writerPaths, authority.writerPaths, `writer drift for ${entry.id}`);
    assert.deepEqual(entry.testPaths, authority.testPaths, `test drift for ${entry.id}`);
    assert.ok(entry.requirements.includes('SAK-030'), `${entry.id} lacks total-surface coverage`);
    assert.ok(entry.requirements.includes('SAK-048'), `${entry.id} lacks fidelity coverage`);
    assert.ok(entry.logicalLock.startsWith('sakura:'), `${entry.id} has a stale logical lock`);

    for (const writerPath of entry.writerPaths) {
      const existingOwner = writerOwners.get(writerPath);
      assert.ok(
        !existingOwner || existingOwner === entry.owner,
        `${writerPath} is assigned to both ${existingOwner} and ${entry.owner}`,
      );
      writerOwners.set(writerPath, entry.owner);
    }
  }
});

test('route and window partitions contain only their authorized surface kinds', async () => {
  const [routes, windowsOverlays] = await Promise.all([
    readJson('routes.json'),
    readJson('windows-overlays.json'),
  ]);
  const routeKinds = new Set(['route', 'settings', 'access', 'embedded', 'development', 'future']);
  const windowKinds = new Set(['overlay', 'detached', 'native']);

  assert.ok(routes.entries.every((entry) => routeKinds.has(entry.kind)));
  assert.ok(windowsOverlays.entries.every((entry) => windowKinds.has(entry.kind)));
  assert.deepEqual(
    routes.entries.map((entry) => entry.id),
    routes.entries.map((entry) => entry.id).sort(),
    'routes.json must be stable-sorted',
  );
  assert.deepEqual(
    windowsOverlays.entries.map((entry) => entry.id),
    windowsOverlays.entries.map((entry) => entry.id).sort(),
    'windows-overlays.json must be stable-sorted',
  );
});
