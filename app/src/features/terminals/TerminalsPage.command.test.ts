import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildTerminalFleetRuntimeEvidence,
  commandForAgent,
  processTerminalFleetRequest,
} from './TerminalsPage';
import { flattenLeaves, fromLeaves, newLeaf, type PaneNode } from './paneTree';
import { requestTerminalFleet, useTerminalCommandQueue } from './terminalCommandQueue';
import { markTerminalPaneRuntime, useTerminalExecutionStore } from './terminalExecutionStore';
import { useTerminalFleetStore } from './terminalFleetStore';
import { useTerminalTranscriptStore } from './transcriptStore';

type TerminalLeaf = Extract<PaneNode, { kind: 'leaf' }>;

function terminalLeaf(
  id: string,
  seed: Partial<Omit<TerminalLeaf, 'kind' | 'id'>> = {},
): TerminalLeaf {
  const node = newLeaf(seed);
  if (node.kind !== 'leaf') throw new Error('expected terminal leaf');
  return { ...node, ...seed, id };
}

vi.mock('./TileGrid', () => ({
  TileGrid: () => null,
}));

const invokeMock = vi.fn();

beforeEach(() => {
  invokeMock.mockReset();
  useTerminalCommandQueue.getState().clear();
  useTerminalExecutionStore.getState().clear();
  useTerminalFleetStore.getState().reset();
  useTerminalTranscriptStore.getState().reset();
});

describe('commandForAgent', () => {
  it('prefills CLIs for terminal agents that need instruction-file loading at startup', () => {
    expect(commandForAgent('coder')).toBe('claude');
    expect(commandForAgent('builder')).toBe('claude');
    expect(commandForAgent('scout')).toBe('opencode');
    expect(commandForAgent('reviewer')).toBe('opencode');
    expect(commandForAgent('critic')).toBe('opencode');
  });

  it('leaves general Jarvis panes on the user shell', () => {
    expect(commandForAgent('jarvis')).toBeUndefined();
  });
});

describe('Terminal Fleet drain processing', () => {
  it('combines current backend, transcript, and draft evidence conservatively', () => {
    const busy = terminalLeaf('busy', { sessionId: 'pty-busy' });
    const ended = terminalLeaf('ended');
    const uncertain = terminalLeaf('uncertain');
    markTerminalPaneRuntime('ended', 'idle');
    markTerminalPaneRuntime('uncertain', 'unknown');

    const evidence = buildTerminalFleetRuntimeEvidence(
      [busy, ended, uncertain],
      new Set(['pty-busy']),
      true,
      useTerminalExecutionStore.getState().paneRuntime,
      {
        'pty-busy': {
          sessionId: 'pty-busy',
          paneId: 'busy',
          agentSlug: null,
          command: 'powershell',
          text: 'server running',
          currentInput: 'npm run',
          lastWriteAt: 1,
          bytesSeen: 10,
        },
      },
    );

    expect(evidence.busy).toEqual({
      backendState: 'active',
      transcript: 'server running\nnpm run',
    });
    expect(evidence.ended).toEqual({ backendState: 'idle', transcript: '' });
    expect(evidence.uncertain).toEqual({ backendState: 'unknown', transcript: '' });
  });

  it('reuses only an affirmatively idle leaf, appends the remainder, and preserves occupied leaves', async () => {
    const occupied = terminalLeaf('occupied', {
      name: 'keep me',
      sessionId: 'pty-live',
    });
    const empty = terminalLeaf('empty', { sessionId: 'pty-ended' });
    let tree: PaneNode = fromLeaves([occupied, empty]);
    const occupiedBefore = structuredClone(occupied);
    markTerminalPaneRuntime('empty', 'idle');
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'terminal_list') return [{ sessionId: 'pty-live' }];
      return { exists: true, reason: 'available' };
    });
    const requestId = requestTerminalFleet({
      targetTotal: 3,
      selection: { kind: 'preset', presetId: 'codex' },
      batchSize: 1,
      staggerDelayMs: 25,
    });
    const [request] = useTerminalCommandQueue.getState().drain();
    if (!request || request.kind !== 'fleet') throw new Error('expected Fleet request');

    await processTerminalFleetRequest(request, {
      getTree: () => tree,
      commitTree: (next) => { tree = next; },
      invokeCommand: invokeMock,
      wait: vi.fn(async () => undefined),
    });

    const leaves = flattenLeaves(tree);
    expect(leaves).toHaveLength(3);
    expect(leaves.find((leaf) => leaf.id === 'occupied')).toEqual(occupiedBefore);
    expect(leaves.find((leaf) => leaf.id === 'empty')).toMatchObject({
      sessionId: null,
      startupCommand: 'codex',
      executionId: `${requestId}:1`,
    });
    expect(leaves.filter((leaf) => leaf.startupCommand === 'codex')).toHaveLength(2);
    expect(useTerminalFleetStore.getState().records.at(-1)).toMatchObject({
      requestId,
      status: 'complete',
      reusedCount: 1,
      createdCount: 1,
      launchedCount: 2,
    });
  });

  it('stops scheduling after cooperative cancellation without killing launched work', async () => {
    let tree: PaneNode = terminalLeaf('occupied', { sessionId: 'pty-live' });
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'terminal_list') return [{ sessionId: 'pty-live' }];
      return { exists: true, reason: 'available' };
    });
    const requestId = requestTerminalFleet({
      targetTotal: 5,
      selection: { kind: 'custom', command: 'aider --model sonnet' },
      batchSize: 1,
      staggerDelayMs: 50,
    });
    const [request] = useTerminalCommandQueue.getState().drain();
    if (!request || request.kind !== 'fleet') throw new Error('expected Fleet request');
    const wait = vi.fn(async () => {
      useTerminalCommandQueue.getState().cancel(requestId);
    });

    await processTerminalFleetRequest(request, {
      getTree: () => tree,
      commitTree: (next) => { tree = next; },
      invokeCommand: invokeMock,
      wait,
    });

    expect(flattenLeaves(tree)).toHaveLength(2);
    expect(useTerminalFleetStore.getState().records.at(-1)).toMatchObject({
      status: 'cancelled',
      launchedCount: 1,
      createdCount: 1,
    });
    expect(invokeMock).not.toHaveBeenCalledWith('terminal_kill', expect.anything());
  });
});
