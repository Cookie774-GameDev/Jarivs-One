import {
  terminalPeerFabricCommandPort,
  type FabricPeerRef,
  type TerminalPeerFabricCommandPort,
  type TerminalPeerFabricOperation,
} from '@/features/tools/terminal-peer-fabric/terminalPeerFabricTool';
import type { InstantResult } from '../types';

export type FabricAuthorityRequest = Readonly<{
  id: string;
  correlationId: string;
  teamId?: string;
  payload?: string;
  targetIds?: readonly string[];
  terminalRefs?: readonly FabricPeerRef[];
}>;

function compatible(version: string | undefined): boolean {
  return typeof version === 'string' && /^2\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/iu.test(version);
}

function requiredOperation(id: string): TerminalPeerFabricOperation | null {
  if (id === 'team.connect') return 'connect';
  if (id === 'team.status') return 'team.status';
  return null;
}

function unavailable(message: string): InstantResult {
  return { ok: false, code: 'queue_failed', message };
}

export async function executeFabricCommand(
  request: FabricAuthorityRequest,
  port: TerminalPeerFabricCommandPort = terminalPeerFabricCommandPort,
): Promise<InstantResult> {
  const operation = requiredOperation(request.id);
  if (!operation) {
    return unavailable(`Team command ${request.id} is not available in this Fabric capability.`);
  }
  const capability = await port.capability();
  if (
    !capability.available ||
    !compatible(capability.version) ||
    !capability.operations?.includes(operation)
  ) {
    return unavailable('Terminal Peer Fabric requires the compatible bundled native capability.');
  }

  try {
    const receipt =
      operation === 'connect'
        ? await port.connect({
            correlationId: request.correlationId,
            peerRefs: request.terminalRefs ?? [],
          })
        : await port.command({
            commandId: operation,
            correlationId: request.correlationId,
            targetIds: request.targetIds ?? [],
          });
    if (receipt.status === 'rejected') {
      return unavailable(`Team command rejected (${receipt.correlationId}).`);
    }
    return {
      ok: true,
      code: receipt.status === 'completed' ? 'opened' : 'queued',
      message: `Team command ${receipt.status} (${receipt.correlationId}).`,
    };
  } catch {
    return unavailable(`Team command failed (${request.correlationId}).`);
  }
}

export type { TerminalPeerFabricCommandPort };
