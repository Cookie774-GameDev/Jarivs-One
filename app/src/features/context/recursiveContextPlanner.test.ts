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
      locator: `app/${id}.ts:1`,
    },
  };
}

describe('recursive context planner', () => {
  it('recursively converges while retaining bounded evidence and provenance', async () => {
    const retrieveRound = vi
      .fn()
      .mockResolvedValueOnce({
        evidence: [evidence('architecture')],
        nextQueries: ['Where is the implementation?'],
        complete: false,
      })
      .mockResolvedValueOnce({
        evidence: [evidence('implementation')],
        nextQueries: [],
        complete: true,
      });
    const result = await createRecursiveContextPlanner({ retrieveRound }).retrieve({
      query: 'How does context retrieval work?',
      corpus,
      budgets,
    });

    expect(result).toMatchObject({
      status: 'complete',
      stopReason: 'complete',
      iterations: 2,
      queriesIssued: 2,
      contextTokens: 200,
      fullyIndexed: true,
    });
    expect(result.evidence.map(({ id }) => id)).toEqual(['architecture', 'implementation']);
    expect(result.evidence[1]?.provenance.sourceRevision).toBe('revision-1');
    expect(retrieveRound.mock.calls[1]?.[0].excludedEvidenceIds).toEqual(['architecture']);
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
    expect(result.status).toBe('incomplete');
    expect(retrieveRound).toHaveBeenCalledTimes(1);
  });

  it('stops deterministically at the iteration limit', async () => {
    const retrieveRound = vi.fn(async ({ iteration }: { iteration: number }) => ({
      evidence: [evidence(`evidence-${iteration}`, 10)],
      nextQueries: [`follow-up-${iteration}`],
      complete: false,
    }));
    const result = await createRecursiveContextPlanner({ retrieveRound }).retrieve({
      query: 'start',
      corpus,
      budgets: { ...budgets, maxIterations: 2 },
    });
    expect(result).toMatchObject({ stopReason: 'iteration_limit', iterations: 2 });
    expect(retrieveRound).toHaveBeenCalledTimes(2);
  });

  it('rejects dependency output that exceeds the bounded prompt budget', async () => {
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

  it('cancels before invoking dependencies and never returns partial success', async () => {
    const controller = new AbortController();
    controller.abort();
    const retrieveRound = vi.fn();
    await expect(
      createRecursiveContextPlanner({ retrieveRound }).retrieve({
        query: 'start',
        corpus,
        budgets,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(retrieveRound).not.toHaveBeenCalled();
  });

  it('stops promptly when cancellation happens during a retrieval round', async () => {
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
    expect(retrieveRound).toHaveBeenCalledTimes(1);
  });

  it('fails closed on invalid budgets or unsupported dependency claims', async () => {
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
    await expect(planner.retrieve({ query: 'start', corpus, budgets })).rejects.toThrowError(
      'recursive_context_error:complete_without_evidence',
    );
  });
});
