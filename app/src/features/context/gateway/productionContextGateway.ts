import { DEFAULT_CHAT_RUNTIME_SETTINGS } from '@/features/chat/runtime/chatRuntimeCommandController';
import {
  prepareProductionRlmContext,
  type ProductionRlmContextInput,
  type ProductionRlmContextResult,
} from '@/features/context/rlm/contextRlmProduction';
import { ContextGateway } from './ContextGateway';
import type {
  ContextGatewayBackend,
  ContextGatewayBackendRequest,
  ContextSourceRevision,
} from './contextGatewayContracts';

export interface ProductionContextGatewayDependencies {
  available(): boolean;
  query(input: Readonly<ProductionRlmContextInput>): Promise<Readonly<ProductionRlmContextResult>>;
  now(): number;
  createId(): string;
}

const DEFAULT_DEPENDENCIES: Readonly<ProductionContextGatewayDependencies> = Object.freeze({
  available: () => true,
  query: prepareProductionRlmContext,
  now: Date.now,
  createId() {
    const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    return `context-receipt-${suffix}`.replace(/[^A-Za-z0-9._:@/-]/gu, '-').slice(0, 190);
  },
});

function sourceRevisions(result: Readonly<ProductionRlmContextResult>): readonly Readonly<ContextSourceRevision>[] {
  const revisions = new Map<string, string>();
  for (const evidence of result.evidence) revisions.set(evidence.sourceId, evidence.sourceRevision);
  return Object.freeze([...revisions].map(([sourceId, revision]) => Object.freeze({ sourceId, revision })));
}

function productionBackend(
  dependencies: Readonly<ProductionContextGatewayDependencies>,
): Readonly<ContextGatewayBackend> {
  return Object.freeze({
    available: dependencies.available,
    async ask(input: Readonly<ContextGatewayBackendRequest>) {
      const startedAt = dependencies.now();
      const result = await dependencies.query({
        accountId: input.scope.accountId,
        workspaceId: input.scope.workspaceId,
        projectId: input.scope.projectId,
        worktreeId: input.scope.worktreeId,
        question: input.question,
        settings: {
          ...DEFAULT_CHAT_RUNTIME_SETTINGS,
          performance: input.performance,
          // A required Gateway route is authoritative. `/rlm off` only disables
          // optional enrichment before the policy selects a required route.
          rlmEnabled: true,
        },
        requestedRoute: input.route,
        activePaths: input.activePaths,
        explicitEntityIds: input.exactIdentifiers,
        signal: input.signal,
      });
      input.signal.throwIfAborted();
      return Object.freeze({
        promptBlock: result.promptBlock,
        sourceRevisions: sourceRevisions(result),
        evidence: Object.freeze(result.evidence.map((item) => Object.freeze({ ...item }))),
        stageTimingsMs: Object.freeze({
          retrieval: Math.max(0, dependencies.now() - startedAt),
          childCalls: result.childCalls,
          maxDepth: result.maxDepth,
        }),
      });
    },
  });
}

export function createProductionContextGateway(
  dependencies: Readonly<ProductionContextGatewayDependencies> = DEFAULT_DEPENDENCIES,
): ContextGateway {
  return new ContextGateway(productionBackend(dependencies), {
    now: dependencies.now,
    createId: dependencies.createId,
  });
}

/** One process-local Gateway instance shared by VibeSpace context consumers. */
export const productionContextGateway = createProductionContextGateway();
