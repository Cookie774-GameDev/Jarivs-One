import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  MONOCHROME_BASELINE_MANIFEST,
  MONOCHROME_MC9_BASELINE_MANIFEST,
  validateMonochromeMc9BaselineManifest,
} from '../../tests/visual/monochrome/baseline-manifest.ts';
import { MONOCHROME_NATIVE_WINDOW_MANIFEST } from '../../tests/visual/monochrome/native-window-manifest.ts';
import { MONOCHROME_ROUTE_COVERAGE_MANIFEST } from '../../tests/visual/monochrome/route-manifest.ts';
import { MONOCHROME_SHELL_OVERLAY_MANIFEST } from '../../tests/visual/monochrome/shell-overlay-manifest.ts';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const evidenceIndexPath = path.join(repoRoot, 'docs/appearance/monochrome/evidence-index.md');
const ledgerBlockPattern = /```json evidence-ledger\r?\n([\s\S]*?)\r?\n```/gu;
const baselineCommit = '10ade2cb205be6aae93e239e8debd9eaf584b6de';

const checkpointStatuses = new Map([
  ['MC8A-REFERENCE-CONTRACT', 'PASS'],
  ['MC8B-VIDEO-CALIBRATION', 'PASS'],
  ['MC9-STRUCTURAL-MANIFEST', 'PASS'],
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

const mc9StructuralCommand =
  'node --test tests/visual/monochrome/baseline-manifest.test.ts tests/visual/monochrome/fixture-manifest.test.ts tests/visual/monochrome/route-manifest.test.ts tests/visual/monochrome/shell-overlay-manifest.test.ts tests/visual/monochrome/native-window-manifest.test.ts';
const mc9StructuralEvidencePaths = [
  'tests/visual/monochrome/baseline-manifest.test.ts',
  'tests/visual/monochrome/baseline-manifest.ts',
  'tests/visual/monochrome/fixture-manifest.test.ts',
  'tests/visual/monochrome/fixture-manifest.ts',
  'tests/visual/monochrome/native-window-manifest.test.ts',
  'tests/visual/monochrome/native-window-manifest.ts',
  'tests/visual/monochrome/route-manifest.test.ts',
  'tests/visual/monochrome/route-manifest.ts',
  'tests/visual/monochrome/shell-overlay-manifest.test.ts',
  'tests/visual/monochrome/shell-overlay-manifest.ts',
];
const structuralModulePaths = [
  'package.json',
  'tests/visual/chat/fixture-data.mjs',
  ...mc9StructuralEvidencePaths,
  'tests/visual/monochrome/fixtures.ts',
];
const currentNativeSourcePaths = [
  'app/src-tauri/src/pets.rs',
  'app/src-tauri/src/preview.rs',
  'app/src-tauri/tauri.conf.json',
  'app/src/features/workbench/window.ts',
];
const currentRouteSourcePaths = [
  'app/src/components/layout/PageRouter.tsx',
  'app/src/features/settings/settingsPrefetch.ts',
  'app/src/stores/ui.ts',
  'docs/appearance/monochrome/route-coverage.md',
];
const sourceCommit = '7eb708e184ee4f054a49d3e70d73e80fd4eb97ae';
const harnessCommit = '023844c789843e452aab7aad952f8392908d92de';

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

async function discoverPngs(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? discoverPngs(entryPath) : [entryPath.replaceAll('\\', '/')];
    }),
  );
  return paths
    .flat()
    .filter((entryPath) => entryPath.endsWith('.png'))
    .sort();
}

function canonicalSha256(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').toUpperCase();
}

async function contentEntries(relativePaths) {
  return Promise.all(
    [...new Set(relativePaths)].sort().map(async (relativePath) => ({
      path: relativePath,
      sha256: await sha256(relativePath),
    })),
  );
}

function gitBytes(commitSha, relativePath) {
  return execFileSync('git', ['show', `${commitSha}:${relativePath}`], {
    cwd: repoRoot,
    encoding: 'buffer',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function gitContentEntries(inputs) {
  return [...new Map(inputs.map((input) => [`${input.commit}:${input.path}`, input])).values()]
    .sort(
      (left, right) =>
        left.commit.localeCompare(right.commit) || left.path.localeCompare(right.path),
    )
    .map(({ commit, path: relativePath }) => ({
      commit,
      path: relativePath,
      sha256: createHash('sha256')
        .update(gitBytes(commit, relativePath))
        .digest('hex')
        .toUpperCase(),
    }));
}

function filesAtCommit(commitSha, directory, extension) {
  return execFileSync('git', ['ls-tree', '-r', '--name-only', commitSha, directory], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .split(/\r?\n/u)
    .filter((relativePath) => relativePath.endsWith(extension))
    .sort();
}

async function currentFiles(directory, extension) {
  return (await readdir(path.join(repoRoot, ...directory.split('/'))))
    .filter((name) => name.endsWith(extension))
    .map((name) => `${directory}/${name}`)
    .sort();
}

function structuralWorkingTreePaths() {
  const routeAuthorityPaths = MONOCHROME_ROUTE_COVERAGE_MANIFEST.entries.flatMap(
    ({ sourcePaths, testPaths }) => [...sourcePaths, ...testPaths],
  );
  return [
    ...structuralModulePaths,
    ...currentNativeSourcePaths,
    ...currentRouteSourcePaths,
    ...routeAuthorityPaths,
  ];
}

function sourceCommitPaths() {
  return [
    'app/src/App.tsx',
    'app/src/components/layout/AppShell.tsx',
    'app/src/features/workbench/window.ts',
    ...MONOCHROME_NATIVE_WINDOW_MANIFEST.surfaces.map(({ sourcePath }) => sourcePath),
    ...MONOCHROME_SHELL_OVERLAY_MANIFEST.appRootSiblings.map(({ sourcePath }) => sourcePath),
    ...MONOCHROME_SHELL_OVERLAY_MANIFEST.surfaces.map(({ sourcePath }) => sourcePath),
  ];
}

async function canonicalStructuralInputManifest() {
  const workingTreeFiles = await contentEntries(structuralWorkingTreePaths());
  const b0PngContents = await contentEntries(
    MONOCHROME_BASELINE_MANIFEST.captures.map(({ outputPath }) => outputPath),
  );
  const currentCapabilityContents = await contentEntries(
    await currentFiles('app/src-tauri/capabilities', '.json'),
  );
  const mc9PngFilenames = (
    await discoverPngs(path.join(repoRoot, 'tests/visual/monochrome/baselines/mc9'))
  ).map((absolutePath) => path.relative(repoRoot, absolutePath).replaceAll('\\', '/'));
  const immutableGitFiles = gitContentEntries([
    {
      commit: harnessCommit,
      path: 'tests/visual/monochrome/route-manifest.ts',
    },
    ...sourceCommitPaths().map((relativePath) => ({
      commit: sourceCommit,
      path: relativePath,
    })),
    ...filesAtCommit(sourceCommit, 'app/src-tauri/capabilities', '.json').map((relativePath) => ({
      commit: sourceCommit,
      path: relativePath,
    })),
  ]);
  const immutableGitCommits = [
    harnessCommit,
    MONOCHROME_ROUTE_COVERAGE_MANIFEST.derivationCommit,
    sourceCommit,
  ].sort();

  return {
    schemaVersion: 1,
    command: mc9StructuralCommand,
    testedTreeKind: 'working_tree',
    workingTreeFiles,
    workingTreeContentSets: [
      {
        id: 'b0-png-content',
        root: 'tests/visual/monochrome/baselines/b0',
        entries: b0PngContents,
      },
      {
        id: 'current-capability-json-content',
        root: 'app/src-tauri/capabilities',
        entries: currentCapabilityContents,
      },
    ],
    workingTreeFilenameSets: [
      {
        id: 'mc9-png-filenames',
        root: 'tests/visual/monochrome/baselines/mc9',
        entries: mc9PngFilenames,
      },
    ],
    immutableGitCommits,
    immutableGitFiles,
  };
}

function summarizeStructuralInputManifest(manifest) {
  const groups = [
    {
      id: 'working-tree-files',
      mode: 'repository-relative-path-and-content-sha256',
      entryCount: manifest.workingTreeFiles.length,
      sha256: canonicalSha256(manifest.workingTreeFiles),
    },
    ...manifest.workingTreeContentSets.map(({ entries, id }) => ({
      id,
      mode: 'repository-relative-path-and-content-sha256',
      entryCount: entries.length,
      sha256: canonicalSha256(entries),
    })),
    ...manifest.workingTreeFilenameSets.map(({ entries, id }) => ({
      id,
      mode: 'repository-relative-filename-only',
      entryCount: entries.length,
      sha256: canonicalSha256(entries),
    })),
    {
      id: 'immutable-git-commits',
      mode: 'commit-object-identity',
      entryCount: manifest.immutableGitCommits.length,
      sha256: canonicalSha256(manifest.immutableGitCommits),
    },
    {
      id: 'immutable-git-files',
      mode: 'commit-path-and-content-sha256',
      entryCount: manifest.immutableGitFiles.length,
      sha256: canonicalSha256(manifest.immutableGitFiles),
    },
  ];
  return {
    schemaVersion: 1,
    kind: 'canonical-transitive-input-manifest',
    testedTreeKind: 'working_tree',
    canonicalization:
      'UTF-8 JSON; POSIX repository-relative paths; lexicographic order; uppercase SHA-256',
    entryCount: groups.reduce((sum, { entryCount }) => sum + entryCount, 0),
    groupCount: groups.length,
    aggregateSha256: canonicalSha256(manifest),
    groups,
  };
}

let structuralInputIdentityPromise;

function currentStructuralInputIdentity() {
  structuralInputIdentityPromise ??= canonicalStructuralInputManifest().then(
    summarizeStructuralInputManifest,
  );
  return structuralInputIdentityPromise;
}

async function validateMc9StructuralRecord(record) {
  assert.equal(record.id, 'MC9-STRUCTURAL-MANIFEST');
  assert.equal(record.status, 'PASS');
  assert.equal(record.command, mc9StructuralCommand);
  assert.equal(record.testedTreeKind, 'working_tree');
  const inputIdentity = await currentStructuralInputIdentity();
  assert.ok(
    record.inputIdentity && typeof record.inputIdentity === 'object',
    'MC9 structural record requires a canonical input identity',
  );
  const {
    capturedAtUtc,
    verifiedAtUtc,
    beforeAggregateSha256,
    afterAggregateSha256,
    ...recordedInputIdentity
  } = record.inputIdentity;
  assert.deepEqual(recordedInputIdentity, inputIdentity);
  assert.equal(beforeAggregateSha256, inputIdentity.aggregateSha256);
  assert.equal(afterAggregateSha256, inputIdentity.aggregateSha256);
  const capturedAt = parseUtc(capturedAtUtc, 'MC9-STRUCTURAL-MANIFEST.inputIdentity.capturedAtUtc');
  const verifiedAt = parseUtc(verifiedAtUtc, 'MC9-STRUCTURAL-MANIFEST.inputIdentity.verifiedAtUtc');
  const startedAt = parseUtc(record.startedAtUtc, 'MC9-STRUCTURAL-MANIFEST.startedAtUtc');
  const finishedAt = parseUtc(record.finishedAtUtc, 'MC9-STRUCTURAL-MANIFEST.finishedAtUtc');
  assert.ok(capturedAt <= startedAt, 'MC9 input capture must precede command start');
  assert.ok(finishedAt <= verifiedAt, 'MC9 input verification must follow command finish');
  assert.ok(startedAt - capturedAt <= 120_000, 'MC9 input capture must be fresh at command start');
  assert.ok(verifiedAt - finishedAt <= 120_000, 'MC9 input verification must be fresh at finish');
  assert.deepEqual(record.fixtureIds, ['frozen-b0-corpus', 'mc9-111-structural-corpus']);
  assert.deepEqual(record.fixtureHashes, [
    inputIdentity.groups.find(({ id }) => id === 'b0-png-content').sha256,
    inputIdentity.groups.find(({ id }) => id === 'mc9-png-filenames').sha256,
  ]);
  assert.deepEqual(
    record.evidence.map(({ path: evidencePath }) => evidencePath),
    mc9StructuralEvidencePaths,
  );
  assert.equal(new Set(record.evidence.map(({ path: evidencePath }) => evidencePath)).size, 10);
  const baselineResult = record.evidence.find(
    ({ path: evidencePath }) =>
      evidencePath === 'tests/visual/monochrome/baseline-manifest.test.ts',
  )?.result;
  assert.equal(
    baselineResult,
    '7 tests passed; MC9 declared and actual PNG closure is exactly 111 with no missing, orphan, duplicate, reordered, or unsafe path',
  );
  assert.doesNotMatch(JSON.stringify(record), /(?:b0-r1|browser pass|native pass|external pass)/iu);
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
    const workingTreeEvidence = record.testedTreeKind === 'working_tree';
    if (executed) {
      if (workingTreeEvidence) {
        assert.ok(
          record.id === 'MC8A-REFERENCE-CONTRACT' ||
            record.id === 'MC8B-VIDEO-CALIBRATION' ||
            record.id === 'MC9-STRUCTURAL-MANIFEST',
        );
        assert.equal(record.testedCommitSha, null);
      } else {
        assert.match(record.testedCommitSha, /^[0-9a-f]{40}$/u);
      }
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
      assert.equal(workingTreeEvidence, false);
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
        if (!workingTreeEvidence) {
          assert.equal(
            evidence.sha256,
            sha256AtCommit(record.testedCommitSha, evidence.path),
            `${record.id} evidence must match its immutable tested commit`,
          );
        }
        assert.equal(
          evidence.sha256,
          await sha256(evidence.path),
          `${record.id} accepted evidence must match the tested working tree`,
        );
      } else {
        assert.equal(executed, false, `${record.id} executed evidence requires a SHA-256`);
      }
    }
  }

  await validateMc9StructuralRecord(
    ledger.records.find(({ id }) => id === 'MC9-STRUCTURAL-MANIFEST'),
  );
  assert.deepEqual(
    ledger.records.filter(({ status }) => status === 'PASS').map(({ id }) => id),
    ['MC8A-REFERENCE-CONTRACT', 'MC8B-VIDEO-CALIBRATION', 'MC9-STRUCTURAL-MANIFEST'],
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

test('MC9 structural evidence closes exactly over the current 111 PNG authority', async () => {
  const actualPaths = await discoverPngs(
    path.join(repoRoot, 'tests/visual/monochrome/baselines/mc9'),
  );
  const repositoryRelativePaths = actualPaths.map((entryPath) =>
    path.relative(repoRoot, entryPath).replaceAll('\\', '/'),
  );
  assert.equal(MONOCHROME_BASELINE_MANIFEST.captures.length, 10);
  assert.deepEqual(
    MONOCHROME_BASELINE_MANIFEST.captures
      .filter(({ captureState }) => captureState === 'frozen-origami-acceptance')
      .map(({ caseId, origamiGateActive, outputPath }) => ({
        caseId,
        origamiGateActive,
        outputPath,
      })),
    [
      {
        caseId: 'origami-chat',
        origamiGateActive: true,
        outputPath: 'tests/visual/monochrome/baselines/b0/origami/chat.png',
      },
    ],
  );
  assert.equal(
    MONOCHROME_BASELINE_MANIFEST.captures.some(({ outputPath }) =>
      outputPath.toLowerCase().includes('b0-r1'),
    ),
    false,
  );
  assert.equal(MONOCHROME_MC9_BASELINE_MANIFEST.entries.length, 111);
  assert.equal(repositoryRelativePaths.length, 111);
  assert.deepEqual(
    validateMonochromeMc9BaselineManifest(
      MONOCHROME_MC9_BASELINE_MANIFEST,
      repositoryRelativePaths,
    ),
    [],
  );

  assert.match(
    validateMonochromeMc9BaselineManifest(
      MONOCHROME_MC9_BASELINE_MANIFEST,
      repositoryRelativePaths.slice(1),
    ).join('\n'),
    /missing/iu,
  );
  assert.match(
    validateMonochromeMc9BaselineManifest(MONOCHROME_MC9_BASELINE_MANIFEST, [
      ...repositoryRelativePaths,
      repositoryRelativePaths[0],
    ]).join('\n'),
    /duplicate|order/iu,
  );
  assert.match(
    validateMonochromeMc9BaselineManifest(MONOCHROME_MC9_BASELINE_MANIFEST, [
      ...repositoryRelativePaths,
      'tests/visual/monochrome/baselines/mc9/orphan.png',
    ]).join('\n'),
    /orphan/iu,
  );
  assert.match(
    validateMonochromeMc9BaselineManifest(
      {
        ...MONOCHROME_MC9_BASELINE_MANIFEST,
        entries: [
          {
            ...MONOCHROME_MC9_BASELINE_MANIFEST.entries[0],
            outputPath: '../unsafe.png',
          },
          ...MONOCHROME_MC9_BASELINE_MANIFEST.entries.slice(1),
        ],
      },
      repositoryRelativePaths,
    ).join('\n'),
    /unsafe|closure/iu,
  );
});

test('MC9 canonical input identity covers mutable files, content sets, filename sets, and immutable Git inputs', async () => {
  const manifest = await canonicalStructuralInputManifest();
  const workingTreePaths = manifest.workingTreeFiles.map(({ path: relativePath }) => relativePath);
  for (const criticalPath of [
    'tests/visual/monochrome/fixtures.ts',
    'tests/visual/chat/fixture-data.mjs',
    'app/src-tauri/tauri.conf.json',
    'app/src-tauri/src/pets.rs',
    'app/src-tauri/src/preview.rs',
    'app/src/features/workbench/window.ts',
    'app/src/components/layout/PageRouter.tsx',
    'app/src/features/settings/settingsPrefetch.ts',
    'app/src/stores/ui.ts',
    'docs/appearance/monochrome/route-coverage.md',
  ]) {
    assert.ok(workingTreePaths.includes(criticalPath), criticalPath);
  }
  assert.deepEqual(workingTreePaths, [...new Set(workingTreePaths)].sort());
  assert.equal(
    manifest.workingTreeFiles.every(({ path: relativePath }) => {
      assertRepositoryRelative(relativePath, 'working tree input');
      return true;
    }),
    true,
  );
  assert.deepEqual(
    manifest.workingTreeContentSets.map(({ entries, id }) => [id, entries.length]),
    [
      ['b0-png-content', 10],
      ['current-capability-json-content', 5],
    ],
  );
  assert.deepEqual(
    manifest.workingTreeFilenameSets.map(({ entries, id }) => [id, entries.length]),
    [['mc9-png-filenames', 111]],
  );
  assert.ok(manifest.immutableGitFiles.length > 0);
  assert.deepEqual(manifest.immutableGitCommits, [...new Set(manifest.immutableGitCommits)].sort());
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

  const staleMc9Claim = structuredClone(ledger);
  staleMc9Claim.records
    .find(({ id }) => id === 'MC9-STRUCTURAL-MANIFEST')
    .evidence.find(
      ({ path: evidencePath }) =>
        evidencePath === 'tests/visual/monochrome/baseline-manifest.test.ts',
    ).result = '7 tests passed; MC9 declared and actual PNG closure is exactly 110';
  await assert.rejects(validateDocument(replaceLedger(markdown, staleMc9Claim)));

  const missingMc9Evidence = structuredClone(ledger);
  missingMc9Evidence.records.find(({ id }) => id === 'MC9-STRUCTURAL-MANIFEST').evidence.pop();
  await assert.rejects(validateDocument(replaceLedger(markdown, missingMc9Evidence)));

  const duplicateMc9Evidence = structuredClone(ledger);
  const structuralEvidence = duplicateMc9Evidence.records.find(
    ({ id }) => id === 'MC9-STRUCTURAL-MANIFEST',
  ).evidence;
  structuralEvidence[1] = structuredClone(structuralEvidence[0]);
  await assert.rejects(validateDocument(replaceLedger(markdown, duplicateMc9Evidence)));

  const wrongDuration = structuredClone(ledger);
  wrongDuration.records[0].durationMs += 10;
  await assert.rejects(validateDocument(replaceLedger(markdown, wrongDuration)));

  const wrongGeneratedAt = structuredClone(ledger);
  wrongGeneratedAt.generatedAtUtc = '2026-07-29T23:03:38.4512285Z';
  await assert.rejects(validateDocument(replaceLedger(markdown, wrongGeneratedAt)));

  const wrongHash = structuredClone(ledger);
  wrongHash.records[0].evidence[0].sha256 = '0'.repeat(64);
  await assert.rejects(validateDocument(replaceLedger(markdown, wrongHash)));

  const wrongInputAggregate = structuredClone(ledger);
  wrongInputAggregate.records.find(
    ({ id }) => id === 'MC9-STRUCTURAL-MANIFEST',
  ).inputIdentity.aggregateSha256 = '0'.repeat(64);
  await assert.rejects(validateDocument(replaceLedger(markdown, wrongInputAggregate)));

  const wrongPostRunAggregate = structuredClone(ledger);
  wrongPostRunAggregate.records.find(
    ({ id }) => id === 'MC9-STRUCTURAL-MANIFEST',
  ).inputIdentity.afterAggregateSha256 = '0'.repeat(64);
  await assert.rejects(validateDocument(replaceLedger(markdown, wrongPostRunAggregate)));

  const lateInputCapture = structuredClone(ledger);
  const lateCaptureRecord = lateInputCapture.records.find(
    ({ id }) => id === 'MC9-STRUCTURAL-MANIFEST',
  );
  lateCaptureRecord.inputIdentity.capturedAtUtc = lateCaptureRecord.finishedAtUtc;
  await assert.rejects(validateDocument(replaceLedger(markdown, lateInputCapture)));

  const wrongInputGroup = structuredClone(ledger);
  wrongInputGroup.records
    .find(({ id }) => id === 'MC9-STRUCTURAL-MANIFEST')
    .inputIdentity.groups.find(({ id }) => id === 'working-tree-files').entryCount -= 1;
  await assert.rejects(validateDocument(replaceLedger(markdown, wrongInputGroup)));

  const wrongFixtureHash = structuredClone(ledger);
  wrongFixtureHash.records.find(({ id }) => id === 'MC9-STRUCTURAL-MANIFEST').fixtureHashes[0] =
    '0'.repeat(64);
  await assert.rejects(validateDocument(replaceLedger(markdown, wrongFixtureHash)));

  const wrongTestedTree = structuredClone(ledger);
  wrongTestedTree.records[0].testedCommitSha = '0'.repeat(40);
  await assert.rejects(validateDocument(replaceLedger(markdown, wrongTestedTree)));

  const traversal = structuredClone(ledger);
  traversal.records[0].evidence[0].path = '../private.txt';
  await assert.rejects(validateDocument(replaceLedger(markdown, traversal)));

  await assert.rejects(validateDocument(`${markdown}\nBearer not-a-real-token`));
});
