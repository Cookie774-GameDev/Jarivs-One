#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPOSITORY_ROOT = resolve(MODULE_DIRECTORY, '../..');

export const ORIGAMI_BASELINE_SOURCE_COMMIT = '8bd1e58cdb1ed6661eebe8d9afc3f1b86ae75696';
export const ORIGAMI_PRESENTATION_COMMIT = '30600cd4940b424a513f4b997f3cfca433a8f32b';
export const BASELINE_BUILD_PATHS = Object.freeze([
  'package.json',
  'package-lock.json',
  'app',
  'scripts/visual-monochrome',
  'supabase/functions/_shared/githubContextProxy.ts',
  'tests/jarvis/gold-standard-prompts.json',
]);
const GENERATED_ARTIFACT_PATHS = Object.freeze([
  'app/public/theme-prepaint.js',
  'app/src/features/appearance/themeContract.generated.ts',
]);
const GENERATED_ARTIFACT_COMMAND = Object.freeze([
  'scripts/visual-monochrome/generate-theme-contract.mjs',
]);

export function resolveNpmInvocation({
  platform = process.platform,
  nodeExecutable = process.execPath,
  checkFile = existsSync,
} = {}) {
  if (platform !== 'win32') {
    return { command: 'npm', prefixArguments: [], displayCommand: 'npm' };
  }
  const cliPath = resolve(dirname(nodeExecutable), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (!checkFile(cliPath)) {
    throw new Error(`Windows npm CLI was not found beside Node: ${cliPath}`);
  }
  return {
    command: nodeExecutable,
    prefixArguments: [cliPath],
    displayCommand: 'npm',
  };
}

function isContained(parent, candidate) {
  return candidate === parent || candidate.startsWith(`${parent}${sep}`);
}

function requireFullCommit(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/i.test(value)) {
    throw new Error(`${label} must be a full 40-character commit SHA.`);
  }
  return value.toLowerCase();
}

function commandFailure(label, result) {
  const detail = result.stderr?.trim();
  return new Error(`${label} failed${detail ? `: ${detail}` : '.'}`);
}

function assertKnownOptions(options, allowed, label) {
  for (const name of Object.keys(options)) {
    if (!allowed.has(name)) {
      throw new Error(`Unknown ${label} option: ${name}`);
    }
  }
}

function lstatEntry(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function snapshotArchiveTree(sourceDirectory) {
  const snapshot = new Map();
  const visit = (directory, prefix = '') => {
    const names = readdirSync(directory).sort();
    for (const name of names) {
      const absolutePath = resolve(directory, name);
      const relativePath = prefix ? `${prefix}/${name}` : name;
      const entry = lstatSync(absolutePath);
      const mode = (entry.mode & 0o777).toString(8);
      if (entry.isSymbolicLink()) {
        snapshot.set(relativePath, `link:${mode}:${readlinkSync(absolutePath)}`);
      } else if (entry.isDirectory()) {
        snapshot.set(relativePath, `directory:${mode}`);
        visit(absolutePath, relativePath);
      } else if (entry.isFile()) {
        snapshot.set(relativePath, `file:${mode}:${sha256File(absolutePath)}`);
      } else {
        snapshot.set(relativePath, `other:${mode}`);
      }
    }
  };
  visit(sourceDirectory);
  return snapshot;
}

function changedArchivePaths(before, after) {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths].filter((path) => before.get(path) !== after.get(path)).sort();
}

function assertSafePathChain(repositoryRoot, candidate) {
  const repository = resolve(repositoryRoot);
  const target = resolve(candidate);
  if (!isContained(repository, target)) {
    throw new Error(`Materialized baseline path escaped repositoryRoot: ${target}`);
  }
  const repositoryEntry = lstatEntry(repository);
  if (!repositoryEntry?.isDirectory()) {
    throw new Error(`repositoryRoot must be an existing directory: ${repository}`);
  }
  if (repositoryEntry.isSymbolicLink()) {
    throw new Error(`repositoryRoot cannot be a symbolic link, junction, or reparse point.`);
  }
  const realRepository = realpathSync.native(repository);
  let current = repository;
  const segments = relative(repository, target).split(/[\\/]/).filter(Boolean);
  for (let index = 0; index < segments.length; index += 1) {
    current = resolve(current, segments[index]);
    const entry = lstatEntry(current);
    if (!entry) break;
    if (entry.isSymbolicLink()) {
      throw new Error(
        `Baseline path cannot traverse a symbolic link, junction, or reparse point: ${current}`,
      );
    }
    if (index < segments.length - 1 && !entry.isDirectory()) {
      throw new Error(`Baseline path ancestor must be a directory: ${current}`);
    }
    const realCurrent = realpathSync.native(current);
    if (!isContained(realRepository, realCurrent)) {
      throw new Error(`Baseline path escaped the real repositoryRoot: ${current}`);
    }
  }
}

export function runGitProbe(argumentsList, { repositoryRoot = DEFAULT_REPOSITORY_ROOT } = {}) {
  const result = spawnSync('git', argumentsList, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

export function resolveBaselinePaths(options = {}) {
  assertKnownOptions(options, new Set(['repositoryRoot']), 'baseline path');
  const repositoryRoot = options.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT;
  const repository = resolve(repositoryRoot);
  const artifacts = resolve(repository, '.artifacts/origami-chat');
  const sourceDirectory = resolve(artifacts, 'baseline-source');
  const archivePath = resolve(artifacts, 'baseline-source.tar');
  const distDirectory = resolve(sourceDirectory, 'app/dist');
  for (const candidate of [sourceDirectory, archivePath, distDirectory]) {
    if (!isContained(artifacts, candidate)) {
      throw new Error(`Materialized baseline path escaped artifactRoot: ${candidate}`);
    }
  }
  assertSafePathChain(repository, artifacts);
  return {
    repositoryRoot: repository,
    artifactRoot: artifacts,
    sourceDirectory,
    archivePath,
    distDirectory,
  };
}

export function assertCleanBaselineDestination(paths) {
  if (lstatEntry(paths.archivePath)) {
    throw new Error(`Baseline archive already exists: ${paths.archivePath}`);
  }
  if (lstatEntry(paths.sourceDirectory)) {
    throw new Error(`Baseline source already exists: ${paths.sourceDirectory}`);
  }
}

export function assertBaselineArtifactRootIgnored(paths, runGit = runGitProbe) {
  const outputPaths = [
    resolve(paths.sourceDirectory, 'ignore-probe'),
    paths.archivePath,
    resolve(paths.distDirectory, 'index.html'),
  ];
  const unignored = outputPaths.filter((path) => {
    const probe = relative(paths.repositoryRoot, path).replaceAll('\\', '/');
    return runGit(['check-ignore', '-q', '--', probe]).status !== 0;
  });
  if (unignored.length > 0) {
    throw new Error(
      `Baseline artifact root must be ignored before materialization: ${unignored.join(', ')}`,
    );
  }
}

export function validateBaselineRevision(options = {}) {
  assertKnownOptions(
    options,
    new Set(['sourceCommit', 'origamiCommit', 'runGit']),
    'baseline revision',
  );
  const sourceCommit = options.sourceCommit ?? ORIGAMI_BASELINE_SOURCE_COMMIT;
  const origamiCommit = options.origamiCommit ?? ORIGAMI_PRESENTATION_COMMIT;
  const runGit = options.runGit ?? runGitProbe;
  const source = requireFullCommit(sourceCommit, 'sourceCommit');
  const origami = requireFullCommit(origamiCommit, 'origamiCommit');
  const head = runGit(['rev-parse', '--verify', 'HEAD^{commit}']);
  if (head.status !== 0) {
    throw commandFailure('Unable to resolve actual HEAD commit', head);
  }
  const headCommit = requireFullCommit(head.stdout.trim(), 'resolved HEAD');
  const sourceExists = runGit(['cat-file', '-e', `${source}^{commit}`]);
  if (sourceExists.status !== 0) {
    throw commandFailure('Baseline source commit does not exist', sourceExists);
  }
  const ancestor = runGit(['merge-base', '--is-ancestor', source, headCommit]);
  if (ancestor.status !== 0) {
    throw new Error(`Baseline source commit ${source} must be an ancestor of HEAD ${headCommit}.`);
  }
  const headContainsOrigami = runGit(['merge-base', '--is-ancestor', origami, headCommit]);
  if (headContainsOrigami.status !== 0) {
    throw new Error(`Actual HEAD ${headCommit} must contain Origami commit ${origami}.`);
  }
  const parent = runGit(['rev-parse', `${origami}^`]);
  if (parent.status !== 0) {
    throw commandFailure('Unable to resolve the Origami presentation parent', parent);
  }
  if (parent.stdout.trim().toLowerCase() !== source) {
    throw new Error(
      `Baseline source ${source} must be the immediate parent of Origami commit ${origami}.`,
    );
  }
  const containsOrigami = runGit(['merge-base', '--is-ancestor', origami, source]);
  if (containsOrigami.status === 0) {
    throw new Error('Baseline source must not contain the Origami presentation commit.');
  }
  if (containsOrigami.status !== 1) {
    throw commandFailure(
      'Unable to prove the Origami presentation commit is absent',
      containsOrigami,
    );
  }
  return {
    sourceCommit: source,
    origamiCommit: origami,
    headCommit,
  };
}

function runRequiredCommand(command, argumentsList, options) {
  const result = spawnSync(command, argumentsList, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env ?? process.env,
    shell: false,
    stdio: options.stdio ?? 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${argumentsList.join(' ')} failed with exit code ${String(result.status)}.`,
    );
  }
}

function normalizeGeneratedArtifacts(paths, runCommand) {
  const beforeTree = snapshotArchiveTree(paths.sourceDirectory);
  const outputs = GENERATED_ARTIFACT_PATHS.map((path) => {
    const absolutePath = resolve(paths.sourceDirectory, path);
    assertSafePathChain(paths.repositoryRoot, absolutePath);
    return {
      path,
      absolutePath,
      beforeSha256: sha256File(absolutePath),
    };
  });
  runCommand(process.execPath, GENERATED_ARTIFACT_COMMAND, {
    cwd: paths.sourceDirectory,
  });
  const afterTree = snapshotArchiveTree(paths.sourceDirectory);
  const allowed = new Set(GENERATED_ARTIFACT_PATHS);
  const unexpected = changedArchivePaths(beforeTree, afterTree).filter(
    (path) => !allowed.has(path),
  );
  if (unexpected.length > 0) {
    throw new Error(
      `Unexpected archive mutation during generated artifact normalization: ${unexpected.join(', ')}`,
    );
  }
  return {
    command: `node ${GENERATED_ARTIFACT_COMMAND.join(' ')}`,
    outputs: outputs.map(({ path, absolutePath, beforeSha256 }) => {
      assertSafePathChain(paths.repositoryRoot, absolutePath);
      return {
        path,
        beforeSha256,
        afterSha256: sha256File(absolutePath),
      };
    }),
  };
}

export function materializeBaseline(options = {}) {
  assertKnownOptions(
    options,
    new Set(['repositoryRoot', 'sourceCommit', 'runCommand', 'runGit']),
    'materialization',
  );
  const repositoryRoot = options.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT;
  const sourceCommit = options.sourceCommit ?? ORIGAMI_BASELINE_SOURCE_COMMIT;
  const runCommand = options.runCommand ?? runRequiredCommand;
  const runGit = options.runGit;
  const paths = resolveBaselinePaths({ repositoryRoot });
  const gitProbe =
    runGit ??
    ((argumentsList) => runGitProbe(argumentsList, { repositoryRoot: paths.repositoryRoot }));
  const revision = validateBaselineRevision({
    sourceCommit,
    runGit: gitProbe,
  });
  assertBaselineArtifactRootIgnored(paths, gitProbe);
  assertCleanBaselineDestination(paths);
  mkdirSync(paths.artifactRoot, { recursive: true });
  assertSafePathChain(paths.repositoryRoot, paths.artifactRoot);
  mkdirSync(paths.sourceDirectory);
  assertSafePathChain(paths.repositoryRoot, paths.sourceDirectory);
  try {
    runCommand(
      'git',
      [
        'archive',
        '--format=tar',
        `--output=${paths.archivePath}`,
        revision.sourceCommit,
        '--',
        ...BASELINE_BUILD_PATHS,
      ],
      { cwd: paths.repositoryRoot },
    );
    const archive = lstatEntry(paths.archivePath);
    if (!archive?.isFile() || archive.isSymbolicLink()) {
      throw new Error(`Git archive output must be a regular file: ${paths.archivePath}`);
    }
    assertSafePathChain(paths.repositoryRoot, paths.archivePath);
    runCommand('tar', ['-xf', paths.archivePath, '-C', paths.sourceDirectory], {
      cwd: paths.repositoryRoot,
    });
    assertSafePathChain(paths.repositoryRoot, paths.sourceDirectory);
  } finally {
    rmSync(paths.archivePath, { force: true });
  }
  const npmInvocation = resolveNpmInvocation();
  runCommand(npmInvocation.command, [...npmInvocation.prefixArguments, 'ci', '--ignore-scripts'], {
    cwd: paths.sourceDirectory,
  });
  const generatedArtifactNormalization = normalizeGeneratedArtifacts(paths, runCommand);
  runCommand(npmInvocation.command, [...npmInvocation.prefixArguments, 'run', 'build'], {
    cwd: paths.sourceDirectory,
  });
  const builtIndex = resolve(paths.distDirectory, 'index.html');
  assertSafePathChain(paths.repositoryRoot, builtIndex);
  if (!lstatEntry(builtIndex)?.isFile()) {
    throw new Error(`Baseline build did not produce app/dist/index.html: ${paths.distDirectory}`);
  }
  return {
    schemaVersion: 1,
    sourceCommit: revision.sourceCommit,
    origamiCommit: revision.origamiCommit,
    headCommit: revision.headCommit,
    sourceDirectory: relative(paths.repositoryRoot, paths.sourceDirectory).replaceAll('\\', '/'),
    distDirectory: relative(paths.repositoryRoot, paths.distDirectory).replaceAll('\\', '/'),
    archivedBuildPaths: [...BASELINE_BUILD_PATHS],
    installCommand: 'npm ci --ignore-scripts',
    generatedArtifactNormalization,
    buildCommand: 'npm run build',
  };
}

function parseArguments(values) {
  if (values.length > 0) {
    throw new Error(`Unknown materialization argument: ${values[0]}`);
  }
  return {};
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const receipt = materializeBaseline(parseArguments(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  }
}
