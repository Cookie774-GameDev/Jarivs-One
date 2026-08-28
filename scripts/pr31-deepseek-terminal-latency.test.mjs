import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  EXPECTED_NATIVE_ROUTE,
  EXPECTED_TERMINAL_ROUTE,
  LATENCY_PROMPTS,
  LatencyContractError,
  assessPromptQuality,
  compareMeasurementReports,
  parseOpenCodeMeasurement,
  resolveOpenCodeExecutable,
  runTerminalMeasurementSuite,
  validateMeasurementReport,
} from './pr31-deepseek-terminal-latency.mjs';

const TERMINAL_IDENTITY = Object.freeze({
  providerId: 'opencode-go',
  modelId: 'deepseek-v4-flash-vision-exp',
  qualifiedModelId: 'opencode-go/deepseek-v4-flash-vision-exp',
});

const NATIVE_IDENTITY = Object.freeze({
  providerId: 'opencode',
  connectionId: 'opencode-cli',
  modelId: 'opencode-go/deepseek-v4-flash-vision-exp',
});

function completedSample(phase, durationMs, identity) {
  return {
    phase,
    status: 'completed',
    durationMs,
    timeToFirstTextMs: Math.min(25, durationMs),
    identity: { ...identity },
    output: { sha256: 'a'.repeat(64), charCount: 12 },
    quality: { passed: true, checks: [{ id: 'exact_response', passed: true }] },
    sessionContinuity: phase === 'warm' ? true : undefined,
  };
}

function validReport(kind) {
  const identity = kind === 'terminal-opencode' ? TERMINAL_IDENTITY : NATIVE_IDENTITY;
  return {
    schemaVersion: 1,
    suiteId: 'pr31-deepseek-native-terminal-latency-v1',
    generatedAt: '2026-08-28T15:00:00.000Z',
    status: 'complete',
    rawOutputStored: false,
    expectedModelId: 'opencode-go/deepseek-v4-flash-vision-exp',
    environment: {
      kind,
      authority: kind === 'terminal-opencode' ? EXPECTED_TERMINAL_ROUTE : EXPECTED_NATIVE_ROUTE,
    },
    featureEvidence: {
      rlm: { requested: false, observed: false, evidence: 'not exercised by bounded prompts' },
      siyuan: { requested: false, observed: false, evidence: 'not exercised by bounded prompts' },
    },
    prompts: LATENCY_PROMPTS.map((prompt, index) => ({
      id: prompt.id,
      promptSha256: prompt.promptSha256,
      bounds: prompt.bounds,
      samples: {
        cold: completedSample('cold', 100 + index * 10, identity),
        warm: completedSample('warm', 80 + index * 10, identity),
      },
      fileEvidence:
        prompt.id === 'disposable-read'
          ? { inputRead: true, inputSha256: 'b'.repeat(64) }
          : prompt.id === 'disposable-write'
            ? { outputWritten: true, outputSha256: 'c'.repeat(64) }
            : undefined,
    })),
    execution: { budgetMs: 270_000, elapsedMs: 900, tempDirectoryRemoved: true },
    comparisonBoundary:
      kind === 'terminal-opencode'
        ? { status: 'pending-native', requiredEnvironment: 'official-native-vibespace' }
        : { status: 'pending-terminal', requiredEnvironment: 'terminal-opencode' },
  };
}

test('fixes three bounded prompts including disposable read and write', () => {
  assert.deepEqual(
    LATENCY_PROMPTS.map(({ id }) => id),
    ['bounded-reasoning', 'disposable-read', 'disposable-write'],
  );
  assert.equal(new Set(LATENCY_PROMPTS.map(({ promptSha256 }) => promptSha256)).size, 3);
  for (const prompt of LATENCY_PROMPTS) {
    assert.ok(prompt.bounds.timeoutMs <= 35_000);
    assert.ok(prompt.bounds.maxOutputChars <= 2_000);
  }
  assert.match(LATENCY_PROMPTS[1].prompt, /input\.txt/u);
  assert.match(LATENCY_PROMPTS[2].prompt, /output\.txt/u);
});

test('resolves the real Windows executable without a command shell', async () => {
  const resolved = await resolveOpenCodeExecutable({
    platform: 'win32',
    appData: 'C:\\Users\\test\\AppData\\Roaming',
    inspect: async (candidate) => {
      assert.equal(
        candidate,
        'C:\\Users\\test\\AppData\\Roaming\\npm\\node_modules\\opencode-ai\\bin\\opencode.exe',
      );
      return { isFile: () => true };
    },
  });
  assert.match(resolved, /opencode\.exe$/u);
  assert.doesNotMatch(resolved, /\.cmd$/u);
});

test('parses text/session timing and observed identity from sanitized OpenCode data', () => {
  const runOutput = [
    JSON.stringify({ type: 'step_start', sessionID: 'ses_exact' }),
    JSON.stringify({
      type: 'text',
      sessionID: 'ses_exact',
      part: { type: 'text', text: 'ANSWER: 42\nCHECK: 19+23=42' },
    }),
  ].join('\n');
  const sanitizedExport = JSON.stringify({
    messages: [
      {
        info: {
          role: 'assistant',
          providerID: 'opencode-go',
          modelID: 'deepseek-v4-flash-vision-exp',
        },
        parts: [],
      },
    ],
  });

  assert.deepEqual(
    parseOpenCodeMeasurement({
      runOutput,
      sanitizedExport,
      durationMs: 120,
      timeToFirstTextMs: 25,
    }),
    {
      sessionId: 'ses_exact',
      output: 'ANSWER: 42\nCHECK: 19+23=42',
      durationMs: 120,
      timeToFirstTextMs: 25,
      identity: TERMINAL_IDENTITY,
    },
  );
});

test('scores bounded semantic markers without requiring provider formatting', async () => {
  const promptCase = LATENCY_PROMPTS.find(({ id }) => id === 'disposable-read');
  const quality = await assessPromptQuality(
    promptCase,
    { output: `Completed the bounded read.\n${promptCase.expectedResponse}` },
    os.tmpdir(),
  );
  assert.equal(quality.passed, true);
  assert.deepEqual(
    quality.checks.map(({ id }) => id),
    ['response_bounded', 'required_markers', 'no_failure_language'],
  );
});

test('fails closed when terminal or native identity is substituted', () => {
  const terminal = validReport('terminal-opencode');
  terminal.prompts[1].samples.warm.identity.modelId = 'substituted';
  const terminalResult = validateMeasurementReport(terminal);
  assert.equal(terminalResult.ok, false);
  assert.match(terminalResult.errors.join('\n'), /exact terminal route mismatch/u);

  const native = validReport('official-native-vibespace');
  native.prompts[0].samples.cold.identity.connectionId = 'other-connection';
  const nativeResult = validateMeasurementReport(native);
  assert.equal(nativeResult.ok, false);
  assert.match(nativeResult.errors.join('\n'), /exact native route mismatch/u);
});

test('runs a secret-safe terminal suite and removes only its disposable directory', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'pr31-latency-test-parent-'));
  const seenRoots = new Set();
  const secret = 'sk-test-secret-that-must-never-be-reported';
  try {
    const report = await runTerminalMeasurementSuite({
      tempParent: parent,
      cliVersion: 'test-cli',
      measure: async ({ promptCase, phase, sessionId, tempRoot }) => {
        seenRoots.add(tempRoot);
        if (promptCase.id === 'disposable-read') {
          assert.equal(
            await readFile(path.join(tempRoot, 'input.txt'), 'utf8'),
            'alpha=19\nbeta=23\n',
          );
        }
        if (promptCase.id === 'disposable-write') {
          await writeFile(path.join(tempRoot, 'output.txt'), 'LATENCY_OK\n', 'utf8');
        }
        return {
          sessionId: sessionId ?? `ses_${promptCase.id}`,
          output: `${promptCase.expectedResponse}\n${secret}`.replace(`\n${secret}`, ''),
          durationMs: phase === 'cold' ? 120 : 80,
          timeToFirstTextMs: phase === 'cold' ? 30 : 20,
          identity: TERMINAL_IDENTITY,
        };
      },
    });

    assert.equal(validateMeasurementReport(report).ok, true);
    assert.equal(report.execution.tempDirectoryRemoved, true);
    assert.equal(seenRoots.size, 1);
    assert.deepEqual(await readdir(parent), []);
    assert.doesNotMatch(JSON.stringify(report), /sk-test-secret/u);
    assert.doesNotMatch(JSON.stringify(report), /ANSWER: 42/u);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('cleans the disposable directory even when observed identity is wrong', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'pr31-latency-test-parent-'));
  try {
    await assert.rejects(
      runTerminalMeasurementSuite({
        tempParent: parent,
        cliVersion: 'test-cli',
        measure: async ({ promptCase }) => ({
          sessionId: `ses_${promptCase.id}`,
          output: promptCase.expectedResponse,
          durationMs: 10,
          timeToFirstTextMs: 5,
          identity: { ...TERMINAL_IDENTITY, modelId: 'substituted' },
        }),
      }),
      (error) => error instanceof LatencyContractError && error.code === 'route_substitution',
    );
    assert.deepEqual(await readdir(parent), []);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('requires a complete official-native report before calculating comparison', () => {
  const terminal = validReport('terminal-opencode');
  const native = validReport('official-native-vibespace');
  native.status = 'incomplete';
  assert.throws(
    () => compareMeasurementReports(terminal, native),
    (error) => error instanceof LatencyContractError && error.code === 'invalid_native_report',
  );
});

test('compares exact terminal and native reports without response content', () => {
  const comparison = compareMeasurementReports(
    validReport('terminal-opencode'),
    validReport('official-native-vibespace'),
  );
  assert.equal(comparison.status, 'complete');
  assert.equal(comparison.rawOutputStored, false);
  assert.deepEqual(
    comparison.prompts.map(({ id }) => id),
    LATENCY_PROMPTS.map(({ id }) => id),
  );
  assert.equal(comparison.prompts[0].cold.terminalMs, 100);
  assert.equal(comparison.prompts[0].cold.nativeMs, 100);
  assert.equal(comparison.prompts[0].cold.nativeToTerminalRatio, 1);
});

test('checked-in terminal evidence is complete, sanitized, and gives an exact native handoff', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const report = JSON.parse(
    await readFile(
      path.join(root, 'docs/operations/PR31_DEEPSEEK_NATIVE_TERMINAL_LATENCY_REPORT.json'),
      'utf8',
    ),
  );
  assert.deepEqual(validateMeasurementReport(report), { ok: true, errors: [] });
  assert.deepEqual(report.comparisonBoundary.requiredAuthority, EXPECTED_NATIVE_ROUTE);
  assert.deepEqual(
    report.comparisonBoundary.requiredPromptHashes,
    LATENCY_PROMPTS.map(({ id, promptSha256 }) => ({ id, promptSha256 })),
  );
  assert.match(report.comparisonBoundary.processBoundary, /native lane only/iu);
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /"(?:stdout|stderr|sessionId|rawResponse|prompt)"\s*:/u);
});
