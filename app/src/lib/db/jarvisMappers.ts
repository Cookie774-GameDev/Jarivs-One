import type { JarvisModelSnapshot } from '@/lib/jarvis/contracts/capability';
import type {
  JarvisApprovalV1,
  JarvisArtifact,
  JarvisEvent,
  JarvisRun,
} from '@/lib/jarvis/contracts/execution';
import type { JarvisSourceRef } from '@/lib/jarvis/contracts/source';
import {
  validateJarvisApproval,
  validateJarvisEvent,
  validateJarvisRun,
} from '@/lib/jarvis/contracts/validators';
import type { JarvisIdentityRevision } from '@/lib/jarvis/identity';
import type { JarvisProfile } from '@/lib/jarvis/profiles/types';
import type {
  JarvisApprovalRow,
  JarvisArtifactRow,
  JarvisEventRow,
  JarvisIdentityRevisionRow,
  JarvisModelSnapshotRow,
  JarvisProfileRow,
  JarvisRunRow,
  JarvisSourceRefRow,
} from './schema';

export type JarvisProfileMigrationMetadata = {
  migrationVersion: 3;
  migrationSource: 'legacy_agent' | 'clean_default';
  migrationSourcePromptHash?: string;
  migrationCompletedAt: number;
};

function cloneDetached<T>(value: T): T {
  return structuredClone(value);
}

function assertValidJarvisRun(value: unknown): asserts value is JarvisRun {
  if (!validateJarvisRun(value).ok) throw new Error('Invalid Jarvis run');
}

function assertValidJarvisEvent(value: unknown): asserts value is JarvisEvent {
  if (!validateJarvisEvent(value).ok) throw new Error('Invalid Jarvis event');
}

function assertValidJarvisApproval(value: unknown): asserts value is JarvisApprovalV1 {
  if (!validateJarvisApproval(value).ok) throw new Error('Invalid Jarvis approval');
}

export function toJarvisIdentityRevisionRow(
  value: JarvisIdentityRevision,
): JarvisIdentityRevisionRow {
  return {
    id: value.id,
    identity_id: value.identityId,
    version: value.version,
    core_hash: value.coreHash,
    response_contract_hash: value.responseContractHash,
    created_at: value.createdAt,
  };
}

export function fromJarvisIdentityRevisionRow(
  row: JarvisIdentityRevisionRow,
): JarvisIdentityRevision {
  return {
    id: row.id,
    identityId: row.identity_id,
    version: row.version,
    coreHash: row.core_hash,
    responseContractHash: row.response_contract_hash,
    createdAt: row.created_at,
  };
}

export function toJarvisProfileRow(input: {
  profile: JarvisProfile;
  migration: JarvisProfileMigrationMetadata;
}): JarvisProfileRow {
  const { profile, migration } = input;
  return {
    id: profile.id,
    account_id: profile.accountId,
    name: profile.name,
    active: profile.active ? 1 : 0,
    identity_version: profile.identityVersion,
    revision_id: profile.revisionId,
    ...(profile.soulRevisionId === undefined ? {} : { soul_revision_id: profile.soulRevisionId }),
    custom_instructions: profile.customInstructions,
    instruction_source: profile.instructionSource,
    memory_scope: profile.memoryScope,
    voice_enabled: profile.voiceEnabled,
    ...(profile.sourcePromptHash === undefined
      ? {}
      : { source_prompt_hash: profile.sourcePromptHash }),
    created_at: profile.createdAt,
    updated_at: profile.updatedAt,
    migration_version: migration.migrationVersion,
    migration_source: migration.migrationSource,
    ...(migration.migrationSourcePromptHash === undefined
      ? {}
      : { migration_source_prompt_hash: migration.migrationSourcePromptHash }),
    migration_completed_at: migration.migrationCompletedAt,
  };
}

export function fromJarvisProfileRow(row: JarvisProfileRow): {
  profile: JarvisProfile;
  migration: JarvisProfileMigrationMetadata;
} {
  return {
    profile: {
      id: row.id,
      revisionId: row.revision_id,
      accountId: row.account_id,
      name: row.name,
      customInstructions: row.custom_instructions,
      instructionSource: row.instruction_source,
      memoryScope: row.memory_scope,
      voiceEnabled: row.voice_enabled,
      active: row.active === 1,
      identityVersion: row.identity_version,
      ...(row.soul_revision_id === undefined ? {} : { soulRevisionId: row.soul_revision_id }),
      ...(row.source_prompt_hash === undefined ? {} : { sourcePromptHash: row.source_prompt_hash }),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    migration: {
      migrationVersion: row.migration_version,
      migrationSource: row.migration_source,
      ...(row.migration_source_prompt_hash === undefined
        ? {}
        : { migrationSourcePromptHash: row.migration_source_prompt_hash }),
      migrationCompletedAt: row.migration_completed_at,
    },
  };
}

export function toJarvisModelSnapshotRow(value: JarvisModelSnapshot): JarvisModelSnapshotRow {
  return {
    ...(value.connectionId === undefined ? {} : { connection_id: value.connectionId }),
    provider_id: value.providerId,
    model_id: value.modelId,
    connection_mode: value.connectionMode,
    capabilities: { ...value.capabilities },
    ...(value.effectiveTemperature === undefined
      ? {}
      : { effective_temperature: value.effectiveTemperature }),
    captured_at: value.capturedAt,
  };
}

export function fromJarvisModelSnapshotRow(row: JarvisModelSnapshotRow): JarvisModelSnapshot {
  return {
    ...(row.connection_id === undefined ? {} : { connectionId: row.connection_id }),
    providerId: row.provider_id,
    modelId: row.model_id,
    connectionMode: row.connection_mode,
    capabilities: { ...row.capabilities },
    ...(row.effective_temperature === undefined
      ? {}
      : { effectiveTemperature: row.effective_temperature }),
    capturedAt: row.captured_at,
  };
}

export function toJarvisSourceRefRow(value: JarvisSourceRef): JarvisSourceRefRow {
  return {
    id: value.id,
    kind: value.kind,
    label: value.label,
    ...(value.uri === undefined ? {} : { uri: value.uri }),
    account_id: value.accountId,
    ...(value.projectId === undefined ? {} : { project_id: value.projectId }),
    trust: value.trust,
    sensitivity: value.sensitivity,
    ...(value.observedAt === undefined ? {} : { observed_at: value.observedAt }),
    ...(value.contentHash === undefined ? {} : { content_hash: value.contentHash }),
  };
}

export function fromJarvisSourceRefRow(row: JarvisSourceRefRow): JarvisSourceRef {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    ...(row.uri === undefined ? {} : { uri: row.uri }),
    accountId: row.account_id,
    ...(row.project_id === undefined ? {} : { projectId: row.project_id }),
    trust: row.trust,
    sensitivity: row.sensitivity,
    ...(row.observed_at === undefined ? {} : { observedAt: row.observed_at }),
    ...(row.content_hash === undefined ? {} : { contentHash: row.content_hash }),
  };
}

export function toJarvisRunRow(value: JarvisRun): JarvisRunRow {
  assertValidJarvisRun(value);
  return {
    id: value.id,
    account_id: value.accountId,
    ...(value.workspaceId === undefined ? {} : { workspace_id: value.workspaceId }),
    ...(value.projectId === undefined ? {} : { project_id: value.projectId }),
    ...(value.chatId === undefined ? {} : { chat_id: value.chatId }),
    ...(value.parentRunId === undefined ? {} : { parent_run_id: value.parentRunId }),
    source: value.source,
    status: value.status,
    agent_id: value.agentId,
    identity_version: value.identityVersion,
    profile_revision_id: value.profileRevisionId,
    model: toJarvisModelSnapshotRow(value.model),
    created_at: value.createdAt,
    updated_at: value.updatedAt,
    ...(value.completedAt === undefined ? {} : { completed_at: value.completedAt }),
    ...(value.transportAttempts === undefined
      ? {}
      : { transport_attempts: cloneDetached([...value.transportAttempts]) }),
  };
}

export function fromJarvisRunRow(row: JarvisRunRow): JarvisRun {
  const value: JarvisRun = {
    id: row.id,
    accountId: row.account_id,
    ...(row.workspace_id === undefined ? {} : { workspaceId: row.workspace_id }),
    ...(row.project_id === undefined ? {} : { projectId: row.project_id }),
    ...(row.chat_id === undefined ? {} : { chatId: row.chat_id }),
    ...(row.parent_run_id === undefined ? {} : { parentRunId: row.parent_run_id }),
    source: row.source,
    status: row.status,
    agentId: row.agent_id,
    identityVersion: row.identity_version,
    profileRevisionId: row.profile_revision_id,
    model: fromJarvisModelSnapshotRow(row.model),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.completed_at === undefined ? {} : { completedAt: row.completed_at }),
    ...(row.transport_attempts === undefined
      ? {}
      : { transportAttempts: cloneDetached(row.transport_attempts) }),
  };
  assertValidJarvisRun(value);
  return value;
}

export function toJarvisEventRow(value: JarvisEvent): JarvisEventRow {
  assertValidJarvisEvent(value);
  return {
    run_id: value.runId,
    seq: value.seq,
    idempotency_key: value.idempotencyKey,
    type: value.type,
    ...(value.status === undefined ? {} : { status: value.status }),
    title: value.title,
    ...(value.safeSummary === undefined ? {} : { safe_summary: value.safeSummary }),
    source_refs: value.sourceRefs.map(toJarvisSourceRefRow),
    artifact_ids: [...value.artifactIds],
    created_at: value.createdAt,
    ...(value.executionEvidence === undefined
      ? {}
      : { execution_evidence: cloneDetached(value.executionEvidence) }),
    ...(value.canonicalResultEvidence === undefined
      ? {}
      : { canonical_result_evidence: cloneDetached(value.canonicalResultEvidence) }),
    ...(value.producerSourceEvidence === undefined
      ? {}
      : { producer_source_evidence: cloneDetached(value.producerSourceEvidence) }),
    ...(value.liveEvidence === undefined
      ? {}
      : { live_evidence: cloneDetached(value.liveEvidence) }),
  };
}

export function fromJarvisEventRow(row: JarvisEventRow): JarvisEvent {
  const value: JarvisEvent = {
    runId: row.run_id,
    seq: row.seq,
    idempotencyKey: row.idempotency_key,
    type: row.type,
    ...(row.status === undefined ? {} : { status: row.status }),
    title: row.title,
    ...(row.safe_summary === undefined ? {} : { safeSummary: row.safe_summary }),
    sourceRefs: row.source_refs.map(fromJarvisSourceRefRow),
    artifactIds: [...row.artifact_ids],
    createdAt: row.created_at,
    ...(row.execution_evidence === undefined
      ? {}
      : { executionEvidence: cloneDetached(row.execution_evidence) }),
    ...(row.canonical_result_evidence === undefined
      ? {}
      : { canonicalResultEvidence: cloneDetached(row.canonical_result_evidence) }),
    ...(row.producer_source_evidence === undefined
      ? {}
      : { producerSourceEvidence: cloneDetached(row.producer_source_evidence) }),
    ...(row.live_evidence === undefined ? {} : { liveEvidence: cloneDetached(row.live_evidence) }),
  };
  assertValidJarvisEvent(value);
  return value;
}

export function toJarvisApprovalRow(value: JarvisApprovalV1): JarvisApprovalRow {
  assertValidJarvisApproval(value);
  return {
    schema_version: value.schemaVersion,
    id: value.id,
    run_id: value.runId,
    request_id: value.requestId,
    attempt_number: value.attemptNumber,
    action_id: value.actionId,
    action_version: value.actionVersion,
    capability_id: value.capabilityId,
    capability_snapshot_hash: value.capabilitySnapshotHash,
    expected_effect: value.expectedEffect,
    expires_at: value.expiresAt,
    params: cloneDetached(value.params),
    ...(value.secretHandleRefs === undefined
      ? {}
      : {
          secret_handle_refs: value.secretHandleRefs.map((reference) => ({
            field: reference.field,
            handle_id: reference.handleId,
          })),
        }),
    params_hash: value.paramsHash,
    ...(value.targetSnapshot === undefined
      ? {}
      : { target_snapshot: cloneDetached(value.targetSnapshot) }),
    risk: value.risk,
    status: value.status,
    created_at: value.createdAt,
    ...(value.decidedAt === undefined ? {} : { decided_at: value.decidedAt }),
    ...(value.consumedAt === undefined ? {} : { consumed_at: value.consumedAt }),
  };
}

export function fromJarvisApprovalRow(row: JarvisApprovalRow): JarvisApprovalV1 {
  const value: JarvisApprovalV1 = {
    schemaVersion: row.schema_version,
    id: row.id,
    runId: row.run_id,
    requestId: row.request_id,
    attemptNumber: row.attempt_number,
    actionId: row.action_id,
    actionVersion: row.action_version,
    capabilityId: row.capability_id,
    capabilitySnapshotHash: row.capability_snapshot_hash,
    expectedEffect: row.expected_effect,
    expiresAt: row.expires_at,
    params: cloneDetached(row.params),
    ...(row.secret_handle_refs === undefined
      ? {}
      : {
          secretHandleRefs: row.secret_handle_refs.map((reference) => ({
            field: reference.field,
            handleId: reference.handle_id,
          })),
        }),
    paramsHash: row.params_hash,
    ...(row.target_snapshot === undefined
      ? {}
      : { targetSnapshot: cloneDetached(row.target_snapshot) }),
    risk: row.risk,
    status: row.status,
    createdAt: row.created_at,
    ...(row.decided_at === undefined ? {} : { decidedAt: row.decided_at }),
    ...(row.consumed_at === undefined ? {} : { consumedAt: row.consumed_at }),
  };
  assertValidJarvisApproval(value);
  return value;
}

export function toJarvisArtifactRow(value: JarvisArtifact): JarvisArtifactRow {
  return {
    id: value.id,
    run_id: value.runId,
    kind: value.kind,
    title: value.title,
    ...(value.uri === undefined ? {} : { uri: value.uri }),
    ...(value.mimeType === undefined ? {} : { mime_type: value.mimeType }),
    ...(value.safeSummary === undefined ? {} : { safe_summary: value.safeSummary }),
    source_refs: value.sourceRefs.map(toJarvisSourceRefRow),
    created_at: value.createdAt,
  };
}

export function fromJarvisArtifactRow(row: JarvisArtifactRow): JarvisArtifact {
  return {
    id: row.id,
    runId: row.run_id,
    kind: row.kind,
    title: row.title,
    ...(row.uri === undefined ? {} : { uri: row.uri }),
    ...(row.mime_type === undefined ? {} : { mimeType: row.mime_type }),
    ...(row.safe_summary === undefined ? {} : { safeSummary: row.safe_summary }),
    sourceRefs: row.source_refs.map(fromJarvisSourceRefRow),
    createdAt: row.created_at,
  };
}
