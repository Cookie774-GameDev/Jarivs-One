import { describe, expect, it, vi } from 'vitest';
import { executeFabricCommand, type TerminalPeerFabricCommandPort } from './terminalPeerFabric';

describe('Terminal Peer Fabric command seam', () => {
  it('fails closed until a compatible bundled native capability is ready', async () => {
    const port: TerminalPeerFabricCommandPort = {
      capability: vi.fn(async () => ({ available: true, version: '1.0.0' })),
      connect: vi.fn(),
      command: vi.fn(),
    };
    await expect(
      executeFabricCommand({ id: 'team.status', teamId: 'team_1' }, port),
    ).resolves.toMatchObject({
      ok: false,
      code: 'queue_failed',
    });
    expect(port.command).not.toHaveBeenCalled();
  });

  it('preserves queued delivery truth for a compatible capability', async () => {
    const port: TerminalPeerFabricCommandPort = {
      capability: vi.fn(async () => ({ available: true, version: '2.1.0' })),
      connect: vi.fn(),
      command: vi.fn(async () => ({ status: 'queued' as const, receiptId: 'fabric_1' })),
    };
    await expect(
      executeFabricCommand({ id: 'team.message', teamId: 'team_1', payload: 'Audit.' }, port),
    ).resolves.toEqual({
      ok: true,
      code: 'queued',
      message: 'Team command queued (fabric_1).',
    });
  });
});
