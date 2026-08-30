import {
  DIRECT_GATEWAY_LIFECYCLE_TIMING_NAMES,
  DIRECT_GATEWAY_STAGE_NAMES,
} from './contextGatewayAcceptanceMetrics';
import {
  REQUIRED_PHASE0_SCENARIOS,
  type ContextGatewayAcceptanceInput,
} from './contextGatewayAcceptanceSuite';
import { CONTEXT_RETRIEVAL_STAGE_NAMES } from './contextGatewayRetrievalAcceptance';

type JsonRecord = Record<string, unknown>;

const DIRECT_FAILURES = new Set(['p95-relative', 'p95-absolute', 'p99-relative', 'p99-absolute']);
const RETRIEVAL_FAILURES = new Set([
  'focused-p95',
  'deep-p95',
  'deep-hard-deadline',
  'top-result-accuracy',
  'citation-verification',
  'answer-rubric',
]);

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

function fullGitSha(value: unknown, label: string): string {
  const result = safeString(value, label, 64);
  if (!/^[0-9a-f]{40}$/iu.test(result)) throw new TypeError(`${label} must be a full Git SHA`);
  return result;
}

function sha256(value: unknown, label: string): string {
  const result = safeString(value, label, 80);
  if (!/^sha256:[0-9a-f]{64}$/iu.test(result)) throw new TypeError(`${label} must be SHA-256`);
  return result;
}

function canonicalIso(value: unknown, label: string): string {
  const result = safeString(value, label, 64);
  const timestamp = Date.parse(result);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== result) {
    throw new TypeError(`${label} must be a canonical ISO timestamp`);
  }
  return result;
}

function enumValue(value: unknown, allowed: ReadonlySet<string>, label: string): string {
  const result = safeString(value, label, 128);
  if (!allowed.has(result)) throw new TypeError(`${label} is invalid`);
  return result;
}

function contextUri(
  value: unknown,
  kind: 'receipt' | 'source' | 'evidence',
  label: string,
): string {
  const result = safeString(value, label, 1_024);
  const prefix = `vibespace:context/${kind}/`;
  const suffix = result.startsWith(prefix) ? result.slice(prefix.length) : '';
  const segments = suffix.split('/');
  if (
    !suffix ||
    segments.some(
      (segment) =>
        !segment || segment === '.' || segment === '..' || !/^[A-Za-z0-9._~:@+-]+$/u.test(segment),
    )
  ) {
    throw new TypeError(`${label} must be a canonical Context URI`);
  }
  return result;
}

const PHASE0_ROUTE_FIXTURES = new Set(['deepseek_v4_flash_vision_exp', 'secondary_authenticated']);
const PHASE0_SCENARIO_IDS = new Set<string>(REQUIRED_PHASE0_SCENARIOS);

function phase0Identity(value: unknown, label: string): void {
  const identity = record(value, label);
  const stringFields = [
    'providerId',
    'connectionId',
    'providerQualifiedModelId',
    'upstreamProviderId',
    'upstreamModelId',
    'variant',
    'effort',
    'performance',
    'fastMode',
    'cwd',
    'authBillingRoute',
    'identityPathId',
  ] as const;
  exactKeys(identity, [...stringFields, 'catalogRevision', 'sessionIdentityHash'], label);
  for (const field of stringFields) safeString(identity[field], `${label}.${field}`, 512);
  sha256(identity.catalogRevision, `${label}.catalogRevision`);
  sha256(identity.sessionIdentityHash, `${label}.sessionIdentityHash`);
}

function canonicalContextUriArray(
  value: unknown,
  kind: 'source' | 'evidence',
  label: string,
): void {
  for (const [index, item] of boundedArray(value, label, 16).entries()) {
    contextUri(item, kind, `${label}[${index}]`);
  }
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
      'resources',
      'lifecycle',
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
  const resources = record(input.resources, `${label}.resources`);
  exactKeys(resources, ['baseline', 'gateway'], `${label}.resources`);
  for (const side of ['baseline', 'gateway'] as const) {
    const metrics = record(resources[side], `${label}.resources.${side}`);
    exactKeys(
      metrics,
      ['cpuPercent', 'workingSetMiB', 'processCount'],
      `${label}.resources.${side}`,
    );
    distribution(metrics.cpuPercent, `${label}.resources.${side}.cpuPercent`);
    distribution(metrics.workingSetMiB, `${label}.resources.${side}.workingSetMiB`);
    const processCount = record(metrics.processCount, `${label}.resources.${side}.processCount`);
    exactKeys(processCount, ['p50', 'p95', 'p99'], `${label}.resources.${side}.processCount`);
    for (const percentile of ['p50', 'p95', 'p99'] as const) {
      safeInteger(
        processCount[percentile],
        `${label}.resources.${side}.processCount.${percentile}`,
      );
    }
  }
  const lifecycle = record(input.lifecycle, `${label}.lifecycle`);
  exactKeys(lifecycle, ['baseline', 'gateway'], `${label}.lifecycle`);
  for (const side of ['baseline', 'gateway'] as const) {
    const timings = record(lifecycle[side], `${label}.lifecycle.${side}`);
    exactKeys(timings, DIRECT_GATEWAY_LIFECYCLE_TIMING_NAMES, `${label}.lifecycle.${side}`);
    for (const timing of DIRECT_GATEWAY_LIFECYCLE_TIMING_NAMES) {
      distribution(timings[timing], `${label}.lifecycle.${side}.${timing}`);
    }
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
      'stageTimingsMs',
      'rlmSubqueryCount',
      'quality',
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
  const stages = record(input.stageTimingsMs, `${label}.stageTimingsMs`);
  exactKeys(stages, CONTEXT_RETRIEVAL_STAGE_NAMES, `${label}.stageTimingsMs`);
  for (const stage of CONTEXT_RETRIEVAL_STAGE_NAMES) {
    distribution(stages[stage], `${label}.stageTimingsMs.${stage}`, true);
  }
  integerDistribution(input.rlmSubqueryCount, `${label}.rlmSubqueryCount`);
  const quality = record(input.quality, `${label}.quality`);
  const qualityFields = [
    'topResultAccuracy',
    'citationVerificationRate',
    'answerRubricPassRate',
  ] as const;
  exactKeys(quality, qualityFields, `${label}.quality`);
  for (const field of qualityFields) {
    const rate = finite(quality[field], `${label}.quality.${field}`);
    if (rate < 0 || rate > 1) throw new TypeError(`${label}.quality.${field} must be a rate`);
  }
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
    ['focusedReport', 'deepReport', 'rollbackProof', 'isolationProof', 'phase0Proof'],
  );

  const build = record(input.build, 'acceptance.build');
  exactKeys(build, ['commitSha', 'buildId', 'runtimeGeneration'], 'acceptance.build');
  safeString(build.commitSha, 'acceptance.build.commitSha', 64);
  safeString(build.buildId, 'acceptance.build.buildId', 256);
  safeString(build.runtimeGeneration, 'acceptance.build.runtimeGeneration', 256);

  if ('phase0Proof' in input) {
    const proof = record(input.phase0Proof, 'acceptance.phase0Proof');
    exactKeys(
      proof,
      [
        'evidenceId',
        'nativeRunId',
        'recordedAt',
        'commitSha',
        'runtimeGeneration',
        'executableSha256',
        'officialDesktop',
        'hmrEventsDuringTurns',
        'unexpectedReloadEventsDuringTurns',
        'inFlightReloadCount',
        'routes',
        'scenarios',
        'artifact',
        'citations',
        'safety',
      ],
      'acceptance.phase0Proof',
    );
    safeString(proof.evidenceId, 'acceptance.phase0Proof.evidenceId', 256);
    safeString(proof.nativeRunId, 'acceptance.phase0Proof.nativeRunId', 256);
    canonicalIso(proof.recordedAt, 'acceptance.phase0Proof.recordedAt');
    fullGitSha(proof.commitSha, 'acceptance.phase0Proof.commitSha');
    safeString(proof.runtimeGeneration, 'acceptance.phase0Proof.runtimeGeneration', 256);
    sha256(proof.executableSha256, 'acceptance.phase0Proof.executableSha256');
    bool(proof.officialDesktop, 'acceptance.phase0Proof.officialDesktop');
    for (const field of [
      'hmrEventsDuringTurns',
      'unexpectedReloadEventsDuringTurns',
      'inFlightReloadCount',
    ]) {
      safeInteger(proof[field], `acceptance.phase0Proof.${field}`);
    }
    for (const [index, routeValue] of boundedArray(
      proof.routes,
      'acceptance.phase0Proof.routes',
      2,
    ).entries()) {
      const label = `acceptance.phase0Proof.routes[${index}]`;
      const route = record(routeValue, label);
      exactKeys(
        route,
        [
          'fixture',
          'evidenceId',
          'nativeRunId',
          'requested',
          'observed',
          'liveCatalogAuthenticated',
          'completedThroughOpenCode',
          'contextReceiptVerified',
          'silentFallbackUsed',
        ],
        label,
      );
      enumValue(route.fixture, PHASE0_ROUTE_FIXTURES, `${label}.fixture`);
      safeString(route.evidenceId, `${label}.evidenceId`, 256);
      safeString(route.nativeRunId, `${label}.nativeRunId`, 256);
      phase0Identity(route.requested, `${label}.requested`);
      phase0Identity(route.observed, `${label}.observed`);
      for (const field of [
        'liveCatalogAuthenticated',
        'completedThroughOpenCode',
        'contextReceiptVerified',
        'silentFallbackUsed',
      ]) {
        bool(route[field], `${label}.${field}`);
      }
    }
    for (const [index, scenarioValue] of boundedArray(
      proof.scenarios,
      'acceptance.phase0Proof.scenarios',
      13,
    ).entries()) {
      const label = `acceptance.phase0Proof.scenarios[${index}]`;
      const scenario = record(scenarioValue, label);
      exactKeys(
        scenario,
        [
          'scenarioId',
          'evidenceId',
          'nativeRunId',
          'activation',
          'routeFixture',
          'requestFixtureHash',
          'requestedIdentity',
          'observedIdentity',
          'gateway',
          'outcome',
        ],
        label,
        ['exactFile', 'binary', 'lifecycle', 'isolation', 'reloadAfterPriorTerminal'],
      );
      enumValue(scenario.scenarioId, PHASE0_SCENARIO_IDS, `${label}.scenarioId`);
      safeString(scenario.evidenceId, `${label}.evidenceId`, 256);
      safeString(scenario.nativeRunId, `${label}.nativeRunId`, 256);
      enumValue(
        scenario.activation,
        new Set(['automatic', 'explicit_rlm_on', 'fixture']),
        `${label}.activation`,
      );
      enumValue(scenario.routeFixture, PHASE0_ROUTE_FIXTURES, `${label}.routeFixture`);
      sha256(scenario.requestFixtureHash, `${label}.requestFixtureHash`);
      phase0Identity(scenario.requestedIdentity, `${label}.requestedIdentity`);
      phase0Identity(scenario.observedIdentity, `${label}.observedIdentity`);
      const gateway = record(scenario.gateway, `${label}.gateway`);
      exactKeys(
        gateway,
        [
          'operation',
          'invocationCount',
          'initialMatchCount',
          'continuationCount',
          'receiptUri',
          'sourceUris',
          'evidenceUris',
        ],
        `${label}.gateway`,
      );
      enumValue(gateway.operation, new Set(['investigate']), `${label}.gateway.operation`);
      safeInteger(gateway.invocationCount, `${label}.gateway.invocationCount`);
      if (gateway.initialMatchCount !== null)
        safeInteger(gateway.initialMatchCount, `${label}.gateway.initialMatchCount`);
      safeInteger(gateway.continuationCount, `${label}.gateway.continuationCount`);
      if (gateway.receiptUri !== null)
        contextUri(gateway.receiptUri, 'receipt', `${label}.gateway.receiptUri`);
      canonicalContextUriArray(gateway.sourceUris, 'source', `${label}.gateway.sourceUris`);
      canonicalContextUriArray(gateway.evidenceUris, 'evidence', `${label}.gateway.evidenceUris`);

      const outcome = record(scenario.outcome, `${label}.outcome`);
      exactKeys(
        outcome,
        [
          'terminalStatus',
          'groundedFinalAnswer',
          'duplicateDispatchCount',
          'duplicateToolEffectCount',
          'localFallbackUsed',
        ],
        `${label}.outcome`,
      );
      enumValue(
        outcome.terminalStatus,
        new Set(['done', 'cancelled', 'denied', 'failed']),
        `${label}.outcome.terminalStatus`,
      );
      bool(outcome.groundedFinalAnswer, `${label}.outcome.groundedFinalAnswer`);
      safeInteger(outcome.duplicateDispatchCount, `${label}.outcome.duplicateDispatchCount`);
      safeInteger(outcome.duplicateToolEffectCount, `${label}.outcome.duplicateToolEffectCount`);
      bool(outcome.localFallbackUsed, `${label}.outcome.localFallbackUsed`);

      if ('exactFile' in scenario) {
        const exactFile = record(scenario.exactFile, `${label}.exactFile`);
        exactKeys(
          exactFile,
          [
            'permitted',
            'resultCode',
            'sourceIdentityVerified',
            'requestedPathHash',
            'observedPathHash',
            'policyRootHash',
            'policyBoundary',
          ],
          `${label}.exactFile`,
        );
        bool(exactFile.permitted, `${label}.exactFile.permitted`);
        enumValue(
          exactFile.resultCode,
          new Set(['ok', 'external_directory']),
          `${label}.exactFile.resultCode`,
        );
        bool(exactFile.sourceIdentityVerified, `${label}.exactFile.sourceIdentityVerified`);
        sha256(exactFile.requestedPathHash, `${label}.exactFile.requestedPathHash`);
        sha256(exactFile.observedPathHash, `${label}.exactFile.observedPathHash`);
        sha256(exactFile.policyRootHash, `${label}.exactFile.policyRootHash`);
        enumValue(
          exactFile.policyBoundary,
          new Set(['within_project', 'external_directory']),
          `${label}.exactFile.policyBoundary`,
        );
      }
      if ('binary' in scenario) {
        const binary = record(scenario.binary, `${label}.binary`);
        exactKeys(
          binary,
          ['graphMetadataPresent', 'physicalTextExcluded', 'remainingCorpusCompleted'],
          `${label}.binary`,
        );
        for (const field of [
          'graphMetadataPresent',
          'physicalTextExcluded',
          'remainingCorpusCompleted',
        ]) {
          bool(binary[field], `${label}.binary.${field}`);
        }
      }
      if ('lifecycle' in scenario) {
        const lifecycle = record(scenario.lifecycle, `${label}.lifecycle`);
        exactKeys(
          lifecycle,
          [
            'attempted',
            'recovered',
            'routeIdentityStable',
            'sessionIdentityStable',
            'noLateEvents',
            'attemptIds',
            'logicalDispatchCount',
            'terminalAttemptId',
            'toolEffectCount',
            'lateEventCount',
          ],
          `${label}.lifecycle`,
        );
        for (const field of [
          'attempted',
          'recovered',
          'routeIdentityStable',
          'sessionIdentityStable',
          'noLateEvents',
        ]) {
          bool(lifecycle[field], `${label}.lifecycle.${field}`);
        }
        const attemptIds = boundedArray(lifecycle.attemptIds, `${label}.lifecycle.attemptIds`, 16);
        for (const [attemptIndex, attemptId] of attemptIds.entries()) {
          safeString(attemptId, `${label}.lifecycle.attemptIds[${attemptIndex}]`, 256);
        }
        safeInteger(lifecycle.logicalDispatchCount, `${label}.lifecycle.logicalDispatchCount`);
        safeString(lifecycle.terminalAttemptId, `${label}.lifecycle.terminalAttemptId`, 256);
        safeInteger(lifecycle.toolEffectCount, `${label}.lifecycle.toolEffectCount`);
        safeInteger(lifecycle.lateEventCount, `${label}.lifecycle.lateEventCount`);
      }
      if ('isolation' in scenario) {
        const isolation = record(scenario.isolation, `${label}.isolation`);
        exactKeys(
          isolation,
          [
            'sourceProjectHash',
            'otherProjectHash',
            'crossProjectReadBlocked',
            'crossProjectEvidenceReuseBlocked',
          ],
          `${label}.isolation`,
        );
        sha256(isolation.sourceProjectHash, `${label}.isolation.sourceProjectHash`);
        sha256(isolation.otherProjectHash, `${label}.isolation.otherProjectHash`);
        bool(isolation.crossProjectReadBlocked, `${label}.isolation.crossProjectReadBlocked`);
        bool(
          isolation.crossProjectEvidenceReuseBlocked,
          `${label}.isolation.crossProjectEvidenceReuseBlocked`,
        );
      }
      if ('reloadAfterPriorTerminal' in scenario) {
        bool(scenario.reloadAfterPriorTerminal, `${label}.reloadAfterPriorTerminal`);
      }
    }
    const artifact = record(proof.artifact, 'acceptance.phase0Proof.artifact');
    exactKeys(
      artifact,
      [
        'evidenceId',
        'nativeRunId',
        'requiredRoot',
        'observedRoot',
        'exists',
        'readbackVerified',
        'manifest',
      ],
      'acceptance.phase0Proof.artifact',
    );
    safeString(artifact.evidenceId, 'acceptance.phase0Proof.artifact.evidenceId', 256);
    safeString(artifact.nativeRunId, 'acceptance.phase0Proof.artifact.nativeRunId', 256);
    safeString(artifact.requiredRoot, 'acceptance.phase0Proof.artifact.requiredRoot', 512);
    safeString(artifact.observedRoot, 'acceptance.phase0Proof.artifact.observedRoot', 512);
    bool(artifact.exists, 'acceptance.phase0Proof.artifact.exists');
    bool(artifact.readbackVerified, 'acceptance.phase0Proof.artifact.readbackVerified');
    for (const [index, entryValue] of boundedArray(
      artifact.manifest,
      'acceptance.phase0Proof.artifact.manifest',
      256,
    ).entries()) {
      const label = `acceptance.phase0Proof.artifact.manifest[${index}]`;
      const entry = record(entryValue, label);
      exactKeys(entry, ['relativePath', 'byteCount', 'sha256'], label);
      safeString(entry.relativePath, `${label}.relativePath`, 512);
      safeInteger(entry.byteCount, `${label}.byteCount`);
      sha256(entry.sha256, `${label}.sha256`);
    }
    for (const [index, citationValue] of boundedArray(
      proof.citations,
      'acceptance.phase0Proof.citations',
      3,
    ).entries()) {
      const label = `acceptance.phase0Proof.citations[${index}]`;
      const citation = record(citationValue, label);
      exactKeys(
        citation,
        [
          'uri',
          'kind',
          'nativeRunId',
          'targetHash',
          'renderedPublicly',
          'resolverInvoked',
          'resolved',
          'projectScopeMatches',
          'sessionScopeMatches',
        ],
        label,
      );
      const kind = enumValue(
        citation.kind,
        new Set(['receipt', 'source', 'evidence']),
        `${label}.kind`,
      ) as 'receipt' | 'source' | 'evidence';
      contextUri(citation.uri, kind, `${label}.uri`);
      safeString(citation.nativeRunId, `${label}.nativeRunId`, 256);
      sha256(citation.targetHash, `${label}.targetHash`);
      for (const field of [
        'renderedPublicly',
        'resolverInvoked',
        'resolved',
        'projectScopeMatches',
        'sessionScopeMatches',
      ]) {
        bool(citation[field], `${label}.${field}`);
      }
    }
    const safetyLabels = new Set<string>([
      'before',
      'after',
      ...REQUIRED_PHASE0_SCENARIOS.map((scenarioId) => `during:${scenarioId}`),
    ]);
    for (const [index, snapshotValue] of boundedArray(
      proof.safety,
      'acceptance.phase0Proof.safety',
      15,
    ).entries()) {
      const label = `acceptance.phase0Proof.safety[${index}]`;
      const snapshot = record(snapshotValue, label);
      exactKeys(
        snapshot,
        ['label', 'nativeRunId', 'capturedAt', 'ollamaProcessCount', 'listener11434Count'],
        label,
      );
      enumValue(snapshot.label, safetyLabels, `${label}.label`);
      safeString(snapshot.nativeRunId, `${label}.nativeRunId`, 256);
      canonicalIso(snapshot.capturedAt, `${label}.capturedAt`);
      safeInteger(snapshot.ollamaProcessCount, `${label}.ollamaProcessCount`);
      safeInteger(snapshot.listener11434Count, `${label}.listener11434Count`);
    }
  }

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
  if ('isolationProof' in input) {
    const proof = record(input.isolationProof, 'acceptance.isolationProof');
    exactKeys(
      proof,
      [
        'evidenceId',
        'recordedAt',
        'commitSha',
        'runtimeGeneration',
        'officialDesktop',
        'concurrent',
        'scopes',
        'crossScopeContextBlocked',
        'crossScopeEvidenceReuseBlocked',
        'latePostCancelEventBlocked',
      ],
      'acceptance.isolationProof',
    );
    for (const field of ['evidenceId', 'recordedAt', 'commitSha', 'runtimeGeneration']) {
      safeString(proof[field], `acceptance.isolationProof.${field}`, 256);
    }
    for (const field of [
      'officialDesktop',
      'concurrent',
      'crossScopeContextBlocked',
      'crossScopeEvidenceReuseBlocked',
      'latePostCancelEventBlocked',
    ]) {
      bool(proof[field], `acceptance.isolationProof.${field}`);
    }
    for (const [index, scopeValue] of boundedArray(
      proof.scopes,
      'acceptance.isolationProof.scopes',
      3,
    ).entries()) {
      const scope = record(scopeValue, `acceptance.isolationProof.scopes[${index}]`);
      exactKeys(scope, ['surfaceId', 'scopeHash'], `acceptance.isolationProof.scopes[${index}]`);
      safeString(scope.surfaceId, `acceptance.isolationProof.scopes[${index}].surfaceId`, 64);
      safeString(scope.scopeHash, `acceptance.isolationProof.scopes[${index}].scopeHash`, 80);
    }
  }
  if ('rollbackProof' in input) {
    const proof = record(input.rollbackProof, 'acceptance.rollbackProof');
    exactKeys(
      proof,
      [
        'commitSha',
        'runtimeGeneration',
        'oldRouteAvailable',
        'noShadowProviderDispatch',
        'userDataPreserved',
        'runtimePointerRestorable',
      ],
      'acceptance.rollbackProof',
    );
    safeString(proof.commitSha, 'acceptance.rollbackProof.commitSha', 64);
    safeString(proof.runtimeGeneration, 'acceptance.rollbackProof.runtimeGeneration', 256);
    for (const field of [
      'oldRouteAvailable',
      'noShadowProviderDispatch',
      'userDataPreserved',
      'runtimePointerRestorable',
    ]) {
      bool(proof[field], `acceptance.rollbackProof.${field}`);
    }
  }
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
