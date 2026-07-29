import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validatePassLedger } from '../../../scripts/visual-chat/pass-ledger.mjs';
import { loadOrigamiReferenceContract } from '../../../scripts/visual-chat/reference-contract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const LEDGER_PATH = resolve(HERE, 'pass-ledger.json');
const BASELINE_METADATA_PATH = resolve(HERE, 'baseline-metadata.json');
const SHA256 = /^[a-f0-9]{64}$/u;

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function fileHash(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

test('tracked pass ledger starts from the measured, metadata-bound historical baseline', () => {
  const ledger = readJson(LEDGER_PATH);
  const metadata = readJson(BASELINE_METADATA_PATH);
  const contract = loadOrigamiReferenceContract();

  assert.equal(validatePassLedger(ledger), ledger);
  assert.equal(ledger.baseline.revision.kind, 'commit');
  assert.equal(ledger.baseline.revision.value, metadata.sourceCommit);
  assert.equal(ledger.baseline.fullDiff, metadata.scores.fullDiffRatio);
  assert.equal(ledger.baseline.weightedDiff, metadata.scores.weightedDiffRatio);
  assert.deepEqual(ledger.baseline.regions, metadata.scores.regions);
  assert.deepEqual(
    Object.keys(ledger.baseline.regions).sort(),
    contract.regions.map(({ name }) => name).sort(),
  );
  assert.equal(ledger.baseline.evidence.screenshotSha256, metadata.screenshotSha256);
  assert.equal(ledger.baseline.evidence.reportSha256, metadata.reportSha256);
  assert.match(ledger.baseline.evidence.diffSha256, SHA256);
  assert.match(ledger.baseline.evidence.overlaySha256, SHA256);
  assert.deepEqual(ledger.passes, []);
  assert.deepEqual(ledger.reassessments, []);
});

test('when ignored comparison artifacts exist, their four hashes match the baseline ledger', () => {
  const ledger = readJson(LEDGER_PATH);
  const artifacts = {
    screenshotSha256: '.artifacts/origami-chat/baseline/chat.png',
    reportSha256: '.artifacts/origami-chat/baseline/compare/report.json',
    diffSha256: '.artifacts/origami-chat/baseline/compare/diff-full.png',
    overlaySha256: '.artifacts/origami-chat/baseline/compare/overlay-50.png',
  };
  const paths = Object.values(artifacts).map((path) => resolve(ROOT, path));
  if (paths.every((path) => !existsSync(path))) return;
  assert.equal(
    paths.every((path) => existsSync(path)),
    true,
    'baseline evidence must exist together',
  );
  for (const [name, path] of Object.entries(artifacts)) {
    assert.equal(fileHash(resolve(ROOT, path)), ledger.baseline.evidence[name], name);
  }
});
