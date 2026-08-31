import { describe, expect, it, vi } from 'vitest';

import { createCaoScheduleBootstrap } from './caoScheduleBootstrap';

const capability = {
  run: vi.fn(async () => ({ status: 'completed' as const })),
  recover: vi.fn(async () => null),
};

describe('CAO schedule bootstrap', () => {
  it('binds one exact event identity to the active production learning scope', () => {
    expect(
      createCaoScheduleBootstrap({
        accountId: 'account-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        learningAccountId: 'account-1',
        learningEnabled: true,
        capability,
        newEventId: () => 'evt-cao-1',
      }),
    ).toEqual({
      status: 'ready',
      eventId: 'evt-cao-1',
      projectId: 'project-1',
      caoSupervision: {
        schemaVersion: 1,
        mode: 'cao_supervision',
        scheduleId: 'evt-cao-1',
        policyId: 'quarter-hour-v1',
        targetId: 'learning-md',
        projectId: 'project-1',
      },
    });
  });

  it.each([
    [{ accountId: null }, 'account'],
    [{ workspaceId: null }, 'workspace'],
    [{ projectId: null }, 'project'],
    [{ learningAccountId: 'account-2' }, 'learning_account'],
    [{ learningEnabled: false }, 'learning_disabled'],
    [{ capability: { run: capability.run } }, 'capability'],
  ] as const)('fails closed for %s', (patch, expectedMissing) => {
    const result = createCaoScheduleBootstrap({
      accountId: 'account-1',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      learningAccountId: 'account-1',
      learningEnabled: true,
      capability,
      newEventId: () => 'evt-cao-1',
      ...patch,
    });

    expect(result.status).toBe('unavailable');
    if (result.status === 'unavailable') expect(result.missing).toContain(expectedMissing);
  });

  it('rejects an invalid generated identity instead of persisting ambiguous metadata', () => {
    expect(
      createCaoScheduleBootstrap({
        accountId: 'account-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        learningAccountId: 'account-1',
        learningEnabled: true,
        capability,
        newEventId: () => 'unsafe event id',
      }),
    ).toEqual({ status: 'unavailable', missing: ['event_identity'] });
  });
});
