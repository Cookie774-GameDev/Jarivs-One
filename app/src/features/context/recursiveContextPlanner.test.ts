import { describe, expect, it, vi } from 'vitest';
import { createCorpusScaleMetadata } from './corpusScale';
import {
  RecursiveContextError,
  createRecursiveContextPlanner,
  type RecursiveContextBudgets,
  type RecursiveContextEvidence,
} from './recursiveContextPlanner';

const corpus = createCorpusScaleMetadata({
  corpusId: 'corpus-100b',
  totalTokens: 100_000_000_000n,
  indexedTokens: 100_000_000_000n,
  chunkCount: 48_828_125n,
  shardCount: 100_000n,
  contentDigest: `sha256:${'a'.repeat(64)}`,
  generatedAt: 1_700_000_000_000,
});

const budgets: RecursiveContextBudgets = {
  maxIterations: 4,
  maxContextTokens: 1_000,
  maxItems: 10,
  maxQueriesPerIteration: 2,
  maxTotalQueries: 6,
};

function evidence(id: string, estimatedTokens = 100): RecursiveContextEvidence {
  return {
    id,
    exactExcerpt: `Evidence ${id}`,
    estimatedTokens,
    provenance: {
      sourceId: `source-${id}`,
      sourceRevision: 'revision-1',
      contentDigest: `sha256:${'b'.repeat(64)}`,
      indexedAt: 1_700_000_000_000,
      locator: `sparse://corpus-100b/${id}`,
    },
  };
}

describe('recursive context planner', () => {
  it('routes exact sparse boundary addresses deterministically with provenance', async () => {
    const positions = [
      999_999_999n,
      1_000_000_000n,
      10_000_000_000n,
      10_000_000_001n,
      9_007_199_254_740_993n,
    ];
    const retrieveRound = vi.fn(async ({ queries }: { queries: readonly string[] }) => {
      const position = BigInt(queries[0]!.slice('token:'.length));
      const shard = position / 1_000_000n;
      return {
        evidence: [evidence(`${shard.toString(10)}-${(position % 1_000_000n).toString(10)}`)],
        nextQueries: [],
        complete: true,
      };
    });
    const planner = createRecursiveContextPlanner({ retrieveRound });

    for (const position of positions) {
      const result = await planner.retrieve({
        query: `token:${position.toString(10)}`,
        corpus,
        budgets,
      });
      expect(result.status).toBe('complete');
      expect(result.evidence[0]?.provenance.locator).toContain('sparse://corpus-100b/');
      expect(result.contextTokens).toBe(100);
    }
  });

  it('detects a recursive query loop without issuing another retrieval', async () => {
    const retrieveRound = vi.fn().mockResolvedValue({
      evidence: [evidence('one')],
      nextQueries: ['  HOW   DOES context retrieval WORK? '],
      complete: false,
    });
    const result = await createRecursiveContextPlanner({ retrieveRound }).retrieve({
      query: 'How does context retrieval work?',
      corpus,
      budgets,
    });
    expect(result.stopReason).toBe('query_loop');
    expect(retrieveRound).toHaveBeenCalledTimes(1);
  });

  it('fails closed when a dependency exceeds the evidence budget', async () => {
    const planner = createRecursiveContextPlanner({
      retrieveRound: vi.fn(async () => ({
        evidence: [evidence('too-large', 1_001)],
        nextQueries: [],
        complete: true,
      })),
    });
    await expect(planner.retrieve({ query: 'start', corpus, budgets })).rejects.toThrowError(
      'recursive_context_error:dependency_exceeded_context_budget',
    );
  });

  it('cancels during retrieval and never returns partial success', async () => {
    const controller = new AbortController();
    const retrieveRound = vi.fn(() => new Promise<never>(() => undefined));
    const pending = createRecursiveContextPlanner({ retrieveRound }).retrieve({
      query: 'start',
      corpus,
      budgets,
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('fails closed on unsupported budgets', async () => {
    const planner = createRecursiveContextPlanner({
      retrieveRound: vi.fn(async () => ({ evidence: [], nextQueries: [], complete: true })),
    });
    await expect(
      planner.retrieve({
        query: 'start',
        corpus,
        budgets: { ...budgets, maxContextTokens: 32_769 },
      }),
    ).rejects.toBeInstanceOf(RecursiveContextError);
  });
});
