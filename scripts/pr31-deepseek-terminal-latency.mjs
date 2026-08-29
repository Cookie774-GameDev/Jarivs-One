import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const SUITE_ID = 'pr31-deepseek-native-terminal-latency-v1';
const EXPECTED_MODEL_ID = 'opencode-go/deepseek-v4-flash-vision-exp';
const TEMP_PREFIX = 'vibespace-pr31-deepseek-latency-';
const EXECUTION_BUDGET_MS = 270_000;
const PROCESS_OUTPUT_LIMIT = 2 * 1024 * 1024;
const PROCESS_ERROR_LIMIT = 64 * 1024;

export const EXPECTED_TERMINAL_ROUTE = Object.freeze({
  requestedModelId: EXPECTED_MODEL_ID,
  observedProviderId: 'opencode-go',
  observedModelId: 'deepseek-v4-flash-vision-exp',
});

export const EXPECTED_NATIVE_ROUTE = Object.freeze({
  providerId: 'opencode',
  connectionId: 'opencode-cli',
  modelId: EXPECTED_MODEL_ID,
});

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function promptCase(definition) {
  const prompt = definition.prompt.trim();
  return Object.freeze({
    ...definition,
    prompt,
    promptSha256: sha256(prompt),
    bounds: Object.freeze({ timeoutMs: 35_000, maxOutputChars: 2_000 }),
  });
}

export const LATENCY_PROMPTS = Object.freeze([
  promptCase({
    id: 'bounded-reasoning',
    prompt: `Do not use tools. Return exactly these two lines and nothing else:
ANSWER: 42
CHECK: 19+23=42`,
    expectedResponse: 'ANSWER: 42\nCHECK: 19+23=42',
  }),
  promptCase({
    id: 'disposable-read',
    prompt: `Read only input.txt in the current working directory. Add the two integer values in that file. Return exactly these two lines and nothing else:
READ_SUM: 42
SOURCE: input.txt`,
    expectedResponse: 'READ_SUM: 42\nSOURCE: input.txt',
  }),
  promptCase({
    id: 'disposable-write',
    prompt: `Read output.txt in the current working directory if it exists; do not rely on any earlier turn's filesystem state. Then write that file as UTF-8 containing exactly LATENCY_OK followed by one newline. Do not inspect any other path. Then return exactly this line and nothing else:
WRITE: output.txt`,
    expectedResponse: 'WRITE: output.txt',
  }),
]);

export class LatencyContractError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'LatencyContractError';
    this.code = code;
  }
}

function recordOf(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

function cleanIdentifier(value, maximum = 512) {
  if (typeof value !== 'string') return undefined;
  const clean = value.trim();
  if (!clean || clean.length > maximum || /[\u0000-\u001f\u007f]/u.test(clean)) return undefined;
  return clean;
}

function parseJsonLines(value) {
  const rows = [];
  for (const line of String(value).split(/\r?\n/u)) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      throw new LatencyContractError('invalid_run_json');
    }
  }
  return rows;
}

function sessionIdFromEvent(event) {
  const row = recordOf(event);
  const properties = recordOf(row?.properties);
  const part = recordOf(row?.part ?? properties?.part);
  return cleanIdentifier(
    row?.sessionID ??
      row?.sessionId ??
      properties?.sessionID ??
      properties?.sessionId ??
      part?.sessionID ??
      part?.sessionId,
  );
}

function textFromEvent(event) {
  const row = recordOf(event);
  const properties = recordOf(row?.properties);
  const part = recordOf(row?.part ?? properties?.part);
  if (part?.type === 'text' && typeof part.text === 'string') return part.text;
  if (row?.type === 'text' && typeof row.text === 'string') return row.text;
  return '';
}

function messagesFromSanitizedExport(value) {
  if (Array.isArray(value)) return value;
  const record = recordOf(value);
  if (Array.isArray(record?.messages)) return record.messages;
  const data = recordOf(record?.data);
  if (Array.isArray(data?.messages)) return data.messages;
  return [];
}

function identityFromSanitizedExport(value) {
  let parsed;
  try {
    parsed = JSON.parse(String(value));
  } catch {
    throw new LatencyContractError('invalid_sanitized_export_json');
  }
  const messages = messagesFromSanitizedExport(parsed);
  const assistant = [...messages].reverse().find((message) => {
    const info = recordOf(recordOf(message)?.info);
    return info?.role === 'assistant';
  });
  const info = recordOf(recordOf(assistant)?.info);
  let providerId = cleanIdentifier(info?.providerID ?? info?.providerId, 128);
  let modelId = cleanIdentifier(info?.modelID ?? info?.modelId, 320);
  if (!modelId) throw new LatencyContractError('observed_identity_missing');
  if (modelId.includes('/')) {
    const separator = modelId.indexOf('/');
    providerId ??= modelId.slice(0, separator);
    if (providerId === modelId.slice(0, separator)) modelId = modelId.slice(separator + 1);
  }
  if (!providerId || !modelId) throw new LatencyContractError('observed_identity_missing');
  return {
    providerId,
    modelId,
    qualifiedModelId: `${providerId}/${modelId}`,
  };
}

export function parseOpenCodeMeasurement({
  runOutput,
  sanitizedExport,
  durationMs,
  timeToFirstTextMs,
}) {
  const rows = parseJsonLines(runOutput);
  const sessionIds = new Set(rows.map(sessionIdFromEvent).filter(Boolean));
  if (sessionIds.size !== 1)
    throw new LatencyContractError('session_identity_missing_or_ambiguous');
  const output = rows.map(textFromEvent).join('');
  if (!output) throw new LatencyContractError('provider_text_missing');
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new LatencyContractError('invalid_duration');
  }
  if (
    !Number.isFinite(timeToFirstTextMs) ||
    timeToFirstTextMs < 0 ||
    timeToFirstTextMs > durationMs
  ) {
    throw new LatencyContractError('invalid_time_to_first_text');
  }
  return {
    sessionId: [...sessionIds][0],
    output,
    durationMs: Math.round(durationMs),
    timeToFirstTextMs: Math.round(timeToFirstTextMs),
    identity: identityFromSanitizedExport(sanitizedExport),
  };
}

function assertExactTerminalIdentity(identity) {
  if (
    identity?.providerId !== EXPECTED_TERMINAL_ROUTE.observedProviderId ||
    identity?.modelId !== EXPECTED_TERMINAL_ROUTE.observedModelId ||
    identity?.qualifiedModelId !== EXPECTED_TERMINAL_ROUTE.requestedModelId
  ) {
    throw new LatencyContractError('route_substitution');
  }
}

function exactNativeIdentity(identity) {
  return (
    identity?.providerId === EXPECTED_NATIVE_ROUTE.providerId &&
    identity?.connectionId === EXPECTED_NATIVE_ROUTE.connectionId &&
    identity?.modelId === EXPECTED_NATIVE_ROUTE.modelId
  );
}

async function readExactFile(pathname) {
  try {
    return await readFile(pathname, 'utf8');
  } catch {
    return undefined;
  }
}

export async function assessPromptQuality(prompt, measurement, tempRoot) {
  const normalized = measurement.output.trim();
  const checks = [
    {
      id: 'response_bounded',
      passed: measurement.output.length <= prompt.bounds.maxOutputChars,
    },
    {
      id: 'required_markers',
      passed: prompt.expectedResponse.split('\n').every((marker) => normalized.includes(marker)),
    },
    {
      id: 'no_failure_language',
      passed: !/\b(?:unable|cannot|failed|error)\b/iu.test(normalized),
    },
  ];
  if (prompt.id === 'disposable-write') {
    checks.push({
      id: 'exact_output_file',
      passed: (await readExactFile(path.join(tempRoot, 'output.txt'))) === 'LATENCY_OK\n',
    });
  }
  return { passed: checks.every(({ passed }) => passed), checks };
}

function sanitizedSample(measurement, phase, quality, sessionContinuity) {
  return {
    phase,
    status: 'completed',
    durationMs: measurement.durationMs,
    timeToFirstTextMs: measurement.timeToFirstTextMs,
    identity: { ...measurement.identity },
    output: {
      sha256: sha256(measurement.output),
      charCount: measurement.output.length,
    },
    quality,
    sessionSha256: sha256(measurement.sessionId),
    ...(phase === 'warm' ? { sessionContinuity } : {}),
  };
}

function terminalComparisonBoundary() {
  return {
    status: 'pending-native',
    requiredEnvironment: 'official-native-vibespace',
    requiredAuthority: EXPECTED_NATIVE_ROUTE,
    requiredPromptHashes: LATENCY_PROMPTS.map(({ id, promptSha256 }) => ({ id, promptSha256 })),
    requiredSampleFields: [
      'cold.durationMs',
      'cold.timeToFirstTextMs',
      'warm.durationMs',
      'warm.timeToFirstTextMs',
      'warm.sessionContinuity',
      'identity.providerId',
      'identity.connectionId',
      'identity.modelId',
      'output.sha256',
      'output.charCount',
      'quality.passed',
    ],
    requiredFeatureFields: [
      'featureEvidence.rlm.requested',
      'featureEvidence.rlm.observed',
      'featureEvidence.rlm.evidence',
      'featureEvidence.siyuan.requested',
      'featureEvidence.siyuan.observed',
      'featureEvidence.siyuan.evidence',
    ],
    processBoundary:
      'The native lane only may attach to the already-running official jarvis.exe WebView, record its owning process/profile, and collect native samples; this terminal lane must not control or restart it.',
    comparisonCommand:
      'node scripts/pr31-deepseek-terminal-latency.mjs --compare --terminal-report <terminal.json> --native-report <native.json> --output <comparison.json>',
    requirement:
      'Run the identical prompt hashes in the already-running official jarvis.exe WebView and provide exact opencode/opencode-cli/opencode-go/deepseek-v4-flash-vision-exp observed identity before comparison.',
  };
}

async function preparePromptFilesystem(prompt, tempRoot) {
  if (prompt.id === 'disposable-read') {
    await writeFile(path.join(tempRoot, 'input.txt'), 'alpha=19\nbeta=23\n', {
      encoding: 'utf8',
      flag: 'wx',
    });
  }
  if (prompt.id === 'disposable-write') {
    await unlink(path.join(tempRoot, 'output.txt')).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }
}

async function prepareWarmWriteState(prompt, tempRoot) {
  if (prompt.id !== 'disposable-write') return;
  await writeFile(path.join(tempRoot, 'output.txt'), 'WARM_REWRITE_REQUIRED\n', {
    encoding: 'utf8',
    flag: 'w',
  });
}

async function fileEvidenceForPrompt(prompt, tempRoot) {
  if (prompt.id === 'disposable-read') {
    const input = await readExactFile(path.join(tempRoot, 'input.txt'));
    return {
      inputRead: input === 'alpha=19\nbeta=23\n',
      inputSha256: sha256(input ?? ''),
    };
  }
  if (prompt.id === 'disposable-write') {
    const output = await readExactFile(path.join(tempRoot, 'output.txt'));
    return {
      outputWritten: output === 'LATENCY_OK\n',
      outputSha256: sha256(output ?? ''),
    };
  }
  return undefined;
}

async function removeDisposableRoot(tempRoot, tempParent) {
  const parent = path.resolve(tempParent);
  const target = path.resolve(tempRoot);
  if (
    path.dirname(target) !== parent ||
    !path.basename(target).startsWith(TEMP_PREFIX) ||
    target === parent
  ) {
    throw new LatencyContractError('unsafe_temp_cleanup_target');
  }
  const stat = await lstat(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new LatencyContractError('unsafe_temp_cleanup_target');
  }
  await rm(target, { recursive: true, force: false });
}

export async function runTerminalMeasurementSuite({
  measure = measureTerminalSample,
  tempParent = os.tmpdir(),
  cliVersion,
  now = () => Date.now(),
} = {}) {
  const parent = path.resolve(tempParent);
  const parentStat = await lstat(parent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
    throw new LatencyContractError('invalid_temp_parent');
  }
  const tempRoot = await mkdtemp(path.join(parent, TEMP_PREFIX));
  const startedAt = now();
  let report;
  try {
    const prompts = [];
    for (const prompt of LATENCY_PROMPTS) {
      if (now() - startedAt > EXECUTION_BUDGET_MS) {
        throw new LatencyContractError('execution_budget_exceeded');
      }
      await preparePromptFilesystem(prompt, tempRoot);
      const cold = await measure({ promptCase: prompt, phase: 'cold', tempRoot });
      assertExactTerminalIdentity(cold.identity);
      const coldQuality = await assessPromptQuality(prompt, cold, tempRoot);
      if (!coldQuality.passed) throw new LatencyContractError(`quality_failed_${prompt.id}_cold`);

      await prepareWarmWriteState(prompt, tempRoot);
      const warm = await measure({
        promptCase: prompt,
        phase: 'warm',
        sessionId: cold.sessionId,
        tempRoot,
      });
      assertExactTerminalIdentity(warm.identity);
      if (warm.sessionId !== cold.sessionId) {
        throw new LatencyContractError('warm_session_substitution');
      }
      const warmQuality = await assessPromptQuality(prompt, warm, tempRoot);
      if (!warmQuality.passed) throw new LatencyContractError(`quality_failed_${prompt.id}_warm`);
      if (now() - startedAt > EXECUTION_BUDGET_MS) {
        throw new LatencyContractError('execution_budget_exceeded');
      }

      prompts.push({
        id: prompt.id,
        promptSha256: prompt.promptSha256,
        bounds: prompt.bounds,
        samples: {
          cold: sanitizedSample(cold, 'cold', coldQuality),
          warm: sanitizedSample(warm, 'warm', warmQuality, true),
        },
        ...(prompt.id === 'bounded-reasoning'
          ? {}
          : { fileEvidence: await fileEvidenceForPrompt(prompt, tempRoot) }),
      });
    }
    report = {
      schemaVersion: 1,
      suiteId: SUITE_ID,
      generatedAt: new Date(now()).toISOString(),
      status: 'complete',
      rawOutputStored: false,
      expectedModelId: EXPECTED_MODEL_ID,
      environment: {
        kind: 'terminal-opencode',
        cliVersion: cleanIdentifier(cliVersion, 64) ?? 'unknown',
        authority: EXPECTED_TERMINAL_ROUTE,
      },
      featureEvidence: {
        rlm: {
          requested: false,
          observed: false,
          evidence:
            'Terminal OpenCode does not expose VibeSpace RLM state; bounded prompts do not request it.',
        },
        siyuan: {
          requested: false,
          observed: false,
          evidence:
            'Terminal OpenCode does not expose VibeSpace SiYuan state; bounded prompts use only task-owned fixtures.',
        },
      },
      prompts,
      execution: {
        budgetMs: EXECUTION_BUDGET_MS,
        elapsedMs: Math.max(0, now() - startedAt),
        tempDirectoryRemoved: false,
      },
      comparisonBoundary: terminalComparisonBoundary(),
    };
  } finally {
    await removeDisposableRoot(tempRoot, parent);
  }
  report.execution.tempDirectoryRemoved = true;
  const validation = validateMeasurementReport(report);
  if (!validation.ok) throw new LatencyContractError('generated_report_invalid');
  return report;
}

function equalAuthority(left, right) {
  const leftKeys = Object.keys(right);
  return leftKeys.every((key) => left?.[key] === right[key]);
}

function isSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function validateFeatureEvidence(featureEvidence, errors) {
  for (const feature of ['rlm', 'siyuan']) {
    const value = featureEvidence?.[feature];
    if (
      typeof value?.requested !== 'boolean' ||
      typeof value?.observed !== 'boolean' ||
      !cleanIdentifier(value?.evidence, 1_000)
    ) {
      errors.push(`${feature} evidence is incomplete`);
    }
  }
}

export function validateMeasurementReport(report) {
  const errors = [];
  if (report?.schemaVersion !== 1 || report?.suiteId !== SUITE_ID) {
    return { ok: false, errors: ['invalid report envelope'] };
  }
  if (report.status !== 'complete') errors.push('report status is not complete');
  if (report.rawOutputStored !== false) errors.push('raw output must not be stored');
  if (report.expectedModelId !== EXPECTED_MODEL_ID) errors.push('expected model mismatch');
  const kind = report.environment?.kind;
  if (kind === 'terminal-opencode') {
    if (!equalAuthority(report.environment?.authority, EXPECTED_TERMINAL_ROUTE)) {
      errors.push('terminal authority mismatch');
    }
  } else if (kind === 'official-native-vibespace') {
    if (!equalAuthority(report.environment?.authority, EXPECTED_NATIVE_ROUTE)) {
      errors.push('native authority mismatch');
    }
  } else {
    errors.push('unsupported environment');
  }
  validateFeatureEvidence(report.featureEvidence, errors);
  if (!Array.isArray(report.prompts) || report.prompts.length !== LATENCY_PROMPTS.length) {
    errors.push('exactly three prompts are required');
  } else {
    for (const [index, expected] of LATENCY_PROMPTS.entries()) {
      const prompt = report.prompts[index];
      if (prompt?.id !== expected.id || prompt?.promptSha256 !== expected.promptSha256) {
        errors.push(`${expected.id}: prompt identity mismatch`);
        continue;
      }
      if (
        prompt?.bounds?.timeoutMs !== expected.bounds.timeoutMs ||
        prompt?.bounds?.maxOutputChars !== expected.bounds.maxOutputChars
      ) {
        errors.push(`${expected.id}: prompt bounds mismatch`);
      }
      for (const phase of ['cold', 'warm']) {
        const sample = prompt?.samples?.[phase];
        if (sample?.phase !== phase || sample?.status !== 'completed') {
          errors.push(`${expected.id}/${phase}: sample incomplete`);
          continue;
        }
        if (
          !Number.isFinite(sample.durationMs) ||
          sample.durationMs < 0 ||
          sample.durationMs > expected.bounds.timeoutMs
        ) {
          errors.push(`${expected.id}/${phase}: invalid duration`);
        }
        if (
          !Number.isFinite(sample.timeToFirstTextMs) ||
          sample.timeToFirstTextMs < 0 ||
          sample.timeToFirstTextMs > sample.durationMs
        ) {
          errors.push(`${expected.id}/${phase}: invalid first-text timing`);
        }
        if (kind === 'terminal-opencode') {
          if (
            sample.identity?.providerId !== EXPECTED_TERMINAL_ROUTE.observedProviderId ||
            sample.identity?.modelId !== EXPECTED_TERMINAL_ROUTE.observedModelId ||
            sample.identity?.qualifiedModelId !== EXPECTED_TERMINAL_ROUTE.requestedModelId
          ) {
            errors.push(`${expected.id}/${phase}: exact terminal route mismatch`);
          }
        } else if (kind === 'official-native-vibespace' && !exactNativeIdentity(sample.identity)) {
          errors.push(`${expected.id}/${phase}: exact native route mismatch`);
        }
        if (!isSha256(sample.output?.sha256) || !Number.isInteger(sample.output?.charCount)) {
          errors.push(`${expected.id}/${phase}: sanitized output evidence missing`);
        } else if (sample.output.charCount > expected.bounds.maxOutputChars) {
          errors.push(`${expected.id}/${phase}: output exceeded bound`);
        }
        if (
          sample.quality?.passed !== true ||
          !Array.isArray(sample.quality?.checks) ||
          sample.quality.checks.some((check) => check?.passed !== true)
        ) {
          errors.push(`${expected.id}/${phase}: quality rubric failed`);
        }
        if (phase === 'warm' && sample.sessionContinuity !== true) {
          errors.push(`${expected.id}/warm: session continuity missing`);
        }
      }
      if (
        expected.id === 'disposable-read' &&
        (prompt?.fileEvidence?.inputRead !== true || !isSha256(prompt?.fileEvidence?.inputSha256))
      ) {
        errors.push('disposable-read: file evidence missing');
      }
      if (
        expected.id === 'disposable-write' &&
        (prompt?.fileEvidence?.outputWritten !== true ||
          !isSha256(prompt?.fileEvidence?.outputSha256))
      ) {
        errors.push('disposable-write: file evidence missing');
      }
    }
  }
  if (
    report.execution?.budgetMs !== EXECUTION_BUDGET_MS ||
    !Number.isFinite(report.execution?.elapsedMs) ||
    report.execution.elapsedMs < 0 ||
    report.execution.elapsedMs > EXECUTION_BUDGET_MS ||
    report.execution?.tempDirectoryRemoved !== true
  ) {
    errors.push('execution boundary invalid');
  }
  const expectedBoundary = kind === 'terminal-opencode' ? 'pending-native' : 'pending-terminal';
  if (report.comparisonBoundary?.status !== expectedBoundary) {
    errors.push('comparison boundary invalid');
  }
  return { ok: errors.length === 0, errors };
}

function ratio(numerator, denominator) {
  return denominator === 0 ? null : Math.round((numerator / denominator) * 1_000) / 1_000;
}

export function compareMeasurementReports(terminalReport, nativeReport) {
  const terminalValidation = validateMeasurementReport(terminalReport);
  if (!terminalValidation.ok || terminalReport.environment?.kind !== 'terminal-opencode') {
    throw new LatencyContractError('invalid_terminal_report');
  }
  const nativeValidation = validateMeasurementReport(nativeReport);
  if (!nativeValidation.ok || nativeReport.environment?.kind !== 'official-native-vibespace') {
    throw new LatencyContractError('invalid_native_report');
  }
  return {
    schemaVersion: 1,
    suiteId: SUITE_ID,
    generatedAt: new Date().toISOString(),
    status: 'complete',
    rawOutputStored: false,
    exactModelId: EXPECTED_MODEL_ID,
    featureEvidence: {
      terminal: terminalReport.featureEvidence,
      native: nativeReport.featureEvidence,
    },
    prompts: LATENCY_PROMPTS.map((prompt, index) => {
      const terminal = terminalReport.prompts[index].samples;
      const native = nativeReport.prompts[index].samples;
      return {
        id: prompt.id,
        promptSha256: prompt.promptSha256,
        cold: {
          terminalMs: terminal.cold.durationMs,
          nativeMs: native.cold.durationMs,
          nativeToTerminalRatio: ratio(native.cold.durationMs, terminal.cold.durationMs),
        },
        warm: {
          terminalMs: terminal.warm.durationMs,
          nativeMs: native.warm.durationMs,
          nativeToTerminalRatio: ratio(native.warm.durationMs, terminal.warm.durationMs),
        },
        qualityPassed:
          terminal.cold.quality.passed &&
          terminal.warm.quality.passed &&
          native.cold.quality.passed &&
          native.warm.quality.passed,
      };
    }),
  };
}

function firstTextTimeFromBuffer(buffer, startedAt) {
  for (const line of buffer.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    try {
      if (textFromEvent(JSON.parse(line))) return performance.now() - startedAt;
    } catch {
      // A partial line is expected while streaming; final parsing remains strict.
    }
  }
  return undefined;
}

async function executeOpenCode(args, { timeoutMs, trackFirstText = false } = {}) {
  const executable = await resolveOpenCodeExecutable();
  const startedAt = performance.now();
  return await new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(executable, args, {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      reject(new LatencyContractError('opencode_process_unavailable'));
      return;
    }
    let stdout = '';
    let stderr = '';
    let firstTextMs;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs ?? 10_000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.length > PROCESS_OUTPUT_LIMIT) {
        child.kill();
        return;
      }
      if (trackFirstText && firstTextMs === undefined) {
        firstTextMs = firstTextTimeFromBuffer(stdout, startedAt);
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (stderr.length > PROCESS_ERROR_LIMIT) child.kill();
    });
    child.once('error', () => {
      clearTimeout(timer);
      reject(new LatencyContractError('opencode_process_unavailable'));
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      const durationMs = performance.now() - startedAt;
      if (timedOut) return reject(new LatencyContractError('opencode_process_timeout'));
      if (stdout.length > PROCESS_OUTPUT_LIMIT || stderr.length > PROCESS_ERROR_LIMIT) {
        return reject(new LatencyContractError('opencode_process_output_exceeded'));
      }
      if (code !== 0) return reject(new LatencyContractError('opencode_process_failed'));
      resolve({ stdout, durationMs, firstTextMs });
    });
  });
}

export async function resolveOpenCodeExecutable({
  platform = process.platform,
  appData = process.env.APPDATA,
  inspect = lstat,
} = {}) {
  if (platform !== 'win32') return 'opencode';
  if (!cleanIdentifier(appData, 1_024)) {
    throw new LatencyContractError('opencode_process_unavailable');
  }
  const candidate = path.win32.resolve(
    appData,
    'npm',
    'node_modules',
    'opencode-ai',
    'bin',
    'opencode.exe',
  );
  try {
    const stat = await inspect(candidate);
    if (!stat.isFile()) throw new Error('not a file');
  } catch {
    throw new LatencyContractError('opencode_process_unavailable');
  }
  return candidate;
}

async function sessionIdFromRunOutput(runOutput) {
  const ids = new Set(parseJsonLines(runOutput).map(sessionIdFromEvent).filter(Boolean));
  if (ids.size !== 1) throw new LatencyContractError('session_identity_missing_or_ambiguous');
  return [...ids][0];
}

export async function measureTerminalSample({ promptCase, phase, sessionId, tempRoot }) {
  const args = [
    'run',
    '--pure',
    '--format',
    'json',
    '--model',
    EXPECTED_MODEL_ID,
    '--dir',
    tempRoot,
    '--title',
    `PR31 latency ${promptCase.id}`,
    ...(phase === 'warm' ? ['--session', sessionId] : []),
    promptCase.prompt,
  ];
  let run;
  try {
    run = await executeOpenCode(args, {
      timeoutMs: promptCase.bounds.timeoutMs,
      trackFirstText: true,
    });
  } catch (error) {
    if (error instanceof LatencyContractError && error.code === 'opencode_process_failed') {
      throw new LatencyContractError(`opencode_run_failed_${promptCase.id}_${phase}`);
    }
    throw error;
  }
  const observedSessionId = await sessionIdFromRunOutput(run.stdout);
  let exported;
  try {
    exported = await executeOpenCode(['export', '--pure', '--sanitize', observedSessionId], {
      timeoutMs: 10_000,
    });
  } catch (error) {
    if (error instanceof LatencyContractError && error.code === 'opencode_process_failed') {
      throw new LatencyContractError(`opencode_export_failed_${promptCase.id}_${phase}`);
    }
    throw error;
  }
  return parseOpenCodeMeasurement({
    runOutput: run.stdout,
    sanitizedExport: exported.stdout,
    durationMs: run.durationMs,
    timeToFirstTextMs: run.firstTextMs ?? run.durationMs,
  });
}

function failureReport(error, cliVersion) {
  return {
    schemaVersion: 1,
    suiteId: SUITE_ID,
    generatedAt: new Date().toISOString(),
    status: 'incomplete',
    rawOutputStored: false,
    expectedModelId: EXPECTED_MODEL_ID,
    environment: {
      kind: 'terminal-opencode',
      cliVersion: cleanIdentifier(cliVersion, 64) ?? 'unknown',
      authority: EXPECTED_TERMINAL_ROUTE,
    },
    failure: {
      code: error instanceof LatencyContractError ? error.code : 'unexpected_terminal_failure',
      rawErrorStored: false,
    },
    featureEvidence: {
      rlm: { requested: false, observed: false, evidence: 'not reached or not observable' },
      siyuan: { requested: false, observed: false, evidence: 'not reached or not observable' },
    },
    comparisonBoundary: {
      status: 'terminal-incomplete',
      requiredEnvironment: 'terminal-opencode',
    },
  };
}

async function writeJsonAtomic(outputPath, value) {
  const target = path.resolve(outputPath);
  if (path.extname(target).toLocaleLowerCase('en-US') !== '.json') {
    throw new LatencyContractError('output_must_be_json');
  }
  const temporary = `${target}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  await rename(temporary, target);
}

function parseArgs(argv) {
  const values = new Map();
  let mode;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--terminal' || arg === '--compare') {
      if (mode) throw new LatencyContractError('invalid_arguments');
      mode = arg.slice(2);
      continue;
    }
    if (['--output', '--terminal-report', '--native-report'].includes(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new LatencyContractError('invalid_arguments');
      values.set(arg, value);
      index += 1;
      continue;
    }
    throw new LatencyContractError('invalid_arguments');
  }
  if (!mode || !values.get('--output')) throw new LatencyContractError('invalid_arguments');
  if (mode === 'compare' && (!values.get('--terminal-report') || !values.get('--native-report'))) {
    throw new LatencyContractError('invalid_arguments');
  }
  return {
    mode,
    output: values.get('--output'),
    terminalReport: values.get('--terminal-report'),
    nativeReport: values.get('--native-report'),
  };
}

async function cliVersion() {
  const result = await executeOpenCode(['--version'], { timeoutMs: 10_000 });
  return cleanIdentifier(result.stdout, 64) ?? 'unknown';
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.mode === 'compare') {
    const terminal = JSON.parse(await readFile(path.resolve(options.terminalReport), 'utf8'));
    const native = JSON.parse(await readFile(path.resolve(options.nativeReport), 'utf8'));
    await writeJsonAtomic(options.output, compareMeasurementReports(terminal, native));
    return;
  }
  let version = 'unavailable';
  try {
    version = await cliVersion();
    const report = await runTerminalMeasurementSuite({ cliVersion: version });
    await writeJsonAtomic(options.output, report);
  } catch (error) {
    await writeJsonAtomic(options.output, failureReport(error, version));
    throw error;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    const code = error instanceof LatencyContractError ? error.code : 'unexpected_failure';
    console.error(JSON.stringify({ ok: false, code, rawErrorStored: false }));
    process.exitCode = 1;
  });
}
