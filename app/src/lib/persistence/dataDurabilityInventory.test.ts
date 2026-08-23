import { describe, expect, it } from 'vitest';
import { STORES } from '@/lib/db/schema';
import {
  DATA_DURABILITY_INVENTORY,
  INDEXED_DB_DURABILITY_INVENTORY,
  NON_INDEXED_DB_DURABILITY_INVENTORY,
} from './dataDurabilityInventory';

describe('data durability inventory', () => {
  it('classifies every current Dexie store exactly once', () => {
    expect(Object.keys(INDEXED_DB_DURABILITY_INVENTORY).sort()).toEqual(Object.keys(STORES).sort());
    expect(new Set(DATA_DURABILITY_INVENTORY.map((record) => record.id)).size).toBe(
      DATA_DURABILITY_INVENTORY.length,
    );
  });

  it('records the additive-update and hard-reset boundary for every Dexie store', () => {
    for (const record of Object.values(INDEXED_DB_DURABILITY_INVENTORY)) {
      expect(record.authority).toBe('indexeddb');
      expect(record.normalUpdatePreserved).toBe(true);
      expect(record.resetVulnerable).toBe(true);
      expect(record.backupCoverage).toMatch(/^doctor-origin-/);
      expect(record.portableRestoreAvailable).toBe(
        record.backupCoverage === 'doctor-origin-and-workspace-export',
      );
    }
  });

  it('limits explicit cloud recovery to the exact supported core records', () => {
    const recoverable = Object.entries(INDEXED_DB_DURABILITY_INVENTORY)
      .filter(([, record]) => record.cloud === 'core-sync-and-explicit-recovery')
      .map(([store]) => store)
      .sort();

    expect(recoverable).toEqual(
      [
        'agents',
        'chats',
        'events',
        'memory_items',
        'messages',
        'projects',
        'quick_link_groups',
        'quick_links',
        'tasks',
        'workspaces',
      ].sort(),
    );
  });

  it('does not misrepresent outbound-only records as safely recoverable', () => {
    for (const store of [
      'settings',
      'terminal_presets',
      'terminal_sessions',
      'terminal_layouts',
      'integrations',
    ] as const) {
      expect(INDEXED_DB_DURABILITY_INVENTORY[store].cloud).toBe('legacy-outbound-no-recovery');
    }
  });

  it('never permits secrets, terminal transcripts, or private files into cloud backup', () => {
    expect(INDEXED_DB_DURABILITY_INVENTORY.terminal_scrollback.cloud).toBe('never');
    expect(INDEXED_DB_DURABILITY_INVENTORY.terminal_scrollback.sensitivity).toBe(
      'operational-cache',
    );

    const protectedFamilies = NON_INDEXED_DB_DURABILITY_INVENTORY.filter(
      (record) =>
        record.sensitivity === 'secret' ||
        record.authority === 'native-project-files' ||
        record.id.includes('doctor-backups'),
    );
    expect(protectedFamilies.length).toBeGreaterThan(0);
    expect(protectedFamilies.every((record) => record.cloud === 'never')).toBe(true);
    expect(protectedFamilies.every((record) => !record.portableRestoreAvailable)).toBe(true);
  });

  it('limits portable restore to the typed workspace and canvas collections', () => {
    expect(
      DATA_DURABILITY_INVENTORY.filter((record) => record.portableRestoreAvailable).map(
        (record) => record.id,
      ),
    ).toEqual(
      expect.arrayContaining([
        'indexeddb:workspaces',
        'indexeddb:projects',
        'indexeddb:chats',
        'indexeddb:messages',
        'indexeddb:canvas_documents',
        'indexeddb:canvas_pages',
        'indexeddb:canvas_objects',
        'indexeddb:canvas_spatial',
        'indexeddb:canvas_cameras',
      ]),
    );
    expect(
      DATA_DURABILITY_INVENTORY.filter((record) => record.portableRestoreAvailable),
    ).toHaveLength(9);
    expect(INDEXED_DB_DURABILITY_INVENTORY.canvas_documents.backupCoverage).toBe(
      'doctor-origin-and-workspace-export',
    );
    expect(INDEXED_DB_DURABILITY_INVENTORY.canvas_assets.backupCoverage).toBe(
      'doctor-origin-snapshot-only',
    );
  });
});
