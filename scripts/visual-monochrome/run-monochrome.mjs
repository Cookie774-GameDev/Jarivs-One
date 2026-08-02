#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MONOCHROME_ROUTE_COVERAGE_MANIFEST } from '../../tests/visual/monochrome/route-manifest.ts';
import {
  BROWSER_CASES as SPEC_BROWSER_CASES,
  validateBrowserProjection,
} from '../../tests/visual/monochrome/styleMetrics.ts';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const APP_REGRESSION_COMMAND = 'npm --prefix app test -- --maxWorkers=1 --minWorkers=1';
const PROFILE = 'monochrome-visual-test';
const CAPABILITY = 'monochrome-test';
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const APP_IDENTIFIER_PATTERN = /^ai\.vibespace\.monochrome\.test[a-f0-9]+$/u;
const EVIDENCE_SCHEMA = 'vibespace.monochrome.native-evidence.v1';
const DENIED_EFFECT_MANIFEST = '24d75985399db9fb179ac64a10b982801fcb7681bf3f13a5a62d2340fa04850c';
const CHILD_PROCESS_TIMEOUT_MS = 45 * 60 * 1_000;
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/u;
const DENIED_EFFECT_NAMES = Object.freeze([
  'notification',
  'processRelaunch',
  'updater',
  'shellOpen',
  'externalHttp',
  'keychain',
  'registry',
  'launcher',
  'tray',
  'singleInstance',
  'globalShortcut',
  'deepLink',
  'autostart',
]);
const ALLOWED_NODE_TESTS = new Set([
  'tests/visual/monochrome/native-window-manifest.test.ts',
  'tests/visual/monochrome/route-manifest.test.ts',
  'tests/visual/monochrome/shell-overlay-manifest.test.ts',
]);

export const REQUIRED_COMPILE_ENVIRONMENT = Object.freeze([
  'VITE_VIBESPACE_RUNTIME_PROFILE',
  'VITE_VIBESPACE_MONOCHROME_APP_IDENTIFIER',
  'VITE_VIBESPACE_MONOCHROME_CAPABILITY_IDENTIFIER',
  'VITE_VIBESPACE_MONOCHROME_SESSION_NONCE_HASH',
]);

export const BROWSER_CASES = Object.freeze(
  MONOCHROME_ROUTE_COVERAGE_MANIFEST.entries
    .filter(({ availability }) => availability !== 'native-only' && availability !== 'unavailable')
    .map(({ id, kind, routeId, fixture }) =>
      Object.freeze({
        fixtureHash: fixture.sha256,
        fixtureId: fixture.id,
        id,
        kind,
        routeId,
      }),
    ),
);

export const NATIVE_CASE_IDS = Object.freeze(
  MONOCHROME_ROUTE_COVERAGE_MANIFEST.entries
    .filter(({ availability }) => availability === 'native-only')
    .map(({ id }) => id),
);

export const UNAVAILABLE_CASE_ID = MONOCHROME_ROUTE_COVERAGE_MANIFEST.entries.find(
  ({ availability }) => availability === 'unavailable',
)?.id;

export function validateProductionBrowserProjection(projected = SPEC_BROWSER_CASES) {
  validateBrowserProjection(projected, BROWSER_CASES);
  return projected.length;
}

function commandIdentity(command) {
  return createHash('sha256').update(command).digest('hex');
}

function parseAllowlistedCommand(command) {
  if (command === APP_REGRESSION_COMMAND) {
    return {
      executable: process.platform === 'win32' ? 'npm.cmd' : 'npm',
      args: ['--prefix', 'app', 'test', '--', '--maxWorkers=1', '--minWorkers=1'],
    };
  }

  const focused =
    /^npm --prefix app test -- (src\/[A-Za-z0-9_./-]+\.(?:test|spec)\.[cm]?[jt]sx?) --maxWorkers=1 --minWorkers=1$/u.exec(
      command,
    );
  if (focused) {
    const testPath = focused[1];
    const normalized = path.posix.normalize(testPath);
    const relative = path.posix.relative('src', normalized);
    if (
      normalized === testPath &&
      relative !== '' &&
      !relative.startsWith('../') &&
      relative !== '..' &&
      !path.posix.isAbsolute(relative)
    ) {
      return {
        executable: process.platform === 'win32' ? 'npm.cmd' : 'npm',
        args: ['--prefix', 'app', 'test', '--', testPath, '--maxWorkers=1', '--minWorkers=1'],
      };
    }
  }

  const nodeTest = /^node --test (tests\/visual\/monochrome\/[A-Za-z0-9_.-]+\.test\.ts)$/u.exec(
    command,
  );
  if (nodeTest && ALLOWED_NODE_TESTS.has(nodeTest[1])) {
    return { executable: process.execPath, args: ['--test', nodeTest[1]] };
  }

  throw new Error(`behavior command is not allowlisted: ${command}`);
}

export function buildBehaviorExecutionPlan(entries) {
  const unavailable = entries.filter(({ availability }) => availability === 'unavailable');
  if (unavailable.length !== 1 || unavailable[0].id !== 'future:messaging-channels') {
    throw new Error('coverage authority must contain exactly the unavailable messaging row');
  }
  const available = entries.filter(({ availability }) => availability !== 'unavailable');
  const direct = available.filter(
    ({ behaviorCommands }) => !behaviorCommands.includes(APP_REGRESSION_COMMAND),
  );
  const aggregate = available.filter(({ behaviorCommands }) =>
    behaviorCommands.includes(APP_REGRESSION_COMMAND),
  );
  if (available.length !== 85 || direct.length !== 37 || aggregate.length !== 48) {
    throw new Error(
      `behavior authority drift: available=${available.length}, direct=${direct.length}, aggregate=${aggregate.length}`,
    );
  }

  const byCommand = new Map();
  for (const coverageCase of available) {
    if (
      !coverageCase.behaviorCommands.some((command) =>
        command.startsWith('npm --prefix app test --'),
      )
    ) {
      throw new Error(`available case has no functional command: ${coverageCase.id}`);
    }
    for (const command of coverageCase.behaviorCommands) {
      const parsed = parseAllowlistedCommand(command);
      const existing = byCommand.get(command);
      if (existing) {
        existing.caseIds.push(coverageCase.id);
        continue;
      }
      byCommand.set(command, {
        ...parsed,
        command,
        commandId: commandIdentity(command),
        caseIds: [coverageCase.id],
      });
    }
  }

  return Object.freeze({
    aggregateCaseCount: aggregate.length,
    availableCaseCount: available.length,
    directCaseCount: direct.length,
    executions: Object.freeze(
      [...byCommand.values()].map((execution) =>
        Object.freeze({
          ...execution,
          caseIds: Object.freeze([...execution.caseIds].sort()),
        }),
      ),
    ),
    unavailableCaseId: unavailable[0].id,
  });
}

export function executeChildProcess({ executable, args, timeoutMs = CHILD_PROCESS_TIMEOUT_MS }) {
  const result = spawnSync(executable, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: process.env,
    killSignal: 'SIGTERM',
    shell: false,
    timeout: timeoutMs,
    windowsHide: true,
  });
  return {
    args,
    executable,
    exitCode: result.status,
    signal: result.signal,
    spawnErrorCode:
      typeof result.error?.code === 'string' && ERROR_CODE_PATTERN.test(result.error.code)
        ? result.error.code
        : result.error
          ? 'UNKNOWN'
          : null,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
    timedOut: result.error?.code === 'ETIMEDOUT',
  };
}

function outputEvidence(value) {
  const text = typeof value === 'string' ? value : '';
  return {
    bytes: Buffer.byteLength(text),
    sha256: createHash('sha256').update(text).digest('hex'),
  };
}

function executionOutcome(result) {
  const rawErrorCode = result?.spawnErrorCode ?? result?.error?.code ?? null;
  const spawnErrorCode =
    rawErrorCode === null
      ? null
      : typeof rawErrorCode === 'string' && ERROR_CODE_PATTERN.test(rawErrorCode)
        ? rawErrorCode
        : 'UNKNOWN';
  const timedOut = result?.timedOut === true || spawnErrorCode === 'ETIMEDOUT';
  const exitCode = Number.isInteger(result?.exitCode) ? result.exitCode : null;
  const signal = typeof result?.signal === 'string' ? result.signal : null;
  const passed =
    exitCode === 0 && result?.signal === null && spawnErrorCode === null && timedOut === false;
  return {
    exitCode,
    signal,
    spawnErrorCode,
    status: passed ? 'passed' : 'failed',
    timedOut,
  };
}

export function executeBehaviorPlan(plan, executor = executeChildProcess) {
  const results = [];
  for (const execution of plan.executions) {
    const startedAt = new Date().toISOString();
    const result = executor(execution);
    const outcome = executionOutcome(result);
    const stdout = outputEvidence(result.stdout);
    const stderr = outputEvidence(result.stderr);
    results.push(
      Object.freeze({
        args: Object.freeze([...(result.args ?? execution.args)]),
        caseIds: execution.caseIds,
        command: execution.command,
        commandId: execution.commandId,
        executable: result.executable ?? execution.executable,
        exitCode: outcome.exitCode,
        finishedAt: new Date().toISOString(),
        signal: outcome.signal,
        spawnErrorCode: outcome.spawnErrorCode,
        startedAt,
        status: outcome.status,
        stderrBytes: stderr.bytes,
        stderrSha256: stderr.sha256,
        stdoutBytes: stdout.bytes,
        stdoutSha256: stdout.sha256,
        timedOut: outcome.timedOut,
      }),
    );
  }
  return Object.freeze({
    aggregateCaseCount: plan.aggregateCaseCount,
    availableCaseCount: plan.availableCaseCount,
    directCaseCount: plan.directCaseCount,
    results: Object.freeze(results),
    status:
      results.length === plan.executions.length &&
      results.every(({ status }) => status === 'passed')
        ? 'passed'
        : 'failed',
    unavailableCaseId: plan.unavailableCaseId,
  });
}

export function validateRuntimeHandshake(environment, nativeEvidence) {
  for (const name of REQUIRED_COMPILE_ENVIRONMENT) {
    if (typeof environment[name] !== 'string' || environment[name].length === 0) {
      throw new Error(`missing required compile variable: ${name}`);
    }
  }
  const expected = {
    appIdentifier: environment.VITE_VIBESPACE_MONOCHROME_APP_IDENTIFIER,
    capabilityIdentifier: environment.VITE_VIBESPACE_MONOCHROME_CAPABILITY_IDENTIFIER,
    profile: environment.VITE_VIBESPACE_RUNTIME_PROFILE,
    sessionNonceHash: environment.VITE_VIBESPACE_MONOCHROME_SESSION_NONCE_HASH,
  };
  if (expected.profile !== PROFILE) throw new Error('profile compile variable mismatch');
  if (!APP_IDENTIFIER_PATTERN.test(expected.appIdentifier)) {
    throw new Error('appIdentifier compile variable mismatch');
  }
  if (expected.capabilityIdentifier !== CAPABILITY) {
    throw new Error('capabilityIdentifier compile variable mismatch');
  }
  if (!HASH_PATTERN.test(expected.sessionNonceHash)) {
    throw new Error('sessionNonceHash compile variable mismatch');
  }
  for (const field of ['profile', 'appIdentifier', 'capabilityIdentifier', 'sessionNonceHash']) {
    if (nativeEvidence?.[field] !== expected[field]) {
      throw new Error(`${field} native handshake mismatch`);
    }
  }
  return Object.freeze(expected);
}

function rejectRunnerAdmission(reason) {
  throw new Error(`runner admission rejected: ${reason}`);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireExactKeys(value, expectedKeys, label, ordered = false) {
  if (!isRecord(value)) rejectRunnerAdmission(`${label} must be an object`);
  const actualKeys = Object.keys(value);
  const keysMatch =
    actualKeys.length === expectedKeys.length &&
    (ordered
      ? actualKeys.every((key, index) => key === expectedKeys[index])
      : expectedKeys.every((key) => Object.hasOwn(value, key)));
  if (!keysMatch) rejectRunnerAdmission(`${label} keys are incomplete or unexpected`);
}

function requireStatus(value, expected, label) {
  if (!isRecord(value) || value.status !== expected) {
    rejectRunnerAdmission(`${label} status must be ${expected}`);
  }
}

function requireLowercaseHash(value, label) {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    rejectRunnerAdmission(`${label} must be a lowercase SHA-256 value`);
  }
}

function requireHandshake(environment, evidence, label) {
  requireExactKeys(
    evidence,
    ['profile', 'appIdentifier', 'capabilityIdentifier', 'sessionNonceHash'],
    label,
  );
  try {
    return validateRuntimeHandshake(environment, evidence);
  } catch (error) {
    rejectRunnerAdmission(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function requireDeniedEffectCounters(counters, label) {
  requireExactKeys(counters, DENIED_EFFECT_NAMES, label, true);
  for (const name of DENIED_EFFECT_NAMES) {
    if (!Number.isSafeInteger(counters[name]) || !Object.is(counters[name], 0)) {
      rejectRunnerAdmission(`${label}.${name} must be the safe integer zero`);
    }
  }
}

function isValidUtcTimestamp(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,7}))?Z$/u.exec(value);
  if (!match) return false;
  const milliseconds = (match[2] ?? '').padEnd(3, '0').slice(0, 3);
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === `${match[1]}.${milliseconds}Z`;
}

function countersEqual(left, right) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key])
  );
}

export function validateHarnessAdmission(environment, report) {
  if (!isRecord(report) || report.contained !== true) {
    rejectRunnerAdmission('contained must be true');
  }
  requireStatus(report.harnessHandoff, 'READY', 'harnessHandoff');
  requireStatus(
    report.productProducerDependency,
    'SATISFIED_BY_ACTUAL_EVIDENCE',
    'productProducerDependency',
  );
  requireStatus(report.runtimeHandshake, 'PASS', 'runtimeHandshake');
  requireExactKeys(report.deniedEffects, ['status', 'counters'], 'deniedEffects', true);
  requireStatus(report.deniedEffects, 'PASS', 'deniedEffects');
  requireStatus(report.evidenceChannel, 'PASS', 'evidenceChannel');
  if (report.evidenceChannel.schemaVersion !== EVIDENCE_SCHEMA) {
    rejectRunnerAdmission('evidenceChannel schemaVersion mismatch');
  }

  const evidence = report.evidenceChannel.result;
  requireExactKeys(
    evidence,
    [
      'authenticationHash',
      'deniedEffects',
      'errors',
      'frontendHandshake',
      'nativeHandshake',
      'producer',
      'readiness',
      'schemaVersion',
      'sessionNonceHash',
    ],
    'evidenceChannel.result',
  );
  if (evidence.schemaVersion !== EVIDENCE_SCHEMA) {
    rejectRunnerAdmission('evidence result schemaVersion mismatch');
  }
  requireLowercaseHash(evidence.authenticationHash, 'authenticationHash');
  requireLowercaseHash(evidence.sessionNonceHash, 'sessionNonceHash');
  if (evidence.sessionNonceHash !== environment.VITE_VIBESPACE_MONOCHROME_SESSION_NONCE_HASH) {
    rejectRunnerAdmission('sessionNonceHash compile variable mismatch');
  }

  requireHandshake(environment, evidence.frontendHandshake, 'frontendHandshake');
  const handshake = requireHandshake(environment, evidence.nativeHandshake, 'nativeHandshake');

  const producerKeys = [
    'pid',
    'creationTimeUtc',
    'creationTimeHash',
    'executableHash',
    'commandHash',
  ];
  requireExactKeys(evidence.producer, producerKeys, 'producer');
  if (!Number.isSafeInteger(evidence.producer.pid) || evidence.producer.pid <= 0) {
    rejectRunnerAdmission('producer.pid must be a positive safe integer');
  }
  if (!isValidUtcTimestamp(evidence.producer.creationTimeUtc)) {
    rejectRunnerAdmission('producer.creationTimeUtc must be a valid UTC timestamp');
  }
  const expectedCreationTimeHash = createHash('sha256')
    .update(evidence.producer.creationTimeUtc, 'utf8')
    .digest('hex');
  if (evidence.producer.creationTimeHash !== expectedCreationTimeHash) {
    rejectRunnerAdmission('producer.creationTimeHash does not match creationTimeUtc');
  }
  for (const field of ['creationTimeHash', 'executableHash', 'commandHash']) {
    requireLowercaseHash(evidence.producer[field], `producer.${field}`);
  }

  requireExactKeys(
    evidence.readiness,
    ['status', 'application', 'fixtureSmoke', 'surface', 'theme', 'font', 'fallback'],
    'readiness',
  );
  const readinessExpected = {
    status: 'PASS',
    application: 'READY',
    fixtureSmoke: 'PASS',
    surface: 'route:chat',
    theme: 'monochrome',
    font: 'READY',
    fallback: 'NOT_USED',
  };
  for (const [field, expected] of Object.entries(readinessExpected)) {
    if (evidence.readiness[field] !== expected) {
      rejectRunnerAdmission(`readiness.${field} must be ${expected}`);
    }
  }

  requireExactKeys(
    evidence.deniedEffects,
    ['status', 'manifestHash', 'counters'],
    'evidence deniedEffects',
  );
  if (evidence.deniedEffects.status !== 'PASS') {
    rejectRunnerAdmission('evidence deniedEffects status must be PASS');
  }
  if (evidence.deniedEffects.manifestHash !== DENIED_EFFECT_MANIFEST) {
    rejectRunnerAdmission('evidence deniedEffects manifestHash mismatch');
  }
  requireDeniedEffectCounters(evidence.deniedEffects.counters, 'evidence deniedEffects counters');
  requireDeniedEffectCounters(report.deniedEffects.counters, 'top-level deniedEffects counters');
  if (!countersEqual(report.deniedEffects.counters, evidence.deniedEffects.counters)) {
    rejectRunnerAdmission(
      'top-level deniedEffects counters must match authenticated evidence counters',
    );
  }

  requireExactKeys(evidence.errors, ['page', 'native'], 'errors');
  for (const field of ['page', 'native']) {
    if (!Array.isArray(evidence.errors[field]) || evidence.errors[field].length !== 0) {
      rejectRunnerAdmission(`errors.${field} must be an empty array`);
    }
  }

  const deniedCounters = Object.freeze(
    Object.fromEntries(
      DENIED_EFFECT_NAMES.map((name) => [name, evidence.deniedEffects.counters[name]]),
    ),
  );
  return Object.freeze({
    authenticationHash: evidence.authenticationHash,
    deniedEffects: Object.freeze({
      counters: deniedCounters,
      manifestHash: evidence.deniedEffects.manifestHash,
    }),
    handshake,
    producer: Object.freeze(
      Object.fromEntries(producerKeys.map((field) => [field, evidence.producer[field]])),
    ),
    readiness: Object.freeze(
      Object.fromEntries(
        Object.keys(readinessExpected).map((field) => [field, evidence.readiness[field]]),
      ),
    ),
    schemaVersion: evidence.schemaVersion,
    sessionNonceHash: evidence.sessionNonceHash,
  });
}

export function preflightBaselines(root, expectedRelativePaths) {
  const missing = expectedRelativePaths.filter((relativePath) => {
    const absolute = path.resolve(root, relativePath);
    return (
      !absolute.startsWith(`${path.resolve(root)}${path.sep}`) ||
      !existsSync(absolute) ||
      !statSync(absolute).isFile() ||
      statSync(absolute).size === 0
    );
  });
  if (missing.length > 0) {
    throw new Error(`missing monochrome baselines: ${missing.join(', ')}`);
  }
  return Object.freeze(
    expectedRelativePaths.map((relativePath) => path.resolve(root, relativePath)),
  );
}

function snapshotName(caseId) {
  return `${caseId.replaceAll(':', '--').replaceAll('/', '-')}.png`;
}

export function requiredBaselinePaths(entries = MONOCHROME_ROUTE_COVERAGE_MANIFEST.entries) {
  const browser = entries.filter(
    ({ availability }) => availability !== 'native-only' && availability !== 'unavailable',
  );
  const visual = browser.map(
    ({ id }) => `monochrome-visual/monochrome.visual.spec.ts/${snapshotName(id)}`,
  );
  const named = [
    'usage',
    'billing-plans',
    'dropdown-open',
    'tooltip-visible',
    'empty-state',
    'modal-open',
    'toast-visible',
    'locked-access',
  ].map((id) => `monochrome-visual/monochrome.visual.spec.ts/named-state--${id}.png`);
  const viewports = ['1672x941', '1440x900', '1280x720', '1024x768', 'narrow-desktop-960x600'].map(
    (id) => `monochrome-visual/monochrome.visual.spec.ts/viewport--${id}.png`,
  );
  const routeA11y = MONOCHROME_ROUTE_COVERAGE_MANIFEST.finalRouteIds.map(
    (id) => `monochrome-a11y/monochrome.a11y.spec.ts/a11y-route--${id}--1440x900.png`,
  );
  return Object.freeze([
    ...visual,
    ...named,
    ...viewports,
    ...routeA11y,
    'monochrome-a11y/monochrome.a11y.spec.ts/forced-colors--chat.png',
  ]);
}

function parseCliArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!['--handshake-report', '--ledger'].includes(flag) || !value) {
      throw new Error(
        'usage: run-monochrome.mjs --handshake-report <contained-report.json> --ledger <.artifacts/monochrome/...json>',
      );
    }
    result[flag.slice(2)] = value;
  }
  if (!result['handshake-report'] || !result.ledger) {
    throw new Error('both --handshake-report and --ledger are required');
  }
  return result;
}

function containedArtifactPath(input, label) {
  const artifactRoot = path.resolve(REPO_ROOT, '.artifacts/monochrome');
  const resolved = path.resolve(REPO_ROOT, input);
  if (!resolved.startsWith(`${artifactRoot}${path.sep}`)) {
    throw new Error(`${label} must be contained below .artifacts/monochrome`);
  }
  return resolved;
}

export function writeLedger(ledgerPath, ledger) {
  mkdirSync(path.dirname(ledgerPath), { recursive: true });
  const temporary = `${ledgerPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(ledger, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    renameSync(temporary, ledgerPath);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export function localPlaywrightExecutable() {
  const executable = path.join(
    REPO_ROOT,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'playwright.cmd' : 'playwright',
  );
  if (!existsSync(executable) || !statSync(executable).isFile()) {
    throw new Error('the pinned local Playwright executable is unavailable');
  }
  return executable;
}

function executePlaywright() {
  return executeChildProcess({
    args: ['test', '--config', 'playwright.monochrome.config.ts'],
    executable: localPlaywrightExecutable(),
  });
}

export function executeAdmittedRun(report, environment = process.env, dependencies = {}) {
  const admission = validateHarnessAdmission(environment, report);
  const validateProjection = dependencies.validateProjection ?? validateProductionBrowserProjection;
  const baselinePreflight = dependencies.baselinePreflight ?? preflightBaselines;
  const behaviorPlanBuilder = dependencies.behaviorPlanBuilder ?? buildBehaviorExecutionPlan;
  const behaviorPlanExecutor = dependencies.behaviorPlanExecutor ?? executeBehaviorPlan;
  const playwrightExecutor = dependencies.playwrightExecutor ?? executePlaywright;

  validateProjection();
  baselinePreflight(
    path.join(REPO_ROOT, 'tests/visual/monochrome/baselines/mc9'),
    requiredBaselinePaths(),
  );
  const behavior = behaviorPlanExecutor(
    behaviorPlanBuilder(MONOCHROME_ROUTE_COVERAGE_MANIFEST.entries),
  );
  const playwright = playwrightExecutor();
  const playwrightOutcome = executionOutcome(playwright);
  const playwrightStdout = outputEvidence(playwright.stdout);
  const playwrightStderr = outputEvidence(playwright.stderr);
  const behaviorStatus =
    behavior?.status === 'failed' ||
    !Array.isArray(behavior?.results) ||
    behavior.results.some(({ status }) => status !== 'passed')
      ? 'failed'
      : 'passed';
  const behaviorLedger =
    behavior?.status === behaviorStatus ? behavior : { ...behavior, status: behaviorStatus };
  const playwrightLedger = {
    args: playwright.args,
    executable: playwright.executable,
    exitCode: playwrightOutcome.exitCode,
    signal: playwrightOutcome.signal,
    spawnErrorCode: playwrightOutcome.spawnErrorCode,
    stderrBytes: playwrightStderr.bytes,
    stderrSha256: playwrightStderr.sha256,
    status: playwrightOutcome.status,
    stdoutBytes: playwrightStdout.bytes,
    stdoutSha256: playwrightStdout.sha256,
    timedOut: playwrightOutcome.timedOut,
  };
  return {
    admission,
    behavior: behaviorLedger,
    handshake: admission.handshake,
    playwright: playwrightLedger,
    status:
      behaviorStatus === 'passed' && playwrightOutcome.status === 'passed' ? 'passed' : 'failed',
  };
}

export function ledgerExitCode(ledger) {
  return ledger?.status === 'passed' ? 0 : 1;
}

export function main(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);
  const reportPath = containedArtifactPath(args['handshake-report'], 'handshake report');
  const ledgerPath = containedArtifactPath(args.ledger, 'ledger');
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const ledger = executeAdmittedRun(report);
  writeLedger(ledgerPath, ledger);
  return ledger;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const ledger = main();
    process.exitCode = ledgerExitCode(ledger);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
