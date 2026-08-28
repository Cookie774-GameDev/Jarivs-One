import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  REQUIRED_CHANGED_PATHS,
  REQUIRED_COMMIT_SHAS,
  REQUIRED_CROSS_CUTTING_GATE_IDS,
  REQUIRED_FOCUSED_GATE_IDS,
  REQUIRED_PREEXISTING_CROSS_GATE_FAILURES,
  REQUIRED_PROTECTED_FAILURES,
  validateContinuationDeltaReport,
  validateContinuationDeltaRepository,
} from './pr31-continuation-delta-gate.mjs';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const reportPath = new URL(
  '../docs/operations/PR31_CONTINUATION_DELTA_GATE_REPORT.json',
  import.meta.url,
);

async function reportFixture() {
  return JSON.parse(await readFile(reportPath, 'utf8'));
}

function clone(value) {
  return structuredClone(value);
}

test('accepts the checked-in fail-closed continuation delta report', async () => {
  const report = await reportFixture();
  assert.deepEqual(validateContinuationDeltaReport(report), { ok: true, issues: [] });
});

test('pins the exact ordered continuation commit range', async () => {
  const report = await reportFixture();
  assert.deepEqual(
    report.range.commits.map((commit) => commit.sha),
    REQUIRED_COMMIT_SHAS,
  );
  const mutated = clone(report);
  mutated.range.commits.reverse();
  assert.match(validateContinuationDeltaReport(mutated).issues.join('\n'), /ordered commits/u);
});

test('requires every changed path exactly once with its target-commit digest', async () => {
  const report = await reportFixture();
  assert.deepEqual(
    [...report.changedFiles.map((file) => file.path)].sort(),
    [...REQUIRED_CHANGED_PATHS].sort(),
  );
  const mutated = clone(report);
  mutated.changedFiles.pop();
  assert.match(validateContinuationDeltaReport(mutated).issues.join('\n'), /changed files/u);
});

test('requires every changed path to map to an exact focused gate', async () => {
  const report = await reportFixture();
  assert.deepEqual(
    [...new Set(report.changedFiles.flatMap((file) => file.gateIds))].sort(),
    [...REQUIRED_FOCUSED_GATE_IDS].sort(),
  );
  const mutated = clone(report);
  mutated.changedFiles[0].gateIds = [];
  assert.match(validateContinuationDeltaReport(mutated).issues.join('\n'), /gate mapping/u);
});

test('requires fresh zero-failure focused evidence without rerunning protected files', async () => {
  const report = await reportFixture();
  assert.deepEqual(
    report.focusedEvidence.map((gate) => gate.id).sort(),
    [...REQUIRED_FOCUSED_GATE_IDS].sort(),
  );
  const mutated = clone(report);
  mutated.focusedEvidence[0].failed = 1;
  assert.match(validateContinuationDeltaReport(mutated).issues.join('\n'), /focused evidence/u);
});

test('requires every cross-cutting production release and security gate', async () => {
  const report = await reportFixture();
  assert.deepEqual(
    report.crossCuttingEvidence.map((gate) => gate.id).sort(),
    [...REQUIRED_CROSS_CUTTING_GATE_IDS].sort(),
  );
  const mutated = clone(report);
  mutated.crossCuttingEvidence.find((gate) => gate.id === 'production-build').status = 'failed';
  assert.match(validateContinuationDeltaReport(mutated).issues.join('\n'), /cross-cutting/u);
});

test('preserves the exact unchanged three-file and 67-failure protected boundary', async () => {
  const report = await reportFixture();
  assert.equal(report.protectedBaseline.totalFailedTests, 67);
  assert.deepEqual(
    report.protectedBaseline.files.map(({ path, failedTests }) => ({ path, failedTests })),
    REQUIRED_PROTECTED_FAILURES,
  );
  const mutated = clone(report);
  mutated.protectedBaseline.rerun = true;
  assert.match(validateContinuationDeltaReport(mutated).issues.join('\n'), /protected baseline/u);
});

test('records the separate pre-existing native authority release failure exactly', async () => {
  const report = await reportFixture();
  assert.equal(report.preexistingCrossGateFailures.totalFailedTests, 1);
  assert.deepEqual(
    report.preexistingCrossGateFailures.entries.map((entry) =>
      Object.fromEntries(
        Object.keys(REQUIRED_PREEXISTING_CROSS_GATE_FAILURES[0]).map((key) => [key, entry[key]]),
      ),
    ),
    REQUIRED_PREEXISTING_CROSS_GATE_FAILURES,
  );
  const mutated = clone(report);
  mutated.preexistingCrossGateFailures.entries[0].fixedDuringDeltaGate = true;
  assert.match(validateContinuationDeltaReport(mutated).issues.join('\n'), /cross-gate|ownership/u);
});

test('rejects completion or release-readiness overclaims while protected failures remain', async () => {
  const report = await reportFixture();
  const mutated = clone(report);
  mutated.completionClaimed = true;
  mutated.releaseReady = true;
  assert.match(validateContinuationDeltaReport(mutated).issues.join('\n'), /overclaim/u);
});

test('rejects sensitive report fields and prohibited process or mutation authority', async () => {
  const report = await reportFixture();
  const mutated = clone(report);
  mutated.secret = 'not-allowed';
  mutated.safety.ollamaAllowed = true;
  assert.match(validateContinuationDeltaReport(mutated).issues.join('\n'), /sensitive|safety/u);
});

test('recomputes the commit range, per-commit files, digests, and protected-file invariance', async () => {
  const report = await reportFixture();
  assert.deepEqual(await validateContinuationDeltaRepository(report, { repositoryRoot }), {
    ok: true,
    issues: [],
  });
});

test('rejects a forged changed-file digest against the target commit', async () => {
  const report = await reportFixture();
  const mutated = clone(report);
  mutated.changedFiles[0].sha256 = '0'.repeat(64);
  const result = await validateContinuationDeltaRepository(mutated, { repositoryRoot });
  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /digest mismatch/u);
});
