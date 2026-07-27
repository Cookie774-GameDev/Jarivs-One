/**
 * Dexie database singleton for Jarvis.
 *
 * Usage:
 *   import { db, openDb } from '@/lib/db';
 *   await openDb();
 *   const tasks = await db.tasks.toArray();
 *
 * The db is opened lazily; calling `openDb()` is idempotent and safe to call
 * from multiple call sites (initial bootstrap, seed, sync loop).
 *
 * V1 → V7 migrations are purely additive. Dexie replays each version's store
 * list, creates the newer tables, and leaves every existing row untouched.
 * New installs open directly on V7.
 */

import Dexie, { type EntityTable, type Table } from 'dexie';
import type { Agent } from '@/types/agent';
import type { Chat, Message } from '@/types/chat';
import type { EventRow } from '@/types/event';
import type { Integration } from '@/types/integration';
import type { MemoryItem } from '@/types/memory';
import type { QuickLink, QuickLinkGroup } from '@/types/quick-link';
import type { Task } from '@/types/task';
import type {
  TerminalLayout,
  TerminalPreset,
  TerminalScrollbackChunk,
  TerminalSession,
} from '@/types/terminal';
import {
  DB_NAME,
  STORES_V1,
  STORES_V2,
  STORES_V3,
  STORES_V4,
  STORES_V5,
  STORES_V6,
  STORES_V7,
  type ContextAssetRow,
  type ContextEmbeddingRow,
  type ContextEdgeRow,
  type ContextEntityRow,
  type ContextMapRow,
  type ContextMigrationBackupRow,
  type ContextNoteRevisionRow,
  type ContextNoteRow,
  type ContextProvenanceRow,
  type ContextQuarantineRow,
  type ContextSourceRow,
  type JarvisApprovalRow,
  type JarvisArtifactRow,
  type JarvisEventRow,
  type JarvisIdentityRevisionRow,
  type JarvisProfileRow,
  type JarvisRunRow,
  type Project,
  type PromptForgeJobRow,
  type SettingsRow,
  type SyncQueueRow,
  type Workspace,
} from './schema';

/**
 * Strongly-typed Dexie subclass. Each table is exposed as an `EntityTable`
 * keyed on the row's primary key field, which gives us proper typing on
 * `db.tasks.get(id)`, `.add(row)`, `.update(id, patch)` etc.
 */
export type JarvisDexieDependencies = {
  indexedDB: IDBFactory;
  IDBKeyRange: typeof IDBKeyRange;
};

export class JarvisDexie extends Dexie {
  // V1 tables
  workspaces!: EntityTable<Workspace, 'id'>;
  projects!: EntityTable<Project, 'id'>;
  chats!: EntityTable<Chat, 'id'>;
  messages!: EntityTable<Message, 'id'>;
  agents!: EntityTable<Agent, 'id'>;
  tasks!: EntityTable<Task, 'id'>;
  memory_items!: EntityTable<MemoryItem, 'id'>;
  settings!: EntityTable<SettingsRow, 'key'>;
  sync_queue!: EntityTable<SyncQueueRow, 'id'>;

  // V2 tables (additive)
  events!: EntityTable<EventRow, 'id'>;
  quick_links!: EntityTable<QuickLink, 'id'>;
  quick_link_groups!: EntityTable<QuickLinkGroup, 'id'>;
  terminal_presets!: EntityTable<TerminalPreset, 'id'>;
  terminal_sessions!: EntityTable<TerminalSession, 'id'>;
  /**
   * Compound primary key — Dexie's EntityTable type wants a single key field.
   * We type it on `session_id` for ergonomic `where('session_id').equals(...)`
   * queries; direct `.get(...)` calls go through the compound key form.
   */
  terminal_scrollback!: EntityTable<TerminalScrollbackChunk, 'session_id'>;
  terminal_layouts!: EntityTable<TerminalLayout, 'project_id'>;
  integrations!: EntityTable<Integration, 'id'>;

  // V3 kernel tables (additive)
  jarvis_identity_revisions!: EntityTable<JarvisIdentityRevisionRow, 'id'>;
  jarvis_profiles!: EntityTable<JarvisProfileRow, 'id'>;
  jarvis_runs!: EntityTable<JarvisRunRow, 'id'>;
  jarvis_events!: Table<JarvisEventRow, [string, number]>;
  jarvis_approvals!: EntityTable<JarvisApprovalRow, 'id'>;
  jarvis_artifacts!: EntityTable<JarvisArtifactRow, 'id'>;

  // V4 Context Map 2.0 tables (additive)
  context_maps!: EntityTable<ContextMapRow, 'id'>;
  context_sources!: EntityTable<ContextSourceRow, 'id'>;
  context_entities!: EntityTable<ContextEntityRow, 'id'>;
  context_edges!: EntityTable<ContextEdgeRow, 'id'>;
  context_provenance!: EntityTable<ContextProvenanceRow, 'id'>;
  context_migration_backups!: EntityTable<ContextMigrationBackupRow, 'id'>;
  context_quarantine!: EntityTable<ContextQuarantineRow, 'id'>;

  // V5 Context content metadata tables (additive)
  context_notes!: EntityTable<ContextNoteRow, 'id'>;
  context_note_revisions!: EntityTable<ContextNoteRevisionRow, 'id'>;
  context_assets!: EntityTable<ContextAssetRow, 'id'>;

  // V6 local Context semantic-search metadata (additive)
  context_embeddings!: EntityTable<ContextEmbeddingRow, 'id'>;

  // V7 Prompt Forge recovery table (additive)
  prompt_forge_jobs!: EntityTable<PromptForgeJobRow, 'id'>;

  constructor(name = DB_NAME, dependencies?: JarvisDexieDependencies) {
    super(name, dependencies);
    // Replay every additive schema version for existing installations.
    this.version(1).stores(STORES_V1);
    this.version(2).stores(STORES_V2);
    this.version(3).stores(STORES_V3);
    this.version(4).stores(STORES_V4);
    this.version(5).stores(STORES_V5);
    this.version(6).stores(STORES_V6);
    this.version(7).stores(STORES_V7);
  }
}

export function createJarvisDb(
  name = DB_NAME,
  dependencies?: JarvisDexieDependencies,
): JarvisDexie {
  return new JarvisDexie(name, dependencies);
}

/**
 * Process-wide database singleton. Importing this does not open the
 * underlying IndexedDB connection - the first read or write triggers it,
 * or call `openDb()` explicitly during bootstrap.
 */
export const db: JarvisDexie = createJarvisDb();

let _openPromise: Promise<JarvisDexie> | null = null;

/**
 * Idempotently open the database. Returns the same promise on repeat calls so
 * concurrent callers all wait for the single underlying open.
 */
export function openDb(): Promise<JarvisDexie> {
  if (!_openPromise) {
    _openPromise = db.open().then(() => db);
  }
  return _openPromise;
}

/**
 * Close the database and reset the cached open promise.
 * Mostly useful for tests; production code rarely calls this.
 */
export async function closeDb(): Promise<void> {
  if (db.isOpen()) db.close();
  _openPromise = null;
}

export { DB_NAME, DB_VERSION } from './schema';
export type {
  Workspace,
  Project,
  SettingsRow,
  SyncQueueRow,
  SyncOp,
  SyncStatus,
  StoreName,
  ContextMapRow,
  ContextSourceRow,
  ContextEntityRow,
  ContextEdgeRow,
  ContextProvenanceRow,
  ContextMigrationBackupRow,
  ContextQuarantineRow,
  ContextNoteRow,
  ContextNoteRevisionRow,
  ContextAssetRow,
  ContextEmbeddingRow,
  PromptForgeJobRow,
} from './schema';
export * from './repositories';
export { seedIfEmpty } from './seed';
