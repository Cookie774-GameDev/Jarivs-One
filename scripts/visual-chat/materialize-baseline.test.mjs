import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  ORIGAMI_BASELINE_SOURCE_COMMIT,
  ORIGAMI_PRESENTATION_COMMIT,
  assertBaselineArtifactRootIgnored,
  assertCleanBaselineDestination,
  materializeBaseline,
  resolveBaselinePaths,
  resolveNpmInvocation,
  validateBaselineRevision,
} from './materialize-baseline.mjs';

const SYNTHETIC_HEAD_COMMIT = '2222222222222222222222222222222222222222';

function withTemporaryDirectory(run) {
  const directory = mkdtempSync(join(tmpdir(), 'vibespace-origami-baseline-'));
  try {
    return run(directory);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

function createGitProbe(overrides = {}) {
  const calls = [];
  const probe = (argumentsList) => {
    calls.push(argumentsList);
    const key = argumentsList.join(' ');
    const response = overrides[key];
    if (response) return response;
    if (key === 'rev-parse --verify HEAD^{commit}') {
      return { status: 0, stdout: `${SYNTHETIC_HEAD_COMMIT}\n`, stderr: '' };
    }
    return { status: 0, stdout: '', stderr: '' };
  };
  return { calls, probe };
}

test('freezes the exact immediate pre-Origami revision', () => {
  assert.equal(ORIGAMI_BASELINE_SOURCE_COMMIT, '8bd1e58cdb1ed6661eebe8d9afc3f1b86ae75696');
  assert.equal(ORIGAMI_PRESENTATION_COMMIT, '30600cd4940b424a513f4b997f3cfca433a8f32b');
});

test('resolves Windows npm through the Node CLI without a command shell', () => {
  assert.equal(typeof resolveNpmInvocation, 'function');
  const nodeExecutable = 'C:\\Program Files\\nodejs\\node.exe';
  const invocation = resolveNpmInvocation({
    platform: 'win32',
    nodeExecutable,
    checkFile: () => true,
  });
  assert.deepEqual(invocation, {
    command: nodeExecutable,
    prefixArguments: [
      resolve('C:\\Program Files\\nodejs', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    ],
    displayCommand: 'npm',
  });
});

test('keeps all materialized paths inside the ignored artifact root', () =>
  withTemporaryDirectory((repositoryRoot) => {
    const paths = resolveBaselinePaths({ repositoryRoot });
    const expectedRoot = resolve(repositoryRoot, '.artifacts/origami-chat');
    assert.equal(paths.artifactRoot, expectedRoot);
    assert.equal(paths.sourceDirectory, resolve(expectedRoot, 'baseline-source'));
    assert.equal(paths.archivePath, resolve(expectedRoot, 'baseline-source.tar'));
    assert.equal(paths.distDirectory, resolve(expectedRoot, 'baseline-source/app/dist'));

    assert.throws(
      () =>
        resolveBaselinePaths({
          repositoryRoot,
          artifactRoot: resolve(repositoryRoot, '../escaped'),
        }),
      /unknown baseline path option.*artifactRoot/i,
    );
  }));

test('rejects a short or malformed baseline commit before any git probe', () => {
  const { calls, probe } = createGitProbe();
  assert.throws(
    () =>
      validateBaselineRevision({
        sourceCommit: '8bd1e58',
        runGit: probe,
      }),
    /full 40-character commit/i,
  );
  assert.equal(calls.length, 0);
});

test('proves source exists, is an ancestor, is the Origami parent, and excludes Origami', () => {
  const { calls, probe } = createGitProbe({
    [`rev-parse ${ORIGAMI_PRESENTATION_COMMIT}^`]: {
      status: 0,
      stdout: `${ORIGAMI_BASELINE_SOURCE_COMMIT}\n`,
      stderr: '',
    },
    [`merge-base --is-ancestor ${ORIGAMI_PRESENTATION_COMMIT} ${ORIGAMI_BASELINE_SOURCE_COMMIT}`]: {
      status: 1,
      stdout: '',
      stderr: '',
    },
  });

  const receipt = validateBaselineRevision({ runGit: probe });

  assert.deepEqual(receipt, {
    sourceCommit: ORIGAMI_BASELINE_SOURCE_COMMIT,
    origamiCommit: ORIGAMI_PRESENTATION_COMMIT,
    headCommit: SYNTHETIC_HEAD_COMMIT,
  });
  assert.deepEqual(calls, [
    ['rev-parse', '--verify', 'HEAD^{commit}'],
    ['cat-file', '-e', `${ORIGAMI_BASELINE_SOURCE_COMMIT}^{commit}`],
    ['merge-base', '--is-ancestor', ORIGAMI_BASELINE_SOURCE_COMMIT, SYNTHETIC_HEAD_COMMIT],
    ['merge-base', '--is-ancestor', ORIGAMI_PRESENTATION_COMMIT, SYNTHETIC_HEAD_COMMIT],
    ['rev-parse', `${ORIGAMI_PRESENTATION_COMMIT}^`],
    ['merge-base', '--is-ancestor', ORIGAMI_PRESENTATION_COMMIT, ORIGAMI_BASELINE_SOURCE_COMMIT],
  ]);
});

test('rejects a source that is missing or not an ancestor of HEAD', () => {
  const missing = createGitProbe({
    [`cat-file -e ${ORIGAMI_BASELINE_SOURCE_COMMIT}^{commit}`]: {
      status: 128,
      stdout: '',
      stderr: 'missing',
    },
  });
  assert.throws(
    () => validateBaselineRevision({ runGit: missing.probe }),
    /baseline source commit does not exist/i,
  );

  const divergent = createGitProbe({
    [`merge-base --is-ancestor ${ORIGAMI_BASELINE_SOURCE_COMMIT} ${SYNTHETIC_HEAD_COMMIT}`]: {
      status: 1,
      stdout: '',
      stderr: '',
    },
  });
  assert.throws(
    () => validateBaselineRevision({ runGit: divergent.probe }),
    /must be an ancestor of HEAD/i,
  );

  const override = createGitProbe();
  assert.throws(
    () => validateBaselineRevision({ headRevision: 'other-ref', runGit: override.probe }),
    /unknown baseline revision option.*headRevision/i,
  );
  assert.equal(override.calls.length, 0);
});

test('rejects a source that is not the exact Origami parent or already contains Origami', () => {
  const wrongParent = createGitProbe({
    [`rev-parse ${ORIGAMI_PRESENTATION_COMMIT}^`]: {
      status: 0,
      stdout: '1111111111111111111111111111111111111111\n',
      stderr: '',
    },
  });
  assert.throws(() => validateBaselineRevision({ runGit: wrongParent.probe }), /immediate parent/i);

  const containsOrigami = createGitProbe({
    [`rev-parse ${ORIGAMI_PRESENTATION_COMMIT}^`]: {
      status: 0,
      stdout: `${ORIGAMI_BASELINE_SOURCE_COMMIT}\n`,
      stderr: '',
    },
    [`merge-base --is-ancestor ${ORIGAMI_PRESENTATION_COMMIT} ${ORIGAMI_BASELINE_SOURCE_COMMIT}`]: {
      status: 0,
      stdout: '',
      stderr: '',
    },
  });
  assert.throws(
    () => validateBaselineRevision({ runGit: containsOrigami.probe }),
    /must not contain the Origami presentation commit/i,
  );
});

test('accepts only an absent destination and rejects any existing source or archive entry', () =>
  withTemporaryDirectory((repositoryRoot) => {
    const paths = resolveBaselinePaths({ repositoryRoot });
    assert.doesNotThrow(() => assertCleanBaselineDestination(paths));

    mkdirSync(paths.sourceDirectory, { recursive: true });
    assert.throws(() => assertCleanBaselineDestination(paths), /baseline source already exists/i);

    rmSync(paths.sourceDirectory, { force: true, recursive: true });
    mkdirSync(paths.artifactRoot, { recursive: true });
    writeFileSync(paths.archivePath, 'stale archive');
    assert.throws(() => assertCleanBaselineDestination(paths), /archive already exists/i);
  }));

test('rejects an existing artifact ancestor junction and a dangling archive symlink', () =>
  withTemporaryDirectory((temporaryRoot) => {
    const repositoryRoot = join(temporaryRoot, 'repository');
    const escapedRoot = join(temporaryRoot, 'escaped-artifacts');
    mkdirSync(repositoryRoot);
    mkdirSync(escapedRoot);
    symlinkSync(escapedRoot, join(repositoryRoot, '.artifacts'), 'junction');
    assert.throws(
      () => resolveBaselinePaths({ repositoryRoot }),
      /symbolic link|junction|reparse/i,
    );

    rmSync(join(repositoryRoot, '.artifacts'), { force: true });
    const paths = resolveBaselinePaths({ repositoryRoot });
    mkdirSync(paths.artifactRoot, { recursive: true });
    const archiveTarget = join(temporaryRoot, 'archive-target');
    mkdirSync(archiveTarget);
    symlinkSync(archiveTarget, paths.archivePath, 'junction');
    rmSync(archiveTarget, { force: true, recursive: true });
    assert.throws(() => assertCleanBaselineDestination(paths), /archive already exists/i);
  }));

test('refuses materialization unless the exact baseline artifact path is ignored', () =>
  withTemporaryDirectory((repositoryRoot) => {
    const paths = resolveBaselinePaths({ repositoryRoot });
    const calls = [];
    assert.throws(
      () =>
        assertBaselineArtifactRootIgnored(paths, (argumentsList) => {
          calls.push(argumentsList);
          return { status: 1, stdout: '', stderr: '' };
        }),
      /artifact root must be ignored/i,
    );
    assert.deepEqual(calls, [
      ['check-ignore', '-q', '--', '.artifacts/origami-chat/baseline-source/ignore-probe'],
      ['check-ignore', '-q', '--', '.artifacts/origami-chat/baseline-source.tar'],
      ['check-ignore', '-q', '--', '.artifacts/origami-chat/baseline-source/app/dist/index.html'],
    ]);
  }));

test('archives, installs without scripts, and builds only inside the materialized source', () =>
  withTemporaryDirectory((repositoryRoot) => {
    const paths = resolveBaselinePaths({ repositoryRoot });
    const generatedTsPath = join(
      paths.sourceDirectory,
      'app/src/features/appearance/themeContract.generated.ts',
    );
    const prepaintPath = join(paths.sourceDirectory, 'app/public/theme-prepaint.js');
    const staleGeneratedTs = 'stale generated TypeScript\n';
    const normalizedGeneratedTs = 'normalized generated TypeScript\n';
    const stalePrepaint = 'stale prepaint JavaScript\n';
    const normalizedPrepaint = 'normalized prepaint JavaScript\n';
    const git = createGitProbe({
      [`rev-parse ${ORIGAMI_PRESENTATION_COMMIT}^`]: {
        status: 0,
        stdout: `${ORIGAMI_BASELINE_SOURCE_COMMIT}\n`,
        stderr: '',
      },
      [`merge-base --is-ancestor ${ORIGAMI_PRESENTATION_COMMIT} ${ORIGAMI_BASELINE_SOURCE_COMMIT}`]:
        {
          status: 1,
          stdout: '',
          stderr: '',
        },
    });
    const commands = [];
    const runCommand = (command, argumentsList, options) => {
      commands.push({ command, argumentsList, cwd: options.cwd });
      if (command === 'git') {
        writeFileSync(paths.archivePath, 'synthetic archive');
      }
      if (command === 'tar') {
        mkdirSync(join(paths.sourceDirectory, 'app/src/features/appearance'), {
          recursive: true,
        });
        mkdirSync(join(paths.sourceDirectory, 'app/public'), { recursive: true });
        writeFileSync(generatedTsPath, staleGeneratedTs);
        writeFileSync(prepaintPath, stalePrepaint);
      }
      if (
        command === process.execPath &&
        argumentsList.join(' ') === 'scripts/visual-monochrome/generate-theme-contract.mjs'
      ) {
        writeFileSync(generatedTsPath, normalizedGeneratedTs);
        writeFileSync(prepaintPath, normalizedPrepaint);
      }
      if (argumentsList.slice(-2).join(' ') === 'run build') {
        assert.equal(readFileSync(generatedTsPath, 'utf8'), normalizedGeneratedTs);
        assert.equal(readFileSync(prepaintPath, 'utf8'), normalizedPrepaint);
        mkdirSync(paths.distDirectory, { recursive: true });
        writeFileSync(join(paths.distDirectory, 'index.html'), '<!doctype html>');
      }
    };

    const receipt = materializeBaseline({
      repositoryRoot,
      runGit: git.probe,
      runCommand,
    });

    const npmInvocation = resolveNpmInvocation();
    assert.deepEqual(commands, [
      {
        command: 'git',
        argumentsList: [
          'archive',
          '--format=tar',
          `--output=${paths.archivePath}`,
          ORIGAMI_BASELINE_SOURCE_COMMIT,
          '--',
          'package.json',
          'package-lock.json',
          'app',
          'scripts/visual-monochrome',
          'supabase/functions/_shared/githubContextProxy.ts',
          'tests/jarvis/gold-standard-prompts.json',
        ],
        cwd: resolve(repositoryRoot),
      },
      {
        command: 'tar',
        argumentsList: ['-xf', paths.archivePath, '-C', paths.sourceDirectory],
        cwd: resolve(repositoryRoot),
      },
      {
        command: npmInvocation.command,
        argumentsList: [...npmInvocation.prefixArguments, 'ci', '--ignore-scripts'],
        cwd: paths.sourceDirectory,
      },
      {
        command: process.execPath,
        argumentsList: ['scripts/visual-monochrome/generate-theme-contract.mjs'],
        cwd: paths.sourceDirectory,
      },
      {
        command: npmInvocation.command,
        argumentsList: [...npmInvocation.prefixArguments, 'run', 'build'],
        cwd: paths.sourceDirectory,
      },
    ]);
    assert.equal(existsSync(paths.archivePath), false);
    assert.deepEqual(receipt, {
      schemaVersion: 1,
      sourceCommit: ORIGAMI_BASELINE_SOURCE_COMMIT,
      origamiCommit: ORIGAMI_PRESENTATION_COMMIT,
      headCommit: SYNTHETIC_HEAD_COMMIT,
      sourceDirectory: '.artifacts/origami-chat/baseline-source',
      distDirectory: '.artifacts/origami-chat/baseline-source/app/dist',
      archivedBuildPaths: [
        'package.json',
        'package-lock.json',
        'app',
        'scripts/visual-monochrome',
        'supabase/functions/_shared/githubContextProxy.ts',
        'tests/jarvis/gold-standard-prompts.json',
      ],
      installCommand: 'npm ci --ignore-scripts',
      generatedArtifactNormalization: {
        command: 'node scripts/visual-monochrome/generate-theme-contract.mjs',
        outputs: [
          {
            path: 'app/public/theme-prepaint.js',
            beforeSha256: 'a03528dbd69b48b169018fc52803fdd96c2087243502f8984a4b2b6a014a582f',
            afterSha256: '59dc6196362b04c1719bacdb5ec703be071ebeb1c15e57f410888235df7ea8a0',
          },
          {
            path: 'app/src/features/appearance/themeContract.generated.ts',
            beforeSha256: 'f62da7744a35dec6d92b87b52dfaf0060ad73ba39bd4dbaaa5bbfdea0be9be4c',
            afterSha256: '36d70b6904e5218a1183f5ef3f3e48f801f95b964205539012230d363f635000',
          },
        ],
      },
      buildCommand: 'npm run build',
    });
  }));

test('rejects an archived generator mutation outside the two generated outputs', () =>
  withTemporaryDirectory((repositoryRoot) => {
    const paths = resolveBaselinePaths({ repositoryRoot });
    const generatedTsPath = join(
      paths.sourceDirectory,
      'app/src/features/appearance/themeContract.generated.ts',
    );
    const prepaintPath = join(paths.sourceDirectory, 'app/public/theme-prepaint.js');
    const packagePath = join(paths.sourceDirectory, 'package.json');
    const git = createGitProbe({
      [`rev-parse ${ORIGAMI_PRESENTATION_COMMIT}^`]: {
        status: 0,
        stdout: `${ORIGAMI_BASELINE_SOURCE_COMMIT}\n`,
        stderr: '',
      },
      [`merge-base --is-ancestor ${ORIGAMI_PRESENTATION_COMMIT} ${ORIGAMI_BASELINE_SOURCE_COMMIT}`]:
        {
          status: 1,
          stdout: '',
          stderr: '',
        },
    });
    let buildCalled = false;
    const runCommand = (command, argumentsList) => {
      if (command === 'git') {
        writeFileSync(paths.archivePath, 'synthetic archive');
      }
      if (command === 'tar') {
        mkdirSync(join(paths.sourceDirectory, 'app/src/features/appearance'), {
          recursive: true,
        });
        mkdirSync(join(paths.sourceDirectory, 'app/public'), { recursive: true });
        writeFileSync(generatedTsPath, 'stale generated TypeScript\n');
        writeFileSync(prepaintPath, 'stale prepaint JavaScript\n');
        writeFileSync(packagePath, '{"name":"historical-archive"}\n');
      }
      if (
        command === process.execPath &&
        argumentsList.join(' ') === 'scripts/visual-monochrome/generate-theme-contract.mjs'
      ) {
        writeFileSync(generatedTsPath, 'normalized generated TypeScript\n');
        writeFileSync(prepaintPath, 'normalized prepaint JavaScript\n');
        writeFileSync(packagePath, '{"name":"unexpected-mutation"}\n');
      }
      if (argumentsList.slice(-2).join(' ') === 'run build') {
        buildCalled = true;
        mkdirSync(paths.distDirectory, { recursive: true });
        writeFileSync(join(paths.distDirectory, 'index.html'), '<!doctype html>');
      }
    };

    assert.throws(
      () =>
        materializeBaseline({
          repositoryRoot,
          runGit: git.probe,
          runCommand,
        }),
      /unexpected archive mutation.*package\.json/i,
    );
    assert.equal(buildCalled, false);
  }));
