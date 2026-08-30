import { describe, expect, it } from 'vitest';

import { parseContextGatewayAcceptanceInput } from './contextGatewayAcceptanceSchema';

function incompleteEnvelope(): Record<string, unknown> {
  return {
    build: { commitSha: '', buildId: '', runtimeGeneration: '' },
    directReports: [],
    nativeProofs: [],
    featureParityPassed: true,
    concurrentScopeIsolationPassed: true,
    rollbackNotes: '',
    externalBlockers: [],
  };
}

function phase0Envelope(): Record<string, unknown> {
  return {
    ...incompleteEnvelope(),
    phase0Proof: {
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
      routes: [],
      scenarios: [],
      artifact: {
        evidenceId: 'artifact-proof-1',
        nativeRunId: 'native-run-1',
        requiredRoot: 'D:\\VibeSpace-RLM-UAT\\opencode-live-latency-20260829',
        observedRoot: 'D:\\VibeSpace-RLM-UAT\\opencode-live-latency-20260829',
        exists: true,
        readbackVerified: true,
        manifest: [],
      },
      citations: [],
      safety: [],
    },
  };
}

function phase0Identity() {
  return {
    providerId: 'opencode',
    connectionId: 'opencode-cli',
    providerQualifiedModelId: 'opencode-go/deepseek-v4-flash-vision-exp',
    upstreamProviderId: 'opencode-go',
    upstreamModelId: 'deepseek-v4-flash-vision-exp',
    variant: 'high',
    effort: 'high',
    performance: 'quality',
    fastMode: 'off',
    cwd: 'C:\\repo',
    authBillingRoute: 'opencode-go',
    catalogRevision: `sha256:${'a'.repeat(64)}`,
    sessionIdentityHash: `sha256:${'b'.repeat(64)}`,
    identityPathId: 'opencode-live-catalog-to-native-receipt-v1',
  };
}

describe('parseContextGatewayAcceptanceInput', () => {
  it('accepts the exact metadata-only Phase 0 proof envelope', () => {
    const input = phase0Envelope();
    expect(parseContextGatewayAcceptanceInput(input)).toEqual(input);
  });

  it('rejects malformed or secret-bearing nested Phase 0 evidence', () => {
    const malformed = phase0Envelope();
    (malformed.phase0Proof as Record<string, unknown>).executableSha256 = 'not-a-sha';
    expect(() => parseContextGatewayAcceptanceInput(malformed)).toThrow('SHA-256');

    const secretBearing = phase0Envelope();
    const artifact = (secretBearing.phase0Proof as any).artifact;
    artifact.prompt = 'raw private prompt';
    expect(() => parseContextGatewayAcceptanceInput(secretBearing)).toThrow('unknown field');
  });

  it('parses exact nested Phase 0 rows and rejects unknown scenario or secret fields', () => {
    const input = phase0Envelope();
    const proof = (input as any).phase0Proof;
    const identity = phase0Identity();
    proof.routes = [
      {
        fixture: 'deepseek_v4_flash_vision_exp',
        evidenceId: 'route-1',
        nativeRunId: 'native-run-1',
        requested: identity,
        observed: identity,
        liveCatalogAuthenticated: true,
        completedThroughOpenCode: true,
        contextReceiptVerified: true,
        silentFallbackUsed: false,
      },
    ];
    proof.scenarios = [
      {
        scenarioId: 'reload',
        evidenceId: 'scenario-reload',
        nativeRunId: 'native-run-1',
        activation: 'fixture',
        routeFixture: 'deepseek_v4_flash_vision_exp',
        requestFixtureHash: `sha256:${'7'.repeat(64)}`,
        requestedIdentity: identity,
        observedIdentity: identity,
        gateway: {
          operation: 'investigate',
          invocationCount: 1,
          initialMatchCount: 1,
          continuationCount: 0,
          receiptUri: 'vibespace:context/receipt/reload',
          sourceUris: ['vibespace:context/source/reload'],
          evidenceUris: ['vibespace:context/evidence/reload'],
        },
        outcome: {
          terminalStatus: 'done',
          groundedFinalAnswer: true,
          duplicateDispatchCount: 0,
          duplicateToolEffectCount: 0,
          localFallbackUsed: false,
        },
        exactFile: {
          permitted: true,
          resultCode: 'ok',
          sourceIdentityVerified: true,
          requestedPathHash: `sha256:${'3'.repeat(64)}`,
          observedPathHash: `sha256:${'3'.repeat(64)}`,
          policyRootHash: `sha256:${'4'.repeat(64)}`,
          policyBoundary: 'within_project',
        },
        lifecycle: {
          attempted: true,
          recovered: true,
          routeIdentityStable: true,
          sessionIdentityStable: true,
          noLateEvents: true,
          attemptIds: ['attempt-1'],
          logicalDispatchCount: 1,
          terminalAttemptId: 'attempt-1',
          toolEffectCount: 1,
          lateEventCount: 0,
        },
        reloadAfterPriorTerminal: true,
      },
    ];
    proof.citations = [
      {
        uri: 'vibespace:context/receipt/reload',
        kind: 'receipt',
        nativeRunId: 'native-run-1',
        targetHash: `sha256:${'c'.repeat(64)}`,
        renderedPublicly: true,
        resolverInvoked: true,
        resolved: true,
        projectScopeMatches: true,
        sessionScopeMatches: true,
      },
    ];
    proof.safety = [
      {
        label: 'before',
        nativeRunId: 'native-run-1',
        capturedAt: '2026-08-30T08:00:00.000Z',
        ollamaProcessCount: 0,
        listener11434Count: 0,
      },
    ];
    expect(parseContextGatewayAcceptanceInput(input)).toEqual(input);

    const missingBinding = structuredClone(input) as any;
    delete missingBinding.phase0Proof.artifact.nativeRunId;
    expect(() => parseContextGatewayAcceptanceInput(missingBinding)).toThrow('nativeRunId');

    const missingTarget = structuredClone(input) as any;
    delete missingTarget.phase0Proof.citations[0].targetHash;
    expect(() => parseContextGatewayAcceptanceInput(missingTarget)).toThrow('targetHash');

    const missingAttempts = structuredClone(input) as any;
    delete missingAttempts.phase0Proof.scenarios[0].lifecycle.attemptIds;
    expect(() => parseContextGatewayAcceptanceInput(missingAttempts)).toThrow('attemptIds');

    const malformedRequestFixture = structuredClone(input) as any;
    malformedRequestFixture.phase0Proof.scenarios[0].requestFixtureHash = 'not-a-sha';
    expect(() => parseContextGatewayAcceptanceInput(malformedRequestFixture)).toThrow('SHA-256');

    const malformedPathBinding = structuredClone(input) as any;
    malformedPathBinding.phase0Proof.scenarios[0].exactFile.requestedPathHash = 'not-a-sha';
    expect(() => parseContextGatewayAcceptanceInput(malformedPathBinding)).toThrow('SHA-256');

    const malformedPolicyBoundary = structuredClone(input) as any;
    malformedPolicyBoundary.phase0Proof.scenarios[0].exactFile.policyBoundary = 'elsewhere';
    expect(() => parseContextGatewayAcceptanceInput(malformedPolicyBoundary)).toThrow(
      'policyBoundary',
    );

    for (const field of ['initialMatchCount', 'continuationCount']) {
      const negativeCount = structuredClone(input) as any;
      negativeCount.phase0Proof.scenarios[0].gateway[field] = -1;
      expect(() => parseContextGatewayAcceptanceInput(negativeCount)).toThrow(
        'non-negative safe integer',
      );
    }

    const malformedUri = structuredClone(input) as any;
    malformedUri.phase0Proof.citations[0].uri = 'vibespace:context/receipt/../';
    expect(() => parseContextGatewayAcceptanceInput(malformedUri)).toThrow('canonical Context URI');

    const secret = structuredClone(input) as any;
    secret.phase0Proof.routes[0].output = 'raw provider output';
    expect(() => parseContextGatewayAcceptanceInput(secret)).toThrow('unknown field');

    const unknownScenario = structuredClone(input) as any;
    unknownScenario.phase0Proof.scenarios[0].scenarioId = 'invented';
    expect(() => parseContextGatewayAcceptanceInput(unknownScenario)).toThrow('scenarioId');

    const credentialInjectors = [
      (value: any) => (value.phase0Proof.routes[0].requested.credential = 'secret'),
      (value: any) => (value.phase0Proof.scenarios[0].credential = 'secret'),
      (value: any) => (value.phase0Proof.scenarios[0].gateway.authorization = 'secret'),
      (value: any) => (value.phase0Proof.artifact.environment = 'secret'),
      (value: any) => (value.phase0Proof.citations[0].token = 'secret'),
      (value: any) => (value.phase0Proof.safety[0].hiddenReasoning = 'secret'),
    ];
    for (const inject of credentialInjectors) {
      const credential = structuredClone(input) as any;
      inject(credential);
      expect(() => parseContextGatewayAcceptanceInput(credential)).toThrow('unknown field');
    }
  });

  it('accepts the bounded metadata-only incomplete envelope', () => {
    expect(parseContextGatewayAcceptanceInput(incompleteEnvelope())).toEqual(incompleteEnvelope());
  });

  it('accepts only exact structured rollback proof metadata', () => {
    const input = {
      ...incompleteEnvelope(),
      rollbackProof: {
        commitSha: '0123456789abcdef0123456789abcdef01234567',
        runtimeGeneration: 'generation-1',
        oldRouteAvailable: true,
        noShadowProviderDispatch: true,
        userDataPreserved: true,
        runtimePointerRestorable: true,
      },
    };
    expect(parseContextGatewayAcceptanceInput(input)).toEqual(input);
    expect(() =>
      parseContextGatewayAcceptanceInput({
        ...input,
        rollbackProof: { ...input.rollbackProof, output: 'private output' },
      }),
    ).toThrow('unknown field');
  });

  it('accepts bounded metadata-only concurrent isolation proof', () => {
    const input = {
      ...incompleteEnvelope(),
      isolationProof: {
        evidenceId: 'isolation-proof-1',
        recordedAt: '2026-08-22T12:00:00.000Z',
        commitSha: '0123456789abcdef0123456789abcdef01234567',
        runtimeGeneration: 'generation-1',
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
    };
    expect(parseContextGatewayAcceptanceInput(input)).toEqual(input);
  });

  it('rejects an unknown top-level prompt field', () => {
    expect(() =>
      parseContextGatewayAcceptanceInput({
        ...incompleteEnvelope(),
        prompt: 'private prompt content',
      }),
    ).toThrow('unknown field');
  });

  it('rejects hidden output inside a direct report row', () => {
    expect(() =>
      parseContextGatewayAcceptanceInput({
        ...incompleteEnvelope(),
        directReports: [{ surfaceId: 'chat', report: { output: 'private model output' } }],
      }),
    ).toThrow('unknown field');
  });

  it('rejects hidden credential material inside a native proof row', () => {
    expect(() =>
      parseContextGatewayAcceptanceInput({
        ...incompleteEnvelope(),
        nativeProofs: [
          {
            surfaceId: 'chat',
            evidenceId: 'proof-1',
            recordedAt: '2026-08-22T12:00:00.000Z',
            commitSha: '0123456789abcdef0123456789abcdef01234567',
            runtimeGeneration: 'generation-1',
            officialDesktop: true,
            productionDispatcherBound: true,
            exactExecutionIdentityObserved: true,
            contextReceiptVerified: true,
            scopeIsolationVerified: true,
            cancellationVerified: true,
            streamingVerified: true,
            noDuplicateDispatchVerified: true,
            credential: 'must-not-be-accepted',
          },
        ],
      }),
    ).toThrow('unknown field');
  });

  it('rejects unsafe control text and oversized collections before evaluation', () => {
    expect(() =>
      parseContextGatewayAcceptanceInput({
        ...incompleteEnvelope(),
        rollbackNotes: 'unsafe\u0000text',
      }),
    ).toThrow('bounded safe text');

    expect(() =>
      parseContextGatewayAcceptanceInput({
        ...incompleteEnvelope(),
        directReports: Array.from({ length: 33 }, () => ({})),
      }),
    ).toThrow('bounded array');
  });

  it('rejects fractional run counts before they can satisfy a minimum', () => {
    expect(() =>
      parseContextGatewayAcceptanceInput({
        ...incompleteEnvelope(),
        directReports: [
          {
            surfaceId: 'chat',
            report: {
              sampleCount: 30.5,
              passed: true,
              failures: [],
              baselineMs: { p50: 1, p95: 1, p99: 1 },
              overheadMs: { p50: 0, p95: 0, p99: 0 },
              overheadRatio: { p50: 0, p95: 0, p99: 0 },
              gatewayStageTimingsMs: {
                contextPack: { p50: 0, p95: 0, p99: 0 },
                routeDecision: { p50: 0, p95: 0, p99: 0 },
                queueWait: { p50: 0, p95: 0, p99: 0 },
                dispatch: { p50: 0, p95: 0, p99: 0 },
                adeAdapter: { p50: 0, p95: 0, p99: 0 },
              },
              resources: {
                baseline: {
                  cpuPercent: { p50: 10, p95: 10, p99: 10 },
                  workingSetMiB: { p50: 480, p95: 480, p99: 480 },
                  processCount: { p50: 6, p95: 6, p99: 6 },
                },
                gateway: {
                  cpuPercent: { p50: 12, p95: 12, p99: 12 },
                  workingSetMiB: { p50: 500, p95: 500, p99: 500 },
                  processCount: { p50: 7, p95: 7, p99: 7 },
                },
              },
              lifecycle: {
                baseline: {
                  providerAccepted: { p50: 100, p95: 100, p99: 100 },
                  firstOutput: { p50: 300, p95: 300, p99: 300 },
                  firstVisiblePaint: { p50: 320, p95: 320, p99: 320 },
                  completion: { p50: 900, p95: 900, p99: 900 },
                },
                gateway: {
                  providerAccepted: { p50: 120, p95: 120, p99: 120 },
                  firstOutput: { p50: 320, p95: 320, p99: 320 },
                  firstVisiblePaint: { p50: 340, p95: 340, p99: 340 },
                  completion: { p50: 930, p95: 930, p99: 930 },
                },
              },
              relativeBudgetsMs: { p95: 0.2, p99: 0.2 },
              effectiveBudgetsMs: { p95: 0.2, p99: 0.2 },
            },
          },
        ],
      }),
    ).toThrow('safe integer');
  });

  it('accepts bounded retrieval quality rates without raw corpus content', () => {
    const input = {
      ...incompleteEnvelope(),
      focusedReport: {
        route: 'focused',
        sampleCount: 30,
        passed: true,
        failures: [],
        retrievalMs: { p50: 1, p95: 2, p99: 3, max: 4 },
        candidateCount: { p50: 8, p95: 8, p99: 8, max: 8 },
        hydratedCount: { p50: 5, p95: 5, p99: 5, max: 5 },
        stageTimingsMs: {
          siyuanReady: { p50: 0, p95: 0, p99: 0, max: 0 },
          queueWait: { p50: 0, p95: 0, p99: 0, max: 0 },
          search: { p50: 1, p95: 2, p99: 3, max: 4 },
          evidenceHydration: { p50: 0, p95: 0, p99: 0, max: 0 },
          validationHash: { p50: 0, p95: 0, p99: 0, max: 0 },
        },
        rlmSubqueryCount: { p50: 0, p95: 0, p99: 0, max: 0 },
        quality: {
          topResultAccuracy: 1,
          citationVerificationRate: 1,
          answerRubricPassRate: 1,
        },
      },
    };

    expect(parseContextGatewayAcceptanceInput(input)).toEqual(input);

    expect(() =>
      parseContextGatewayAcceptanceInput({
        ...input,
        focusedReport: {
          ...input.focusedReport,
          quality: { ...input.focusedReport.quality, topResultAccuracy: 1.01 },
        },
      }),
    ).toThrow('must be a rate');

    expect(() =>
      parseContextGatewayAcceptanceInput({
        ...input,
        focusedReport: {
          ...input.focusedReport,
          quality: { ...input.focusedReport.quality, output: 'private answer' },
        },
      }),
    ).toThrow('unknown field');
  });
});
