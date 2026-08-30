import { describe, expect, it, vi } from 'vitest';
import type { ProductionContextGatewayQueryResult } from './siyuanContextGatewayQuery';

const defaultFederatedQuery = vi.hoisted(() => vi.fn());

vi.mock('./siyuanContextGatewayQuery', () => ({
  CONTEXT_GATEWAY_RETRIEVAL_STAGE_NAMES: [
    'siyuanReady',
    'queueWait',
    'search',
    'evidenceHydration',
    'validationHash',
  ],
  prepareSiyuanContextGatewayQuery: defaultFederatedQuery,
}));

import { createProductionContextGateway } from './productionContextGateway';

const result: ProductionContextGatewayQueryResult = {
  route: 'retrieval',
  promptBlock: 'Citation: [pointer-1]\nvalidated evidence',
  evidenceCount: 1,
  candidateCount: 7,
  hydratedCount: 1,
  childCalls: 1,
  maxDepth: 0,
  truncated: false,
  trace: [],
  retrievalStageTimingsMs: {
    siyuanReady: 2,
    queueWait: 0,
    search: 7,
    evidenceHydration: 5,
    validationHash: 1,
  },
  evidence: [
    {
      handle: 'pointer-1',
      sourceId: 'source-1',
      sourceRevision: 'source-v2',
      contentHash: `sha256:${'a'.repeat(64)}`,
      byteStart: '0',
      byteEnd: '10',
      text: 'evidence',
    },
  ],
};

const identity = {
  transportConnectionId: 'connection-1',
  transportAdapterId: 'opencode-persistent',
  upstreamProviderId: 'openai',
  upstreamModelId: 'gpt-5.6-luna',
  providerQualifiedModelId: 'openai/gpt-5.6-luna',
  authBillingRoute: 'subscription',
  effort: 'max',
  fastVariant: 'fast',
  catalogRevision: 'catalog-v1',
  observedProviderIdentity: 'openai',
} as const;

function gatewayRequest(requestId: string) {
  return {
    requestId,
    question: 'Use project context to find the prior decision.',
    scope: {
      accountId: 'account-1',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      worktreeId: 'worktree-1',
      revision: 'scope-v1',
    },
    executionIdentity: identity,
    taskKind: 'answer' as const,
    access: 'read' as const,
    workingSet: 'incomplete' as const,
    userIntent: { context: true },
    performance: 'quality' as const,
    optionalEnrichmentEnabled: false,
  };
}

describe('production Context Gateway adapter', () => {
  it('maps the shared focused policy to one caller-authoritative production query', async () => {
    const query = vi.fn(async () => result);
    const gateway = createProductionContextGateway({
      available: () => true,
      query,
      now: () => 100,
      createId: () => 'receipt-1',
    });
    const value = await gateway.prepareTurn(gatewayRequest('turn-1'));
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'account-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        worktreeId: 'worktree-1',
        requestedRoute: 'focused',
        settings: expect.objectContaining({ rlmEnabled: true, performance: 'quality' }),
      }),
    );
    expect(value.receipt).toMatchObject({
      receiptId: 'receipt-1',
      route: 'focused',
      sourceRevisions: [{ sourceId: 'source-1', revision: 'source-v2' }],
      evidenceHandles: ['pointer-1'],
      stageTimingsMs: expect.objectContaining({
        candidateCount: 7,
        hydratedCount: 1,
        siyuanReady: 2,
        queueWait: 0,
        search: 7,
        evidenceHydration: 5,
        validationHash: 1,
      }),
    });
  });

  it('uses the provider-free federated SiYuan query by default', async () => {
    defaultFederatedQuery.mockResolvedValueOnce(result);
    const gateway = createProductionContextGateway();

    const value = await gateway.prepareTurn(gatewayRequest('turn-default'));

    expect(defaultFederatedQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'account-1',
        projectId: 'project-1',
        requestedRoute: 'focused',
      }),
    );
    expect(value.receipt.evidenceHandles).toEqual(['pointer-1']);
  });

  it.each([
    ['non-finite', Number.NaN],
    ['negative', -1],
  ])('fails closed on a %s retrieval stage timing', async (_label, invalidTiming) => {
    const query = vi.fn(async () => ({
      ...result,
      retrievalStageTimingsMs: {
        ...result.retrievalStageTimingsMs,
        evidenceHydration: invalidTiming,
      },
    }));
    const gateway = createProductionContextGateway({
      available: () => true,
      query,
      now: () => 100,
      createId: () => 'receipt-invalid-timing',
    });

    await expect(gateway.prepareTurn(gatewayRequest(`turn-${_label}`))).rejects.toMatchObject({
      receipt: expect.objectContaining({ safeFailure: 'retrieval-failed' }),
    });
  });

  it('fails closed instead of copying an unknown timing field into the receipt', async () => {
    const query = vi.fn(async () => ({
      ...result,
      retrievalStageTimingsMs: {
        ...result.retrievalStageTimingsMs,
        rawProviderLatency: 99,
      },
    }));
    const gateway = createProductionContextGateway({
      available: () => true,
      query,
      now: () => 100,
      createId: () => 'receipt-unknown-timing',
    });

    await expect(gateway.prepareTurn(gatewayRequest('turn-unknown-timing'))).rejects.toMatchObject({
      receipt: expect.objectContaining({ safeFailure: 'retrieval-failed' }),
    });
  });

  it.each([
    ['fractional candidates', { candidateCount: 1.5 }],
    ['hydration beyond candidates', { candidateCount: 0, hydratedCount: 1 }],
    ['hydration/evidence mismatch', { hydratedCount: 2 }],
    ['reported evidence mismatch', { evidenceCount: 2 }],
  ])('fails closed on %s before issuing retrieval count truth', async (_label, override) => {
    const gateway = createProductionContextGateway({
      available: () => true,
      query: vi.fn(async () => ({ ...result, ...override })),
      now: () => 100,
      createId: () => `receipt-count-${_label}`,
    });

    await expect(gateway.prepareTurn(gatewayRequest(`turn-count-${_label}`))).rejects.toMatchObject(
      {
        receipt: expect.objectContaining({ safeFailure: 'retrieval-failed' }),
      },
    );
  });

  it('fails closed when one source ID claims conflicting hydrated revisions', async () => {
    const conflictingEvidence = {
      ...result.evidence[0]!,
      handle: 'pointer-2',
      sourceRevision: 'source-v3',
      contentHash: `sha256:${'b'.repeat(64)}`,
    };
    const gateway = createProductionContextGateway({
      available: () => true,
      query: vi.fn(async () => ({
        ...result,
        promptBlock: `${result.promptBlock}\nCitation: [pointer-2]`,
        evidenceCount: 2,
        hydratedCount: 2,
        evidence: [...result.evidence, conflictingEvidence],
      })),
      now: () => 100,
      createId: () => 'receipt-conflicting-revision',
    });

    await expect(
      gateway.prepareTurn(gatewayRequest('turn-conflicting-revision')),
    ).rejects.toMatchObject({
      receipt: expect.objectContaining({ safeFailure: 'stale-source' }),
    });
  });

  it('fails closed when a hydrated handle is absent from the grounded citation block', async () => {
    const gateway = createProductionContextGateway({
      available: () => true,
      query: vi.fn(async () => ({ ...result, promptBlock: 'validated but ungrounded evidence' })),
      now: () => 100,
      createId: () => 'receipt-ungrounded',
    });

    await expect(gateway.prepareTurn(gatewayRequest('turn-ungrounded'))).rejects.toMatchObject({
      receipt: expect.objectContaining({ safeFailure: 'retrieval-failed' }),
    });
  });

  it('fails closed when a focused retrieval reports a deep-route result', async () => {
    const gateway = createProductionContextGateway({
      available: () => true,
      query: vi.fn(async () => ({ ...result, route: 'rlm' as const })),
      now: () => 100,
      createId: () => 'receipt-route-mismatch',
    });

    await expect(gateway.prepareTurn(gatewayRequest('turn-route-mismatch'))).rejects.toMatchObject({
      receipt: expect.objectContaining({ safeFailure: 'retrieval-failed' }),
    });
  });
});
