#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const BASE_HEAD = 'd998bc9ea4842a0ef9a1fb6c1f33c5fd500bfc08';
export const TARGET_HEAD = '4912c802004a867dbf105cff2a2efb08d49470e6';

const commit = (sha, subject, files) =>
  Object.freeze({ sha, subject, files: Object.freeze(files) });
const changed = (status, path) => Object.freeze({ status, path });

export const REQUIRED_COMMITS = Object.freeze([
  commit(
    '631e8336f97e5bff86978db3278dbbae30a31fb8',
    'feat(schedule): disclose saved model identity',
    [
      changed('M', 'app/src/features/schedule/SchedulePage.jarvisLifecycle.test.tsx'),
      changed('M', 'app/src/features/schedule/SchedulePage.tsx'),
      changed('A', 'app/src/features/schedule/jarvisScheduleModelIdentity.test.ts'),
      changed('A', 'app/src/features/schedule/jarvisScheduleModelIdentity.ts'),
    ],
  ),
  commit(
    '0a6121e81fcdcbbc1b1a03212ad21a321fbf2015',
    'test(pr31): measure DeepSeek terminal latency',
    [
      changed('A', 'docs/operations/PR31_DEEPSEEK_NATIVE_TERMINAL_LATENCY_REPORT.json'),
      changed('A', 'scripts/pr31-deepseek-terminal-latency.mjs'),
      changed('A', 'scripts/pr31-deepseek-terminal-latency.test.mjs'),
    ],
  ),
  commit(
    'b2714b83172f70099dfd5ac9e88840c15c961a5f',
    'docs(pr31): verify native Workbench recovery',
    [changed('M', 'docs/operations/PR31_CORRECTIVE_COMPLETION_MATRIX.json')],
  ),
  commit('f03dd4bd079c7fb42241f4e16982decb2b744123', 'test(pr31): lock OpenCode refresh evidence', [
    changed('A', 'docs/operations/PR31_OPENCODE_REFRESH_RECONNECT_REPORT.json'),
    changed('A', 'scripts/pr31-opencode-refresh-reconnect-evidence.mjs'),
    changed('A', 'scripts/pr31-opencode-refresh-reconnect-evidence.test.mjs'),
  ]),
  commit(
    'ab708293f7435ece97ce462ac4ee2c7fb0150664',
    'feat(chat): animate structured mail and launches',
    [
      changed('M', 'app/src/features/chat/activity-ledger/AssistantActivityLedger.test.tsx'),
      changed('M', 'app/src/features/chat/activity-ledger/AssistantActivityLedger.tsx'),
      changed('M', 'app/src/features/chat/activity/types.ts'),
      changed('M', 'app/src/features/chat/agentic-console/AgentMotionIndicator.test.tsx'),
      changed('M', 'app/src/features/chat/agentic-console/AgentMotionIndicator.tsx'),
      changed('M', 'app/src/features/chat/agentic-console/agent-motion.css'),
      changed('M', 'app/src/lib/jarvis/executionJournal/legacyActivityProjection.test.ts'),
      changed('M', 'app/src/lib/jarvis/executionJournal/legacyActivityProjection.ts'),
    ],
  ),
  commit(
    '400564c750bf60da0c6c9827611ef4d76f7e3fd9',
    'docs(pr31): record structured motion and refresh gates',
    [changed('M', 'docs/operations/PR31_CORRECTIVE_COMPLETION_MATRIX.json')],
  ),
  commit(
    '2a15edc80cd737775b8f0a1fa1c6579436d3e189',
    'docs(pr31): record exact Chat pixel evidence',
    [changed('M', 'docs/operations/PR31_CORRECTIVE_COMPLETION_MATRIX.json')],
  ),
  commit(
    'f72d97469a9daca77714bace8ea0bd281d228d88',
    'fix(schedule): expose reminder selection state',
    [
      changed('M', 'app/src/features/schedule/SchedulePage.modelPicker.test.tsx'),
      changed('M', 'app/src/features/schedule/SchedulePage.tsx'),
    ],
  ),
  commit(
    '26c510b8fc9537507fba5bdd7a2a151ede22be8f',
    'feat(release): add offline Playwright runtime lifecycle',
    [
      changed('M', 'docs/oss/browser-agent-feature-pack.json'),
      changed('M', 'scripts/pr31-oss-bundle.mjs'),
      changed('M', 'scripts/pr31-oss-bundle.test.mjs'),
      changed('A', 'scripts/pr31-playwright-acceptance-runtime.mjs'),
      changed('A', 'scripts/pr31-playwright-acceptance-runtime.test.mjs'),
    ],
  ),
  commit(
    '7d24c52c9ebd08e73be275e9db8c9af7e22c9e76',
    'docs(pr31): record offline Playwright lifecycle',
    [changed('M', 'docs/operations/PR31_CORRECTIVE_COMPLETION_MATRIX.json')],
  ),
  commit(TARGET_HEAD, 'fix(prompt-forge): preserve exact unavailable routes', [
    changed('M', 'app/src/features/prompt-forge/modelSelection.test.ts'),
    changed('M', 'app/src/features/prompt-forge/modelSelection.ts'),
  ]),
]);

export const REQUIRED_COMMIT_SHAS = Object.freeze(REQUIRED_COMMITS.map(({ sha }) => sha));

const fileMetadata = (status, kind, gateIds) => Object.freeze({ status, kind, gateIds });
export const FILE_METADATA = Object.freeze({
  'app/src/features/chat/activity-ledger/AssistantActivityLedger.test.tsx': fileMetadata(
    'M',
    'product-test',
    ['structured-chat-motion'],
  ),
  'app/src/features/chat/activity-ledger/AssistantActivityLedger.tsx': fileMetadata(
    'M',
    'product-source',
    ['structured-chat-motion'],
  ),
  'app/src/features/chat/activity/types.ts': fileMetadata('M', 'product-source', [
    'structured-chat-motion',
  ]),
  'app/src/features/chat/agentic-console/AgentMotionIndicator.test.tsx': fileMetadata(
    'M',
    'product-test',
    ['structured-chat-motion'],
  ),
  'app/src/features/chat/agentic-console/AgentMotionIndicator.tsx': fileMetadata(
    'M',
    'product-source',
    ['structured-chat-motion'],
  ),
  'app/src/features/chat/agentic-console/agent-motion.css': fileMetadata('M', 'product-style', [
    'structured-chat-motion',
  ]),
  'app/src/features/prompt-forge/modelSelection.test.ts': fileMetadata('M', 'product-test', [
    'prompt-forge-exact-route',
  ]),
  'app/src/features/prompt-forge/modelSelection.ts': fileMetadata('M', 'product-source', [
    'prompt-forge-exact-route',
  ]),
  'app/src/features/schedule/SchedulePage.jarvisLifecycle.test.tsx': fileMetadata(
    'M',
    'product-test',
    ['schedule-identity-reminders'],
  ),
  'app/src/features/schedule/SchedulePage.modelPicker.test.tsx': fileMetadata('M', 'product-test', [
    'schedule-identity-reminders',
  ]),
  'app/src/features/schedule/SchedulePage.tsx': fileMetadata('M', 'product-source', [
    'schedule-identity-reminders',
  ]),
  'app/src/features/schedule/jarvisScheduleModelIdentity.test.ts': fileMetadata(
    'A',
    'product-test',
    ['schedule-identity-reminders'],
  ),
  'app/src/features/schedule/jarvisScheduleModelIdentity.ts': fileMetadata('A', 'product-source', [
    'schedule-identity-reminders',
  ]),
  'app/src/lib/jarvis/executionJournal/legacyActivityProjection.test.ts': fileMetadata(
    'M',
    'product-test',
    ['structured-chat-motion'],
  ),
  'app/src/lib/jarvis/executionJournal/legacyActivityProjection.ts': fileMetadata(
    'M',
    'product-source',
    ['structured-chat-motion'],
  ),
  'docs/operations/PR31_CORRECTIVE_COMPLETION_MATRIX.json': fileMetadata('M', 'matrix-report', [
    'corrective-matrix',
  ]),
  'docs/operations/PR31_DEEPSEEK_NATIVE_TERMINAL_LATENCY_REPORT.json': fileMetadata(
    'A',
    'evidence-report',
    ['deepseek-latency-contract'],
  ),
  'docs/operations/PR31_OPENCODE_REFRESH_RECONNECT_REPORT.json': fileMetadata(
    'A',
    'evidence-report',
    ['opencode-refresh-contract'],
  ),
  'docs/oss/browser-agent-feature-pack.json': fileMetadata('M', 'oss-metadata', [
    'playwright-offline-lifecycle',
  ]),
  'scripts/pr31-deepseek-terminal-latency.mjs': fileMetadata('A', 'script-source', [
    'deepseek-latency-contract',
  ]),
  'scripts/pr31-deepseek-terminal-latency.test.mjs': fileMetadata('A', 'script-test', [
    'deepseek-latency-contract',
  ]),
  'scripts/pr31-opencode-refresh-reconnect-evidence.mjs': fileMetadata('A', 'script-source', [
    'opencode-refresh-contract',
  ]),
  'scripts/pr31-opencode-refresh-reconnect-evidence.test.mjs': fileMetadata('A', 'script-test', [
    'opencode-refresh-contract',
  ]),
  'scripts/pr31-oss-bundle.mjs': fileMetadata('M', 'script-source', [
    'playwright-offline-lifecycle',
  ]),
  'scripts/pr31-oss-bundle.test.mjs': fileMetadata('M', 'script-test', [
    'playwright-offline-lifecycle',
  ]),
  'scripts/pr31-playwright-acceptance-runtime.mjs': fileMetadata('A', 'script-source', [
    'playwright-offline-lifecycle',
  ]),
  'scripts/pr31-playwright-acceptance-runtime.test.mjs': fileMetadata('A', 'script-test', [
    'playwright-offline-lifecycle',
  ]),
});

export const REQUIRED_CHANGED_PATHS = Object.freeze(Object.keys(FILE_METADATA).sort());
export const REQUIRED_FOCUSED_GATE_IDS = Object.freeze([
  'corrective-matrix',
  'deepseek-latency-contract',
  'opencode-refresh-contract',
  'playwright-offline-lifecycle',
  'prompt-forge-exact-route',
  'schedule-identity-reminders',
  'structured-chat-motion',
]);
export const REQUIRED_CROSS_CUTTING_GATE_IDS = Object.freeze([
  'delta-diff-check',
  'delta-secret-scan',
  'delta-source-digests',
  'oss-contract',
  'production-build',
  'release-regression',
  'typecheck',
  'updater-signature',
]);
export const REQUIRED_PROTECTED_FAILURES = Object.freeze([
  Object.freeze({ path: 'app/src/App.kernelHost.test.tsx', failedTests: 1 }),
  Object.freeze({ path: 'app/src/lib/ai/featureOpenCodeParity.test.ts', failedTests: 1 }),
  Object.freeze({ path: 'app/src/lib/ai/runtime.test.ts', failedTests: 65 }),
]);
export const REQUIRED_PREEXISTING_CROSS_GATE_FAILURES = Object.freeze([
  Object.freeze({
    id: 'ordinary-native-authority-hash',
    testPath: 'scripts/release-native-file-command-authority.test.mjs',
    sourcePath: 'app/src-tauri/src/lib.rs',
    failedTests: 1,
    baseSourceSha256: '81e745ee4dfaa1aafe20449bdfeaf6e2ee1a8a019969d9200e157a4eaa2e9d13',
    targetSourceSha256: '81e745ee4dfaa1aafe20449bdfeaf6e2ee1a8a019969d9200e157a4eaa2e9d13',
    testSha256: '2124fef10d881fcbe501a30911354d02fd1c01d876c7b172175e779fb272f571',
    authorityActualSha256: '5b61cb41922597c71dea8cd6b5edb52f151daf85b4231dab37f1099b43feaef4',
    authorityExpectedSha256: 'e4e173c63b356b3adda37dc67826c2333906da21fb3cc8a14e4242d57a8f4f7f',
    handlerActualSha256: '9eddbd22655fe76a35c57d762e132f31091990cd40490e11370c1c918ffcbdaa',
    handlerExpectedSha256: '9a5a6571238380d8c44f61bd984d65b2a40bc43d5298a17d8cf801069fc483f0',
  }),
]);

const DEFAULT_REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPORT_PATH = new URL(
  '../docs/operations/PR31_CONTINUATION_DELTA_GATE_REPORT.json',
  import.meta.url,
);
const FORBIDDEN_KEYS = new Set([
  'apikey',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'credentialvalue',
  'rawlog',
  'rawoutput',
  'secret',
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactStringSet(actual, expected) {
  if (!Array.isArray(actual) || actual.some((entry) => typeof entry !== 'string')) return false;
  if (new Set(actual).size !== actual.length || actual.length !== expected.length) return false;
  const values = new Set(actual);
  return expected.every((entry) => values.has(entry));
}

function exactOrderedStrings(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((entry, index) => entry === expected[index])
  );
}

function forbiddenKeys(value, path = '$', findings = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => forbiddenKeys(entry, `${path}[${index}]`, findings));
    return findings;
  }
  if (!isRecord(value)) return findings;
  for (const [key, entry] of Object.entries(value)) {
    const normalized = key.replace(/[^a-z0-9]/giu, '').toLowerCase();
    if (FORBIDDEN_KEYS.has(normalized)) findings.push(`${path}.${key}`);
    forbiddenKeys(entry, `${path}.${key}`, findings);
  }
  return findings;
}

function validCommands(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => typeof entry === 'string' && entry.trim().length > 10)
  );
}

function protectedCommandReference(commands) {
  const joined = commands.join('\n').toLowerCase();
  return REQUIRED_PROTECTED_FAILURES.find(({ path }) =>
    joined.includes(path.replace(/^app\//u, '').toLowerCase()),
  );
}

export function validateContinuationDeltaReport(report) {
  const issues = [];
  if (!isRecord(report)) return { ok: false, issues: ['report must be an object'] };

  if (report.schemaVersion !== 1) issues.push('schemaVersion must be 1');
  if (report.suiteId !== 'pr31-continuation-delta-gate-v1') {
    issues.push('suiteId must identify the continuation delta gate');
  }
  if (report.baseHead !== BASE_HEAD || report.targetHead !== TARGET_HEAD) {
    issues.push('report must pin the exact base and target heads');
  }
  if (
    report.status !== 'passed-with-protected-baseline-failures' ||
    report.completionClaimed !== false ||
    report.releaseReady !== false
  ) {
    issues.push('protected failures require a fail-closed completion/release overclaim boundary');
  }

  const commits = report.range?.commits;
  if (
    report.range?.commitCount !== REQUIRED_COMMITS.length ||
    !exactOrderedStrings(
      commits?.map((entry) => entry?.sha),
      REQUIRED_COMMIT_SHAS,
    )
  ) {
    issues.push('range must contain the exact ordered commits');
  } else {
    for (let index = 0; index < REQUIRED_COMMITS.length; index += 1) {
      const actual = commits[index];
      const expected = REQUIRED_COMMITS[index];
      if (
        actual.subject !== expected.subject ||
        JSON.stringify(actual.files) !== JSON.stringify(expected.files)
      ) {
        issues.push(`${expected.sha} must retain its exact subject and changed files`);
      }
    }
  }

  const changedFiles = report.changedFiles;
  if (
    report.range?.changedFileCount !== REQUIRED_CHANGED_PATHS.length ||
    !exactStringSet(
      changedFiles?.map((entry) => entry?.path),
      REQUIRED_CHANGED_PATHS,
    )
  ) {
    issues.push('report must enumerate the exact changed files');
  } else {
    for (const file of changedFiles) {
      const expected = FILE_METADATA[file.path];
      if (
        file.status !== expected.status ||
        file.kind !== expected.kind ||
        !exactStringSet(file.gateIds, expected.gateIds) ||
        !/^[0-9a-f]{64}$/u.test(file.sha256 ?? '')
      ) {
        issues.push(`${file.path} has an invalid status, kind, gate mapping, or digest`);
      }
    }
  }

  const focused = report.focusedEvidence;
  if (
    !exactStringSet(
      focused?.map((gate) => gate?.id),
      REQUIRED_FOCUSED_GATE_IDS,
    )
  ) {
    issues.push('focused evidence must cover every exact affected-system gate');
  } else {
    for (const gate of focused) {
      const protectedReference = protectedCommandReference(gate.commands ?? []);
      if (
        gate.status !== 'passed' ||
        gate.freshness !== 'fresh-post-change' ||
        gate.failed !== 0 ||
        !Number.isSafeInteger(gate.testCount) ||
        gate.testCount <= 0 ||
        !validCommands(gate.commands) ||
        !REQUIRED_COMMIT_SHAS.includes(gate.sourceCommit) ||
        typeof gate.evidenceRef !== 'string' ||
        gate.evidenceRef.length < 20
      ) {
        issues.push(`${gate.id} has incomplete fresh focused evidence`);
      }
      if (protectedReference) {
        issues.push(`${gate.id} illegally reruns protected file ${protectedReference.path}`);
      }
    }
  }

  if (
    report.executionPolicy?.affectedMatricesAlreadyFresh !== true ||
    report.executionPolicy?.unaffectedMatricesRerun !== false ||
    report.executionPolicy?.protectedBaselineRerun !== false ||
    !Array.isArray(report.executionPolicy?.notYetFreshAffectedMatrices) ||
    report.executionPolicy.notYetFreshAffectedMatrices.length !== 0
  ) {
    issues.push(
      'execution policy must reuse fresh affected matrices and skip protected/unaffected sets',
    );
  }

  const crossCutting = report.crossCuttingEvidence;
  if (
    !exactStringSet(
      crossCutting?.map((gate) => gate?.id),
      REQUIRED_CROSS_CUTTING_GATE_IDS,
    )
  ) {
    issues.push('cross-cutting evidence must cover every required gate');
  } else {
    for (const gate of crossCutting) {
      const protectedReference = protectedCommandReference(gate.commands ?? []);
      if (
        gate.status !== 'passed' ||
        gate.exitCode !== 0 ||
        !validCommands(gate.commands) ||
        typeof gate.observedAt !== 'string' ||
        Number.isNaN(Date.parse(gate.observedAt))
      ) {
        issues.push(`${gate.id} has incomplete cross-cutting pass evidence`);
      }
      if (protectedReference) {
        issues.push(`${gate.id} illegally reruns protected file ${protectedReference.path}`);
      }
    }
  }

  const protectedBaseline = report.protectedBaseline;
  if (
    protectedBaseline?.status !== 'preserved-not-rerun' ||
    protectedBaseline?.rerun !== false ||
    protectedBaseline?.unchangedAcrossDelta !== true ||
    protectedBaseline?.totalFailedTests !== 67 ||
    !Array.isArray(protectedBaseline?.commands) ||
    protectedBaseline.commands.length !== 0 ||
    JSON.stringify(
      protectedBaseline?.files?.map(({ path, failedTests }) => ({ path, failedTests })),
    ) !== JSON.stringify(REQUIRED_PROTECTED_FAILURES)
  ) {
    issues.push('protected baseline must preserve the exact unchanged 3-file/67-failure boundary');
  }
  for (const file of protectedBaseline?.files ?? []) {
    if (!/^[0-9a-f]{64}$/u.test(file.sha256 ?? '')) {
      issues.push(`${file.path ?? 'protected file'} must include its target-commit digest`);
    }
  }

  const preexistingCrossGate = report.preexistingCrossGateFailures;
  if (
    preexistingCrossGate?.status !== 'preserved-pre-existing-not-fixed' ||
    preexistingCrossGate?.totalFailedTests !== 1 ||
    !Array.isArray(preexistingCrossGate?.entries) ||
    preexistingCrossGate.entries.length !== REQUIRED_PREEXISTING_CROSS_GATE_FAILURES.length
  ) {
    issues.push('pre-existing cross-gate failures must remain explicit and fail closed');
  } else {
    for (let index = 0; index < REQUIRED_PREEXISTING_CROSS_GATE_FAILURES.length; index += 1) {
      const actual = preexistingCrossGate.entries[index];
      const expected = REQUIRED_PREEXISTING_CROSS_GATE_FAILURES[index];
      for (const [key, value] of Object.entries(expected)) {
        if (actual?.[key] !== value) {
          issues.push(`${expected.id} must retain its exact ${key} evidence`);
        }
      }
      if (
        actual?.rerunDuringDeltaGate !== true ||
        actual?.fixedDuringDeltaGate !== false ||
        typeof actual?.observedAt !== 'string' ||
        Number.isNaN(Date.parse(actual.observedAt)) ||
        actual?.command !== `node --test ${expected.testPath}` ||
        typeof actual?.ownershipBlocker !== 'string' ||
        actual.ownershipBlocker.length < 20
      ) {
        issues.push(
          `${expected.id} must record the bounded rerun and ownership blocker truthfully`,
        );
      }
    }
  }

  const safety = report.safety;
  if (
    safety?.ollamaAllowed !== false ||
    safety?.port11434Allowed !== false ||
    safety?.processControlAllowed !== false ||
    safety?.credentialsMayChange !== false ||
    safety?.productionMayChange !== false ||
    safety?.remoteMayChange !== false
  ) {
    issues.push(
      'safety must forbid Ollama/11434, process control, credentials, production, and remote mutation',
    );
  }
  const sensitive = forbiddenKeys(report);
  if (sensitive.length > 0)
    issues.push(`sensitive report keys are forbidden: ${sensitive.join(', ')}`);

  return { ok: issues.length === 0, issues };
}

function gitText(repositoryRoot, args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  }).trim();
}

function parseNameStatus(output) {
  if (!output) return [];
  return output.split(/\r?\n/u).map((line) => {
    const [status, path] = line.split('\t');
    return { status, path };
  });
}

function gitBlobDigest(repositoryRoot, head, path) {
  const content = execFileSync('git', ['show', `${head}:${path}`], {
    cwd: repositoryRoot,
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  return createHash('sha256').update(content).digest('hex');
}

export async function validateContinuationDeltaRepository(
  report,
  { repositoryRoot = DEFAULT_REPOSITORY_ROOT } = {},
) {
  const issues = [];
  try {
    const actualCommits = gitText(repositoryRoot, [
      'rev-list',
      '--reverse',
      `${BASE_HEAD}..${TARGET_HEAD}`,
    ]).split(/\r?\n/u);
    if (!exactOrderedStrings(actualCommits, REQUIRED_COMMIT_SHAS)) {
      issues.push('repository commit range does not match the report contract');
    }
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', TARGET_HEAD, 'HEAD'], {
        cwd: repositoryRoot,
        stdio: 'ignore',
        windowsHide: true,
      });
    } catch {
      issues.push('target head is not an ancestor of current HEAD');
    }

    for (const expected of REQUIRED_COMMITS) {
      const actual = parseNameStatus(
        gitText(repositoryRoot, [
          'diff-tree',
          '--no-commit-id',
          '--no-renames',
          '--name-status',
          '-r',
          expected.sha,
        ]),
      );
      if (JSON.stringify(actual) !== JSON.stringify(expected.files)) {
        issues.push(`${expected.sha} repository changed-file manifest mismatch`);
      }
    }

    const aggregate = parseNameStatus(
      gitText(repositoryRoot, [
        'diff',
        '--no-renames',
        '--name-status',
        `${BASE_HEAD}..${TARGET_HEAD}`,
      ]),
    );
    const expectedAggregate = REQUIRED_CHANGED_PATHS.map((path) => ({
      status: FILE_METADATA[path].status,
      path,
    }));
    if (JSON.stringify(aggregate) !== JSON.stringify(expectedAggregate)) {
      issues.push('repository aggregate changed files do not match the exact delta contract');
    }

    for (const file of report?.changedFiles ?? []) {
      if (typeof file.path !== 'string') continue;
      const actual = gitBlobDigest(repositoryRoot, TARGET_HEAD, file.path);
      if (file.sha256 !== actual) issues.push(`${file.path} digest mismatch at target commit`);
    }

    const protectedPaths = REQUIRED_PROTECTED_FAILURES.map(({ path }) => path);
    const protectedDiff = gitText(repositoryRoot, [
      'diff',
      '--name-only',
      `${BASE_HEAD}..${TARGET_HEAD}`,
      '--',
      ...protectedPaths,
    ]);
    if (protectedDiff) issues.push('protected failure files changed across the continuation delta');
    for (const file of report?.protectedBaseline?.files ?? []) {
      const actual = gitBlobDigest(repositoryRoot, TARGET_HEAD, file.path);
      if (file.sha256 !== actual) issues.push(`${file.path} protected digest mismatch`);
    }

    for (const failure of report?.preexistingCrossGateFailures?.entries ?? []) {
      const sourceBase = gitBlobDigest(repositoryRoot, BASE_HEAD, failure.sourcePath);
      const sourceTarget = gitBlobDigest(repositoryRoot, TARGET_HEAD, failure.sourcePath);
      const testBase = gitBlobDigest(repositoryRoot, BASE_HEAD, failure.testPath);
      const testTarget = gitBlobDigest(repositoryRoot, TARGET_HEAD, failure.testPath);
      if (
        sourceBase !== failure.baseSourceSha256 ||
        sourceTarget !== failure.targetSourceSha256 ||
        sourceBase !== sourceTarget
      ) {
        issues.push(`${failure.id} source must be unchanged and digest-bound across the delta`);
      }
      if (testBase !== failure.testSha256 || testTarget !== failure.testSha256) {
        issues.push(`${failure.id} test must be unchanged and digest-bound across the delta`);
      }
    }
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }
  return { ok: issues.length === 0, issues };
}

async function main() {
  const report = JSON.parse(await readFile(REPORT_PATH, 'utf8'));
  const reportValidation = validateContinuationDeltaReport(report);
  const repositoryValidation = await validateContinuationDeltaRepository(report);
  const issues = [...reportValidation.issues, ...repositoryValidation.issues];
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: issues.length === 0,
        baseHead: BASE_HEAD,
        targetHead: TARGET_HEAD,
        commitCount: REQUIRED_COMMITS.length,
        changedFileCount: REQUIRED_CHANGED_PATHS.length,
        protectedFailedTests: 67,
        issues,
      },
      null,
      2,
    )}\n`,
  );
  if (issues.length > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
