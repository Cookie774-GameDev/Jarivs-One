import { DEFAULT_CHAT_RUNTIME_SETTINGS } from '@/features/chat/runtime/chatRuntimeCommandController';
import { type ProductionRlmContextInput } from '@/features/context/rlm/contextRlmProduction';
import { ContextGateway } from './ContextGateway';
import type {
  ContextGatewayBackend,
  ContextGatewayBackendRequest,
  ContextSourceRevision,
} from './contextGatewayContracts';
import {
  CONTEXT_GATEWAY_RETRIEVAL_STAGE_NAMES,
  prepareSiyuanContextGatewayQuery,
  type ProductionContextGatewayQueryResult,
} from './siyuanContextGatewayQuery';

export interface ProductionContextGatewayDependencies {
  available(): boolean;
  query(
    input: Readonly<ProductionRlmContextInput>,
  ): Promise<Readonly<ProductionContextGatewayQueryResult>>;
  now(): number;
  createId(): string;
}

const DEFAULT_DEPENDENCIES: Readonly<ProductionContextGatewayDependencies> = Object.freeze({
  available: () => true,
  query: prepareSiyuanContextGatewayQuery,
  now: Date.now,
  createId() {
    const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    return `context-receipt-${suffix}`.replace(/[^A-Za-z0-9._:@/-]/gu, '-').slice(0, 190);
  },
});

function sourceRevisions(
  result: Readonly<ProductionContextGatewayQueryResult>,
): readonly Readonly<ContextSourceRevision>[] {
  const revisions = new Map<string, string>();
  for (const evidence of result.evidence) revisions.set(evidence.sourceId, evidence.sourceRevision);
  return Object.freeze(
    [...revisions].map(([sourceId, revision]) => Object.freeze({ sourceId, revision })),
  );
}

function safeStageValue(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('Context backend returned an invalid stage timing.');
  }
  return value;
}

function safeStageTimings(
  result: Readonly<ProductionContextGatewayQueryResult>,
  retrieval: number,
): Readonly<Record<string, number>> {
  const raw = result.retrievalStageTimingsMs as unknown;
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    (Object.getPrototypeOf(raw) !== Object.prototype && Object.getPrototypeOf(raw) !== null)
  ) {
    throw new Error('Context backend returned invalid retrieval stage timings.');
  }
  const values = raw as Record<string, unknown>;
  if (
    Object.keys(values).length !== CONTEXT_GATEWAY_RETRIEVAL_STAGE_NAMES.length ||
    Object.keys(values).some(
      (name) =>
        !CONTEXT_GATEWAY_RETRIEVAL_STAGE_NAMES.includes(
          name as (typeof CONTEXT_GATEWAY_RETRIEVAL_STAGE_NAMES)[number],
        ),
    )
  ) {
    throw new Error('Context backend returned invalid retrieval stage timings.');
  }
  const retrievalStages = Object.fromEntries(
    CONTEXT_GATEWAY_RETRIEVAL_STAGE_NAMES.map((name) => [name, safeStageValue(values[name])]),
  );
  return Object.freeze({
    retrieval: safeStageValue(retrieval),
    candidateCount: safeStageValue(result.candidateCount),
    hydratedCount: safeStageValue(result.hydratedCount),
    childCalls: safeStageValue(result.childCalls),
    maxDepth: safeStageValue(result.maxDepth),
    ...retrievalStages,
  });
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
      const stageTimingsMs = safeStageTimings(result, dependencies.now() - startedAt);
      return Object.freeze({
        promptBlock: result.promptBlock,
        sourceRevisions: sourceRevisions(result),
        evidence: Object.freeze(result.evidence.map((item) => Object.freeze({ ...item }))),
        stageTimingsMs,
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
