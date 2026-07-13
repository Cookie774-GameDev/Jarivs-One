import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  flushWorkspacePersistence,
  flushWorkspacePersistenceAndAcknowledge,
} from './workspaceFlush';
import { captureLiveTree, _resetLiveCacheForTests } from '@/features/terminals/terminalLiveCache';
import { terminalTreeStorageKey } from '@/features/terminals/terminalProjectMove';
import { useTerminalTranscriptStore } from '@/features/terminals/transcriptStore';
import type { PaneNode } from '@/features/terminals/paneTree';
import {
  _resetTerminalSnapshotRegistryForTests,
  registerTerminalSnapshotFlush,
} from '@/features/terminals/terminalSnapshotRegistry';

function leaf(id: string, sessionId: string): PaneNode {
  return {
    kind: 'leaf',
    id,
    sessionId,
    projectId: 'project-a',
    command: 'powershell.exe',
    currentInput: undefined,
  } as PaneNode;
}

describe('flushWorkspacePersistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
    _resetLiveCacheForTests();
    _resetTerminalSnapshotRegistryForTests();
    useTerminalTranscriptStore.getState().reset();
    vi.useRealTimers();
  });

  it('broadcasts terminal persist before flushing transcripts and pane trees', async () => {
    const order: string[] = [];
    window.addEventListener(
      'jarvis:terminal:persist-now',
      () => {
        order.push('event');
        useTerminalTranscriptStore
          .getState()
          .registerSession('pty-live', {
            paneId: 'pane-a',
            projectId: 'project-a',
            command: 'powershell.exe',
          });
        useTerminalTranscriptStore.getState().appendOutput('pty-live', 'last second output\n');
      },
      { once: true },
    );
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(
      this: Storage,
      key,
      value,
    ) {
      if (key === 'jarvis-terminal-transcripts') order.push('storage');
      return originalSetItem.call(this, key, value);
    });

    captureLiveTree('project-a', leaf('pane-a', 'pty-live'));
    await flushWorkspacePersistence('test');

    expect(order.indexOf('event')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('storage')).toBeGreaterThan(order.indexOf('event'));
    expect(window.localStorage.getItem(terminalTreeStorageKey('project-a'))).toContain('pane-a');
    expect(window.localStorage.getItem('jarvis-terminal-transcripts')).toContain('last second output');
  });

  it('awaits registered terminal snapshots after synchronous storage work', async () => {
    let release: (() => void) | undefined;
    registerTerminalSnapshotFlush(
      'pane-a',
      () => new Promise<void>((resolve) => {
        release = resolve;
      }),
    );

    let settled = false;
    const pending = flushWorkspacePersistence('await-snapshot').then((result) => {
      settled = true;
      return result;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    release?.();
    await expect(pending).resolves.toEqual({ completed: 1, failed: 0, timedOut: false });
  });

  it('reports snapshot rejection without rejecting the workspace flush', async () => {
    registerTerminalSnapshotFlush('bad', async () => {
      throw new Error('synthetic snapshot failure');
    });

    await expect(flushWorkspacePersistence('rejection')).resolves.toEqual({
      completed: 0,
      failed: 1,
      timedOut: false,
    });
  });

  it('returns after the 1,200 ms snapshot deadline', async () => {
    vi.useFakeTimers();
    registerTerminalSnapshotFlush('stuck', () => new Promise(() => {}));

    const pending = flushWorkspacePersistence('timeout');
    await vi.advanceTimersByTimeAsync(1_200);

    await expect(pending).resolves.toEqual({
      completed: 0,
      failed: 0,
      timedOut: true,
    });
  });

  it('acknowledges desktop exit only after the bounded flush settles', async () => {
    let release: (() => void) | undefined;
    registerTerminalSnapshotFlush(
      'pane-exit',
      () => new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    const acknowledge = vi.fn(async () => undefined);

    const pending = flushWorkspacePersistenceAndAcknowledge(
      'tray-exit',
      acknowledge,
    );
    await Promise.resolve();
    expect(acknowledge).not.toHaveBeenCalled();

    release?.();
    await expect(pending).resolves.toEqual({ completed: 1, failed: 0, timedOut: false });
    expect(acknowledge).toHaveBeenCalledOnce();
  });
});
