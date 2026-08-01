import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { auditProductionWorkbenchAbsence } from './production-workbench-absence.mjs';

const temporaryRoots = [];

function productionFixture(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'vibespace-production-workbench-'));
  temporaryRoots.push(root);
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(root, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

test('accepts a real production distribution without development workbench identifiers', () => {
  const root = productionFixture({
    'assets/main-123.js':
      'const authority = "development:monochrome-workbench"; const marker = "data-monochrome-development-surface";',
    'index.html': '<script type="module" src="/assets/main-123.js"></script>',
  });

  const result = auditProductionWorkbenchAbsence(root);

  assert.equal(result.htmlEntryCount, 1);
  assert.equal(result.javascriptBundleCount, 1);
  assert.equal(result.scannedFileCount, 2);
  assert.deepEqual(result.violations, []);
});

test('rejects a development workbench token even when it survives only in a lazy chunk', () => {
  const root = productionFixture({
    'assets/main.js': 'import("./appearance-fixture.js");',
    'assets/appearance-fixture.js':
      'export const route = "monochrome-workbench"; export const name = "MonochromeWorkbench";',
    'index.html': '<script type="module" src="/assets/main.js"></script>',
  });

  assert.throws(
    () => auditProductionWorkbenchAbsence(root),
    /production bundle contains development-only MonoChrome workbench identifiers.*appearance-fixture\.js/su,
  );
});

test('rejects development-only fixture-module evidence embedded in production metadata', () => {
  const root = productionFixture({
    'assets/main.js': 'console.log("production");',
    'index.html': '<script type="module" src="/assets/main.js"></script>',
    'manifest.json': '{"module":"monochromeWorkbenchFixtures"}',
  });

  assert.throws(() => auditProductionWorkbenchAbsence(root), /monochromeWorkbenchFixtures/u);
});

test('fails closed when the requested distribution or its entry artifacts are missing', () => {
  assert.throws(
    () => auditProductionWorkbenchAbsence(path.join(tmpdir(), 'definitely-missing-vibespace-dist')),
    /production distribution directory is unavailable/u,
  );

  const noHtml = productionFixture({ 'assets/main.js': 'console.log("production");' });
  assert.throws(() => auditProductionWorkbenchAbsence(noHtml), /HTML entry/u);

  const noJavascript = productionFixture({ 'index.html': '<main>static only</main>' });
  assert.throws(() => auditProductionWorkbenchAbsence(noJavascript), /JavaScript bundle/u);
});
