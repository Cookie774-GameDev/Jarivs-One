import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import * as routeAuthority from './route-manifest.ts';

const SOURCE_COMMIT = '7eb708e184ee4f054a49d3e70d73e80fd4eb97ae';
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const EXPECTED_ROUTES = [
  ['account', 'app/src/features/account/index.ts', 'settings-appearance'],
  ['agent-detail', 'app/src/features/agents/index.ts', 'chat'],
  ['agents', 'app/src/features/agents/index.ts', 'chat'],
  ['benchmarks', 'app/src/features/benchmarks/index.ts', 'chat'],
  ['browser', 'app/src/features/browser/index.ts', 'chat'],
  ['canvas', 'app/src/features/canvas/index.ts', 'chat'],
  ['chat', 'app/src/features/chat/index.ts', 'chat'],
  ['context', 'app/src/features/context/index.ts', 'chat'],
  ['files', 'app/src/features/files/index.ts', 'chat'],
  ['history', 'app/src/features/history/index.ts', 'chat'],
  ['kanban', 'app/src/features/kanban/index.ts', 'chat'],
  ['preview', 'app/src/features/preview/index.ts', 'chat'],
  ['project-detail', 'app/src/features/projects/index.ts', 'chat'],
  ['schedule', 'app/src/features/schedule/index.ts', 'chat'],
  ['skills', 'app/src/features/skills/index.ts', 'chat'],
  ['terminal', 'app/src/features/terminals/TerminalsPage.tsx', 'terminal-workbench'],
  ['tools', 'app/src/features/tools/index.ts', 'chat'],
  ['workbench', 'app/src/features/workbench/index.ts', 'terminal-workbench'],
] as const;

function sourceAtCommit(relativePath: string): string {
  return execFileSync('git', ['show', `${SOURCE_COMMIT}:${relativePath}`], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

test('the source-derived route authority exists before route visual coverage runs', () => {
  const manifestPath = fileURLToPath(new URL('./route-manifest.ts', import.meta.url));
  assert.equal(existsSync(manifestPath), true, 'missing route manifest');
});

test('route manifest freezes the complete Route union in stable order', () => {
  const manifest = routeAuthority.MONOCHROME_ROUTE_MANIFEST as Record<string, unknown>;
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.sourceCommit, SOURCE_COMMIT);
  assert.equal(manifest.captureMode, 'retroactive-source-freeze');
  assert.deepEqual(
    (manifest.routes as Array<{ id: string; sourcePath: string; fixtureId: string }>).map(
      ({ id, sourcePath, fixtureId }) => [id, sourcePath, fixtureId],
    ),
    EXPECTED_ROUTES,
  );
  assert.deepEqual(manifest.consumerTasks, ['MC5', 'MC6', 'MC7']);
  assert.equal(
    manifest.validatorCommand,
    'node --test tests/visual/monochrome/route-manifest.test.ts',
  );
});

test('route ids close over the frozen union and PageRouter dispatch table', () => {
  assert.equal(
    Array.isArray(routeAuthority.MONOCHROME_ROUTE_MANIFEST.routes),
    true,
    'missing route entries',
  );
  if (!Array.isArray(routeAuthority.MONOCHROME_ROUTE_MANIFEST.routes)) return;

  const unionSource = sourceAtCommit('app/src/stores/ui.ts');
  const unionBlock = unionSource.slice(
    unionSource.indexOf('export type Route ='),
    unionSource.indexOf(';', unionSource.indexOf('export type Route =')),
  );
  const unionRoutes = [...unionBlock.matchAll(/\|\s*'([^']+)'/gu)].map((match) => match[1]).sort();

  const routerSource = sourceAtCommit('app/src/components/layout/PageRouter.tsx');
  const mapBlock = routerSource.slice(
    routerSource.indexOf('const routeMap:'),
    routerSource.indexOf('};', routerSource.indexOf('const routeMap:')),
  );
  const mapRoutes = [...mapBlock.matchAll(/^\s*(?:'([^']+)'|([a-z-]+)):\s*[A-Z]/gmu)]
    .map((match) => match[1] ?? match[2])
    .sort();
  const manifestRoutes = routeAuthority.MONOCHROME_ROUTE_MANIFEST.routes
    .map((route) => route.id)
    .sort();

  assert.deepEqual(manifestRoutes, unionRoutes);
  assert.deepEqual(manifestRoutes, mapRoutes);
  assert.equal(manifestRoutes.includes('monochrome-workbench'), false);
});

test('route sources exist in the frozen commit and use only frozen fixture ids', () => {
  assert.equal(
    Array.isArray(routeAuthority.MONOCHROME_ROUTE_MANIFEST.routes),
    true,
    'missing route entries',
  );
  if (!Array.isArray(routeAuthority.MONOCHROME_ROUTE_MANIFEST.routes)) return;

  for (const route of routeAuthority.MONOCHROME_ROUTE_MANIFEST.routes) {
    assert.doesNotThrow(() => sourceAtCommit(route.sourcePath), route.sourcePath);
    assert.ok(['chat', 'settings-appearance', 'terminal-workbench'].includes(route.fixtureId));
    assert.match(route.owner, /^route:/u);
  }
  assert.equal(existsSync(path.join(REPO_ROOT, 'app/src/components/layout/PageRouter.tsx')), true);
});

test('route validator rejects duplicate ids, path overlap, and unstable order', () => {
  const validate = routeAuthority.validateMonochromeRouteManifest;
  assert.equal(typeof validate, 'function', 'missing route manifest validator');
  if (typeof validate !== 'function') return;

  const manifest = routeAuthority.MONOCHROME_ROUTE_MANIFEST;
  assert.equal(Array.isArray(manifest.routes), true, 'missing route entries');
  if (!Array.isArray(manifest.routes)) return;
  assert.deepEqual(validate(manifest), []);
  assert.match(
    validate({ ...manifest, routes: [...manifest.routes, manifest.routes[0]] }).join('\n'),
    /duplicate|stable order/iu,
  );
  assert.match(
    validate({
      ...manifest,
      ownedPaths: [
        ...manifest.ownedPaths,
        'app/src/features/appearance/monochromePrimitiveManifest.ts',
      ],
    }).join('\n'),
    /overlap/iu,
  );
});
