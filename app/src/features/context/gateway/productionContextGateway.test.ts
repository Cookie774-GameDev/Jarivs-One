import { describe, expect, it, vi } from 'vitest';
import type { ProductionRlmContextResult } from '@/features/context/rlm/contextRlmProduction';
import { createProductionContextGateway } from './productionContextGateway';

const result: ProductionRlmContextResult = {
  route: 'retrieval',
  promptBlock: 'validated evidence',
  evidenceCount: 1,
  candidateCount: 7,
  hydratedCount: 5,
  childCalls: 1,
  maxDepth: 0,
  truncated: false,
  trace: [],
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

describe('production Context Gateway adapter', () => {
  it('maps the shared focused policy to one caller-authoritative production query', async () => {
    const query = vi.fn(async () => result);
    const gateway = createProductionContextGateway({
      available: () => true,
      query,
      now: () => 100,
      createId: () => 'receipt-1',
    });
    const value = await gateway.prepareTurn({
      requestId: 'turn-1',
      question: 'Use project context to find the prior decision.',
      scope: {
        accountId: 'account-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        worktreeId: 'worktree-1',
        revision: 'scope-v1',
      },
      executionIdentity: identity,
      taskKind: 'answer',
      access: 'read',
      workingSet: 'incomplete',
      userIntent: { context: true },
      performance: 'quality',
      optionalEnrichmentEnabled: false,
    });
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
      stageTimingsMs: expect.objectContaining({ candidateCount: 7, hydratedCount: 5 }),
    });
  });
});
