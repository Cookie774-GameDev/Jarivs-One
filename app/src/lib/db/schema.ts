/**
 * Dexie schema definitions for Jarvis.
 *
 * The Dexie database is named `jarvis-v1`. The DB name is historical — it
 * is NOT the schema version. Schema versioning is handled by Dexie's
 * `version().stores()` chain in `lib/db/index.ts`.
 *
 * Every browser database migration is additive. No prior store declaration is
 * altered or dropped.
 *
 * All record types come from `@/types/*` where they exist. Workspace, Project,
 * SettingsRow, and SyncQueueRow are db-internal shapes that don't have
 * user-facing types in `src/types/`, so they're defined here.
 */

import type { ProjectId, WorkspaceId } from '@/types/common';
import type {
  ContextEdgeV2,
  ContextEntityV2,
  ContextMapRecordV2,
  ContextProvenanceV2,
  ContextSourceV2,
} from '@/features/context/contracts';
import type {
  ContextAssetV2,
  ContextNoteRevisionV2,
  ContextNoteV2,
} from '@/features/context/contentContracts';
import type { ContextEmbeddingRecordV1 } from '@/features/context/semanticSearch';
import type {
  JarvisCanonicalResultEvidenceV1,
  JarvisDurableLiveEvidenceV1,
  JarvisExecutionEvidenceV1,
  JarvisProducerSourceEvidenceV1,
  JarvisScheduledRetrySnapshotV1,
  JarvisTransportAttemptV1,
} from '@/lib/jarvis/contracts/execution';

/**
 * A workspace is the top-level container in Jarvis. Multi-workspace support is
 * roadmap; V1 ships with a single "Personal" workspace seeded automatically.
 */
export type Workspace = {
  id: WorkspaceId;
  name: string;
  /** Local user id (`usr_*`) on offline-only installs, or Supabase auth user id when synced. */
  owner_id: string;
  created_at: number;
  updated_at: number;
};

/**
 * A project groups chats, terminals, tasks and memory under a workspace.
 * The Inbox project is seeded by default and behaves as the catch-all
 * bucket.
 *
 * Projects update fields:
 *   - `system_prompt_context` is prepended to every AI request that
 *     fires while this project is active. Holds the project's "house
 *     rules" — paths, conventions, DB schema, anything the user wants
 *     every model to know without re-typing.
 *   - `no_context_mode` short-circuits the prepend so the user can run
 *     a quick clean-room request without the project leaking in.
 *   - `allowed_agent_slugs` narrows the agent picker to a curated list
 *     for this project. `undefined` = "no restriction, all agents
 *     visible". Empty array = "no agents bound" (degenerate, but
 *     allowed). Slugs are matched against `Agent.slug`, not id, so the
 *     binding survives agent re-seeding.
 *   - `pane_tree_key` lets a project carry an opaque key namespace for
 *     its terminal pane tree in localStorage; reserved for migration
 *     work, not consumed today.
 */
export type Project = {
  id: ProjectId;
  workspace_id: WorkspaceId;
  name: string;
  /** HSL hue 0..359 used by the UI to colour-code the project. */
  color_hue?: number;
  /** Optional lucide icon name. */
  icon?: string;
  /** Project-level context blob prepended to AI requests. */
  system_prompt_context?: string;
  /** When true, the context blob is skipped on every request. */
  no_context_mode?: boolean;
  /** Optional curated agent slug allowlist for this project. */
  allowed_agent_slugs?: string[];
  created_at: number;
  updated_at: number;
};

/**
 * One row in the simple key/value settings store.
 * Values are stored as raw JSON-serialisable values; consumers handle typing
 * at the call site via `settingsRepo.get<T>(key)`.
 */
export type SettingsRow = {
  key: string;
  value: unknown;
  updated_at: number;
};

/**
 * Operation kind for an outbound sync mutation.
 */
export type SyncOp = 'insert' | 'update' | 'delete';

/**
 * Lifecycle of a row in the sync queue.
 */
export type SyncStatus = 'pending' | 'in_progress' | 'done' | 'error';

/**
 * One pending mutation that needs to be flushed to Supabase when cloud sync
 * is enabled. Local-only - never sent to the cloud itself.
 */
export type SyncQueueRow = {
  id: string;
  op: SyncOp;
  /** Logical table name in both Dexie and Supabase. */
  table: string;
  /** Primary key of the affected row. */
  row_id: string;
  /** For insert/update: the full row payload. For delete: ignored. */
  payload: unknown;
  /** Last attempt timestamp (unix ms). */
  attempted_at?: number;
  status: SyncStatus;
  /** Last error string if status === 'error'. */
  error?: string;
  created_at: number;
};

export type JarvisModelSnapshotRow = {
  connection_id?: string;
  provider_id: string;
  model_id: string;
  connection_mode: 'native-api' | 'external-cli' | 'local';
  capabilities: Record<string, boolean>;
  effective_temperature?: number;
  captured_at: number;
};

export type JarvisSourceRefRow = {
  id: string;
  kind:
    | 'user_message'
    | 'chat'
    | 'project'
    | 'project_file'
    | 'context_node'
    | 'memory'
    | 'terminal'
    | 'tool_result'
    | 'plugin'
    | 'mcp'
    | 'web'
    | 'schedule'
    | 'artifact'
    | 'agent_output';
  label: string;
  uri?: string;
  account_id: string;
  project_id?: string;
  trust: 'user_direct' | 'app_verified' | 'external_untrusted';
  origin?: 'user_authored' | 'app_observed' | 'model_inference' | 'mixed' | 'external_retrieved';
  sensitivity: 'public' | 'private' | 'restricted' | 'secret';
  observed_at?: number;
  content_hash?: string;
};

export type JarvisIdentityRevisionRow = {
  id: string;
  identity_id: 'jarvis';
  version: number;
  core_hash: string;
  response_contract_hash: string;
  created_at: number;
};

export type JarvisProfileRow = {
  id: string;
  account_id: string;
  name: string;
  active: 0 | 1;
  identity_version: number;
  revision_id: string;
  soul_revision_id?: string;
  custom_instructions: string;
  instruction_source: 'none' | 'user' | 'legacy_user_extension';
  memory_scope: 'none' | 'profile' | 'shared_selected';
  voice_enabled: boolean;
  source_prompt_hash?: string;
  created_at: number;
  updated_at: number;
  migration_version: 3;
  migration_source: 'legacy_agent' | 'clean_default';
  migration_source_prompt_hash?: string;
  migration_completed_at: number;
};

export type JarvisRunRow = {
  id: string;
  account_id: string;
  workspace_id?: string;
  project_id?: string;
  chat_id?: string;
  parent_run_id?: string;
  source: 'typed_chat' | 'voice' | 'schedule' | 'hive_final' | 'phone' | 'browser_chat';
  status:
    | 'queued'
    | 'compiling'
    | 'running'
    | 'awaiting_approval'
    | 'partial'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'timed_out';
  agent_id: string;
  identity_version: number;
  profile_revision_id: string;
  model: JarvisModelSnapshotRow;
  created_at: number;
  updated_at: number;
  completed_at?: number;
  scheduled_retry_snapshot?: JarvisScheduledRetrySnapshotV1;
  hive_stack_plan?: import('@/lib/jarvis/contracts/execution').JarvisHiveStackPlanV1;
  transport_attempts?: JarvisTransportAttemptV1[];
};

export type JarvisEventRow = {
  run_id: string;
  seq: number;
  idempotency_key: string;
  type:
    | 'run_state'
    | 'model'
    | 'context'
    | 'retrieval'
    | 'tool'
    | 'terminal'
    | 'approval'
    | 'artifact'
    | 'message'
    | 'warning'
    | 'error';
  status?: string;
  title: string;
  safe_summary?: string;
  source_refs: JarvisSourceRefRow[];
  artifact_ids: string[];
  created_at: number;
  execution_evidence?: JarvisExecutionEvidenceV1;
  canonical_result_evidence?: JarvisCanonicalResultEvidenceV1;
  producer_source_evidence?: JarvisProducerSourceEvidenceV1;
  live_evidence?: JarvisDurableLiveEvidenceV1;
};

export type JarvisApprovalRow = {
  schema_version: 1;
  id: string;
  run_id: string;
  request_id: string;
  attempt_number: number;
  action_id: string;
  action_version: number;
  capability_id: string;
  capability_snapshot_hash: string;
  expected_effect: string;
  expires_at: number;
  params: unknown;
  secret_handle_refs?: { field: string; handle_id: string }[];
  params_hash: string;
  target_snapshot?: unknown;
  risk: 'safe' | 'confirm' | 'dangerous';
  status: 'pending' | 'approved' | 'denied' | 'expired' | 'consumed';
  created_at: number;
  decided_at?: number;
  consumed_at?: number;
};

export type JarvisArtifactRow = {
  schema_version: 1;
  id: string;
  run_id: string;
  request_id: string;
  attempt_number: number;
  state: 'ready' | 'partial' | 'quarantined';
  kind:
    | 'file'
    | 'link'
    | 'text'
    | 'image'
    | 'document'
    | 'code'
    | 'terminal_output'
    | 'provider_result';
  title: string;
  uri?: string;
  mime_type?: string;
  safe_summary?: string;
  content_hash?: string;
  size_bytes?: number;
  preview?: {
    kind: 'text' | 'image' | 'none';
    text?: string;
    truncated: boolean;
    size_bytes: number;
  };
  local_reference?: {
    kind: 'path' | 'blob_key' | 'message_part';
    value: string;
  };
  source_refs: JarvisSourceRefRow[];
  created_at: number;
};

export type ContextMapRow = ContextMapRecordV2;
export type ContextSourceRow = ContextSourceV2;
export type ContextEntityRow = ContextEntityV2;
export type ContextEdgeRow = ContextEdgeV2;
export type ContextProvenanceRow = ContextProvenanceV2;
export type ContextNoteRow = ContextNoteV2;
export type ContextNoteRevisionRow = ContextNoteRevisionV2;
export type ContextAssetRow = ContextAssetV2;
export type ContextEmbeddingRow = ContextEmbeddingRecordV1;

export type ContextMigrationBackupRow = {
  version: 1;
  id: string;
  accountId: string;
  projectId: string | null;
  status: 'prepared' | 'verified' | 'rolled_back';
  legacyKeys: string[];
  legacyValues: Record<string, string | null>;
  expectedMapCount: number;
  migratedMapCount: number;
  migratedMapIds: string[];
  rollbackAvailable: true;
  createdAt: number;
  verifiedAt?: number;
  rolledBackAt?: number;
};

export type ContextQuarantineRecordKind =
  | 'map'
  | 'source'
  | 'entity'
  | 'edge'
  | 'provenance'
  | 'legacy_collection'
  | 'legacy_selected_tree'
  | 'legacy_selected_file'
  | 'legacy_map_metadata';

export type ContextQuarantineRow = {
  version: 1;
  id: string;
  accountId: string;
  mapId?: string;
  recordKind: ContextQuarantineRecordKind;
  reason: string;
  raw: unknown;
  recoveryOptions: Array<'retry' | 'restore_backup' | 'export_then_discard'>;
  quarantinedAt: number;
};

export const DB_NAME = 'jarvis-v1';
/** Current schema version — bumped to 6 for local Context embedding records. */
export const DB_VERSION = 6;

/**
 * Dexie store schema strings.
 *
 * Index syntax:
 *   - first column = primary key
 *   - `&col` = unique secondary index
 *   - `[a+b]` = compound index
 *
 * Only indexed columns are listed; all other fields are stored without an index.
 */

/**
 * V1 schema. Pinned for replay so existing users migrate cleanly.
 * Do not edit retroactively.
 */
// prettier-ignore
export const STORES_V1 = {
  workspaces: 'id, name, owner_id, updated_at',
  projects: 'id, workspace_id, name, updated_at',
  chats:
    'id, workspace_id, project_id, [archived+updated_at], updated_at',
  messages: 'id, chat_id, [chat_id+created_at], parent_id',
  agents: 'id, &slug',
  tasks:
    'id, workspace_id, project_id, status, [status+priority], due_at, scheduled_for, [workspace_id+status]',
  memory_items:
    'id, workspace_id, project_id, agent_id, [workspace_id+source], last_accessed_at',
  settings: 'key',
  sync_queue: 'id, status, created_at',
} as const;

/**
 * V2 schema = V1 + additive tables for events, quick links, terminals and
 * integrations. Existing V1 tables are unchanged so this requires no data
 * migration — Dexie's auto-migration just creates the new object stores.
 *
 * Index decisions:
 *   events:                workspace+start range queries (DayGrid), status filter
 *   quick_links:           workspace+position for ordered lists, group_id+position
 *                          for grouped views, last_used_at for "stale links"
 *   quick_link_groups:     workspace+position for ordered group rendering
 *   terminal_presets:      compound `&[workspace_id+slug]` per X1 verifier
 *   terminal_sessions:     project+status for "running PTYs in this project",
 *                          last_active_at for recency
 *   terminal_scrollback:   compound pkey [session_id+chunk_seq], session_id
 *                          for cleanup queries
 *   terminal_layouts:      project_id is the pkey (single layout per project)
 *   integrations:          unique kind so at most one per kind per user
 */
// prettier-ignore
export const STORES_V2 = {
  ...STORES_V1,
  events:
    'id, workspace_id, project_id, start_at, [workspace_id+start_at], status',
  quick_links:
    'id, workspace_id, group_id, [workspace_id+position], [workspace_id+group_id+position], last_used_at',
  quick_link_groups: 'id, workspace_id, [workspace_id+position]',
  terminal_presets: 'id, workspace_id, &[workspace_id+slug]',
  terminal_sessions:
    'id, project_id, workspace_id, status, [project_id+status], last_active_at',
  terminal_scrollback:
    '[session_id+chunk_seq], session_id, created_at',
  terminal_layouts: 'project_id, updated_at',
  integrations: 'id, &kind',
} as const;

/** V3 schema = V2 + immutable Shared Intelligence Kernel stores. */
export const STORES_V3 = {
  ...STORES_V2,
  jarvis_identity_revisions: 'id, identity_id, version, &[identity_id+version], created_at',
  jarvis_profiles: 'id, account_id, [account_id+active], updated_at',
  jarvis_runs:
    'id, account_id, chat_id, parent_run_id, status, [account_id+updated_at], [chat_id+created_at]',
  jarvis_events:
    '[run_id+seq], run_id, idempotency_key, &[run_id+idempotency_key], type, status, created_at',
  jarvis_approvals: 'id, run_id, status, params_hash, created_at',
  jarvis_artifacts: 'id, run_id, kind, created_at',
} as const;

/** V4 schema = V3 + implemented Context Map 2.0 records and recovery infrastructure. */
// prettier-ignore
export const STORES_V4 = {
  ...STORES_V3,
  context_maps:
    'id, accountId, projectId, status, [accountId+updatedAt], [accountId+projectId], [accountId+status]',
  context_sources:
    'id, accountId, mapId, kind, status, [accountId+mapId], [mapId+status], updatedAt',
  context_entities:
    'id, accountId, mapId, sourceId, kind, [accountId+mapId], [mapId+kind], [sourceId+kind], updatedAt',
  context_edges:
    'id, accountId, mapId, sourceEntityId, targetEntityId, kind, [accountId+mapId], [sourceEntityId+kind], [targetEntityId+kind], updatedAt',
  context_provenance:
    'id, accountId, mapId, targetKind, targetId, sourceId, [accountId+mapId], [targetKind+targetId], [sourceId+targetKind], extractedAt',
  context_migration_backups:
    'id, accountId, projectId, status, [accountId+projectId], createdAt',
  context_quarantine:
    'id, accountId, mapId, recordKind, [accountId+mapId], quarantinedAt',
} as const;

/** V5 schema = V4 + Context note, revision, and asset metadata records. */
// prettier-ignore
export const STORES_V5 = {
  ...STORES_V4,
  context_notes:
    'id, accountId, mapId, entityId, sourceId, currentRevisionId, [accountId+mapId], [mapId+status], [accountId+updatedAt]',
  context_note_revisions:
    'id, accountId, mapId, noteId, &[noteId+sequence], [accountId+mapId], [accountId+noteId], createdAt',
  context_assets:
    'id, accountId, mapId, entityId, sourceId, kind, status, [accountId+mapId], [entityId+kind], [sourceId+kind], [mapId+status], [accountId+updatedAt]',
} as const;

/** V6 schema = V5 + local-only Context embedding vectors and version/provenance metadata. */
// prettier-ignore
export const STORES_V6 = {
  ...STORES_V5,
  context_embeddings:
    'id, accountId, mapId, documentId, sourceId, providerKind, providerId, modelId, embeddingVersion, [accountId+mapId], [accountId+mapId+documentId], [accountId+mapId+embeddingVersion], updatedAt',
} as const;

export const STORES = STORES_V6;

export type StoreName = keyof typeof STORES;
