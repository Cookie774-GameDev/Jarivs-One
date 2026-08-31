import { productionContextGateway } from '@/features/context/gateway/productionContextGateway';
import {
  authorizeTerminalContextBridgeIdentity,
  registerTerminalContextBridgeRequest,
} from '@/features/terminals/terminalContextBridgeIdentity';
import { jarvisRunRepo } from '@/lib/db/jarvisRepositories';
import type { JarvisRun } from '@/lib/jarvis/contracts/execution';
import {
  ChatGptAdeAdapter,
  type ChatGptAdeRunListener,
  type ChatGptAdeDispatcher,
  type ChatGptAdeGateway,
} from './ChatGptAdeAdapter';
import {
  ChatGptAdeJarvisHistory,
  type ChatGptAdeHistoryRunRepository,
} from './ChatGptAdeJarvisHistory';
import type {
  ChatGptAdeAuthorizedTerminalLink,
  ChatGptAdeLifecycleEvent,
  ChatGptAdeRunRequest,
  ChatGptAdeRunSnapshot,
} from './adeContracts';

export interface ProductionChatGptAdeDependencies {
  dispatcher: Readonly<ChatGptAdeDispatcher>;
  recordEvent(event: Readonly<ChatGptAdeLifecycleEvent>): void;
  now?(): number;
  gateway?: ChatGptAdeGateway;
  flushEvents?(): Promise<void>;
}

export interface DurableProductionChatGptAdeRunDependencies {
  seed: Readonly<JarvisRun>;
  dispatcher: Readonly<ChatGptAdeDispatcher>;
  now?(): number;
  gateway?: ChatGptAdeGateway;
  runRepository?: Readonly<ChatGptAdeHistoryRunRepository>;
}

export interface DurableProductionChatGptAdeRun {
  run(input: Readonly<ChatGptAdeRunRequest>): Promise<Readonly<ChatGptAdeRunSnapshot>>;
  cancel(): boolean;
  getRun(): Readonly<ChatGptAdeRunSnapshot> | null;
  subscribe(listener: ChatGptAdeRunListener): () => void;
  flushHistory(): Promise<void>;
}

export interface ChatGptAdeRecoveryProjection {
  runId: string;
  status: 'interrupted' | 'completed' | 'failed' | 'cancelled';
  updatedAt: number;
  retryable: boolean;
}

interface ChatGptAdeRecoveryRepository {
  listByAccount(accountId: string, options?: unknown): Promise<JarvisRun[]>;
}

function validAuthorityPart(value: string): boolean {
  const clean = value.trim();
  return Boolean(clean && clean.length <= 1_024 && !/[\u0000-\u001f\u007f]/u.test(clean));
}

export function createChatGptAdeRunSeed(input: {
  runId: string;
  scope: Readonly<ChatGptAdeRunRequest['scope']>;
  executionIdentity: Readonly<ChatGptAdeRunRequest['executionIdentity']>;
  now?: number;
}): Readonly<JarvisRun> {
  const { scope, executionIdentity } = input;
  if (
    ![
      input.runId,
      scope.accountId,
      scope.workspaceId,
      scope.projectId,
      scope.worktreeId,
      scope.revision,
      executionIdentity.transportConnectionId,
      executionIdentity.upstreamProviderId,
      executionIdentity.upstreamModelId,
    ].every(validAuthorityPart)
  ) {
    throw new TypeError('ade_run_seed_invalid');
  }
  const capturedAt = input.now ?? Date.now();
  return Object.freeze({
    id: input.runId.trim(),
    accountId: scope.accountId,
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    source: 'chatgpt_ade',
    status: 'queued',
    agentId: 'chatgpt-ade',
    identityVersion: 1,
    profileRevisionId: `chatgpt-ade:${scope.revision}`,
    model: Object.freeze({
      connectionId: executionIdentity.transportConnectionId,
      providerId: executionIdentity.upstreamProviderId,
      modelId: executionIdentity.upstreamModelId,
      connectionMode: 'external-cli',
      capabilities: Object.freeze({ tools: true }),
      capturedAt,
    }),
    createdAt: capturedAt,
    updatedAt: capturedAt,
  });
}

export async function readLatestChatGptAdeRecovery(input: {
  accountId: string;
  projectId: string;
  repository?: Readonly<ChatGptAdeRecoveryRepository>;
}): Promise<Readonly<ChatGptAdeRecoveryProjection> | null> {
  if (!validAuthorityPart(input.accountId) || !validAuthorityPart(input.projectId)) return null;
  const runs = await (input.repository ?? jarvisRunRepo).listByAccount(input.accountId, {
    limit: 100,
  });
  const latest = runs
    .filter((run) => run.source === 'chatgpt_ade' && run.projectId === input.projectId)
    .sort((left, right) => right.updatedAt - left.updatedAt)[0];
  if (!latest) return null;
  if (['queued', 'compiling', 'running', 'awaiting_approval'].includes(latest.status)) {
    return Object.freeze({
      runId: latest.id,
      status: 'interrupted',
      updatedAt: latest.updatedAt,
      retryable: true,
    });
  }
  if (!['completed', 'failed', 'cancelled'].includes(latest.status)) return null;
  return Object.freeze({
    runId: latest.id,
    status: latest.status as 'completed' | 'failed' | 'cancelled',
    updatedAt: latest.updatedAt,
    retryable: latest.status !== 'completed',
  });
}

function requestMatchesSeed(
  input: Readonly<ChatGptAdeRunRequest>,
  seed: Readonly<JarvisRun>,
): boolean {
  return (
    input.runId === seed.id &&
    input.scope.accountId === seed.accountId &&
    input.scope.workspaceId === seed.workspaceId &&
    input.scope.projectId === seed.projectId &&
    seed.source === 'chatgpt_ade' &&
    seed.model.connectionId === input.executionIdentity.transportConnectionId &&
    seed.model.providerId === input.executionIdentity.upstreamProviderId &&
    seed.model.modelId === input.executionIdentity.upstreamModelId
  );
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
    ...(dependencies.flushEvents ? { flushEvents: dependencies.flushEvents } : {}),
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

/**
 * Binds one exact ADE run to the existing Jarvis run/event journal. The queued
 * run is durable before context/provider work starts, and the running history
 * transition is settled before provider dispatch.
 */
export function createDurableProductionChatGptAdeRun(
  dependencies: Readonly<DurableProductionChatGptAdeRunDependencies>,
): Readonly<DurableProductionChatGptAdeRun> {
  const history = new ChatGptAdeJarvisHistory(
    dependencies.runRepository ?? jarvisRunRepo,
    dependencies.seed,
  );
  const adapter = createProductionChatGptAdeAdapter({
    dispatcher: dependencies.dispatcher,
    recordEvent: history.recordEvent,
    flushEvents: () => history.flush(),
    ...(dependencies.now ? { now: dependencies.now } : {}),
    ...(dependencies.gateway ? { gateway: dependencies.gateway } : {}),
  });

  return Object.freeze({
    async run(input: Readonly<ChatGptAdeRunRequest>) {
      if (!requestMatchesSeed(input, dependencies.seed)) {
        throw new TypeError('ade_run_seed_mismatch');
      }
      await history.flush();
      const result = await adapter.run(input);
      await history.flush();
      return result;
    },
    cancel: () => adapter.cancel(dependencies.seed.id),
    getRun: () => adapter.getRun(dependencies.seed.id),
    subscribe: (listener: ChatGptAdeRunListener) =>
      adapter.subscribe(dependencies.seed.id, listener),
    flushHistory: () => history.flush(),
  });
}
