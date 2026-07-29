import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendPass,
  createPassLedger,
  validateFinalMetadata,
} from '../../../scripts/visual-chat/pass-ledger.mjs';

const hash = (character) => character.repeat(64);

const baselineEvidence = {
  screenshotSha256: hash('a'),
  reportSha256: hash('b'),
  diffSha256: hash('c'),
  overlaySha256: hash('d'),
};

const finalEvidence = {
  screenshotSha256: hash('e'),
  reportSha256: hash('f'),
  diffSha256: hash('1'),
  overlaySha256: hash('2'),
};

function contract() {
  return {
    viewport: {
      width: 1672,
      height: 941,
      deviceScaleFactor: 1,
      browserZoomPercent: 100,
    },
    regions: [{ name: 'header_full' }, { name: 'sidebar_full' }],
  };
}

function ledger() {
  return appendPass(
    createPassLedger({
      revision: { kind: 'commit', value: '8bd1e58cdb1ed6661eebe8d9afc3f1b86ae75696' },
      fullDiff: 0.5,
      weightedDiff: 0.45,
      regions: { header_full: 0.4, sidebar_full: 0.52 },
      evidence: baselineEvidence,
    }),
    {
      id: 'pass-001',
      parentId: 'baseline',
      revision: { kind: 'commit', value: '1234567890123456789012345678901234567890' },
      focusedChange: 'Align the header and sidebar geometry.',
      fullDiff: 0.42,
      weightedDiff: 0.38,
      regions: { header_full: 0.34, sidebar_full: 0.44 },
      worstRegion: { name: 'sidebar_full', diffRatio: 0.44 },
      decision: 'kept',
      regressions: [],
      evidence: finalEvidence,
    },
  );
}

function metadata(overrides = {}) {
  return {
    schemaVersion: 1,
    referenceTargetSha256: hash('3'),
    passLedgerSha256: hash('4'),
    passCount: 1,
    keptPassCount: 1,
    rejectedPassCount: 0,
    baseline: {
      revision: { kind: 'commit', value: '8bd1e58cdb1ed6661eebe8d9afc3f1b86ae75696' },
      fullDiff: 0.5,
      weightedDiff: 0.45,
      regions: { header_full: 0.4, sidebar_full: 0.52 },
      evidence: baselineEvidence,
    },
    final: {
      revision: { kind: 'commit', value: '1234567890123456789012345678901234567890' },
      route: 'http://127.0.0.1:4173/chat',
      viewport: {
        width: 1672,
        height: 941,
        deviceScaleFactor: 1,
        browserZoomPercent: 100,
      },
      fullDiff: 0.42,
      weightedDiff: 0.38,
      regions: { header_full: 0.34, sidebar_full: 0.44 },
      evidence: finalEvidence,
    },
    ...overrides,
  };
}

test('accepts final metadata bound exactly to the ledger and reference contract', () => {
  const value = metadata();

  assert.equal(validateFinalMetadata(value, { ledger: ledger(), contract: contract() }), value);
});

test('rejects score, evidence, count, region, viewport, and route claims not proven by evidence', () => {
  const cases = [
    [
      'baseline score',
      { baseline: { ...metadata().baseline, weightedDiff: 0.44 } },
      /baseline\.weightedDiff.*ledger/i,
    ],
    ['final score', { final: { ...metadata().final, fullDiff: 0.41 } }, /final\.fullDiff.*ledger/i],
    [
      'final evidence',
      {
        final: {
          ...metadata().final,
          evidence: { ...finalEvidence, screenshotSha256: hash('5') },
        },
      },
      /final\.evidence.*ledger/i,
    ],
    ['pass count', { passCount: 2 }, /passCount.*ledger/i],
    [
      'missing region',
      {
        final: {
          ...metadata().final,
          regions: { header_full: 0.34 },
        },
      },
      /final\.regions.*reference contract/i,
    ],
    [
      'viewport',
      {
        final: {
          ...metadata().final,
          viewport: { ...metadata().final.viewport, width: 1440 },
        },
      },
      /final\.viewport.*reference contract/i,
    ],
    [
      'remote route',
      {
        final: {
          ...metadata().final,
          route: 'https://attacker.example/chat',
        },
      },
      /final\.route.*local HTTP/i,
    ],
    [
      'reference hash',
      { referenceTargetSha256: 'not-a-sha256' },
      /referenceTargetSha256.*64-character/i,
    ],
    ['ledger hash', { passLedgerSha256: hash('A') }, /passLedgerSha256.*64-character/i],
  ];

  for (const [label, overrides, expected] of cases) {
    assert.throws(
      () =>
        validateFinalMetadata(metadata(overrides), {
          ledger: ledger(),
          contract: contract(),
        }),
      expected,
      label,
    );
  }
});
