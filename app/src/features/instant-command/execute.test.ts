import { describe, expect, it, vi } from 'vitest';
import type { InstantCommand, LiveTerminalTarget } from './types';
import { executeInstantCommand, type InstantCommandDependencies } from './execute';

const codex: LiveTerminalTarget = {
  sessionId: 'tty-codex',
  paneId: 'pane-codex',
  projectId: 'project-a',
  ordinal: 1,
  provider: 'codex',
  label: 'Codex',
  processIdentity: {
    projectId: 'project-a',
    processInstanceId: 'process-codex',
    pid: 4242,
    processStartedAt: 1_723_456_789_000,
    runtimeGeneration: 'runtime-a',
  },
};

function dependencies(targets: LiveTerminalTarget[] = [codex]) {
  const executeLegacy = vi.fn(async () => ({ ok: true, message: 'legacy ok' }));
  const enqueueBatch = vi.fn(() => ['jterm_1']);
  const routeToTerminal = vi.fn();
  const openModelPicker = vi.fn();
  const readTargets = vi.fn(async () => targets);
  const deps: InstantCommandDependencies = {
    executeLegacy,
    enqueueBatch,
    routeToTerminal,
    openModelPicker,
    readTargets,
  };
  return { deps, executeLegacy, enqueueBatch, routeToTerminal, openModelPicker, readTargets };
}

describe('executeInstantCommand', () => {
  it('delegates legacy commands unchanged', async () => {
    const h = dependencies();
    const command: InstantCommand = { kind: 'legacy', intent: { kind: 'open_schedule' } };
    await expect(executeInstantCommand(command, h.deps)).resolves.toEqual({
      ok: true,
      code: 'legacy',
      message: 'legacy ok',
    });
    expect(h.executeLegacy).toHaveBeenCalledWith(command.intent);
    expect(h.enqueueBatch).not.toHaveBeenCalled();
  });

  it('opens a bounded CLI through the existing new-terminal queue', async () => {
    const h = dependencies();
    await expect(
      executeInstantCommand({ kind: 'open-agent-cli', provider: 'codex', count: 2 }, h.deps),
    ).resolves.toMatchObject({ ok: true, code: 'queued' });
    expect(h.enqueueBatch).toHaveBeenCalledWith([
      { command: 'codex', label: 'codex', target: 'new' },
      { command: 'codex', label: 'codex 2', target: 'new' },
    ]);
    expect(h.routeToTerminal).toHaveBeenCalledOnce();
  });

  it('uses the registered executable rather than inventing a CLI command', async () => {
    const h = dependencies();
    await expect(
      executeInstantCommand({ kind: 'open-agent-cli', provider: 'kiro', count: 1 }, h.deps),
    ).resolves.toMatchObject({ ok: true, code: 'queued' });
    expect(h.enqueueBatch).toHaveBeenCalledWith([
      { command: 'kiro-cli', label: 'kiro', target: 'new' },
    ]);
  });

  it('opens the existing picker without selecting a model', async () => {
    const h = dependencies();
    await expect(
      executeInstantCommand({ kind: 'open-model-picker' }, h.deps),
    ).resolves.toMatchObject({ ok: true, code: 'opened' });
    expect(h.openModelPicker).toHaveBeenCalledOnce();
    expect(h.enqueueBatch).not.toHaveBeenCalled();
  });

  it('queues exact pane/session refs and reports queued rather than delivered', async () => {
    const h = dependencies();
    await expect(
      executeInstantCommand(
        {
          kind: 'agent-message',
          target: { provider: 'codex', scope: 'one' },
          payload: 'Audit Auth',
        },
        h.deps,
      ),
    ).resolves.toEqual({
      ok: true,
      code: 'queued',
      message: 'Queued command for 1 terminal.',
    });
    expect(h.enqueueBatch).toHaveBeenCalledWith([
      {
        command: 'Audit Auth',
        target: 'refs',
        refs: [
          {
            paneId: 'pane-codex',
            sessionId: 'tty-codex',
            projectId: 'project-a',
            label: 'Codex',
            command: 'codex',
            expectedProcess: codex.processIdentity,
          },
        ],
      },
    ]);
    expect(h.routeToTerminal).toHaveBeenCalledOnce();
  });

  it('fails closed on ambiguous or stale targets and does not queue', async () => {
    const h = dependencies([codex, { ...codex, sessionId: 'tty-2', paneId: 'pane-2', ordinal: 2 }]);
    await expect(
      executeInstantCommand(
        { kind: 'agent-message', target: { provider: 'codex' }, payload: 'audit' },
        h.deps,
      ),
    ).resolves.toMatchObject({ ok: false, code: 'target_ambiguous' });
    expect(h.enqueueBatch).not.toHaveBeenCalled();
  });

  it('submits a multi-open request through one atomic batch authority', async () => {
    const h = dependencies();
    h.enqueueBatch.mockImplementation(() => {
      throw new Error('batch rejected before commit');
    });

    await expect(
      executeInstantCommand({ kind: 'open-agent-cli', provider: 'codex', count: 3 }, h.deps),
    ).resolves.toMatchObject({ ok: false, code: 'queue_failed' });
    expect(h.enqueueBatch).toHaveBeenCalledOnce();
    expect((h.enqueueBatch.mock.calls as unknown[][])[0]?.[0]).toHaveLength(3);
    expect(h.routeToTerminal).not.toHaveBeenCalled();
  });
});
