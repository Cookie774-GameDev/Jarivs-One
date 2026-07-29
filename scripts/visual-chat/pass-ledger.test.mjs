import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendPass,
  createPassLedger,
  recordReassessment,
  validatePassLedger,
} from './pass-ledger.mjs';

const hash = (character) => character.repeat(64);

function evidence(offset = 0) {
  const characters = ['a', 'b', 'c', 'd', 'e', 'f'];
  return {
    screenshotSha256: hash(characters[offset]),
    reportSha256: hash(characters[offset + 1]),
    diffSha256: hash(characters[offset + 2]),
    overlaySha256: hash(characters[offset + 3]),
  };
}

function baseline(overrides = {}) {
  return {
    revision: { kind: 'commit', value: '8bd1e58cdb1ed6661eebe8d9afc3f1b86ae75696' },
    fullDiff: 0.5,
    weightedDiff: 0.45,
    regions: {
      header_full: 0.4,
      sidebar_full: 0.52,
    },
    evidence: evidence(),
    ...overrides,
  };
}

function pass(id = 'pass-001', overrides = {}) {
  return {
    id,
    parentId: 'baseline',
    revision: { kind: 'working-tree', value: `working-tree:${id}` },
    focusedChange: 'Align the header and sidebar geometry.',
    fullDiff: 0.48,
    weightedDiff: 0.43,
    regions: {
      header_full: 0.38,
      sidebar_full: 0.5,
    },
    worstRegion: { name: 'sidebar_full', diffRatio: 0.5 },
    decision: 'kept',
    regressions: [],
    evidence: evidence(1),
    ...overrides,
  };
}

test('creates and validates a ledger with kept and rejected measured passes', () => {
  const initial = createPassLedger(baseline());
  const kept = appendPass(initial, pass());
  const rejected = appendPass(
    kept,
    pass('pass-002', {
      parentId: 'pass-001',
      fullDiff: 0.49,
      weightedDiff: 0.44,
      focusedChange: 'Test a stronger paper texture.',
      decision: 'rejected',
      regressions: ['paper_closeup neighboring region worsened'],
    }),
  );

  assert.deepEqual(validatePassLedger(rejected), rejected);
  assert.deepEqual(initial.passes, []);
  assert.deepEqual(
    kept.passes.map(({ id }) => id),
    ['pass-001'],
  );
  assert.deepEqual(
    rejected.passes.map(({ id, decision }) => [id, decision]),
    [
      ['pass-001', 'kept'],
      ['pass-002', 'rejected'],
    ],
  );
});

test('rejects duplicate pass IDs', () => {
  const ledger = appendPass(createPassLedger(baseline()), pass());

  assert.throws(() => appendPass(ledger, pass()), /duplicate pass id.*pass-001/i);
});

test('rejects missing, forward, and rejected parent passes', () => {
  const initial = createPassLedger(baseline());
  assert.throws(
    () => appendPass(initial, pass('pass-002', { parentId: 'pass-001' })),
    /parent.*pass-001.*does not exist/i,
  );

  const kept = appendPass(initial, pass());
  const rejected = appendPass(
    kept,
    pass('pass-002', {
      parentId: 'pass-001',
      decision: 'rejected',
      fullDiff: 0.49,
      weightedDiff: 0.44,
    }),
  );
  assert.throws(
    () => appendPass(rejected, pass('pass-003', { parentId: 'pass-002' })),
    /parent.*pass-002.*rejected/i,
  );
});

test('rejects non-finite and out-of-range baseline and pass scores', () => {
  for (const [label, value] of [
    ['NaN', Number.NaN],
    ['positive infinity', Number.POSITIVE_INFINITY],
    ['negative score', -0.01],
    ['score above one', 1.01],
  ]) {
    assert.throws(
      () => createPassLedger(baseline({ fullDiff: value })),
      /baseline\.fullDiff.*finite number between 0 and 1/i,
      label,
    );
  }

  const ledger = createPassLedger(baseline());
  assert.throws(
    () => appendPass(ledger, pass('pass-001', { weightedDiff: Number.NaN })),
    /pass-001\.weightedDiff.*finite number between 0 and 1/i,
  );
  assert.throws(
    () =>
      appendPass(
        ledger,
        pass('pass-001', {
          regions: { header_full: 0.38, sidebar_full: Number.POSITIVE_INFINITY },
        }),
      ),
    /pass-001\.regions\.sidebar_full.*finite number between 0 and 1/i,
  );
});

test('keeps a pass only when both scores strictly improve without regressions', () => {
  const ledger = createPassLedger(baseline());
  const invalidPasses = [
    pass('pass-full-equal', { fullDiff: 0.5 }),
    pass('pass-weighted-equal', { weightedDiff: 0.45 }),
    pass('pass-regression', { regressions: ['composer controls moved'] }),
  ];

  for (const entry of invalidPasses) {
    assert.throws(
      () => appendPass(ledger, entry),
      /kept pass.*strictly improve.*without regressions/i,
      entry.id,
    );
  }

  assert.doesNotThrow(() =>
    appendPass(
      ledger,
      pass('pass-rejected', {
        decision: 'rejected',
        fullDiff: 0.55,
        weightedDiff: 0.51,
        regressions: ['assistant_message neighboring region worsened'],
      }),
    ),
  );
});

test('requires complete SHA-256 evidence and the actual worst measured region', () => {
  const ledger = createPassLedger(baseline());
  const missingHash = evidence(1);
  delete missingHash.overlaySha256;

  assert.throws(
    () => appendPass(ledger, pass('pass-missing-hash', { evidence: missingHash })),
    /overlaySha256.*64-character/i,
  );
  assert.throws(
    () =>
      appendPass(
        ledger,
        pass('pass-invalid-hash', {
          evidence: { ...evidence(1), reportSha256: 'not-a-sha256' },
        }),
      ),
    /reportSha256.*64-character/i,
  );
  assert.throws(
    () =>
      appendPass(
        ledger,
        pass('pass-wrong-region', {
          worstRegion: { name: 'header_full', diffRatio: 0.38 },
        }),
      ),
    /worstRegion.*maximum measured region/i,
  );
});

function appendImprovingPasses(ledger, count) {
  let next = ledger;
  for (let index = 1; index <= count; index += 1) {
    const id = `pass-${String(index).padStart(3, '0')}`;
    next = appendPass(
      next,
      pass(id, {
        parentId: index === 1 ? 'baseline' : `pass-${String(index - 1).padStart(3, '0')}`,
        fullDiff: 0.5 - index * 0.01,
        weightedDiff: 0.45 - index * 0.01,
      }),
    );
  }
  return next;
}

test('requires a recorded reassessment before a thirteenth consecutive pass', () => {
  const twelvePasses = appendImprovingPasses(createPassLedger(baseline()), 12);
  const thirteenth = pass('pass-013', {
    parentId: 'pass-012',
    fullDiff: 0.37,
    weightedDiff: 0.32,
  });

  assert.throws(
    () => appendPass(twelvePasses, thirteenth),
    /more than 12 passes without reassessment/i,
  );

  const reassessed = recordReassessment(twelvePasses, {
    afterPassId: 'pass-012',
    revision: { kind: 'working-tree', value: 'working-tree:reassessment-001' },
    reason: 'The remaining mismatch is concentrated in folded paper silhouettes.',
    nextFocus: 'Reassess the asset silhouettes before another measured pass.',
  });
  assert.doesNotThrow(() => appendPass(reassessed, thirteenth));
});
