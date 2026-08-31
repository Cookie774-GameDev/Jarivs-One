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
  assert.deepEqual(report.corpusMinimum, {
    positive: 300,
    closeNegative: 300,
    ambiguity: 100,
    authorization: 100,
  });
  assert.equal(report.latencyBudgetMs, 500);
  assert.equal(report.verification.status, 'passed');
  assert.deepEqual(report.verification.testFiles, [
    'src/features/instant-command/acceptanceCorpus.test.ts',
    'src/features/instant-command/executableAcceptance.test.ts',
    'src/features/instant-command/performance.test.ts',
  ]);
  assert.ok(report.verification.durationMs > 0);
  assert.equal(report.verification.freshProcess, true);
  assert.equal(report.verification.warmP95Gate, true);
  assert.equal(report.verification.warmP95GateSource, 'performance.test.ts');
  assert.deepEqual(report.verification.executableScenarios, [
    'open-codex',
    'open-opencode',
    'message-opencode-exactly-once',
    'connect-providers-securely',
    'terminal-list',
    'schedule-list',
  ]);
  assert.doesNotMatch(result.stdout, /tell me about|api[_ -]?key|bearer\s|password\s*[:=]/iu);
});
