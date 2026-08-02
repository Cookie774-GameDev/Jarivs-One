import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  auditScopeChanges,
  collectGitChangedFiles,
  runScopeAuditCli,
  validateScopeAllowlist,
} from '../../../scripts/visual-chat/scope-audit.mjs';

const BASE_REVISION = '8bd1e58cdb1ed6661eebe8d9afc3f1b86ae75696';
const HEAD_REVISION = 'e71cb480cbbcfccdbc5cd2d7f772fb6a8ca4a774';
const COMPARISON_RANGE = `${BASE_REVISION}..${HEAD_REVISION}`;
const ROOT_DIRECTORY = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const ALLOWLIST_PATH = 'tests/visual/chat/scope-allowlist.json';
const allowlist = JSON.parse(readFileSync(resolve(ROOT_DIRECTORY, ALLOWLIST_PATH), 'utf8'));

const EXPECTED_PRODUCTION_PATHS = [
  'app/public/assets/origami-chat/bottom-mountains.svg',
  'app/public/assets/origami-chat/crane.webp',
  'app/public/assets/origami-chat/jarvis-frame-9slice.webp',
  'app/public/assets/origami-chat/left-foliage.webp',
  'app/public/assets/origami-chat/panel-9slice.webp',
  'app/public/assets/origami-chat/paper-base.webp',
  'app/public/assets/origami-chat/paper-grain.webp',
  'app/public/assets/origami-chat/right-flower.webp',
  'app/public/assets/origami-chat/sidebar-active-row-9slice.webp',
  'app/public/assets/origami-chat/sidebar-row-9slice.webp',
  'app/public/assets/origami-chat/top-ribbon.svg',
  'app/src/features/appearance/vibespacePalette.test.ts',
  'app/src/features/chat/ChatView.origamiScope.test.tsx',
  'app/src/features/chat/ChatView.tsx',
  'app/src/features/chat/OrigamiChatDecor.test.tsx',
  'app/src/features/chat/OrigamiChatDecor.tsx',
  'app/src/main.tsx',
  'app/src/styles/origami-chat.css',
  'app/src/styles/vibespace-theme.css',
  'package-lock.json',
  'package.json',
];

const EXPECTED_ASSETS = [
  'app/public/assets/origami-chat/bottom-mountains.svg',
  'app/public/assets/origami-chat/crane.webp',
  'app/public/assets/origami-chat/jarvis-frame-9slice.webp',
  'app/public/assets/origami-chat/left-foliage.webp',
  'app/public/assets/origami-chat/panel-9slice.webp',
  'app/public/assets/origami-chat/paper-base.webp',
  'app/public/assets/origami-chat/paper-grain.webp',
  'app/public/assets/origami-chat/right-flower.webp',
  'app/public/assets/origami-chat/sidebar-active-row-9slice.webp',
  'app/public/assets/origami-chat/sidebar-row-9slice.webp',
  'app/public/assets/origami-chat/top-ribbon.svg',
];

function gitLines(argumentsList) {
  const output = execFileSync('git', argumentsList, {
    cwd: ROOT_DIRECTORY,
    encoding: 'utf8',
    windowsHide: true,
  });
  return output.trim().split(/\r?\n/u).filter(Boolean).sort();
}

function isProductionPath(path) {
  return (
    path.startsWith('app/src/') ||
    path.startsWith('app/public/') ||
    path.startsWith('app/src-tauri/') ||
    ['package.json', 'package-lock.json'].includes(path)
  );
}

function exactRangeState() {
  const paths = gitLines(['diff', '--name-only', '--no-renames', COMPARISON_RANGE, '--']);
  const assets = gitLines([
    'ls-tree',
    '-r',
    '--name-only',
    HEAD_REVISION,
    '--',
    'app/public/assets/origami-chat',
  ]);
  const changedFiles = collectGitChangedFiles({
    rootDirectory: ROOT_DIRECTORY,
    comparisonRange: COMPARISON_RANGE,
  });
  return { assets, changedFiles, paths };
}

function verifyExactAllowlist(candidate, state) {
  assert.deepEqual(candidate.approvedPaths, state.paths, 'approvedPaths widened or incomplete');
  assert.deepEqual(candidate.approvedAssets, state.assets, 'approvedAssets widened or incomplete');
  validateScopeAllowlist(candidate, { rootDirectory: ROOT_DIRECTORY });
  const discovery = auditScopeChanges({
    rootDirectory: ROOT_DIRECTORY,
    allowlist: { ...candidate, approvedSelectors: [] },
    changedFiles: state.changedFiles,
  });
  assert.deepEqual(
    candidate.approvedSelectors,
    discovery.changedSelectors,
    'approvedSelectors widened or incomplete',
  );
  return auditScopeChanges({
    rootDirectory: ROOT_DIRECTORY,
    allowlist: candidate,
    changedFiles: state.changedFiles,
  });
}

test('binds the allowlist to the exact range, production inventory, selectors, and 11 assets', () => {
  const state = exactRangeState();

  assert.deepEqual(state.paths.filter(isProductionPath), EXPECTED_PRODUCTION_PATHS);
  assert.deepEqual(state.assets, EXPECTED_ASSETS);
  const result = verifyExactAllowlist(allowlist, state);
  assert.equal(result.ok, true);
  assert.deepEqual(result.violations, []);
  assert.deepEqual(result.auditedPaths, state.paths);
});

test('runs the fail-closed scope CLI for the pinned comparison range', async () => {
  const stdout = [];
  const stderr = [];
  const exitCode = await runScopeAuditCli({
    argumentsList: [
      '--root',
      ROOT_DIRECTORY,
      '--allowlist',
      ALLOWLIST_PATH,
      '--range',
      COMPARISON_RANGE,
    ],
    stdout: (value) => stdout.push(value),
    stderr: (value) => stderr.push(value),
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(stderr, []);
  const receipt = JSON.parse(stdout.join(''));
  assert.equal(receipt.ok, true);
  assert.equal(receipt.comparisonRange, COMPARISON_RANGE);
  assert.deepEqual(receipt.violations, []);
  assert.deepEqual(receipt.approvedAssets, EXPECTED_ASSETS);
});

test('fails closed when a path, selector, or asset is missing or any list is widened', () => {
  const state = exactRangeState();
  const firstSelector = allowlist.approvedSelectors[0];
  const firstAsset = allowlist.approvedAssets[0];
  const firstPath = allowlist.approvedPaths[0];
  const cases = [
    {
      candidate: {
        ...allowlist,
        approvedPaths: allowlist.approvedPaths.filter((path) => path !== firstPath),
      },
      code: 'PATH_NOT_APPROVED',
    },
    {
      candidate: {
        ...allowlist,
        approvedSelectors: allowlist.approvedSelectors.filter(
          (selector) => selector !== firstSelector,
        ),
      },
      code: 'SELECTOR_NOT_APPROVED',
    },
    {
      candidate: {
        ...allowlist,
        approvedAssets: allowlist.approvedAssets.filter((asset) => asset !== firstAsset),
      },
      code: 'UNDECLARED_ASSET',
    },
  ];

  for (const { candidate, code } of cases) {
    const result = auditScopeChanges({
      rootDirectory: ROOT_DIRECTORY,
      allowlist: candidate,
      changedFiles: state.changedFiles,
    });
    assert.ok(
      result.violations.some((violation) => violation.code === code),
      code,
    );
    assert.throws(() => verifyExactAllowlist(candidate, state));
  }

  for (const widened of [
    { ...allowlist, approvedPaths: [...allowlist.approvedPaths, 'docs/README.md'].sort() },
    {
      ...allowlist,
      approvedSelectors: [
        ...allowlist.approvedSelectors,
        `${allowlist.approvedSelectors[0]} .widened`,
      ].sort(),
    },
    {
      ...allowlist,
      approvedAssets: [
        ...allowlist.approvedAssets,
        'app/public/assets/origami-chat/widened.webp',
      ].sort(),
      approvedPaths: [
        ...allowlist.approvedPaths,
        'app/public/assets/origami-chat/widened.webp',
      ].sort(),
    },
  ]) {
    assert.throws(() => verifyExactAllowlist(widened, state));
  }
});
