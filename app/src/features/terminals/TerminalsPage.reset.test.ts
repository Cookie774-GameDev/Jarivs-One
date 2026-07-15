import { describe, expect, it, vi } from 'vitest';
import {
  deleteTerminalProjectSnapshots,
  forgetTerminalLeafSessions,
} from './TerminalsPage';
import { fromLeaves, type PaneNode } from './paneTree';

describe('terminal reset hygiene', () => {
  it('forgets only leaf sessions that are reset', () => {
    const tree = fromLeaves([
      { kind: 'leaf', id: 'pane-a', sessionId: 'session-a' } as Extract<PaneNode, { kind: 'leaf' }>,
      { kind: 'leaf', id: 'pane-b', sessionId: null } as Extract<PaneNode, { kind: 'leaf' }>,
      { kind: 'leaf', id: 'pane-c', sessionId: 'session-c' } as Extract<PaneNode, { kind: 'leaf' }>,
    ]);
    const forget = vi.fn();

    forgetTerminalLeafSessions(tree, forget);

    expect(forget).toHaveBeenCalledTimes(2);
    expect(forget).toHaveBeenCalledWith('session-a');
    expect(forget).toHaveBeenCalledWith('session-c');
  });

  it('deletes the active project snapshots exactly once during reset', async () => {
    const invokeCommand = vi.fn(async () => undefined);

    await deleteTerminalProjectSnapshots('project-a', invokeCommand);

    expect(invokeCommand).toHaveBeenCalledOnce();
    expect(invokeCommand).toHaveBeenCalledWith(
      'terminal_snapshot_delete_project',
      { projectId: 'project-a' },
    );
  });
});
