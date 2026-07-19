import type {
  JarvisArtifactDraft,
  JarvisArtifactV1,
  JarvisAttemptEffectClaimInput,
  JarvisAttemptEffectClaimResult,
} from './contracts/execution';

export type CanonicalProviderEvidence = Readonly<{
  producerId: 'provider_response';
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
  resultRef: string;
  state: 'completed' | 'partial';
  verifiedAt: number;
  providerId: string;
  modelId: string;
  modelSnapshotRef: string;
}>;

export type CanonicalFileActionEvidence = Readonly<{
  producerId: 'file_action_result';
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
  resultRef: string;
  state: 'succeeded' | 'partial';
  verifiedAt: number;
  actionId: string;
  actionVersion: number;
}>;

export type CanonicalTerminalEvidence = Readonly<{
  producerId: 'terminal_exit';
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
  resultRef: string;
  state: 'exited' | 'partial';
  verifiedAt: number;
  sessionId: string;
  executionId: string;
}>;

export type CanonicalPluginEvidence = Readonly<{
  producerId: 'plugin_result';
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
  resultRef: string;
  state: 'succeeded' | 'partial';
  verifiedAt: number;
  pluginId: string;
  invocationId: string;
}>;

export type CanonicalMcpEvidence = Readonly<{
  producerId: 'mcp_result';
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
  resultRef: string;
  state: 'succeeded' | 'partial';
  verifiedAt: number;
  serverId: string;
  toolName: string;
  invocationId: string;
}>;

export type CanonicalScheduleEvidence = Readonly<{
  producerId: 'schedule_result';
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
  resultRef: string;
  state: 'completed' | 'partial';
  verifiedAt: number;
  scheduleId: string;
  occurrenceId: string;
}>;

export type CanonicalArtifactEvidence =
  | CanonicalProviderEvidence
  | CanonicalFileActionEvidence
  | CanonicalTerminalEvidence
  | CanonicalPluginEvidence
  | CanonicalMcpEvidence
  | CanonicalScheduleEvidence;

export interface CanonicalProviderEvidenceAuthority {
  verify(evidence: CanonicalProviderEvidence): Promise<CanonicalProviderEvidence | null>;
}

export interface CanonicalFileActionEvidenceAuthority {
  verify(evidence: CanonicalFileActionEvidence): Promise<CanonicalFileActionEvidence | null>;
}

export interface CanonicalTerminalEvidenceAuthority {
  verify(evidence: CanonicalTerminalEvidence): Promise<CanonicalTerminalEvidence | null>;
}

export interface CanonicalPluginEvidenceAuthority {
  verify(evidence: CanonicalPluginEvidence): Promise<CanonicalPluginEvidence | null>;
}

export interface CanonicalMcpEvidenceAuthority {
  verify(evidence: CanonicalMcpEvidence): Promise<CanonicalMcpEvidence | null>;
}

export interface CanonicalScheduleEvidenceAuthority {
  verify(evidence: CanonicalScheduleEvidence): Promise<CanonicalScheduleEvidence | null>;
}

export type CanonicalArtifactEvidenceAuthoritySlot<
  P extends CanonicalArtifactEvidence['producerId'],
  A,
> =
  | Readonly<{ state: 'ready'; producerId: P; authority: A }>
  | Readonly<{
      state: 'unavailable';
      producerId: P;
      reason: 'producer_task_not_landed';
    }>;

export type CanonicalArtifactEvidenceAuthorities = Readonly<{
  provider: CanonicalArtifactEvidenceAuthoritySlot<
    'provider_response',
    CanonicalProviderEvidenceAuthority
  >;
  fileAction: CanonicalArtifactEvidenceAuthoritySlot<
    'file_action_result',
    CanonicalFileActionEvidenceAuthority
  >;
  terminal: CanonicalArtifactEvidenceAuthoritySlot<
    'terminal_exit',
    CanonicalTerminalEvidenceAuthority
  >;
  plugin: CanonicalArtifactEvidenceAuthoritySlot<'plugin_result', CanonicalPluginEvidenceAuthority>;
  mcp: CanonicalArtifactEvidenceAuthoritySlot<'mcp_result', CanonicalMcpEvidenceAuthority>;
  schedule: CanonicalArtifactEvidenceAuthoritySlot<
    'schedule_result',
    CanonicalScheduleEvidenceAuthority
  >;
}>;

export interface CanonicalArtifactEvidenceAdapter<E extends CanonicalArtifactEvidence> {
  materialize(input: { evidence: E; draft: JarvisArtifactDraft }): Promise<JarvisArtifactV1>;
}

export type JarvisArtifactPipeline = Readonly<{
  provider: CanonicalArtifactEvidenceAdapter<CanonicalProviderEvidence>;
  fileAction: CanonicalArtifactEvidenceAdapter<CanonicalFileActionEvidence>;
  terminal: CanonicalArtifactEvidenceAdapter<CanonicalTerminalEvidence>;
  plugin: CanonicalArtifactEvidenceAdapter<CanonicalPluginEvidence>;
  mcp: CanonicalArtifactEvidenceAdapter<CanonicalMcpEvidence>;
  schedule: CanonicalArtifactEvidenceAdapter<CanonicalScheduleEvidence>;
}>;

/** @internal Supplied only by one issued kernel lifecycle. */
export interface JarvisArtifactEffectClaimCapability {
  claim(input: JarvisAttemptEffectClaimInput): Promise<JarvisAttemptEffectClaimResult>;
}

/** @internal Captured only inside the trusted kernel composition. */
export type JarvisBoundArtifactPipelineIssuer = (
  effectClaims: JarvisArtifactEffectClaimCapability,
) => JarvisArtifactPipeline;

type ArtifactMaterializer = Readonly<{
  materializeVerified(input: {
    binding: {
      accountId: string;
      runId: string;
      requestId: string;
      attemptNumber: number;
      producerId: CanonicalArtifactEvidence['producerId'];
      resultRef: string;
      verifiedAt: number;
    };
    draft: JarvisArtifactDraft;
  }): Promise<JarvisArtifactV1>;
}>;

const EVIDENCE_FIELDS: Readonly<
  Record<CanonicalArtifactEvidence['producerId'], readonly string[]>
> = Object.freeze({
  provider_response: Object.freeze([
    'producerId',
    'accountId',
    'runId',
    'requestId',
    'attemptNumber',
    'resultRef',
    'state',
    'verifiedAt',
    'providerId',
    'modelId',
    'modelSnapshotRef',
  ]),
  file_action_result: Object.freeze([
    'producerId',
    'accountId',
    'runId',
    'requestId',
    'attemptNumber',
    'resultRef',
    'state',
    'verifiedAt',
    'actionId',
    'actionVersion',
  ]),
  terminal_exit: Object.freeze([
    'producerId',
    'accountId',
    'runId',
    'requestId',
    'attemptNumber',
    'resultRef',
    'state',
    'verifiedAt',
    'sessionId',
    'executionId',
  ]),
  plugin_result: Object.freeze([
    'producerId',
    'accountId',
    'runId',
    'requestId',
    'attemptNumber',
    'resultRef',
    'state',
    'verifiedAt',
    'pluginId',
    'invocationId',
  ]),
  mcp_result: Object.freeze([
    'producerId',
    'accountId',
    'runId',
    'requestId',
    'attemptNumber',
    'resultRef',
    'state',
    'verifiedAt',
    'serverId',
    'toolName',
    'invocationId',
  ]),
  schedule_result: Object.freeze([
    'producerId',
    'accountId',
    'runId',
    'requestId',
    'attemptNumber',
    'resultRef',
    'state',
    'verifiedAt',
    'scheduleId',
    'occurrenceId',
  ]),
});

const EVIDENCE_STATES: Readonly<
  Record<CanonicalArtifactEvidence['producerId'], ReadonlySet<string>>
> = Object.freeze({
  provider_response: new Set(['completed', 'partial']),
  file_action_result: new Set(['succeeded', 'partial']),
  terminal_exit: new Set(['exited', 'partial']),
  plugin_result: new Set(['succeeded', 'partial']),
  mcp_result: new Set(['succeeded', 'partial']),
  schedule_result: new Set(['completed', 'partial']),
});

const NON_RESULT_REF = /^(?:pending|queued|proposed|planned|availability(?:[-_:]|$)|synthetic)/i;
const SECRET_REF =
  /(?:password|secret|api[_ -]?key|access[_ -]?token)\s*[:=]|Bearer\s+|BEGIN [A-Z ]*PRIVATE KEY/i;

function producerError(category: string): never {
  throw new Error(category);
}

function stableText(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim() === value &&
    value.length > 0 &&
    value.length <= 512 &&
    !value.includes('\u0000')
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateEvidence<E extends CanonicalArtifactEvidence>(
  evidence: E,
  expectedProducer: E['producerId'],
): E {
  if (!isPlainRecord(evidence) || !Object.isFrozen(evidence)) {
    return producerError('artifact_evidence_invalid');
  }
  const allowed = EVIDENCE_FIELDS[expectedProducer];
  if (
    evidence.producerId !== expectedProducer ||
    Reflect.ownKeys(evidence).length !== allowed.length ||
    Reflect.ownKeys(evidence).some((key) => {
      if (typeof key !== 'string' || !allowed.includes(key)) return true;
      const descriptor = Object.getOwnPropertyDescriptor(evidence, key);
      return !descriptor || !descriptor.enumerable || !('value' in descriptor);
    })
  ) {
    return producerError('artifact_evidence_invalid');
  }
  if (
    !stableText(evidence.accountId) ||
    !stableText(evidence.runId) ||
    !stableText(evidence.requestId) ||
    !Number.isSafeInteger(evidence.attemptNumber) ||
    evidence.attemptNumber < 1 ||
    !stableText(evidence.resultRef) ||
    NON_RESULT_REF.test(evidence.resultRef) ||
    SECRET_REF.test(evidence.resultRef) ||
    !EVIDENCE_STATES[expectedProducer].has(evidence.state) ||
    !Number.isSafeInteger(evidence.verifiedAt) ||
    evidence.verifiedAt < 0
  ) {
    return producerError('artifact_evidence_invalid');
  }
  for (const key of allowed.slice(8)) {
    const value = evidence[key as keyof E];
    if (key === 'actionVersion') {
      if (!Number.isSafeInteger(value) || (value as number) < 1) {
        return producerError('artifact_evidence_invalid');
      }
    } else if (!stableText(value)) {
      return producerError('artifact_evidence_invalid');
    }
  }
  return evidence;
}

function exactEvidence(left: CanonicalArtifactEvidence, right: CanonicalArtifactEvidence): boolean {
  const fields = EVIDENCE_FIELDS[left.producerId];
  return (
    right.producerId === left.producerId &&
    fields.every((field) => left[field as keyof typeof left] === right[field as keyof typeof right])
  );
}

function partialState(evidence: CanonicalArtifactEvidence): boolean {
  return evidence.state === 'partial';
}

function validateDraftState(evidence: CanonicalArtifactEvidence, draft: JarvisArtifactDraft): void {
  const draftPartial = draft.artifact.state === 'partial';
  if (partialState(evidence) !== draftPartial) producerError('artifact_evidence_state_mismatch');
}

async function claimEffect(input: {
  claims: JarvisArtifactEffectClaimCapability;
  evidence: CanonicalArtifactEvidence;
  now: () => number;
}): Promise<void> {
  const claimedAt = input.now();
  if (!Number.isSafeInteger(claimedAt) || claimedAt < 0) {
    producerError('artifact_effect_claim_invalid');
  }
  const result = await input.claims.claim({
    accountId: input.evidence.accountId,
    runId: input.evidence.runId,
    requestId: input.evidence.requestId,
    attemptNumber: input.evidence.attemptNumber,
    ownerKind: 'artifact',
    ownerId: `artifact:${input.evidence.producerId}:${input.evidence.resultRef}`,
    evidenceRef: input.evidence.resultRef,
    claimedAt,
  });
  if (!result.applied) producerError('artifact_effect_claim_rejected');
}

type EvidenceAuthority<E extends CanonicalArtifactEvidence> = Readonly<{
  verify(evidence: E): Promise<E | null>;
}>;

function createNamedAdapter<E extends CanonicalArtifactEvidence>(input: {
  producerId: E['producerId'];
  slot: CanonicalArtifactEvidenceAuthoritySlot<E['producerId'], EvidenceAuthority<E>>;
  claims: JarvisArtifactEffectClaimCapability;
  materializer: ArtifactMaterializer;
  now: () => number;
}): CanonicalArtifactEvidenceAdapter<E> {
  return Object.freeze({
    async materialize({ evidence, draft }: { evidence: E; draft: JarvisArtifactDraft }) {
      if (input.slot.state !== 'ready') producerError('artifact_producer_unavailable');
      const candidate = validateEvidence(evidence, input.producerId);
      let verified: E | null;
      try {
        verified = await input.slot.authority.verify(candidate);
      } catch {
        verified = null;
      }
      if (!verified) producerError('artifact_evidence_verification_failed');
      const exact = validateEvidence(verified, input.producerId);
      if (!exactEvidence(candidate, exact)) {
        producerError('artifact_evidence_verification_failed');
      }
      validateDraftState(exact, draft);
      await claimEffect({ claims: input.claims, evidence: exact, now: input.now });
      return input.materializer.materializeVerified({
        binding: {
          accountId: exact.accountId,
          runId: exact.runId,
          requestId: exact.requestId,
          attemptNumber: exact.attemptNumber,
          producerId: exact.producerId,
          resultRef: exact.resultRef,
          verifiedAt: exact.verifiedAt,
        },
        draft,
      });
    },
  });
}

/** @internal Imported only by artifactRuntime.ts and focused tests. */
export function createJarvisBoundArtifactPipelineIssuerInternal(input: {
  authorities: CanonicalArtifactEvidenceAuthorities;
  materializeVerified: ArtifactMaterializer['materializeVerified'];
  now: () => number;
}): JarvisBoundArtifactPipelineIssuer {
  const materializer: ArtifactMaterializer = Object.freeze({
    materializeVerified: input.materializeVerified,
  });
  return (effectClaims) =>
    Object.freeze({
      provider: createNamedAdapter({
        producerId: 'provider_response',
        slot: input.authorities.provider,
        claims: effectClaims,
        materializer,
        now: input.now,
      }),
      fileAction: createNamedAdapter({
        producerId: 'file_action_result',
        slot: input.authorities.fileAction,
        claims: effectClaims,
        materializer,
        now: input.now,
      }),
      terminal: createNamedAdapter({
        producerId: 'terminal_exit',
        slot: input.authorities.terminal,
        claims: effectClaims,
        materializer,
        now: input.now,
      }),
      plugin: createNamedAdapter({
        producerId: 'plugin_result',
        slot: input.authorities.plugin,
        claims: effectClaims,
        materializer,
        now: input.now,
      }),
      mcp: createNamedAdapter({
        producerId: 'mcp_result',
        slot: input.authorities.mcp,
        claims: effectClaims,
        materializer,
        now: input.now,
      }),
      schedule: createNamedAdapter({
        producerId: 'schedule_result',
        slot: input.authorities.schedule,
        claims: effectClaims,
        materializer,
        now: input.now,
      }),
    });
}
