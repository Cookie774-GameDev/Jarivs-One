import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_MATERIAL_REGION_REGRESSION_THRESHOLD,
  decideMeasuredPass,
} from './pass-decision.mjs';
import { appendPass } from './pass-ledger.mjs';

const hash = (character) => character.repeat(64);

function evidence(offset = 0) {
  const characters = ['a', 'b', 'c', 'd', 'e', 'f', '1', '2'];
  return {
    screenshotSha256: hash(characters[offset]),
    reportSha256: hash(characters[offset + 1]),
    diffSha256: hash(characters[offset + 2]),
    overlaySha256: hash(characters[offset + 3]),
  };
}

function baseline(overrides = {}) {
  return {
    revision: { kind: 'commit', value: 'baseline-revision' },
    fullDiff: 0.5,
    weightedDiff: 0.45,
    regions: {
      header_full: 0.4,
      sidebar_full: 0.52,
      composer: 0.3,
    },
    evidence: evidence(),
    ...overrides,
  };
}

function keptPass(id, parentId, overrides = {}) {
  return {
    id,
    parentId,
    revision: { kind: 'working-tree', value: `revision:${id}` },
    focusedChange: `Change ${id}`,
    fullDiff: 0.48,
    weightedDiff: 0.43,
    regions: {
      header_full: 0.38,
      sidebar_full: 0.5,
      composer: 0.29,
    },
    worstRegion: { name: 'sidebar_full', diffRatio: 0.5 },
    decision: 'kept',
    regressions: [],
    evidence: evidence(1),
    ...overrides,
  };
}

function ledger(overrides = {}) {
  return {
    schemaVersion: 1,
    maximumPassesBeforeReassessment: 12,
    baseline: baseline(),
    passes: [],
    reassessments: [],
    ...overrides,
  };
}

function candidate(overrides = {}) {
  const id = overrides.id ?? 'pass-001';
  const revision = overrides.revision ?? {
    kind: 'working-tree',
    value: `revision:${id}`,
  };
  return {
    id,
    parentId: 'baseline',
    revision,
    focusedChange: 'Align the header geometry.',
    focusedRegions: ['header_full'],
    functionalRegressions: [],
    evidence: evidence(1),
    comparison: {
      schemaVersion: 1,
      passId: id,
      revision: revision.value,
      full: { diffRatio: 0.48 },
      weightedRegionDiffRatio: 0.43,
      regions: {
        header_full: { diffRatio: 0.36 },
        sidebar_full: { diffRatio: 0.51 },
        composer: { diffRatio: 0.29 },
      },
    },
    ...overrides,
  };
}

test('keeps a bound candidate only when full and weighted scores improve', () => {
  const sourceLedger = ledger();
  const sourceCandidate = candidate();
  const beforeLedger = structuredClone(sourceLedger);
  const beforeCandidate = structuredClone(sourceCandidate);

  const result = decideMeasuredPass(sourceLedger, sourceCandidate);

  assert.equal(DEFAULT_MATERIAL_REGION_REGRESSION_THRESHOLD, 0.01);
  assert.deepEqual(result, {
    decision: 'kept',
    reasons: [],
    reassessmentRequired: false,
    materialRegionRegressionThreshold: 0.01,
    pass: {
      id: 'pass-001',
      parentId: 'baseline',
      revision: { kind: 'working-tree', value: 'revision:pass-001' },
      focusedChange: 'Align the header geometry.',
      fullDiff: 0.48,
      weightedDiff: 0.43,
      regions: {
        header_full: 0.36,
        sidebar_full: 0.51,
        composer: 0.29,
      },
      worstRegion: { name: 'sidebar_full', diffRatio: 0.51 },
      decision: 'kept',
      regressions: [],
      evidence: evidence(1),
    },
  });
  assert.doesNotThrow(() => appendPass(sourceLedger, result.pass));
  assert.deepEqual(sourceLedger, beforeLedger);
  assert.deepEqual(sourceCandidate, beforeCandidate);
});

test('rejects stale, missing, rejected, and duplicate parent lineage', () => {
  const first = keptPass('pass-001', 'baseline');
  const second = keptPass('pass-002', 'pass-001', {
    fullDiff: 0.46,
    weightedDiff: 0.41,
    regions: { header_full: 0.36, sidebar_full: 0.48, composer: 0.28 },
    worstRegion: { name: 'sidebar_full', diffRatio: 0.48 },
    evidence: evidence(2),
  });
  const current = ledger({ passes: [first, second] });

  assert.deepEqual(
    decideMeasuredPass(current, candidate({ id: 'pass-001', parentId: 'pass-002' })).reasons,
    ['duplicate-pass-id:pass-001'],
  );
  assert.deepEqual(
    decideMeasuredPass(current, candidate({ id: 'pass-003', parentId: 'missing' })).reasons,
    ['missing-parent:missing'],
  );
  assert.deepEqual(
    decideMeasuredPass(current, candidate({ id: 'pass-003', parentId: 'pass-001' })).reasons,
    ['stale-parent:pass-001:expected:pass-002'],
  );

  const withRejected = ledger({
    passes: [
      first,
      {
        ...keptPass('pass-002', 'pass-001'),
        decision: 'rejected',
        fullDiff: 0.49,
        weightedDiff: 0.44,
        regressions: ['full-page-regression'],
      },
    ],
  });
  assert.deepEqual(
    decideMeasuredPass(withRejected, candidate({ id: 'pass-003', parentId: 'pass-002' })).reasons,
    ['rejected-parent:pass-002'],
  );
});

test('rejects non-improving scores, material neighboring regressions, and functional regressions', () => {
  const result = decideMeasuredPass(
    ledger(),
    candidate({
      functionalRegressions: ['composer submit no longer works'],
      comparison: {
        ...candidate().comparison,
        full: { diffRatio: 0.51 },
        weightedRegionDiffRatio: 0.45,
        regions: {
          header_full: { diffRatio: 0.35 },
          sidebar_full: { diffRatio: 0.531 },
          composer: { diffRatio: 0.29 },
        },
      },
    }),
  );

  assert.equal(result.decision, 'rejected');
  assert.deepEqual(result.reasons, [
    'full-diff-not-improved:0.51>=0.5',
    'weighted-diff-not-improved:0.45>=0.45',
    'material-region-regression:sidebar_full:+0.011>0.01',
    'functional-regression:composer submit no longer works',
  ]);
  assert.deepEqual(result.pass.regressions, result.reasons);
});

test('material regression threshold is configurable, inclusive, and bounded', () => {
  const boundary = candidate({
    comparison: {
      ...candidate().comparison,
      regions: {
        ...candidate().comparison.regions,
        sidebar_full: { diffRatio: 0.53 },
      },
    },
  });
  assert.equal(decideMeasuredPass(ledger(), boundary).decision, 'kept');
  assert.equal(
    decideMeasuredPass(ledger(), boundary, {
      materialRegionRegressionThreshold: 0.009,
    }).decision,
    'rejected',
  );

  for (const value of [-0.001, 1.001, Number.NaN, '0.01']) {
    assert.deepEqual(
      decideMeasuredPass(ledger(), candidate(), {
        materialRegionRegressionThreshold: value,
      }).reasons,
      ['invalid-policy:materialRegionRegressionThreshold'],
    );
  }
});

test('derives the truthful worst region and rejects incomplete or malformed comparison evidence', () => {
  const wrongWorstClaim = candidate({ worstRegion: { name: 'header_full', diffRatio: 0 } });
  assert.deepEqual(decideMeasuredPass(ledger(), wrongWorstClaim).pass.worstRegion, {
    name: 'sidebar_full',
    diffRatio: 0.51,
  });

  const missingHash = candidate();
  delete missingHash.evidence.overlaySha256;
  assert.deepEqual(decideMeasuredPass(ledger(), missingHash).reasons, [
    'invalid-candidate:evidence.overlaySha256',
  ]);

  const malicious = candidate({
    comparison: {
      ...candidate().comparison,
      passId: 'different-pass',
      weightedRegionDiffRatio: Number.NaN,
      regions: {
        header_full: { diffRatio: Number.POSITIVE_INFINITY },
        sidebar_full: { diffRatio: 0.2 },
        extra_region: { diffRatio: 0.1 },
      },
    },
  });
  assert.deepEqual(decideMeasuredPass(ledger(), malicious).reasons, [
    'comparison-pass-id-mismatch:different-pass:expected:pass-001',
    'invalid-comparison:weightedRegionDiffRatio',
    'invalid-comparison:regions.header_full.diffRatio',
    'comparison-region-set-mismatch',
  ]);

  const nonFiniteFull = candidate({
    comparison: {
      ...candidate().comparison,
      full: { diffRatio: Number.NEGATIVE_INFINITY },
    },
  });
  assert.deepEqual(decideMeasuredPass(ledger(), nonFiniteFull).reasons, [
    'invalid-comparison:full.diffRatio',
  ]);
});

test('requires reassessment before a thirteenth consecutive measured pass', () => {
  const passes = [];
  let parentId = 'baseline';
  let fullDiff = 0.5;
  let weightedDiff = 0.45;
  for (let index = 1; index <= 12; index += 1) {
    const id = `pass-${String(index).padStart(3, '0')}`;
    fullDiff -= 0.01;
    weightedDiff -= 0.01;
    passes.push(
      keptPass(id, parentId, {
        fullDiff,
        weightedDiff,
        regions: {
          header_full: 0.4 - index * 0.005,
          sidebar_full: 0.52 - index * 0.005,
          composer: 0.3 - index * 0.005,
        },
        worstRegion: { name: 'sidebar_full', diffRatio: 0.52 - index * 0.005 },
      }),
    );
    parentId = id;
  }
  const current = ledger({ passes });
  const next = candidate({
    id: 'pass-013',
    parentId,
    comparison: {
      ...candidate().comparison,
      passId: 'pass-013',
      revision: 'revision:pass-013',
      full: { diffRatio: fullDiff - 0.01 },
      weightedRegionDiffRatio: weightedDiff - 0.01,
      regions: {
        header_full: { diffRatio: 0.33 },
        sidebar_full: { diffRatio: 0.45 },
        composer: { diffRatio: 0.23 },
      },
    },
  });

  const blocked = decideMeasuredPass(current, next);
  assert.equal(blocked.decision, 'rejected');
  assert.equal(blocked.reassessmentRequired, true);
  assert.deepEqual(blocked.reasons, ['reassessment-required-after:pass-012']);

  const reassessed = {
    ...current,
    reassessments: [
      {
        afterPassId: 'pass-012',
        revision: { kind: 'working-tree', value: 'reassessment:001' },
        reason: 'Reassess after twelve passes.',
        nextFocus: 'Continue with the highest-weight mismatch.',
      },
    ],
  };
  assert.equal(decideMeasuredPass(reassessed, next).decision, 'kept');
});

test('fails closed for malformed ledgers and hostile input accessors', () => {
  assert.deepEqual(decideMeasuredPass(null, candidate()).reasons, ['invalid-ledger']);

  const hostile = candidate();
  Object.defineProperty(hostile, 'focusedChange', {
    enumerable: true,
    get() {
      throw new Error('hostile accessor');
    },
  });
  assert.deepEqual(decideMeasuredPass(ledger(), hostile).reasons, ['invalid-candidate']);
});
