import {
  DIRECT_GATEWAY_MINIMUM_PAIRED_RUNS,
  DIRECT_GATEWAY_P95_ABSOLUTE_LIMIT_MS,
  DIRECT_GATEWAY_P99_ABSOLUTE_LIMIT_MS,
  DIRECT_GATEWAY_LIFECYCLE_TIMING_NAMES,
  DIRECT_GATEWAY_RELATIVE_OVERHEAD_LIMIT,
  DIRECT_GATEWAY_STAGE_NAMES,
  type DirectGatewayAcceptanceReport,
} from './contextGatewayAcceptanceMetrics';
import {
  CONTEXT_RETRIEVAL_MINIMUM_RUNS,
  CONTEXT_RETRIEVAL_STAGE_NAMES,
  DEEP_RETRIEVAL_HARD_DEADLINE_MS,
  DEEP_RETRIEVAL_P95_LIMIT_MS,
  FOCUSED_RETRIEVAL_P95_LIMIT_MS,
  type ContextRetrievalAcceptanceReport,
} from './contextGatewayRetrievalAcceptance';

export const REQUIRED_CONTEXT_GATEWAY_SURFACES = [
  'chat',
  'ade',
  'terminal:codex',
  'terminal:claude',
  'terminal:opencode',
] as const;

export type ContextGatewaySurfaceId = (typeof REQUIRED_CONTEXT_GATEWAY_SURFACES)[number];
const REQUIRED_ISOLATION_SURFACES = ['chat', 'terminal:codex', 'terminal:claude'] as const;

export const REQUIRED_PHASE0_SCENARIOS = [
  'automatic_rlm',
  'explicit_rlm_on',
  'empty_first_continuation',
  'permitted_exact_file',
  'denied_external_directory',
  'binary_metadata',
  'cancellation',
  'retry',
  'reconnect',
  'reload',
  'project_isolation',
  'exact_artifact_output',
  'canonical_link_resolution',
] as const;

export type Phase0ScenarioId = (typeof REQUIRED_PHASE0_SCENARIOS)[number];
export type Phase0RouteFixture = 'deepseek_v4_flash_vision_exp' | 'secondary_authenticated';

export interface Phase0ExecutionIdentity {
  providerId: string;
  connectionId: string;
  providerQualifiedModelId: string;
  upstreamProviderId: string;
  upstreamModelId: string;
  variant: string;
  effort: string;
  performance: string;
  fastMode: string;
  cwd: string;
  authBillingRoute: string;
  catalogRevision: string;
  sessionIdentityHash: string;
  identityPathId: string;
}

export interface Phase0RouteProof {
  fixture: Phase0RouteFixture;
  evidenceId: string;
  nativeRunId: string;
  requested: Phase0ExecutionIdentity;
  observed: Phase0ExecutionIdentity;
  liveCatalogAuthenticated: boolean;
  completedThroughOpenCode: boolean;
  contextReceiptVerified: boolean;
  silentFallbackUsed: boolean;
}

export interface Phase0ScenarioProof {
  scenarioId: Phase0ScenarioId;
  evidenceId: string;
  nativeRunId: string;
  requestFixtureHash: string;
  activation: 'automatic' | 'explicit_rlm_on' | 'fixture';
  routeFixture: Phase0RouteFixture;
  requestedIdentity: Phase0ExecutionIdentity;
  observedIdentity: Phase0ExecutionIdentity;
  gateway: {
    operation: 'investigate';
    invocationCount: number;
    initialMatchCount: number | null;
    continuationCount: number;
    receiptUri: string | null;
    sourceUris: string[];
    evidenceUris: string[];
  };
  outcome: {
    terminalStatus: 'done' | 'cancelled' | 'denied' | 'failed';
    groundedFinalAnswer: boolean;
    duplicateDispatchCount: number;
    duplicateToolEffectCount: number;
    localFallbackUsed: boolean;
  };
  exactFile?: {
    permitted: boolean;
    resultCode: 'ok' | 'external_directory';
    sourceIdentityVerified: boolean;
    requestedPathHash: string;
    observedPathHash: string;
    policyRootHash: string;
    policyBoundary: 'within_project' | 'external_directory';
  };
  binary?: {
    graphMetadataPresent: boolean;
    physicalTextExcluded: boolean;
    remainingCorpusCompleted: boolean;
  };
  lifecycle?: {
    attempted: boolean;
    recovered: boolean;
    routeIdentityStable: boolean;
    sessionIdentityStable: boolean;
    noLateEvents: boolean;
    attemptIds: string[];
    logicalDispatchCount: number;
    terminalAttemptId: string;
    toolEffectCount: number;
    lateEventCount: number;
  };
  isolation?: {
    sourceProjectHash: string;
    otherProjectHash: string;
    crossProjectReadBlocked: boolean;
    crossProjectEvidenceReuseBlocked: boolean;
  };
  reloadAfterPriorTerminal?: boolean;
}

export interface Phase0AcceptanceProof {
  evidenceId: string;
  nativeRunId: string;
  recordedAt: string;
  commitSha: string;
  runtimeGeneration: string;
  executableSha256: string;
  officialDesktop: boolean;
  hmrEventsDuringTurns: number;
  unexpectedReloadEventsDuringTurns: number;
  inFlightReloadCount: number;
  routes: Phase0RouteProof[];
  scenarios: Phase0ScenarioProof[];
  artifact: {
    evidenceId: string;
    nativeRunId: string;
    requiredRoot: string;
    observedRoot: string;
    exists: boolean;
    readbackVerified: boolean;
    manifest: Array<{ relativePath: string; byteCount: number; sha256: string }>;
  };
  citations: Array<{
    uri: string;
    kind: 'receipt' | 'source' | 'evidence';
    nativeRunId: string;
    targetHash: string;
    renderedPublicly: boolean;
    resolverInvoked: boolean;
    resolved: boolean;
    projectScopeMatches: boolean;
    sessionScopeMatches: boolean;
  }>;
  safety: Array<{
    label: 'before' | `during:${Phase0ScenarioId}` | 'after';
    nativeRunId: string;
    capturedAt: string;
    ollamaProcessCount: number;
    listener11434Count: number;
  }>;
}

export interface NativeSurfaceProof {
  surfaceId: string;
  evidenceId: string;
  recordedAt: string;
  commitSha: string;
  runtimeGeneration: string;
  officialDesktop: boolean;
  productionDispatcherBound: boolean;
  exactExecutionIdentityObserved: boolean;
  contextReceiptVerified: boolean;
  scopeIsolationVerified: boolean;
  cancellationVerified: boolean;
  streamingVerified: boolean;
  noDuplicateDispatchVerified: boolean;
}

export interface ContextGatewayAcceptanceInput {
  build: {
    commitSha: string;
    buildId: string;
    runtimeGeneration: string;
  };
  directReports: Array<{
    surfaceId: string;
    report: Readonly<DirectGatewayAcceptanceReport>;
  }>;
  focusedReport?: Readonly<ContextRetrievalAcceptanceReport>;
  deepReport?: Readonly<ContextRetrievalAcceptanceReport>;
  nativeProofs: NativeSurfaceProof[];
  featureParityPassed: boolean;
  concurrentScopeIsolationPassed: boolean;
  isolationProof?: {
    evidenceId: string;
    recordedAt: string;
    commitSha: string;
    runtimeGeneration: string;
    officialDesktop: boolean;
    concurrent: boolean;
    scopes: Array<{ surfaceId: string; scopeHash: string }>;
    crossScopeContextBlocked: boolean;
    crossScopeEvidenceReuseBlocked: boolean;
    latePostCancelEventBlocked: boolean;
  };
  rollbackProof?: {
    commitSha: string;
    runtimeGeneration: string;
    oldRouteAvailable: boolean;
    noShadowProviderDispatch: boolean;
    userDataPreserved: boolean;
    runtimePointerRestorable: boolean;
  };
  rollbackNotes: string;
  externalBlockers: Array<{ code: string; recovery: string }>;
  phase0Proof?: Phase0AcceptanceProof;
}

export type ContextGatewayAcceptanceStatus =
  'passed' | 'failed' | 'incomplete' | 'blocked-external';

export interface ContextGatewayAcceptanceEvaluation {
  status: ContextGatewayAcceptanceStatus;
  missing: readonly string[];
  failures: readonly string[];
  externalBlockers: readonly string[];
}

const nativeProofFields = [
  'officialDesktop',
  'productionDispatcherBound',
  'exactExecutionIdentityObserved',
  'contextReceiptVerified',
  'scopeIsolationVerified',
  'cancellationVerified',
  'streamingVerified',
  'noDuplicateDispatchVerified',
] as const satisfies readonly (keyof NativeSurfaceProof)[];

const rollbackProofFields = [
  'oldRouteAvailable',
  'noShadowProviderDispatch',
  'userDataPreserved',
  'runtimePointerRestorable',
] as const;

const PHASE0_IDENTITY_FIELDS = [
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
  'catalogRevision',
  'sessionIdentityHash',
  'identityPathId',
] as const satisfies readonly (keyof Phase0ExecutionIdentity)[];

function phase0IdentitiesEqual(
  left: Readonly<Phase0ExecutionIdentity>,
  right: Readonly<Phase0ExecutionIdentity>,
): boolean {
  return PHASE0_IDENTITY_FIELDS.every((field) => left[field] === right[field]);
}

function phase0CanonicalUri(value: string | null, kind: 'receipt' | 'source' | 'evidence') {
  return typeof value === 'string' && value.startsWith(`vibespace:context/${kind}/`);
}

function normalizedWindowsPath(value: string): string {
  return value
    .replace(/\//gu, '\\')
    .replace(/[\\]+$/gu, '')
    .toLowerCase();
}

function evaluatePhase0Proof(
  proof: Readonly<Phase0AcceptanceProof>,
  build: Readonly<ContextGatewayAcceptanceInput['build']>,
  missing: string[],
  failures: string[],
): void {
  if (!/^[0-9a-f]{40}$/iu.test(proof.commitSha)) throw new Error('phase0 commitSha');
  if (!proof.nativeRunId.trim()) throw new Error('phase0 nativeRunId');
  if (!/^sha256:[0-9a-f]{64}$/iu.test(proof.executableSha256))
    throw new Error('phase0 executableSha256');
  const recordedAt = Date.parse(proof.recordedAt);
  if (!Number.isFinite(recordedAt) || new Date(recordedAt).toISOString() !== proof.recordedAt) {
    throw new Error('phase0 recordedAt');
  }
  if (
    (/^[0-9a-f]{40}$/iu.test(build.commitSha) &&
      proof.commitSha.toLowerCase() !== build.commitSha.toLowerCase()) ||
    (build.runtimeGeneration.trim().length > 0 &&
      proof.runtimeGeneration !== build.runtimeGeneration)
  ) {
    failures.push('phase0:buildBinding');
  }
  if (!proof.officialDesktop) failures.push('phase0:officialDesktop');
  const evidenceIds = new Set<string>();
  const registerEvidenceId = (value: string) => {
    if (!value.trim() || evidenceIds.has(value)) throw new Error('duplicate phase0 evidenceId');
    evidenceIds.add(value);
  };
  registerEvidenceId(proof.evidenceId);
  for (const [field, label] of [
    ['hmrEventsDuringTurns', 'phase0:hmrDuringTurn'],
    ['unexpectedReloadEventsDuringTurns', 'phase0:unexpectedReloadDuringTurn'],
  ] as const) {
    const count = proof[field];
    if (!Number.isSafeInteger(count) || count < 0) throw new Error(`phase0 ${field}`);
    if (count > 0) failures.push(label);
  }
  if (!Number.isSafeInteger(proof.inFlightReloadCount) || proof.inFlightReloadCount < 0) {
    throw new Error('phase0 inFlightReloadCount');
  } else if (proof.inFlightReloadCount > 0) {
    failures.push('phase0:inFlightReload');
  }

  const routeByFixture = new Map<Phase0RouteFixture, Phase0RouteProof>();
  for (const route of proof.routes) {
    if (routeByFixture.has(route.fixture))
      throw new Error(`duplicate phase0 route: ${route.fixture}`);
    routeByFixture.set(route.fixture, route);
    registerEvidenceId(route.evidenceId);
    if (route.nativeRunId !== proof.nativeRunId)
      failures.push(`phase0:route:${route.fixture}:runBinding`);
    if (!phase0IdentitiesEqual(route.requested, route.observed)) {
      failures.push(`phase0:route:${route.fixture}:requestedObservedIdentity`);
    }
    if (!route.liveCatalogAuthenticated)
      failures.push(`phase0:route:${route.fixture}:authenticated`);
    if (!route.completedThroughOpenCode) failures.push(`phase0:route:${route.fixture}:completion`);
    if (!route.contextReceiptVerified) failures.push(`phase0:route:${route.fixture}:receipt`);
    if (route.silentFallbackUsed) failures.push(`phase0:route:${route.fixture}:silentFallback`);
    if (
      route.fixture === 'deepseek_v4_flash_vision_exp' &&
      (route.requested.providerId !== 'opencode' ||
        route.requested.connectionId !== 'opencode-cli' ||
        route.requested.providerQualifiedModelId !== 'opencode-go/deepseek-v4-flash-vision-exp' ||
        route.requested.upstreamProviderId !== 'opencode-go' ||
        route.requested.upstreamModelId !== 'deepseek-v4-flash-vision-exp')
    ) {
      failures.push('phase0:route:deepseek_v4_flash_vision_exp:fixtureIdentity');
    }
  }
  for (const fixture of ['deepseek_v4_flash_vision_exp', 'secondary_authenticated'] as const) {
    if (!routeByFixture.has(fixture)) missing.push(`phase0:route:${fixture}`);
  }
  const primary = routeByFixture.get('deepseek_v4_flash_vision_exp');
  const secondary = routeByFixture.get('secondary_authenticated');
  if (primary && secondary) {
    if (
      primary.requested.providerQualifiedModelId === secondary.requested.providerQualifiedModelId
    ) {
      failures.push('phase0:routes:notDistinct');
    }
    const materiallyDifferent =
      primary.requested.providerQualifiedModelId !== secondary.requested.providerQualifiedModelId &&
      primary.requested.upstreamProviderId !== secondary.requested.upstreamProviderId &&
      primary.requested.authBillingRoute !== secondary.requested.authBillingRoute;
    if (!materiallyDifferent) failures.push('phase0:routes:notMateriallyDifferent');
    if (primary.requested.identityPathId !== secondary.requested.identityPathId) {
      failures.push('phase0:routes:identityPathMismatch');
    }
  }

  const scenarios = new Map<Phase0ScenarioId, Phase0ScenarioProof>();
  for (const scenario of proof.scenarios) {
    if (scenarios.has(scenario.scenarioId))
      throw new Error(`duplicate phase0 scenario: ${scenario.scenarioId}`);
    scenarios.set(scenario.scenarioId, scenario);
    registerEvidenceId(scenario.evidenceId);
    const label = `phase0:scenario:${scenario.scenarioId}`;
    if (scenario.nativeRunId !== proof.nativeRunId) failures.push(`${label}:runBinding`);
    if (!phase0IdentitiesEqual(scenario.requestedIdentity, scenario.observedIdentity)) {
      failures.push(`${label}:identity`);
    }
    const declaredRoute = routeByFixture.get(scenario.routeFixture);
    if (
      declaredRoute &&
      (!phase0IdentitiesEqual(scenario.requestedIdentity, declaredRoute.requested) ||
        !phase0IdentitiesEqual(scenario.observedIdentity, declaredRoute.observed))
    ) {
      failures.push(`${label}:routeBinding`);
    }
    if (scenario.gateway.operation !== 'investigate' || scenario.gateway.invocationCount !== 1) {
      failures.push(`${label}:gateway`);
    }
    if (scenario.outcome.duplicateDispatchCount !== 0) failures.push(`${label}:duplicateDispatch`);
    if (scenario.outcome.duplicateToolEffectCount !== 0)
      failures.push(`${label}:duplicateToolEffect`);
    if (scenario.outcome.localFallbackUsed) failures.push(`${label}:localFallback`);
    const expectedTerminalStatus =
      scenario.scenarioId === 'cancellation'
        ? 'cancelled'
        : scenario.scenarioId === 'denied_external_directory'
          ? 'denied'
          : 'done';
    if (scenario.outcome.terminalStatus !== expectedTerminalStatus) {
      failures.push(`${label}:terminalStatus`);
    }
    const groundingRequired =
      scenario.scenarioId !== 'cancellation' && scenario.scenarioId !== 'denied_external_directory';
    if (scenario.outcome.groundedFinalAnswer !== groundingRequired) {
      failures.push(`${label}:grounding`);
    }
  }
  for (const scenarioId of REQUIRED_PHASE0_SCENARIOS) {
    if (!scenarios.has(scenarioId)) missing.push(`phase0:scenario:${scenarioId}`);
  }

  const automatic = scenarios.get('automatic_rlm');
  if (automatic && automatic.activation !== 'automatic') {
    failures.push('phase0:scenario:automatic_rlm:activation');
  }
  const explicit = scenarios.get('explicit_rlm_on');
  if (explicit && explicit.activation !== 'explicit_rlm_on') {
    failures.push('phase0:scenario:explicit_rlm_on:activation');
  }
  if (
    automatic &&
    explicit &&
    automatic.requestedIdentity.identityPathId !== explicit.requestedIdentity.identityPathId
  ) {
    failures.push('phase0:scenario:activation:gatewayMismatch');
  }
  if (automatic && explicit && automatic.routeFixture !== explicit.routeFixture) {
    failures.push('phase0:scenario:activation:routeMismatch');
  }
  if (automatic && explicit && automatic.requestFixtureHash !== explicit.requestFixtureHash) {
    failures.push('phase0:scenario:activation:requestFixtureMismatch');
  }
  if (automatic && explicit && automatic.gateway.receiptUri === explicit.gateway.receiptUri) {
    failures.push('phase0:scenario:activation:receiptNotDistinct');
  }

  const emptyFirst = scenarios.get('empty_first_continuation');
  if (emptyFirst) {
    if (emptyFirst.gateway.initialMatchCount !== 0)
      failures.push('phase0:scenario:empty_first_continuation:firstSearchNotEmpty');
    if (emptyFirst.gateway.continuationCount < 1)
      failures.push('phase0:scenario:empty_first_continuation:noContinuation');
    if (
      emptyFirst.outcome.terminalStatus !== 'done' ||
      !emptyFirst.outcome.groundedFinalAnswer ||
      !phase0CanonicalUri(emptyFirst.gateway.receiptUri, 'receipt')
    ) {
      failures.push('phase0:scenario:empty_first_continuation:notGrounded');
    }
  }

  const permittedExactFile = scenarios.get('permitted_exact_file')?.exactFile;
  const deniedExternalDirectory = scenarios.get('denied_external_directory')?.exactFile;
  if (scenarios.has('permitted_exact_file')) {
    const permitted = permittedExactFile;
    if (!permitted || !permitted.permitted || permitted.resultCode !== 'ok') {
      failures.push('phase0:scenario:permitted_exact_file:notPermitted');
    } else if (!permitted.sourceIdentityVerified) {
      failures.push('phase0:scenario:permitted_exact_file:sourceIdentity');
    }
    if (permitted) {
      for (const value of [
        permitted.requestedPathHash,
        permitted.observedPathHash,
        permitted.policyRootHash,
      ]) {
        if (!/^sha256:[0-9a-f]{64}$/iu.test(value)) throw new Error('phase0 exact file hash');
      }
      if (permitted.requestedPathHash !== permitted.observedPathHash)
        failures.push('phase0:scenario:permitted_exact_file:pathBinding');
      if (permitted.policyBoundary !== 'within_project')
        failures.push('phase0:scenario:permitted_exact_file:policyBoundary');
    }
  }
  if (scenarios.has('denied_external_directory')) {
    const denied = deniedExternalDirectory;
    if (!denied || denied.permitted || denied.resultCode !== 'external_directory') {
      failures.push('phase0:scenario:denied_external_directory:notDenied');
    } else if (!denied.sourceIdentityVerified) {
      failures.push('phase0:scenario:denied_external_directory:sourceIdentity');
    }
    if (denied) {
      for (const value of [
        denied.requestedPathHash,
        denied.observedPathHash,
        denied.policyRootHash,
      ]) {
        if (!/^sha256:[0-9a-f]{64}$/iu.test(value)) throw new Error('phase0 exact file hash');
      }
      if (denied.requestedPathHash !== denied.observedPathHash)
        failures.push('phase0:scenario:denied_external_directory:pathBinding');
      if (denied.policyBoundary !== 'external_directory')
        failures.push('phase0:scenario:denied_external_directory:policyBoundary');
    }
  }
  if (permittedExactFile && deniedExternalDirectory) {
    if (permittedExactFile.policyRootHash !== deniedExternalDirectory.policyRootHash) {
      failures.push('phase0:scenario:exact_file:policyRootMismatch');
    }
    if (permittedExactFile.requestedPathHash === deniedExternalDirectory.requestedPathHash) {
      failures.push('phase0:scenario:exact_file:pathNotDistinct');
    }
  }
  if (scenarios.has('binary_metadata')) {
    const binary = scenarios.get('binary_metadata')?.binary;
    if (!binary?.graphMetadataPresent)
      failures.push('phase0:scenario:binary_metadata:graphMetadata');
    if (!binary?.physicalTextExcluded)
      failures.push('phase0:scenario:binary_metadata:physicalTextIncluded');
    if (!binary?.remainingCorpusCompleted)
      failures.push('phase0:scenario:binary_metadata:corpusAborted');
  }

  for (const scenarioId of ['cancellation', 'retry', 'reconnect', 'reload'] as const) {
    const scenario = scenarios.get(scenarioId);
    if (!scenario) continue;
    const lifecycle = scenario.lifecycle;
    const lifecycleOk =
      lifecycle?.attempted === true &&
      (scenarioId === 'cancellation' || lifecycle.recovered === true);
    if (!lifecycleOk) failures.push(`phase0:scenario:${scenarioId}:lifecycle`);
    if (lifecycle && (!lifecycle.routeIdentityStable || !lifecycle.sessionIdentityStable)) {
      failures.push(`phase0:scenario:${scenarioId}:identityDrift`);
    }
    if (scenarioId === 'cancellation' && lifecycle?.noLateEvents !== true) {
      failures.push('phase0:scenario:cancellation:lateEvents');
    }
    if (lifecycle) {
      const uniqueAttempts = new Set(lifecycle.attemptIds);
      if (
        lifecycle.attemptIds.length === 0 ||
        uniqueAttempts.size !== lifecycle.attemptIds.length ||
        !uniqueAttempts.has(lifecycle.terminalAttemptId) ||
        !Number.isSafeInteger(lifecycle.toolEffectCount) ||
        lifecycle.toolEffectCount < 0 ||
        !Number.isSafeInteger(lifecycle.lateEventCount) ||
        lifecycle.lateEventCount < 0
      ) {
        throw new Error(`invalid phase0 lifecycle evidence: ${scenarioId}`);
      }
      if (scenarioId === 'retry' && lifecycle.attemptIds.length < 2) {
        failures.push('phase0:scenario:retry:notRetried');
      }
      if (lifecycle.logicalDispatchCount !== 1) {
        failures.push(`phase0:scenario:${scenarioId}:duplicateLogicalDispatch`);
      }
      const expectedToolEffects = scenarioId === 'cancellation' ? 0 : 1;
      if (lifecycle.toolEffectCount !== expectedToolEffects) {
        failures.push(`phase0:scenario:${scenarioId}:toolEffectCount`);
      }
      if (scenarioId === 'cancellation' && lifecycle.lateEventCount !== 0) {
        failures.push('phase0:scenario:cancellation:lateEvents');
      }
    }
  }
  if (scenarios.has('reload') && scenarios.get('reload')?.reloadAfterPriorTerminal !== true) {
    failures.push('phase0:scenario:reload:priorTurnNotTerminal');
  }
  if (scenarios.has('project_isolation')) {
    const isolation = scenarios.get('project_isolation')?.isolation;
    if (
      !isolation ||
      isolation.sourceProjectHash === isolation.otherProjectHash ||
      !isolation.crossProjectReadBlocked
    ) {
      failures.push('phase0:scenario:project_isolation:crossProjectRead');
    }
    if (!isolation?.crossProjectEvidenceReuseBlocked) {
      failures.push('phase0:scenario:project_isolation:crossProjectEvidence');
    }
  }

  const approvedRoot = 'D:\\VibeSpace-RLM-UAT\\opencode-live-latency-20260829';
  registerEvidenceId(proof.artifact.evidenceId);
  if (proof.artifact.nativeRunId !== proof.nativeRunId) failures.push('phase0:artifact:runBinding');
  if (
    normalizedWindowsPath(proof.artifact.requiredRoot) !== normalizedWindowsPath(approvedRoot) ||
    normalizedWindowsPath(proof.artifact.observedRoot) !== normalizedWindowsPath(approvedRoot)
  ) {
    failures.push('phase0:artifact:rootMismatch');
  }
  if (!proof.artifact.exists) failures.push('phase0:artifact:notCreated');
  if (!proof.artifact.readbackVerified) failures.push('phase0:artifact:readback');
  if (proof.artifact.manifest.length === 0) failures.push('phase0:artifact:emptyManifest');
  const artifactPaths = new Set<string>();
  for (const entry of proof.artifact.manifest) {
    const normalizedRelativePath = entry.relativePath.replace(/\\/gu, '/').toLowerCase();
    if (artifactPaths.has(normalizedRelativePath))
      throw new Error('duplicate phase0 artifact path');
    artifactPaths.add(normalizedRelativePath);
    if (
      !entry.relativePath ||
      /(^[a-z]:|^[/\\]|(^|[/\\])\.\.([/\\]|$))/iu.test(entry.relativePath) ||
      !Number.isSafeInteger(entry.byteCount) ||
      entry.byteCount < 0 ||
      !/^sha256:[0-9a-f]{64}$/iu.test(entry.sha256)
    ) {
      throw new Error('phase0 artifact manifest');
    }
  }

  const citationKinds = new Map(proof.citations.map((citation) => [citation.kind, citation]));
  for (const kind of ['receipt', 'source', 'evidence'] as const) {
    const citation = citationKinds.get(kind);
    if (!citation) {
      missing.push(`phase0:citation:${kind}`);
      continue;
    }
    if (citation.nativeRunId !== proof.nativeRunId)
      failures.push(`phase0:citation:${kind}:runBinding`);
    if (!/^sha256:[0-9a-f]{64}$/iu.test(citation.targetHash))
      throw new Error(`phase0 citation ${kind} targetHash`);
    if (!phase0CanonicalUri(citation.uri, kind)) throw new Error(`phase0 citation ${kind}`);
    if (!citation.renderedPublicly) failures.push(`phase0:citation:${kind}:notRendered`);
    if (!citation.resolverInvoked || !citation.resolved)
      failures.push(`phase0:citation:${kind}:unresolved`);
    if (!citation.projectScopeMatches || !citation.sessionScopeMatches)
      failures.push(`phase0:citation:${kind}:scopeMismatch`);
  }
  const canonicalScenario = scenarios.get('canonical_link_resolution');
  if (canonicalScenario) {
    const expectedUris = new Set([
      canonicalScenario.gateway.receiptUri,
      ...canonicalScenario.gateway.sourceUris,
      ...canonicalScenario.gateway.evidenceUris,
    ]);
    const citationUris = new Set(proof.citations.map((citation) => citation.uri));
    if (
      citationUris.size !== proof.citations.length ||
      citationUris.size !== expectedUris.size ||
      [...citationUris].some((uri) => !expectedUris.has(uri)) ||
      [...expectedUris].some((uri) => uri === null || !citationUris.has(uri))
    ) {
      failures.push('phase0:scenario:canonical_link_resolution:citationMismatch');
    }
  }

  const safetyByLabel = new Map<string, Phase0AcceptanceProof['safety'][number]>();
  for (const snapshot of proof.safety) {
    if (safetyByLabel.has(snapshot.label))
      throw new Error(`duplicate phase0 safety: ${snapshot.label}`);
    safetyByLabel.set(snapshot.label, snapshot);
  }
  const safetyLabels = [
    'before',
    ...REQUIRED_PHASE0_SCENARIOS.map((scenarioId) => `during:${scenarioId}`),
    'after',
  ];
  for (const label of safetyLabels) {
    const snapshot = safetyByLabel.get(label);
    if (!snapshot) {
      missing.push(`phase0:safety:${label}`);
      continue;
    }
    if (snapshot.nativeRunId !== proof.nativeRunId)
      failures.push(`phase0:safety:${label}:runBinding`);
    if (
      !Number.isSafeInteger(snapshot.ollamaProcessCount) ||
      !Number.isSafeInteger(snapshot.listener11434Count) ||
      snapshot.ollamaProcessCount < 0 ||
      snapshot.listener11434Count < 0
    ) {
      throw new Error(`phase0 safety ${label}`);
    }
    if (snapshot.ollamaProcessCount !== 0 || snapshot.listener11434Count !== 0) {
      failures.push(`phase0:safety:${label}:ollama`);
    }
  }
}

function requireKnownUniqueRows<T extends { surfaceId: string }>(
  rows: readonly T[],
  label: string,
): Map<ContextGatewaySurfaceId, T> {
  const known = new Set<string>(REQUIRED_CONTEXT_GATEWAY_SURFACES);
  const result = new Map<ContextGatewaySurfaceId, T>();
  for (const row of rows) {
    if (!known.has(row.surfaceId)) throw new Error(`unknown ${label} surface: ${row.surfaceId}`);
    const surfaceId = row.surfaceId as ContextGatewaySurfaceId;
    if (result.has(surfaceId)) throw new Error(`duplicate ${label} surface: ${surfaceId}`);
    result.set(surfaceId, row);
  }
  return result;
}

function validDistribution(
  distribution: Readonly<{ p50: number; p95: number; p99: number; max?: number }>,
): boolean {
  const max = distribution.max ?? distribution.p99;
  return (
    [distribution.p50, distribution.p95, distribution.p99, max].every(
      (value) => Number.isFinite(value) && value >= 0,
    ) &&
    distribution.p50 <= distribution.p95 &&
    distribution.p95 <= distribution.p99 &&
    distribution.p99 <= max
  );
}

function directReportPasses(report: Readonly<DirectGatewayAcceptanceReport>): boolean {
  const resourcesPass = (side: 'baseline' | 'gateway'): boolean => {
    const metrics = report.resources[side];
    return (
      validDistribution(metrics.cpuPercent) &&
      validDistribution(metrics.workingSetMiB) &&
      metrics.workingSetMiB.p50 > 0 &&
      validDistribution(metrics.processCount) &&
      [metrics.processCount.p50, metrics.processCount.p95, metrics.processCount.p99].every(
        (value) => Number.isSafeInteger(value) && value > 0,
      )
    );
  };
  const lifecyclePass = (side: 'baseline' | 'gateway'): boolean => {
    const lifecycle = report.lifecycle[side];
    if (
      !DIRECT_GATEWAY_LIFECYCLE_TIMING_NAMES.every((field) => validDistribution(lifecycle[field]))
    ) {
      return false;
    }
    return (['p50', 'p95', 'p99'] as const).every((percentile) => {
      let previous = 0;
      for (const field of DIRECT_GATEWAY_LIFECYCLE_TIMING_NAMES) {
        const timing = lifecycle[field][percentile];
        if (timing < previous) return false;
        previous = timing;
      }
      return true;
    });
  };
  return (
    report.passed &&
    report.failures.length === 0 &&
    report.sampleCount >= DIRECT_GATEWAY_MINIMUM_PAIRED_RUNS &&
    validDistribution(report.baselineMs) &&
    report.baselineMs.p50 > 0 &&
    validDistribution(report.overheadMs) &&
    validDistribution(report.overheadRatio) &&
    DIRECT_GATEWAY_STAGE_NAMES.every((stage) =>
      validDistribution(report.gatewayStageTimingsMs[stage]),
    ) &&
    resourcesPass('baseline') &&
    resourcesPass('gateway') &&
    lifecyclePass('baseline') &&
    lifecyclePass('gateway') &&
    report.overheadRatio.p95 <= DIRECT_GATEWAY_RELATIVE_OVERHEAD_LIMIT &&
    report.overheadRatio.p99 <= DIRECT_GATEWAY_RELATIVE_OVERHEAD_LIMIT &&
    report.overheadMs.p95 <= DIRECT_GATEWAY_P95_ABSOLUTE_LIMIT_MS &&
    report.overheadMs.p99 <= DIRECT_GATEWAY_P99_ABSOLUTE_LIMIT_MS
  );
}

function retrievalReportPasses(
  report: Readonly<ContextRetrievalAcceptanceReport>,
  route: 'focused' | 'deep',
): boolean {
  if (
    report.route !== route ||
    !report.passed ||
    report.failures.length > 0 ||
    report.sampleCount < CONTEXT_RETRIEVAL_MINIMUM_RUNS ||
    !validDistribution(report.retrievalMs) ||
    !validDistribution(report.candidateCount) ||
    !validDistribution(report.hydratedCount) ||
    !CONTEXT_RETRIEVAL_STAGE_NAMES.every((stage) =>
      validDistribution(report.stageTimingsMs[stage]),
    ) ||
    !validDistribution(report.rlmSubqueryCount) ||
    ![
      report.rlmSubqueryCount.p50,
      report.rlmSubqueryCount.p95,
      report.rlmSubqueryCount.p99,
      report.rlmSubqueryCount.max,
    ].every((value) => Number.isSafeInteger(value) && value >= 0) ||
    (route === 'deep' && report.rlmSubqueryCount.p50 < 1) ||
    report.quality.topResultAccuracy !== 1 ||
    report.quality.citationVerificationRate !== 1 ||
    report.quality.answerRubricPassRate !== 1
  ) {
    return false;
  }
  return route === 'focused'
    ? report.retrievalMs.p95 <= FOCUSED_RETRIEVAL_P95_LIMIT_MS
    : report.retrievalMs.p95 <= DEEP_RETRIEVAL_P95_LIMIT_MS &&
        report.retrievalMs.max <= DEEP_RETRIEVAL_HARD_DEADLINE_MS;
}

export function evaluateContextGatewayAcceptance(
  input: Readonly<ContextGatewayAcceptanceInput>,
): Readonly<ContextGatewayAcceptanceEvaluation> {
  const missing: string[] = [];
  const failures: string[] = [];

  const validBuildCommit = /^[0-9a-f]{40}$/i.test(input.build.commitSha);
  const validRuntimeGeneration = input.build.runtimeGeneration.trim().length > 0;
  if (!validBuildCommit) missing.push('build:commitSha');
  if (input.build.buildId.trim().length === 0) missing.push('build:buildId');
  if (!validRuntimeGeneration) missing.push('build:runtimeGeneration');

  if (!input.phase0Proof) missing.push('phase0Proof');
  else evaluatePhase0Proof(input.phase0Proof, input.build, missing, failures);

  const direct = requireKnownUniqueRows(input.directReports, 'direct');
  const native = requireKnownUniqueRows(input.nativeProofs, 'native');
  const nativeEvidenceIds = new Set<string>();
  for (const proof of input.nativeProofs) {
    if (proof.evidenceId.trim().length === 0)
      throw new Error('native evidenceId must be non-empty');
    if (nativeEvidenceIds.has(proof.evidenceId)) {
      throw new Error(`duplicate native evidenceId: ${proof.evidenceId}`);
    }
    nativeEvidenceIds.add(proof.evidenceId);
    const recordedAt = Date.parse(proof.recordedAt);
    if (!Number.isFinite(recordedAt) || new Date(recordedAt).toISOString() !== proof.recordedAt) {
      throw new Error(`native recordedAt must be a canonical ISO timestamp: ${proof.surfaceId}`);
    }
    if (!/^[0-9a-f]{40}$/i.test(proof.commitSha)) {
      throw new Error(`native commitSha must be a full Git SHA: ${proof.surfaceId}`);
    }
    if (proof.runtimeGeneration.trim().length === 0) {
      throw new Error(`native runtimeGeneration must be non-empty: ${proof.surfaceId}`);
    }
  }
  for (const surfaceId of REQUIRED_CONTEXT_GATEWAY_SURFACES) {
    const directRow = direct.get(surfaceId);
    if (!directRow) missing.push(`direct:${surfaceId}`);
    else if (!directReportPasses(directRow.report)) failures.push(`direct:${surfaceId}`);
  }

  if (!input.focusedReport) missing.push('retrieval:focused');
  else if (input.focusedReport.route !== 'focused') {
    throw new Error('focusedReport must contain the focused route');
  } else if (!retrievalReportPasses(input.focusedReport, 'focused')) {
    failures.push('retrieval:focused');
  }

  if (!input.deepReport) missing.push('retrieval:deep');
  else if (input.deepReport.route !== 'deep') {
    throw new Error('deepReport must contain the deep route');
  } else if (!retrievalReportPasses(input.deepReport, 'deep')) {
    failures.push('retrieval:deep');
  }

  for (const surfaceId of REQUIRED_CONTEXT_GATEWAY_SURFACES) {
    const proof = native.get(surfaceId);
    if (!proof) {
      missing.push(`native:${surfaceId}`);
      continue;
    }
    if (
      (validBuildCommit && proof.commitSha.toLowerCase() !== input.build.commitSha.toLowerCase()) ||
      (validRuntimeGeneration && proof.runtimeGeneration !== input.build.runtimeGeneration)
    ) {
      failures.push(`native:${surfaceId}:buildBinding`);
    }
    for (const field of nativeProofFields) {
      if (!proof[field]) failures.push(`native:${surfaceId}:${field}`);
    }
  }

  if (!input.featureParityPassed) failures.push('featureParity');
  if (!input.concurrentScopeIsolationPassed) failures.push('concurrentScopeIsolation');
  if (!input.isolationProof) {
    missing.push('isolationProof');
  } else {
    const proof = input.isolationProof;
    if (proof.evidenceId.trim().length === 0)
      throw new Error('isolation evidenceId must be non-empty');
    const recordedAt = Date.parse(proof.recordedAt);
    if (!Number.isFinite(recordedAt) || new Date(recordedAt).toISOString() !== proof.recordedAt) {
      throw new Error('isolation recordedAt must be a canonical ISO timestamp');
    }
    if (!/^[0-9a-f]{40}$/i.test(proof.commitSha)) {
      throw new Error('isolation commitSha must be a full Git SHA');
    }
    if (proof.runtimeGeneration.trim().length === 0) {
      throw new Error('isolation runtimeGeneration must be non-empty');
    }
    if (
      (validBuildCommit && proof.commitSha.toLowerCase() !== input.build.commitSha.toLowerCase()) ||
      (validRuntimeGeneration && proof.runtimeGeneration !== input.build.runtimeGeneration)
    ) {
      failures.push('isolation:buildBinding');
    }
    const scopeBySurface = new Map(proof.scopes.map((scope) => [scope.surfaceId, scope.scopeHash]));
    if (
      scopeBySurface.size !== REQUIRED_ISOLATION_SURFACES.length ||
      proof.scopes.length !== REQUIRED_ISOLATION_SURFACES.length ||
      REQUIRED_ISOLATION_SURFACES.some((surfaceId) => !scopeBySurface.has(surfaceId))
    ) {
      throw new Error('isolation scopes must contain exactly Chat, Codex, and Claude');
    }
    const scopeHashes = [...scopeBySurface.values()];
    if (
      scopeHashes.some((hash) => !/^sha256:[0-9a-f]{64}$/i.test(hash)) ||
      new Set(scopeHashes.map((hash) => hash.toLowerCase())).size !== scopeHashes.length
    ) {
      throw new Error('isolation scopeHash values must be distinct SHA-256 metadata');
    }
    for (const field of [
      'officialDesktop',
      'concurrent',
      'crossScopeContextBlocked',
      'crossScopeEvidenceReuseBlocked',
      'latePostCancelEventBlocked',
    ] as const) {
      if (!proof[field]) failures.push(`isolation:${field}`);
    }
  }
  if (!input.rollbackProof) {
    missing.push('rollbackProof');
  } else {
    if (!/^[0-9a-f]{40}$/i.test(input.rollbackProof.commitSha)) {
      throw new Error('rollback commitSha must be a full Git SHA');
    }
    if (input.rollbackProof.runtimeGeneration.trim().length === 0) {
      throw new Error('rollback runtimeGeneration must be non-empty');
    }
    if (
      (validBuildCommit &&
        input.rollbackProof.commitSha.toLowerCase() !== input.build.commitSha.toLowerCase()) ||
      (validRuntimeGeneration &&
        input.rollbackProof.runtimeGeneration !== input.build.runtimeGeneration)
    ) {
      failures.push('rollback:buildBinding');
    }
    for (const field of rollbackProofFields) {
      if (!input.rollbackProof[field]) failures.push(`rollback:${field}`);
    }
  }
  if (input.rollbackNotes.trim().length === 0) missing.push('rollbackNotes');

  const blockerCodes = new Set<string>();
  for (const blocker of input.externalBlockers) {
    if (blocker.code.trim().length === 0) throw new Error('blocker code must be non-empty');
    if (blocker.recovery.trim().length === 0) throw new Error('blocker recovery must be non-empty');
    if (blockerCodes.has(blocker.code)) throw new Error(`duplicate blocker code: ${blocker.code}`);
    blockerCodes.add(blocker.code);
  }
  const externalBlockers = [...blockerCodes];

  const status: ContextGatewayAcceptanceStatus =
    failures.length > 0
      ? 'failed'
      : missing.length > 0
        ? 'incomplete'
        : externalBlockers.length > 0
          ? 'blocked-external'
          : 'passed';

  return { status, missing, failures, externalBlockers };
}
