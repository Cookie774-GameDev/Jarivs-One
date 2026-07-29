import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const evidenceIndexPath = path.join(repoRoot, 'docs/appearance/monochrome/evidence-index.md');
const ledgerBlockPattern = /```json evidence-ledger\r?\n([\s\S]*?)\r?\n```/gu;
const baselineCommit = '10ade2cb205be6aae93e239e8debd9eaf584b6de';

const checkpointStatuses = new Map([
  ['MC8A-REFERENCE-CONTRACT', 'PASS'],
  ['MC8B-VIDEO-CALIBRATION', 'BLOCKED_MISSING_SOURCE'],
  ['MC9-FIXED-ENVIRONMENT', 'NOT_RUN'],
  ['MC9-VISUAL-METRICS', 'NOT_RUN'],
  ['MC9-PRESERVED-THEMES', 'NOT_RUN'],
  ['MC9-FUNCTIONAL-REGRESSION', 'NOT_RUN'],
  ['MC9-ACCESSIBILITY', 'NOT_RUN'],
  ['MC9-NATIVE-VALIDATE', 'NOT_RUN'],
  ['MC9-NATIVE-WINDOWS', 'NOT_RUN'],
  ['MC9-RELEASE-EXECUTABLE', 'NOT_RUN'],
  ['MC9-UNSIGNED-NSIS', 'NOT_RUN'],
  ['MC9-INSTALLED-PACKAGE', 'NOT_RUN'],
  ['MC9-WEBKIT-PREVIEW', 'NOT_RUN'],
  ['MC9-MACOS', 'NOT_RUN'],
  ['MC9-LINUX', 'NOT_RUN'],
  ['MC9-PERFORMANCE-SECURITY', 'NOT_RUN'],
  ['MC9-FUTURE-MESSAGING', 'UNAVAILABLE_BY_MANIFEST'],
  ['MC9-WORKBENCH-DEV-ONLY', 'NOT_RUN'],
  ['MC9-FINAL-MATRIX', 'NOT_RUN'],
]);

const allowedStatuses = new Set([
  'PASS',
  'FAIL',
  'BLOCKED',
  'BLOCKED_MISSING_SOURCE',
  'SKIPPED_NOT_APPLICABLE',
  'UNAVAILABLE_BY_MANIFEST',
  'NOT_RUN',
]);

function replaceLedger(markdown, ledger) {
  return markdown.replace(
    /```json evidence-ledger\r?\n[\s\S]*?\r?\n```/u,
    `\`\`\`json evidence-ledger\n${JSON.stringify(ledger, null, 2)}\n\`\`\``,
  );
}

function assertRepositoryRelative(relativePath, label) {
  assert.equal(typeof relativePath, 'string', `${label} must be a string`);
  assert.ok(relativePath.length > 0, `${label} must not be empty`);
  assert.equal(relativePath.includes('\\'), false, `${label} must use forward slashes`);
  assert.equal(path.posix.isAbsolute(relativePath), false, `${label} must be relative`);
  assert.equal(/^[A-Za-z]:/u.test(relativePath), false, `${label} must not contain a drive`);
  assert.equal(/^https?:\/\//iu.test(relativePath), false, `${label} must not be a URL`);
  assert.equal(relativePath.split('/').includes('..'), false, `${label} must not traverse`);
  assert.equal(path.posix.normalize(relativePath), relativePath, `${label} must be normalized`);
}

function parseUtc(value, label) {
  assert.match(value, /^\d{4}-\d{2}-\d{2}T.*Z$/u, `${label} must be UTC ISO-8601`);
  const timestamp = Date.parse(value);
  assert.equal(Number.isFinite(timestamp), true, `${label} must parse`);
  return timestamp;
}

async function sha256(relativePath) {
  const bytes = await readFile(path.join(repoRoot, ...relativePath.split('/')));
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

function sha256AtCommit(commitSha, relativePath) {
  const bytes = execFileSync('git', ['show', `${commitSha}:${relativePath}`], {
    cwd: repoRoot,
    encoding: 'buffer',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

async function validateDocument(markdown) {
  const blocks = [...markdown.matchAll(ledgerBlockPattern)];
  assert.equal(blocks.length, 1, 'evidence index must contain exactly one ledger block');
  const ledger = JSON.parse(blocks[0][1]);

  assert.equal(ledger.schemaVersion, 1);
  assert.equal(ledger.ledgerId, 'vibespace-monochrome-evidence-index');
  assert.equal(ledger.baselineCommit, baselineCommit);
  assert.match(ledger.baselineCommit, /^[0-9a-f]{40}$/u);
  assert.equal(ledger.records.length, checkpointStatuses.size);
  assert.deepEqual(new Set(ledger.records.map(({ id }) => id)), new Set(checkpointStatuses.keys()));

  const generatedAt = parseUtc(ledger.generatedAtUtc, 'generatedAtUtc');
  const finishedTimestamps = [];
  for (const record of ledger.records) {
    assert.equal(record.status, checkpointStatuses.get(record.id), `${record.id} status drift`);
    assert.equal(allowedStatuses.has(record.status), true);
    assert.equal(record.provenanceCommitSha, baselineCommit);
    assert.match(record.provenanceCommitSha, /^[0-9a-f]{40}$/u);
    assert.ok(Array.isArray(record.requirementIds) && record.requirementIds.length > 0);
    assert.ok(typeof record.reviewDomain === 'string' && record.reviewDomain.length > 0);
    assert.ok(typeof record.surface === 'string' && record.surface.length > 0);
    assert.ok(typeof record.command === 'string');
    assert.equal(record.cwd, '.');
    assert.ok(Array.isArray(record.evidence));
    assert.ok(Array.isArray(record.fixtureIds));
    assert.ok(Array.isArray(record.fixtureHashes));
    assert.ok(Array.isArray(record.mockedProviders));
    assert.ok(Array.isArray(record.severityCounts));
    assert.ok(typeof record.cleanup === 'string' && record.cleanup.length > 0);

    const executed = record.status === 'PASS' || record.status === 'FAIL';
    if (executed) {
      assert.match(record.testedCommitSha, /^[0-9a-f]{40}$/u);
      const startedAt = parseUtc(record.startedAtUtc, `${record.id}.startedAtUtc`);
      const finishedAt = parseUtc(record.finishedAtUtc, `${record.id}.finishedAtUtc`);
      assert.ok(finishedAt >= startedAt, `${record.id} timestamps must be ordered`);
      assert.ok(Number.isInteger(record.durationMs) && record.durationMs >= 0);
      assert.ok(
        Math.abs(record.durationMs - (finishedAt - startedAt)) <= 1,
        `${record.id} duration must match timestamps`,
      );
      assert.ok(Number.isInteger(record.exitCode));
      assert.equal(record.status === 'PASS' ? record.exitCode === 0 : record.exitCode !== 0, true);
      assert.ok(record.command.length > 0);
      assert.ok(record.evidence.length > 0);
      assert.equal(record.blockerReason, null);
      finishedTimestamps.push(finishedAt);
    } else {
      assert.equal(record.testedCommitSha, null);
      assert.equal(record.startedAtUtc, null);
      assert.equal(record.finishedAtUtc, null);
      assert.equal(record.durationMs, null);
      assert.equal(record.exitCode, null);
      assert.ok(typeof record.blockerReason === 'string' && record.blockerReason.length > 0);
    }

    for (const [index, evidence] of record.evidence.entries()) {
      assert.deepEqual(
        Object.keys(evidence).sort(),
        evidence.sha256 === undefined ? ['path', 'result'] : ['path', 'result', 'sha256'],
        `${record.id} evidence ${index} has an unexpected shape`,
      );
      assertRepositoryRelative(evidence.path, `${record.id}.evidence[${index}].path`);
      await access(path.join(repoRoot, ...evidence.path.split('/')));
      assert.ok(typeof evidence.result === 'string' && evidence.result.length > 0);
      if (evidence.sha256 !== undefined) {
        assert.match(evidence.sha256, /^[0-9A-F]{64}$/u);
        assert.equal(
          evidence.sha256,
          sha256AtCommit(record.testedCommitSha, evidence.path),
          `${record.id} evidence must match its immutable tested commit`,
        );
        assert.equal(
          evidence.sha256,
          await sha256(evidence.path),
          `${record.id} accepted evidence must not drift in the working copy`,
        );
      } else {
        assert.equal(executed, false, `${record.id} executed evidence requires a SHA-256`);
      }
    }
  }

  assert.deepEqual(
    ledger.records.filter(({ status }) => status === 'PASS').map(({ id }) => id),
    ['MC8A-REFERENCE-CONTRACT'],
  );
  assert.equal(generatedAt, Math.max(...finishedTimestamps));

  assert.doesNotMatch(markdown, /(?:[A-Za-z]:[\\/]|\\\\[^\\\s]+\\|\/Users\/|\/home\/)/u);
  assert.doesNotMatch(markdown, /https?:\/\//iu);
  assert.doesNotMatch(
    markdown,
    /(?:sk-(?:proj|live|test)-|sk_(?:live|test)_|ghp_|github_pat_|xox[baprs]-|Bearer\s+[A-Za-z0-9._~-]+|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|sb_(?:secret|publishable)_|service[_-]?role|secret[_-]?key)/iu,
  );

  const counts = Object.fromEntries(
    [...allowedStatuses].map((status) => [
      status,
      ledger.records.filter((record) => record.status === status).length,
    ]),
  );
  for (const [status, count] of Object.entries(counts)) {
    assert.match(markdown, new RegExp(`\\| ${status}\\s+\\|\\s+${count} \\|`, 'u'));
  }

  return ledger;
}

test('MC9 checkpoint ledger is exact, truthful, hashed, and privacy-safe', async () => {
  const markdown = await readFile(evidenceIndexPath, 'utf8');
  await validateDocument(markdown);
});

test('ledger validator rejects structural, temporal, hash, path, and secret drift', async () => {
  const markdown = await readFile(evidenceIndexPath, 'utf8');
  const ledger = await validateDocument(markdown);
  const [ledgerBlock] = [...markdown.matchAll(ledgerBlockPattern)];

  await assert.rejects(validateDocument(`${markdown}\n${ledgerBlock[0]}`));

  const missingRecord = structuredClone(ledger);
  missingRecord.records.pop();
  await assert.rejects(validateDocument(replaceLedger(markdown, missingRecord)));

  const wrongStatus = structuredClone(ledger);
  wrongStatus.records.find(({ id }) => id === 'MC9-FINAL-MATRIX').status = 'PASS';
  await assert.rejects(validateDocument(replaceLedger(markdown, wrongStatus)));

  const wrongDuration = structuredClone(ledger);
  wrongDuration.records[0].durationMs += 10;
  await assert.rejects(validateDocument(replaceLedger(markdown, wrongDuration)));

  const wrongGeneratedAt = structuredClone(ledger);
  wrongGeneratedAt.generatedAtUtc = '2026-07-29T23:03:38.4512285Z';
  await assert.rejects(validateDocument(replaceLedger(markdown, wrongGeneratedAt)));

  const wrongHash = structuredClone(ledger);
  wrongHash.records[0].evidence[0].sha256 = '0'.repeat(64);
  await assert.rejects(validateDocument(replaceLedger(markdown, wrongHash)));

  const wrongTestedCommit = structuredClone(ledger);
  wrongTestedCommit.records[0].testedCommitSha = '0'.repeat(40);
  await assert.rejects(validateDocument(replaceLedger(markdown, wrongTestedCommit)));

  const traversal = structuredClone(ledger);
  traversal.records[0].evidence[0].path = '../private.txt';
  await assert.rejects(validateDocument(replaceLedger(markdown, traversal)));

  await assert.rejects(validateDocument(`${markdown}\nBearer not-a-real-token`));
});
