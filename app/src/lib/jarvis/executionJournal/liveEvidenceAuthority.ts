import type {
  JarvisCanonicalLiveProducerEvidence,
  JarvisCapabilityLiveEvidencePort,
  JarvisCapabilityLiveProducerKind,
  JarvisDurableLiveEvidenceV1,
  JarvisEvent,
  JarvisLiveCapabilityCategory,
  JarvisLiveEvidenceAppendCapability,
  JarvisLiveEvidenceKernelComposition,
  JarvisLiveEvidenceKernelOwner,
  JarvisLiveEvidenceProof,
  JarvisLiveEvidenceRegistration,
  JarvisLiveEvidenceVerifierSlot,
  JarvisLiveProducerKind,
  JarvisProviderLiveEvidencePort,
} from '@/lib/jarvis/contracts/execution';
import type { JarvisDexie } from '@/lib/db';
import type { JarvisEventRepository, JarvisRunRepository } from '@/lib/db/jarvisRepositories';
import {
  createJarvisLiveEvidenceEventCommitAuthority,
  createJarvisRepositories,
} from '@/lib/db/jarvisRepositories';
import {
  createJarvisLiveEvidenceRegistry,
  type JarvisLiveEvidenceMutableRegistry,
} from './liveEvidenceRegistry';

type VerifierSlots = Readonly<{
  provider: JarvisLiveEvidenceVerifierSlot<'provider'>;
  action: JarvisLiveEvidenceVerifierSlot<'action'>;
  fileAction: JarvisLiveEvidenceVerifierSlot<'file_action'>;
  terminal: JarvisLiveEvidenceVerifierSlot<'terminal'>;
  plugin: JarvisLiveEvidenceVerifierSlot<'plugin'>;
  mcp: JarvisLiveEvidenceVerifierSlot<'mcp'>;
  voice: JarvisLiveEvidenceVerifierSlot<'voice'>;
  schedule: JarvisLiveEvidenceVerifierSlot<'schedule'>;
  hive: JarvisLiveEvidenceVerifierSlot<'hive'>;
}>;

type AuthorityInput = Readonly<{
  runs: Pick<JarvisRunRepository, 'getById' | 'listByAccount'>;
  events: Pick<JarvisEventRepository, 'listByRun' | 'getBySeq'>;
  verifiers: VerifierSlots;
  sha256Canonical(value: unknown): Promise<string>;
  now: () => number;
  maxCompletedPerRun?: number;
}>;

type Epoch = Readonly<{ global: number; account: number; run: number }>;

type PublishedRecord = Readonly<{
  canonical: JarvisCanonicalLiveProducerEvidence<JarvisLiveProducerKind>;
  proof: JarvisLiveEvidenceProof;
  row: JarvisEvent;
}>;

function fail(code: string): never {
  throw new Error(code);
}

function key(accountId: string, runId: string): string {
  return `${accountId}\u0000${runId}`;
}

function recordKey(accountId: string, runId: string, registrationId: string): string {
  return `${key(accountId, runId)}\u0000${registrationId}`;
}

function exactEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => exactEqual(value, right[index]))
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
      (name, index) => name === rightKeys[index] && exactEqual(leftRecord[name], rightRecord[name]),
    )
  );
}

function bounded(value: number | undefined, fallback: number, maximum: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(maximum, Math.trunc(value)));
}

function verifierSlot<K extends JarvisLiveProducerKind>(
  slots: VerifierSlots,
  kind: K,
): JarvisLiveEvidenceVerifierSlot<K> {
  const slot =
    kind === 'provider'
      ? slots.provider
      : kind === 'action'
        ? slots.action
        : kind === 'file_action'
          ? slots.fileAction
          : kind === 'terminal'
            ? slots.terminal
            : kind === 'plugin'
              ? slots.plugin
              : kind === 'mcp'
                ? slots.mcp
                : kind === 'voice'
                  ? slots.voice
                  : kind === 'schedule'
                    ? slots.schedule
                    : slots.hive;
  return slot as JarvisLiveEvidenceVerifierSlot<K>;
}

function canonicalFromDurable<K extends JarvisLiveProducerKind>(
  value: JarvisDurableLiveEvidenceV1 & { producerKind: K },
): JarvisCanonicalLiveProducerEvidence<K> {
  return {
    schemaVersion: 1,
    producerKind: value.producerKind,
    producerIdentity: structuredClone(value.producerIdentity) as Extract<
      typeof value.producerIdentity,
      { producerKind: K }
    >,
    accountId: value.accountId,
    runId: value.runId,
    requestId: value.requestId,
    attemptNumber: value.attemptNumber,
    resultRef: value.resultRef,
    resultEventSeq: value.resultEventSeq,
    state: value.transition,
    verifiedAt: value.observedAt,
  } as JarvisCanonicalLiveProducerEvidence<K>;
}

function assertCanonical<K extends JarvisLiveProducerKind>(
  scope: Readonly<{
    accountId: string;
    runId: string;
    requestId: string;
    attemptNumber: number;
  }>,
  kind: K,
  candidate: JarvisCanonicalLiveProducerEvidence<K>,
  expectedState: JarvisCanonicalLiveProducerEvidence<K>['state'],
): void {
  if (
    candidate.schemaVersion !== 1 ||
    candidate.producerKind !== kind ||
    candidate.producerIdentity.producerKind !== kind ||
    candidate.accountId !== scope.accountId ||
    candidate.runId !== scope.runId ||
    candidate.requestId !== scope.requestId ||
    candidate.attemptNumber !== scope.attemptNumber ||
    candidate.state !== expectedState ||
    candidate.resultRef.trim().length === 0 ||
    !Number.isSafeInteger(candidate.resultEventSeq) ||
    candidate.resultEventSeq < 1 ||
    !Number.isFinite(candidate.verifiedAt)
  ) {
    fail('live_evidence_verification_mismatch');
  }
}

function assertDurableRow(
  row: JarvisEvent | undefined,
  eventSeq: number,
  value: JarvisDurableLiveEvidenceV1,
): asserts row is JarvisEvent & { liveEvidence: JarvisDurableLiveEvidenceV1 } {
  if (
    !row ||
    row.runId !== value.runId ||
    row.seq !== eventSeq ||
    row.type !== (value.kind === 'model' ? 'model' : 'tool') ||
    row.status !== value.transition ||
    row.sourceRefs.length !== 0 ||
    row.artifactIds.length !== 0 ||
    !row.liveEvidence ||
    !exactEqual(row.liveEvidence, value) ||
    value.resultEventSeq >= eventSeq
  ) {
    fail('live_evidence_readback_mismatch');
  }
}

export function createJarvisLiveEvidenceKernelComposition(
  input: AuthorityInput,
): JarvisLiveEvidenceKernelComposition {
  const registry: JarvisLiveEvidenceMutableRegistry = createJarvisLiveEvidenceRegistry({
    now: input.now,
    maxCompletedPerRun: input.maxCompletedPerRun ?? 500,
  });
  const records = new Map<string, PublishedRecord>();
  let globalGeneration = 0;
  const accountGenerations = new Map<string, number>();
  const runGenerations = new Map<string, number>();
  let reconstructedAccount: string | undefined;

  const captureEpoch = (accountId: string, runId: string): Epoch => ({
    global: globalGeneration,
    account: accountGenerations.get(accountId) ?? 0,
    run: runGenerations.get(key(accountId, runId)) ?? 0,
  });

  const epochCurrent = (accountId: string, runId: string, epoch: Epoch) =>
    epoch.global === globalGeneration &&
    epoch.account === (accountGenerations.get(accountId) ?? 0) &&
    epoch.run === (runGenerations.get(key(accountId, runId)) ?? 0);

  const assertEpoch = (accountId: string, runId: string, epoch: Epoch) => {
    if (!epochCurrent(accountId, runId, epoch)) fail('live_evidence_authority_revoked');
  };

  function invalidateRun(accountId: string, runId: string): void {
    const runKey = key(accountId, runId);
    runGenerations.set(runKey, (runGenerations.get(runKey) ?? 0) + 1);
    registry.invalidateRun(accountId, runId);
    for (const name of [...records.keys()]) {
      if (name.startsWith(`${runKey}\u0000`)) records.delete(name);
    }
  }

  function invalidateAccount(accountId: string): void {
    accountGenerations.set(accountId, (accountGenerations.get(accountId) ?? 0) + 1);
    registry.invalidateAccount(accountId);
    for (const name of [...records.keys()]) {
      if (name.startsWith(`${accountId}\u0000`)) records.delete(name);
    }
  }

  function invalidateAll(): void {
    globalGeneration += 1;
    registry.invalidateAll();
    records.clear();
    reconstructedAccount = undefined;
  }

  async function verifyCanonical<K extends JarvisLiveProducerKind>(
    candidate: JarvisCanonicalLiveProducerEvidence<K>,
  ): Promise<JarvisCanonicalLiveProducerEvidence<K>> {
    const slot = verifierSlot(input.verifiers, candidate.producerKind);
    if (slot.state !== 'ready') fail('live_evidence_verifier_unavailable');
    const verified = await slot.verifier.verify(structuredClone(candidate));
    if (!verified || !exactEqual(verified, candidate)) {
      fail('live_evidence_verification_mismatch');
    }
    return verified;
  }

  async function proofFor(
    value: JarvisDurableLiveEvidenceV1,
    eventSeq: number,
  ): Promise<JarvisLiveEvidenceProof> {
    const digest = await input.sha256Canonical({
      schemaVersion: 1,
      accountId: value.accountId,
      runId: value.runId,
      requestId: value.requestId,
      attemptNumber: value.attemptNumber,
      registrationId: value.registrationId,
      producerKind: value.producerKind,
      producerIdentity: value.producerIdentity,
      resultRef: value.resultRef,
      resultEventSeq: value.resultEventSeq,
      transition: value.transition,
      eventSeq,
      liveEvidence: value,
    });
    if (typeof digest !== 'string' || digest.trim().length === 0) {
      fail('live_evidence_digest_invalid');
    }
    return {
      proofRef: `jlive_${digest}`,
      accountId: value.accountId,
      runId: value.runId,
      requestId: value.requestId,
      attemptNumber: value.attemptNumber,
      registrationId: value.registrationId,
      producerKind: value.producerKind,
      resultRef: value.resultRef,
      resultEventSeq: value.resultEventSeq,
      transition: value.transition,
      eventSeq,
    } as JarvisLiveEvidenceProof;
  }

  function bindLifecycle(binding: {
    scope: Readonly<{
      accountId: string;
      runId: string;
      requestId: string;
      attemptNumber: number;
    }>;
    append: JarvisLiveEvidenceAppendCapability;
  }): JarvisLiveEvidenceKernelOwner {
    const bindingEpoch = captureEpoch(binding.scope.accountId, binding.scope.runId);
    const registrations = new Map<string, object>();

    async function publish<K extends JarvisLiveProducerKind>(params: {
      kind: K;
      canonical: JarvisCanonicalLiveProducerEvidence<K>;
      registrationId: string;
      operations: readonly string[];
      previous?: JarvisLiveEvidenceProof;
      model?: Readonly<{ providerId: string; modelId: string; modelSnapshotRef: string }>;
      capability?: Readonly<{
        category: JarvisLiveCapabilityCategory;
        capabilityId: string;
      }>;
      registrationToken: object;
    }): Promise<{ proof: JarvisLiveEvidenceProof; row: JarvisEvent }> {
      const assertRegistrationCurrent = () => {
        if (registrations.get(params.registrationId) !== params.registrationToken) {
          fail('live_evidence_registration_stale');
        }
      };
      assertEpoch(binding.scope.accountId, binding.scope.runId, bindingEpoch);
      assertRegistrationCurrent();
      assertCanonical(binding.scope, params.kind, params.canonical, params.canonical.state);
      await verifyCanonical(params.canonical);
      assertEpoch(binding.scope.accountId, binding.scope.runId, bindingEpoch);
      assertRegistrationCurrent();

      const common = {
        schemaVersion: 1 as const,
        accountId: binding.scope.accountId,
        runId: binding.scope.runId,
        requestId: binding.scope.requestId,
        attemptNumber: binding.scope.attemptNumber,
        registrationId: params.registrationId,
        producerKind: params.kind,
        producerIdentity: structuredClone(params.canonical.producerIdentity),
        transition: params.canonical.state,
        operations: structuredClone(params.operations),
        resultRef: params.canonical.resultRef,
        resultEventSeq: params.canonical.resultEventSeq,
        observedAt: params.canonical.verifiedAt,
        ...(params.previous ? { previousProofRef: params.previous.proofRef } : {}),
      };
      const durable = (
        params.kind === 'provider'
          ? {
              ...common,
              kind: 'model' as const,
              producerKind: 'provider' as const,
              providerId: params.model!.providerId,
              modelId: params.model!.modelId,
              modelSnapshotRef: params.model!.modelSnapshotRef,
            }
          : {
              ...common,
              kind: 'capability' as const,
              category: params.capability!.category,
              capabilityId: params.capability!.capabilityId,
            }
      ) as JarvisDurableLiveEvidenceV1;

      const appended = await binding.append.append({ evidence: structuredClone(durable) });
      assertEpoch(binding.scope.accountId, binding.scope.runId, bindingEpoch);
      assertRegistrationCurrent();
      const firstRead = await input.events.getBySeq(
        binding.scope.accountId,
        binding.scope.runId,
        appended.seq,
      );
      assertEpoch(binding.scope.accountId, binding.scope.runId, bindingEpoch);
      assertRegistrationCurrent();
      assertDurableRow(firstRead, appended.seq, durable);
      const proof = await proofFor(durable, appended.seq);
      assertEpoch(binding.scope.accountId, binding.scope.runId, bindingEpoch);
      assertRegistrationCurrent();
      const secondRead = await input.events.getBySeq(
        binding.scope.accountId,
        binding.scope.runId,
        appended.seq,
      );
      assertEpoch(binding.scope.accountId, binding.scope.runId, bindingEpoch);
      assertRegistrationCurrent();
      assertDurableRow(secondRead, appended.seq, durable);
      if (!exactEqual(firstRead, secondRead)) fail('live_evidence_readback_mismatch');
      assertEpoch(binding.scope.accountId, binding.scope.runId, bindingEpoch);
      assertRegistrationCurrent();
      registry.applyVerified(proof, secondRead);
      assertEpoch(binding.scope.accountId, binding.scope.runId, bindingEpoch);
      assertRegistrationCurrent();
      records.set(recordKey(durable.accountId, durable.runId, durable.registrationId), {
        canonical: structuredClone(
          params.canonical,
        ) as JarvisCanonicalLiveProducerEvidence<JarvisLiveProducerKind>,
        proof: structuredClone(proof),
        row: structuredClone(secondRead),
      });
      return { proof, row: secondRead };
    }

    function registration<K extends JarvisLiveProducerKind>(params: {
      kind: K;
      registrationId: string;
      initial: JarvisCanonicalLiveProducerEvidence<K>;
      operations: readonly string[];
      model?: Readonly<{ providerId: string; modelId: string; modelSnapshotRef: string }>;
      capability?: Readonly<{ category: JarvisLiveCapabilityCategory; capabilityId: string }>;
    }): Promise<JarvisLiveEvidenceRegistration<K>> {
      const token = {};
      const prior = registrations.get(params.registrationId);
      if (prior) registrations.delete(params.registrationId);
      registrations.set(params.registrationId, token);
      let currentProof: JarvisLiveEvidenceProof;
      let terminal = false;
      let disposed = false;

      const ensureCurrent = () => {
        if (disposed || terminal || registrations.get(params.registrationId) !== token) {
          fail('live_evidence_registration_stale');
        }
      };

      return publish({
        ...params,
        canonical: params.initial,
        registrationToken: token,
      }).then(({ proof: initialProof }) => {
        currentProof = initialProof;
        terminal =
          initialProof.transition === 'completed' || initialProof.transition === 'degraded';
        return {
          initialProof,
          async update(update) {
            ensureCurrent();
            if (update.evidence.state !== update.state) {
              fail('live_evidence_verification_mismatch');
            }
            const result = await publish({
              ...params,
              canonical: update.evidence,
              previous: currentProof,
              registrationToken: token,
            });
            currentProof = result.proof;
            terminal = result.proof.transition === 'degraded';
            return currentProof;
          },
          async complete(complete) {
            ensureCurrent();
            if (complete.evidence.state !== complete.state) {
              fail('live_evidence_verification_mismatch');
            }
            const result = await publish({
              ...params,
              canonical: complete.evidence,
              previous: currentProof,
              registrationToken: token,
            });
            currentProof = result.proof;
            terminal = true;
            return currentProof;
          },
          dispose() {
            if (disposed) return;
            disposed = true;
            if (registrations.get(params.registrationId) === token) {
              registrations.delete(params.registrationId);
            }
            if (!terminal) {
              registry.removeRegistration(
                binding.scope.accountId,
                binding.scope.runId,
                params.registrationId,
              );
              records.delete(
                recordKey(binding.scope.accountId, binding.scope.runId, params.registrationId),
              );
            }
          },
        };
      });
    }

    const provider: JarvisProviderLiveEvidencePort = {
      async startProvider(start) {
        if (start.evidence.state === 'completed' || start.evidence.state === 'degraded') {
          fail('live_evidence_scope_mismatch');
        }
        const identity = start.evidence.producerIdentity;
        return registration({
          kind: 'provider',
          registrationId: start.registrationId,
          initial: start.evidence,
          operations: start.operations,
          model: {
            providerId: identity.providerId,
            modelId: identity.modelId,
            modelSnapshotRef: identity.modelSnapshotRef,
          },
        });
      },
    };

    function capability<K extends JarvisCapabilityLiveProducerKind>(
      kind: K,
    ): JarvisCapabilityLiveEvidencePort<K> {
      return {
        async startCapability(start) {
          if (start.evidence.state !== start.state) fail('live_evidence_scope_mismatch');
          return registration({
            kind,
            registrationId: start.registrationId,
            initial: start.evidence,
            operations: start.operations,
            capability: { category: start.category, capabilityId: start.capabilityId },
          });
        },
      };
    }

    return {
      provider,
      action: capability('action'),
      fileAction: capability('file_action'),
      terminal: capability('terminal'),
      plugin: capability('plugin'),
      mcp: capability('mcp'),
      voice: capability('voice'),
      schedule: capability('schedule'),
      hive: capability('hive'),
    };
  }

  async function reconstructRun(
    accountId: string,
    runId: string,
    pageSize: number,
    rowBudget: number,
  ): Promise<void> {
    const epoch = captureEpoch(accountId, runId);
    try {
      const rows: JarvisEvent[] = [];
      let afterSeq = 0;
      let complete = false;
      while (rows.length < rowBudget) {
        const remaining = rowBudget - rows.length;
        const limit = Math.min(pageSize, remaining);
        const page = await input.events.listByRun(accountId, runId, { afterSeq, limit });
        assertEpoch(accountId, runId, epoch);
        if (page.length === 0) {
          complete = true;
          break;
        }
        for (const row of page) {
          const expected = rows.length === 0 ? 1 : rows.at(-1)!.seq + 1;
          if (row.seq !== expected || row.runId !== runId) fail('live_evidence_reconstruction_gap');
          rows.push(row);
        }
        afterSeq = page.at(-1)!.seq;
        if (page.length < limit) {
          complete = true;
          break;
        }
      }
      if (!complete) fail('live_evidence_reconstruction_budget');

      const chains = new Map<string, Array<PublishedRecord>>();
      for (const row of rows) {
        const durable = row.liveEvidence;
        if (!durable) continue;
        if (durable.accountId !== accountId || durable.runId !== runId) {
          fail('live_evidence_reconstruction_mismatch');
        }
        const canonical = canonicalFromDurable(durable);
        await verifyCanonical(canonical);
        assertEpoch(accountId, runId, epoch);
        const readback = await input.events.getBySeq(accountId, runId, row.seq);
        assertEpoch(accountId, runId, epoch);
        assertDurableRow(readback, row.seq, durable);
        const proof = await proofFor(durable, row.seq);
        assertEpoch(accountId, runId, epoch);
        const chain = chains.get(durable.registrationId) ?? [];
        if (chain.length === 0) {
          if (durable.previousProofRef !== undefined) fail('live_evidence_reconstruction_mismatch');
        } else if (durable.previousProofRef !== chain.at(-1)!.proof.proofRef) {
          fail('live_evidence_reconstruction_mismatch');
        }
        chain.push({ canonical, proof, row: readback });
        chains.set(durable.registrationId, chain);
      }

      for (const [registrationId, chain] of chains) {
        const last = chain.at(-1)!;
        if (last.proof.transition !== 'completed' && last.proof.transition !== 'degraded') continue;
        for (const record of chain) {
          assertEpoch(accountId, runId, epoch);
          registry.applyVerified(record.proof, record.row);
          assertEpoch(accountId, runId, epoch);
        }
        assertEpoch(accountId, runId, epoch);
        records.set(recordKey(accountId, runId, registrationId), structuredClone(last));
      }
    } catch (error) {
      if (epochCurrent(accountId, runId, epoch)) invalidateRun(accountId, runId);
      throw error;
    }
  }

  const read = {
    async snapshot(accountId: string, runId: string) {
      const initial = registry.snapshot(accountId, runId);
      if (!initial) return undefined;
      const epoch = captureEpoch(accountId, runId);
      for (const node of initial.nodes) {
        const registrationId = node.id.slice(node.id.indexOf(':') + 1);
        const name = recordKey(accountId, runId, registrationId);
        const record = records.get(name);
        if (!record) return undefined;
        try {
          await verifyCanonical(record.canonical);
          assertEpoch(accountId, runId, epoch);
          const row = await input.events.getBySeq(accountId, runId, record.proof.eventSeq);
          assertEpoch(accountId, runId, epoch);
          assertDurableRow(row, record.proof.eventSeq, record.row.liveEvidence!);
          if (!exactEqual(row, record.row)) fail('live_evidence_readback_mismatch');
        } catch {
          if (epochCurrent(accountId, runId, epoch) && records.get(name) === record) {
            registry.removeRegistration(accountId, runId, registrationId);
            if (records.get(name) === record) records.delete(name);
          }
        }
      }
      return registry.snapshot(accountId, runId);
    },
    subscribe(accountId: string, runId: string, listener: () => void) {
      return registry.subscribe(accountId, runId, listener);
    },
  };

  return {
    bindLifecycle,
    read,
    ownerMaintenance: {
      async reconstructAccount(accountId, options = {}) {
        if (reconstructedAccount && reconstructedAccount !== accountId) {
          invalidateAccount(reconstructedAccount);
        }
        invalidateAccount(accountId);
        reconstructedAccount = accountId;
        const runLimit = bounded(options.runLimit, 500, 500);
        const pageSize = bounded(options.pageSize, 500, 500);
        const rowBudget = bounded(options.maxEventRowsPerRun, 10_000, 10_000);
        const runs = await input.runs.listByAccount(accountId, { limit: runLimit });
        for (const run of runs) {
          try {
            await reconstructRun(accountId, run.id, pageSize, rowBudget);
          } catch {
            // reconstructRun invalidates only the exact generation it captured.
          }
        }
      },
      invalidateRun,
      invalidateAccount,
      invalidateAll,
    },
  };
}

/** @internal Tests only; never imported by a production module. */
export function createJarvisLiveEvidenceTestHarness(input: {
  db: JarvisDexie;
  verifiers: Readonly<{
    [K in JarvisLiveProducerKind]: JarvisLiveEvidenceVerifierSlot<K>;
  }>;
  sha256Canonical(value: unknown): Promise<string>;
  now: () => number;
}): Readonly<{
  provider: JarvisProviderLiveEvidencePort;
  capabilities: Readonly<{
    [K in JarvisCapabilityLiveProducerKind]: JarvisCapabilityLiveEvidencePort<K>;
  }>;
  read: JarvisLiveEvidenceKernelComposition['read'];
}> {
  const repositories = createJarvisRepositories(input.db);
  const commit = createJarvisLiveEvidenceEventCommitAuthority(input.db);
  const composition = createJarvisLiveEvidenceKernelComposition({
    runs: repositories.run,
    events: repositories.event,
    verifiers: {
      provider: input.verifiers.provider,
      action: input.verifiers.action,
      fileAction: input.verifiers.file_action,
      terminal: input.verifiers.terminal,
      plugin: input.verifiers.plugin,
      mcp: input.verifiers.mcp,
      voice: input.verifiers.voice,
      schedule: input.verifiers.schedule,
      hive: input.verifiers.hive,
    },
    sha256Canonical: input.sha256Canonical,
    now: input.now,
  });

  const ownerFor = <K extends JarvisLiveProducerKind>(
    evidence: JarvisCanonicalLiveProducerEvidence<K>,
  ): JarvisLiveEvidenceKernelOwner =>
    composition.bindLifecycle({
      scope: {
        accountId: evidence.accountId,
        runId: evidence.runId,
        requestId: evidence.requestId,
        attemptNumber: evidence.attemptNumber,
      },
      append: {
        append: ({ evidence: durable }) =>
          commit.appendLiveEvidence({
            accountId: evidence.accountId,
            runId: evidence.runId,
            evidence: durable,
          }),
      },
    });

  return {
    provider: {
      startProvider: (start) => ownerFor(start.evidence).provider.startProvider(start),
    },
    capabilities: {
      action: {
        startCapability: (start) => ownerFor(start.evidence).action.startCapability(start),
      },
      file_action: {
        startCapability: (start) => ownerFor(start.evidence).fileAction.startCapability(start),
      },
      terminal: {
        startCapability: (start) => ownerFor(start.evidence).terminal.startCapability(start),
      },
      plugin: {
        startCapability: (start) => ownerFor(start.evidence).plugin.startCapability(start),
      },
      mcp: {
        startCapability: (start) => ownerFor(start.evidence).mcp.startCapability(start),
      },
      schedule: {
        startCapability: (start) => ownerFor(start.evidence).schedule.startCapability(start),
      },
      voice: {
        startCapability: (start) => ownerFor(start.evidence).voice.startCapability(start),
      },
      hive: {
        startCapability: (start) => ownerFor(start.evidence).hive.startCapability(start),
      },
    },
    read: composition.read,
  };
}
