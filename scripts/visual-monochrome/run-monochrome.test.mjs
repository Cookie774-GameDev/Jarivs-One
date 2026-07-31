import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { PNG } from 'pngjs';
import { MONOCHROME_ROUTE_COVERAGE_MANIFEST } from '../../tests/visual/monochrome/route-manifest.ts';
import * as styleMetrics from '../../tests/visual/monochrome/styleMetrics.ts';
import * as monochromeRunner from './run-monochrome.mjs';
import {
  buildBehaviorExecutionPlan,
  executeBehaviorPlan,
  localPlaywrightExecutable,
  preflightBaselines,
  requiredBaselinePaths,
  validateProductionBrowserProjection,
  validateRuntimeHandshake,
} from './run-monochrome.mjs';

const HASH = '0123456789abcdef'.repeat(4);
const EXPECTED_ENVIRONMENT = Object.freeze({
  VITE_VIBESPACE_RUNTIME_PROFILE: 'monochrome-visual-test',
  VITE_VIBESPACE_MONOCHROME_APP_IDENTIFIER: 'ai.vibespace.monochrome.testdeadbeef',
  VITE_VIBESPACE_MONOCHROME_CAPABILITY_IDENTIFIER: 'monochrome-test',
  VITE_VIBESPACE_MONOCHROME_SESSION_NONCE_HASH: HASH,
});
const NATIVE_EVIDENCE = Object.freeze({
  profile: 'monochrome-visual-test',
  appIdentifier: 'ai.vibespace.monochrome.testdeadbeef',
  capabilityIdentifier: 'monochrome-test',
  sessionNonceHash: HASH,
});
const EVIDENCE_SCHEMA = 'vibespace.monochrome.native-evidence.v1';
const DENIED_EFFECT_MANIFEST = '24d75985399db9fb179ac64a10b982801fcb7681bf3f13a5a62d2340fa04850c';
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
const ZERO_DENIED_EFFECTS = Object.freeze(
  Object.fromEntries(DENIED_EFFECT_NAMES.map((name) => [name, 0])),
);
const PRODUCER_CREATION_TIME_UTC = '2026-07-30T12:34:56.789Z';
const PRODUCER_CREATION_TIME_HASH = createHash('sha256')
  .update(PRODUCER_CREATION_TIME_UTC)
  .digest('hex');
const PRODUCER_EVIDENCE = Object.freeze({
  pid: 4242,
  creationTimeUtc: PRODUCER_CREATION_TIME_UTC,
  creationTimeHash: PRODUCER_CREATION_TIME_HASH,
  executableHash: '2'.repeat(64),
  commandHash: '3'.repeat(64),
});
const READINESS_EVIDENCE = Object.freeze({
  status: 'PASS',
  application: 'READY',
  fixtureSmoke: 'PASS',
  surface: 'route:chat',
  theme: 'monochrome',
  font: 'READY',
  fallback: 'NOT_USED',
});
const COMPLETE_RUNNER_REPORT = Object.freeze({
  contained: true,
  harnessHandoff: Object.freeze({ status: 'READY' }),
  productProducerDependency: Object.freeze({
    status: 'SATISFIED_BY_ACTUAL_EVIDENCE',
  }),
  runtimeHandshake: Object.freeze({ status: 'PASS' }),
  deniedEffects: Object.freeze({
    status: 'PASS',
    counters: Object.freeze({ ...ZERO_DENIED_EFFECTS }),
  }),
  evidenceChannel: Object.freeze({
    status: 'PASS',
    schemaVersion: EVIDENCE_SCHEMA,
    result: Object.freeze({
      authenticationHash: '4'.repeat(64),
      deniedEffects: Object.freeze({
        status: 'PASS',
        manifestHash: DENIED_EFFECT_MANIFEST,
        counters: ZERO_DENIED_EFFECTS,
      }),
      errors: Object.freeze({
        page: Object.freeze([]),
        native: Object.freeze([]),
      }),
      frontendHandshake: NATIVE_EVIDENCE,
      nativeHandshake: NATIVE_EVIDENCE,
      producer: PRODUCER_EVIDENCE,
      readiness: READINESS_EVIDENCE,
      schemaVersion: EVIDENCE_SCHEMA,
      sessionNonceHash: HASH,
    }),
  }),
});

function mutateReport(mutator) {
  const report = structuredClone(COMPLETE_RUNNER_REPORT);
  mutator(report);
  return report;
}

function deleteReportKey(pathSegments) {
  return (report) => {
    const key = pathSegments.at(-1);
    const parent = pathSegments.slice(0, -1).reduce((value, segment) => value[segment], report);
    delete parent[key];
  };
}

function focusPng(width, height, pixel) {
  const image = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const [red, green, blue, alpha = 255] = pixel(x, y);
      image.data[offset] = red;
      image.data[offset + 1] = green;
      image.data[offset + 2] = blue;
      image.data[offset + 3] = alpha;
    }
  }
  return PNG.sync.write(image);
}

test('injected deterministic crypto preserves branded accessor and method receivers', async () => {
  assert.equal(typeof styleMetrics.createDeterministicCryptoProxy, 'function');

  const brandedInstances = new WeakSet();
  class BrandCheckedCrypto {
    constructor() {
      brandedInstances.add(this);
    }

    get subtle() {
      if (!brandedInstances.has(this)) throw new TypeError('invalid subtle receiver');
      return 'subtle-ok';
    }

    digestLabel() {
      if (!brandedInstances.has(this)) throw new TypeError('invalid method receiver');
      return 'method-ok';
    }
  }

  const nativeCrypto = new BrandCheckedCrypto();
  const getRandomValues = (array) => array;
  const randomUUID = () => '00000000-0000-4000-8000-000000000000';
  const proxy = styleMetrics.createDeterministicCryptoProxy(nativeCrypto, {
    getRandomValues,
    randomUUID,
  });

  assert.equal(proxy.subtle, 'subtle-ok');
  assert.equal(proxy.digestLabel(), 'method-ok');
  assert.equal(proxy.getRandomValues, getRandomValues);
  assert.equal(proxy.randomUUID, randomUUID);

  let injectedContent = '';
  await styleMetrics.installDeterministicPrimitives({
    addInitScript: async ({ content }) => {
      injectedContent = content;
    },
  });
  const sandbox = { crypto: nativeCrypto, DOMException };
  runInNewContext(injectedContent, sandbox);
  assert.equal(sandbox.crypto.subtle, 'subtle-ok');
  assert.equal(sandbox.crypto.digestLabel(), 'method-ok');
});

test('focus evidence rejects permanent decoration and requires a changed 3:1 indicator', () => {
  assert.equal(typeof styleMetrics.assessFocusIndicatorEvidence, 'function');

  const permanentBorder = {
    before: {
      backgroundColor: 'rgb(255, 255, 255)',
      borderTopColor: 'rgb(0, 0, 0)',
      borderTopStyle: 'solid',
      borderTopWidth: '1px',
      boxShadow: 'none',
      outlineColor: 'rgb(0, 0, 0)',
      outlineStyle: 'none',
      outlineWidth: '0px',
    },
    beforeFocusedContrast: 21,
    focused: {
      backgroundColor: 'rgb(255, 255, 255)',
      borderTopColor: 'rgb(0, 0, 0)',
      borderTopStyle: 'solid',
      borderTopWidth: '1px',
      boxShadow: 'none',
      outlineColor: 'rgb(0, 0, 0)',
      outlineStyle: 'none',
      outlineWidth: '0px',
    },
    indicator: 'border',
    renderedChangedPixelCount: 0,
    renderedContrastPixelCount: 0,
  };
  assert.deepEqual(styleMetrics.assessFocusIndicatorEvidence(permanentBorder), {
    hasVisibleDelta: false,
    passesContrast: false,
  });

  const changedOutline = {
    ...permanentBorder,
    beforeFocusedContrast: 3,
    focused: {
      ...permanentBorder.focused,
      outlineColor: 'rgb(0, 0, 0)',
      outlineStyle: 'solid',
      outlineWidth: '2px',
    },
    indicator: 'outline',
    renderedChangedPixelCount: 12,
    renderedContrastPixelCount: 12,
  };
  assert.deepEqual(styleMetrics.assessFocusIndicatorEvidence(changedOutline), {
    hasVisibleDelta: true,
    passesContrast: true,
  });
  assert.deepEqual(
    styleMetrics.assessFocusIndicatorEvidence({
      ...changedOutline,
      beforeFocusedContrast: 2.99,
    }),
    {
      hasVisibleDelta: true,
      passesContrast: false,
    },
  );

  const imperceptibleBackgroundDelta = {
    ...permanentBorder,
    before: {
      ...permanentBorder.before,
      backgroundColor: 'rgb(0, 0, 0)',
    },
    beforeFocusedContrast: 1.0006070539670972,
    focused: {
      ...permanentBorder.focused,
      backgroundColor: 'rgb(1, 1, 1)',
    },
    indicator: 'background',
    renderedChangedPixelCount: 16,
    renderedContrastPixelCount: 0,
  };
  assert.deepEqual(styleMetrics.assessFocusIndicatorEvidence(imperceptibleBackgroundDelta), {
    hasVisibleDelta: false,
    passesContrast: false,
  });
});

test('rendered focus oracle requires a 3:1 same-coordinate pixel region', () => {
  assert.equal(typeof styleMetrics.assessRenderedFocusPixels, 'function');
  const black = focusPng(4, 4, () => [0, 0, 0, 255]);
  const white = focusPng(4, 4, () => [255, 255, 255, 255]);
  const almostBlack = focusPng(4, 4, () => [1, 1, 1, 255]);
  const oneWhitePixel = focusPng(4, 4, (x, y) =>
    x === 0 && y === 0 ? [255, 255, 255, 255] : [0, 0, 0, 255],
  );

  assert.deepEqual(styleMetrics.assessRenderedFocusPixels(black, black), {
    changedPixelCount: 0,
    contrastPixelCount: 0,
    hasRenderedDelta: false,
    maxContrast: null,
    passesContrast: false,
  });
  assert.deepEqual(styleMetrics.assessRenderedFocusPixels(black, almostBlack), {
    changedPixelCount: 16,
    contrastPixelCount: 0,
    hasRenderedDelta: true,
    maxContrast: 1.0060705396709768,
    passesContrast: false,
  });
  assert.deepEqual(styleMetrics.assessRenderedFocusPixels(black, oneWhitePixel), {
    changedPixelCount: 1,
    contrastPixelCount: 1,
    hasRenderedDelta: false,
    maxContrast: 21,
    passesContrast: false,
  });
  assert.deepEqual(styleMetrics.assessRenderedFocusPixels(black, white), {
    changedPixelCount: 16,
    contrastPixelCount: 16,
    hasRenderedDelta: true,
    maxContrast: 21,
    passesContrast: true,
  });
});

test('behavior plan closes over 85 rows with the exact 37 direct and 48 aggregate split', () => {
  const plan = buildBehaviorExecutionPlan(MONOCHROME_ROUTE_COVERAGE_MANIFEST.entries);

  assert.equal(plan.availableCaseCount, 85);
  assert.equal(plan.directCaseCount, 37);
  assert.equal(plan.aggregateCaseCount, 48);
  assert.equal(plan.unavailableCaseId, 'future:messaging-channels');
  assert.equal(requiredBaselinePaths().length, 111);
  assert.equal(
    new Set(plan.executions.map(({ commandId }) => commandId)).size,
    plan.executions.length,
  );
  assert.deepEqual(
    [...new Set(plan.executions.flatMap(({ caseIds }) => caseIds))].sort(),
    MONOCHROME_ROUTE_COVERAGE_MANIFEST.entries
      .filter(({ availability }) => availability !== 'unavailable')
      .map(({ id }) => id)
      .sort(),
  );
});

test('module-safe browser projection rejects drift in every field across all 79 rows', () => {
  assert.equal(typeof styleMetrics.validateBrowserProjection, 'function');
  const authorityProjection = MONOCHROME_ROUTE_COVERAGE_MANIFEST.entries
    .filter(({ availability }) => availability !== 'native-only' && availability !== 'unavailable')
    .map(({ fixture, id, kind, routeId }) => ({
      fixtureHash: fixture.sha256,
      fixtureId: fixture.id,
      id,
      kind,
      routeId,
    }));
  assert.equal(authorityProjection.length, 79);
  assert.deepEqual(styleMetrics.BROWSER_CASES, authorityProjection);
  assert.equal(validateProductionBrowserProjection(), 79);

  for (const [field, value] of [
    ['id', 'route:drift'],
    ['kind', 'drift'],
    ['routeId', 'drift'],
    ['fixtureId', 'chat'],
    ['fixtureHash', '0'.repeat(64)],
  ]) {
    const drifted = authorityProjection.map((entry, index) =>
      index === 0 ? { ...entry, [field]: value } : entry,
    );
    assert.throws(
      () => styleMetrics.validateBrowserProjection(drifted, authorityProjection),
      new RegExp(field, 'u'),
    );
    assert.throws(() => validateProductionBrowserProjection(drifted), new RegExp(field, 'u'));
  }

  const calls = [];
  const reportWithUntrustedExtras = mutateReport((report) => {
    report.rawToken = 'must-not-enter-ledger';
    report.sessionPath = 'C:\\must-not-enter-ledger';
  });
  const ledger = monochromeRunner.executeAdmittedRun(
    reportWithUntrustedExtras,
    EXPECTED_ENVIRONMENT,
    {
      validateProjection: () => calls.push('projection'),
      baselinePreflight: () => calls.push('baseline'),
      behaviorPlanBuilder: () => {
        calls.push('behavior-plan');
        return { executions: [] };
      },
      behaviorPlanExecutor: () => {
        calls.push('behavior');
        return { results: [] };
      },
      playwrightExecutor: () => {
        calls.push('playwright');
        return {
          args: [],
          executable: 'injected-playwright',
          exitCode: 0,
          signal: null,
          stderr: '',
          stdout: '',
        };
      },
    },
  );
  assert.deepEqual(calls, ['projection', 'baseline', 'behavior-plan', 'behavior', 'playwright']);
  assert.deepEqual(
    ledger.admission,
    monochromeRunner.validateHarnessAdmission(EXPECTED_ENVIRONMENT, COMPLETE_RUNNER_REPORT),
  );
  assert.equal(JSON.stringify(ledger).includes('must-not-enter-ledger'), false);
});

test('readiness distinguishes requested Origami from the actual VibeSpace document theme', () => {
  assert.equal(typeof styleMetrics.documentThemeForRequest, 'function');
  assert.equal(styleMetrics.documentThemeForRequest('origami'), 'vibespace');
  for (const [requested, actual] of [
    ['monochrome', 'monochrome'],
    ['default', 'dark'],
    ['vibespace', 'vibespace'],
    ['jarvis', 'jarvis'],
  ]) {
    assert.equal(styleMetrics.documentThemeForRequest(requested), actual);
  }

  const source = readFileSync(
    fileURLToPath(new URL('../../tests/visual/monochrome/styleMetrics.ts', import.meta.url)),
    'utf8',
  );
  assert.match(
    source,
    /toHaveAttribute\(\s*'data-document-theme',\s*documentThemeForRequest\(options\.theme\),?\s*\)/u,
  );
});

test('behavior plan rejects a command outside the bounded allowlist', () => {
  const entries = MONOCHROME_ROUTE_COVERAGE_MANIFEST.entries.map((entry, index) =>
    index === 0
      ? {
          ...entry,
          behaviorCommands: [
            ...entry.behaviorCommands,
            'powershell -Command Remove-Item -Recurse C:\\',
          ],
        }
      : entry,
  );

  assert.throws(() => buildBehaviorExecutionPlan(entries), /not allowlisted/u);
});

test('focused test allowlist rejects dot-segment traversal outside app/src', () => {
  const entries = MONOCHROME_ROUTE_COVERAGE_MANIFEST.entries.map((entry, index) =>
    index === 0
      ? {
          ...entry,
          behaviorCommands: [
            'npm --prefix app test -- src/../../outside.test.ts --maxWorkers=1 --minWorkers=1',
          ],
        }
      : entry,
  );

  assert.throws(() => buildBehaviorExecutionPlan(entries), /not allowlisted/u);
});

test('behavior executor runs each deduplicated identity once and records exact results', () => {
  const plan = buildBehaviorExecutionPlan(MONOCHROME_ROUTE_COVERAGE_MANIFEST.entries);
  const calls = [];
  const ledger = executeBehaviorPlan(plan, ({ executable, args, commandId }) => {
    calls.push(commandId);
    return { executable, args, exitCode: 0, signal: null, stdout: 'ok', stderr: '' };
  });

  assert.equal(calls.length, plan.executions.length);
  assert.equal(new Set(calls).size, calls.length);
  assert.equal(ledger.results.length, plan.executions.length);
  assert.equal(
    ledger.results.every(({ status }) => status === 'passed'),
    true,
  );
  assert.deepEqual(
    ledger.results.map(({ commandId }) => commandId),
    plan.executions.map(({ commandId }) => commandId),
  );
  assert.equal(
    ledger.results.some((result) => 'stdout' in result || 'stderr' in result),
    false,
  );
  assert.equal(
    ledger.results.every(
      ({ stdoutBytes, stderrBytes, stdoutSha256, stderrSha256 }) =>
        stdoutBytes === 2 &&
        stderrBytes === 0 &&
        /^[a-f0-9]{64}$/u.test(stdoutSha256) &&
        /^[a-f0-9]{64}$/u.test(stderrSha256),
    ),
    true,
  );
});

test('child process evidence fails closed for nonzero, spawn failure, timeout, and interruption', () => {
  assert.equal(typeof monochromeRunner.executeChildProcess, 'function');

  const execution = {
    args: [],
    caseIds: Object.freeze(['route:chat']),
    command: 'bounded child-process probe',
    commandId: 'bounded-child-process-probe',
    executable: process.execPath,
  };
  const plan = {
    aggregateCaseCount: 0,
    availableCaseCount: 1,
    directCaseCount: 1,
    executions: [execution],
    unavailableCaseId: 'future:messaging-channels',
  };
  const run = (result) => executeBehaviorPlan(plan, () => result).results[0];

  const nonzero = run(
    monochromeRunner.executeChildProcess({
      ...execution,
      args: [
        '-e',
        'process.stdout.write("nonzero-out"); process.stderr.write("nonzero-err"); process.exit(7)',
      ],
      timeoutMs: 2_000,
    }),
  );
  assert.equal(nonzero.exitCode, 7);
  assert.equal(nonzero.signal, null);
  assert.equal(nonzero.spawnErrorCode, null);
  assert.equal(nonzero.timedOut, false);
  assert.equal(nonzero.status, 'failed');
  assert.equal(nonzero.stdoutBytes, Buffer.byteLength('nonzero-out'));
  assert.equal(nonzero.stdoutSha256, createHash('sha256').update('nonzero-out').digest('hex'));
  assert.equal(nonzero.stderrBytes, Buffer.byteLength('nonzero-err'));
  assert.equal(nonzero.stderrSha256, createHash('sha256').update('nonzero-err').digest('hex'));

  const missing = run(
    monochromeRunner.executeChildProcess({
      ...execution,
      executable: 'definitely-not-a-real-monochrome-executable-343',
      timeoutMs: 2_000,
    }),
  );
  assert.equal(missing.exitCode, null);
  assert.equal(missing.signal, null);
  assert.equal(missing.spawnErrorCode, 'ENOENT');
  assert.equal(missing.timedOut, false);
  assert.equal(missing.status, 'failed');

  const timeout = run(
    monochromeRunner.executeChildProcess({
      ...execution,
      args: ['-e', 'setInterval(() => {}, 1_000)'],
      timeoutMs: 100,
    }),
  );
  assert.equal(timeout.exitCode, null);
  assert.equal(timeout.spawnErrorCode, 'ETIMEDOUT');
  assert.equal(timeout.timedOut, true);
  assert.equal(timeout.status, 'failed');

  const interrupted = run({
    ...execution,
    exitCode: 0,
    signal: null,
    spawnErrorCode: 'EINTR',
    stderr: '',
    stdout: '',
    timedOut: false,
  });
  assert.equal(interrupted.spawnErrorCode, 'EINTR');
  assert.equal(interrupted.status, 'failed');
});

test('admitted-run and CLI verdicts fail closed from aggregate execution status', () => {
  assert.equal(typeof monochromeRunner.ledgerExitCode, 'function');

  const ledger = monochromeRunner.executeAdmittedRun(COMPLETE_RUNNER_REPORT, EXPECTED_ENVIRONMENT, {
    validateProjection: () => {},
    baselinePreflight: () => {},
    behaviorPlanBuilder: () => ({ executions: [] }),
    behaviorPlanExecutor: () => ({
      results: [{ status: 'failed' }],
      status: 'failed',
    }),
    playwrightExecutor: () => ({
      args: [],
      executable: 'injected-playwright',
      exitCode: 0,
      signal: null,
      spawnErrorCode: null,
      stderr: '',
      stdout: '',
      timedOut: false,
    }),
  });

  assert.equal(ledger.behavior.status, 'failed');
  assert.equal(ledger.playwright.status, 'passed');
  assert.equal(ledger.status, 'failed');
  assert.equal(monochromeRunner.ledgerExitCode(ledger), 1);
  assert.equal(monochromeRunner.ledgerExitCode({ status: 'passed' }), 0);
  assert.equal(monochromeRunner.ledgerExitCode({}), 1);
});

test('ledger writer removes its temporary artifact when publication fails', () => {
  assert.equal(typeof monochromeRunner.writeLedger, 'function');
  const root = mkdtempSync(path.join(tmpdir(), 'monochrome-ledger-cleanup-'));
  const ledgerPath = path.join(root, 'ledger.json');
  mkdirSync(ledgerPath);

  assert.throws(() => monochromeRunner.writeLedger(ledgerPath, { status: 'failed' }));
  assert.deepEqual(readdirSync(root), ['ledger.json']);
});

test('runtime handshake requires exact compile variables and camelCase native evidence', () => {
  assert.deepEqual(validateRuntimeHandshake(EXPECTED_ENVIRONMENT, NATIVE_EVIDENCE), {
    appIdentifier: EXPECTED_ENVIRONMENT.VITE_VIBESPACE_MONOCHROME_APP_IDENTIFIER,
    capabilityIdentifier: 'monochrome-test',
    profile: 'monochrome-visual-test',
    sessionNonceHash: HASH,
  });

  for (const [field, value] of [
    ['profile', 'ordinary'],
    ['appIdentifier', 'ai.vibespace'],
    ['capabilityIdentifier', 'default'],
    ['sessionNonceHash', 'A'.repeat(64)],
  ]) {
    assert.throws(
      () => validateRuntimeHandshake(EXPECTED_ENVIRONMENT, { ...NATIVE_EVIDENCE, [field]: value }),
      new RegExp(field, 'iu'),
    );
  }
});

test('runtime handshake rejects matching non-hex test application identifiers', () => {
  const environment = {
    ...EXPECTED_ENVIRONMENT,
    VITE_VIBESPACE_MONOCHROME_APP_IDENTIFIER: 'ai.vibespace.monochrome.testzz',
  };
  const evidence = {
    ...NATIVE_EVIDENCE,
    appIdentifier: 'ai.vibespace.monochrome.testzz',
  };

  assert.throws(
    () => validateRuntimeHandshake(environment, evidence),
    /appIdentifier compile variable mismatch/u,
  );
});

test('harness admission returns only immutable authenticated evidence for one complete report', () => {
  assert.equal(typeof monochromeRunner.validateHarnessAdmission, 'function');

  const admission = monochromeRunner.validateHarnessAdmission(
    EXPECTED_ENVIRONMENT,
    COMPLETE_RUNNER_REPORT,
  );

  assert.deepEqual(admission, {
    authenticationHash: '4'.repeat(64),
    deniedEffects: {
      counters: {
        notification: 0,
        processRelaunch: 0,
        updater: 0,
        shellOpen: 0,
        externalHttp: 0,
        keychain: 0,
        registry: 0,
        launcher: 0,
        tray: 0,
        singleInstance: 0,
        globalShortcut: 0,
        deepLink: 0,
        autostart: 0,
      },
      manifestHash: DENIED_EFFECT_MANIFEST,
    },
    handshake: {
      appIdentifier: 'ai.vibespace.monochrome.testdeadbeef',
      capabilityIdentifier: 'monochrome-test',
      profile: 'monochrome-visual-test',
      sessionNonceHash: HASH,
    },
    producer: {
      pid: 4242,
      creationTimeUtc: '2026-07-30T12:34:56.789Z',
      creationTimeHash: PRODUCER_CREATION_TIME_HASH,
      executableHash: '2'.repeat(64),
      commandHash: '3'.repeat(64),
    },
    readiness: {
      status: 'PASS',
      application: 'READY',
      fixtureSmoke: 'PASS',
      surface: 'route:chat',
      theme: 'monochrome',
      font: 'READY',
      fallback: 'NOT_USED',
    },
    schemaVersion: EVIDENCE_SCHEMA,
    sessionNonceHash: HASH,
  });
  for (const value of [
    admission,
    admission.deniedEffects,
    admission.deniedEffects.counters,
    admission.handshake,
    admission.producer,
    admission.readiness,
  ]) {
    assert.equal(Object.isFrozen(value), true);
  }
  assert.equal(JSON.stringify(admission).includes('token'), false);
  assert.equal(JSON.stringify(admission).includes('path'), false);
});

test('harness admission rejects every incomplete or unauthenticated report mutation', () => {
  assert.equal(typeof monochromeRunner.validateHarnessAdmission, 'function');

  const cases = [
    ['contained', (report) => (report.contained = false)],
    ['harness handoff', (report) => (report.harnessHandoff.status = 'NOT_READY')],
    [
      'product producer dependency',
      (report) => (report.productProducerDependency.status = 'MISSING_PRODUCT_INTEGRATION'),
    ],
    ['runtime handshake status', (report) => (report.runtimeHandshake.status = 'FAIL')],
    ['top-level denied effects status', (report) => (report.deniedEffects.status = 'FAIL')],
    ['evidence channel status', (report) => (report.evidenceChannel.status = 'FAIL')],
    [
      'evidence channel schema',
      (report) =>
        (report.evidenceChannel.schemaVersion = 'vibespace.monochrome.native-evidence.v0'),
    ],
    [
      'result schema',
      (report) =>
        (report.evidenceChannel.result.schemaVersion = 'vibespace.monochrome.native-evidence.v0'),
    ],
    ['result missing key', deleteReportKey(['evidenceChannel', 'result', 'authenticationHash'])],
    [
      'result extra key',
      (report) => (report.evidenceChannel.result.untrustedPath = 'C:\\untrusted'),
    ],
    [
      'authentication hash',
      (report) => (report.evidenceChannel.result.authenticationHash = 'A'.repeat(64)),
    ],
    [
      'session nonce hash format',
      (report) => (report.evidenceChannel.result.sessionNonceHash = 'A'.repeat(64)),
    ],
    [
      'session nonce compile pairing',
      (report) => (report.evidenceChannel.result.sessionNonceHash = 'f'.repeat(64)),
    ],
    [
      'frontend handshake missing key',
      deleteReportKey(['evidenceChannel', 'result', 'frontendHandshake', 'profile']),
    ],
    [
      'frontend handshake extra key',
      (report) => (report.evidenceChannel.result.frontendHandshake.token = 'untrusted'),
    ],
    [
      'native handshake missing key',
      deleteReportKey(['evidenceChannel', 'result', 'nativeHandshake', 'profile']),
    ],
    [
      'native handshake extra key',
      (report) => (report.evidenceChannel.result.nativeHandshake.token = 'untrusted'),
    ],
    [
      'producer missing key',
      deleteReportKey(['evidenceChannel', 'result', 'producer', 'commandHash']),
    ],
    [
      'producer extra key',
      (report) => (report.evidenceChannel.result.producer.path = 'C:\\untrusted'),
    ],
    ['producer pid zero', (report) => (report.evidenceChannel.result.producer.pid = 0)],
    ['producer pid fractional', (report) => (report.evidenceChannel.result.producer.pid = 1.5)],
    [
      'producer pid unsafe',
      (report) => (report.evidenceChannel.result.producer.pid = Number.MAX_SAFE_INTEGER + 1),
    ],
    ['producer pid string', (report) => (report.evidenceChannel.result.producer.pid = '4242')],
    [
      'producer creation time',
      (report) => (report.evidenceChannel.result.producer.creationTimeUtc = 'not-a-date'),
    ],
    [
      'producer impossible creation time',
      (report) =>
        (report.evidenceChannel.result.producer.creationTimeUtc = '2026-02-30T12:34:56.789Z'),
    ],
    [
      'producer creation time hash',
      (report) => (report.evidenceChannel.result.producer.creationTimeHash = '1'.repeat(63)),
    ],
    [
      'producer executable hash',
      (report) => (report.evidenceChannel.result.producer.executableHash = '2'.repeat(63)),
    ],
    [
      'producer command hash',
      (report) => (report.evidenceChannel.result.producer.commandHash = '3'.repeat(63)),
    ],
    [
      'readiness missing key',
      deleteReportKey(['evidenceChannel', 'result', 'readiness', 'status']),
    ],
    [
      'readiness extra key',
      (report) => (report.evidenceChannel.result.readiness.path = 'C:\\untrusted'),
    ],
    [
      'denied effects missing key',
      deleteReportKey(['evidenceChannel', 'result', 'deniedEffects', 'manifestHash']),
    ],
    [
      'denied effects extra key',
      (report) => (report.evidenceChannel.result.deniedEffects.token = 'untrusted'),
    ],
    [
      'denied effects status',
      (report) => (report.evidenceChannel.result.deniedEffects.status = 'FAIL'),
    ],
    [
      'denied effects manifest',
      (report) => (report.evidenceChannel.result.deniedEffects.manifestHash = '0'.repeat(64)),
    ],
    [
      'denied counter missing',
      deleteReportKey(['evidenceChannel', 'result', 'deniedEffects', 'counters', 'notification']),
    ],
    [
      'denied counter extra',
      (report) => (report.evidenceChannel.result.deniedEffects.counters.clipboard = 0),
    ],
    [
      'denied counter reordered',
      (report) =>
        (report.evidenceChannel.result.deniedEffects.counters = Object.fromEntries(
          [...Object.entries(report.evidenceChannel.result.deniedEffects.counters)].reverse(),
        )),
    ],
    [
      'denied counter string',
      (report) => (report.evidenceChannel.result.deniedEffects.counters.notification = '0'),
    ],
    [
      'denied counter boolean',
      (report) => (report.evidenceChannel.result.deniedEffects.counters.notification = false),
    ],
    [
      'denied counter null',
      (report) => (report.evidenceChannel.result.deniedEffects.counters.notification = null),
    ],
    [
      'denied counter fractional',
      (report) => (report.evidenceChannel.result.deniedEffects.counters.notification = 0.5),
    ],
    [
      'denied counter negative',
      (report) => (report.evidenceChannel.result.deniedEffects.counters.notification = -1),
    ],
    [
      'denied counter negative zero',
      (report) => (report.evidenceChannel.result.deniedEffects.counters.notification = -0),
    ],
    [
      'top-level denied counter mismatch',
      (report) => (report.deniedEffects.counters.notification = 1),
    ],
    ['top-level denied counter extra', (report) => (report.deniedEffects.counters.clipboard = 0)],
    [
      'top-level denied counter reordered',
      (report) =>
        (report.deniedEffects.counters = Object.fromEntries(
          [...Object.entries(report.deniedEffects.counters)].reverse(),
        )),
    ],
    ['errors missing key', deleteReportKey(['evidenceChannel', 'result', 'errors', 'page'])],
    ['errors extra key', (report) => (report.evidenceChannel.result.errors.runner = [])],
    ['page errors', (report) => (report.evidenceChannel.result.errors.page = ['injected failure'])],
    [
      'native errors',
      (report) => (report.evidenceChannel.result.errors.native = ['injected failure']),
    ],
  ];
  for (const field of ['profile', 'appIdentifier', 'capabilityIdentifier', 'sessionNonceHash']) {
    cases.push(
      [
        `frontend ${field}`,
        (report) => (report.evidenceChannel.result.frontendHandshake[field] = 'drift'),
      ],
      [
        `native ${field}`,
        (report) => (report.evidenceChannel.result.nativeHandshake[field] = 'drift'),
      ],
    );
  }
  for (const [field, value] of Object.entries({
    status: 'FAIL',
    application: 'NOT_READY',
    fixtureSmoke: 'FAIL',
    surface: '',
    theme: 'ordinary',
    font: 'NOT_READY',
    fallback: 'USED',
  })) {
    cases.push([
      `readiness ${field}`,
      (report) => (report.evidenceChannel.result.readiness[field] = value),
    ]);
  }
  for (const name of DENIED_EFFECT_NAMES) {
    cases.push([
      `denied counter ${name}`,
      (report) => (report.evidenceChannel.result.deniedEffects.counters[name] = 1),
    ]);
  }

  for (const [name, mutate] of cases) {
    assert.throws(
      () => monochromeRunner.validateHarnessAdmission(EXPECTED_ENVIRONMENT, mutateReport(mutate)),
      /runner admission rejected:/u,
      name,
    );
  }
});

test('incomplete harness evidence is rejected before projection, baseline, behavior, or Playwright', () => {
  assert.equal(typeof monochromeRunner.executeAdmittedRun, 'function');
  const calls = [];
  const report = mutateReport((value) => {
    value.evidenceChannel.result.errors.native = ['injected native failure'];
  });

  assert.throws(
    () =>
      monochromeRunner.executeAdmittedRun(report, EXPECTED_ENVIRONMENT, {
        validateProjection: () => calls.push('projection'),
        baselinePreflight: () => calls.push('baseline'),
        behaviorPlanBuilder: () => calls.push('behavior-plan'),
        behaviorPlanExecutor: () => calls.push('behavior'),
        playwrightExecutor: () => calls.push('playwright'),
      }),
    /runner admission rejected:/u,
  );
  assert.deepEqual(calls, []);
});

test('producer timestamp hash mismatch is rejected before every downstream operation', () => {
  const calls = [];
  const report = mutateReport((value) => {
    value.evidenceChannel.result.producer.creationTimeHash = '1'.repeat(64);
  });

  assert.throws(
    () =>
      monochromeRunner.executeAdmittedRun(report, EXPECTED_ENVIRONMENT, {
        validateProjection: () => calls.push('projection'),
        baselinePreflight: () => calls.push('baseline'),
        behaviorPlanBuilder: () => calls.push('behavior-plan'),
        behaviorPlanExecutor: () => calls.push('behavior'),
        playwrightExecutor: () => calls.push('playwright'),
      }),
    /runner admission rejected:/u,
  );
  assert.deepEqual(calls, []);
});

test('omitted top-level denied counters are rejected before every downstream operation', () => {
  const calls = [];
  const report = mutateReport((value) => {
    delete value.deniedEffects.counters;
  });

  assert.throws(
    () =>
      monochromeRunner.executeAdmittedRun(report, EXPECTED_ENVIRONMENT, {
        validateProjection: () => calls.push('projection'),
        baselinePreflight: () => calls.push('baseline'),
        behaviorPlanBuilder: () => calls.push('behavior-plan'),
        behaviorPlanExecutor: () => calls.push('behavior'),
        playwrightExecutor: () => calls.push('playwright'),
      }),
    /runner admission rejected:/u,
  );
  assert.deepEqual(calls, []);
});

test('reordered top-level deniedEffects envelope is rejected before every downstream operation', () => {
  const calls = [];
  const report = mutateReport((value) => {
    value.deniedEffects = {
      counters: value.deniedEffects.counters,
      status: value.deniedEffects.status,
    };
  });
  assert.deepEqual(Object.keys(report.deniedEffects), ['counters', 'status']);

  assert.throws(
    () =>
      monochromeRunner.executeAdmittedRun(report, EXPECTED_ENVIRONMENT, {
        validateProjection: () => calls.push('projection'),
        baselinePreflight: () => calls.push('baseline'),
        behaviorPlanBuilder: () => calls.push('behavior-plan'),
        behaviorPlanExecutor: () => calls.push('behavior'),
        playwrightExecutor: () => calls.push('playwright'),
      }),
    /runner admission rejected:/u,
  );
  assert.deepEqual(calls, []);
});

test('Playwright execution resolves only the pinned local binary', () => {
  const executable = localPlaywrightExecutable();
  assert.equal(existsSync(executable), true);
  assert.equal(
    path.relative(path.resolve(fileURLToPath(new URL('../../', import.meta.url))), executable),
    path.join(
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'playwright.cmd' : 'playwright',
    ),
  );
});

test('baseline preflight fails closed and never synthesizes missing captures', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'monochrome-baseline-preflight-'));
  const expected = ['visual/chat.png', 'a11y/chat.png'];
  mkdirSync(path.join(root, 'visual'), { recursive: true });
  writeFileSync(path.join(root, 'visual/chat.png'), 'frozen');

  assert.throws(
    () => preflightBaselines(root, expected),
    /missing monochrome baselines: a11y\/chat\.png/u,
  );
  assert.equal(existsSync(path.join(root, expected[1])), false);
});
