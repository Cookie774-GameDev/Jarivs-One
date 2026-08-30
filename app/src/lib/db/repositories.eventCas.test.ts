import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TEST_INDEXED_DB, uniqueTestDbName } from '@/test/indexedDb';
import type { WorkspaceId } from '@/types/common';
import type { EventRow } from '@/types/event';
import { createJarvisDb, type JarvisDexie } from './index';

const REVISION = 1_786_200_100_000;
const EVENT_ID = 'event_cas' as EventRow['id'];

function eventRow(): EventRow {
  return {
    id: EVENT_ID,
    workspace_id: 'workspace_cas' as WorkspaceId,
    title: 'Original title',
    start_at: REVISION + 60_000,
    end_at: REVISION + 120_000,
    all_day: false,
    timezone: 'UTC',
    attendees: [],
    source: 'ai',
    reminders: [],
    status: 'scheduled',
    created_by: 'agent_jarvis',
    created_at: REVISION - 1_000,
    updated_at: REVISION,
  } as EventRow;
}

type EventRevisionRepository = {
  update(id: EventRow['id'], patch: Partial<EventRow>): Promise<EventRow>;
  updateIfUpdatedAt(
    id: EventRow['id'],
    expectedUpdatedAt: number,
    buildPatch: (current: EventRow) => Partial<EventRow> | undefined,
  ): Promise<EventRow | undefined>;
};

describe('event repository revision CAS', () => {
  let firstDb: JarvisDexie;
  let secondDb: JarvisDexie;

  beforeEach(async () => {
    const name = uniqueTestDbName('event-revision-cas');
    firstDb = createJarvisDb(name, TEST_INDEXED_DB);
    secondDb = createJarvisDb(name, TEST_INDEXED_DB);
    await Promise.all([firstDb.open(), secondDb.open()]);
    await firstDb.events.put(eventRow());
  });

  afterEach(async () => {
    secondDb.close();
    await firstDb.delete();
  });

  it('rejects a stale save after another connection mutates between read and conditional write', async () => {
    const repositories = (await import('./repositories')) as unknown as {
      createEventRevisionRepository?: (database: JarvisDexie) => EventRevisionRepository;
    };
    expect(repositories.createEventRevisionRepository).toBeTypeOf('function');
    if (!repositories.createEventRevisionRepository) return;
    const repository = repositories.createEventRevisionRepository(firstDb);
    const observed = await firstDb.events.get(EVENT_ID);

    await secondDb.events.update(EVENT_ID, {
      title: 'Concurrent title',
      updated_at: REVISION + 1,
    });
    const stale = await repository.updateIfUpdatedAt(EVENT_ID, observed!.updated_at, () => ({
      description: 'Stale editor write',
    }));

    expect(stale).toBeUndefined();
    const persisted = await firstDb.events.get(EVENT_ID);
    expect(persisted).toMatchObject({
      title: 'Concurrent title',
      updated_at: REVISION + 1,
    });
    expect(persisted?.description).toBeUndefined();
  });

  it('advances the revision for a same-millisecond mutation and rejects the stale editor token', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(REVISION);
    const repositories = (await import('./repositories')) as unknown as {
      createEventRevisionRepository?: (database: JarvisDexie) => EventRevisionRepository;
    };
    expect(repositories.createEventRevisionRepository).toBeTypeOf('function');
    if (!repositories.createEventRevisionRepository) return;
    const repository = repositories.createEventRevisionRepository(firstDb);

    const updated = await repository.update(EVENT_ID, { title: 'Same-time title' });
    const stale = await repository.updateIfUpdatedAt(EVENT_ID, REVISION, () => ({
      description: 'Stale editor write',
    }));

    expect(updated.updated_at).toBe(REVISION + 1);
    expect(stale).toBeUndefined();
    await expect(firstDb.events.get(EVENT_ID)).resolves.toMatchObject({
      title: 'Same-time title',
      updated_at: REVISION + 1,
    });
  });
});
