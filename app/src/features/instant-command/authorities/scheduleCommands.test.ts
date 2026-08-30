import { describe, expect, it } from 'vitest';
import { resolveVersionedEntity } from './scheduleCommands';

const schedules = [
  { id: 'sch_1', name: 'Release Audit', revision: 4 },
  { id: 'sch_2', name: 'release audit', revision: 2 },
  { id: 'sch_3', name: 'Standup', revision: 7 },
];

describe('schedule command resolution', () => {
  it('resolves stable ID before display name and binds the expected revision', () => {
    expect(resolveVersionedEntity(schedules, { id: 'sch_2', expectedRevision: 2 })).toEqual({
      status: 'resolved',
      entity: schedules[1],
    });
    expect(resolveVersionedEntity(schedules, { name: 'standup', expectedRevision: 7 })).toEqual({
      status: 'resolved',
      entity: schedules[2],
    });
  });

  it('fails closed on duplicate names and stale revisions', () => {
    expect(resolveVersionedEntity(schedules, { name: 'Release Audit' })).toMatchObject({
      status: 'ambiguous',
      candidateIds: ['sch_1', 'sch_2'],
    });
    expect(resolveVersionedEntity(schedules, { id: 'sch_3', expectedRevision: 6 })).toEqual({
      status: 'stale',
      actualRevision: 7,
    });
  });
});
