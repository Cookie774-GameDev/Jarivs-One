import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { JarvisArtifactDraft, JarvisArtifactV1 } from './contracts/execution';
import type {
  CanonicalArtifactEvidenceAuthorities,
  CanonicalProviderEvidence,
} from './artifactProducerAdapters';
import { createJarvisArtifactKernelComposition } from './artifactRuntime';

const NOW = 1_786_201_100_000;

const evidence = Object.freeze({
  producerId: 'provider_response',
  accountId: 'account-alpha',
  runId: 'run-alpha',
  requestId: 'request-alpha',
  attemptNumber: 1,
  resultRef: 'provider-result-alpha',
  state: 'completed',
  verifiedAt: NOW,
  providerId: 'provider-alpha',
  modelId: 'model-alpha',
  modelSnapshotRef: 'model-snapshot-alpha',
}) satisfies CanonicalProviderEvidence;

function draft(content = 'verified provider bytes'): JarvisArtifactDraft {
  return {
    artifact: {
      kind: 'provider_result',
      title: 'Verified provider output',
      mimeType: 'text/plain',
      safeSummary: 'A synthetic provider output.',
      sourceRefs: [],
      createdAt: NOW,
    },
    backing: { kind: 'producer_result', content },
  };
}

function authorities(): CanonicalArtifactEvidenceAuthorities {
  const ready = <P extends string, E>(producerId: P) =>
    Object.freeze({
      state: 'ready' as const,
      producerId,
      authority: Object.freeze({ verify: vi.fn(async (value: E) => value) }),
    });
  return Object.freeze({
    provider: ready<'provider_response', CanonicalProviderEvidence>('provider_response'),
    fileAction: ready('file_action_result'),
    terminal: ready('terminal_exit'),
    plugin: ready('plugin_result'),
    mcp: ready('mcp_result'),
    schedule: Object.freeze({
      state: 'unavailable',
      producerId: 'schedule_result',
      reason: 'producer_task_not_landed',
    }),
  }) as CanonicalArtifactEvidenceAuthorities;
}

describe('Jarvis artifact kernel composition', () => {
  it('returns exactly one bound issuer and already-bound commit capability', async () => {
    let consume!: (input: {
      accountId: string;
      runId: string;
      requestId: string;
      attemptNumber: number;
      artifacts: readonly JarvisArtifactV1[];
    }) => void;
    const commitKernelTurn = Object.freeze({ commit: vi.fn() });
    const bindKernelCommit = vi.fn(({ consumeArtifactsForCommit }) => {
      consume = consumeArtifactsForCommit;
      return commitKernelTurn;
    });
    let uuid = 0;
    const composition = createJarvisArtifactKernelComposition({
      randomUUID: () => `runtime-${++uuid}`,
      now: () => NOW,
      authorities: authorities(),
      bindKernelCommit,
    });

    expect(Object.keys(composition).sort()).toEqual([
      'commitKernelTurn',
      'issueBoundArtifactPipeline',
    ]);
    expect(composition.commitKernelTurn).toBe(commitKernelTurn);
    expect(bindKernelCommit).toHaveBeenCalledOnce();
    expect(composition).not.toHaveProperty('consumeArtifactsForCommit');

    const claim = vi.fn(async () => ({ applied: true, kind: 'not_applicable', run: {} }) as never);
    const pipeline = composition.issueBoundArtifactPipeline({ claim });
    const artifact = await pipeline.provider.materialize({ evidence, draft: draft() });
    expect(artifact.id).toBe('jart_runtime-1');
    expect(claim).toHaveBeenCalledOnce();
    expect(() =>
      consume({
        accountId: evidence.accountId,
        runId: evidence.runId,
        requestId: evidence.requestId,
        attemptNumber: evidence.attemptNumber,
        artifacts: [artifact],
      }),
    ).not.toThrow();
    expect(() =>
      consume({
        accountId: evidence.accountId,
        runId: evidence.runId,
        requestId: evidence.requestId,
        attemptNumber: evidence.attemptNumber,
        artifacts: [artifact],
      }),
    ).toThrow('artifact_commit_not_pending');
  });

  it('consumes rollback identities and requires fresh verification plus a fresh receipt', async () => {
    let consume!: (input: {
      accountId: string;
      runId: string;
      requestId: string;
      attemptNumber: number;
      artifacts: readonly JarvisArtifactV1[];
    }) => void;
    let uuid = 0;
    const composition = createJarvisArtifactKernelComposition({
      randomUUID: () => `retry-${++uuid}`,
      now: () => NOW,
      authorities: authorities(),
      bindKernelCommit: ({ consumeArtifactsForCommit }) => {
        consume = consumeArtifactsForCommit;
        return Object.freeze({});
      },
    });
    const pipeline = composition.issueBoundArtifactPipeline({
      claim: vi.fn(async () => ({ applied: true, kind: 'not_applicable', run: {} }) as never),
    });
    const first = await pipeline.provider.materialize({ evidence, draft: draft() });
    const scope = {
      accountId: evidence.accountId,
      runId: evidence.runId,
      requestId: evidence.requestId,
      attemptNumber: evidence.attemptNumber,
    };
    consume({ ...scope, artifacts: [first] });
    expect(() => consume({ ...scope, artifacts: [first] })).toThrow('artifact_commit_not_pending');

    const second = await pipeline.provider.materialize({ evidence, draft: draft() });
    expect(second.id).not.toBe(first.id);
    expect(second.contentHash).toBe(first.contentHash);
    expect(uuid).toBe(4);
    expect(() => consume({ ...scope, artifacts: [second] })).not.toThrow();
  });

  it('fails an unavailable schedule and a sealed barrier before minting any artifact identity', async () => {
    const randomUUID = vi.fn(() => 'must-not-mint');
    const composition = createJarvisArtifactKernelComposition({
      randomUUID,
      now: () => NOW,
      authorities: authorities(),
      bindKernelCommit: () => Object.freeze({}),
    });
    const rejectedClaim = vi.fn(
      async () => ({ applied: false, reason: 'attempt_sealed', current: {} }) as never,
    );
    const pipeline = composition.issueBoundArtifactPipeline({ claim: rejectedClaim });
    await expect(
      pipeline.schedule.materialize({
        evidence: Object.freeze({
          producerId: 'schedule_result',
          accountId: 'account-alpha',
          runId: 'run-alpha',
          requestId: 'request-alpha',
          attemptNumber: 1,
          resultRef: 'schedule-result-alpha',
          state: 'completed',
          verifiedAt: NOW,
          scheduleId: 'schedule-alpha',
          occurrenceId: 'occurrence-alpha',
        }),
        draft: draft(),
      }),
    ).rejects.toThrow('artifact_producer_unavailable');
    await expect(pipeline.provider.materialize({ evidence, draft: draft() })).rejects.toThrow(
      'artifact_effect_claim_rejected',
    );
    expect(randomUUID).not.toHaveBeenCalled();
  });

  it('is the sole production importer of the Task 20A runtime internals', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/lib/jarvis/artifactRuntime.ts'),
      'utf8',
    );
    expect(source).toContain('createJarvisArtifactRuntimeInternals');
    expect(source).not.toContain('artifactReceipts');
    expect(source).not.toContain('artifactNormalizer');
  });
});
