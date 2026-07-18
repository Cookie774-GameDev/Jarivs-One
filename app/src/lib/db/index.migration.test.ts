import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Dexie, { type EntityTable, type Table } from 'dexie';
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';
import type { Agent } from '@/types/agent';
import { TEST_INDEXED_DB, uniqueTestDbName } from '@/test/indexedDb';
import { createJarvisDb, type JarvisDexie } from './index';
import {
  DB_VERSION,
  STORES_V1,
  STORES_V2,
  STORES_V3,
  type JarvisEventRow,
  type SettingsRow,
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
  database.version(1).stores(STORES_V1);
  if (version === 2) database.version(2).stores(STORES_V2);
  await database.open();
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

afterEach(async () => {
  for (const name of createdNames) await deleteTestDb(name);
  createdNames.clear();
});

describe('Jarvis Dexie V3 additive migration', () => {
  it('keeps the exact V1 and V2 declarations and advances only the active version', () => {
    expect(STORES_V1).toEqual(EXPECTED_STORES_V1);
    expect(STORES_V2).toEqual(EXPECTED_STORES_V2);
    expect(DB_VERSION).toBe(3);
    expect(STORES_V3).toMatchObject(STORES_V2);
  });

  it('opens every legacy and kernel store on a fresh V3 database', async () => {
    const database = createJarvisDb(testDbName('jarvis-v3-fresh'), TEST_INDEXED_DB);
    await database.open();

    expect(database.tables.map((table) => table.name).sort()).toEqual(
      Object.keys(STORES_V3).sort(),
    );
    expect(database.agents.name).toBe('agents');
    expect(database.settings.name).toBe('settings');
    expect(database.jarvis_events.name).toBe('jarvis_events');

    expectTypeOf(database).toMatchTypeOf<JarvisDexie>();
    expectTypeOf(database.agents).toMatchTypeOf<EntityTable<Agent, 'id'>>();
    expectTypeOf(database.settings).toMatchTypeOf<EntityTable<SettingsRow, 'key'>>();
    expectTypeOf(database.jarvis_events).toMatchTypeOf<Table<JarvisEventRow, [string, number]>>();
    database.close();
  });

  it('preserves every inserted V1 row byte-for-byte when opening V3', async () => {
    const name = testDbName('jarvis-v1-to-v3');
    const legacy = await createLegacyDb(name, 1);
    await insertRows(legacy, V1_ROWS);
    legacy.close();

    const upgraded = createJarvisDb(name, TEST_INDEXED_DB);
    await upgraded.open();
    await expectRows(upgraded, V1_ROWS);
    upgraded.close();
  });

  it('preserves every inserted V1 and V2 row byte-for-byte when opening V3', async () => {
    const name = testDbName('jarvis-v2-to-v3');
    const legacy = await createLegacyDb(name, 2);
    await insertRows(legacy, V2_ROWS);
    legacy.close();

    const upgraded = createJarvisDb(name, TEST_INDEXED_DB);
    await upgraded.open();
    await expectRows(upgraded, V2_ROWS);
    upgraded.close();
  });

  it('reopens V3 idempotently without replacing existing rows', async () => {
    const name = testDbName('jarvis-v3-reopen');
    const first = createJarvisDb(name, TEST_INDEXED_DB);
    await first.open();
    await first.workspaces.put(structuredClone(V1_ROWS.workspaces) as never);
    first.close();

    const reopened = createJarvisDb(name, TEST_INDEXED_DB);
    await reopened.open();
    await expect(reopened.workspaces.toArray()).resolves.toEqual([V1_ROWS.workspaces]);
    reopened.close();
  });

  it('enforces ordered compound event keys and per-run delivery idempotency', async () => {
    const database = createJarvisDb(testDbName('jarvis-v3-events'), TEST_INDEXED_DB);
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
    const ordered = await database.jarvis_events.bulkGet([
      ['run-a', 1],
      ['run-a', 2],
      ['run-a', 3],
    ]);
    expect(ordered.map((row) => row?.seq)).toEqual([1, 2, 3]);

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
