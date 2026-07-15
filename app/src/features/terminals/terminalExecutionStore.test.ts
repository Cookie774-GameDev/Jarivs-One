import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  attachTerminalExecution,
  markTerminalExecution,
  useTerminalExecutionStore,
} from './terminalExecutionStore';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));

describe('terminal execution lifecycle', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.mocked(invoke).mockResolvedValue(undefined);
    useTerminalExecutionStore.getState().clear();
  });

  it('tracks real process lifecycle states', () => {
    markTerminalExecution('exec_1', 'queued');
    markTerminalExecution('exec_1', 'starting');
    markTerminalExecution('exec_1', 'running', { sessionId: 'pty_1' });
    expect(useTerminalExecutionStore.getState().executions.exec_1).toMatchObject({
      status: 'running', sessionId: 'pty_1',
    });
    markTerminalExecution('exec_1', 'complete', { exitCode: 0 });
    expect(useTerminalExecutionStore.getState().executions.exec_1).toMatchObject({
      status: 'complete', exitCode: 0,
    });
    markTerminalExecution('exec_2', 'failed', { exitCode: 1 });
    markTerminalExecution('exec_3', 'cancelled', { exitCode: null });
    expect(useTerminalExecutionStore.getState().executions.exec_2.status).toBe('failed');
    expect(useTerminalExecutionStore.getState().executions.exec_3.status).toBe('cancelled');
  });

  it('bounds retained metadata', () => {
    let now = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => ++now);
    for (let index = 0; index < 140; index += 1) markTerminalExecution(`exec_${index}`, 'queued');
    expect(Object.keys(useTerminalExecutionStore.getState().executions)).toHaveLength(100);
  });

  it('kills a running PTY only when an explicit timeout expires', async () => {
    vi.useFakeTimers();
    markTerminalExecution('exec_timeout', 'queued', { timeoutMs: 1_000 });
    markTerminalExecution('exec_timeout', 'running', { sessionId: 'pty_timeout' });

    await vi.advanceTimersByTimeAsync(999);
    expect(invoke).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(invoke).toHaveBeenCalledWith('terminal_kill', { sessionId: 'pty_timeout' });
    expect(useTerminalExecutionStore.getState().executions.exec_timeout).toMatchObject({
      status: 'failed',
      timedOut: true,
    });
    vi.useRealTimers();
  });

  it('does not impose a timeout on long-running commands by default', async () => {
    vi.useFakeTimers();
    markTerminalExecution('exec_server', 'running', { sessionId: 'pty_server' });
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(invoke).not.toHaveBeenCalled();
    expect(useTerminalExecutionStore.getState().executions.exec_server.status).toBe('running');
    vi.useRealTimers();
  });

  it('kills a PTY that attaches after its drained command was cancelled', async () => {
    markTerminalExecution('exec_race', 'starting');
    markTerminalExecution('exec_race', 'cancelled');

    const attached = await attachTerminalExecution('exec_race', 'pty_race');

    expect(attached).toBe(false);
    expect(invoke).toHaveBeenCalledWith('terminal_kill', { sessionId: 'pty_race' });
    expect(useTerminalExecutionStore.getState().executions.exec_race.status).toBe('cancelled');
  });

  it('stays starting until startup input has been accepted by the PTY backend', async () => {
    markTerminalExecution('exec_start', 'starting');

    const attached = await attachTerminalExecution('exec_start', 'pty_start');

    expect(attached).toBe(true);
    expect(useTerminalExecutionStore.getState().executions.exec_start).toMatchObject({
      status: 'starting',
      sessionId: 'pty_start',
    });
    markTerminalExecution('exec_start', 'running');
    expect(useTerminalExecutionStore.getState().executions.exec_start.status).toBe('running');
  });

  it('does not let a late startup result overwrite cancellation', () => {
    markTerminalExecution('exec_cancelled', 'starting');
    markTerminalExecution('exec_cancelled', 'cancelled');

    markTerminalExecution('exec_cancelled', 'running', { sessionId: 'pty_late' });
    markTerminalExecution('exec_cancelled', 'failed', { exitCode: 1 });

    expect(useTerminalExecutionStore.getState().executions.exec_cancelled).toMatchObject({
      status: 'cancelled',
    });
  });
});
