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
  assert.deepEqual(
    ledger.passes.map(({ id, parentId, decision }) => ({ id, parentId, decision })),
    [
      { id: 'pass-001', parentId: 'baseline', decision: 'rejected' },
      { id: 'pass-002', parentId: 'baseline', decision: 'kept' },
      { id: 'pass-003', parentId: 'pass-002', decision: 'kept' },
      { id: 'pass-004', parentId: 'pass-003', decision: 'rejected' },
      { id: 'pass-005', parentId: 'pass-003', decision: 'kept' },
      { id: 'pass-006', parentId: 'pass-005', decision: 'rejected' },
      { id: 'pass-007', parentId: 'pass-005', decision: 'rejected' },
      { id: 'pass-008', parentId: 'pass-005', decision: 'kept' },
      { id: 'pass-009', parentId: 'pass-008', decision: 'kept' },
      { id: 'pass-010', parentId: 'pass-009', decision: 'kept' },
      { id: 'pass-011', parentId: 'pass-010', decision: 'rejected' },
      { id: 'pass-012', parentId: 'pass-010', decision: 'kept' },
    ],
  );
  assert.equal(ledger.reassessments.length, 1);
  assert.equal(ledger.reassessments[0]?.afterPassId, 'pass-012');
  assert.match(ledger.reassessments[0]?.nextFocus ?? '', /sidebar.*jarvis.*composer.*header/iu);
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

test('when ignored measured-pass artifacts exist, all four hashes match each ledger entry', () => {
  const ledger = readJson(LEDGER_PATH);
  const artifactRoots = {
    'pass-001': '.artifacts/origami-chat/pass-001-presentation',
    'pass-002': '.artifacts/origami-chat/pass-002-paper-layer',
    'pass-003': '.artifacts/origami-chat/pass-003-decor-coordinates',
    'pass-004': '.artifacts/origami-chat/pass-004-sidebar-geometry',
    'pass-005': '.artifacts/origami-chat/pass-005-composer-geometry',
    'pass-006': '.artifacts/origami-chat/pass-006-serif-typography',
    'pass-007': '.artifacts/origami-chat/pass-007-thread-width',
    'pass-008': '.artifacts/origami-chat/pass-008-sidebar-row-height',
    'pass-009': '.artifacts/origami-chat/pass-009-jarvis-panel-geometry-retry',
    'pass-010': '.artifacts/origami-chat/pass-010-thread-top-alignment',
    'pass-011': '.artifacts/origami-chat/pass-011-flower-geometry',
    'pass-012': '.artifacts/origami-chat/pass-012-assistant-spacing',
  };

  for (const entry of ledger.passes) {
    const artifactRoot = artifactRoots[entry.id];
    assert.equal(typeof artifactRoot, 'string', `missing artifact binding for ${entry.id}`);
    const artifacts = {
      screenshotSha256: `${artifactRoot}/chat.png`,
      reportSha256: `${artifactRoot}/compare/report.json`,
      diffSha256: `${artifactRoot}/compare/diff-full.png`,
      overlaySha256: `${artifactRoot}/compare/overlay-50.png`,
    };
    const paths = Object.values(artifacts).map((path) => resolve(ROOT, path));
    if (paths.every((path) => !existsSync(path))) continue;
    assert.equal(
      paths.every((path) => existsSync(path)),
      true,
      `${entry.id} evidence must exist together`,
    );
    for (const [name, path] of Object.entries(artifacts)) {
      assert.equal(fileHash(resolve(ROOT, path)), entry.evidence[name], `${entry.id}.${name}`);
    }
  }
});
