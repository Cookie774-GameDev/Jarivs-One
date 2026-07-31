import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseAddedLines } from './scan-added-lines.mjs';

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCANNER = path.join(import.meta.dirname, 'scan-added-lines.mjs');
const temporaryRoots = new Set();

function git(repository, args) {
  return execFileSync('git', args, {
    cwd: repository,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function makeRepository() {
  const repository = mkdtempSync(path.join(tmpdir(), 'vibespace-secret-scan-'));
  temporaryRoots.add(repository);
  git(repository, ['init', '--quiet']);
  git(repository, ['config', 'user.email', 'scanner@example.invalid']);
  git(repository, ['config', 'user.name', 'Scanner Test']);
  write(repository, 'README.md', 'baseline\n');
  git(repository, ['add', 'README.md']);
  git(repository, ['commit', '--quiet', '-m', 'baseline']);
  return repository;
}

function write(repository, relativePath, content) {
  const absolute = path.join(repository, ...relativePath.split('/'));
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
}

function scan(repository, args = []) {
  return spawnSync(process.execPath, [SCANNER, '--repo', repository, '--json', ...args], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
}

function parsed(result) {
  assert.equal(result.status, 0, 'scanner should exit cleanly');
  return JSON.parse(result.stdout);
}

function assertCandidateRedacted(result, candidates) {
  for (const candidate of candidates) {
    assert.equal(result.stdout.includes(candidate), false, 'stdout must redact candidate material');
    assert.equal(result.stderr.includes(candidate), false, 'stderr must redact candidate material');
  }
}

function assertFindingResult(result, candidates, expectedRules) {
  assert.equal(result.status, 2, 'findings use the dedicated exit code');
  assertCandidateRedacted(result, candidates);
  const report = JSON.parse(result.stdout);
  assert.equal(report.schemaVersion, 'vibespace.added-line-secret-scan.v1');
  assert.deepEqual(report.findings.map(({ ruleId }) => ruleId).sort(), [...expectedRules].sort());
  for (const finding of report.findings) {
    assert.match(finding.path, /^[^\\]/u);
    assert.equal(Number.isSafeInteger(finding.line) && finding.line > 0, true);
    assert.match(finding.fingerprint, /^[a-f0-9]{64}$/u);
    assert.deepEqual(Object.keys(finding).sort(), ['fingerprint', 'line', 'path', 'ruleId']);
  }
  return report;
}

test.after(() => {
  for (const root of temporaryRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

test('detects staged and unstaged structured credentials with added-side line numbers', () => {
  const repository = makeRepository();
  const openAi = `sk-${'proj'}-${'A'.repeat(48)}`;
  const stripe = `sk_${'live'}_${'b'.repeat(32)}`;
  const github = `gh${'p'}_${'C'.repeat(32)}`;
  const password = `Secur3!${'value'.repeat(4)}`;

  write(repository, 'unstaged.txt', 'first line\n');
  git(repository, ['add', 'unstaged.txt']);
  git(repository, ['commit', '--quiet', '-m', 'tracked fixture']);
  write(repository, 'staged.env', `safe=true\nOPENAI_API_KEY=${openAi}\nSTRIPE_SECRET=${stripe}\n`);
  git(repository, ['add', 'staged.env']);
  write(
    repository,
    'unstaged.txt',
    `first line\nGITHUB_TOKEN=${github}\npassword = "${password}"\n`,
  );

  const result = scan(repository);
  const report = assertFindingResult(
    result,
    [openAi, stripe, github, password],
    ['OPENAI_PROJECT_KEY', 'STRIPE_LIVE_SECRET', 'GITHUB_TOKEN', 'GENERIC_PASSWORD'],
  );
  assert.deepEqual(report.findings.map(({ path, line }) => `${path}:${line}`).sort(), [
    'staged.env:2',
    'staged.env:3',
    'unstaged.txt:2',
    'unstaged.txt:3',
  ]);
  assert.equal(report.mode, 'worktree');
  assert.match(report.binding.inputSha256, /^[a-f0-9]{64}$/u);
});

test('scans explicitly intended untracked credentials and never implicitly scans other untracked files', () => {
  const repository = makeRepository();
  const jwt = `${'eyJ'}${'A'.repeat(32)}.${'eyJ'}${'B'.repeat(32)}.${'C'.repeat(32)}`;
  const awsAccess = `AKIA${'D'.repeat(16)}`;
  const awsSecret = `${'eF4/'.repeat(10)}`;
  const privateHeader = `-----BEGIN ${'PRIVATE'} KEY-----`;
  const urlCredential = `https://user:${'Z9!'.repeat(8)}@example.invalid/path`;
  const ignored = `sk-${'proj'}-${'Q'.repeat(48)}`;
  write(
    repository,
    'intended secrets.txt',
    [
      `SUPABASE_SERVICE_ROLE_KEY=${jwt}`,
      `AWS_ACCESS_KEY_ID=${awsAccess}`,
      `AWS_SECRET_ACCESS_KEY=${awsSecret}`,
      privateHeader,
      urlCredential,
      '',
    ].join('\n'),
  );
  write(repository, 'not-intended.txt', `${ignored}\n`);

  const result = scan(repository, ['--include-untracked', 'intended secrets.txt']);
  assertCandidateRedacted(result, [
    jwt,
    awsAccess,
    awsSecret,
    privateHeader,
    urlCredential,
    ignored,
  ]);
  const report = assertFindingResult(
    result,
    [jwt, awsAccess, awsSecret, privateHeader, urlCredential],
    [
      'SUPABASE_SERVICE_ROLE_JWT',
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'PRIVATE_KEY_HEADER',
      'URL_CREDENTIALS',
    ],
  );
  assert.equal(report.inputs.untrackedFiles, 1);
  assert.equal(
    report.findings.some(({ path: findingPath }) => findingPath === 'not-intended.txt'),
    false,
  );
});

test('explicit base mode scans committed PR additions and binds the resolved base', () => {
  const repository = makeRepository();
  const base = git(repository, ['rev-parse', 'HEAD']);
  const github = `gh${'o'}_${'R'.repeat(36)}`;
  write(repository, 'committed.txt', `token=${github}\n`);
  git(repository, ['add', 'committed.txt']);
  git(repository, ['commit', '--quiet', '-m', 'PR change']);

  const result = scan(repository, ['--base', base]);
  const report = assertFindingResult(result, [github], ['GITHUB_TOKEN']);
  assert.equal(report.mode, 'base');
  assert.equal(report.base, base);
  assert.match(report.binding.trackedDiffSha256, /^[a-f0-9]{64}$/u);
});

test('ignores placeholders, empty values, environment references, deleted lines, and context lines', () => {
  const repository = makeRepository();
  const oldSecret = `sk-${'proj'}-${'S'.repeat(48)}`;
  write(
    repository,
    'config.txt',
    [
      `legacy=${oldSecret}`,
      'password = ""',
      'password = "${PASSWORD}"',
      'password = process.env.PASSWORD',
      'password = <set-me>',
      'stable=true',
      '',
    ].join('\n'),
  );
  write(repository, 'install/install.ps1', `${oldSecret}\n`);
  git(repository, ['add', '.']);
  git(repository, ['commit', '--quiet', '-m', 'existing values']);
  write(
    repository,
    'config.txt',
    [
      'password = ""',
      'password = "${PASSWORD}"',
      'password = process.env.PASSWORD',
      'password = <set-me>',
      'stable=true',
      'new_safe_line=true',
      '',
    ].join('\n'),
  );
  rmSync(path.join(repository, 'install', 'install.ps1'));

  const result = scan(repository);
  assertCandidateRedacted(result, [oldSecret]);
  const report = parsed(result);
  assert.equal(report.findings.length, 0);
});

test('does not classify JavaScript template expressions as literal credentials', () => {
  const repository = makeRepository();
  const passwordKey = ['pass', 'word'].join('');
  const interpolation = '${';
  const source = [
    `const ${passwordKey} = \`Secur3!${interpolation}'value'.repeat(4)}\`;`,
    `const url = \`https://user:${interpolation}'Z9!'.repeat(8)}@example.invalid\`;`,
    '',
  ].join('\n');
  write(repository, 'template-source.js', source);

  const result = scan(repository, ['--include-untracked', 'template-source.js']);
  assertCandidateRedacted(result, [source]);
  const report = parsed(result);
  assert.equal(report.findings.length, 0);
});

test('handles spaces, safe renames, and command-injection path text as inert argv data', () => {
  const repository = makeRepository();
  write(repository, 'old name.txt', 'safe\n');
  git(repository, ['add', 'old name.txt']);
  git(repository, ['commit', '--quiet', '-m', 'rename source']);
  const renamed = 'renamed $(owned); name.txt';
  git(repository, ['mv', 'old name.txt', renamed]);
  const stripe = `sk_${'live'}_${'T'.repeat(32)}`;
  write(repository, renamed, `safe\n${stripe}\n`);

  const result = scan(repository);
  const report = assertFindingResult(result, [stripe], ['STRIPE_LIVE_SECRET']);
  assert.equal(report.findings[0].path, renamed);
  assert.equal(report.findings[0].line, 2);
  assert.equal(existsSync(path.join(repository, 'owned')), false);
  assert.equal(
    Boolean(
      spawnSync(process.execPath, ['-e', 'process.exit(0)'], {
        cwd: repository,
        shell: false,
      }).error,
    ),
    false,
  );
});

test('skips proven binary inputs without leaking embedded candidate bytes', () => {
  const repository = makeRepository();
  const secret = `sk_${'live'}_${'U'.repeat(32)}`;
  const binary = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]), Buffer.from(secret)]);
  write(repository, 'image.bin', binary);

  const result = scan(repository, ['--include-untracked', 'image.bin']);
  assertCandidateRedacted(result, [secret]);
  const report = parsed(result);
  assert.equal(report.inputs.binaryFiles, 1);
  assert.equal(report.findings.length, 0);
});

test('excludes protected paths before reading even when explicitly requested', () => {
  const repository = makeRepository();
  const oversized = Buffer.alloc(1_100_000, 0x41);
  write(repository, 'app/pnpm-lock.yaml', oversized);
  write(repository, 'app/pnpm-workspace.yaml', oversized);
  write(repository, 'nested/_wprobe.txt', oversized);

  const result = scan(repository, [
    '--include-untracked',
    'app/pnpm-lock.yaml',
    '--include-untracked',
    'app/pnpm-workspace.yaml',
    '--include-untracked',
    'nested/_wprobe.txt',
    '--exclude',
    'install/install.ps1',
  ]);
  const report = parsed(result);
  assert.deepEqual(report.exclusions.sort(), [
    'app/pnpm-lock.yaml',
    'app/pnpm-workspace.yaml',
    'install/install.ps1',
    'nested/_wprobe.txt',
  ]);
  assert.equal(report.inputs.untrackedFiles, 0);
});

test('excludes modified tracked protected paths and never scans their added secrets', () => {
  const repository = makeRepository();
  write(repository, 'app/pnpm-lock.yaml', 'lockfileVersion: 9\n');
  write(repository, 'app/pnpm-workspace.yaml', 'packages: []\n');
  git(repository, ['add', 'app/pnpm-lock.yaml', 'app/pnpm-workspace.yaml']);
  git(repository, ['commit', '--quiet', '-m', 'protected baselines']);
  const stripe = 'sk_' + 'live_' + 'm'.repeat(32);
  const openAi = 'sk-' + 'proj-' + 'n'.repeat(48);
  write(repository, 'app/pnpm-lock.yaml', 'lockfileVersion: 9\n# ' + stripe + '\n');
  write(repository, 'app/pnpm-workspace.yaml', 'packages: []\n# ' + openAi + '\n');

  const result = scan(repository);
  assertCandidateRedacted(result, [stripe, openAi]);
  const report = parsed(result);
  assert.equal(report.findings.length, 0);
  assert.deepEqual(report.exclusions.sort(), ['app/pnpm-lock.yaml', 'app/pnpm-workspace.yaml']);
  assert.equal(report.inputs.trackedFiles, 0);
});

test('fails closed without revealing content for invalid base, unsupported text, and oversized text', () => {
  const repository = makeRepository();
  const secret = `sk-${'proj'}-${'V'.repeat(48)}`;
  write(repository, 'invalid.txt', Buffer.concat([Buffer.from(secret), Buffer.from([0xc3, 0x28])]));
  let result = scan(repository, ['--include-untracked', 'invalid.txt']);
  assert.equal(result.status, 3);
  assertCandidateRedacted(result, [secret]);

  write(repository, 'large.txt', Buffer.alloc(1_100_000, 0x61));
  result = scan(repository, ['--include-untracked', 'large.txt']);
  assert.equal(result.status, 3);

  const binarySecret = `sk_${'live'}_${'Y'.repeat(32)}`;
  const oversizedBinary = Buffer.alloc(5 * 1024 * 1024, 0);
  Buffer.from(binarySecret).copy(oversizedBinary, 32);
  write(repository, 'oversized.bin', oversizedBinary);
  result = scan(repository, ['--include-untracked', 'oversized.bin']);
  assert.equal(result.status, 3);
  assertCandidateRedacted(result, [binarySecret]);

  result = scan(repository, ['--base', '--not-a-revision']);
  assert.equal(result.status, 3);
  assert.equal(result.stderr.includes('--not-a-revision'), false);
});

test('allowlist accepts only exact justified fingerprints and fails on stale or duplicate entries', () => {
  const repository = makeRepository();
  const secret = `gh${'u'}_${'W'.repeat(32)}`;
  write(repository, 'fixture.txt', `${secret}\n`);
  let result = scan(repository, ['--include-untracked', 'fixture.txt']);
  const initial = assertFindingResult(result, [secret], ['GITHUB_TOKEN']);
  assert.equal(initial.binding.allowlist, null);
  const finding = initial.findings[0];
  write(
    repository,
    'allowlist.json',
    `${JSON.stringify({
      schemaVersion: 'vibespace.added-line-secret-allowlist.v1',
      entries: [{ ...finding, justification: 'Synthetic credential used by the scanner fixture.' }],
    })}\n`,
  );

  result = scan(repository, [
    '--include-untracked',
    'fixture.txt',
    '--allowlist',
    'allowlist.json',
  ]);
  const allowed = parsed(result);
  assertCandidateRedacted(result, [secret]);
  assert.equal(allowed.findings.length, 0);
  assert.equal(allowed.allowlist.used, 1);
  assert.deepEqual(Object.keys(allowed.binding.allowlist).sort(), [
    'entriesSha256',
    'path',
    'schemaVersion',
    'sha256',
  ]);
  assert.equal(allowed.binding.allowlist.path, 'allowlist.json');
  assert.match(allowed.binding.allowlist.sha256, /^[a-f0-9]{64}$/u);
  assert.match(allowed.binding.allowlist.entriesSha256, /^[a-f0-9]{64}$/u);
  const firstAllowlistInputBinding = allowed.binding.inputSha256;
  const firstAllowlistContentBinding = allowed.binding.allowlist.sha256;

  write(
    repository,
    'allowlist.json',
    `${JSON.stringify({
      schemaVersion: 'vibespace.added-line-secret-allowlist.v1',
      entries: [{ ...finding, justification: 'A changed, still justified synthetic exception.' }],
    })}\n`,
  );
  result = scan(repository, [
    '--include-untracked',
    'fixture.txt',
    '--allowlist',
    'allowlist.json',
  ]);
  const changedAllowlist = parsed(result);
  assertCandidateRedacted(result, [secret]);
  assert.notEqual(changedAllowlist.binding.inputSha256, firstAllowlistInputBinding);
  assert.notEqual(changedAllowlist.binding.allowlist.sha256, firstAllowlistContentBinding);

  const stale = { ...finding, fingerprint: '0'.repeat(64) };
  write(
    repository,
    'allowlist.json',
    JSON.stringify({
      schemaVersion: 'vibespace.added-line-secret-allowlist.v1',
      entries: [{ ...stale, justification: 'Stale synthetic fingerprint.' }],
    }),
  );
  result = scan(repository, [
    '--include-untracked',
    'fixture.txt',
    '--allowlist',
    'allowlist.json',
  ]);
  assert.equal(result.status, 3);
  assertCandidateRedacted(result, [secret]);

  write(
    repository,
    'allowlist.json',
    JSON.stringify({
      schemaVersion: 'vibespace.added-line-secret-allowlist.v1',
      entries: [{ ...finding, justification: '' }],
    }),
  );
  result = scan(repository, [
    '--include-untracked',
    'fixture.txt',
    '--allowlist',
    'allowlist.json',
  ]);
  assert.equal(result.status, 3);
  assertCandidateRedacted(result, [secret]);

  write(
    repository,
    'allowlist.json',
    JSON.stringify({
      schemaVersion: 'vibespace.added-line-secret-allowlist.v1',
      entries: [
        { ...finding, justification: 'First exact fixture exception.' },
        { ...finding, justification: 'Duplicate exact fixture exception.' },
      ],
    }),
  );
  result = scan(repository, [
    '--include-untracked',
    'fixture.txt',
    '--allowlist',
    'allowlist.json',
  ]);
  assert.equal(result.status, 3);
  assertCandidateRedacted(result, [secret]);

  write(
    repository,
    'allowlist.json',
    JSON.stringify({
      schemaVersion: 'vibespace.added-line-secret-allowlist.v1',
      entries: [
        { ...finding, justification: 'First exact fixture exception.' },
        {
          ...finding,
          line: finding.line + 1,
          justification: 'Conflicting fingerprint owner.',
        },
      ],
    }),
  );
  result = scan(repository, [
    '--include-untracked',
    'fixture.txt',
    '--allowlist',
    'allowlist.json',
  ]);
  assert.equal(result.status, 3);
  assertCandidateRedacted(result, [secret]);
});

test('rejects traversal, absolute, ambiguous, and non-untracked include paths without echoing them', () => {
  const repository = makeRepository();
  for (const candidatePath of [
    '../outside.txt',
    path.resolve(repository, 'absolute.txt'),
    'README.md',
  ]) {
    const result = scan(repository, ['--include-untracked', candidatePath]);
    assert.equal(result.status, 3);
    assert.equal(result.stdout.includes(candidatePath), false);
    assert.equal(result.stderr.includes(candidatePath), false);
  }
});

test(
  'matches explicit exclusions using Windows case-insensitive path identity',
  { skip: process.platform !== 'win32' },
  () => {
    const repository = makeRepository();
    const secret = `gh${'p'}_${'Z'.repeat(32)}`;
    write(repository, 'CaseSensitiveName.txt', `${secret}\n`);
    git(repository, ['add', 'CaseSensitiveName.txt']);

    const result = scan(repository, ['--exclude', 'casesensitivename.txt']);
    assertCandidateRedacted(result, [secret]);
    const report = parsed(result);
    assert.equal(report.findings.length, 0);
    assert.deepEqual(report.exclusions, ['casesensitivename.txt']);
  },
);

test('fails closed when diff content contains an addition outside a valid hunk', () => {
  const secret = `sk-${'proj'}-${'X'.repeat(48)}`;
  const malformed = Buffer.from(`diff --git a/file.txt b/file.txt\n+${secret}\n`);
  assert.throws(
    () => parseAddedLines('file.txt', malformed),
    (error) => error?.code === 'MALFORMED_DIFF',
    'an unframed addition must not be silently ignored',
  );
});
