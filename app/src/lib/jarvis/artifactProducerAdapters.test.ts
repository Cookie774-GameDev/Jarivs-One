import { describe, expect, it, vi } from 'vitest';
import type { JarvisArtifactDraft, JarvisArtifactV1 } from './contracts/execution';
import * as producerModule from './artifactProducerAdapters';
import {
  createJarvisBoundArtifactPipelineIssuerInternal,
  type CanonicalArtifactEvidence,
  type CanonicalArtifactEvidenceAdapter,
  type CanonicalArtifactEvidenceAuthorities,
  type CanonicalFileActionEvidence,
  type CanonicalMcpEvidence,
  type CanonicalPluginEvidence,
  type CanonicalProviderEvidence,
  type CanonicalScheduleEvidence,
  type CanonicalTerminalEvidence,
} from './artifactProducerAdapters';

const NOW = 1_786_201_000_000;

function draft(state: 'ready' | 'partial' = 'ready'): JarvisArtifactDraft {
  return {
    artifact: {
      kind: 'text',
      title: 'Canonical producer output',
      mimeType: 'text/plain',
      safeSummary: 'A synthetic canonical producer output.',
      sourceRefs: [],
      createdAt: NOW,
      ...(state === 'partial' ? { state } : {}),
    },
    backing: { kind: 'producer_result', content: 'verified bytes' },
  };
}

const provider = Object.freeze({
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

const fileAction = Object.freeze({
  producerId: 'file_action_result',
  accountId: 'account-alpha',
  runId: 'run-alpha',
  requestId: 'request-alpha',
  attemptNumber: 1,
  resultRef: 'file-result-alpha',
  state: 'succeeded',
  verifiedAt: NOW,
  actionId: 'files.create',
  actionVersion: 1,
}) satisfies CanonicalFileActionEvidence;

const terminal = Object.freeze({
  producerId: 'terminal_exit',
  accountId: 'account-alpha',
  runId: 'run-alpha',
  requestId: 'request-alpha',
  attemptNumber: 1,
  resultRef: 'terminal-result-alpha',
  state: 'exited',
  verifiedAt: NOW,
  sessionId: 'session-alpha',
  executionId: 'jterm_alpha',
}) satisfies CanonicalTerminalEvidence;

const plugin = Object.freeze({
  producerId: 'plugin_result',
  accountId: 'account-alpha',
  runId: 'run-alpha',
  requestId: 'request-alpha',
  attemptNumber: 1,
  resultRef: 'plugin-result-alpha',
  state: 'succeeded',
  verifiedAt: NOW,
  pluginId: 'mock-connector',
  invocationId: 'plugin-invocation-alpha',
}) satisfies CanonicalPluginEvidence;

const mcp = Object.freeze({
  producerId: 'mcp_result',
  accountId: 'account-alpha',
  runId: 'run-alpha',
  requestId: 'request-alpha',
  attemptNumber: 1,
  resultRef: 'mcp-result-alpha',
  state: 'succeeded',
  verifiedAt: NOW,
  serverId: 'server-alpha',
  toolName: 'tool-alpha',
  invocationId: 'mcp-invocation-alpha',
}) satisfies CanonicalMcpEvidence;

const schedule = Object.freeze({
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
}) satisfies CanonicalScheduleEvidence;

function artifactFor(resultRef: string): JarvisArtifactV1 {
  return Object.freeze({
    schemaVersion: 1,
    id: `jart_${resultRef}`,
    runId: 'run-alpha',
    requestId: 'request-alpha',
    attemptNumber: 1,
    state: 'ready',
    kind: 'text',
    title: 'Canonical producer output',
    sourceRefs: [],
    createdAt: NOW,
  });
}

function authorities(
  overrides: Partial<CanonicalArtifactEvidenceAuthorities> = {},
): CanonicalArtifactEvidenceAuthorities {
  return Object.freeze({
    provider: Object.freeze({
      state: 'ready',
      producerId: 'provider_response',
      authority: Object.freeze({ verify: vi.fn(async (evidence) => evidence) }),
    }),
    fileAction: Object.freeze({
      state: 'ready',
      producerId: 'file_action_result',
      authority: Object.freeze({ verify: vi.fn(async (evidence) => evidence) }),
    }),
    terminal: Object.freeze({
      state: 'ready',
      producerId: 'terminal_exit',
      authority: Object.freeze({ verify: vi.fn(async (evidence) => evidence) }),
    }),
    plugin: Object.freeze({
      state: 'ready',
      producerId: 'plugin_result',
      authority: Object.freeze({ verify: vi.fn(async (evidence) => evidence) }),
    }),
    mcp: Object.freeze({
      state: 'ready',
      producerId: 'mcp_result',
      authority: Object.freeze({ verify: vi.fn(async (evidence) => evidence) }),
    }),
    schedule: Object.freeze({
      state: 'unavailable',
      producerId: 'schedule_result',
      reason: 'producer_task_not_landed',
    }),
    ...overrides,
  });
}

describe('named canonical artifact producer adapters', () => {
  function harness(overrides: Partial<CanonicalArtifactEvidenceAuthorities> = {}) {
    const events: string[] = [];
    const materializeVerified = vi.fn(async ({ binding }) => {
      events.push(`materialize:${binding.producerId}`);
      return artifactFor(binding.resultRef);
    });
    const claim = vi.fn(async (input) => {
      events.push(`claim:${input.ownerKind}`);
      return { applied: true, kind: 'not_applicable', run: {} } as never;
    });
    const issue = createJarvisBoundArtifactPipelineIssuerInternal({
      authorities: authorities(overrides),
      materializeVerified,
      now: () => NOW + 1,
    });
    return { pipeline: issue({ claim }), claim, materializeVerified, events };
  }

  it('exports only the named internal issuer and no generic receipt or executor escape hatch', () => {
    expect(Object.keys(producerModule).sort()).toEqual([
      'createJarvisBoundArtifactPipelineIssuerInternal',
    ]);
    expect(producerModule).not.toHaveProperty('issueReceipt');
    expect(producerModule).not.toHaveProperty('normalize');
    expect(producerModule).not.toHaveProperty('materializeByExecutor');
  });

  it.each([
    ['provider', provider],
    ['fileAction', fileAction],
    ['terminal', terminal],
    ['plugin', plugin],
    ['mcp', mcp],
  ] as const)(
    'accepts exact %s terminal evidence and claims before materialization',
    async (key, evidence) => {
      const test = harness();
      const adapter = test.pipeline[
        key
      ] as CanonicalArtifactEvidenceAdapter<CanonicalArtifactEvidence>;
      await expect(adapter.materialize({ evidence, draft: draft() })).resolves.toMatchObject({
        id: `jart_${evidence.resultRef}`,
      });
      expect(test.claim).toHaveBeenCalledWith({
        accountId: 'account-alpha',
        runId: 'run-alpha',
        requestId: 'request-alpha',
        attemptNumber: 1,
        ownerKind: 'artifact',
        ownerId: `artifact:${evidence.producerId}:${evidence.resultRef}`,
        evidenceRef: evidence.resultRef,
        claimedAt: NOW + 1,
      });
      expect(test.events).toEqual(['claim:artifact', `materialize:${evidence.producerId}`]);
      expect(test.materializeVerified).toHaveBeenCalledOnce();
    },
  );

  it('accepts real partial evidence only with a partial draft', async () => {
    const partial = Object.freeze({ ...provider, state: 'partial' as const });
    const test = harness();
    await expect(
      test.pipeline.provider.materialize({ evidence: partial, draft: draft('partial') }),
    ).resolves.toBeDefined();
    await expect(
      test.pipeline.provider.materialize({ evidence: partial, draft: draft() }),
    ).rejects.toThrow('artifact_evidence_state_mismatch');
  });

  it('rejects authority mismatch, cross-producer evidence, and invalid timestamps before claiming', async () => {
    const changed = Object.freeze({ ...provider, resultRef: 'provider-result-beta' });
    const providerSlot = Object.freeze({
      state: 'ready' as const,
      producerId: 'provider_response' as const,
      authority: Object.freeze({ verify: vi.fn(async () => changed) }),
    });
    const test = harness({ provider: providerSlot });
    await expect(
      test.pipeline.provider.materialize({ evidence: provider, draft: draft() }),
    ).rejects.toThrow('artifact_evidence_verification_failed');
    await expect(
      test.pipeline.provider.materialize({ evidence: fileAction as never, draft: draft() }),
    ).rejects.toThrow('artifact_evidence_invalid');
    await expect(
      test.pipeline.provider.materialize({
        evidence: Object.freeze({ ...provider, verifiedAt: Number.NaN }),
        draft: draft(),
      }),
    ).rejects.toThrow('artifact_evidence_invalid');
    expect(test.claim).not.toHaveBeenCalled();
    expect(test.materializeVerified).not.toHaveBeenCalled();
  });

  it.each([
    ['provider', provider],
    ['fileAction', fileAction],
    ['terminal', terminal],
    ['plugin', plugin],
    ['mcp', mcp],
  ] as const)(
    'rejects cross-scope, reused, non-result, and invalid numeric %s evidence before claiming',
    async (key, evidence) => {
      const exactSlot = Object.freeze({
        state: 'ready' as const,
        producerId: evidence.producerId,
        authority: Object.freeze({ verify: vi.fn(async () => evidence) }),
      });
      const test = harness({ [key]: exactSlot } as never);
      const adapter = test.pipeline[
        key
      ] as CanonicalArtifactEvidenceAdapter<CanonicalArtifactEvidence>;

      for (const patch of [
        { accountId: 'account-other' },
        { runId: 'run-other' },
        { requestId: 'request-other' },
        { attemptNumber: 2 },
        { resultRef: `${evidence.resultRef}-reused` },
      ]) {
        await expect(
          adapter.materialize({
            evidence: Object.freeze({ ...evidence, ...patch }) as CanonicalArtifactEvidence,
            draft: draft(),
          }),
        ).rejects.toThrow('artifact_evidence_verification_failed');
      }

      for (const resultRef of [
        'pending',
        'queued-result',
        'proposed-result',
        'availability-only',
      ]) {
        await expect(
          adapter.materialize({
            evidence: Object.freeze({ ...evidence, resultRef }) as CanonicalArtifactEvidence,
            draft: draft(),
          }),
        ).rejects.toThrow('artifact_evidence_invalid');
      }
      await expect(
        adapter.materialize({
          evidence: Object.freeze({
            ...evidence,
            producerId: 'schedule_result',
          }) as unknown as CanonicalArtifactEvidence,
          draft: draft(),
        }),
      ).rejects.toThrow('artifact_evidence_invalid');
      await expect(
        adapter.materialize({
          evidence: Object.freeze({
            ...evidence,
            verifiedAt: Number.NaN,
          }) as CanonicalArtifactEvidence,
          draft: draft(),
        }),
      ).rejects.toThrow('artifact_evidence_invalid');
      expect(test.claim).not.toHaveBeenCalled();
      expect(test.materializeVerified).not.toHaveBeenCalled();
    },
  );

  it('rejects queued, planned, availability, accessor, and secret-shaped evidence before claiming', async () => {
    const test = harness();
    for (const resultRef of [
      'queued',
      'planned-result',
      'availability-only',
      'password=hunter2-real-value',
    ]) {
      await expect(
        test.pipeline.provider.materialize({
          evidence: Object.freeze({ ...provider, resultRef }),
          draft: draft(),
        }),
      ).rejects.toThrow('artifact_evidence_invalid');
    }
    const getter = vi.fn(() => 'provider-result-alpha');
    const forged = { ...provider } as Record<string, unknown>;
    Object.defineProperty(forged, 'resultRef', { enumerable: true, get: getter });
    Object.freeze(forged);
    await expect(
      test.pipeline.provider.materialize({ evidence: forged as never, draft: draft() }),
    ).rejects.toThrow('artifact_evidence_invalid');
    expect(getter).not.toHaveBeenCalled();
    expect(test.claim).not.toHaveBeenCalled();
  });

  it('rejects an unavailable schedule before authority, claim, or materialization', async () => {
    const test = harness();
    await expect(
      test.pipeline.schedule.materialize({ evidence: schedule, draft: draft() }),
    ).rejects.toThrow('artifact_producer_unavailable');
    expect(test.claim).not.toHaveBeenCalled();
    expect(test.materializeVerified).not.toHaveBeenCalled();
  });

  it('rejects a failed effect claim before materialization', async () => {
    const materializeVerified = vi.fn();
    const claim = vi.fn(
      async () => ({ applied: false, reason: 'attempt_sealed', current: {} }) as never,
    );
    const pipeline = createJarvisBoundArtifactPipelineIssuerInternal({
      authorities: authorities(),
      materializeVerified,
      now: () => NOW,
    })({ claim });
    await expect(
      pipeline.provider.materialize({ evidence: provider, draft: draft() }),
    ).rejects.toThrow('artifact_effect_claim_rejected');
    expect(materializeVerified).not.toHaveBeenCalled();
  });

  it('lets a winning seal reject a pending artifact race before receipt materialization', async () => {
    let settleClaim!: (value: unknown) => void;
    const claim = vi.fn(
      () =>
        new Promise((resolve) => {
          settleClaim = resolve;
        }) as never,
    );
    const materializeVerified = vi.fn();
    const pipeline = createJarvisBoundArtifactPipelineIssuerInternal({
      authorities: authorities(),
      materializeVerified,
      now: () => NOW,
    })({ claim });

    const pending = pipeline.provider.materialize({ evidence: provider, draft: draft() });
    await vi.waitFor(() => expect(claim).toHaveBeenCalledOnce());
    expect(materializeVerified).not.toHaveBeenCalled();
    settleClaim({ applied: false, reason: 'attempt_sealed', current: {} });
    await expect(pending).rejects.toThrow('artifact_effect_claim_rejected');
    expect(materializeVerified).not.toHaveBeenCalled();
  });
});
