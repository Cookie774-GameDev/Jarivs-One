import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import * as baselineAuthority from './baseline-manifest.ts';
import {
  MONOCHROME_BASELINE_MANIFEST,
  validateMonochromeBaselineManifest,
} from './baseline-manifest.ts';
import { ORIGAMI_CHAT_FIXTURE } from '../chat/fixture-data.mjs';

const SOURCE_COMMIT = '7eb708e184ee4f054a49d3e70d73e80fd4eb97ae';
const HARNESS_COMMIT = '023844c789843e452aab7aad952f8392908d92de';
const ROUTE_MANIFEST_SHA256 = 'cf8f766056f9f5bb318d383394f14b5d4e11ec498fa55b1c47ef78f602a81796';
const FIXTURE_SOURCE_SHA256 = '5dfacca26708b83f8938bb75e0b63b8feb964bb741629bf66d96abbda6e2da4f';
const FIXTURE_MANIFEST_SHA256 = '5994a5ef08d14517e100c0c886f54478bab1fcb462abd0c17af4bb695a7a778e';
const EXPECTED_PATHS = [
  'tests/visual/monochrome/baselines/b0/default/chat.png',
  'tests/visual/monochrome/baselines/b0/default/settings-appearance.png',
  'tests/visual/monochrome/baselines/b0/default/terminal-workbench.png',
  'tests/visual/monochrome/baselines/b0/jarvis/chat.png',
  'tests/visual/monochrome/baselines/b0/jarvis/settings-appearance.png',
  'tests/visual/monochrome/baselines/b0/jarvis/terminal-workbench.png',
  'tests/visual/monochrome/baselines/b0/origami/chat.png',
  'tests/visual/monochrome/baselines/b0/vibespace/chat.png',
  'tests/visual/monochrome/baselines/b0/vibespace/settings-appearance.png',
  'tests/visual/monochrome/baselines/b0/vibespace/terminal-workbench.png',
] as const;

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function sha256Text(path: string): string {
  return createHash('sha256')
    .update(readFileSync(path, 'utf8').replaceAll('\r\n', '\n'))
    .digest('hex');
}

function sha256AtCommit(commit: string, path: string): string {
  const archivedSource = execFileSync('git', ['show', `${commit}:${path}`]);
  return createHash('sha256').update(archivedSource).digest('hex');
}

function discoverPngs(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? discoverPngs(entryPath) : [entryPath.replaceAll('\\', '/')];
    })
    .filter((entryPath) => entryPath.endsWith('.png'))
    .sort();
}

function shiftedOrigamiFixtureHash(): string {
  const fixture = structuredClone(ORIGAMI_CHAT_FIXTURE);
  const fixedClock = Date.parse('2026-07-16T12:00:00.000Z');
  const delta = fixedClock - fixture.clock;
  fixture.clock = fixedClock;
  const shift = (value: number): number => value + delta;
  for (const row of [
    fixture.workspace,
    fixture.project,
    fixture.chat,
    ...fixture.messages,
    ...fixture.agents,
    ...fixture.activity.runs,
    ...fixture.activity.events,
  ]) {
    if ('created_at' in row) row.created_at = shift(row.created_at);
    if ('updated_at' in row) row.updated_at = shift(row.updated_at);
    if ('started_at' in row) row.started_at = shift(row.started_at);
    if ('finished_at' in row && row.finished_at !== null) row.finished_at = shift(row.finished_at);
  }
  return createHash('sha256').update(JSON.stringify(fixture)).digest('hex');
}

test('B0 freezes exact source, harness, fixture, route, and environment authority', () => {
  const manifest = MONOCHROME_BASELINE_MANIFEST;
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.sourceCommit, SOURCE_COMMIT);
  assert.equal(manifest.harnessCommit, HARNESS_COMMIT);
  assert.equal(manifest.routeManifestSha256, ROUTE_MANIFEST_SHA256);
  assert.equal(manifest.fixtureSourceSha256, FIXTURE_SOURCE_SHA256);
  assert.equal(manifest.fixtureManifestSha256, FIXTURE_MANIFEST_SHA256);
  assert.deepEqual(manifest.viewport, { width: 1672, height: 941, deviceScaleFactor: 1 });
  assert.deepEqual(manifest.environment, {
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    fixedClock: '2026-07-16T12:00:00.000Z',
    fontReadiness: 'document.fonts.ready',
    stableLayout: 'three-consecutive-animation-frames',
    navigation: 'loopback-only',
    dataSource: 'isolated-synthetic-fixtures',
  });
  assert.deepEqual(manifest.ownedPaths, [
    'tests/visual/monochrome/baseline-manifest.test.ts',
    'tests/visual/monochrome/baseline-manifest.ts',
    ...EXPECTED_PATHS,
  ]);
});

test('B0 authority hashes are re-derived from the exact frozen files and capture fixture', () => {
  const manifest = MONOCHROME_BASELINE_MANIFEST;
  assert.equal(
    sha256AtCommit(manifest.harnessCommit, 'tests/visual/monochrome/route-manifest.ts'),
    manifest.routeManifestSha256,
  );
  assert.equal(sha256Text('tests/visual/monochrome/fixtures.ts'), manifest.fixtureSourceSha256);
  assert.equal(
    sha256Text('tests/visual/monochrome/fixture-manifest.ts'),
    manifest.fixtureManifestSha256,
  );
  assert.equal(
    sha256Text('tests/visual/chat/fixture-data.mjs'),
    manifest.origamiFixtureSourceSha256,
  );
  assert.equal(shiftedOrigamiFixtureHash(), manifest.captureFixtureSha256);
});

test('B0 contains the exact ten distinct capture identities in stable path order', () => {
  const captures = MONOCHROME_BASELINE_MANIFEST.captures;
  assert.equal(captures.length, 10);
  assert.deepEqual(
    captures.map(({ outputPath }) => outputPath),
    EXPECTED_PATHS,
  );
  assert.equal(new Set(captures.map(({ caseId }) => caseId)).size, captures.length);
  assert.deepEqual(
    captures.map(({ outputPath }) => outputPath),
    [...captures.map(({ outputPath }) => outputPath)].sort(),
  );

  const vibespaceChat = captures.find(({ caseId }) => caseId === 'vibespace-chat');
  const origamiChat = captures.find(({ caseId }) => caseId === 'origami-chat');
  assert.ok(vibespaceChat);
  assert.ok(origamiChat);
  assert.equal(vibespaceChat.themeId, 'vibespace');
  assert.equal(origamiChat.themeId, 'vibespace');
  assert.equal(vibespaceChat.documentTheme, 'vibespace');
  assert.equal(origamiChat.documentTheme, 'vibespace');
  assert.equal(vibespaceChat.origamiGateActive, true);
  assert.equal(origamiChat.origamiGateActive, true);
  assert.equal(vibespaceChat.captureState, 'generic-mc0b-chat');
  assert.equal(origamiChat.captureState, 'frozen-origami-acceptance');
});

test('every B0 PNG exists, has locked dimensions, and matches its lowercase SHA-256', () => {
  for (const capture of MONOCHROME_BASELINE_MANIFEST.captures) {
    assert.equal(existsSync(capture.outputPath), true, capture.outputPath);
    const bytes = readFileSync(capture.outputPath);
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(bytes.readUInt32BE(16), 1672, capture.outputPath);
    assert.equal(bytes.readUInt32BE(20), 941, capture.outputPath);
    assert.match(capture.sha256, /^[a-f0-9]{64}$/u);
    assert.equal(sha256(capture.outputPath), capture.sha256, capture.outputPath);
    assert.equal(capture.fontReady, true);
    assert.equal(capture.stableLayout, true);
    assert.equal(capture.unexpectedPageErrors, 0);
  }
});

test('B0 validator fails closed on provenance, mapping, hash, and readiness drift', () => {
  assert.deepEqual(validateMonochromeBaselineManifest(MONOCHROME_BASELINE_MANIFEST), []);
  const first = MONOCHROME_BASELINE_MANIFEST.captures[0];
  const mutations = [
    { ...MONOCHROME_BASELINE_MANIFEST, sourceCommit: '0'.repeat(40) },
    { ...MONOCHROME_BASELINE_MANIFEST, harnessCommit: SOURCE_COMMIT },
    {
      ...MONOCHROME_BASELINE_MANIFEST,
      captures: [
        { ...first, sha256: '0'.repeat(64) },
        ...MONOCHROME_BASELINE_MANIFEST.captures.slice(1),
      ],
    },
    {
      ...MONOCHROME_BASELINE_MANIFEST,
      captures: [{ ...first, fontReady: false }, ...MONOCHROME_BASELINE_MANIFEST.captures.slice(1)],
    },
    {
      ...MONOCHROME_BASELINE_MANIFEST,
      captures: [
        { ...first, outputPath: MONOCHROME_BASELINE_MANIFEST.captures[1].outputPath },
        ...MONOCHROME_BASELINE_MANIFEST.captures.slice(1),
      ],
    },
  ];
  for (const mutation of mutations) {
    assert.notDeepEqual(validateMonochromeBaselineManifest(mutation), []);
  }
});

test('MC9 freezes one safe unique entry for each of the 111 current PNGs', () => {
  const manifest = baselineAuthority.MONOCHROME_MC9_BASELINE_MANIFEST;
  const validate = baselineAuthority.validateMonochromeMc9BaselineManifest;
  assert.ok(manifest, 'missing MC9 baseline manifest');
  assert.equal(typeof validate, 'function', 'missing MC9 baseline validator');
  if (!manifest || typeof validate !== 'function') return;

  const actualPaths = discoverPngs('tests/visual/monochrome/baselines/mc9');
  assert.equal(actualPaths.length, 111);
  assert.equal(manifest.expectedPngCount, 111);
  assert.equal(manifest.entries.length, 111);
  assert.deepEqual(validate(manifest, actualPaths), []);
  assert.equal(new Set(manifest.entries.map(({ id }) => id)).size, 111);
  assert.equal(new Set(manifest.entries.map(({ outputPath }) => outputPath)).size, 111);
  assert.deepEqual(
    manifest.entries.map(({ outputPath }) => outputPath),
    actualPaths,
  );
  assert.deepEqual(
    manifest.entries.map(({ outputPath }) => outputPath),
    [...manifest.entries.map(({ outputPath }) => outputPath)].sort(),
  );
  assert.equal(
    manifest.entries.every(
      ({ outputPath }) =>
        outputPath.startsWith('tests/visual/monochrome/baselines/mc9/') &&
        !outputPath.includes('\\') &&
        !outputPath.split('/').includes('..'),
    ),
    true,
  );

  const kinds = Object.groupBy(manifest.entries, ({ kind }) => kind);
  assert.equal(kinds['browser-surface']?.length, 79);
  assert.equal(kinds['named-state']?.length, 8);
  assert.equal(kinds.viewport?.length, 5);
  assert.equal(kinds['a11y-route']?.length, 18);
  assert.equal(kinds['forced-colors']?.length, 1);
});

test('MC9 validator rejects duplicate, missing, orphan, reordered, and unsafe entries', () => {
  const manifest = baselineAuthority.MONOCHROME_MC9_BASELINE_MANIFEST;
  const validate = baselineAuthority.validateMonochromeMc9BaselineManifest;
  assert.ok(manifest, 'missing MC9 baseline manifest');
  assert.equal(typeof validate, 'function', 'missing MC9 baseline validator');
  if (!manifest || typeof validate !== 'function') return;

  const actualPaths = discoverPngs('tests/visual/monochrome/baselines/mc9');
  const first = manifest.entries[0];
  assert.match(
    validate({ ...manifest, entries: [...manifest.entries, first] }, actualPaths).join('\n'),
    /duplicate|count|order|closure/iu,
  );
  assert.match(
    validate({ ...manifest, entries: manifest.entries.slice(1) }, actualPaths).join('\n'),
    /missing|count|closure/iu,
  );
  assert.match(
    validate({ ...manifest, entries: [...manifest.entries].reverse() }, actualPaths).join('\n'),
    /order|closure/iu,
  );
  assert.match(
    validate(
      {
        ...manifest,
        entries: [{ ...first, outputPath: '../escape.png' }, ...manifest.entries.slice(1)],
      },
      actualPaths,
    ).join('\n'),
    /unsafe|closure/iu,
  );
  assert.match(validate(manifest, actualPaths.slice(1)).join('\n'), /missing/iu);
  assert.match(
    validate(manifest, [...actualPaths, 'tests/visual/monochrome/baselines/mc9/orphan.png']).join(
      '\n',
    ),
    /orphan/iu,
  );
});
