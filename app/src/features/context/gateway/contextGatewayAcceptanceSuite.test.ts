import { describe, expect, it } from 'vitest';

import type { DirectGatewayAcceptanceReport } from './contextGatewayAcceptanceMetrics';
import {
  evaluateContextGatewayAcceptance,
  REQUIRED_CONTEXT_GATEWAY_SURFACES,
  type ContextGatewayAcceptanceInput,
  type NativeSurfaceProof,
  type Phase0AcceptanceProof,
} from './contextGatewayAcceptanceSuite';
import type { ContextRetrievalAcceptanceReport } from './contextGatewayRetrievalAcceptance';

const directReport: DirectGatewayAcceptanceReport = {
  sampleCount: 30,
  passed: true,
  failures: [],
  baselineMs: { p50: 1_000, p95: 1_100, p99: 1_200 },
  overheadMs: { p50: 100, p95: 120, p99: 130 },
  overheadRatio: { p50: 0.1, p95: 0.11, p99: 0.12 },
  gatewayStageTimingsMs: {
    contextPack: { p50: 20, p95: 20, p99: 20 },
    routeDecision: { p50: 20, p95: 20, p99: 20 },
    queueWait: { p50: 0, p95: 0, p99: 0 },
    dispatch: { p50: 60, p95: 80, p99: 90 },
    adeAdapter: { p50: 0, p95: 0, p99: 0 },
  },
  resources: {
    baseline: {
      cpuPercent: { p50: 10, p95: 12, p99: 14 },
      workingSetMiB: { p50: 480, p95: 490, p99: 500 },
      processCount: { p50: 6, p95: 6, p99: 6 },
    },
    gateway: {
      cpuPercent: { p50: 12, p95: 14, p99: 16 },
      workingSetMiB: { p50: 500, p95: 510, p99: 520 },
      processCount: { p50: 7, p95: 7, p99: 7 },
    },
  },
  lifecycle: {
    baseline: {
      providerAccepted: { p50: 100, p95: 110, p99: 120 },
      firstOutput: { p50: 300, p95: 320, p99: 340 },
      firstVisiblePaint: { p50: 320, p95: 340, p99: 360 },
      completion: { p50: 900, p95: 950, p99: 1_000 },
    },
    gateway: {
      providerAccepted: { p50: 120, p95: 130, p99: 140 },
      firstOutput: { p50: 320, p95: 340, p99: 360 },
      firstVisiblePaint: { p50: 340, p95: 360, p99: 380 },
      completion: { p50: 930, p95: 980, p99: 1_030 },
    },
  },
  relativeBudgetsMs: { p95: 220, p99: 240 },
  effectiveBudgetsMs: { p95: 150, p99: 240 },
};

const focusedReport: ContextRetrievalAcceptanceReport = {
  route: 'focused',
  sampleCount: 30,
  passed: true,
  failures: [],
  retrievalMs: { p50: 1_000, p95: 2_000, p99: 2_200, max: 2_300 },
  candidateCount: { p50: 8, p95: 8, p99: 8, max: 8 },
  hydratedCount: { p50: 5, p95: 5, p99: 5, max: 5 },
  stageTimingsMs: {
    siyuanReady: { p50: 100, p95: 100, p99: 100, max: 100 },
    queueWait: { p50: 0, p95: 0, p99: 0, max: 0 },
    search: { p50: 600, p95: 1_600, p99: 1_800, max: 1_900 },
    evidenceHydration: { p50: 200, p95: 200, p99: 200, max: 200 },
    validationHash: { p50: 100, p95: 100, p99: 100, max: 100 },
  },
  rlmSubqueryCount: { p50: 0, p95: 0, p99: 0, max: 0 },
  quality: {
    topResultAccuracy: 1,
    citationVerificationRate: 1,
    answerRubricPassRate: 1,
  },
};

const deepReport: ContextRetrievalAcceptanceReport = {
  ...focusedReport,
  route: 'deep',
  retrievalMs: { p50: 2_000, p95: 5_000, p99: 6_000, max: 7_000 },
  stageTimingsMs: {
    ...focusedReport.stageTimingsMs,
    search: { p50: 1_600, p95: 4_600, p99: 5_600, max: 6_600 },
  },
  rlmSubqueryCount: { p50: 3, p95: 3, p99: 3, max: 3 },
};

function nativeProof(surfaceId: string): NativeSurfaceProof {
  return {
    surfaceId,
    evidenceId: `native-proof:${surfaceId}`,
    recordedAt: '2026-08-22T12:00:00.000Z',
    commitSha: '0123456789abcdef0123456789abcdef01234567',
    runtimeGeneration: 'generation-42',
    officialDesktop: true,
    productionDispatcherBound: true,
    exactExecutionIdentityObserved: true,
    contextReceiptVerified: true,
    scopeIsolationVerified: true,
    cancellationVerified: true,
    streamingVerified: true,
    noDuplicateDispatchVerified: true,
  };
}

function completeInput(): ContextGatewayAcceptanceInput {
  return {
    build: {
      commitSha: '0123456789abcdef0123456789abcdef01234567',
      buildId: 'vibespace-native-20260822',
      runtimeGeneration: 'generation-42',
    },
    directReports: REQUIRED_CONTEXT_GATEWAY_SURFACES.map((surfaceId) => ({
      surfaceId,
      report: directReport,
    })),
    focusedReport,
    deepReport,
    nativeProofs: REQUIRED_CONTEXT_GATEWAY_SURFACES.map(nativeProof),
    featureParityPassed: true,
    concurrentScopeIsolationPassed: true,
    isolationProof: {
      evidenceId: 'isolation-proof-1',
      recordedAt: '2026-08-22T12:00:00.000Z',
      commitSha: '0123456789abcdef0123456789abcdef01234567',
      runtimeGeneration: 'generation-42',
      officialDesktop: true,
      concurrent: true,
      scopes: [
        { surfaceId: 'chat', scopeHash: `sha256:${'1'.repeat(64)}` },
        { surfaceId: 'terminal:codex', scopeHash: `sha256:${'2'.repeat(64)}` },
        { surfaceId: 'terminal:claude', scopeHash: `sha256:${'3'.repeat(64)}` },
      ],
      crossScopeContextBlocked: true,
      crossScopeEvidenceReuseBlocked: true,
      latePostCancelEventBlocked: true,
    },
    rollbackProof: {
      commitSha: '0123456789abcdef0123456789abcdef01234567',
      runtimeGeneration: 'generation-42',
      oldRouteAvailable: true,
      noShadowProviderDispatch: true,
      userDataPreserved: true,
      runtimePointerRestorable: true,
    },
    rollbackNotes: 'Disable the unified route and retain journals and saved data.',
    externalBlockers: [],
    phase0Proof: completePhase0Proof(),
  };
}

const PHASE0_SCENARIOS = [
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

function phase0Identity(modelId: string) {
  const upstreamProviderId = modelId.startsWith('openai/') ? 'openai' : 'opencode-go';
  return {
    providerId: 'opencode',
    connectionId: 'opencode-cli',
    providerQualifiedModelId: modelId,
    upstreamProviderId,
    upstreamModelId: modelId.split('/').at(-1)!,
    variant: 'high',
    effort: 'high',
    performance: 'quality',
    fastMode: 'off',
    cwd: 'C:\\repo',
    authBillingRoute: upstreamProviderId,
    catalogRevision: `sha256:${'a'.repeat(64)}`,
    sessionIdentityHash: `sha256:${'b'.repeat(64)}`,
    identityPathId: 'opencode-live-catalog-to-native-receipt-v1',
  };
}

function completePhase0Proof(): Phase0AcceptanceProof {
  const primary = phase0Identity('opencode-go/deepseek-v4-flash-vision-exp');
  const secondary = phase0Identity('openai/gpt-5.4');
  const identityByFixture = {
    deepseek_v4_flash_vision_exp: primary,
    secondary_authenticated: secondary,
  } as const;
  return {
    evidenceId: 'phase0-proof-1',
    nativeRunId: 'native-run-1',
    recordedAt: '2026-08-30T08:00:00.000Z',
    commitSha: '0123456789abcdef0123456789abcdef01234567',
    runtimeGeneration: 'generation-42',
    executableSha256: `sha256:${'d'.repeat(64)}`,
    officialDesktop: true,
    hmrEventsDuringTurns: 0,
    unexpectedReloadEventsDuringTurns: 0,
    inFlightReloadCount: 0,
    routes: (Object.keys(identityByFixture) as Array<keyof typeof identityByFixture>).map(
      (fixture) => ({
        fixture,
        evidenceId: `route:${fixture}`,
        nativeRunId: 'native-run-1',
        requested: identityByFixture[fixture],
        observed: identityByFixture[fixture],
        liveCatalogAuthenticated: true,
        completedThroughOpenCode: true,
        contextReceiptVerified: true,
        silentFallbackUsed: false,
      }),
    ),
    scenarios: PHASE0_SCENARIOS.map((scenarioId) => {
      const routeFixture = 'deepseek_v4_flash_vision_exp' as const;
      const identity = identityByFixture[routeFixture];
      return {
        scenarioId,
        evidenceId: `scenario:${scenarioId}`,
        nativeRunId: 'native-run-1',
        requestFixtureHash: `sha256:${'7'.repeat(64)}`,
        activation:
          scenarioId === 'automatic_rlm'
            ? ('automatic' as const)
            : scenarioId === 'explicit_rlm_on'
              ? ('explicit_rlm_on' as const)
              : ('fixture' as const),
        routeFixture,
        requestedIdentity: identity,
        observedIdentity: identity,
        gateway: {
          operation: 'investigate' as const,
          invocationCount: 1,
          initialMatchCount: scenarioId === 'empty_first_continuation' ? 0 : 1,
          continuationCount: scenarioId === 'empty_first_continuation' ? 1 : 0,
          receiptUri: `vibespace:context/receipt/${scenarioId}`,
          sourceUris: [`vibespace:context/source/${scenarioId}`],
          evidenceUris: [`vibespace:context/evidence/${scenarioId}`],
        },
        outcome: {
          terminalStatus:
            scenarioId === 'cancellation'
              ? ('cancelled' as const)
              : scenarioId === 'denied_external_directory'
                ? ('denied' as const)
                : ('done' as const),
          groundedFinalAnswer:
            scenarioId !== 'cancellation' && scenarioId !== 'denied_external_directory',
          duplicateDispatchCount: 0,
          duplicateToolEffectCount: 0,
          localFallbackUsed: false,
        },
        ...(scenarioId === 'permitted_exact_file'
          ? {
              exactFile: {
                permitted: true,
                resultCode: 'ok' as const,
                sourceIdentityVerified: true,
                requestedPathHash: `sha256:${'3'.repeat(64)}`,
                observedPathHash: `sha256:${'3'.repeat(64)}`,
                policyRootHash: `sha256:${'4'.repeat(64)}`,
                policyBoundary: 'within_project' as const,
              },
            }
          : {}),
        ...(scenarioId === 'denied_external_directory'
          ? {
              exactFile: {
                permitted: false,
                resultCode: 'external_directory' as const,
                sourceIdentityVerified: true,
                requestedPathHash: `sha256:${'5'.repeat(64)}`,
                observedPathHash: `sha256:${'5'.repeat(64)}`,
                policyRootHash: `sha256:${'4'.repeat(64)}`,
                policyBoundary: 'external_directory' as const,
              },
            }
          : {}),
        ...(scenarioId === 'binary_metadata'
          ? {
              binary: {
                graphMetadataPresent: true,
                physicalTextExcluded: true,
                remainingCorpusCompleted: true,
              },
            }
          : {}),
        ...(['cancellation', 'retry', 'reconnect', 'reload'].includes(scenarioId)
          ? {
              lifecycle: {
                attempted: true,
                recovered: scenarioId !== 'cancellation',
                routeIdentityStable: true,
                sessionIdentityStable: true,
                noLateEvents: true,
                attemptIds: scenarioId === 'retry' ? ['attempt-1', 'attempt-2'] : ['attempt-1'],
                logicalDispatchCount: 1,
                terminalAttemptId: scenarioId === 'retry' ? 'attempt-2' : 'attempt-1',
                toolEffectCount: scenarioId === 'cancellation' ? 0 : 1,
                lateEventCount: 0,
              },
            }
          : {}),
        ...(scenarioId === 'project_isolation'
          ? {
              isolation: {
                sourceProjectHash: `sha256:${'1'.repeat(64)}`,
                otherProjectHash: `sha256:${'2'.repeat(64)}`,
                crossProjectReadBlocked: true,
                crossProjectEvidenceReuseBlocked: true,
              },
            }
          : {}),
        ...(scenarioId === 'reload' ? { reloadAfterPriorTerminal: true } : {}),
      };
    }),
    artifact: {
      evidenceId: 'artifact-proof-1',
      nativeRunId: 'native-run-1',
      requiredRoot: 'D:\\VibeSpace-RLM-UAT\\opencode-live-latency-20260829',
      observedRoot: 'D:\\VibeSpace-RLM-UAT\\opencode-live-latency-20260829',
      exists: true,
      readbackVerified: true,
      manifest: [
        { relativePath: 'result.json', byteCount: 128, sha256: `sha256:${'c'.repeat(64)}` },
      ],
    },
    citations: (['receipt', 'source', 'evidence'] as const).map((kind) => ({
      uri: `vibespace:context/${kind}/canonical_link_resolution`,
      kind,
      nativeRunId: 'native-run-1',
      targetHash: `sha256:${'e'.repeat(64)}`,
      renderedPublicly: true,
      resolverInvoked: true,
      resolved: true,
      projectScopeMatches: true,
      sessionScopeMatches: true,
    })),
    safety: [
      {
        label: 'before',
        nativeRunId: 'native-run-1',
        capturedAt: '2026-08-30T08:00:00.000Z',
        ollamaProcessCount: 0,
        listener11434Count: 0,
      },
      ...PHASE0_SCENARIOS.map((scenarioId) => ({
        label: `during:${scenarioId}` as const,
        nativeRunId: 'native-run-1',
        capturedAt: '2026-08-30T08:01:00.000Z',
        ollamaProcessCount: 0,
        listener11434Count: 0,
      })),
      {
        label: 'after',
        nativeRunId: 'native-run-1',
        capturedAt: '2026-08-30T08:02:00.000Z',
        ollamaProcessCount: 0,
        listener11434Count: 0,
      },
    ],
  };
}

describe('evaluateContextGatewayAcceptance', () => {
  it('requires one complete immutable Phase 0 proof before acceptance can pass', () => {
    const incomplete = completeInput();
    delete incomplete.phase0Proof;
    expect(evaluateContextGatewayAcceptance(incomplete)).toMatchObject({
      status: 'incomplete',
      missing: ['phase0Proof'],
    });

    const complete = completeInput();
    (complete as any).phase0Proof = completePhase0Proof();
    expect(evaluateContextGatewayAcceptance(complete)).toEqual({
      status: 'passed',
      missing: [],
      failures: [],
      externalBlockers: [],
    });
  });

  it('fails Phase 0 identity, continuation, artifact, citation, and zero-Ollama defects', () => {
    const input = completeInput();
    const proof = completePhase0Proof();
    proof.routes[0]!.observed = { ...proof.routes[0]!.observed, effort: 'provider-default' };
    const emptyFirst = proof.scenarios.find(
      (scenario) => scenario.scenarioId === 'empty_first_continuation',
    )!;
    emptyFirst.gateway.continuationCount = 0;
    proof.artifact.observedRoot = 'D:\\wrong';
    proof.citations.find((citation) => citation.kind === 'source')!.resolved = false;
    proof.safety.find((snapshot) => snapshot.label === 'after')!.listener11434Count = 1;
    (input as any).phase0Proof = proof;

    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'failed',
      failures: expect.arrayContaining([
        'phase0:route:deepseek_v4_flash_vision_exp:requestedObservedIdentity',
        'phase0:scenario:empty_first_continuation:noContinuation',
        'phase0:artifact:rootMismatch',
        'phase0:citation:source:unresolved',
        'phase0:safety:after:ollama',
      ]),
    });
  });

  it('rejects mixed native runs, mid-turn HMR, unexpected reload, and variant drift', () => {
    const input = completeInput();
    const proof = completePhase0Proof();
    proof.nativeRunId = 'native-run-1';
    proof.executableSha256 = `sha256:${'d'.repeat(64)}`;
    proof.hmrEventsDuringTurns = 1;
    proof.unexpectedReloadEventsDuringTurns = 1;
    for (const route of proof.routes) route.nativeRunId = 'native-run-1';
    for (const scenario of proof.scenarios) {
      scenario.nativeRunId = 'native-run-1';
      scenario.reloadAfterPriorTerminal = scenario.scenarioId === 'reload';
    }
    proof.routes[0].nativeRunId = 'native-run-2';
    proof.routes[0].requested = {
      ...proof.routes[0].requested,
      variant: 'high',
      performance: 'quality',
    };
    proof.routes[0].observed = {
      ...proof.routes[0].observed,
      variant: 'provider-default',
      performance: 'quality',
    };
    input.phase0Proof = proof;

    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'failed',
      failures: expect.arrayContaining([
        'phase0:hmrDuringTurn',
        'phase0:unexpectedReloadDuringTurn',
        'phase0:route:deepseek_v4_flash_vision_exp:runBinding',
        'phase0:route:deepseek_v4_flash_vision_exp:requestedObservedIdentity',
      ]),
    });
  });

  it('binds artifacts, citations, safety, and activation receipts to one native run', () => {
    const input = completeInput();
    const proof = completePhase0Proof();
    proof.artifact.nativeRunId = 'native-run-other';
    proof.citations[0].nativeRunId = 'native-run-other';
    proof.safety[0].nativeRunId = 'native-run-other';
    const automatic = proof.scenarios.find((row) => row.scenarioId === 'automatic_rlm')!;
    const explicit = proof.scenarios.find((row) => row.scenarioId === 'explicit_rlm_on')!;
    automatic.gateway.receiptUri = explicit.gateway.receiptUri;
    input.phase0Proof = proof;

    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'failed',
      failures: expect.arrayContaining([
        'phase0:artifact:runBinding',
        'phase0:citation:receipt:runBinding',
        'phase0:safety:before:runBinding',
        'phase0:scenario:activation:receiptNotDistinct',
      ]),
    });
  });

  it('rejects spliced evidence identifiers and duplicate artifact manifest paths', () => {
    const duplicateEvidence = completeInput();
    duplicateEvidence.phase0Proof!.routes[1]!.evidenceId =
      duplicateEvidence.phase0Proof!.routes[0]!.evidenceId;
    expect(() => evaluateContextGatewayAcceptance(duplicateEvidence)).toThrow(
      'duplicate phase0 evidenceId',
    );

    const duplicateArtifact = completeInput();
    duplicateArtifact.phase0Proof!.artifact.manifest.push({
      ...duplicateArtifact.phase0Proof!.artifact.manifest[0]!,
      sha256: `sha256:${'f'.repeat(64)}`,
    });
    expect(() => evaluateContextGatewayAcceptance(duplicateArtifact)).toThrow(
      'duplicate phase0 artifact path',
    );
  });

  it('enforces terminal and grounded outcomes for every Phase 0 scenario', () => {
    const input = completeInput();
    const automatic = input.phase0Proof!.scenarios.find(
      (scenario) => scenario.scenarioId === 'automatic_rlm',
    )!;
    automatic.outcome.terminalStatus = 'failed';
    automatic.outcome.groundedFinalAnswer = false;
    const cancellation = input.phase0Proof!.scenarios.find(
      (scenario) => scenario.scenarioId === 'cancellation',
    )!;
    cancellation.outcome.terminalStatus = 'done';

    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'failed',
      failures: expect.arrayContaining([
        'phase0:scenario:automatic_rlm:terminalStatus',
        'phase0:scenario:automatic_rlm:grounding',
        'phase0:scenario:cancellation:terminalStatus',
      ]),
    });
  });

  it('binds each scenario identity to its declared route and activation parity route', () => {
    const input = completeInput();
    const automatic = input.phase0Proof!.scenarios.find(
      (scenario) => scenario.scenarioId === 'automatic_rlm',
    )!;
    const secondary = input.phase0Proof!.routes.find(
      (route) => route.fixture === 'secondary_authenticated',
    )!;
    automatic.requestedIdentity = secondary.requested;
    automatic.observedIdentity = secondary.observed;
    const explicit = input.phase0Proof!.scenarios.find(
      (scenario) => scenario.scenarioId === 'explicit_rlm_on',
    )!;
    explicit.routeFixture = 'secondary_authenticated';
    explicit.requestedIdentity = secondary.requested;
    explicit.observedIdentity = secondary.observed;

    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'failed',
      failures: expect.arrayContaining([
        'phase0:scenario:automatic_rlm:routeBinding',
        'phase0:scenario:activation:routeMismatch',
      ]),
    });
  });

  it('keeps omitted scenario evidence incomplete without derivative failures', () => {
    const input = completeInput();
    input.phase0Proof!.scenarios = input.phase0Proof!.scenarios.filter(
      (scenario) => scenario.scenarioId !== 'binary_metadata',
    );

    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'incomplete',
      missing: ['phase0:scenario:binary_metadata'],
      failures: [],
    });
  });

  it('binds public citations to the canonical-link scenario', () => {
    const input = completeInput();
    input.phase0Proof!.citations[0]!.uri = 'vibespace:context/receipt/unrelated';
    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'failed',
      failures: expect.arrayContaining([
        'phase0:scenario:canonical_link_resolution:citationMismatch',
      ]),
    });
  });

  it('requires a real second retry attempt and zero late cancellation events', () => {
    const input = completeInput();
    const retry = input.phase0Proof!.scenarios.find((scenario) => scenario.scenarioId === 'retry')!;
    Object.assign(retry.lifecycle!, {
      attemptIds: ['attempt-1'],
      logicalDispatchCount: 1,
      terminalAttemptId: 'attempt-1',
      toolEffectCount: 1,
      lateEventCount: 0,
    });
    const cancellation = input.phase0Proof!.scenarios.find(
      (scenario) => scenario.scenarioId === 'cancellation',
    )!;
    Object.assign(cancellation.lifecycle!, {
      attemptIds: ['attempt-1'],
      logicalDispatchCount: 1,
      terminalAttemptId: 'attempt-1',
      toolEffectCount: 0,
      lateEventCount: 1,
    });

    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'failed',
      failures: expect.arrayContaining([
        'phase0:scenario:retry:notRetried',
        'phase0:scenario:cancellation:lateEvents',
      ]),
    });
  });

  it('keeps retries under one logical dispatch with one bounded tool effect', () => {
    const input = completeInput();
    const retry = input.phase0Proof!.scenarios.find((scenario) => scenario.scenarioId === 'retry')!;
    retry.lifecycle!.logicalDispatchCount = 2;
    retry.lifecycle!.toolEffectCount = 99;
    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'failed',
      failures: expect.arrayContaining([
        'phase0:scenario:retry:duplicateLogicalDispatch',
        'phase0:scenario:retry:toolEffectCount',
      ]),
    });
  });

  it('requires exact citation coverage for every canonical-link scenario URI', () => {
    const input = completeInput();
    const scenario = input.phase0Proof!.scenarios.find(
      (row) => row.scenarioId === 'canonical_link_resolution',
    )!;
    scenario.gateway.sourceUris.push('vibespace:context/source/unresolved-extra');
    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'failed',
      failures: expect.arrayContaining([
        'phase0:scenario:canonical_link_resolution:citationMismatch',
      ]),
    });
  });

  it('keeps a missing primary route incomplete without derivative scenario failures', () => {
    const input = completeInput();
    input.phase0Proof!.routes = input.phase0Proof!.routes.filter(
      (route) => route.fixture !== 'deepseek_v4_flash_vision_exp',
    );
    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'incomplete',
      missing: ['phase0:route:deepseek_v4_flash_vision_exp'],
      failures: [],
    });
  });

  it('enforces the exact DeepSeek primary fixture identity', () => {
    const input = completeInput();
    const primary = input.phase0Proof!.routes.find(
      (route) => route.fixture === 'deepseek_v4_flash_vision_exp',
    )!;
    primary.requested.providerQualifiedModelId = 'other/model';
    primary.requested.upstreamProviderId = 'other';
    primary.requested.upstreamModelId = 'model';
    primary.observed = { ...primary.requested };
    for (const scenario of input.phase0Proof!.scenarios) {
      scenario.requestedIdentity = primary.requested;
      scenario.observedIdentity = primary.observed;
    }
    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'failed',
      failures: expect.arrayContaining([
        'phase0:route:deepseek_v4_flash_vision_exp:fixtureIdentity',
      ]),
    });
  });

  it('requires the secondary fixture to use a materially different authenticated upstream route', () => {
    const input = completeInput();
    const primary = input.phase0Proof!.routes.find(
      (route) => route.fixture === 'deepseek_v4_flash_vision_exp',
    )!;
    const secondary = input.phase0Proof!.routes.find(
      (route) => route.fixture === 'secondary_authenticated',
    )!;
    secondary.requested = {
      ...secondary.requested,
      providerId: 'relabeled-provider',
      connectionId: 'relabeled-connection',
      upstreamProviderId: primary.requested.upstreamProviderId,
      authBillingRoute: primary.requested.authBillingRoute,
    };
    secondary.observed = { ...secondary.requested };
    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'failed',
      failures: expect.arrayContaining(['phase0:routes:notMateriallyDifferent']),
    });
  });

  it('binds automatic and explicit RLM parity to the same request fixture', () => {
    const input = completeInput();
    const explicit = input.phase0Proof!.scenarios.find(
      (scenario) => scenario.scenarioId === 'explicit_rlm_on',
    )!;
    (explicit as any).requestFixtureHash = `sha256:${'9'.repeat(64)}`;
    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'failed',
      failures: expect.arrayContaining(['phase0:scenario:activation:requestFixtureMismatch']),
    });
  });

  it('binds exact-file results to the tested path and policy boundary', () => {
    const input = completeInput();
    const permitted = input.phase0Proof!.scenarios.find(
      (scenario) => scenario.scenarioId === 'permitted_exact_file',
    )!.exactFile!;
    (permitted as any).observedPathHash = `sha256:${'8'.repeat(64)}`;
    (permitted as any).policyBoundary = 'external_directory';
    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'failed',
      failures: expect.arrayContaining([
        'phase0:scenario:permitted_exact_file:pathBinding',
        'phase0:scenario:permitted_exact_file:policyBoundary',
      ]),
    });
  });

  it('binds permitted and denied exact-file evidence to one policy root and distinct paths', () => {
    const input = completeInput();
    const permitted = input.phase0Proof!.scenarios.find(
      (scenario) => scenario.scenarioId === 'permitted_exact_file',
    )!.exactFile!;
    const denied = input.phase0Proof!.scenarios.find(
      (scenario) => scenario.scenarioId === 'denied_external_directory',
    )!.exactFile!;
    denied.sourceIdentityVerified = false;
    denied.policyRootHash = `sha256:${'8'.repeat(64)}`;
    denied.requestedPathHash = permitted.requestedPathHash;
    denied.observedPathHash = permitted.observedPathHash;
    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'failed',
      failures: expect.arrayContaining([
        'phase0:scenario:denied_external_directory:sourceIdentity',
        'phase0:scenario:exact_file:policyRootMismatch',
        'phase0:scenario:exact_file:pathNotDistinct',
      ]),
    });
  });

  it('passes only when the entire required proof matrix is present and passing', () => {
    expect(evaluateContextGatewayAcceptance(completeInput())).toEqual({
      status: 'passed',
      missing: [],
      failures: [],
      externalBlockers: [],
    });
  });

  it('keeps a missing ADE direct report explicitly incomplete', () => {
    const input = completeInput();
    input.directReports = input.directReports.filter(({ surfaceId }) => surfaceId !== 'ade');

    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'incomplete',
      missing: ['direct:ade'],
    });
  });

  it('fails when an official native proof exposes an unbound ADE dispatcher', () => {
    const input = completeInput();
    input.nativeProofs = input.nativeProofs.map((proof) =>
      proof.surfaceId === 'ade' ? { ...proof, productionDispatcherBound: false } : proof,
    );

    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'failed',
      failures: ['native:ade:productionDispatcherBound'],
    });
  });

  it('fails native proof captured from a different commit or runtime generation', () => {
    const input = completeInput();
    input.nativeProofs = input.nativeProofs.map((proof) =>
      proof.surfaceId === 'ade'
        ? { ...proof, commitSha: 'abcdef0123456789abcdef0123456789abcdef01' }
        : proof,
    );

    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'failed',
      failures: ['native:ade:buildBinding'],
    });
  });

  it('reports a genuine external blocker separately after internal gates pass', () => {
    const input = completeInput();
    input.externalBlockers = [
      { code: 'provider-oauth-401', recovery: 'Use the official account reconnect flow.' },
    ];

    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'blocked-external',
      missing: [],
      failures: [],
      externalBlockers: ['provider-oauth-401'],
    });
  });

  it('fails passed-looking direct or retrieval rows whose own report is not passing', () => {
    const input = completeInput();
    input.directReports[0] = {
      ...input.directReports[0],
      report: { ...directReport, passed: false, failures: ['p95-absolute'] },
    };
    input.deepReport = { ...deepReport, passed: false, failures: ['deep-p95'] };

    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'failed',
      failures: ['direct:chat', 'retrieval:deep'],
    });
  });

  it('revalidates passed-looking report measurements instead of trusting the flag', () => {
    const input = completeInput();
    input.directReports[0] = {
      ...input.directReports[0],
      report: { ...directReport, sampleCount: 29 },
    };
    input.focusedReport = {
      ...focusedReport,
      retrievalMs: { ...focusedReport.retrievalMs, p95: 4_001 },
    };

    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'failed',
      failures: ['direct:chat', 'retrieval:focused'],
    });
  });

  it('fails a passed-looking retrieval report with incomplete quality proof', () => {
    const input = completeInput();
    input.focusedReport = {
      ...focusedReport,
      quality: { ...focusedReport.quality, citationVerificationRate: 29 / 30 },
    };

    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'failed',
      failures: ['retrieval:focused'],
    });
  });

  it('fails a passed-looking retrieval report with malformed stage evidence', () => {
    const input = completeInput();
    input.focusedReport = {
      ...focusedReport,
      stageTimingsMs: {
        ...focusedReport.stageTimingsMs,
        search: { p50: -1, p95: 1_600, p99: 1_800, max: 1_900 },
      },
    };

    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'failed',
      failures: ['retrieval:focused'],
    });
  });

  it('rejects a passed-looking direct report with malformed local stage distributions', () => {
    const input = completeInput();
    input.directReports[0] = {
      ...input.directReports[0],
      report: {
        ...directReport,
        gatewayStageTimingsMs: {
          ...directReport.gatewayStageTimingsMs,
          routeDecision: { p50: 20, p95: -1, p99: 20 },
        },
      },
    };

    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'failed',
      failures: ['direct:chat'],
    });
  });

  it('rejects a passed-looking direct report with malformed resource evidence', () => {
    const input = completeInput();
    input.directReports[0] = {
      ...input.directReports[0],
      report: {
        ...directReport,
        resources: {
          ...directReport.resources,
          gateway: {
            ...directReport.resources.gateway,
            processCount: { p50: 7, p95: 7.5, p99: 8 },
          },
        },
      },
    };

    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'failed',
      failures: ['direct:chat'],
    });
  });

  it('rejects a passed-looking direct report with non-monotonic lifecycle evidence', () => {
    const input = completeInput();
    input.directReports[0] = {
      ...input.directReports[0],
      report: {
        ...directReport,
        lifecycle: {
          ...directReport.lifecycle,
          gateway: {
            ...directReport.lifecycle.gateway,
            firstVisiblePaint: { p50: 300, p95: 300, p99: 300 },
          },
        },
      },
    };

    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'failed',
      failures: ['direct:chat'],
    });
  });

  it('keeps missing exact build or rollback evidence incomplete', () => {
    const input = completeInput();
    input.build = { ...input.build, runtimeGeneration: '' };
    delete input.rollbackProof;
    input.rollbackNotes = '  ';

    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'incomplete',
      missing: ['build:runtimeGeneration', 'rollbackProof', 'rollbackNotes'],
    });
  });

  it('fails rollback proof that permits shadow provider dispatch', () => {
    const input = completeInput();
    input.rollbackProof = { ...input.rollbackProof!, noShadowProviderDispatch: false };

    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'failed',
      failures: ['rollback:noShadowProviderDispatch'],
    });
  });

  it('fails rollback proof captured from a different build', () => {
    const input = completeInput();
    input.rollbackProof = { ...input.rollbackProof!, runtimeGeneration: 'other-generation' };

    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'failed',
      failures: ['rollback:buildBinding'],
    });
  });

  it('fails isolation proof that permits cross-scope evidence reuse', () => {
    const input = completeInput();
    input.isolationProof = { ...input.isolationProof!, crossScopeEvidenceReuseBlocked: false };

    expect(evaluateContextGatewayAcceptance(input)).toMatchObject({
      status: 'failed',
      failures: ['isolation:crossScopeEvidenceReuseBlocked'],
    });
  });

  it('rejects isolation proof with duplicate opaque scope hashes', () => {
    const input = completeInput();
    input.isolationProof = {
      ...input.isolationProof!,
      scopes: input.isolationProof!.scopes.map((scope) => ({
        ...scope,
        scopeHash: `sha256:${'1'.repeat(64)}`,
      })),
    };

    expect(() => evaluateContextGatewayAcceptance(input)).toThrow('scopeHash');
  });

  it('rejects duplicate or unknown surface rows and malformed blocker metadata', () => {
    const duplicate = completeInput();
    duplicate.directReports = [...duplicate.directReports, duplicate.directReports[0]];
    expect(() => evaluateContextGatewayAcceptance(duplicate)).toThrow('duplicate direct');

    const unknown = completeInput();
    unknown.nativeProofs = [...unknown.nativeProofs, nativeProof('terminal:unknown')];
    expect(() => evaluateContextGatewayAcceptance(unknown)).toThrow('unknown native');

    const malformed = completeInput();
    malformed.externalBlockers = [{ code: '', recovery: 'Reconnect.' }];
    expect(() => evaluateContextGatewayAcceptance(malformed)).toThrow('blocker code');

    const duplicateEvidence = completeInput();
    duplicateEvidence.nativeProofs[1] = {
      ...duplicateEvidence.nativeProofs[1],
      evidenceId: duplicateEvidence.nativeProofs[0].evidenceId,
    };
    expect(() => evaluateContextGatewayAcceptance(duplicateEvidence)).toThrow('native evidenceId');
  });
});
