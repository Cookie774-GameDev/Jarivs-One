import { describe, expect, expectTypeOf, it } from 'vitest';
import type { JarvisModelSnapshot } from '@/lib/jarvis/contracts/capability';
import type {
  JarvisApproval,
  JarvisArtifact,
  JarvisEvent,
  JarvisRun,
} from '@/lib/jarvis/contracts/execution';
import type { JarvisSourceRef } from '@/lib/jarvis/contracts/source';
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
import * as mapperSurface from './jarvisMappers';
import {
  fromJarvisApprovalRow,
  fromJarvisArtifactRow,
  fromJarvisEventRow,
  fromJarvisIdentityRevisionRow,
  fromJarvisModelSnapshotRow,
  fromJarvisProfileRow,
  fromJarvisRunRow,
  fromJarvisSourceRefRow,
  toJarvisApprovalRow,
  toJarvisArtifactRow,
  toJarvisEventRow,
  toJarvisIdentityRevisionRow,
  toJarvisModelSnapshotRow,
  toJarvisProfileRow,
  toJarvisRunRow,
  toJarvisSourceRefRow,
  type JarvisProfileMigrationMetadata,
} from './jarvisMappers';

const identityRevision: JarvisIdentityRevision = {
  id: 'identity-revision-1',
  identityId: 'jarvis',
  version: 1,
  coreHash: 'core-hash',
  responseContractHash: 'response-contract-hash',
  createdAt: 1_000,
};

const profile: JarvisProfile = {
  id: 'profile-1',
  revisionId: 'profile-revision-1',
  accountId: 'account-1',
  name: 'Jarvis',
  customInstructions: 'Use concise prose.',
  instructionSource: 'user',
  memoryScope: 'shared_selected',
  voiceEnabled: true,
  active: true,
  identityVersion: 1,
  soulRevisionId: 'soul-revision-1',
  sourcePromptHash: 'source-prompt-hash',
  createdAt: 2_000,
  updatedAt: 2_500,
};

const migration: JarvisProfileMigrationMetadata = {
  migrationVersion: 3,
  migrationSource: 'legacy_agent',
  migrationSourcePromptHash: 'migration-source-prompt-hash',
  migrationCompletedAt: 2_250,
};

function modelSnapshot(): JarvisModelSnapshot {
  return {
    connectionId: 'connection-1',
    providerId: 'provider-1',
    modelId: 'model-1',
    connectionMode: 'native-api',
    capabilities: { vision: true, tools: false },
    effectiveTemperature: 0.25,
    capturedAt: 3_000,
  };
}

function sourceRef(): JarvisSourceRef {
  return {
    id: 'source-1',
    kind: 'project_file',
    label: 'Architecture',
    uri: 'file:///architecture.md',
    accountId: 'account-1',
    projectId: 'project-1',
    trust: 'app_verified',
    sensitivity: 'private',
    observedAt: 3_100,
    contentHash: 'content-hash',
  };
}

function run(): JarvisRun {
  return {
    id: 'run-1',
    accountId: 'account-1',
    workspaceId: 'workspace-1',
    projectId: 'project-1',
    chatId: 'chat-1',
    parentRunId: 'run-parent',
    source: 'typed_chat',
    status: 'running',
    agentId: 'agent-1',
    identityVersion: 1,
    profileRevisionId: 'profile-revision-1',
    model: modelSnapshot(),
    createdAt: 4_000,
    updatedAt: 4_100,
    completedAt: 4_200,
  };
}

function event(): JarvisEvent {
  return {
    runId: 'run-1',
    seq: 7,
    idempotencyKey: 'event-key-1',
    type: 'artifact',
    status: 'completed',
    title: 'Artifact created',
    safeSummary: 'Created the requested artifact.',
    sourceRefs: [sourceRef()],
    artifactIds: ['artifact-1'],
    createdAt: 5_000,
  };
}

function approval(): JarvisApproval {
  return {
    id: 'approval-1',
    runId: 'run-1',
    actionId: 'action-1',
    actionVersion: 2,
    params: { command: 'deploy', targets: [{ id: 'target-1', enabled: true }] },
    secretHandleRefs: [{ field: 'token', handleId: 'secret-handle-1' }],
    paramsHash: 'params-hash',
    targetSnapshot: { target: { id: 'target-1' }, checks: ['fresh', 'owned'] },
    risk: 'confirm',
    status: 'approved',
    createdAt: 6_000,
    decidedAt: 6_100,
    consumedAt: 6_200,
  };
}

function artifact(): JarvisArtifact {
  return {
    id: 'artifact-1',
    runId: 'run-1',
    kind: 'document',
    title: 'Implementation plan',
    uri: 'file:///implementation-plan.md',
    mimeType: 'text/markdown',
    safeSummary: 'A detached plan artifact.',
    sourceRefs: [sourceRef()],
    createdAt: 7_000,
  };
}

describe('jarvis mapper surface', () => {
  it('exports only the exact mapper functions with exact callable types', () => {
    expect(Object.keys(mapperSurface).sort()).toEqual(
      [
        'fromJarvisApprovalRow',
        'fromJarvisArtifactRow',
        'fromJarvisEventRow',
        'fromJarvisIdentityRevisionRow',
        'fromJarvisModelSnapshotRow',
        'fromJarvisProfileRow',
        'fromJarvisRunRow',
        'fromJarvisSourceRefRow',
        'toJarvisApprovalRow',
        'toJarvisArtifactRow',
        'toJarvisEventRow',
        'toJarvisIdentityRevisionRow',
        'toJarvisModelSnapshotRow',
        'toJarvisProfileRow',
        'toJarvisRunRow',
        'toJarvisSourceRefRow',
      ].sort(),
    );

    expectTypeOf(toJarvisIdentityRevisionRow).toEqualTypeOf<
      (value: JarvisIdentityRevision) => JarvisIdentityRevisionRow
    >();
    expectTypeOf(fromJarvisIdentityRevisionRow).toEqualTypeOf<
      (row: JarvisIdentityRevisionRow) => JarvisIdentityRevision
    >();
    expectTypeOf(toJarvisProfileRow).toEqualTypeOf<
      (input: {
        profile: JarvisProfile;
        migration: JarvisProfileMigrationMetadata;
      }) => JarvisProfileRow
    >();
    expectTypeOf(fromJarvisProfileRow).toEqualTypeOf<
      (row: JarvisProfileRow) => {
        profile: JarvisProfile;
        migration: JarvisProfileMigrationMetadata;
      }
    >();
    expectTypeOf(toJarvisRunRow).toEqualTypeOf<(value: JarvisRun) => JarvisRunRow>();
    expectTypeOf(fromJarvisRunRow).toEqualTypeOf<(row: JarvisRunRow) => JarvisRun>();
    expectTypeOf(toJarvisEventRow).toEqualTypeOf<(value: JarvisEvent) => JarvisEventRow>();
    expectTypeOf(fromJarvisEventRow).toEqualTypeOf<(row: JarvisEventRow) => JarvisEvent>();
    expectTypeOf(toJarvisApprovalRow).toEqualTypeOf<(value: JarvisApproval) => JarvisApprovalRow>();
    expectTypeOf(fromJarvisApprovalRow).toEqualTypeOf<(row: JarvisApprovalRow) => JarvisApproval>();
    expectTypeOf(toJarvisArtifactRow).toEqualTypeOf<(value: JarvisArtifact) => JarvisArtifactRow>();
    expectTypeOf(fromJarvisArtifactRow).toEqualTypeOf<(row: JarvisArtifactRow) => JarvisArtifact>();
    expectTypeOf(toJarvisModelSnapshotRow).toEqualTypeOf<
      (value: JarvisModelSnapshot) => JarvisModelSnapshotRow
    >();
    expectTypeOf(fromJarvisModelSnapshotRow).toEqualTypeOf<
      (row: JarvisModelSnapshotRow) => JarvisModelSnapshot
    >();
    expectTypeOf(toJarvisSourceRefRow).toEqualTypeOf<
      (value: JarvisSourceRef) => JarvisSourceRefRow
    >();
    expectTypeOf(fromJarvisSourceRefRow).toEqualTypeOf<
      (row: JarvisSourceRefRow) => JarvisSourceRef
    >();
  });
});

describe('identity and profile mappers', () => {
  it('maps every identity revision key explicitly and round-trips it', () => {
    const row = toJarvisIdentityRevisionRow(identityRevision);

    expect(row).toEqual({
      id: 'identity-revision-1',
      identity_id: 'jarvis',
      version: 1,
      core_hash: 'core-hash',
      response_contract_hash: 'response-contract-hash',
      created_at: 1_000,
    });
    expect(fromJarvisIdentityRevisionRow(row)).toEqual(identityRevision);
  });

  it('maps profile, migration metadata, and boolean active explicitly in both directions', () => {
    const row = toJarvisProfileRow({ profile, migration });

    expect(row).toEqual({
      id: 'profile-1',
      account_id: 'account-1',
      name: 'Jarvis',
      active: 1,
      identity_version: 1,
      revision_id: 'profile-revision-1',
      soul_revision_id: 'soul-revision-1',
      custom_instructions: 'Use concise prose.',
      instruction_source: 'user',
      memory_scope: 'shared_selected',
      voice_enabled: true,
      source_prompt_hash: 'source-prompt-hash',
      created_at: 2_000,
      updated_at: 2_500,
      migration_version: 3,
      migration_source: 'legacy_agent',
      migration_source_prompt_hash: 'migration-source-prompt-hash',
      migration_completed_at: 2_250,
    });
    const mapped = fromJarvisProfileRow(row);
    expect(mapped).toEqual({ profile, migration });
    expect(mapped.profile).not.toBe(profile);
    expect(mapped.migration).not.toBe(migration);

    const inactive = toJarvisProfileRow({
      profile: { ...profile, active: false },
      migration,
    });
    expect(inactive.active).toBe(0);
    expect(fromJarvisProfileRow(inactive).profile.active).toBe(false);
  });

  it('omits absent profile and migration optional keys in both directions', () => {
    const minimalProfile: JarvisProfile = {
      id: 'profile-minimal',
      revisionId: 'profile-revision-minimal',
      accountId: 'account-1',
      name: 'Jarvis',
      customInstructions: '',
      instructionSource: 'none',
      memoryScope: 'none',
      voiceEnabled: false,
      active: false,
      identityVersion: 1,
      createdAt: 8_000,
      updatedAt: 8_000,
    };
    const minimalMigration: JarvisProfileMigrationMetadata = {
      migrationVersion: 3,
      migrationSource: 'clean_default',
      migrationCompletedAt: 8_000,
    };

    const row = toJarvisProfileRow({
      profile: minimalProfile,
      migration: minimalMigration,
    });
    expect(row).not.toHaveProperty('soul_revision_id');
    expect(row).not.toHaveProperty('source_prompt_hash');
    expect(row).not.toHaveProperty('migration_source_prompt_hash');

    const mapped = fromJarvisProfileRow(row);
    expect(mapped.profile).not.toHaveProperty('soulRevisionId');
    expect(mapped.profile).not.toHaveProperty('sourcePromptHash');
    expect(mapped.migration).not.toHaveProperty('migrationSourcePromptHash');
    expect(mapped).toEqual({ profile: minimalProfile, migration: minimalMigration });
  });
});

describe('model snapshot and source reference mappers', () => {
  it('maps a model snapshot exactly and deeply detaches capabilities both ways', () => {
    const value = modelSnapshot();
    const row = toJarvisModelSnapshotRow(value);

    expect(row).toEqual({
      connection_id: 'connection-1',
      provider_id: 'provider-1',
      model_id: 'model-1',
      connection_mode: 'native-api',
      capabilities: { vision: true, tools: false },
      effective_temperature: 0.25,
      captured_at: 3_000,
    });
    expect(row.capabilities).not.toBe(value.capabilities);
    row.capabilities.vision = false;
    expect(value.capabilities.vision).toBe(true);

    const sourceRow: JarvisModelSnapshotRow = {
      ...row,
      capabilities: { vision: true, tools: false },
    };
    const mapped = fromJarvisModelSnapshotRow(sourceRow);
    expect(mapped.capabilities).not.toBe(sourceRow.capabilities);
    mapped.capabilities.tools = true;
    expect(sourceRow.capabilities.tools).toBe(false);
  });

  it('maps a source reference exactly and round-trips all optional fields', () => {
    const value = sourceRef();
    const row = toJarvisSourceRefRow(value);

    expect(row).toEqual({
      id: 'source-1',
      kind: 'project_file',
      label: 'Architecture',
      uri: 'file:///architecture.md',
      account_id: 'account-1',
      project_id: 'project-1',
      trust: 'app_verified',
      sensitivity: 'private',
      observed_at: 3_100,
      content_hash: 'content-hash',
    });
    expect(fromJarvisSourceRefRow(row)).toEqual(value);
  });

  it('omits absent model and source-reference optional keys in both directions', () => {
    const model: JarvisModelSnapshot = {
      providerId: 'provider-minimal',
      modelId: 'model-minimal',
      connectionMode: 'local',
      capabilities: {},
      capturedAt: 9_000,
    };
    const modelRow = toJarvisModelSnapshotRow(model);
    expect(modelRow).not.toHaveProperty('connection_id');
    expect(modelRow).not.toHaveProperty('effective_temperature');
    const mappedModel = fromJarvisModelSnapshotRow(modelRow);
    expect(mappedModel).not.toHaveProperty('connectionId');
    expect(mappedModel).not.toHaveProperty('effectiveTemperature');

    const source: JarvisSourceRef = {
      id: 'source-minimal',
      kind: 'user_message',
      label: 'User message',
      accountId: 'account-1',
      trust: 'user_direct',
      sensitivity: 'private',
    };
    const sourceRow = toJarvisSourceRefRow(source);
    for (const key of ['uri', 'project_id', 'observed_at', 'content_hash']) {
      expect(sourceRow).not.toHaveProperty(key);
    }
    const mappedSource = fromJarvisSourceRefRow(sourceRow);
    for (const key of ['uri', 'projectId', 'observedAt', 'contentHash']) {
      expect(mappedSource).not.toHaveProperty(key);
    }
  });
});

describe('run and event mappers', () => {
  it('maps a run exactly, round-trips it, and deeply detaches its nested model both ways', () => {
    const value = run();
    const row = toJarvisRunRow(value);

    expect(row).toEqual({
      id: 'run-1',
      account_id: 'account-1',
      workspace_id: 'workspace-1',
      project_id: 'project-1',
      chat_id: 'chat-1',
      parent_run_id: 'run-parent',
      source: 'typed_chat',
      status: 'running',
      agent_id: 'agent-1',
      identity_version: 1,
      profile_revision_id: 'profile-revision-1',
      model: {
        connection_id: 'connection-1',
        provider_id: 'provider-1',
        model_id: 'model-1',
        connection_mode: 'native-api',
        capabilities: { vision: true, tools: false },
        effective_temperature: 0.25,
        captured_at: 3_000,
      },
      created_at: 4_000,
      updated_at: 4_100,
      completed_at: 4_200,
    });
    expect(row.model).not.toBe(value.model);
    expect(row.model.capabilities).not.toBe(value.model.capabilities);
    row.model.capabilities.vision = false;
    expect(value.model.capabilities.vision).toBe(true);

    const sourceRow = toJarvisRunRow(run());
    const mapped = fromJarvisRunRow(sourceRow);
    expect(mapped).toEqual(run());
    expect(mapped.model).not.toBe(sourceRow.model);
    expect(mapped.model.capabilities).not.toBe(sourceRow.model.capabilities);
    mapped.model.capabilities.tools = true;
    expect(sourceRow.model.capabilities.tools).toBe(false);
  });

  it('maps an event exactly, round-trips it, and deeply detaches both nested arrays', () => {
    const value = event();
    const row = toJarvisEventRow(value);

    expect(row).toEqual({
      run_id: 'run-1',
      seq: 7,
      idempotency_key: 'event-key-1',
      type: 'artifact',
      status: 'completed',
      title: 'Artifact created',
      safe_summary: 'Created the requested artifact.',
      source_refs: [
        {
          id: 'source-1',
          kind: 'project_file',
          label: 'Architecture',
          uri: 'file:///architecture.md',
          account_id: 'account-1',
          project_id: 'project-1',
          trust: 'app_verified',
          sensitivity: 'private',
          observed_at: 3_100,
          content_hash: 'content-hash',
        },
      ],
      artifact_ids: ['artifact-1'],
      created_at: 5_000,
    });
    expect(row.source_refs).not.toBe(value.sourceRefs);
    expect(row.source_refs[0]).not.toBe(value.sourceRefs[0]);
    expect(row.artifact_ids).not.toBe(value.artifactIds);
    row.source_refs[0]!.label = 'Changed row label';
    row.artifact_ids.push('artifact-2');
    expect(value.sourceRefs[0]!.label).toBe('Architecture');
    expect(value.artifactIds).toEqual(['artifact-1']);

    const sourceRow = toJarvisEventRow(event());
    const mapped = fromJarvisEventRow(sourceRow);
    expect(mapped).toEqual(event());
    expect(mapped.sourceRefs).not.toBe(sourceRow.source_refs);
    expect(mapped.sourceRefs[0]).not.toBe(sourceRow.source_refs[0]);
    expect(mapped.artifactIds).not.toBe(sourceRow.artifact_ids);
    mapped.sourceRefs[0]!.label = 'Changed domain label';
    mapped.artifactIds.push('artifact-2');
    expect(sourceRow.source_refs[0]!.label).toBe('Architecture');
    expect(sourceRow.artifact_ids).toEqual(['artifact-1']);
  });

  it('omits absent run and event optional keys in both directions', () => {
    const minimalRun: JarvisRun = {
      id: 'run-minimal',
      accountId: 'account-1',
      source: 'voice',
      status: 'queued',
      agentId: 'agent-1',
      identityVersion: 1,
      profileRevisionId: 'profile-revision-1',
      model: modelSnapshot(),
      createdAt: 10_000,
      updatedAt: 10_000,
    };
    const runRow = toJarvisRunRow(minimalRun);
    for (const key of ['workspace_id', 'project_id', 'chat_id', 'parent_run_id', 'completed_at']) {
      expect(runRow).not.toHaveProperty(key);
    }
    const mappedRun = fromJarvisRunRow(runRow);
    for (const key of ['workspaceId', 'projectId', 'chatId', 'parentRunId', 'completedAt']) {
      expect(mappedRun).not.toHaveProperty(key);
    }

    const minimalEvent: JarvisEvent = {
      runId: 'run-minimal',
      seq: 1,
      idempotencyKey: 'event-minimal',
      type: 'message',
      title: 'Message',
      sourceRefs: [],
      artifactIds: [],
      createdAt: 10_100,
    };
    const eventRow = toJarvisEventRow(minimalEvent);
    expect(eventRow).not.toHaveProperty('status');
    expect(eventRow).not.toHaveProperty('safe_summary');
    const mappedEvent = fromJarvisEventRow(eventRow);
    expect(mappedEvent).not.toHaveProperty('status');
    expect(mappedEvent).not.toHaveProperty('safeSummary');
  });
});

describe('approval and artifact mappers', () => {
  it('maps an approval exactly, round-trips it, and deeply detaches every nested value both ways', () => {
    const value = approval();
    const row = toJarvisApprovalRow(value);

    expect(row).toEqual({
      id: 'approval-1',
      run_id: 'run-1',
      action_id: 'action-1',
      action_version: 2,
      params: { command: 'deploy', targets: [{ id: 'target-1', enabled: true }] },
      secret_handle_refs: [{ field: 'token', handle_id: 'secret-handle-1' }],
      params_hash: 'params-hash',
      target_snapshot: { target: { id: 'target-1' }, checks: ['fresh', 'owned'] },
      risk: 'confirm',
      status: 'approved',
      created_at: 6_000,
      decided_at: 6_100,
      consumed_at: 6_200,
    });
    expect(row.params).not.toBe(value.params);
    expect(row.secret_handle_refs).not.toBe(value.secretHandleRefs);
    expect(row.secret_handle_refs![0]).not.toBe(value.secretHandleRefs![0]);
    expect(row.target_snapshot).not.toBe(value.targetSnapshot);
    (row.params as { targets: { enabled: boolean }[] }).targets[0]!.enabled = false;
    row.secret_handle_refs![0]!.field = 'changed';
    (row.target_snapshot as { checks: string[] }).checks.push('changed');
    expect((value.params as { targets: { enabled: boolean }[] }).targets[0]!.enabled).toBe(true);
    expect(value.secretHandleRefs![0]!.field).toBe('token');
    expect((value.targetSnapshot as { checks: string[] }).checks).toEqual(['fresh', 'owned']);

    const sourceRow = toJarvisApprovalRow(approval());
    const mapped = fromJarvisApprovalRow(sourceRow);
    expect(mapped).toEqual(approval());
    expect(mapped.params).not.toBe(sourceRow.params);
    expect(mapped.secretHandleRefs).not.toBe(sourceRow.secret_handle_refs);
    expect(mapped.secretHandleRefs![0]).not.toBe(sourceRow.secret_handle_refs![0]);
    expect(mapped.targetSnapshot).not.toBe(sourceRow.target_snapshot);
    (mapped.params as { targets: { enabled: boolean }[] }).targets[0]!.enabled = false;
    mapped.secretHandleRefs![0]!.field = 'changed';
    (mapped.targetSnapshot as { checks: string[] }).checks.push('changed');
    expect((sourceRow.params as { targets: { enabled: boolean }[] }).targets[0]!.enabled).toBe(
      true,
    );
    expect(sourceRow.secret_handle_refs![0]!.field).toBe('token');
    expect((sourceRow.target_snapshot as { checks: string[] }).checks).toEqual(['fresh', 'owned']);
  });

  it('maps an artifact exactly, round-trips it, and deeply detaches source references both ways', () => {
    const value = artifact();
    const row = toJarvisArtifactRow(value);

    expect(row).toEqual({
      id: 'artifact-1',
      run_id: 'run-1',
      kind: 'document',
      title: 'Implementation plan',
      uri: 'file:///implementation-plan.md',
      mime_type: 'text/markdown',
      safe_summary: 'A detached plan artifact.',
      source_refs: [toJarvisSourceRefRow(sourceRef())],
      created_at: 7_000,
    });
    expect(row.source_refs).not.toBe(value.sourceRefs);
    expect(row.source_refs[0]).not.toBe(value.sourceRefs[0]);
    row.source_refs[0]!.label = 'Changed row label';
    expect(value.sourceRefs[0]!.label).toBe('Architecture');

    const sourceRow = toJarvisArtifactRow(artifact());
    const mapped = fromJarvisArtifactRow(sourceRow);
    expect(mapped).toEqual(artifact());
    expect(mapped.sourceRefs).not.toBe(sourceRow.source_refs);
    expect(mapped.sourceRefs[0]).not.toBe(sourceRow.source_refs[0]);
    mapped.sourceRefs[0]!.label = 'Changed domain label';
    expect(sourceRow.source_refs[0]!.label).toBe('Architecture');
  });

  it('omits absent approval and artifact optional keys in both directions', () => {
    const minimalApproval: JarvisApproval = {
      id: 'approval-minimal',
      runId: 'run-1',
      actionId: 'action-minimal',
      actionVersion: 1,
      params: null,
      paramsHash: 'params-minimal-hash',
      risk: 'safe',
      status: 'pending',
      createdAt: 11_000,
    };
    const approvalRow = toJarvisApprovalRow(minimalApproval);
    for (const key of ['secret_handle_refs', 'target_snapshot', 'decided_at', 'consumed_at']) {
      expect(approvalRow).not.toHaveProperty(key);
    }
    const mappedApproval = fromJarvisApprovalRow(approvalRow);
    for (const key of ['secretHandleRefs', 'targetSnapshot', 'decidedAt', 'consumedAt']) {
      expect(mappedApproval).not.toHaveProperty(key);
    }

    const minimalArtifact: JarvisArtifact = {
      id: 'artifact-minimal',
      runId: 'run-1',
      kind: 'text',
      title: 'Minimal artifact',
      sourceRefs: [],
      createdAt: 11_100,
    };
    const artifactRow = toJarvisArtifactRow(minimalArtifact);
    for (const key of ['uri', 'mime_type', 'safe_summary']) {
      expect(artifactRow).not.toHaveProperty(key);
    }
    const mappedArtifact = fromJarvisArtifactRow(artifactRow);
    for (const key of ['uri', 'mimeType', 'safeSummary']) {
      expect(mappedArtifact).not.toHaveProperty(key);
    }
  });
});
