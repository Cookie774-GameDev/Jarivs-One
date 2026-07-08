import { beforeEach, describe, expect, it } from 'vitest';
import {
  broadcastTerminalCommand,
  enqueueTerminalClose,
  enqueueTerminalCommand,
  useTerminalCommandQueue,
} from './terminalCommandQueue';
import {
  appendLeaf,
  closePane,
  countLeaves,
  flattenLeaves,
  newLeaf,
  MAX_PANES,
  type PaneNode,
} from './paneTree';

/**
 * Stress-level coverage for the queue -> pane-tree pipeline that
 * `terminal.orchestrate` and the bulk actions drive: 10-pane batches,
 * close-all, interleaved order, and repeated churn must stay stable and
 * bounded with no leftover queue state.
 */
describe('terminal command queue stress', () => {
  beforeEach(() => {
    useTerminalCommandQueue.getState().clear();
  });

  it('drains a 10-pane orchestration batch in exact arrival order', () => {
    enqueueTerminalClose(10);
    for (let i = 0; i < 5; i++) {
      enqueueTerminalCommand({ command: 'claude', label: `code-agent ${i + 1}`, agentSlug: 'code-agent' });
    }
    for (let i = 0; i < 5; i++) {
      enqueueTerminalCommand({ command: 'claude', label: `code-reviewer ${i + 1}`, agentSlug: 'code-reviewer' });
    }

    const items = useTerminalCommandQueue.getState().drain();
    expect(items).toHaveLength(11);
    expect(items[0]).toMatchObject({ kind: 'close', count: 10 });
    expect(items.slice(1, 6).every((item) => item.kind === 'shell' && item.agentSlug === 'code-agent')).toBe(true);
    expect(items.slice(6).every((item) => item.kind === 'shell' && item.agentSlug === 'code-reviewer')).toBe(true);
    expect(useTerminalCommandQueue.getState().queue).toHaveLength(0);
    // Second drain is idempotent - nothing double-executes.
    expect(useTerminalCommandQueue.getState().drain()).toHaveLength(0);
  });

  it('applies the drained batch to the pane tree without exceeding MAX_PANES', () => {
    // Simulate the TerminalsPage drain loop against a full 10-pane tree.
    let tree: PaneNode = newLeaf({ agentSlug: 'old-1' });
    for (let i = 2; i <= MAX_PANES; i++) {
      tree = appendLeaf(tree, { agentSlug: `old-${i}` });
    }
    expect(countLeaves(tree)).toBe(MAX_PANES);

    // Close all 10. A pane tree can never be empty, so the drain marks the
    // leftover root for replacement by the first opened pane (mirrors the
    // TerminalsPage `replaceRootNext` behavior).
    const leaves = flattenLeaves(tree);
    for (const leaf of leaves.slice(-10)) {
      const closed = closePane(tree, leaf.id);
      if (closed) tree = closed;
    }
    let replaceRootNext = true;
    expect(countLeaves(tree)).toBe(1);

    // Open the new 5 + 5 role batch.
    const openRole = (agentSlug: string) => {
      const seed = { agentSlug, startupCommand: 'claude' };
      if (replaceRootNext && countLeaves(tree) === 1) {
        tree = newLeaf(seed);
        replaceRootNext = false;
      } else {
        tree = appendLeaf(tree, seed);
      }
    };
    for (let i = 0; i < 5; i++) openRole('code-agent');
    for (let i = 0; i < 5; i++) openRole('code-reviewer');

    const finalLeaves = flattenLeaves(tree);
    expect(finalLeaves).toHaveLength(MAX_PANES);
    expect(finalLeaves.filter((leaf) => leaf.agentSlug === 'code-agent')).toHaveLength(5);
    expect(finalLeaves.filter((leaf) => leaf.agentSlug === 'code-reviewer')).toHaveLength(5);
    expect(finalLeaves.every((leaf) => leaf.startupCommand === 'claude')).toBe(true);
  });

  it('survives repeated open/close churn without queue growth or id collisions', () => {
    const seenIds = new Set<string>();
    for (let round = 0; round < 50; round++) {
      for (let i = 0; i < 10; i++) {
        seenIds.add(enqueueTerminalCommand({ command: '', label: `t${i}` }));
      }
      seenIds.add(enqueueTerminalClose(10));
      const drained = useTerminalCommandQueue.getState().drain();
      expect(drained).toHaveLength(11);
    }
    // 50 rounds × 11 ids - all unique, queue empty at the end.
    expect(seenIds.size).toBe(550);
    expect(useTerminalCommandQueue.getState().queue).toHaveLength(0);
  });

  it('clamps close counts and keeps broadcasts targeted at all panes', () => {
    enqueueTerminalClose(999);
    enqueueTerminalClose(-5);
    broadcastTerminalCommand({ command: 'echo hi' });

    const items = useTerminalCommandQueue.getState().drain();
    expect(items[0]).toMatchObject({ kind: 'close', count: 10 });
    expect(items[1]).toMatchObject({ kind: 'close', count: 1 });
    expect(items[2]).toMatchObject({ kind: 'shell', target: 'all', command: 'echo hi' });
  });
});
