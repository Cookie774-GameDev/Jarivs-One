import { describe, expect, it, vi } from 'vitest';
import type {
  JarvisDurableLiveEvidenceV1,
  JarvisEvent,
  JarvisLiveEvidenceProof,
} from '@/lib/jarvis/contracts/execution';
import { createJarvisLiveEvidenceRegistry } from './liveEvidenceRegistry';

const providerIdentity = {
  producerKind: 'provider' as const,
  providerId: 'provider-1',
  modelId: 'model-1',
  modelSnapshotRef: 'model-snapshot-1',
};

function evidence(
  overrides: Partial<JarvisDurableLiveEvidenceV1> = {},
): JarvisDurableLiveEvidenceV1 {
  return {
    schemaVersion: 1,
    kind: 'model',
    accountId: 'account-1',
    runId: 'run-1',
    requestId: 'request-1',
    attemptNumber: 1,
    registrationId: 'registration-1',
    producerKind: 'provider',
    producerIdentity: providerIdentity,
    transition: 'started',
    operations: ['generate'],
    resultRef: 'result-1',
    resultEventSeq: 1,
    observedAt: 10,
    providerId: 'provider-1',
    modelId: 'model-1',
    modelSnapshotRef: 'model-snapshot-1',
    ...overrides,
  } as JarvisDurableLiveEvidenceV1;
}

function event(seq: number, value: JarvisDurableLiveEvidenceV1): JarvisEvent {
  return {
    runId: value.runId,
    seq,
    idempotencyKey: `live-${seq}`,
    type: value.kind === 'model' ? 'model' : 'tool',
    status: value.transition,
    title: value.kind === 'model' ? 'Model evidence' : 'Capability evidence',
    safeSummary: 'Canonical live evidence.',
    sourceRefs: [],
    artifactIds: [],
    createdAt: value.observedAt,
    liveEvidence: value,
  };
}

function proof(
  seq: number,
  value: JarvisDurableLiveEvidenceV1,
  proofRef: `jlive_${string}` = `jlive_${seq}`,
): JarvisLiveEvidenceProof {
  return {
    proofRef,
    accountId: value.accountId,
    runId: value.runId,
    requestId: value.requestId,
    attemptNumber: value.attemptNumber,
    registrationId: value.registrationId,
    producerKind: value.producerKind,
    resultRef: value.resultRef,
    resultEventSeq: value.resultEventSeq,
    transition: value.transition,
    eventSeq: seq,
  } as JarvisLiveEvidenceProof;
}

describe('Jarvis live-evidence registry', () => {
  it('publishes only a proof bound to the exact canonical row and returns detached snapshots', () => {
    const registry = createJarvisLiveEvidenceRegistry({ now: () => 20, maxCompletedPerRun: 2 });
    const value = evidence();

    registry.applyVerified(proof(2, value), event(2, value));

    const first = registry.snapshot('account-1', 'run-1');
    expect(first).toEqual({
      schemaVersion: 1,
      accountId: 'account-1',
      runId: 'run-1',
      capturedAt: 20,
      nodes: [
        {
          kind: 'model',
          id: 'model:registration-1',
          accountId: 'account-1',
          runId: 'run-1',
          state: 'active',
          operations: ['generate'],
          evidenceRef: 'jlive_2',
          verifiedAt: 10,
          providerId: 'provider-1',
          modelId: 'model-1',
          modelSnapshotRef: 'model-snapshot-1',
        },
      ],
    });
    expect(registry.snapshot('account-1', 'run-1')).not.toBe(first);
    expect(registry.snapshot('account-1', 'run-1')?.nodes).not.toBe(first?.nodes);

    const changed = evidence({ resultRef: 'changed-result' });
    expect(() => registry.applyVerified(proof(2, value), event(2, changed))).toThrow(
      'live_evidence_row_mismatch',
    );
    expect(registry.snapshot('account-1', 'run-1')).toEqual(first);
  });

  it('requires an exact previous proof and replaces a registration with terminal evidence', () => {
    const registry = createJarvisLiveEvidenceRegistry({ now: () => 30, maxCompletedPerRun: 2 });
    const started = evidence();
    registry.applyVerified(proof(2, started), event(2, started));

    const completed = evidence({
      transition: 'completed',
      resultRef: 'result-2',
      resultEventSeq: 3,
      observedAt: 25,
      previousProofRef: 'jlive_2',
    });
    expect(() =>
      registry.applyVerified(
        proof(4, { ...completed, previousProofRef: 'jlive_wrong' } as JarvisDurableLiveEvidenceV1),
        event(4, { ...completed, previousProofRef: 'jlive_wrong' } as JarvisDurableLiveEvidenceV1),
      ),
    ).toThrow('live_evidence_previous_proof_mismatch');

    registry.applyVerified(proof(4, completed, 'jlive_4'), event(4, completed));
    expect(registry.snapshot('account-1', 'run-1')?.nodes).toEqual([
      expect.objectContaining({
        id: 'model:registration-1',
        state: 'completed',
        evidenceRef: 'jlive_4',
        verifiedAt: 25,
      }),
    ]);
  });

  it('bounds completed retention per run while retaining active registrations', () => {
    let time = 100;
    const registry = createJarvisLiveEvidenceRegistry({
      now: () => ++time,
      maxCompletedPerRun: 2,
    });
    for (let index = 1; index <= 3; index += 1) {
      const started = evidence({
        registrationId: `completed-${index}`,
        resultRef: `start-${index}`,
        resultEventSeq: index * 2 - 1,
        observedAt: index * 2 - 1,
      });
      registry.applyVerified(proof(index * 10, started), event(index * 10, started));
      const value = evidence({
        registrationId: `completed-${index}`,
        transition: 'completed',
        resultRef: `result-${index}`,
        resultEventSeq: index * 2,
        observedAt: index * 2,
        previousProofRef: `jlive_${index * 10}`,
      });
      registry.applyVerified(proof(index * 10 + 1, value), event(index * 10 + 1, value));
    }
    const active = evidence({ registrationId: 'active', observedAt: 50 });
    registry.applyVerified(proof(20, active), event(20, active));

    expect(registry.snapshot('account-1', 'run-1')?.nodes.map((node) => node.id)).toEqual([
      'model:completed-2',
      'model:completed-3',
      'model:active',
    ]);
  });

  it('scopes notifications and invalidation by account and run', () => {
    const registry = createJarvisLiveEvidenceRegistry({ now: () => 20, maxCompletedPerRun: 2 });
    const runListener = vi.fn();
    const otherListener = vi.fn();
    const unsubscribe = registry.subscribe('account-1', 'run-1', runListener);
    registry.subscribe('account-1', 'run-2', otherListener);

    const first = evidence();
    registry.applyVerified(proof(2, first), event(2, first));
    expect(runListener).toHaveBeenCalledTimes(1);
    expect(otherListener).not.toHaveBeenCalled();

    unsubscribe();
    registry.invalidateRun('account-1', 'run-1');
    expect(registry.snapshot('account-1', 'run-1')).toBeUndefined();
    expect(runListener).toHaveBeenCalledTimes(1);

    const second = evidence({ runId: 'run-2', registrationId: 'registration-2' });
    registry.applyVerified(proof(3, second), event(3, second));
    registry.invalidateAccount('account-1');
    expect(registry.snapshot('account-1', 'run-2')).toBeUndefined();
    expect(otherListener).toHaveBeenCalledTimes(2);

    registry.invalidateAll();
    expect(registry.snapshot('account-1', 'run-2')).toBeUndefined();
  });
});
