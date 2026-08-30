import { invoke as tauriInvoke } from '@tauri-apps/api/core';

export const TERMINAL_PEER_FABRIC_TOOL = Object.freeze({
  id: 'terminal-peer-fabric',
  name: 'Terminal Peer Fabric',
  distribution: 'preloaded' as const,
  actions: Object.freeze(['inspect', 'open'] as const),
});

export type TerminalPeerFabricCapability = Readonly<{
  available: boolean;
  version?: string;
}>;

export type ConnectTeamRequest = Readonly<{
  correlationId: string;
  peerIds: readonly string[];
}>;

export type FabricCommandRequest = Readonly<{
  commandId: string;
  correlationId: string;
  targetIds: readonly string[];
  arguments?: Readonly<Record<string, unknown>>;
}>;

export type FabricReceipt = Readonly<{
  correlationId: string;
  status: 'completed' | 'queued' | 'rejected';
  targetIds: readonly string[];
}>;

export interface TerminalPeerFabricCommandPort {
  capability(): Promise<TerminalPeerFabricCapability>;
  connect(request: ConnectTeamRequest): Promise<FabricReceipt>;
  command(request: FabricCommandRequest): Promise<FabricReceipt>;
}

type InvokeFn = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function compatibleCapability(value: unknown): TerminalPeerFabricCapability {
  if (!value || typeof value !== 'object') return { available: false };
  const candidate = value as { available?: unknown; version?: unknown };
  if (candidate.available !== true || typeof candidate.version !== 'string') {
    return { available: false };
  }
  const version = candidate.version.trim();
  if (!/^1\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/iu.test(version)) return { available: false };
  return { available: true, version };
}

export function createTerminalPeerFabricCommandPort(
  invoke: InvokeFn = tauriInvoke,
): TerminalPeerFabricCommandPort {
  let capabilityPromise: Promise<TerminalPeerFabricCapability> | null = null;
  const capability = () => {
    capabilityPromise ??= invoke<unknown>('terminal_peer_fabric', {
      request: { action: 'capability' },
    })
      .then(compatibleCapability)
      .catch(() => ({ available: false }));
    return capabilityPromise;
  };

  const operate = async (request: Record<string, unknown>): Promise<FabricReceipt> => {
    const current = await capability();
    if (!current.available) throw new Error('Terminal Peer Fabric is unavailable in this build.');
    return invoke<FabricReceipt>('terminal_peer_fabric', { request });
  };

  return Object.freeze({
    capability,
    connect: (request) => operate({ action: 'connect', ...request }),
    command: (request) => operate({ action: 'command', ...request }),
  });
}

export const terminalPeerFabricCommandPort = createTerminalPeerFabricCommandPort();
