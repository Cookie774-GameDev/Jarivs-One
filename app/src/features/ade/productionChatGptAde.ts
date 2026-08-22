import { productionContextGateway } from '@/features/context/gateway/productionContextGateway';
import {
  authorizeTerminalContextBridgeIdentity,
  registerTerminalContextBridgeRequest,
} from '@/features/terminals/terminalContextBridgeIdentity';
import {
  ChatGptAdeAdapter,
  type ChatGptAdeDispatcher,
  type ChatGptAdeGateway,
} from './ChatGptAdeAdapter';
import type { ChatGptAdeAuthorizedTerminalLink, ChatGptAdeLifecycleEvent } from './adeContracts';

export interface ProductionChatGptAdeDependencies {
  dispatcher: Readonly<ChatGptAdeDispatcher>;
  recordEvent(event: Readonly<ChatGptAdeLifecycleEvent>): void;
  now?(): number;
  gateway?: ChatGptAdeGateway;
}

/**
 * Creates the first local ChatGPT ADE authority over the same process-local
 * Context Gateway and terminal identity authority used by VibeSpace itself.
 * The caller supplies presentation/history and exact provider dispatch only;
 * this factory creates no ADE-specific retrieval, cache, terminal, or model route.
 */
export function createProductionChatGptAdeAdapter(
  dependencies: Readonly<ProductionChatGptAdeDependencies>,
): ChatGptAdeAdapter {
  const now = dependencies.now ?? Date.now;
  return new ChatGptAdeAdapter({
    gateway: dependencies.gateway ?? productionContextGateway,
    dispatcher: dependencies.dispatcher,
    recordEvent: dependencies.recordEvent,
    now,
    registerTerminalCancellation: registerTerminalContextBridgeRequest,
    authorizeTerminal(input): Readonly<ChatGptAdeAuthorizedTerminalLink> | null {
      const authorized = authorizeTerminalContextBridgeIdentity(input, now());
      if (!authorized || authorized.terminalSessionId === null) return null;
      return Object.freeze({
        identityId: authorized.identityId,
        terminalSessionId: authorized.terminalSessionId,
        paneId: authorized.paneId,
        accountId: authorized.accountId,
        workspaceId: authorized.workspaceId,
        projectId: authorized.projectId,
        worktreeId: authorized.worktreeId,
        access: authorized.access,
        runGeneration: authorized.runGeneration,
      });
    },
  });
}
