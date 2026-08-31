import { describe, expect, it, vi } from 'vitest';
import { executeFabricCommand, isTerminalPeerFabricReady } from './terminalPeerFabric';
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

function deliveryRef(sessionId = 'sess-1', paneId = 'pane-1') {
  return {
    paneId,
    sessionId,
    projectId: 'proj',
    runtimeGeneration: 'gen-1',
    processInstanceId: `process-${sessionId}`,
    pid: 41,
    processStartedAt: 100,
  };
}

describe('Terminal Peer Fabric command seam', () => {
  it('reports readiness only for the compatible complete bundled capability', async () => {
    await expect(
      isTerminalPeerFabricReady(
        port({ available: true, version: '2.1.0', operations: ['connect', 'team.status'] }),
      ),
    ).resolves.toBe(true);
    await expect(
      isTerminalPeerFabricReady(
        port({ available: true, version: '2.1.0', operations: ['connect'] }),
      ),
    ).resolves.toBe(false);
    await expect(
      isTerminalPeerFabricReady(
        port({ available: true, version: '1.9.0', operations: ['connect', 'team.status'] }),
      ),
    ).resolves.toBe(false);
  });

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

  it('approval-gates message delivery, blocks live prompts, and preserves queue truth', async () => {
    const commandPort = port({
      available: true,
      version: '2.0.0',
      operations: ['connect', 'team.status'],
    });
    const deliver = vi.fn(() => 'queued' as const);
    const terminalRefs = [
      {
        paneId: 'pane-1',
        sessionId: 'sess-1',
        projectId: 'proj',
        runtimeGeneration: 'gen-1',
        processInstanceId: 'process-1',
        pid: 41,
        processStartedAt: 100,
      },
    ];
    const base = {
      id: 'team.message',
      correlationId: 'corr-message',
      accountId: 'account-a',
      payload: 'Run the audit.',
      terminalRefs,
    } as const;
    await expect(executeFabricCommand(base, commandPort, deliver)).resolves.toMatchObject({
      ok: false,
      code: 'confirmation_required',
    });
    await expect(
      executeFabricCommand(
        {
          ...base,
          approval: { commandId: 'team.message', correlationId: 'corr-message' },
          promptStates: { 'sess-1': 'password' },
        },
        commandPort,
        deliver,
      ),
    ).resolves.toMatchObject({ ok: false, code: 'target_not_ready' });
    await expect(
      executeFabricCommand(
        {
          ...base,
          approval: { commandId: 'team.message', correlationId: 'corr-message' },
          promptStates: { 'sess-1': 'ready' },
        },
        commandPort,
        deliver,
      ),
    ).resolves.toEqual({
      ok: true,
      code: 'queued',
      message: 'Team command queued (corr-message).',
    });
    expect(deliver).toHaveBeenCalledOnce();
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

  it.each([
    { id: 'team.destroy', correlationId: 'corr-1' },
    { id: 'team.status', correlationId: 'bad\ncorrelation' },
    { id: 'team.status', correlationId: 'c'.repeat(257) },
  ])('rejects malformed commands and correlations before capability access', async (request) => {
    const commandPort = port({
      available: true,
      version: '2.0.0',
      operations: ['connect', 'team.status'],
    });
    const result = await executeFabricCommand(request, commandPort);
    expect(result).toEqual({
      ok: false,
      code: 'queue_failed',
      message: 'Team command is not available.',
    });
    expect(commandPort.capability).not.toHaveBeenCalled();
    expect(commandPort.command).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(request.correlationId);
  });

  it('contains capability failures behind stable unavailable truth', async () => {
    const commandPort = port({ available: false });
    vi.mocked(commandPort.capability).mockRejectedValueOnce(new Error('private native detail'));
    const result = await executeFabricCommand(
      { id: 'team.status', correlationId: 'corr-capability', targetIds: [] },
      commandPort,
    );
    expect(result).toEqual({
      ok: false,
      code: 'queue_failed',
      message: 'Terminal Peer Fabric capability is unavailable.',
    });
    expect(JSON.stringify(result)).not.toContain('private native detail');
  });

  it.each([
    { status: 'queued', correlationId: 'different-correlation', targetIds: ['tty-1'] },
    { status: 'queued', correlationId: 'corr-receipt', targetIds: ['tty-2'] },
    { status: 'invented', correlationId: 'corr-receipt', targetIds: ['tty-1'] },
    { status: 'queued', correlationId: 'corr-receipt', targetIds: ['tty-1', 'tty-1'] },
  ])('rejects native receipts not bound to exact correlation and targets', async (receipt) => {
    const commandPort = port({
      available: true,
      version: '2.0.0',
      operations: ['connect', 'team.status'],
    });
    vi.mocked(commandPort.command).mockResolvedValueOnce(receipt as never);
    await expect(
      executeFabricCommand(
        { id: 'team.status', correlationId: 'corr-receipt', targetIds: ['tty-1'] },
        commandPort,
      ),
    ).resolves.toEqual({
      ok: false,
      code: 'queue_failed',
      message: 'Team command receipt is unavailable.',
    });
  });

  it('enforces message/broadcast cardinality, unique generations, and enumerated delivery states', async () => {
    const commandPort = port({
      available: true,
      version: '2.0.0',
      operations: ['connect', 'team.status'],
    });
    const deliver = vi.fn(() => 'completed' as never);
    const refs = [deliveryRef(), deliveryRef('sess-2', 'pane-2')];
    const approval = { commandId: 'team.message', correlationId: 'corr-message' };

    await expect(
      executeFabricCommand(
        {
          id: 'team.message',
          correlationId: 'corr-message',
          accountId: 'account-a',
          payload: 'Run the audit.',
          terminalRefs: refs,
          approval,
          promptStates: { 'sess-1': 'ready', 'sess-2': 'ready' },
        },
        commandPort,
        deliver,
      ),
    ).resolves.toEqual({
      ok: false,
      code: 'queue_failed',
      message: 'Team command rejected (corr-message).',
    });
    expect(deliver).not.toHaveBeenCalled();

    await expect(
      executeFabricCommand(
        {
          id: 'team.message',
          correlationId: 'corr-message',
          accountId: 'account-a',
          payload: 'Run the audit.',
          terminalRefs: [refs[0]!],
          approval,
          promptStates: { 'sess-1': 'ready' },
        },
        commandPort,
        deliver,
      ),
    ).resolves.toEqual({
      ok: false,
      code: 'queue_failed',
      message: 'Team delivery state is unavailable.',
    });
  });
});
