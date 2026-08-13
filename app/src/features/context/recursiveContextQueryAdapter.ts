import type { ContextQueryService, ContextScope } from './contextQueryService';
import type {
  RecursiveContextEvidence,
  RecursiveContextRoundRequest,
  RecursiveContextRoundResult,
} from './recursiveContextPlanner';

function estimatedTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function createRecursiveContextQueryAdapter(dependencies: {
  queryService: Pick<ContextQueryService, 'search' | 'open'>;
  scope: ContextScope;
}) {
  return Object.freeze({
    async retrieveRound(
      request: RecursiveContextRoundRequest,
    ): Promise<RecursiveContextRoundResult> {
      const excluded = new Set(request.excludedEvidenceIds);
      const evidence: RecursiveContextEvidence[] = [];
      let remainingTokens = request.maxTokens;

      for (const query of request.queries) {
        if (evidence.length >= request.maxItems || remainingTokens <= 0) break;
        const found = await dependencies.queryService.search({
          scope: dependencies.scope,
          query,
          limit: request.maxItems - evidence.length,
          signal: request.signal,
        });
        for (const item of found.items) {
          if (
            evidence.length >= request.maxItems ||
            remainingTokens <= 0 ||
            excluded.has(item.pointer.id)
          ) {
            continue;
          }
          const opened = await dependencies.queryService.open({
            scope: dependencies.scope,
            pointer: item.pointer,
            maxBytes: Math.max(1, remainingTokens * 4),
            signal: request.signal,
          });
          if (!opened.text) continue;
          const tokens = estimatedTokens(opened.text);
          if (tokens > remainingTokens) continue;
          remainingTokens -= tokens;
          excluded.add(opened.pointer.id);
          evidence.push(
            Object.freeze({
              id: opened.pointer.id,
              exactExcerpt: opened.text,
              estimatedTokens: tokens,
              provenance: Object.freeze({
                sourceId: opened.record.sourceId,
                sourceRevision: opened.pointer.sourceVersion,
                contentDigest: `sha256:${opened.pointer.contentHash}` as const,
                indexedAt: opened.record.updatedAt ?? opened.record.createdAt,
                locator: opened.record.contentRef,
              }),
            }),
          );
        }
      }

      return Object.freeze({
        evidence: Object.freeze(evidence),
        nextQueries: Object.freeze([]),
        complete: evidence.length > 0,
      });
    },
  });
}
