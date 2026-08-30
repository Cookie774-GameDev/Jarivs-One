import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('fresh-process Instant Command catalog acceptance audit', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/pr31-instant-command-catalog-acceptance.mjs'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.forbiddenPreReceiptImports.length, 0);
  assert.ok(report.commandIds >= 90);
  assert.deepEqual(report.corpus, {
    positive: 300,
    negative: 300,
    ambiguity: 100,
    authorization: 100,
  });
  assert.equal(report.latencyBudgetMs, 500);
});
