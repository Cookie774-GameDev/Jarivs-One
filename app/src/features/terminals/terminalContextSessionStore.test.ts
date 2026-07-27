import { beforeEach, describe, expect, it } from 'vitest';
import {
  consumeTerminalContextSessionOnce,
  getOrCreateTerminalContextSession,
  resetTerminalContextSessionsForTests,
  updateTerminalContextSession,
} from './terminalContextSessionStore';

describe('terminal context session authority', () => {
  beforeEach(() => {
    resetTerminalContextSessionsForTests();
  });

  it('creates one isolated session per real terminal scope', () => {
    const first = getOrCreateTerminalContextSession(
      {
        terminalSessionId: 'tty-a',
        paneId: 'pane-a',
        projectId: 'project-a',
      },
      100,
    );
    const second = getOrCreateTerminalContextSession(
      {
        terminalSessionId: 'tty-b',
        paneId: 'pane-b',
        projectId: 'project-a',
      },
      101,
    );

    expect(first).toMatchObject({
      terminalSessionId: 'tty-a',
      paneId: 'pane-a',
      projectId: 'project-a',
      activeMapIds: [],
      pinnedEntityIds: [],
      activeSkillIds: [],
      agentSlug: null,
      mode: 'persistent',
      contextRevision: 0,
    });
    expect(second.terminalSessionId).toBe('tty-b');
    expect(second).not.toBe(first);
  });

  it('updates only the owned session and monotonically advances its revision', () => {
    const scope = {
      terminalSessionId: 'tty-a',
      paneId: 'pane-a',
      projectId: 'project-a',
    } as const;
    getOrCreateTerminalContextSession(scope, 100);
    const updated = updateTerminalContextSession(
      scope,
      {
        activeMapIds: ['map-a'],
        pinnedEntityIds: ['entity-a'],
        activeSkillIds: ['build'],
        agentSlug: 'builder',
        mode: 'one_turn',
      },
      120,
    );

    expect(updated).toMatchObject({
      activeMapIds: ['map-a'],
      pinnedEntityIds: ['entity-a'],
      activeSkillIds: ['build'],
      agentSlug: 'builder',
      mode: 'one_turn',
      updatedAt: 120,
      contextRevision: 1,
    });
    expect(
      getOrCreateTerminalContextSession(
        {
          terminalSessionId: 'tty-b',
          paneId: 'pane-b',
          projectId: 'project-a',
        },
        121,
      ).activeMapIds,
    ).toEqual([]);
  });

  it('consumes one-turn pins exactly once while preserving persistent selections', () => {
    const scope = {
      terminalSessionId: 'tty-a',
      paneId: 'pane-a',
      projectId: 'project-a',
    } as const;
    updateTerminalContextSession(
      scope,
      {
        activeMapIds: ['map-a'],
        pinnedEntityIds: ['entity-a'],
        activeSkillIds: ['build'],
        mode: 'one_turn',
      },
      100,
    );

    const first = consumeTerminalContextSessionOnce(scope, 120);
    expect(first.entityIds).toEqual(['entity-a']);
    expect(first.next).toMatchObject({
      activeMapIds: ['map-a'],
      pinnedEntityIds: [],
      activeSkillIds: ['build'],
      mode: 'persistent',
      contextRevision: 2,
    });
    expect(consumeTerminalContextSessionOnce(scope, 130).entityIds).toEqual([]);
  });

  it('rejects cross-project or cross-pane rebinding of an established terminal id', () => {
    getOrCreateTerminalContextSession(
      {
        terminalSessionId: 'tty-a',
        paneId: 'pane-a',
        projectId: 'project-a',
      },
      100,
    );

    expect(() =>
      getOrCreateTerminalContextSession(
        {
          terminalSessionId: 'tty-a',
          paneId: 'pane-b',
          projectId: 'project-a',
        },
        110,
      ),
    ).toThrow(/scope conflict/i);
    expect(() =>
      getOrCreateTerminalContextSession(
        {
          terminalSessionId: 'tty-a',
          paneId: 'pane-a',
          projectId: 'project-b',
        },
        110,
      ),
    ).toThrow(/scope conflict/i);
  });

  it('uses a bounded virtual session for authenticated external terminals', () => {
    const first = getOrCreateTerminalContextSession({ projectId: 'project-a' }, 100);
    const again = getOrCreateTerminalContextSession({ projectId: 'project-a' }, 110);
    const other = getOrCreateTerminalContextSession({ projectId: 'project-b' }, 120);

    expect(first.terminalSessionId).toBe('external:project-a');
    expect(again).toBe(first);
    expect(other.terminalSessionId).toBe('external:project-b');
  });
});
