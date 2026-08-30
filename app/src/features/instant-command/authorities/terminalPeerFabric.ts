import type { InstantResult } from '../types';

export type FabricReceipt = Readonly<{
  status: 'completed' | 'queued' | 'stored' | 'rejected';
  receiptId: string;
}>;

export type FabricCommandRequest = Readonly<{
  id: string;
  teamId?: string;
  payload?: string;
  terminalRefs?: readonly Readonly<{
    paneId: string;
    sessionId: string;
    projectId: string;
    runtimeGeneration: string;
  }>[];
}>;

export interface TerminalPeerFabricCommandPort {
  capability(): Promise<{ available: boolean; version?: string }>;
  connect(request: FabricCommandRequest): Promise<FabricReceipt>;
  command(request: FabricCommandRequest): Promise<FabricReceipt>;
}

function compatible(version: string | undefined): boolean {
  const major = Number(version?.split('.', 1)[0]);
  return Number.isInteger(major) && major >= 2;
}

export async function executeFabricCommand(
  request: FabricCommandRequest,
  port: TerminalPeerFabricCommandPort,
): Promise<InstantResult> {
  const capability = await port.capability();
  if (!capability.available || !compatible(capability.version)) {
    return {
      ok: false,
      code: 'queue_failed',
      message: 'Terminal Peer Fabric requires the compatible bundled native capability.',
    };
  }
  const receipt =
    request.id === 'team.connect' ? await port.connect(request) : await port.command(request);
  if (receipt.status === 'rejected') {
    return {
      ok: false,
      code: 'queue_failed',
      message: `Team command rejected (${receipt.receiptId}).`,
    };
  }
  const code = receipt.status === 'completed' ? 'opened' : 'queued';
  return {
    ok: true,
    code,
    message: `Team command ${receipt.status} (${receipt.receiptId}).`,
  };
}
