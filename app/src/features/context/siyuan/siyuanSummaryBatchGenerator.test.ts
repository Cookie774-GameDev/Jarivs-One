import { beforeEach, describe, expect, it, vi } from 'vitest';
const routerMocks = vi.hoisted(() => ({ runAgent: vi.fn() }));
vi.mock('@/lib/ai/router', () => ({ runAgent: routerMocks.runAgent }));
import { planSiyuanSummaryBatches, type SiyuanPreparedSummary } from './siyuanSummaryBatch';
import { generateSiyuanSummaryBatch } from './siyuanSummaryBatchGenerator';

function mockRunAgentResponse(
  response: Record<string, unknown> & { provider: string; model: string },
  usage: Record<string, unknown> = {},
): void {
  routerMocks.runAgent.mockImplementationOnce(async (request) => {
    await request.onProviderCompletionEvidence?.({
      observedAt: Date.now(),
      requestId: request.requestId,
      sessionId: 'session-summary-1',
      providerId: response.provider,
      connectionId: request.connectionId,
      modelId: response.model,
      reasoningEffort: request.provider_options?.reasoning_effort ?? null,
      usage: { capturedAt: Date.now(), ...usage },
      finishReason: typeof response.finish_reason === 'string' ? response.finish_reason : undefined,
    });
    return response;
  });
}

function file(nodeId: string): SiyuanPreparedSummary {
  const content = `export const ${nodeId} = true;`;
  return {
    entry: {
      nodeId,
      parentNodeId: null,
      title: `${nodeId}.ts`,
      kind: 'file',
      relativePath: `src/${nodeId}.ts`,
      sourcePointer: `C:/repo/src/${nodeId}.ts`,
      summary: null,
      sizeBytes: content.length,
      modifiedAt: 1,
    },
    content,
    contentBytes: content.length,
  };
}

describe('SiYuan batch summary generation', () => {
  beforeEach(() => routerMocks.runAgent.mockReset());
  const batch = planSiyuanSummaryBatches([file('one'), file('two')])[0]!;
  const identity = {
    providerId: 'opencode',
    connectionId: 'opencode-cli',
    modelId: 'opencode-go/deepseek-v4-flash-vision-exp',
    effort: 'high' as const,
  };
  const scope = {
    accountId: 'account-1',
    workspaceId: 'workspace-1',
    projectId: 'project-1',
    workingDirectory: 'C:/repo',
  };

  it('dispatches one exact-route request for a complete batch', async () => {
    mockRunAgentResponse(
      {
        text: JSON.stringify({
          summaries: [
            { nodeId: 'one', summary: 'One.' },
            { nodeId: 'two', summary: 'Two.' },
          ],
        }),
        provider: identity.providerId,
        model: identity.modelId,
        usage: { input_tokens: 100, output_tokens: 20, cost_usd: 0.01 },
        finish_reason: 'stop',
      },
      {
        inputTokens: { value: 100, provenance: 'provider-reported' },
        outputTokens: { value: 20, provenance: 'provider-reported' },
        cacheReadTokens: { value: 30, provenance: 'provider-reported' },
        cacheWriteTokens: { value: 4, provenance: 'provider-reported' },
        costUsd: { value: 0.01, provenance: 'provider-reported' },
      },
    );
    const onDispatchStarted = vi.fn(async (_at: number) => undefined);
    const result = await generateSiyuanSummaryBatch({
      batch,
      identity,
      scope,
      onDispatchStarted,
    });
    expect(onDispatchStarted).toHaveBeenCalledTimes(1);
    expect(onDispatchStarted).toHaveBeenCalledWith(expect.any(Number));
    expect(routerMocks.runAgent).toHaveBeenCalledTimes(1);
    expect(routerMocks.runAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: 'opencode-cli',
        requestId: expect.any(String),
        provider_options: { reasoning_effort: 'high' },
        runtimeSettings: {
          effort: 'high',
          fastMode: 'auto',
          performance: 'quality',
          rlmEnabled: false,
        },
        tools: {},
      }),
    );
    expect(result).toMatchObject({
      identity,
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
      costUsd: 0.01,
      tokenProvenance: 'reported',
      cacheReadTokens: 30,
      cacheWriteTokens: 4,
      cacheProvenance: 'reported',
      costProvenance: 'reported',
      sessionId: 'session-summary-1',
      finishReason: 'stop',
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(onDispatchStarted.mock.calls[0]?.[0]).toBe(result.dispatchedAt);
  });

  it('rejects provider substitution and incomplete results', async () => {
    mockRunAgentResponse({
      text: '{"summaries":[]}',
      provider: 'other',
      model: identity.modelId,
      usage: { input_tokens: 1, output_tokens: 1, cost_usd: 0 },
    });
    await expect(generateSiyuanSummaryBatch({ batch, identity, scope })).rejects.toThrow(
      'siyuan_summary_model_identity_mismatch',
    );

    mockRunAgentResponse({
      text: JSON.stringify({ summaries: [{ nodeId: 'one', summary: 'Only one.' }] }),
      provider: identity.providerId,
      model: identity.modelId,
      usage: { input_tokens: 1, output_tokens: 1, cost_usd: 0 },
    });
    await expect(generateSiyuanSummaryBatch({ batch, identity, scope })).rejects.toThrow(
      'siyuan_summary_batch_missing_node',
    );
  });

  it('supports the explicitly selected Luna xhigh route without changing identity', async () => {
    const luna = {
      providerId: 'opencode',
      connectionId: 'opencode-cli',
      modelId: 'openai/gpt-5.6-luna',
      // VibeSpace persists `ultra`; OpenCode receives its exact `xhigh` wire value.
      effort: 'ultra' as const,
    };
    mockRunAgentResponse({
      text: JSON.stringify({
        summaries: [
          { nodeId: 'one', summary: 'One.' },
          { nodeId: 'two', summary: 'Two.' },
        ],
      }),
      provider: luna.providerId,
      model: luna.modelId,
      usage: { input_tokens: 10, output_tokens: 4, cost_usd: 0 },
    });
    const result = await generateSiyuanSummaryBatch({ batch, identity: luna, scope });
    expect(result.identity).toEqual(luna);
    expect(routerMocks.runAgent).toHaveBeenCalledWith(
      expect.objectContaining({ provider_options: { reasoning_effort: 'xhigh' } }),
    );
  });

  it.each([
    { input_tokens: Number.NaN, output_tokens: 1, cost_usd: 0 },
    { input_tokens: -1, output_tokens: 1, cost_usd: 0 },
    { input_tokens: 1, output_tokens: Number.POSITIVE_INFINITY, cost_usd: 0 },
  ])(
    'uses an honest local estimate when collapsed usage lacks provider evidence',
    async (usage) => {
      mockRunAgentResponse({
        text: JSON.stringify({
          summaries: [
            { nodeId: 'one', summary: 'One.' },
            { nodeId: 'two', summary: 'Two.' },
          ],
        }),
        provider: identity.providerId,
        model: identity.modelId,
        usage,
      });
      await expect(generateSiyuanSummaryBatch({ batch, identity, scope })).resolves.toMatchObject({
        tokenProvenance: 'estimated',
        costUsd: null,
        costProvenance: 'unavailable',
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        cacheProvenance: 'unavailable',
      });
    },
  );
});
