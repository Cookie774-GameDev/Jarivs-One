import {
  terminalPeerFabricCommandPort,
  type FabricPeerRef,
  type TerminalPeerFabricCommandPort,
  type TerminalPeerFabricOperation,
} from '@/features/tools/terminal-peer-fabric/terminalPeerFabricTool';
import {
  enqueueFabricTerminalDelivery,
  type FabricTerminalDeliveryState,
} from '@/features/terminals/terminalCommandQueue';
import type { TerminalRef } from '@/features/terminals/terminalRefs';
import type { InstantResult } from '../types';

type FabricPromptState = 'ready' | 'approval' | 'question' | 'password' | 'ssh' | 'unknown';
type FabricDeliveryPeerRef = FabricPeerRef &
  Readonly<{
    processInstanceId: string;
    pid: number;
    processStartedAt: number;
  }>;

export type FabricAuthorityRequest = Readonly<{
  id: string;
  correlationId: string;
  accountId?: string;
  teamId?: string;
  payload?: string;
  targetIds?: readonly string[];
  terminalRefs?: readonly (FabricPeerRef | FabricDeliveryPeerRef)[];
  approval?: Readonly<{ commandId: string; correlationId: string }>;
  promptStates?: Readonly<Record<string, FabricPromptState>>;
}>;

function compatible(version: string | undefined): boolean {
  return typeof version === 'string' && /^2\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/iu.test(version);
}

export async function isTerminalPeerFabricReady(
  port: TerminalPeerFabricCommandPort = terminalPeerFabricCommandPort,
): Promise<boolean> {
  try {
    const capability = await port.capability();
    return Boolean(
      capability.available &&
      compatible(capability.version) &&
      capability.operations?.includes('connect') &&
      capability.operations.includes('team.status'),
    );
  } catch {
    return false;
  }
}

function requiredOperation(id: string): TerminalPeerFabricOperation | 'delivery' | null {
  if (id === 'team.connect') return 'connect';
  if (id === 'team.status' || id === 'team.list') return 'team.status';
  if (id === 'team.message' || id === 'team.broadcast') return 'delivery';
  return null;
}

function unavailable(message: string): InstantResult {
  return { ok: false, code: 'queue_failed', message };
}

function deliveryPeerRef(ref: FabricPeerRef | FabricDeliveryPeerRef): ref is FabricDeliveryPeerRef {
  const candidate = ref as Partial<FabricDeliveryPeerRef>;
  return (
    typeof candidate.processInstanceId === 'string' &&
    candidate.processInstanceId.length > 0 &&
    Number.isSafeInteger(candidate.pid) &&
    Number(candidate.pid) > 0 &&
    Number.isSafeInteger(candidate.processStartedAt) &&
    Number(candidate.processStartedAt) > 0
  );
}

export async function executeFabricCommand(
  request: FabricAuthorityRequest,
  port: TerminalPeerFabricCommandPort = terminalPeerFabricCommandPort,
  deliver: (input: {
    accountId: string;
    runId: string;
    executionId: string;
    command: string;
    refs: readonly TerminalRef[];
  }) => FabricTerminalDeliveryState = enqueueFabricTerminalDelivery,
): Promise<InstantResult> {
  const operation = requiredOperation(request.id);
  if (!operation) {
    return unavailable(`Team command ${request.id} is not available in this Fabric capability.`);
  }
  const capability = await port.capability();
  if (
    !capability.available ||
    !compatible(capability.version) ||
    !capability.operations?.includes(operation === 'delivery' ? 'connect' : operation)
  ) {
    return unavailable('Terminal Peer Fabric requires the compatible bundled native capability.');
  }

  if (operation === 'delivery') {
    const refs = request.terminalRefs ?? [];
    const payload = request.payload ?? '';
    if (
      !request.accountId?.trim() ||
      !payload.trim() ||
      payload.length > 32_768 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(payload) ||
      refs.length === 0 ||
      (request.id === 'team.broadcast' && refs.length < 2) ||
      !refs.every(deliveryPeerRef)
    ) {
      return unavailable(`Team command rejected (${request.correlationId}).`);
    }
    if (
      request.approval?.commandId !== request.id ||
      request.approval.correlationId !== request.correlationId
    ) {
      return {
        ok: false,
        code: 'confirmation_required',
        message: 'Approve this exact team prompt before it is delivered.',
      };
    }
    if (refs.some((ref) => (request.promptStates?.[ref.sessionId] ?? 'unknown') !== 'ready')) {
      return {
        ok: false,
        code: 'target_not_ready',
        message: 'A selected terminal is blocked by an interactive prompt.',
      };
    }
    const deliveryRefs = refs.filter(deliveryPeerRef);
    const state = deliver({
      accountId: request.accountId,
      runId: request.correlationId,
      executionId: request.correlationId,
      command: payload,
      refs: deliveryRefs.map((ref) => ({
        paneId: ref.paneId,
        sessionId: ref.sessionId,
        projectId: ref.projectId,
        expectedProcess: {
          projectId: ref.projectId,
          processInstanceId: ref.processInstanceId,
          pid: ref.pid,
          processStartedAt: ref.processStartedAt,
          runtimeGeneration: ref.runtimeGeneration,
        },
      })),
    });
    return state === 'rejected'
      ? unavailable(`Team command rejected (${request.correlationId}).`)
      : {
          ok: true,
          code: 'queued',
          message: `Team command ${state} (${request.correlationId}).`,
        };
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
