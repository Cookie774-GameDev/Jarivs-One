import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { appendPass, createPassLedger, validateFinalMetadata } from './pass-ledger.mjs';
import {
  buildFinalMetadata,
  materializeFinalMetadata,
  serializeFinalMetadata,
} from './finalize-metadata.mjs';

const hash = (character) => character.repeat(64);
const sha256Of = (value) => createHash('sha256').update(value).digest('hex');

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

function makeContract() {
  return {
    viewport: { width: 1672, height: 941, deviceScaleFactor: 1, browserZoomPercent: 100 },
    regions: [{ name: 'header_full' }, { name: 'sidebar_full' }],
  };
}

function makeBaseline(overrides = {}) {
  return {
    revision: { kind: 'commit', value: '8bd1e58cdb1ed6661eebe8d9afc3f1b86ae75696' },
    fullDiff: 0.5,
    weightedDiff: 0.45,
    regions: { header_full: 0.4, sidebar_full: 0.52 },
    evidence: baselineEvidence,
    ...overrides,
  };
}

function makeKeptPass(overrides = {}) {
  return {
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
    ...overrides,
  };
}

function makeLedger() {
  return appendPass(createPassLedger(makeBaseline()), makeKeptPass());
}

function makeInputs(overrides = {}) {
  return {
    ledger: makeLedger(),
    contract: makeContract(),
    route: 'http://127.0.0.1:4173/chat',
    referenceTargetSha256: hash('3'),
    passLedgerSha256: hash('4'),
    ...overrides,
  };
}

function makeTempRepo() {
  return mkdtempSync(join(tmpdir(), 'finalize-metadata-'));
}

function writeLedgerFile(root, ledger) {
  const serialized = `${JSON.stringify(ledger, null, 2)}\n`;
  const ledgerPath = join(root, 'pass-ledger.json');
  writeFileSync(ledgerPath, serialized);
  return { ledgerPath, ledgerBytes: Buffer.from(serialized, 'utf8') };
}

function writeReferenceTarget(root, body = 'reference-target-bytes') {
  const referenceTargetPath = join(root, 'target-chat.png');
  writeFileSync(referenceTargetPath, body);
  return referenceTargetPath;
}

test('builds deterministic metadata bound exactly to explicit ledger, contract, and hashes', () => {
  const metadata = buildFinalMetadata(makeInputs());

  assert.deepEqual(metadata, {
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
      viewport: { width: 1672, height: 941, deviceScaleFactor: 1, browserZoomPercent: 100 },
      fullDiff: 0.42,
      weightedDiff: 0.38,
      regions: { header_full: 0.34, sidebar_full: 0.44 },
      evidence: finalEvidence,
    },
  });

  assert.equal(
    validateFinalMetadata(metadata, { ledger: makeLedger(), contract: makeContract() }),
    metadata,
  );
});

test('derives pass counts from a multi-pass ledger and selects the last kept pass as final', () => {
  const ledger = appendPass(
    appendPass(
      appendPass(createPassLedger(makeBaseline()), {
        ...makeKeptPass(),
        id: 'pass-001',
        decision: 'rejected',
        regressions: ['Full-page score regressed.'],
        fullDiff: 0.6,
        weightedDiff: 0.55,
        regions: { header_full: 0.5, sidebar_full: 0.6 },
        worstRegion: { name: 'sidebar_full', diffRatio: 0.6 },
        evidence: {
          screenshotSha256: hash('9'),
          reportSha256: hash('8'),
          diffSha256: hash('7'),
          overlaySha256: hash('6'),
        },
      }),
      {
        ...makeKeptPass(),
        id: 'pass-002',
        fullDiff: 0.44,
        weightedDiff: 0.4,
        regions: { header_full: 0.36, sidebar_full: 0.46 },
        worstRegion: { name: 'sidebar_full', diffRatio: 0.46 },
      },
    ),
    {
      ...makeKeptPass(),
      id: 'pass-003',
      parentId: 'pass-002',
      fullDiff: 0.4,
      weightedDiff: 0.36,
      regions: { header_full: 0.32, sidebar_full: 0.42 },
      worstRegion: { name: 'sidebar_full', diffRatio: 0.42 },
      evidence: {
        screenshotSha256: hash('5'),
        reportSha256: hash('4'),
        diffSha256: hash('3'),
        overlaySha256: hash('2'),
      },
    },
  );

  const metadata = buildFinalMetadata(makeInputs({ ledger }));

  assert.equal(metadata.passCount, 3);
  assert.equal(metadata.keptPassCount, 2);
  assert.equal(metadata.rejectedPassCount, 1);
  assert.equal(metadata.final.fullDiff, 0.4);
  assert.equal(metadata.final.weightedDiff, 0.36);
  assert.deepEqual(metadata.final.evidence, {
    screenshotSha256: hash('5'),
    reportSha256: hash('4'),
    diffSha256: hash('3'),
    overlaySha256: hash('2'),
  });
  assert.equal(validateFinalMetadata(metadata, { ledger, contract: makeContract() }), metadata);
});

test('falls back to the baseline measurement when no pass was kept', () => {
  const ledger = appendPass(createPassLedger(makeBaseline()), {
    ...makeKeptPass(),
    decision: 'rejected',
    regressions: ['No improvement.'],
    fullDiff: 0.6,
    weightedDiff: 0.55,
    regions: { header_full: 0.5, sidebar_full: 0.6 },
    worstRegion: { name: 'sidebar_full', diffRatio: 0.6 },
  });

  const metadata = buildFinalMetadata(makeInputs({ ledger }));

  assert.equal(metadata.keptPassCount, 0);
  assert.equal(metadata.final.fullDiff, 0.5);
  assert.equal(metadata.final.weightedDiff, 0.45);
  assert.deepEqual(metadata.final.evidence, baselineEvidence);
  assert.equal(validateFinalMetadata(metadata, { ledger, contract: makeContract() }), metadata);
});

test('serializes byte-identical output for logically identical inputs with reordered regions', () => {
  const ordered = serializeFinalMetadata(buildFinalMetadata(makeInputs()));
  const reorderedLedger = appendPass(
    createPassLedger(makeBaseline({ regions: { sidebar_full: 0.52, header_full: 0.4 } })),
    makeKeptPass({ regions: { sidebar_full: 0.44, header_full: 0.34 } }),
  );
  const reordered = serializeFinalMetadata(
    buildFinalMetadata(makeInputs({ ledger: reorderedLedger })),
  );

  assert.equal(reordered, ordered);
  assert.ok(ordered.endsWith('}\n'));
  assert.ok(ordered.includes('\n  "schemaVersion": 1,'));
  const baselineHeader = ordered.indexOf('"header_full"', ordered.indexOf('"baseline"'));
  const baselineSidebar = ordered.indexOf('"sidebar_full"', ordered.indexOf('"baseline"'));
  assert.ok(baselineHeader > -1 && baselineSidebar > baselineHeader, 'regions are sorted');
});

test('rejects missing required inputs', () => {
  const cases = [
    ['ledger', { ledger: undefined }, /ledger/i],
    ['contract', { contract: undefined }, /contract/i],
    ['route', { route: undefined }, /route/i],
    ['referenceTargetSha256', { referenceTargetSha256: undefined }, /referenceTargetSha256/i],
    ['passLedgerSha256', { passLedgerSha256: undefined }, /passLedgerSha256/i],
  ];
  for (const [label, overrides, expected] of cases) {
    assert.throws(() => buildFinalMetadata(makeInputs(overrides)), expected, label);
  }
});

test('rejects malformed reference and ledger hashes', () => {
  const cases = [
    ['uppercase reference hash', { referenceTargetSha256: hash('A') }, /64-character/i],
    ['short reference hash', { referenceTargetSha256: 'abc123' }, /64-character/i],
    ['uppercase ledger hash', { passLedgerSha256: hash('B') }, /64-character/i],
    ['non-string ledger hash', { passLedgerSha256: 42 }, /64-character/i],
  ];
  for (const [label, overrides, expected] of cases) {
    assert.throws(() => buildFinalMetadata(makeInputs(overrides)), expected, label);
  }
});

test('rejects nonlocal or malformed routes', () => {
  const routes = [
    'https://attacker.example/chat',
    'http://remote-host.example/chat',
    'ftp://127.0.0.1/chat',
    'not-a-url',
    ' http://127.0.0.1:4173/chat',
  ];
  for (const route of routes) {
    assert.throws(() => buildFinalMetadata(makeInputs({ route })), /route.*local HTTP/i, route);
  }
});

test('rejects partial or missing evidence in the ledger', () => {
  const ledger = createPassLedger(makeBaseline());
  ledger.baseline.evidence = {
    screenshotSha256: hash('a'),
    reportSha256: hash('b'),
    diffSha256: hash('c'),
  };
  assert.throws(() => buildFinalMetadata(makeInputs({ ledger })), /evidence/i);
});

test('rejects stale or mismatched computed artifact evidence', () => {
  const staleBaseline = {
    baseline: {
      screenshotSha256: hash('9'),
      reportSha256: hash('b'),
      diffSha256: hash('c'),
      overlaySha256: hash('d'),
    },
  };
  assert.throws(
    () => buildFinalMetadata(makeInputs({ computedEvidence: staleBaseline })),
    /computedEvidence\.baseline.*stale or mismatched/i,
  );

  const staleFinal = {
    final: {
      screenshotSha256: hash('e'),
      reportSha256: hash('f'),
      diffSha256: hash('1'),
      overlaySha256: hash('9'),
    },
  };
  assert.throws(
    () => buildFinalMetadata(makeInputs({ computedEvidence: staleFinal })),
    /computedEvidence\.final.*stale or mismatched/i,
  );
});

test('rejects a ledger whose regions do not match the reference contract', () => {
  const ledger = appendPass(
    createPassLedger(makeBaseline({ regions: { header_full: 0.4, off_contract: 0.5 } })),
    makeKeptPass({
      regions: { header_full: 0.34, off_contract: 0.44 },
      worstRegion: { name: 'off_contract', diffRatio: 0.44 },
    }),
  );
  assert.throws(() => buildFinalMetadata(makeInputs({ ledger })), /regions.*reference contract/i);
});

test('fails closed when the final measurement does not improve the baseline', () => {
  const ledger = {
    schemaVersion: 1,
    maximumPassesBeforeReassessment: 12,
    baseline: makeBaseline(),
    passes: [
      {
        ...makeKeptPass(),
        fullDiff: 0.5,
        weightedDiff: 0.45,
        regions: { header_full: 0.4, sidebar_full: 0.52 },
        worstRegion: { name: 'sidebar_full', diffRatio: 0.52 },
      },
    ],
    reassessments: [],
  };
  assert.throws(() => buildFinalMetadata(makeInputs({ ledger })), /improve|kept pass/i);
});

test('rejects unknown builder options', () => {
  assert.throws(
    () => buildFinalMetadata(makeInputs({ unexpected: true })),
    /Unknown final metadata option: unexpected/i,
  );
});

test('materializes from explicit ledger and reference target files with present hashes', () => {
  const root = makeTempRepo();
  try {
    const ledger = makeLedger();
    const { ledgerPath, ledgerBytes } = writeLedgerFile(root, ledger);
    const referenceTargetPath = writeReferenceTarget(root);
    const destinationPath = join(root, 'final-metadata.json');

    const receipt = materializeFinalMetadata({
      repositoryRoot: root,
      ledgerPath,
      contract: makeContract(),
      referenceTargetPath,
      route: 'http://127.0.0.1:4173/chat',
      destinationPath,
    });

    const written = readFileSync(destinationPath, 'utf8');
    assert.equal(written, serializeFinalMetadata(receipt.metadata));
    assert.equal(receipt.passLedgerSha256, sha256Of(ledgerBytes));
    assert.equal(receipt.referenceTargetSha256, sha256Of(Buffer.from('reference-target-bytes')));
    assert.equal(
      validateFinalMetadata(receipt.metadata, { ledger, contract: makeContract() }),
      receipt.metadata,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('produces byte-identical files for repeated identical materialization inputs', () => {
  const root = makeTempRepo();
  try {
    const ledger = makeLedger();
    const { ledgerPath } = writeLedgerFile(root, ledger);
    const referenceTargetPath = writeReferenceTarget(root);
    const first = join(root, 'first.json');
    const second = join(root, 'second.json');
    const options = {
      repositoryRoot: root,
      ledgerPath,
      contract: makeContract(),
      referenceTargetPath,
      route: 'http://127.0.0.1:4173/chat',
    };

    materializeFinalMetadata({ ...options, destinationPath: first });
    materializeFinalMetadata({ ...options, destinationPath: second });

    assert.equal(readFileSync(second, 'utf8'), readFileSync(first, 'utf8'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('refuses to overwrite an existing destination without an explicit replace policy', () => {
  const root = makeTempRepo();
  try {
    const ledger = makeLedger();
    const { ledgerPath } = writeLedgerFile(root, ledger);
    const referenceTargetPath = writeReferenceTarget(root);
    const destinationPath = join(root, 'final-metadata.json');
    writeFileSync(destinationPath, 'pre-existing content\n');
    const options = {
      repositoryRoot: root,
      ledgerPath,
      contract: makeContract(),
      referenceTargetPath,
      route: 'http://127.0.0.1:4173/chat',
      destinationPath,
    };

    assert.throws(() => materializeFinalMetadata(options), /Refusing to overwrite/i);
    assert.equal(readFileSync(destinationPath, 'utf8'), 'pre-existing content\n');

    const receipt = materializeFinalMetadata({ ...options, overwrite: 'replace' });
    assert.equal(readFileSync(destinationPath, 'utf8'), serializeFinalMetadata(receipt.metadata));

    assert.throws(
      () => materializeFinalMetadata({ ...options, overwrite: 'always' }),
      /Unknown overwrite policy/i,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects path-escaping ledger, reference target, and destination inputs', () => {
  const root = makeTempRepo();
  try {
    const ledger = makeLedger();
    const { ledgerPath } = writeLedgerFile(root, ledger);
    const referenceTargetPath = writeReferenceTarget(root);
    const outside = join(root, '..', 'escaped.json');
    const base = {
      repositoryRoot: root,
      ledgerPath,
      contract: makeContract(),
      referenceTargetPath,
      route: 'http://127.0.0.1:4173/chat',
      destinationPath: join(root, 'out.json'),
    };

    assert.throws(
      () => materializeFinalMetadata({ ...base, ledgerPath: outside }),
      /escapes repositoryRoot/i,
      'ledgerPath',
    );
    assert.throws(
      () => materializeFinalMetadata({ ...base, referenceTargetPath: outside }),
      /escapes repositoryRoot/i,
      'referenceTargetPath',
    );
    assert.throws(
      () => materializeFinalMetadata({ ...base, destinationPath: outside }),
      /escapes repositoryRoot/i,
      'destinationPath',
    );
    assert.throws(
      () =>
        materializeFinalMetadata({
          ...base,
          ledgerPath: 'C:\\Windows\\System32\\drivers\\etc\\hosts',
        }),
      /escapes repositoryRoot/i,
      'absolute ledgerPath',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects an outside reference root before attempting to load it', () => {
  const root = makeTempRepo();
  try {
    const { ledgerPath } = writeLedgerFile(root, makeLedger());
    const outsideReferenceRoot = join(root, '..', `outside-reference-${process.pid}`);

    assert.throws(
      () =>
        materializeFinalMetadata({
          repositoryRoot: root,
          ledgerPath,
          referenceRoot: outsideReferenceRoot,
          route: 'http://127.0.0.1:4173/chat',
          destinationPath: join(root, 'out.json'),
        }),
      /referenceRoot escapes repositoryRoot/i,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects a reference root reached through a link that resolves outside the repository', (t) => {
  const root = makeTempRepo();
  const outside = makeTempRepo();
  try {
    const { ledgerPath } = writeLedgerFile(root, makeLedger());
    const outsideReferenceRoot = join(outside, 'reference');
    const linkedParent = join(root, 'linked-parent');
    mkdirSync(outsideReferenceRoot);
    try {
      symlinkSync(outside, linkedParent, 'junction');
    } catch {
      t.skip('directory link creation is not permitted on this platform');
      return;
    }

    assert.throws(
      () =>
        materializeFinalMetadata({
          repositoryRoot: root,
          ledgerPath,
          referenceRoot: join(linkedParent, 'reference'),
          route: 'http://127.0.0.1:4173/chat',
          destinationPath: join(root, 'out.json'),
        }),
      /referenceRoot resolves outside repositoryRoot/i,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('rejects missing ledger or reference target files', () => {
  const root = makeTempRepo();
  try {
    const referenceTargetPath = writeReferenceTarget(root);
    assert.throws(
      () =>
        materializeFinalMetadata({
          repositoryRoot: root,
          ledgerPath: join(root, 'absent-ledger.json'),
          contract: makeContract(),
          referenceTargetPath,
          route: 'http://127.0.0.1:4173/chat',
          destinationPath: join(root, 'out.json'),
        }),
      /ledgerPath does not exist/i,
    );

    const { ledgerPath } = writeLedgerFile(root, makeLedger());
    assert.throws(
      () =>
        materializeFinalMetadata({
          repositoryRoot: root,
          ledgerPath,
          contract: makeContract(),
          referenceTargetPath: join(root, 'absent-target.png'),
          route: 'http://127.0.0.1:4173/chat',
          destinationPath: join(root, 'out.json'),
        }),
      /referenceTargetPath does not exist/i,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('verifies explicit artifact evidence against the ledger and fails closed on mismatch', () => {
  const root = makeTempRepo();
  try {
    const screenshotBody = 'screenshot-bytes';
    const reportBody = 'report-bytes';
    const diffBody = 'diff-bytes';
    const overlayBody = 'overlay-bytes';
    const evidence = {
      screenshotSha256: sha256Of(Buffer.from(screenshotBody)),
      reportSha256: sha256Of(Buffer.from(reportBody)),
      diffSha256: sha256Of(Buffer.from(diffBody)),
      overlaySha256: sha256Of(Buffer.from(overlayBody)),
    };
    const ledger = appendPass(
      createPassLedger(makeBaseline({ evidence })),
      makeKeptPass({ evidence }),
    );
    const { ledgerPath } = writeLedgerFile(root, ledger);
    const referenceTargetPath = writeReferenceTarget(root);
    const artifactPaths = {
      screenshot: join(root, 'chat.png'),
      report: join(root, 'report.json'),
      diff: join(root, 'diff.png'),
      overlay: join(root, 'overlay.png'),
    };
    writeFileSync(artifactPaths.screenshot, screenshotBody);
    writeFileSync(artifactPaths.report, reportBody);
    writeFileSync(artifactPaths.diff, diffBody);
    writeFileSync(artifactPaths.overlay, overlayBody);

    const receipt = materializeFinalMetadata({
      repositoryRoot: root,
      ledgerPath,
      contract: makeContract(),
      referenceTargetPath,
      route: 'http://127.0.0.1:4173/chat',
      destinationPath: join(root, 'out.json'),
      artifacts: { baseline: artifactPaths, final: artifactPaths },
    });
    assert.equal(receipt.metadata.baseline.evidence.screenshotSha256, evidence.screenshotSha256);

    const tampered = { ...artifactPaths, screenshot: referenceTargetPath };
    assert.throws(
      () =>
        materializeFinalMetadata({
          repositoryRoot: root,
          ledgerPath,
          contract: makeContract(),
          referenceTargetPath,
          route: 'http://127.0.0.1:4173/chat',
          destinationPath: join(root, 'out2.json'),
          artifacts: { baseline: tampered, final: artifactPaths },
        }),
      /computedEvidence\.baseline.*stale or mismatched/i,
    );

    const missing = { ...artifactPaths };
    delete missing.overlay;
    assert.throws(
      () =>
        materializeFinalMetadata({
          repositoryRoot: root,
          ledgerPath,
          contract: makeContract(),
          referenceTargetPath,
          route: 'http://127.0.0.1:4173/chat',
          destinationPath: join(root, 'out3.json'),
          artifacts: { baseline: missing },
        }),
      /overlay artifact path is required/i,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects a symlinked ledger path', (t) => {
  const root = makeTempRepo();
  try {
    const ledger = makeLedger();
    const { ledgerPath } = writeLedgerFile(root, ledger);
    const referenceTargetPath = writeReferenceTarget(root);
    const linkPath = join(root, 'link-ledger.json');
    try {
      symlinkSync(ledgerPath, linkPath);
    } catch {
      t.skip('symlink creation is not permitted on this platform');
      return;
    }
    assert.throws(
      () =>
        materializeFinalMetadata({
          repositoryRoot: root,
          ledgerPath: linkPath,
          contract: makeContract(),
          referenceTargetPath,
          route: 'http://127.0.0.1:4173/chat',
          destinationPath: join(root, 'out.json'),
        }),
      /symbolic link/i,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('requires either an explicit contract or a reference root', () => {
  const root = makeTempRepo();
  try {
    const { ledgerPath } = writeLedgerFile(root, makeLedger());
    const referenceTargetPath = writeReferenceTarget(root);
    assert.throws(
      () =>
        materializeFinalMetadata({
          repositoryRoot: root,
          ledgerPath,
          referenceTargetPath,
          route: 'http://127.0.0.1:4173/chat',
          destinationPath: join(root, 'out.json'),
        }),
      /requires either contract or referenceRoot/i,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects unknown materialization options', () => {
  assert.throws(
    () => materializeFinalMetadata({ repositoryRoot: makeTempRepo(), bogus: true }),
    /Unknown materialization option: bogus/i,
  );
});

test('module source has no shell, browser, or network side effects', () => {
  const source = readFileSync(
    fileURLToPath(new URL('./finalize-metadata.mjs', import.meta.url)),
    'utf8',
  );
  assert.ok(!/from\s+'node:child_process'/.test(source), 'no child_process import');
  assert.ok(
    !/\b(spawnSync|execSync|execFileSync|spawn|exec)\s*\(/.test(source),
    'no process spawn',
  );
  assert.ok(!/playwright|puppeteer|browser-launch|browserbase/i.test(source), 'no browser');
  assert.ok(!/from\s+'node:(net|http|https|dgram)'/.test(source), 'no network import');
});
