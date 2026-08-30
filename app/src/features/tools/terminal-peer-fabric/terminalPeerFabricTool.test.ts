import { describe, expect, it, vi } from 'vitest';
import {
  createTerminalPeerFabricCommandPort,
  TERMINAL_PEER_FABRIC_TOOL,
} from './terminalPeerFabricTool';

describe('Terminal Peer Fabric preloaded tool', () => {
  it('is bundled as a preloaded tool with no install or download action', () => {
    expect(TERMINAL_PEER_FABRIC_TOOL).toMatchObject({
      id: 'terminal-peer-fabric',
      name: 'Terminal Peer Fabric',
      distribution: 'preloaded',
    });
    expect(TERMINAL_PEER_FABRIC_TOOL.actions).toEqual(['inspect', 'open']);
  });

  it('fails closed when the native capability is absent', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('unknown command'));
    const port = createTerminalPeerFabricCommandPort(invoke);

    await expect(port.capability()).resolves.toEqual({ available: false });
    await expect(
      port.command({ commandId: 'team.status', correlationId: 'corr-1', targetIds: [] }),
    ).rejects.toThrow(/unavailable/i);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('accepts only compatible versioned native capabilities', async () => {
    const invoke = vi.fn().mockResolvedValue({
      available: true,
      version: '1.2.0',
      operations: ['connect', 'team.status'],
    });
    const port = createTerminalPeerFabricCommandPort(invoke);

    await expect(port.capability()).resolves.toEqual({
      available: true,
      version: '1.2.0',
      operations: ['connect', 'team.status'],
    });
  });

  it('does not advertise a versioned endpoint that cannot connect a team', async () => {
    const invoke = vi.fn().mockResolvedValue({ available: true, version: '1.2.0' });
    const port = createTerminalPeerFabricCommandPort(invoke);

    await expect(port.capability()).resolves.toEqual({ available: false });
  });
});
