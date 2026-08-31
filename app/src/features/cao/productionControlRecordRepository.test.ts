import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createJarvisDb, type JarvisDexie } from '@/lib/db';
import { TEST_INDEXED_DB, uniqueTestDbName } from '@/test/indexedDb';
import type { CaoControlRecord } from './controlRuntime';
import { createProductionCaoControlRecordRepository } from './productionControlRecordRepository';

const initial = Object.freeze({
  schemaVersion: 1 as const,
  revision: 1,
  accountId: 'account-1',
  workspaceId: 'workspace-1',
  projectId: 'project-1',
  requestId: 'request-1',
  runId: 'jrun-control-1',
  command: Object.freeze({
    action: 'verify' as const,
    selectors: Object.freeze([
      Object.freeze({ kind: 'chat' as const, selector: 'chat-1', by: 'id' as const }),
    ]),
    source: 'natural-language' as const,
  }),
  targets: Object.freeze([
    Object.freeze({ kind: 'chat' as const, targetId: 'chat-1', revision: 4 }),
  ]),
  status: 'queued' as const,
  updatedAt: 1_000,
}) satisfies CaoControlRecord;

describe('production CAO control-record repository', () => {
  let database: JarvisDexie;

  beforeEach(async () => {
    database = createJarvisDb(uniqueTestDbName('cao-control-records'), TEST_INDEXED_DB);
    await database.open();
  });

  afterEach(async () => {
    database.close();
    await database.delete();
  });

  it('creates once, reloads durably, and returns detached immutable values', async () => {
    const repository = createProductionCaoControlRecordRepository(database);

    await expect(repository.save(0, initial)).resolves.toBe(true);
    const loaded = await repository.load(initial.requestId);
    expect(loaded).toEqual(initial);
    expect(loaded).not.toBe(initial);
    expect(Object.isFrozen(loaded)).toBe(true);
    expect(Object.isFrozen(loaded?.command)).toBe(true);
    expect(Object.isFrozen(loaded?.targets)).toBe(true);

    await expect(
      createProductionCaoControlRecordRepository(database).load(initial.requestId),
    ).resolves.toEqual(initial);
  });

  it('advances by exact compare-and-save and rejects stale or skipped revisions', async () => {
    const repository = createProductionCaoControlRecordRepository(database);
    expect(await repository.save(0, initial)).toBe(true);
    const running: CaoControlRecord = Object.freeze({
      ...initial,
      revision: 2,
      status: 'running',
      leaseId: 'lease-1',
      updatedAt: 1_001,
    });

    await expect(repository.save(1, running)).resolves.toBe(true);
    await expect(repository.save(1, { ...running, status: 'failed' })).resolves.toBe(false);
    await expect(
      repository.save(2, { ...running, revision: 4, status: 'completed' }),
    ).resolves.toBe(false);
    await expect(repository.load(initial.requestId)).resolves.toEqual(running);
  });

  it('rejects duplicate creates and immutable envelope replacement without overwriting', async () => {
    const repository = createProductionCaoControlRecordRepository(database);
    expect(await repository.save(0, initial)).toBe(true);

    await expect(repository.save(0, structuredClone(initial))).resolves.toBe(false);
    await expect(
      repository.save(1, {
        ...initial,
        revision: 2,
        projectId: 'project-foreign',
        updatedAt: 1_001,
      }),
    ).resolves.toBe(false);
    await expect(repository.load(initial.requestId)).resolves.toEqual(initial);
  });

  it('fails closed on malformed rows and never persists secret-shaped extension data', async () => {
    const repository = createProductionCaoControlRecordRepository(database);

    await expect(
      repository.save(0, {
        ...initial,
        requestId: 'request\u0000invalid',
      }),
    ).rejects.toThrow('cao_control_record_invalid');
    await expect(
      repository.save(0, {
        ...initial,
        command: { ...initial.command, selectors: [] },
      }),
    ).rejects.toThrow('cao_control_record_invalid');
    await expect(database.cao_control_records.count()).resolves.toBe(0);
    expect(JSON.stringify(initial)).not.toMatch(/password|api.?key|credential|secret/iu);
  });
});
