import { STORES, type StoreName } from '@/lib/db/schema';

export type DurabilityAuthority =
  | 'indexeddb'
  | 'local-storage'
  | 'native-app-data'
  | 'native-project-files'
  | 'os-keychain';

export type DurabilitySensitivity =
  | 'user-content'
  | 'private-metadata'
  | 'preferences'
  | 'secret'
  | 'operational-cache';

export type CloudDisposition =
  | 'core-sync-and-explicit-recovery'
  | 'legacy-outbound-no-recovery'
  | 'reviewed-derived-document-sync'
  | 'never'
  | 'not-applicable';

export type BackupCoverage =
  | 'doctor-origin-snapshot-only'
  | 'doctor-origin-and-workspace-export'
  | 'native-transactional-copy'
  | 'external-user-files'
  | 'none';

export interface DataDurabilityRecord {
  readonly id: string;
  readonly label: string;
  readonly authority: DurabilityAuthority;
  readonly sensitivity: DurabilitySensitivity;
  /** A normal in-place application update retains this storage authority. */
  readonly normalUpdatePreserved: boolean;
  /** A WebView/profile reset, uninstall cleanup, or device loss can remove the only app-owned copy. */
  readonly resetVulnerable: boolean;
  readonly backupCoverage: BackupCoverage;
  readonly cloud: CloudDisposition;
  readonly portableRestoreAvailable: boolean;
  readonly notes: string;
}

type IndexedDbPolicy = Omit<
  DataDurabilityRecord,
  'id' | 'authority' | 'normalUpdatePreserved' | 'resetVulnerable'
>;

const CORE_CLOUD_STORES = new Set<StoreName>([
  'workspaces',
  'projects',
  'chats',
  'messages',
  'agents',
  'tasks',
  'memory_items',
  'events',
  'quick_links',
  'quick_link_groups',
]);

const LEGACY_OUTBOUND_ONLY_STORES = new Set<StoreName>([
  'settings',
  'terminal_presets',
  'terminal_sessions',
  'terminal_layouts',
  'integrations',
]);

const WORKSPACE_EXPORT_STORES = new Set<StoreName>([
  'workspaces',
  'projects',
  'chats',
  'messages',
  'canvas_documents',
  'canvas_pages',
  'canvas_objects',
  'canvas_spatial',
  'canvas_cameras',
]);

const OPERATIONAL_STORES = new Set<StoreName>([
  'sync_queue',
  'terminal_scrollback',
  'jarvis_runs',
  'jarvis_events',
  'jarvis_approvals',
  'jarvis_artifacts',
  'context_embeddings',
  'context_migration_backups',
  'context_quarantine',
  'prompt_forge_jobs',
  'canvas_revisions',
  'canvas_tombstones',
  'canvas_recovery',
]);

const PREFERENCE_STORES = new Set<StoreName>([
  'settings',
  'terminal_presets',
  'terminal_layouts',
  'integrations',
  'jarvis_profiles',
  'browser_chat_bindings',
  'provider_project_links',
  'browser_chat_permission_profiles',
]);

const PRIVATE_METADATA_STORES = new Set<StoreName>([
  'workspaces',
  'projects',
  'agents',
  'tasks',
  'events',
  'quick_links',
  'quick_link_groups',
  'terminal_sessions',
  'jarvis_identity_revisions',
  'context_maps',
  'context_sources',
  'context_entities',
  'context_edges',
  'context_provenance',
  'context_assets',
  'canvas_documents',
  'canvas_pages',
  'canvas_spatial',
  'canvas_cameras',
  'canvas_assets',
  'canvas_templates',
  'browser_chat_imports',
]);

const CONTEXT_DOCUMENT_STORES = new Set<StoreName>([
  'context_maps',
  'context_sources',
  'context_entities',
  'context_edges',
  'context_provenance',
  'context_notes',
  'context_note_revisions',
  'context_assets',
]);

function indexedDbPolicy(store: StoreName): IndexedDbPolicy {
  const cloud: CloudDisposition = CORE_CLOUD_STORES.has(store)
    ? 'core-sync-and-explicit-recovery'
    : LEGACY_OUTBOUND_ONLY_STORES.has(store)
      ? 'legacy-outbound-no-recovery'
      : CONTEXT_DOCUMENT_STORES.has(store)
        ? 'reviewed-derived-document-sync'
        : 'never';

  const sensitivity: DurabilitySensitivity = OPERATIONAL_STORES.has(store)
    ? 'operational-cache'
    : PREFERENCE_STORES.has(store)
      ? 'preferences'
      : PRIVATE_METADATA_STORES.has(store)
        ? 'private-metadata'
        : 'user-content';

  return {
    label: store.replaceAll('_', ' '),
    sensitivity,
    backupCoverage: WORKSPACE_EXPORT_STORES.has(store)
      ? 'doctor-origin-and-workspace-export'
      : 'doctor-origin-snapshot-only',
    cloud,
    portableRestoreAvailable: false,
    notes:
      cloud === 'core-sync-and-explicit-recovery'
        ? 'Account-scoped RLS sync plus explicit, non-destructive cloud recovery.'
        : cloud === 'legacy-outbound-no-recovery'
          ? 'Existing sync can upload this table, but no safe inbound restore is implemented.'
          : cloud === 'reviewed-derived-document-sync'
            ? 'The local authority stays local; only reviewed derived Context documents use cloud sync.'
            : 'Local-only; no cloud restore authority is implemented.',
  };
}

/**
 * A content-free inventory of every Dexie store. Importing this module never
 * opens the database or reads a user's records.
 */
export const INDEXED_DB_DURABILITY_INVENTORY: Readonly<Record<StoreName, DataDurabilityRecord>> =
  Object.freeze(
    Object.fromEntries(
      (Object.keys(STORES) as StoreName[]).map((store) => [
        store,
        Object.freeze({
          id: `indexeddb:${store}`,
          authority: 'indexeddb' as const,
          normalUpdatePreserved: true,
          resetVulnerable: true,
          ...indexedDbPolicy(store),
        }),
      ]),
    ) as Record<StoreName, DataDurabilityRecord>,
  );

/** Major user-data authorities outside Dexie. Cache-only families are kept in
 * the inventory so backup code cannot accidentally start treating them as
 * irreplaceable user content.
 */
export const NON_INDEXED_DB_DURABILITY_INVENTORY: readonly DataDurabilityRecord[] = Object.freeze([
  {
    id: 'local-storage:preferences-and-layout',
    label: 'Interface, theme, layout, hotkey, Pet, voice, and feature preferences',
    authority: 'local-storage',
    sensitivity: 'preferences',
    normalUpdatePreserved: true,
    resetVulnerable: true,
    backupCoverage: 'none',
    cloud: 'never',
    portableRestoreAvailable: false,
    notes: 'Stable application updates retain localStorage, but profile resets do not.',
  },
  {
    id: 'local-storage:workspace-file-roots',
    label: 'Workspace roots and local file catalog metadata',
    authority: 'local-storage',
    sensitivity: 'private-metadata',
    normalUpdatePreserved: true,
    resetVulnerable: true,
    backupCoverage: 'none',
    cloud: 'never',
    portableRestoreAvailable: false,
    notes: 'Contains paths and recent-file metadata, not the file bytes.',
  },
  {
    id: 'local-storage:model-provider-state',
    label: 'Model selections, provider connection metadata, and verified catalog caches',
    authority: 'local-storage',
    sensitivity: 'preferences',
    normalUpdatePreserved: true,
    resetVulnerable: true,
    backupCoverage: 'none',
    cloud: 'never',
    portableRestoreAvailable: false,
    notes: 'Credentials are excluded and remain in the OS keychain.',
  },
  {
    id: 'local-storage:tools-plugins-schedules-skills',
    label: 'Custom tool, plugin, schedule, skill, and local-agent metadata',
    authority: 'local-storage',
    sensitivity: 'user-content',
    normalUpdatePreserved: true,
    resetVulnerable: true,
    backupCoverage: 'none',
    cloud: 'legacy-outbound-no-recovery',
    portableRestoreAvailable: false,
    notes: 'Some account-scoped metadata syncs separately; there is no complete portable restore.',
  },
  {
    id: 'local-storage:auth-session',
    label: 'Supabase authentication session',
    authority: 'local-storage',
    sensitivity: 'secret',
    normalUpdatePreserved: true,
    resetVulnerable: true,
    backupCoverage: 'none',
    cloud: 'never',
    portableRestoreAvailable: false,
    notes: 'Never export or cloud-back up session tokens; the user signs in again after loss.',
  },
  {
    id: 'local-storage:news-benchmarks-wallpapers-usage',
    label: 'News, benchmark, wallpaper, compatibility, and usage caches',
    authority: 'local-storage',
    sensitivity: 'operational-cache',
    normalUpdatePreserved: true,
    resetVulnerable: false,
    backupCoverage: 'none',
    cloud: 'not-applicable',
    portableRestoreAvailable: false,
    notes: 'Rebuildable cache data; losing it must not remove user-authored content.',
  },
  {
    id: 'native-app-data:all-about-me',
    label: 'Private All About Me profile',
    authority: 'native-app-data',
    sensitivity: 'user-content',
    normalUpdatePreserved: true,
    resetVulnerable: true,
    backupCoverage: 'native-transactional-copy',
    cloud: 'never',
    portableRestoreAvailable: false,
    notes: 'Primary, temporary, and backup copies are account scoped in private app data.',
  },
  {
    id: 'native-app-data:doctor-backups',
    label: 'VibeSpace Doctor IndexedDB repair snapshots and receipts',
    authority: 'native-app-data',
    sensitivity: 'user-content',
    normalUpdatePreserved: true,
    resetVulnerable: true,
    backupCoverage: 'native-transactional-copy',
    cloud: 'never',
    portableRestoreAvailable: false,
    notes: 'Backup-first repair artifacts are local and origin-scoped, not general cloud backups.',
  },
  {
    id: 'native-project-files:workspace-content',
    label: 'Project files and user-selected wallpaper/media files',
    authority: 'native-project-files',
    sensitivity: 'user-content',
    normalUpdatePreserved: true,
    resetVulnerable: false,
    backupCoverage: 'external-user-files',
    cloud: 'never',
    portableRestoreAvailable: false,
    notes: 'VibeSpace stores references only; it must never upload private file bytes implicitly.',
  },
  {
    id: 'os-keychain:credentials',
    label: 'Provider, voice, plugin, MCP, and service credentials',
    authority: 'os-keychain',
    sensitivity: 'secret',
    normalUpdatePreserved: true,
    resetVulnerable: false,
    backupCoverage: 'none',
    cloud: 'never',
    portableRestoreAvailable: false,
    notes: 'Secrets are deliberately excluded from VibeSpace backups and sync payloads.',
  },
] satisfies readonly DataDurabilityRecord[]);

export const DATA_DURABILITY_INVENTORY: readonly DataDurabilityRecord[] = Object.freeze([
  ...Object.values(INDEXED_DB_DURABILITY_INVENTORY),
  ...NON_INDEXED_DB_DURABILITY_INVENTORY,
]);
