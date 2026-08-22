import { DIRECT_GATEWAY_STAGE_NAMES } from './contextGatewayAcceptanceMetrics';
import type { ContextGatewayAcceptanceInput } from './contextGatewayAcceptanceSuite';

type JsonRecord = Record<string, unknown>;

const DIRECT_FAILURES = new Set(['p95-relative', 'p95-absolute', 'p99-relative', 'p99-absolute']);
const RETRIEVAL_FAILURES = new Set(['focused-p95', 'deep-p95', 'deep-hard-deadline']);

function record(value: unknown, label: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function exactKeys(
  value: JsonRecord,
  required: readonly string[],
  label: string,
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`${label} contains an unknown field`);
  }
  for (const key of required) {
    if (!(key in value)) throw new TypeError(`${label}.${key} is required`);
  }
}

function safeString(value: unknown, label: string, maxLength = 4_096): string {
  if (
    typeof value !== 'string' ||
    value.length > maxLength ||
    /[\u0000-\u001f\u007f-\u009f]/u.test(value)
  ) {
    throw new TypeError(`${label} must be bounded safe text`);
  }
  return value;
}

function bool(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be boolean`);
  return value;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite`);
  }
  return value;
}

function safeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function boundedArray(value: unknown, label: string, maxLength = 1_000): unknown[] {
  if (!Array.isArray(value) || value.length > maxLength) {
    throw new TypeError(`${label} must be a bounded array`);
  }
  return value;
}

function distribution(value: unknown, label: string, includeMax = false): void {
  const input = record(value, label);
  const keys = includeMax ? ['p50', 'p95', 'p99', 'max'] : ['p50', 'p95', 'p99'];
  exactKeys(input, keys, label);
  for (const key of keys) finite(input[key], `${label}.${key}`);
}

function integerDistribution(value: unknown, label: string): void {
  const input = record(value, label);
  const keys = ['p50', 'p95', 'p99', 'max'] as const;
  exactKeys(input, keys, label);
  for (const key of keys) safeInteger(input[key], `${label}.${key}`);
}

function failureList(value: unknown, allowed: ReadonlySet<string>, label: string): void {
  for (const [index, item] of boundedArray(value, label, 16).entries()) {
    const failure = safeString(item, `${label}[${index}]`, 64);
    if (!allowed.has(failure)) throw new TypeError(`${label} contains an unknown failure`);
  }
}

function directReport(value: unknown, label: string): void {
  const input = record(value, label);
  exactKeys(
    input,
    [
      'sampleCount',
      'passed',
      'failures',
      'baselineMs',
      'overheadMs',
      'overheadRatio',
      'gatewayStageTimingsMs',
      'relativeBudgetsMs',
      'effectiveBudgetsMs',
    ],
    label,
  );
  safeInteger(input.sampleCount, `${label}.sampleCount`);
  bool(input.passed, `${label}.passed`);
  failureList(input.failures, DIRECT_FAILURES, `${label}.failures`);
  distribution(input.baselineMs, `${label}.baselineMs`);
  distribution(input.overheadMs, `${label}.overheadMs`);
  distribution(input.overheadRatio, `${label}.overheadRatio`);
  const stages = record(input.gatewayStageTimingsMs, `${label}.gatewayStageTimingsMs`);
  exactKeys(stages, DIRECT_GATEWAY_STAGE_NAMES, `${label}.gatewayStageTimingsMs`);
  for (const stage of DIRECT_GATEWAY_STAGE_NAMES) {
    distribution(stages[stage], `${label}.gatewayStageTimingsMs.${stage}`);
  }
  for (const field of ['relativeBudgetsMs', 'effectiveBudgetsMs'] as const) {
    const budgets = record(input[field], `${label}.${field}`);
    exactKeys(budgets, ['p95', 'p99'], `${label}.${field}`);
    finite(budgets.p95, `${label}.${field}.p95`);
    finite(budgets.p99, `${label}.${field}.p99`);
  }
}

function retrievalReport(value: unknown, label: string): void {
  const input = record(value, label);
  exactKeys(
    input,
    [
      'route',
      'sampleCount',
      'passed',
      'failures',
      'retrievalMs',
      'candidateCount',
      'hydratedCount',
    ],
    label,
  );
  const route = safeString(input.route, `${label}.route`, 16);
  if (route !== 'focused' && route !== 'deep') throw new TypeError(`${label}.route is invalid`);
  safeInteger(input.sampleCount, `${label}.sampleCount`);
  bool(input.passed, `${label}.passed`);
  failureList(input.failures, RETRIEVAL_FAILURES, `${label}.failures`);
  distribution(input.retrievalMs, `${label}.retrievalMs`, true);
  integerDistribution(input.candidateCount, `${label}.candidateCount`);
  integerDistribution(input.hydratedCount, `${label}.hydratedCount`);
}

export function parseContextGatewayAcceptanceInput(value: unknown): ContextGatewayAcceptanceInput {
  const input = record(value, 'acceptance');
  exactKeys(
    input,
    [
      'build',
      'directReports',
      'nativeProofs',
      'featureParityPassed',
      'concurrentScopeIsolationPassed',
      'rollbackNotes',
      'externalBlockers',
    ],
    'acceptance',
    ['focusedReport', 'deepReport'],
  );

  const build = record(input.build, 'acceptance.build');
  exactKeys(build, ['commitSha', 'buildId', 'runtimeGeneration'], 'acceptance.build');
  safeString(build.commitSha, 'acceptance.build.commitSha', 64);
  safeString(build.buildId, 'acceptance.build.buildId', 256);
  safeString(build.runtimeGeneration, 'acceptance.build.runtimeGeneration', 256);

  for (const [index, rowValue] of boundedArray(
    input.directReports,
    'acceptance.directReports',
    32,
  ).entries()) {
    const row = record(rowValue, `acceptance.directReports[${index}]`);
    exactKeys(row, ['surfaceId', 'report'], `acceptance.directReports[${index}]`);
    safeString(row.surfaceId, `acceptance.directReports[${index}].surfaceId`, 64);
    directReport(row.report, `acceptance.directReports[${index}].report`);
  }
  if ('focusedReport' in input) retrievalReport(input.focusedReport, 'acceptance.focusedReport');
  if ('deepReport' in input) retrievalReport(input.deepReport, 'acceptance.deepReport');

  for (const [index, proofValue] of boundedArray(
    input.nativeProofs,
    'acceptance.nativeProofs',
    32,
  ).entries()) {
    const label = `acceptance.nativeProofs[${index}]`;
    const proof = record(proofValue, label);
    exactKeys(
      proof,
      [
        'surfaceId',
        'evidenceId',
        'recordedAt',
        'commitSha',
        'runtimeGeneration',
        'officialDesktop',
        'productionDispatcherBound',
        'exactExecutionIdentityObserved',
        'contextReceiptVerified',
        'scopeIsolationVerified',
        'cancellationVerified',
        'streamingVerified',
        'noDuplicateDispatchVerified',
      ],
      label,
    );
    for (const field of [
      'surfaceId',
      'evidenceId',
      'recordedAt',
      'commitSha',
      'runtimeGeneration',
    ]) {
      safeString(proof[field], `${label}.${field}`, 256);
    }
    for (const field of [
      'officialDesktop',
      'productionDispatcherBound',
      'exactExecutionIdentityObserved',
      'contextReceiptVerified',
      'scopeIsolationVerified',
      'cancellationVerified',
      'streamingVerified',
      'noDuplicateDispatchVerified',
    ]) {
      bool(proof[field], `${label}.${field}`);
    }
  }

  bool(input.featureParityPassed, 'acceptance.featureParityPassed');
  bool(input.concurrentScopeIsolationPassed, 'acceptance.concurrentScopeIsolationPassed');
  safeString(input.rollbackNotes, 'acceptance.rollbackNotes', 8_192);
  for (const [index, blockerValue] of boundedArray(
    input.externalBlockers,
    'acceptance.externalBlockers',
    64,
  ).entries()) {
    const label = `acceptance.externalBlockers[${index}]`;
    const blocker = record(blockerValue, label);
    exactKeys(blocker, ['code', 'recovery'], label);
    safeString(blocker.code, `${label}.code`, 256);
    safeString(blocker.recovery, `${label}.recovery`, 1_024);
  }

  return input as unknown as ContextGatewayAcceptanceInput;
}
