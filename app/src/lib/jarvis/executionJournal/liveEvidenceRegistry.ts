import type {
  JarvisDurableLiveEvidenceV1,
  JarvisEvent,
  JarvisLiveEvidenceProof,
  JarvisLiveEvidenceRegistryInternals,
  JarvisLiveEvidenceSnapshot,
  JarvisLiveSystemNode,
} from '@/lib/jarvis/contracts/execution';

type RegistryEntry = Readonly<{
  proof: JarvisLiveEvidenceProof;
  row: JarvisEvent;
  node: JarvisLiveSystemNode;
}>;

type RunRegistry = {
  accountId: string;
  runId: string;
  entries: Map<string, RegistryEntry>;
};

export interface JarvisLiveEvidenceMutableRegistry extends JarvisLiveEvidenceRegistryInternals {
  removeRegistration(accountId: string, runId: string, registrationId: string): void;
}

function fail(code: string): never {
  throw new Error(code);
}

function key(accountId: string, runId: string): string {
  return `${accountId}\u0000${runId}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => valuesEqual(value, right[index]))
    );
  }
  if (typeof left !== 'object' || typeof right !== 'object') return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (name, index) =>
        name === rightKeys[index] && valuesEqual(leftRecord[name], rightRecord[name]),
    )
  );
}

function assertProofRowBinding(proof: JarvisLiveEvidenceProof, row: Readonly<JarvisEvent>) {
  const value = row.liveEvidence;
  if (
    !value ||
    row.runId !== proof.runId ||
    row.seq !== proof.eventSeq ||
    value.accountId !== proof.accountId ||
    value.runId !== proof.runId ||
    value.requestId !== proof.requestId ||
    value.attemptNumber !== proof.attemptNumber ||
    value.registrationId !== proof.registrationId ||
    value.producerKind !== proof.producerKind ||
    value.resultRef !== proof.resultRef ||
    value.resultEventSeq !== proof.resultEventSeq ||
    value.transition !== proof.transition
  ) {
    fail('live_evidence_row_mismatch');
  }
  return value;
}

function toNode(
  proof: JarvisLiveEvidenceProof,
  value: JarvisDurableLiveEvidenceV1,
): JarvisLiveSystemNode {
  if (value.kind === 'model') {
    if (
      value.producerKind !== 'provider' ||
      value.producerIdentity.producerKind !== 'provider' ||
      value.providerId !== value.producerIdentity.providerId ||
      value.modelId !== value.producerIdentity.modelId ||
      value.modelSnapshotRef !== value.producerIdentity.modelSnapshotRef
    ) {
      fail('live_evidence_row_mismatch');
    }
    return {
      kind: 'model',
      id: `model:${value.registrationId}`,
      accountId: value.accountId,
      runId: value.runId,
      state:
        value.transition === 'completed' || value.transition === 'degraded'
          ? value.transition
          : 'active',
      operations: clone(value.operations) as readonly ('generate' | 'stream' | 'embed')[],
      evidenceRef: proof.proofRef,
      verifiedAt: value.observedAt,
      providerId: value.providerId,
      modelId: value.modelId,
      modelSnapshotRef: value.modelSnapshotRef,
    };
  }
  if (value.producerKind === 'provider') fail('live_evidence_row_mismatch');
  return {
    kind: 'capability',
    id: `capability:${value.registrationId}`,
    accountId: value.accountId,
    runId: value.runId,
    state:
      value.transition === 'started'
        ? 'ready'
        : value.transition === 'ready' ||
            value.transition === 'busy' ||
            value.transition === 'completed' ||
            value.transition === 'degraded'
          ? value.transition
          : fail('live_evidence_row_mismatch'),
    operations: clone(value.operations) as readonly ('execute' | 'cancel' | 'inspect')[],
    evidenceRef: proof.proofRef,
    verifiedAt: value.observedAt,
    category: value.category,
    capabilityId: value.capabilityId,
  };
}

export function createJarvisLiveEvidenceRegistry(input: {
  now: () => number;
  maxCompletedPerRun: number;
}): JarvisLiveEvidenceMutableRegistry {
  if (
    !Number.isSafeInteger(input.maxCompletedPerRun) ||
    input.maxCompletedPerRun < 1 ||
    input.maxCompletedPerRun > 500
  ) {
    fail('live_evidence_invalid_retention');
  }
  const runs = new Map<string, RunRegistry>();
  const listeners = new Map<string, Set<() => void>>();

  const notify = (runKey: string) => {
    for (const listener of [...(listeners.get(runKey) ?? [])]) listener();
  };

  const removeRun = (runKey: string) => {
    const existed = runs.delete(runKey);
    if (existed) notify(runKey);
    listeners.delete(runKey);
  };

  return {
    applyVerified(proof, row) {
      const value = assertProofRowBinding(proof, row);
      const runKey = key(proof.accountId, proof.runId);
      const current = runs.get(runKey) ?? {
        accountId: proof.accountId,
        runId: proof.runId,
        entries: new Map<string, RegistryEntry>(),
      };
      const previous = current.entries.get(proof.registrationId);
      if (previous) {
        if (
          value.previousProofRef !== previous.proof.proofRef ||
          value.observedAt < previous.node.verifiedAt ||
          previous.node.state === 'completed' ||
          previous.node.state === 'degraded'
        ) {
          fail('live_evidence_previous_proof_mismatch');
        }
      } else if (value.previousProofRef !== undefined) {
        fail('live_evidence_previous_proof_mismatch');
      }
      const next: RegistryEntry = {
        proof: clone(proof),
        row: clone(row),
        node: toNode(proof, value),
      };
      current.entries.set(proof.registrationId, next);
      const completed = [...current.entries.entries()]
        .filter(([, entry]) => entry.node.state === 'completed' || entry.node.state === 'degraded')
        .sort((left, right) => left[1].node.verifiedAt - right[1].node.verifiedAt);
      while (completed.length > input.maxCompletedPerRun) {
        const evicted = completed.shift();
        if (evicted) current.entries.delete(evicted[0]);
      }
      runs.set(runKey, current);
      notify(runKey);
    },

    snapshot(accountId, runId): JarvisLiveEvidenceSnapshot | undefined {
      const current = runs.get(key(accountId, runId));
      if (!current || current.entries.size === 0) return undefined;
      return clone({
        schemaVersion: 1,
        accountId,
        runId,
        capturedAt: input.now(),
        nodes: [...current.entries.values()].map((entry) => entry.node),
      });
    },

    subscribe(accountId, runId, listener) {
      const runKey = key(accountId, runId);
      const runListeners = listeners.get(runKey) ?? new Set<() => void>();
      runListeners.add(listener);
      listeners.set(runKey, runListeners);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        const current = listeners.get(runKey);
        current?.delete(listener);
        if (current?.size === 0) listeners.delete(runKey);
      };
    },

    removeRegistration(accountId, runId, registrationId) {
      const runKey = key(accountId, runId);
      const current = runs.get(runKey);
      if (!current?.entries.delete(registrationId)) return;
      if (current.entries.size === 0) runs.delete(runKey);
      notify(runKey);
    },

    invalidateRun(accountId, runId) {
      removeRun(key(accountId, runId));
    },

    invalidateAccount(accountId) {
      for (const [runKey, current] of [...runs]) {
        if (current.accountId === accountId) removeRun(runKey);
      }
      for (const runKey of [...listeners.keys()]) {
        if (runKey.startsWith(`${accountId}\u0000`)) listeners.delete(runKey);
      }
    },

    invalidateAll() {
      for (const runKey of [...runs.keys()]) removeRun(runKey);
      listeners.clear();
    },
  };
}
