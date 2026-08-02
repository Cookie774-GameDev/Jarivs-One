import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ORIGAMI_BASELINE_SOURCE_COMMIT,
  ORIGAMI_PRESENTATION_COMMIT,
} from '../../../scripts/visual-chat/materialize-baseline.mjs';
import { loadOrigamiReferenceContract } from '../../../scripts/visual-chat/reference-contract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const METADATA_PATH = resolve(HERE, 'baseline-metadata.json');
const REFERENCE_PATH = resolve(HERE, 'reference/target-chat.png');
const FIXTURE_PATH = resolve(HERE, 'fixture-data.mjs');
const SHA256 = /^[a-f0-9]{64}$/u;

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function fileHash(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function score(value, label) {
  assert.equal(typeof value, 'number', `${label} must be numeric`);
  assert.ok(Number.isFinite(value), `${label} must be finite`);
  assert.ok(value >= 0 && value <= 1, `${label} must be between zero and one`);
}

test('baseline metadata binds the exact historical source, fixture, reference, and viewport', () => {
  const metadata = readJson(METADATA_PATH);
  const contract = loadOrigamiReferenceContract();

  assert.equal(metadata.schemaVersion, 1);
  assert.equal(metadata.sourceCommit, ORIGAMI_BASELINE_SOURCE_COMMIT);
  assert.equal(metadata.origamiCommit, ORIGAMI_PRESENTATION_COMMIT);
  assert.equal(metadata.route, 'Chat');
  assert.deepEqual(metadata.viewport, contract.viewport);
  assert.equal(metadata.referenceTargetSha256, fileHash(REFERENCE_PATH));
  assert.equal(metadata.fixtureSha256, fileHash(FIXTURE_PATH));
  assert.match(metadata.screenshotSha256, SHA256);
  assert.match(metadata.reportSha256, SHA256);
  assert.equal(metadata.browserSource, 'msedge');
  assert.deepEqual(metadata.historicalRoot, {
    injected: true,
    selector: '[data-terminal-drop="chat"][data-terminal-drop-chat-id]',
    requiredDescendants: [
      '[data-testid="jarvis-session-panel"]',
      'textarea[aria-label="Message"]',
      '[role="log"][data-tour="chat-thread"]',
    ],
  });
  assert.match(metadata.materializationCommand, /materialize-baseline\.mjs$/u);
  assert.match(metadata.captureCommand, /--historical-chat-root$/u);
  assert.match(
    metadata.comparisonCommand,
    new RegExp(`--revision ${metadata.sourceCommit}\\b`, 'u'),
  );
});

test('baseline metadata contains finite measured full, weighted, and complete region scores', () => {
  const metadata = readJson(METADATA_PATH);
  const contract = loadOrigamiReferenceContract();

  score(metadata.scores.fullDiffRatio, 'scores.fullDiffRatio');
  score(metadata.scores.weightedDiffRatio, 'scores.weightedDiffRatio');
  assert.deepEqual(
    Object.keys(metadata.scores.regions).sort(),
    contract.regions.map(({ name }) => name).sort(),
  );
  for (const [name, value] of Object.entries(metadata.scores.regions)) {
    score(value, `scores.regions.${name}`);
  }
});

test('when ignored baseline artifacts exist, their hashes and report numbers match the metadata', () => {
  const metadata = readJson(METADATA_PATH);
  const screenshotPath = resolve(ROOT, metadata.artifactPaths.screenshot);
  const reportPath = resolve(ROOT, metadata.artifactPaths.report);
  if (!existsSync(screenshotPath) && !existsSync(reportPath)) return;

  assert.equal(existsSync(screenshotPath), true, 'baseline screenshot/report must exist together');
  assert.equal(existsSync(reportPath), true, 'baseline screenshot/report must exist together');
  assert.equal(fileHash(screenshotPath), metadata.screenshotSha256);
  assert.equal(fileHash(reportPath), metadata.reportSha256);

  const report = readJson(reportPath);
  assert.equal(report.revision, metadata.sourceCommit);
  assert.equal(report.route, metadata.route);
  assert.deepEqual(report.viewport, metadata.viewport);
  assert.equal(report.full.diffRatio, metadata.scores.fullDiffRatio);
  assert.equal(report.weightedRegionDiffRatio, metadata.scores.weightedDiffRatio);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(report.regions).map(([name, region]) => [name, region.diffRatio]),
    ),
    metadata.scores.regions,
  );
});
