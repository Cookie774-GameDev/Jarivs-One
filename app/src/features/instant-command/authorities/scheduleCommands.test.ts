import { describe, expect, it, vi } from 'vitest';
import { executeScheduleCommand, resolveVersionedEntity } from './scheduleCommands';

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

  it('treats duplicate stable IDs as ambiguous and returns a frozen unique candidate snapshot', () => {
    const result = resolveVersionedEntity(
      [schedules[2]!, { id: 'sch_3', name: 'Copied schedule', revision: 8 }],
      { id: 'sch_3' },
    );

    expect(result).toEqual({ status: 'ambiguous', candidateIds: ['sch_3'] });
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.status === 'ambiguous' && Object.isFrozen(result.candidateIds)).toBe(true);
  });

  it('fails closed on malformed or unbounded registry snapshots', () => {
    expect(
      resolveVersionedEntity(
        [{ id: '', name: 'Broken', revision: 1 }, ...schedules] as typeof schedules,
        { id: 'sch_3' },
      ),
    ).toEqual({ status: 'missing' });
    expect(
      resolveVersionedEntity(
        Array.from({ length: 1_001 }, (_, index) => ({
          id: `sch_${index}`,
          name: `Schedule ${index}`,
          revision: 1,
        })),
        { id: 'sch_3' },
      ),
    ).toEqual({ status: 'missing' });
  });
});

describe('schedule lifecycle authority', () => {
  function port() {
    return {
      list: vi.fn(async () => schedules),
      open: vi.fn(async () => undefined),
      mutate: vi.fn(async () => undefined),
      runNow: vi.fn(async () => ({
        before: { recurrenceAnchor: '2026-09-01T09:00:00Z', occurrenceCount: 4 },
        after: { recurrenceAnchor: '2026-09-01T09:00:00Z', occurrenceCount: 4 },
      })),
    };
  }

  it('lists and opens schedules through explicit canonical ports', async () => {
    const authority = port();
    await expect(executeScheduleCommand({ id: 'schedule.list' }, authority)).resolves.toEqual({
      ok: true,
      code: 'opened',
      message: '3 schedules.',
    });
    await expect(
      executeScheduleCommand({ id: 'schedule.open', selector: { id: 'sch_3' } }, authority),
    ).resolves.toEqual({ ok: true, code: 'opened', message: 'Schedule opened.' });
    expect(authority.open).toHaveBeenCalledWith('sch_3');
  });

  it.each([
    ['schedule.pause', 'pause'],
    ['schedule.resume', 'resume'],
    ['schedule.enable', 'enable'],
    ['schedule.disable', 'disable'],
  ] as const)('dispatches %s by stable revision-bound identity', async (id, action) => {
    const authority = port();
    await expect(
      executeScheduleCommand({ id, selector: { name: 'standup', expectedRevision: 7 } }, authority),
    ).resolves.toEqual({ ok: true, code: 'opened', message: `Schedule ${action}d.` });
    expect(authority.mutate).toHaveBeenCalledWith('sch_3', action, 7);
  });

  it('rejects ambiguous, stale, and unbounded selectors without mutation', async () => {
    const authority = port();
    await expect(
      executeScheduleCommand(
        { id: 'schedule.pause', selector: { name: 'Release Audit' } },
        authority,
      ),
    ).resolves.toMatchObject({ ok: false, code: 'target_ambiguous' });
    await expect(
      executeScheduleCommand(
        { id: 'schedule.pause', selector: { id: 'sch_3', expectedRevision: 6 } },
        authority,
      ),
    ).resolves.toMatchObject({ ok: false, code: 'target_not_ready' });
    await expect(
      executeScheduleCommand(
        { id: 'schedule.pause', selector: { name: 'x'.repeat(201) } },
        authority,
      ),
    ).resolves.toMatchObject({ ok: false, code: 'target_missing' });
    expect(authority.mutate).not.toHaveBeenCalled();
  });

  it('runs now only with recurrence anchors and occurrence counts preserved', async () => {
    const authority = port();
    await expect(
      executeScheduleCommand(
        { id: 'schedule.run_now', selector: { id: 'sch_3', expectedRevision: 7 } },
        authority,
      ),
    ).resolves.toEqual({ ok: true, code: 'opened', message: 'Schedule run completed.' });
    expect(authority.runNow).toHaveBeenCalledWith('sch_3', 7, { preserveRecurrence: true });

    authority.runNow.mockResolvedValueOnce({
      before: { recurrenceAnchor: '2026-09-01T09:00:00Z', occurrenceCount: 4 },
      after: { recurrenceAnchor: '2026-09-08T09:00:00Z', occurrenceCount: 5 },
    });
    await expect(
      executeScheduleCommand({ id: 'schedule.run_now', selector: { id: 'sch_3' } }, authority),
    ).resolves.toEqual({
      ok: false,
      code: 'queue_failed',
      message: 'Schedule recurrence changed during run-now.',
    });
  });

  it('redacts canonical authority failures from receipts', async () => {
    const authority = port();
    authority.open.mockRejectedValueOnce(new Error('private repository detail'));
    const result = await executeScheduleCommand(
      { id: 'schedule.open', selector: { id: 'sch_3' } },
      authority,
    );
    expect(result).toEqual({
      ok: false,
      code: 'queue_failed',
      message: 'Schedule command failed.',
    });
    expect(JSON.stringify(result)).not.toContain('private repository detail');
  });

  it.each(['schedule.destroy', 'schedule.open\u0000', `schedule.${'x'.repeat(100)}`])(
    'rejects an unknown or invalid command before listing: %s',
    async (id) => {
      const authority = port();
      await expect(
        executeScheduleCommand({ id, selector: { id: 'sch_3' } }, authority),
      ).resolves.toEqual({
        ok: false,
        code: 'queue_failed',
        message: 'Unknown schedule command.',
      });
      expect(authority.list).not.toHaveBeenCalled();
    },
  );

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects an invalid expected revision before listing: %s',
    async (expectedRevision) => {
      const authority = port();
      await expect(
        executeScheduleCommand(
          { id: 'schedule.open', selector: { id: 'sch_3', expectedRevision } },
          authority,
        ),
      ).resolves.toEqual({
        ok: false,
        code: 'target_missing',
        message: 'Schedule was not found.',
      });
      expect(authority.list).not.toHaveBeenCalled();
    },
  );

  it('does not claim run-now completion from a malformed recurrence observation', async () => {
    const authority = port();
    authority.runNow.mockResolvedValueOnce({
      before: { recurrenceAnchor: '2026-09-01T09:00:00Z', occurrenceCount: 4 },
      after: { recurrenceAnchor: '2026-09-01T09:00:00Z', occurrenceCount: -1 },
    });

    await expect(
      executeScheduleCommand({ id: 'schedule.run_now', selector: { id: 'sch_3' } }, authority),
    ).resolves.toEqual({
      ok: false,
      code: 'queue_failed',
      message: 'Schedule run state is invalid.',
    });
  });
});
