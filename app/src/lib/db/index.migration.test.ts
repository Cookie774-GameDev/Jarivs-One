import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Dexie, { type EntityTable, type Table } from 'dexie';
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';
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
import { TEST_INDEXED_DB, uniqueTestDbName } from '@/test/indexedDb';
import { createJarvisDb, type JarvisDexie, type JarvisDexieDependencies } from './index';
import {
  DB_VERSION,
  STORES_V1,
  STORES_V2,
  STORES_V3,
  type JarvisApprovalRow,
  type JarvisArtifactRow,
  type JarvisEventRow,
  type JarvisIdentityRevisionRow,
  type JarvisProfileRow,
  type JarvisRunRow,
  type Project,
  type SettingsRow,
  type SyncQueueRow,
  type Workspace,
} from './schema';

const EXPECTED_STORES_V1 = {
  workspaces: 'id, name, owner_id, updated_at',
  projects: 'id, workspace_id, name, updated_at',
  chats: 'id, workspace_id, project_id, [archived+updated_at], updated_at',
  messages: 'id, chat_id, [chat_id+created_at], parent_id',
  agents: 'id, &slug',
  tasks:
    'id, workspace_id, project_id, status, [status+priority], due_at, scheduled_for, [workspace_id+status]',
  memory_items: 'id, workspace_id, project_id, agent_id, [workspace_id+source], last_accessed_at',
  settings: 'key',
  sync_queue: 'id, status, created_at',
} as const;

const EXPECTED_STORES_V2 = {
  ...EXPECTED_STORES_V1,
  events: 'id, workspace_id, project_id, start_at, [workspace_id+start_at], status',
  quick_links:
    'id, workspace_id, group_id, [workspace_id+position], [workspace_id+group_id+position], last_used_at',
  quick_link_groups: 'id, workspace_id, [workspace_id+position]',
  terminal_presets: 'id, workspace_id, &[workspace_id+slug]',
  terminal_sessions: 'id, project_id, workspace_id, status, [project_id+status], last_active_at',
  terminal_scrollback: '[session_id+chunk_seq], session_id, created_at',
  terminal_layouts: 'project_id, updated_at',
  integrations: 'id, &kind',
} as const;

const EXPECTED_STORES_V3 = {
  ...EXPECTED_STORES_V2,
  jarvis_identity_revisions: 'id, identity_id, version, &[identity_id+version], created_at',
  jarvis_profiles: 'id, account_id, [account_id+active], updated_at',
  jarvis_runs:
    'id, account_id, chat_id, parent_run_id, status, [account_id+updated_at], [chat_id+created_at]',
  jarvis_events:
    '[run_id+seq], run_id, idempotency_key, &[run_id+idempotency_key], type, status, created_at',
  jarvis_approvals: 'id, run_id, status, params_hash, created_at',
  jarvis_artifacts: 'id, run_id, kind, created_at',
} as const;

const EXPECTED_STORES_V1_SOURCE = `export const STORES_V1 = {
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
} as const;`;

const EXPECTED_STORES_V2_SOURCE = `export const STORES_V2 = {
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
} as const;`;

const V1_ROWS = {
  workspaces: {
    id: 'workspace-v1',
    name: 'Legacy workspace',
    owner_id: 'account-v1',
    created_at: 1,
    updated_at: 2,
    marker: { nested: ['byte', 'stable'] },
  },
  projects: {
    id: 'project-v1',
    workspace_id: 'workspace-v1',
    name: 'Legacy project',
    created_at: 3,
    updated_at: 4,
    marker: 'project-marker',
  },
  chats: {
    id: 'chat-v1',
    workspace_id: 'workspace-v1',
    project_id: 'project-v1',
    archived: false,
    created_at: 5,
    updated_at: 6,
    marker: 101,
  },
  messages: {
    id: 'message-v1',
    chat_id: 'chat-v1',
    parent_id: null,
    created_at: 7,
    marker: ['message-marker'],
  },
  agents: { id: 'agent-v1', slug: 'legacy-agent', marker: true },
  tasks: {
    id: 'task-v1',
    workspace_id: 'workspace-v1',
    project_id: 'project-v1',
    status: 'todo',
    priority: 1,
    due_at: 8,
    scheduled_for: 9,
    marker: 'task-marker',
  },
  memory_items: {
    id: 'memory-v1',
    workspace_id: 'workspace-v1',
    project_id: 'project-v1',
    agent_id: 'agent-v1',
    source: 'manual',
    last_accessed_at: 10,
    marker: { retained: true },
  },
  settings: { key: 'legacy-setting', value: { enabled: true }, updated_at: 11 },
  sync_queue: {
    id: 'sync-v1',
    status: 'pending',
    created_at: 12,
    marker: 'sync-marker',
  },
} as const;

const V2_ROWS = {
  ...V1_ROWS,
  events: {
    id: 'event-v2',
    workspace_id: 'workspace-v1',
    project_id: 'project-v1',
    start_at: 13,
    status: 'scheduled',
    marker: 'event-marker',
  },
  quick_links: {
    id: 'link-v2',
    workspace_id: 'workspace-v1',
    group_id: 'group-v2',
    position: 1,
    last_used_at: 14,
    marker: 'link-marker',
  },
  quick_link_groups: {
    id: 'group-v2',
    workspace_id: 'workspace-v1',
    position: 1,
    marker: 'group-marker',
  },
  terminal_presets: {
    id: 'preset-v2',
    workspace_id: 'workspace-v1',
    slug: 'legacy-shell',
    marker: 'preset-marker',
  },
  terminal_sessions: {
    id: 'session-v2',
    project_id: 'project-v1',
    workspace_id: 'workspace-v1',
    status: 'stopped',
    last_active_at: 15,
    marker: 'session-marker',
  },
  terminal_scrollback: {
    session_id: 'session-v2',
    chunk_seq: 1,
    created_at: 16,
    marker: 'scrollback-marker',
  },
  terminal_layouts: {
    project_id: 'project-v1',
    updated_at: 17,
    marker: 'layout-marker',
  },
  integrations: { id: 'integration-v2', kind: 'github', marker: 'integration-marker' },
} as const;

const createdNames = new Set<string>();
const openedDatabases = new Set<Dexie>();

function testDbName(prefix: string): string {
  const name = uniqueTestDbName(prefix);
  createdNames.add(name);
  return name;
}

async function deleteTestDb(name: string): Promise<void> {
  const cleanup = new Dexie(name, TEST_INDEXED_DB);
  await cleanup.delete();
}

async function createLegacyDb(name: string, version: 1 | 2): Promise<Dexie> {
  const database = new Dexie(name, TEST_INDEXED_DB);
  openedDatabases.add(database);
  database.version(1).stores(STORES_V1);
  if (version === 2) database.version(2).stores(STORES_V2);
  await database.open();
  return database;
}

function createTestJarvisDb(name: string): JarvisDexie {
  const database = createJarvisDb(name, TEST_INDEXED_DB);
  openedDatabases.add(database);
  return database;
}

async function insertRows(database: Dexie, rows: Record<string, object>): Promise<void> {
  for (const [tableName, row] of Object.entries(rows)) {
    await database.table(tableName).put(structuredClone(row));
  }
}

async function expectRows(database: Dexie, rows: Record<string, object>): Promise<void> {
  for (const [tableName, row] of Object.entries(rows)) {
    await expect(database.table(tableName).toArray()).resolves.toEqual([row]);
  }
}

function frozenStoreBlock(source: string, name: 'STORES_V1' | 'STORES_V2'): string {
  const normalized = source.replace(/\r\n/g, '\n');
  const start = normalized.indexOf(`export const ${name} =`);
  const end = normalized.indexOf('\n} as const;', start);
  if (start < 0 || end < 0) throw new Error(`Missing frozen ${name} block.`);
  return normalized.slice(start, end + '\n} as const;'.length);
}

afterEach(async () => {
  for (const database of openedDatabases) database.close();
  for (const name of createdNames) await deleteTestDb(name);
  openedDatabases.clear();
  createdNames.clear();
});

describe('Jarvis Dexie V3 additive migration', () => {
  it('keeps the exact V1 and V2 declarations and advances only the active version', () => {
    const schemaSource = readFileSync(join(__dirname, 'schema.ts'), 'utf8');
    expect(STORES_V1).toEqual(EXPECTED_STORES_V1);
    expect(STORES_V2).toEqual(EXPECTED_STORES_V2);
    expect(STORES_V3).toEqual(EXPECTED_STORES_V3);
    expect(frozenStoreBlock(schemaSource, 'STORES_V1')).toBe(EXPECTED_STORES_V1_SOURCE);
    expect(frozenStoreBlock(schemaSource, 'STORES_V2')).toBe(EXPECTED_STORES_V2_SOURCE);
    expect(DB_VERSION).toBe(3);
  });

  it('opens every legacy and kernel store on a fresh V3 database', async () => {
    const database = createTestJarvisDb(testDbName('jarvis-v3-fresh'));
    await database.open();

    expect(database.tables.map((table) => table.name).sort()).toEqual(
      Object.keys(STORES_V3).sort(),
    );
    expect(database.agents.name).toBe('agents');
    expect(database.settings.name).toBe('settings');
    expect(database.jarvis_events.name).toBe('jarvis_events');

    expectTypeOf<JarvisDexie['workspaces']>().toEqualTypeOf<EntityTable<Workspace, 'id'>>();
    expectTypeOf<JarvisDexie['projects']>().toEqualTypeOf<EntityTable<Project, 'id'>>();
    expectTypeOf<JarvisDexie['chats']>().toEqualTypeOf<EntityTable<Chat, 'id'>>();
    expectTypeOf<JarvisDexie['messages']>().toEqualTypeOf<EntityTable<Message, 'id'>>();
    expectTypeOf<JarvisDexie['agents']>().toEqualTypeOf<EntityTable<Agent, 'id'>>();
    expectTypeOf<JarvisDexie['tasks']>().toEqualTypeOf<EntityTable<Task, 'id'>>();
    expectTypeOf<JarvisDexie['memory_items']>().toEqualTypeOf<EntityTable<MemoryItem, 'id'>>();
    expectTypeOf<JarvisDexie['settings']>().toEqualTypeOf<EntityTable<SettingsRow, 'key'>>();
    expectTypeOf<JarvisDexie['sync_queue']>().toEqualTypeOf<EntityTable<SyncQueueRow, 'id'>>();
    expectTypeOf<JarvisDexie['events']>().toEqualTypeOf<EntityTable<EventRow, 'id'>>();
    expectTypeOf<JarvisDexie['quick_links']>().toEqualTypeOf<EntityTable<QuickLink, 'id'>>();
    expectTypeOf<JarvisDexie['quick_link_groups']>().toEqualTypeOf<
      EntityTable<QuickLinkGroup, 'id'>
    >();
    expectTypeOf<JarvisDexie['terminal_presets']>().toEqualTypeOf<
      EntityTable<TerminalPreset, 'id'>
    >();
    expectTypeOf<JarvisDexie['terminal_sessions']>().toEqualTypeOf<
      EntityTable<TerminalSession, 'id'>
    >();
    expectTypeOf<JarvisDexie['terminal_scrollback']>().toEqualTypeOf<
      EntityTable<TerminalScrollbackChunk, 'session_id'>
    >();
    expectTypeOf<JarvisDexie['terminal_layouts']>().toEqualTypeOf<
      EntityTable<TerminalLayout, 'project_id'>
    >();
    expectTypeOf<JarvisDexie['integrations']>().toEqualTypeOf<EntityTable<Integration, 'id'>>();
    expectTypeOf<JarvisDexie['jarvis_identity_revisions']>().toEqualTypeOf<
      EntityTable<JarvisIdentityRevisionRow, 'id'>
    >();
    expectTypeOf<JarvisDexie['jarvis_profiles']>().toEqualTypeOf<
      EntityTable<JarvisProfileRow, 'id'>
    >();
    expectTypeOf<JarvisDexie['jarvis_runs']>().toEqualTypeOf<EntityTable<JarvisRunRow, 'id'>>();
    expectTypeOf<JarvisDexie['jarvis_events']>().toEqualTypeOf<
      Table<JarvisEventRow, [string, number]>
    >();
    expectTypeOf<JarvisDexie['jarvis_approvals']>().toEqualTypeOf<
      EntityTable<JarvisApprovalRow, 'id'>
    >();
    expectTypeOf<JarvisDexie['jarvis_artifacts']>().toEqualTypeOf<
      EntityTable<JarvisArtifactRow, 'id'>
    >();
    expectTypeOf(createJarvisDb).toEqualTypeOf<
      (name?: string, dependencies?: JarvisDexieDependencies) => JarvisDexie
    >();
    database.close();
  });

  it('preserves every inserted V1 row byte-for-byte when opening V3', async () => {
    const name = testDbName('jarvis-v1-to-v3');
    const legacy = await createLegacyDb(name, 1);
    await insertRows(legacy, V1_ROWS);
    legacy.close();

    const upgraded = createTestJarvisDb(name);
    await upgraded.open();
    await expectRows(upgraded, V1_ROWS);
    upgraded.close();
  });

  it('preserves every inserted V1 and V2 row byte-for-byte when opening V3', async () => {
    const name = testDbName('jarvis-v2-to-v3');
    const legacy = await createLegacyDb(name, 2);
    await insertRows(legacy, V2_ROWS);
    legacy.close();

    const upgraded = createTestJarvisDb(name);
    await upgraded.open();
    await expectRows(upgraded, V2_ROWS);
    upgraded.close();
  });

  it('reopens V3 idempotently without replacing existing rows', async () => {
    const name = testDbName('jarvis-v3-reopen');
    const first = createTestJarvisDb(name);
    await first.open();
    await first.workspaces.put(structuredClone(V1_ROWS.workspaces) as never);
    first.close();

    const reopened = createTestJarvisDb(name);
    await reopened.open();
    await expect(reopened.workspaces.toArray()).resolves.toEqual([V1_ROWS.workspaces]);
    reopened.close();
  });

  it('enforces ordered compound event keys and per-run delivery idempotency', async () => {
    const database = createTestJarvisDb(testDbName('jarvis-v3-events'));
    await database.open();
    const event = (runId: string, seq: number, idempotencyKey: string): JarvisEventRow => ({
      run_id: runId,
      seq,
      idempotency_key: idempotencyKey,
      type: 'message',
      title: `Event ${seq}`,
      source_refs: [],
      artifact_ids: [],
      created_at: seq,
    });

    await database.jarvis_events.bulkAdd([
      event('run-a', 3, 'delivery-3'),
      event('run-a', 1, 'delivery-1'),
      event('run-a', 2, 'delivery-2'),
    ]);
    const ordered = await database.jarvis_events
      .where('[run_id+seq]')
      .between(['run-a', Number.MIN_SAFE_INTEGER], ['run-a', Number.MAX_SAFE_INTEGER])
      .toArray();
    expect(ordered.map((row) => row.seq)).toEqual([1, 2, 3]);

    await expect(
      database.jarvis_events.add(event('run-a', 1, 'delivery-other')),
    ).rejects.toBeDefined();
    await expect(database.jarvis_events.add(event('run-a', 4, 'delivery-1'))).rejects.toBeDefined();
    await expect(database.jarvis_events.add(event('run-b', 1, 'delivery-1'))).resolves.toEqual([
      'run-b',
      1,
    ]);
    database.close();
  });

  it('declares V3 additively without a destructive upgrade callback', () => {
    const source = readFileSync(join(__dirname, 'index.ts'), 'utf8');
    expect(source).not.toContain('.upgrade(');
    expect(source).toContain('this.version(1).stores(STORES_V1)');
    expect(source).toContain('this.version(2).stores(STORES_V2)');
    expect(source).toContain('this.version(3).stores(STORES_V3)');
  });
});
