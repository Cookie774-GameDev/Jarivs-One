import { describe, expect, it, vi } from 'vitest';
import { executeFabricCommand } from './terminalPeerFabric';
import type { TerminalPeerFabricCommandPort } from '@/features/tools/terminal-peer-fabric/terminalPeerFabricTool';

function port(
  capability: Awaited<ReturnType<TerminalPeerFabricCommandPort['capability']>>,
): TerminalPeerFabricCommandPort {
  return {
    capability: vi.fn(async () => capability),
    connect: vi.fn(),
    command: vi.fn(),
  };
}

describe('Terminal Peer Fabric command seam', () => {
  it('fails closed until a compatible bundled native capability is ready', async () => {
    const commandPort = port({
      available: true,
      version: '1.0.0',
      operations: ['connect', 'team.status'],
    });
    await expect(
      executeFabricCommand(
        { id: 'team.status', correlationId: 'corr-1', targetIds: [] },
        commandPort,
      ),
    ).resolves.toMatchObject({
      ok: false,
      code: 'queue_failed',
    });
    expect(commandPort.command).not.toHaveBeenCalled();
  });

  it('preserves queued delivery truth through the real port contract', async () => {
    const commandPort = port({
      available: true,
      version: '2.1.0',
      operations: ['connect', 'team.status'],
    });
    vi.mocked(commandPort.command).mockResolvedValue({
      status: 'queued',
      correlationId: 'fabric-1',
      targetIds: ['tty-1'],
    });
    await expect(
      executeFabricCommand(
        { id: 'team.status', correlationId: 'fabric-1', targetIds: ['tty-1'] },
        commandPort,
      ),
    ).resolves.toEqual({
      ok: true,
      code: 'queued',
      message: 'Team command queued (fabric-1).',
    });
    expect(commandPort.command).toHaveBeenCalledWith({
      commandId: 'team.status',
      correlationId: 'fabric-1',
      targetIds: ['tty-1'],
    });
  });

  it('maps stable refs into the preloaded connect authority without labels', async () => {
    const commandPort = port({
      available: true,
      version: '2.0.0',
      operations: ['connect', 'team.status'],
    });
    vi.mocked(commandPort.connect).mockResolvedValue({
      status: 'completed',
      correlationId: 'corr-connect',
      targetIds: ['sess-1', 'sess-2'],
    });
    const terminalRefs = [
      { paneId: 'pane-1', sessionId: 'sess-1', projectId: 'proj', runtimeGeneration: 'gen-1' },
      { paneId: 'pane-2', sessionId: 'sess-2', projectId: 'proj', runtimeGeneration: 'gen-2' },
    ];
    await expect(
      executeFabricCommand(
        { id: 'team.connect', correlationId: 'corr-connect', terminalRefs },
        commandPort,
      ),
    ).resolves.toMatchObject({ ok: true, code: 'opened' });
    expect(commandPort.connect).toHaveBeenCalledWith({
      correlationId: 'corr-connect',
      peerRefs: terminalRefs,
    });
  });

  it('does not dispatch lifecycle operations the native capability does not advertise', async () => {
    const commandPort = port({
      available: true,
      version: '2.0.0',
      operations: ['connect', 'team.status'],
    });
    await expect(
      executeFabricCommand(
        {
          id: 'team.message',
          correlationId: 'corr-message',
          targetIds: ['tty-1'],
          payload: 'secret',
        },
        commandPort,
      ),
    ).resolves.toMatchObject({ ok: false, code: 'queue_failed' });
    expect(commandPort.command).not.toHaveBeenCalled();
    expect(commandPort.connect).not.toHaveBeenCalled();
  });

  it.each(['stored', 'rejected'] as const)('preserves %s receipt truth', async (status) => {
    const commandPort = port({
      available: true,
      version: '2.0.0',
      operations: ['connect', 'team.status'],
    });
    vi.mocked(commandPort.command).mockResolvedValue({
      status,
      correlationId: `corr-${status}`,
      targetIds: [],
    });
    const result = await executeFabricCommand(
      { id: 'team.status', correlationId: `corr-${status}`, targetIds: [] },
      commandPort,
    );
    expect(result.message).toBe(`Team command ${status} (corr-${status}).`);
    expect(result.ok).toBe(status !== 'rejected');
  });
});
